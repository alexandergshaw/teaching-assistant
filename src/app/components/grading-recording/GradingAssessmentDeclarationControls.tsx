"use client";

// docs/course-student-intelligence-acceptance-criteria.md D23a/D23b/D23d -
// the last piece of the offline missing-work feature. useGradingAssessmentDeclarations.ts
// was built, tested, and had NO caller anywhere in this app - verified
// directly against GradingRecordingPanel.tsx before this file existed: that
// panel mentioned the store only in comments. Without a face on it an
// instructor can capture and grade submissions all day and still never get
// an answer to "who has not submitted", because every deadline-based
// measure - absolute missing work, late work, resubmissions, and the
// recovering-versus-needs-outreach split - needs a declared deadline and a
// declared authoritative tool, and nothing anywhere let an instructor enter
// either. This file is that face - it gives the store a UI, it does not
// redesign it.
//
// TWO CONTROLS (D23a/D23b), for the assessment CURRENTLY SELECTED in
// GradingRecordingPanel.tsx:
//   1. A deadline - instructor-typed, never derived from a clock. Same D23c
//      reasoning that keeps a submission's own capture time out of this
//      surface's reach: any clock this app can read describes the
//      instructor's own working pattern, not the student's.
//   2. The authoritative grading tool for a KIND of work in this course
//      (D23a) - the homogeneity declaration itself. Declared, never
//      inferred - see useGradingAssessmentDeclarations.ts's own header,
//      "D23A'S HOMOGENEITY ASSUMPTION IS THE LOAD-BEARING IDEA".
//
// THE KEY-MATCHING TRAP. The declaration keys on (courseId, assessmentId),
// and `assessmentId` here MUST be the panel's own already-TRIMMED value
// (GradingRecordingPanel.tsx's `assessmentId = assessmentLabel.trim()`) -
// never the raw typed label. A declaration keyed on a differently
// normalised string silently refers to a DIFFERENT assessment than the
// grading rows do, and the failure is invisible: gradingAssessmentDeadline
// simply returns null, which reads as "no missing work" rather than as an
// error. This file never re-derives or re-trims `assessmentId` itself - it
// takes the panel's own value as-is (see computeGradingDeclarationView below,
// which does no trimming of its own, deliberately) and passes it straight
// through to every store call and lookup, so there is exactly one place in
// this whole feature that decides what "the same assessment" means.
//
// WHY A NEW FILE. GradingRecordingPanel.tsx was at 943 of the repo's
// 1000-line ceiling (src/file-size-ceiling.structure.test.ts) before this
// task - verified directly with `@(Get-Content ...).Count` before writing a
// line here. Every branch the JSX below renders is decided by
// computeGradingDeclarationView, a pure function, so it can be unit-tested
// directly - this repo's vitest is node-env and renders no component (see
// markLate.wiring.test.ts's own header), so the JSX below is pinned only by
// a source-text wiring test, and the actual behaviour lives in the pure
// function underneath it, mirroring grading-dispatch.ts's own
// checkGradingReadiness precedent.
//
// ACTUAL-TOOL, STATED HONESTLY. This panel IS a grading tool -
// "Screen recording (this app)" is the literal example name
// useGradingAssessmentDeclarations.ts's own GradingToolDeclaration doc
// comment gives for it (GRADING_RECORDING_TOOL_NAME below). Rows scoped to
// this exact (course, assessment) with a positive count were graded HERE,
// so that is what "actually producing rows" means from this file's own
// vantage point - it cannot see any other tool's output. A violation is
// only ever asserted when this app's own rows are known to exist for this
// assessment (`hasRows`); with none, there is nothing to compare against,
// and that is a gap (gradingAuthoritativeTool returning null), never a
// false violation.

import { MenuItem, TextField } from "@mui/material";
import controls from "../recording/RecordingControls.module.css";
import styles from "../../page.module.css";
import {
  GRADING_WORK_KINDS,
  gradingAssessmentToolViolation,
  gradingAuthoritativeTool,
  type GradingAssessmentDeclaration,
  type GradingToolDeclaration,
  type GradingWorkKind,
  type UseGradingAssessmentDeclarationsReturn,
} from "./useGradingAssessmentDeclarations";

/** This panel's own name for itself, in the declaration's own vocabulary -
 *  see this file's header. The one and only literal this file compares a
 *  declared tool against when checking for a violation. */
export const GRADING_RECORDING_TOOL_NAME = "Screen recording (this app)";

const VALID_WORK_KIND_INPUTS: readonly string[] = GRADING_WORK_KINDS;

/** Never guesses a work kind from free text - mirrors
 *  useGradingAssessmentDeclarations.ts's own coerceWorkKind discipline
 *  (D23a: a closed set, not free text). Not imported from that file because
 *  its own coercion helper is intentionally unexported (it exists to
 *  protect deserialization, not to be a general-purpose parser). */
function coerceWorkKindInput(raw: string): GradingWorkKind | null {
  return VALID_WORK_KIND_INPUTS.includes(raw) ? (raw as GradingWorkKind) : null;
}

export interface GradingDeclarationViewState {
  /** No assessment selected at all - there is nothing to declare against. */
  disabled: boolean;
  workKind: GradingWorkKind | null;
  deadline: string;
  declaredTool: string | null;
  /** True exactly when a mismatch is DETECTABLE and real - see
   *  gradingAssessmentToolViolation's own "must be checkable" contract. */
  violation: boolean;
}

/**
 * Pure - every branch the JSX below renders is decided here, so vitest
 * (node-env, renders nothing) can pin the actual behaviour rather than only
 * the markup shape.
 *
 * `assessmentId` is trusted as already-normalised (see this file's header
 * on the key-matching trap) - this function does NO trimming of its own,
 * deliberately, so a caller can never accidentally rely on this function to
 * paper over a mismatch it should never have introduced upstream.
 * SABOTAGE TARGET: adding `.trim()` here would hide, rather than fix, a
 * caller that forgot to trim before this point.
 */
export function computeGradingDeclarationView(
  courseId: string,
  assessmentId: string,
  hasRows: boolean,
  assessments: readonly GradingAssessmentDeclaration[],
  tools: readonly GradingToolDeclaration[]
): GradingDeclarationViewState {
  if (assessmentId === "") {
    return { disabled: true, workKind: null, deadline: "", declaredTool: null, violation: false };
  }
  const declared = assessments.find((a) => a.courseId === courseId && a.assessmentId === assessmentId) ?? null;
  const workKind = declared?.workKind ?? null;
  const deadline = declared?.deadline ?? "";
  const declaredTool = workKind ? gradingAuthoritativeTool(tools, courseId, workKind) : null;
  // SABOTAGE TARGET: dropping the `hasRows` gate (checking only
  // `declared !== null`) would assert a violation with nothing on this
  // screen to compare against - exactly the false confidence D23a warns
  // against, just aimed the other direction.
  const violation =
    declared !== null && hasRows ? gradingAssessmentToolViolation(declared, tools, GRADING_RECORDING_TOOL_NAME) : false;
  return { disabled: false, workKind, deadline, declaredTool, violation };
}

export interface GradingAssessmentDeclarationControlsProps {
  courseId: string;
  /** MUST be the panel's own already-trimmed value - see this file's
   *  header on the key-matching trap. */
  assessmentId: string;
  /** The untrimmed display label, persisted alongside the deadline so the
   *  declaration can show the instructor's own wording back to them - never
   *  matched or keyed on (mirrors GradingAssessmentDeclaration.assessmentLabel's
   *  own doc comment in useGradingAssessmentDeclarations.ts). */
  assessmentLabel: string;
  /** Whether this app's own rows exist for THIS (course, assessment) scope
   *  right now - the only fact this file can supply for `actualTool`. Pass
   *  `gradingRows.totalCount > 0` from the identically-scoped useGradingRows
   *  hook, never a value derived independently. */
  hasRows: boolean;
  declarations: UseGradingAssessmentDeclarationsReturn;
}

export default function GradingAssessmentDeclarationControls({
  courseId,
  assessmentId,
  assessmentLabel,
  hasRows,
  declarations,
}: GradingAssessmentDeclarationControlsProps) {
  const { assessments, tools, setAssessmentDeadline, setAuthoritativeTool } = declarations;
  const view = computeGradingDeclarationView(courseId, assessmentId, hasRows, assessments, tools);

  const handleWorkKindChange = (raw: string) => {
    const next = coerceWorkKindInput(raw);
    if (!next) return;
    setAssessmentDeadline(courseId, assessmentId, assessmentLabel, next, view.deadline);
  };

  const handleDeadlineChange = (next: string) => {
    // Disabled-with-a-visible-reason, never enabled-then-rejected (see the
    // deadline field's own `disabled` prop below) - this guard is the
    // second line of defence, not the only one.
    if (!view.workKind) return;
    setAssessmentDeadline(courseId, assessmentId, assessmentLabel, view.workKind, next);
  };

  const handleToolChange = (next: string) => {
    if (!view.workKind) return;
    setAuthoritativeTool(courseId, view.workKind, next);
  };

  return (
    <fieldset className={controls.section}>
      <legend className={controls.sectionLegend}>Deadline and grading tool (for missing-work tracking)</legend>
      {view.disabled && (
        <p className={styles.fieldHint}>
          Select or type an assessment above before declaring its deadline or grading tool - there is nothing to
          declare against yet.
        </p>
      )}
      <div className={styles.adaptRow}>
        <TextField
          select
          label="Kind of work"
          size="small"
          value={view.workKind ?? ""}
          onChange={(e) => handleWorkKindChange(e.target.value)}
          className={controls.fieldMd}
          disabled={view.disabled}
        >
          <MenuItem value="" disabled>
            Choose a kind of work
          </MenuItem>
          <MenuItem value="discussion">Discussion</MenuItem>
          <MenuItem value="assignment">Assignment</MenuItem>
        </TextField>
        <TextField
          label="Deadline"
          type="datetime-local"
          size="small"
          value={view.deadline}
          onChange={(e) => handleDeadlineChange(e.target.value)}
          className={controls.fieldMd}
          disabled={view.disabled || !view.workKind}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </div>
      {!view.disabled && !view.workKind && (
        <p className={styles.fieldHint}>
          No deadline or grading tool declared for this assessment yet - without them, who has not submitted this
          assessment cannot be answered. Choose what kind of work this is to get started.
        </p>
      )}
      {!view.disabled && view.workKind && !view.deadline && (
        <p className={styles.fieldHint}>
          No deadline declared - without one, who has not submitted this assessment cannot be answered.
        </p>
      )}
      <div className={styles.adaptRow}>
        <TextField
          label="Authoritative grading tool for this kind of work"
          size="small"
          value={view.declaredTool ?? ""}
          onChange={(e) => handleToolChange(e.target.value)}
          className={controls.fieldMd}
          disabled={view.disabled || !view.workKind}
          placeholder="e.g. Screen recording (this app), Canvas SpeedGrader"
        />
      </div>
      {!view.disabled && view.workKind && !view.declaredTool && (
        <p className={styles.fieldHint}>
          No grading tool declared for this kind of work in this course - missing-work detection needs one tool
          declared as the complete record for it.
        </p>
      )}
      {view.violation && (
        <p className={`${controls.notice} ${controls.noticeDanger}`} role="status" aria-live="polite">
          This assessment&apos;s declared grading tool is &quot;{view.declaredTool}&quot;, but its submissions are
          being graded here, in {GRADING_RECORDING_TOOL_NAME}. Its missing-work count is wrong until the declaration
          is fixed.
        </p>
      )}
    </fieldset>
  );
}
