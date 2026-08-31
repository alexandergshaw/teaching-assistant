"use client";

// One row of the discussion-replies table. A React.memo child (AC39/section
// 12 "Set D also splits") - a controlled multiline TextField per row, with
// every row re-rendering on every keystroke because `rows` is one array in
// one hook, is visibly laggy past ~25 rows. For the memo to actually skip a
// re-render, the parent's row updaters (moveRow/editReply/removeRow/retryRow)
// must be stable useCallbacks and must return the identical object reference
// for every OTHER row - that discipline lives in C2 (useReplyRows.ts), not
// here; this file only assumes it holds.

import { memo, useState, useEffect, useRef } from "react";
import { Button, IconButton, TextField } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "./DiscussionRepliesPanel.module.css";
import { CopyIcon, CheckIcon } from "./discussion-icons";
import type { ReplyRow, ReplyRowState } from "./discussion-capture";

const COPY_RESET_MS = 1500;

const STATE_BADGE: Record<ReplyRowState, { label: string; variant: "ghBadgeNeutral" | "ghBadgeWarning" | "ghBadgeSuccess" | "ghBadgeDanger" }> = {
  pending: { label: "Waiting", variant: "ghBadgeNeutral" },
  drafting: { label: "Drafting", variant: "ghBadgeWarning" },
  ready: { label: "Ready", variant: "ghBadgeSuccess" },
  failed: { label: "Failed", variant: "ghBadgeDanger" },
};

function formatCapturedTime(firstSeenAt: number): string {
  // AC15: "-" when firstSeenAt is 0 - a malformed persisted row (AC22
  // deserializes a missing value to 0) must not render an epoch date.
  if (!firstSeenAt) return "-";
  return new Date(firstSeenAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export interface DiscussionReplyRowProps {
  row: ReplyRow;
  isFirst: boolean;
  isLast: boolean;
  onEditReply: (id: string, text: string) => void;
  /** BL3: one stable callback (the orchestrator's own `moveRow`, passed
   *  through unwrapped) rather than two inline arrows built fresh on every
   *  panel render - `(id) => moveRow(id, "up")` is a new function identity
   *  every time, which defeated this component's own React.memo on every
   *  row whenever the panel re-rendered (once a second while capturing,
   *  via elapsedSec). */
  onMove: (id: string, dir: "up" | "down") => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  /** AC19/modal-focus-restoration decision 5: a keyed ref map so focus after
   * a removal can move to the NEXT row's Remove button - never
   * document.body. Registered on both the armed and unarmed Remove button
   * (same key, same slot) so the ref always points at whichever one is
   * currently mounted. */
  registerRemoveRef: (id: string, el: HTMLButtonElement | null) => void;
  /** Routes one-off events (AC14's "Already first."/"Already last.", AC19's
   * remove-arming prompt, a clipboard failure) into the panel's single ad hoc
   * polite region - never a per-row live region, which is exactly the
   * "collapsing distinct failures" trap AC38 was written to avoid, just
   * relocated to a per-row scale instead of a per-notice one. */
  announce: (text: string) => void;
  /** S3/AC16: the copy-to-clipboard failure message's visible home - AC16
   *  requires it reach "the panel's error line, never into the icon slot",
   *  which `announce` alone (a visually-hidden live region) does not
   *  satisfy for a sighted user. Called ALONGSIDE `announce`, not instead
   *  of it - the polite announcement still fires for assistive tech. */
  onCopyError: (text: string) => void;
}

function DiscussionReplyRowImpl({
  row,
  isFirst,
  isLast,
  onEditReply,
  onMove,
  onRemove,
  onRetry,
  registerRemoveRef,
  announce,
  onCopyError,
}: DiscussionReplyRowProps) {
  // AC39: copy state is owned by the row, not threaded through the shared
  // `rows` array - a purely decorative 1500ms flag has no business forcing a
  // re-render of every OTHER row when one row's copy button is clicked.
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // AC19: "Remove" arms only when the row holds hand-written work
  // (row.userEdited) - re-scrolling to recapture a machine-read post costs
  // nothing to redo, prose the instructor typed does.
  const [removeArmed, setRemoveArmed] = useState(false);
  // Editing (or a fresh draft landing) invalidates a pending remove
  // confirmation - the thing it was armed to protect has changed under it.
  // "Adjust state during rendering" (React's own docs pattern, and this
  // repo's idiom - TaskAttachmentsDialog.tsx's wasOpen check) rather than a
  // useEffect that calls setState synchronously, which this repo's eslint
  // config rejects (react-hooks/set-state-in-effect).
  const [lastReplyForArm, setLastReplyForArm] = useState(row.reply);
  if (row.reply !== lastReplyForArm) {
    setLastReplyForArm(row.reply);
    if (removeArmed) setRemoveArmed(false);
  }

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const handleCopy = async () => {
    if (!row.reply) return;
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(row.reply);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      setCopied(true);
      // AC16: the repo's stale-timer guard, adapted to this row's own local
      // state (there is no shared id map at this scope - the row IS the
      // scope) - a second copy click restarts the window rather than letting
      // an earlier timer clear a later confirmation early.
      copyTimerRef.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // S3/AC16: both channels - the polite live region for assistive tech,
      // and the panel's visible error line for a sighted user. Neither
      // alone satisfies AC16.
      const message = "Could not copy automatically. Select the text in the reply box and copy it.";
      announce(message);
      onCopyError(message);
    }
  };

  const handleMoveUp = () => {
    // AC14: the boundary button stays focusable (aria-disabled, never
    // disabled) and its handler is a no-op that announces, rather than doing
    // nothing silently.
    if (isFirst) {
      announce("Already first.");
      return;
    }
    onMove(row.id, "up");
  };

  const handleMoveDown = () => {
    if (isLast) {
      announce("Already last.");
      return;
    }
    onMove(row.id, "down");
  };

  const handleRemoveClick = () => {
    if (row.userEdited && !removeArmed) {
      setRemoveArmed(true);
      announce(`Removing the reply to ${row.author} will lose what you wrote. Click Remove again to confirm.`);
      return;
    }
    setRemoveArmed(false);
    onRemove(row.id);
  };

  const badge = STATE_BADGE[row.state];
  const replyLabel = `Reply to ${row.author}`;

  return (
    <tr>
      <th scope="row">{row.author}</th>
      <td>{formatCapturedTime(row.firstSeenAt)}</td>
      <td>
        {/* AC15a, WCAG 2.1.1: a scrollable region must itself be a keyboard
            stop. This is a fixed-height scroller, deliberately NOT a
            three-line clamp with "Show more" - that pattern cost a click on
            nearly every row for the one column the feature exists to let the
            reader judge against, and expanding it reflowed the table mid-scan. */}
        <div className={panelStyles.postCell} tabIndex={0} aria-label={`Post by ${row.author}`}>
          {row.post}
        </div>
      </td>
      <td>
        <TextField
          value={row.reply}
          onChange={(e) => onEditReply(row.id, e.target.value)}
          // AC58: a placeholder, never rendered text - rendered text would
          // have to be cleared on focus and the box is editable either way.
          placeholder={row.state === "pending" ? "Waiting to draft - or write your own." : undefined}
          multiline
          minRows={6}
          fullWidth
          size="small"
          // AC15b, WCAG 4.1.2: an unlabeled MUI TextField renders an unnamed
          // textarea - <th scope="row"> names the ROW, not this control.
          slotProps={{ htmlInput: { "aria-label": replyLabel } }}
        />
      </td>
      <td>
        <span className={`${styles.ghBadge} ${styles[badge.variant]}`}>{badge.label}</span>
        {row.userEdited && (
          <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`} style={{ marginLeft: 4 }}>
            Yours
          </span>
        )}
        {/* AC17a: plain text, never role="alert" - a failed batch fails up to
            five rows at once and five assertive interruptions in a row is
            the exact defect this avoids. */}
        {row.state === "failed" && row.error && <p className={styles.error} style={{ marginTop: 6 }}>{row.error}</p>}
      </td>
      <td>
        <div className={styles.ghActions}>
          <IconButton
            size="small"
            onClick={() => void handleCopy()}
            disabled={!row.reply}
            title={copied ? "Copied" : `Copy the reply to ${row.author}`}
            // AC16: the aria-label is STABLE and does not change on copy - a
            // changing label on a focused button is not reliably announced.
            // The title and icon swap; the confirmation is spoken through
            // `announce`, not through this label.
            aria-label={`Copy the reply to ${row.author}`}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </IconButton>
          {row.state === "failed" && (
            <Button size="small" onClick={() => onRetry(row.id)}>
              Retry
            </Button>
          )}
          <Button
            size="small"
            aria-disabled={isFirst}
            onClick={handleMoveUp}
            aria-label={`Move the reply to ${row.author} up`}
            sx={isFirst ? { opacity: 0.5 } : undefined}
          >
            Move up
          </Button>
          <Button
            size="small"
            aria-disabled={isLast}
            onClick={handleMoveDown}
            aria-label={`Move the reply to ${row.author} down`}
            sx={isLast ? { opacity: 0.5 } : undefined}
          >
            Move down
          </Button>
          {/* AC19: two literal branches (not one Button with a ternary
              aria-label) so React reconciles them as updates to the SAME
              underlying element - no remount, no lost focus on arming.
              TaskAttachmentsDialog.tsx:571-598 is the precedent. */}
          {removeArmed ? (
            <Button
              size="small"
              color="error"
              ref={(el) => registerRemoveRef(row.id, el)}
              aria-label={`Confirm removal of the reply to ${row.author}`}
              onClick={handleRemoveClick}
              onBlur={() => setRemoveArmed(false)}
            >
              Confirm
            </Button>
          ) : (
            <Button
              size="small"
              color="error"
              ref={(el) => registerRemoveRef(row.id, el)}
              aria-label={`Remove the reply to ${row.author}`}
              onClick={handleRemoveClick}
            >
              Remove
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default memo(DiscussionReplyRowImpl);
