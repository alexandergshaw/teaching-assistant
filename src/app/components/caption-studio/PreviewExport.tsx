"use client";

import React from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import { extForMime, renameRecordingFile } from "@/lib/recording-files";
import type { RecordingFile } from "@/lib/recording-files";
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../../page.module.css";

import type { EditableCaption } from "./utils/captions";

interface PreviewExportProps {
  captions: EditableCaption[] | null;
  voMode: "original" | "voiceover" | "mix" | "none";
  setVoMode: (mode: "original" | "voiceover" | "mix" | "none") => void;
  voiceReady: boolean;
  voBusy: null | "one" | "all";
  voError: string | null;
  previewing: boolean;
  onStartPreview: () => void;
  onEndPreview: () => void;
  onGenerateAllVoices: () => Promise<void>;
  cueAudio: Record<number, { url: string; base64: string; mimeType: string }>;
  burning: boolean;
  burnProgress: number;
  burnError: string | null;
  onBurnCaptions: () => Promise<void>;
  onAbortBurn: (() => void) | null;
  burned: { url: string; name: string; mimeType: string } | null;
  burnedRow: RecordingFile | null;
  setBurned: (value: { url: string; name: string; mimeType: string }) => void;
  burnSave: "idle" | "saving" | "done" | "failed";
  renameNote: string | null;
  setRenameNote: (note: string | null) => void;
  supabase: SupabaseClient | null;
  videoUrl: string | null;
}

export function PreviewExport({
  captions,
  voMode,
  setVoMode,
  voiceReady,
  voBusy,
  voError,
  previewing,
  onStartPreview,
  onEndPreview,
  onGenerateAllVoices,
  cueAudio,
  burning,
  burnProgress,
  burnError,
  onBurnCaptions,
  onAbortBurn,
  burned,
  burnedRow,
  setBurned,
  burnSave,
  renameNote,
  setRenameNote,
  supabase,
  videoUrl,
}: PreviewExportProps) {
  if (!captions) return null;

  return (
    <div className={styles.field}>
      <p className={styles.adaptPanelSubtitle} style={{ marginBottom: 8 }}>
        3. Preview & export
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <Button
          variant="outlined"
          size="small"
          disabled={!voiceReady || voBusy !== null || captions.length === 0}
          onClick={() => void onGenerateAllVoices()}
        >
          {voBusy === "all" ? "Voicing cue..." : "Generate all voices"}
        </Button>
        <TextField
          select
          size="small"
          label="Export audio"
          value={voMode}
          onChange={(e) => setVoMode(e.target.value as "original" | "voiceover" | "mix" | "none")}
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="original">Original audio</MenuItem>
          <MenuItem value="voiceover">AI voiceover only</MenuItem>
          <MenuItem value="mix">Original + voiceover</MenuItem>
          <MenuItem value="none">No audio (strip)</MenuItem>
        </TextField>
        {!voiceReady && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            AI voice is not configured (set ELEVENLABS_API_KEY, and clone your voice on the Narrate a deck tab).
          </p>
        )}
      </div>

      {voError && <p className={styles.error}>{voError}</p>}

      <div className={styles.ghActions} style={{ marginTop: 12, alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <Button
          variant="contained"
          size="small"
          disabled={!videoUrl || captions.length === 0 || burning}
          onClick={() => (previewing ? onEndPreview() : onStartPreview())}
        >
          {previewing ? "Stop preview" : "Preview"}
        </Button>
        <Button
          variant="contained"
          size="small"
          disabled={!videoUrl || captions.length === 0 || burning}
          onClick={() => void onBurnCaptions()}
        >
          {burning ? `Exporting... ${burnProgress}%` : "Export video with captions"}
        </Button>
        {burning && (
          <Button variant="text" size="small" color="error" onClick={() => onAbortBurn?.()}>
            Cancel
          </Button>
        )}
      </div>

      {previewing && (
        <p className={styles.fieldHint} style={{ margin: "8px 0 0 0" }}>
          Previewing with {voMode === "original" ? "the original audio" : voMode === "voiceover" ? "AI voiceover only" : voMode === "mix" ? "original audio plus voiceover" : "no audio"}.
          {(voMode === "voiceover" || voMode === "mix") && Object.keys(cueAudio).length === 0 && " No generated voices yet - captions will be silent. Use Generate all voices."}
        </p>
      )}

      {burning && (
        <p className={styles.fieldHint} style={{ margin: "8px 0 0 0" }}>
          The video plays through once (silently) while the captions are rendered in.
        </p>
      )}

      {burnError && <p className={styles.error}>{burnError}</p>}

      {burned && (
        <div className={styles.field} style={{ marginTop: 12 }}>
          <video
            key={burned.url}
            controls
            playsInline
            src={burned.url}
            style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 12, background: "#0f172a" }}
          />
          {burnedRow && (
            <div style={{ marginTop: 8 }}>
              <TextField
                size="small"
                label="Name"
                value={burned.name}
                onChange={(e) => {
                  setBurned({ ...burned, name: e.target.value });
                  setRenameNote(null);
                }}
                onBlur={async (e) => {
                  const newName = e.currentTarget.value.trim();
                  if (newName && newName !== burned.name && supabase) {
                    try {
                      await renameRecordingFile(supabase, burnedRow.id, newName);
                      setRenameNote("Renamed in library.");
                      setBurned({ ...burned, name: newName });
                    } catch (err) {
                      setRenameNote(err instanceof Error ? err.message : "Rename failed");
                    }
                  }
                }}
                style={{ marginRight: 8 }}
              />
              {renameNote && (
                <p className={styles.fieldHint} style={{ margin: 0, marginTop: 4 }}>
                  {renameNote}
                </p>
              )}
            </div>
          )}
          <div className={styles.ghActions} style={{ marginTop: 8 }}>
            <Button
              variant="contained"
              size="small"
              onClick={() => {
                const a = document.createElement("a");
                a.href = burned.url;
                a.download = `${burned.name}.${extForMime(burned.mimeType)}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
            >
              Download captioned video
            </Button>
            {burnSave === "saving" && (
              <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Saving to library...</span>
            )}
            {burnSave === "done" && (
              <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>In library - see the Files tab</span>
            )}
            {burnSave === "failed" && (
              <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>Library save failed</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
