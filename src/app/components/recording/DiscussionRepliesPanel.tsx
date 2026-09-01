"use client";

// Manual > Recording > "Discussion replies" (AC1-AC4). This is the ONLY
// import from useDiscussionReplies.ts (set C3) - the panel takes exactly one
// prop, `active`, and owns no state of its own beyond arming, focus
// restoration and a couple of announcement helpers (AC39: what lives in D,
// not C3). See docs/discussion-reply-capture-acceptance-criteria.md sections
// 2, 6, 16 and AC7/AC7a/AC7b/AC14a-AC19a/AC36/AC39 - this file is built to
// that contract, against the pinned `UseDiscussionRepliesReturn` shape in
// section 12.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "./DiscussionRepliesPanel.module.css";
import { fmt } from "./types";
import { isConfirmArmed } from "../content-tab/modules/confirmArming";
import { tableClipboardText, draftingArmSignature } from "./discussion-capture";
import { copyAllButtonLabel, computeStoppedSessionSummary } from "./discussion-table-view";
import { CopyIcon, CheckIcon } from "./discussion-icons";
import { isFindMissingEligible, isResourceLaneBusy, resourceQueueProgressText } from "./useReplyResources";
import { useDiscussionReplies } from "./useDiscussionReplies";
// docs/DEV_LOOP.md's "every feature needs a downloadable log" rule
// (REGRESSION entries 369/372/373/374 record this surface's unpaid debt).
// This panel only formats/downloads - collection and assembly are entirely
// useDiscussionReplies.ts's `runLog` and discussion-replies-log.ts, per that
// module's own header. Mirrors
// src/app/components/drafted-grades/RepoGradingLogPanel.tsx's own split
// (that panel is a different, unrelated log - see this repo's
// src/lib/repo-grading-log.ts header) down to the download idiom:
// triggerFileDownload, never a hand-rolled object-URL dance.
import {
  formatDiscussionRepliesLogCsv,
  formatDiscussionRepliesLogJson,
  discussionRepliesLogFileName,
  discussionRepliesLogSummaryLine,
  summarizeDiscussionRepliesRunLog,
} from "./discussion-replies-log";
import { triggerFileDownload } from "../course-planning/utils";
// Extracted (pure move, no behaviour change) into its own file once this
// panel was pressing on the 1000-line ceiling enforced by
// recording-split.structure.test.ts - see that file's own header comment
// for exactly which subtree moved and why the `totalCount > 0` gate below
// stayed here rather than moving with it.
import DiscussionReplyTable from "./DiscussionReplyTable";
// docs/reply-composition-controls-acceptance-criteria.md JOB 1: the reply
// composition cluster (ingredients / address-by-name / formality),
// extracted into its own file rather than grown inline here - see that
// file's own header for why.
import DiscussionReplyControls from "./DiscussionReplyControls";
// F8/F9 fixes: neither needs a new field on UseDiscussionRepliesReturn (out
// of this fixer pass's file set) - useLlmProvider is a standalone reactive
// store read (docs/discussion-reply-resources-acceptance-criteria.md R4e),
// and isResourceLaneBusy is useReplyResources.ts's own already-exported,
// already-tested predicate, applied here to the SAME three booleans this
// panel already destructures from useDiscussionReplies below.
import { useLlmProvider } from "@/lib/llm-provider";

const DELETE_CONSEQUENCE_ID = "discussion-delete-table-consequence";
const REDRAFT_CONSEQUENCE_ID = "discussion-redraft-consequence";

// AC7a: the visible status row is aria-hidden (the elapsed timer ticking
// every second would otherwise announce ~240 times per capture and defeat
// this same throttle). There is no .srOnly class in this repo - the inline
// clip-rect object is the idiom (StagePanel.tsx:539-562).
const visuallyHidden: React.CSSProperties = {
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

function composeLiveSentence(args: {
  count: number;
  extracting: boolean;
  pendingFrames: number;
  stalled: boolean;
  capturing: boolean;
}): string {
  const { count, extracting, pendingFrames, stalled, capturing } = args;
  if (stalled) {
    return "Nothing new has been read off the screen for 30 seconds. Keep this app's tab visible in a second window while you scroll.";
  }
  if (!capturing) return "";
  const parts: string[] = [];
  parts.push(count === 0 ? "Capturing - 0 posts so far." : `${count} post${count === 1 ? "" : "s"} found.`);
  if (extracting) parts.push("Reading the screen...");
  if (pendingFrames > 0) parts.push("Catching up - scroll a little slower.");
  return parts.join(" ");
}

interface StoppedSummary {
  elapsedAtStop: number;
  found: number;
  drafted: number;
  failed: number;
}

function stoppedSummarySentence(s: StoppedSummary): string {
  const base = `Capture stopped after ${fmt(s.elapsedAtStop)}. Found ${s.found} post${s.found === 1 ? "" : "s"}, drafted ${s.drafted} repl${s.drafted === 1 ? "y" : "ies"}.`;
  if (s.failed === 0) return base;
  return `${base} ${s.failed} repl${s.failed === 1 ? "y" : "ies"} failed - use Retry on that row.`;
}

export default function DiscussionRepliesPanel({ active }: { active: boolean }) {
  const {
    audience,
    setAudience,
    courseId,
    setCourseId,
    courses,
    coursesLoading,
    coursesError,
    saveVideo,
    setSaveVideo,
    // docs/reply-composition-controls-acceptance-criteria.md C5/JOB1: fully
    // owned (persistence, coercion, arming) by useDiscussionReplies - this
    // panel only threads the object into DiscussionReplyControls and passes
    // its setter straight back as that component's onChange.
    composition,
    setComposition,
    // GAP 1 fix: the one visible signal that this run's drafts are using
    // the instructor's selected Knowledge Base pages as context - see the
    // standing hint rendered just above DiscussionReplyControls below.
    knowledgeContextLabel,
    recordingUrl,
    recordingBytes,
    capturing,
    elapsedSec,
    pendingFrames,
    droppedFrames,
    extracting,
    stalled,
    notices,
    dismissNotice,
    previewRef,
    start,
    stop,
    // CONFIRMED against useReplyRows.ts as landed by its owning set in this
    // same wave (that file and useDiscussionReplies.ts are both off limits
    // to this file - read only). Its own doc comments pin the contract this
    // panel is written against:
    //   - `rows` now means SORTED-AND-FILTERED-FOR-DISPLAY (a subset of the
    //     table whenever a filter is active) - NOT the unfiltered array it
    //     used to be. Every existing `rows`/`rows.length` read in this file
    //     that F11 requires to stay unfiltered has been repointed at
    //     `totalCount` below; every read that is genuinely about what is
    //     RENDERED (the table body, isFirst/isLast, the search box's own "N
    //     of total" numerator, the neighbour-lookup in handleRemove) keeps
    //     reading `rows`, which is exactly the visible array now.
    //   - `totalCount` is `rawRows.length` - the single unfiltered count F11
    //     requires every progress string, empty state and BOTH arming
    //     signatures to read, so a stale filter can never change what a
    //     confirmation names or silently truncate a "N posts found" line.
    //   - `moveRow` keeps its existing two-arg shape; F15's fix (swap
    //     against visible adjacency, `moveVisibleRow`) lives entirely inside
    //     the hook, which computes the visible id list itself from its own
    //     `filterTextRef` - this panel passes nothing new to it.
    // NOT YET forwarded by useDiscussionReplies.ts as of this write (its
    // return type still declares only the old `rows: ReplyRow[]`, unchanged
    // meaning in its own doc comment) - `filterText`/`setFilterText`/
    // `totalCount` below are the expected sibling-module tsc errors this
    // set's gate instructions call out, until that orchestrator file catches
    // up to useReplyRows.ts's already-landed contract.
    rows,
    // Fixer pass (sort-filter review, S2/root cause): the true UNFILTERED
    // row objects, forwarded now that useDiscussionReplies.ts exposes it -
    // see this panel's own `sessionStartIds`/`sessionRows` computation
    // below for the one place this file needs it.
    rawRows,
    filterText,
    setFilterText,
    totalCount,
    sort,
    setSort,
    moveRow,
    editReply,
    removeRow,
    retryRow,
    draftAllPending,
    redraftAll,
    clearTable,
    drafting,
    resourceQueueSize,
    findMissing,
    retryResources,
    removeResource,
    runLog,
  } = useDiscussionReplies(active);

  // docs/DEV_LOOP.md's downloadable-log rule: the two format handlers,
  // mirroring RepoGradingLogPanel.tsx's own handleDownload exactly - the one
  // clock read in this panel (everything downstream, the filename stamp and
  // the JSON's exportedAt, takes it as a parameter) and triggerFileDownload,
  // never a hand-rolled object-URL dance.
  const handleDownloadLog = useCallback(
    (format: "csv" | "json") => {
      const now = new Date().toISOString();
      const text = format === "csv" ? formatDiscussionRepliesLogCsv(runLog) : formatDiscussionRepliesLogJson(runLog, { exportedAt: now });
      const filename = discussionRepliesLogFileName(runLog.courseName, format, now);
      const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
      triggerFileDownload(new Blob([text], { type: mimeType }), filename);
    },
    [runLog]
  );

  // F8: R4e says the embedded-provider capability limit must be shown as a
  // standing hint, not routed through the per-batch notice channel (which
  // useReplyResources.ts's drain now deliberately skips for this case - see
  // that file). Read independently here via the reactive store hook rather
  // than threaded through useDiscussionReplies.ts's return shape.
  const [llmProvider] = useLlmProvider();

  // ---- Session bookkeeping for AC7b's post-stop summary. ----
  // The pinned UseDiscussionRepliesReturn (section 12) exposes only the
  // whole persisted `rows` array, not a session-scoped tally - AC24 says the
  // table is not owned by a session at all. So THIS panel snapshots which
  // row ids existed the moment `start()` was pressed and, on stop, diffs
  // `rows` against that snapshot to get "found/drafted/failed this
  // session". Every setState below follows the "adjust state during
  // rendering" pattern (compare current vs previous, setState in the same
  // render) rather than a useEffect that calls setState synchronously,
  // which this repo's eslint config rejects (TaskAttachmentsDialog.tsx's
  // own note on the same rule).
  const [prevCapturing, setPrevCapturing] = useState(capturing);
  const [sessionStartIds, setSessionStartIds] = useState<ReadonlySet<string>>(() => new Set());
  // F11: `totalCount` is snapshotted alongside `sessionStartIds` so `found`
  // below can be computed as a pure count delta - correct regardless of
  // whatever the filter is doing, since it never touches the (now filtered)
  // `rows` array at all. See the `found` computation below for why the same
  // trick does not extend to `drafted`/`failed`.
  const [sessionStartTotalCount, setSessionStartTotalCount] = useState(0);
  const [stoppedSummary, setStoppedSummary] = useState<StoppedSummary | null>(null);
  if (capturing !== prevCapturing) {
    setPrevCapturing(capturing);
    if (capturing) {
      // S2 fix (sort-filter review): `rawRows`, not `rows`. Building the
      // start-of-session snapshot from the FILTERED array was the root of
      // BOTH directions of the bug - it could undercount (a row outside the
      // filter at Stop looked like it was never in the session) and OVERcount
      // (a filter matching nothing at Start produced an empty snapshot, so
      // every persisted row looked "new" once the filter was cleared before
      // Stop). `rawRows` is exact under any filter change during the session.
      setSessionStartIds(new Set(rawRows.map((r) => r.id)));
      setSessionStartTotalCount(totalCount);
      setStoppedSummary(null);
    } else {
      // S2 fix (sort-filter review): `rawRows`, not `rows` - same reasoning
      // as the snapshot above. `drafted`/`failed` are no longer best-effort;
      // both are exact regardless of what the filter is doing at Stop time.
      setStoppedSummary({
        elapsedAtStop: elapsedSec,
        ...computeStoppedSessionSummary({ rawRows, sessionStartIds, totalCount, sessionStartTotalCount }),
      });
    }
  }
  const everStarted = capturing || stoppedSummary !== null;

  // AC14: "Custom order." on the mode change, and AC38's newest-notice
  // announcement, both routed into one ad hoc polite region (kept separate
  // from AC7a's throttled capture sentence below - a burst of row moves
  // must not wait behind a 5-second capture-status throttle, and a capture
  // status tick must not be interrupted by an unrelated row move).
  const [adhocAnnouncement, setAdhocAnnouncement] = useState("");
  const [prevSort, setPrevSort] = useState(sort);
  if (sort !== prevSort) {
    setPrevSort(sort);
    if (sort === "custom" && prevSort !== "custom") setAdhocAnnouncement("Custom order.");
  }
  const noticeSignature = notices.map((n) => n.id).join(",");
  const [prevNoticeSignature, setPrevNoticeSignature] = useState(noticeSignature);
  if (noticeSignature !== prevNoticeSignature) {
    setPrevNoticeSignature(noticeSignature);
    const newest = notices[notices.length - 1];
    if (newest) setAdhocAnnouncement(newest.text);
  }
  // BL3: stable across renders. Passed into the memoized DiscussionReplyRow
  // as the `announce` prop - a fresh arrow here on every render (elapsedSec
  // ticks once a second while capturing) defeated React.memo on every row,
  // since setAdhocAnnouncement itself is already stable and this closure
  // captures nothing else.
  const announce = useCallback((text: string) => setAdhocAnnouncement(text), []);

  // S3/AC16: the clipboard-failure message's visible home. Kept separate
  // from the general `notices` list (which is C3-owned and dismissed
  // through `dismissNotice`) - a copy failure is purely a DOM/client-side
  // event with nothing for the orchestrator hook to know about.
  const [copyError, setCopyError] = useState<string | null>(null);
  const handleCopyError = useCallback((text: string) => setCopyError(text), []);

  // Reply-width UX pass, section 5d target #2: "Copy every reply (N)" - the
  // table-level export. `rows` is already display-sorted (useReplyRows.ts's
  // own `sortReplyRows` memo), so this scopes to the CURRENT sort per the
  // UX note's own requirement. N counts only rows that actually contribute
  // something (mirrors AC/R9a's per-row `disabled` condition) so the label
  // never claims a bigger export than what lands on the clipboard.
  //
  // JUDGMENT CALL: deliberately left reading `rows` (now the FILTERED
  // display array) rather than `totalCount`/an unfiltered array. F12 names
  // exactly three whole-table actions unaffected by the filter - "Draft the
  // missing replies", "Redraft every reply", "Delete table" - and this
  // export is not one of them; useReplyRows.ts also exposes no unfiltered
  // ARRAY to copy from any more (only the unfiltered COUNT, `totalCount`).
  // Reading `rows.filter(...)` copies exactly what F13/F14 tell the user is
  // currently visible ("Showing N of M"), which this set's brief did not
  // ask to change - flagged here as a judgment call, not silently assumed.
  const copyableRows = rows.filter((r) => !!r.reply || !!r.resources?.length);
  // S4 fix (sort-filter review): the SCOPING above is correct (verified: the
  // count and the dispatch both read the same `rows` array, so they cannot
  // drift) - the LABEL was the lie. "Copy every reply (4)" while 37 rows
  // exist and "Showing 4 of 37" sits a few pixels away claims a bigger
  // export than what lands on the clipboard. `copyAllButtonLabel` (the
  // decision, unit-tested in discussion-table-view.test.ts) rewords it to
  // be honest under a filter; the button's behaviour is unchanged.
  const copyAllLabel = copyAllButtonLabel(copyableRows.length, filterText.trim() !== "");
  const [allCopied, setAllCopied] = useState(false);
  const allCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (allCopyTimerRef.current) clearTimeout(allCopyTimerRef.current);
    },
    []
  );
  const handleCopyAll = useCallback(async () => {
    const text = tableClipboardText(rows);
    if (!text) return;
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      if (allCopyTimerRef.current) clearTimeout(allCopyTimerRef.current);
      setAllCopied(true);
      allCopyTimerRef.current = setTimeout(() => setAllCopied(false), 1500);
    } catch {
      const message = "Could not copy automatically. Select the text in the reply box and copy it.";
      announce(message);
      setCopyError(message);
    }
  }, [rows, announce]);

  // docs/discussion-reply-resources-acceptance-criteria.md R11/R11a:
  // `Find resources` states the row count it is about to search - computed
  // with the SAME eligibility predicate `findMissing()` itself uses
  // (useReplyResources.ts's exported `isFindMissingEligible`), imported
  // rather than re-derived, so the count on the button can never drift from
  // what a click actually enqueues.
  //
  // Same judgment call as `copyableRows` above, and checked (not just
  // assumed) against useReplyResources.ts: `findMissing()` (useReplyResources
  // .ts:322-324) reads its own captured `rowsApi.rows` - the SAME hook
  // object this panel destructures `rows` from - so it is filtering the
  // identical (now-filtered) array this line reads. The count and the
  // dispatch stay in lockstep either way; this was not left un-updated by
  // omission.
  const eligibleForResources = rows.filter(isFindMissingEligible);

  // AC7a/AC47: one computed sentence, recomputed at most every 5 wall-clock
  // seconds. setState only happens after an await (a real gate, even a
  // zero-length one) - this repo's eslint forbids reaching setState
  // synchronously from inside a useEffect body.
  const [liveSentence, setLiveSentence] = useState("");
  const lastAnnouncedAtRef = useRef(0);
  useEffect(() => {
    let cancelled = false;
    // F11: AC7's "N posts found" reads `totalCount`, never `rows.length` -
    // rows is the FILTERED display array now, and this sentence must not
    // shrink just because the user is mid-search while a capture is live.
    const sentence = composeLiveSentence({ count: totalCount, extracting, pendingFrames, stalled, capturing });
    void (async () => {
      const sinceLast = Date.now() - lastAnnouncedAtRef.current;
      if (sinceLast < 5000) await new Promise((r) => setTimeout(r, 5000 - sinceLast));
      if (cancelled) return;
      lastAnnouncedAtRef.current = Date.now();
      setLiveSentence(sentence);
    })();
    return () => {
      cancelled = true;
    };
  }, [totalCount, extracting, pendingFrames, stalled, capturing]);

  // ---- AC19/AC19a: signature-based arming, no timer. isConfirmArmed
  // compares the armed-for signature against the CURRENT one - re-arming
  // after the underlying thing changes (a batch lands mid-session) is
  // exactly the point; see confirmArming.ts's own header for why a timer
  // reproduces REGRESSION entry 258. ----
  const [deleteArmedFor, setDeleteArmedFor] = useState<string | null>(null);
  const [redraftArmedFor, setRedraftArmedFor] = useState<string | null>(null);
  // `deleteSignature` and `draftingArmSignature` are deliberately NOT the
  // same helper: `Delete table` consumes a different pair of inputs
  // (rowCount + whether a recording exists) than `Redraft every reply`
  // consumes (rowCount + audience + courseId) - forcing them through one
  // shared shape would either drop a delete-only field or add an unused one
  // to redraft's signature, both of which are exactly this bug's class.
  // F11/F0-2: BOTH arming signatures read `totalCount`, never `rows.length` -
  // `rows` is now the FILTERED display array (useReplyRows.ts), and the
  // whole point of this signature is that typing in the search box must NOT
  // silently re-arm (or disarm) `Delete table` against a different count
  // than the confirmation names. This is REGRESSION entry 258's exact
  // defect, applied to the filter feature this signature now also has to
  // survive.
  const deleteSignature = `${totalCount}|${recordingUrl ? "video" : "novideo"}`;
  // BUG FIX (live bug, class of REGRESSION entry 258 - same one deleteSignature
  // was written to prevent): `redraftAll` (useDiscussionReplies.ts) dispatches
  // every draft using BOTH `audienceRef.current` AND `courseNameRef.current`
  // (the latter derived from `courseId` via the course list) - so `courseId`
  // is a drafting control this panel owns just as much as `audience` is.
  // Before this fix the signature carried only `${rows.length}|${audience}`:
  // arm "Redraft every reply", change the COURSE select, confirm, and every
  // reply is redrafted under a course context that was never shown in the
  // warning the user just read. Folding `courseId` in means changing EITHER
  // drafting control disarms the confirm, exactly like changing the row
  // count or the recording state already disarms `Delete table` above.
  //
  // Built through `draftingArmSignature` (discussion-capture.ts), a pure,
  // exported, unit-tested function - rather than an inline template literal
  // here - specifically so "does this signature actually include every
  // drafting input" has a test surface at all (vitest renders no component
  // in this repo).
  // F11: same reasoning as deleteSignature above - `rowCount` is `totalCount`,
  // never the filtered `rows.length`.
  // docs/reply-composition-controls-acceptance-criteria.md C6/JOB0: the
  // three reply-composition fields join this signature the same way
  // courseId's own addition once fixed this exact bug class -
  // `redraftAll`/`runDraftLoop` dispatch every draft using
  // `compositionRef.current` too, so all three are real drafting inputs
  // that must disarm a pending "Redraft every reply" confirm when changed.
  const redraftSignature = draftingArmSignature({
    rowCount: totalCount,
    audience,
    courseId,
    ingredients: composition.ingredients,
    addressByName: composition.addressByName,
    formality: composition.formality,
  });
  const deleteArmed = isConfirmArmed(deleteArmedFor, deleteSignature);
  const redraftArmed = isConfirmArmed(redraftArmedFor, redraftSignature);

  // ---- AC19/S4, modal-focus-restoration decisions 2/3/5: a keyed ref map
  // so focus after a row removal lands on the NEXT row's Remove button,
  // falling back to this actions container (never document.body).
  //
  // S4: `actionsContainerRef`'s own element must therefore be able to
  // OUTLIVE the removal/delete that needs it as a fallback target - it is
  // rendered unconditionally below (its Draft/Delete BUTTONS are still
  // conditional on `totalCount > 0` inside it), never inside the same
  // `totalCount > 0` guard that used to unmount it in the same commit as a
  // "Confirm delete" click that emptied the table. `pendingFocusFallbackRef`
  // is the second, explicit "there is no specific row to focus, but a
  // removal DID happen" signal - the previous code silently skipped the
  // fallback whenever the removed row had no neighbour (a null `targetId`
  // short-circuited the effect below before it ever reached the fallback
  // branch), which is the identical bug removing the LAST row hit even
  // before "Delete table" existed. ----
  const removeRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const actionsContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusIdRef = useRef<string | null>(null);
  const pendingFocusFallbackRef = useRef(false);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const registerRemoveRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) removeRefs.current.set(id, el);
    else removeRefs.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    const targetId = pendingFocusIdRef.current;
    const wantsFallback = pendingFocusFallbackRef.current;
    pendingFocusIdRef.current = null;
    pendingFocusFallbackRef.current = false;
    if (!targetId && !wantsFallback) return;
    const next = targetId ? removeRefs.current.get(targetId) : null;
    if (next) next.focus();
    else actionsContainerRef.current?.focus();
  });

  const handleRemove = useCallback(
    (id: string) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      const fallback = raw[idx + 1] ?? raw[idx - 1] ?? null;
      if (fallback) {
        pendingFocusIdRef.current = fallback.id;
      } else {
        // The row being removed had no neighbour - removing it leaves the
        // table empty (or this was already the only row), and the table
        // subtree is about to unmount. Fall back to the persistent actions
        // container rather than dropping focus to <body> -
        // docs/modal-focus-restoration-acceptance-criteria.md AC2 forbids
        // that outcome unconditionally, and a removal with no neighbouring
        // row to receive focus is exactly the case that rule exists for.
        pendingFocusFallbackRef.current = true;
      }
      removeRow(id);
    },
    [removeRow]
  );

  const handleClearTable = useCallback(() => {
    // S4: the whole `totalCount > 0` subtree (including the button that
    // currently has focus) unmounts in this same commit - the persistent
    // actionsContainerRef is the only focus target guaranteed to survive it.
    pendingFocusFallbackRef.current = true;
    clearTable();
  }, [clearTable]);

  const handleStartStop = () => {
    if (capturing) {
      stop();
      return;
    }
    void start();
  };

  // F11/AC59: all four of this panel's original empty states read
  // `totalCount`, never the filtered `rows.length` - a stale filter that
  // happens to match nothing must never make a table WITH persisted rows
  // look like a table that was never opened.
  const showNeverOpened = !everStarted && totalCount === 0;
  const showPersistedBanner = !everStarted && totalCount > 0;
  const showCapturingEmpty = capturing && totalCount === 0;
  // S2: keyed off `stoppedSummary.found === 0`, not `totalCount === 0`. A
  // session that adds no NEW rows to an already non-empty (persisted) table
  // used to satisfy neither this condition nor the `found > 0` summary
  // gate above, so the panel went completely silent on Stop - the exact
  // "did it work?" moment AC7b exists for, and the likeliest way a
  // returning user meets a real failure (shared the wrong window with
  // yesterday's rows still on screen).
  const showStoppedEmpty = !capturing && stoppedSummary !== null && stoppedSummary.found === 0;

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Discussion replies</h2>
        <p className={styles.adaptPanelSubtitle}>
          Screen-record a discussion board while you scroll - the app reads the posts off the screen and drafts a
          reply to each one.
        </p>
      </div>

      {/* docs/DEV_LOOP.md: "a downloadable log ... displayed in a prominent
          location". Placed immediately under the header, before every other
          control - never gated on `totalCount > 0` or on a capture having
          run, since a failed or empty run (a capture that never found
          anything, a start() that threw before anything was captured) is
          exactly when this needs to be reachable without hunting. */}
      <div className={styles.fieldHint} style={{ margin: "0 0 4px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span>{discussionRepliesLogSummaryLine(summarizeDiscussionRepliesRunLog(runLog))}</span>
        <Button size="small" variant="text" style={{ minWidth: 0 }} onClick={() => handleDownloadLog("csv")}>
          Download run log (CSV)
        </Button>
        <Button size="small" variant="text" style={{ minWidth: 0 }} onClick={() => handleDownloadLog("json")}>
          Download run log (JSON)
        </Button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
        <TextField
          select
          label="Course"
          size="small"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          disabled={coursesLoading}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">No course selected</MenuItem>
          {(courses ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <div>
          <FormControlLabel
            control={<Checkbox size="small" checked={saveVideo} onChange={(e) => setSaveVideo(e.target.checked)} />}
            label="Also save the screen recording"
          />
          {/* N5: attached to the control it actually describes - as a bare
              paragraph below the whole row it read as if it applied to the
              Course select above it instead. */}
          <p className={styles.fieldHint} style={{ margin: 0 }}>Applies to the next capture.</p>
        </div>
      </div>
      {coursesError && <p className={styles.fieldHint}>Could not load your courses - drafting still works without one.</p>}

      <div className={styles.ghActions}>
        <span className={styles.ghMeta}>Replying to:</span>
        {/* docs/reply-composition-controls-acceptance-criteria.md C6d: this
            segmented toggle had no aria-pressed anywhere in the recording/
            directory's one existing precedent (SpeedPanel.tsx) - fixed here
            rather than propagated to a second control. */}
        <Button
          variant={audience === "students" ? "contained" : "outlined"}
          size="small"
          aria-pressed={audience === "students"}
          onClick={() => setAudience("students")}
        >
          My students
        </Button>
        <Button
          variant={audience === "peers" ? "contained" : "outlined"}
          size="small"
          aria-pressed={audience === "peers"}
          onClick={() => setAudience("peers")}
        >
          Fellow educators
        </Button>
        {/* AC61: the slot keeps its layout box even while hidden (visibility,
            not conditional rendering) so this row does not shift sideways
            the moment the first post lands. F11: gated on `totalCount`, not
            the filtered `rows.length` - Redraft is a whole-table action
            (F12) and must stay available (and visible) even while the
            current filter happens to show nothing. */}
        <div className={panelStyles.reservedSlot} style={{ visibility: totalCount > 0 ? "visible" : "hidden" }} aria-hidden={totalCount === 0}>
          {redraftArmed ? (
            <>
              <Button size="small" color="warning" onClick={() => { redraftAll(); setRedraftArmedFor(null); }} aria-describedby={REDRAFT_CONSEQUENCE_ID}>
                Confirm redraft
              </Button>
              <Button size="small" onClick={() => setRedraftArmedFor(null)} style={{ marginLeft: 6 }}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="small" variant="text" onClick={() => setRedraftArmedFor(redraftSignature)}>
              Redraft every reply
            </Button>
          )}
        </div>
      </div>
      {redraftArmed && (
        <p id={REDRAFT_CONSEQUENCE_ID} role="status" aria-live="polite" className={panelStyles.consequence}>
          This overwrites every reply in the table, including ones you edited by hand.
        </p>
      )}

      {/* docs/reply-composition-controls-acceptance-criteria.md C0-0: this
          cluster goes HERE - inline, after the audience row, before "Start
          capture" - and never behind a disclosure. useDiscussionReplies.ts
          auto-enqueues drafting as posts merge DURING capture, so a control
          discovered below the capture button (or behind a click) is
          discovered only after the first replies were already drafted
          under whatever it defaulted to. That is also why there is no
          disclosure here at all: it would hide the address-by-name toggle,
          which is ON by default, i.e. the one control that silently changes
          output. */}
      {/* GAP 1 fix: the instructor could not tell a Knowledge-base-launched
          run apart from an ordinary one - this is the one visible signal,
          placed with the other controls that govern drafting (immediately
          above them, same as the composition cluster's own placement
          rationale just above). Only rendered while `knowledgeContextLabel`
          is non-null - useDiscussionReplies.ts derives that from LIVE state
          only, never the persisted label, so this line is silent in the
          restored-after-reload case (see the reload notice pushed by that
          hook, which is this feature's only voice for that case - this line
          deliberately does not duplicate or contradict it). */}
      {knowledgeContextLabel && (
        <p className={styles.fieldHint}>{`Drafting with Knowledge Base context: ${knowledgeContextLabel}.`}</p>
      )}
      <DiscussionReplyControls composition={composition} onChange={setComposition} />

      <div className={styles.ghActions}>
        <Button variant="contained" size="small" onClick={handleStartStop}>
          {capturing ? "Stop capture" : "Start capture"}
        </Button>
      </div>
      <p className={styles.fieldHint}>You can also stop from your browser&apos;s sharing bar.</p>

      {/* AC7/AC7a: the whole status row is aria-hidden - a separate polite
          region (below) carries the one sentence a screen reader hears,
          throttled to at most once per 5 seconds. */}
      <div className={panelStyles.statusRow} aria-hidden="true">
        {/* BL2: rendered UNCONDITIONALLY, never `{capturing && <video ...>}`.
            useDiscussionCapture's start() assigns `previewRef.current.srcObject`
            synchronously, BEFORE it sets `capturing` true - so a conditionally-
            mounted video is still null at that exact moment (this element does
            not exist in the DOM yet) and the assignment is silently skipped
            with nothing left to reassign it later. The element must already be
            mounted before start() runs; only its visibility is conditional. */}
        <video
          ref={previewRef}
          className={panelStyles.previewVideo}
          style={{ display: capturing ? undefined : "none" }}
          autoPlay
          muted
          playsInline
        />
        {capturing && (
          <div className={panelStyles.statusText}>
            <span>{fmt(elapsedSec)}</span>
            {/* F11: AC7's "N posts found" reads `totalCount`. */}
            <span>{totalCount === 0 ? "Capturing - 0 posts so far." : `${totalCount} post${totalCount === 1 ? "" : "s"} found`}</span>
            {extracting && <span>Reading the screen...</span>}
            {pendingFrames > 0 && <span>Catching up - scroll a little slower.</span>}
          </div>
        )}
      </div>
      {stalled && (
        <p className={styles.error}>
          Nothing new has been read off the screen for 30 seconds. Keep this app&apos;s tab visible in a second window while you scroll.
        </p>
      )}
      {!capturing && stoppedSummary && stoppedSummary.found > 0 && (
        <p className={styles.fieldHint}>{stoppedSummarySentence(stoppedSummary)}</p>
      )}
      {/* AC7b/AC10/F4: the drop sentence sits beneath the persistent
          post-stop summary, not in the dismissible notices list - it is a
          session-level fact tied to the summary above it. AC63's exact
          string. */}
      {!capturing && stoppedSummary && droppedFrames > 0 && (
        <p className={styles.fieldHint}>
          Some of the screen scrolled past faster than it could be read. Scroll back over that section to catch it.
        </p>
      )}
      {recordingUrl && (
        <p className={styles.fieldHint}>
          <a href={recordingUrl} download="discussion-capture.webm">
            {`Download recording (${(recordingBytes / 1048576).toFixed(1)} MB)`}
          </a>
        </p>
      )}

      {notices.length > 0 && (
        <div className={styles.field}>
          {notices.map((n) => (
            <p key={n.id} className={styles.error}>
              {n.text}{" "}
              <button type="button" className={styles.linkButton} onClick={() => dismissNotice(n.id)}>
                Dismiss
              </button>
            </p>
          ))}
        </div>
      )}

      {showNeverOpened && (
        <p className={styles.fieldHint}>No replies yet - start a capture, then scroll through the discussion board in the other window.</p>
      )}
      {showPersistedBanner && (
        <p className={styles.fieldHint}>
          {`${totalCount} repl${totalCount === 1 ? "y" : "ies"} kept from an earlier session. They stay here until you delete the table.`}
        </p>
      )}
      {showCapturingEmpty && <p className={styles.fieldHint}>Posts appear here as you scroll past them in the other window.</p>}
      {/* N3: the reasons (if any) are already rendered in full, with Dismiss
          buttons, in the `notices` block above - re-rendering a deduped copy
          of the same text here showed a repeated 429 twice. */}
      {showStoppedEmpty && (
        <p className={styles.fieldHint}>
          {`Capture stopped after ${fmt(stoppedSummary?.elapsedAtStop ?? elapsedSec)}. No posts were found. Check that you shared the window showing the discussion board, and scroll through the posts while the capture is running.`}
        </p>
      )}
      {/* S3: clipboard-copy failures land here (AC16: "goes to the panel's
          error line, never into the icon slot") - a visually-hidden live
          region alone is invisible to a sighted user, and this is the one
          panel-level error line the copy button has any reach to. */}
      {copyError && (
        <p className={styles.error}>
          {copyError}{" "}
          <button type="button" className={styles.linkButton} onClick={() => setCopyError(null)}>
            Dismiss
          </button>
        </p>
      )}

      {/* S4: rendered UNCONDITIONALLY (only the buttons inside are gated on
          `totalCount > 0`) - this is the fallback focus target for both a
          per-row removal with no neighbouring row and a table-level delete,
          and it must still exist in the DOM after either one to receive
          focus. Previously this whole div lived inside that gate's block,
          so it unmounted in the SAME commit as the "Confirm delete" click
          that emptied the table, dropping focus to <body>. F11: the gate
          itself reads `totalCount`, not the filtered `rows.length` - Draft/
          Find/Delete are whole-table actions (F12) and must stay available
          even while the current filter shows nothing. */}
      <div className={styles.ghActions} ref={actionsContainerRef} tabIndex={-1}>
        {totalCount > 0 && (
          <>
            {/* Reply-width UX pass, section 5d target #2: the biggest click
                saving in the feature - exporting a 40-row table used to be
                40 clicks. First in the bar, before "Draft the missing
                replies", per the UX note's own ordering. */}
            <Button
              size="small"
              variant="outlined"
              startIcon={allCopied ? <CheckIcon /> : <CopyIcon />}
              disabled={copyableRows.length === 0}
              title={allCopied ? "Copied" : copyAllLabel}
              onClick={() => void handleCopyAll()}
            >
              {copyAllLabel}
            </Button>
            <Button size="small" variant="outlined" disabled={drafting} onClick={draftAllPending}>
              Draft the missing replies
            </Button>
            {/* docs/discussion-reply-resources-acceptance-criteria.md R11/
                R11a: states the row count it is about to search. */}
            <Button
              size="small"
              variant="outlined"
              disabled={eligibleForResources.length === 0}
              onClick={() => findMissing()}
            >
              {`Find resources (${eligibleForResources.length})`}
            </Button>
            {deleteArmed ? (
              <>
                <Button size="small" color="error" onClick={() => { handleClearTable(); setDeleteArmedFor(null); }} aria-describedby={DELETE_CONSEQUENCE_ID}>
                  Confirm delete
                </Button>
                <Button size="small" onClick={() => setDeleteArmedFor(null)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="small" color="error" variant="outlined" onClick={() => setDeleteArmedFor(deleteSignature)}>
                Delete table
              </Button>
            )}
          </>
        )}
      </div>
      {/* F11: names `totalCount`, matching `deleteSignature` above - the
          confirmation must always name the same count that a confirm click
          actually deletes (F12: Delete table acts on the whole table, always). */}
      {totalCount > 0 && deleteArmed && (
        <p id={DELETE_CONSEQUENCE_ID} role="status" aria-live="polite" className={panelStyles.consequence}>
          {`This permanently deletes all ${totalCount} row${totalCount === 1 ? "" : "s"}${recordingUrl ? " and the saved recording" : ""}. This cannot be undone.`}
        </p>
      )}
      {/* resourceQueueSize is forwarded straight through from
          useReplyResources.ts (R12a) for exactly this - a lightweight
          progress line for the resource search queue, the same idea as the
          drafting queue's own "Drafting" status badge, just at table scale.
          F9 fix: during a live capture the drain deliberately YIELDS
          (R0-4) without dispatching, so "Finding resources..." would sit
          there unchanging and read as a stall - isResourceLaneBusy is the
          SAME predicate useReplyResources.ts's drain checks before every
          dispatch, applied to the same three booleans already destructured
          above, and resourceQueueProgressText (also useReplyResources.ts,
          also unit-tested) is the SAME wording function, so this line can
          never say "finding" while the drain is actually yielded. */}
      {totalCount > 0 && resourceQueueSize > 0 && (
        <p className={styles.fieldHint}>
          {resourceQueueProgressText(resourceQueueSize, isResourceLaneBusy({ capturing, pendingFrames, extracting }))}
        </p>
      )}

      {/* F11/F13, the single most important gate in this block: `totalCount`,
          NEVER the filtered `rows.length`. `rows` can legitimately be empty
          while `totalCount` is not (the user's search matches nothing) - if
          this gate read `rows.length`, the search box and the table region
          (including F13's own "No replies match" state) would UNMOUNT the
          instant a filter matched zero rows, taking the only way to see the
          query or clear it with them. Every count/progress string/empty
          state/arming signature ABOVE this block already reads `totalCount`
          (F11); the table body BELOW switches from the old `rows.map` to
          reading `rows` in its now-filtered sense. */}
      {totalCount > 0 && (
        <DiscussionReplyTable
          rows={rows}
          totalCount={totalCount}
          filterText={filterText}
          setFilterText={setFilterText}
          sort={sort}
          setSort={setSort}
          llmProvider={llmProvider}
          addressByName={composition.addressByName}
          editReply={editReply}
          moveRow={moveRow}
          onRemove={handleRemove}
          retryRow={retryRow}
          retryResources={retryResources}
          removeResource={removeResource}
          registerRemoveRef={registerRemoveRef}
          announce={announce}
          onCopyError={handleCopyError}
        />
      )}

      {/* AC7a: the throttled capture-status sentence. */}
      <span role="status" aria-live="polite" style={visuallyHidden}>
        {liveSentence}
      </span>
      {/* Ad hoc: row moves, remove-arming, "Custom order.", copy failures,
          the newest notice. */}
      <span role="status" aria-live="polite" style={visuallyHidden}>
        {adhocAnnouncement}
      </span>
    </div>
  );
}
