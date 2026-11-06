import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as diagnostics from "@/lib/session-diagnostic-log";
import { checkRepoGradesGithubQuota, githubQuotaNextCheckAt, githubQuotaSnapshotIsStale } from "./repoGradesGithubQuotaClient";

const ACCOUNT = "private-account";
const TOKEN = "private-token";
const REPO = "private-owner/private-repo";
const NOW = new Date("2026-11-06T12:00:00Z");
const entry = {
  at: NOW.toISOString(),
  surface: "grading",
  operation: "repo_grades_github_quota",
  label: "repo_grades_github_quota",
  institution: "",
  course: "",
  error: "",
  durationMs: 40,
};
const snapshot = {
  status: "observed" as const, limit: 5_000, remaining: 87, observedAtMs: NOW.getTime() - 5_000,
  resetAtMs: NOW.getTime() + 300_000, staleAtMs: NOW.getTime() + 55_000,
};
const fetchQuota = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchQuota.mockReset();
  diagnostics.resetSessionDiagnosticLogForTests(NOW.toISOString());
  vi.stubGlobal("fetch", fetchQuota);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(performance, "now").mockReturnValueOnce(10).mockReturnValueOnce(50);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function check() {
  return checkRepoGradesGithubQuota(ACCOUNT, new AbortController().signal);
}

function expectDiagnostic(outcome: "success" | "failure", cause?: string) {
  const state = diagnostics.readSessionDiagnosticLogState();
  const expected = [{ ...entry, outcome, ...(cause && { cause }) }];
  expect(state.entries).toEqual(expected);
  const exported = diagnostics.formatSessionDiagnosticLogJson(diagnostics.buildSessionDiagnosticLog(
    state, { currentInstitution: "", currentCourse: "", currentPage: "Repo Grades", browser: "" }, NOW.toISOString(),
  ));
  expect(JSON.parse(exported).entries).toEqual(expected);
  for (const privateValue of [ACCOUNT, TOKEN, REPO]) expect(exported).not.toContain(privateValue);
}

describe("Repo Grades quota diagnostics", () => {
  it("keeps the report intact and records only the outcome and duration", async () => {
    const response = { ...snapshot, upstreamDetail: `${REPO} ${TOKEN}` };
    fetchQuota.mockResolvedValueOnce(Response.json(response));
    expect(await check()).toMatchObject({ result: snapshot });
    expectDiagnostic("success");
  });

  it.each([
    ["observation expired", { ...snapshot, staleAtMs: NOW.getTime() }, "stale"],
    ["reset time passed", { ...snapshot, resetAtMs: NOW.getTime() }, "stale"],
    ["rate limit hit", { status: "throttled", upstreamDetail: `${REPO} ${TOKEN}` }, "throttled"],
    ["GitHub not configured", { status: "not-configured" }, "not-configured"],
    ["unrecognized response", { status: TOKEN }, "unavailable"],
  ])("records a fixed category for %s", async (_, response, cause) => {
    fetchQuota.mockResolvedValueOnce(Response.json(response));
    await check();
    expectDiagnostic("failure", cause);
  });

  it("records an unavailable outcome without including an upstream error body", async () => {
    fetchQuota.mockResolvedValueOnce(Response.json({ error: `${REPO} ${TOKEN}` }, { status: 503 }));
    expect(await check()).toMatchObject({ result: { status: "unavailable" }, accessDenied: false });
    expectDiagnostic("failure", "unavailable");
  });

  it("distinguishes lost access from a temporary quota failure", async () => {
    fetchQuota.mockResolvedValueOnce(Response.json({ status: "unavailable" }, { status: 403 }));
    expect(await check()).toMatchObject({ result: { status: "unavailable" }, accessDenied: true });
    expectDiagnostic("failure", "unavailable");
  });

  it("records an unavailable outcome without including transport error text", async () => {
    fetchQuota.mockRejectedValueOnce(new Error(`${REPO} ${TOKEN}`));
    expect(await check()).toMatchObject({ result: { status: "unavailable" } });
    expectDiagnostic("failure", "unavailable");
  });

  it("discards the result and diagnostic if the viewing account is disposed mid-check", async () => {
    const controller = new AbortController();
    fetchQuota.mockImplementationOnce(async () => {
      controller.abort();
      return Response.json(snapshot);
    });
    expect(await checkRepoGradesGithubQuota(ACCOUNT, controller.signal)).toBeNull();
    expect(diagnostics.readSessionDiagnosticLogState().entries).toEqual([]);
  });

  it("keeps the quota result available if recording the diagnostic fails", async () => {
    fetchQuota.mockResolvedValueOnce(Response.json(snapshot));
    vi.spyOn(diagnostics, "recordSessionDiagnosticEntry").mockImplementationOnce(() => { throw new Error("writer failed"); });
    expect(await check()).toMatchObject({ result: snapshot });
  });
});

describe("Repo Grades quota refresh timing", () => {
  it("rechecks at reset when exhausted even though the displayed observation becomes stale earlier", () => {
    const exhausted = { ...snapshot, remaining: 0 };
    expect(githubQuotaSnapshotIsStale(exhausted, exhausted.staleAtMs)).toBe(true);
    expect(githubQuotaNextCheckAt(exhausted, exhausted.staleAtMs)).toBe(exhausted.resetAtMs);
  });

  it("refreshes an available count when it expires, or at an earlier reset", () => {
    const resetAtMs = NOW.getTime() + 15_000;
    expect(githubQuotaNextCheckAt(snapshot, NOW.getTime())).toBe(snapshot.staleAtMs);
    expect(githubQuotaNextCheckAt({ ...snapshot, resetAtMs }, NOW.getTime())).toBe(resetAtMs);
  });

  it("backs off failed or expired responses and leaves throttles for a manual check", () => {
    const checkedAtMs = snapshot.resetAtMs;
    expect(githubQuotaNextCheckAt({ ...snapshot, remaining: 0 }, checkedAtMs)).toBe(checkedAtMs + 60_000);
    expect(githubQuotaNextCheckAt({ status: "unavailable" }, checkedAtMs)).toBe(checkedAtMs + 60_000);
    expect(githubQuotaNextCheckAt({ status: "throttled" }, checkedAtMs)).toBeNull();
    expect(githubQuotaNextCheckAt({ status: "not-configured" }, checkedAtMs)).toBeNull();
  });
});
