// Tests for github-grading-run-store.ts
// (docs/repo-grading-records-acceptance-criteria.md, R2). vitest.config.ts
// runs with environment: "node", so there is no `window`/`localStorage`
// global by default - the load/persist describe block below stubs a
// minimal in-memory Storage and a `window` global before each test and
// restores the previous globals afterward, matching
// src/app/components/repo-grades/repoGradesUiState.test.ts's own pattern.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GradeResult, GradingRun } from "@/lib/grade";
import {
  describeGithubGradingTruncation,
  describeRestoredGithubGradingRun,
  loadStoredGithubGradingRun,
  parseStoredGithubGradingRun,
  persistGithubGradingRun,
  serializeGithubGradingRun,
} from "./github-grading-run-store";

function fixtureResult(overrides: Partial<GradeResult> = {}): GradeResult {
  return {
    student: "Jane Doe",
    overallComment: "Nice work.",
    rubricAreas: [{ area: "Clarity", score: "8/10", comment: "" }],
    totalScore: "8/10",
    feedback: "Total Score: 8/10\nOverall: Nice work.",
    mergedFileCount: 1,
    submittedFiles: [
      {
        name: "main.py",
        extension: "py",
        previewContent: "print('hi')",
        previewTruncated: false,
        rawBase64: "QUJDREVGRw==",
        mimeType: "text/x-python",
      },
    ],
    userId: 42,
    gradedRepo: "student/hw1",
    gradedRef: "abc123def456",
    ...overrides,
  };
}

function fixtureRun(overrides: Partial<GradingRun> = {}): GradingRun {
  return {
    results: [fixtureResult()],
    rubricAreaNames: ["Clarity"],
    fullCreditChecklist: ["Has a README"],
    speedGraderUrl: "https://canvas.example/speedgrader?assignment_id=1",
    sampleAnswer: "def main(): pass",
    ...overrides,
  };
}

describe("serializeGithubGradingRun / parseStoredGithubGradingRun - round trip", () => {
  it("round-trips a run, stripping submitted file bytes but keeping every grade-relevant field", () => {
    const run = fixtureRun();
    const json = serializeGithubGradingRun({
      run,
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "week-1",
      truncatedRepos: ["student/hw1"],
    });
    const restored = parseStoredGithubGradingRun(json);

    expect(restored).not.toBeNull();
    expect(restored!.gradedAt).toBe("2026-08-24T12:00:00.000Z");
    expect(restored!.lastGradedFolder).toBe("week-1");
    expect(restored!.truncatedRepos).toEqual(["student/hw1"]);
    expect(restored!.run.results).toEqual([
      {
        student: "Jane Doe",
        overallComment: "Nice work.",
        rubricAreas: [{ area: "Clarity", score: "8/10", comment: "" }],
        totalScore: "8/10",
        feedback: "Total Score: 8/10\nOverall: Nice work.",
        mergedFileCount: 1,
        submittedFiles: [],
        userId: 42,
        gradedRepo: "student/hw1",
        gradedRef: "abc123def456",
        submissionTruncated: undefined,
      },
    ]);
    expect(restored!.run.rubricAreaNames).toEqual(["Clarity"]);
    expect(restored!.run.fullCreditChecklist).toEqual(["Has a README"]);
    expect(restored!.run.speedGraderUrl).toBe("https://canvas.example/speedgrader?assignment_id=1");
    expect(restored!.run.sampleAnswer).toBe("def main(): pass");
  });

  it("round-trips a result with no gradedRepo/gradedRef/userId (not a GitHub- or Canvas-sourced row)", () => {
    const run = fixtureRun({
      results: [
        fixtureResult({ userId: undefined, gradedRepo: undefined, gradedRef: undefined }),
      ],
    });
    const json = serializeGithubGradingRun({ run, gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: [] });
    const restored = parseStoredGithubGradingRun(json);
    expect(restored).not.toBeNull();
    expect(restored!.run.results[0].userId).toBeUndefined();
    expect(restored!.run.results[0].gradedRepo).toBeUndefined();
    expect(restored!.run.results[0].gradedRef).toBeUndefined();
  });

  it("round-trips submissionTruncated (C2) - true, false, and absent all survive distinctly", () => {
    const run = fixtureRun({
      results: [
        fixtureResult({ student: "Cut", submissionTruncated: true }),
        fixtureResult({ student: "Not Cut", submissionTruncated: false }),
        fixtureResult({ student: "Never Set", submissionTruncated: undefined }),
      ],
    });
    const json = serializeGithubGradingRun({ run, gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: [] });
    const restored = parseStoredGithubGradingRun(json);
    expect(restored).not.toBeNull();
    expect(restored!.run.results[0].submissionTruncated).toBe(true);
    expect(restored!.run.results[1].submissionTruncated).toBe(false);
    expect(restored!.run.results[2].submissionTruncated).toBeUndefined();
  });
});

describe("serializeGithubGradingRun - R2.4 strip", () => {
  it("never leaves the raw file bytes, preview content, or file name reachable in the serialized string", () => {
    const run = fixtureRun();
    const json = serializeGithubGradingRun({ run, gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: [] });
    expect(json).not.toContain("QUJDREVGRw");
    expect(json).not.toContain("print('hi')");
    expect(json).not.toContain("main.py");
  });
});

describe("parseStoredGithubGradingRun - R2.3 never trust stored data", () => {
  it("returns null for null or empty input", () => {
    expect(parseStoredGithubGradingRun(null)).toBeNull();
    expect(parseStoredGithubGradingRun("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseStoredGithubGradingRun("{not json")).toBeNull();
  });

  it("returns null when the stored value is valid JSON but not an object", () => {
    expect(parseStoredGithubGradingRun(JSON.stringify(["a", "b"]))).toBeNull();
    expect(parseStoredGithubGradingRun(JSON.stringify("just a string"))).toBeNull();
  });

  it("returns null when gradedAt or lastGradedFolder is missing or the wrong type", () => {
    const run = fixtureRun();
    expect(parseStoredGithubGradingRun(JSON.stringify({ lastGradedFolder: "week-1", truncatedRepos: [], run }))).toBeNull();
    expect(
      parseStoredGithubGradingRun(JSON.stringify({ gradedAt: 123, lastGradedFolder: "week-1", truncatedRepos: [], run }))
    ).toBeNull();
    expect(
      parseStoredGithubGradingRun(
        JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: null, truncatedRepos: [], run })
      )
    ).toBeNull();
  });

  it("returns null when truncatedRepos (C2) is missing or not a string array - an older stored blob predating this field restores as no run, rather than silently claiming nothing was truncated", () => {
    const run = fixtureRun();
    expect(
      parseStoredGithubGradingRun(JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", run }))
    ).toBeNull();
    expect(
      parseStoredGithubGradingRun(
        JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: "nope", run })
      )
    ).toBeNull();
    expect(
      parseStoredGithubGradingRun(
        JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: [1, 2], run })
      )
    ).toBeNull();
  });

  it("returns null when run is missing or not an object", () => {
    expect(
      parseStoredGithubGradingRun(
        JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: [] })
      )
    ).toBeNull();
    expect(
      parseStoredGithubGradingRun(
        JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: [], run: "nope" })
      )
    ).toBeNull();
  });

  it("rejects the WHOLE run when one result is missing a required field, rather than returning a partial run", () => {
    const good = fixtureResult({ student: "Keep Me" });
    const bad = { student: "Broken Row" }; // missing overallComment, rubricAreas, etc.
    const stored = {
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "",
      truncatedRepos: [],
      run: { results: [good, bad], rubricAreaNames: ["Clarity"], fullCreditChecklist: [] },
    };
    expect(parseStoredGithubGradingRun(JSON.stringify(stored))).toBeNull();
  });

  it("rejects a run whose rubricAreaNames or fullCreditChecklist is not a string array", () => {
    const withBadRubricNames = {
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "",
      truncatedRepos: [],
      run: { results: [], rubricAreaNames: [1, 2], fullCreditChecklist: [] },
    };
    expect(parseStoredGithubGradingRun(JSON.stringify(withBadRubricNames))).toBeNull();

    const withBadChecklist = {
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "",
      truncatedRepos: [],
      run: { results: [], rubricAreaNames: [], fullCreditChecklist: "not-an-array" },
    };
    expect(parseStoredGithubGradingRun(JSON.stringify(withBadChecklist))).toBeNull();
  });

  it("rejects a result whose rubricAreas entry is missing a required field", () => {
    const bad = { ...fixtureResult(), rubricAreas: [{ area: "Clarity", score: "8/10" }] };
    const stored = {
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "",
      truncatedRepos: [],
      run: { results: [bad], rubricAreaNames: ["Clarity"], fullCreditChecklist: [] },
    };
    expect(parseStoredGithubGradingRun(JSON.stringify(stored))).toBeNull();
  });

  it("cannot be tricked into restoring file bytes even if a hand-edited blob reintroduces them", () => {
    const stored = {
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "",
      truncatedRepos: [],
      run: { results: [fixtureResult()], rubricAreaNames: ["Clarity"], fullCreditChecklist: [] },
    };
    const restored = parseStoredGithubGradingRun(JSON.stringify(stored));
    expect(restored).not.toBeNull();
    expect(restored!.run.results[0].submittedFiles).toEqual([]);
  });

  it("a wrong-typed submissionTruncated on one result degrades to undefined rather than rejecting the whole run", () => {
    const raw = { ...fixtureResult(), submissionTruncated: "yes" };
    const stored = {
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "",
      truncatedRepos: [],
      run: { results: [raw], rubricAreaNames: ["Clarity"], fullCreditChecklist: [] },
    };
    const restored = parseStoredGithubGradingRun(JSON.stringify(stored));
    expect(restored).not.toBeNull();
    expect(restored!.run.results[0].submissionTruncated).toBeUndefined();
  });
});

class FakeStorage {
  private store = new Map<string, string>();
  throwOnSet = false;

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    if (this.throwOnSet) throw new Error("quota exceeded (simulated)");
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

describe("loadStoredGithubGradingRun / persistGithubGradingRun", () => {
  let fakeStorage: FakeStorage;
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

  beforeEach(() => {
    fakeStorage = new FakeStorage();
    (globalThis as { window?: unknown }).window = globalThis;
    (globalThis as { localStorage?: unknown }).localStorage = fakeStorage;
  });

  afterEach(() => {
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;

    if (originalLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
  });

  it("returns null when nothing is stored", () => {
    expect(loadStoredGithubGradingRun()).toBeNull();
  });

  it("returns null when window is undefined (SSR-safe read)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadStoredGithubGradingRun()).toBeNull();
  });

  it("round-trips a persisted run, including which repos were truncated (C2)", () => {
    const run = fixtureRun();
    persistGithubGradingRun({
      run,
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "week-1",
      truncatedRepos: ["student/hw1"],
    });
    const loaded = loadStoredGithubGradingRun();
    expect(loaded).not.toBeNull();
    expect(loaded!.gradedAt).toBe("2026-08-24T12:00:00.000Z");
    expect(loaded!.lastGradedFolder).toBe("week-1");
    expect(loaded!.truncatedRepos).toEqual(["student/hw1"]);
    expect(loaded!.run.results[0].student).toBe("Jane Doe");
    // R2.4: bytes never make the round trip.
    expect(loaded!.run.results[0].submittedFiles).toEqual([]);
  });

  it("does nothing when persisting with window undefined (SSR-safe write)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() =>
      persistGithubGradingRun({ run: fixtureRun(), gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: [] })
    ).not.toThrow();
    expect(fakeStorage.getItem("ta-github-grading-run")).toBeNull();
  });

  it("does not throw, and does not persist, when localStorage refuses the write (quota exceeded)", () => {
    fakeStorage.throwOnSet = true;
    expect(() =>
      persistGithubGradingRun({ run: fixtureRun(), gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: [] })
    ).not.toThrow();
    fakeStorage.throwOnSet = false;
    // The failed write must not have left a partial/corrupt value behind either.
    expect(loadStoredGithubGradingRun()).toBeNull();
  });

  it("a quota failure loses persistence for only that run - a later successful write still works", () => {
    fakeStorage.throwOnSet = true;
    persistGithubGradingRun({ run: fixtureRun(), gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: [] });
    fakeStorage.throwOnSet = false;
    persistGithubGradingRun({
      run: fixtureRun(),
      gradedAt: "2026-08-24T13:00:00.000Z",
      lastGradedFolder: "week-2",
      truncatedRepos: [],
    });
    const loaded = loadStoredGithubGradingRun();
    expect(loaded).not.toBeNull();
    expect(loaded!.gradedAt).toBe("2026-08-24T13:00:00.000Z");
  });
});

describe("describeRestoredGithubGradingRun - R2.5", () => {
  it("names the timestamp so a restored run cannot read as freshly produced", () => {
    const text = describeRestoredGithubGradingRun("2026-08-24T12:00:00.000Z");
    expect(text).toContain("Restored from your last run, graded");
    expect(text).toContain("Re-grade to refresh");
  });

  it("falls back to the raw stored string when it does not parse as a date, rather than showing Invalid Date", () => {
    const text = describeRestoredGithubGradingRun("not-a-date");
    expect(text).not.toContain("Invalid Date");
    expect(text).toContain("not-a-date");
  });
});

describe("describeGithubGradingTruncation - C2", () => {
  it("returns null when nothing was truncated (no permanent all-clear line)", () => {
    const results = [fixtureResult({ student: "A", submissionTruncated: false }), fixtureResult({ student: "B", submissionTruncated: undefined })];
    expect(describeGithubGradingTruncation(results, [])).toBeNull();
  });

  it("reports only the ingest cut when only repos were truncated, naming them", () => {
    const results = [fixtureResult({ student: "A", submissionTruncated: false })];
    const notice = describeGithubGradingTruncation(results, ["student/hw1", "student/hw2"]);
    expect(notice).not.toBeNull();
    expect(notice!.ingestMessage).toContain("student/hw1");
    expect(notice!.ingestMessage).toContain("student/hw2");
    expect(notice!.ingestMessage).toContain("2 repos");
    expect(notice!.submissionMessage).toBeNull();
  });

  it("reports only the submission cut when only the assembled text was truncated, naming the students", () => {
    const results = [
      fixtureResult({ student: "Alice", submissionTruncated: true }),
      fixtureResult({ student: "Bob", submissionTruncated: false }),
    ];
    const notice = describeGithubGradingTruncation(results, []);
    expect(notice).not.toBeNull();
    expect(notice!.submissionMessage).toContain("Alice");
    expect(notice!.submissionMessage).not.toContain("Bob");
    expect(notice!.submissionMessage).toContain("1 student");
    expect(notice!.ingestMessage).toBeNull();
  });

  it("reports both facts separately (never merged into one line) when both cuts happened", () => {
    const results = [fixtureResult({ student: "Alice", submissionTruncated: true })];
    const notice = describeGithubGradingTruncation(results, ["student/hw1"]);
    expect(notice).not.toBeNull();
    expect(notice!.ingestMessage).toContain("student/hw1");
    expect(notice!.submissionMessage).toContain("Alice");
    expect(notice!.ingestMessage).not.toBe(notice!.submissionMessage);
  });

  it("uses singular wording for exactly one truncated repo or student", () => {
    const results = [fixtureResult({ student: "Alice", submissionTruncated: true })];
    const notice = describeGithubGradingTruncation(results, ["student/hw1"]);
    expect(notice!.ingestMessage).toContain("1 repo:");
    expect(notice!.ingestMessage).not.toContain("1 repos");
    expect(notice!.submissionMessage).toContain("1 student:");
    expect(notice!.submissionMessage).not.toContain("1 students");
  });

  it("filters out blank/whitespace-only repo names rather than listing them", () => {
    const results = [fixtureResult({ student: "A", submissionTruncated: false })];
    const notice = describeGithubGradingTruncation(results, ["  ", "", "student/hw1"]);
    expect(notice).not.toBeNull();
    expect(notice!.ingestMessage).toContain("1 repo:");
    expect(notice!.ingestMessage).toContain("student/hw1");
  });
});
