"use client";

// One logical row of the discussion-replies table, rendered as TWO <tr>s -
// see docs/discussion-reply-capture-acceptance-criteria.md sections 6/16 and
// the reply-width UX pass note (scratchpad "reply-width-ux.md"): a compact
// header bar (Name/Captured/Status/Actions) plus a full-width `colSpan`
// continuation row holding the post and the reply side by side, always
// open, no disclosure click. A React.memo child (AC39/section 12 "Set D
// also splits") - a controlled multiline TextField per row, with every row
// re-rendering on every keystroke because `rows` is one array in one hook,
// is visibly laggy past ~25 rows. For the memo to actually skip a
// re-render, the parent's row updaters (moveRow/editReply/removeRow/retryRow
// /onRetryResources/onRemoveResource) must be stable useCallbacks and must
// return the identical object reference for every OTHER row - that
// discipline lives in C2 (useReplyRows.ts) and R-D (useReplyResources.ts),
// not here; this file only assumes it holds.
//
// AC15 amendment (reply-width UX pass): the six-column layout drops to four
// (Name, Captured, Status, Actions) plus this full-width continuation row -
// `<th scope="col">Post` and `<th scope="col">Reply` are deleted from the
// panel's <thead>, since a column header with no cells beneath it is a lie
// to a screen reader. Nothing is lost: both controls already carry their
// own accessible name (`Post by ${author}`, `Reply to ${author}`), which is
// stronger than a column header because it names the subject too.

import { memo, useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { Button, IconButton, TextField } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "./DiscussionRepliesPanel.module.css";
import { CopyIcon, CheckIcon, ArrowUpIcon, ArrowDownIcon, CloseIcon } from "./discussion-icons";
import { replyClipboardText, type ReplyRow, type ReplyRowState } from "./discussion-capture";
import { RESOURCE_KIND_LABELS } from "@/lib/resource-kind";

const COPY_RESET_MS = 1500;

/** Name, Captured, Status, Actions - kept as a constant so the header bar's
 * cell count and the continuation row's colSpan can never drift apart.
 * Precedent: AUTOMATION_TABLE_COLUMN_COUNT in
 * ../workflows/AutomationRow.tsx:40. */
export const DISCUSSION_TABLE_COLUMN_COUNT = 4;

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
  /** docs/discussion-reply-resources-acceptance-criteria.md R9/R11: per-row
   *  retry after a failed resource search. */
  onRetryResources: (id: string) => void;
  /** R10: one-click remove per resource link. */
  onRemoveResource: (id: string, url: string) => void;
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

const CLIPBOARD_FAILURE_MESSAGE = "Could not copy automatically. Select the text in the reply box and copy it.";

function DiscussionReplyRowImpl({
  row,
  isFirst,
  isLast,
  onEditReply,
  onMove,
  onRemove,
  onRetry,
  onRetryResources,
  onRemoveResource,
  registerRemoveRef,
  announce,
  onCopyError,
}: DiscussionReplyRowProps) {
  // AC39: copy state is owned by the row, not threaded through the shared
  // `rows` array - a purely decorative 1500ms flag has no business forcing a
  // re-render of every OTHER row when one row's copy button is clicked.
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reply-width UX pass, section 5d target #3: "Copy post" is independent
  // row-local state - a second useState, not shared with `copied` above, or
  // copying the post would clear the reply's own confirmation.
  const [postCopied, setPostCopied] = useState(false);
  const postCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (postCopyTimerRef.current) clearTimeout(postCopyTimerRef.current);
    },
    []
  );

  // F6 fix: removing a resource link used to drop focus to <body> - forbidden
  // outright by docs/modal-focus-restoration-acceptance-criteria.md AC2, and
  // this same file already solves the identical problem for ROW removal
  // (registerRemoveRef + the panel's own keyed-ref useLayoutEffect,
  // DiscussionRepliesPanel.tsx:318-341). This mirrors that pattern at
  // resource scope, scoped to this row's own resource list (resources are
  // row-local, so this does not need to live in the panel): a keyed ref map
  // by url, a pending-focus intent set synchronously in the click handler
  // BEFORE the removal is dispatched, and a deps-less useLayoutEffect (runs
  // after every render, same as the panel's) that applies it once and clears
  // it. Falls back to the reply textarea - which always survives a resource
  // removal, unlike the row itself on a row removal - rather than a
  // container ref, per the reviewer's own recommendation.
  const resourceRemoveRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const pendingResourceFocusUrlRef = useRef<string | null>(null);
  const pendingResourceFocusFallbackRef = useRef(false);
  const replyInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  const registerResourceRemoveRef = useCallback((url: string, el: HTMLButtonElement | null) => {
    if (el) resourceRemoveRefs.current.set(url, el);
    else resourceRemoveRefs.current.delete(url);
  }, []);

  useLayoutEffect(() => {
    const targetUrl = pendingResourceFocusUrlRef.current;
    const wantsFallback = pendingResourceFocusFallbackRef.current;
    pendingResourceFocusUrlRef.current = null;
    pendingResourceFocusFallbackRef.current = false;
    if (!targetUrl && !wantsFallback) return;
    const next = targetUrl ? resourceRemoveRefs.current.get(targetUrl) : null;
    if (next) next.focus();
    else replyInputRef.current?.focus();
  });

  const handleRemoveResource = (url: string) => {
    const list = row.resources ?? [];
    const idx = list.findIndex((r) => r.url === url);
    const fallback = list[idx + 1] ?? list[idx - 1] ?? null;
    if (fallback) {
      pendingResourceFocusUrlRef.current = fallback.url;
    } else {
      // No neighbouring resource - the whole <ul> unmounts. Fall back to the
      // reply textarea rather than dropping focus to <body>.
      pendingResourceFocusFallbackRef.current = true;
    }
    onRemoveResource(row.id, url);
  };

  const handleCopy = async () => {
    // R9a: a row whose draft failed but whose resources landed still has
    // something to copy - the guard is "nothing to copy", not "no reply".
    const text = replyClipboardText(row);
    if (!text) return;
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
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
      announce(CLIPBOARD_FAILURE_MESSAGE);
      onCopyError(CLIPBOARD_FAILURE_MESSAGE);
    }
  };

  const handleCopyPost = async () => {
    if (!row.post) return;
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(row.post);
      if (postCopyTimerRef.current) clearTimeout(postCopyTimerRef.current);
      setPostCopied(true);
      postCopyTimerRef.current = setTimeout(() => setPostCopied(false), COPY_RESET_MS);
    } catch {
      announce(CLIPBOARD_FAILURE_MESSAGE);
      onCopyError(CLIPBOARD_FAILURE_MESSAGE);
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
  const canCopyReply = !!row.reply || !!row.resources?.length;

  return (
    <>
      {/* --- the header bar: Name / Captured / Status / Actions --- */}
      <tr className={panelStyles.summaryRow}>
        <th scope="row">{row.author}</th>
        <td>{formatCapturedTime(row.firstSeenAt)}</td>
        <td>
          <span className={`${styles.ghBadge} ${styles[badge.variant]}`}>{badge.label}</span>
          {row.userEdited && (
            <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`} style={{ marginLeft: 4 }}>
              Yours
            </span>
          )}
          {/* AC17a: plain text, never role="alert" - a failed batch fails up
              to five rows at once and five assertive interruptions in a row
              is the exact defect this avoids. */}
          {row.state === "failed" && row.error && (
            <p className={styles.error} style={{ marginTop: 6 }}>
              {row.error}
            </p>
          )}
        </td>
        <td>
          <div className={`${styles.ghActions} ${panelStyles.rowActions}`}>
            {/* Reply-width UX pass, section 5b/5d target #1: the PRIMARY
                export, first in the cluster, icon + a PERMANENT visible
                label that never swaps (only the icon and title swap). */}
            <Button
              size="small"
              variant="outlined"
              startIcon={copied ? <CheckIcon /> : <CopyIcon />}
              onClick={() => void handleCopy()}
              disabled={!canCopyReply}
              title={copied ? "Copied" : `Copy reply to ${row.author}`}
              // WCAG 2.5.3 Label in Name amendment to AC16: the visible
              // label "Copy reply" must be a substring of the accessible
              // name, in order - the shipped "Copy the reply to X" did not
              // contain it. aria-label is STABLE and does not change on
              // copy; only the icon and title swap, and the confirmation is
              // spoken through `announce`.
              aria-label={`Copy reply to ${row.author}`}
            >
              Copy reply
            </Button>
            {row.state === "failed" && (
              // AC17/AC63 amendment: renamed from "Retry" to "Retry draft"
              // to disambiguate from the resources group's "Retry links"
              // below - two controls in one row must not share a visible
              // label.
              <Button size="small" onClick={() => onRetry(row.id)}>
                Retry draft
              </Button>
            )}
            {/* Section 5b: Move up/down become icon-only IconButtons to free
                ~180px for Copy reply to go first. aria-disabled (never
                disabled) and the tab-order rule survive verbatim. */}
            <IconButton
              size="small"
              aria-disabled={isFirst}
              onClick={handleMoveUp}
              title="Move up"
              aria-label={`Move the reply to ${row.author} up`}
              sx={isFirst ? { opacity: 0.5 } : undefined}
            >
              <ArrowUpIcon />
            </IconButton>
            <IconButton
              size="small"
              aria-disabled={isLast}
              onClick={handleMoveDown}
              title="Move down"
              aria-label={`Move the reply to ${row.author} down`}
              sx={isLast ? { opacity: 0.5 } : undefined}
            >
              <ArrowDownIcon />
            </IconButton>
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

      {/* --- the continuation row: full width, ALWAYS open, no disclosure
          click. Post and reply side by side in a CSS grid; resources render
          beneath the reply, never inside the textbox. --- */}
      <tr className={panelStyles.bodyRow}>
        <td colSpan={DISCUSSION_TABLE_COLUMN_COUNT}>
          <div className={panelStyles.rowBody}>
            <div className={panelStyles.postBlock}>
              <div className={panelStyles.blockHead}>
                <span className={styles.ghMeta}>Post</span>
                {/* Section 5d target #3: icon-only is correct here - it has
                    no competition for meaning inside the post block, it is
                    secondary to the reply, and the labelled Copy reply
                    button sits a few pixels away in the row above, which
                    teaches the glyph. */}
                <IconButton
                  size="small"
                  onClick={() => void handleCopyPost()}
                  disabled={!row.post}
                  title={postCopied ? "Copied" : "Copy post"}
                  aria-label={`Copy the post by ${row.author}`}
                >
                  {postCopied ? <CheckIcon /> : <CopyIcon />}
                </IconButton>
              </div>
              {/* AC15a, WCAG 2.1.1: a scrollable region must itself be a
                  keyboard stop. Fixed-height scroller, deliberately NOT a
                  three-line clamp with "Show more".
                  F3 fix: a bare <div> has an implicit role="generic", and
                  ARIA prohibits naming a generic element - aria-label here
                  was never exposed to a screen reader. role="group" gives
                  it a role that DOES take an accessible name. This matters
                  because the panel's <thead> no longer has a "Post" column
                  header (deleted on the theory that this per-control name is
                  the stronger replacement) - for the reply textarea that
                  holds (slotProps.htmlInput puts the label on a real
                  <textarea>), but for this scroller it did not, until now. */}
              <div className={panelStyles.postCell} tabIndex={0} role="group" aria-label={`Post by ${row.author}`}>
                {row.post}
              </div>
            </div>

            <div className={panelStyles.replyBlock}>
              <TextField
                value={row.reply}
                onChange={(e) => onEditReply(row.id, e.target.value)}
                // AC58: a placeholder, never rendered text - rendered text
                // would have to be cleared on focus and the box is editable
                // either way.
                placeholder={row.state === "pending" ? "Waiting to draft - or write your own." : undefined}
                multiline
                minRows={6}
                fullWidth
                size="small"
                // AC15b, WCAG 4.1.2: an unlabeled MUI TextField renders an
                // unnamed textarea - <th scope="row"> names the ROW, not
                // this control.
                slotProps={{ htmlInput: { "aria-label": replyLabel } }}
                // F6: the fallback focus target when a resource removal has
                // no neighbouring resource to focus instead - this textarea
                // always survives a resource removal (unlike the row itself
                // on a row removal, whose own fallback is the panel's
                // actions container).
                inputRef={replyInputRef}
              />

              {/* docs/discussion-reply-resources-acceptance-criteria.md R10:
                  resources render beneath the reply, never inside the
                  textbox. */}
              {row.resourceState === "searching" && <p className={styles.fieldHint}>Finding resources...</p>}
              {row.resourceState === "failed" && (
                <p className={styles.error}>
                  {row.resourceError}{" "}
                  <button type="button" className={styles.linkButton} onClick={() => onRetryResources(row.id)}>
                    Retry links
                  </button>
                </p>
              )}
              {!!row.resources?.length && (
                <ul className={panelStyles.resourceList}>
                  {row.resources.map((r) => (
                    // F4 fix: stacked (badge/link/remove on one line, the
                    // note beneath) rather than .resourceItem's default
                    // single-line row - overridden inline rather than by
                    // adding a class to DiscussionRepliesPanel.module.css,
                    // which is out of this fixer pass's file set.
                    <li key={r.url} className={panelStyles.resourceItem} style={{ flexDirection: "column", alignItems: "stretch" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>{RESOURCE_KIND_LABELS[r.kind]}</span>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ minWidth: 0 }}>
                          {r.title}
                        </a>
                        {/* F6: keyed by url, mirroring registerRemoveRef's
                            row-scoped pattern above - the focus target after
                            THIS button unmounts. */}
                        <IconButton
                          size="small"
                          ref={(el) => registerResourceRemoveRef(r.url, el)}
                          aria-label={`Remove the link ${r.title} from the reply to ${row.author}`}
                          onClick={() => handleRemoveResource(r.url)}
                        >
                          <CloseIcon />
                        </IconButton>
                      </div>
                      {/* F4 fix: `note` is the one piece of evidence the
                          gathering pass produced for why this resource fits
                          THIS post (R3/AC R0-5) - it was gathered, persisted
                          and unit-tested but never rendered, leaving the
                          instructor's remove decision (R10) a coin flip on
                          the title alone. Reuses the existing fieldHint
                          style (already imported as `styles`) rather than
                          adding a class. Never copied to the clipboard -
                          replyClipboardText deliberately excludes it (R9b). */}
                      {r.note && (
                        <p className={styles.fieldHint} style={{ margin: 0 }}>
                          {r.note}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

export default memo(DiscussionReplyRowImpl);
