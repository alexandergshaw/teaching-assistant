import { describe, it, expect } from "vitest";
import { research, findCaseStudies, findPracticeProblems } from "./index";
import { CASE_STUDIES } from "./case-studies";
import { PRACTICE_PROBLEMS } from "./practice-problems";

describe("research retrieval", () => {
  it("returns topically relevant case studies", () => {
    const results = findCaseStudies("integer overflow and data types", 2);
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("gangnam-style-counter");
  });

  it("returns topically relevant practice problems", () => {
    const results = findPracticeProblems("loops and iteration", 2);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].topics.join(" ")).toContain("loops");
  });

  it("filters by kind", () => {
    const problems = research("sql databases", { kind: "practice_problem", limit: 5 });
    expect(problems.every((r) => r.kind === "practice_problem")).toBe(true);
    const studies = research("sql databases", { kind: "case_study", limit: 5 });
    expect(studies.every((r) => r.kind === "case_study")).toBe(true);
    expect(studies.map((s) => s.id)).toContain("gitlab-2017");
  });

  it("returns an empty list for an off-topic query instead of padding", () => {
    expect(research("medieval poetry appreciation")).toEqual([]);
    expect(research("")).toEqual([]);
  });

  it("respects the limit and is deterministic", () => {
    const one = research("security", { limit: 1 });
    expect(one).toHaveLength(1);
    expect(research("security", { limit: 3 })).toEqual(research("security", { limit: 3 }));
  });
});

describe("knowledge base integrity", () => {
  it("every case study has a year, organization, two summary bullets, and a lesson", () => {
    for (const entry of CASE_STUDIES) {
      expect(entry.kind).toBe("case_study");
      expect(entry.year).toBeGreaterThan(1960);
      expect(entry.organization.length).toBeGreaterThan(0);
      expect(entry.summary.length).toBe(2);
      expect(entry.lesson.length).toBeGreaterThan(10);
      expect(entry.topics.length).toBeGreaterThan(0);
    }
  });

  it("every practice problem has a prompt, example, and distinct solution", () => {
    for (const entry of PRACTICE_PROBLEMS) {
      expect(entry.kind).toBe("practice_problem");
      expect(entry.prompt.length).toBeGreaterThan(20);
      expect(entry.exampleCode.length).toBeGreaterThan(10);
      expect(entry.solutionCode.length).toBeGreaterThan(10);
      // The example must not give away the solution.
      expect(entry.exampleCode).not.toBe(entry.solutionCode);
      expect(entry.language.length).toBeGreaterThan(0);
    }
  });

  it("ids are unique across the whole knowledge base", () => {
    const ids = [...CASE_STUDIES, ...PRACTICE_PROBLEMS].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
