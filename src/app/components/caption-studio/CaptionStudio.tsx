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

export default function CaptionStudio({ takes = [], backupDir = null }: { takes?: Take[]; backupDir?: DirHandle | null }) {
  const { supabase, user } = useSupabase();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoUrlRef = useRef<string | null>(null);

  const recordingContext = useRecordingContext();
  const captionGen = useCaptionGeneration(null, videoRef);
  const videoImport = useVideoImport();

  useEffect(() => {
    captionGen.setCaptions(null);
    captionGen.setError(null);
  }, [videoImport.videoUrl, captionGen]);

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

  useEffect(() => {
    return () => {
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
  }, [voiceOverlay, burnCaptions]);

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Caption a screen recording</h2>
        <p className={styles.adaptPanelSubtitle}>
          Upload a screen recording and let AI write timed captions describing what happens. Edit them, then download as .vtt subtitles.
        </p>
      </div>

      {captionGen.error && <p className={styles.error}>{captionGen.error}</p>}

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
              style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 12, background: "#0f172a", display: "block" }}
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
                        background: "rgba(15,23,42,0.78)",
                        color: "#f8fafc",
                        padding: "4px 10px",
                        borderRadius: 8,
                        fontSize: "0.9rem",
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

      <div className={styles.field}>
        <p className={styles.adaptPanelSubtitle} style={{ marginBottom: 8 }}>
          2. Captions
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 16 }}>
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
            sx={{ flex: "1 1 300px" }}
          />
          <Button
            variant="contained"
            size="small"
            disabled={!videoImport.videoUrl || captionGen.busy !== "idle"}
            onClick={() => void captionGen.handleGenerate(recordingContext.context, recordingContext.usePageContext)}
          >
            {captionGen.busy === "sampling"
              ? "Reading video..."
              : captionGen.busy === "describing"
                ? "Writing captions..."
                : captionGen.captions
                  ? "Regenerate captions"
                  : "Generate captions"}
          </Button>
        </div>
        <FormControlLabel
          control={<Checkbox size="small" checked={recordingContext.usePageContext} onChange={(e) => recordingContext.setUsePageContext(e.target.checked)} />}
          label={<span style={{ fontSize: "0.85rem" }}>Use context from this Recording page</span>}
        />
        {recordingContext.usePageContext && (
          <p className={styles.fieldHint} style={{ margin: "4px 0 0 0" }}>
            {recordingContext.pageContextSummary ? `Found: ${recordingContext.pageContextSummary}.` : "No page context found yet - set a lecture script or title cards on the Record view and it will be used automatically."}
          </p>
        )}
      </div>

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
          onAbortBurn={burnCaptions.burnAbortRef.current}
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
