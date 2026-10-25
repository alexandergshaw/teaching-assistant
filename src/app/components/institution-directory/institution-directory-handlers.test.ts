import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSessionDiagnosticLog,
  formatSessionDiagnosticLogCsv,
  formatSessionDiagnosticLogJson,
  readSessionDiagnosticLogState,
  resetSessionDiagnosticLogForTests,
} from "@/lib/session-diagnostic-log";
import { recordInstitutionDirectoryDiagnostic, type InstitutionDirectoryRequestResult } from "@/lib/institution-directory-diagnostics";
import {
  runInstitutionDirectoryClearValue,
  runInstitutionDirectoryCreateColumn,
  runInstitutionDirectoryCreateProfile,
  runInstitutionDirectoryList,
  runInstitutionDirectoryRemoveColumn,
  runInstitutionDirectoryRemoveProfile,
  runInstitutionDirectoryRenameColumn,
  runInstitutionDirectorySaveValue,
  runInstitutionDirectoryUpdateProfile,
} from "./institution-directory-handlers";

type TestRequestOptions = {
  startedAt: number;
  now?: () => number;
  request: () => Promise<unknown>;
  setError: (message: string) => void;
  setBusy: (busy: boolean) => void;
  onUnavailable?: () => void;
};

const cases: ReadonlyArray<readonly [string, string, (options: TestRequestOptions) => Promise<InstitutionDirectoryRequestResult<unknown>>, string]> = [
  ["list", "directory", (options) => runInstitutionDirectoryList({ ...options, isRefresh: false }), "Could not load institutions. Try again."],
  ["create-profile", "profile", runInstitutionDirectoryCreateProfile, "Could not save that change. Your saved information is still available."],
  ["update-profile", "profile", runInstitutionDirectoryUpdateProfile, "Could not save that change. Your saved information is still available."],
  ["remove-profile", "profile", runInstitutionDirectoryRemoveProfile, "Could not remove that item. It is still available."],
  ["create-column", "column", runInstitutionDirectoryCreateColumn, "Could not save that change. Your saved information is still available."],
  ["rename-column", "column", runInstitutionDirectoryRenameColumn, "Could not save that change. Your saved information is still available."],
  ["remove-column", "column", runInstitutionDirectoryRemoveColumn, "Could not remove that item. It is still available."],
  ["save-value", "value", runInstitutionDirectorySaveValue, "Could not save that change. Your saved information is still available."],
  ["clear-value", "value", runInstitutionDirectoryClearValue, "Could not save that change. Your saved information is still available."],
] as const;

beforeEach(() => resetSessionDiagnosticLogForTests("2026-10-17T12:00:00.000Z"));

describe("institution directory production action handlers", () => {
  it.each(cases)("records the fixed %s/%s transport failure and closes UI state", async (operation, target, handler, message) => {
    const setBusy = vi.fn();
    const setError = vi.fn();
    const onUnavailable = vi.fn();
    const requestSentinel = "PRIVATE_PROFILE_SENTINEL student@example.edu https://private.example/path?credential=SECRET_VALUE";
    const exceptionSentinel = "PRIVATE_EXCEPTION_SENTINEL bearer=SECRET_VALUE";
    const result = await handler({
      startedAt: 100,
      now: () => 138,
      setError,
      setBusy,
      ...(operation === "list" ? { isRefresh: false } : {}),
      request: async () => { throw new Error(`${exceptionSentinel} ${requestSentinel}`); },
      onUnavailable,
    });

    expect(result).toEqual({ kind: "unavailable" });
    expect(setError).toHaveBeenCalledExactlyOnceWith(message);
    expect(setBusy).toHaveBeenCalledExactlyOnceWith(false);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    const entries = readSessionDiagnosticLogState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      operation: `institution_directory_${operation.replaceAll("-", "_")}`,
      outcome: "failure",
      durationMs: 38,
      error: "",
      institution: "",
      course: "",
      detail: { target, reason: "unavailable" },
    });
    expect(Number.isFinite(entries[0].durationMs)).toBe(true);
    expect(entries[0].durationMs).toBeGreaterThanOrEqual(0);

    const log = buildSessionDiagnosticLog(readSessionDiagnosticLogState(), {
      currentInstitution: "",
      currentCourse: "",
      currentPage: "/account/diagnostics",
      browser: "test",
    }, "2026-10-17T12:01:00.000Z");
    const exported = `${formatSessionDiagnosticLogJson(log)}\n${formatSessionDiagnosticLogCsv(log)}`;
    for (const sentinel of [requestSentinel, exceptionSentinel, "student@example.edu", "private.example", "SECRET_VALUE"]) {
      expect(JSON.stringify(entries)).not.toContain(sentinel);
      expect(exported).not.toContain(sentinel);
    }
  });

  it("returns fulfilled domain results unchanged for production callers", async () => {
    const success = { ok: true, state: { records: [], columns: [] } };
    const domainFailure = { ok: false, code: "missing-lms-name" };
    await expect(runInstitutionDirectoryList({ startedAt: 10, request: async () => success, setError: vi.fn(), setBusy: vi.fn(), isRefresh: false }))
      .resolves.toEqual({ kind: "returned", value: success });
    await expect(runInstitutionDirectoryUpdateProfile({ startedAt: 10, request: async () => domainFailure, setError: vi.fn(), setBusy: vi.fn() }))
      .resolves.toEqual({ kind: "returned", value: domainFailure });
  });

  it("records a follow-up refresh as a distinct list attempt", async () => {
    const mutation = await runInstitutionDirectoryRemoveProfile({
      startedAt: 1,
      now: () => 5,
      request: async () => ({ ok: true }),
      setError: vi.fn(),
      setBusy: vi.fn(),
    });
    expect(mutation).toEqual({ kind: "returned", value: { ok: true } });
    recordInstitutionDirectoryDiagnostic("remove-profile", "success", "profile", undefined, { durationMs: 4 });
    await runInstitutionDirectoryList({
      startedAt: 6,
      now: () => 14,
      request: async () => { throw new Error("refresh failure sentinel"); },
      setError: vi.fn(),
      setBusy: vi.fn(),
      isRefresh: true,
      onUnavailable: () => undefined,
    });
    expect(readSessionDiagnosticLogState().entries.map((entry) => [entry.operation, entry.outcome, entry.detail])).toEqual([
      ["institution_directory_remove_profile", "success", { target: "profile" }],
      ["institution_directory_list", "failure", { target: "directory", reason: "unavailable" }],
    ]);
  });

  it("records active-refresh rejection with refresh error, failed state and settled busy", async () => {
    const setError = vi.fn();
    const setBusy = vi.fn();
    const setRefreshFailed = vi.fn();
    const exceptionSentinel = "PRIVATE_REFRESH_EXCEPTION token=REFRESH_SECRET";
    const requestSentinel = "https://private-refresh.example/path?credential=REQUEST_SECRET";
    const result = await runInstitutionDirectoryList({
      startedAt: 200,
      now: () => 225,
      request: async () => { throw new Error(`${exceptionSentinel} ${requestSentinel}`); },
      setError,
      setBusy,
      isRefresh: true,
      onUnavailable: () => setRefreshFailed(true),
    });

    expect(result).toEqual({ kind: "unavailable" });
    expect(setError).toHaveBeenCalledExactlyOnceWith("Could not refresh institutions. Your last saved rows are still shown; try again.");
    expect(setBusy).toHaveBeenCalledExactlyOnceWith(false);
    expect(setRefreshFailed).toHaveBeenCalledExactlyOnceWith(true);
    const entries = readSessionDiagnosticLogState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      operation: "institution_directory_list",
      label: "Load institution directory",
      outcome: "failure",
      durationMs: 25,
      error: "",
      institution: "",
      course: "",
      detail: { target: "directory", reason: "unavailable" },
    });

    const log = buildSessionDiagnosticLog(readSessionDiagnosticLogState(), {
      currentInstitution: "",
      currentCourse: "",
      currentPage: "/account/diagnostics",
      browser: "test",
    }, "2026-10-17T12:02:00.000Z");
    const exported = `${formatSessionDiagnosticLogJson(log)}\n${formatSessionDiagnosticLogCsv(log)}`;
    for (const sentinel of [exceptionSentinel, requestSentinel, "REFRESH_SECRET", "REQUEST_SECRET", "private-refresh.example"]) {
      expect(JSON.stringify(entries)).not.toContain(sentinel);
      expect(exported).not.toContain(sentinel);
    }
  });

  it("does not update UI state for a superseded list request", async () => {
    const setError = vi.fn();
    const setBusy = vi.fn();
    const onUnavailable = vi.fn();
    await runInstitutionDirectoryList({
      startedAt: 1,
      request: async () => { throw new Error("stale request sentinel"); },
      setError,
      setBusy,
      isRefresh: true,
      shouldApplyUnavailable: () => false,
      onUnavailable,
    });
    expect(setError).not.toHaveBeenCalled();
    expect(setBusy).not.toHaveBeenCalled();
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(readSessionDiagnosticLogState().entries).toMatchObject([
      { operation: "institution_directory_list", outcome: "failure", detail: { target: "directory", reason: "unavailable" } },
    ]);
  });
});
