const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
const EMOJI_BASE = /\p{Emoji_Presentation}|\p{Regional_Indicator}|\p{Extended_Pictographic}\uFE0F|[0-9#*]\uFE0F?\u20E3/u;
const REGIONAL = /^\p{Regional_Indicator}$/u;
const EXTENDER = /^(?:\p{Mark}|\p{Emoji_Modifier}|\uFE0F|\uFE0E|\u200D)$/u;

/** Keep emoji joins, modifiers, keycaps and regional-indicator pairs intact in older browsers. */
export function emojiGraphemes(text: string, forceFallback = false): string[] {
  if (segmenter && !forceFallback) return Array.from(segmenter.segment(text), part => part.segment);
  const result: string[] = [];
  let joinNext = false;
  for (const part of Array.from(text)) {
    const last = result[result.length - 1];
    if (last && (joinNext || EXTENDER.test(part) || (REGIONAL.test(part) && REGIONAL.test(last)))) result[result.length - 1] += part;
    else result.push(part);
    joinNext = part === "\u200D";
  }
  return result;
}
export function isSingleEmoji(value: string): boolean {
  const parts = emojiGraphemes(value);
  return parts.length === 1 && EMOJI_BASE.test(parts[0]);
}
export function containsEmoji(text: string): boolean {
  return emojiGraphemes(text).some(part => EMOJI_BASE.test(part));
}
