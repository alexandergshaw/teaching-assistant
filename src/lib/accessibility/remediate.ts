// Client-side remediation transforms. Given an item's HTML and an Issue, apply
// the fix (deterministic transforms, or a value-based one for AI alt/link/colour)
// and return the new HTML. Used by the editors to pre-apply a fix before the user
// reviews and saves. Pure DOM string-in/string-out (browser DOMParser).

import type { Issue } from "./types";

function findNode(root: HTMLElement, issue: Issue): Element | null {
  // Try the recorded selector first.
  try {
    const bySelector = root.querySelector(issue.locator.selector);
    if (bySelector) return bySelector;
  } catch {
    // invalid selector — fall through to snippet matching
  }
  // Fallback: match by the node's recorded outerHTML signature.
  const sig = issue.locator.snippet.replace(/…$/, "");
  if (sig) {
    for (const el of Array.from(root.querySelectorAll("*"))) {
      if (el.outerHTML.startsWith(sig)) return el;
    }
  }
  return null;
}

function renameElement(doc: Document, el: Element, tag: string): void {
  const next = doc.createElement(tag);
  for (const attr of Array.from(el.attributes)) next.setAttribute(attr.name, attr.value);
  while (el.firstChild) next.appendChild(el.firstChild);
  el.replaceWith(next);
}

// Expected heading level = one deeper than the nearest preceding heading.
function fixHeadingLevel(doc: Document, root: HTMLElement, el: Element): boolean {
  const headings = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6"));
  const idx = headings.indexOf(el);
  const prevLevel = idx > 0 ? Number(headings[idx - 1].tagName[1]) : 1;
  const expected = Math.min(idx > 0 ? prevLevel + 1 : 1, 6);
  const tag = `h${expected}`;
  if (el.tagName.toLowerCase() === tag) return false;
  renameElement(doc, el, tag);
  return true;
}

// Add scope to the header cells of the table the node belongs to.
function fixTableScope(el: Element): boolean {
  const table = el.tagName === "TABLE" ? el : el.closest("table");
  if (!table) return false;
  let changed = false;
  const rows = Array.from(table.querySelectorAll("tr"));
  rows.forEach((row, r) => {
    Array.from(row.children).forEach((cell, c) => {
      if (cell.tagName !== "TH") return;
      const scope = r === 0 ? "col" : c === 0 ? "row" : "col";
      if (cell.getAttribute("scope") !== scope) {
        cell.setAttribute("scope", scope);
        changed = true;
      }
    });
  });
  return changed;
}

function deriveFrameTitle(el: Element): string {
  const src = el.getAttribute("src") ?? "";
  if (/youtube|youtu\.be/i.test(src)) return "YouTube video";
  if (/vimeo/i.test(src)) return "Vimeo video";
  return "Embedded content";
}

/** Whether an issue can be auto-applied without a user-supplied value. */
export function isAutoFix(issue: Issue): boolean {
  return ["heading-order", "empty-heading", "styled-as-heading", "justified-text", "frame-title", "scope-attr-valid", "th-has-data-cells", "td-headers-attr", "table-fake-caption"].includes(issue.ruleId);
}

/** Whether an issue's fix needs an AI-generated value (alt / link text). */
export function needsAiValue(issue: Issue): boolean {
  return issue.fixKind === "ai-alt" || issue.fixKind === "ai-link";
}

/**
 * Apply the fix for `issue` to `html`. `value` supplies AI alt/link text or a
 * replacement colour. Returns the new HTML and whether anything changed (false
 * when the node couldn't be located — the editor still opens for a manual fix).
 */
export function applyFix(html: string, issue: Issue, value?: string): { html: string; changed: boolean } {
  if (typeof DOMParser === "undefined") return { html, changed: false };
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const root = doc.body;
  const el = findNode(root, issue);
  if (!el) return { html, changed: false };

  let changed = false;
  switch (issue.ruleId) {
    case "image-alt":
    case "input-image-alt":
    case "alt-quality":
      if (el.tagName === "IMG" || el.tagName === "INPUT") {
        el.setAttribute("alt", value ?? "");
        changed = true;
      }
      break;
    case "link-text":
    case "link-name":
      if (el.tagName === "A" && value) {
        el.textContent = value;
        changed = true;
      }
      break;
    case "heading-order":
      changed = fixHeadingLevel(doc, root, el);
      break;
    case "empty-heading":
      el.remove();
      changed = true;
      break;
    case "styled-as-heading": {
      const h = doc.createElement("h3");
      h.textContent = (el.textContent ?? "").trim();
      el.replaceWith(h);
      changed = true;
      break;
    }
    case "justified-text":
      (el as HTMLElement).style.removeProperty("text-align");
      if (!(el as HTMLElement).getAttribute("style")) el.removeAttribute("style");
      changed = true;
      break;
    case "frame-title":
      if (el.tagName === "IFRAME" && !el.getAttribute("title")) {
        el.setAttribute("title", value || deriveFrameTitle(el));
        changed = true;
      }
      break;
    case "scope-attr-valid":
    case "th-has-data-cells":
    case "td-headers-attr":
    case "table-fake-caption":
      changed = fixTableScope(el);
      break;
    case "contrast":
      if (value) {
        (el as HTMLElement).style.color = value;
        changed = true;
      }
      break;
    default:
      break;
  }
  return { html: changed ? root.innerHTML : html, changed };
}
