"use client";

// docs/answers-in-the-reply-acceptance-criteria.md A4 (GROUP C): the third
// per-row output - the questions a post asks or implies, each shown with
// where its answer stands relative to the reply, or a "needs you" note
// naming a course fact only the instructor can supply. Mounted by
// DiscussionReplyRow.tsx, inside `panelStyles.replyBlock`, directly after the
// reply TextField and BEFORE <DiscussionReplyResources>.
//
// memo()-wrapped for the same reason DiscussionReplyResources.tsx is - every
// callback prop below is expected to be a STABLE reference from the row (a
// useCallback there), so this block does not re-render on every keystroke in
// the row's own reply textarea. `reply` itself IS a per-keystroke prop (A4),
// but recomputing this list's derived state against it is deliberately cheap
// (measured 0.27 ms/keystroke for 3 items, ~3,800 keystrokes/sec headroom
// before one frame budget) rather than memoised away with
// `useDeferredValue` or a debounce - see the AC's section 3 A4 for the full
// reasoning and section 8f for what that decision overturned.
//
// docs/post-questions-acceptance-criteria.md Q10/section 5 (architect+
// sabotage vs aesthetics decision): this block OWNS its own Remove-button
// focus restoration and its own clipboard call, rather than the row owning
// them the way it owns the resource list's equivalents - landing this in the
// row pushed it over the 960-line cap. The keyed-ref/pending-focus/
// deps-less-useLayoutEffect idiom below is the SAME one
// DiscussionReplyRow.tsx already uses for resource removal
// (registerResourceRemoveRef, :284-303) and DiscussionRepliesPanel.tsx uses
// for row removal - relocated one level down, not reinvented.
//
// Renders null when `questions` is empty/undefined - no heading (Q11
// section 5: the `<ul>`'s own aria-label is the accessibility half of that
// ask; the 16px block gap vs 12px item gap separates this list from the
// resources block visually), no empty state, no reserved space. Still
// mounted either way (the row always renders this component) - its hooks
// keep running so a pending focus-fallback intent set just before the LAST
// item's own Remove click still finds somewhere to land once this renders
// null on the next commit.

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, IconButton } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "./DiscussionRepliesPanel.module.css";
import { CloseIcon } from "./discussion-icons";
import { writeClipboardText } from "../ui/clipboard";
import type { PostQuestion } from "@/lib/discussion-reply-prompt";
import { replyContainsAnswer } from "@/lib/discussion-answer-location";
import {
  QUESTION_BADGE_LABELS,
  questionBadgeLabel,
  questionAnswerDisplay,
  copyAnswerAriaLabel,
  removeQuestionAriaLabel,
  neighbourQuestionAfterRemove,
  copiedAnswerAnnouncement,
  COPY_RESET_MS,
  ANSWER_CLIPBOARD_FAILURE_MESSAGE,
} from "./discussion-post-questions";

export interface DiscussionReplyQuestionsProps {
  /** For per-item accessible names ("Copy the answer to X", "Remove the
   *  question X from the list for the reply to Y") - the row's own
   *  `row.author`, passed as a plain string so an unrelated row's own state
   *  changing never defeats this component's memo. */
  authorName: string;
  questions: PostQuestion[] | undefined;
  /** A4: the row's own LIVE reply text. Read only - this block never writes
   *  to it. Drives `inReply` per item via `replyContainsAnswer` (D3's one
   *  predicate), never a stored flag, so the derivation survives an edit to
   *  the reply the instant it happens. */
  reply: string;
  /** Already bound to this row's id by the caller. */
  onRemoveQuestion: (question: string) => void;
  /** The row's own reply textarea - the fallback focus target after the
   *  last Remove click, since nothing is left in this block to focus. */
  focusReplyInput: () => void;
  /** The panel's single ad hoc polite region, forwarded unwrapped. */
  announce: (text: string) => void;
  /** The panel's visible error line, forwarded unwrapped - S3/AC16's "both
   *  channels" rule for a clipboard failure. */
  onCopyError: (text: string) => void;
}

function DiscussionReplyQuestionsImpl({
  authorName,
  questions,
  reply,
  onRemoveQuestion,
  focusReplyInput,
  announce,
  onCopyError,
}: DiscussionReplyQuestionsProps) {
  // Q10: this block's own copy confirmation - a SEPARATE local state from
  // the row's own `copied` (DiscussionReplyRow.tsx), since Copy here copies
  // the ANSWER, not the reply, and the two confirmations must be able to
  // show independently.
  const [copiedQuestion, setCopiedQuestion] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    []
  );

  // Q10: the block's own keyed Remove-button ref map (by `question`, the
  // same identity `removeQuestion(id, question)` filters on) and pending-
  // focus intent, relocated one level down from
  // DiscussionReplyRow.tsx:284-303's resource-removal idiom - see that
  // file's own comment for the full account of why a deps-less
  // useLayoutEffect (runs after EVERY render, not just when a dependency
  // changes) is the right tool here rather than a normal effect: it must
  // still apply a pending intent on the render where this component's own
  // list just changed shape, and it must do nothing on every other render.
  //
  // A4/D5: this idiom is kept for REMOVE only. The pending-focus-fallback
  // intent that used to be set before `onInsertAnswer` ran is deleted along
  // with Insert itself - there is no longer a second control that can move
  // focus off this block.
  const removeRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const pendingFocusQuestionRef = useRef<string | null>(null);
  const pendingFocusFallbackRef = useRef(false);

  const registerRemoveRef = useCallback((question: string, el: HTMLButtonElement | null) => {
    if (el) removeRefs.current.set(question, el);
    else removeRefs.current.delete(question);
  }, []);

  useLayoutEffect(() => {
    const targetQuestion = pendingFocusQuestionRef.current;
    const wantsFallback = pendingFocusFallbackRef.current;
    pendingFocusQuestionRef.current = null;
    pendingFocusFallbackRef.current = false;
    if (!targetQuestion && !wantsFallback) return;
    const next = targetQuestion ? removeRefs.current.get(targetQuestion) : null;
    if (next) next.focus();
    else focusReplyInput();
  });

  // Q11 "Focus after Remove": the neighbour computed from the list as it
  // stood just before this removal - `questions` is still the pre-removal
  // array at the moment this handler runs.
  const handleRemove = (item: PostQuestion) => {
    const neighbour = neighbourQuestionAfterRemove(questions ?? [], item.question);
    if (neighbour !== null) pendingFocusQuestionRef.current = neighbour;
    else pendingFocusFallbackRef.current = true;
    onRemoveQuestion(item.question);
  };

  // Q7: Copy does NOT call onMarkHandled (handled means the reply went out)
  // and does NOT touch the row's own `copied` state - it leaves the item in
  // the list, sets only this block's own `copiedQuestion`, and announces
  // text naming the question so two consecutive copies in one row produce
  // DIFFERENT announce text (identical text to the panel's `setAdhocAnnouncement`
  // is a skipped render and nothing is spoken).
  const handleCopy = async (item: PostQuestion) => {
    try {
      await writeClipboardText(item.answer);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      setCopiedQuestion(item.question);
      copyTimerRef.current = setTimeout(() => setCopiedQuestion(null), COPY_RESET_MS);
      announce(copiedAnswerAnnouncement(item));
    } catch {
      // S3/AC16: both channels - the polite live region for assistive tech,
      // and the panel's visible error line for a sighted user.
      announce(ANSWER_CLIPBOARD_FAILURE_MESSAGE);
      onCopyError(ANSWER_CLIPBOARD_FAILURE_MESSAGE);
    }
  };

  // Q10: no heading, no empty state, no reserved space - a row with no
  // questions is byte-identical to today. This return sits AFTER every hook
  // above so the hooks themselves stay unconditional (the deps-less layout
  // effect above must still run on the render where the last item's own
  // Remove click empties this list, or its pending fallback intent would
  // never be applied).
  if (!questions || questions.length === 0) return null;

  return (
    // VERIFIER FINDING 2: `role="list"` is NOT redundant here. `.resourceList`
    // sets `list-style: none`, and WebKit strips list semantics from such a
    // list - taking the accessible name with it. Since section 5 traded the
    // visible heading away specifically because this aria-label would name
    // the block, losing it in Safari/VoiceOver would leave the questions and
    // the resources lists merged into one undifferentiated run of items.
    <ul
      role="list"
      className={`${panelStyles.resourceList} ${panelStyles.questionList}`}
      aria-label={`Questions in the post by ${authorName}`}
    >
      {questions.map((item) => {
        // A4: `inReply` is derived from the LIVE reply text on every render,
        // never stored - D2/D3. `questionAnswerDisplay` then turns the two
        // booleans into the state table's three render decisions (badge
        // text, answer text, Copy) as one pure, independently-tested call -
        // no per-item useMemo (illegal inside .map) and no debounce (A4:
        // perf was measured, not assumed).
        const hasAnswer = item.answer !== "";
        const inReply = hasAnswer && replyContainsAnswer(reply, item.answer);
        const display = questionAnswerDisplay(hasAnswer, inReply);
        return (
          <li key={item.question} className={`${panelStyles.resourceItem} ${panelStyles.resourceItemStacked}`}>
            <div className={`${panelStyles.resourceItem} ${panelStyles.resourceItemTop}`}>
              <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>{questionBadgeLabel(item)}</span>
              {display.badgeLabel && (
                // A4: both `In the reply` and `Not in the reply` are neutral
                // - hand-deleting an answer out of a drafted reply is a
                // supported workflow, never badged as a problem. Never
                // ghBadgeDanger, never ghBadgeAccent.
                <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>{display.badgeLabel}</span>
              )}
              <span className={styles.ghRowName}>{item.question}</span>
              {display.showCopy && (
                <Button
                  size="small"
                  variant="text"
                  style={{ minWidth: 0 }}
                  aria-label={copyAnswerAriaLabel(item)}
                  onClick={() => void handleCopy(item)}
                >
                  Copy
                </Button>
              )}
              <IconButton
                size="small"
                ref={(el) => registerRemoveRef(item.question, el)}
                title="Remove question"
                aria-label={removeQuestionAriaLabel(item, authorName)}
                onClick={() => handleRemove(item)}
              >
                <CloseIcon />
              </IconButton>
            </div>
            {display.showAnswerText && <p className={panelStyles.answerText}>{item.answer}</p>}
            {item.needsYou && (
              // A4: orthogonal to the answer-location column above - an item
              // can show `In the reply` (or `Not in the reply`) AND
              // `Needs you` together, since a partial answer and a course-
              // fact gap can both be true of the same question.
              <div className={`${panelStyles.resourceItem} ${panelStyles.resourceItemTop}`}>
                <span className={`${styles.ghBadge} ${styles.ghBadgeWarning}`}>{QUESTION_BADGE_LABELS.needsYou}</span>
                <p className={styles.fieldHint}>{item.needsYou}</p>
              </div>
            )}
            {copiedQuestion === item.question && <p className={`${styles.ghMeta} ${panelStyles.metaTight}`}>Copied the answer.</p>}
          </li>
        );
      })}
    </ul>
  );
}

export default memo(DiscussionReplyQuestionsImpl);
