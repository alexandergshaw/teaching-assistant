// Static accessibility rules that axe-core can't run reliably on Canvas HTML
// fragments (no layout/CSS): inline-style contrast, link-text quality, alt-text
// quality, styled-as-heading, and justified text. Mirrors what UDOIT checks
// statically. Operates on a DOM root (jsdom on the server) and returns Issues.

import type { Issue, IssueLocator } from "./types";

// A CSS selector path (nth-of-type) from `root` down to `el`, used to re-find
// the node when applying a fix.
export function cssPath(el: Element, root: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== root && node.nodeType === 1) {
    const tag = node.tagName.toLowerCase();
    const parent: Element | null = node.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const sameTag = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
    const idx = sameTag.indexOf(node) + 1;
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
    node = parent;
  }
  return parts.join(" > ");
}

function locator(el: Element, root: Element): IssueLocator {
  const snippet = el.outerHTML.length > 200 ? `${el.outerHTML.slice(0, 200)}…` : el.outerHTML;
  return { selector: cssPath(el, root), snippet };
}

// ── Colour helpers (WCAG relative luminance + contrast ratio) ────────────────

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0],
  blue: [0, 0, 255], gray: [128, 128, 128], grey: [128, 128, 128], yellow: [255, 255, 0],
};

function parseColor(value: string): [number, number, number] | null {
  const v = value.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }
  const rgb = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// The nearest ancestor inline background-color, defaulting to white.
function effectiveBackground(el: Element): [number, number, number] {
  let node: Element | null = el;
  while (node) {
    const bg = (node as HTMLElement).style?.backgroundColor;
    if (bg) {
      const parsed = parseColor(bg);
      if (parsed) return parsed;
    }
    node = node.parentElement;
  }
  return [255, 255, 255];
}

// ── Rules ────────────────────────────────────────────────────────────────────

const VAGUE_LINKS = new Set(["click here", "here", "read more", "more", "link", "this", "click", "this link", "learn more"]);

function linkTextRule(root: Element, out: Issue[]): void {
  for (const a of Array.from(root.querySelectorAll("a[href]"))) {
    const text = (a.textContent ?? "").trim();
    if (!text) continue; // empty link name is axe's link-name rule
    const lower = text.toLowerCase().replace(/[.!?\s]+$/, "");
    const href = a.getAttribute("href") ?? "";
    const isBareUrl = /^https?:\/\//i.test(text) || text === href;
    if (VAGUE_LINKS.has(lower) || isBareUrl) {
      out.push({
        ruleId: "link-text",
        severity: "warning",
        wcag: "2.4.4",
        message: isBareUrl ? "Link text is a bare URL." : `Link text "${text}" doesn't describe its destination.`,
        help: "Use link text that describes where the link goes.",
        locator: locator(a, root),
        fixKind: "ai-link",
      });
    }
  }
}

function altQualityRule(root: Element, out: Issue[]): void {
  for (const img of Array.from(root.querySelectorAll("img[alt]"))) {
    const alt = (img.getAttribute("alt") ?? "").trim();
    if (!alt) continue; // empty alt = decorative or axe image-alt
    const lower = alt.toLowerCase();
    let reason = "";
    if (/\.(jpe?g|png|gif|svg|webp|bmp)$/i.test(alt)) reason = "Alt text is a file name.";
    else if (/^(image|picture|photo|graphic|icon)( of|:)?\b/.test(lower)) reason = 'Alt text starts with "image of…".';
    else if (alt.length > 125) reason = "Alt text is very long (over 125 characters).";
    if (reason) {
      out.push({
        ruleId: "alt-quality",
        severity: "warning",
        wcag: "1.1.1",
        message: reason,
        help: "Describe the image's content/purpose concisely.",
        locator: locator(img, root),
        fixKind: "ai-alt",
      });
    }
  }
}

function styledAsHeadingRule(root: Element, out: Issue[]): void {
  for (const p of Array.from(root.querySelectorAll("p"))) {
    const text = (p.textContent ?? "").trim();
    if (!text || text.length > 100) continue;
    if (p.closest("li, h1, h2, h3, h4, h5, h6")) continue;
    // Whole paragraph is bold (a <strong>/<b> wrapper or inline bold weight).
    const onlyChild = p.children.length === 1 ? p.children[0] : null;
    const wrappedBold = onlyChild && /^(STRONG|B)$/.test(onlyChild.tagName) && (onlyChild.textContent ?? "").trim() === text;
    const weight = (p as HTMLElement).style?.fontWeight;
    const inlineBold = weight === "bold" || weight === "bolder" || (/^\d+$/.test(weight ?? "") && Number(weight) >= 600);
    if (wrappedBold || inlineBold) {
      out.push({
        ruleId: "styled-as-heading",
        severity: "suggestion",
        wcag: "1.3.1",
        message: "Bold text is used like a heading.",
        help: "Use a real heading (h2–h4) so screen readers expose the structure.",
        locator: locator(p, root),
        fixKind: "auto",
      });
    }
  }
}

function contrastRule(root: Element, out: Issue[]): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[style*='color']"))) {
    const color = el.style?.color;
    if (!color) continue;
    const fg = parseColor(color);
    if (!fg) continue;
    const text = (el.textContent ?? "").trim();
    if (!text) continue;
    const bg = effectiveBackground(el);
    const ratio = contrastRatio(fg, bg);
    const sizePx = parseFloat(el.style?.fontSize ?? "") || 16;
    const isBold = el.style?.fontWeight === "bold" || Number(el.style?.fontWeight) >= 700;
    const large = sizePx >= 24 || (sizePx >= 18.66 && isBold);
    const min = large ? 3 : 4.5;
    if (ratio < min) {
      out.push({
        ruleId: "contrast",
        severity: "warning",
        wcag: "1.4.3",
        message: `Text contrast is ${ratio.toFixed(2)}:1 (needs ${min}:1).`,
        help: "Darken the text or lighten the background to meet WCAG AA.",
        locator: locator(el, root),
        fixKind: "edit",
      });
    }
  }
}

function justifiedRule(root: Element, out: Issue[]): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[style*='justify']"))) {
    if ((el.style?.textAlign ?? "") === "justify") {
      out.push({
        ruleId: "justified-text",
        severity: "suggestion",
        wcag: "1.4.8",
        message: "Justified text can be hard to read.",
        help: "Use left alignment instead of justified.",
        locator: locator(el, root),
        fixKind: "auto",
      });
    }
  }
}

/** Run all custom static rules over a content root (e.g. the document body). */
export function runCustomRules(root: Element): Issue[] {
  const out: Issue[] = [];
  linkTextRule(root, out);
  altQualityRule(root, out);
  styledAsHeadingRule(root, out);
  contrastRule(root, out);
  justifiedRule(root, out);
  return out;
}
