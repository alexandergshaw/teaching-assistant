/**
 * System instruction composition for the FAB / selection AI chat (`/api/ai-chat`).
 *
 * Kept as a pure, dependency-free function so the composition rules can be
 * unit tested without a network call or a database lookup — the caller is
 * responsible for producing `styleBlock` (see `getWritingStyleBlock` in
 * `src/app/actions/shared.ts`) and passing it in.
 */

/**
 * Who the model is actually talking to. Without this, an app that is wall to
 * wall course material gives the model nothing to infer the reader from
 * except that material, and it defaults to treating them as a student. This
 * instruction states the true audience explicitly, on every branch,
 * regardless of whether a writing-style sample is present.
 */
export const INSTRUCTOR_AUDIENCE_INSTRUCTION =
  "The person you are talking to is the instructor who owns and teaches these courses: a subject-matter expert and a working academic, not a student. Address them directly, as a capable colleague. Never address them as a student, never explain concepts in their own discipline back to them, and never add encouragement or scaffolding meant for a learner. Skip definitions of standard terms in their field, do not pad answers with caveats they already know, and answer the question actually asked. Much of the job is producing material for their students — assignments, quizzes, announcements, slides. When asked for that, produce it, pitched at students as needed: the artifact's audience and this conversation's audience are separate, and only the artifact is ever the student's.";

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
 * Every branch opens with INSTRUCTOR_AUDIENCE_INSTRUCTION, so the model is
 * told who it is talking to before anything else, then the plain-text-only
 * rule. When `styleBlock` is blank (no authenticated user, no writing
 * sample, or a failed lookup), that is the whole instruction. When it is
 * present, the writing-style sample is appended followed by an explicit
 * instruction to mimic that tone — after, and therefore subordinate to, the
 * plain-text rule.
 */
export function buildChatSystemInstruction(styleBlock: string): string {
  const base = `${INSTRUCTOR_AUDIENCE_INSTRUCTION}\n\n${PLAIN_TEXT_ONLY_INSTRUCTION}`;
  if (!styleBlock) return base;
  return `${base}${styleBlock}\n\nMimic this writing tone (word choice, rhythm, sentence length, personality) in every reply, while still strictly obeying the plain-text formatting rule above.`;
}
