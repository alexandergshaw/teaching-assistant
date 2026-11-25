import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionAuthClient, actionAuthUser } from "./action-auth.fixtures";

const mocks = vi.hoisted(() => ({ readIdentity: vi.fn(), accountRole: vi.fn<() => "owner" | "instructor">(), rpc: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => actionAuthClient(mocks.readIdentity), createServiceClient: mocks.client }));
vi.mock("@/lib/supabase/app-users", async (original) => ({
  ...await original<typeof import("@/lib/supabase/app-users")>(),
  getAppUser: async (id: string) => actionAuthUser(id, mocks.accountRole()),
}));
vi.mock("@/lib/repo-grades-dashboard/admission-mode", () => ({ repoGradeDurableStartupAvailable: () => true }));
import { controlRepoGradeTargetRequestAction, readRepoGradeTargetRequestsAction } from "./repo-grade-target-request";

const owner = "11111111-1111-4111-8111-111111111111";
const course = "22222222-2222-4222-8222-222222222222";
const run = "33333333-3333-4333-8333-333333333333";
function respond(data: unknown, error: unknown = null) {
  mocks.rpc.mockReturnValue({ retry: () => ({ abortSignal: () => Promise.resolve({ data, error }) }) });
}

describe("targeted grading queue controls", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.readIdentity.mockResolvedValue({ id: owner }); mocks.accountRole.mockReturnValue("owner"); mocks.client.mockReturnValue({ rpc: mocks.rpc }); });

  it("rejects foreign owners and malformed controls before reaching storage", async () => {
    expect(await controlRepoGradeTargetRequestAction("foreign", 1, "stop")).toEqual({ status: "unavailable" });
    expect(await controlRepoGradeTargetRequestAction(owner, -1, "stop")).toEqual({ status: "unavailable" });
    expect(await controlRepoGradeTargetRequestAction(owner, 1, "delete")).toEqual({ status: "unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a non-owner and a mismatched owner before either RPC", async () => {
    mocks.accountRole.mockReturnValue("instructor");
    expect(await readRepoGradeTargetRequestsAction(owner)).toEqual({ status: "unavailable" });
    expect(await controlRepoGradeTargetRequestAction(owner, 1, "stop")).toEqual({ status: "unavailable" });
    mocks.accountRole.mockReturnValue("owner");
    expect(await readRepoGradeTargetRequestsAction("foreign")).toEqual({ status: "unavailable" });
    expect(await controlRepoGradeTargetRequestAction("foreign", 1, "stop")).toEqual({ status: "unavailable" });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("passes the active owner and exact request id to the control RPC", async () => {
    respond(true);
    expect(await controlRepoGradeTargetRequestAction(owner, 9, "pause")).toEqual({ status: "loaded", changed: true });
    expect(mocks.rpc).toHaveBeenCalledWith("repo_grade_target_request_control", { p_user_id: owner, p_id: 9, p_action: "pause" });
  });

  it("returns valid bounded request status and rejects malformed storage results", async () => {
    const request = { id: 1, courseId: course, folder: "Lab", repo: "org/student", bulk: false, folders: null, repos: null, pairs: null, state: "paused-running", runId: run, inFlight: true, reason: null, counts: {} };
    respond([request]);
    expect(await readRepoGradeTargetRequestsAction(owner)).toEqual({ status: "loaded", requests: [request] });
    respond([{ ...request, repo: "org/student/extra" }]);
    expect(await readRepoGradeTargetRequestsAction(owner)).toEqual({ status: "unavailable" });
    respond([{ ...request, state: "incomplete", inFlight: false, reason: "target-limit", counts: { partial: 1 } }]);
    expect((await readRepoGradeTargetRequestsAction(owner)).status).toBe("loaded");
    respond([{ ...request, reason: "private data" }]);
    expect(await readRepoGradeTargetRequestsAction(owner)).toEqual({ status: "unavailable" });
  });
});
