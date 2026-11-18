import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), rpc: vi.fn(), retry: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../supabase/single-zip-owner-session", () => ({ verifySingleZipOwnerSession: mocks.verify }));
vi.mock("../supabase/server", () => ({ createServiceClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
import { beginNotebookAttempt, loadNotebookAttempt, reserveNotebookAttempt } from "./notebook-attempt-store";
const session = { accountId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222" }, attempt = "33333333-3333-4333-8333-333333333333", digest = "a".repeat(64);
beforeEach(() => {
  vi.clearAllMocks(); mocks.verify.mockResolvedValue(true); mocks.retry.mockResolvedValue({ data: true, error: null }); mocks.rpc.mockReturnValue({ retry: mocks.retry });
  mocks.from.mockReturnValue({ select: mocks.select }); mocks.select.mockReturnValue({ eq: mocks.eq }); mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle }); mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
});
it("binds admission and polling to the verified owner and exact session", async () => {
  await reserveNotebookAttempt(session, attempt, digest, "b".repeat(64), "https://github.com/o/r", "work.ipynb", "c".repeat(40), [0, 2], { rubric: "ten" }, `nb-${"d".repeat(40)}`); await loadNotebookAttempt(session, attempt);
  expect(mocks.rpc).toHaveBeenCalledWith("reserve_notebook_execution", expect.objectContaining({ p_owner: session.accountId, p_session: session.sessionId, p_attempt: attempt, p_digest: digest }));
  expect(mocks.retry).toHaveBeenCalledWith(false); expect(mocks.eq).toHaveBeenCalledWith("owner_id", session.accountId); expect(mocks.eq).toHaveBeenCalledWith("session_id", session.sessionId);
});
it("does not touch the ledger when the session is unverified", async () => {
  mocks.verify.mockResolvedValue(false); await expect(beginNotebookAttempt(session, attempt, digest)).rejects.toThrow(/session/); expect(mocks.rpc).not.toHaveBeenCalled();
});
