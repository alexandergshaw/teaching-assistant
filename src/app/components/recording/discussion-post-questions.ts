// Pure helpers for DiscussionReplyQuestions.tsx, kept in a plain .ts file
// specifically so they have a test surface at all - vitest in this repo is
// node-env and collects only src/**/*.test.ts, never .test.tsx, so nothing
// declared inline inside the component itself is ever exercised by a test
// (the same reason discussion-reply-controls.ts exists as a sibling file for
// DiscussionReplyControls.tsx - see that file's own header).
//
// docs/post-questions-acceptance-criteria.md Q10: this leaf owns
// QUESTION_BADGE_LABELS, questionBadgeLabel, the three aria-name builders and
// neighbourQuestionAfterRemove. Imports only `type PostQuestion` and
// `truncateWithMarker` from the leaf (src/lib/discussion-reply-prompt.ts) -
// the 60-char aria clamp is ONE implementation (truncateWithMarker), never
// restated here, per Q1's "one set restated in four modules" lesson.

import type { PostQuestion } from "@/lib/discussion-reply-prompt";
import { truncateWithMarker } from "@/lib/discussion-reply-prompt";

/** Q10: the block's own copy-confirmation reset delay, exported so its own
 *  test can pin the value without restating it. */
export const COPY_RESET_MS = 1500;

/** Q7 (from the block, per section 5's decision): "in the reply box" (the
 *  row's own CLIPBOARD_FAILURE_MESSAGE, DiscussionReplyRow.tsx) is false
 *  here - nothing in this block writes to the reply textarea until Insert is
 *  clicked, and Copy never touches it at all. Exported so the block's own
 *  test can pin the message text. */
export const ANSWER_CLIPBOARD_FAILURE_MESSAGE = "Could not copy automatically. Select the answer text and copy it.";

/** Q11: neutral for both - "Implied" is a description, never a warning,
 *  never accent; "Needs you" is the one warning-toned badge in this block
 *  (rendered directly by DiscussionReplyQuestions.tsx, not through
 *  questionBadgeLabel, since it is not keyed on `item.implied`). */
export const QUESTION_BADGE_LABELS = {
  asked: "Asked",
  implied: "Implied",
  needsYou: "Needs you",
} as const;

/** Q11 line 1's badge text - "Asked" or "Implied" depending on
 *  `item.implied`, never anything else. */
export function questionBadgeLabel(item: Pick<PostQuestion, "implied">): string {
  return item.implied ? QUESTION_BADGE_LABELS.implied : QUESTION_BADGE_LABELS.asked;
}

/** Q11: the 60-char clamp, applied consistently to every accessible name
 *  below AND to the two spoken announcements (see the two builders at the
 *  foot of this file) - visible text (the question span, Q11) is NEVER
 *  clamped; only what assistive tech reads or speaks is.
 *
 *  VERIFIER FINDING 5: EXPORTED. The block used to re-spell
 *  `truncateWithMarker(item.question, 60)` inline for its Copy
 *  announcement, putting the 60 in two places and leaving that string with
 *  no test surface - which is the whole reason this leaf exists (vitest
 *  here renders no component, so anything declared inside the .tsx is
 *  never exercised). */
export function clampQuestion(question: string): string {
  return truncateWithMarker(question, 60);
}

/** Q11: `Insert the answer to "${clamp}" into the reply to ${author}`. */
export function insertAnswerAriaLabel(item: Pick<PostQuestion, "question">, author: string): string {
  return `Insert the answer to "${clampQuestion(item.question)}" into the reply to ${author}`;
}

/** Q11: `Copy the answer to "${clamp}"` - no author name, matching Q11's
 *  literal spec (the Copy control names only the question, unlike Insert
 *  and Remove). */
export function copyAnswerAriaLabel(item: Pick<PostQuestion, "question">): string {
  return `Copy the answer to "${clampQuestion(item.question)}"`;
}

/** Q11: `Remove the question "${clamp}" from the reply to ${author}`. */
export function removeQuestionAriaLabel(item: Pick<PostQuestion, "question">, author: string): string {
  return `Remove the question "${clampQuestion(item.question)}" from the reply to ${author}`;
}

/** Q11 "Focus after Remove": the next item's question, else the previous
 *  item's, else null (the block's own layout effect falls back to
 *  `focusReplyInput()` in that last case). Matched by `question` text (the
 *  same identity `removeQuestion(id, question)` itself filters on, Q6/Q7) -
 *  `questions` is the list BEFORE the removal (the row still holds the item
 *  being removed at the moment this is called), so `removed` is always found
 *  in it. */
export function neighbourQuestionAfterRemove(questions: readonly Pick<PostQuestion, "question">[], removed: string): string | null {
  const index = questions.findIndex((q) => q.question === removed);
  if (index === -1) return null;
  const next = questions[index + 1];
  if (next) return next.question;
  const previous = questions[index - 1];
  if (previous) return previous.question;
  return null;
}

// ---------------------------------------------------------------------------
// The two spoken announcements. Both name the QUESTION, not just the row's
// author, for one mechanical reason (VERIFIER FINDING 3): the panel's ad hoc
// live region is `setAdhocAnnouncement(text)`, so setting an IDENTICAL string
// bails out of the re-render, the region's text node never changes, and
// assistive tech says nothing. Inserting two or three answers from one row is
// the designed flow, so an author-only string would be spoken once and then
// fall silent for exactly the interactions that follow.
// ---------------------------------------------------------------------------

/** Spoken after a successful Insert. */
export function insertedAnswerAnnouncement(
  item: Pick<PostQuestion, "question">,
  author: string
): string {
  return `Added the answer to "${clampQuestion(item.question)}" to the reply to ${author}.`;
}

/** Spoken after a successful Copy. */
export function copiedAnswerAnnouncement(item: Pick<PostQuestion, "question">): string {
  return `Copied the answer to "${clampQuestion(item.question)}".`;
}
