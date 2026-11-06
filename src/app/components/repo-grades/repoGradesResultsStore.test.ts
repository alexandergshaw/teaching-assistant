// RG-PERSIST-RESULTS (W5): the persist/restore mapper leaf. Oracles come from
// docs/repo-grades-persist-results-test-notes.md (FR-1..FR-7, M3 pure half).
import { describe, it, expect, vi } from "vitest";
import {
  RELOAD_INTERRUPTED_POST_MESSAGE,
  RESULTS_PERSIST_ERROR,
  clearRepoGradeCellsIn,
  describeRestoredRepoGradeCells,
  loadRepoGradeCellsFrom,
  readRepoGradeCellsFrom,
  parseStoredCells,
  persistRepoGradeCellsTo,
  restoreRepoGradeCells,
  toPersisted,
  type RepoGradeCellsStorage,
} from "./repoGradesResultsStore";
import {
  applyRepoGradeCompletion,
  defaultRepoGradeCellEdit,
  getRepoGradeCellEdit,
  LEGACY_REPO_GRADE_RESULT_ID,
  projectRepoGradeFeedbackDraft,
  snapshotRetainedRepoGradeSource,
  type RepoGradeCellEdit,
  type RepoGradeCellEditsByRepo,
} from "./repoGradesCellEdits";
import { buildRepoGradePostPlan, type RepoGradePostCandidateRow } from "./repoGradesPosting";

const KEY = "test-cells-key";

const FROZEN_PERSISTED_CELL_KEYS = [
  "at",
  "comment",
  "generatedComment",
  "generatedScore",
  "improvements",
  "mergeFoundOnBranch",
  "mergeStatus",
  "postMessage",
  "postStatus",
  "resubmitNotice",
  "rubricAreas",
  "score",
  "strengths",
  "submissionTruncated",
];

function fullEdit(): RepoGradeCellEdit {
  return {
    score: "18/20",
    comment: "Strengths: clear.\n\nImprovements: tests.",
    strengths: "clear",
    improvements: "tests",
    resubmitNotice: "",
    grading: true,
    gradeError: "ZZMK_GRADEERR",
    postStatus: "posted",
    postMessage: null,
    rubricAreas: [{ area: "Correctness", score: "9/10", comment: "good" }],
    generatedScore: "18/20",
    generatedComment: "Strengths: clear.\n\nImprovements: tests.",
    submittedFiles: [
      { name: "main.py", extension: "py", previewContent: "ZZMK_PREVIEW", previewTruncated: false, mimeType: "text/x-python" },
    ],
    submissionTruncated: true,
    mergeStatus: "not-merged",
    mergeFoundOnBranch: "feature-x",
    codeExecution: {
      language: "python",
      files: ["main.py"],
      ran: true,
      exitCode: 0,
      stdout: "ZZMK_STDOUT",
      stderr: "ZZMK_STDERR",
      compileOutput: "ZZMK_COMPILE",
    },
  };
}

function fakeStorage(initial: Record<string, string> = {}): RepoGradeCellsStorage & { data: Record<string, string>; writes: number; removes: number } {
  const state = { data: { ...initial }, writes: 0, removes: 0 };
  return {
    get data() {
      return state.data;
    },
    get writes() {
      return state.writes;
    },
    get removes() {
      return state.removes;
    },
    getItem: (k: string) => (k in state.data ? state.data[k] : null),
    setItem: (k: string, v: string) => {
      state.writes += 1;
      state.data[k] = v;
    },
    removeItem: (k: string) => {
      state.removes += 1;
      delete state.data[k];
    },
  };
}

function quotaError(): Error {
  const e = new Error("quota");
  e.name = "QuotaExceededError";
  return e;
}

function editsOf(entries: Array<[string, string, Partial<RepoGradeCellEdit>]>): RepoGradeCellEditsByRepo {
  const out: Record<string, Record<string, RepoGradeCellEdit>> = {};
  for (const [repo, folder, patch] of entries) {
    out[repo] = { ...(out[repo] ?? {}), [folder]: { ...defaultRepoGradeCellEdit(), ...patch } };
  }
  return out;
}

describe("FR-1: the persisted cell is exactly the frozen 14 keys", () => {
  it("enumerates exactly at + 13 kept fields", () => {
    expect(Object.keys(toPersisted(fullEdit(), "2026-10-04T00:00:00.000Z")).sort()).toEqual(FROZEN_PERSISTED_CELL_KEYS);
  });
});

describe("FR-2: forbidden fields are never serialized", () => {
  it("no sentinel from a dropped field reaches the blob, and no forbidden property name exists", () => {
    const persisted = toPersisted(fullEdit(), "2026-10-04T00:00:00.000Z");
    const json = JSON.stringify(persisted);
    for (const sentinel of ["ZZMK_GRADEERR", "ZZMK_PREVIEW", "ZZMK_STDOUT", "ZZMK_STDERR", "ZZMK_COMPILE"]) {
      expect(json).not.toContain(sentinel);
    }
    const keys = Object.keys(JSON.parse(json) as Record<string, unknown>).sort();
    expect(keys).toEqual(FROZEN_PERSISTED_CELL_KEYS);
    for (const forbidden of ["grading", "gradeError", "submittedFiles", "codeExecution"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("a stored blob written end to end carries no sentinel either", () => {
    const storage = fakeStorage();
    persistRepoGradeCellsTo(storage, KEY, "c1", editsOf([["org/r", "w1", fullEdit()]]), "2026-10-04T00:00:00.000Z");
    expect(storage.data[KEY]).toBeDefined();
    expect(storage.data[KEY]).not.toContain("ZZMK_");
  });
});

describe("FR-3: posting narrows to error, and only posting", () => {
  it("maps an in-flight post to error with the frozen message", () => {
    const p = toPersisted({ ...fullEdit(), postStatus: "posting", postMessage: null }, "t");
    expect(p.postStatus).toBe("error");
    expect(p.postMessage).toBe("A reload interrupted this post. Check the Canvas gradebook before re-posting.");
    expect(RELOAD_INTERRUPTED_POST_MESSAGE).toBe(p.postMessage);
  });

  it("leaves every other status and its message unchanged", () => {
    for (const status of ["idle", "posted", "error", "skipped"] as const) {
      const p = toPersisted({ ...fullEdit(), postStatus: status, postMessage: `msg-${status}` }, "t");
      expect(p.postStatus).toBe(status);
      expect(p.postMessage).toBe(`msg-${status}`);
    }
  });
});

describe("FR-4: the real post planner agrees before and after a reload", () => {
  function candidate(edit: RepoGradeCellEdit): RepoGradePostCandidateRow {
    return {
      repo: "org/r",
      bindingState: "confirmed",
      canvasUserId: "42",
      folderPresent: true,
      score: edit.score,
      comment: edit.comment,
      rubricAreas: edit.rubricAreas,
      generatedScore: edit.generatedScore,
      generatedComment: edit.generatedComment,
    };
  }

  function roundTrip(edit: RepoGradeCellEdit): RepoGradeCellEdit {
    const storage = fakeStorage();
    persistRepoGradeCellsTo(storage, KEY, "c1", editsOf([["org/r", "w1", edit]]), "2026-10-04T00:00:00.000Z");
    return getRepoGradeCellEdit(loadRepoGradeCellsFrom(storage, KEY, "c1"), "org/r", "w1");
  }

  it("produces an identical plan for an AI-graded cell", () => {
    const edit: RepoGradeCellEdit = { ...fullEdit(), postStatus: "idle", score: "85", generatedScore: "85" };
    const before = buildRepoGradePostPlan([candidate(edit)], "701", 100);
    const after = buildRepoGradePostPlan([candidate(roundTrip(edit))], "701", 100);
    expect(after).toEqual(before);
    expect(before.postable.length).toBe(1);
    expect(before.postable[0].grade.rubricAreas).toBeDefined();
  });

  it("produces an identical plan for a hand-edited score (breakdown suppressed on both sides)", () => {
    const edit: RepoGradeCellEdit = { ...fullEdit(), postStatus: "idle", score: "70", generatedScore: "85" };
    const before = buildRepoGradePostPlan([candidate(edit)], "701", 100);
    const after = buildRepoGradePostPlan([candidate(roundTrip(edit))], "701", 100);
    expect(after).toEqual(before);
    expect(before.postable[0].grade.rubricAreas).toBeUndefined();
  });
});

describe("FR-5: tolerant, prototype-safe parse", () => {
  function blobWith(cells: Record<string, unknown>): string {
    return JSON.stringify({ c1: { "org/r": cells } });
  }

  it("drops a malformed cell and keeps its valid siblings", () => {
    const good = toPersisted(fullEdit(), "t");
    const raw = blobWith({ good, bad: { ...good, score: 5 }, worse: "nope", badStatus: { ...good, postStatus: "posting" } });
    const parsed = parseStoredCells(raw);
    expect(Object.keys(parsed.c1["org/r"])).toEqual(["good"]);
  });

  it("returns empty for non-JSON and wrong-shape input without throwing", () => {
    for (const raw of [null, "", "{not json", "[]", "42", "null"]) {
      expect(Object.keys(parseStoredCells(raw))).toEqual([]);
    }
  });

  it("does not resolve inherited members for constructor / __proto__ names", () => {
    const good = toPersisted(fullEdit(), "t");
    const raw = `{"c1":{"constructor":{"__proto__":${JSON.stringify(good)},"constructor":${JSON.stringify(good)}},"__proto__":{"w":${JSON.stringify(good)}}}}`;
    const restored = restoreRepoGradeCells(parseStoredCells(raw).c1);
    expect(getRepoGradeCellEdit(restored, "org/other", "constructor")).toEqual(defaultRepoGradeCellEdit());
    expect(getRepoGradeCellEdit(restored, "toString", "constructor")).toEqual(defaultRepoGradeCellEdit());
    expect(getRepoGradeCellEdit(restored, "org/other", "__proto__")).toEqual(defaultRepoGradeCellEdit());
    // And the stored names themselves resolve only as OWN members.
    expect(getRepoGradeCellEdit(restored, "constructor", "constructor").score).toBe("18/20");
  });

  it("restores the dropped fields to their defaults", () => {
    const restored = getRepoGradeCellEdit(
      restoreRepoGradeCells(parseStoredCells(blobWith({ w1: toPersisted(fullEdit(), "t") })).c1),
      "org/r",
      "w1"
    );
    expect(restored.grading).toBe(false);
    expect(restored.gradeError).toBeNull();
    expect(restored.submittedFiles).toEqual([]);
    expect(restored.codeExecution).toBeNull();
    expect(restored.score).toBe("18/20");
  });
});

describe("FR-6: storage refusals preserve saved results", () => {
  it("refuses an over-budget replacement for the same course without changing the old value", () => {
    const storage = fakeStorage();
    const big = (tag: string): Partial<RepoGradeCellEdit> => ({ score: tag, comment: tag.repeat(450_000) });
    persistRepoGradeCellsTo(storage, KEY, "c1", editsOf([["org/r", "a", big("A")]]), "2026-01-01T00:00:00.000Z");
    persistRepoGradeCellsTo(storage, KEY, "c1", editsOf([["org/r", "a", big("A")], ["org/r", "b", big("B")]]), "2026-01-02T00:00:00.000Z");
    const prior = storage.data[KEY];
    const writes = storage.writes;
    expect(persistRepoGradeCellsTo(
      storage,
      KEY,
      "c1",
      editsOf([["org/r", "a", big("A")], ["org/r", "b", big("B")], ["org/r", "c", big("C")]]),
      "2026-01-03T00:00:00.000Z"
    )).toMatch(/storage limit/);
    expect(storage.data[KEY]).toBe(prior);
    expect(storage.writes).toBe(writes);
  });

  it("keeps the outcome independent of a failing diagnostics callback", () => {
    const storage = fakeStorage();
    const edits = editsOf([["org/r", "w1", { score: "9" }]]);
    const report = vi.fn();
    report.mockImplementation(() => { throw new Error("Diagnostic logger failed"); });
    expect(persistRepoGradeCellsTo(storage, KEY, "c1", edits, "t", report)).toBeNull();
    expect(loadRepoGradeCellsFrom(storage, KEY, "c1")).toEqual(edits);
    storage.setItem = () => { throw quotaError(); };
    expect(persistRepoGradeCellsTo(storage, KEY, "c1", edits, "t", report)).toBe(RESULTS_PERSIST_ERROR);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it("distinguishes empty, corrupt, and denied restores and keeps unreadable data intact", () => {
    const storage = fakeStorage();
    expect(readRepoGradeCellsFrom(storage, KEY, "c1").result).toMatchObject({ outcome: "success", affectedResultCount: 0 });
    storage.data[KEY] = "private invalid record";
    expect(readRepoGradeCellsFrom(storage, KEY, "c1").result).toMatchObject({
      outcome: "failed", failureCategory: "invalid_stored_data",
    });
    expect(persistRepoGradeCellsTo(storage, KEY, "c1", {}, "t")).toMatch(/invalid/);
    expect(storage.data[KEY]).toBe("private invalid record");
    storage.getItem = () => { throw new DOMException("private message", "SecurityError"); };
    expect(readRepoGradeCellsFrom(storage, KEY, "c1").result).toEqual({
      outcome: "denied", failureCategory: "permission_denied",
    });
  });

  it("round-trips repeated results and a separate draft with exact feedback", () => {
    const storage = fakeStorage();
    const candidate = "Candidate\nhttps://example.test/help";
    const current = editsOf([["org/r", "w1", {
      comment: "Instructor draft",
      draftRevision: 2,
    }]]);
    const completion = { ...fullEdit(), generatedScore: "0/10", generatedComment: candidate, comment: candidate, strengths: candidate };
    const once = applyRepoGradeCompletion(current, "org/r", "w1", 2, completion);
    const twice = applyRepoGradeCompletion(once, "org/r", "w1", 2, completion);
    const cell = twice["org/r"].w1;
    const retainedResults = cell.retainedResults?.map((entry) => entry.id === "local:1"
      ? { ...entry, draft: { ...projectRepoGradeFeedbackDraft(entry.source), comment: "Separate draft\n" } }
      : entry);
    const edits = editsOf([["org/r", "w1", { ...cell, retainedResults }]]);
    expect(persistRepoGradeCellsTo(storage, KEY, "c1", edits, "t")).toBeNull();
    const loaded = loadRepoGradeCellsFrom(storage, KEY, "c1");
    expect(loaded).toEqual(edits);
    const restored = loaded["org/r"].w1.retainedResults;
    expect(restored?.map(({ id }) => id)).toEqual(["local:1", "local:2"]);
    expect(Object.isFrozen(restored?.[0].source.rubricAreas[0])).toBe(true);
    expect(storage.data[KEY]).not.toContain("ZZMK_");
    expect(persistRepoGradeCellsTo(storage, KEY, "c1", loaded, "later", undefined, edits)).toBeNull();
    expect(parseStoredCells(storage.data[KEY]).c1["org/r"].w1.at).toBe("t");
  });

  it("surfaces a fixed, content-free quota error without throwing", () => {
    const storage = fakeStorage();
    storage.setItem = () => {
      throw quotaError();
    };
    const many = editsOf([["org/r", "w1", fullEdit()], ["org/r", "w2", fullEdit()], ["org/r", "w3", fullEdit()], ["org/r", "w4", fullEdit()]]);
    const error = persistRepoGradeCellsTo(storage, KEY, "c1", many, "t");
    expect(error).toBe(RESULTS_PERSIST_ERROR);
    for (const sentinel of ["ZZMK_", "18/20", "clear", "Correctness"]) expect(error).not.toContain(sentinel);
  });

  it("reports an error rather than silently dropping the only cell when the write is refused", () => {
    const storage = fakeStorage();
    storage.setItem = () => {
      throw quotaError();
    };
    expect(persistRepoGradeCellsTo(storage, KEY, "c1", editsOf([["org/r", "w1", fullEdit()]]), "t")).toBe(RESULTS_PERSIST_ERROR);
  });

  it("keeps a cell's stored timestamp when its content is unchanged", () => {
    const storage = fakeStorage();
    const edits = editsOf([["org/r", "w1", { score: "9" }]]);
    persistRepoGradeCellsTo(storage, KEY, "c1", edits, "2026-01-01T00:00:00.000Z");
    persistRepoGradeCellsTo(storage, KEY, "c1", edits, "2026-02-02T00:00:00.000Z");
    expect(parseStoredCells(storage.data[KEY]).c1["org/r"].w1.at).toBe("2026-01-01T00:00:00.000Z");
    persistRepoGradeCellsTo(storage, KEY, "c1", editsOf([["org/r", "w1", { score: "10" }]]), "2026-03-03T00:00:00.000Z");
    expect(parseStoredCells(storage.data[KEY]).c1["org/r"].w1.at).toBe("2026-03-03T00:00:00.000Z");
  });
});

describe("FR-7: the persist error is a fixed literal", () => {
  it("pins the exact copy", () => {
    expect(RESULTS_PERSIST_ERROR).toBe(
      "Saved grading results could not be stored (browser storage is full). Your work is still here for this session but may not survive a reload."
    );
  });
});

describe("legacy retained conflict migration", () => {
  const repo = "org/r";
  const main = toPersisted({ ...defaultRepoGradeCellEdit(), score: "6/10", comment: "Current draft" }, "t");
  const legacy = toPersisted(fullEdit(), "");
  const source = snapshotRetainedRepoGradeSource(legacy);
  const canonical = { id: LEGACY_REPO_GRADE_RESULT_ID, source, draft: { ...projectRepoGradeFeedbackDraft(source), score: "7/10" } };
  const withLegacy = (fields: Record<string, unknown>) => JSON.stringify({
    c1: { [repo]: { w1: { ...main, conflictingGrade: legacy, ...fields } } },
  });

  it("converts the old conflict on read and writes only the reserved canonical entry on a later save", () => {
    const raw = withLegacy({});
    const storage = fakeStorage({ [KEY]: raw });
    const result = readRepoGradeCellsFrom(storage, KEY, "c1");
    expect(result.notice).toBeNull();
    expect(result.edits[repo].w1).toMatchObject({
      score: "6/10", comment: "Current draft",
      retainedResults: [{ id: LEGACY_REPO_GRADE_RESULT_ID, source, draft: null }],
    });
    expect(storage.data[KEY]).toBe(raw);
    expect(storage.writes).toBe(0);
    const after = applyRepoGradeCompletion(result.edits, repo, "w1", 0, fullEdit());
    expect(persistRepoGradeCellsTo(storage, KEY, "c1", after, "later")).toBeNull();
    expect(storage.data[KEY]).not.toContain("conflictingGrade");
    expect(loadRepoGradeCellsFrom(storage, KEY, "c1")[repo].w1.retainedResults?.map(({ id }) => id))
      .toEqual([LEGACY_REPO_GRADE_RESULT_ID, "local:1"]);
  });

  it("reuses an exact coexisting canonical source and keeps its separate draft", () => {
    const { generatedScore, ...otherSourceFields } = source;
    const reordered = { generatedScore, ...otherSourceFields };
    const storage = fakeStorage({ [KEY]: withLegacy({ retainedResults: [{ ...canonical, source: reordered }] }) });
    const result = readRepoGradeCellsFrom(storage, KEY, "c1");
    expect(result.notice).toBeNull();
    expect(result.edits[repo].w1.retainedResults).toEqual([canonical]);
    expect(storage.writes).toBe(0);
    expect(persistRepoGradeCellsTo(storage, KEY, "c1", result.edits, "later")).toBeNull();
    expect(loadRepoGradeCellsFrom(storage, KEY, "c1")[repo].w1.retainedResults).toEqual([canonical]);
  });

  it.each([
    ["mismatched source", { retainedResults: [{ ...canonical, source: { ...source, comment: "Mismatch" } }] }],
    ["duplicate IDs", { retainedResults: [canonical, canonical] }],
    ["nested legacy conflict", { conflictingGrade: { ...legacy, conflictingGrade: legacy } }],
    ["nested canonical draft", { retainedResults: [{ ...canonical, draft: { ...canonical.draft, retainedResults: [] } }] }],
    ["malformed source", { retainedResults: [{ ...canonical, source: { ...source, rubricAreas: [{ comment: 1 }] } }] }],
  ])("blocks save and discard for %s while leaving the current draft readable", (_case, fields) => {
    const raw = withLegacy(fields);
    const storage = fakeStorage({ [KEY]: raw });
    const result = readRepoGradeCellsFrom(storage, KEY, "c1");
    expect(result.edits[repo].w1.comment).toBe("Current draft");
    expect(result.result).toMatchObject({ outcome: "partial", failureCategory: "invalid_stored_data" });
    expect(persistRepoGradeCellsTo(storage, KEY, "c1", result.edits, "later")).toMatch(/invalid/);
    expect(clearRepoGradeCellsIn(storage, KEY, "c1").result).toMatchObject({ outcome: "blocked", failureCategory: "invalid_stored_data" });
    expect(storage.data[KEY]).toBe(raw);
    expect(storage.writes).toBe(0);
    expect(storage.removes).toBe(0);
  });
});

describe("load is read-only; clear is course-scoped (M3 pure half)", () => {
  it("loading performs no write or remove, and returns every stored cell", () => {
    const storage = fakeStorage();
    persistRepoGradeCellsTo(storage, KEY, "c1", editsOf([["org/a", "w1", { score: "1" }], ["org/b", "w1", { score: "2" }]]), "t");
    const writes = storage.writes;
    const removes = storage.removes;
    const loaded = loadRepoGradeCellsFrom(storage, KEY, "c1");
    expect(Object.keys(loaded).sort()).toEqual(["org/a", "org/b"]);
    expect(storage.writes).toBe(writes);
    expect(storage.removes).toBe(removes);
  });

  it("clears only the target course", () => {
    const storage = fakeStorage();
    persistRepoGradeCellsTo(storage, KEY, "c1", editsOf([["org/a", "w1", { score: "1" }]]), "t");
    persistRepoGradeCellsTo(storage, KEY, "c2", editsOf([["org/a", "w1", { score: "2" }]]), "t");
    clearRepoGradeCellsIn(storage, KEY, "c1");
    expect(Object.keys(loadRepoGradeCellsFrom(storage, KEY, "c1"))).toEqual([]);
    expect(getRepoGradeCellEdit(loadRepoGradeCellsFrom(storage, KEY, "c2"), "org/a", "w1").score).toBe("2");
  });

  it("removes the key when the last course is cleared", () => {
    const storage = fakeStorage();
    persistRepoGradeCellsTo(storage, KEY, "c1", editsOf([["org/a", "w1", { score: "1" }]]), "t");
    clearRepoGradeCellsIn(storage, KEY, "c1");
    expect(KEY in storage.data).toBe(false);
  });
});

describe("restored-results banner copy", () => {
  it("is null with nothing restored and pinned otherwise", () => {
    expect(describeRestoredRepoGradeCells({})).toBeNull();
    expect(describeRestoredRepoGradeCells(editsOf([["a", "w", { score: "1" }]]))).toBe(
      "Restored 1 saved grading result for this course. Submitted files and code-run output are not saved - grade again to see them."
    );
    expect(describeRestoredRepoGradeCells(editsOf([["a", "w", {}], ["a", "x", {}]]))).toContain("Restored 2 saved grading results");
  });
});

describe("branch-merge fix: mergeStatus / mergeFoundOnBranch persist tolerantly (AC-F4)", () => {
  const AT = "2026-10-04T00:00:00.000Z";

  it("round-trips a not-merged cell through toPersisted -> parseStoredCells -> restore", () => {
    const storage = fakeStorage();
    persistRepoGradeCellsTo(storage, KEY, "c1", editsOf([["org/r", "w1", fullEdit()]]), AT);
    const restored = loadRepoGradeCellsFrom(storage, KEY, "c1");
    expect(restored["org/r"]["w1"].mergeStatus).toBe("not-merged");
    expect(restored["org/r"]["w1"].mergeFoundOnBranch).toBe("feature-x");
  });

  it("a LEGACY blob (no merge fields) yields a cell that is PRESENT with mergeStatus null - not a dropped cell", () => {
    const legacy: Record<string, unknown> = { ...toPersisted(fullEdit(), AT) };
    delete legacy.mergeStatus;
    delete legacy.mergeFoundOnBranch;
    const raw = JSON.stringify({ c1: { "org/r": { w1: legacy } } });
    const parsed = parseStoredCells(raw);
    expect(parsed["c1"]["org/r"]["w1"]).toBeDefined();
    expect(parsed["c1"]["org/r"]["w1"].mergeStatus).toBeNull();
    expect(parsed["c1"]["org/r"]["w1"].mergeFoundOnBranch).toBeNull();
    expect(parsed["c1"]["org/r"]["w1"].score).toBe("18/20");
  });

  it("an invalid merge value degrades to null and keeps the cell", () => {
    const bad: Record<string, unknown> = { ...toPersisted(fullEdit(), AT), mergeStatus: "bogus", mergeFoundOnBranch: 7 };
    const parsed = parseStoredCells(JSON.stringify({ c1: { "org/r": { w1: bad } } }));
    expect(parsed["c1"]["org/r"]["w1"].mergeStatus).toBeNull();
    expect(parsed["c1"]["org/r"]["w1"].mergeFoundOnBranch).toBeNull();
  });
});

