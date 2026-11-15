/** Recognize a limited set of clearly conversational closing paragraphs. */
export function isAnnouncementClosingParagraph(text: string): boolean {
  const value = text.trim().replace(/^(?:#{1,6}\s*|\*\*)/, "");
  if (!value || value.split(/\s+/).length > 45 || /(?:^|\n)\s*(?:[-*]\s|\d+[.)]\s|#{1,6}\s|>|\|)/.test(value)) return false;
  if (/\b(?:due|deadline|quiz|exam|submit|assignment|points|chapter|module|week\s+\d+)\b/i.test(value)) return false;
  return /^(?:if (?:you|you're|you are)\b.*\b(?:difficulty|difficulties|struggling|questions|help)\b|(?:as we continue|as we move forward|keep focusing|keep up|please reach out|if you have questions|feel free to reach out|remember to reach out)\b)/i.test(value);
}

/** Count an explicitly recognizable closing run without retaining its text. */
export function closingParagraphCount(blocks: readonly (readonly string[])[]): number | undefined {
  let count = 0;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (!isAnnouncementClosingParagraph(blocks[index].join(" "))) break;
    count += 1;
  }
  return count > 0 ? Math.min(count, 5) : undefined;
}
