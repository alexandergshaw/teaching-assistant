import { isAnnouncementClosingParagraph } from "./announcement-closing-shape";
import type { AnnouncementOutline } from "./announcement-outline-types";

/** Apply only fact-free and text-preserving adjustments to an unchanged prompt. */
export function applyWalkthroughFidelity(message: string, outline: AnnouncementOutline): string {
  let result = message;
  if (outline.opensWithWelcome && !/^(?:#{1,6}\s*|\*\*)?welcome\b/i.test(result.trimStart())) result = `Welcome!\n\n${result}`;
  const target = outline.closingParagraphs;
  if (!Number.isInteger(target) || !target || target < 1 || target > 5 || result.includes("\r") || result.includes("\n\n\n")) return result;
  const paragraphs = result.split("\n\n");
  let start = paragraphs.length;
  while (start > 0 && isAnnouncementClosingParagraph(paragraphs[start - 1])) start -= 1;
  const count = paragraphs.length - start;
  if (count <= target) return result;
  const closing = paragraphs.slice(start);
  const grouped: string[] = [];
  for (let group = 0; group < target; group += 1) {
    const from = Math.floor(group * count / target), to = Math.floor((group + 1) * count / target);
    grouped.push(closing.slice(from, to).join(" "));
  }
  return [...paragraphs.slice(0, start), ...grouped].join("\n\n");
}
