// Pure parser for COURSE_BUILD's "outputs" run-form input: a multi-select
// (StepInputSpec.options + multi: true, types.ts) naming which families of
// generated content this run should produce - one, several, or all of what
// the no-code pipeline (lecture-materials-from-schedule, generate-course-
// guides, generate-weekly-announcements, generate-knowledge-checks,
// generate-weekly-significance, generate-instructor-notes, generate-weekly-
// qa, generate-weekly-current-events) can make.
//
// Deliberately pure - no I/O, no workflow engine - so
// steps.course-build-scope.ts's "select-course-outputs" step stays a thin
// wrapper (parse the runtime field, emit one boolean per family) and this
// file's own tests can exercise every edge case without any of that
// machinery. See course-setup.ts's COURSE_BUILD for how this is wired in.
//
// "Module introductions" (one of the deliverable kinds instructors think of
// this pipeline as producing) are NOT a family here: buildScheduleWeekPlan's
// moduleIntroduction rides as the OPENING SLIDE'S SPEAKER NOTES on the deck
// itself (registry-helpers.ts's assembleLectureFiles, withDeckNotes) - it is
// not a separable artifact, so there is no independent toggle for it; it
// always follows "decks".
export const OUTPUT_FAMILIES = [
  "assignments",
  "objectives",
  "openers",
  "decks",
  "guides",
  "announcements",
  "knowledgeChecks",
  "significance",
  "instructorNotes",
  // Appended, not inserted - the file-level comment above pins these keys as
  // stable/never-reordered. "codebase" mimics the codebase kickoff workflow
  // (repo-from-template/fill-readmes/lms-assignments' repo-driven grounding -
  // see steps.course-build-codebase.ts) and only produces something when this
  // run is already anchored to a real repository (course-schedule-from-
  // source's own "codebase"/"tile-repo" sources - courseKind "coding"; see
  // that step's own header comment). "startHere" seeds the Start Here module
  // (syllabus + syllabus-acknowledgement quiz always; a GitHub sign-up +
  // username-submission assignment only under that SAME codebase condition) -
  // see steps.course-setup.materials.ts's "starter-materials" step, reused
  // here via a new optional "selected" input rather than reimplemented.
  "codebase",
  "startHere",
  // Appended again, same rule: "qa" and "currentEvents" are COURSE_BUILD's
  // own two newest families (steps.course-build-qa.ts / steps.course-build-
  // current-events.ts), each a per-week document generated ONLY for a week
  // that already has real generated material to ground it in - anticipated
  // student Q&A reusing generateLectureQaAction unchanged, and a current-
  // events research report reusing researchCurrentEventsAction unchanged.
  // Neither is conditioned on isCodebase (unlike "codebase" above) - both
  // apply to every course kind and every schedule source, so "blank means
  // ALL" selects them unconditionally, same as every family before
  // "codebase".
  "qa",
  "currentEvents",
] as const;

export type OutputFamily = (typeof OUTPUT_FAMILIES)[number];

// Short human labels for the run form's multi-select OPTIONS/CHIPS, in the
// SAME order as OUTPUT_FAMILIES (StepInputSpec.options, types.ts) - options
// are stored by their raw family key (stable, never renamed - see
// parseOutputSelection), but this label text is what an instructor actually
// reads and selects by. Kept short deliberately: this text renders inside a
// dropdown option AND inside a selected chip (RuntimeFieldInput.tsx's
// Autocomplete), where a long aside reads as a wall of text rather than a
// pickable option. The fuller explanation each family used to carry inline
// (what "includes," what it requires, what "per-module" vs. "per-week"
// means) now lives in docs/WORKFLOW-RUN-FORM.md instead of being duplicated
// per option - see that doc's "Outputs to generate" section for the same
// detail this replaced.
export const OUTPUT_FAMILY_LABELS: Record<OutputFamily, string> = {
  assignments: "Assignments",
  objectives: "Module objectives",
  openers: "Class openers",
  decks: "Lecture decks",
  guides: "Course guides",
  announcements: "Weekly announcements",
  knowledgeChecks: "Knowledge checks / quizzes",
  significance: "Significance of the Material",
  instructorNotes: "Instructor notes",
  codebase: "Codebase and associated assignments",
  startHere: "Start Here module",
  qa: "Anticipated lecture Q&A",
  currentEvents: "Current events",
};

export interface OutputSelection {
  // True when the spec was blank - every family is selected. "Blank means
  // ALL": an existing saved run form with no value keeps generating
  // everything, exactly like today.
  all: boolean;
  // The exact set of families explicitly named, when `all` is false. Empty
  // when `all` is true (callers should consult `all` first).
  families: Set<OutputFamily>;
}

const FAMILY_SET: ReadonlySet<string> = new Set(OUTPUT_FAMILIES);

/**
 * Parse the newline-joined "outputs" runtime field (the multi-select's
 * stored form - StepInputSpec.multi, types.ts) into an OutputSelection.
 * Blank (or whitespace-only) input means "every family" (`all: true`).
 * Throws on a line that does not match one of OUTPUT_FAMILIES - the run form
 * offers a fixed set of options, so a value outside that set can only be a
 * stale/typo'd saved binding, never a legitimate free-text choice.
 */
export function parseOutputSelection(raw: string): OutputSelection {
  const lines = raw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (lines.length === 0) return { all: true, families: new Set() };

  const families = new Set<OutputFamily>();
  for (const line of lines) {
    if (!FAMILY_SET.has(line)) {
      throw new Error(
        `"${line}" is not a recognized output (expected one of: ${OUTPUT_FAMILIES.join(", ")}).`
      );
    }
    families.add(line as OutputFamily);
  }
  return { all: false, families };
}

/** Whether `family` should be generated under `selection` - true when the
 * selection is "all" (blank spec) or explicitly names this family. */
export function isOutputSelected(selection: OutputSelection, family: OutputFamily): boolean {
  return selection.all || selection.families.has(family);
}
