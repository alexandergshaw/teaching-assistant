"use client";

// Group D's surface: draft, review, edit and post an announcement built
// from a recorded take. Deliberately NOT a modal - see the acceptance
// criteria's reasoning for the walkthrough pane, which applies here for the
// same reasons (a dialog's Escape-to-close would silently discard a drafted
// announcement, and the derived modal-adoption scan flags any new
// styles.previewBackdrop or role="dialog" site automatically). This file
// carries neither marker. It uses the Recording tab's own visual vocabulary
// (styles.adaptPanel, MUI Button size="small") rather than a second modal,
// matching GeneratedPreviewModal's confirm-panel idiom
// (content-tab/modules/GeneratedPostSection.tsx) without mounting that
// component itself - see that file's own reasons this was rejected.
//
// One instance of this panel serves N take rows, keyed by whichever take is
// currently open - mount this component with `key={take.id}` from the
// caller so every piece of local state (subject, body, course choice,
// pipeline progress) resets cleanly when a different take is opened,
// instead of this component trying to detect and reset that itself.

import { useEffect, useRef, useState } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import LinearProgress from "@mui/material/LinearProgress";
import styles from "../../page.module.css";
import controls from "./RecordingControls.module.css";
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
import RunLogRow from "./RunLogRow";
import {
  useTakeAnnouncement,
  type AnnouncementRecordingContext,
  type PostedAnnouncementInfo,
} from "./useTakeAnnouncement";
import AnnouncementCompositionControls from "./AnnouncementCompositionControls";
import type { Take } from "./types";
// docs/DEV_LOOP.md's "every feature needs a downloadable log" rule -
// collection lives in useTakeAnnouncement.ts (getAnnouncementLog); this
// panel only formats/downloads, mirroring GradingRecordingPanel.tsx and
// recording/DiscussionRepliesPanel.tsx's own identical split.
import {
  summarizeAnnouncementRunLog,
  announcementLogSummaryLine,
  formatAnnouncementLogCsv,
  formatAnnouncementLogJson,
  announcementLogFileName,
} from "./announcement-log";
import { triggerFileDownload } from "../course-planning/utils";

const POST_CONFIRM_CONSEQUENCE_ID = "take-announcement-post-confirm-consequence";
// CC5: Regenerate announcement is an arm/confirm ONLY once the instructor has
// hand-edited Subject/Message (fieldsTouched, set by those two fields' own
// onChange below, cleared whenever a regeneration - armed or not - actually
// runs). Its own consequence line, separate from the Post one above.
const REGEN_CONFIRM_CONSEQUENCE_ID = "take-announcement-regen-confirm-consequence";
// CC15: the pipeline LinearProgress has no accessible name of its own -
// points at the descriptive <p> already rendered beside it.
const PROGRESS_LABEL_ID = "take-announcement-progress-label";

export interface TakeAnnouncementPanelProps {
  /** The take being drafted for. Pass a fresh `take` object each time the
   * caller's own `takes` state updates it - the panel never reads a take
   * except through this prop. */
  take: Take;
  /** Same updater useTakes() returns. Used only to cache the transcript back
   * onto the take (AC24) via a functional update - never to add or remove
   * takes. */
  setTakes: React.Dispatch<React.SetStateAction<Take[]>>;
  /** F3 fix: RecordingTab's own id-keyed transcript cache, read once at
   * mount. Covers the case `setTakes` cannot - a library-sourced take (AC26)
   * is never added to the `takes` array, so without this every re-open paid
   * the full wall-clock `extractAudioOnly` cost again for the same file. */
  cachedTranscript?: string | null;
  /** Companion to `cachedTranscript` - called once, with this take's id and
   * the transcript, immediately after a complete successful transcription
   * pass (AC23d: never on a cancelled or failed one). */
  onTranscriptCached?: (takeId: string, transcript: string) => void;
  /** The recording's own topic/objectives/title-card context, gathered the
   * same way gatherRecordingContext() does for captions - folded into the
   * drafting prompt. */
  context: AnnouncementRecordingContext;
  /** Whether THIS take has already been posted, and what was sent - owned by
   * the caller (see this file's sibling useTakeAnnouncement.ts for why the
   * Take type itself carries no such field). Passing a non-null value here
   * renders the success view immediately and skips the pipeline entirely -
   * this is what makes "prevent a second post" (AC25f) survive the panel
   * being closed and reopened, not just a single mount. */
  posted: PostedAnnouncementInfo | null;
  /** Called exactly once, the moment a post succeeds. The caller is
   * responsible for remembering this (keyed by take id) and for rendering
   * the take row's "Announcement posted" badge from it - this panel has no
   * access to the takes list row itself. */
  onPosted: (result: PostedAnnouncementInfo) => void;
  /** Fired whenever the course picker changes, so the caller can persist the
   * choice - the write side of the recording tab's persisted course
   * selection belongs to the integration wave, not to this component. */
  onCourseIdChange?: (id: string) => void;
  /** "Back to takes". Closing does not need to warn: no destructive action
   * has happened yet unless a post already went through, and a post that
   * went through is exactly the case `posted` covers on the next open. */
  onClose: () => void;
}

function progressLabel(phase: string, chunk?: number, of?: number): string {
  if (phase === "preparing") return "Preparing audio…";
  if (phase === "transcribing") return `Transcribing - chunk ${chunk} of ${of}`;
  if (phase === "drafting") return "Writing the announcement…";
  return "Posting…";
}

export default function TakeAnnouncementPanel({
  take,
  setTakes,
  context,
  posted,
  onPosted,
  cachedTranscript,
  onTranscriptCached,
  onCourseIdChange,
  onClose,
}: TakeAnnouncementPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  const hook = useTakeAnnouncement({ take, setTakes, context, posted, onPosted, cachedTranscript, onTranscriptCached });
  const {
    stage,
    progress,
    liveRegionText,
    lastMessage,
    needsRealTimeConfirm,
    realTimeConfirmMessage,
    confirmRealTimeExtraction,
    cancelRealTimeConfirm,
    cancel,
    failedChunkNumber,
    retryFromFailedChunk,
    startOver,
    retryDraft,
    retryAudio,
    backToReviewAfterPostFailure,
    courses,
    coursesError,
    courseId,
    setCourseId,
    subject,
    setSubject,
    body,
    setBody,
    fieldError,
    armed,
    postUnavailableReason,
    handlePostButtonClick,
    cancelPostConfirm,
    posting,
    postError,
    saveDraft,
    savingDraft,
    draftSaved,
    draftError,
    composition,
    setComposition,
    imageState,
    imageBase64,
    imageMimeType,
    imageError,
    regenerateImage,
    discardImage,
    downloadImage,
    getAnnouncementLog,
  } = hook;

  // AC28 item 5: focus moves to the surface heading on open. Restoring focus
  // on close is the caller's job (it owns the keyed ref map back to whichever
  // take row's button opened this panel - see the modal-focus-restoration
  // doc's Decision 5, which this panel is one of the two surfaces it names).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Fixer pass finding 5: a successful post swaps this component from the
  // in-progress view to the posted view (the early return below) without a
  // remount, so the mount-only effect above never refires and focus is left
  // on whatever the pipeline last focused (or drops to <body> if that
  // element already unmounted). Refocus the heading whenever `posted`
  // transitions to truthy - harmless on the already-posted-on-open path too,
  // since it just repeats what the mount effect already did.
  useEffect(() => {
    if (posted) headingRef.current?.focus();
  }, [posted]);

  // docs/recording-controls-ux-acceptance-criteria.md CC5: Regenerate
  // announcement only arms once the instructor has edited Subject/Message -
  // a fresh, un-edited draft is a one-click regenerate with nothing to lose.
  const [fieldsTouched, setFieldsTouched] = useState(false);
  const [regenArmed, setRegenArmed] = useState(false);
  function handleRegenerateConfirm() {
    retryDraft();
    setFieldsTouched(false);
    setRegenArmed(false);
  }

  // Fixer pass finding 4: a new draft can also land via the failed-branch
  // recovery actions below (Start over, Try again on a draft failure) - not
  // just through Regenerate. Route those through this same fieldsTouched
  // reset so the next Regenerate does not arm over a draft the instructor
  // never actually edited.
  function handleStartOver() {
    startOver();
    setFieldsTouched(false);
  }
  function handleRetryDraft() {
    retryDraft();
    setFieldsTouched(false);
  }
  // Same reason as the two helpers above: a fresh draft lands from the
  // audio-retry path too, so the touched flag must clear or the next
  // Regenerate arms over a draft the instructor never edited.
  function handleRetryAudio() {
    retryAudio();
    setFieldsTouched(false);
  }

  function handleCourseChange(id: string) {
    setCourseId(id);
    onCourseIdChange?.(id);
  }

  // docs/DEV_LOOP.md's downloadable-log rule: rebuilt on every render (cheap
  // - getAnnouncementLog only spreads a handful of arrays that grow on a
  // real event) so the on-screen summary and a download click always agree.
  // Reachable from BOTH return branches below (the already-posted early
  // return and the main pipeline view) - a run that already succeeded is
  // still worth downloading, and so is one that never reached a post at all.
  const currentAnnouncementLog = getAnnouncementLog();
  const handleDownloadLog = (format: "csv" | "json") => {
    const now = new Date().toISOString();
    const text =
      format === "csv"
        ? formatAnnouncementLogCsv(currentAnnouncementLog)
        : formatAnnouncementLogJson(currentAnnouncementLog, { exportedAt: now });
    const filename = announcementLogFileName(currentAnnouncementLog.takeName, format, now);
    const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
    triggerFileDownload(new Blob([text], { type: mimeType }), filename);
  };
  const downloadLogRow = (
    <RunLogRow
      summary={announcementLogSummaryLine(summarizeAnnouncementRunLog(currentAnnouncementLog))}
      onDownload={handleDownloadLog}
    />
  );

  if (posted) {
    return (
      <div className={styles.adaptPanel}>
        <h2 ref={headingRef} tabIndex={-1} className={styles.adaptPanelTitle}>
          Announcement from {take.name}
        </h2>
        {/* docs/DEV_LOOP.md: "a downloadable log ... displayed in a
            prominent location" - reachable here too, not just the in-progress
            view below, since a run that already posted is still worth being
            able to download (what path did the transcription take, did the
            image upload fail while the text posted). */}
        {downloadLogRow}
        <p role="status" aria-live="polite">
          Posted to {posted.course}. Students can see it now.
        </p>
        <p className={styles.previewMeta}>Subject: {posted.subject}</p>
        <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>Announcement posted</span>
        <div>
          <Button size="small" variant="text" onClick={onClose}>
            Back to takes
          </Button>
        </div>
      </div>
    );
  }

  const busy = stage.phase === "preparing" || stage.phase === "transcribing" || stage.phase === "drafting";
  const canCancelPipeline = stage.phase === "preparing" || stage.phase === "transcribing";

  return (
    <div className={styles.adaptPanel}>
      <h2 ref={headingRef} tabIndex={-1} className={styles.adaptPanelTitle}>
        Announcement from {take.name}
      </h2>

      <div>
        <Button size="small" variant="text" onClick={onClose}>
          Back to takes
        </Button>
      </div>

      {/* docs/DEV_LOOP.md: "a downloadable log ... displayed in a prominent
          location". Placed immediately under the header/close controls,
          before every stage-specific view - never gated on `stage.phase` or
          on a post having happened, since a failed run (a draft failure, a
          transcription chunk that never recovered) is exactly when this
          needs to be reachable without hunting - mirrors
          GradingRecordingPanel.tsx/DiscussionRepliesPanel.tsx's own identical
          placement and reasoning. */}
      {downloadLogRow}

      {/* Throttled stage-transition / 25%-of-chunks announcements (AC23b) -
          visible, matching this repo's own precedent of a live region that is
          also on-screen text (GeneratedPostSection's confirm consequence
          paragraph) rather than an invented visually-hidden utility class. */}
      {liveRegionText && (
        <p role="status" aria-live="polite" className={styles.fieldHint}>
          {liveRegionText}
        </p>
      )}

      {lastMessage && <p className={styles.fieldHint}>{lastMessage}</p>}

      {progress && (
        <div>
          <LinearProgress
            variant={progress.value !== null ? "determinate" : "indeterminate"}
            value={progress.value !== null ? (progress.value / progress.max) * 100 : undefined}
            aria-valuemin={0}
            aria-valuemax={progress.max}
            aria-valuenow={progress.value ?? undefined}
            aria-valuetext={progress.valueText}
            aria-labelledby={PROGRESS_LABEL_ID}
          />
          <p id={PROGRESS_LABEL_ID} className={styles.fieldHint}>
            {stage.phase === "transcribing"
              ? progressLabel(stage.phase, stage.chunk, stage.of)
              : progressLabel(stage.phase)}
          </p>
        </div>
      )}

      {canCancelPipeline && (
        <div>
          <Button size="small" variant="text" onClick={cancel}>
            Cancel
          </Button>
        </div>
      )}

      {needsRealTimeConfirm && (
        <div role="status" className={`${controls.notice} ${controls.noticeWarning}`}>
          <p>{realTimeConfirmMessage}</p>
          <div className={styles.ghActions}>
            <Button size="small" variant="contained" onClick={confirmRealTimeExtraction}>
              Play it back
            </Button>
            <Button size="small" variant="text" onClick={cancelRealTimeConfirm}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {stage.phase === "failed" && (
        <div role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
          <p>{stage.message}</p>
          <div className={styles.ghActions}>
            {stage.stage === "audio" && (
              <Button size="small" variant="contained" onClick={handleRetryAudio}>
                Try again
              </Button>
            )}
            {stage.stage === "transcribe" && (
              <>
                <Button size="small" variant="contained" onClick={retryFromFailedChunk}>
                  Retry from chunk {failedChunkNumber}
                </Button>
                <Button size="small" variant="text" onClick={handleStartOver}>
                  Start over
                </Button>
              </>
            )}
            {stage.stage === "draft" && (
              <Button size="small" variant="contained" onClick={handleRetryDraft}>
                Try again
              </Button>
            )}
            {stage.stage === "post" && (
              <Button size="small" variant="contained" onClick={backToReviewAfterPostFailure}>
                Back to review
              </Button>
            )}
          </div>
        </div>
      )}

      {stage.phase === "noSpeech" && (
        <div>
          <p className={styles.fieldHint}>No speech was found in this recording.</p>
          <Button size="small" variant="contained" onClick={handleRetryAudio}>
            Try again
          </Button>
        </div>
      )}

      {(stage.phase === "review" || stage.phase === "posting") && (
        <>
          {/* Fixer pass finding 1: "Post to" and "Announcement style" are
              SIBLING sections, not nested - the course picker is a
              destination, not composition, and nesting rendered the child
              legend at the same weight as its parent with no hierarchy.
              docs/recording-controls-ux-acceptance-criteria.md CC2's order:
              Post to / Announcement style / Subject-Message (unchanged) /
              Image. The Subject/Message review fields below are NOT settings
              and keep their existing shape (CC2's own table entry for this
              surface). */}
          <fieldset className={controls.section}>
            <legend className={controls.sectionLegend}>Post to</legend>
            <div className={styles.adaptRow}>
              <TextField
                select
                size="small"
                label="Course"
                className={controls.fieldMd}
                value={courseId}
                onChange={(e) => handleCourseChange(e.target.value)}
                disabled={busy || posting}
              >
                {(courses ?? []).map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            </div>
            <p className={styles.fieldHint}>Only courses linked to Canvas can be posted to.</p>
            {coursesError && (
              <div role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
                {coursesError}
              </div>
            )}
          </fieldset>

          {/* docs/reply-composition-controls-acceptance-criteria.md C0-1
              (this group): the announcement composition controls, reused
              from the discussion side's vocabulary. Placed alongside the one
              control that actually re-runs drafting with the new settings -
              changing a control here never re-drafts by itself (see
              useTakeAnnouncement.ts's own note on this surface having no
              per-row arming to join), so a visible, explicit "Regenerate"
              action is what makes the controls reachable rather than dead. */}
          <fieldset className={controls.section}>
            <legend className={controls.sectionLegend}>Announcement style</legend>
            <AnnouncementCompositionControls composition={composition} onChange={setComposition} disabled={busy || posting} />
            <div className={styles.ghActions}>
              {/* Fixer pass finding 4: ConfirmArmButtons stays mounted for
                  both the untouched and the touched case - swapping it for
                  a plain Button when fieldsTouched flips (which
                  handleRegenerateConfirm's own setFieldsTouched(false)
                  triggers on confirm) unmounted the button under focus and
                  dropped focus to <body>. When fields are untouched, arming
                  performs the regeneration directly instead of showing a
                  confirm step (armed stays false) - a fresh, un-edited
                  draft has nothing to lose. */}
              <ConfirmArmButtons
                armed={fieldsTouched && regenArmed}
                idleLabel="Regenerate announcement"
                confirmLabel="Confirm regenerate"
                tone="warning"
                idleVariant="outlined"
                disabled={busy || posting}
                onArm={() => {
                  if (fieldsTouched) setRegenArmed(true);
                  else handleRegenerateConfirm();
                }}
                onConfirm={handleRegenerateConfirm}
                onCancel={() => setRegenArmed(false)}
                consequenceId={REGEN_CONFIRM_CONSEQUENCE_ID}
              />
              {!regenArmed && (
                <span className={styles.fieldHint}>Replaces the subject and message currently shown below.</span>
              )}
            </div>
            {regenArmed && (
              <p id={REGEN_CONFIRM_CONSEQUENCE_ID} role="status" aria-live="polite" className={controls.consequence}>
                This replaces your edited subject and message.
              </p>
            )}
          </fieldset>

          <TextField
            size="small"
            label="Subject"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setFieldsTouched(true);
            }}
            disabled={busy || posting}
            fullWidth
          />
          <TextField
            size="small"
            label="Message"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setFieldsTouched(true);
            }}
            disabled={busy || posting}
            multiline
            minRows={4}
            fullWidth
          />

          {/* Companion image (owner's ask: "a simple, everyday image that is
              relevant"). Entirely additive - imageState is independent of
              stage/subject/body, so nothing here ever blocks or disables
              posting, saving to drafts, or editing the text above. The image
              itself is never folded into `subject`/`body` (see
              useTakeAnnouncement.ts's own note and the source-text guard in
              useTakeAnnouncement.image-copy-safety.test.ts), so copying or
              saving the announcement text is unaffected by anything in this
              block.

              This image DOES post with the announcement now (see the note
              above imageState in useTakeAnnouncement.ts): a "ready" image at
              post time is uploaded to Canvas and embedded in the posted
              HTML with alt text, while the Subject/Message fields above stay
              plain text either way. If the upload fails, the announcement
              still posts as text only, and lastMessage (rendered below the
              controls) tells the instructor why. The line right below states
              this for every state (generating/ready/failed/idle), not just
              idle, so an instructor is never left assuming a "ready" image
              silently did or didn't make it in. Download remains available
              regardless - useful on its own, and the fallback when the
              upload fails. */}
          <fieldset className={controls.section}>
            <legend className={controls.sectionLegend}>Image</legend>
            <p className={styles.fieldHint}>
              A ready image posts with the announcement automatically (with
              alt text for screen readers) - the Subject and Message fields
              above stay plain text either way. If the upload to Canvas
              fails, the announcement still posts as text only, and you will
              be told why below. You can also download the image and attach
              it yourself wherever you are posting.
            </p>
            {imageState === "generating" && (
              <p role="status" aria-live="polite" className={styles.fieldHint}>
                Generating an image for this announcement…
              </p>
            )}
            {imageState === "ready" && imageBase64 && imageMimeType && (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element -- inline data-URL preview, not a remote image */}
                <img
                  src={`data:${imageMimeType};base64,${imageBase64}`}
                  alt=""
                  style={{ display: "block", maxWidth: "320px", width: "100%", borderRadius: "var(--radius-xs)", marginBottom: "var(--space-2)" }}
                />
                <div className={styles.ghActions}>
                  <Button size="small" variant="outlined" onClick={downloadImage}>
                    Download image
                  </Button>
                  <Button size="small" variant="outlined" onClick={regenerateImage} disabled={busy || posting}>
                    Regenerate image
                  </Button>
                  <Button size="small" variant="text" color="error" onClick={discardImage} disabled={busy || posting}>
                    Remove image
                  </Button>
                </div>
              </div>
            )}
            {imageState === "failed" && (
              <div className={controls.stack}>
                <div role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
                  {imageError}
                </div>
                <div className={styles.ghActions}>
                  <Button size="small" variant="outlined" onClick={regenerateImage} disabled={busy || posting}>
                    Try again
                  </Button>
                </div>
              </div>
            )}
            {imageState === "idle" && (
              <div className={controls.stack}>
                <span className={styles.fieldHint}>No image yet.</span>
                <div className={styles.ghActions}>
                  <Button size="small" variant="outlined" onClick={regenerateImage} disabled={busy || posting}>
                    Generate image
                  </Button>
                </div>
              </div>
            )}
          </fieldset>

          {fieldError && (
            <div role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
              {fieldError}
            </div>
          )}

          {armed && (
            <div className={`${controls.notice} ${controls.noticeWarning}`}>
              <p id={POST_CONFIRM_CONSEQUENCE_ID} role="status" aria-live="polite">
                Posting publishes this announcement to every student in {courses?.find((c) => c.id === courseId)?.name ?? "the course"} immediately - Canvas has no unpublished state for an announcement - and this app cannot recall or delete it afterward.
              </p>
              <p className={styles.previewMeta}>Subject that will be sent:</p>
              <code style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "var(--font-size-md)" }}>{subject}</code>
              <p className={styles.previewMeta}>Body that will be sent:</p>
              <code
                tabIndex={0}
                role="group"
                aria-label="Announcement preview"
                style={{
                  display: "block",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "var(--font-size-md)",
                  maxHeight: "180px",
                  overflow: "auto",
                }}
              >
                {body}
              </code>
            </div>
          )}

          {postError && (
            <div role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
              {postError}
            </div>
          )}

          <div className={`${styles.ghActions} ${controls.runRow}`}>
            <ConfirmArmButtons
              armed={armed}
              idleLabel="Post to Canvas"
              confirmLabel="Confirm post"
              tone="primary"
              idleVariant="contained"
              loading={posting}
              loadingLabel="Posting…"
              disabled={busy || Boolean(postUnavailableReason)}
              onArm={handlePostButtonClick}
              onConfirm={handlePostButtonClick}
              onCancel={cancelPostConfirm}
              consequenceId={POST_CONFIRM_CONSEQUENCE_ID}
            />
            <Button size="small" variant="outlined" loading={savingDraft} loadingPosition="start" onClick={saveDraft} disabled={busy || posting}>
              {savingDraft ? "Saving…" : "Save to drafts"}
            </Button>
            {draftSaved && <span className={styles.previewMeta}>Saved to drafts.</span>}
            {draftError && (
              <span role="alert" className={styles.previewMeta}>
                {draftError}
              </span>
            )}
          </div>
          {postUnavailableReason && <p className={styles.fieldHint}>{postUnavailableReason}</p>}
        </>
      )}
    </div>
  );
}
