import { describe, it, expect } from "vitest";
import { computeNextRunAt, mapSchedule, reenableSchedule, type WorkflowSchedule } from "./workflow-schedules";
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
});
