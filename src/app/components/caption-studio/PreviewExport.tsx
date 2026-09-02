"use client";

import React from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import { extForMime, renameRecordingFile } from "@/lib/recording-files";
import type { RecordingFile } from "@/lib/recording-files";
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";

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
    <fieldset className={controls.section}>
      <legend className={controls.sectionLegend}>Preview and export</legend>
      <div className={styles.adaptRow}>
        <Button
          variant="outlined"
          size="small"
          className={controls.fieldRowButton}
          disabled={!voiceReady || voBusy !== null || captions.length === 0}
          loading={voBusy === "all"}
          loadingPosition="start"
          onClick={() => void onGenerateAllVoices()}
        >
          {voBusy === "all" ? "Voicing cue…" : "Generate all voices"}
        </Button>
        <TextField
          select
          size="small"
          label="Export audio"
          className={controls.fieldMd}
          value={voMode}
          onChange={(e) => setVoMode(e.target.value as "original" | "voiceover" | "mix" | "none")}
        >
          <MenuItem value="original">Original audio</MenuItem>
          <MenuItem value="voiceover">AI voiceover only</MenuItem>
          <MenuItem value="mix">Original + voiceover</MenuItem>
          <MenuItem value="none">No audio (strip)</MenuItem>
        </TextField>
      </div>
      {!voiceReady && (
        <p className={styles.fieldHint}>
          AI voice is not configured (set ELEVENLABS_API_KEY, and clone your voice on the Narrate a deck tab).
        </p>
      )}

      {voError && (
        <p role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
          {voError}
        </p>
      )}

      <div className={styles.ghActions}>
        <Button
          variant="outlined"
          size="small"
          disabled={!videoUrl || captions.length === 0 || burning}
          onClick={() => (previewing ? onEndPreview() : onStartPreview())}
        >
          {previewing ? "Stop preview" : "Preview"}
        </Button>
        <Button
          variant="outlined"
          size="small"
          disabled={!videoUrl || captions.length === 0 || burning}
          loading={burning}
          loadingPosition="start"
          onClick={() => void onBurnCaptions()}
        >
          {burning ? `Exporting… ${burnProgress}%` : "Export video with captions"}
        </Button>
        {burning && (
          <Button variant="text" size="small" color="error" onClick={() => onAbortBurn?.()}>
            Cancel
          </Button>
        )}
      </div>

      {previewing && (
        <p className={styles.fieldHint}>
          Previewing with {voMode === "original" ? "the original audio" : voMode === "voiceover" ? "AI voiceover only" : voMode === "mix" ? "original audio plus voiceover" : "no audio"}.
          {(voMode === "voiceover" || voMode === "mix") && Object.keys(cueAudio).length === 0 && " No generated voices yet - captions will be silent. Use Generate all voices."}
        </p>
      )}

      {burning && (
        <p className={styles.fieldHint}>
          The video plays through once (silently) while the captions are rendered in.
        </p>
      )}

      {burnError && (
        <p role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
          {burnError}
        </p>
      )}

      {burned && (
        <div className={controls.itemCard}>
          <video
            key={burned.url}
            controls
            playsInline
            src={burned.url}
            className={controls.playerVideo}
          />
          {burnedRow && (
            <div>
              <div className={styles.adaptRow}>
                <TextField
                  size="small"
                  label="Name"
                  className={controls.fieldLg}
                  value={burned.name}
                  onChange={(e) => {
                    setBurned({ ...burned, name: e.target.value });
                    setRenameNote(null);
                  }}
                  onKeyDown={(e) => {
                    // TakesPanel.tsx:132's idiom: Enter blurs the field,
                    // which runs the same commit path as tabbing away - the
                    // rename no longer requires finding something else to
                    // click on first
                    // (docs/recording-controls-ux-acceptance-criteria.md
                    // section 7).
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
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
                />
              </div>
              {renameNote && <p className={styles.fieldHint}>{renameNote}</p>}
            </div>
          )}
          <div className={styles.ghActions}>
            <Button
              variant="outlined"
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
              <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Saving to library…</span>
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
    </fieldset>
  );
}
