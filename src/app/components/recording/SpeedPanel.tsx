"use client";

// The "Change speed" inner view of the Recording tab: watch a picked video
// back, choose a speed multiplier, see the honest wall-clock cost, and save
// the re-encoded copy to the Files tab. See
// docs/video-speed-adjust-acceptance-criteria.md.
//
// Source picking reuses useVideoImport() exactly as CaptionStudio.tsx does -
// session take / backup folder / library file - via a sibling markup
// implementation of VideoSource's three lists (VideoSource itself is
// Caption-Studio-shaped and not reusable as a component here). All of the
// speed-specific state (rate, render/save state machine, progress, errors)
// lives in useVideoSpeed.ts.

import { useCallback, useEffect, useRef } from "react";
import { Button, TextField } from "@mui/material";
import type { DirHandle } from "@/lib/backup-dir";
import { SPEED_RATES, formatSpeedLabel } from "@/lib/video-speed";
import { useVideoImport } from "../caption-studio/hooks/useVideoImport";
import { useVideoSpeed, KEEP_OPEN_WARNING, PITCH_FALLBACK_MESSAGE } from "./useVideoSpeed";
import { fmt, type Take } from "./types";
import { getDisplayKind } from "../files/helpers";
import styles from "../../page.module.css";

// There is deliberately no `active` prop. An earlier draft of the AC had this
// view move focus to its heading when switched to, "matching the other inner
// views" - a premise that was simply false: none of Record, Caption a video,
// Narrate a deck or Avatar moves focus on switch. Switching here is a TAB
// activation, so stealing focus would take it off the tab strip and single
// this one view out for surprising behaviour. The take-scoped panes that DO
// move focus (WalkthroughPanel, TakeAnnouncementPanel) open from a button in a
// row rather than from a tab, so focus has to go somewhere. AC16 item 5 is
// marked WITHDRAWN for this reason; do not reinstate the prop.
interface SpeedPanelProps {
  takes: Take[];
  backupDir: DirHandle | null;
}

export default function SpeedPanel({ takes, backupDir }: SpeedPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);

  const videoImport = useVideoImport();
  const speed = useVideoSpeed({ videoUrl: videoImport.videoUrl, fileName: videoImport.fileName });

  // AC10/AC1c: the preview is a live canary for the pitch-preservation risks
  // in the Mechanism section - the user hears the chosen rate before
  // committing five to eighty minutes. Never call createMediaElementSource
  // on this element (trap 7): it must keep playing through the speakers.
  const applyPreviewRate = useCallback(() => {
    const el = previewRef.current;
    if (!el) return;
    el.playbackRate = speed.rate;
    const withPitch = el as HTMLVideoElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean };
    if ("preservesPitch" in withPitch) withPitch.preservesPitch = true;
    if ("webkitPreservesPitch" in withPitch) withPitch.webkitPreservesPitch = true;
  }, [speed.rate]);

  useEffect(() => {
    applyPreviewRate();
  }, [applyPreviewRate, videoImport.videoUrl]);

  const hasSource = videoImport.videoUrl !== null;

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>
          Change a video&apos;s speed
        </h2>
      </div>

      <div className={styles.field}>
        <p className={styles.adaptPanelSubtitle} style={{ marginBottom: "var(--space-2)" }}>
          1. Video source
        </p>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="outlined" size="small" disabled={speed.busy} onClick={() => fileInputRef.current?.click()}>
            Choose video
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            style={{ display: "none" }}
            onChange={videoImport.handleFileChange}
          />
          {videoImport.fileName && (
            <TextField
              size="small"
              label="Video name"
              value={videoImport.fileName}
              disabled={speed.busy}
              onChange={(e) => videoImport.setFileName(e.target.value)}
              sx={{ width: 200 }}
            />
          )}
        </div>

        {videoImport.importError && <p className={styles.error}>{videoImport.importError}</p>}

        <div style={{ marginTop: "var(--space-4)" }}>
          <p className={styles.fieldHint} style={{ margin: "0 0 var(--space-2) 0" }}>
            Or import a saved video:
          </p>

          <div style={{ marginTop: "var(--space-2)" }}>
            <p className={styles.fieldHint} style={{ margin: "0 0 var(--space-2) 0", fontWeight: 600 }}>
              From the Files tab
            </p>
            {videoImport.libraryBusy && !videoImport.libraryVideos && (
              <p className={styles.fieldHint} role="status" aria-live="polite" style={{ margin: 0 }}>Loading your library…</p>
            )}
            {videoImport.libraryVideos && videoImport.libraryVideos.length === 0 && (
              <p className={styles.fieldHint} style={{ margin: 0 }}>
                No saved videos yet - record one on the Recording tab or upload on the Files tab.
              </p>
            )}
            <Button variant="text" size="small" disabled={videoImport.libraryBusy} onClick={() => void videoImport.loadLibrary()}>
              {videoImport.libraryBusy ? "Loading…" : "Refresh"}
            </Button>
            {videoImport.libraryVideos && videoImport.libraryVideos.map((v) => (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-1) 0" }}>
                <span className={styles.ghMeta} style={{ flex: 1, minWidth: 0 }}>
                  {v.name} - {getDisplayKind(v).label}
                  {v.durationSec !== null && ` - ${fmt(Math.round(v.durationSec))}`}
                  {" "}
                  - {(v.sizeBytes / 1048576).toFixed(1)} MB
                </span>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={speed.busy || videoImport.importingKey !== null}
                  onClick={() => void videoImport.handleImportLibraryVideo(v)}
                >
                  {videoImport.importingKey === "lib:" + v.id ? "Importing…" : "Import"}
                </Button>
              </div>
            ))}
          </div>

          {takes.length > 0 && (
            <div style={{ marginTop: "var(--space-2)" }}>
              <p className={styles.fieldHint} style={{ margin: "0 0 var(--space-2) 0", fontWeight: 600 }}>
                From current session
              </p>
              {takes.map((take) => (
                <div key={take.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-1) 0" }}>
                  <span className={styles.ghMeta} style={{ flex: 1, minWidth: 0 }}>
                    {take.name} - {(take.sizeBytes / 1048576).toFixed(1)} MB
                  </span>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={speed.busy || videoImport.importingKey !== null}
                    onClick={() => void videoImport.handleImportTake(take)}
                  >
                    {videoImport.importingKey === "take:" + take.id ? "Importing…" : "Import"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {backupDir && (
            <div style={{ marginTop: "var(--space-2)" }}>
              <p className={styles.fieldHint} style={{ margin: "0 0 var(--space-2) 0", fontWeight: 600 }}>
                From backup folder ({backupDir.name})
              </p>
              <Button
                variant="text"
                size="small"
                disabled={videoImport.folderBusy}
                onClick={() => void videoImport.handleBrowseFolder(backupDir)}
              >
                {videoImport.folderBusy ? "Reading folder…" : videoImport.folderVideos ? "Refresh" : "Browse"}
              </Button>
              {videoImport.folderVideos && videoImport.folderVideos.length === 0 && (
                <p className={styles.fieldHint} style={{ margin: 0 }}>No videos found.</p>
              )}
              {videoImport.folderVideos && videoImport.folderVideos.map((v) => (
                <div key={v.name} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-1) 0" }}>
                  <span className={styles.ghMeta} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.name} - {(v.sizeBytes / 1048576).toFixed(1)} MB
                  </span>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={speed.busy || videoImport.importingKey !== null}
                    onClick={() => void videoImport.handleImportFolderVideo(backupDir, v.name)}
                  >
                    {videoImport.importingKey === "file:" + v.name ? "Importing…" : "Import"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AC9 item 2: the "watch it back" half of the request - playbackRate
          set on this same element previews the chosen speed live. */}
      <div style={{ borderRadius: "var(--radius-md)", overflow: "hidden", background: "var(--navy)" }}>
        <video
          ref={previewRef}
          controls
          src={videoImport.videoUrl ?? undefined}
          onLoadedMetadata={applyPreviewRate}
          style={{ width: "100%", maxHeight: "48vh", display: hasSource ? "block" : "none", background: "var(--navy)" }}
        />
        {!hasSource && (
          <p className={styles.fieldHint} style={{ margin: 0, padding: "var(--space-4)" }}>
            Pick a video above to watch it back here.
          </p>
        )}
      </div>

      <div className={styles.field}>
        <p id="speed-rate-heading" className={styles.adaptPanelSubtitle} style={{ marginBottom: "var(--space-2)" }}>
          2. Playback speed
        </p>
        <div role="group" aria-labelledby="speed-rate-heading" className={styles.ghActions}>
          {SPEED_RATES.map((r) => (
            <Button
              key={r}
              size="small"
              variant={r === speed.rate ? "contained" : "outlined"}
              aria-pressed={r === speed.rate}
              disabled={speed.busy}
              onClick={() => speed.setRate(r)}
            >
              {formatSpeedLabel(r)}
            </Button>
          ))}
        </div>
        <p className={styles.fieldHint}>{speed.costLine}</p>
        {hasSource && <p className={styles.fieldHint}>{KEEP_OPEN_WARNING}</p>}
      </div>

      {/* AC12/AC16 item 3: the visible progress line and its aria-valuetext
          carry the percentage and countdown; the live region below never
          does, so a screen reader is not flooded with per-tick updates. */}
      {speed.busy ? (
        <div className={styles.field}>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={speed.progress?.pct ?? 0}
            aria-valuetext={speed.progressAriaValueText ?? undefined}
            aria-label="Re-encoding progress"
            style={{
              height: 8,
              background: "color-mix(in srgb, var(--field-border) 40%, transparent)",
              borderRadius: "var(--radius-pill)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${speed.progress?.pct ?? 0}%`,
                height: "100%",
                background: "var(--success)",
                borderRadius: "var(--radius-pill)",
                transition: "width 0.05s ease",
              }}
            />
          </div>
          <p className={styles.fieldHint} aria-hidden="true">
            {speed.progressLine ?? `Re-encoding at ${formatSpeedLabel(speed.rate)}…`}
          </p>
          <div className={styles.ghActions}>
            {speed.stage === "rendering" ? (
              <Button variant="outlined" onClick={speed.cancel}>
                Cancel
              </Button>
            ) : (
              <Button variant="outlined" disabled>
                {speed.stage === "reading" ? "Reading the video…" : "Saving…"}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.ghActions}>
          <Button variant="contained" disabled={speed.blockedReason !== null} onClick={speed.start}>
            {`Save at ${formatSpeedLabel(speed.rate)}`}
          </Button>
          {speed.blockedReason && <span className={styles.ghMeta}>{speed.blockedReason}</span>}
        </div>
      )}

      {/* AMENDED AC12: stage transitions plus roughly every 25 percent
          (see crossedAnnounceThreshold in useVideoSpeed.ts) - not stage
          transitions only. A twenty-minute job with no interim announcement
          is indistinguishable from a hang for a screen-reader user. The raw
          per-tick percentage and countdown still never land here - those
          stay in the aria-hidden line and the progressbar's aria-valuetext
          above. */}
      <span
        role="status"
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
      >
        {speed.statusMessage}
      </span>

      {speed.cancelledText && <p className={styles.fieldHint}>{speed.cancelledText}</p>}

      {speed.errorText && (
        <div>
          <p role="alert" className={styles.error}>{speed.errorText}</p>
          {speed.canRetrySave && (
            <Button variant="outlined" size="small" onClick={speed.retrySave}>
              Retry save
            </Button>
          )}
        </div>
      )}

      {!speed.busy && speed.pitchWarning && <p className={styles.fieldHint}>{PITCH_FALLBACK_MESSAGE}</p>}

      {speed.successText && (
        <p className={styles.fieldHint} style={{ fontWeight: 600 }}>
          {speed.successText}
        </p>
      )}
    </div>
  );
}
