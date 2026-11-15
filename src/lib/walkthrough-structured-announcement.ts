import { containsEmoji, isSingleEmoji } from "./announcement-emoji";
import type { AnnouncementOutline, OutlineSection } from "./announcement-outline-types";
import { promptSafeAnnouncementOutline } from "./announcement-prompt-outline";

type EmojiSlot = { target: "heading" | "paragraph" | "item"; index: number; position: "prefix" | "suffix"; value: string };
type StructuredSection = { index: number; heading: string | null; paragraphs: string[]; items: string[]; emojis?: EmojiSlot[] };

/** Build a bounded, content-free blueprint. Never include text from the example. */
export function announcementStructurePlan(outline: AnnouncementOutline): readonly OutlineSection[] {
  const safe = promptSafeAnnouncementOutline(outline);
  const lists = outline.richTemplate?.blocks.filter(block => block.tag === "ul" || block.tag === "ol") ?? [];
  const sections = safe.sections.length === 1 && safe.sections[0].break === "paragraph-break" && safe.sections[0].listKind === null && lists.length === 1
    ? [{ ...safe.sections[0], listKind: lists[0].tag === "ol" ? "ordered" as const : "unordered" as const }]
    : safe.sections;
  const extra: OutlineSection = { index: safe.sections.length + 1, heading: null, break: "paragraph-break", listKind: null, sentenceRange: [1, 3] };
  return [...sections, extra];
}

function plainLine(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 8000 && !/[\r\n]/.test(value) && !containsEmoji(value) && !/^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|`{3,}|~{3,})/.test(value);
}
function slotKey(slot: { target: string; index: number; position: string }): string { return `${slot.target}:${slot.index}:${slot.position}`; }

/** Preserve a valid model response when it does not fit the example's shape. */
export function recoverAnnouncementSections(value: unknown, outline: AnnouncementOutline): string | null {
  if (!Array.isArray(value) || !value.length || value.length > 100) return null;
  const plan = announcementStructurePlan(outline);
  let previous = 0;
  const blocks: string[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const section = candidate as Record<string, unknown>;
    if (Object.keys(section).some(key => !["index", "heading", "paragraphs", "items", "emojis"].includes(key)) ||
      !Number.isInteger(section.index) || (section.index as number) <= previous || (section.index as number) > 100 ||
      !(section.heading === null || plainLine(section.heading)) || !Array.isArray(section.paragraphs) || !Array.isArray(section.items) ||
      section.paragraphs.length > 40 || section.items.length > 100 || !section.paragraphs.every(plainLine) || !section.items.every(plainLine) ||
      (section.emojis !== undefined && (!Array.isArray(section.emojis) || section.emojis.length !== 0)) ||
      (!section.heading && !section.paragraphs.length && !section.items.length)) return null;
    previous = section.index as number;
    if (section.heading) blocks.push(`## ${section.heading}`);
    blocks.push(...section.paragraphs);
    if (section.items.length) {
      const kind = plan[(section.index as number) - 1]?.listKind;
      if (!kind) return null;
      blocks.push(section.items.map((item, index) => `${kind === "ordered" ? `${index + 1}.` : "-"} ${item}`).join("\n"));
    }
  }
  return blocks.join("\n\n");
}

/** Deterministically assemble model-supplied content and validated emoji slots. */
export function assembleAnnouncementSections(value: unknown, outline: AnnouncementOutline, emojiRequested = false): string | null {
  const plan = announcementStructurePlan(outline);
  if (plan.length > 100 || !Array.isArray(value) || value.length === 0 || value.length > plan.length) return null;
  const sections: StructuredSection[] = [];
  let previous = 0;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const item = candidate as Record<string, unknown>;
    if (Object.keys(item).some(key => !["index", "heading", "paragraphs", "items", "emojis"].includes(key)) ||
      !Number.isInteger(item.index) || (item.index as number) <= previous || (item.index as number) > plan.length ||
      !Array.isArray(item.paragraphs) || !Array.isArray(item.items) || item.paragraphs.length > 40 || item.items.length > 100 ||
      !item.paragraphs.every(plainLine) || !item.items.every(plainLine) || (item.emojis !== undefined && !Array.isArray(item.emojis))) return null;
    const section = plan[(item.index as number) - 1];
    if ((section.break === "heading" ? !plainLine(item.heading) : item.heading !== null) ||
      (section.heading !== null && item.heading !== section.heading) ||
      (!item.paragraphs.length && !item.items.length) || (section.listKind === null && item.items.length > 0) ||
      (section.listKind !== null && item.items.length === 0)) return null;
    const allowed = emojiRequested ? (section.emojiPlacements ?? []).filter(slot => slot.target === "heading" ? !!item.heading : slot.index < (slot.target === "item" ? (item.items as unknown[]).length : (item.paragraphs as unknown[]).length)) : [];
    const emojis = item.emojis ?? [];
    if (!Array.isArray(emojis) || emojis.length !== allowed.length) return null;
    const seen = new Set<string>();
    for (const value of emojis) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const slot = value as Record<string, unknown>;
      if (Object.keys(slot).some(key => !["target", "index", "position", "value"].includes(key)) || typeof slot.target !== "string" || typeof slot.index !== "number" || typeof slot.position !== "string" || typeof slot.value !== "string" || !isSingleEmoji(slot.value)) return null;
      const key = slotKey({ target: slot.target, index: slot.index, position: slot.position });
      if (seen.has(key) || !allowed.some(expected => slotKey(expected) === key)) return null;
      seen.add(key);
    }
    previous = item.index as number;
    sections.push(item as StructuredSection);
  }
  return sections.map(item => {
    const section = plan[item.index - 1];
    const decorate = (text: string, target: EmojiSlot["target"], index: number) => {
      const slots = (item.emojis ?? []).filter(slot => slot.target === target && slot.index === index);
      const before = slots.find(slot => slot.position === "prefix")?.value;
      const after = slots.find(slot => slot.position === "suffix")?.value;
      return `${before ? `${before} ` : ""}${text.trim()}${after ? ` ${after}` : ""}`;
    };
    const blocks = [...(item.heading ? [`## ${decorate(item.heading, "heading", 0)}`] : []), ...item.paragraphs.map((text, index) => decorate(text, "paragraph", index))];
    if (section.listKind && item.items.length) blocks.push(item.items.map((text, index) => `${section.listKind === "ordered" ? `${index + 1}.` : "-"} ${decorate(text, "item", index)}`).join("\n"));
    return blocks.join("\n\n");
  }).join("\n\n");
}

/** Strip only structural Markdown for a losslessness check, retaining all text. */
export function announcementContentSignature(message: string): string {
  return message.replace(/^ {0,3}#{1,6}[ \t]+/gm, "").replace(/^ {0,3}(?:[-*+][ \t]+|\d+[.)][ \t]+)/gm, "").replace(/\s+/g, " ").trim();
}

/** Read only body fields after successful structure validation; omit headings and emoji. */
export function announcementSectionBody(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.flatMap(section => [...section.paragraphs, ...section.items]).join("\n");
}

export function hasMeaningfulAnnouncementContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(announcementContentSignature(text));
}
