/**
 * System instruction composition for the FAB / selection AI chat (`/api/ai-chat`).
 *
 * Kept as a pure, dependency-free function so the composition rules can be
 * unit tested without a network call or a database lookup — the caller is
 * responsible for producing `styleBlock` (see `getWritingStyleBlock` in
 * `src/app/actions/shared.ts`) and passing it in.
 */

/**
 * The plain-text formatting rule. This must survive verbatim and keep
 * precedence over any tone instruction — a matched tone that starts emitting
 * markdown is a regression, not a feature.
 */
export const PLAIN_TEXT_ONLY_INSTRUCTION =
  "Respond in plain text only. Never use markdown or any rich formatting: no asterisks, bold, italics, headings, bullet points, numbered lists, tables, code fences, or backticks. Write in plain sentences and paragraphs.";

/**
 * Compose the full systemInstruction sent to the model.
 *
 * When `styleBlock` is blank (no authenticated user, no writing sample, or a
 * failed lookup), the instruction is unchanged from today's plain-text-only
 * rule. When it is present, the writing-style sample is appended followed by
 * an explicit instruction to mimic that tone — after, and therefore
 * subordinate to, the plain-text rule.
 */
export function buildChatSystemInstruction(styleBlock: string): string {
  if (!styleBlock) return PLAIN_TEXT_ONLY_INSTRUCTION;
  return `${PLAIN_TEXT_ONLY_INSTRUCTION}${styleBlock}\n\nMimic this writing tone (word choice, rhythm, sentence length, personality) in every reply, while still strictly obeying the plain-text formatting rule above.`;
}
