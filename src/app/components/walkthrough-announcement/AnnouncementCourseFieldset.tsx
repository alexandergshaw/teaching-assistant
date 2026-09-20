"use client";

// Extracted from WalkthroughAnnouncementPanel.tsx (backlog 4.1 - that panel
// was approaching the repo's 1000-line ceiling, and G3 wave 3 adds two more
// persisted controls to this exact fieldset). This is the "Course and
// format" fieldset ONLY - course/module pickers, the exemplar paste/save/
// browse flow, the emoji and resource-research toggles (G3 Ruling 4/34), the
// notes box, and the screen-share disclosure. Every literal server-action
// call still lives in the panel (blocker 5) - this component only renders
// and reports control changes upward via props, exactly like
// AnnouncementDraftSlot.tsx already does for the draft-slot row.
//
// Sized against THIS feature's own additions (the two new toggles), not
// against the 1000-line ceiling in the abstract - the repo has already paid
// once for extracting against the wrong target (modulesview-at-ceiling.md).

import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
import type { AnnouncementOutline } from "@/lib/announcement-outline-types";
import { savedFormatsStatusText, type SavedFormatsState } from "./announcement-draft-slots";

export interface AnnouncementExemplarSummary {
  id: string;
  label: string | null;
  createdAt: string;
  outline: AnnouncementOutline;
  exemplarPreview: string;
}

export interface WtaCourseOption {
  id: string;
  name: string;
  canvasUrl: string;
  institution: string | null;
}

export interface AnnouncementCourseFieldsetProps {
  readonly courses: readonly WtaCourseOption[] | null;
  readonly courseId: string;
  readonly onCourseIdChange: (value: string) => void;
  readonly coursesError: string | null;
  readonly moduleLabel: string;
  readonly onModuleLabelChange: (value: string) => void;

  readonly exemplarText: string;
  readonly onExemplarTextChange: (value: string) => void;
  readonly exemplarLabel: string;
  readonly onExemplarLabelChange: (value: string) => void;
  readonly savingExemplar: boolean;
  readonly onSaveExemplar: () => void;
  readonly exemplarSaved: boolean;
  readonly exemplarError: string | null;

  readonly showExemplarPicker: boolean;
  readonly onToggleExemplarPicker: () => void;
  readonly savedFormatsState: SavedFormatsState;
  readonly savedExemplars: readonly AnnouncementExemplarSummary[] | null;
  readonly canAddSlotFromExemplar: boolean;
  readonly onAddSlotFromExemplar: (exemplar: AnnouncementExemplarSummary) => void;
  readonly removeArmedId: string | null;
  readonly onArmRemoveExemplar: (id: string) => void;
  readonly onConfirmRemoveExemplar: (id: string) => void;
  readonly onCancelRemoveExemplar: () => void;

  readonly notesText: string;
  readonly maxNotesChars: number;
  readonly onNotesTextChange: (value: string) => void;

  /** G3 Ruling 4/11: whether the model is asked to use emojis in the drafted
   * announcement. Persisted under ta-rec-wta-emoji. */
  readonly emojiOn: boolean;
  readonly onEmojiOnChange: (value: boolean) => void;
  /** G3 Ruling 4/9/34: whether Generate researches and inserts relevant
   * resource links before drafting. Persisted under ta-rec-wta-resources. */
  readonly researchOn: boolean;
  readonly onResearchOnChange: (value: boolean) => void;
}

export default function AnnouncementCourseFieldset({
  courses,
  courseId,
  onCourseIdChange,
  coursesError,
  moduleLabel,
  onModuleLabelChange,
  exemplarText,
  onExemplarTextChange,
  exemplarLabel,
  onExemplarLabelChange,
  savingExemplar,
  onSaveExemplar,
  exemplarSaved,
  exemplarError,
  showExemplarPicker,
  onToggleExemplarPicker,
  savedFormatsState,
  savedExemplars,
  canAddSlotFromExemplar,
  onAddSlotFromExemplar,
  removeArmedId,
  onArmRemoveExemplar,
  onConfirmRemoveExemplar,
  onCancelRemoveExemplar,
  notesText,
  maxNotesChars,
  onNotesTextChange,
  emojiOn,
  onEmojiOnChange,
  researchOn,
  onResearchOnChange,
}: AnnouncementCourseFieldsetProps) {
  return (
    <fieldset className={controls.section}>
      <legend className={controls.sectionLegend}>Course and format</legend>
      <div className={styles.adaptRow}>
        <TextField
          select
          size="small"
          label="Course"
          className={controls.fieldMd}
          value={courseId}
          onChange={(e) => onCourseIdChange(e.target.value)}
        >
          {(courses ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label="Module or week (optional)"
          className={controls.fieldMd}
          value={moduleLabel}
          onChange={(e) => onModuleLabelChange(e.target.value)}
        />
      </div>
      {coursesError && (
        <div role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
          {coursesError}
        </div>
      )}
      <p className={styles.fieldHint}>Only courses linked to Canvas can be posted to.</p>

      <TextField
        size="small"
        label="Paste a previous announcement to match its format (optional)"
        value={exemplarText}
        onChange={(e) => onExemplarTextChange(e.target.value)}
        multiline
        minRows={4}
        fullWidth
      />
      <div className={styles.adaptRow}>
        <TextField
          size="small"
          label="Label (optional)"
          className={controls.fieldMd}
          value={exemplarLabel}
          onChange={(e) => onExemplarLabelChange(e.target.value)}
          disabled={!exemplarText.trim()}
        />
      </div>
      <div className={styles.ghActions}>
        <Button
          size="small"
          variant="outlined"
          disabled={!exemplarText.trim() || !courseId || savingExemplar}
          loading={savingExemplar}
          loadingPosition="start"
          onClick={onSaveExemplar}
        >
          {savingExemplar ? "Saving…" : "Save for reuse"}
        </Button>
        <Button size="small" variant="text" disabled={!courseId} onClick={onToggleExemplarPicker}>
          {showExemplarPicker ? "Hide saved exemplars" : "Browse saved exemplars"}
        </Button>
      </div>
      {exemplarSaved && <p className={styles.fieldHint}>Saved.</p>}
      {exemplarError && (
        <div role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
          {exemplarError}
        </div>
      )}

      {showExemplarPicker && (
        <div className={controls.stack}>
          {/* G1: reads the state directly rather than a loading boolean - a
              timed-out fetch is NOT "loaded and empty" (that would falsely
              claim the course has no saved exemplars when the fetch never
              determined that), so this must distinguish the four states, not
              collapse timedout/failed into "not loading". */}
          {(() => {
            const statusText = savedFormatsStatusText(savedFormatsState, (savedExemplars ?? []).length);
            return statusText ? <p className={styles.fieldHint}>{statusText}</p> : null;
          })()}
          {(savedExemplars ?? []).map((ex) => (
            <div key={ex.id} className={styles.adaptRow}>
              <Button
                size="small"
                variant="outlined"
                disabled={!canAddSlotFromExemplar}
                onClick={() => onAddSlotFromExemplar(ex)}
              >
                Add a draft from this
              </Button>
              <span className={styles.fieldHint}>{ex.label || new Date(ex.createdAt).toLocaleDateString()}</span>
              <span className={styles.fieldHint}>{ex.exemplarPreview}</span>
              <ConfirmArmButtons
                armed={removeArmedId === ex.id}
                idleLabel="Remove"
                confirmLabel="Confirm remove"
                tone="danger"
                idleVariant="text"
                onArm={() => onArmRemoveExemplar(ex.id)}
                onConfirm={() => onConfirmRemoveExemplar(ex.id)}
                onCancel={onCancelRemoveExemplar}
                consequenceId={`wta-remove-exemplar-${ex.id}`}
              />
            </div>
          ))}
        </div>
      )}

      {/* G3 Ruling 4/34: two always-visible, persisted format toggles - never
          nested inside showExemplarPicker or any other conditional (Ruling 7
          named exactly that trap for the controls the pass before this one
          almost shipped dead). */}
      <div className={styles.adaptRow}>
        <FormControlLabel
          control={<Checkbox size="small" checked={emojiOn} onChange={(e) => onEmojiOnChange(e.target.checked)} />}
          label="Use emojis in the draft"
        />
        <FormControlLabel
          control={<Checkbox size="small" checked={researchOn} onChange={(e) => onResearchOnChange(e.target.checked)} />}
          label="Research and cite relevant resource links"
        />
      </div>

      <TextField
        size="small"
        label={`Notes for this walkthrough - optional (${notesText.length}/${maxNotesChars})`}
        value={notesText}
        onChange={(e) => onNotesTextChange(e.target.value)}
        multiline
        minRows={2}
        fullWidth
      />

      <p className={styles.fieldHint}>
        Frames from your screen are sent to a third-party AI provider to be read while you capture. Share a single
        window rather than your whole screen, and close any gradebook, inbox, or student submission first.
      </p>
    </fieldset>
  );
}
