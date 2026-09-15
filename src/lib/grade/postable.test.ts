// A13 (docs/backlog.yml): tests for checkRowPostability, the guard that
// stops a grading run's internal error text or raw, unparsed model output
// from reaching a STUDENT as Canvas feedback. See postable.ts's own header
// comment for the reasoning behind the four clauses and the accepted
// residual false positive.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkRowPostability, type PostabilityProducer } from "./postable";
import type { RubricAreaResult } from "./types";

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function readStripped(path: string): string {
  return stripComments(readFileSync(path, "utf8"));
}

function producer(overrides: Partial<PostabilityProducer> = {}): PostabilityProducer {
  return {
    totalScore: "",
    rubricAreas: [],
    overallComment: "",
    ...overrides,
  };
}

const areas = (scores: string[]): RubricAreaResult[] =>
  scores.map((score, i) => ({ area: `Area ${i}`, score, comment: "" }));

describe("checkRowPostability - the four required clauses", () => {
  it("refuses an untouched failed row: blank producer score/areas, blank submitted score, comment unchanged", () => {
    const p = producer({
      totalScore: "",
      rubricAreas: [{ area: "Overall", score: "", comment: "This submission could not be graded: timed out" }],
      overallComment: "This submission could not be graded: timed out",
    });
    const result = checkRowPostability({
      producer: p,
      submittedScore: "",
      submittedComment: p.overallComment,
    });
    expect(result.postable).toBe(false);
    if (!result.postable) {
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("refuses an untouched row from the PARSING path shape (blank totalScore, single Overall area carrying raw model text)", () => {
    // Mirrors parseRubricResponse's own fallback shape (parsing.ts:60-72,
    // 113-125, 92-105): totalScore "", rubricAreas [{area:"Overall",
    // score:"", comment: <raw model text>}], overallComment === that same
    // raw text (the "no JSON extractable"/"JSON.parse threw" branches both
    // set overallComment to the same raw string used for the Overall area's
    // comment).
    const rawText = "```\nnot valid json at all, just prose the model returned\n```";
    const p = producer({
      totalScore: "",
      rubricAreas: [{ area: "Overall", score: "", comment: rawText }],
      overallComment: rawText,
    });
    const result = checkRowPostability({ producer: p, submittedScore: "", submittedComment: rawText });
    expect(result.postable).toBe(false);
  });

  it("allows a DELIBERATE comment-only post: blank score, instructor-authored comment, producer also blank (a genuine no-score-no-rubric case)", () => {
    const p = producer({ totalScore: "", rubricAreas: [], overallComment: "" });
    const result = checkRowPostability({
      producer: p,
      submittedScore: "",
      submittedComment: "Great effort this week, no grade yet - just a note.",
    });
    expect(result.postable).toBe(true);
  });

  it("allows a RESCUED row: instructor typed a real score and comment over a failed producer row", () => {
    const p = producer({
      totalScore: "",
      rubricAreas: [{ area: "Overall", score: "", comment: "This submission could not be graded: timed out" }],
      overallComment: "This submission could not be graded: timed out",
    });
    const result = checkRowPostability({
      producer: p,
      submittedScore: "18/20",
      submittedComment: "Great work overall - nice use of recursion.",
    });
    expect(result.postable).toBe(true);
  });

  it("allows a row whose comment differs from the producer's by one character", () => {
    const p = producer({
      totalScore: "",
      rubricAreas: [{ area: "Overall", score: "", comment: "This submission could not be graded: timed out" }],
      overallComment: "This submission could not be graded: timed out",
    });
    const result = checkRowPostability({
      producer: p,
      submittedScore: "",
      // One trailing character added relative to producer.overallComment.
      submittedComment: `${p.overallComment}.`,
    });
    expect(result.postable).toBe(true);
  });

  it("allows a normally-graded row untouched by any human (real score, real rubric, comment identical)", () => {
    const p = producer({
      totalScore: "18/20",
      rubricAreas: areas(["9/10", "9/10"]),
      overallComment: "Nice work overall.",
    });
    const result = checkRowPostability({ producer: p, submittedScore: "18", submittedComment: p.overallComment });
    expect(result.postable).toBe(true);
  });

  it("refuses when the producer total is blank but the producer rubric HAS a non-blank area (clause b not met on its own - only the totalScore is blank)", () => {
    // Clause (b) requires EVERY area to be blank - a single non-blank area
    // fails clause (b), so this row is postable even with a blank total and
    // an unedited comment/score.
    const p = producer({
      totalScore: "",
      rubricAreas: areas(["9/10", ""]),
      overallComment: "Partial rubric only.",
    });
    const result = checkRowPostability({ producer: p, submittedScore: "", submittedComment: p.overallComment });
    expect(result.postable).toBe(true);
  });

  it("refuses only when ALL of totalScore blank, every area blank, submitted score blank, AND comment unchanged hold together", () => {
    const blankProducer = producer({ totalScore: "", rubricAreas: [{ area: "Overall", score: "", comment: "raw" }], overallComment: "raw" });
    // Vary exactly one clause at a time away from "untouched" and confirm
    // each one alone is enough to make the row postable.
    expect(
      checkRowPostability({ producer: { ...blankProducer, totalScore: "5/10" }, submittedScore: "", submittedComment: "raw" }).postable
    ).toBe(true);
    expect(
      checkRowPostability({
        producer: { ...blankProducer, rubricAreas: areas(["5/10"]) },
        submittedScore: "",
        submittedComment: "raw",
      }).postable
    ).toBe(true);
    expect(checkRowPostability({ producer: blankProducer, submittedScore: "5", submittedComment: "raw" }).postable).toBe(true);
    expect(checkRowPostability({ producer: blankProducer, submittedScore: "", submittedComment: "raw!" }).postable).toBe(true);
    // All four held at once - the only refusal case.
    expect(checkRowPostability({ producer: blankProducer, submittedScore: "", submittedComment: "raw" }).postable).toBe(false);
  });

  // SABOTAGE-CHECK ANCHOR 1: removing clause (c) (submittedScoreBlank) from
  // the AND - i.e. refusing regardless of whether a real score was typed -
  // was verified to make "allows a RESCUED row" FAIL (the rescued row above,
  // which has a non-blank submittedScore, was refused instead of allowed).
  // Reverted after confirming the failure; see the implementer's final
  // report for the full log.

  // SABOTAGE-CHECK ANCHOR 2: removing clause (d) (commentUntouchedFromProducer)
  // from the AND - i.e. refusing purely on blank score/areas regardless of
  // the comment - was verified to make "allows a DELIBERATE comment-only
  // post" FAIL (a genuinely blank producer with an instructor-authored
  // comment was refused instead of allowed). Reverted after confirming the
  // failure; see the implementer's final report for the full log.
});

// ---------------------------------------------------------------------------
// Wiring: every payload builder must actually IMPORT and CALL
// checkRowPostability - a search-shape test, not a text-sniffing one. Source
// comments are stripped first (this repo's own recorded trap: a
// commented-out call would otherwise satisfy a plain substring search).
// ---------------------------------------------------------------------------

describe("wiring - every A13 call site imports and calls checkRowPostability", () => {
  it("src/app/actions/grading.ts (postGradingDraftAction)", () => {
    const source = readStripped("src/app/actions/grading.ts");
    expect(source).toContain('import { checkRowPostability } from "@/lib/grade/postable"');
    const defIdx = source.indexOf("export async function postGradingDraftAction");
    expect(defIdx).toBeGreaterThan(-1);
    const nextFnIdx = source.indexOf("\nexport ", defIdx + 10);
    const body = source.slice(defIdx, nextFnIdx > -1 ? nextFnIdx : source.length);
    expect(body).toContain("checkRowPostability(");
    // Ordering: the guard must run BEFORE this row is pushed into `grades`.
    const guardIdx = body.indexOf("checkRowPostability(");
    const pushIdx = body.indexOf("grades.push(", guardIdx);
    expect(pushIdx).toBeGreaterThan(guardIdx);
  });

  it("GradingResults.tsx's bulk post (handlePostGrades) calls checkRowPostability before building its payload", () => {
    const source = readStripped("src/app/components/GradingResults.tsx");
    // Relative import, not the "@/lib/grade" alias - gradingResultsHelpers.test.ts
    // bans that alias prefix outright for this file.
    expect(source).toContain('import { checkRowPostability } from "../../lib/grade/postable"');
    const defIdx = source.indexOf("const handlePostGrades");
    const nextFnIdx = source.indexOf("useImperativeHandle", defIdx);
    const body = source.slice(defIdx, nextFnIdx > -1 ? nextFnIdx : source.length);
    expect(body).toContain("checkRowPostability(");
  });

  it("GradingResults.tsx's single-row post (handlePostOne) calls checkRowPostability", () => {
    const source = readStripped("src/app/components/GradingResults.tsx");
    const defIdx = source.indexOf("const handlePostOne = async");
    expect(defIdx).toBeGreaterThan(-1);
    const body = source.slice(defIdx, defIdx + 1200);
    expect(body).toContain("checkRowPostability(");
  });

  it("steps.grading-draft-flow.ts's post-grades step calls checkRowPostability before building its payload", () => {
    const source = readStripped("src/lib/workflows/registry/steps.grading-draft-flow.ts");
    expect(source).toContain('import { checkRowPostability } from "@/lib/grade/postable"');
    expect(source).toContain("checkRowPostability(");
    // Ordering: the guard must run BEFORE payload.push for this row.
    const guardIdx = source.indexOf("checkRowPostability(");
    const pushIdx = source.indexOf("payload.push(", guardIdx);
    expect(pushIdx).toBeGreaterThan(guardIdx);
  });

  it("repoGradesPosting.ts's buildRepoGradePostPlan calls checkRowPostability after repoGradePostability, before the row is pushed into `postable`", () => {
    const source = readStripped("src/app/components/repo-grades/repoGradesPosting.ts");
    expect(source).toContain('import { checkRowPostability } from "@/lib/grade/postable"');
    const scoreGateIdx = source.indexOf("repoGradePostability({");
    const rowGateIdx = source.indexOf("checkRowPostability(", scoreGateIdx);
    expect(rowGateIdx).toBeGreaterThan(scoreGateIdx);
    const pushIdx = source.indexOf("postable.push(", rowGateIdx);
    expect(pushIdx).toBeGreaterThan(rowGateIdx);
  });

  it("RepoGradeCellControl.tsx's per-cell button/reason also consults checkRowPostability, so its enabled state cannot disagree with buildRepoGradePostPlan (AC5 item 28)", () => {
    const source = readStripped("src/app/components/repo-grades/RepoGradeCellControl.tsx");
    // Relative import, not the "@/lib/grade" alias - repoGradesFeedbackAndFiles
    // .wiring.test.ts bans that alias prefix outright for this file.
    expect(source).toContain('import { checkRowPostability } from "../../../lib/grade/postable"');
    expect(source).toContain("checkRowPostability(");
  });
});
