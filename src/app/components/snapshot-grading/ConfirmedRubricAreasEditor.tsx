"use client";

// Backlog 3.5 (scratchpad/b35-rulings.md, scratchpad/b35-design-r2.md
// section 7). Presentational only - every piece of state lives in
// SnapshotGradingPanel.tsx (Ruling B35-1/B35-3: the confirmed list is
// session-only, per-assignment, never persisted). Parsing a rubric
// screenshot cannot be made reliable ("Thesis (20 pts)" and "Excellent (20
// pts)" are byte-identical in grammar), so this component makes the parsed
// rubric areas EDITABLE BEFORE grading - taking the parser's precision out
// of the grading path.
//
// Four states, driven entirely by props: pending (confirmedRubricAreas ===
// null, no error), error (confirmedRubricAreasError set - text plus a retry
// button), populated non-empty (the editable list), and populated empty
// (rubricText supplied but nothing was confirmed - the model will grade
// unpinned, per Ruling B35-10's honest-copy requirement). The add form is
// available in every state except pending/error, and validation feedback for
// it (addAreaError) is a SEPARATE prop from confirmedRubricAreasError (the
// parse action's own error) - the two must never be conflated.

import { useState } from "react";
import { TextField, Button } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";

export interface ConfirmedRubricAreasEditorProps {
  confirmedRubricAreas: { name: string; points: number | null }[] | null;
  confirmedRubricAreasError: string | null;
  addAreaError: string | null;
  rubricText: string;
  onRemove: (index: number) => void;
  onAdd: (name: string, points: number | null) => void;
  onRetryParse: () => void;
}

export default function ConfirmedRubricAreasEditor({
  confirmedRubricAreas,
  confirmedRubricAreasError,
  addAreaError,
  rubricText,
  onRemove,
  onAdd,
  onRetryParse,
}: ConfirmedRubricAreasEditorProps) {
  const [newName, setNewName] = useState("");
  const [newPoints, setNewPoints] = useState("");

  // No rubric text at all means nothing to confirm - the panel's own
  // "No rubric text was supplied" hint (rendered elsewhere) already covers
  // this case, so this component renders nothing rather than a second,
  // redundant message.
  if (!rubricText.trim()) return null;

  const handleAdd = () => {
    const parsed = newPoints.trim() === "" ? null : Number(newPoints);
    onAdd(newName, parsed != null && Number.isFinite(parsed) ? parsed : null);
    setNewName("");
    setNewPoints("");
  };

  if (confirmedRubricAreasError) {
    return (
      <div>
        <p role="alert">{confirmedRubricAreasError}</p>
        <Button variant="outlined" size="small" onClick={onRetryParse}>
          Retry reading the rubric
        </Button>
      </div>
    );
  }

  if (confirmedRubricAreas === null) {
    return <p className={styles.fieldHint}>Reading the rubric...</p>;
  }

  return (
    <div>
      <p className={styles.fieldHint}>
        Rubric areas to grade (editable before grading) - confirm this list matches what you actually want
        scored. A screenshot cannot always be parsed reliably, so review it here rather than trusting the
        parse.
      </p>
      {confirmedRubricAreas.length === 0 ? (
        <p className={`${controls.notice} ${controls.noticeWarning}`} role="status" aria-live="polite">
          No rubric areas were recognized from the rubric text - add one below, or grade with the model
          choosing its own areas.
        </p>
      ) : (
        <ul>
          {confirmedRubricAreas.map((area, index) => (
            <li key={`${area.name}-${index}`}>
              {area.points != null ? `${area.name} (out of ${area.points})` : area.name}{" "}
              <Button variant="text" size="small" onClick={() => onRemove(index)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {addAreaError && <p role="alert">{addAreaError}</p>}
      <div className={styles.ghActions}>
        <TextField
          label="Area name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          size="small"
          slotProps={{ htmlInput: { "aria-label": "New rubric area name" } }}
        />
        <TextField
          label="Points (optional)"
          value={newPoints}
          onChange={(e) => setNewPoints(e.target.value)}
          size="small"
          slotProps={{ htmlInput: { "aria-label": "New rubric area points", inputMode: "decimal" } }}
        />
        <Button variant="outlined" size="small" onClick={handleAdd}>
          Add area
        </Button>
      </div>
    </div>
  );
}
