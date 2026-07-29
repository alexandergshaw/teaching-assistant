import { describe, it, expect } from "vitest";
import {
  computeNextRunAt,
  mapSchedule,
  mapDaysOfWeek,
  reenableSchedule,
  updateWorkflowSchedule,
  shouldWatcherClaim,
  WATCHER_UNATTENDED_GRACE_MS,
  decideStaleScheduleRecovery,
  describeScheduleCadence,
  type WorkflowSchedule,
} from "./workflow-schedules";
import type { Database } from "./supabase/types";

type ScheduleRow = Database["public"]["Tables"]["workflow_schedules"]["Row"];

function makeRow(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: "s1",
    user_id: "u1",
    workflow_id: "wf1",
    workflow_name: "My Workflow",
    field_values: { a: "1", b: 2, c: null } as ScheduleRow["field_values"],
    next_run_at: "2026-07-20T00:00:00.000Z",
    repeat: "weekly",
    enabled: true,
    course_id: null,
    institution: null,
    last_run_at: null,
    created_at: "2026-07-13T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
    unattended: false,
    provider: null,
    disabled_steps: [],
    interval_minutes: null,
    fanout_progress: null,
    last_run_status: null,
    last_run_detail: null,
    recovery_attempts: 0,
    days_of_week: null,
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<WorkflowSchedule> = {}): WorkflowSchedule {
  return {
    id: "s1",
    userId: "u1",
    workflowId: "wf1",
    workflowName: "My Workflow",
    fieldValues: {},
    nextRunAt: "2026-07-16T14:00:00.000Z", // a Thursday
    repeat: "weekly",
    enabled: true,
    courseId: null,
    institution: null,
    lastRunAt: null,
    intervalMinutes: null,
    unattended: false,
    provider: null,
    disabledSteps: [],
    fanoutProgress: null,
    lastRunStatus: null,
    lastRunDetail: null,
    recoveryAttempts: 0,
    daysOfWeek: [],
    ...overrides,
  };
}

describe("computeNextRunAt", () => {
  it("returns null for one-shot schedules", () => {
    expect(computeNextRunAt("2026-07-13T14:00:00.000Z", "none", new Date("2026-07-13T15:00:00Z"))).toBeNull();
  });

  it("advances a daily schedule by one day", () => {
    const next = computeNextRunAt(
      "2026-07-13T14:00:00.000Z",
      "daily",
      new Date("2026-07-13T14:00:05Z")
    );
    expect(next).toBe("2026-07-14T14:00:00.000Z");
  });

  it("advances a weekly schedule by seven days", () => {
    const next = computeNextRunAt(
      "2026-07-13T14:00:00.000Z",
      "weekly",
      new Date("2026-07-13T14:00:05Z")
    );
    expect(next).toBe("2026-07-20T14:00:00.000Z");
  });

  it("collapses missed occurrences into the single next future one", () => {
    // Due three days ago; daily catch-up should land tomorrow relative to now,
    // not fire once per missed day.
    const next = computeNextRunAt(
      "2026-07-10T14:00:00.000Z",
      "daily",
      new Date("2026-07-13T15:00:00Z")
    );
    expect(next).toBe("2026-07-14T14:00:00.000Z");
  });

  it("always lands strictly in the future", () => {
    const now = new Date("2026-07-13T14:00:00.000Z");
    const next = computeNextRunAt("2026-07-13T14:00:00.000Z", "daily", now);
    expect(new Date(next!).getTime()).toBeGreaterThan(now.getTime());
  });

  it("returns null for an unparseable timestamp", () => {
    expect(computeNextRunAt("not-a-date", "daily", new Date())).toBeNull();
  });

  it("preserves local wall-clock time across a DST boundary", () => {
    // 2026-03-07T09:00 local is the day before US DST starts (2026-03-08).
    // Local calendar arithmetic keeps 09:00 local on both sides even though
    // the UTC offset changes; comparing the local hour proves it.
    const before = new Date(2026, 2, 7, 9, 0, 0);
    const next = computeNextRunAt(before.toISOString(), "daily", new Date(2026, 2, 7, 9, 0, 5));
    const nextLocal = new Date(next!);
    expect(nextLocal.getHours()).toBe(9);
    expect(nextLocal.getDate()).toBe(8);
  });
});

describe("computeNextRunAt weekly multi-day", () => {
  // 2026-07-16 is a Thursday; 07-17 Fri, 07-18 Sat, 07-19 Sun, 07-20 Mon,
  // 07-23 the following Thursday, 07-24 the following Friday.
  const THURSDAY = "2026-07-16T14:00:00.000Z";

  it("a single selected day matching nextRunAt's own weekday behaves exactly like no selection (advances a full week)", () => {
    const withDays = computeNextRunAt(THURSDAY, "weekly", new Date("2026-07-16T14:00:05Z"), null, [4]);
    const withoutDays = computeNextRunAt(THURSDAY, "weekly", new Date("2026-07-16T14:00:05Z"));
    expect(withDays).toBe("2026-07-23T14:00:00.000Z");
    expect(withDays).toBe(withoutDays);
  });

  it("a selection containing only today's weekday advances a full week, not to tomorrow", () => {
    const next = computeNextRunAt(THURSDAY, "weekly", new Date("2026-07-16T14:00:05Z"), null, [4]);
    const nextDate = new Date(next!);
    expect(nextDate.getUTCDay()).toBe(4);
    expect(nextDate.getTime() - new Date(THURSDAY).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("Fri/Sat/Sun steps through the week in order, then wraps to the following Friday", () => {
    const days = [5, 6, 0]; // Fri, Sat, Sun
    let next = computeNextRunAt(THURSDAY, "weekly", new Date("2026-07-16T14:00:05Z"), null, days);
    expect(next).toBe("2026-07-17T14:00:00.000Z"); // Friday

    next = computeNextRunAt(next!, "weekly", new Date(new Date(next!).getTime() + 5000), null, days);
    expect(next).toBe("2026-07-18T14:00:00.000Z"); // Saturday

    next = computeNextRunAt(next!, "weekly", new Date(new Date(next!).getTime() + 5000), null, days);
    expect(next).toBe("2026-07-19T14:00:00.000Z"); // Sunday

    next = computeNextRunAt(next!, "weekly", new Date(new Date(next!).getTime() + 5000), null, days);
    expect(next).toBe("2026-07-24T14:00:00.000Z"); // the following Friday
  });

  it("wraps from Saturday to the next selected weekday the following week (Sunday not selected)", () => {
    // From Saturday, with Mon/Wed selected, the next occurrence must skip
    // Sunday entirely and land on the following Monday.
    const saturday = "2026-07-18T14:00:00.000Z";
    const next = computeNextRunAt(saturday, "weekly", new Date("2026-07-18T14:00:05Z"), null, [1, 3]);
    expect(next).toBe("2026-07-20T14:00:00.000Z"); // Monday
  });

  it("collapses a pile of missed multi-day occurrences into the single next future one", () => {
    // Occurrence far overdue; even with three selected days, only one future
    // occurrence should come back, not a backlog.
    const next = computeNextRunAt(THURSDAY, "weekly", new Date("2026-08-01T00:00:00Z"), null, [5, 6, 0]);
    expect(next).not.toBeNull();
    expect(new Date(next!).getTime()).toBeGreaterThan(new Date("2026-08-01T00:00:00Z").getTime());
  });

  it("an empty daysOfWeek selection keeps the legacy single-weekday behaviour", () => {
    const next = computeNextRunAt(THURSDAY, "weekly", new Date("2026-07-16T14:00:05Z"), null, []);
    expect(next).toBe("2026-07-23T14:00:00.000Z");
  });
});

describe("computeNextRunAt interval", () => {
  it("advances by the given minutes, collapsing missed occurrences past now", () => {
    // First run 40 min ago, every 30 min -> next lands strictly in the future.
    const from = "2026-07-13T14:00:00.000Z";
    const now = new Date("2026-07-13T14:40:00Z");
    const next = computeNextRunAt(from, "interval", now, 30);
    expect(next).toBe("2026-07-13T15:00:00.000Z");
    expect(new Date(next!).getTime()).toBeGreaterThan(now.getTime());
  });

  it("supports hour-scale intervals", () => {
    const next = computeNextRunAt("2026-07-13T14:00:00.000Z", "interval", new Date("2026-07-13T14:05:00Z"), 120);
    expect(next).toBe("2026-07-13T16:00:00.000Z");
  });

  it("returns null when the interval is missing or non-positive", () => {
    const now = new Date("2026-07-13T14:05:00Z");
    expect(computeNextRunAt("2026-07-13T14:00:00.000Z", "interval", now, null)).toBeNull();
    expect(computeNextRunAt("2026-07-13T14:00:00.000Z", "interval", now, 0)).toBeNull();
  });

  it("re-enabling a past interval schedule advances to the next future slot", () => {
    const schedule = {
      repeat: "interval",
      intervalMinutes: 60,
      nextRunAt: "2000-01-01T00:00:00.000Z",
    } as WorkflowSchedule;
    const r = reenableSchedule(schedule);
    expect(r.ok).toBe(true);
    expect(new Date(r.nextRunAt!).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("mapSchedule", () => {
  it("round-trips lastRunStatus and lastRunDetail when set", () => {
    const row = makeRow({ last_run_status: "error", last_run_detail: "step 1 failed: timeout" });
    const s = mapSchedule(row);
    expect(s.lastRunStatus).toBe("error");
    expect(s.lastRunDetail).toBe("step 1 failed: timeout");
  });

  it("maps lastRunStatus and lastRunDetail as null when not set", () => {
    const row = makeRow({ last_run_status: null, last_run_detail: null });
    const s = mapSchedule(row);
    expect(s.lastRunStatus).toBeNull();
    expect(s.lastRunDetail).toBeNull();
  });

  it("maps the unattended/provider/disabledSteps columns and carries userId", () => {
    const row = makeRow({ unattended: true, provider: "gemini", disabled_steps: [1, 3] });
    const s = mapSchedule(row);
    expect(s.userId).toBe("u1");
    expect(s.unattended).toBe(true);
    expect(s.provider).toBe("gemini");
    expect(s.disabledSteps).toEqual([1, 3]);
  });

  it("defaults unattended to false and provider to null for legacy rows", () => {
    const row = makeRow({ unattended: false, provider: null, disabled_steps: [] });
    const s = mapSchedule(row);
    expect(s.unattended).toBe(false);
    expect(s.provider).toBeNull();
    expect(s.disabledSteps).toEqual([]);
  });

  it("filters non-number entries out of disabled_steps", () => {
    const row = makeRow({ disabled_steps: [0, "1", 2, null, 2.5] as unknown as ScheduleRow["disabled_steps"] });
    const s = mapSchedule(row);
    expect(s.disabledSteps).toEqual([0, 2, 2.5]);
  });

  it("treats a non-array disabled_steps value as empty", () => {
    const row = makeRow({ disabled_steps: { not: "an array" } as unknown as ScheduleRow["disabled_steps"] });
    const s = mapSchedule(row);
    expect(s.disabledSteps).toEqual([]);
  });

  it("keeps only string values from field_values", () => {
    const row = makeRow();
    const s = mapSchedule(row);
    expect(s.fieldValues).toEqual({ a: "1" });
  });

  it("coerces an unrecognized repeat value to none", () => {
    const row = makeRow({ repeat: "monthly" });
    const s = mapSchedule(row);
    expect(s.repeat).toBe("none");
  });

  it("maps an interval schedule and its interval_minutes", () => {
    const row = makeRow({ repeat: "interval", interval_minutes: 30 });
    const s = mapSchedule(row);
    expect(s.repeat).toBe("interval");
    expect(s.intervalMinutes).toBe(30);
  });

  it("defaults interval_minutes to null when absent", () => {
    const s = mapSchedule(makeRow());
    expect(s.intervalMinutes).toBeNull();
  });

  it("maps recovery_attempts, defaulting to 0", () => {
    expect(mapSchedule(makeRow()).recoveryAttempts).toBe(0);
    expect(mapSchedule(makeRow({ recovery_attempts: 1 })).recoveryAttempts).toBe(1);
  });

  it("maps days_of_week defensively (dedupes and sorts ascending)", () => {
    const row = makeRow({ days_of_week: [6, 5, 5, 0] });
    const s = mapSchedule(row);
    expect(s.daysOfWeek).toEqual([0, 5, 6]);
  });

  it("defaults days_of_week to [] for legacy rows (null)", () => {
    expect(mapSchedule(makeRow({ days_of_week: null })).daysOfWeek).toEqual([]);
  });
});

describe("mapDaysOfWeek", () => {
  it("returns [] for null, undefined, or a non-array value", () => {
    expect(mapDaysOfWeek(null)).toEqual([]);
    expect(mapDaysOfWeek(undefined)).toEqual([]);
    expect(mapDaysOfWeek("not-an-array")).toEqual([]);
    expect(mapDaysOfWeek({ not: "an array" })).toEqual([]);
  });

  it("drops non-integers and values outside 0-6", () => {
    expect(mapDaysOfWeek([0, 1.5, "2", null, -1, 7, 6])).toEqual([0, 6]);
  });

  it("dedupes and sorts ascending", () => {
    expect(mapDaysOfWeek([5, 0, 5, 3, 0])).toEqual([0, 3, 5]);
  });

  it("returns [] for an already-empty array", () => {
    expect(mapDaysOfWeek([])).toEqual([]);
  });
});

describe("describeScheduleCadence", () => {
  it("labels a single-day weekly schedule by nextRunAt's weekday, unchanged", () => {
    // 2026-07-20 is a Monday.
    const s = makeSchedule({ repeat: "weekly", nextRunAt: "2026-07-20T14:00:00.000Z", daysOfWeek: [] });
    expect(describeScheduleCadence(s)).toBe("weekly (Monday)");
  });

  it("labels a weekly schedule with one explicit day the same way as no selection", () => {
    const s = makeSchedule({ repeat: "weekly", nextRunAt: "2026-07-20T14:00:00.000Z", daysOfWeek: [1] });
    expect(describeScheduleCadence(s)).toBe("weekly (Monday)");
  });

  it("labels a multi-day weekly schedule in Monday-first calendar order, regardless of storage order", () => {
    // Stored ascending (Sun=0, Fri=5, Sat=6) per mapDaysOfWeek, but the label
    // reads in the order a week is normally laid out.
    const s = makeSchedule({ repeat: "weekly", nextRunAt: "2026-07-17T14:00:00.000Z", daysOfWeek: [0, 5, 6] });
    expect(describeScheduleCadence(s)).toBe("weekly (Fri, Sat, Sun)");
  });

  it("keeps every other cadence string byte-identical", () => {
    expect(describeScheduleCadence(makeSchedule({ repeat: "daily" }))).toBe("daily");
    expect(describeScheduleCadence(makeSchedule({ repeat: "interval", intervalMinutes: 120 }))).toBe("every 2 hr");
    expect(describeScheduleCadence(makeSchedule({ repeat: "interval", intervalMinutes: 30 }))).toBe("every 30 min");
    expect(describeScheduleCadence(makeSchedule({ repeat: "none" }))).toBe("once");
  });
});

describe("shouldWatcherClaim", () => {
  const now = new Date("2026-07-13T15:00:00.000Z");

  it("always claims an attended schedule, even far overdue", () => {
    const s = { unattended: false, nextRunAt: "2026-07-01T00:00:00.000Z" };
    expect(shouldWatcherClaim(s, now)).toBe(true);
  });

  it("skips an unattended schedule due within the grace window", () => {
    const s = { unattended: true, nextRunAt: "2026-07-13T14:50:00.000Z" }; // 10 min ago
    expect(shouldWatcherClaim(s, now)).toBe(false);
  });

  it("claims an unattended schedule overdue past the grace window", () => {
    const s = { unattended: true, nextRunAt: "2026-07-13T14:00:00.000Z" }; // 60 min ago
    expect(shouldWatcherClaim(s, now)).toBe(true);
  });

  it("is exclusive at the exact grace boundary (not yet claimable)", () => {
    const dueAt = now.getTime() - WATCHER_UNATTENDED_GRACE_MS;
    const s = { unattended: true, nextRunAt: new Date(dueAt).toISOString() };
    expect(shouldWatcherClaim(s, now)).toBe(false);
  });

  it("claims once one millisecond past the grace boundary", () => {
    const dueAt = now.getTime() - WATCHER_UNATTENDED_GRACE_MS - 1;
    const s = { unattended: true, nextRunAt: new Date(dueAt).toISOString() };
    expect(shouldWatcherClaim(s, now)).toBe(true);
  });
});

describe("decideStaleScheduleRecovery", () => {
  it("retries the first time a schedule is found stale", () => {
    const d = decideStaleScheduleRecovery(0);
    expect(d.retry).toBe(true);
    expect(d.detail).toMatch(/interrupted/);
    expect(d.detail).toMatch(/retry on the next tick/);
  });

  it("does not retry a second time", () => {
    const d = decideStaleScheduleRecovery(1);
    expect(d.retry).toBe(false);
    expect(d.detail).toMatch(/interrupted/);
    expect(d.detail).toMatch(/no further retry/);
  });
});

describe("updateWorkflowSchedule field mapping", () => {
  it("accepts intervalMinutes for schedule updates", () => {
    // This is a compile-time test; it verifies the signature accepts
    // the new optional field without error.
    const fields: Parameters<typeof updateWorkflowSchedule>[3] = {
      intervalMinutes: 90,
      nextRunAt: "2026-07-21T14:00:00.000Z",
    };
    expect(fields.intervalMinutes).toBe(90);
  });

  it("accepts unattended for schedule updates", () => {
    const fields: Parameters<typeof updateWorkflowSchedule>[3] = {
      unattended: true,
    };
    expect(fields.unattended).toBe(true);
  });

  it("accepts courseId and institution for schedule updates", () => {
    const fields: Parameters<typeof updateWorkflowSchedule>[3] = {
      courseId: "course123",
      institution: "example.edu",
    };
    expect(fields.courseId).toBe("course123");
    expect(fields.institution).toBe("example.edu");
  });

  it("accepts fieldValues for schedule updates", () => {
    const fields: Parameters<typeof updateWorkflowSchedule>[3] = {
      fieldValues: { key: "value" },
    };
    expect(fields.fieldValues).toEqual({ key: "value" });
  });

  it("accepts daysOfWeek for schedule updates", () => {
    const fields: Parameters<typeof updateWorkflowSchedule>[3] = {
      daysOfWeek: [1, 3, 5],
    };
    expect(fields.daysOfWeek).toEqual([1, 3, 5]);
  });
});
