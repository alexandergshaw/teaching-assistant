// Unit tests for useGradingAssessmentDeclarations.ts - the D23a/D23b
// per-course, per-assessment declaration store (deadline + authoritative
// tool). This repo's vitest is node-env and renders nothing (see
// useGradingRows.wiring.test.ts's own header) so the hook itself is not
// rendered here; every property that matters - round trip, coercion,
// upsert, lookup, and the violation check - lives in the PURE functions
// this file tests directly, mirroring grading-row.test.ts's own "test the
// pure function, not the React wrapper" discipline.
//
// SABOTAGE CHECK LOG (verified by actually breaking the source, re-running,
// and reverting - grading-row-serialization.test.ts's own log is the
// precedent for recording this inline):
//   1. Removed deserializeGradingDeclarations's outer try/catch -> "never
//      throws on garbage input" failed by actually throwing a SyntaxError
//      from JSON.parse, as expected. Reverted.
//   2. Changed coerceWorkKind's VALID_WORK_KINDS.has(raw) check to always
//      return the raw string uncoerced -> "an invalid workKind drops the
//      assessment record rather than guessing at one" failed as expected (a
//      record with workKind "essay" - not a real work kind - survived into
//      the parsed result instead of being dropped). Reverted.
//   3. Changed upsertAssessmentDeclaration's findIndex key comparison from
//      `a.courseId === next.courseId && a.assessmentId === next.assessmentId`
//      to only `a.assessmentId === next.assessmentId` (dropping the course
//      check) -> "the same assessmentId in two different courses does not
//      collide" failed as expected (course B's declaration overwrote course
//      A's). Reverted - this is the load-bearing key discipline D23a
//      depends on: per-course, per-work-kind, never merged across courses.
//   4. Changed gradingAssessmentToolViolation's `declared !== actualTool`
//      to always return `false` -> "SABOTAGE TARGET: a real violation is
//      detected" failed as expected (a known-mismatched actualTool no
//      longer registered as a violation). Reverted - this is D23a's own
//      "must be checkable" requirement; silently returning false here is
//      exactly the "half-migrated assessment producing a confident missing
//      list" D23a calls out as the worst outcome.

import { describe, it, expect } from "vitest";
import {
  GRADING_WORK_KINDS,
  serializeGradingDeclarations,
  deserializeGradingDeclarations,
  gradingAssessmentDeadline,
  gradingAuthoritativeTool,
  upsertAssessmentDeclaration,
  upsertToolDeclaration,
  gradingAssessmentToolViolation,
  type GradingAssessmentDeclaration,
  type GradingToolDeclaration,
} from "./useGradingAssessmentDeclarations";

function makeAssessment(overrides: Partial<GradingAssessmentDeclaration> = {}): GradingAssessmentDeclaration {
  return {
    courseId: "course-A",
    assessmentId: "essay-2",
    assessmentLabel: "Essay 2",
    workKind: "assignment",
    deadline: "2026-09-15T23:59:00Z",
    ...overrides,
  };
}

function makeTool(overrides: Partial<GradingToolDeclaration> = {}): GradingToolDeclaration {
  return {
    courseId: "course-A",
    workKind: "assignment",
    tool: "Screen recording (this app)",
    ...overrides,
  };
}

describe("GRADING_WORK_KINDS", () => {
  it("is exactly discussion and assignment, per D23a's own quoted granularity", () => {
    expect(GRADING_WORK_KINDS).toEqual(["discussion", "assignment"]);
  });
});

// ---------------------------------------------------------------------------
// Round trip - deadline per course/assessment, tool per course/work kind.
// ---------------------------------------------------------------------------

describe("serializeGradingDeclarations / deserializeGradingDeclarations round trip", () => {
  it("D23b: round-trips an assessment's deadline", () => {
    const assessments = [makeAssessment({ deadline: "2026-09-15T23:59:00Z" })];
    const raw = serializeGradingDeclarations(assessments, []);
    const restored = deserializeGradingDeclarations(raw);
    expect(restored.assessments).toEqual(assessments);
  });

  it("D23a: round-trips a declared authoritative tool", () => {
    const tools = [makeTool({ tool: "Canvas SpeedGrader" })];
    const raw = serializeGradingDeclarations([], tools);
    const restored = deserializeGradingDeclarations(raw);
    expect(restored.tools).toEqual(tools);
  });

  it("round-trips both lists together, per course, per assessment / work kind, for MULTIPLE courses without cross-contamination", () => {
    const assessments = [
      makeAssessment({ courseId: "course-A", assessmentId: "essay-2", deadline: "2026-09-15T23:59:00Z" }),
      makeAssessment({ courseId: "course-B", assessmentId: "essay-2", deadline: "2026-10-01T23:59:00Z", workKind: "discussion" }),
    ];
    const tools = [
      makeTool({ courseId: "course-A", workKind: "assignment", tool: "Screen recording (this app)" }),
      makeTool({ courseId: "course-B", workKind: "discussion", tool: "Canvas SpeedGrader" }),
    ];
    const restored = deserializeGradingDeclarations(serializeGradingDeclarations(assessments, tools));
    expect(restored.assessments).toEqual(assessments);
    expect(restored.tools).toEqual(tools);
    // The SAME assessmentId ("essay-2") in two different courses must stay
    // two distinct records, not collapse into one - D23a's own "declared per
    // course" granularity.
    expect(gradingAssessmentDeadline(restored.assessments, "course-A", "essay-2")).toBe("2026-09-15T23:59:00Z");
    expect(gradingAssessmentDeadline(restored.assessments, "course-B", "essay-2")).toBe("2026-10-01T23:59:00Z");
  });

  it("an empty store round-trips to two empty arrays", () => {
    const restored = deserializeGradingDeclarations(serializeGradingDeclarations([], []));
    expect(restored).toEqual({ assessments: [], tools: [] });
  });
});

// ---------------------------------------------------------------------------
// Coercion - never throws, never guesses a work kind, drops what it cannot
// recover.
// ---------------------------------------------------------------------------

describe("deserializeGradingDeclarations: coercion", () => {
  it.each([null, "", "not json at all {{{", "[]", '{"v":1}', '{"v":99,"assessments":[],"tools":[]}'])(
    "never throws on garbage input %j, and returns empty lists",
    (garbage) => {
      expect(() => deserializeGradingDeclarations(garbage)).not.toThrow();
      expect(deserializeGradingDeclarations(garbage)).toEqual({ assessments: [], tools: [] });
    }
  );

  it("SABOTAGE TARGET: an invalid workKind drops the assessment record rather than guessing at one", () => {
    const raw = JSON.stringify({
      v: 1,
      assessments: [{ courseId: "course-A", assessmentId: "essay-2", assessmentLabel: "Essay 2", workKind: "essay", deadline: "" }],
      tools: [],
    });
    expect(deserializeGradingDeclarations(raw).assessments).toEqual([]);
  });

  it("an invalid workKind drops the tool record too", () => {
    const raw = JSON.stringify({
      v: 1,
      assessments: [],
      tools: [{ courseId: "course-A", workKind: "essay", tool: "Some tool" }],
    });
    expect(deserializeGradingDeclarations(raw).tools).toEqual([]);
  });

  it("an assessment record with no usable courseId or assessmentId is dropped, but a recoverable sibling survives", () => {
    const raw = JSON.stringify({
      v: 1,
      assessments: [
        { courseId: "course-A", assessmentId: "essay-2", assessmentLabel: "Essay 2", workKind: "assignment", deadline: "" },
        { courseId: "", assessmentId: "essay-3", assessmentLabel: "Essay 3", workKind: "assignment", deadline: "" },
        { courseId: "course-A", assessmentId: "", assessmentLabel: "No id", workKind: "assignment", deadline: "" },
      ],
      tools: [],
    });
    expect(deserializeGradingDeclarations(raw).assessments.map((a) => a.assessmentId)).toEqual(["essay-2"]);
  });

  it("a missing deadline/assessmentLabel/tool defaults to an empty string, not undefined", () => {
    const raw = JSON.stringify({
      v: 1,
      assessments: [{ courseId: "course-A", assessmentId: "essay-2", workKind: "assignment" }],
      tools: [{ courseId: "course-A", workKind: "assignment" }],
    });
    const restored = deserializeGradingDeclarations(raw);
    expect(restored.assessments[0].deadline).toBe("");
    expect(restored.assessments[0].assessmentLabel).toBe("");
    expect(restored.tools[0].tool).toBe("");
  });

  it("a stored blob from a hypothetical older/future version degrades to empty rather than guessing at an unknown shape", () => {
    const olderVersionBlob = JSON.stringify({ v: 0, assessments: [makeAssessment()], tools: [makeTool()] });
    expect(deserializeGradingDeclarations(olderVersionBlob)).toEqual({ assessments: [], tools: [] });
  });

  it("never mistakes a non-object top-level payload, or a non-array assessments/tools field, for real data", () => {
    expect(deserializeGradingDeclarations("42")).toEqual({ assessments: [], tools: [] });
    expect(deserializeGradingDeclarations('{"v":1,"assessments":"nope","tools":"nope"}')).toEqual({
      assessments: [],
      tools: [],
    });
  });
});

// ---------------------------------------------------------------------------
// Upsert - replaces by key, never duplicates, never cross-contaminates
// courses.
// ---------------------------------------------------------------------------

describe("upsertAssessmentDeclaration", () => {
  it("appends a brand-new (courseId, assessmentId)", () => {
    const result = upsertAssessmentDeclaration([], makeAssessment());
    expect(result).toEqual([makeAssessment()]);
  });

  it("replaces the existing record for the SAME (courseId, assessmentId), never duplicating it", () => {
    const original = makeAssessment({ deadline: "2026-09-15T23:59:00Z" });
    const updated = makeAssessment({ deadline: "2026-09-20T23:59:00Z" });
    const result = upsertAssessmentDeclaration([original], updated);
    expect(result).toHaveLength(1);
    expect(result[0].deadline).toBe("2026-09-20T23:59:00Z");
  });

  it("SABOTAGE-relevant: the same assessmentId in two DIFFERENT courses does not collide - both survive as distinct records", () => {
    const courseA = makeAssessment({ courseId: "course-A", assessmentId: "essay-2" });
    const result = upsertAssessmentDeclaration([courseA], makeAssessment({ courseId: "course-B", assessmentId: "essay-2" }));
    expect(result).toHaveLength(2);
    expect(gradingAssessmentDeadline(result, "course-A", "essay-2")).toBe(courseA.deadline);
    expect(gradingAssessmentDeadline(result, "course-B", "essay-2")).toBe(makeAssessment().deadline);
  });

  it("leaves every OTHER assessment's record untouched", () => {
    const untouched = makeAssessment({ assessmentId: "essay-1", deadline: "2026-09-01T23:59:00Z" });
    const result = upsertAssessmentDeclaration([untouched], makeAssessment({ assessmentId: "essay-2" }));
    expect(result.find((a) => a.assessmentId === "essay-1")).toEqual(untouched);
  });
});

describe("upsertToolDeclaration", () => {
  it("appends a brand-new (courseId, workKind)", () => {
    const result = upsertToolDeclaration([], makeTool());
    expect(result).toEqual([makeTool()]);
  });

  it("replaces the existing record for the SAME (courseId, workKind), never duplicating it", () => {
    const original = makeTool({ tool: "Canvas SpeedGrader" });
    const updated = makeTool({ tool: "Screen recording (this app)" });
    const result = upsertToolDeclaration([original], updated);
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe("Screen recording (this app)");
  });

  it("discussion and assignment declarations for the SAME course are independent", () => {
    const discussionTool = makeTool({ workKind: "discussion", tool: "Screen recording (this app)" });
    const result = upsertToolDeclaration([discussionTool], makeTool({ workKind: "assignment", tool: "Canvas SpeedGrader" }));
    expect(gradingAuthoritativeTool(result, "course-A", "discussion")).toBe("Screen recording (this app)");
    expect(gradingAuthoritativeTool(result, "course-A", "assignment")).toBe("Canvas SpeedGrader");
  });
});

// ---------------------------------------------------------------------------
// Lookups - null (not "") means "not declared".
// ---------------------------------------------------------------------------

describe("gradingAssessmentDeadline", () => {
  it("returns the declared deadline", () => {
    expect(gradingAssessmentDeadline([makeAssessment({ deadline: "2026-09-15T23:59:00Z" })], "course-A", "essay-2")).toBe(
      "2026-09-15T23:59:00Z"
    );
  });

  it("returns null, never '', when nothing is declared for that (courseId, assessmentId)", () => {
    expect(gradingAssessmentDeadline([], "course-A", "essay-2")).toBeNull();
  });

  it("returns null when a record exists but its deadline is still the empty-string default", () => {
    expect(gradingAssessmentDeadline([makeAssessment({ deadline: "" })], "course-A", "essay-2")).toBeNull();
  });
});

describe("gradingAuthoritativeTool", () => {
  it("returns the declared tool", () => {
    expect(gradingAuthoritativeTool([makeTool({ tool: "Canvas SpeedGrader" })], "course-A", "assignment")).toBe(
      "Canvas SpeedGrader"
    );
  });

  it("returns null, never '', when nothing is declared for that (courseId, workKind)", () => {
    expect(gradingAuthoritativeTool([], "course-A", "assignment")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D23a's "must be checkable" requirement.
// ---------------------------------------------------------------------------

describe("gradingAssessmentToolViolation (D23a)", () => {
  it("SABOTAGE TARGET: a real violation is detected - grading for this assessment's work kind turned up in an undeclared tool", () => {
    const assessment = makeAssessment({ courseId: "course-A", workKind: "assignment" });
    const tools = [makeTool({ courseId: "course-A", workKind: "assignment", tool: "Screen recording (this app)" })];
    expect(gradingAssessmentToolViolation(assessment, tools, "Canvas SpeedGrader")).toBe(true);
  });

  it("no violation when the actual tool matches the declared one", () => {
    const assessment = makeAssessment({ courseId: "course-A", workKind: "assignment" });
    const tools = [makeTool({ courseId: "course-A", workKind: "assignment", tool: "Screen recording (this app)" })];
    expect(gradingAssessmentToolViolation(assessment, tools, "Screen recording (this app)")).toBe(false);
  });

  it("no DETECTABLE violation when nothing has been declared for this work kind yet - a gap, not a contradiction", () => {
    const assessment = makeAssessment({ courseId: "course-A", workKind: "assignment" });
    expect(gradingAssessmentToolViolation(assessment, [], "Canvas SpeedGrader")).toBe(false);
  });

  it("a declaration for a DIFFERENT course never triggers a violation for this one", () => {
    const assessment = makeAssessment({ courseId: "course-A", workKind: "assignment" });
    const tools = [makeTool({ courseId: "course-B", workKind: "assignment", tool: "Canvas SpeedGrader" })];
    expect(gradingAssessmentToolViolation(assessment, tools, "Some other tool entirely")).toBe(false);
  });
});
