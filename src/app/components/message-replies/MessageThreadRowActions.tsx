"use client";

// Message replies (Manual > Recording > Message replies) - one row's action
// cluster (M14, docs/message-replies-acceptance-criteria.md section 7),
// split out of MessageThreadRow.tsx from the start (the AC's own budget:
// "the discussion row is 914 lines" - DiscussionReplyRow.tsx never split its
// actions cell into a sibling file, and this feature's row carries two
// controls (Send, Check) that file has no analogue for at all).
//
// Mirrors DiscussionReplyRow.tsx's own actions <td> content (copy, the
// hover-reveal reorder pair, the overflow More menu with its own two-click
// Remove arm) plus M14/M15/M16/M17's own additions: Save as draft, Send and
// Redraft as ConfirmArmButtons, and the M15/M16 hint paragraphs under the
// cell. "One armed control per row" (M14): a single `armed: "send" |
// "redraft" | "remove" | null` local to this component - the More menu's own
// Remove arm shares the SAME slot as Send/Redraft (rather than a second,
// independent `removeArmed` boolean), so arming any one of the three
// necessarily disarms the others; Send/Redraft are keyed by a signature
// (`JSON.stringify([row.id, kind, row.reply])`) through `isConfirmArmed` so
// any edit to `row.reply` (a hand edit, or a fresh draft landing) disarms
// them by construction, and Remove reuses the identical signature machinery
// for consistency even though nothing about `row.reply` bears on whether a
// remove is still the action the instructor meant.
//
// Redraft here is always armed, unlike the discussion sibling's own Redraft
// (which skips confirmation for a row with no userEdited/handledAt to lose):
// M14 pairs Redraft with Send under the same "one armed control per row"
// rule with no stated skip condition, and a redraft here also costs a live
// LLM call against a thread that may already be matched/saved/sent, unlike
// the discussion tool's own lower-stakes case.
//
// M15's "Not found"/"ambiguous" hints and M16's Save-as-draft gating both key
// off `row.matchOutcome`/`row.canvas` directly (message-canvas-match.ts's own
// per-row outcome, persisted on the row - see message-serialization.ts) -
// never a locally re-derived guess. `row.matchOutcome` is only ever set on an
// unmatched, non-preview row a match pass has actually examined, so no hint
// renders before that pass has run once; it is cleared the moment `canvas`
// is set (a matched row never carries a stale outcome).

import { useEffect, useRef, useState } from "react";
import { Button, IconButton, ListItemText, Menu, MenuItem } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "../recording/DiscussionRepliesPanel.module.css";
import controls from "../recording/RecordingControls.module.css";
import { CopyIcon, CheckIcon, ArrowUpIcon, ArrowDownIcon, MoreIcon } from "../recording/discussion-icons";
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
import { writeClipboardText } from "../ui/clipboard";
import { isConfirmArmed } from "../content-tab/modules/confirmArming";
import { messageClipboardText } from "./message-capture";
import type { MessageThreadRow } from "./message-serialization";

const COPY_RESET_MS = 1500;

const CLIPBOARD_FAILURE_MESSAGE = "Could not copy automatically. Select the text in the reply box and copy it.";

type ArmedKind = "send" | "redraft" | "remove";

function armSignature(rowId: string, kind: ArmedKind, reply: string): string {
  return JSON.stringify([rowId, kind, reply]);
}

export interface MessageThreadRowActionsProps {
  row: MessageThreadRow;
  isFirst: boolean;
  isLast: boolean;
  reorderDisabled: boolean;
  saving: boolean;
  onSaveDraft: (id: string) => void;
  sending: boolean;
  onSend: (id: string) => void;
  onCheckSent: (id: string) => void;
  onRedraft: (id: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onRemove: (id: string) => void;
  onMarkHandled: (id: string) => void;
  onToggleHandled: (id: string) => void;
  onToggleSkip: (id: string) => void;
  registerRemoveRef: (id: string, el: HTMLButtonElement | null) => void;
  announce: (text: string) => void;
  onCopyError: (text: string) => void;
}

export default function MessageThreadRowActions({
  row,
  isFirst,
  isLast,
  reorderDisabled,
  saving,
  onSaveDraft,
  sending,
  onSend,
  onCheckSent,
  onRedraft,
  onMove,
  onRemove,
  onMarkHandled,
  onToggleHandled,
  onToggleSkip,
  registerRemoveRef,
  announce,
  onCopyError,
}: MessageThreadRowActionsProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const closeMenu = () => setMenuAnchor(null);

  // M14: the one shared arm slot for Send/Redraft/Remove, keyed by a
  // signature that folds in `row.reply` - any edit changes the signature and
  // disarms by construction (isConfirmArmed's own "not a timer" discipline).
  // A single slot means arming any one of the three necessarily disarms
  // whichever of the others was armed, so at most one consequence paragraph
  // (or the Menu's own "Confirm removal" state) ever renders at a time.
  const [armed, setArmed] = useState<{ kind: ArmedKind; signature: string } | null>(null);
  const sendSignature = armSignature(row.id, "send", row.reply);
  const redraftSignature = armSignature(row.id, "redraft", row.reply);
  const removeSignature = armSignature(row.id, "remove", row.reply);
  const sendArmed = armed?.kind === "send" && isConfirmArmed(armed.signature, sendSignature);
  const redraftArmed = armed?.kind === "redraft" && isConfirmArmed(armed.signature, redraftSignature);
  const removeArmed = armed?.kind === "remove" && isConfirmArmed(armed.signature, removeSignature);

  const handleCopy = async () => {
    const text = messageClipboardText(row);
    if (!text) return;
    try {
      await writeClipboardText(text);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
      onMarkHandled(row.id);
      announce(`Copied the reply to ${row.student}.`);
    } catch {
      announce(CLIPBOARD_FAILURE_MESSAGE);
      onCopyError(CLIPBOARD_FAILURE_MESSAGE);
    }
  };

  const handleMoveUp = () => {
    if (reorderDisabled) {
      announce("Clear the status filter to reorder rows.");
      return;
    }
    if (isFirst) {
      announce("Already first.");
      return;
    }
    onMove(row.id, "up");
  };

  const handleMoveDown = () => {
    if (reorderDisabled) {
      announce("Clear the status filter to reorder rows.");
      return;
    }
    if (isLast) {
      announce("Already last.");
      return;
    }
    onMove(row.id, "down");
  };

  const removeConsequenceId = `msg-remove-consequence-${row.id}`;
  const removeConsequenceText = `Removing the thread with ${row.student} cannot be undone.`;
  const handleRemoveFromMenu = () => {
    if (!removeArmed) {
      setArmed({ kind: "remove", signature: removeSignature });
      announce(`${removeConsequenceText} Choose "Confirm removal" to proceed.`);
      return;
    }
    setArmed(null);
    closeMenu();
    onRemove(row.id);
  };

  const handleToggleHandledFromMenu = () => {
    closeMenu();
    onToggleHandled(row.id);
    announce(row.handledAt !== undefined ? `Cleared "handled" for the thread with ${row.student}.` : `Marked the thread with ${row.student} as handled.`);
  };

  const handleToggleSkipFromMenu = () => {
    closeMenu();
    onToggleSkip(row.id);
    announce(row.skipped ? `Unskipped the thread with ${row.student}.` : `Skipped the thread with ${row.student} - no reply needed.`);
  };

  const canCopyReply = !!row.reply;
  // M16: "enabled ONLY on a matched row with a non-empty reply ... a reply
  // draft without a numeric conversationId can never be posted." Also
  // excludes an already-sent row - Save/Send have nothing left to do once
  // the reply is confirmed sent.
  const canSaveOrSend = !!row.canvas && !!row.reply && !row.sent;
  const sendConsequenceId = `msg-send-consequence-${row.id}`;
  const redraftConsequenceId = `msg-redraft-consequence-${row.id}`;

  return (
    <>
      <div className={`${styles.ghActions} ${panelStyles.rowActions}`}>
        <Button
          size="small"
          variant="outlined"
          startIcon={copied ? <CheckIcon /> : <CopyIcon />}
          onClick={() => void handleCopy()}
          disabled={!canCopyReply}
          title={copied ? "Copied" : `Copy reply to ${row.student}`}
          aria-label={`Copy reply to ${row.student}`}
        >
          Copy reply
        </Button>
        <Button
          size="small"
          variant="outlined"
          loading={saving}
          loadingPosition="start"
          disabled={!canSaveOrSend}
          onClick={() => onSaveDraft(row.id)}
        >
          Save as draft
        </Button>
        <ConfirmArmButtons
          armed={sendArmed}
          idleLabel="Send"
          confirmLabel="Confirm send"
          tone="danger"
          idleVariant="outlined"
          disabled={!canSaveOrSend}
          loading={sending}
          loadingLabel="Sending…"
          onArm={() => setArmed({ kind: "send", signature: sendSignature })}
          onConfirm={() => {
            setArmed(null);
            onSend(row.id);
          }}
          onCancel={() => setArmed(null)}
          consequenceId={sendConsequenceId}
          idleAriaLabel={`Send the reply to ${row.student}`}
          confirmAriaLabel={`Confirm sending the reply to ${row.student}`}
        />
        <ConfirmArmButtons
          armed={redraftArmed}
          idleLabel="Redraft"
          confirmLabel="Confirm redraft"
          tone="warning"
          idleVariant="outlined"
          loading={row.state === "drafting"}
          loadingLabel="Redraft"
          onArm={() => setArmed({ kind: "redraft", signature: redraftSignature })}
          onConfirm={() => {
            setArmed(null);
            onRedraft(row.id);
          }}
          onCancel={() => setArmed(null)}
          consequenceId={redraftConsequenceId}
          idleAriaLabel={`Redraft the reply to ${row.student}`}
          confirmAriaLabel={`Confirm redraft for the reply to ${row.student}`}
        />
        <div className={panelStyles.hoverReveal}>
          <IconButton
            size="small"
            aria-disabled={isFirst || reorderDisabled}
            onClick={handleMoveUp}
            title="Move up"
            aria-label={`Move the thread with ${row.student} up`}
            sx={isFirst || reorderDisabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          >
            <ArrowUpIcon />
          </IconButton>
          <IconButton
            size="small"
            aria-disabled={isLast || reorderDisabled}
            onClick={handleMoveDown}
            title="Move down"
            aria-label={`Move the thread with ${row.student} down`}
            sx={isLast || reorderDisabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          >
            <ArrowDownIcon />
          </IconButton>
        </div>
        <IconButton
          size="small"
          ref={(el) => registerRemoveRef(row.id, el)}
          title="More actions"
          aria-label={`More actions for the thread with ${row.student}`}
          aria-haspopup="menu"
          aria-expanded={menuAnchor !== null}
          onClick={(e) => setMenuAnchor(e.currentTarget)}
        >
          <MoreIcon />
        </IconButton>
        <Menu
          anchorEl={menuAnchor}
          open={menuAnchor !== null}
          onClose={() => {
            closeMenu();
            if (armed?.kind === "remove") setArmed(null);
          }}
        >
          <MenuItem onClick={handleToggleSkipFromMenu}>{row.skipped ? "Unskip this thread" : "Skip - no reply needed"}</MenuItem>
          <MenuItem onClick={handleToggleHandledFromMenu}>{row.handledAt !== undefined ? "Clear handled" : "Mark as handled"}</MenuItem>
          <MenuItem onClick={handleRemoveFromMenu} sx={{ color: "var(--danger)" }} aria-describedby={removeArmed ? removeConsequenceId : undefined}>
            {removeArmed ? (
              <ListItemText primary="Confirm removal" secondary={<span id={removeConsequenceId}>{removeConsequenceText}</span>} />
            ) : (
              "Remove"
            )}
          </MenuItem>
          {removeArmed && <MenuItem onClick={() => setArmed(null)}>Cancel</MenuItem>}
        </Menu>
      </div>
      {sendArmed && (
        <p id={sendConsequenceId} role="status" aria-live="polite" className={controls.consequence}>
          {`This sends the reply to ${row.student} in Canvas. It cannot be undone.`}
        </p>
      )}
      {redraftArmed && (
        <p id={redraftConsequenceId} role="status" aria-live="polite" className={controls.consequence}>
          This replaces the current reply with a freshly drafted one.
        </p>
      )}
      {row.sendError && (
        <>
          <p className={styles.fieldHint}>{row.sendError}</p>
          <Button size="small" variant="outlined" loading={sending} onClick={() => onCheckSent(row.id)}>
            Check
          </Button>
        </>
      )}
      {row.matchOutcome === "none" && (
        <p className={styles.fieldHint}>Not found in your Canvas inbox - copy the reply and send it there yourself.</p>
      )}
      {row.matchOutcome === "ambiguous" && (
        <p className={styles.fieldHint}>More than one Canvas conversation matches this subject and student - reply in Canvas.</p>
      )}
    </>
  );
}
