import { beforeEach, describe, expect, it, vi } from "vitest";
import * as sessionDiagnostics from "@/lib/session-diagnostic-log";
import {
  buildSessionDiagnosticLog,
  formatSessionDiagnosticLogJson,
  readSessionDiagnosticLogState,
  resetSessionDiagnosticLogForTests,
  sanitizeSessionDiagnosticDetail,
} from "@/lib/session-diagnostic-log";
import { copyRepoFeedback } from "./repoFeedbackClipboard";
import {
  applyRepoGradeCompletion, applyRetainedRepoGradeDraftEdit, defaultRepoGradeCellEdit, setRepoGradeCellEdit,
} from "./repoGradesCellEdits";
import { RESULTS_DISCARD_ERROR, RESULTS_MAX_CHARS, RESULTS_PERSIST_ERROR, toPersisted } from "./repoGradesResultsStore";
import { clearRepoGradeCells, loadRepoGradeCells, persistRepoGradeCells } from "./repoGradesUiState";

const now = "2026-11-05T00:00:00.000Z";
const privateText = "Personal comments for user-123: https://example.test/private";

describe("repository feedback clipboard", () => {
  beforeEach(() => resetSessionDiagnosticLogForTests(now));

  it("passes the exact text and reports success only after the browser write resolves", async () => {
    let finish!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const copy = copyRepoFeedback(() => ({ writeText }), "strengths", privateText, () => true);
    expect(writeText).toHaveBeenCalledWith(privateText);
    expect(readSessionDiagnosticLogState().entries).toEqual([]);
    finish();
    await expect(copy).resolves.toEqual({ outcome: "success", cause: "none" });
  });

  it("blocks an obsolete retained draft before the browser write", async () => {
    const getClipboard = vi.fn();
    await expect(copyRepoFeedback(getClipboard, "overall", privateText, () => false))
      .resolves.toEqual({ outcome: "blocked", cause: "stale_scope" });
    expect(getClipboard).not.toHaveBeenCalled();
  });

  it("reports a pending retained write as stale if that result is edited before it finishes", async () => {
    const initial = setRepoGradeCellEdit({}, "org/repo", "week-1", { draftRevision: 1 });
    let edits = applyRepoGradeCompletion(initial, "org/repo", "week-1", 0, {
      generatedScore: "8/10", comment: privateText,
    });
    const result = edits["org/repo"]["week-1"].retainedResults![0];
    let finish!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const pending = copyRepoFeedback(() => ({ writeText }), "overall", result.source.comment, () =>
      edits["org/repo"]["week-1"].retainedResults?.[0] === result);
    expect(writeText).toHaveBeenCalledWith(privateText);
    edits = applyRetainedRepoGradeDraftEdit(edits, "org/repo", "week-1", result, "comment", "Revised");
    finish();
    await expect(pending).resolves.toEqual({ outcome: "blocked", cause: "stale_scope" });
    expect(readSessionDiagnosticLogState().entries).toMatchObject([
      { operation: "repo_feedback_copy", detail: { copyTarget: "overall", failureCategory: "stale_scope" } },
    ]);
  });

  it("distinguishes unavailable API, explicit denial, unknown rejection and stale scope in the exported log", async () => {
    await copyRepoFeedback(() => undefined, "all", privateText, () => true);
    await copyRepoFeedback(() => ({
      writeText: vi.fn().mockRejectedValue(new DOMException(privateText, "NotAllowedError")),
    }), "improvements", privateText, () => true);
    await copyRepoFeedback(() => ({
      writeText: vi.fn().mockRejectedValue(new Error(privateText)),
    }), "resubmitNotice", privateText, () => true);
    let current = true;
    let finish!: () => void;
    const pending = copyRepoFeedback(() => ({
      writeText: () => new Promise<void>((resolve) => { finish = resolve; }),
    }), "strengths", privateText, () => current);
    current = false;
    finish();
    await pending;
    await copyRepoFeedback(() => ({ writeText: async () => {} }), "all", privateText, () => true);

    const stored = readSessionDiagnosticLogState();
    expect(stored.entries.map(({ operation, outcome, detail, durationMs }) => ({
      operation, outcome, detail, durationMs: typeof durationMs,
    }))).toEqual([
      ["failure", "api_unavailable", "blocked", "all"],
      ["failure", "permission_denied", "denied", "improvements"],
      ["failure", "clipboard_rejected", "failed", "resubmitNotice"],
      ["failure", "stale_scope", "blocked", "strengths"],
      ["success", "none", "success", "all"],
    ].map(([outcome, failureCategory, copyOutcome, copyTarget]) => ({
      operation: "repo_feedback_copy",
      outcome, detail: { outcome: copyOutcome, failureCategory, copyTarget }, durationMs: "number",
    })));
    const exported = formatSessionDiagnosticLogJson(buildSessionDiagnosticLog(stored, {
      currentInstitution: "", currentCourse: "", currentPage: "", browser: "",
    }, now));
    expect(JSON.parse(exported).entries).toEqual(stored.entries);
    expect(exported).not.toContain(privateText);
    expect(exported).not.toContain("user-123");
    expect(exported).not.toContain("example.test");
    expect(sanitizeSessionDiagnosticDetail({ copyTarget: privateText, otherKey: "resubmitNotice" })).toBeUndefined();
  });

  it("stores and exports bounded browser draft save, restore, denial, and conflict without draft identities", () => {
    const data = new Map<string, string>();
    const localStorage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    };
    vi.stubGlobal("window", { localStorage });
    try {
      const key = "private-evaluation-key";
      const empty = loadRepoGradeCells(key, "history").edits;
      const edits = { "private/repo": { "private-folder": { ...defaultRepoGradeCellEdit(), comment: privateText } } };
      expect(persistRepoGradeCells(key, edits, "history", empty)).toBeNull();
      expect(loadRepoGradeCells(key, "history").edits).toEqual(edits);
      expect(persistRepoGradeCells(key, edits, "history", empty)).toMatch(/different version/);
      localStorage.getItem.mockImplementationOnce(() => { throw new DOMException(privateText, "SecurityError"); });
      expect(loadRepoGradeCells(key, "history").notice).toBeTruthy();
      const state = readSessionDiagnosticLogState();
      const exported = formatSessionDiagnosticLogJson(buildSessionDiagnosticLog(state, {
        currentInstitution: "", currentCourse: "", currentPage: "", browser: "",
      }, now));
      expect(JSON.parse(exported).entries.map(({ operation, detail }: typeof state.entries[number]) =>
        [operation, detail?.outcome, detail?.failureCategory, detail?.storageSource])).toEqual([
        ["repo_feedback_restore", "success", "none", "browser_local"],
        ["repo_feedback_draft_save", "success", "none", "browser_local"],
        ["repo_feedback_restore", "success", "none", "browser_local"],
        ["repo_feedback_draft_save", "blocked", "conflict", "browser_local"],
        ["repo_feedback_restore", "denied", "permission_denied", "browser_local"],
      ]);
      expect(exported).not.toMatch(/private[-/]|user-123|example\.test/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe.each([
  ["current", "ta-repo-grades-cells", "ta-repo-grades-history-drafts"],
  ["history", "ta-repo-grades-history-drafts", "ta-repo-grades-cells"],
] as const)("repository feedback preservation for %s drafts", (source, key, otherKey) => {
  const target = "private-target";
  const siblingId = "private-sibling";
  const edits = { "private/repo": { "private-folder": { ...defaultRepoGradeCellEdit(), comment: privateText } } };
  const cell = toPersisted(edits["private/repo"]["private-folder"], now);
  const sibling = {
    repo: { folder: {
      ...cell,
      futureExtension: { list: [null, false, { label: 'legacy value with },[" and \\' }], exactNumber: "REPLACE_WITH_NUMBER" },
      mergeStatus: "legacy-merge-value",
      mergeFoundOnBranch: undefined,
      rubricAreas: [{ area: "Structure", score: "5", comment: privateText, futureRubricValue: 17 }],
      conflictingGrade: { ...cell, futureConflictValue: [true, 10] },
    } },
    emptyRepo: {},
  };
  const seeded = JSON.stringify({ [siblingId]: sibling, [target]: editsToBlob(cell), emptyCourse: {} }, null, 2)
    .replace('"REPLACE_WITH_NUMBER"', "1e400");

  function editsToBlob<T>(savedCell: T) {
    return { "private/repo": { "private-folder": savedCell } };
  }

  function runWithStorage(action: (storage: ReturnType<typeof createStorage>) => void, raw = seeded) {
    const storage = createStorage(raw);
    vi.stubGlobal("window", { localStorage: storage });
    resetSessionDiagnosticLogForTests(now);
    try {
      action(storage);
      expect(storage.data.get(otherKey)).toBe(seeded);
    } finally {
      vi.unstubAllGlobals();
    }
  }

  function createStorage(raw: string) {
    const data = new Map<string, string>([[key, raw], [otherKey, seeded]]);
    return {
      data,
      getItem: vi.fn((name: string) => data.get(name) ?? null),
      setItem: vi.fn((name: string, value: string) => { data.set(name, value); }),
      removeItem: vi.fn((name: string) => { data.delete(name); }),
    };
  }

  it("replaces and clears only the target, preserving raw legacy and extension values", () => runWithStorage((storage) => {
    expect(persistRepoGradeCells(target, edits, source)).toBeNull();
    expect(storage.getItem.mock.calls).toEqual([[key]]);
    const stored = JSON.parse(storage.data.get(key)!);
    expect(stored[siblingId]).toEqual(JSON.parse(seeded)[siblingId]);
    expect(storage.data.get(key)).toContain('"exactNumber": 1e400');
    expect(stored.emptyCourse).toEqual({});
    expect(clearRepoGradeCells(target, source)).toEqual({
      notice: null, result: { outcome: "success", failureCategory: "none", affectedResultCount: 1 },
    });
    expect(storage.getItem.mock.calls).toEqual([[key], [key]]);
    expect(JSON.parse(storage.data.get(key)!)).toEqual({ [siblingId]: JSON.parse(seeded)[siblingId], emptyCourse: {} });
    expect(storage.data.get(key)).toContain('"exactNumber": 1e400');
    expect(storage.removeItem).not.toHaveBeenCalled();
  }));

  it("refuses to save or clear when its candidate exceeds the budget", () => {
    runWithStorage((storage) => {
      const big = editsToBlob({ ...edits["private/repo"]["private-folder"], comment: "x".repeat(RESULTS_MAX_CHARS) });
      expect(persistRepoGradeCells(target, big, source)).toMatch(/storage limit/);
      expect(storage.data.get(key)).toBe(seeded);
      expect(storage.setItem).not.toHaveBeenCalled();
    });
    const oversizedSibling = JSON.stringify({ ...JSON.parse(seeded), [siblingId]: editsToBlob({ ...cell, comment: "x".repeat(RESULTS_MAX_CHARS) }) });
    runWithStorage((storage) => {
      expect(clearRepoGradeCells(target, source)).toMatchObject({ notice: RESULTS_DISCARD_ERROR, result: { failureCategory: "retention_limit" } });
      expect(storage.data.get(key)).toBe(oversizedSibling);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
    }, oversizedSibling);
  });

  it("refuses one quota-failed write or clear without retrying or changing the previous bytes", () => runWithStorage((storage) => {
    const reject = () => { throw new DOMException(privateText, "QuotaExceededError"); };
    storage.setItem.mockImplementationOnce(reject);
    expect(persistRepoGradeCells(target, edits, source)).toBe(RESULTS_PERSIST_ERROR);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    storage.setItem.mockImplementationOnce(reject);
    expect(clearRepoGradeCells(target, source)).toMatchObject({ notice: RESULTS_DISCARD_ERROR, result: { failureCategory: "quota_exceeded" } });
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.data.get(key)).toBe(seeded);
  }));

  it("refuses save and clear on access denial, corrupt sibling data or a stale save baseline", () => {
    runWithStorage((storage) => {
      storage.getItem.mockImplementationOnce(() => { throw new DOMException(privateText, "SecurityError"); });
      expect(persistRepoGradeCells(target, edits, source)).toMatch(/could not be accessed/);
      storage.getItem.mockImplementationOnce(() => { throw new DOMException(privateText, "SecurityError"); });
      expect(clearRepoGradeCells(target, source)).toMatchObject({ result: { outcome: "denied", failureCategory: "permission_denied" } });
      expect(persistRepoGradeCells(target, edits, source, {})).toMatch(/different version/);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
      expect(storage.data.get(key)).toBe(seeded);
    });
    const corrupt = JSON.stringify({ ...JSON.parse(seeded), [siblingId]: { repo: { folder: { ...cell, conflictingGrade: { comment: 19 } } } } });
    runWithStorage((storage) => {
      expect(loadRepoGradeCells(target, source)).toMatchObject({ edits, notice: expect.stringMatching(/invalid/) });
      expect(persistRepoGradeCells(target, edits, source)).toMatch(/invalid/);
      expect(clearRepoGradeCells(target, source)).toMatchObject({ notice: RESULTS_DISCARD_ERROR, result: { failureCategory: "invalid_stored_data" } });
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
      expect(storage.data.get(key)).toBe(corrupt);
    }, corrupt);
  });

  it("records and exports a failed and a successful discard without content or identities", () => {
    const last = JSON.stringify({ [target]: editsToBlob(cell) }, null, 2);
    runWithStorage((storage) => {
      storage.removeItem.mockImplementationOnce(() => { throw new Error(privateText); });
      expect(clearRepoGradeCells(target, source).notice).toBe(RESULTS_DISCARD_ERROR);
      expect(storage.data.get(key)).toBe(last);
      expect(clearRepoGradeCells(target, source).notice).toBeNull();
      expect(storage.data.has(key)).toBe(false);
      const state = readSessionDiagnosticLogState();
      const exported = formatSessionDiagnosticLogJson(buildSessionDiagnosticLog(state, {
        currentInstitution: "", currentCourse: "", currentPage: "", browser: "",
      }, now));
      expect(JSON.parse(exported).entries).toMatchObject([
        { operation: "repo_feedback_draft_discard", outcome: "failure", durationMs: expect.any(Number), detail: {
          outcome: "failed", failureCategory: "storage_unavailable", storageSource: "browser_local",
        } },
        { operation: "repo_feedback_draft_discard", outcome: "success", durationMs: expect.any(Number), detail: {
          outcome: "success", failureCategory: "none", storageSource: "browser_local", affectedResultCount: 1,
        } },
      ]);
      expect(exported).not.toMatch(/private[-/]|user-123|example\.test/);
    }, last);
  });

  it("keeps the actual discard outcome when the diagnostics writer throws", () => runWithStorage((storage) => {
    const logger = vi.spyOn(sessionDiagnostics, "recordSessionDiagnosticEntry").mockImplementation(() => { throw new Error(privateText); });
    try {
      storage.setItem.mockImplementationOnce(() => { throw new Error(privateText); });
      expect(clearRepoGradeCells(target, source).notice).toBe(RESULTS_DISCARD_ERROR);
      expect(storage.data.get(key)).toBe(seeded);
      expect(clearRepoGradeCells(target, source).notice).toBeNull();
      expect(JSON.parse(storage.data.get(key)!)).not.toHaveProperty(target);
      expect(logger).toHaveBeenCalledTimes(2);
    } finally {
      logger.mockRestore();
    }
  }));
});
