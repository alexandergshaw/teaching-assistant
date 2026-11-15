import { deriveAnnouncementOutline } from "@/lib/announcement-outline";
import type { AnnouncementOutline } from "@/lib/announcement-outline-types";
/** Flag possible capture-process references for review without changing student-facing text. */
export function hasCaptureProcessReference(title: string, message: string): boolean {
  return /\b(?:during|in|from|through|after|before|our|my|this|the)\s+(?:(?:this|the|our|my)\s+)?(?:walkthrough|recording|screen[ -]shar(?:e|ing)|screen capture)\b/i.test(`${title}\n${message}`);
}

/** Compare only unique, named sections and coarse section counts; never rewrite the draft. */
export function reviewTemplateStructure(message: string, outline: AnnouncementOutline): { orderChanged: boolean; muchShorter: boolean; fragmentedClosing: boolean } {
  const named = outline.sections.flatMap(section => section.heading ? [section.heading.toLowerCase()] : []);
  const unique = named.filter(name => named.indexOf(name) === named.lastIndexOf(name));
  const observed = message.split(/\r?\n/).map(line => line.trim().replace(/^#{1,6}\s*/, "").replace(/^\*\*/, "").replace(/\*\*$/, "").replace(/:$/, "").replace(/\*\*$/, "").toLowerCase());
  const positions = observed.flatMap(line => unique.includes(line) && observed.indexOf(line) === observed.lastIndexOf(line) ? [named.indexOf(line)] : []);
  const orderChanged = positions.some((position, index) => index > 0 && position < positions[index - 1]);
  const actual = Math.max(message.trim() ? 1 : 0, deriveAnnouncementOutline(message).sections.length);
  const muchShorter = outline.sections.length >= 6 && actual * 2 < outline.sections.length;
  const paragraphs = message.split(/\r?\n[ \t]*\r?\n/).filter(paragraph => paragraph.trim());
  const tail: string[] = [];
  for (let index = paragraphs.length - 1; index >= 0 && tail.length < 12; index -= 1) {
    if (/(?:^|\n) {0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|`{3,}|~{3,}|\|)/.test(paragraphs[index])) break;
    tail.unshift(paragraphs[index]);
  }
  const isClosing = (paragraph: string) => /^(?:as (?:you|we) (?:finalize|finish|continue|move)|i look forward|i encourage|good luck|keep (?:focusing|up)|please reach out|if you (?:have|are having|need)|feel free to reach out|this week is a great opportunity)\b/i.test(paragraph.trim());
  const firstClosing = tail.findIndex(isClosing);
  const relevantTail = firstClosing < 0 ? [] : tail.slice(firstClosing);
  const closingSignals = relevantTail.filter(isClosing).length;
  const expected = outline.closingParagraphs;
  const fragmentedClosing = Number.isInteger(expected) && !!expected && expected >= 1 && expected <= 5 && closingSignals >= 2 && relevantTail.length >= expected + 2;
  return { orderChanged, muchShorter, fragmentedClosing };
}
