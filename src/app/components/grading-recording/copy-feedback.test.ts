// A10: Copy feedback on the recording grading page used to emit every part
// TWICE, because it joined [strengths, improvements, overallComment] while
// overallComment is ALREADY the space-joined composition of strengths +
// improvements + resubmitNotice (composeOverallComment, src/lib/grade/types.ts).
// grading-row.ts's joinFeedback now derives what overallComment still
// contributes beyond strengths/improvements, rather than copying it whole.
//
// THIS FILE CARRIES ITS OWN CONTROL (RULING 4): the seven landed joinFeedback
// cases from grading-row.test.ts:62,71,78,83,88,100,104 are duplicated below,
// byte-identical, as a no-op-mutant control - never imported from that file
// (importing a helper from another *.test.ts re-runs its describe blocks
// under the wrong setup). All seven are BYTE-IDENTICAL under the new
// derivation, which is itself the honest admission this row records: nothing
// currently in src goes red if this fix is reverted, and this new file is
// the only evidence.
//
// This verify is NECESSARY, NOT SUFFICIENT: tsc, the full suite and
// assessment-shared's own structure test are wave-gate concerns, and the
// closure is verify AND wave gate, never verify alone.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { joinFeedback, type GradingRow } from "./grading-row";
import { composeOverallComment, RESUBMIT_NOTICE } from "@/lib/grade/types";
import { editAssessmentField } from "../assessment-shared/assessment-row";
import { composeGradingRowResult } from "./grading-feedback-prompt";

// -----------------------------------------------------------------------
// Duplicated helper (never imported from grading-row.test.ts - see header).
// -----------------------------------------------------------------------
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
    submissionTimeStatus: "unknown",
    submittedAt: "",
    rubricAreas: [],
    suggestedSubmissionKind: "unknown",
    submissionKindCue: "",
    submissionKind: "unknown",
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// RULING 4 CONTROL: the seven landed joinFeedback cases, duplicated
// byte-identical from grading-row.test.ts:62,71,78,83,88,100,104. A change
// in any of these means the new derivation altered a shape it was never
// asked to.
// -----------------------------------------------------------------------
describe("joinFeedback control (duplicated verbatim from grading-row.test.ts - no-op-mutant control)", () => {
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

  it("an all-empty row (no feedback typed or graded yet) yields '' - the Copy feedback empty guard's contract", () => {
    expect(joinFeedback(makeRow())).toBe("");
  });

  it("a single populated field copies as itself, with no separator", () => {
    expect(joinFeedback(makeRow({ overallComment: "Only this." }))).toBe("Only this.");
  });
});

// -----------------------------------------------------------------------
// NEW BEHAVIOUR: the derivation that fixes the duplication defect.
// Composition fixtures are built by running composeGradingRowResult on a
// model-JSON string, so they carry the shape the app actually emits.
// -----------------------------------------------------------------------
describe("joinFeedback derives what overallComment still contributes (A10)", () => {
  it("deduction row: overallComment = compose(S, I, RESUBMIT_NOTICE) - the copy carries strengths, improvements and the notice, each exactly once", () => {
    const raw = JSON.stringify({
      overallComment: "Strong thesis and clear structure.",
      improvements: "Cite more sources.",
      rubricResults: [{ area: "Correctness", score: "8/10" }],
    });
    const result = composeGradingRowResult(raw);

    // Sanity on the fixture itself: points were deducted, so the notice is
    // present in the composed overallComment.
    expect(result.overallComment).toBe(
      composeOverallComment(result.strengths, result.improvements, RESUBMIT_NOTICE)
    );

    const copy = joinFeedback(result);
    expect(copy).toBe(
      "Strong thesis and clear structure.\n\nCite more sources.\n\nYou are welcome to resubmit this assignment, and I will regrade it with no late penalty."
    );
    // Each part appears exactly once.
    expect(copy.split("Strong thesis and clear structure.").length - 1).toBe(1);
    expect(copy.split("Cite more sources.").length - 1).toBe(1);
    expect(copy.split(RESUBMIT_NOTICE).length - 1).toBe(1);
  });

  it("full-credit row: overallComment = compose(S, I, \"\") - the copy carries strengths and improvements only, and never the notice", () => {
    const raw = JSON.stringify({
      overallComment: "Excellent work throughout.",
      improvements: "Nothing to add.",
      rubricResults: [{ area: "Correctness", score: "10/10" }],
    });
    const result = composeGradingRowResult(raw);

    expect(result.overallComment).toBe(composeOverallComment(result.strengths, result.improvements, ""));

    const copy = joinFeedback(result);
    expect(copy).toBe("Excellent work throughout.\n\nNothing to add.");
    expect(copy).not.toContain(RESUBMIT_NOTICE);
    expect(copy).not.toContain("resubmit");
  });

  it("diverged row: the instructor rewrote overallComment by hand - the copy carries strengths, improvements, and that hand-written text, in full", () => {
    const row = makeRow({
      strengths: "Strong thesis.",
      improvements: "Cite more sources.",
      overallComment: "I am overriding this comment entirely with my own wording for this student.",
    });
    expect(joinFeedback(row)).toBe(
      "Strong thesis.\n\nCite more sources.\n\nI am overriding this comment entirely with my own wording for this student."
    );
  });

  it("diverged row that ENDS WITH the notice: the instructor's own sentence survives, because the predicate is byte equality and not endsWith", () => {
    // THE ENFORCER FOR THE DESIGN DECISION THIS ROW EXISTS FOR, and nothing
    // else in the repo holds it. Swapping the byte-equality predicate for
    // endsWith(RESUBMIT_NOTICE) - the shape that was explicitly considered and
    // rejected - passes every other test in this file and in src. Measured.
    //
    // It is not cosmetic. This overallComment is NOT the composition of the
    // row's own parts (the instructor typed a sentence in front of the
    // notice), so it has diverged and must be copied WHOLE. Under endsWith it
    // classifies as the notice branch instead, and the instructor's sentence
    // is silently dropped from a copy headed to a student - the one
    // false-negative class the design forbids, because the omitted text is
    // recoverable from nowhere else in the copy.
    const row = makeRow({
      strengths: "Strong thesis.",
      improvements: "Cite more sources.",
      overallComment: `Please come see me in office hours. ${RESUBMIT_NOTICE}`,
    });
    expect(joinFeedback(row)).toBe(
      `Strong thesis.\n\nCite more sources.\n\nPlease come see me in office hours. ${RESUBMIT_NOTICE}`
    );
  });

  it("leading whitespace on strengths is carried into the copy, not trimmed away", () => {
    // Pins the trim mutant the row pre-declared and left unguarded: mapping
    // the parts through .trim() before the filter passes every other case,
    // because no other fixture carries leading whitespace. When either
    // equality branch fires the copy emits the RAW parts while overallComment
    // holds the TRIMMED join, so the copy is a strict superset - that is the
    // property being pinned here, and trimming would quietly narrow it.
    const strengths = "  Strong thesis.  ";
    const improvements = "Cite more sources.";
    const row = makeRow({
      strengths,
      improvements,
      overallComment: composeOverallComment(strengths, improvements, ""),
    });
    expect(joinFeedback(row)).toBe(`${strengths}\n\n${improvements}`);
  });

  it("stale row (CHARACTERISATION, not fixed, byte-identical to today): editAssessmentField changes strengths without recomposing overallComment, so the copy still carries the pre-edit text inside overallComment", () => {
    const original = makeRow({
      strengths: "Old strengths.",
      improvements: "Cite sources.",
      overallComment: composeOverallComment("Old strengths.", "Cite sources.", ""),
    });
    const edited = editAssessmentField(original, "strengths", "New strengths.");

    // editAssessmentField does not recompose overallComment - it is left
    // stale, still reflecting the OLD strengths value.
    expect(edited.overallComment).toBe("Old strengths. Cite sources.");
    expect(edited.strengths).toBe("New strengths.");

    // Pinned exactly - this is today's behaviour and this row does not fix
    // it (a per-surface recompose-on-edit mutator is a separate change).
    expect(joinFeedback(edited)).toBe("New strengths.\n\nCite sources.\n\nOld strengths. Cite sources.");
  });

  it("all-blank row: every field empty yields ''", () => {
    expect(joinFeedback(makeRow({ strengths: "", improvements: "", overallComment: "" }))).toBe("");
  });

  it("whitespace-only overallComment, with blank strengths/improvements, still yields ''", () => {
    expect(joinFeedback(makeRow({ strengths: "", improvements: "", overallComment: "   " }))).toBe("");
  });
});

// -----------------------------------------------------------------------
// SEAM PINS (source-text, over comment-stripped source). Duplicated form
// from snapshot-grading.structure.test.ts:14-20: split on a CR-tolerant
// line-feed pattern, then strip an UNANCHORED line-comment pattern per
// line - CR-safe (the split consumes the carriage return) AND not
// trailing-comment-blind (the anchored multiline form is - see backlog L13,
// an executed defeat against it). Never the anchored multiline form.
// -----------------------------------------------------------------------
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

// CR canary, built with String.fromCharCode(13) - never a \r escape written
// directly (Write/Edit materialize that as a literal control byte).
describe("stripComments handles CRLF and trailing comments (canary for the seam pins below)", () => {
  const CR = String.fromCharCode(13);

  it("strips a trailing // comment on a CRLF-terminated line, and a whole-line comment", () => {
    const fixture = `const x = 1;${CR}\nconst y = 2; // trailing comment must go${CR}\n// whole-line comment must go${CR}\nconst z = 3;`;
    const stripped = stripComments(fixture);
    expect(stripped).not.toContain("trailing comment must go");
    expect(stripped).not.toContain("whole-line comment must go");
    expect(stripped).toContain("const y = 2;");
    expect(stripped).toContain("const z = 3;");
  });
});

function readStripped(relativePath: string): string {
  const fullPath = path.resolve(process.cwd(), relativePath);
  const source = fs.readFileSync(fullPath, "utf-8");
  // Length floor so a scan over a moved/emptied file cannot pass vacuously.
  expect(source.length).toBeGreaterThan(1000);
  return stripComments(source);
}

describe("seam pins: each caller binds its own surface's join function", () => {
  // Whitespace-tolerant by construction. A literal `joinCopyText={joinFeedback}`
  // false-reds on `joinCopyText={ joinFeedback }`, and this repo has no
  // formatter (no prettier in package.json or on disk), so an ordinary hand
  // edit reaches that shape. Pin the fact and the ordering, never the spacing.
  it("GradingTableRow.tsx binds joinFeedback and does not contain joinAssessmentFeedback", () => {
    const stripped = readStripped("src/app/components/grading-recording/GradingTableRow.tsx");
    expect(stripped).toMatch(/joinCopyText=\{\s*joinFeedback\s*\}/);
    expect(stripped).not.toContain("joinAssessmentFeedback");
  });

  it("SnapshotResultCard.tsx binds joinAssessmentFeedback and does not contain joinFeedback", () => {
    const stripped = readStripped("src/app/components/snapshot-grading/SnapshotResultCard.tsx");
    expect(stripped).toMatch(/joinCopyText=\{\s*joinAssessmentFeedback\s*\}/);
    expect(stripped).not.toContain("joinFeedback");
  });

  it("the joinCopyText prop stays REQUIRED - an optional one would silently hand a future caller the duplicating join", () => {
    // Measured sabotage: making the prop optional with a
    // `= joinAssessmentFeedback` default keeps every other assertion green,
    // because the call-site pin below looks for `joinAssessmentFeedback(`
    // with a paren and a default is a bare reference. Today's two callers
    // still pass it, so nothing regresses now - a third caller is the hazard.
    const stripped = readStripped("src/app/components/assessment-shared/AssessmentFeedbackFields.tsx");
    expect(stripped).toMatch(/joinCopyText:\s*\(/);
    expect(stripped).not.toMatch(/joinCopyText\?\s*:/);
  });

  it("AssessmentFeedbackFields.tsx does not CALL joinAssessmentFeedback (it may still import the AssessmentFeedback type - pin the call, not the import) and applies joinCopyText to its own feedback prop", () => {
    const stripped = readStripped("src/app/components/assessment-shared/AssessmentFeedbackFields.tsx");
    expect(stripped).not.toContain("joinAssessmentFeedback(");
    expect(stripped).toContain("joinCopyText(feedback)");
  });
});
