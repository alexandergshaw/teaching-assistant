// docs/recording-controls-ux-acceptance-criteria.md CC14: joinFeedback(row)
// is what GradingTableRow.tsx's "Copy feedback" button copies to the
// clipboard. Pinned against a fixture in the exact shape GradingTableRow
// emits (the four editable fields a GradingRow carries: totalScore,
// strengths, improvements, overallComment - see grading-row.ts's own header
// for why there is no fifth, postable field).
//
// SABOTAGE CHECK LOG (verified by actually breaking the source and
// re-running, then reverting):
//   1. Included row.totalScore in the joined array (score should never
//      appear in copied feedback) -> "never includes the score" failed as
//      expected (the joined string gained a leading "9/10\n\n"). Reverted.
//   2. Removed the `.filter((field) => field.trim() !== "")` call (stopped
//      omitting empty fields) -> "omits an empty field entirely, not as a
//      blank line" failed as expected (two blank lines appeared before the
//      lone overall comment). Reverted.
//   3. Changed the join separator from "\n\n" to "\n" (single blank line
//      collapsed to no visual gap) -> "joins non-empty fields with a blank
//      line (\\n\\n), in strengths / improvements / overallComment order"
//      failed as expected (assertion on the literal separator no longer
//      matched). Reverted.

import { describe, it, expect } from "vitest";
import {
  joinFeedback,
  gradingRowMatchesCourse,
  stampGradingRowsWithCourse,
  countUnattributedGradingRows,
  gradingRowMatchesAssessment,
  stampGradingRowsWithAssessment,
  gradingRowSubmissionTimeStatus,
  gradingRowHasKnownSubmissionTime,
  type GradingRow,
} from "./grading-row";

function makeRow(overrides: Partial<GradingRow> = {}): GradingRow {
  return {
    id: "grade-1",
    studentName: "Maria Alvarez",
    nameMatch: "no-roster",
    rosterCandidates: [],
    submissionText: "A submission about the reading.",
    state: "ready",
    totalScore: "9/10",
    strengths: "",
    improvements: "",
    overallComment: "",
    error: "",
    userEdited: false,
    // D23c: the round-trip-stable default (mirrors deserializeGradingRows's
    // own normalization of absent -> "unknown") - a test that needs to
    // exercise the genuinely ABSENT case explicitly overrides this to
    // `undefined` rather than relying on omission, since omission here
    // would just re-apply this same default.
    submissionTimeStatus: "unknown",
    submittedAt: "",
    ...overrides,
  };
}

describe("joinFeedback (CC14 - the Copy feedback button's payload)", () => {
  it("joins non-empty fields with a blank line (\\n\\n), in strengths / improvements / overallComment order", () => {
    const row = makeRow({
      strengths: "Strong thesis.",
      improvements: "Cite more sources.",
      overallComment: "Great work overall.",
    });
    expect(joinFeedback(row)).toBe("Strong thesis.\n\nCite more sources.\n\nGreat work overall.");
  });

  it("never includes the score, even though the fixture carries one", () => {
    const row = makeRow({ totalScore: "9/10", strengths: "Strong thesis.", improvements: "", overallComment: "" });
    const joined = joinFeedback(row);
    expect(joined).not.toContain("9/10");
    expect(joined).toBe("Strong thesis.");
  });

  it("omits an empty field entirely, not as a blank line - a row missing the middle field never renders a double gap", () => {
    const row = makeRow({ strengths: "Strong thesis.", improvements: "", overallComment: "Great work overall." });
    expect(joinFeedback(row)).toBe("Strong thesis.\n\nGreat work overall.");
  });

  it("a whitespace-only field counts as empty and is omitted", () => {
    const row = makeRow({ strengths: "Strong thesis.", improvements: "   ", overallComment: "" });
    expect(joinFeedback(row)).toBe("Strong thesis.");
  });

  it("every field blank yields an empty string, never a run of blank-line separators", () => {
    expect(joinFeedback(makeRow({ strengths: "", improvements: "", overallComment: "" }))).toBe("");
  });

  // Fixer pass finding 9: pins the empty guard's contract on its own -
  // GradingTableRow.tsx's "Copy feedback" button reads joinFeedback(row) ===
  // "" to decide whether there is anything to copy at all (a row extracted
  // but never fed through the grader, or one an instructor cleared by hand),
  // and refuses the copy with a per-student message instead of writing an
  // empty string to the clipboard. This exercises exactly the row shape that
  // guard sees - a freshly-captured, ungraded row with no overrides at all -
  // rather than one built by explicitly re-blanking all three fields.
  it("an all-empty row (no feedback typed or graded yet) yields '' - the Copy feedback empty guard's contract", () => {
    expect(joinFeedback(makeRow())).toBe("");
  });

  it("a single populated field copies as itself, with no separator", () => {
    expect(joinFeedback(makeRow({ overallComment: "Only this." }))).toBe("Only this.");
  });
});

// ---------------------------------------------------------------------------
// docs/course-student-intelligence-acceptance-criteria.md D21d: course
// scoping. A course id is not a student id and does not touch R0-2's
// no-userId boundary (see grading-row.ts's own header and this field's own
// doc comment) - these tests exercise only the course-scoping behaviour.
// ---------------------------------------------------------------------------

describe("course scoping (D21d)", () => {
  describe("gradingRowMatchesCourse", () => {
    it("a row with a real course tag matches only that exact course", () => {
      const row = makeRow({ id: "a", course: "course-A" });
      expect(gradingRowMatchesCourse(row, "course-A")).toBe(true);
      expect(gradingRowMatchesCourse(row, "course-B")).toBe(false);
    });

    it("SABOTAGE TARGET: an unattributed row (no course tag) matches ONLY the unattributed scope, never a real course id", () => {
      const row = makeRow({ id: "a" }); // course left undefined
      expect(gradingRowMatchesCourse(row, undefined)).toBe(true);
      expect(gradingRowMatchesCourse(row, "course-A")).toBe(false);
    });

    it("rows for course A are not visible when course B is selected", () => {
      const rows = [makeRow({ id: "a", course: "course-A" }), makeRow({ id: "b", course: "course-B" })];
      expect(rows.filter((r) => gradingRowMatchesCourse(r, "course-B")).map((r) => r.id)).toEqual(["b"]);
    });
  });

  describe("stampGradingRowsWithCourse", () => {
    it("stamps a brand-new row (id not in `previous`) with the current scope", () => {
      const next = [makeRow({ id: "new" })];
      const result = stampGradingRowsWithCourse(next, [], "course-A");
      expect(result[0].course).toBe("course-A");
    });

    it("SABOTAGE TARGET: preserves an EXISTING row's own prior course exactly, even if `next` carries something else for it - a whole-table replace must never adopt a row that was already attributed elsewhere into the current scope", () => {
      const previous = [makeRow({ id: "existing", course: "course-A" })];
      // `next` (as if built by an external merge that forgot to carry the
      // course forward) has no course tag at all on the same id.
      const next = [makeRow({ id: "existing" })];
      const result = stampGradingRowsWithCourse(next, previous, "course-B");
      expect(result[0].course).toBe("course-A"); // NOT "course-B" - the prior attribution wins
    });

    it("stamps with `undefined` (unattributed) when the current scope itself is unattributed", () => {
      const result = stampGradingRowsWithCourse([makeRow({ id: "new" })], [], undefined);
      expect(result[0].course).toBeUndefined();
    });
  });

  describe("countUnattributedGradingRows", () => {
    it("distinguishes 'no rows' from 'rows exist but none unattributed' from 'unattributed rows are waiting'", () => {
      expect(countUnattributedGradingRows([])).toBe(0);
      expect(countUnattributedGradingRows([makeRow({ id: "a", course: "course-A" })])).toBe(0);
      expect(countUnattributedGradingRows([makeRow({ id: "a" })])).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// docs/course-student-intelligence-acceptance-criteria.md D22b/D23e:
// assessment scoping. An assessment id is not a student id and does not
// touch R0-2's no-userId boundary - see grading-row.ts's own header and
// this field's own doc comment. Deliberately structured as a byte-for-byte
// mirror of the "course scoping (D21d)" block above, since
// stampGradingRowsWithAssessment/gradingRowMatchesAssessment are themselves
// deliberate mirrors of their course-scoped counterparts.
// ---------------------------------------------------------------------------

describe("assessment scoping (D22b/D23e)", () => {
  describe("gradingRowMatchesAssessment", () => {
    it("a row with a real assessment tag matches only that exact assessment", () => {
      const row = makeRow({ id: "a", assessment: "essay-2" });
      expect(gradingRowMatchesAssessment(row, "essay-2")).toBe(true);
      expect(gradingRowMatchesAssessment(row, "essay-3")).toBe(false);
    });

    it("SABOTAGE TARGET: an unattributed row (no assessment tag) matches ONLY the unattributed scope, never a real assessment id", () => {
      const row = makeRow({ id: "a" }); // assessment left undefined
      expect(gradingRowMatchesAssessment(row, undefined)).toBe(true);
      expect(gradingRowMatchesAssessment(row, "essay-2")).toBe(false);
    });

    it("rows for assessment A are not visible when assessment B is selected", () => {
      const rows = [makeRow({ id: "a", assessment: "essay-2" }), makeRow({ id: "b", assessment: "essay-3" })];
      expect(rows.filter((r) => gradingRowMatchesAssessment(r, "essay-3")).map((r) => r.id)).toEqual(["b"]);
    });
  });

  describe("stampGradingRowsWithAssessment", () => {
    it("stamps a brand-new row (id not in `previous`) with the current scope", () => {
      const next = [makeRow({ id: "new" })];
      const result = stampGradingRowsWithAssessment(next, [], "essay-2");
      expect(result[0].assessment).toBe("essay-2");
    });

    it("SABOTAGE TARGET: preserves an EXISTING row's own prior assessment exactly, even if `next` carries something else for it - a whole-table replace must never adopt a row that was already attributed elsewhere into the currently selected assessment", () => {
      const previous = [makeRow({ id: "existing", assessment: "essay-2" })];
      // `next` (as if built by an external merge that forgot to carry the
      // assessment forward) has no assessment tag at all on the same id.
      const next = [makeRow({ id: "existing" })];
      const result = stampGradingRowsWithAssessment(next, previous, "essay-3");
      expect(result[0].assessment).toBe("essay-2"); // NOT "essay-3" - the prior attribution wins
    });

    it("stamps with `undefined` (unattributed) when the current scope itself is unattributed", () => {
      const result = stampGradingRowsWithAssessment([makeRow({ id: "new" })], [], undefined);
      expect(result[0].assessment).toBeUndefined();
    });

    it("stamping course and assessment together preserves both axes independently - a row keeps its own prior value on EACH axis even when the other axis's scope changes", () => {
      const previous = [makeRow({ id: "existing", course: "course-A", assessment: "essay-2" })];
      const next = [makeRow({ id: "existing" })];
      const withCourse = stampGradingRowsWithCourse(next, previous, "course-B");
      const withBoth = stampGradingRowsWithAssessment(withCourse, previous, "essay-3");
      expect(withBoth[0].course).toBe("course-A");
      expect(withBoth[0].assessment).toBe("essay-2");
    });
  });

  describe("an existing (pre-D22b) row stays unattributed on BOTH axes", () => {
    it("a row built before this axis existed has neither course nor assessment", () => {
      const row = makeRow({ id: "legacy" });
      expect(row.course).toBeUndefined();
      expect(row.assessment).toBeUndefined();
      expect(gradingRowMatchesCourse(row, undefined)).toBe(true);
      expect(gradingRowMatchesAssessment(row, undefined)).toBe(true);
    });

    it("stamping such a row with real scopes on both axes at once attributes it correctly on each", () => {
      const stampedCourse = stampGradingRowsWithCourse([makeRow({ id: "a" })], [], "course-A");
      const stampedBoth = stampGradingRowsWithAssessment(stampedCourse, [], "essay-2");
      expect(stampedBoth[0].course).toBe("course-A");
      expect(stampedBoth[0].assessment).toBe("essay-2");
    });
  });
});

// ---------------------------------------------------------------------------
// docs/course-student-intelligence-acceptance-criteria.md D23c: submission
// timing is honestly three-valued, and "unknown" must never read as "known"
// (which is what a future late/on-time computation would otherwise mistake
// for a real, on-time-or-late-comparable instant).
// ---------------------------------------------------------------------------

describe("submission timing (D23c)", () => {
  describe("gradingRowSubmissionTimeStatus", () => {
    it("returns the explicit status when one was set", () => {
      expect(gradingRowSubmissionTimeStatus(makeRow({ submissionTimeStatus: "known", submittedAt: "2026-09-01T12:00:00Z" }))).toBe(
        "known"
      );
      expect(gradingRowSubmissionTimeStatus(makeRow({ submissionTimeStatus: "marked-late" }))).toBe("marked-late");
    });

    it("normalizes an absent status (a row built before this axis existed) to 'unknown', never 'known'", () => {
      // Explicit `undefined` override, not omission - makeRow's own default
      // for this field is already "unknown" (its round-trip-stable form),
      // so relying on omission here would not actually exercise the
      // genuinely-absent case this test is named for.
      expect(gradingRowSubmissionTimeStatus(makeRow({ id: "legacy", submissionTimeStatus: undefined }))).toBe("unknown");
    });
  });

  describe("gradingRowHasKnownSubmissionTime", () => {
    it("true only for 'known' with a real submittedAt value", () => {
      expect(
        gradingRowHasKnownSubmissionTime(makeRow({ submissionTimeStatus: "known", submittedAt: "2026-09-01T12:00:00Z" }))
      ).toBe(true);
    });

    it("SABOTAGE TARGET: 'unknown' (explicit or absent) is never treated as a known submission time", () => {
      expect(gradingRowHasKnownSubmissionTime(makeRow({ submissionTimeStatus: "unknown" }))).toBe(false);
      // Explicit `undefined` override - see the identical note on
      // gradingRowSubmissionTimeStatus's own "normalizes an absent status" test
      // above for why omission alone would not exercise true absence here.
      expect(gradingRowHasKnownSubmissionTime(makeRow({ id: "legacy", submissionTimeStatus: undefined }))).toBe(false);
    });

    it("'marked-late' is a real verdict but is NOT a known timestamp - it carries no submittedAt value to be known", () => {
      expect(gradingRowHasKnownSubmissionTime(makeRow({ submissionTimeStatus: "marked-late" }))).toBe(false);
    });

    it("a 'known' status with no actual submittedAt value (a malformed row) is not treated as known either", () => {
      expect(gradingRowHasKnownSubmissionTime(makeRow({ submissionTimeStatus: "known", submittedAt: "" }))).toBe(false);
    });
  });
});
