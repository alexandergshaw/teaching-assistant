"use client";

import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";
import { fmt } from "./types";
import {
  AVATAR_CONSENT_ACKNOWLEDGEMENT,
  AVATAR_SAMPLE_MAX_BYTES,
  AVATAR_SCRIPT_STAGES,
  AVATAR_MIN_FRAME_RATE,
} from "./avatar-script";
// AC4.3's soft cap lives in src/lib/tavus.ts (see useAvatarStudio.ts's import
// comment) - shown here for the character counter, not duplicated.
import { TAVUS_SCRIPT_MAX_CHARS } from "@/lib/tavus";
import type { AvatarLikeness } from "@/lib/avatar-likeness";
// The purpose dropdown maps this catalogue directly rather than hand-writing
// a parallel option list - see useAvatarStudio.ts's import comment for why
// two copies of "the" purpose list would be free to drift apart.
import { AVATAR_VIDEO_PURPOSES } from "@/lib/avatar-video-purpose";
import type { UseDevicesReturn } from "./useDevices";
import type { UseAvatarStudioReturn } from "./useAvatarStudio";

interface AvatarStudioPanelProps {
  devices: UseDevicesReturn["devices"];
  requestAccess: UseDevicesReturn["requestAccess"];
  avatarStudio: UseAvatarStudioReturn;
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Plain-language status for a likeness row. `errorMessage` is expected to
 * already be plain language (see src/lib/tavus.ts's failure-code mapping) -
 * this just supplies copy for the non-failure states. */
function likenessStatusText(l: AvatarLikeness): string {
  switch (l.status) {
    case "pending":
      return "Queued - training has not started yet.";
    case "training":
      // trainingProgress is Tavus's raw progress string (e.g. "42/100"),
      // shown as-is - DISPLAY ONLY, see AvatarLikeness.trainingProgress's
      // own comment for why this must never be used to infer a stall.
      return l.trainingProgress
        ? `Training in progress (${l.trainingProgress}). This takes 3 to 4 hours - you do not need to keep this tab open.`
        : "Training in progress. This takes 3 to 4 hours - you do not need to keep this tab open.";
    case "ready":
      return "Ready to generate videos.";
    case "failed":
      return l.errorMessage || "Training failed.";
    case "superseded":
      return "Replaced by a newer training attempt.";
    default:
      return l.status;
  }
}

export default function AvatarStudioPanel({
  devices,
  requestAccess,
  avatarStudio,
}: AvatarStudioPanelProps) {
  const {
    configured,
    cameraId,
    setCameraId,
    micId,
    setMicId,
    videoRef,
    captureState,
    captureError,
    stageIndex,
    stage,
    isLastStage,
    stageElapsed,
    takeElapsed,
    takeBytes,
    mimeChoice,
    frameRateAssessment,
    capturePreviewStarting,
    resolutionWarning,
    reviewUrl,
    reviewDurationSec,
    reviewSizeBytes,
    meetsMinDuration,
    withinSizeCap,
    startCapturePreview,
    startCaptureRecording,
    advanceStage,
    cancelRecording,
    discardTake,
    likenessName,
    setLikenessName,
    saveState,
    saveError,
    savedSample,
    saveTake,
    consentChecked,
    setConsentChecked,
    trainBusy,
    trainError,
    startTraining,
    likenesses,
    likenessesError,
    likenessesLoaded,
    activeTraining,
    defaultReadyLikeness,
    setDefaultLikeness,
    deleteLikeness,
    courseId,
    setCourseId,
    courses,
    coursesError,
    purpose,
    setPurpose,
    prompt,
    setPrompt,
    script,
    setScript,
    scriptBusy,
    scriptError,
    generateScript,
    videoStatus,
    videoBusy,
    videoError,
    videoFileId,
    startVideo,
  } = avatarStudio;

  const totalTargetSeconds = AVATAR_SCRIPT_STAGES.reduce((sum, s) => sum + s.targetSeconds, 0);
  const canRecordMore = captureState === "recording" && !isLastStage;
  const disableDeviceSelects = captureState !== "idle";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {configured === false && (
        <div className={styles.adaptPanel}>
          <p className={styles.error} style={{ margin: 0 }}>
            Avatar Studio is not configured. Set the <code>TAVUS_API_KEY</code> environment variable on the server to enable
            it.
          </p>
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Training a custom face also requires a paid Tavus plan - the free tier cannot train likenesses, so a
            401 or 403 here does not mean the integration is broken.
          </p>
        </div>
      )}

      <div className={styles.adaptPanel}>
        <div className={styles.adaptPanelHeader}>
          <h2 className={styles.adaptPanelTitle}>Record a guided sample</h2>
          <p className={styles.adaptPanelSubtitle}>
            Read a short passage, then hold still and silent - about {fmt(totalTargetSeconds)} total. This take is
            recorded from your camera exactly as-is: background effects, mirroring, annotations, the webcam bubble
            and title cards are all turned off here so nothing alters your appearance in the training footage.
          </p>
        </div>

        {captureError && <p className={styles.error}>{captureError}</p>}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          <TextField
            select
            label="Camera"
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            size="small"
            sx={{ minWidth: 200 }}
            disabled={disableDeviceSelects}
          >
            {devices.cameras.length === 0 && <MenuItem value="">No cameras found</MenuItem>}
            {cameraId && !devices.cameras.some((cam) => cam.deviceId === cameraId) && (
              <MenuItem value={cameraId}>(Disconnected)</MenuItem>
            )}
            {devices.cameras.map((cam) => (
              <MenuItem key={cam.deviceId} value={cam.deviceId}>
                {cam.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Microphone"
            value={micId}
            onChange={(e) => setMicId(e.target.value)}
            size="small"
            sx={{ minWidth: 200 }}
            disabled={disableDeviceSelects}
          >
            <MenuItem value="">System default</MenuItem>
            {micId && !devices.mics.some((mic) => mic.deviceId === micId) && (
              <MenuItem value={micId}>(Disconnected)</MenuItem>
            )}
            {devices.mics.map((mic) => (
              <MenuItem key={mic.deviceId} value={mic.deviceId}>
                {mic.label}
              </MenuItem>
            ))}
          </TextField>
          {devices.cameras.length === 0 && (
            <Button variant="outlined" size="small" onClick={() => void requestAccess()}>
              Grant camera and microphone access
            </Button>
          )}
        </div>

        <div style={{ position: "relative", borderRadius: "var(--radius-md)", overflow: "hidden", background: "var(--navy)" }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              display: captureState === "idle" || captureState === "reviewing" ? "none" : "block",
              width: "100%",
              maxHeight: "48vh",
              objectFit: "contain",
              background: "var(--navy)",
            }}
          />
          {captureState === "reviewing" && reviewUrl && (
            <video
              controls
              src={reviewUrl}
              style={{ width: "100%", maxHeight: "48vh", background: "var(--navy)", display: "block" }}
            />
          )}
        </div>

        <p className={styles.fieldHint} style={{ margin: 0, fontWeight: 600, color: "var(--text-primary)" }}>
          Status:{" "}
          {captureState === "idle" && "Camera off."}
          {captureState === "previewing" && "Preview running - not recording."}
          {captureState === "recording" && "Recording."}
          {captureState === "reviewing" && "Reviewing your take."}
        </p>

        {(captureState === "recording") && (
          <div role="group" aria-labelledby="avatar-stage-heading" className={styles.field} style={{ gap: "var(--space-2)" }}>
            <div aria-live="polite">
              <h3 id="avatar-stage-heading" style={{ margin: 0, fontSize: "var(--font-size-lg)" }}>
                {`Stage ${stageIndex + 1} of ${AVATAR_SCRIPT_STAGES.length}: ${stage.label}`}
              </h3>
            </div>
            <p style={{ margin: 0 }}>{stage.instruction}</p>
            {stage.body && (
              <div
                tabIndex={0}
                style={{
                  maxHeight: 160,
                  overflowY: "auto",
                  padding: "var(--space-3) var(--space-4)",
                  borderRadius: "var(--radius-sm)",
                  background: "color-mix(in srgb, var(--field-border) 18%, transparent)",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                }}
              >
                {stage.body}
              </div>
            )}
            {/* fontWeight 700 is reserved for h1/h2 and the tracked-uppercase
                label idiom; this elapsed-time readout is neither, so 600
                (the next weight down) replaces it. */}
            <p aria-describedby="avatar-stage-heading" className={styles.ghMetaMono} style={{ margin: 0, fontSize: "var(--font-size-xl)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {`Elapsed ${fmt(stageElapsed)} of target ${fmt(stage.targetSeconds)}`}
            </p>
          </div>
        )}

        {/* Verdict text lives in an aria-live region, matching this panel's
            own existing precedent for the stage heading above. */}
        <div aria-live="polite">
          {(captureState === "previewing" || captureState === "recording") && !frameRateAssessment && (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              Checking the camera&apos;s frame rate...
            </p>
          )}
          {(captureState === "previewing" || captureState === "recording") &&
            frameRateAssessment?.status === "ok" && (
              <p className={styles.fieldHint} style={{ margin: 0 }}>
                Frame rate looks good - {frameRateAssessment.source === "measured" ? "measured" : "reported"} at
                about {frameRateAssessment.rate}fps, above the {AVATAR_MIN_FRAME_RATE}fps minimum Tavus requires.
              </p>
            )}
          {(captureState === "previewing" || captureState === "recording") &&
            frameRateAssessment?.status === "warn" && (
              <p className={styles.fieldHint} style={{ color: "var(--warning)", margin: 0 }}>
                {frameRateAssessment.reason}
              </p>
            )}
          {(captureState === "previewing" || captureState === "recording") &&
            frameRateAssessment?.status === "unknown" && (
              <p className={styles.fieldHint} style={{ color: "var(--warning)", margin: 0 }}>
                {frameRateAssessment.reason}
              </p>
            )}
          {(captureState === "previewing" || captureState === "recording") &&
            frameRateAssessment?.status === "block" && <p className={styles.error}>{frameRateAssessment.reason}</p>}
        </div>

        {(captureState === "previewing" || captureState === "recording") && resolutionWarning && (
          <p className={styles.fieldHint} style={{ color: "var(--warning)", margin: 0 }}>
            {resolutionWarning}
          </p>
        )}

        {mimeChoice?.isRiskyCodec && captureState !== "idle" && (
          <p className={styles.fieldHint} style={{ color: "var(--warning)", margin: 0 }}>
            This browser could only offer a VP8/VP9 webm recording. Tavus documents an H.264 requirement, so
            training may reject this file after the multi-hour wait - a recent Chrome or Edge is more likely to
            offer H.264 directly.
          </p>
        )}

        <div className={styles.ghActions}>
          {captureState === "idle" && (
            <Button
              variant="contained"
              disabled={capturePreviewStarting}
              onClick={() => void startCapturePreview()}
            >
              {capturePreviewStarting ? "Starting..." : "Start camera"}
            </Button>
          )}
          {captureState === "previewing" && (
            <Button variant="contained" onClick={startCaptureRecording}>
              Start recording
            </Button>
          )}
          {captureState === "recording" && (
            <>
              {canRecordMore && (
                <Button variant="contained" onClick={advanceStage}>
                  Next: {AVATAR_SCRIPT_STAGES[stageIndex + 1]?.label}
                </Button>
              )}
              {!canRecordMore && (
                <span className={styles.ghMeta}>Recording stops on its own once this stage reaches its target.</span>
              )}
              <Button variant="text" color="error" onClick={cancelRecording}>
                Cancel take
              </Button>
            </>
          )}
          {captureState === "reviewing" && (
            <>
              <span className={styles.ghMeta}>
                {fmt(reviewDurationSec)} recorded · {mb(reviewSizeBytes)}
              </span>
              <Button variant="text" onClick={discardTake}>
                Discard and retake
              </Button>
            </>
          )}
        </div>

        {captureState === "recording" && (
          <p className={styles.ghMeta}>
            Total take so far: {fmt(takeElapsed)} · {mb(takeBytes)}
          </p>
        )}

        {captureState === "reviewing" && !meetsMinDuration && (
          <p className={styles.error}>
            This take is shorter than the required {fmt(totalTargetSeconds)} (speaking and stillness together) - it
            cannot be used for training. Discard it and record a full take.
          </p>
        )}
        {captureState === "reviewing" && !withinSizeCap && (
          <p className={styles.error}>
            This take is larger than the {Math.round(AVATAR_SAMPLE_MAX_BYTES / (1024 * 1024))} MB limit Tavus allows
            for training footage. Discard it and record a shorter take.
          </p>
        )}
        {captureState === "reviewing" && frameRateAssessment?.status === "block" && (
          <p className={styles.error}>{frameRateAssessment.reason}</p>
        )}

        {captureState === "reviewing" && !savedSample && (
          <div className={styles.ghActions}>
            <Button
              variant="contained"
              disabled={
                saveState === "saving" ||
                !meetsMinDuration ||
                !withinSizeCap ||
                frameRateAssessment?.status === "block"
              }
              onClick={() => void saveTake()}
            >
              {saveState === "saving" ? "Saving..." : "Save to library"}
            </Button>
          </div>
        )}
        {saveState === "failed" && saveError && <p className={styles.error}>{saveError}</p>}
        {savedSample && <p className={styles.fieldHint}>Saved to the Files tab as &quot;{savedSample.name}&quot;.</p>}
      </div>

      {savedSample && (
        <div className={styles.adaptPanel}>
          <div className={styles.adaptPanelHeader}>
            <h2 className={styles.adaptPanelTitle}>Train a likeness</h2>
            <p className={styles.adaptPanelSubtitle}>
              Training takes 3 to 4 hours once started. You do not need to keep this tab open - come back later and
              the status below will reflect where things stand.
            </p>
          </div>

          {mimeChoice?.isRiskyCodec && (
            <p className={styles.fieldHint} style={{ color: "var(--warning)", margin: 0 }}>
              This sample was recorded as VP8/VP9 webm, which Tavus may reject after the multi-hour wait. Consider
              retaking it in a browser that offers H.264 before spending a training slot on it.
            </p>
          )}

          {activeTraining ? (
            <p className={styles.fieldHint}>
              A likeness (&quot;{activeTraining.name}&quot;) is already training. Only one training run can be in
              flight at a time - wait for it to finish or fail before starting another.
            </p>
          ) : (
            <>
              <TextField
                label="Likeness name"
                size="small"
                value={likenessName}
                onChange={(e) => setLikenessName(e.target.value)}
                sx={{ maxWidth: 320 }}
              />
              <FormControlLabel
                control={<Checkbox checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />}
                label={AVATAR_CONSENT_ACKNOWLEDGEMENT}
              />
              <div className={styles.ghActions}>
                <Button
                  variant="contained"
                  disabled={trainBusy || !consentChecked || configured === false}
                  onClick={() => void startTraining()}
                >
                  {trainBusy ? "Starting..." : "Start training"}
                </Button>
              </div>
              {trainError && <p className={styles.error}>{trainError}</p>}
            </>
          )}
        </div>
      )}

      <div className={styles.ghPanel}>
        <h2 className={styles.adaptPanelTitle}>Your likenesses</h2>
        {likenessesError && <p className={styles.error}>{likenessesError}</p>}
        {!likenessesLoaded && !likenessesError && (
          <p className={styles.fieldHint} role="status" aria-live="polite">Loading your likenesses...</p>
        )}
        {likenessesLoaded && likenesses.length === 0 && !likenessesError && (
          <p className={styles.fieldHint}>No likenesses yet - record and save a sample above to train one.</p>
        )}
        {likenesses.map((l) => (
          <div key={l.id} className={styles.ghRow}>
            <div className={styles.ghRowTop}>
              <div className={styles.ghRowTitle}>
                <span className={styles.ghRowName}>{l.name}</span>
              </div>
              <div className={styles.ghActions}>
                {l.status === "ready" && !l.isDefault && (
                  <Button size="small" variant="outlined" onClick={() => void setDefaultLikeness(l.id)}>
                    Make default
                  </Button>
                )}
                <Button size="small" variant="outlined" color="error" onClick={() => void deleteLikeness(l.id)}>
                  Delete
                </Button>
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
              <span className={styles.ghMeta}>{likenessStatusText(l)}</span>
              {l.isDefault && <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>Default</span>}
              {l.status === "ready" && <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>Ready</span>}
              {l.status === "training" && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Training</span>}
              {l.status === "pending" && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Pending</span>}
              {l.status === "failed" && <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>Failed</span>}
              {l.status === "superseded" && <span className={styles.ghBadge}>Superseded</span>}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.adaptPanel}>
        <div className={styles.adaptPanelHeader}>
          <h2 className={styles.adaptPanelTitle}>Generate a video</h2>
          <p className={styles.adaptPanelSubtitle}>
            Describe what you want your avatar to say, review the script, then render it in your voice and likeness.
          </p>
        </div>

        {!defaultReadyLikeness && (
          <p className={styles.fieldHint}>
            No likeness is ready yet - train one above and mark it as default before generating a video.
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          <TextField
            select
            label="Course"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            size="small"
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">No course</MenuItem>
            {courses.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            size="small"
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">No specific purpose</MenuItem>
            {AVATAR_VIDEO_PURPOSES.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                {p.label}
              </MenuItem>
            ))}
          </TextField>
        </div>
        {coursesError && <p className={styles.error}>{coursesError}</p>}

        <TextField
          label="Prompt"
          multiline
          minRows={2}
          fullWidth
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          size="small"
        />
        <div className={styles.ghActions}>
          <Button
            variant="contained"
            size="small"
            disabled={scriptBusy || !prompt.trim() || configured === false}
            onClick={() => void generateScript()}
          >
            {scriptBusy ? "Writing..." : script ? "Regenerate script" : "Generate script"}
          </Button>
        </div>
        {scriptError && <p className={styles.error}>{scriptError}</p>}

        {script && (
          <>
            <TextField
              multiline
              minRows={4}
              fullWidth
              value={script}
              onChange={(e) => setScript(e.target.value)}
              size="small"
            />
            <span className={styles.ghMeta}>
              {script.length} / {TAVUS_SCRIPT_MAX_CHARS} characters - this app limits generated scripts to{" "}
              {TAVUS_SCRIPT_MAX_CHARS} characters (Tavus itself documents no script length limit).
            </span>
            <div className={styles.ghActions}>
              <Button
                variant="contained"
                disabled={
                  videoBusy ||
                  !script.trim() ||
                  script.length > TAVUS_SCRIPT_MAX_CHARS ||
                  !defaultReadyLikeness ||
                  configured === false
                }
                onClick={() => void startVideo()}
              >
                {videoBusy ? "Rendering..." : "Render video"}
              </Button>
            </div>
            {videoBusy && videoStatus && <p className={styles.ghMeta}>Provider status: {videoStatus}</p>}
            {videoError && <p className={styles.error}>{videoError}</p>}
            {videoFileId && <p className={styles.fieldHint}>Saved to the Files tab - it is playable there like any other recording.</p>}
          </>
        )}
      </div>
    </div>
  );
}
