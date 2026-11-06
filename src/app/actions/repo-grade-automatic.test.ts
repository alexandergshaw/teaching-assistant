import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  setRepoGradeAutomaticScheduleAction, startRepoGradeAutomaticRunAction, stopRepoGradeAutomaticRunAction,
} from "./repo-grade-automatic";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), control: vi.fn(), read: vi.fn(), saveSchedule: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: mocks.owner }));
vi.mock("@/lib/repo-grades-dashboard/admission-mode", () => ({ repoGradeDurableStartupAvailable: () => true }));
vi.mock("@/lib/repo-grades-dashboard/automatic-store", () => ({
  controlAutomaticRepoGrade: mocks.control, readAutomaticRepoGrade: mocks.read,
  saveAutomaticRepoGradeSchedule: mocks.saveSchedule, isAutomaticRepoGradeId: (id: unknown) => typeof id === "string",
}));
vi.mock("./repo-grades-dashboard", () => ({ retryRepoGradePreparationAction: vi.fn() }));

describe("owner automatic grading controls", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.owner.mockResolvedValue({ id: "owner" });
    mocks.read.mockResolvedValue({ enabled: false, schedule: null, preparations: [], recoveries: [], run: null });
    mocks.saveSchedule.mockResolvedValue(true);
  });

  it("keeps schedule edits scoped to the current owner", async () => {
    expect(await setRepoGradeAutomaticScheduleAction("foreign", "08:30", "America/Chicago")).toEqual({ status: "unavailable" });
    expect(mocks.saveSchedule).not.toHaveBeenCalled();
    expect((await setRepoGradeAutomaticScheduleAction("owner", "08:30", "America/Chicago")).status).toBe("loaded");
    expect(mocks.saveSchedule).toHaveBeenCalledWith("owner", "08:30", "America/Chicago");
  });

  it("rejects invalid or partial schedule values before storage", async () => {
    expect(await setRepoGradeAutomaticScheduleAction("owner", "24:00", "UTC")).toEqual({ status: "unavailable" });
    expect(await setRepoGradeAutomaticScheduleAction("owner", null, "UTC")).toEqual({ status: "unavailable" });
    expect(mocks.saveSchedule).not.toHaveBeenCalled();
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
