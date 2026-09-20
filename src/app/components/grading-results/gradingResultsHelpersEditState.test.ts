// Oracle for the row-edit-state slice of the pure extraction in
// gradingResultsHelpers.ts - split out of gradingResultsHelpers.test.ts
// (which was approaching the project's 1000-line-per-file cap,
// docs/DEV_LOOP.md) into its own cohesive file: the FEEDBACK_FIELD_META
// shape, the RowEdit builders/mergers, and the localStorage-backed
// persistence that stores and restores a RowEdit map. This is a pure move -
// no assertion here was changed, weakened, or retyped; see
// gradingResultsHelpers.test.ts's own header comment for the frozen-literal
// discipline these tests (and their siblings left behind) follow.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FEEDBACK_FIELDS,
  FEEDBACK_FIELD_META,
  applyFeedbackFieldEdit,
  blankRowEdit,
  defaultRowEdit,
  gradingResultsEditsKey,
  loadGradingResultsEdits,
  loadPersistedEdits,
  mergeStoredRowEdit,
  persistGradingResultsEdits,
  seedEdits,
  type GradingRun,
  type RowEdit,
} from "./gradingResultsHelpers";

// ── A2/A3 additions (docs/grading-results-feedback-boxes-acceptance-criteria.md) ──

describe("FEEDBACK_FIELD_META", () => {
  it("never invents fallback copy text for resubmitNotice (an empty box there is the honest, full-credit state)", () => {
    expect(FEEDBACK_FIELD_META.resubmitNotice.emptyCopyFallback).toBe("");
  });

  it("has an entry for every field in FEEDBACK_FIELDS, and vice versa", () => {
    expect(Object.keys(FEEDBACK_FIELD_META).sort()).toEqual([...FEEDBACK_FIELDS].sort());
  });
});

describe("blankRowEdit", () => {
  it("returns an all-empty RowEdit", () => {
    expect(blankRowEdit()).toEqual({
      total: "",
      overall: "",
      strengths: "",
      improvements: "",
      resubmitNotice: "",
      areas: {},
    });
  });
});

describe("defaultRowEdit", () => {
  it("seeds total/overall/strengths/improvements/resubmitNotice from the result, with empty areas", () => {
    const result = {
      totalScore: "9/10",
      overallComment: "Nice work. Fix the edge case.",
      strengths: "Nice work.",
      improvements: "Fix the edge case.",
      resubmitNotice: "",
    } as unknown as Parameters<typeof defaultRowEdit>[0];

    expect(defaultRowEdit(result)).toEqual({
      total: "9/10",
      overall: "Nice work. Fix the edge case.",
      strengths: "Nice work.",
      improvements: "Fix the edge case.",
      resubmitNotice: "",
      areas: {},
    });
  });
});

describe("applyFeedbackFieldEdit", () => {
  const baseRow: RowEdit = {
    total: "8/10",
    overall: "Old composed text",
    strengths: "Good structure.",
    improvements: "Add tests.",
    resubmitNotice: "You are welcome to resubmit this assignment, and I will regrade it with no late penalty.",
    areas: {},
  };

  it("patches the given field and leaves the others untouched", () => {
    const next = applyFeedbackFieldEdit(baseRow, "improvements", "Add more tests.");
    expect(next.improvements).toBe("Add more tests.");
    expect(next.strengths).toBe(baseRow.strengths);
    expect(next.resubmitNotice).toBe(baseRow.resubmitNotice);
    expect(next.total).toBe(baseRow.total);
  });

  it("recomputes `overall` as composeOverallComment's output, in strengths/improvements/resubmitNotice order", () => {
    const next = applyFeedbackFieldEdit(baseRow, "strengths", "Great structure.");
    expect(next.overall).toBe(
      "Great structure. Add tests. You are welcome to resubmit this assignment, and I will regrade it with no late penalty."
    );
  });

  it("drops the notice from `overall` when resubmitNotice is edited to empty (full credit)", () => {
    const next = applyFeedbackFieldEdit(baseRow, "resubmitNotice", "");
    expect(next.overall).toBe("Good structure. Add tests.");
  });

  it("never leaves `overall` inconsistent with the three parts it composes", () => {
    let row = baseRow;
    for (const field of FEEDBACK_FIELDS) {
      row = applyFeedbackFieldEdit(row, field, `edited ${field}`);
      expect(row.overall).toBe([row.strengths, row.improvements, row.resubmitNotice].join(" "));
    }
  });
});

describe("gradingResultsEditsKey", () => {
  it("scopes the key to the assignment's canvasUrl", () => {
    expect(gradingResultsEditsKey("https://canvas.example.edu/courses/1/assignments/2")).toBe(
      "ta-grading-results-edits:https://canvas.example.edu/courses/1/assignments/2"
    );
  });

  it("produces different keys for different assignments (the leak this key exists to prevent)", () => {
    const keyA = gradingResultsEditsKey("https://canvas.example.edu/courses/1/assignments/2");
    const keyB = gradingResultsEditsKey("https://canvas.example.edu/courses/9/assignments/9");
    expect(keyA).not.toBe(keyB);
  });
});

describe("mergeStoredRowEdit", () => {
  const fallback: RowEdit = {
    total: "10/10",
    overall: "Seeded overall",
    strengths: "Seeded strengths",
    improvements: "Seeded improvements",
    resubmitNotice: "Seeded notice",
    areas: { "Code Quality": { score: "10/10" } },
  };

  it("takes each valid stored field over the fallback, and recomputes overall from the restored parts", () => {
    const stored = {
      total: "8/10",
      strengths: "Stored strengths",
      improvements: "Stored improvements",
      resubmitNotice: "",
      areas: { "Code Quality": { score: "8/10" } },
    };
    expect(mergeStoredRowEdit(stored, fallback)).toEqual({
      total: "8/10",
      overall: "Stored strengths Stored improvements",
      strengths: "Stored strengths",
      improvements: "Stored improvements",
      resubmitNotice: "",
      areas: { "Code Quality": { score: "8/10" } },
    });
  });

  it("falls back field-by-field when a stored field is missing or the wrong type", () => {
    const stored = { strengths: "Stored strengths", improvements: 42, areas: "not an object" };
    const merged = mergeStoredRowEdit(stored, fallback);
    expect(merged.total).toBe(fallback.total); // missing -> fallback
    expect(merged.strengths).toBe("Stored strengths"); // valid -> stored
    expect(merged.improvements).toBe(fallback.improvements); // wrong type -> fallback
    expect(merged.areas).toEqual(fallback.areas); // wrong type -> fallback
  });

  it("never trusts a stored `overall` - always recomputes it from the restored three parts", () => {
    const stored = {
      overall: "a stale or hand-edited value that does not match the parts below",
      strengths: "S",
      improvements: "I",
      resubmitNotice: "",
    };
    expect(mergeStoredRowEdit(stored, fallback).overall).toBe("S I");
  });

  it("degrades entirely to the fallback's own fields for null, a primitive, or an array - " +
    "but STILL recomputes overall rather than trusting fallback.overall verbatim " +
    "(fallback.overall is deliberately mismatched from its own three parts above, to prove this)", () => {
    const expectedFromFallback = {
      ...fallback,
      overall: "Seeded strengths Seeded improvements Seeded notice",
    };
    expect(mergeStoredRowEdit(null, fallback)).toEqual(expectedFromFallback);
    expect(mergeStoredRowEdit("not an object", fallback)).toEqual(expectedFromFallback);
    expect(mergeStoredRowEdit([1, 2, 3], fallback)).toEqual(expectedFromFallback);
  });
});

describe("loadPersistedEdits", () => {
  const run: GradingRun = {
    results: [
      {
        student: "Alice Smith",
        totalScore: "18/20",
        overallComment: "Great job overall.",
        strengths: "Great job.",
        improvements: "",
        resubmitNotice: "",
        rubricAreas: [{ area: "Code Quality", score: "9/10" }],
      },
    ],
  } as unknown as GradingRun;

  it("returns the seeded map when raw is null", () => {
    expect(loadPersistedEdits(null, run)).toEqual(seedEdits(run));
  });

  it("returns the seeded map when raw is malformed JSON", () => {
    expect(loadPersistedEdits("{not json", run)).toEqual(seedEdits(run));
  });

  it("returns the seeded map when the parsed top level is an array", () => {
    expect(loadPersistedEdits("[1,2,3]", run)).toEqual(seedEdits(run));
  });

  it("merges a valid stored row onto the seeded row for a student in the current run", () => {
    const raw = JSON.stringify({
      "Alice Smith": { total: "20/20", strengths: "Excellent.", improvements: "", resubmitNotice: "" },
    });
    const result = loadPersistedEdits(raw, run);
    expect(result["Alice Smith"].total).toBe("20/20");
    expect(result["Alice Smith"].strengths).toBe("Excellent.");
  });

  it("drops a student who is not in the current run rather than resurrecting a phantom row", () => {
    const raw = JSON.stringify({
      "Alice Smith": { total: "20/20", strengths: "", improvements: "", resubmitNotice: "" },
      "Ghost Student": { total: "0/20", strengths: "should never appear", improvements: "", resubmitNotice: "" },
    });
    const result = loadPersistedEdits(raw, run);
    expect(Object.keys(result)).toEqual(["Alice Smith"]);
  });
});

describe("localStorage-backed persistence (loadGradingResultsEdits / persistGradingResultsEdits)", () => {
  // Same in-memory Storage stub as src/app/components/repo-grades/repoGradesUiState.test.ts:
  // vitest.config.ts runs with environment: "node", so there is no window/
  // localStorage global by default.
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
  }

  let fakeStorage: FakeStorage;
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

  const run: GradingRun = {
    results: [
      {
        student: "Alice Smith",
        totalScore: "18/20",
        overallComment: "Great job overall.",
        strengths: "Great job.",
        improvements: "",
        resubmitNotice: "",
        rubricAreas: [],
      },
    ],
  } as unknown as GradingRun;

  beforeEach(() => {
    fakeStorage = new FakeStorage();
    (globalThis as { window?: unknown }).window = globalThis;
    (globalThis as { localStorage?: unknown }).localStorage = fakeStorage;
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
    (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
  });

  it("returns the seeded map when window is undefined (SSR)", () => {
    (globalThis as { window?: unknown }).window = undefined;
    expect(loadGradingResultsEdits("https://canvas.example.edu/a/1", run)).toEqual(seedEdits(run));
  });

  it("round-trips a persisted edit under the assignment-scoped key", () => {
    const canvasUrl = "https://canvas.example.edu/courses/1/assignments/2";
    const seeded = seedEdits(run);
    const edited = applyFeedbackFieldEdit(seeded["Alice Smith"], "strengths", "Outstanding work.");
    persistGradingResultsEdits(canvasUrl, { ...seeded, "Alice Smith": edited });

    expect(fakeStorage.getItem(gradingResultsEditsKey(canvasUrl))).not.toBeNull();
    const restored = loadGradingResultsEdits(canvasUrl, run);
    expect(restored["Alice Smith"].strengths).toBe("Outstanding work.");
  });

  it("keeps a different canvasUrl's persisted edits untouched (the leak A3 item 12 guards against)", () => {
    const urlA = "https://canvas.example.edu/courses/1/assignments/2";
    const urlB = "https://canvas.example.edu/courses/9/assignments/9";
    const seeded = seedEdits(run);
    const edited = applyFeedbackFieldEdit(seeded["Alice Smith"], "strengths", "Only for assignment A.");
    persistGradingResultsEdits(urlA, { ...seeded, "Alice Smith": edited });

    const restoredB = loadGradingResultsEdits(urlB, run);
    expect(restoredB["Alice Smith"].strengths).toBe("Great job."); // seeded, not leaked from A
  });

  it("swallows a write failure (quota, private browsing) instead of throwing", () => {
    fakeStorage.throwOnSet = true;
    expect(() => persistGradingResultsEdits("https://canvas.example.edu/a/1", seedEdits(run))).not.toThrow();
  });
});
