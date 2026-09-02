"use client";

// One logical row of the discussion-replies table, rendered as TWO <tr>s -
// see docs/discussion-reply-capture-acceptance-criteria.md sections 6/16 and
// the reply-width UX pass note (scratchpad "reply-width-ux.md"): a compact
// header bar (First/Last/Captured/Status/Actions - First/Last per F6,
// docs/discussion-reply-sort-filter-acceptance-criteria.md section 4, which
// replaced the original single Name column) plus a full-width `colSpan`
// continuation row holding the post and the reply side by side, always open,
// no disclosure click. A React.memo child (AC39/section 12 "Set D also
// splits") - a controlled multiline TextField per row, with every row
// re-rendering on every keystroke because `rows` is one array in one hook,
// is visibly laggy past ~25 rows. For the memo to actually skip a
// re-render, the parent's row updaters (moveRow/editReply/removeRow/retryRow
// /onRetryResources/onRemoveResource) must be stable useCallbacks and must
// return the identical object reference for every OTHER row - that
// discipline lives in C2 (useReplyRows.ts) and R-D (useReplyResources.ts),
// not here; this file only assumes it holds.
//
// AC15 amendment (reply-width UX pass): the six-column layout drops to five
// (First, Last, Captured, Status, Actions - Name split into First/Last per
// F6 above) plus this full-width continuation row - `<th scope="col">Post`
// and `<th scope="col">Reply` are deleted from the panel's <thead>, since a
// column header with no cells beneath it is a lie to a screen reader.
// Nothing is lost: both controls already carry their own accessible name
// (`Post by ${author}`, `Reply to ${author}`), which is
// stronger than a column header because it names the subject too.

import { memo, useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { Button, IconButton, Menu, MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "./DiscussionRepliesPanel.module.css";
import { CopyIcon, CheckIcon, ArrowUpIcon, ArrowDownIcon, CloseIcon, MoreIcon } from "./discussion-icons";
import { replyClipboardText, type ReplyRow, type ReplyRowState, type ReplyResource } from "./discussion-capture";
import { RESOURCE_KIND_LABELS } from "@/lib/resource-kind";
// F1a/F2/F3 (docs/discussion-reply-sort-filter-acceptance-criteria.md section
// 3): the dependency-free name-split leaf. Read `person-name.ts`'s own header
// for why this lives outside the recording folder rather than in
// discussion-table-view.ts - importing it here does not reintroduce that
// cycle, since person-name.ts imports nothing back from this feature.
import { deriveReplyAuthorName, isGreetingDegradedForAuthor } from "@/lib/person-name";

const COPY_RESET_MS = 1500;

// F3/F7: the Last-name cell's display convention for an unknown surname
// (deriveReplyAuthorName sources "single" and "none", where `lastName` is
// ""). Deliberately NOT exported from person-name.ts, which is UI-agnostic
// by design (F1a) - and deliberately a fresh local constant rather than an
// import of repo-grades/repoGradeStudentName.ts's own UNKNOWN_LAST_NAME_MARK,
// per the reuse survey's "read, not imported" rule (that function lives in a
// different feature's component folder). Same glyph (em dash) by convention,
// not by shared code.
const UNKNOWN_LAST_NAME_MARK = "—";

// S2 fix (sort-filter review S3): `aria-describedby` must resolve to an
// element carrying the actual `correctionHint` text, not the "(derived)"
// marker's own visible text - a screen reader was announcing "derived",
// never the hint `person-name.ts` computes for every derived row (a
// capability that reached nobody). This is a fresh, tiny local copy of
// DiscussionRepliesPanel.tsx's `visuallyHidden` idiom rather than an
// import of it - that file already imports THIS one (DiscussionReplyRow),
// so importing back would be a module cycle; same "read, not imported"
// discipline this file already applies to UNKNOWN_LAST_NAME_MARK above.
//
// Sort-filter closure re-review SHOULD-2: the hint span this style is
// applied to sits INSIDE the `<td>` it describes (see the render below).
// `aria-describedby` only needs the target element to EXIST and be
// REFERENCEABLE by id - not to be visible - but a plain clip-hidden span
// left as ordinary cell content is still part of the cell's normal
// reading order: a screen reader walking through the row (not just the
// one moment it resolves the description) hits this ~35-word sentence as
// if it were regular text of the Last cell, on nearly every derived row.
// The render below therefore also sets `aria-hidden="true"` on the span
// itself: that pulls it out of the accessibility tree for ordinary
// browsing, while the accessible name/description computation algorithm
// (used to resolve `aria-describedby`) explicitly still reads the text of
// a DIRECTLY id-referenced node even when that node carries
// `aria-hidden="true"` - so the hint keeps reaching the sighted-mouse
// `title` and the description, and stops being narrated as if it were the
// cell's own content.
//
// `display: none` is NOT an alternative to the clip idiom below (there is
// no `.srOnly` class in this repo - see StagePanel.tsx's own clipped
// `role="status"` span for the precedent this copies): unlike
// `aria-hidden`, a `display: none` element is dropped from the
// accessibility tree outright in most browser/AT combinations, with no
// carve-out for a direct id reference, so `aria-describedby` would simply
// stop resolving and this whole fix would silently undo itself - the next
// person to "simplify" this to `display: none` would ship exactly that.
const visuallyHiddenHint: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** First, Last, Captured, Status, Actions - kept as a constant so the header
 * bar's cell count and the continuation row's colSpan can never drift apart.
 * Precedent: AUTOMATION_TABLE_COLUMN_COUNT in
 * ../workflows/AutomationRow.tsx:40. Bumped from 4 to 5 for F6: the single
 * "Name" header/cell splits into independent First/Last columns. */
export const DISCUSSION_TABLE_COLUMN_COUNT = 5;

// D2 (docs/aesthetics-pass-acceptance-criteria.md section 4b): the mapping
// was backwards. A machine-drafted, UNTOUCHED reply was rendering the
// loudest, greenest badge in the row ("Ready", ghBadgeSuccess) while
// hand-written prose - the higher-trust state - rendered quieter ("Yours",
// ghBadgeNeutral). Green now means "the instructor has actually copied this
// out" (the `handledAt` badge below, R10's ban on a green RESOURCE badge is
// unaffected - this is the instructor's own recorded action, not a claim
// about a link). `handledAt` deliberately does NOT enter this map - it is
// orthogonal to `state` exactly as `resourceState` already is, and renders as
// its own badge below, never folded into this lookup.
const STATE_BADGE: Record<ReplyRowState, { label: string; variant: "ghBadgeNeutral" | "ghBadgeWarning" | "ghBadgeSuccess" | "ghBadgeDanger" }> = {
  pending: { label: "Waiting", variant: "ghBadgeNeutral" },
  drafting: { label: "Drafting", variant: "ghBadgeWarning" },
  ready: { label: "Drafted", variant: "ghBadgeNeutral" },
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
  /** docs/reply-composition-controls-acceptance-criteria.md C1c-i (fixer
   *  pass, BLOCKER 2): the address-by-name toggle's CURRENT state
   *  (`composition.addressByName`), threaded down so this row can compute
   *  whether ITS OWN greeting was skipped. Only a boolean crosses this
   *  boundary - the row derives its own greeting name locally from
   *  `row.author` via `greetingNameFromAuthor`, the same leaf
   *  `discussion-draft-loop.ts` calls at dispatch time, so the marker can
   *  never drift from what dispatch actually decided. */
  addressByName: boolean;
  /** D3 mitigation (DiscussionReplyTable.tsx's own doc comment on the same
   *  prop has the full account): true whenever a status chip other than
   *  "All" is active. `moveRow` cannot see that filter, so reordering is
   *  refused rather than silently swapping against a hidden neighbour. */
  reorderDisabled: boolean;
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
  /** Resource-controls feature: one-click insert. A MOVE, not a copy - see
   *  useDiscussionReplies.ts's `insertResource` doc comment for the full
   *  reasoning. This row calls it and nothing else; the combined
   *  edit-then-remove is entirely that function's own responsibility. */
  onInsertResource: (id: string, resource: ReplyResource) => void;
  /** Resource-controls feature: per-row targeted search ("search for
   *  resources specific to that reply and its original message"). Shows its
   *  own pending/failed state through this row's existing `resourceState`
   *  rendering below - no separate UI state needed, and it never touches
   *  the table-wide resource queue (useReplyResources.ts's `searchRow` doc
   *  comment has the full account). */
  onSearchRow: (id: string) => void;
  /** D1 (docs/aesthetics-pass-acceptance-criteria.md section 4b): the
   *  moment a successful Copy reply set this row's `handledAt`, keyed by row
   *  id in a side table this file set owns entirely (see
   *  discussion-reply-flags.ts's header for why it is not a ReplyRow field
   *  in this build). `undefined` means "never copied out". */
  handledAt: number | undefined;
  /** D1: set optimistically on a successful Copy reply (handleCopy below). */
  onMarkHandled: (id: string) => void;
  /** D1: the per-row overflow menu's manual set/clear, for an instructor who
   *  pasted the reply from elsewhere. */
  onToggleHandled: (id: string) => void;
  /** D9: "this post doesn't need a reply" - reversible in one click, unlike
   *  Remove. */
  skipped: boolean;
  onToggleSkip: (id: string) => void;
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
  addressByName,
  reorderDisabled,
  onEditReply,
  onMove,
  onRemove,
  onRetry,
  onRetryResources,
  onRemoveResource,
  onInsertResource,
  onSearchRow,
  handledAt,
  onMarkHandled,
  onToggleHandled,
  skipped,
  onToggleSkip,
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
  // D5 (docs/aesthetics-pass-acceptance-criteria.md section 4b): Remove used
  // to arm ONLY when `row.userEdited` - a machine-drafted reply was one
  // unconfirmed click away from permanent deletion (it also deletes the
  // captured POST, not just the reply), with no undo, on a live board that
  // may have moved by the time the instructor re-scrolled to recapture it.
  // Arms for EVERY row now; the AC's stated rationale for the old asymmetry
  // ("re-scrolling costs nothing") is withdrawn as false at 30 posts on a
  // board that may no longer be open.
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

  // D5: the per-row overflow menu (Remove, plus D1's manual handled toggle
  // and D9's skip toggle) - TakesPanel.tsx's own per-take MUI Menu
  // (TakesPanel.tsx:4,208) is the idiom copied here.
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const closeMenu = useCallback(() => setMenuAnchor(null), []);

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

  // Resource-controls feature: one-click insert. Always falls back to the
  // reply textarea for focus afterward (never the next resource's own
  // Remove button, unlike handleRemoveResource above) - after inserting a
  // link into the reply, the natural next place for focus is the box that
  // just changed, not a sibling resource's own remove control.
  const handleInsertResource = (resource: ReplyResource) => {
    pendingResourceFocusFallbackRef.current = true;
    onInsertResource(row.id, resource);
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
      // D1: set optimistically on a successful copy.
      onMarkHandled(row.id);
      // D10: AC16 pins that the BUTTON's own text must not swap - only what
      // the CONFIRMATION says changes. `replyClipboardText` (D10's own
      // "leave the payload clean" rule) never gains the author's name - that
      // would be a name pasted straight into a Canvas composer (R9b) - so the
      // name only ever reaches the confirmation, never what actually lands
      // on the clipboard.
      announce(`Copied the reply to ${row.author}.`);
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
    // D3 mitigation: refuse rather than silently swap against a neighbour
    // the active status filter is hiding - see this row's own `reorderDisabled`
    // prop doc comment (and DiscussionReplyTable.tsx's matching one) for why.
    if (reorderDisabled) {
      announce("Clear the status filter to reorder rows.");
      return;
    }
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

  // D5: arms for EVERY row now (see the `removeArmed` doc comment above) and
  // lives behind the overflow menu - the first click swaps this MenuItem's
  // own label to "Confirm removal" and deliberately does NOT close the menu,
  // so the second click is still reachable without reopening anything. Any
  // OTHER way the menu closes (Escape, a backdrop click) disarms it, via the
  // Menu's own onClose below.
  const handleRemoveFromMenu = () => {
    if (!removeArmed) {
      setRemoveArmed(true);
      announce(`Removing the reply to ${row.author} cannot be undone. Choose "Confirm removal" to proceed.`);
      return;
    }
    setRemoveArmed(false);
    closeMenu();
    onRemove(row.id);
  };

  // D1: the overflow menu's manual set/clear - for an instructor who pasted
  // this reply from elsewhere and wants the table to reflect that.
  const handleToggleHandledFromMenu = () => {
    closeMenu();
    onToggleHandled(row.id);
    announce(handledAt !== undefined ? `Cleared "handled" for the reply to ${row.author}.` : `Marked the reply to ${row.author} as handled.`);
  };

  // D9: reversible in one click - the last reason an instructor destroyed a
  // captured post outright (Remove) was having no way to say "skip this one".
  const handleToggleSkipFromMenu = () => {
    closeMenu();
    onToggleSkip(row.id);
    announce(skipped ? `Unskipped the post by ${row.author}.` : `Skipped the post by ${row.author} - no reply needed.`);
  };

  const badge = STATE_BADGE[row.state];
  const replyLabel = `Reply to ${row.author}`;
  const canCopyReply = !!row.reply || !!row.resources?.length;

  // F3/F4: computed for DISPLAY (and, separately, for the sort key -
  // discussion-table-view.ts) from the raw `row.author` string every render -
  // never written back to the row. Cell text and sort key read this SAME
  // derivation (entry 361 N5 item 16), but the cell substitutes the em dash
  // for an unknown surname while the sort key stays "" (F3's deliberate
  // asymmetry, owned by the sort module, not this file).
  const nameParts = deriveReplyAuthorName(row.author);
  const nameHintId = `disc-name-hint-${row.id}`;

  // docs/reply-composition-controls-acceptance-criteria.md C1c-i (fixer
  // pass, BLOCKER 2): a degrade is a defect if it is invisible - a skipped
  // greeting must look different from a working one, or the instructor can
  // only find it by reading every reply. `isGreetingDegradedForAuthor` is a
  // plain exported function from person-name.ts (not inlined here) so its
  // condition has a real test surface in this repo's node-env vitest, which
  // renders no component - see that function's own doc comment for the
  // exact rule and person-name.test.ts for its oracle. It uses the SAME
  // leaf (`greetingNameFromAuthor`) `discussion-draft-loop.ts` calls at
  // dispatch time, so this row can never disagree with what was actually
  // sent to the model.
  const greetingDegraded = isGreetingDegradedForAuthor(addressByName, row.author);
  const greetingHintId = `disc-greeting-hint-${row.id}`;

  // D9: applied to BOTH <tr>s of one logical row - this component renders
  // two per row (the header bar and the full-width continuation), so a class
  // on only one would leave the row split visually between a dimmed half and
  // a full-strength half.
  const summaryRowClassName = skipped ? `${panelStyles.summaryRow} ${panelStyles.rowSkipped}` : panelStyles.summaryRow;
  const bodyRowClassName = skipped ? `${panelStyles.bodyRow} ${panelStyles.rowSkipped}` : panelStyles.bodyRow;

  return (
    <>
      {/* --- the header bar: First / Last / Captured / Status / Actions --- */}
      <tr className={summaryRowClassName}>
        <th scope="row" aria-describedby={greetingDegraded ? greetingHintId : undefined}>
          {nameParts.firstName}
          {/* C1c-i: the same visible-marker idiom as the "(derived)" surname
              mark below - a short visible label with a pointer `title`, plus
              an `aria-hidden` span carrying the full explanation that
              `aria-describedby` on this <th> resolves to for a screen
              reader. Deliberately plain text, not `role="alert"` - this is
              a standing state of the row, not an interruption. */}
          {greetingDegraded && (
            <>
              <span
                className={panelStyles.nameDerivedMark}
                title="Address by name is on, but no readable greeting name was found for this post - this reply will open with no greeting."
              >
                {" "}
                (no greeting)
              </span>
              <span id={greetingHintId} aria-hidden="true" style={visuallyHiddenHint}>
                Address by name is on, but no readable greeting name was found for the author of this post
                (&quot;{row.author}&quot;) - this reply will open with no greeting.
              </span>
            </>
          )}
        </th>
        {/* F7: a "derived" (guessed) surname carries a visible marker with
            the correction hint in BOTH a `title` (pointer/tooltip) and an
            `aria-describedby` pointing at the same marker's id (screen
            reader). An unknown surname ("single"/"none" - lastName === "")
            renders the em dash, never blank and never guessed. */}
        <td aria-describedby={nameParts.source === "derived" ? nameHintId : undefined}>
          {nameParts.lastName === "" ? UNKNOWN_LAST_NAME_MARK : nameParts.lastName}
          {nameParts.source === "derived" && (
            <>
              <span className={panelStyles.nameDerivedMark} title={nameParts.correctionHint}>
                {" "}
                (derived)
              </span>
              {/* S2 fix: the id `aria-describedby` points at now carries the
                  actual hint text, not the marker's own "(derived)" label -
                  see visuallyHiddenHint's own comment above. The visible
                  marker keeps its pointer-hover `title` for a sighted mouse
                  user and no longer needs an id of its own.
                  SHOULD-2 fix: `aria-hidden="true"` keeps this span out of
                  the cell's ordinary reading order (it must not be narrated
                  as if it were the Last cell's own content) while the
                  sibling `<td>`'s `aria-describedby` above still resolves
                  its text - see visuallyHiddenHint's comment for why that
                  is true for `aria-hidden` but would NOT be true for
                  `display: none`. */}
              <span id={nameHintId} aria-hidden="true" style={visuallyHiddenHint}>
                {nameParts.correctionHint}
              </span>
            </>
          )}
        </td>
        <td>{formatCapturedTime(row.firstSeenAt)}</td>
        <td>
          <span className={`${styles.ghBadge} ${styles[badge.variant]}`}>{badge.label}</span>
          {/* D2: green now means "the instructor has actually copied this
              reply out" - the highest-trust state, not the model's own
              untouched draft. Checked FIRST: a row can be both userEdited
              and handledAt-set (edited, then copied), and "copied" is the
              more complete fact of the two. */}
          {handledAt !== undefined ? (
            <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`} style={{ marginLeft: "var(--space-1)" }}>
              {`Copied ${formatCapturedTime(handledAt)}`}
            </span>
          ) : (
            row.userEdited && (
              <span className={`${styles.ghBadge} ${styles.ghBadgeAccent}`} style={{ marginLeft: "var(--space-1)" }}>
                Edited by you
              </span>
            )
          )}
          {/* D9: a post the instructor marked "no reply needed" - reversible
              via the overflow menu below. */}
          {skipped && (
            <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`} style={{ marginLeft: "var(--space-1)" }}>
              Skipped
            </span>
          )}
          {/* docs/discussion-thread-structure-acceptance-criteria.md T5/T1a:
              a badge beside the state badge ONLY when the position is the
              definite "reply" - ghBadgeNeutral, deliberately not
              ghBadgeSuccess (green would read as a judgement on the post,
              not a description of its place in the thread). "unknown" and
              absent BOTH render nothing here - never as if the post were
              known to be top-level. */}
          {row.threadPosition === "reply" && (
            <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`} style={{ marginLeft: "var(--space-1)" }}>
              Reply
            </span>
          )}
          {/* T5: a "Replying to X" line, ONLY when the LMS actually printed
              the name - never derived. Gated on `replyingToAuthor` ALONE,
              deliberately NOT also on `threadPosition === "reply"` like the
              badge above: a printed name is direct textual evidence (section
              1's HIGH-reliability cue), while threadPosition is a separate,
              weaker GEOMETRIC reading - a row can legitimately know WHO is
              being answered without a confident reading of WHETHER it is a
              reply. { threadPosition: "unknown", replyingToAuthor: "Diego
              Chen" } is a real, reachable state (T4a downgrades a root/reply
              contradiction to "unknown" on every ordinary re-read while
              clearing replyingToAuthor only on a genuine NAME conflict), and
              this line is meant to still render "Replying to Diego Chen"
              with no Reply badge in that case - not an oversight, so do not
              "fix" it by adding a threadPosition check here. */}
          {row.replyingToAuthor && (
            <p className={styles.ghMeta} style={{ marginTop: "var(--space-1)" }}>
              Replying to {row.replyingToAuthor}
            </p>
          )}
          {/* D8: the real failure reason moved OUT of this cell - see the
              reply block below. This narrow column was rendering it at
              styles.error's --font-size-lg, the loudest text in the row, in
              its narrowest column. The reason itself is unchanged (still the
              real provider message, never collapsed to a generic string -
              DEV_LOOP.md's own recorded regression on this exact point). */}
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
            {/* D5: Move up/down decongest into a hover/focus-reveal cluster
                (.hoverReveal, DiscussionRepliesPanel.module.css - the same
                recipe CoursesTable.module.css:300-389 uses for its own
                per-cell menu trigger, copied whole). Still icon-only
                IconButtons, still aria-disabled (never disabled), still
                after Copy reply in DOM order - only the reveal behaviour and
                the physical grouping are new. */}
            <div className={panelStyles.hoverReveal}>
              <IconButton
                size="small"
                aria-disabled={isFirst || reorderDisabled}
                onClick={handleMoveUp}
                title="Move up"
                aria-label={`Move the reply to ${row.author} up`}
                sx={isFirst || reorderDisabled ? { opacity: 0.5 } : undefined}
              >
                <ArrowUpIcon />
              </IconButton>
              <IconButton
                size="small"
                aria-disabled={isLast || reorderDisabled}
                onClick={handleMoveDown}
                title="Move down"
                aria-label={`Move the reply to ${row.author} down`}
                sx={isLast || reorderDisabled ? { opacity: 0.5 } : undefined}
              >
                <ArrowDownIcon />
              </IconButton>
            </div>
            {/* D5: Remove (plus D1's manual handled toggle and D9's skip
                toggle) moves behind a per-row overflow menu - the idiom is
                TakesPanel.tsx's own per-take MUI Menu (TakesPanel.tsx:4,208).
                The trigger itself is what `registerRemoveRef` now points at
                (the same generic "this row's remove-related focus target"
                contract the panel's keyed-ref focus restoration already
                expects - see DiscussionRepliesPanel.tsx's own comment on
                that map), since the actual Remove control only exists while
                the menu is open. */}
            <IconButton
              size="small"
              ref={(el) => registerRemoveRef(row.id, el)}
              aria-label={`More actions for the reply to ${row.author}`}
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
                // Any close OTHER than the confirm click itself (which
                // already resets this and closes the menu in
                // handleRemoveFromMenu) disarms a pending remove - Escape or
                // a backdrop click must not leave the NEXT open of this menu
                // silently pre-armed.
                setRemoveArmed(false);
              }}
            >
              <MenuItem onClick={handleToggleSkipFromMenu}>{skipped ? "Unskip this post" : "Skip - no reply needed"}</MenuItem>
              <MenuItem onClick={handleToggleHandledFromMenu}>{handledAt !== undefined ? "Clear handled" : "Mark as handled"}</MenuItem>
              <MenuItem onClick={handleRemoveFromMenu} sx={{ color: "var(--danger)" }}>
                {removeArmed ? "Confirm removal" : "Remove"}
              </MenuItem>
            </Menu>
          </div>
        </td>
      </tr>

      {/* --- the continuation row: full width, ALWAYS open, no disclosure
          click. Post and reply side by side in a CSS grid; resources render
          beneath the reply, never inside the textbox. --- */}
      <tr className={bodyRowClassName}>
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
              {/* D10: the transient confirmation sentence - reuses the same
                  `copied`/COPY_RESET_MS local state the icon swap already
                  keeps row-local (React.memo). The button's own text never
                  swaps (AC16); only this line and the icon do. */}
              {copied && (
                <p className={styles.ghMeta} style={{ margin: 0 }}>
                  {`Copied the reply to ${row.author}.`}
                </p>
              )}
              {/* D8: "Drafting" used to render an empty box - the placeholder
                  below is gated on state === "pending", so a drafting row
                  showed nothing at all. A skeleton (aria-hidden - decorative)
                  plus a real, screen-reader-visible caption. */}
              {row.state === "drafting" && (
                <>
                  <div aria-hidden="true">
                    <span className={panelStyles.skeletonLine} style={{ width: "92%" }} />
                    <span className={panelStyles.skeletonLine} style={{ width: "78%" }} />
                    <span className={panelStyles.skeletonLine} style={{ width: "55%" }} />
                  </div>
                  <p className={styles.fieldHint} style={{ margin: 0 }}>{`Drafting a reply to ${row.author}…`}</p>
                </>
              )}
              {/* D8: the real provider failure reason, relocated here from
                  the narrow Status cell (styles.error's --font-size-lg, the
                  loudest text in the row, in its narrowest column) - into the
                  reply block, at --font-size-md. The reason itself is
                  unchanged: still the real message, never a generic string
                  (AC17a's plain-text-not-role=alert treatment is unchanged
                  too - a failed batch can fail up to five rows at once). */}
              {row.state === "failed" && row.error && <p className={panelStyles.replyErrorText}>{row.error}</p>}
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

              {/* Resource-controls feature: per-row targeted search - "each
                  reply should also have a button to search for resources
                  specific to that reply and its original message". Shares
                  this row's own `resourceState` rendering below for its
                  pending/failed feedback (searching.../Retry links) rather
                  than a separate UI state - useReplyResources.ts's own
                  `searchRow` doc comment has the full account of why that is
                  safe (it uses the same
                  markResourceSearching/applyResources/markResourceFailed
                  mutators the bulk pass already does). Disabled while
                  ALREADY searching (bulk or per-row - both set the same
                  resourceState) to avoid a redundant concurrent dispatch. */}
              <Button
                size="small"
                variant="text"
                style={{ minWidth: 0, alignSelf: "flex-start" }}
                disabled={row.resourceState === "searching"}
                aria-label={`Search for resources for the reply to ${row.author}`}
                onClick={() => onSearchRow(row.id)}
              >
                Search for resources
              </Button>

              {/* docs/discussion-reply-resources-acceptance-criteria.md R10:
                  resources render beneath the reply, never inside the
                  textbox. */}
              {row.resourceState === "searching" && <p className={styles.fieldHint}>Finding resources…</p>}
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
                    // D11 (AM25, "one styling authority per element"): this
                    // used to be .resourceItem PLUS an inline style
                    // overriding that same class's flex-direction/align-items
                    // - two authorities on one element, on the grounds (a
                    // module out of a since-closed fixer pass's file set)
                    // that no longer apply now that this file owns
                    // DiscussionRepliesPanel.module.css directly.
                    // .resourceItemStacked composes with .resourceItem
                    // instead (F4's stacked layout - badge/link/remove on one
                    // line, the note beneath).
                    <li key={r.url} className={`${panelStyles.resourceItem} ${panelStyles.resourceItemStacked}`}>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
                        <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>{RESOURCE_KIND_LABELS[r.kind]}</span>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ minWidth: 0 }}>
                          {r.title}
                        </a>
                        {/* Resource-controls feature: one-click insert. A
                            MOVE (see onInsertResource's own doc comment) -
                            this button and its resource both disappear from
                            this list the moment it is clicked, which is what
                            makes a second click on the SAME resource
                            structurally impossible rather than merely
                            discouraged. Text label, not icon-only: "Insert"
                            has no standard, instantly-recognizable glyph in
                            this app's existing icon set. */}
                        <Button
                          size="small"
                          variant="text"
                          style={{ minWidth: 0 }}
                          aria-label={`Insert the link ${r.title} into the reply to ${row.author}`}
                          onClick={() => handleInsertResource(r)}
                        >
                          Insert
                        </Button>
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
