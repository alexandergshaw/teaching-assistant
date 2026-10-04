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
import { disambiguateCanvasEntries } from "../../../lib/grade/extraction";

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
    // A36: the surface argument is deliberately inert when canvasUrl is
    // non-empty - a real assignment already discriminates, so the key stays
    // byte-identical to what it was before A36 and nothing stored under it is
    // stranded. Passing either surface here must give the same string.
    expect(gradingResultsEditsKey("https://canvas.example.edu/courses/1/assignments/2", "canvas")).toBe(
      "ta-grading-results-edits:https://canvas.example.edu/courses/1/assignments/2"
    );
    expect(gradingResultsEditsKey("https://canvas.example.edu/courses/1/assignments/2", "github")).toBe(
      "ta-grading-results-edits:https://canvas.example.edu/courses/1/assignments/2"
    );
  });

  it("produces different keys for different assignments (the leak this key exists to prevent)", () => {
    const keyA = gradingResultsEditsKey("https://canvas.example.edu/courses/1/assignments/2", "canvas");
    const keyB = gradingResultsEditsKey("https://canvas.example.edu/courses/9/assignments/9", "canvas");
    expect(keyA).not.toBe(keyB);
  });

  // A36: the zip/Live Feed path (GradingTab.tsx, LiveFeedPanel.tsx - both
  // pass GradingTab's own canvasUrl state, which is "" until a Canvas URL is
  // typed) and the GitHub panel (GithubGradingPanel.tsx, which always passes
  // the literal "") both call this with an empty canvasUrl. Without a real
  // discriminator both produced the exact same key, so a stored edit from
  // one surface was returned to the other for any student with a matching
  // name. `surface` is that discriminator.
  it("A36: produces different keys for different surfaces when canvasUrl is empty", () => {
    const zipKey = gradingResultsEditsKey("", "canvas");
    const githubKey = gradingResultsEditsKey("", "github");
    expect(zipKey).not.toBe(githubKey);
  });

  it("A36: leaves the key unchanged for a real (non-empty) canvasUrl regardless of surface - " +
    "already-stored edits under the pre-A36 key must not be stranded", () => {
    const url = "https://canvas.example.edu/courses/1/assignments/2";
    expect(gradingResultsEditsKey(url, "canvas")).toBe(`ta-grading-results-edits:${url}`);
    expect(gradingResultsEditsKey(url, "github")).toBe(`ta-grading-results-edits:${url}`);
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

  // A44 / RULING 93 (docs/a44-test-notes.md R7', P1'/P3'/P4): the instructor's
  // edit is filed under the DISPLAY, and the old-label recovery is DELETED -
  // which needs zero production code, because this loader already drops a
  // stored key absent from the current run (the test above, generically).
  // These two tests tie that same mechanism to A44's actual transition: a
  // display that folded from a bare stem into a folder-disambiguated path.
  describe("A44 RULING 93 - display-keyed storage, no legacy-key recovery", () => {
    const foldedRun: GradingRun = {
      results: [
        {
          student: "AlvarezMaria/essay",
          totalScore: "18/20",
          overallComment: "",
          strengths: "",
          improvements: "",
          resubmitNotice: "",
          rubricAreas: [],
        },
        {
          student: "BrownTom/essay",
          totalScore: "15/20",
          overallComment: "",
          strengths: "",
          improvements: "",
          resubmitNotice: "",
          rubricAreas: [],
        },
      ],
    } as unknown as GradingRun;

    it("P1': an edit stored under a display the current run still has survives, and a same-run sibling's own edit is untouched", () => {
      const raw = JSON.stringify({
        "AlvarezMaria/essay": { total: "19/20", strengths: "Nice work.", improvements: "", resubmitNotice: "" },
        "BrownTom/essay": { total: "16/20", strengths: "Also nice.", improvements: "", resubmitNotice: "" },
      });
      const result = loadPersistedEdits(raw, foldedRun);
      expect(result["AlvarezMaria/essay"].total).toBe("19/20");
      expect(result["BrownTom/essay"].total).toBe("16/20");
      expect(result["BrownTom/essay"].strengths).not.toBe("Nice work.");
    });

    it("P3': an edit stored under the pre-A44 bare-stem key ('essay') is dropped, not resurrected onto either folder-disambiguated row - the accepted one-time loss RULING 93 accounts for", () => {
      const raw = JSON.stringify({
        essay: { total: "20/20", strengths: "Old edit under the collapsed pre-fix key.", improvements: "", resubmitNotice: "" },
      });
      const result = loadPersistedEdits(raw, foldedRun);
      expect(Object.keys(result).sort()).toEqual(["AlvarezMaria/essay", "BrownTom/essay"]);
      expect(result["AlvarezMaria/essay"].strengths).not.toBe("Old edit under the collapsed pre-fix key.");
      expect(result["BrownTom/essay"].strengths).not.toBe("Old edit under the collapsed pre-fix key.");
    });

    it("P4: the seeded map has exactly one slot per result, unaffected by folder-disambiguated displays", () => {
      expect(Object.keys(seedEdits(foldedRun)).length).toBe(foldedRun.results.length);
    });
  });

  // RULING 129 (docs/ruling-129.md, docs/a46-canvas-collision-scope.md): P4
  // above is the nearest existing one-slot-per-result assertion, and it
  // cannot ever fail on the Canvas collision - its fixture's two results
  // ("AlvarezMaria/essay", "BrownTom/essay") already have distinct displays.
  // This is that same assertion given a fixture that CAN break it: two
  // results sharing one display, exactly what two same-named Canvas
  // enrolments produce before disambiguateCanvasEntries runs
  // (extraction.ts). `seedEdits` itself is unchanged (RULING 129 does not
  // re-key it) - the fix runs one layer upstream, at Canvas entry-build time,
  // so results that share a display should never reach seedEdits in the
  // first place once the three canvasWorkToEntry call sites are wired to
  // disambiguateCanvasEntries.
  describe("RULING 129 - the Canvas display collision seedEdits could not previously distinguish", () => {
    it("without disambiguation, two Canvas-derived results sharing a display collapse to ONE seedEdits slot - the defect this ruling fixes, characterized directly against seedEdits (which this ruling does NOT change)", () => {
      const collidedRun: GradingRun = {
        results: [
          {
            student: "Smith, John",
            userId: 101,
            totalScore: "18/20",
            overallComment: "",
            strengths: "",
            improvements: "",
            resubmitNotice: "",
            rubricAreas: [],
          },
          {
            student: "Smith, John",
            userId: 102,
            totalScore: "12/20",
            overallComment: "",
            strengths: "",
            improvements: "",
            resubmitNotice: "",
            rubricAreas: [],
          },
        ],
      } as unknown as GradingRun;

      // RED: this is what today's (pre-fix) Canvas path produces once two
      // same-named submissions reach the results/review layer - ONE slot,
      // not two. `seedEdits` has no way to tell these two results apart,
      // because it keys on the bare display alone.
      expect(Object.keys(seedEdits(collidedRun)).length).toBe(1);
      expect(Object.keys(seedEdits(collidedRun)).length).not.toBe(collidedRun.results.length);
    });

    it("GREEN: run through the real fix (disambiguateCanvasEntries) before the results/review layer, the same two same-userId-bearing rows get exactly one seedEdits slot EACH", () => {
      const disambiguated = disambiguateCanvasEntries([
        {
          student: "Smith, John",
          content: "essay A",
          mergedFileCount: 1,
          submittedFiles: [],
          userId: 101,
        },
        {
          student: "Smith, John",
          content: "essay B",
          mergedFileCount: 1,
          submittedFiles: [],
          userId: 102,
        },
      ]);

      const run: GradingRun = {
        results: disambiguated.map((entry, i) => ({
          student: entry.student,
          userId: entry.userId,
          totalScore: i === 0 ? "18/20" : "12/20",
          overallComment: "",
          strengths: "",
          improvements: "",
          resubmitNotice: "",
          rubricAreas: [],
        })),
      } as unknown as GradingRun;

      const seeded = seedEdits(run);
      // THE ONE-SLOT-PER-RESULT INVARIANT, executing on a fixture that can
      // actually break it (unlike P4's).
      expect(Object.keys(seeded).length).toBe(run.results.length);
      // Each slot carries the RIGHT score - the collapse this ruling closes
      // was never "a row goes missing", it was "a row gets the OTHER row's
      // score" (docs/ruling-129.md).
      expect(seeded["Smith, John"].total).toBe("18/20");
      expect(seeded["Smith, John (2)"].total).toBe("12/20");
    });
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
    expect(loadGradingResultsEdits("https://canvas.example.edu/a/1", run, "canvas")).toEqual(seedEdits(run));
  });

  it("round-trips a persisted edit under the assignment-scoped key", () => {
    const canvasUrl = "https://canvas.example.edu/courses/1/assignments/2";
    const seeded = seedEdits(run);
    const edited = applyFeedbackFieldEdit(seeded["Alice Smith"], "strengths", "Outstanding work.");
    persistGradingResultsEdits(canvasUrl, { ...seeded, "Alice Smith": edited }, "canvas");

    expect(fakeStorage.getItem(gradingResultsEditsKey(canvasUrl, "canvas"))).not.toBeNull();
    const restored = loadGradingResultsEdits(canvasUrl, run, "canvas");
    expect(restored["Alice Smith"].strengths).toBe("Outstanding work.");
  });

  it("keeps a different canvasUrl's persisted edits untouched (the leak A3 item 12 guards against)", () => {
    const urlA = "https://canvas.example.edu/courses/1/assignments/2";
    const urlB = "https://canvas.example.edu/courses/9/assignments/9";
    const seeded = seedEdits(run);
    const edited = applyFeedbackFieldEdit(seeded["Alice Smith"], "strengths", "Only for assignment A.");
    persistGradingResultsEdits(urlA, { ...seeded, "Alice Smith": edited }, "canvas");

    const restoredB = loadGradingResultsEdits(urlB, run, "canvas");
    expect(restoredB["Alice Smith"].strengths).toBe("Great job."); // seeded, not leaked from A
  });

  it("swallows a write failure (quota, private browsing) instead of throwing", () => {
    fakeStorage.throwOnSet = true;
    expect(() => persistGradingResultsEdits("https://canvas.example.edu/a/1", seedEdits(run), "canvas")).not.toThrow();
  });

  // A36 (the row this fix ships): before the surface discriminator existed,
  // the zip/Live Feed path and the GitHub panel both persisted under the
  // exact same key whenever canvasUrl was empty ("" until a Canvas URL is
  // typed on the zip path; always "" on the GitHub path). RED (pre-fix):
  // an edit stored by the "github" surface was returned to the "canvas"
  // surface for a same-named student, and vice versa.
  it("A36: an edit stored by one surface is NOT returned to a different surface for a same-named student, when canvasUrl is empty on both", () => {
    const seeded = seedEdits(run);
    const editedOnGithub = applyFeedbackFieldEdit(seeded["Alice Smith"], "strengths", "Stored from the GitHub panel.");
    persistGradingResultsEdits("", { ...seeded, "Alice Smith": editedOnGithub }, "github");

    const restoredOnCanvasSurface = loadGradingResultsEdits("", run, "canvas");
    expect(restoredOnCanvasSurface["Alice Smith"].strengths).toBe("Great job."); // seeded, not leaked from GitHub
  });

  it("A36: the reverse direction also does not leak (canvas surface's edit does not reach the github surface)", () => {
    const seeded = seedEdits(run);
    const editedOnCanvas = applyFeedbackFieldEdit(seeded["Alice Smith"], "strengths", "Stored from the zip path.");
    persistGradingResultsEdits("", { ...seeded, "Alice Smith": editedOnCanvas }, "canvas");

    const restoredOnGithubSurface = loadGradingResultsEdits("", run, "github");
    expect(restoredOnGithubSurface["Alice Smith"].strengths).toBe("Great job."); // seeded, not leaked from the zip path
  });

  it("A36: an edit stored under the pre-fix shared empty-string key is still readable as a fallback (not stranded) by whichever surface reads first", () => {
    const seeded = seedEdits(run);
    const legacyEdited = applyFeedbackFieldEdit(seeded["Alice Smith"], "strengths", "Stored before the A36 fix shipped.");
    // Simulates data written by the OLD code (pre-surface-discriminator),
    // i.e. directly under the bare key, bypassing gradingResultsEditsKey.
    fakeStorage.setItem("ta-grading-results-edits:", JSON.stringify({ ...seeded, "Alice Smith": legacyEdited }));

    const restored = loadGradingResultsEdits("", run, "canvas");
    expect(restored["Alice Smith"].strengths).toBe("Stored before the A36 fix shipped.");
  });
});

describe("gradingResultsEditsKey - W2 WK-5c: session-scoped key for non-legacy surfaces", () => {
  const URL = "https://canvas.example.edu/courses/1/assignments/2";

  it("WK5c-1: two sessions on the SAME non-empty canvasUrl get DIFFERENT keys", () => {
    expect(gradingResultsEditsKey(URL, "grading-chat-0")).not.toBe(gradingResultsEditsKey(URL, "grading-chat-1"));
  });

  it("WK5c-3: a chat session key is distinct from the bare shared assignment key", () => {
    expect(gradingResultsEditsKey(URL, "grading-chat-0")).not.toBe(`ta-grading-results-edits:${URL}`);
  });

  it("WK5c-2: the key is deterministic within a session", () => {
    expect(gradingResultsEditsKey(URL, "grading-chat-0")).toBe(gradingResultsEditsKey(URL, "grading-chat-0"));
  });

  it("WK5c-5 (protective): empty-url text/file rows stay session-scoped", () => {
    expect(gradingResultsEditsKey("", "grading-chat-0")).not.toBe(gradingResultsEditsKey("", "grading-chat-1"));
  });
});
