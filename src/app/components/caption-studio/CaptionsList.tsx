"use client";

import React from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import type { CaptionPosition } from "@/lib/caption-burn";
import styles from "../../page.module.css";
import { fmtTimeMs } from "./utils/formatting";
import { gatherRecordingContext, type EditableCaption } from "./utils/captions";

interface CaptionsListProps {
  captions: EditableCaption[] | null;
  shiftSecs: string;
  setShiftSecs: (value: string) => void;
  onShiftAll: (delta: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cueAudio: Record<number, { url: string; base64: string; mimeType: string }>;
  voiceReady: boolean;
  voBusy: null | "one" | "all";
  onUpdateCaption: (i: number, text: string) => void;
  onUpdateCue: (i: number, patch: Partial<EditableCaption>) => void;
  onSortCaptions: () => void;
  onRemoveCaption: (i: number) => void;
  onGenerateVoiceForCue: (i: number) => Promise<void>;
  onAddCaption: () => void;
  onDownloadVtt: () => void;
  onCopyCaptions: () => void;
}

export function CaptionsList({
  captions,
  shiftSecs,
  setShiftSecs,
  onShiftAll,
  videoRef,
  cueAudio,
  voiceReady,
  voBusy,
  onUpdateCaption,
  onUpdateCue,
  onSortCaptions,
  onRemoveCaption,
  onGenerateVoiceForCue,
  onAddCaption,
  onDownloadVtt,
  onCopyCaptions,
}: CaptionsListProps) {
  if (!captions) return null;

  return (
    <div>
      <div className={styles.field} style={{ marginTop: 16 }}>
        <p className={styles.adaptPanelSubtitle} style={{ marginBottom: 8 }}>
          Edit captions
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <TextField
            type="number"
            size="small"
            label="Shift all (s)"
            value={shiftSecs}
            onChange={(e) => setShiftSecs(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !(captions.length === 0 || Number(shiftSecs) === 0 || isNaN(Number(shiftSecs)))) {
                e.preventDefault();
                onShiftAll(Number(shiftSecs));
              }
            }}
            style={{ width: 120 }}
          />
          <Button
            variant="outlined"
            size="small"
            disabled={captions.length === 0 || Number(shiftSecs) === 0 || isNaN(Number(shiftSecs))}
            onClick={() => onShiftAll(Number(shiftSecs))}
          >
            Shift all
          </Button>
          {gatherRecordingContext().cardSeconds > 0 && (
            <Button
              variant="text"
              size="small"
              onClick={() => onShiftAll(gatherRecordingContext().cardSeconds)}
            >
              Shift all +{gatherRecordingContext().cardSeconds}s (title card)
            </Button>
          )}
        </div>
        {gatherRecordingContext().cardSeconds > 0 && (
          <p className={styles.fieldHint} style={{ margin: "0 0 16px 0" }}>
            This video was recorded with a title card - if captions look early, shift them right by the card length.
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {captions.map((c, i) => (
          <div key={i} style={{ border: "1px solid var(--field-border)", borderRadius: 8, padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className={styles.ghMetaMono} style={{ flexShrink: 0 }}>
                {fmtTimeMs(c.start)}-{fmtTimeMs(c.end)}
              </span>
              <TextField
                size="small"
                label="Start"
                type="number"
                value={Number(c.start.toFixed(1))}
                onChange={(e) => onUpdateCue(i, { start: parseFloat(e.target.value) || 0 })}
                onBlur={() => onSortCaptions()}
                sx={{ width: 80 }}
              />
              <Button
                variant="text"
                size="small"
                onClick={() => onUpdateCue(i, { start: Math.max(0, c.start - 0.5) })}
                title="Nudge start earlier"
              >
                -0.5
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={() => onUpdateCue(i, { start: c.start + 0.5 })}
                title="Nudge start later"
              >
                +0.5
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  const t = Math.round((videoRef.current?.currentTime ?? 0) * 10) / 10;
                  onUpdateCue(i, { start: t });
                }}
              >
                Set
              </Button>
              <TextField
                size="small"
                label="End"
                type="number"
                value={Number(c.end.toFixed(1))}
                onChange={(e) => onUpdateCue(i, { end: parseFloat(e.target.value) || c.start + 0.1 })}
                onBlur={() => onSortCaptions()}
                sx={{ width: 80 }}
              />
              <Button
                variant="text"
                size="small"
                onClick={() => onUpdateCue(i, { end: Math.max(c.start + 0.1, c.end - 0.5) })}
                title="Nudge end earlier"
              >
                -0.5
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={() => onUpdateCue(i, { end: c.end + 0.5 })}
                title="Nudge end later"
              >
                +0.5
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  const t = Math.round((videoRef.current?.currentTime ?? 0) * 10) / 10;
                  onUpdateCue(i, { end: Math.max(c.start + 0.1, t) });
                }}
              >
                Set
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  const v = videoRef.current;
                  if (v) v.currentTime = c.start;
                }}
              >
                Jump
              </Button>
              <TextField
                select
                size="small"
                label="Position"
                value={c.position ?? "bottom"}
                onChange={(e) => onUpdateCue(i, { position: e.target.value as CaptionPosition })}
                sx={{ minWidth: 100 }}
              >
                <MenuItem value="bottom">Bottom</MenuItem>
                <MenuItem value="middle">Middle</MenuItem>
                <MenuItem value="top">Top</MenuItem>
              </TextField>
            </div>

            <TextField
              size="small"
              fullWidth
              value={c.text}
              onChange={(e) => onUpdateCaption(i, e.target.value)}
              sx={{ minWidth: 0 }}
            />

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Button
                variant="text"
                size="small"
                disabled={!voiceReady || voBusy !== null}
                onClick={() => void onGenerateVoiceForCue(i)}
              >
                Voice
              </Button>
              {cueAudio[i] && (
                <audio
                  controls
                  src={cueAudio[i].url}
                  style={{ height: 28, flex: 1, minWidth: 200 }}
                />
              )}
              <Button
                variant="text"
                size="small"
                color="error"
                onClick={() => onRemoveCaption(i)}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button variant="outlined" size="small" onClick={onAddCaption}>
        Add caption at playhead
      </Button>

      <div className={styles.ghActions} style={{ marginTop: 16, display: "flex", gap: 12 }}>
        <Button variant="contained" size="small" onClick={onDownloadVtt}>
          Download .vtt
        </Button>
        <Button variant="text" size="small" onClick={onCopyCaptions}>
          Copy captions
        </Button>
      </div>
    </div>
  );
}
