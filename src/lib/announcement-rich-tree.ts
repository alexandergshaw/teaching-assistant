import { HTMLElement, NodeType, parse, type Node } from "node-html-parser";
import { markdownToHtml } from "./markdown";
import { previousAnnouncementHtml, sanitizePreviousAnnouncementHtml } from "./announcement-library-rich-text";
import { emojiGraphemes, isSingleEmoji, containsEmoji } from "./announcement-emoji";

export type RichTree = { readonly tag: string; readonly style: string; readonly colspan?: string; readonly rowspan?: string; readonly children: readonly RichTreeChild[] };
export type RichTreeChild = RichTree | { readonly slot: number; readonly before: boolean; readonly after: boolean; readonly emoji?: boolean } | { readonly space: true };

/** Read only keys defined by the validated tree; the renderer checks branch completeness. */
export function richTreeSlotsFromMap(tree: unknown, value: unknown): { slot: number; text: string }[] | null {
  const plan = richTreePlan(tree);
  if (!plan || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const map = value as Record<string, unknown>;
  const allowed = new Map(plan.slots.map(slot => [`s${slot}`, slot]));
  if (Object.entries(map).some(([key, text]) => !allowed.has(key) || typeof text !== "string")) return null;
  return plan.slots.filter(slot => Object.hasOwn(map, `s${slot}`)).map(slot => ({ slot, text: map[`s${slot}`] as string }));
}
const tags = new Set(["div", "p", "br", "span", "strong", "b", "em", "i", "u", "s", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "blockquote"]);

/** Capture structure and safe styles only; old text and link targets never enter the model. */
export function deriveRichTree(value: string): RichTree | null {
  if (!value.startsWith("<!--announcement-rich-v1-->")) return null;
  let next = 0, invalid = false, total = 0;
  const visit = (node: Node, depth: number): RichTreeChild | null => {
    if (++total > 1000 || depth > 20) { invalid = true; return null; }
    if (node.nodeType === NodeType.TEXT_NODE) {
      if (!node.text.trim()) return node.text ? { space: true } : null;
      const groups: { emoji: boolean; text: string }[] = [];
      for (const grapheme of emojiGraphemes(node.text)) {
        const emoji = isSingleEmoji(grapheme), last = groups[groups.length - 1];
        if (!emoji && last && !last.emoji) last.text += grapheme;
        else groups.push({ emoji, text: grapheme });
      }
      const children: RichTreeChild[] = groups.map(group => group.text.trim() ? { slot: next++, before: /^\s/.test(group.text), after: /\s$/.test(group.text), ...(group.emoji && { emoji: true }) } : { space: true });
      return children.length === 1 ? children[0] : { tag: "span", style: "", children };
    }
    if (!(node instanceof HTMLElement)) { invalid = true; return null; }
    const original = node.rawTagName?.toLowerCase() ?? "";
    const tag = original === "a" ? "span" : original;
    if (!tags.has(tag)) { invalid = true; return null; }
    const children = node.childNodes.map(child => visit(child, depth + 1)).filter((child): child is RichTreeChild => child !== null);
    const colspan = node.getAttribute("colspan"), rowspan = node.getAttribute("rowspan");
    return { tag, style: node.getAttribute("style") ?? "", ...(colspan && { colspan }), ...(rowspan && { rowspan }), children };
  };
  let children = parse(previousAnnouncementHtml(value)).childNodes.map(node => visit(node, 0)).filter((child): child is RichTreeChild => child !== null);
  if (children.length === 1 && "tag" in children[0] && children[0].tag === "div" && children[0].children.every(child => "tag" in child && ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "table", "blockquote"].includes(child.tag))) {
    const wrapper = children[0];
    children = wrapper.children.map(child => ({ tag: "div", style: wrapper.style, children: [child] }));
  }
  return !invalid && next > 0 && next <= 400 ? { tag: "div", style: "", children } : null;
}

/** Render all slots in a selected tree; malformed structure is rejected. */
export function renderRichTree(tree: RichTree, values: readonly { readonly slot: number; readonly text: string }[], extra: readonly string[] = []): string | null {
  if (!Array.isArray(values) || values.length > 400 || !Array.isArray(extra) || extra.length > 40 || (!values.length && !extra.length) || !extra.every(item => typeof item === "string" && item.trim() && item.length <= 8000 && !/[\r\n]/.test(item))) return null;
  const map = new Map<number, string>();
  for (const value of values) {
    if (!value || !Number.isInteger(value.slot) || value.slot < 0 || typeof value.text !== "string" || !value.text.trim() || value.text.length > 8000 || /[\r\n]/.test(value.text) || /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|`{3,}|~{3,}|\|)/.test(value.text) || map.has(value.slot)) return null;
    map.set(value.slot, value.text);
  }
  let count = 0, invalid = false;
  const seen = new Set<number>();
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const visit = (node: RichTreeChild, depth: number): string => {
    if (++count > 1000 || depth > 20 || !node || typeof node !== "object") { invalid = true; return ""; }
    if ("space" in node) return node.space === true ? " " : (invalid = true, "");
    if ("slot" in node) {
      if (!Number.isInteger(node.slot) || node.slot < 0 || seen.has(node.slot) || (!node.emoji && !map.has(node.slot)) || typeof node.before !== "boolean" || typeof node.after !== "boolean") { invalid = true; return ""; }
      if (node.emoji && !map.has(node.slot)) return "";
      const value = map.get(node.slot)!;
      if (node.emoji ? !isSingleEmoji(value) : containsEmoji(value)) { invalid = true; return ""; }
      seen.add(node.slot);
      return `${node.before ? " " : ""}${markdownToHtml(value).replace(/^<p>/, "").replace(/<\/p>$/, "")}${node.after ? " " : ""}`;
    }
    if (!tags.has(node.tag) || typeof node.style !== "string" || node.style.length > 1000 || !Array.isArray(node.children)) { invalid = true; return ""; }
    if ((node.colspan !== undefined || node.rowspan !== undefined) && !["td", "th"].includes(node.tag)) { invalid = true; return ""; }
    if ((node.colspan !== undefined && !/^(?:[1-9]|[1-9]\d|100)$/.test(node.colspan)) || (node.rowspan !== undefined && !/^(?:[1-9]|[1-9]\d|100)$/.test(node.rowspan))) { invalid = true; return ""; }
    if (node.tag === "br") return "<br>";
    return `<${node.tag} style="${escape(node.style)}"${node.colspan ? ` colspan="${node.colspan}"` : ""}${node.rowspan ? ` rowspan="${node.rowspan}"` : ""}>${node.children.map(child => visit(child, depth + 1)).join("")}</${node.tag}>`;
  };
  let scanned = 0;
  const optionalEmoji = new Set<number>();
  const slotsIn = (node: RichTreeChild, depth: number): number[] => {
    if (++scanned > 1000 || depth > 20 || !node || typeof node !== "object") { invalid = true; return []; }
    if ("slot" in node) { if (node.emoji) optionalEmoji.add(node.slot); return [node.slot]; }
    if ("space" in node) return [];
    if (!Array.isArray(node.children)) { invalid = true; return []; }
    return node.children.flatMap(child => slotsIn(child, depth + 1));
  };
  if (!tree || tree.tag !== "div" || typeof tree.style !== "string" || !Array.isArray(tree.children)) return null;
  const children = tree.children.map(child => {
    const ids = slotsIn(child, 0);
    if (!ids.some(id => map.has(id))) return "";
    if (ids.some(id => !optionalEmoji.has(id) && !map.has(id))) { invalid = true; return ""; }
    return visit(child, 1);
  }).join("");
  const extraHtml = extra.map(item => `<p>${markdownToHtml(item).replace(/^<p>/, "").replace(/<\/p>$/, "")}</p>`).join("");
  const html = `<div style="${escape(tree.style)}">${children}${extraHtml}</div>`;
  return invalid || seen.size !== map.size ? null : sanitizePreviousAnnouncementHtml(html);
}

/** Produce bounded, content-free model instructions and validate all nodes. */
export function richTreePlan(tree: unknown): { readonly shape: unknown; readonly slots: readonly number[]; readonly emojiSlots: readonly number[] } | null {
  let count = 0;
  const slots: number[] = [];
  const emojiSlots: number[] = [];
  const visit = (value: unknown, depth: number): unknown => {
    if (++count > 1000 || depth > 20 || !value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid tree");
    const node = value as Record<string, unknown>;
    if ("space" in node) { if (node.space !== true) throw new Error("Invalid space"); return { space: true }; }
    if ("slot" in node) {
      if (!Number.isInteger(node.slot) || (node.slot as number) < 0 || (node.slot as number) >= 400 || typeof node.before !== "boolean" || typeof node.after !== "boolean" || slots.includes(node.slot as number)) throw new Error("Invalid slot");
      if (node.emoji !== undefined && node.emoji !== true) throw new Error("Invalid slot");
      slots.push(node.slot as number); if (node.emoji) emojiSlots.push(node.slot as number);
      return { slot: node.slot, before: node.before, after: node.after, ...(node.emoji && { emoji: true }) };
    }
    if (typeof node.tag !== "string" || !tags.has(node.tag) || typeof node.style !== "string" || node.style.length > 1000 || !Array.isArray(node.children)) throw new Error("Invalid node");
    return { tag: node.tag, ...(node.colspan ? { colspan: node.colspan } : {}), ...(node.rowspan ? { rowspan: node.rowspan } : {}), children: node.children.map(child => visit(child, depth + 1)) };
  };
  try {
    const shape = visit(tree, 0);
    if (!slots.length || !renderRichTree(tree as RichTree, slots.filter(slot => !emojiSlots.includes(slot)).map(slot => ({ slot, text: "x" })))) return null;
    return { shape, slots, emojiSlots };
  } catch { return null; }
}
