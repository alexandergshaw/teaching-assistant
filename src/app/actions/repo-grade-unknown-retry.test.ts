import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionAuthClient, actionAuthUser } from "./action-auth.fixtures";
const { readIdentity, rpc, retry } = vi.hoisted(() => ({ readIdentity: vi.fn(), rpc: vi.fn(), retry: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => actionAuthClient(readIdentity), createServiceClient: () => ({ rpc }) }));
vi.mock("@/lib/supabase/app-users", async (original) => ({
  ...await original<typeof import("@/lib/supabase/app-users")>(),
  getAppUser: async (id: string) => actionAuthUser(id, "owner"),
}));
import { authorizeUnknownRepoRetryAction } from "./repo-grade-unknown-retry";
describe("unknown retry authorization", () => {
  beforeEach(() => { vi.clearAllMocks(); readIdentity.mockResolvedValue({ id: "owner" }); rpc.mockReturnValue({ retry }); retry.mockResolvedValue({ data: true, error: null }); });
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
