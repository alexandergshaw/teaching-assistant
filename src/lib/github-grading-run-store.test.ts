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
  describeGithubGradingNoSubmission,
  describeGithubGradingTruncation,
  describeGithubGradingUndetermined,
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
    strengths: "Nice work.",
    improvements: "",
    resubmitNotice: "",
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
      // FIX 2 (entry 370): a run that also had a no-submission repo must
      // round-trip that fact too - included alongside truncatedRepos in the
      // SAME run so this one test proves both new/existing sibling arrays
      // survive save+load together, not just in isolation.
      noSubmissionRepos: ["student/hw2"],
      // undeterminedRepos must round-trip alongside noSubmissionRepos in the
      // SAME run, staying its own distinct array rather than being merged
      // into noSubmissionRepos - a different repo name proves they were not
      // concatenated/deduped into one list.
      undeterminedRepos: ["student/hw3"],
    });
    const restored = parseStoredGithubGradingRun(json);

    expect(restored).not.toBeNull();
    expect(restored!.gradedAt).toBe("2026-08-24T12:00:00.000Z");
    expect(restored!.lastGradedFolder).toBe("week-1");
    expect(restored!.truncatedRepos).toEqual(["student/hw1"]);
    expect(restored!.noSubmissionRepos).toEqual(["student/hw2"]);
    expect(restored!.undeterminedRepos).toEqual(["student/hw3"]);
    // Distinct and not merged: hw2 belongs only to noSubmissionRepos, hw3
    // only to undeterminedRepos.
    expect(restored!.noSubmissionRepos).not.toContain("student/hw3");
    expect(restored!.undeterminedRepos).not.toContain("student/hw2");
    expect(restored!.run.results).toEqual([
      {
        student: "Jane Doe",
        overallComment: "Nice work.",
        strengths: "Nice work.",
        improvements: "",
        resubmitNotice: "",
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
    const json = serializeGithubGradingRun({
      run,
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "",
      truncatedRepos: [],
      noSubmissionRepos: [],
      undeterminedRepos: [],
    });
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
    const json = serializeGithubGradingRun({
      run,
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "",
      truncatedRepos: [],
      noSubmissionRepos: [],
      undeterminedRepos: [],
    });
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
    const json = serializeGithubGradingRun({
      run,
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "",
      truncatedRepos: [],
      noSubmissionRepos: [],
      undeterminedRepos: [],
    });
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
      parseStoredGithubGradingRun(JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", noSubmissionRepos: [], run }))
    ).toBeNull();
    expect(
      parseStoredGithubGradingRun(
        JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: "nope", noSubmissionRepos: [], run })
      )
    ).toBeNull();
    expect(
      parseStoredGithubGradingRun(
        JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: [1, 2], noSubmissionRepos: [], run })
      )
    ).toBeNull();
  });

  // FIX 2 (entry 370): UNLIKE truncatedRepos above, this field's sibling
  // upgrade path is NOT strict-validation - pre-change code graded every
  // repo it ingested (there was no skip-before-grading step to record), so
  // an older stored blob predating this field is not untrustworthy: the true
  // fact for that old run is "no repo was skipped", so it must restore, with
  // noSubmissionRepos defaulting to []. A PRESENT but wrong-typed value is
  // still a corrupt run, not an old one, and is still rejected.
  it("restores noSubmissionRepos as [] when the field is absent (an older stored blob), but still rejects a PRESENT wrong-typed value as corrupt", () => {
    const run = fixtureRun();
    const restoredOld = parseStoredGithubGradingRun(
      JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "week-1", truncatedRepos: [], run })
    );
    expect(restoredOld).not.toBeNull();
    expect(restoredOld!.noSubmissionRepos).toEqual([]);
    // The rest of the run must restore normally too - this is not "no run",
    // it is a full run whose new field defaults.
    expect(restoredOld!.lastGradedFolder).toBe("week-1");
    expect(restoredOld!.run.results[0].student).toBe("Jane Doe");

    expect(
      parseStoredGithubGradingRun(
        JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: [], noSubmissionRepos: "nope", run })
      )
    ).toBeNull();
    expect(
      parseStoredGithubGradingRun(
        JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: [], noSubmissionRepos: [1, 2], run })
      )
    ).toBeNull();
  });

  // Same idiom as noSubmissionRepos immediately above (not a third one): a
  // blob predating this split had any undetermined repo already folded into
  // the coarser noSubmissionRepos array, so an ABSENT field is not
  // untrustworthy and defaults to [], while a PRESENT wrong-typed value is
  // still a corrupt run and is rejected.
  it("restores undeterminedRepos as [] when the field is absent (an older stored blob predating this split), but still rejects a PRESENT wrong-typed value as corrupt", () => {
    const run = fixtureRun();
    const restoredOld = parseStoredGithubGradingRun(
      JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "week-1", truncatedRepos: [], noSubmissionRepos: [], run })
    );
    expect(restoredOld).not.toBeNull();
    expect(restoredOld!.undeterminedRepos).toEqual([]);
    // The rest of the run - including its sibling arrays - must restore
    // normally too: this is not "no run", it is a full run whose new field
    // defaults.
    expect(restoredOld!.lastGradedFolder).toBe("week-1");
    expect(restoredOld!.noSubmissionRepos).toEqual([]);
    expect(restoredOld!.run.results[0].student).toBe("Jane Doe");

    expect(
      parseStoredGithubGradingRun(
        JSON.stringify({
          gradedAt: "2026-08-24T12:00:00.000Z",
          lastGradedFolder: "",
          truncatedRepos: [],
          noSubmissionRepos: [],
          undeterminedRepos: "nope",
          run,
        })
      )
    ).toBeNull();
    expect(
      parseStoredGithubGradingRun(
        JSON.stringify({
          gradedAt: "2026-08-24T12:00:00.000Z",
          lastGradedFolder: "",
          truncatedRepos: [],
          noSubmissionRepos: [],
          undeterminedRepos: [1, 2],
          run,
        })
      )
    ).toBeNull();
  });

  it("returns null when run is missing or not an object", () => {
    expect(
      parseStoredGithubGradingRun(
        JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: [], noSubmissionRepos: [] })
      )
    ).toBeNull();
    expect(
      parseStoredGithubGradingRun(
        JSON.stringify({ gradedAt: "2026-08-24T12:00:00.000Z", lastGradedFolder: "", truncatedRepos: [], noSubmissionRepos: [], run: "nope" })
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
      noSubmissionRepos: [],
      run: { results: [good, bad], rubricAreaNames: ["Clarity"], fullCreditChecklist: [] },
    };
    expect(parseStoredGithubGradingRun(JSON.stringify(stored))).toBeNull();
  });

  it("rejects a run whose rubricAreaNames or fullCreditChecklist is not a string array", () => {
    const withBadRubricNames = {
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "",
      truncatedRepos: [],
      noSubmissionRepos: [],
      run: { results: [], rubricAreaNames: [1, 2], fullCreditChecklist: [] },
    };
    expect(parseStoredGithubGradingRun(JSON.stringify(withBadRubricNames))).toBeNull();

    const withBadChecklist = {
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "",
      truncatedRepos: [],
      noSubmissionRepos: [],
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
      noSubmissionRepos: [],
      run: { results: [bad], rubricAreaNames: ["Clarity"], fullCreditChecklist: [] },
    };
    expect(parseStoredGithubGradingRun(JSON.stringify(stored))).toBeNull();
  });

  it("cannot be tricked into restoring file bytes even if a hand-edited blob reintroduces them", () => {
    const stored = {
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "",
      truncatedRepos: [],
      noSubmissionRepos: [],
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
      noSubmissionRepos: [],
      run: { results: [raw], rubricAreaNames: ["Clarity"], fullCreditChecklist: [] },
    };
    const restored = parseStoredGithubGradingRun(JSON.stringify(stored));
    expect(restored).not.toBeNull();
    expect(restored!.run.results[0].submissionTruncated).toBeUndefined();
  });

  // docs/grading-results-feedback-boxes-acceptance-criteria.md A5 item 18: the
  // three feedback-box fields are REQUIRED on GradeResult, so this store must
  // NOT copy the strict-validation idiom this suite exercises above (one bad
  // result invalidates the whole run) for them - that would erase every run
  // already sitting in a user's localStorage the moment this feature ships. A
  // blob saved before this feature existed has no strengths/improvements/
  // resubmitNotice keys at all; it must still load, with those three fields
  // degrading to "" rather than the run being rejected.
  it("still loads a run predating this feature, with no strengths/improvements/resubmitNotice keys at all", () => {
    const oldResult = fixtureResult() as unknown as Record<string, unknown>;
    delete oldResult.strengths;
    delete oldResult.improvements;
    delete oldResult.resubmitNotice;
    const stored = {
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "week-1",
      truncatedRepos: [],
      noSubmissionRepos: [],
      run: { results: [oldResult], rubricAreaNames: ["Clarity"], fullCreditChecklist: [] },
    };
    const restored = parseStoredGithubGradingRun(JSON.stringify(stored));
    expect(restored).not.toBeNull();
    expect(restored!.run.results[0].student).toBe("Jane Doe");
    // The pre-existing composed comment survives untouched...
    expect(restored!.run.results[0].overallComment).toBe("Nice work.");
    // ...while the three new boxes, unavailable on this old blob, degrade to
    // "" instead of the whole run being thrown away.
    expect(restored!.run.results[0].strengths).toBe("");
    expect(restored!.run.results[0].improvements).toBe("");
    expect(restored!.run.results[0].resubmitNotice).toBe("");
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

  it("round-trips a persisted run, including which repos were truncated (C2), which had no submission (FIX 2, entry 370), and which were undetermined (unreadable file type) - as distinct, unmerged arrays", () => {
    const run = fixtureRun();
    persistGithubGradingRun({
      run,
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "week-1",
      truncatedRepos: ["student/hw1"],
      noSubmissionRepos: ["student/hw9"],
      undeterminedRepos: ["student/hw7"],
    });
    const loaded = loadStoredGithubGradingRun();
    expect(loaded).not.toBeNull();
    expect(loaded!.gradedAt).toBe("2026-08-24T12:00:00.000Z");
    expect(loaded!.lastGradedFolder).toBe("week-1");
    expect(loaded!.truncatedRepos).toEqual(["student/hw1"]);
    expect(loaded!.noSubmissionRepos).toEqual(["student/hw9"]);
    expect(loaded!.undeterminedRepos).toEqual(["student/hw7"]);
    expect(loaded!.noSubmissionRepos).not.toContain("student/hw7");
    expect(loaded!.undeterminedRepos).not.toContain("student/hw9");
    expect(loaded!.run.results[0].student).toBe("Jane Doe");
    // R2.4: bytes never make the round trip.
    expect(loaded!.run.results[0].submittedFiles).toEqual([]);
  });

  it("does nothing when persisting with window undefined (SSR-safe write)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() =>
      persistGithubGradingRun({
        run: fixtureRun(),
        gradedAt: "2026-08-24T12:00:00.000Z",
        lastGradedFolder: "",
        truncatedRepos: [],
        noSubmissionRepos: [],
        undeterminedRepos: [],
      })
    ).not.toThrow();
    expect(fakeStorage.getItem("ta-github-grading-run")).toBeNull();
  });

  it("does not throw, and does not persist, when localStorage refuses the write (quota exceeded)", () => {
    fakeStorage.throwOnSet = true;
    expect(() =>
      persistGithubGradingRun({
        run: fixtureRun(),
        gradedAt: "2026-08-24T12:00:00.000Z",
        lastGradedFolder: "",
        truncatedRepos: [],
        noSubmissionRepos: [],
        undeterminedRepos: [],
      })
    ).not.toThrow();
    fakeStorage.throwOnSet = false;
    // The failed write must not have left a partial/corrupt value behind either.
    expect(loadStoredGithubGradingRun()).toBeNull();
  });

  it("a quota failure loses persistence for only that run - a later successful write still works", () => {
    fakeStorage.throwOnSet = true;
    persistGithubGradingRun({
      run: fixtureRun(),
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "",
      truncatedRepos: [],
      noSubmissionRepos: [],
      undeterminedRepos: [],
    });
    fakeStorage.throwOnSet = false;
    persistGithubGradingRun({
      run: fixtureRun(),
      gradedAt: "2026-08-24T13:00:00.000Z",
      lastGradedFolder: "week-2",
      truncatedRepos: [],
      noSubmissionRepos: [],
      undeterminedRepos: [],
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

describe("describeGithubGradingNoSubmission - FIX 2 (entry 370), ported to gradeReposAction", () => {
  it("returns null when nothing was found to be empty (no permanent all-clear line)", () => {
    expect(describeGithubGradingNoSubmission([])).toBeNull();
  });

  it("names every no-submission repo and uses plural wording for more than one", () => {
    const notice = describeGithubGradingNoSubmission(["student/hw1", "student/hw2"]);
    expect(notice).not.toBeNull();
    expect(notice).toContain("student/hw1");
    expect(notice).toContain("student/hw2");
    expect(notice).toContain("2 repos");
    expect(notice).toContain("they were");
  });

  it("uses singular wording for exactly one no-submission repo", () => {
    const notice = describeGithubGradingNoSubmission(["student/hw1"]);
    expect(notice).not.toBeNull();
    expect(notice).toContain("1 repo,");
    expect(notice).not.toContain("1 repos");
    expect(notice).toContain("it was");
  });

  it("filters out blank/whitespace-only repo names rather than listing them", () => {
    const notice = describeGithubGradingNoSubmission(["  ", "", "student/hw1"]);
    expect(notice).not.toBeNull();
    expect(notice).toContain("1 repo,");
    expect(notice).toContain("student/hw1");
  });

  // G1a: the no-submission fact must never be encoded into a score string
  // that a numeric-extraction parser could misread. This notice is a
  // completely separate value from any GradeResult's totalScore - proven
  // here by construction (the function's only input is the repo-name list,
  // never a score), not by a substring check on the message text.
  it("never mentions a score - the fact lives in its own field, not a parseable sentence", () => {
    const notice = describeGithubGradingNoSubmission(["student/hw1"]);
    expect(notice).not.toBeNull();
    expect(notice).not.toMatch(/\d+\s*\/\s*\d+/);
  });
});

describe("describeGithubGradingUndetermined - files found but unreadable, distinct from no-submission", () => {
  it("returns null when nothing was undetermined (no permanent all-clear line)", () => {
    expect(describeGithubGradingUndetermined([])).toBeNull();
  });

  it("names every undetermined repo and uses plural wording for more than one", () => {
    const notice = describeGithubGradingUndetermined(["student/hw1", "student/hw2"]);
    expect(notice).not.toBeNull();
    expect(notice).toContain("student/hw1");
    expect(notice).toContain("student/hw2");
    expect(notice).toContain("2 repos");
    expect(notice).toContain("they were");
  });

  it("uses singular wording for exactly one undetermined repo", () => {
    const notice = describeGithubGradingUndetermined(["student/hw1"]);
    expect(notice).not.toBeNull();
    expect(notice).toContain("1 repo,");
    expect(notice).not.toContain("1 repos");
    expect(notice).toContain("it was");
  });

  it("filters out blank/whitespace-only repo names rather than listing them", () => {
    const notice = describeGithubGradingUndetermined(["  ", "", "student/hw1"]);
    expect(notice).not.toBeNull();
    expect(notice).toContain("1 repo,");
    expect(notice).toContain("student/hw1");
  });

  // The whole reason this notice exists separately from
  // describeGithubGradingNoSubmission: it must never claim the student
  // submitted nothing. Pinned here so a future edit cannot accidentally
  // collapse the two messages back into one.
  it("never says the student did not submit - it says files were found but unreadable", () => {
    const notice = describeGithubGradingUndetermined(["student/hw1"]);
    expect(notice).not.toBeNull();
    expect(notice).not.toMatch(/no submission/i);
    expect(notice).not.toMatch(/not submit/i);
    expect(notice).toMatch(/files were found/i);
  });

  it("never mentions a score - the fact lives in its own field, not a parseable sentence", () => {
    const notice = describeGithubGradingUndetermined(["student/hw1"]);
    expect(notice).not.toBeNull();
    expect(notice).not.toMatch(/\d+\s*\/\s*\d+/);
  });
});
