import { beforeEach, describe, expect, it, vi } from "vitest";
const { owner, rpc, retry } = vi.hoisted(() => ({ owner: vi.fn(), rpc: vi.fn(), retry: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: owner }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));
import { authorizeUnknownRepoRetryAction } from "./repo-grade-unknown-retry";
describe("unknown retry authorization", () => {
  beforeEach(() => { vi.clearAllMocks(); owner.mockResolvedValue({ id: "owner" }); rpc.mockReturnValue({ retry }); retry.mockResolvedValue({ data: true, error: null }); });
  it("uses the authenticated owner and does not retry the write", async () => {
    expect(await authorizeUnknownRepoRetryAction(1724, "owner")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("repo_grade_authorize_unknown_retry", { p_user_id: "owner", p_generation: 1724 });
    expect(retry).toHaveBeenCalledWith(false);
  });
  it("refuses account changes and invalid generations before dispatch", async () => {
    expect(await authorizeUnknownRepoRetryAction(1724, "other")).toBe(false);
    expect(await authorizeUnknownRepoRetryAction(0, "owner")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("reports an uncertain response without retrying", async () => {
    retry.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(authorizeUnknownRepoRetryAction(1724, "owner")).rejects.toThrow("could not be confirmed");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
