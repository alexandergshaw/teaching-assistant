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

import { useEffect, useRef } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import LinearProgress from "@mui/material/LinearProgress";
import styles from "../../page.module.css";
import {
  useTakeAnnouncement,
  type AnnouncementRecordingContext,
  type PostedAnnouncementInfo,
} from "./useTakeAnnouncement";
import AnnouncementCompositionControls from "./AnnouncementCompositionControls";
import type { Take } from "./types";

const POST_CONFIRM_CONSEQUENCE_ID = "take-announcement-post-confirm-consequence";

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
  if (phase === "preparing") return "Preparing audio...";
  if (phase === "transcribing") return `Transcribing - chunk ${chunk} of ${of}`;
  if (phase === "drafting") return "Writing the announcement...";
  return "Posting...";
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
  } = hook;

  // AC28 item 5: focus moves to the surface heading on open. Restoring focus
  // on close is the caller's job (it owns the keyed ref map back to whichever
  // take row's button opened this panel - see the modal-focus-restoration
  // doc's Decision 5, which this panel is one of the two surfaces it names).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function handleCourseChange(id: string) {
    setCourseId(id);
    onCourseIdChange?.(id);
  }

  if (posted) {
    return (
      <div className={styles.adaptPanel}>
        <h2 ref={headingRef} tabIndex={-1} className={styles.adaptPanelTitle}>
          Announcement from {take.name}
        </h2>
        <p role="status" aria-live="polite">
          Posted to {posted.course}. Students can see it now.
        </p>
        <p className={styles.previewMeta}>Subject: {posted.subject}</p>
        <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>Announcement posted</span>
        <div>
          <Button size="small" variant="outlined" onClick={onClose}>
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
          />
          <p className={styles.fieldHint}>
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
        <div style={{ padding: "0.75rem 1rem", border: "1px solid var(--field-border)", background: "var(--warning-bg)" }}>
          <p style={{ margin: "0 0 8px 0" }}>{realTimeConfirmMessage}</p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
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
        <div role="alert">
          <p>{stage.message}</p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {stage.stage === "audio" && (
              <Button size="small" variant="outlined" onClick={retryAudio}>
                Try again
              </Button>
            )}
            {stage.stage === "transcribe" && (
              <>
                <Button size="small" variant="outlined" onClick={retryFromFailedChunk}>
                  Retry from chunk {failedChunkNumber}
                </Button>
                <Button size="small" variant="text" onClick={startOver}>
                  Start over
                </Button>
              </>
            )}
            {stage.stage === "draft" && (
              <Button size="small" variant="outlined" onClick={retryDraft}>
                Try again
              </Button>
            )}
            {stage.stage === "post" && (
              <Button size="small" variant="outlined" onClick={backToReviewAfterPostFailure}>
                Back to review
              </Button>
            )}
          </div>
        </div>
      )}

      {stage.phase === "noSpeech" && (
        <div>
          <p>No speech was found in this recording.</p>
          <Button size="small" variant="outlined" onClick={retryAudio}>
            Try again
          </Button>
        </div>
      )}

      {(stage.phase === "review" || stage.phase === "posting") && (
        <>
          <TextField
            select
            size="small"
            label="Course"
            value={courseId}
            onChange={(e) => handleCourseChange(e.target.value)}
            disabled={busy || posting}
            sx={{ minWidth: 240 }}
          >
            {(courses ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <p className={styles.fieldHint}>Only courses linked to Canvas can be posted to.</p>
          {coursesError && (
            <p role="alert" className={styles.fieldHint}>
              {coursesError}
            </p>
          )}

          {/* docs/reply-composition-controls-acceptance-criteria.md C0-1
              (this group): the announcement composition controls, reused
              from the discussion side's vocabulary. Placed after the course
              picker and before subject/body, alongside the one control that
              actually re-runs drafting with the new settings - changing a
              control here never re-drafts by itself (see useTakeAnnouncement
              .ts's own note on this surface having no per-row arming to
              join), so a visible, explicit "Regenerate" action is what makes
              the controls reachable rather than dead. */}
          <div>
            <p className={styles.ghMeta} style={{ marginBottom: 8 }}>
              Announcement style
            </p>
            <AnnouncementCompositionControls composition={composition} onChange={setComposition} disabled={busy || posting} />
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: 8, flexWrap: "wrap" }}>
              <Button size="small" variant="outlined" onClick={retryDraft} disabled={busy || posting}>
                Regenerate announcement
              </Button>
              <span className={styles.fieldHint}>Replaces the subject and body currently shown below.</span>
            </div>
          </div>

          <TextField
            size="small"
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={busy || posting}
            fullWidth
          />
          <TextField
            size="small"
            label="Message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
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

              This image never posts with the announcement - see the
              IMPORTANT note above imageState in useTakeAnnouncement.ts for
              why (the plain-text-copyable constraint, and why a Canvas
              attach is out of scope for this wave). The line right below is
              the one place that fact is stated for the instructor, so it
              stays visible for every state (generating/ready/failed/idle),
              not just idle - an instructor who never sees this line and
              assumes a "ready" image posts automatically is exactly the
              failure this exists to prevent. */}
          <div>
            <p className={styles.ghMeta} style={{ marginBottom: 8 }}>
              Image
            </p>
            <p className={styles.fieldHint} style={{ marginBottom: 8 }}>
              This image never posts with the announcement - the announcement
              itself stays plain text. Download it and attach it yourself
              wherever you are posting.
            </p>
            {imageState === "generating" && (
              <p role="status" aria-live="polite" className={styles.fieldHint}>
                Generating an image for this announcement...
              </p>
            )}
            {imageState === "ready" && imageBase64 && imageMimeType && (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element -- inline data-URL preview, not a remote image */}
                <img
                  src={`data:${imageMimeType};base64,${imageBase64}`}
                  alt=""
                  style={{ display: "block", maxWidth: "320px", width: "100%", borderRadius: 4, marginBottom: 8 }}
                />
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <Button size="small" variant="outlined" onClick={downloadImage}>
                    Download image
                  </Button>
                  <Button size="small" variant="outlined" onClick={regenerateImage} disabled={busy || posting}>
                    Regenerate image
                  </Button>
                  <Button size="small" variant="text" onClick={discardImage} disabled={busy || posting}>
                    Remove image
                  </Button>
                </div>
              </div>
            )}
            {imageState === "failed" && (
              <div>
                <p role="alert" className={styles.fieldHint}>
                  {imageError}
                </p>
                <Button size="small" variant="outlined" onClick={regenerateImage} disabled={busy || posting}>
                  Try again
                </Button>
              </div>
            )}
            {imageState === "idle" && (
              <div>
                <span className={styles.fieldHint}>No image yet.</span>
                <div style={{ marginTop: 8 }}>
                  <Button size="small" variant="outlined" onClick={regenerateImage} disabled={busy || posting}>
                    Generate image
                  </Button>
                </div>
              </div>
            )}
          </div>

          {fieldError && (
            <p role="alert" className={styles.fieldHint}>
              {fieldError}
            </p>
          )}

          {armed && (
            <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid var(--field-border)", background: "var(--warning-bg)" }}>
              <p id={POST_CONFIRM_CONSEQUENCE_ID} role="status" aria-live="polite" style={{ margin: "0 0 8px 0", fontSize: "14px" }}>
                Posting publishes this announcement to every student in {courses?.find((c) => c.id === courseId)?.name ?? "the course"} immediately - Canvas has no unpublished state for an announcement - and this app cannot recall or delete it afterward.
              </p>
              <p className={styles.previewMeta} style={{ margin: "0 0 4px" }}>
                Subject that will be sent:
              </p>
              <code style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.85rem" }}>{subject}</code>
              <p className={styles.previewMeta} style={{ margin: "8px 0 4px" }}>
                Body that will be sent:
              </p>
              <code
                style={{
                  display: "block",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "0.85rem",
                  maxHeight: "180px",
                  overflow: "auto",
                }}
              >
                {body}
              </code>
            </div>
          )}

          {postError && (
            <p role="alert" className={styles.fieldHint}>
              {postError}
            </p>
          )}

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            {armed && (
              <Button size="small" variant="text" onClick={cancelPostConfirm} disabled={posting}>
                Cancel
              </Button>
            )}
            <Button
              size="small"
              variant="contained"
              color="primary"
              disabled={posting || busy || Boolean(postUnavailableReason)}
              onClick={handlePostButtonClick}
              aria-describedby={armed ? POST_CONFIRM_CONSEQUENCE_ID : undefined}
            >
              {posting ? "Posting..." : armed ? "Confirm post" : "Post to Canvas"}
            </Button>
            <Button size="small" variant="outlined" onClick={saveDraft} disabled={busy || posting || savingDraft}>
              {savingDraft ? "Saving..." : "Save to drafts"}
            </Button>
            {postUnavailableReason && <span className={styles.previewMeta}>{postUnavailableReason}</span>}
            {draftSaved && <span className={styles.previewMeta}>Saved to drafts.</span>}
            {draftError && (
              <span role="alert" className={styles.previewMeta}>
                {draftError}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
