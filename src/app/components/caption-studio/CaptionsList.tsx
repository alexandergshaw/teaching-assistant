"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import type { CaptionPosition } from "@/lib/caption-burn";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import { variantFor } from "../ui/buttonVariant";
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
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
  // docs/recording-controls-ux-acceptance-criteria.md CC5: ONE
  // armedCueIndex state for the whole list (a plain index, not a signature -
  // "the thing confirmed cannot change" once a cue is armed, since the
  // arming button itself disappears from the DOM the moment a different cue
  // is armed instead). Hooks are called unconditionally, ABOVE the `captions
  // === null` early return below, per the Rules of Hooks - captions may be
  // null on the render before generation completes.
  const [armedCueIndex, setArmedCueIndex] = useState<number | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  // ConfirmArmButtons.tsx now forwards its underlying <button> via
  // `buttonRef`, so the remove control per cue index is reached directly
  // instead of a wrapping-span querySelector.
  const removeButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const pendingFocusIndexRef = useRef<number | null>(null);
  const prevLengthRef = useRef(captions?.length ?? 0);

  useLayoutEffect(() => {
    const length = captions?.length ?? 0;
    if (length < prevLengthRef.current) {
      const target = pendingFocusIndexRef.current;
      if (target !== null) {
        const idx = Math.min(target, length - 1);
        const btn = idx >= 0 ? removeButtonRefs.current.get(idx) : null;
        if (btn) btn.focus();
        else listContainerRef.current?.focus();
      }
    }
    prevLengthRef.current = length;
    pendingFocusIndexRef.current = null;
  });

  // Invariant (finding 3): armedCueIndex is a raw index into `captions`, so
  // ANY reorder of the array must clear the arm - otherwise "Confirm
  // removal" deletes whatever cue now sits at that index, not the one the
  // instructor armed. Both paths that can reorder the list (adding a cue at
  // the playhead, and sorting on a time-field blur) are wrapped here to
  // disarm before delegating to the caller's handler.
  const handleAddCaption = () => {
    setArmedCueIndex(null);
    onAddCaption();
  };
  const handleSortCaptions = () => {
    setArmedCueIndex(null);
    onSortCaptions();
  };

  if (!captions) return null;

  const hasCaptions = captions.length > 0;
  const shiftDisabled = captions.length === 0 || Number(shiftSecs) === 0 || isNaN(Number(shiftSecs));
  const cardSeconds = gatherRecordingContext().cardSeconds;

  return (
    <fieldset className={controls.section}>
      <legend className={controls.sectionLegend}>Edit captions</legend>
      <div className={styles.adaptRow}>
        <TextField
          type="number"
          size="small"
          label="Shift all (s)"
          className={controls.fieldSm}
          value={shiftSecs}
          onChange={(e) => setShiftSecs(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !shiftDisabled) {
              e.preventDefault();
              onShiftAll(Number(shiftSecs));
            }
          }}
        />
        <Button
          variant="outlined"
          size="small"
          className={controls.fieldRowButton}
          disabled={shiftDisabled}
          onClick={() => onShiftAll(Number(shiftSecs))}
        >
          Shift all
        </Button>
        {cardSeconds > 0 && (
          <Button variant="text" size="small" onClick={() => onShiftAll(cardSeconds)}>
            Shift all +{cardSeconds}s (title card)
          </Button>
        )}
      </div>
      {cardSeconds > 0 && (
        <p className={styles.fieldHint}>
          This video was recorded with a title card - if captions look early, shift them right by the card length.
        </p>
      )}

      <div
        ref={listContainerRef}
        tabIndex={-1}
        className={controls.stack}
      >
        {captions.map((c, i) => {
          const consequenceId = `cue-remove-consequence-${i}`;
          const armed = armedCueIndex === i;
          return (
            <div
              key={i}
              role="group"
              aria-label={`Cue ${i + 1}, ${fmtTimeMs(c.start)} to ${fmtTimeMs(c.end)}`}
              className={controls.itemCard}
            >
              <div className={styles.adaptRow}>
                <span className={styles.ghMetaMono} style={{ flexShrink: 0 }}>
                  {fmtTimeMs(c.start)}-{fmtTimeMs(c.end)}
                </span>
                <TextField
                  size="small"
                  label="Start"
                  type="number"
                  className={controls.fieldXs}
                  value={Number(c.start.toFixed(1))}
                  onChange={(e) => onUpdateCue(i, { start: parseFloat(e.target.value) || 0 })}
                  onBlur={() => handleSortCaptions()}
                  slotProps={{ htmlInput: { step: 0.1 } }}
                />
                <Button
                  variant="text"
                  size="small"
                  onClick={() => onUpdateCue(i, { start: Math.max(0, c.start - 0.5) })}
                  aria-label="-0.5: start earlier by half a second"
                  title="-0.5: start earlier by half a second"
                >
                  -0.5
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => onUpdateCue(i, { start: c.start + 0.5 })}
                  aria-label="+0.5: start later by half a second"
                  title="+0.5: start later by half a second"
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
                  Set start to playhead
                </Button>
                <TextField
                  size="small"
                  label="End"
                  type="number"
                  className={controls.fieldXs}
                  value={Number(c.end.toFixed(1))}
                  onChange={(e) => onUpdateCue(i, { end: parseFloat(e.target.value) || c.start + 0.1 })}
                  onBlur={() => handleSortCaptions()}
                  slotProps={{ htmlInput: { step: 0.1 } }}
                />
                <Button
                  variant="text"
                  size="small"
                  onClick={() => onUpdateCue(i, { end: Math.max(c.start + 0.1, c.end - 0.5) })}
                  aria-label="-0.5: end earlier by half a second"
                  title="-0.5: end earlier by half a second"
                >
                  -0.5
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => onUpdateCue(i, { end: c.end + 0.5 })}
                  aria-label="+0.5: end later by half a second"
                  title="+0.5: end later by half a second"
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
                  Set end to playhead
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => {
                    const v = videoRef.current;
                    if (v) v.currentTime = c.start;
                  }}
                >
                  Jump to this cue
                </Button>
                <TextField
                  select
                  size="small"
                  label="Position"
                  className={controls.fieldMd}
                  value={c.position ?? "bottom"}
                  onChange={(e) => onUpdateCue(i, { position: e.target.value as CaptionPosition })}
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
              />

              <div className={styles.ghActions}>
                <Button
                  variant="text"
                  size="small"
                  disabled={!voiceReady || voBusy !== null}
                  loading={voBusy === "one"}
                  loadingPosition="start"
                  onClick={() => void onGenerateVoiceForCue(i)}
                >
                  Voice
                </Button>
                {cueAudio[i] && (
                  <audio
                    controls
                    src={cueAudio[i].url}
                    className={controls.playerAudio}
                  />
                )}
                <span className={controls.pushEnd}>
                  <ConfirmArmButtons
                    armed={armed}
                    idleLabel="Remove"
                    confirmLabel="Confirm removal"
                    tone="danger"
                    idleVariant="text"
                    idleAriaLabel={`Remove the cue at ${fmtTimeMs(c.start)}`}
                    confirmAriaLabel={`Confirm removing the cue at ${fmtTimeMs(c.start)}`}
                    consequenceId={consequenceId}
                    onArm={() => setArmedCueIndex(i)}
                    onConfirm={() => {
                      pendingFocusIndexRef.current = i;
                      setArmedCueIndex(null);
                      onRemoveCaption(i);
                    }}
                    onCancel={() => setArmedCueIndex(null)}
                    buttonRef={(el) => {
                      if (el) removeButtonRefs.current.set(i, el);
                      else removeButtonRefs.current.delete(i);
                    }}
                  />
                </span>
              </div>
              {armed && (
                <p id={consequenceId} role="status" aria-live="polite" className={controls.consequence}>
                  This removes the cue. It cannot be undone.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <Button variant="outlined" size="small" onClick={handleAddCaption}>
        Add caption at playhead
      </Button>

      <div className={styles.ghActions}>
        <Button variant={variantFor(hasCaptions)} size="small" onClick={onDownloadVtt}>
          Download .vtt
        </Button>
        <Button variant="text" size="small" onClick={onCopyCaptions}>
          Copy captions
        </Button>
      </div>
    </fieldset>
  );
}
