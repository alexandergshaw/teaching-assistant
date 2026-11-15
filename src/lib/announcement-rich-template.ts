import { markdownToHtml } from "./markdown";
import { HTMLElement, NodeType, parse, type Node } from "node-html-parser";
import { previousAnnouncementHtml, sanitizePreviousAnnouncementHtml } from "./announcement-library-rich-text";

export type RichTemplateRun = { readonly style: string; readonly before: boolean; readonly after: boolean };
export type RichTemplateBlock = { readonly tag: "p" | "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "ul" | "ol"; readonly style: string; readonly entries: readonly { readonly style: string; readonly runs: readonly RichTemplateRun[] }[] };
export type RichTemplate = { readonly blocks: readonly RichTemplateBlock[] };

/** Extract only formatting and positions; never retain example text or links. */
export function deriveRichTemplate(value: string): RichTemplate | null {
  if (!value.startsWith("<!--announcement-rich-v1-->")) return null;
  const root = parse(previousAnnouncementHtml(value));
  const blocks: RichTemplateBlock[] = [];
  let invalid = false;
  const styleOf = (node: HTMLElement) => node.getAttribute("style") ?? "";
  const appendLine = (tag: RichTemplateBlock["tag"], style: string, runs: RichTemplateRun[], raw: string) => {
    if (!raw.trim()) return;
    if (!runs.length || runs.length > 40) { invalid = true; return; }
    const list = /^\s*[-*+]\s+/.test(raw) ? "ul" : /^\s*\d+[.)]\s+/.test(raw) ? "ol" : null;
    if (list) {
      const last = blocks[blocks.length - 1];
      const entry = { style, runs };
      if (last?.tag === list && last.style === "") blocks[blocks.length - 1] = { ...last, entries: [...last.entries, entry] };
      else blocks.push({ tag: list, style: "", entries: [entry] });
    } else blocks.push({ tag, style, entries: [{ style: "", runs }] });
    if (blocks.length > 100 || blocks.some(block => block.entries.length > 100)) invalid = true;
  };
  const inlineLines = (parent: HTMLElement, tag: RichTemplateBlock["tag"], blockStyle: string) => {
    let runs: RichTemplateRun[] = [], raw = "";
    const flush = () => { appendLine(tag, blockStyle, runs, raw); runs = []; raw = ""; };
    const visit = (node: Node, inherited: string) => {
      if (node.nodeType === NodeType.TEXT_NODE) {
        const text = node.text;
        const markerOnly = !raw.trim() && /^\s*(?:[-*+]|\d+[.)])\s+$/.test(text);
        raw += text;
        if (markerOnly) return;
        if (text.trim()) runs.push({ style: inherited, before: /^\s/.test(text), after: /\s$/.test(text) });
        else if (text && runs.length) runs[runs.length - 1] = { ...runs[runs.length - 1], after: true };
        return;
      }
      if (!(node instanceof HTMLElement)) { invalid = true; return; }
      const name = node.rawTagName?.toLowerCase();
      if (name === "br") { flush(); return; }
      if (!["span", "strong", "b", "em", "i", "u", "s", "a"].includes(name ?? "")) { invalid = true; return; }
      const semantic = name === "strong" || name === "b" ? "font-weight:bold" : name === "em" || name === "i" ? "font-style:italic" : name === "u" ? "text-decoration:underline" : name === "s" ? "text-decoration:line-through" : "";
      const style = [inherited, styleOf(node), semantic].filter(Boolean).join(";");
      node.childNodes.forEach(child => visit(child, style));
    };
    parent.childNodes.forEach(child => visit(child, ""));
    flush();
  };
  const process = (node: Node, inherited: string) => {
    if (node.nodeType === NodeType.TEXT_NODE) {
      const text = node.text;
      if (text.trim()) appendLine("div", inherited, [{ style: "", before: /^\s/.test(text), after: /\s$/.test(text) }], text);
      return;
    }
    if (!(node instanceof HTMLElement)) { invalid = true; return; }
    const tag = node.rawTagName?.toLowerCase() ?? "";
    const style = [inherited, styleOf(node)].filter(Boolean).join(";");
    if (tag === "div" && node.childNodes.some(child => child instanceof HTMLElement && ["p", "div", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6"].includes(child.rawTagName?.toLowerCase() ?? ""))) {
      node.childNodes.forEach(child => process(child, style)); return;
    }
    if (["p", "div", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) { inlineLines(node, tag as RichTemplateBlock["tag"], style); return; }
    if (tag !== "ul" && tag !== "ol") { invalid = true; return; }
    const before = blocks.length;
    for (const child of node.childNodes) {
      if (child.nodeType === NodeType.TEXT_NODE && !child.text.trim()) continue;
      if (!(child instanceof HTMLElement) || child.rawTagName?.toLowerCase() !== "li") { invalid = true; return; }
      inlineLines(child, "p", styleOf(child));
    }
    const items = blocks.splice(before);
    if (items.some(item => item.tag !== "p" || item.entries.length !== 1)) { invalid = true; return; }
    if (items.length) blocks.push({ tag, style, entries: items.map(item => ({ style: item.style, runs: item.entries[0].runs })) });
  };
  root.childNodes.forEach(node => process(node, ""));
  return !invalid && blocks.length && blocks.length <= 100 ? { blocks } : null;
}
/** Render only validated content slots; omitted blocks stay omitted. The final
 * allowlist is applied even when a caller supplies an untrusted template. */
export function renderRichTemplate(template: RichTemplate, values: readonly { readonly index: number; readonly entries: readonly (readonly string[])[] }[]): string | null {
  if (!template || !Array.isArray(template.blocks) || template.blocks.length > 100 || !Array.isArray(values) || !values.length || values.length > template.blocks.length) return null;
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  let last = -1;
  const output: string[] = [];
  for (const value of values) {
    if (!value || !Number.isInteger(value.index) || value.index <= last || value.index >= template.blocks.length || !Array.isArray(value.entries)) return null;
    const block = template.blocks[value.index];
    if (!block || !["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol"].includes(block.tag) || typeof block.style !== "string" || block.style.length > 1000 || !Array.isArray(block.entries) || !block.entries.length || block.entries.length > 100) return null;
    const isList = block.tag === "ul" || block.tag === "ol";
    if (!value.entries.length || value.entries.length > block.entries.length || (!isList && value.entries.length !== 1)) return null;
    const items: string[] = [];
    for (let i = 0; i < value.entries.length; i++) {
      const entry = block.entries[i], content = value.entries[i];
      if (!entry || typeof entry.style !== "string" || entry.style.length > 1000 || !Array.isArray(entry.runs) || !entry.runs.length || entry.runs.length > 40 || !Array.isArray(content) || content.length !== entry.runs.length) return null;
      let text = "";
      for (let j = 0; j < content.length; j++) {
        const run = entry.runs[j], fragment = content[j];
        if (!run || typeof run.style !== "string" || run.style.length > 1000 || typeof run.before !== "boolean" || typeof run.after !== "boolean" || typeof fragment !== "string" || !fragment.trim() || fragment.length > 8000 || /[\r\n]/.test(fragment) || /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|`{3,}|~{3,}|\|)/.test(fragment)) return null;
        if (j && (run.before || entry.runs[j - 1].after)) text += " ";
        const rendered = markdownToHtml(fragment.trim()).replace(/^<p>/, "").replace(/<\/p>$/, "");
        text += `<span style="${escape(run.style)}">${rendered}</span>`;
      }
      items.push(isList ? `<li style="${escape(entry.style)}">${text}</li>` : text);
    }
    output.push(`<${block.tag} style="${escape(block.style)}">${items.join("")}</${block.tag}>`);
    last = value.index;
  }
  return sanitizePreviousAnnouncementHtml(output.join(""));
}

/** Validate an untrusted structure by rendering every bounded slot through the
 * same allowlist used for the final result. */
export function validRichTemplate(value: unknown): value is RichTemplate {
  if (!value || typeof value !== "object" || !Array.isArray((value as RichTemplate).blocks)) return false;
  const template = value as RichTemplate;
  if (!template.blocks.length || template.blocks.length > 100) return false;
  try {
    const slots = template.blocks.map((block, index) => ({ index, entries: block.entries.map(entry => entry.runs.map(() => "x")) }));
    return renderRichTemplate(template, slots) !== null;
  } catch { return false; }
}
