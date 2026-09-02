"use client";

// docs/recording-controls-ux-acceptance-criteria.md CC2/CC17 (group M):
// extracted verbatim from ModuleDeckCapturePanel.tsx:670-733 minus :709-714
// (the "always produces N slides" hint, which the wiring test requires stays
// in the panel, rendered immediately after this component). ONE
// fieldset.section "Deck" holding three .adaptRow rows: course + module name,
// template alone, then the context textarea full width. All state and every
// persistence effect (the four persisted settings keys, the two-tier
// context-storage failure handling) stay in the panel - this file only
// renders controls and forwards their onChange back up. This file carries no
// persisted-key text of any kind (module-deck-capture.structure.test.ts pins
// the directory's distinct-key count at 4, all four owned by the panel).

import type { ReactNode } from "react";
import { MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import type { UseDiscussionCoursesReturn } from "../recording/useDiscussionCourses";
import type { DeckTemplate } from "@/lib/decks/types";

export interface ModuleDeckSettingsProps {
  courseId: string;
  setCourseId: (value: string) => void;
  courses: UseDiscussionCoursesReturn["courses"];
  coursesLoading: boolean;
  coursesError: string | null;
  moduleLabel: string;
  setModuleLabel: (value: string) => void;
  templateId: string;
  setTemplateId: (value: string) => void;
  templates: DeckTemplate[];
  templatesError: string | null;
  /** CC2/AM-C: the "always produces N slides" sentence - the literal text
   *  stays in ModuleDeckCapturePanel.tsx (ModuleDeckCapturePanel.wiring.
   *  test.ts pins it there) and is passed down so the DOM renders it
   *  directly under the template picker's own row instead of under the
   *  Context textarea. */
  templateHint?: ReactNode;
  contextText: string;
  setContextText: (value: string) => void;
  maxContextChars: number;
  contextPersistError: string | null;
}

export default function ModuleDeckSettings({
  courseId,
  setCourseId,
  courses,
  coursesLoading,
  coursesError,
  moduleLabel,
  setModuleLabel,
  templateId,
  setTemplateId,
  templates,
  templatesError,
  templateHint,
  contextText,
  setContextText,
  maxContextChars,
  contextPersistError,
}: ModuleDeckSettingsProps) {
  return (
    <fieldset className={controls.section}>
      <legend className={controls.sectionLegend}>Deck</legend>

      <div className={styles.adaptRow}>
        <TextField
          select
          label="Course (where the deck is saved)"
          size="small"
          className={controls.fieldMd}
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          disabled={coursesLoading}
        >
          <MenuItem value="">No course selected</MenuItem>
          {(courses ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Module name (optional)"
          size="small"
          className={controls.fieldMd}
          value={moduleLabel}
          onChange={(e) => setModuleLabel(e.target.value)}
        />
      </div>
      {coursesLoading && (
        <p role="status" aria-live="polite" className={controls.loadingLine}>
          <span className={styles.spinner} aria-hidden="true" /> Loading your courses…
        </p>
      )}
      {coursesError && (
        <p className={styles.fieldHint}>Could not load your courses - pick one once your connection recovers.</p>
      )}

      <div className={styles.adaptRow}>
        <TextField
          select
          label="Deck template"
          size="small"
          className={controls.fieldMd}
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          {templates.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.name}
            </MenuItem>
          ))}
        </TextField>
      </div>
      {templatesError && (
        <p className={styles.fieldHint}>Could not load your saved templates - the built-in presets above still work.</p>
      )}
      {templateHint}

      <div className={styles.adaptRow}>
        <TextField
          label="Context for this walkthrough (optional)"
          size="small"
          multiline
          minRows={2}
          maxRows={6}
          value={contextText}
          onChange={(e) => setContextText(e.target.value)}
          helperText={`${contextText.length} / ${maxContextChars} characters - reaches the model reading your screen, and describes what you are covering (it does not filter what gets read).`}
          fullWidth
        />
      </div>
      {contextPersistError && <p className={styles.fieldHint}>{contextPersistError}</p>}
    </fieldset>
  );
}
