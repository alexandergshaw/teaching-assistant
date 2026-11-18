import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ start: vi.fn(), poll: vi.fn(), cancel: vi.fn(), discover: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/grade/notebook-durable-execution", () => ({ startDurableNotebook: mocks.start, pollDurableNotebook: mocks.poll, cancelDurableNotebook: mocks.cancel, discoverNotebook: mocks.discover, listDurableNotebooks: mocks.list }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111" })) }));
import { POST } from "./route";
const session = { accountId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222" }, attempt = "33333333-3333-4333-8333-333333333333";
const request = (body: unknown, origin = "https://app.test") => new Request("https://app.test/api/notebook-execution", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.stubEnv("CODE_RUNNER_NOTEBOOK_DURABLE_ENABLED", "true"); vi.clearAllMocks(); mocks.poll.mockResolvedValue({ status: "running" }); mocks.cancel.mockResolvedValue({ status: "cancelled" }); });
afterEach(() => vi.unstubAllEnvs());
it("accepts only owner-bound poll inputs, not caller-provided execution handles", async () => {
  expect((await POST(request({ operation: "poll", session, attempt }))).status).toBe(200);
  expect(mocks.poll).toHaveBeenCalledWith(session, attempt);
  expect((await POST(request({ operation: "poll", session, attempt, sandboxId: "sbx_bad" }))).status).toBe(400);
});
it("rejects cross-origin and disabled requests", async () => {
  expect((await POST(request({ operation: "poll", session, attempt }, "https://evil.test"))).status).toBe(403);
  vi.stubEnv("CODE_RUNNER_NOTEBOOK_DURABLE_ENABLED", "false"); expect((await POST(request({ operation: "poll", session, attempt }))).status).toBe(404);
});
it("routes explicit cancellation", async () => {
  const response = await POST(request({ operation: "cancel", session, attempt }));
  expect(await response.json()).toEqual({ status: "cancelled" }); expect(mocks.cancel).toHaveBeenCalledWith(session, attempt);
});
it("supports discovery and session-scoped recovery without execution handles", async () => {
  mocks.discover.mockResolvedValue({ kind: "notebook", owner: "o", repo: "r", commit: "a".repeat(40), path: "work.ipynb" }); mocks.list.mockResolvedValue([]);
  expect((await (await POST(request({ operation: "discover", session, sourceUrl: "https://github.com/o/r" }))).json()).notebook.path).toBe("work.ipynb");
  expect((await (await POST(request({ operation: "list", session }))).json()).attempts).toEqual([]);
});
