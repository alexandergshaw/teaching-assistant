import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionAuthClient, actionAuthUser } from "./action-auth.fixtures";

const mocks = vi.hoisted(() => ({ readIdentity: vi.fn(), accountRole: vi.fn<() => "owner" | "instructor">(), rpc: vi.fn(), client: vi.fn(), from: vi.fn() }));
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

function selectRows(data: unknown[], count = data.length) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), retry: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockResolvedValue({ data, count, error: null }),
  };
  return query;
}

describe("targeted grading queue controls", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.readIdentity.mockResolvedValue({ id: owner }); mocks.accountRole.mockReturnValue("owner"); mocks.client.mockReturnValue({ rpc: mocks.rpc, from: mocks.from }); });

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

  it("reports only the exact claimed cell as grading and scopes storage reads to the owner and class", async () => {
    respond([]);
    const runs = selectRows([{ id: run, phase: "grading", lease: "lease", lease_until: "2999-01-01T00:00:00Z", targeted_paused: false }]);
    const targets = selectRows([
      { repo: "org/first", folder: "Lab", state: "running" },
      { repo: "org/second", folder: "Lab", state: "queued" },
      { repo: "org/first", folder: "Other", state: "succeeded" },
    ]);
    mocks.from.mockReturnValueOnce(runs).mockReturnValueOnce(targets);
    expect(await readRepoGradeTargetRequestsAction(owner, course)).toEqual({
      status: "loaded", requests: [], activeCellsUnavailable: false,
      activeCells: [
        { courseId: course, repo: "org/first", folder: "Lab", runId: run, state: "running" },
        { courseId: course, repo: "org/second", folder: "Lab", runId: run, state: "queued" },
        { courseId: course, repo: "org/first", folder: "Other", runId: run, state: "settled" },
      ],
    });
    expect(runs.eq).toHaveBeenCalledWith("user_id", owner);
    expect(runs.eq).toHaveBeenCalledWith("repo_grade_automatic_courses.course_id", course);
    expect(targets.eq).toHaveBeenCalledWith("course_id", course);
    expect(targets.eq).toHaveBeenCalledWith("run_id", run);
  });

  it("reports expired claims as waiting and keeps queue status usable if cell rows are truncated", async () => {
    respond([]);
    const runs = selectRows([{ id: run, phase: "grading", lease: "lease", lease_until: "2000-01-01T00:00:00Z", targeted_paused: false }]);
    const rows = [{ repo: "org/first", folder: "Lab", state: "running" }];
    mocks.from.mockReturnValueOnce(runs).mockReturnValueOnce(selectRows(rows));
    expect(await readRepoGradeTargetRequestsAction(owner, course)).toMatchObject({
      activeCells: [{ state: "waiting" }], activeCellsUnavailable: false,
    });
    mocks.from.mockReturnValueOnce(runs).mockReturnValueOnce(selectRows(rows, 2));
    expect(await readRepoGradeTargetRequestsAction(owner, course)).toEqual({
      status: "loaded", requests: [], activeCells: [], activeCellsUnavailable: true,
    });
  });

  it("keeps a stopped run's exact live claim visible until it finishes", async () => {
    respond([]);
    const runs = selectRows([{ id: run, phase: "stopped", lease: "lease", lease_until: "2999-01-01T00:00:00Z", targeted_paused: false }]);
    const targets = selectRows([{ repo: "org/first", folder: "Lab", state: "running" }]);
    mocks.from.mockReturnValueOnce(runs).mockReturnValueOnce(targets);
    expect(await readRepoGradeTargetRequestsAction(owner, course)).toMatchObject({
      activeCells: [{ state: "running" }], activeCellsUnavailable: false,
    });
    expect(targets.eq).toHaveBeenCalledWith("state", "running");
  });
});
