"use client";

// One logical row of the message-replies table, rendered as TWO <tr>s -
// docs/message-replies-acceptance-criteria.md M13 (section 7), mirroring
// DiscussionReplyRow.tsx's own header-bar-plus-continuation-row shape (see
// that file's own header for the shared React.memo discipline: every row
// updater the panel passes down must be a stable reference or this memo
// never bites). M14's action cluster (Copy reply, Save as draft, Send,
// Redraft, the hover-reveal move pair, the More menu) lives in the sibling
// MessageThreadRowActions.tsx, split out from the start per the AC's own
// budget note ("the discussion row is 914 lines").
//
// Two real differences from the discussion row, both from M13 itself:
// - Five columns, not six: First / Last / SUBJECT / Status / Actions -
//   "Captured" is gone, replaced by a sortable Subject column (M18).
// - The continuation row holds the WHOLE thread (oldest-first, each message
//   preceded by its own `sender - sentAt` meta line) in the post block's
//   existing fixed-height scroller, not a single post - messages before the
//   latest incoming collapse into a <details>, and only the latest incoming
//   itself renders at full (--text-primary) strength.

import { memo, useEffect, useRef } from "react";
import { TextField } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "../recording/DiscussionRepliesPanel.module.css";
import messageStyles from "./MessageReplies.module.css";
import { visuallyHidden } from "../ui/visuallyHidden";
import { deriveReplyAuthorName, isGreetingDegradedForAuthor } from "@/lib/person-name";
import { openMessageDrafts } from "@/lib/drafts-nav";
import MessageThreadRowActions from "./MessageThreadRowActions";
import type { MessageThreadRow as MessageThreadRowData, MessageRowState, ThreadMessage } from "./message-serialization";

const UNKNOWN_LAST_NAME_MARK = "—";

/** First, Last, Subject, Status, Actions - kept as a constant so the header
 * bar's cell count and the continuation row's colSpan can never drift apart
 * (precedent: DISCUSSION_TABLE_COLUMN_COUNT, DiscussionReplyRow.tsx). */
export const MESSAGE_TABLE_COLUMN_COUNT = 5;

const STATE_BADGE: Record<MessageRowState, { label: string; variant: "ghBadgeNeutral" | "ghBadgeWarning" | "ghBadgeSuccess" | "ghBadgeDanger" }> = {
  pending: { label: "Waiting", variant: "ghBadgeNeutral" },
  drafting: { label: "Drafting", variant: "ghBadgeWarning" },
  ready: { label: "Drafted", variant: "ghBadgeNeutral" },
  failed: { label: "Failed", variant: "ghBadgeDanger" },
};

function formatCapturedTime(ms: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** M9's "the newest with fromMe === false", as an INDEX rather than the
 * message itself - message-thread.ts's own `latestIncoming` (imported by the
 * log leaf) returns the message, which is not enough here: this row needs to
 * know which entries come BEFORE it (the <details>-collapsed "earlier"
 * group) versus the entry itself and anything after it (M13: "only the
 * latest incoming is at --text-primary"). Exported so it has a real test
 * surface - this repo's node-env vitest never renders a component, but it
 * can import a plain function straight out of a .tsx file (the same idiom
 * SegmentedToggle.tsx's own `optionLabel`/`nextEnabledIndex` already use).
 * Rows are already ordered ascending by M9's own contract, so this is simply
 * the last entry with `fromMe === false`; -1 when every message is fromMe. */
export function latestIncomingIndex(messages: ReadonlyArray<ThreadMessage>): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!messages[i].fromMe) return i;
  }
  return -1;
}

function MessageLine({ message, dim }: { message: ThreadMessage; dim: boolean }) {
  const who = message.fromMe ? "You" : message.sender;
  return (
    <div className={dim ? messageStyles.threadEarlier : undefined}>
      <p className={styles.ghMeta}>{message.sentAt ? `${who} - ${message.sentAt}` : who}</p>
      <p>{message.text}</p>
    </div>
  );
}

export interface MessageThreadRowProps {
  row: MessageThreadRowData;
  isFirst: boolean;
  isLast: boolean;
  reorderDisabled: boolean;
  addressByName: boolean;
  /** M13's table-level "Show the whole thread" checkbox - this row's OWN
   *  <details open> state, re-seeded from the checkbox any time it changes
   *  (the `key` on the <details> below forces the element to remount with
   *  the new default rather than fighting a reader's mid-session click via a
   *  continuously controlled `open` prop). Fixes the hydration gap where a
   *  row's <details> did not exist yet the one time the old mount-only
   *  effect ran (a thread that started as a single message, then grew an
   *  "earlier" entry after the row's first commit), so a persisted
   *  thread-expand setting silently never reached it. */
  threadExpand: boolean;
  editReply: (id: string, text: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onRemove: (id: string) => void;
  onRedraft: (id: string) => void;
  onMarkHandled: (id: string) => void;
  onToggleHandled: (id: string) => void;
  onToggleSkip: (id: string) => void;
  saving: boolean;
  onSaveDraft: (id: string) => void;
  sending: boolean;
  // M17's failure text is read straight off row.sendError inside
  // MessageThreadRowActions.tsx (the row prop already carries it) - no
  // separate sendError prop threaded through this row.
  onSend: (id: string) => void;
  onCheckSent: (id: string) => void;
  registerRemoveRef: (id: string, el: HTMLButtonElement | null) => void;
  announce: (text: string) => void;
  onCopyError: (text: string) => void;
}

function MessageThreadRowImpl({
  row,
  isFirst,
  isLast,
  reorderDisabled,
  addressByName,
  threadExpand,
  editReply,
  onMove,
  onRemove,
  onRedraft,
  onMarkHandled,
  onToggleHandled,
  onToggleSkip,
  saving,
  onSaveDraft,
  sending,
  onSend,
  onCheckSent,
  registerRemoveRef,
  announce,
  onCopyError,
}: MessageThreadRowProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  // M13, merged: set this row's own <details open> default from the
  // table-level "Show the whole thread" checkbox BEFORE measuring scroll
  // height, then scroll to the bottom - opening/closing the details block
  // changes the scroller's content height, so scrolling first would measure
  // the wrong height. Mount-only (empty deps): the row is memoized and only
  // re-renders when its own props change, so this never fights a reader who
  // has scrolled the thread up, or toggled THIS row's own <summary> by hand,
  // mid-session. The `key` on <details> below (keyed to threadExpand) is
  // what makes a later table-level toggle reach a row whose <details> did
  // not exist yet the one time this effect could run (a thread that started
  // as a single message and only grew an "earlier" entry afterward) - a
  // fresh keyed element re-seeds `open` from the current threadExpand at
  // creation time, independent of when that creation happens.
  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = threadExpand;
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only default + one-time scroll, see comment above
  }, []);

  const badge = STATE_BADGE[row.state];
  const nameParts = deriveReplyAuthorName(row.student);
  const nameHintId = `msg-name-hint-${row.id}`;
  const greetingDegraded = isGreetingDegradedForAuthor(addressByName, row.student);
  const greetingHintId = `msg-greeting-hint-${row.id}`;

  const idx = latestIncomingIndex(row.messages);
  const earlierMessages = idx > 0 ? row.messages.slice(0, idx) : [];
  const visibleFromIndex = idx === -1 ? 0 : idx;
  const visibleMessages = row.messages.slice(visibleFromIndex);
  // M13: "when latestIncomingIndex === -1 (all fromMe) dim every message" -
  // with no incoming message at all, nothing earns --text-primary strength.
  const dimVisibleMessage = (i: number) => (idx === -1 ? true : i !== 0);

  // M13: the "Waiting" pending badge and the Answered badge both describe
  // the SAME row state when a pending thread was answered outside this tool
  // (e.g. by hand, in Canvas) before it was ever drafted - Answered replaces
  // Waiting rather than sitting beside it; every other state badge (Drafted,
  // Drafting, Failed) still renders alongside Answered.
  const showStateBadge = !(row.state === "pending" && row.answered);

  const summaryRowClassName = row.skipped ? `${panelStyles.summaryRow} ${panelStyles.rowSkipped}` : panelStyles.summaryRow;
  const bodyRowClassName = row.skipped ? `${panelStyles.bodyRow} ${panelStyles.rowSkipped}` : panelStyles.bodyRow;

  return (
    <>
      <tr className={summaryRowClassName}>
        <th scope="row" aria-describedby={greetingDegraded ? greetingHintId : undefined}>
          {nameParts.firstName}
          {greetingDegraded && (
            <>
              <span
                className={panelStyles.nameDerivedMark}
                title="Address by name is on, but no readable greeting name was found for this student - this reply will open with no greeting."
              >
                {" "}
                (no greeting)
              </span>
              <span id={greetingHintId} aria-hidden="true" style={visuallyHidden}>
                Address by name is on, but no readable greeting name was found for &quot;{row.student}&quot; - this
                reply will open with no greeting.
              </span>
            </>
          )}
        </th>
        <td aria-describedby={nameParts.source === "derived" ? nameHintId : undefined}>
          {nameParts.lastName === "" ? UNKNOWN_LAST_NAME_MARK : nameParts.lastName}
          {nameParts.source === "derived" && (
            <>
              <span className={panelStyles.nameDerivedMark} title={nameParts.correctionHint}>
                {" "}
                (derived)
              </span>
              <span id={nameHintId} aria-hidden="true" style={visuallyHidden}>
                {nameParts.correctionHint}
              </span>
            </>
          )}
        </td>
        <td>{row.subject.trim() || "(no subject)"}</td>
        <td>
          <span className={styles.ghBadges}>
            {showStateBadge && <span className={`${styles.ghBadge} ${styles[badge.variant]}`}>{badge.label}</span>}
            {row.sent ? (
              <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>{`Sent ${formatCapturedTime(row.sent.at)}`}</span>
            ) : row.handledAt !== undefined ? (
              <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>{`Copied ${formatCapturedTime(row.handledAt)}`}</span>
            ) : (
              row.userEdited && <span className={`${styles.ghBadge} ${styles.ghBadgeAccent}`}>Edited by you</span>
            )}
            {row.skipped && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Skipped</span>}
            {row.canvas && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>In Canvas</span>}
            {row.answered && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Answered</span>}
          </span>
          {row.savedDraft && (
            <p className={`${styles.ghMeta} ${panelStyles.metaTop}`}>
              Saved to drafts -{" "}
              <button type="button" className={styles.linkButton} onClick={openMessageDrafts}>
                Message Drafts
              </button>
            </p>
          )}
        </td>
        <td>
          <MessageThreadRowActions
            row={row}
            isFirst={isFirst}
            isLast={isLast}
            reorderDisabled={reorderDisabled}
            saving={saving}
            onSaveDraft={onSaveDraft}
            sending={sending}
            onSend={onSend}
            onCheckSent={onCheckSent}
            onRedraft={onRedraft}
            onMove={onMove}
            onRemove={onRemove}
            onMarkHandled={onMarkHandled}
            onToggleHandled={onToggleHandled}
            onToggleSkip={onToggleSkip}
            registerRemoveRef={registerRemoveRef}
            announce={announce}
            onCopyError={onCopyError}
          />
        </td>
      </tr>

      <tr className={bodyRowClassName}>
        <td colSpan={MESSAGE_TABLE_COLUMN_COUNT}>
          <div className={panelStyles.rowBody}>
            <div className={panelStyles.postBlock}>
              <div className={panelStyles.blockHead}>
                <span className={styles.ghMeta}>Thread</span>
              </div>
              <div
                ref={scrollerRef}
                className={panelStyles.postCell}
                tabIndex={0}
                role="group"
                aria-label={`Thread with ${row.student}`}
              >
                {earlierMessages.length > 0 && (
                  <details key={threadExpand ? "open" : "closed"} ref={detailsRef} open={threadExpand}>
                    <summary>{`Earlier in this thread (${earlierMessages.length})`}</summary>
                    {row.omittedMessages > 0 && (
                      <p className={styles.ghMeta}>{`${row.omittedMessages} older messages were not kept.`}</p>
                    )}
                    {earlierMessages.map((m, i) => (
                      <MessageLine key={i} message={m} dim />
                    ))}
                  </details>
                )}
                {visibleMessages.map((m, i) => (
                  <MessageLine key={i} message={m} dim={dimVisibleMessage(i)} />
                ))}
              </div>
            </div>

            <div className={panelStyles.replyBlock}>
              {row.state === "drafting" && (
                <>
                  <div aria-hidden="true">
                    <span className={`${panelStyles.skeletonLine} ${panelStyles.skeletonLineLong}`} />
                    <span className={`${panelStyles.skeletonLine} ${panelStyles.skeletonLineMid}`} />
                    <span className={`${panelStyles.skeletonLine} ${panelStyles.skeletonLineShort}`} />
                  </div>
                  <p className={styles.fieldHint}>{`Drafting a reply to ${row.student}…`}</p>
                </>
              )}
              {row.state === "failed" && row.error && <p className={panelStyles.replyErrorText}>{row.error}</p>}
              <TextField
                value={row.reply}
                onChange={(e) => editReply(row.id, e.target.value)}
                placeholder={row.state === "pending" ? "Waiting to draft - or write your own." : undefined}
                multiline
                minRows={6}
                fullWidth
                size="small"
                slotProps={{ htmlInput: { "aria-label": `Reply to ${row.student}` } }}
              />
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

export default memo(MessageThreadRowImpl);
