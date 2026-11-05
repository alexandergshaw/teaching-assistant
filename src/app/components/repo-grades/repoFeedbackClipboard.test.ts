import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSessionDiagnosticLog,
  formatSessionDiagnosticLogJson,
  readSessionDiagnosticLogState,
  resetSessionDiagnosticLogForTests,
  sanitizeSessionDiagnosticDetail,
} from "@/lib/session-diagnostic-log";
import { copyRepoFeedback } from "./repoFeedbackClipboard";
import { defaultRepoGradeCellEdit } from "./repoGradesCellEdits";
import { loadRepoGradeCells, persistRepoGradeCells } from "./repoGradesUiState";

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
