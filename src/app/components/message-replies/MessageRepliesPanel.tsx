"use client";

// Manual > Recording > "Message replies" (M1-M19,
// docs/message-replies-acceptance-criteria.md). The ONLY import from
// useMessageReplies.ts (the orchestrator hook) - this panel takes
// exactly one prop, `active`, and owns no state of its own beyond arming,
// focus restoration and a couple of announcement helpers, mirroring
// DiscussionRepliesPanel.tsx's own header note on the same split (that file
// is this one's template end to end - see its own header for the fuller
// account of every idiom reused here unchanged: the live regions, the
// signature-based arming via isConfirmArmed, the keyed-ref focus
// restoration after a row removal or a whole-table delete, the throttled
// capture-status region, the downloadable-log handler).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import { fmt } from "../recording/types";
import { isConfirmArmed } from "../content-tab/modules/confirmArming";
import { variantFor } from "../ui/buttonVariant";
import { visuallyHidden } from "../ui/visuallyHidden";
import RunLogRow from "../recording/RunLogRow";
import CarriedKnowledgePages from "../recording/CarriedKnowledgePages";
import AddKnowledgePages from "../recording/AddKnowledgePages";
import { composeCaptureLiveSentence, useThrottledLiveSentence } from "../recording/captureLiveRegion";
import { triggerFileDownload } from "../course-planning/utils";
import { useMessageReplies } from "./useMessageReplies";
import MessageCaptureSettings from "./MessageCaptureSettings";
import MessageReplyToolbar from "./MessageReplyToolbar";
import MessageThreadTable from "./MessageThreadTable";
import { stoppedMessageSummarySentence } from "./useMessageSessionSummary";
import type { MessageThreadRow } from "./message-serialization";
import { latestIncoming } from "./message-thread";
import { MESSAGE_STATUS_FILTER_LABELS } from "./message-table-view";
import {
  formatMessageRepliesLogCsv,
  formatMessageRepliesLogJson,
  messageRepliesLogFileName,
  messageRepliesLogSummaryLine,
  summarizeMessageRepliesLog,
} from "./message-replies-log";

const DELETE_CONSEQUENCE_ID = "message-delete-table-consequence";

const THREAD_NOUN = { one: "thread", many: "threads" };

// M14's own eligibility for the toolbar's "Draft the missing replies"
// primary/count and its "Drafting N remaining" reason line - a LOCAL,
// intentional duplicate of useMessageReplies.ts's own private
// `isDraftAllPendingEligible` (that predicate is not part of
// UseMessageRepliesReturn, so this panel cannot import it; both read the
// same three fields the hook's own doc comment names, and the hook's own
// `draftAllPending` dispatch is what makes this count true - see that
// file's header for the exact rule this mirrors).
function isDraftAllPendingEligible(row: MessageThreadRow): boolean {
  return (
    (row.state === "pending" || row.state === "failed") &&
    !row.previewOnly &&
    !row.skipped &&
    latestIncoming(row) !== undefined // a thread of only the instructor's own messages has nothing to answer
  );
}

// M16's own "Save all as drafts (N)" eligibility - mirrors
// useMessageReplies.ts's own `saveAllDrafts` filter (matched, drafted,
// unsent, unsaved, unskipped), duplicated here for the same reason as
// `isDraftAllPendingEligible` above: the count this button shows must never
// disagree with what a click actually dispatches, and the filter itself is
// not exported.
function isSaveAllEligible(row: MessageThreadRow): boolean {
  return !!row.canvas && !!row.reply && !row.sent && !row.savedDraft && !row.skipped;
}

export default function MessageRepliesPanel({ active }: { active: boolean }) {
  const {
    courseId,
    setCourseId,
    courses,
    coursesLoading,
    coursesError,
    instructorName,
    setInstructorName,
    signoff,
    setSignoff,
    composition,
    setComposition,
    skipAnswered,
    setSkipAnswered,
    threadExpand,
    setThreadExpand,
    saveVideo,
    setSaveVideo,
    recordingUrl,
    recordingBytes,
    knowledgeContextLabel,
    knowledgeContext,
    setKnowledgeContext,
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
    rows,
    sort,
    setSort,
    filterText,
    setFilterText,
    searchInputRef,
    statusFilter,
    setStatusFilter,
    statusCounts,
    handleClearFilters,
    totalCount,
    rawRows,
    moveRow,
    editReply,
    removeRow,
    markHandled,
    toggleHandled,
    toggleSkipped,
    redraftRow,
    draftAllPending,
    clearTable,
    drafting,
    matchUnmatched,
    unmatchedCount,
    saveDraft,
    saveAllDrafts,
    savingDraftIds,
    send,
    checkSent,
    sendingIds,
    stoppedSummary,
    showNeverOpened,
    showPersistedBanner,
    showCapturingEmpty,
    showStoppedEmpty,
    outstandingHint,
    runLog,
  } = useMessageReplies(active);

  const handleDownloadLog = useCallback(
    (format: "csv" | "json") => {
      const now = new Date().toISOString();
      const text = format === "csv" ? formatMessageRepliesLogCsv(runLog) : formatMessageRepliesLogJson(runLog, { exportedAt: now });
      const filename = messageRepliesLogFileName(runLog.courseName, format, now);
      const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
      triggerFileDownload(new Blob([text], { type: mimeType }), filename);
    },
    [runLog]
  );

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
  const announce = useCallback((text: string) => setAdhocAnnouncement(text), []);

  const [copyError, setCopyError] = useState<string | null>(null);
  const handleCopyError = useCallback((text: string) => setCopyError(text), []);

  const captureSentence = composeCaptureLiveSentence({
    count: totalCount,
    noun: THREAD_NOUN,
    extracting,
    pendingFrames,
    stalled,
    capturing,
  });
  const liveSentence = useThrottledLiveSentence(captureSentence);

  const [deleteArmedFor, setDeleteArmedFor] = useState<string | null>(null);
  const deleteSignature = `${totalCount}|${recordingUrl ? "video" : "novideo"}`;
  const deleteArmed = isConfirmArmed(deleteArmedFor, deleteSignature);

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
      if (fallback) pendingFocusIdRef.current = fallback.id;
      else pendingFocusFallbackRef.current = true;
      removeRow(id);
    },
    [removeRow]
  );

  const handleClearTable = useCallback(() => {
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

  // searchInputRef is the hook's own (useMessageReplyFiltering.ts, threaded
  // through UseMessageRepliesReturn) - the one persistent element every
  // "clear the filter" control refocuses. No panel-local ref any more: a
  // second, separate useRef here would refocus nothing real, since the
  // toolbar's search TextField binds to the hook's own ref instance.

  // docs/recording-controls-ux-acceptance-criteria.md CC1: pendingEligible
  // reads rawRows (the unfiltered table) through the same predicate
  // draftAllPending itself dispatches with, never a raw state count that
  // would light a primary draftAllPending then refuses to act on.
  const pendingEligible = rawRows.filter(isDraftAllPendingEligible).length;
  const primaryAction: "draft" | null = capturing ? null : pendingEligible > 0 ? "draft" : null;
  const draftingRemaining = rawRows.filter((r) => (r.state === "pending" || r.state === "failed" || r.state === "drafting") && r.skipped !== true).length;
  const saveAllCount = rawRows.filter(isSaveAllEligible).length;

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Message replies</h2>
        <p className={styles.adaptPanelSubtitle}>
          Screen-record a student inbox while you scroll - the app reads every conversation off the screen and drafts
          a reply to each one.
        </p>
      </div>

      {notices.length > 0 && (
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

      <RunLogRow summary={messageRepliesLogSummaryLine(summarizeMessageRepliesLog(runLog))} onDownload={handleDownloadLog} />
      {outstandingHint && <p className={styles.fieldHint}>{outstandingHint}</p>}

      <MessageCaptureSettings
        courseId={courseId}
        setCourseId={setCourseId}
        courses={courses}
        coursesLoading={coursesLoading}
        coursesError={coursesError}
        saveVideo={saveVideo}
        setSaveVideo={setSaveVideo}
        composition={composition}
        onChangeComposition={setComposition}
        signoff={signoff}
        setSignoff={setSignoff}
        instructorName={instructorName}
        setInstructorName={setInstructorName}
        skipAnswered={skipAnswered}
        setSkipAnswered={setSkipAnswered}
        threadExpand={threadExpand}
        setThreadExpand={setThreadExpand}
      >
        {knowledgeContextLabel && (
          <p className={styles.fieldHint}>{`Drafting with Knowledge Base context: ${knowledgeContextLabel}.`}</p>
        )}
        <CarriedKnowledgePages context={knowledgeContext} onChange={setKnowledgeContext} />
        <AddKnowledgePages context={knowledgeContext} onChange={setKnowledgeContext} />
      </MessageCaptureSettings>

      {/* CC1 (docs/recording-controls-ux-acceptance-criteria.md): "a live
          capture beats everything" - while capturing, Stop capture IS the
          screen's one contained primary. Otherwise Start/Stop only becomes
          the primary once nothing else is: "Draft the missing replies"
          (MessageReplyToolbar.tsx) takes the primary whenever primaryAction
          is "draft", and Start capture fills the gap only when neither that
          nor a still-running drain has a claim on it - mirroring the
          discussion sibling's own CC1 formula (DiscussionRepliesPanel.tsx)
          bit for bit. buttonVariant.test.ts's frozen per-file count is 1 for
          this panel. */}
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

      <div className={controls.statusRow}>
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
            <span>{totalCount === 0 ? "Capturing - 0 threads so far." : `${totalCount} thread${totalCount === 1 ? "" : "s"} found`}</span>
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
        <p className={styles.fieldHint}>{stoppedMessageSummarySentence(stoppedSummary)}</p>
      )}
      {!capturing && stoppedSummary && droppedFrames > 0 && (
        <p className={styles.fieldHint}>
          Some of the screen scrolled past faster than it could be read. Scroll back over that section to catch it.
        </p>
      )}
      {recordingUrl && (
        <p className={styles.fieldHint}>
          <a href={recordingUrl} download="message-replies-capture.webm">
            {`Download recording (${(recordingBytes / 1048576).toFixed(1)} MB)`}
          </a>
        </p>
      )}

      {showNeverOpened && (
        <p className={styles.fieldHint}>No threads yet - start a capture, then scroll through your inbox in the other window.</p>
      )}
      {showPersistedBanner && (
        <p className={styles.fieldHint}>
          {`${totalCount} thread${totalCount === 1 ? "" : "s"} kept from an earlier session. They stay here until you delete the table.`}
        </p>
      )}
      {showCapturingEmpty && <p className={styles.fieldHint}>Threads appear here as you scroll past them in the other window.</p>}
      {showStoppedEmpty && (
        <p className={styles.fieldHint}>
          {`Capture stopped after ${fmt(stoppedSummary?.elapsedAtStop ?? elapsedSec)}. No threads were found. Check that you shared the window showing your inbox, and scroll through it while the capture is running.`}
        </p>
      )}
      {copyError && (
        <div className={`${controls.notice} ${controls.noticeDanger}`}>
          <span>{copyError}</span>
          <button type="button" className={styles.linkButton} onClick={() => setCopyError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className={styles.ghActions} ref={actionsContainerRef} tabIndex={-1}>
        {totalCount > 0 && (
          <MessageReplyToolbar
            totalCount={totalCount}
            visibleCount={rows.length}
            filterText={filterText}
            setFilterText={setFilterText}
            searchInputRef={searchInputRef}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            statusCounts={statusCounts}
            drafting={drafting}
            onDraftMissing={draftAllPending}
            primaryAction={primaryAction}
            draftingRemaining={draftingRemaining}
            unmatchedCount={unmatchedCount}
            onMatchUnmatched={matchUnmatched}
            saveAllCount={saveAllCount}
            onSaveAllDrafts={saveAllDrafts}
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
      {totalCount > 0 && deleteArmed && (
        <p id={DELETE_CONSEQUENCE_ID} role="status" aria-live="polite" className={controls.consequence}>
          {`This permanently deletes all ${totalCount} row${totalCount === 1 ? "" : "s"}${recordingUrl ? " and the saved recording" : ""}. This cannot be undone.`}
        </p>
      )}

      {totalCount > 0 && (
        <MessageThreadTable
          rows={rows}
          filterText={filterText}
          statusFilterLabel={statusFilter === "all" ? null : MESSAGE_STATUS_FILTER_LABELS[statusFilter]}
          onClearFilters={handleClearFilters}
          sort={sort}
          setSort={setSort}
          addressByName={composition.addressByName}
          threadExpand={threadExpand}
          reorderDisabled={statusFilter !== "all"}
          editReply={editReply}
          moveRow={moveRow}
          onRemove={handleRemove}
          redraftRow={redraftRow}
          onMarkHandled={markHandled}
          onToggleHandled={toggleHandled}
          onToggleSkip={toggleSkipped}
          savingDraftIds={savingDraftIds}
          onSaveDraft={saveDraft}
          sendingIds={sendingIds}
          onSend={send}
          onCheckSent={checkSent}
          registerRemoveRef={registerRemoveRef}
          announce={announce}
          onCopyError={handleCopyError}
        />
      )}

      <span role="status" aria-live="polite" style={visuallyHidden}>
        {liveSentence}
      </span>
      <span role="status" aria-live="polite" style={visuallyHidden}>
        {adhocAnnouncement}
      </span>
    </div>
  );
}
