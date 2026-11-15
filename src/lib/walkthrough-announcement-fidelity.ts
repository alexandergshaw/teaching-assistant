import { emojiGraphemes, isSingleEmoji } from "./announcement-emoji";
import { isAnnouncementClosingParagraph } from "./announcement-closing-shape";
import type { AnnouncementOutline } from "./announcement-outline-types";

function opensWithWelcome(message: string): boolean {
  let beginning = message.trimStart().replace(/^#{1,6}\s*/, "").replace(/^\*\*/, "");
  const first = emojiGraphemes(beginning)[0];
  if (first && isSingleEmoji(first)) beginning = beginning.slice(first.length).trimStart();
  return /^welcome\b/i.test(beginning);
}

/** Move only self-contained help offers past later instructional blocks. */
function moveEarlySupportToEnd(message: string): string {
  if (message.includes("\r") || message.includes("\n\n\n") || /^ {0,3}(?:`{3,}|~{3,})/m.test(message)) return message;
  const blocks = message.split("\n\n");
  const supportOnly = (block: string): boolean => {
    if (!block.trim() || /\n|https?:\/\/|\[[^\]]+\]\(|\b(?:quiz|exam|assignment|project|deadline|due|submit)\b/i.test(block)) return false;
    const sentences = block.trim().split(/(?<=[.!?])\s+/);
    if (sentences.length > 3) return false;
    return sentences.every(sentence => /^(?:(?:if you (?:have|need|are|are having)|if you['’]re|if anything is unclear)\b.*\b(?:questions?|help|clarification|unclear|reach out|contact|email|office hours)\b|(?:please |feel free to )?(?:reach out|contact me|email me)\b|(?:i am|i['’]m|we are|we['’]re) (?:available|here to help)\b)/i.test(sentence.trim()));
  };
  const signature = /^(?:best(?: regards)?|warm regards|kind regards|sincerely|regards|thank you|thanks|cheers|take care)\s*,?(?:\n[^\n]{1,80})?\s*$/i;
  const last = (blocks[blocks.length - 1] ?? "").trim();
  const knownEnding = signature.test(last) || (signature.test(blocks[blocks.length - 2] ?? "") && /^[\p{L}\p{M}][\p{L}\p{M} .,''-]{0,79}$/u.test(last));
  if (!knownEnding && last && !/[.!?]$/.test(last) && last.split(/\s+/).length <= 7 && !/(?:^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s)/.test(last) && !supportOnly(last)) return message;
  const move = blocks.map((block, index) => supportOnly(block) && !/^ {0,3}#{1,6}\s/.test(blocks[index - 1] ?? "") && blocks.slice(index + 1).some(later => /(?:^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s)/.test(later)));
  if (!move.some(Boolean)) return message;
  const kept = blocks.filter((_block, index) => !move[index]);
  const offers = blocks.filter((_block, index) => move[index]);
  let insertion = signature.test(kept[kept.length - 1] ?? "") ? kept.length - 1 : kept.length;
  if (insertion === kept.length && signature.test(kept[kept.length - 2] ?? "") && /^[\p{L}\p{M}][\p{L}\p{M} .,''-]{0,79}$/u.test((kept[kept.length - 1] ?? "").trim())) insertion -= 2;
  return [...kept.slice(0, insertion), ...offers, ...kept.slice(insertion)].join("\n\n");
}

/** Apply only fact-free and text-preserving adjustments to an unchanged prompt. */
export function applyWalkthroughFidelity(message: string, outline: AnnouncementOutline): string {
  let result = message;
  if (outline.opensWithWelcome && !opensWithWelcome(result)) result = `Welcome!\n\n${result}`;
  if (outline.closingParagraphs) result = moveEarlySupportToEnd(result);
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
