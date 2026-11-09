import { parse, HTMLElement, NodeType, type Node } from "node-html-parser";
import { markdownToHtml } from "@/lib/markdown";

const tags = new Set(["p", "div", "br", "strong", "b", "em", "i", "u", "h1", "h2", "h3", "h4", "ul", "ol", "li", "a"]);
const discarded = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template"]);
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function render(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) return escape(node.text);
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.rawTagName?.toLowerCase() ?? "";
  if (discarded.has(tag)) return "";
  const inner = node.childNodes.map(render).join("");
  if (!tags.has(tag)) return inner;
  if (tag === "br") return "<br>";
  if (tag === "a") {
    const href = (node.getAttribute("href") ?? "").trim();
    const safe = /^(https?:\/\/|mailto:|#|\/(?![\\/]))/i.test(href) && !/[\x00-\x20\x7f]/.test(href);
    return safe ? `<a href="${escape(href)}">${inner}</a>` : inner;
  }
  return `<${tag}>${inner}</${tag}>`;
}

/** Canonical allowlisted content for both the editor and Canvas. */
export function sanitizeRecordingAnnouncementHtml(value: string): string {
  return parse(value ?? "").childNodes.map(render).join("");
}

/** Model drafts arrive as Markdown; the editor and saved value use HTML. */
export function recordingDraftToHtml(markdown: string): string {
  return sanitizeRecordingAnnouncementHtml(markdownToHtml(markdown));
}
