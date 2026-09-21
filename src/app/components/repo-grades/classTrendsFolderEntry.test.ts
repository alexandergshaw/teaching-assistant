import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { GradeResult, GradingRunEntry } from "@/lib/grade/types";
import { containsForbiddenCompletenessPhrase, computeClassTrends } from "@/lib/grade/class-trends";
import { buildRepoRunCohort, repoRunTrendsEntry, repoRunTrendsLabel, type RepoRunCohort } from "./classTrendsFolderEntry";

// A16 wave 3 (docs/a16-wave3-scope.md section 13.1): this leaf owns every
// DECISION wave 3's trends surface needs, so it is exercised BY VALUE here -
// nothing renders in this repo's vitest, and the hook that calls this leaf is
// only reachable from a real onClick (see repoGradesClassTrends.wiring.test.ts
// for the AST pins over that hook's own body).

function gradedResult(overrides: Partial<GradeResult> = {}): GradeResult {
  return {
    student: "repo/one",
    overallComment: "",
    strengths: "",
    improvements: "",
    resubmitNotice: "",
    rubricAreas: [{ area: "Structure", score: "9", comment: "" }],
    totalScore: "9",
    feedback: "",
    mergedFileCount: 1,
    submittedFiles: [],
    ...overrides,
  } as GradeResult;
}

function ungradedResult(overrides: Partial<GradeResult> = {}): GradeResult {
  return {
    student: "repo/two",
    overallComment: "",
    strengths: "",
    improvements: "",
    resubmitNotice: "",
    rubricAreas: [],
    totalScore: "",
    feedback: "",
    mergedFileCount: 0,
    submittedFiles: [],
    ungraded: { kind: "not-attempted", stoppedBy: "submission-count-bound", sourceIndex: 0, student: "repo/two", message: "no submission" },
    ...overrides,
  } as GradeResult;
}

describe("L-0: buildRepoRunCohort owns the null decision", () => {
  it("results: null returns null - runBulkGrade refused, no run happened", () => {
    expect(buildRepoRunCohort({ results: null, folder: "f", courseId: "c", course: null })).toBeNull();
  });
  it("results: [] returns a NON-null cohort with results.length === 0", () => {
    const cohort = buildRepoRunCohort({ results: [], folder: "f", courseId: "c", course: null });
    expect(cohort).not.toBeNull();
    expect(cohort?.results.length).toBe(0);
  });
  it("results: [r] returns a non-null cohort", () => {
    const cohort = buildRepoRunCohort({ results: [gradedResult()], folder: "f", courseId: "c", course: null });
    expect(cohort).not.toBeNull();
    expect(cohort?.results.length).toBe(1);
  });
});

describe("L-1: buildRepoRunCohort(...).results carries elements BY REFERENCE", () => {
  it("same length, and each element is toBe the input element, for two distinct results", () => {
    const r1 = gradedResult({ totalScore: "10", rubricAreas: [{ area: "A", score: "10", comment: "" }] });
    const r2 = gradedResult({ totalScore: "7", rubricAreas: [{ area: "B", score: "7", comment: "" }] });
    const cohort = buildRepoRunCohort({ results: [r1, r2], folder: "f", courseId: "c", course: null });
    expect(cohort?.results.length).toBe(2);
    expect(cohort?.results[0]).toBe(r1);
    expect(cohort?.results[1]).toBe(r2);
  });
});

describe("L-2: buildRepoRunCohort's meta, on distinctive inputs", () => {
  it("carries folder, courseName and courseId from their own input keys, never transposed", () => {
    const cohort = buildRepoRunCohort({
      results: [gradedResult()],
      folder: "loops-and-arrays",
      courseId: "c-42",
      course: { name: "Course Xy-7" },
    });
    expect(cohort?.folder).toBe("loops-and-arrays");
    expect(cohort?.courseName).toBe("Course Xy-7");
    expect(cohort?.courseId).toBe("c-42");
  });
  it("course: null yields courseName === ''", () => {
    const cohort = buildRepoRunCohort({ results: [gradedResult()], folder: "f", courseId: "c", course: null });
    expect(cohort?.courseName).toBe("");
  });
});

describe("L-3: repoRunTrendsEntry(cohort, liveId) !== null - frozen literal truth table", () => {
  const trendable = gradedResult();
  const ungraded = ungradedResult();
  const noAreas = gradedResult({ rubricAreas: [] });

  function cohortOf(results: readonly GradeResult[], courseId = "c-live"): RepoRunCohort {
    return { results, folder: "f", courseId, courseName: "" };
  }

  it("c0: null cohort -> false", () => {
    expect(repoRunTrendsEntry(null, "c-live") !== null).toBe(false);
  });
  it("c1: course mismatch with trendable results -> false", () => {
    expect(repoRunTrendsEntry(cohortOf([trendable], "c-other"), "c-live") !== null).toBe(false);
  });
  it("c2: match with one graded result carrying areas -> true", () => {
    expect(repoRunTrendsEntry(cohortOf([trendable]), "c-live") !== null).toBe(true);
  });
  it("c3: match with only ungraded -> false", () => {
    expect(repoRunTrendsEntry(cohortOf([ungraded]), "c-live") !== null).toBe(false);
  });
  it("c4: match with graded but zero areas -> false", () => {
    expect(repoRunTrendsEntry(cohortOf([noAreas]), "c-live") !== null).toBe(false);
  });
  it("c5: match with empty results -> false", () => {
    expect(repoRunTrendsEntry(cohortOf([]), "c-live") !== null).toBe(false);
  });
  it("c6: match with one graded-with-areas plus one ungraded -> true", () => {
    expect(repoRunTrendsEntry(cohortOf([trendable, ungraded]), "c-live") !== null).toBe(true);
  });
});

describe("L-4: the non-null entry's fields", () => {
  it("assignmentName/courseName/canvasUrl and result identity, on distinctive values", () => {
    const r1 = gradedResult({ totalScore: "10" });
    const r2 = gradedResult({ totalScore: "7" });
    const cohort = buildRepoRunCohort({
      results: [r1, r2],
      folder: "loops-and-arrays",
      courseId: "c-42",
      course: { name: "Course Xy-7" },
    });
    const entry = repoRunTrendsEntry(cohort, "c-42");
    expect(entry).not.toBeNull();
    expect(entry?.assignmentName).toBe("loops-and-arrays");
    expect(entry?.courseName).toBe("Course Xy-7");
    expect(entry?.canvasUrl).toBe("");
    expect(entry?.run.results[0]).toBe(r1);
    expect(entry?.run.results[1]).toBe(r2);
  });
});

describe("L-5: the counted output matches the fixture's literal graded count", () => {
  it("c6 (one graded, one ungraded) counts 1", () => {
    const cohort: RepoRunCohort = { results: [gradedResult(), ungradedResult()], folder: "f", courseId: "c", courseName: "" };
    const entry = repoRunTrendsEntry(cohort, "c") as GradingRunEntry;
    expect(computeClassTrends(entry).totalResults).toBe(1);
  });
  it("three graded results counts 3", () => {
    const cohort: RepoRunCohort = {
      results: [gradedResult({ student: "a" }), gradedResult({ student: "b" }), gradedResult({ student: "c" })],
      folder: "f",
      courseId: "c",
      courseName: "",
    };
    const entry = repoRunTrendsEntry(cohort, "c") as GradingRunEntry;
    expect(computeClassTrends(entry).totalResults).toBe(3);
  });
});

describe("L-6: repoRunTrendsLabel", () => {
  // Every fixture folder name contains NO digit - revision 0's "hw3-loops-Zq"
  // held a "3" and made (b) pass even with the count omitted.
  function entryFor(folder: string, count: number): GradingRunEntry {
    const results = Array.from({ length: count }, (_, i) => gradedResult({ student: `s${i}` }));
    const cohort: RepoRunCohort = { results, folder, courseId: "c", courseName: "" };
    return repoRunTrendsEntry(cohort, "c") as GradingRunEntry;
  }

  it("(a) contains the folder", () => {
    expect(repoRunTrendsLabel(entryFor("loops-and-arrays", 3))).toContain("loops-and-arrays");
  });
  it("(b) contains the graded count as a numeral, isolated from the folder text", () => {
    const label = entryFor("loops-and-arrays", 3);
    const stripped = repoRunTrendsLabel(label).split("loops-and-arrays").join("");
    expect(stripped).toContain("3");
  });
  it("(b) singular fixture, a real c6 case (one graded plus one ungraded) contains '1'", () => {
    // docs/a26-a27-scope.md: this used to call entryFor("linked-lists", 1),
    // which builds ONE graded result and NO ungraded one - not c6-shaped (c6
    // is one graded plus one ungraded, per L-3's and L-5's own c6 cases
    // above). Built directly here so the fixture actually has an ungraded
    // result alongside the one graded one, matching what it claims to be.
    const cohort: RepoRunCohort = { results: [gradedResult(), ungradedResult()], folder: "linked-lists", courseId: "c", courseName: "" };
    const entry = repoRunTrendsEntry(cohort, "c") as GradingRunEntry;
    const stripped = repoRunTrendsLabel(entry)
      .split("linked-lists")
      .join("");
    expect(stripped).toContain("1");
  });
  it("(c) swapping the folder in the label matches swapping the folder in the entry", () => {
    const labelA = repoRunTrendsLabel(entryFor("loops-and-arrays", 3));
    const labelB = repoRunTrendsLabel(entryFor("linked-lists", 3));
    expect(labelA.split("loops-and-arrays").join("linked-lists")).toBe(labelB);
  });
  it("(d) contains no forbidden completeness phrase", () => {
    expect(containsForbiddenCompletenessPhrase(repoRunTrendsLabel(entryFor("loops-and-arrays", 3)))).toBe(false);
  });
  it("(e) the singular form for n = 1, never the plural", () => {
    const label = repoRunTrendsLabel(entryFor("linked-lists", 1));
    expect(/\b1 repo\b/.test(label)).toBe(true);
    expect(/\b1 repos\b/.test(label)).toBe(false);
  });
});

describe("L-7: the leaf's own source, AST-checked", () => {
  const source = readFileSync(new URL("./classTrendsFolderEntry.ts", import.meta.url), "utf8");

  it("imports hasTrendableResults and toClassTrendsEntry from the shared adapter", () => {
    expect(/import\s*\{[^}]*\bhasTrendableResults\b[^}]*\btoClassTrendsEntry\b[^}]*\}\s*from\s*"\.\.\/grading-results\/classTrendsEntry"/.test(source) ||
      /import\s*\{[^}]*\btoClassTrendsEntry\b[^}]*\bhasTrendableResults\b[^}]*\}\s*from\s*"\.\.\/grading-results\/classTrendsEntry"/.test(source)).toBe(true);
  });
  it("declares no function or const whose name matches /trendable/i, other than the imported call", () => {
    expect(/\b(?:function|const)\s+\w*[Tt]rendable\w*/.test(source)).toBe(false);
  });
  it("declares no interface or type alias whose name matches /Meta\\b/", () => {
    expect(/\b(?:interface|type)\s+\w*Meta\b/.test(source)).toBe(false);
  });
  it("every value-import specifier is one of the two allowed ones, via the real TypeScript parser", () => {
    const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");
    const sourceFile = ts.createSourceFile("leaf.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const allowed = new Set(["@/lib/grade/types", "../grading-results/classTrendsEntry"]);
    const specifiers: string[] = [];
    function visit(node: import("typescript").Node): void {
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
        const clause = node.importClause;
        const namedBindings = clause?.namedBindings;
        const allTypeOnly =
          namedBindings && ts.isNamedImports(namedBindings) && namedBindings.elements.every((el) => el.isTypeOnly);
        if (!allTypeOnly) specifiers.push((node.moduleSpecifier as import("typescript").StringLiteral).text);
      }
      ts.forEachChild(node, visit);
    }
    ts.forEachChild(sourceFile, visit);
    for (const spec of specifiers) {
      expect(allowed.has(spec), `unexpected value-import specifier: ${spec}`).toBe(true);
    }
    expect(specifiers.length).toBeGreaterThan(0);
  });
  it("imports nothing from ./repoGrades*", () => {
    expect(/from\s+"\.\/repoGrades/.test(source)).toBe(false);
  });
});
