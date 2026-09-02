import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { upcomingEntryUrgency } from "./upcoming-entry-urgency";

// 2026-03-10, 16:00 local - a mid-afternoon reference so "earlier today" and
// "later today" are both reachable from it.
const NOW = new Date(2026, 2, 10, 16, 0, 0);

describe("the module never reads the clock", () => {
  it("contains no argument-less new Date() and no Date.now()", () => {
    const source = readFileSync(path.resolve(process.cwd(), "src/lib/upcoming-entry-urgency.ts"), "utf-8");
    expect(source).not.toMatch(/new\s+Date\s*\(\s*\)/);
    expect(source).not.toMatch(/Date\s*\.\s*now\s*\(/);
  });
});

describe("upcomingEntryUrgency", () => {
  it("is overdue for a date strictly before today", () => {
    expect(upcomingEntryUrgency({ date: "2026-03-09", time: null }, NOW)).toBe("overdue");
  });

  it("is upcoming for a date strictly after today", () => {
    expect(upcomingEntryUrgency({ date: "2026-03-11", time: null }, NOW)).toBe("upcoming");
  });

  it("is dueToday for today with no time at all", () => {
    expect(upcomingEntryUrgency({ date: "2026-03-10", time: null }, NOW)).toBe("dueToday");
  });

  it("is overdue for today when the time has already passed (the 9am-still-reads-pending-at-4pm case)", () => {
    expect(upcomingEntryUrgency({ date: "2026-03-10", time: "09:00" }, NOW)).toBe("overdue");
  });

  it("is dueToday for today when the time has not yet arrived", () => {
    expect(upcomingEntryUrgency({ date: "2026-03-10", time: "17:00" }, NOW)).toBe("dueToday");
  });

  it("is overdue for today when the time is exactly now (the boundary is inclusive)", () => {
    expect(upcomingEntryUrgency({ date: "2026-03-10", time: "16:00" }, NOW)).toBe("overdue");
  });

  it("does not depend on which past day it is - a week-old date is still just overdue", () => {
    expect(upcomingEntryUrgency({ date: "2026-03-03", time: "23:59" }, NOW)).toBe("overdue");
  });
});
