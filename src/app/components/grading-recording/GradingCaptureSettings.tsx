"use client";

// docs/a16-wave1-scope.md sections 0/7: the Capture fieldset extracted out of
// GradingRecordingPanel.tsx once that file was pressing on
// file-size-ceiling.structure.test.ts's 1000-line ceiling. Moved here: the
// course TextField-select with its loading/error/no-roster hints, and the
// D22b/D23e assessment Autocomplete with its own hint - the whole former
// GradingRecordingPanel.tsx:714-784 block, verbatim, following the same
// extraction already performed on DiscussionCaptureSettings.tsx (recording/)
// and ModuleDeckSettings.tsx (module-deck-capture/) for their own panels'
// identical Capture sections. See those two files' own headers for the
// precedent; this file copies the SHAPE, never imports either of them.
//
// NO HOOK MOVES (docs/a16-plan.md section 5.6): both useState/useCallback
// pairs, useGradingCourses, the assessmentOptions useMemo and the
// assessmentId derivation all stay in GradingRecordingPanel.tsx - this file
// takes only the already-derived values and setters across the boundary, so
// the panel's own hook count and shape are unchanged (this-repo.md's
// preserve-manual-memoization account has nothing to react to here).
//
// courses is typed as GradingCourseOption[] (useGradingCourses.ts), not a
// second structural {id, name} type the way DiscussionCaptureSettings.tsx:53
// declares - this component reaches selectedRosterText, which that sibling
// does not.

import { Autocomplete, MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import type { GradingCourseOption } from "./useGradingCourses";

export interface GradingCaptureSettingsProps {
  courseId: string;
  setCourseId: (next: string) => void;
  courses: GradingCourseOption[] | null;
  coursesLoading: boolean;
  coursesError: string | null;
  /** selectedCourse?.roster ?? null - the raw roster text, already resolved
   *  by the panel; only the hint gate reads it here. */
  selectedRosterText: string | null;
  assessmentOptions: string[];
  assessmentLabel: string;
  setAssessmentLabel: (next: string) => void;
  /** The TRIMMED label. The hint gates on this, never on assessmentLabel,
   *  so whitespace-only input still shows the hint. */
  assessmentId: string;
}

export default function GradingCaptureSettings({
  courseId,
  setCourseId,
  courses,
  coursesLoading,
  coursesError,
  selectedRosterText,
  assessmentOptions,
  assessmentLabel,
  setAssessmentLabel,
  assessmentId,
}: GradingCaptureSettingsProps) {
  return (
    <fieldset className={controls.section}>
      <legend className={controls.sectionLegend}>Capture</legend>
      {/* Fixer pass finding 2: the select used to UNMOUNT while courses
          were loading (a ternary swapping the field for the loading line
          entirely) - kept mounted and disabled instead, matching
          DiscussionCaptureSettings.tsx/ModuleDeckSettings.tsx's own shape,
          so the field's position on screen never jumps and a keyboard user
          tabbing toward it does not land somewhere else mid-load. */}
      <div className={styles.adaptRow}>
        <TextField
          select
          label="Course (for roster matching)"
          size="small"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className={controls.fieldMd}
          disabled={coursesLoading}
        >
          <MenuItem value="">No course selected</MenuItem>
          {(courses ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
      </div>
      {coursesLoading && (
        <p role="status" aria-live="polite" className={controls.loadingLine}>
          <span className={styles.spinner} aria-hidden="true" /> Loading your courses…
        </p>
      )}
      {coursesError && (
        <p className={styles.fieldHint}>Could not load your courses - roster matching is unavailable, capture still works.</p>
      )}
      {courseId && !selectedRosterText && (
        <p className={styles.fieldHint}>
          This course has no roster on file - names will show as &quot;No roster to check&quot; until one is added to its course tile.
        </p>
      )}
      {/* D22b/D23e: the assessment selector - free text, since there is no
          LMS to enumerate assignments from. Autocomplete/freeSolo mirrors
          GithubRepoPicker.tsx's own established shape for "type-to-filter,
          free entry allowed" in this codebase - suggestions come from this
          course's own previously-typed labels (assessmentOptions above),
          never a closed catalogue. Not required to start capture (course
          selection is not required either, for the identical reason:
          D21d/D22b both treat "unattributed" as an honest, correctable-
          going-forward outcome rather than a blocked one) - the hint below
          says exactly what happens if it is left blank, so nothing here is
          ever enabled and then silently rejected. */}
      <div className={styles.adaptRow}>
        <Autocomplete
          freeSolo
          options={assessmentOptions}
          value={assessmentLabel}
          onInputChange={(_, next) => setAssessmentLabel(next)}
          size="small"
          className={controls.fieldMd}
          renderInput={(params) => (
            <TextField {...params} label="Assessment (your own label - e.g. Essay 2, Week 3 discussion)" />
          )}
        />
      </div>
      {assessmentId === "" && (
        <p className={styles.fieldHint}>
          No assessment set - submissions captured now will not be attributed to any assessment. Type one above at
          any point; it will apply to submissions captured from then on, not to rows already recorded.
        </p>
      )}
    </fieldset>
  );
}
