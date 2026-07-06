"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import type { RunSpan } from "@/lib/office-edit";
import styles from "../page.module.css";

// Font sizes (points) offered by the toolbar's size menu.
const FONT_SIZES = [10, 11, 12, 14, 16, 18, 24, 28, 36];

/** The plain text of a span list (marks dropped). */
export function spansToPlainText(spans: RunSpan[]): string {
  return spans.map((s) => s.text).join("");
}

/** Whether two span lists carry identical text and formatting. */
export function spansEqual(a: RunSpan[], b: RunSpan[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.text !== y.text ||
      !!x.bold !== !!y.bold ||
      !!x.italic !== !!y.italic ||
      !!x.underline !== !!y.underline ||
      (x.sizePt ?? null) !== (y.sizePt ?? null) ||
      (x.link ?? "") !== (y.link ?? "")
    ) {
      return false;
    }
  }
  return true;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

// Merge neighbouring spans with identical marks (mirrors office-edit's helper,
// duplicated here so this client module never imports the server-only lib).
function mergeSpans(spans: RunSpan[]): RunSpan[] {
  const out: RunSpan[] = [];
  for (const s of spans) {
    const prev = out[out.length - 1];
    if (
      prev &&
      !!prev.bold === !!s.bold &&
      !!prev.italic === !!s.italic &&
      !!prev.underline === !!s.underline &&
      prev.sizePt === s.sizePt &&
      (prev.link ?? "") === (s.link ?? "")
    ) {
      prev.text += s.text;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

/** Render spans as editor HTML (bold/italic/underline tags + a font-size span). */
export function spansToHtml(spans: RunSpan[]): string {
  return spans
    .map((s) => {
      let html = escapeHtml(s.text).replace(/\n/g, "<br>");
      if (s.sizePt != null) html = `<span style="font-size:${s.sizePt}pt">${html}</span>`;
      if (s.underline) html = `<u>${html}</u>`;
      if (s.italic) html = `<em>${html}</em>`;
      if (s.bold) html = `<strong>${html}</strong>`;
      // A preserved hyperlink: shown as a link in the editor and carried through
      // serialization via data-wlink so the rebuild can re-wrap it.
      if (s.link) {
        html = `<a data-wlink="${escapeAttr(s.link)}" style="color:#2563eb;text-decoration:underline">${html}</a>`;
      }
      return html;
    })
    .join("");
}

// Parse an inline font-size ("12pt" / "16px") into points.
function parseSizePt(fontSize: string): number | undefined {
  const m = fontSize.match(/^([\d.]+)(pt|px)$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return m[2] === "pt" ? n : Math.round(n * 0.75);
}

type Marks = Omit<RunSpan, "text">;

// A <br> with nothing after it anywhere up to the root is the filler break
// browsers insert to keep a line focusable — not a real line break the user typed.
function isTrailingBr(br: Node, root: HTMLElement): boolean {
  let node: Node | null = br;
  while (node && node !== root) {
    if (node.nextSibling) return false;
    node = node.parentNode;
  }
  return true;
}

function walk(node: Node, ctx: Marks, out: RunSpan[], root: HTMLElement): void {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? "";
      if (text) out.push({ text, ...ctx });
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName;
    if (tag === "BR") {
      if (!isTrailingBr(el, root)) out.push({ text: "\n", ...ctx });
      return;
    }
    const next: Marks = { ...ctx };
    if (tag === "B" || tag === "STRONG") next.bold = true;
    if (tag === "I" || tag === "EM") next.italic = true;
    if (tag === "U") next.underline = true;
    if (tag === "A" && el.dataset.wlink) next.link = el.dataset.wlink;
    const fw = el.style.fontWeight;
    if (fw === "bold" || fw === "bolder" || (/^\d+$/.test(fw) && Number(fw) >= 600)) next.bold = true;
    if (el.style.fontStyle === "italic" || el.style.fontStyle === "oblique") next.italic = true;
    if (`${el.style.textDecorationLine} ${el.style.textDecoration}`.includes("underline")) next.underline = true;
    const sz = parseSizePt(el.style.fontSize);
    if (sz != null) next.sizePt = sz;
    // A new block element (from pressing Enter) starts a new line.
    if ((tag === "DIV" || tag === "P") && out.length > 0 && !out[out.length - 1].text.endsWith("\n")) {
      out.push({ text: "\n", ...ctx });
    }
    walk(el, next, out, root);
  });
}

/** Serialize a contentEditable host's DOM into formatted spans. */
export function serializeToSpans(root: HTMLElement): RunSpan[] {
  const raw: RunSpan[] = [];
  walk(root, {}, raw, root);
  const cleaned = mergeSpans(raw).map((s) => {
    const r: RunSpan = { text: s.text };
    if (s.bold) r.bold = true;
    if (s.italic) r.italic = true;
    if (s.underline) r.underline = true;
    if (s.sizePt != null) r.sizePt = s.sizePt;
    if (s.link) r.link = s.link;
    return r;
  });
  return cleaned.length ? cleaned : [{ text: "" }];
}

// The [data-rte] editable that holds the current selection, if any.
function activeEditable(): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = sel.getRangeAt(0).commonAncestorContainer;
  const el = node instanceof Element ? node : node.parentElement;
  return (el?.closest("[data-rte]") as HTMLElement | null) ?? null;
}

/**
 * A single toolbar that formats whichever RichTextEditor currently holds the
 * selection. Bold/italic/underline use execCommand (which targets the focused
 * editable); the size menu wraps the saved selection in a sized span. Render one
 * above a group of editors.
 */
export function FormattingToolbar({ style }: { style?: CSSProperties }) {
  // The last non-collapsed selection inside an editor — kept because clicking
  // the size <select> moves focus out of the editable before onChange fires.
  const savedRange = useRef<Range | null>(null);

  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return;
      const node = range.commonAncestorContainer;
      const el = node instanceof Element ? node : node.parentElement;
      if (el?.closest("[data-rte]")) savedRange.current = range.cloneRange();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const exec = (command: string) => {
    document.execCommand(command);
    activeEditable()?.dispatchEvent(new InputEvent("input", { bubbles: true }));
  };

  const applySize = (pt: number | null) => {
    const range = savedRange.current;
    if (!range || range.collapsed) return;
    const node = range.commonAncestorContainer;
    const hostEl = node instanceof Element ? node : node.parentElement;
    const host = hostEl?.closest("[data-rte]") as HTMLElement | null;
    if (!host) return;

    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const frag = range.extractContents();
    // Clear any nested font-size so the new size applies uniformly.
    frag.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
      el.style.fontSize = "";
    });
    const span = document.createElement("span");
    if (pt != null) span.style.fontSize = `${pt}pt`;
    span.appendChild(frag);
    range.insertNode(span);

    const after = document.createRange();
    after.selectNodeContents(span);
    sel?.removeAllRanges();
    sel?.addRange(after);
    savedRange.current = after.cloneRange();
    host.dispatchEvent(new InputEvent("input", { bubbles: true }));
  };

  const btn = (label: string, command: string, title: string, labelStyle?: CSSProperties) => (
    <Button
      variant="outlined"
      size="small"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        exec(command);
      }}
      sx={{ minWidth: "auto", padding: "4px 8px" }}
    >
      <span style={labelStyle}>{label}</span>
    </Button>
  );

  return (
    <div className={styles.rteToolbar} style={style} role="toolbar" aria-label="Text formatting">
      {btn("B", "bold", "Bold (Ctrl+B)", { fontWeight: 700 })}
      {btn("I", "italic", "Italic (Ctrl+I)", { fontStyle: "italic" })}
      {btn("U", "underline", "Underline (Ctrl+U)", { textDecoration: "underline" })}
      <span className={styles.rteToolbarSep} aria-hidden="true" />
      <TextField
        select
        size="small"
        defaultValue=""
        aria-label="Font size"
        title="Font size of the selected text"
        onMouseDown={(e) => {
          // Keep the editor's selection alive while the menu opens.
          e.stopPropagation();
        }}
        onChange={(e) => {
          const v = e.target.value;
          if (v) applySize(v === "default" ? null : Number(v));
          const selectEl = document.querySelector('[aria-label="Font size"]') as HTMLSelectElement;
          if (selectEl) selectEl.selectedIndex = 0;
        }}
        sx={{ minWidth: "100px" }}
      >
        <MenuItem value="" disabled>
          Size
        </MenuItem>
        {FONT_SIZES.map((s) => (
          <MenuItem key={s} value={s}>
            {s} pt
          </MenuItem>
        ))}
        <MenuItem value="default">Default</MenuItem>
      </TextField>
    </div>
  );
}

/**
 * A contentEditable rich-text field seeded from `value` (formatted spans) that
 * reports edits as spans. Pair it with a {@link FormattingToolbar} rendered once
 * above a group of these. Uncontrolled DOM: it only re-seeds when `value` changes
 * to something other than what it last emitted, so typing never loses the cursor.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  changed,
  style,
}: {
  value: RunSpan[];
  onChange: (spans: RunSpan[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  changed?: boolean;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<RunSpan[]>(value);
  const seeded = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!seeded.current) {
      el.innerHTML = spansToHtml(value);
      lastEmitted.current = value;
      seeded.current = true;
      return;
    }
    // An external change (e.g. AI regenerate) — reseed. Our own echoes match
    // lastEmitted and are skipped so the live DOM and caret are left alone.
    if (spansEqual(value, lastEmitted.current)) return;
    el.innerHTML = spansToHtml(value);
    lastEmitted.current = value;
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const spans = serializeToSpans(el);
    lastEmitted.current = spans;
    onChange(spans);
  };

  return (
    <div
      ref={ref}
      data-rte="1"
      data-placeholder={placeholder}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      contentEditable
      suppressContentEditableWarning
      className={`${styles.rteField}${changed ? ` ${styles.rteFieldChanged}` : ""}`}
      style={style}
      onInput={emit}
      onBlur={emit}
    />
  );
}
