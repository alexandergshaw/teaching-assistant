// Pragmatic HTML <-> Markdown conversion for syncing assignment instructions
// between Canvas (HTML) and a repo file (Markdown). Covers the elements that show
// up in instructions — headings, paragraphs, lists, links, emphasis, code — not
// the full CommonMark/HTML spec. Server-only (uses node-html-parser).

import { parse, HTMLElement, NodeType, type Node } from "node-html-parser";

// Escapes the characters that are unsafe wherever this lands: element text
// AND (for renderInlineMd's link rule, below) an HTML attribute value. The
// double quote used to be missing here, which let a Markdown link target
// like `[click](" onfocus="alert(1)  x)` break out of the `href="..."`
// attribute it gets interpolated into and inject arbitrary attributes -
// this is the ONLY place in the file that writes an interpolated value into
// an attribute, so this one omission was the whole hole. Used only on the
// Markdown -> HTML side (renderInlineMd and the ```code``` block below); the
// HTML -> Markdown direction (renderInline/renderBlock/listToMarkdown) never
// calls it, so widening it to escape quotes cannot change anything there.
const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── HTML -> Markdown ───────────────────────────────────────────────────────────

function renderInline(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) return node.rawText.replace(/\s+/g, " ");
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.rawTagName?.toLowerCase();
  const inner = node.childNodes.map(renderInline).join("");
  switch (tag) {
    case "strong":
    case "b":
      return inner.trim() ? `**${inner.trim()}**` : "";
    case "em":
    case "i":
      return inner.trim() ? `*${inner.trim()}*` : "";
    case "code":
      return `\`${inner.trim()}\``;
    case "a": {
      const href = node.getAttribute("href") ?? "";
      return href ? `[${inner.trim()}](${href})` : inner;
    }
    case "br":
      return "  \n";
    default:
      return inner;
  }
}

function listToMarkdown(el: HTMLElement, ordered: boolean): string {
  const items = el.childNodes.filter(
    (n): n is HTMLElement => n instanceof HTMLElement && n.rawTagName?.toLowerCase() === "li"
  );
  return items
    .map((li, i) => `${ordered ? `${i + 1}.` : "-"} ${li.childNodes.map(renderInline).join("").trim()}`)
    .join("\n");
}

function renderBlock(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) {
    const t = node.rawText.replace(/\s+/g, " ").trim();
    return t ? `${t}\n\n` : "";
  }
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.rawTagName?.toLowerCase();
  switch (tag) {
    case "h1":
      return `# ${node.text.trim()}\n\n`;
    case "h2":
      return `## ${node.text.trim()}\n\n`;
    case "h3":
      return `### ${node.text.trim()}\n\n`;
    case "h4":
    case "h5":
    case "h6":
      return `#### ${node.text.trim()}\n\n`;
    case "ul":
      return `${listToMarkdown(node, false)}\n\n`;
    case "ol":
      return `${listToMarkdown(node, true)}\n\n`;
    case "pre":
      return `\`\`\`\n${node.text.replace(/\n+$/, "")}\n\`\`\`\n\n`;
    case "p":
    case "div": {
      const inner = node.childNodes.map(renderInline).join("").trim();
      return inner ? `${inner}\n\n` : "";
    }
    case "br":
      return "\n";
    default: {
      // Unknown/container element: recurse into its children as blocks.
      const inner = node.childNodes.map(renderBlock).join("");
      return inner;
    }
  }
}

/** Convert instruction HTML to Markdown. */
export function htmlToMarkdown(html: string): string {
  const root = parse(html ?? "");
  return root.childNodes
    .map(renderBlock)
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Markdown -> HTML ───────────────────────────────────────────────────────────

// The only link targets a Markdown-authored [text](href) is allowed to
// become a clickable <a href> for. renderInlineMd interpolates the captured
// href straight into an attribute (see below), so an unconstrained href
// lets whoever can edit the Markdown body (e.g. a synced assignment
// description) turn a link into a `javascript:` URI that runs on click -
// escapeHtml's quote fix stops the attribute-breakout variant of this attack
// but does nothing about a scheme that is simply dangerous by itself, which
// is what this allowlist is for. `https:`/`http:`, `mailto:`, `#` (in-page
// anchors) and `/` (site-relative paths) are the targets real instruction
// content actually needs. `//` is deliberately excluded from the `/` case:
// a protocol-relative URL like `//evil.example/x` also starts with a single
// `/` character-wise, but a browser resolves it against WHATEVER scheme the
// current page is loaded over, i.e. it silently leaves the site - not what
// "site-relative path" is meant to allow. `attachment:` is included even
// though the intended attachment-embed syntax is normally extracted before
// this function ever runs (see splitBodyIntoSegments in
// src/app/components/knowledge/attachment-embed.ts) - a reference typed
// inline within a sentence, rather than alone on its own line, is
// documented there to intentionally fall through and round-trip as an
// ordinary link instead of an embed, and `attachment:` is an inert custom
// scheme (nothing a browser will execute), so allowing it here preserves
// that documented behavior rather than silently turning those inline
// references into plain text.
const ALLOWED_LINK_HREF = /^(https?:|mailto:|attachment:|#|\/(?!\/))/i;

function renderInlineMd(text: string): string {
  let s = escapeHtml(text);
  // Inline code first so its contents aren't re-processed.
  s = s.replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t: string, href: string) =>
    // Anything outside the allowlist is not merely left unlinked but
    // rendered as its own plain visible text - content is never dropped,
    // only the dangerous href.
    ALLOWED_LINK_HREF.test(href) ? `<a href="${href}">${t}</a>` : t
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return s;
}

/** Convert Markdown to the HTML Canvas stores in a description field. */
export function markdownToHtml(md: string): string {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.map(renderInlineMd).join("<br>")}</p>`);
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      flushPara();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i += 1; // closing fence
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      const level = Math.min(heading[1].length, 6);
      out.push(`<h${level}>${renderInlineMd(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(renderInlineMd(lines[i].replace(/^\s*[-*]\s+/, "").trim()));
        i += 1;
      }
      out.push(`<ul>${items.map((t) => `<li>${t}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(renderInlineMd(lines[i].replace(/^\s*\d+\.\s+/, "").trim()));
        i += 1;
      }
      out.push(`<ol>${items.map((t) => `<li>${t}</li>`).join("")}</ol>`);
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      i += 1;
      continue;
    }

    para.push(line.trim());
    i += 1;
  }
  flushPara();
  return out.join("\n");
}
