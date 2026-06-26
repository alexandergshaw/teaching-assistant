// Pragmatic HTML <-> Markdown conversion for syncing assignment instructions
// between Canvas (HTML) and a repo file (Markdown). Covers the elements that show
// up in instructions — headings, paragraphs, lists, links, emphasis, code — not
// the full CommonMark/HTML spec. Server-only (uses node-html-parser).

import { parse, HTMLElement, NodeType, type Node } from "node-html-parser";

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

function renderInlineMd(text: string): string {
  let s = escapeHtml(text);
  // Inline code first so its contents aren't re-processed.
  s = s.replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t: string, href: string) => `<a href="${href}">${t}</a>`);
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
