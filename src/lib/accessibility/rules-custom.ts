// Static accessibility rules over a parsed HTML tree (node-html-parser). This is
// the whole rule set — no browser/jsdom needed — covering the axe-style checks
// (missing alt, heading order, empty headings, link names, iframe titles, table
// header scope) plus the UDOIT-style ones axe can't do on fragments (inline-style
// contrast, link-text/alt-text quality, styled-as-heading, justified text).

import type { HTMLElement } from "node-html-parser";
import type { Issue, IssueLocator, Severity } from "./types";

const tag = (el: HTMLElement) => (el.tagName ?? "").toUpperCase();

// A CSS selector path (nth-of-type) from `root` down to `el`, so a fix can re-find
// the node in the browser later.
export function cssPath(el: HTMLElement, root: HTMLElement): string {
  const parts: string[] = [];
  let node: HTMLElement | null = el;
  while (node && node !== root && node.tagName) {
    const name = node.tagName.toLowerCase();
    const parent = node.parentNode as HTMLElement | null;
    if (!parent || !parent.tagName) {
      parts.unshift(name);
      break;
    }
    const sameTag = parent.childNodes.filter((c) => (c as HTMLElement).tagName === node!.tagName) as HTMLElement[];
    const idx = sameTag.indexOf(node) + 1;
    parts.unshift(sameTag.length > 1 ? `${name}:nth-of-type(${idx})` : name);
    node = parent;
  }
  return parts.join(" > ");
}

function locator(el: HTMLElement, root: HTMLElement): IssueLocator {
  const outer = el.toString();
  return { selector: cssPath(el, root), snippet: outer.length > 200 ? `${outer.slice(0, 200)}…` : outer };
}

function attr(el: HTMLElement, name: string): string | undefined {
  return el.getAttribute(name);
}

function styleMap(el: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of (attr(el, "style") ?? "").split(";")) {
    const i = decl.indexOf(":");
    if (i > 0) out[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim();
  }
  return out;
}

// ── Colour (WCAG luminance + contrast) ───────────────────────────────────────

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0],
  blue: [0, 0, 255], gray: [128, 128, 128], grey: [128, 128, 128], yellow: [255, 255, 0],
};
function parseColor(value: string): [number, number, number] | null {
  const v = value.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}
function relLum([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relLum(a);
  const lb = relLum(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
function effectiveBackground(el: HTMLElement): [number, number, number] {
  let node: HTMLElement | null = el;
  while (node && node.tagName) {
    const bg = styleMap(node)["background-color"];
    if (bg) {
      const parsed = parseColor(bg);
      if (parsed) return parsed;
    }
    node = node.parentNode as HTMLElement | null;
  }
  return [255, 255, 255];
}

// ── Rule helpers ─────────────────────────────────────────────────────────────

function issue(el: HTMLElement, root: HTMLElement, ruleId: string, severity: Severity, message: string, wcag: string, help: string, fixKind: Issue["fixKind"]): Issue {
  return { ruleId, severity, message, wcag, help, locator: locator(el, root), fixKind };
}

const HEADINGS = "h1, h2, h3, h4, h5, h6";
const VAGUE_LINKS = new Set(["click here", "here", "read more", "more", "link", "this", "click", "this link", "learn more"]);

/** Run every accessibility rule over a parsed HTML root. */
export function runRules(root: HTMLElement): Issue[] {
  const out: Issue[] = [];

  // images missing alt (alt="" is decorative and allowed)
  for (const img of root.querySelectorAll("img")) {
    if (attr(img, "alt") === undefined && attr(img, "aria-label") === undefined && attr(img, "role") !== "presentation") {
      out.push(issue(img, root, "image-alt", "error", "Image has no alt text.", "1.1.1", "Add alt text describing the image, or alt=\"\" if decorative.", "ai-alt"));
    }
  }
  for (const input of root.querySelectorAll("input")) {
    if ((attr(input, "type") ?? "").toLowerCase() === "image" && !attr(input, "alt")) {
      out.push(issue(input, root, "input-image-alt", "error", "Image button has no alt text.", "1.1.1", "Add alt text describing the button's action.", "ai-alt"));
    }
  }

  // alt quality (alt present but weak)
  for (const img of root.querySelectorAll("img")) {
    const alt = (attr(img, "alt") ?? "").trim();
    if (!alt) continue;
    const lower = alt.toLowerCase();
    let reason = "";
    if (/\.(jpe?g|png|gif|svg|webp|bmp)$/i.test(alt)) reason = "Alt text is a file name.";
    else if (/^(image|picture|photo|graphic|icon)( of|:)?\b/.test(lower)) reason = 'Alt text starts with "image of…".';
    else if (alt.length > 125) reason = "Alt text is very long (over 125 characters).";
    if (reason) out.push(issue(img, root, "alt-quality", "warning", reason, "1.1.1", "Describe the image's content/purpose concisely.", "ai-alt"));
  }

  // heading order + empty headings
  let prevLevel = 0;
  for (const h of root.querySelectorAll(HEADINGS)) {
    const level = Number(tag(h)[1]);
    if (!h.text.trim()) {
      out.push(issue(h, root, "empty-heading", "warning", "Heading is empty.", "1.3.1", "Remove the empty heading or add text.", "auto"));
    }
    if (prevLevel > 0 && level > prevLevel + 1) {
      out.push(issue(h, root, "heading-order", "warning", `Heading level jumps from h${prevLevel} to h${level}.`, "1.3.1", "Don't skip heading levels.", "auto"));
    }
    prevLevel = level;
  }

  // link name + link text quality
  for (const a of root.querySelectorAll("a")) {
    const href = attr(a, "href");
    if (href === undefined) continue;
    const text = a.text.trim();
    if (!text && !attr(a, "aria-label") && !attr(a, "title")) {
      out.push(issue(a, root, "link-name", "error", "Link has no text.", "2.4.4", "Give the link descriptive text.", "ai-link"));
      continue;
    }
    const lower = text.toLowerCase().replace(/[.!?\s]+$/, "");
    const isBareUrl = /^https?:\/\//i.test(text) || text === href;
    if (text && (VAGUE_LINKS.has(lower) || isBareUrl)) {
      out.push(issue(a, root, "link-text", "warning", isBareUrl ? "Link text is a bare URL." : `Link text "${text}" doesn't describe its destination.`, "2.4.4", "Use link text that describes where the link goes.", "ai-link"));
    }
  }

  // iframe title
  for (const f of root.querySelectorAll("iframe")) {
    if (!(attr(f, "title") ?? "").trim()) {
      out.push(issue(f, root, "frame-title", "warning", "Embedded frame has no title.", "4.1.2", "Add a title describing the embedded content.", "auto"));
    }
  }

  // table header cells without scope
  for (const th of root.querySelectorAll("th")) {
    if (!(attr(th, "scope") ?? "").trim()) {
      out.push(issue(th, root, "scope-attr-valid", "warning", "Table header cell has no scope.", "1.3.1", "Add scope=\"col\" or scope=\"row\" to header cells.", "auto"));
    }
  }

  // styled-as-heading (a short, fully-bold paragraph)
  for (const p of root.querySelectorAll("p")) {
    const text = p.text.trim();
    if (!text || text.length > 100 || p.closest("li, h1, h2, h3, h4, h5, h6")) continue;
    const onlyChild = p.childNodes.filter((c) => (c as HTMLElement).tagName).length === 1
      ? (p.childNodes.find((c) => (c as HTMLElement).tagName) as HTMLElement)
      : null;
    const wrappedBold = onlyChild && /^(STRONG|B)$/.test(tag(onlyChild)) && onlyChild.text.trim() === text;
    const weight = styleMap(p)["font-weight"];
    const inlineBold = weight === "bold" || weight === "bolder" || (/^\d+$/.test(weight ?? "") && Number(weight) >= 600);
    if (wrappedBold || inlineBold) {
      out.push(issue(p, root, "styled-as-heading", "suggestion", "Bold text is used like a heading.", "1.3.1", "Use a real heading (h2–h4) so screen readers expose the structure.", "auto"));
    }
  }

  // inline-style contrast
  for (const el of root.querySelectorAll("*")) {
    const style = styleMap(el);
    if (!style.color) continue;
    const fg = parseColor(style.color);
    if (!fg || !el.text.trim()) continue;
    const ratio = contrastRatio(fg, effectiveBackground(el));
    const sizePx = parseFloat(style["font-size"] ?? "") || 16;
    const isBold = style["font-weight"] === "bold" || Number(style["font-weight"]) >= 700;
    const min = sizePx >= 24 || (sizePx >= 18.66 && isBold) ? 3 : 4.5;
    if (ratio < min) {
      out.push(issue(el, root, "contrast", "warning", `Text contrast is ${ratio.toFixed(2)}:1 (needs ${min}:1).`, "1.4.3", "Darken the text or lighten the background to meet WCAG AA.", "edit"));
    }
  }

  // justified text
  for (const el of root.querySelectorAll("*")) {
    if ((styleMap(el)["text-align"] ?? "") === "justify") {
      out.push(issue(el, root, "justified-text", "suggestion", "Justified text can be hard to read.", "1.4.8", "Use left alignment instead of justified.", "auto"));
    }
  }

  return out;
}
