import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { createClient } from "@/lib/supabase/server";
import {
  setRepoGradeAutomaticClassQueueAction, setRepoGradeAutomaticGithubRetryAction, setRepoGradeAutomaticScheduleAction,
  startRepoGradeAutomaticRunAction, startRepoGradeTargetedRunAction, startRepoGradeBulkRunAction, startRepoGradeCellsRunAction, stopRepoGradeAutomaticRunAction, enqueueChangedRepoGradeAction,
} from "./repo-grade-automatic";

const mocks = vi.hoisted(() => ({
  control: vi.fn(), read: vi.fn(), saveSchedule: vi.fn(), saveGithubRetry: vi.fn(), saveClassQueue: vi.fn(), targeted: vi.fn(), bulk: vi.fn(), cells: vi.fn(), changed: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/app-users", async (original) => ({
  ...await original<typeof import("@/lib/supabase/app-users")>(),
  getAppUser: vi.fn(),
}));
vi.mock("@/lib/repo-grades-dashboard/admission-mode", () => ({ repoGradeDurableStartupAvailable: () => true }));
vi.mock("@/lib/repo-grades-dashboard/automatic-store", () => ({
  controlAutomaticRepoGrade: mocks.control, readAutomaticRepoGrade: mocks.read,
  saveAutomaticRepoGradeGithubRetry: mocks.saveGithubRetry,
  saveAutomaticRepoGradeClassQueue: mocks.saveClassQueue,
  startTargetedAutomaticRepoGrade: mocks.targeted,
  enqueueBulkAutomaticRepoGrade: mocks.bulk,
  enqueueCellsAutomaticRepoGrade: mocks.cells,
  enqueueChangedRepoGrade: mocks.changed,
  saveAutomaticRepoGradeSchedule: mocks.saveSchedule, isAutomaticRepoGradeId: (id: unknown) => typeof id === "string",
}));
vi.mock("./repo-grades-dashboard", () => ({ retryRepoGradePreparationAction: vi.fn() }));

const owner = { id: "owner", email: "owner@example.test" };
const ownerRow: AppUserRow = {
  ...owner, displayName: null, status: "active", role: "owner", approvedAt: null, approvedBy: null,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  statusChangedAt: null, statusChangedBy: null, roleGrantedBy: null,
};

describe("owner automatic grading controls", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: owner }, error: null }),
        mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" } }) },
      },
    } as never);
    vi.mocked(getAppUser).mockResolvedValue(ownerRow);
    mocks.read.mockResolvedValue({ enabled: false, schedule: null, preparations: [], recoveries: [], run: null });
    mocks.saveSchedule.mockResolvedValue(true);
  });

  it("only queues a well-formed changed revision for the authorized owner", async () => {
    const target = { repo: "org/student", folder: "assignments/module_11", ref: "main", sha: "b".repeat(40) };
    mocks.changed.mockResolvedValue("queued");
    expect(await enqueueChangedRepoGradeAction("foreign", "course", target)).toEqual({ status: "unavailable" });
    expect(await enqueueChangedRepoGradeAction("owner", "course", { ...target, sha: "bad" })).toEqual({ status: "unavailable" });
    expect(mocks.changed).not.toHaveBeenCalled();
    expect(await enqueueChangedRepoGradeAction("owner", "course", target)).toEqual({ status: "started" });
    expect(mocks.changed).toHaveBeenCalledWith("owner", "course", target);
  });

  it("starts only owner-authorized well-formed selected course targets", async () => {
    mocks.targeted.mockResolvedValue("queued");
    expect(await startRepoGradeTargetedRunAction("foreign", "course", "lab", null)).toEqual({ status: "unavailable" });
    expect(await startRepoGradeTargetedRunAction("owner", "course", "../lab", null)).toEqual({ status: "unavailable" });
    expect(await startRepoGradeTargetedRunAction("owner", "course", "lab", "bad/repo/extra")).toEqual({ status: "unavailable" });
    expect(mocks.targeted).not.toHaveBeenCalled();
    expect(await startRepoGradeTargetedRunAction("owner", "course", "lab", "org/student")).toEqual({ status: "started" });
    expect(mocks.targeted).toHaveBeenCalledWith("owner", "course", "lab", "org/student");
    mocks.targeted.mockResolvedValue("already-queued");
    expect(await startRepoGradeTargetedRunAction("owner", "course", "lab", null)).toEqual({ status: "busy" });
  });

  it("queues one authorized bulk selection and rejects malformed selections", async () => {
    mocks.bulk.mockResolvedValue("queued");
    expect(await startRepoGradeBulkRunAction("foreign", "course", ["lab"], ["org/student"])).toEqual({ status: "unavailable" });
    expect(await startRepoGradeBulkRunAction("owner", "course", ["../lab"], null)).toEqual({ status: "unavailable" });
    expect(await startRepoGradeBulkRunAction("owner", "course", ["lab"], ["bad/repo/extra"])).toEqual({ status: "unavailable" });
    expect(mocks.bulk).not.toHaveBeenCalled();
    expect(await startRepoGradeBulkRunAction("owner", "course", ["lab", "lab2"], ["org/student"])).toEqual({ status: "started" });
    expect(mocks.bulk).toHaveBeenCalledWith("owner", "course", ["lab", "lab2"], ["org/student"]);
  });

  it("queues exact selected cells together without expanding their cross product", async () => {
    const cells = [{ folder: "lab", repo: "org/one" }, { folder: "other", repo: "org/two" }];
    mocks.cells.mockResolvedValue("queued");
    expect(await startRepoGradeCellsRunAction("owner", "course", cells)).toEqual({ status: "started" });
    expect(mocks.cells).toHaveBeenCalledWith("owner", "course", cells);
    expect(await startRepoGradeCellsRunAction("owner", "course", Array(1001).fill(cells[0]))).toEqual({ status: "too-many" });
  });

  it("persists a GitHub retry preference only for the active owner and a boolean choice", async () => {
    expect(await setRepoGradeAutomaticGithubRetryAction("foreign", true)).toEqual({ status: "unavailable" });
    expect(await setRepoGradeAutomaticGithubRetryAction("owner", "true")).toEqual({ status: "unavailable" });
    vi.mocked(getAppUser).mockResolvedValueOnce({ ...ownerRow, role: "instructor" });
    expect(await setRepoGradeAutomaticGithubRetryAction("owner", true)).toEqual({ status: "unavailable" });
    expect(mocks.saveGithubRetry).not.toHaveBeenCalled();
    mocks.saveGithubRetry.mockResolvedValue(true);
    expect((await setRepoGradeAutomaticGithubRetryAction("owner", true)).status).toBe("loaded");
    expect(mocks.saveGithubRetry).toHaveBeenCalledWith("owner", true);
  });

  it("keeps schedule edits scoped to the current owner", async () => {
    const daily = { kind: "daily", time: "08:30", zone: "America/Chicago" };
    const interval = { kind: "interval", count: 2, unit: "days" };
    expect(await setRepoGradeAutomaticScheduleAction("foreign", interval)).toEqual({ status: "unavailable" });
    expect(mocks.saveSchedule).not.toHaveBeenCalled();
    for (const schedule of [daily, interval, null]) {
      expect((await setRepoGradeAutomaticScheduleAction("owner", schedule)).status).toBe("loaded");
      expect(mocks.saveSchedule).toHaveBeenLastCalledWith("owner", schedule);
    }
  });

  it("saves the active owner's queue order, preserving the distinction between empty and default", async () => {
    expect(await setRepoGradeAutomaticClassQueueAction("foreign", ["b", "a"])).toEqual({ status: "unavailable" });
    vi.mocked(getAppUser).mockResolvedValueOnce({ ...ownerRow, role: "instructor" });
    expect(await setRepoGradeAutomaticClassQueueAction("owner", ["b", "a"])).toEqual({ status: "unavailable" });
    for (const invalid of [undefined, { courseIds: ["a"] }, ["a", "a"], [null], Array(1), Array(1_001).fill("a")]) {
      expect(await setRepoGradeAutomaticClassQueueAction("owner", invalid)).toEqual({ status: "unavailable" });
    }
    expect(mocks.saveClassQueue).not.toHaveBeenCalled();
    mocks.saveClassQueue.mockResolvedValue(true);
    for (const ordered of [["b", "a"], [], null]) {
      expect((await setRepoGradeAutomaticClassQueueAction("owner", ordered)).status).toBe("loaded");
      expect(mocks.saveClassQueue).toHaveBeenLastCalledWith("owner", ordered);
    }
  });

  it("rejects invalid or partial schedule values before storage", async () => {
    for (const schedule of [
      { kind: "daily", time: "24:00", zone: "UTC" },
      { kind: "daily", time: null, zone: "UTC" },
      { kind: "daily", time: "08:00", zone: "Unknown/Zone" },
      { kind: "interval", count: 1.5, unit: "hours" },
      { kind: "interval", count: 0, unit: "days" },
      { kind: "interval", count: 31, unit: "days" },
      { kind: "interval", count: 721, unit: "hours" },
      { kind: "interval", count: 1, unit: "months" },
      { kind: "interval", count: "2", unit: "hours" },
    ]) {
      expect(await setRepoGradeAutomaticScheduleAction("owner", schedule)).toEqual({ status: "unavailable" });
    }
    expect(mocks.saveSchedule).not.toHaveBeenCalled();
  });

  it("reports a refused or failed interval write without claiming the new schedule is saved", async () => {
    const schedule = { kind: "interval", count: 3, unit: "hours" };
    mocks.saveSchedule.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("connection failed"));
    expect(await setRepoGradeAutomaticScheduleAction("owner", schedule)).toEqual({ status: "unavailable" });
    expect(await setRepoGradeAutomaticScheduleAction("owner", schedule)).toEqual({ status: "unavailable" });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("reports a start or stop rejected by the queue as unchanged", async () => {
    mocks.control.mockResolvedValue(false);
    expect(await startRepoGradeAutomaticRunAction("owner")).toMatchObject({
      status: "loaded", control: { action: "start", changed: false },
    });
    expect(await stopRepoGradeAutomaticRunAction("owner", "run")).toMatchObject({
      status: "loaded", control: { action: "stop", changed: false },
    });
    expect(mocks.control.mock.calls).toEqual([
      ["owner", { action: "start" }], ["owner", { action: "stop", runId: "run" }],
    ]);
  });

  it("marks accepted controls as changed", async () => {
    mocks.control.mockResolvedValue(true);
    expect(await startRepoGradeAutomaticRunAction("owner")).toMatchObject({
      status: "loaded", control: { action: "start", changed: true },
    });
  });
});
