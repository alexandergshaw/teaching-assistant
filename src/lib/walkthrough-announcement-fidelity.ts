import { isAnnouncementClosingParagraph } from "./announcement-closing-shape";
import type { AnnouncementOutline } from "./announcement-outline-types";

/** Apply only fact-free and text-preserving adjustments to an unchanged prompt. */
export function applyWalkthroughFidelity(message: string, outline: AnnouncementOutline): string {
  let result = message;
  if (outline.opensWithWelcome && !/^(?:#{1,6}\s*|\*\*)?welcome\b/i.test(result.trimStart())) result = `Welcome!\n\n${result}`;
  const target = outline.closingParagraphs;
  if (!Number.isInteger(target) || !target || target < 1 || target > 5 || result.includes("\r") || result.includes("\n\n\n")) return result;
  const paragraphs = result.split("\n\n");
  // A fenced block anywhere makes paragraph boundaries ambiguous. Never
  // change code, lists, headings, block quotes or long substantive sections.
  if (/^ {0,3}(?:`{3,}|~{3,})/m.test(result)) return result;
  const closingAnchor = (paragraph: string) => isAnnouncementClosingParagraph(paragraph) ||
    /^(?:as (?:you|we) (?:finalize|finish|continue|move)|i look forward|i encourage you|i am available|let me know|good luck|keep focusing|please reach out|if you have questions|feel free to reach out|this week is a great opportunity)\b/i.test(paragraph.trim());
  const prose = (paragraph: string) => paragraph.trim().split(/\s+/).length <= 80 &&
    !/(?:^|\n)[ \t]*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||[-*_]{3,}\s*$)/m.test(paragraph);
  let tail = paragraphs.length;
  while (tail > 0 && paragraphs.length - tail < 12 && prose(paragraphs[tail - 1])) tail -= 1;
  if (!closingAnchor(paragraphs[paragraphs.length - 1])) return result;
  const offset = paragraphs.slice(tail).findIndex(closingAnchor);
  if (offset < 0) return result;
  const start = tail + offset;
  if (paragraphs.slice(start).filter(closingAnchor).length < 2) return result;
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
