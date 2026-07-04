import { describe, it, expect } from "vitest";
import {
  rowToCaseStudy,
  rowToPracticeProblem,
  searchKnowledgeRows,
  upsertKnowledge,
  listUnverifiedKnowledge,
  verifyKnowledgeEntry,
  deleteKnowledgeEntry,
  type KnowledgeRow,
} from "./db";
import { makeKnowledgeRow } from "./test-support";

function row(overrides: Partial<KnowledgeRow>): KnowledgeRow {
  return makeKnowledgeRow({
    topics: ["testing"],
    summary: "First bullet.\nSecond bullet.",
    lesson: "The lesson.",
    organization: "Org",
    year: 2001,
    ...overrides,
  });
}

describe("row mapping", () => {
  it("maps a complete case-study row, splitting summary bullets", () => {
    const entry = rowToCaseStudy(row({}));
    expect(entry).not.toBeNull();
    expect(entry!.summary).toEqual(["First bullet.", "Second bullet."]);
    expect(entry!.lesson).toBe("The lesson.");
  });

  it("returns null for a case-study row missing required fields", () => {
    expect(rowToCaseStudy(row({ organization: null }))).toBeNull();
    expect(rowToCaseStudy(row({ kind: "reference" }))).toBeNull();
  });

  it("maps a verified practice problem and refuses unverified code", () => {
    const problem = row({
      kind: "practice_problem",
      prompt: "Do the thing.",
      example_code: "example()",
      solution_code: "solve()",
      language: "python",
      difficulty: "intro",
    });
    expect(rowToPracticeProblem(problem)).toMatchObject({
      exampleCode: "example()",
      solutionCode: "solve()",
      difficulty: "intro",
    });
    // Unverified rows must never supply code presented as a correct answer.
    expect(rowToPracticeProblem({ ...problem, verified: false })).toBeNull();
    expect(rowToPracticeProblem({ ...problem, solution_code: null })).toBeNull();
  });
});

describe("database unavailability (vitest blanks the Supabase env)", () => {
  it("reads return null and writes report zero, without throwing", async () => {
    expect(await searchKnowledgeRows("loops")).toBeNull();
    expect(await upsertKnowledge([{ id: "a", kind: "reference", title: "t" }])).toBe(0);
  });

  it("curation functions degrade the same way", async () => {
    expect(await listUnverifiedKnowledge()).toBeNull();
    expect(await verifyKnowledgeEntry("some-id", { lesson: "L" })).toBe(false);
    expect(await deleteKnowledgeEntry("some-id")).toBe(false);
  });
});
