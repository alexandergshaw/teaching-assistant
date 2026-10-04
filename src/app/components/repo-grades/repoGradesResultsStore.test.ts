// RG-PERSIST-RESULTS (W5): the persist/restore mapper leaf. Oracles come from
// docs/repo-grades-persist-results-test-notes.md (FR-1..FR-7, M3 pure half).
import { describe, it, expect } from "vitest";
import {
  RELOAD_INTERRUPTED_POST_MESSAGE,
  RESULTS_PERSIST_ERROR,
  clearRepoGradeCellsIn,
  describeRestoredRepoGradeCells,
  evictToBudget,
  loadRepoGradeCellsFrom,
  parseStoredCells,
  persistRepoGradeCellsTo,
  restoreRepoGradeCells,
  toPersisted,
  type PersistedCellsByCourse,
  type PersistedRepoGradeCell,
  type RepoGradeCellsStorage,
} from "./repoGradesResultsStore";
import {
  defaultRepoGradeCellEdit,
  getRepoGradeCellEdit,
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

describe("FR-1: the persisted cell is exactly the frozen 12 keys", () => {
  it("enumerates exactly at + 11 kept fields", () => {
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

describe("FR-6: byte budget, oldest-first eviction, quota retry", () => {
  function blobOf(n: number, commentLen: number): PersistedCellsByCourse {
    const folders: Record<string, PersistedRepoGradeCell> = {};
    for (let i = 0; i < n; i += 1) {
      const at = `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`;
      folders[`w${i}`] = toPersisted({ ...defaultRepoGradeCellEdit(), score: "1", comment: "x".repeat(commentLen) }, at);
    }
    return { c1: { "org/r": folders } };
  }

  it("evicts the oldest cells first when over budget", () => {
    const blob = blobOf(10, 1000);
    const total = JSON.stringify(blob).length;
    const out = evictToBudget(blob, Math.floor(total * 0.55));
    const survivors = Object.keys(out.c1["org/r"]);
    expect(survivors.length).toBeGreaterThan(0);
    expect(survivors.length).toBeLessThan(10);
    const dropped = Object.keys(blob.c1["org/r"]).filter((k) => !survivors.includes(k));
    const newestDropped = Math.max(...dropped.map((k) => Number(k.slice(1))));
    const oldestSurvivor = Math.min(...survivors.map((k) => Number(k.slice(1))));
    expect(oldestSurvivor).toBeGreaterThan(newestDropped);
  });

  it("keeps everything when under budget", () => {
    const blob = blobOf(10, 10);
    expect(Object.keys(evictToBudget(blob).c1["org/r"]).length).toBe(10);
  });

  it("enforces the real budget through the persist path, keeping the newest cells", () => {
    const storage = fakeStorage();
    const big = (tag: string): Partial<RepoGradeCellEdit> => ({ score: tag, comment: tag.repeat(450_000) });
    persistRepoGradeCellsTo(storage, KEY, "c1", editsOf([["org/r", "a", big("A")]]), "2026-01-01T00:00:00.000Z");
    persistRepoGradeCellsTo(storage, KEY, "c1", editsOf([["org/r", "a", big("A")], ["org/r", "b", big("B")]]), "2026-01-02T00:00:00.000Z");
    persistRepoGradeCellsTo(
      storage,
      KEY,
      "c1",
      editsOf([["org/r", "a", big("A")], ["org/r", "b", big("B")], ["org/r", "c", big("C")]]),
      "2026-01-03T00:00:00.000Z"
    );
    const kept = Object.keys(parseStoredCells(storage.data[KEY]).c1["org/r"]).sort();
    expect(kept).toContain("c");
    expect(kept).not.toContain("a");
    expect(storage.data[KEY].length).toBeLessThan(1_100_000);
  });

  it("evicts 25% and retries once on QuotaExceededError, then succeeds with no error", () => {
    const storage = fakeStorage();
    let calls = 0;
    const original = storage.setItem.bind(storage);
    storage.setItem = (k: string, v: string) => {
      calls += 1;
      if (calls === 1) throw quotaError();
      original(k, v);
    };
    const edits = editsOf(Array.from({ length: 8 }, (_, i): [string, string, Partial<RepoGradeCellEdit>] => ["org/r", `w${i}`, { score: String(i + 1) }]));
    const error = persistRepoGradeCellsTo(storage, KEY, "c1", edits, "2026-10-04T00:00:00.000Z");
    expect(error).toBeNull();
    expect(calls).toBe(2);
    const stored = parseStoredCells(storage.data[KEY]);
    expect(Object.keys(stored.c1["org/r"]).length).toBe(6);
  });

  it("surfaces a fixed, content-free error after a second failure and never throws", () => {
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
