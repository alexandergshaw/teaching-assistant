import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ verify: vi.fn(), collect: vi.fn(), reserve: vi.fn(), begin: vi.fn(), bind: vi.fn(), load: vi.fn(), settle: vi.fn(), cancel: vi.fn(), recover: vi.fn(), confirm: vi.fn(), claim: vi.fn(), finish: vi.fn(), recoverVm: vi.fn(), stopped: vi.fn(), start: vi.fn(), poll: vi.fn(), stop: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./notebook-single-source", () => ({ isExactNotebookRepositoryEntry: vi.fn(async () => true) }));
vi.mock("../supabase/single-zip-owner-session", () => ({ verifySingleZipOwnerSession: m.verify }));
vi.mock("./notebook-project-collector", () => ({ collectNotebookProject: m.collect }));
vi.mock("./notebook-attempt-store", () => ({ reserveNotebookAttempt: m.reserve, beginNotebookAttempt: m.begin, bindNotebookAttempt: m.bind, loadNotebookAttempt: m.load, settleNotebookAttempt: m.settle, cancelNotebookAttempt: m.cancel, recoverNotebookUnknown: m.recover, confirmNotebookCancelled: m.confirm, claimUnboundNotebookRecovery: m.claim, finishUnboundNotebookRecovery: m.finish }));
vi.mock("./notebook-detached-runner", () => ({ startDetachedNotebook: m.start, pollDetachedNotebook: m.poll, stopDetachedNotebook: m.stop, isDetachedNotebookStopped: m.stopped, recoverUnboundNotebook: m.recoverVm }));
import { cancelDurableNotebook, pollDurableNotebook, startDurableNotebook } from "./notebook-durable-execution";
const session = { accountId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222" }, attempt = "33333333-3333-4333-8333-333333333333", sha = "a".repeat(40), path = "scope/work.ipynb", url = `https://github.com/owner/repo/tree/${sha}/scope`;
const gradeRequest = { entry: { submissionUrl: url }, expectedOwnerSession: session, rubric: "ten" };
const sandboxName = `nb-${"d".repeat(40)}`;
const row = { status: "running", expires_at: "2999-01-01T00:00:00Z", sandbox_id: "sbx_A", sandbox_name: "job-A", command_id: "cmd_A", expected_cells: [0] };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CODE_RUNNER_NOTEBOOK_DURABLE_ENABLED", "true"); vi.stubEnv("CODE_RUNNER_PYTHON_SNAPSHOT", "snap_A"); vi.stubEnv("NOTEBOOK_EXECUTION_NAME_KEY", "k".repeat(32)); m.verify.mockResolvedValue(true); m.collect.mockResolvedValue([{ path, content: Buffer.from(JSON.stringify({ nbformat: 4, cells: [{ cell_type: "code", source: "print(1)" }] })) }]); m.reserve.mockResolvedValue([{ canonical_attempt: attempt, canonical_name: sandboxName, status: "reserved", input_matches: true, expired: false }]); m.begin.mockResolvedValue(true); m.bind.mockResolvedValue(true); m.start.mockResolvedValue({ sandboxId: "sbx_A", sandboxName, commandId: "cmd_A" }); m.load.mockResolvedValue(row); m.stop.mockResolvedValue(undefined); m.stopped.mockResolvedValue(false); m.confirm.mockResolvedValue(true); m.claim.mockResolvedValue(false); });
afterEach(() => vi.unstubAllEnvs());
it("binds collection and dispatch to the submitted tree scope", async () => {
  expect(await startDurableNotebook(session, attempt, "owner", "repo", sha, path, url, gradeRequest)).toEqual({ status: "running", attempt });
  expect(m.collect).toHaveBeenCalledWith("owner", "repo", sha, expect.any(Number), { kind: "tree", path: "scope" });
});
it("never redispatches when the durable permit is unavailable", async () => {
  m.begin.mockResolvedValue(false);
  expect(await startDurableNotebook(session, attempt, "owner", "repo", sha, path, url, gradeRequest)).toEqual({ status: "running", attempt }); expect(m.start).not.toHaveBeenCalled();
});
it("uses one canonical attempt and one dispatch across simultaneous tabs", async () => {
  const second = "44444444-4444-4444-8444-444444444444";
  m.begin.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const outcomes = await Promise.all([startDurableNotebook(session, attempt, "owner", "repo", sha, path, url, gradeRequest), startDurableNotebook(session, second, "owner", "repo", sha, path, url, gradeRequest)]);
  expect(outcomes).toEqual([{ status: "running", attempt }, { status: "running", attempt }]);
  expect(m.start).toHaveBeenCalledOnce(); expect(m.begin).toHaveBeenCalledTimes(2);
});
it("rejects a notebook outside the submitted tree", async () => {
  expect(await startDurableNotebook(session, attempt, "owner", "repo", sha, "outside/work.ipynb", url, gradeRequest)).toEqual({ status: "failed" }); expect(m.collect).not.toHaveBeenCalled();
});
it("persists the result before stopping the sandbox", async () => {
  m.poll.mockResolvedValue({ status: "succeeded", observations: { ok: true, expected: [0], observed: [0], errors: [], outputs: [], images: [] } }); m.settle.mockResolvedValue(true);
  expect((await pollDurableNotebook(session, attempt)).status).toBe("succeeded"); expect(m.settle.mock.invocationCallOrder[0]).toBeLessThan(m.stop.mock.invocationCallOrder[0]);
});
it("cancels stored handles, never client-supplied handles", async () => {
  m.cancel.mockResolvedValue([{ sandbox_id: "sbx_A", sandbox_name: "job-A", state: "cancelling" }]);
  expect(await cancelDurableNotebook(session, attempt)).toEqual({ status: "cancelled" }); expect(m.stop).toHaveBeenCalledWith("job-A", "sbx_A");
});
it("does not redispatch an uncertain previous attempt", async () => {
  m.load.mockResolvedValue({ ...row, status: "dispatching" });
  expect(await pollDurableNotebook(session, attempt)).toEqual({ status: "unknown" }); expect(m.recover).not.toHaveBeenCalled(); expect(m.start).not.toHaveBeenCalled();
});
it("recovers an unbound dispatch only after finding and stopping its named sandbox", async () => {
  m.load.mockResolvedValue({ ...row, status: "dispatching", sandbox_id: null, command_id: null, sandbox_name: sandboxName });
  m.claim.mockResolvedValue(true); m.recoverVm.mockResolvedValue("sbx_A"); m.finish.mockResolvedValue("retryable");
  expect(await pollDurableNotebook(session, attempt)).toEqual({ status: "retryable" });
  expect(m.finish).toHaveBeenCalledWith(session, attempt, sandboxName, "sbx_A");
});
it("keeps an unbound attempt unknown if its sandbox cannot be found", async () => {
  m.load.mockResolvedValue({ ...row, status: "recovering", sandbox_id: null, command_id: null, sandbox_name: sandboxName });
  m.recoverVm.mockResolvedValue(null);
  expect(await pollDurableNotebook(session, attempt)).toEqual({ status: "unknown" }); expect(m.finish).not.toHaveBeenCalled();
});
