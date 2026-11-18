import { afterEach, expect, it, vi } from "vitest";
import type { GradeRunItemRequestBody } from "@/app/components/grading/incrementalRunPlan";
const lease = { signal: new AbortController().signal };
const session = { accountId: "account", sessionId: "session" };
const authority = { admit: vi.fn(async () => lease), identity: vi.fn(() => session), close: vi.fn() };
vi.mock("@/lib/grade/single-zip-browser-authority", () => ({ createSingleZipBrowserAuthority: () => authority }));
vi.mock("./notebookJobClient", () => ({ discoverNotebookJob: vi.fn(), listNotebookJobs: vi.fn(), matchNotebookJob: vi.fn(), startNotebookJob: vi.fn(), pollNotebookJob: vi.fn() }));
import * as jobs from "./notebookJobClient";
import { prepareNotebookGrade } from "./prepareNotebookGrade";
const url = "https://github.com/test/repo";
const req = { sourceIndex: 0, entry: { student: "Student", content: url, submissionUrl: url, submittedFiles: [] } } as unknown as GradeRunItemRequestBody;
const observer = {} as Parameters<typeof prepareNotebookGrade>[1];
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("does not discover or start when disabled", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: false }))));
  expect(await prepareNotebookGrade(req, observer, () => true)).toBe(req);
  expect(jobs.discoverNotebookJob).not.toHaveBeenCalled();
});
it("only treats authoritative absence as an ordinary submission", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: true }))));
  vi.mocked(jobs.discoverNotebookJob).mockResolvedValueOnce("none").mockResolvedValueOnce("unavailable");
  expect(await prepareNotebookGrade(req, observer, () => true)).toBe(req);
  await expect(prepareNotebookGrade(req, observer, () => true)).rejects.toThrow("could not be verified");
  expect(jobs.startNotebookJob).not.toHaveBeenCalled();
});
it("drops a stale receipt when disabled or when no notebook is found", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ enabled: false }))).mockResolvedValueOnce(new Response(JSON.stringify({ enabled: true }))));
  vi.mocked(jobs.discoverNotebookJob).mockResolvedValue("none");
  const old = { ...req, notebookAttempt: "old" };
  expect(await prepareNotebookGrade(old, observer, () => true)).not.toHaveProperty("notebookAttempt");
  expect(await prepareNotebookGrade(old, observer, () => true)).not.toHaveProperty("notebookAttempt");
});
it("returns only a server-bound receipt after successful execution", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: true }))));
  vi.mocked(jobs.discoverNotebookJob).mockResolvedValue({ owner: "test", repo: "repo", path: "work.ipynb", commit: "a".repeat(40), sourceUrl: url });
  vi.mocked(jobs.listNotebookJobs).mockResolvedValue([]);
  vi.mocked(jobs.matchNotebookJob).mockResolvedValue(null);
  vi.mocked(jobs.startNotebookJob).mockImplementation(async (_request, _source, attempt) => ({ status: "succeeded", attempt }));
  const result = await prepareNotebookGrade(req, observer, () => true);
  expect(result.expectedOwnerSession).toEqual(session);
  expect(result.notebookAttempt).toBeTruthy();
  expect(jobs.startNotebookJob).toHaveBeenCalledWith(expect.objectContaining({ expectedOwnerSession: session }), expect.anything(), result.notebookAttempt, lease.signal);
  expect(authority.close).toHaveBeenCalled();
});
it("starts for the verified URL on a resolved composite rather than requiring bare text", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: true }))));
  vi.mocked(jobs.discoverNotebookJob).mockResolvedValue({ owner: "test", repo: "repo", path: "work.ipynb", commit: "a".repeat(40), sourceUrl: url });
  vi.mocked(jobs.listNotebookJobs).mockResolvedValue([]);
  vi.mocked(jobs.matchNotebookJob).mockResolvedValue(null);
  vi.mocked(jobs.startNotebookJob).mockImplementation(async (_request, _source, attempt) => ({ status: "succeeded", attempt }));
  const composite = { ...req, entry: { ...req.entry, content: "Part 1\nResolved repository content" } };
  expect((await prepareNotebookGrade(composite, observer, () => true)).notebookAttempt).toBeTruthy();
  expect(jobs.discoverNotebookJob).toHaveBeenCalledWith(session, url, lease.signal);
});
it("uses the same server canonical attempt when concurrent starts converge", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: true }))));
  vi.mocked(jobs.discoverNotebookJob).mockResolvedValue({ owner: "test", repo: "repo", path: "work.ipynb", commit: "a".repeat(40), sourceUrl: url });
  vi.mocked(jobs.listNotebookJobs).mockResolvedValue([]);
  vi.mocked(jobs.matchNotebookJob).mockResolvedValue(null);
  const canonical = "11111111-1111-4111-8111-111111111111";
  vi.mocked(jobs.startNotebookJob).mockResolvedValue({ status: "succeeded", attempt: canonical });
  const [first, second] = await Promise.all([prepareNotebookGrade(req, observer, () => true), prepareNotebookGrade(req, observer, () => true)]);
  expect(vi.mocked(jobs.startNotebookJob).mock.calls[0][2]).not.toBe(vi.mocked(jobs.startNotebookJob).mock.calls[1][2]);
  expect(first.notebookAttempt).toBe(canonical);
  expect(second.notebookAttempt).toBe(canonical);
});
it("polls the canonical attempt instead of the locally proposed UUID", async () => {
  vi.useFakeTimers();
  try {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: true }))));
    vi.mocked(jobs.discoverNotebookJob).mockResolvedValue({ owner: "test", repo: "repo", path: "work.ipynb", commit: "a".repeat(40), sourceUrl: url });
    vi.mocked(jobs.listNotebookJobs).mockResolvedValue([]);
    vi.mocked(jobs.matchNotebookJob).mockResolvedValue(null);
    const canonical = "11111111-1111-4111-8111-111111111111";
    vi.mocked(jobs.startNotebookJob).mockResolvedValue({ status: "running", attempt: canonical });
    vi.mocked(jobs.pollNotebookJob).mockResolvedValue("succeeded");
    const pending = prepareNotebookGrade(req, observer, () => true);
    await vi.advanceTimersByTimeAsync(3000);
    const result = await pending;
    expect(jobs.pollNotebookJob).toHaveBeenCalledWith(session, canonical, lease.signal);
    expect(result.notebookAttempt).toBe(canonical);
  } finally { vi.useRealTimers(); }
});
it("holds a failed notebook instead of silently grading without execution", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: true }))));
  vi.mocked(jobs.discoverNotebookJob).mockResolvedValue({ owner: "test", repo: "repo", path: "work.ipynb", commit: "a".repeat(40), sourceUrl: url });
  vi.mocked(jobs.listNotebookJobs).mockResolvedValue([]);
  vi.mocked(jobs.matchNotebookJob).mockResolvedValue(null);
  vi.mocked(jobs.startNotebookJob).mockImplementation(async (_request, _source, attempt) => ({ status: "failed", attempt }));
  await expect(prepareNotebookGrade(req, observer, () => true)).rejects.toThrow("could not be verified");
});
it("restarts at most once only on explicit server-confirmed retryable status", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: true }))));
  vi.mocked(jobs.discoverNotebookJob).mockResolvedValue({ owner: "test", repo: "repo", path: "work.ipynb", commit: "a".repeat(40), sourceUrl: url });
  vi.mocked(jobs.listNotebookJobs).mockResolvedValue([]);
  vi.mocked(jobs.matchNotebookJob).mockResolvedValue(null);
  vi.mocked(jobs.startNotebookJob).mockImplementationOnce(async (_request, _source, attempt) => ({ status: "retryable", attempt })).mockImplementationOnce(async (_request, _source, attempt) => ({ status: "succeeded", attempt }));
  const result = await prepareNotebookGrade(req, observer, () => true);
  expect(jobs.startNotebookJob).toHaveBeenCalledTimes(2);
  expect(vi.mocked(jobs.startNotebookJob).mock.calls[0][2]).not.toBe(vi.mocked(jobs.startNotebookJob).mock.calls[1][2]);
  expect(result.notebookAttempt).toBe(vi.mocked(jobs.startNotebookJob).mock.calls[1][2]);
  vi.mocked(jobs.startNotebookJob).mockReset().mockImplementation(async (_request, _source, attempt) => ({ status: "retryable", attempt }));
  await expect(prepareNotebookGrade(req, observer, () => true)).rejects.toThrow("could not be verified");
  expect(jobs.startNotebookJob).toHaveBeenCalledTimes(2);
  vi.mocked(jobs.startNotebookJob).mockReset().mockImplementation(async (_request, _source, attempt) => ({ status: "expired", attempt }));
  await expect(prepareNotebookGrade(req, observer, () => true)).rejects.toThrow("could not be verified");
  expect(jobs.startNotebookJob).toHaveBeenCalledTimes(1);
});
it.each(["unknown", "recovering"] as const)("holds an %s attempt without starting another", async (status) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: true }))));
  vi.mocked(jobs.discoverNotebookJob).mockResolvedValue({ owner: "test", repo: "repo", path: "work.ipynb", commit: "a".repeat(40), sourceUrl: url });
  vi.mocked(jobs.listNotebookJobs).mockResolvedValue([]);
  vi.mocked(jobs.matchNotebookJob).mockResolvedValue({ attempt_id: "old", grade_binding_sha256: "a".repeat(64), source_url: url, notebook_path: "work.ipynb", commit_sha: "a".repeat(40), status, expires_at: "2099-01-01T00:00:00Z" });
  const now = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(600001);
  try {
    await expect(prepareNotebookGrade(req, observer, () => true)).rejects.toThrow("still unconfirmed");
    expect(jobs.startNotebookJob).not.toHaveBeenCalled();
  } finally { now.mockRestore(); }
});
it("strips an old receipt before matching and starting a changed grading request", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: true }))));
  vi.mocked(jobs.discoverNotebookJob).mockResolvedValue({ owner: "test", repo: "repo", path: "work.ipynb", commit: "a".repeat(40), sourceUrl: url });
  vi.mocked(jobs.listNotebookJobs).mockResolvedValue([]);
  vi.mocked(jobs.matchNotebookJob).mockResolvedValue(null);
  vi.mocked(jobs.startNotebookJob).mockImplementation(async (_request, _source, attempt) => ({ status: "succeeded", attempt }));
  const changed = { ...req, rubric: "Updated rubric", notebookAttempt: "expired-receipt" };
  const result = await prepareNotebookGrade(changed, observer, () => true);
  const matched = vi.mocked(jobs.matchNotebookJob).mock.calls[0][0];
  const started = vi.mocked(jobs.startNotebookJob).mock.calls[0][0];
  expect(matched.rubric).toBe("Updated rubric");
  expect(matched).not.toHaveProperty("notebookAttempt");
  expect(started).not.toHaveProperty("notebookAttempt");
  expect(result.notebookAttempt).toBeTruthy();
  expect(result.notebookAttempt).not.toBe("expired-receipt");
});
it("does not enqueue a receipt after reset", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: true }))));
  let active = true;
  vi.mocked(jobs.discoverNotebookJob).mockImplementation(async () => { active = false; return { owner: "test", repo: "repo", path: "work.ipynb", commit: "a".repeat(40), sourceUrl: url }; });
  await expect(prepareNotebookGrade(req, observer, () => active)).rejects.toThrow("could not be verified");
  expect(jobs.startNotebookJob).not.toHaveBeenCalled();
});
