import { describe, expect, it } from "vitest";
import { parseRepositoryProposalOutput } from "./repository-proposal-output";
import type { RubricCriterion } from "./types";
const criteria: readonly RubricCriterion[] = [{ name: "Algorithm", points: 6 }, { name: "Explanation", points: 4 }];
const ids = ["repo:owner/repo@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:src/main.py", "original:notes.txt"];
const raw = `{
  "overallComment": "Your algorithm earns partial credit for the implemented branches.",
  "improvements": "Explain the stopping condition.",
  "rubricResults": [
    {"area":"Algorithm","score":{"earned":4,"possible":6},"comment":"The second branch is incomplete. [evidence:repo:owner/repo@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:src/main.py]"},
    {"area":"Explanation","score":{"earned":3,"possible":4},"comment":"The stopping condition is not explained. [evidence:original:notes.txt]"}
  ]
}`;
const parse = (text = raw, rubric = criteria) => parseRepositoryProposalOutput(text, rubric, ids);
function change(mutator: (fixture: Record<string, unknown>) => void): string {
  const fixture = JSON.parse(raw); mutator(fixture); return JSON.stringify(fixture);
}
describe("strict untouched repository proposal output", () => {
  it("retains literal ordered criteria, scores, rationales and evidence references in axis-compatible output", () => {
    expect(parse()).toEqual({ ok: true, value: {
      rubricAreas: [
        { area: "Algorithm", score: "4/6", comment: "The second branch is incomplete. [evidence:repo:owner/repo@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:src/main.py]" },
        { area: "Explanation", score: "3/4", comment: "The stopping condition is not explained. [evidence:original:notes.txt]" },
      ],
      strengths: "Your algorithm earns partial credit for the implemented branches.",
      improvements: "Explain the stopping condition.",
      modelTotalScore: "7/10", overallComment: "Your algorithm earns partial credit for the implemented branches.",
    } });
  });
  it.each(["not JSON", `before ${raw}`, `\u0060\u0060\u0060json\n${raw}\n\u0060\u0060\u0060`, "null", "[]", "{}"])("refuses malformed or nonobject output without extracting/recovering %s", (text) => expect(parse(text).ok).toBe(false));
  it("rejects every missing, extra, duplicate and reordered result before normalization", () => {
    const invalid = [
      change((f) => { (f.rubricResults as unknown[]).pop(); }),
      change((f) => { (f.rubricResults as unknown[]).push({ area: "Overall", score: { earned: 10, possible: 10 }, comment: "extra" }); }),
      change((f) => { const rows = f.rubricResults as unknown[]; rows[1] = rows[0]; }),
      change((f) => { (f.rubricResults as unknown[]).reverse(); }),
      change((f) => { (f.rubricResults as unknown[])[1] = null; }),
      raw.replace('"area":"Explanation"', '"area":"EXPLANATION!"'),
    ];
    for (const text of invalid) expect(parse(text)).toEqual({ ok: false, reason: "invalid-results" });
  });
  it.each([
    ['"earned":4', '"earned":"4"'], ['"earned":4', '"earned":-1'], ['"earned":4', '"earned":7'],
    ['"earned":4', '"earned":1e999'], ['"possible":6', '"possible":7'], ['"possible":6', '"possible":"6"'],
    ['{"earned":4,"possible":6}', '"4/6"'], ['{"earned":4,"possible":6}', '{"earned":4,"possible":6,"override":true}'],
  ])("refuses score types, bounds and changed maxima %s -> %s", (before, after) => expect(parse(raw.replace(before, after))).toEqual({ ok: false, reason: "invalid-score" }));
  it("requires the original feedback fields and rejects semantic extra fields", () => {
    for (const text of [change((f) => { delete f.improvements; }), change((f) => { f.overallComment = 3; }), change((f) => { f.overallComment = " "; }), change((f) => { f.strengths = 3; }), change((f) => { f.execution = "passed"; })]) expect(parse(text)).toEqual({ ok: false, reason: "invalid-feedback" });
  });
  it.each([
    "", "No evidence provided.", "Missing branch. [evidence:unapproved]", "Missing branch. [evidence:original:notes.txt] [evidence:forged]",
    "[evidence:original:notes.txt]", "Missing branch. [evidence:original:notes.txt] [evidence:broken", "Missing branch. [Evidence:original:notes.txt]",
  ])("requires a nonempty rationale and exclusively known complete citation tokens: %s", (comment) => {
    const text = change((f) => { (f.rubricResults as Array<{ comment: string }>)[0].comment = comment; });
    expect(parse(text)).toEqual({ ok: false, reason: "invalid-evidence" });
  });
  it("rejects unauditable maxima and normalized criterion aliases rather than deduplicating", () => {
    for (const rubric of [[], [{ name: "Algorithm", points: null }], [{ name: "Algorithm", points: Infinity }], [{ name: "Algorithm", points: -1 }], [{ name: "Algorithm", points: 6 }, { name: "ALGORITHM!", points: 4 }]]) expect(parse(raw, rubric)).toEqual({ ok: false, reason: "invalid-criteria" });
  });
  it("preserves separate praise verbatim when supplied and accepts a set of allowed evidence", () => {
    const text = change((f) => { f.strengths = "Your branch structure is clear."; });
    const result = parseRepositoryProposalOutput(text, criteria, new Set(ids));
    expect(result.ok && result.value.separateStrengths).toBe("Your branch structure is clear.");
    expect(result.ok && result.value.overallComment).toBe("Your algorithm earns partial credit for the implemented branches.");
  });
  it("enforces the actual UTF-8 output byte ceiling before parsing", () => expect(parse("é".repeat(131_073))).toEqual({ ok: false, reason: "output-cap" }));
  it("does not mutate supplied audited criteria or evidence identifiers", () => {
    const immutable = Object.freeze(criteria.map((criterion) => Object.freeze({ ...criterion })));
    expect(parseRepositoryProposalOutput(raw, immutable, Object.freeze([...ids])).ok).toBe(true);
    expect(immutable).toEqual([{ name: "Algorithm", points: 6 }, { name: "Explanation", points: 4 }]);
  });
});