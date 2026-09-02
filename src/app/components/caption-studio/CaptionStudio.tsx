"use client";

import React, { useEffect, useRef } from "react";
import { Button, TextField, FormControlLabel, Checkbox } from "@mui/material";
import type { DirHandle } from "@/lib/backup-dir";
import type { Take } from "../RecordingTab";
import styles from "../../page.module.css";
import { useRecordingContext } from "./hooks/useRecordingContext";
import { useVideoImport } from "./hooks/useVideoImport";
import { useCaptionGeneration } from "./hooks/useCaptionGeneration";
import { useVoiceOverlay } from "./hooks/useVoiceOverlay";
import { useBurnCaptions } from "./hooks/useBurnCaptions";
import { VideoSource } from "./VideoSource";
import { CaptionsList } from "./CaptionsList";
import { PreviewExport } from "./PreviewExport";
import { useSupabase } from "@/context/SupabaseProvider";
import { variantFor } from "../ui/buttonVariant";
import controls from "../recording/RecordingControls.module.css";

export default function CaptionStudio({ takes = [], backupDir = null }: { takes?: Take[]; backupDir?: DirHandle | null }) {
  const { supabase, user } = useSupabase();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoUrlRef = useRef<string | null>(null);

  const recordingContext = useRecordingContext();
  // videoImport MUST be declared before useCaptionGeneration: the generation
  // hook guards on the url it is handed (handleGenerate returns immediately
  // when it is null), so passing a literal null here makes "Generate captions"
  // a silent no-op with no error surfaced.
  const videoImport = useVideoImport();
  const captionGen = useCaptionGeneration(videoImport.videoUrl, videoRef, videoImport.fileName);

  // Clear generated captions when a DIFFERENT video is imported.
  // captionGen must NOT appear in this dep array: useCaptionGeneration returns
  // a fresh object literal on every render, so depending on it re-runs this
  // effect after EVERY render - which would wipe the captions on the very
  // render that generation just set them, leaving the feature dead even with
  // the url wired correctly. The two setters are useState setters, so React
  // guarantees they are stable and depending on them cannot reintroduce that.
  const { setCaptions, setError } = captionGen;
  useEffect(() => {
    setCaptions(null);
    setError(null);
  }, [videoImport.videoUrl, setCaptions, setError]);

  const voiceOverlay = useVoiceOverlay(
    captionGen.captions,
    captionGen.cueAudio,
    captionGen.setCueAudio,
    videoRef
  );

  const burnCaptions = useBurnCaptions(
    videoImport.videoUrl,
    videoImport.fileName,
    captionGen.captions,
    captionGen.cueAudio,
    voiceOverlay.voMode,
    voiceOverlay.previewing,
    voiceOverlay.endPreview,
    supabase,
    user
  );

  const [playhead, setPlayhead] = React.useState(0);
  const [shiftSecs, setShiftSecs] = React.useState<string>(() => {
    if (typeof window === "undefined") return "0";
    return localStorage.getItem("ta-cap-shift-secs") ?? "0";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-cap-shift-secs", shiftSecs);
  }, [shiftSecs]);

  useEffect(() => {
    videoUrlRef.current = videoImport.videoUrl;
  }, [videoImport.videoUrl]);

  // Teardown runs ONLY on unmount, so the handles it needs are read through a
  // ref instead of a dep array. useVoiceOverlay and useBurnCaptions each return
  // a fresh object literal every render, so listing them as deps made React run
  // this cleanup after EVERY render - and this cleanup revokes the imported
  // video's object URL. So the <video> src went dead (a red blob: request in
  // devtools) as soon as any state changed, and "Generate captions" then hung
  // forever: it samples frames from an offscreen <video> pointed at that same
  // revoked url, which can only ever fire "error", never "loadedmetadata".
  const teardownRef = useRef<() => void>(() => {});
  useEffect(() => {
    teardownRef.current = () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      if (burnCaptions.burnedUrlRef.current) URL.revokeObjectURL(burnCaptions.burnedUrlRef.current);
      for (const entry of Object.values(voiceOverlay.cueAudioRef.current)) {
        URL.revokeObjectURL(entry.url);
      }
      voiceOverlay.stopPreviewNodes();
      const ctx = voiceOverlay.previewCtxRef.current;
      if (ctx && ctx.state !== "closed") {
        try {
          ctx.close();
        } catch {}
      }
      burnCaptions.burnAbortRef.current?.();
    };
  });

  useEffect(() => () => teardownRef.current(), []);

  // docs/recording-controls-ux-acceptance-criteria.md CC1: the same basis
  // CaptionsList uses for its own "Download .vtt" primary, so the two files
  // never disagree about which button on screen is the primary for this
  // state - the .vtt file is the accessible deliverable an instructor
  // uploads to Canvas, so once it exists Generate/Regenerate captions steps
  // back to outlined and Download .vtt becomes the primary.
  const hasCaptions = captionGen.captions !== null && captionGen.captions.length > 0;
  // CC6 gap (VideoSource.tsx): gate "Choose video" the same way SpeedPanel
  // gates its own picker, so a source cannot be swapped out from under an
  // in-flight generation or export.
  const videoSourceBusy = captionGen.busy !== "idle" || burnCaptions.burning;

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Caption a screen recording</h2>
        <p className={styles.adaptPanelSubtitle}>
          Upload a screen recording and let AI write timed captions describing what happens. Edit them, then download as .vtt subtitles.
        </p>
      </div>

      {captionGen.error && (
        <p role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
          {captionGen.error}
        </p>
      )}

      <VideoSource
        fileName={videoImport.fileName}
        setFileName={videoImport.setFileName}
        fileInputRef={fileInputRef}
        onFileChange={videoImport.handleFileChange}
        importError={videoImport.importError}
        takes={takes}
        backupDir={backupDir}
        onImportTake={videoImport.handleImportTake}
        folderVideos={videoImport.folderVideos}
        folderBusy={videoImport.folderBusy}
        onBrowseFolder={() => videoImport.handleBrowseFolder(backupDir)}
        onImportFolderVideo={(name) => videoImport.handleImportFolderVideo(backupDir, name)}
        libraryBusy={videoImport.libraryBusy}
        libraryVideos={videoImport.libraryVideos}
        onLoadLibrary={videoImport.loadLibrary}
        onImportLibraryVideo={videoImport.handleImportLibraryVideo}
        importingKey={videoImport.importingKey}
        busy={videoSourceBusy}
      />

      {videoImport.videoUrl && (
        <div className={styles.field}>
          <div style={{ position: "relative", maxWidth: "100%", display: "inline-block" }}>
            <video
              key={videoImport.videoUrl}
              ref={videoRef}
              controls
              playsInline
              preload="auto"
              src={videoImport.videoUrl}
              className={controls.playerVideo}
              onError={() => captionGen.setError("The browser could not decode this video. Try re-importing it, or convert it to MP4/WebM.")}
              onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
              onSeeked={(e) => setPlayhead(e.currentTarget.currentTime)}
            />
            {captionGen.captions && (
              (() => {
                const activeCue = captionGen.captions.find((c) => c.start <= playhead && playhead < c.end) ?? null;
                if (!activeCue) return null;
                const positionStyle = activeCue.position === "middle"
                  ? { top: "50%", transform: "translateY(-50%)" }
                  : activeCue.position === "top"
                    ? { top: "6%" }
                    : { bottom: "6%" };
                return (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      pointerEvents: "none",
                      display: "flex",
                      justifyContent: "center",
                      ...positionStyle,
                    }}
                  >
                    <span
                      style={{
                        background: "color-mix(in srgb, var(--navy) 78%, transparent)",
                        color: "var(--on-navy)",
                        padding: "var(--space-1) var(--space-2)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "var(--font-size-md)",
                        fontWeight: 600,
                        maxWidth: "88%",
                        textAlign: "center",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {activeCue.text}
                    </span>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      <fieldset className={controls.section}>
        <legend className={controls.sectionLegend}>Captions</legend>
        <div className={styles.adaptRow}>
          <TextField
            label="Context (optional)"
            placeholder="e.g. Demonstrating how to submit an assignment in Canvas"
            value={recordingContext.context}
            onChange={(e) => recordingContext.setContext(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && videoImport.videoUrl && captionGen.busy === "idle") {
                e.preventDefault();
                void captionGen.handleGenerate(recordingContext.context, recordingContext.usePageContext);
              }
            }}
            size="small"
            className={controls.fieldGrow}
          />
        </div>
        <FormControlLabel
          control={<Checkbox size="small" checked={recordingContext.usePageContext} onChange={(e) => recordingContext.setUsePageContext(e.target.checked)} />}
          label={<span style={{ fontSize: "var(--font-size-md)" }}>Use context from this Recording page</span>}
        />
        {recordingContext.usePageContext && (
          <p className={styles.fieldHint}>
            {recordingContext.pageContextSummary ? `Found: ${recordingContext.pageContextSummary}.` : "No page context found yet - set a lecture script or title cards on the Record view and it will be used automatically."}
          </p>
        )}
      </fieldset>

      {/* docs/recording-controls-ux-acceptance-criteria.md CC2: the run row
          is this surface's ONE .runRow - it sits outside the Captions
          fieldset (a run row is never swallowed inside the settings
          fieldset it belongs to), and the disabled-primary reason renders
          directly under it (CC1). */}
      <div className={`${styles.ghActions} ${controls.runRow}`}>
        <Button
          variant={variantFor(!hasCaptions)}
          size="small"
          disabled={!videoImport.videoUrl}
          loading={captionGen.busy !== "idle"}
          loadingPosition="start"
          onClick={() => void captionGen.handleGenerate(recordingContext.context, recordingContext.usePageContext)}
        >
          {captionGen.busy === "sampling"
            ? "Reading video…"
            : captionGen.busy === "describing"
              ? "Writing captions…"
              : hasCaptions
                ? "Regenerate captions"
                : "Generate captions"}
        </Button>
      </div>
      {!videoImport.videoUrl && <p className={styles.fieldHint}>Choose a video first.</p>}

      {captionGen.captions && (
        <CaptionsList
          captions={captionGen.captions}
          shiftSecs={shiftSecs}
          setShiftSecs={setShiftSecs}
          onShiftAll={captionGen.handleShiftAllCaptions}
          videoRef={videoRef}
          cueAudio={captionGen.cueAudio}
          voiceReady={voiceOverlay.voiceReady}
          voBusy={voiceOverlay.voBusy}
          onUpdateCaption={captionGen.handleUpdateCaption}
          onUpdateCue={captionGen.updateCue}
          onSortCaptions={captionGen.sortCaptions}
          onRemoveCaption={captionGen.handleRemoveCaption}
          onGenerateVoiceForCue={voiceOverlay.handleGenerateVoiceForCue}
          onAddCaption={captionGen.handleAddCaptionAtPlayhead}
          onDownloadVtt={captionGen.handleDownloadVtt}
          onCopyCaptions={captionGen.handleCopyCaptions}
        />
      )}

      {captionGen.captions && (
        <PreviewExport
          captions={captionGen.captions}
          voMode={voiceOverlay.voMode}
          setVoMode={voiceOverlay.setVoMode}
          voiceReady={voiceOverlay.voiceReady}
          voBusy={voiceOverlay.voBusy}
          voError={voiceOverlay.voError}
          previewing={voiceOverlay.previewing}
          onStartPreview={voiceOverlay.startPreview}
          onEndPreview={voiceOverlay.endPreview}
          onGenerateAllVoices={voiceOverlay.handleGenerateAllVoices}
          cueAudio={captionGen.cueAudio}
          burning={burnCaptions.burning}
          burnProgress={burnCaptions.burnProgress}
          burnError={burnCaptions.burnError}
          onBurnCaptions={burnCaptions.handleBurnCaptions}
          // Read at click time, not at render time: the abort closure is
          // installed during the export's setup, so a snapshot taken by the
          // render that first showed this button is null.
          onAbortBurn={() => burnCaptions.burnAbortRef.current?.()}
          burned={burnCaptions.burned}
          burnedRow={burnCaptions.burnedRow}
          setBurned={burnCaptions.setBurned}
          burnSave={burnCaptions.burnSave}
          renameNote={burnCaptions.renameNote}
          setRenameNote={burnCaptions.setRenameNote}
          supabase={supabase}
          videoUrl={videoImport.videoUrl}
        />
      )}

      <p className={styles.fieldHint}>
        The .vtt file loads into Canvas Studio, YouTube, and most players; exporting burns the captions into the video itself.
      </p>
    </div>
  );
}
