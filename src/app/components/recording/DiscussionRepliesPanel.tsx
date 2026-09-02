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
import { Button } from "@mui/material";
import styles from "../../page.module.css";
import controls from "./RecordingControls.module.css";
import { fmt } from "./types";
import { isConfirmArmed } from "../content-tab/modules/confirmArming";
import { tableClipboardText, draftingArmSignature } from "./discussion-capture";
import { copyAllButtonLabel, isDraftAllPendingEligible, REPLY_STATUS_FILTER_LABELS } from "./discussion-table-view";
import { isFindMissingEligible, isResourceLaneBusy, resourceQueueProgressText } from "./useReplyResources";
import { useDiscussionReplies } from "./useDiscussionReplies";
import { variantFor } from "../ui/buttonVariant";
import { visuallyHidden } from "../ui/visuallyHidden";
// CC14: the shared clipboard guard - this was the last of the three
// discussion sites still inlining `!navigator.clipboard || !window.
// isSecureContext` independently (DiscussionReplyRow.tsx's two copies are
// group D2's, outside this file set).
import { writeClipboardText } from "../ui/clipboard";
import RunLogRow from "./RunLogRow";
import CarriedKnowledgePages from "./CarriedKnowledgePages"; // AC3 - shared with GradingRecordingPanel.tsx
// AC3/4b (docs/knowledge-recording-handoff-acceptance-criteria.md section 4):
// "add" - shared with GradingRecordingPanel.tsx the same way CarriedKnowledgePages
// is. Rendered unconditionally (never gated on knowledgeContextLabel) - an
// instructor carrying nothing yet is this feature's primary case.
import AddKnowledgePages from "./AddKnowledgePages";
// D1/D3/D7/D9 (docs/aesthetics-pass-acceptance-criteria.md section 4b): see
// that file's own header for the full account of this panel's own hook-count
// pressure and how handledAt/skipped (real ReplyRow fields as of this
// migration) are wired here.
import { useDiscussionReplyFiltering } from "./useDiscussionReplyFiltering";
// AC7b's post-stop summary bookkeeping (session start snapshot, the
// stopped-summary diff, and the four totalCount/stoppedSummary-driven empty
// states) - extracted into its own hook once this panel was again pressing
// on its own 1000-line ceiling. See that file's own header for the full
// reasoning this comment used to carry inline.
import { useDiscussionSessionSummary, stoppedSummarySentence } from "./useDiscussionSessionSummary";
// D3 (status filter chips) + D4 (sticky review bar): landed in a new sibling
// file - see that file's own header for why (this panel's own line ceiling).
import DiscussionReplyToolbar from "./DiscussionReplyToolbar";
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
// docs/recording-controls-ux-acceptance-criteria.md CC17: the Capture/
// Replies/Context/Resources settings block, extracted into its own file -
// see that file's own header for the exact prop list and why the Context
// section's own markup (the Knowledge-context block below) stays here rather
// than moving with it.
import DiscussionCaptureSettings from "./DiscussionCaptureSettings";
// CC12: the file-local composeLiveSentence/visuallyHidden pair (and the
// throttling effect) were parameterised and lifted to group P's shared
// primitives - see captureLiveRegion.ts and ui/visuallyHidden.ts's own
// headers.
import { composeCaptureLiveSentence, useThrottledLiveSentence } from "./captureLiveRegion";
// F8/F9 fixes: neither needs a new field on UseDiscussionRepliesReturn (out
// of this fixer pass's file set) - useLlmProvider is a standalone reactive
// store read (docs/discussion-reply-resources-acceptance-criteria.md R4e),
// and isResourceLaneBusy is useReplyResources.ts's own already-exported,
// already-tested predicate, applied here to the SAME three booleans this
// panel already destructures from useDiscussionReplies below.
import { useLlmProvider } from "@/lib/llm-provider";

const DELETE_CONSEQUENCE_ID = "discussion-delete-table-consequence";
const REDRAFT_CONSEQUENCE_ID = "discussion-redraft-consequence";

// AC7a: the visible status text is NOT inside a live region (the elapsed
// timer ticking every second would otherwise announce ~240 times per
// capture and defeat this same throttle); since CC12 only the <video> is
// aria-hidden, so a screen reader can still read the timer on demand. CC12: the noun is "post"/"posts" - discussion replies
// are the one caller keeping the exact wording composeCaptureLiveSentence
// was extracted from.
const REPLY_NOUN = { one: "post", many: "posts" };

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
    // Resource-controls feature: fully owned (persistence, coercion) by
    // useDiscussionReplies - this panel only threads the values into
    // DiscussionResourceSettings and passes its setters straight back as
    // that component's onChange handlers, exactly mirroring `composition`
    // above.
    resourceKinds,
    setResourceKinds,
    videoLengthMinMinutes,
    videoLengthMaxMinutes,
    setVideoLengthPreference,
    // GAP 1 fix: the one visible signal that this run's drafts are using
    // the instructor's selected Knowledge Base pages as context - see the
    // standing hint rendered just above DiscussionReplyControls below.
    knowledgeContextLabel,
    knowledgeContext, // AC3: threaded into CarriedKnowledgePages.tsx below
    setKnowledgeContext,
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
    // see useDiscussionSessionSummary.ts's own `sessionStartIds` computation
    // (called just below) for the one place this file needs it.
    rawRows,
    filterText,
    setFilterText,
    totalCount,
    sort,
    setSort,
    moveRow,
    editReply,
    removeRow,
    setHandledAt,
    setSkipped,
    redraftRow,
    draftAllPending,
    redraftAll,
    clearTable,
    drafting,
    resourceQueueSize,
    findMissing,
    retryResources,
    removeResource,
    searchRow,
    insertResource,
    runLog,
  } = useDiscussionReplies(active);

  // D1/D3/D7/D9: see useDiscussionReplyFiltering.ts's own header for why this
  // panel's worth of new hook state is one call to a dedicated hook, not
  // ~10 individual useState/useCallback/useMemo calls inline here - this
  // component was already 932 of its 1000-line ceiling, and every other
  // feature added to it in this folder has been extracted the same way.
  const {
    statusFilter,
    setStatusFilter,
    statusCounts,
    visibleRows,
    filterActive,
    handledAtById,
    skippedById,
    markHandled,
    toggleHandled,
    toggleSkipped,
    searchInputRef,
    handleClearFilters,
    handleEditReply,
    handleInsertResourceForRow,
  } = useDiscussionReplyFiltering({ rawRows, rows, filterText, setFilterText, editReply, insertResource, setHandledAt, setSkipped });

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

  // AC7b's post-stop summary bookkeeping, and the four totalCount/
  // stoppedSummary-driven empty states below (showNeverOpened et al) -
  // see useDiscussionSessionSummary.ts's own header for the full reasoning
  // (AC7b/F11/S2) this used to carry inline as a standalone useState/if
  // cluster.
  const { stoppedSummary, showNeverOpened, showPersistedBanner, showCapturingEmpty, showStoppedEmpty } =
    useDiscussionSessionSummary({ capturing, elapsedSec, rawRows, totalCount });

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
  //
  // D3/D9 extension: `visibleRows` (text filter AND the new status chip),
  // minus any row marked `skipped` - D9 requires the skip exclusion reach
  // this export, and `visibleRows`/`skippedById` are both already owned by
  // this panel. The three BULK actions (draftAllPending/redraftAll/
  // findMissing) carry the identical exclusion now too - see
  // isDraftAllPendingEligible/isRedraftAllEligible (discussion-table-view.ts)
  // and isFindMissingEligible's own D9 note (useReplyResources.ts).
  const copyableRows = visibleRows.filter((r) => (!!r.reply || !!r.resources?.length) && !skippedById[r.id]);
  // S4 fix (sort-filter review), extended for D3: "Copy every reply (4)"
  // while 37 rows exist is the lie this label exists to avoid - a status
  // chip narrows scope exactly the same way the search box does, so
  // `filterActive` (useDiscussionReplyFiltering.ts) counts either one, or
  // "Copy every reply (6)" reintroduces that exact lie under a chip instead
  // of a search term.
  const copyAllLabel = copyAllButtonLabel(copyableRows.length, filterActive);
  const [allCopied, setAllCopied] = useState(false);
  const allCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (allCopyTimerRef.current) clearTimeout(allCopyTimerRef.current);
    },
    []
  );
  const handleCopyAll = useCallback(async () => {
    const text = tableClipboardText(visibleRows.filter((r) => !skippedById[r.id]));
    if (!text) return;
    try {
      await writeClipboardText(text);
      if (allCopyTimerRef.current) clearTimeout(allCopyTimerRef.current);
      setAllCopied(true);
      allCopyTimerRef.current = setTimeout(() => setAllCopied(false), 1500);
    } catch {
      const message = "Could not copy automatically. Select the text in the reply box and copy it.";
      announce(message);
      setCopyError(message);
    }
  }, [visibleRows, skippedById, announce]);

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
  // seconds. CC12: composeCaptureLiveSentence/useThrottledLiveSentence
  // (captureLiveRegion.ts) reproduce this file's own former composeLiveSentence
  // + throttling effect exactly, parameterised over the noun being counted.
  // F11: AC7's "N posts found" reads `totalCount`, never `rows.length` - rows
  // is the FILTERED display array now, and this sentence must not shrink
  // just because the user is mid-search while a capture is live.
  const captureSentence = composeCaptureLiveSentence({
    count: totalCount,
    noun: REPLY_NOUN,
    extracting,
    pendingFrames,
    stalled,
    capturing,
  });
  const liveSentence = useThrottledLiveSentence(captureSentence);

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
  // D3: tracks `visibleRows` (both filters), not just the text-filtered
  // `rows` - the neighbour this looks up must match what is ACTUALLY
  // rendered, or a status chip active at removal time could hand focus to a
  // row the chip itself is hiding.
  const rowsRef = useRef(visibleRows);
  useEffect(() => {
    rowsRef.current = visibleRows;
  }, [visibleRows]);

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

  // docs/recording-controls-ux-acceptance-criteria.md CC1: pendingEligible
  // reads `rawRows` (the true unfiltered table, F11's own discipline) through
  // the same predicate `draftAllPending` itself dispatches with
  // (isDraftAllPendingEligible, discussion-table-view.ts) - never a raw
  // state count, which would light a "Draft the missing replies" primary
  // that draftAllPending then refuses to act on. `primaryAction` is null
  // while capturing (a live capture beats everything - CC1) or once nothing
  // is left to draft. Fixer pass finding 1: `drafting ||` is deliberately
  // NOT part of this OR any more - a single-row Redraft (section 10) also
  // flips `drafting` true, and isDraftAllPendingEligible's own state check
  // excludes "drafting" rows (discussion-table-view.test.ts:733), so once
  // every eligible row has actually been dispatched into the drain
  // `pendingEligible` correctly reaches 0 and the primary reverts to null
  // instead of staying the contained, spinning "Draft the missing replies"
  // for the remainder of a redraft that started from a single row.
  const pendingEligible = rawRows.filter(isDraftAllPendingEligible).length;
  const primaryAction: "draft" | null = capturing ? null : pendingEligible > 0 ? "draft" : null;
  // The toolbar's "Drafting N remaining" reason line, by contrast, DOES need
  // to count in-flight rows - `pendingEligible` above excludes "drafting" by
  // design (it only lights the primary/gates draftAllPending's own refusal),
  // so reading it here would print "Drafting 0 remaining" for every row that
  // is actually mid-dispatch. This is a separate rawRows scan (F11's
  // discipline: the unfiltered table, never `rows.length`) counting the same
  // three in-flight states a single-row Redraft or the bulk drain can leave a
  // row in.
  const draftingRemaining = rawRows.filter(
    (r) => (r.state === "pending" || r.state === "failed" || r.state === "drafting") && r.skipped !== true
  ).length;

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Discussion replies</h2>
        <p className={styles.adaptPanelSubtitle}>
          Screen-record a discussion board while you scroll - the app reads the posts off the screen and drafts a
          reply to each one.
        </p>
      </div>

      {/* D11 (AM11, "Notices ... Inline, at the top of the panel they
          concern"): this list used to render roughly 60% down the panel,
          after the status row, the post-stop summary and the drop sentence.
          Relocated here, immediately after the header - the download-log row
          included, since a notice a failed or empty run produced is exactly
          the kind of thing that needs to be seen without scrolling.
          CC11: ONE wrapper carries role="status"/aria-live - no role on the
          individual notices - and each notice renders in the shared
          .notice/.noticeDanger shape (RecordingControls.module.css). */}
      {notices.length > 0 && (
        // Fixer pass finding 3: two simultaneous notices used to butt with 0
        // gap between them - `.field` (page.module.css) is a flex column
        // with `gap`, which is all this wrapper needs (it carries no label,
        // so none of `.field`'s other declarations apply to it).
        <div role="status" aria-live="polite" className={styles.field}>
          {notices.map((n) => (
            <div key={n.id} className={`${controls.notice} ${controls.noticeDanger}`}>
              <span>{n.text}</span>
              <button type="button" className={styles.linkButton} onClick={() => dismissNotice(n.id)}>
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* docs/DEV_LOOP.md: "a downloadable log ... displayed in a prominent
          location". Placed immediately under the header, before every other
          control - never gated on `totalCount > 0` or on a capture having
          run, since a failed or empty run (a capture that never found
          anything, a start() that threw before anything was captured) is
          exactly when this needs to be reachable without hunting.
          CC8: the byte-identical run-log row (also duplicated in four sibling
          panels) is now the shared <RunLogRow>. */}
      <RunLogRow
        summary={discussionRepliesLogSummaryLine(summarizeDiscussionRepliesRunLog(runLog))}
        onDownload={handleDownloadLog}
      />

      {/* CC17: the Capture/Replies/Context/Resources settings block -
          DiscussionCaptureSettings.tsx. The Context section's own markup (the
          Knowledge-context block below) stays HERE and is passed as
          `children` - AddKnowledgePages.test.ts:261-273 and
          discussion-knowledge-context.test.ts:376-394 both pin its JSX to
          this file by path. */}
      <DiscussionCaptureSettings
        courseId={courseId}
        setCourseId={setCourseId}
        courses={courses}
        coursesLoading={coursesLoading}
        coursesError={coursesError}
        saveVideo={saveVideo}
        setSaveVideo={setSaveVideo}
        audience={audience}
        setAudience={setAudience}
        totalCount={totalCount}
        redraftArmed={redraftArmed}
        onArmRedraft={() => setRedraftArmedFor(redraftSignature)}
        onConfirmRedraft={() => {
          redraftAll();
          setRedraftArmedFor(null);
        }}
        onCancelRedraft={() => setRedraftArmedFor(null)}
        redraftConsequenceId={REDRAFT_CONSEQUENCE_ID}
        composition={composition}
        onChangeComposition={setComposition}
        resourceKinds={resourceKinds}
        onChangeResourceKinds={setResourceKinds}
        videoLengthMinMinutes={videoLengthMinMinutes}
        videoLengthMaxMinutes={videoLengthMaxMinutes}
        onChangeVideoLength={setVideoLengthPreference}
      >
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
        {/* AC3: remove/undo a carried page without leaving this panel - see
            CarriedKnowledgePages.tsx's own header. Renders nothing on its own
            when there is nothing to show. */}
        <CarriedKnowledgePages context={knowledgeContext} onChange={setKnowledgeContext} />
        {/* AC3/4b: add a page to this run's context without leaving this panel -
            see AddKnowledgePages.tsx's own header. Unconditional, unlike the
            label/CarriedKnowledgePages above - this must still offer something
            when knowledgeContext is null. */}
        <AddKnowledgePages context={knowledgeContext} onChange={setKnowledgeContext} />
      </DiscussionCaptureSettings>

      {/* CC2: the run row is the last thing in the settings block, holding
          the primary action (CC1) and nothing else.
          Fixer pass finding 2: `primaryAction === null && !drafting`, not
          bare `primaryAction === null` - during a bulk drain every eligible
          row is "drafting", `pendingEligible` correctly reaches 0 (finding
          1's own fix), and `primaryAction` goes null while the drain is
          still running. A bare `primaryAction === null` check would then
          make THIS button the screen's one contained primary for the rest
          of the drain, which is wrong (the drain's primary is "Draft the
          missing replies", still `loading` in the toolbar below). Gating
          the fallback on `!drafting` too means Start/Stop capture has NO
          contained primary while a drain runs, and only reverts to the
          contained idle "Start capture" once drafting is fully done and
          nothing is left eligible. */}
      <div className={`${styles.ghActions} ${controls.runRow}`}>
        <Button
          variant={variantFor(capturing || (primaryAction === null && !drafting))}
          color="primary"
          size="small"
          onClick={handleStartStop}
        >
          {capturing ? "Stop capture" : "Start capture"}
        </Button>
      </div>
      <p className={styles.fieldHint}>You can also stop from your browser&apos;s sharing bar.</p>

      {/* Fixer pass finding 3 (CC12): only the <video> stays aria-hidden - the
          status column (timer, "N posts found", "Reading the screen…",
          "Catching up") now renders in the open, exactly as the three
          siblings (GradingRecordingPanel, ModuleDeckCapturePanel,
          LegibilityProbeModal) do. A screen-reader user was previously
          hearing this panel's own capture count only through the throttled
          live region below - a sighted user got it immediately, but nothing
          stopped a screen-reader user from tabbing a screen to the left
          (Grading) before this panel's own facts were ever announced. The
          throttled live region (AC7a/AC7a's 5-second throttle) stays -
          moving the visible text out of aria-hidden does not change how
          often assistive tech is interrupted, since role="status" here is
          still nothing without the separate region below driving it. */}
      <div className={controls.statusRow}>
        {/* BL2: rendered UNCONDITIONALLY, never `{capturing && <video ...>}`.
            useDiscussionCapture's start() assigns `previewRef.current.srcObject`
            synchronously, BEFORE it sets `capturing` true - so a conditionally-
            mounted video is still null at that exact moment (this element does
            not exist in the DOM yet) and the assignment is silently skipped
            with nothing left to reassign it later. The element must already be
            mounted before start() runs; only its visibility is conditional.
            CC3: a conditional CSS class, not an inline `style={{ display }}`
            object. Fixer pass finding 4: the class composed while not
            capturing is now `controls.previewVideoHidden` (RecordingControls
            .module.css, group P) - this file's own `panelStyles.hiddenVideo`
            copy is deleted. The video itself carries `aria-hidden="true"`
            directly (finding 3) - it is the only piece of this row a screen
            reader must never be told about. */}
        <video
          ref={previewRef}
          className={`${controls.previewVideo}${capturing ? "" : ` ${controls.previewVideoHidden}`}`}
          aria-hidden="true"
          autoPlay
          muted
          playsInline
        />
        {capturing && (
          <div className={controls.statusText}>
            <span>{fmt(elapsedSec)}</span>
            {/* F11: AC7's "N posts found" reads `totalCount`. */}
            <span>{totalCount === 0 ? "Capturing - 0 posts so far." : `${totalCount} post${totalCount === 1 ? "" : "s"} found`}</span>
            {extracting && <span>Reading the screen…</span>}
            {pendingFrames > 0 && <span>Catching up - scroll a little slower.</span>}
          </div>
        )}
      </div>
      {stalled && (
        <p role="status" aria-live="polite" className={`${controls.notice} ${controls.noticeWarning}`}>
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
        <div className={`${controls.notice} ${controls.noticeDanger}`}>
          <span>{copyError}</span>
          <button type="button" className={styles.linkButton} onClick={() => setCopyError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* S4: rendered UNCONDITIONALLY (only the toolbar inside is gated on
          `totalCount > 0`) - this is the fallback focus target for both a
          per-row removal with no neighbouring row and a table-level delete,
          and it must still exist in the DOM after either one to receive
          focus. Previously this whole div lived inside that gate's block,
          so it unmounted in the SAME commit as the "Confirm delete" click
          that emptied the table, dropping focus to <body>. F11: the gate
          itself reads `totalCount`, not the filtered `rows.length` - Draft/
          Find/Delete are whole-table actions (F12) and must stay available
          even while the current filter shows nothing.
          D4: the action bar's own contents moved into DiscussionReplyToolbar
          (a NEW sibling file, sitting inside this SAME persistent div so the
          sticky container and the focus-fallback target are one and the
          same element) - see that file's own header. */}
      <div className={styles.ghActions} ref={actionsContainerRef} tabIndex={-1}>
        {totalCount > 0 && (
          <DiscussionReplyToolbar
            totalCount={totalCount}
            visibleCount={visibleRows.length}
            filterText={filterText}
            setFilterText={setFilterText}
            searchInputRef={searchInputRef}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            statusCounts={statusCounts}
            copyAllLabel={copyAllLabel}
            allCopied={allCopied}
            onCopyAll={() => void handleCopyAll()}
            copyAllDisabled={copyableRows.length === 0}
            drafting={drafting}
            onDraftMissing={draftAllPending}
            primaryAction={primaryAction}
            draftingRemaining={draftingRemaining}
            findResourcesCount={eligibleForResources.length}
            onFindMissing={() => findMissing()}
            deleteArmed={deleteArmed}
            onArmDelete={() => setDeleteArmedFor(deleteSignature)}
            onConfirmDelete={() => {
              handleClearTable();
              setDeleteArmedFor(null);
            }}
            onCancelDelete={() => setDeleteArmedFor(null)}
            deleteConsequenceId={DELETE_CONSEQUENCE_ID}
          />
        )}
      </div>
      {/* F11: names `totalCount`, matching `deleteSignature` above - the
          confirmation must always name the same count that a confirm click
          actually deletes (F12: Delete table acts on the whole table, always). */}
      {totalCount > 0 && deleteArmed && (
        <p id={DELETE_CONSEQUENCE_ID} role="status" aria-live="polite" className={controls.consequence}>
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
          rows={visibleRows}
          filterText={filterText}
          statusFilterLabel={statusFilter === "all" ? null : REPLY_STATUS_FILTER_LABELS[statusFilter]}
          onClearFilters={handleClearFilters}
          sort={sort}
          setSort={setSort}
          llmProvider={llmProvider}
          addressByName={composition.addressByName}
          reorderDisabled={statusFilter !== "all"}
          editReply={handleEditReply}
          moveRow={moveRow}
          onRemove={handleRemove}
          redraftRow={redraftRow}
          retryResources={retryResources}
          removeResource={removeResource}
          insertResource={handleInsertResourceForRow}
          searchRow={searchRow}
          handledAtById={handledAtById}
          skippedById={skippedById}
          onMarkHandled={markHandled}
          onToggleHandled={toggleHandled}
          onToggleSkip={toggleSkipped}
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
