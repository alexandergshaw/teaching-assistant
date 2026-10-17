import { describe, expect, it } from "vitest";
import { copilotTaskState } from "./copilot-task-state";

describe("Copilot task control lifecycle", () => {
  it.each(["failed", "cancelled", "timed_out"])("unblocks initial retry after queued becomes %s without enabling follow-up", state => {
    expect(copilotTaskState("queued")).toEqual({ running: true, canFollowup: false });
    expect(copilotTaskState(state)).toEqual({ running: false, canFollowup: false });
  });

  it.each(["completed", "idle"])("permits a verified follow-up only after %s", state => {
    expect(copilotTaskState(state)).toEqual({ running: false, canFollowup: true });
  });

  it.each(["in_progress", "waiting_for_user", "unknown"])("keeps %s blocked against duplicate submission", state => {
    expect(copilotTaskState(state)).toEqual({ running: true, canFollowup: false });
  });
});
