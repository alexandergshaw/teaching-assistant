// WAVE 1 of the assessment-grading extraction - assessment-row.ts's own unit
// tests. Generalised copies of grading-rows.test.ts's editGradingRowField/
// applyGradingResultToRow/removeGradingRow/gradingClearTableSignature cases
// and grading-row.test.ts's joinFeedback cases, run here against the
// generic core directly - grading-rows.test.ts keeps its own copies too
// (this repo's "no cross-test-file imports" rule: importing a helper from
// another *.test.ts re-runs its describe blocks), and grading-rows.ts's
// thin wrappers are expected to keep passing unchanged because they
// delegate to exactly the functions tested here.

import { describe, it, expect } from "vitest";
import {
  joinAssessmentFeedback,
  editAssessmentField,
  applyAssessmentResult,
  removeAssessmentRow,
  clearTableSignature,
  type AssessmentRowCore,
} from "./assessment-row";

interface TestRow extends AssessmentRowCore {
  submissionText: string;
}

function makeRow(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id: "row-1",
    studentName: "Maria Alvarez",
    submissionText: "A submission about the reading.",
    state: "pending",
    totalScore: "",
    strengths: "",
    improvements: "",
    overallComment: "",
    error: "",
    userEdited: false,
    ...overrides,
  };
}

describe("joinAssessmentFeedback", () => {
  it("joins strengths/overallComment/improvements with a blank line, in that order, excluding totalScore", () => {
    const row = makeRow({
      totalScore: "9/10",
      strengths: "Strong thesis.",
      improvements: "Cite more sources.",
      overallComment: "Great work overall.",
    });
    expect(joinAssessmentFeedback(row)).toBe("Strong thesis.\n\nGreat work overall.\n\nCite more sources.");
  });

  it("omits a blank field entirely rather than leaving a bare blank line", () => {
    const row = makeRow({ strengths: "", improvements: "", overallComment: "Only this." });
    expect(joinAssessmentFeedback(row)).toBe("Only this.");
  });

  it("an all-empty row joins to the empty string", () => {
    const row = makeRow();
    expect(joinAssessmentFeedback(row)).toBe("");
  });
});

describe("editAssessmentField (AC18-equivalent)", () => {
  it("sets the field, marks userEdited, and clears any stale error", () => {
    const row = makeRow({ state: "failed", error: "stale failure" });
    const next = editAssessmentField(row, "strengths", "Strong thesis.");
    expect(next.strengths).toBe("Strong thesis.");
    expect(next.userEdited).toBe(true);
    expect(next.error).toBe("");
  });

  it("promotes a pending row to ready", () => {
    const row = makeRow({ state: "pending" });
    expect(editAssessmentField(row, "totalScore", "8/10").state).toBe("ready");
  });

  it("promotes a failed row to ready", () => {
    const row = makeRow({ state: "failed" });
    expect(editAssessmentField(row, "overallComment", "Nice work.").state).toBe("ready");
  });

  it("leaves a grading/ready row's state untouched", () => {
    expect(editAssessmentField(makeRow({ state: "grading" }), "improvements", "x").state).toBe("grading");
    expect(editAssessmentField(makeRow({ state: "ready" }), "improvements", "x").state).toBe("ready");
  });

  it("does not mutate the input row", () => {
    const row = makeRow({ strengths: "original" });
    editAssessmentField(row, "strengths", "changed");
    expect(row.strengths).toBe("original");
    expect(row.userEdited).toBe(false);
  });

  // Backlog A11 Ruling Q: some row shapes (not this file's own TestRow, but
  // a real caller's row) carry a companion "<field>Notice" property - a
  // durable notice explaining why that field came back empty from a machine
  // result. A notice that survives the edit it asked for is worse than no
  // notice, so editAssessmentField clears it in the same write once the
  // paired field is filled in with a non-blank value. This is a runtime,
  // convention-based check, so it must be exercised against a row shape that
  // actually carries the companion property - TestRow does not, and adding
  // one there would test nothing.
  interface RowWithNotice extends TestRow {
    strengthsNotice: string;
  }

  function makeRowWithNotice(overrides: Partial<RowWithNotice> = {}): RowWithNotice {
    return { ...makeRow(), strengthsNotice: "", ...overrides };
  }

  it("Ruling Q: clears the paired '<field>Notice' property when the field is filled with a non-blank value", () => {
    const row = makeRowWithNotice({ strengths: "", strengthsNotice: "The model did not return this." });
    const next = editAssessmentField(row, "strengths", "Filled in by hand.");
    expect(next.strengths).toBe("Filled in by hand.");
    expect((next as RowWithNotice).strengthsNotice).toBe("");
  });

  it("Ruling Q: does NOT clear the paired notice when the new value is blank or whitespace-only", () => {
    const row = makeRowWithNotice({ strengths: "", strengthsNotice: "The model did not return this." });
    const next = editAssessmentField(row, "strengths", "   ");
    expect((next as RowWithNotice).strengthsNotice).toBe("The model did not return this.");
  });

  it("Ruling Q: editing an UNRELATED field leaves the paired notice untouched", () => {
    const row = makeRowWithNotice({ strengths: "", strengthsNotice: "The model did not return this." });
    const next = editAssessmentField(row, "overallComment", "A comment.");
    expect((next as RowWithNotice).strengthsNotice).toBe("The model did not return this.");
  });

  it("Ruling Q: is a no-op on a row shape that carries no companion notice property at all", () => {
    const row = makeRow({ strengths: "" });
    const next = editAssessmentField(row, "strengths", "Filled in by hand.");
    expect("strengthsNotice" in next).toBe(false);
  });

  // SABOTAGE (Ruling Q): if the `noticeKey in source` clearing block in
  // editAssessmentField (assessment-row.ts) is deleted entirely, the first
  // test above goes RED - expected "" but got "The model did not return
  // this." - because the notice property is preserved unchanged by the
  // object spread alone. Restoring the block turns it green again.
});

describe("applyAssessmentResult (AC44-equivalent userEdited guard)", () => {
  const result = {
    totalScore: "9/10",
    strengths: "Machine strengths.",
    improvements: "Machine improvements.",
    overallComment: "Machine comment.",
    state: "ready" as const,
  };

  it("an UNEDITED row accepts the full result", () => {
    const row = makeRow({ userEdited: false });
    const next = applyAssessmentResult(row, result);
    expect(next.totalScore).toBe("9/10");
    expect(next.strengths).toBe("Machine strengths.");
    expect(next.improvements).toBe("Machine improvements.");
    expect(next.overallComment).toBe("Machine comment.");
    expect(next.state).toBe("ready");
  });

  it("an EDITED row's scored fields are never overwritten by a re-grade", () => {
    const row = makeRow({
      userEdited: true,
      totalScore: "10/10 (my own call)",
      strengths: "My own hand-typed strengths.",
      improvements: "My own hand-typed improvements.",
      overallComment: "My own hand-typed comment.",
    });
    const next = applyAssessmentResult(row, result);
    expect(next.totalScore).toBe("10/10 (my own call)");
    expect(next.strengths).toBe("My own hand-typed strengths.");
    expect(next.improvements).toBe("My own hand-typed improvements.");
    expect(next.overallComment).toBe("My own hand-typed comment.");
  });

  it("an EDITED row's state and error still update from a fresh grading attempt - only the four scored fields are held back", () => {
    const row = makeRow({ userEdited: true, state: "grading" });
    const next = applyAssessmentResult(row, { ...result, state: "failed", error: "Model call failed." });
    expect(next.state).toBe("failed");
    expect(next.error).toBe("Model call failed.");
    expect(next.userEdited).toBe(true);
  });

  it("a missing error on the result clears any stale error to empty string, not undefined/null", () => {
    const row = makeRow({ userEdited: false, error: "stale" });
    const next = applyAssessmentResult(row, result);
    expect(next.error).toBe("");
  });
});

describe("removeAssessmentRow", () => {
  it("removes exactly the row with the matching id, leaving the others untouched and in order", () => {
    const rows = [makeRow({ id: "a" }), makeRow({ id: "b" }), makeRow({ id: "c" })];
    expect(removeAssessmentRow(rows, "b").map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("an id not present in the table is a no-op that returns the SAME array reference", () => {
    const rows = [makeRow({ id: "a" })];
    expect(removeAssessmentRow(rows, "missing")).toBe(rows);
  });

  it("does not mutate the input array", () => {
    const rows = [makeRow({ id: "a" }), makeRow({ id: "b" })];
    const original = rows.slice();
    removeAssessmentRow(rows, "a");
    expect(rows).toEqual(original);
  });
});

describe("clearTableSignature", () => {
  it("is built from the row count alone", () => {
    expect(clearTableSignature(0)).toBe("0");
    expect(clearTableSignature(3)).toBe("3");
    expect(clearTableSignature(42)).toBe("42");
  });

  it("changes when the row count changes", () => {
    expect(clearTableSignature(3)).not.toBe(clearTableSignature(4));
  });

  it("is stable for the same count", () => {
    expect(clearTableSignature(5)).toBe(clearTableSignature(5));
  });
});
