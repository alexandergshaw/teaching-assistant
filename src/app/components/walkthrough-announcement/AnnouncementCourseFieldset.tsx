"use client";

// Course, walkthrough notes, and draft options collapse once a run is underway.
// Reusable examples are edited in the panel's always-visible announcement library.

import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import annChat from "../recording/announcement-chat.module.css";
import type { AnnouncementOutline } from "@/lib/announcement-outline-types";

// Shared type API consumed by the Canvas announcement composer.
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
  /** SMOOTH-WALKTHROUGH W3 (R-F1-TOGGLE): whether stopping a capture drafts
   * automatically. Persisted under ta-rec-wta-autodraft. */
  readonly autoDraftOn: boolean;
  readonly onAutoDraftOnChange: (value: boolean) => void;
  /** WALKTHROUGH-MIMIC-CHAT (M1): when true the two input fieldsets are hidden
   * and a one-line setup summary (with a Change setup button) renders instead.
   * Derived by the panel via isSetupCollapsed. */
  readonly collapsed: boolean;
  readonly onExpand: () => void;
  /** Whether a capture is in progress. Gates the screen-share disclosure
   * (G4): it renders whenever NOT capturing, outside the collapse branch. */
  readonly capturing: boolean;
}

export default function AnnouncementCourseFieldset({
  courses,
  courseId,
  onCourseIdChange,
  coursesError,
  moduleLabel,
  onModuleLabelChange,
  notesText,
  maxNotesChars,
  onNotesTextChange,
  emojiOn,
  onEmojiOnChange,
  researchOn,
  onResearchOnChange,
  autoDraftOn,
  onAutoDraftOnChange,
  collapsed,
  onExpand,
  capturing,
}: AnnouncementCourseFieldsetProps) {
  const courseName = (courses ?? []).find((c) => c.id === courseId)?.name ?? "No course selected";
  return (
    <>
    {/* G4: the screen-share disclosure sits OUTSIDE the collapse branch and is
        gated on exactly !capturing, so it shows before every reachable Start,
        including the second run (capturing false, material still held). */}
    {!capturing && (
      <p className={styles.fieldHint}>
        Frames from your screen are sent to a third-party AI provider to be read while you capture. Share a single
        window rather than your whole screen, and close any gradebook, inbox, or student submission first.
      </p>
    )}
    {collapsed ? (
    <div className={annChat.setupSummary}>
      <span>
        Course: {courseName}
        {moduleLabel.trim() ? ` - Module: ${moduleLabel.trim()}` : ""}
      </span>
      <Button size="small" variant="text" onClick={onExpand}>
        Change setup
      </Button>
    </div>
    ) : (
    <>
    <fieldset className={controls.section}>
      <legend className={controls.sectionLegend}>Course and walkthrough</legend>
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
        label={`Notes for this walkthrough - optional (${notesText.length}/${maxNotesChars})`}
        value={notesText}
        onChange={(e) => onNotesTextChange(e.target.value)}
        multiline
        minRows={2}
        fullWidth
      />
    </fieldset>

    <fieldset className={controls.section}>
      <legend className={controls.sectionLegend}>Draft options</legend>
      <div className={styles.adaptRow}>
        <FormControlLabel
          control={<Checkbox size="small" checked={emojiOn} onChange={(e) => onEmojiOnChange(e.target.checked)} />}
          label="Use emojis in the draft"
        />
        <FormControlLabel
          control={<Checkbox size="small" checked={researchOn} onChange={(e) => onResearchOnChange(e.target.checked)} />}
          label="Research and cite relevant resource links"
        />
        <FormControlLabel
          control={<Checkbox size="small" checked={autoDraftOn} onChange={(e) => onAutoDraftOnChange(e.target.checked)} />}
          label="Draft automatically when capture stops"
        />
      </div>

    </fieldset>
    </>
    )}
    </>
  );
}
