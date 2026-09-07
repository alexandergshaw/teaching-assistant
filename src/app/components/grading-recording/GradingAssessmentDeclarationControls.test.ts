// Tests for GradingAssessmentDeclarationControls.tsx - the UI this task
// added on top of useGradingAssessmentDeclarations.ts (that store's own
// round-trip/coercion/upsert/violation properties are already covered by
// useGradingAssessmentDeclarations.test.ts and are not re-tested here).
//
// This repo's vitest is node-env and renders no component (see
// markLate.wiring.test.ts's own header) - the behavioural half is a pure
// function, computeGradingDeclarationView, tested directly below; the
// wiring half (the panel actually reaching this component with the right
// props, and the component actually reaching the pure function) is pinned
// with source-text checks, mirroring GradingRecordingPanel.assessment.test.ts's
// own pattern.
//
// Named *.test.ts, NOT *.test.tsx, so vitest.config.ts's
// `include: ["src/**/*.test.ts"]` actually collects this file - it imports
// only pure functions/constants from the .tsx component below, never JSX.
//
// SABOTAGE CHECK LOG (verified by actually breaking the source, re-running
// the specific `it`, confirming red, then reverting):
//   1. Dropped the `hasRows` gate in computeGradingDeclarationView's
//      violation line (left only `declared !== null ? gradingAssessmentToolViolation(...) : false`)
//      -> "no violation is asserted with nothing on screen to compare
//      against (hasRows false)" failed as expected: with a mismatched
//      declared tool and hasRows=false, violation flipped to true. Reverted.
//   2. Removed the `assessmentId === ""` early return entirely (the
//      hardcoded fallback return at the bottom of the function always says
//      `disabled: false`) -> "disables the whole surface when assessmentId
//      is empty" failed as expected: `view.disabled` came back `false`
//      where the test expects `true`. Reverted.
//   3. Added `.trim()` to the assessmentId used inside the .find() lookup
//      in computeGradingDeclarationView -> BOTH the behavioural test ("an
//      UNTRIMMED assessmentId does NOT match...", which expects `workKind`
//      to stay null) and the separate source-scan test ("this function
//      never trims assessmentId itself") failed as expected - the
//      behavioural one because trimming inside the lookup made the
//      untrimmed and trimmed keys resolve to the SAME record (workKind
//      came back "assignment", not null), which is exactly the silent
//      "helpfully" trimming this file's header forbids doing here (it
//      would hide a caller that forgot to trim upstream, in
//      GradingRecordingPanel.tsx, rather than surfacing the mismatch).
//      Reverted.
//   4. In GradingRecordingPanel.tsx, changed the controls' `assessmentId`
//      prop from `{assessmentId}` to `{assessmentLabel}` (the exact
//      key-matching trap this task's brief names) -> the wiring test
//      "passes assessmentId (the trimmed value)..." failed as expected.
//      Reverted.
//   5. In GradingRecordingPanel.tsx, changed the controls' `hasRows` prop
//      from `{gradingRows.totalCount > 0}` to a fixed `{true}` -> the
//      wiring test "passes hasRows from the assessment-scoped
//      gradingRows.totalCount..." failed as expected. Reverted.
//   6. In the component, changed the deadline field's
//      `disabled={view.disabled || !view.workKind}` to just
//      `disabled={view.disabled}` (the "enabled-then-rejected" failure mode
//      the task's brief explicitly warns against) -> "the deadline field is
//      disabled whenever there is no declared work kind" failed as
//      expected. Reverted.
//   7. Changed the violation notice's `role="status"` to `role="alert"` ->
//      "the violation notice does not use role=\"alert\"" failed as
//      expected. Reverted.

import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  GRADING_RECORDING_TOOL_NAME,
  computeGradingDeclarationView,
} from "./GradingAssessmentDeclarationControls";
import type { GradingAssessmentDeclaration, GradingToolDeclaration } from "./useGradingAssessmentDeclarations";

function makeAssessment(overrides: Partial<GradingAssessmentDeclaration> = {}): GradingAssessmentDeclaration {
  return {
    courseId: "course-A",
    assessmentId: "essay-2",
    assessmentLabel: "Essay 2",
    workKind: "assignment",
    deadline: "2026-09-15T23:59",
    ...overrides,
  };
}

function makeTool(overrides: Partial<GradingToolDeclaration> = {}): GradingToolDeclaration {
  return {
    courseId: "course-A",
    workKind: "assignment",
    tool: GRADING_RECORDING_TOOL_NAME,
    ...overrides,
  };
}

describe("GRADING_RECORDING_TOOL_NAME", () => {
  it("is the exact literal useGradingAssessmentDeclarations.ts's own doc comment names as the example for this app", () => {
    expect(GRADING_RECORDING_TOOL_NAME).toBe("Screen recording (this app)");
  });
});

describe("computeGradingDeclarationView: no assessment selected", () => {
  it("disables the whole surface when assessmentId is empty, regardless of what else is declared", () => {
    const view = computeGradingDeclarationView("course-A", "", true, [makeAssessment()], [makeTool()]);
    expect(view.disabled).toBe(true);
    expect(view.workKind).toBeNull();
    expect(view.deadline).toBe("");
    expect(view.declaredTool).toBeNull();
    expect(view.violation).toBe(false);
  });
});

describe("computeGradingDeclarationView: nothing declared yet for a real assessment", () => {
  it("is not disabled, but reports no work kind, no deadline and no declared tool", () => {
    const view = computeGradingDeclarationView("course-A", "essay-2", false, [], []);
    expect(view.disabled).toBe(false);
    expect(view.workKind).toBeNull();
    expect(view.deadline).toBe("");
    expect(view.declaredTool).toBeNull();
    expect(view.violation).toBe(false);
  });
});

describe("computeGradingDeclarationView: deadline and work kind round trip", () => {
  it("surfaces a declared deadline and work kind for this exact (course, assessment)", () => {
    const assessments = [makeAssessment({ workKind: "discussion", deadline: "2026-09-20T09:00" })];
    const view = computeGradingDeclarationView("course-A", "essay-2", false, assessments, []);
    expect(view.workKind).toBe("discussion");
    expect(view.deadline).toBe("2026-09-20T09:00");
  });

  it("a declaration for a DIFFERENT course never leaks into this one", () => {
    const assessments = [makeAssessment({ courseId: "course-B" })];
    const view = computeGradingDeclarationView("course-A", "essay-2", false, assessments, []);
    expect(view.workKind).toBeNull();
    expect(view.deadline).toBe("");
  });

  it("a declaration for a DIFFERENT assessment never leaks into this one", () => {
    const assessments = [makeAssessment({ assessmentId: "essay-3" })];
    const view = computeGradingDeclarationView("course-A", "essay-2", false, assessments, []);
    expect(view.workKind).toBeNull();
    expect(view.deadline).toBe("");
  });
});

describe("computeGradingDeclarationView: authoritative tool round trip", () => {
  it("surfaces the tool declared for this assessment's own work kind", () => {
    const assessments = [makeAssessment({ workKind: "assignment" })];
    const tools = [makeTool({ workKind: "assignment", tool: "Canvas SpeedGrader" })];
    const view = computeGradingDeclarationView("course-A", "essay-2", false, assessments, tools);
    expect(view.declaredTool).toBe("Canvas SpeedGrader");
  });

  it("reports null (a gap, not a violation) when no tool is declared for this work kind yet", () => {
    const assessments = [makeAssessment({ workKind: "assignment" })];
    const view = computeGradingDeclarationView("course-A", "essay-2", false, assessments, []);
    expect(view.declaredTool).toBeNull();
    expect(view.violation).toBe(false);
  });

  it("a tool declared for a DIFFERENT work kind never applies", () => {
    const assessments = [makeAssessment({ workKind: "assignment" })];
    const tools = [makeTool({ workKind: "discussion", tool: "Canvas SpeedGrader" })];
    const view = computeGradingDeclarationView("course-A", "essay-2", false, assessments, tools);
    expect(view.declaredTool).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// THE KEY-MATCHING TRAP (the task brief's own name for it).
// ---------------------------------------------------------------------------

describe("computeGradingDeclarationView: key normalisation matches the panel's trimmed value", () => {
  it("a label typed with surrounding whitespace in one place and without it in the other resolves to the SAME record when both sides are trimmed the same way the panel already does", () => {
    const assessments = [makeAssessment({ assessmentId: "Essay 2".trim() })];
    const fromRawWithSpaces = " Essay 2 ".trim();
    const fromPlainLabel = "Essay 2".trim();
    expect(fromRawWithSpaces).toBe(fromPlainLabel);
    const view = computeGradingDeclarationView("course-A", fromRawWithSpaces, false, assessments, []);
    expect(view.workKind).not.toBeNull();
  });

  it("SABOTAGE-relevant: an UNTRIMMED assessmentId does NOT match a declaration stored under the trimmed key - the failure is silent (reads as \"not declared\"), never an error, which is exactly why the panel must trim before this function ever sees the value", () => {
    const assessments = [makeAssessment({ assessmentId: "Essay 2" })];
    const trimmedLookup = computeGradingDeclarationView("course-A", "Essay 2", false, assessments, []);
    const untrimmedLookup = computeGradingDeclarationView("course-A", "Essay 2 ", false, assessments, []);
    expect(trimmedLookup.disabled).toBe(false);
    expect(trimmedLookup.workKind).not.toBeNull();
    expect(untrimmedLookup.disabled).toBe(false); // a non-empty string, so NOT the "no assessment" gate
    expect(untrimmedLookup.workKind).toBeNull(); // yet it silently finds nothing
  });

  it("this function never trims assessmentId itself - trimming is entirely the caller's responsibility", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/components/grading-recording/GradingAssessmentDeclarationControls.tsx"),
      "utf-8"
    );
    const fnStart = source.indexOf("export function computeGradingDeclarationView");
    const fnBody = source.slice(fnStart, source.indexOf("\n}", fnStart));
    expect(fnBody).not.toMatch(/assessmentId\.trim\(\)/);
  });
});

// ---------------------------------------------------------------------------
// D23a's violation check, as rendered by this surface.
// ---------------------------------------------------------------------------

describe("computeGradingDeclarationView: the D23a tool-violation check", () => {
  it("SABOTAGE TARGET: a real violation is detected when this app's own rows exist and the declared tool is something else", () => {
    const assessments = [makeAssessment({ workKind: "assignment" })];
    const tools = [makeTool({ workKind: "assignment", tool: "Canvas SpeedGrader" })];
    const view = computeGradingDeclarationView("course-A", "essay-2", true, assessments, tools);
    expect(view.violation).toBe(true);
    expect(view.declaredTool).toBe("Canvas SpeedGrader");
  });

  it("no violation when the declared tool IS this app's own name", () => {
    const assessments = [makeAssessment({ workKind: "assignment" })];
    const tools = [makeTool({ workKind: "assignment", tool: GRADING_RECORDING_TOOL_NAME })];
    const view = computeGradingDeclarationView("course-A", "essay-2", true, assessments, tools);
    expect(view.violation).toBe(false);
  });

  it("SABOTAGE-relevant: no violation when this app has no rows for this assessment (hasRows false), even with a mismatched declared tool - nothing on screen to compare against yet", () => {
    const assessments = [makeAssessment({ workKind: "assignment" })];
    const tools = [makeTool({ workKind: "assignment", tool: "Canvas SpeedGrader" })];
    const view = computeGradingDeclarationView("course-A", "essay-2", false, assessments, tools);
    expect(view.violation).toBe(false);
  });

  it("no violation when nothing has been declared for this assessment at all", () => {
    const view = computeGradingDeclarationView("course-A", "essay-2", true, [], []);
    expect(view.violation).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wiring - the controls are actually reachable from the panel, and the
// component actually reaches the pure function above (source-text checks,
// mirroring GradingRecordingPanel.assessment.test.ts's own pattern).
// ---------------------------------------------------------------------------

const COMPONENT_PATH = path.resolve(
  process.cwd(),
  "src/app/components/grading-recording/GradingAssessmentDeclarationControls.tsx"
);
const PANEL_PATH = path.resolve(process.cwd(), "src/app/components/grading-recording/GradingRecordingPanel.tsx");
const COMPONENT = fs.readFileSync(COMPONENT_PATH, "utf-8");
const PANEL = fs.readFileSync(PANEL_PATH, "utf-8");

describe("the declaration controls are wired into GradingRecordingPanel.tsx end to end", () => {
  it("the panel calls useGradingAssessmentDeclarations() and holds the result", () => {
    expect(PANEL).toMatch(/const declarations = useGradingAssessmentDeclarations\(\);/);
  });

  it("the panel renders <GradingAssessmentDeclarationControls ... /> at all - a check over nothing proves nothing", () => {
    const match = PANEL.match(/<GradingAssessmentDeclarationControls\b[\s\S]*?\/>/);
    expect(match, "expected to find a <GradingAssessmentDeclarationControls ... /> element in the panel").not.toBeNull();
  });

  it("KEY-MATCHING TRAP: passes assessmentId (the trimmed value) - never assessmentLabel (the raw typed value) - into the controls' assessmentId prop", () => {
    const match = PANEL.match(/<GradingAssessmentDeclarationControls\b[\s\S]*?\/>/);
    expect(match![0]).toMatch(/assessmentId=\{assessmentId\}/);
    expect(match![0]).not.toMatch(/assessmentId=\{assessmentLabel\}/);
  });

  it("passes the untrimmed assessmentLabel separately, for display only", () => {
    const match = PANEL.match(/<GradingAssessmentDeclarationControls\b[\s\S]*?\/>/);
    expect(match![0]).toMatch(/assessmentLabel=\{assessmentLabel\}/);
  });

  it("passes hasRows from the assessment-scoped gradingRows.totalCount, never a fixed literal or an unscoped count", () => {
    const match = PANEL.match(/<GradingAssessmentDeclarationControls\b[\s\S]*?\/>/);
    expect(match![0]).toMatch(/hasRows=\{gradingRows\.totalCount > 0\}/);
  });

  it("passes the same declarations object returned by the hook, not a reconstructed subset", () => {
    const match = PANEL.match(/<GradingAssessmentDeclarationControls\b[\s\S]*?\/>/);
    expect(match![0]).toMatch(/declarations=\{declarations\}/);
  });
});

describe("the component itself reaches the pure function - the JSX is not deciding anything on its own", () => {
  it("derives its `view` from computeGradingDeclarationView, not from ad hoc conditionals scattered through the JSX", () => {
    expect(COMPONENT).toMatch(
      /const view = computeGradingDeclarationView\(courseId, assessmentId, hasRows, assessments, tools\);/
    );
  });

  it("the deadline field is disabled whenever there is no declared work kind - never enabled-then-rejected", () => {
    const idx = COMPONENT.indexOf('type="datetime-local"');
    const near = COMPONENT.slice(idx, idx + 400);
    expect(near).toMatch(/disabled=\{view\.disabled \|\| !view\.workKind\}/);
  });

  it("the authoritative-tool field is disabled under the identical condition as the deadline field", () => {
    const idx = COMPONENT.indexOf("Authoritative grading tool");
    const near = COMPONENT.slice(idx, idx + 400);
    expect(near).toMatch(/disabled=\{view\.disabled \|\| !view\.workKind\}/);
  });

  it("the violation notice is actually rendered, gated on view.violation, and names the declared tool and this app", () => {
    expect(COMPONENT).toMatch(/\{view\.violation && \(/);
    const idx = COMPONENT.indexOf("{view.violation && (");
    const near = COMPONENT.slice(idx, idx + 400);
    expect(near).toContain("{view.declaredTool}");
    expect(near).toContain("{GRADING_RECORDING_TOOL_NAME}");
  });

  it("the violation notice does not use role=\"alert\" - CC11 (GradingRecordingPanel.tsx's own header) already forbids a second, simultaneous alert region on this panel", () => {
    const idx = COMPONENT.indexOf("{view.violation && (");
    const region = COMPONENT.slice(idx, idx + 400);
    expect(region).not.toMatch(/role="alert"/);
  });

  it("never reads a clock anywhere in this file - the deadline is instructor-typed or absent, per the hard constraint this task was given", () => {
    expect(COMPONENT).not.toMatch(/new Date\(\)/);
    expect(COMPONENT).not.toContain("Date.now(");
  });

  it("finds both files non-trivially, so a rename or move cannot make this suite vacuously pass", () => {
    expect(COMPONENT.length).toBeGreaterThan(1000);
    expect(PANEL.length).toBeGreaterThan(1000);
  });
});
