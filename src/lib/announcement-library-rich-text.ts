import { parse, HTMLElement, NodeType, type Node } from "node-html-parser";
import { htmlToMarkdown } from "@/lib/markdown";

const PREFIX = "<!--announcement-rich-v1-->";
const allowed = new Set(["p", "div", "br", "span", "strong", "b", "em", "i", "u", "s", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "a", "blockquote", "font"]);
const discard = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template", "form", "input", "img"]);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function safeStyle(value: string): string {
  const out: string[] = [];
  for (const declaration of value.split(";")) {
    const i = declaration.indexOf(":"); if (i < 0) continue;
    const name = declaration.slice(0, i).trim().toLowerCase(), v = declaration.slice(i + 1).trim();
    if ((name === "color" || name === "background-color") && /^(?:#[0-9a-f]{3,8}|[a-z]{1,20}|rgba?\(\s*[0-9.,%\s]+\))$/i.test(v)) out.push(`${name}:${v}`);
    else if (name === "font-size" && /^(?:\d{1,3}(?:\.\d{1,2})?(?:px|pt|em|rem|%)|small|medium|large|x-large|xx-large|x-small|xx-small)$/i.test(v)) out.push(`${name}:${v}`);
    else if (name === "font-family" && /^[a-z0-9 ,"'-]{1,100}$/i.test(v)) out.push(`${name}:${v}`);
    else if (name === "font-weight" && /^(?:normal|bold|[1-9]00)$/i.test(v)) out.push(`${name}:${v}`);
    else if (name === "font-style" && /^(?:normal|italic|oblique)$/i.test(v)) out.push(`${name}:${v}`);
    else if (name === "text-decoration" && /^(?:none|underline|line-through|underline line-through)$/i.test(v)) out.push(`${name}:${v}`);
    else if (name === "text-align" && /^(?:left|right|center|justify|start|end)$/i.test(v)) out.push(`${name}:${v}`);
  }
  return out.join(";");
}
function render(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) return escape(node.text);
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.rawTagName?.toLowerCase() ?? "";
  if (discard.has(tag)) return "";
  const inner = node.childNodes.map(render).join("");
  if (!allowed.has(tag)) return inner;
  if (tag === "br") return "<br>";
  const fontSizes: Record<string, string> = { "1": "10px", "2": "13px", "3": "16px", "4": "18px", "5": "24px", "6": "32px", "7": "48px" };
  const fontStyle = tag === "font" ? [node.getAttribute("color") ? `color:${node.getAttribute("color")}` : "", node.getAttribute("face") ? `font-family:${node.getAttribute("face")}` : "", fontSizes[node.getAttribute("size") ?? ""] ? `font-size:${fontSizes[node.getAttribute("size") ?? ""]}` : ""].join(";") : "";
  const style = safeStyle([node.getAttribute("style") ?? "", fontStyle].join(";"));
  let attrs = style ? ` style="${escape(style)}"` : "";
  if (tag === "a") { const href = (node.getAttribute("href") ?? "").trim(); if (/^(?:https?:\/\/|mailto:|#|\/(?![\\/]))/i.test(href) && !/[\x00-\x20\x7f]/.test(href)) attrs += ` href="${escape(href)}"`; }
  const outputTag = tag === "font" ? "span" : tag;
  return `<${outputTag}${attrs}>${inner}</${outputTag}>`;
}
export function sanitizePreviousAnnouncementHtml(html: string): string { return parse(html).childNodes.map(render).join(""); }
export function encodePreviousAnnouncementHtml(html: string): string { const safe = sanitizePreviousAnnouncementHtml(html); return htmlToMarkdown(safe).trim() ? PREFIX + safe : ""; }
export function previousAnnouncementHtml(value: string): string {
  if (value.startsWith(PREFIX)) return sanitizePreviousAnnouncementHtml(value.slice(PREFIX.length));
  return value.split(/\r?\n/).map(line => `<div>${line ? escape(line) : "<br>"}</div>`).join("");
}
export function previousAnnouncementText(value: string): string { return value.startsWith(PREFIX) ? htmlToMarkdown(sanitizePreviousAnnouncementHtml(value.slice(PREFIX.length))) : value; }
