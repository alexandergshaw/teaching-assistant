// Pure helpers for DiscussionReplyQuestions.tsx, kept in a plain .ts file
// specifically so they have a test surface at all - vitest in this repo is
// node-env and collects only src/**/*.test.ts, never .test.tsx, so nothing
// declared inline inside the component itself is ever exercised by a test
// (the same reason discussion-reply-controls.ts exists as a sibling file for
// DiscussionReplyControls.tsx - see that file's own header).
//
// docs/answers-in-the-reply-acceptance-criteria.md A4 (GROUP C): this leaf
// owns QUESTION_BADGE_LABELS, questionBadgeLabel, questionAnswerDisplay (the
// state table below), the two remaining aria-name builders and
// neighbourQuestionAfterRemove. Imports only `type PostQuestion` and
// `truncateWithMarker` from the leaf (src/lib/discussion-reply-prompt.ts) -
// the 60-char aria clamp is ONE implementation (truncateWithMarker), never
// restated here, per docs/post-questions-acceptance-criteria.md Q1's "one set
// restated in four modules" lesson.
//
// D5: `insertAnswerAriaLabel` and `insertedAnswerAnnouncement` are DELETED
// end to end along with the Insert control itself - see the AC's section 2
// D5 for why Insert cannot be kept even as a fallback (its safety rested on
// a standalone-answer-paragraph rule this feature removes from the prompt).

import type { PostQuestion } from "@/lib/discussion-reply-prompt";
import { truncateWithMarker } from "@/lib/discussion-reply-prompt";

/** Q10: the block's own copy-confirmation reset delay, exported so its own
 *  test can pin the value without restating it. */
export const COPY_RESET_MS = 1500;

/** Q7 (from the block, per section 5's decision): "in the reply box" (the
 *  row's own CLIPBOARD_FAILURE_MESSAGE, DiscussionReplyRow.tsx) is false
 *  here - Copy never touches the reply textarea. Exported so the block's own
 *  test can pin the message text. */
export const ANSWER_CLIPBOARD_FAILURE_MESSAGE = "Could not copy automatically. Select the answer text and copy it.";

/** A4: the one badge vocabulary for this block - "Asked"/"Implied" (line 1,
 *  keyed on `item.implied`), "Needs you" (the orthogonal course-fact gap,
 *  warning-toned), and the two new answer-location states "In the reply" /
 *  "Not in the reply" (both neutral - hand-deleting an answer out of a draft
 *  reply is a supported workflow, never badged as a problem). One table,
 *  never a second. */
export const QUESTION_BADGE_LABELS = {
  asked: "Asked",
  implied: "Implied",
  needsYou: "Needs you",
  inReply: "In the reply",
  notInReply: "Not in the reply",
} as const;

/** Line 1's badge text - "Asked" or "Implied" depending on `item.implied`,
 *  never anything else. */
export function questionBadgeLabel(item: Pick<PostQuestion, "implied">): string {
  return item.implied ? QUESTION_BADGE_LABELS.implied : QUESTION_BADGE_LABELS.asked;
}

/** A4's state table, extracted as a pure function so it has a test surface
 *  (vitest here renders no component - see this file's own header). Takes
 *  the two booleans the component derives per item (`item.answer !== ""`,
 *  and `replyContainsAnswer(reply, item.answer)` from
 *  `@/lib/discussion-answer-location`) rather than `PostQuestion` and the
 *  live reply text directly, so this leaf never needs to import the
 *  predicate itself - the component computes `inReply` and hands in the
 *  result, keeping "is this answer in this reply" a single implementation
 *  (D3) with a single call site.
 *
 *  Deliberately independent of `needsYou`: that badge is orthogonal (renders
 *  whenever `item.needsYou` is non-empty, regardless of this table's
 *  result) and is rendered directly by the component, not through this
 *  function. */
export interface QuestionAnswerDisplay {
  /** The answer-location badge label, or null when `hasAnswer` is false and
   *  this column renders nothing at all. */
  badgeLabel: string | null;
  /** Whether to render the answer text paragraph (`panelStyles.answerText`). */
  showAnswerText: boolean;
  /** Whether to render the Copy control. */
  showCopy: boolean;
}

export function questionAnswerDisplay(hasAnswer: boolean, inReply: boolean): QuestionAnswerDisplay {
  if (!hasAnswer) return { badgeLabel: null, showAnswerText: false, showCopy: false };
  if (inReply) return { badgeLabel: QUESTION_BADGE_LABELS.inReply, showAnswerText: false, showCopy: false };
  return { badgeLabel: QUESTION_BADGE_LABELS.notInReply, showAnswerText: true, showCopy: true };
}

/** The 60-char clamp, applied consistently to every accessible name below
 *  AND to the Copy announcement (see the foot of this file) - visible text
 *  (the question span) is NEVER clamped; only what assistive tech reads or
 *  speaks is.
 *
 *  EXPORTED so the block never re-spells `truncateWithMarker(item.question,
 *  60)` inline, which would put the 60 in two places and leave that string
 *  with no test surface. */
export function clampQuestion(question: string): string {
  return truncateWithMarker(question, 60);
}

/** `Copy the answer to "${clamp}"` - no author name, matching the original
 *  Q11 spec (the Copy control names only the question, unlike Remove). */
export function copyAnswerAriaLabel(item: Pick<PostQuestion, "question">): string {
  return `Copy the answer to "${clampQuestion(item.question)}"`;
}

/** A4: `Remove the question "${clamp}" from the list for the reply to
 *  ${author}` - one word changed from the original ("from the reply to")
 *  since removal has never touched the reply text, and in the "In the
 *  reply" state the old wording implied that it does. */
export function removeQuestionAriaLabel(item: Pick<PostQuestion, "question">, author: string): string {
  return `Remove the question "${clampQuestion(item.question)}" from the list for the reply to ${author}`;
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
// The one remaining spoken announcement (Copy - Insert's own announcement is
// deleted with the rest of D5). Lives here (not inline in the .tsx) so it HAS
// a test surface - vitest here is node-env and renders no component, so a
// string built inside DiscussionReplyQuestions.tsx is never exercised by
// anything.
//
// The property that matters is not the wording, it is that two DIFFERENT
// questions in the SAME row produce two DIFFERENT strings: the panel's live
// region is `setAdhocAnnouncement(text)`, so setting an IDENTICAL string
// bails out of the re-render, the region's text node never changes, and
// assistive tech says nothing. Copying two or three answers from one row is
// a reachable flow, so a string with no question in it would be spoken once
// and then fall silent for exactly the interactions that follow.
// ---------------------------------------------------------------------------

/** Spoken after a successful Copy. */
export function copiedAnswerAnnouncement(item: Pick<PostQuestion, "question">): string {
  return `Copied the answer to "${clampQuestion(item.question)}".`;
}
