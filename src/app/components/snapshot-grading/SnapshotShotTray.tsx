"use client";

// Snapshot grading, WAVE 4 - the shot tray (section 2 of the AC, U7 of the
// UX pass). Grouped by role, one tab stop per group with roving tabindex
// (copying SegmentedToggle.tsx's own model - nextEnabledIndex there,
// re-derived here over an array with no "disabled" concept), never twelve
// separate tab stops for twelve tiles.
//
// U3: re-roling is select-then-set (two clicks), never the armed toggle
// retroactively re-labeling the last shot. Selecting a tile (aria-pressed)
// reveals a shared "Set role" row; picking from it calls setRole and closes
// the row.

import { useRef, useState, type KeyboardEvent } from "react";
import IconButton from "@mui/material/IconButton";
// No @mui/icons-material in this repo (discussion-icons.tsx's own header:
// "one is not being added for two glyphs") - reused, not redrawn, from that
// file's hand-rolled set.
import { CloseIcon, ArrowUpIcon, ArrowDownIcon } from "../recording/discussion-icons";
import styles from "../../page.module.css";
import { useRemoveFocusRefs } from "../assessment-shared/useRemoveFocusRefs";
import { SNAPSHOT_ROLES, SNAPSHOT_ROLE_LABELS, groupShotsByRole, shotTileLabel, type SnapshotRole, type SnapshotShot } from "./snapshot-shot";
import tray from "./SnapshotGrading.module.css";

export interface SnapshotShotTrayProps {
  shots: SnapshotShot[];
  onRemove: (id: string) => void;
  onSetRole: (id: string, role: SnapshotRole) => void;
  onSetNote: (id: string, note: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}

export default function SnapshotShotTray({ shots, onRemove, onSetRole, onSetNote, onMove }: SnapshotShotTrayProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tileRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // useRemoveFocusRefs (assessment-shared, generic over `{ id: string }`) is
  // imported, not reimplemented - it already owns the "focus the nearest
  // remaining neighbour, or the persistent container, on delete" idiom
  // GradingTable.tsx uses, and a generic import is exactly what "you may
  // touch assessment-shared only to import" permits.
  const { containerRef, registerRemoveRef, handleRemove } = useRemoveFocusRefs(shots, onRemove);

  const grouped = groupShotsByRole(shots);

  if (shots.length === 0) {
    return (
      <div ref={containerRef} tabIndex={-1} className={tray.trayEmpty}>
        <p className={styles.fieldHint}>No shots yet. Snap the shared screen, or paste or drop an image.</p>
      </div>
    );
  }

  const handleRovingKeyDown = (event: KeyboardEvent<HTMLButtonElement>, roleShots: SnapshotShot[], index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % roleShots.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + roleShots.length) % roleShots.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = roleShots.length - 1;
    else return;
    event.preventDefault();
    const nextShot = roleShots[nextIndex];
    tileRefs.current[nextShot.id]?.focus();
  };

  return (
    <div ref={containerRef} tabIndex={-1} className={tray.trayContainer}>
      {SNAPSHOT_ROLES.map((role) => {
        const roleShots = grouped[role];
        if (roleShots.length === 0) return null;
        return (
          <div key={role} className={tray.roleGroup}>
            <h3 className={tray.roleHeading}>{`${SNAPSHOT_ROLE_LABELS[role].toUpperCase()} (${roleShots.length})`}</h3>
            <div role="group" aria-label={`${SNAPSHOT_ROLE_LABELS[role]} shots`} className={tray.tileGrid}>
              {roleShots.map((shot, index) => {
                const selected = shot.id === selectedId;
                const tabbable = index === 0;
                return (
                  <button
                    key={shot.id}
                    type="button"
                    ref={(el) => {
                      tileRefs.current[shot.id] = el;
                    }}
                    className={`${tray.tile}${selected ? ` ${tray.tileSelected}` : ""}`}
                    aria-pressed={selected}
                    tabIndex={tabbable ? 0 : -1}
                    onKeyDown={(e) => handleRovingKeyDown(e, roleShots, index)}
                    onClick={() => setSelectedId(selected ? null : shot.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={shot.previewUrl} alt="" aria-hidden="true" className={tray.tileImg} />
                    <span className={tray.visuallyHidden}>{shotTileLabel(shot, index + 1, roleShots.length)}</span>
                    <span aria-hidden="true" className={tray.tileMeta}>
                      {`${index + 1}/${roleShots.length}`}
                    </span>
                  </button>
                );
              })}
            </div>

            {roleShots.some((s) => s.id === selectedId) && (
              <div className={tray.actionRow}>
                <span className={styles.ghMeta}>Set role:</span>
                {SNAPSHOT_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={tray.roleChoice}
                    onClick={() => {
                      if (selectedId) onSetRole(selectedId, r);
                    }}
                  >
                    {SNAPSHOT_ROLE_LABELS[r]}
                  </button>
                ))}
                {role === "other" && (
                  <input
                    type="text"
                    aria-label="Note for this shot"
                    placeholder="What is this?"
                    className={tray.noteInput}
                    value={roleShots.find((s) => s.id === selectedId)?.note ?? ""}
                    onChange={(e) => {
                      if (selectedId) onSetNote(selectedId, e.target.value);
                    }}
                  />
                )}
                <IconButton
                  size="small"
                  aria-label="Move shot earlier in this group"
                  disabled={!selectedId}
                  onClick={() => selectedId && onMove(selectedId, -1)}
                >
                  <ArrowUpIcon />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label="Move shot later in this group"
                  disabled={!selectedId}
                  onClick={() => selectedId && onMove(selectedId, 1)}
                >
                  <ArrowDownIcon />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label="Delete this shot"
                  ref={(el) => registerRemoveRef(selectedId ?? "", el)}
                  onClick={() => {
                    if (!selectedId) return;
                    const id = selectedId;
                    setSelectedId(null);
                    handleRemove(id);
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
