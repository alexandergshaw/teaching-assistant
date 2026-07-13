import { describe, it, expect } from "vitest";
import { computeNextRunAt } from "./workflow-schedules";

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
