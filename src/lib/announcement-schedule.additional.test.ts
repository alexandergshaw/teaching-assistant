// Additional coverage for the pure helpers in src/lib/announcement-schedule.ts
// that AREN'T part of the given TDD suite (src/lib/announcement-schedule.test.ts,
// which covers buildAnnouncementSchedule/planAnnouncements/parseNextLink
// only): findMatchingAnnouncement, renderAnnouncementTemplate,
// formatWeekOutcomeReport, and parsePostTime. These back the server-side
// reconciler (scheduleWeeklyAnnouncementsAction,
// src/app/actions/canvas-inbox.ts) - see its own test file,
// canvas-inbox.weekly-announcement-schedule.test.ts, for the end-to-end
// wiring.
import { describe, it, expect } from "vitest";
import {
  findMatchingAnnouncement,
  renderAnnouncementTemplate,
  formatWeekOutcomeReport,
  parsePostTime,
  buildAnnouncementSchedule,
  planAnnouncements,
  DEFAULT_POST_HOUR,
  DEFAULT_POST_MINUTE,
  type CanvasAnnouncementLike,
  type ExistingAnnouncementRow,
} from "@/lib/announcement-schedule";

describe("findMatchingAnnouncement", () => {
  const target = new Date(2026, 0, 12, 8, 0, 0, 0);

  const candidate = (over: Partial<CanvasAnnouncementLike> & { id: number }): CanvasAnnouncementLike => ({
    title: "Week 2",
    postedAt: null,
    delayedPostAt: target.toISOString(),
    ...over,
  });

  it("matches on exact (trimmed, case-insensitive) title plus a nearby delayedPostAt", () => {
    const found = findMatchingAnnouncement([candidate({ id: 1, title: "  week 2  " })], "Week 2", target);
    expect(found?.id).toBe(1);
  });

  it("also matches against postedAt when delayedPostAt is absent (an announcement that has since posted)", () => {
    const found = findMatchingAnnouncement(
      [candidate({ id: 2, delayedPostAt: null, postedAt: target.toISOString() })],
      "Week 2",
      target
    );
    expect(found?.id).toBe(2);
  });

  it("does not match a different title", () => {
    const found = findMatchingAnnouncement([candidate({ id: 3, title: "Week 3" })], "Week 2", target);
    expect(found).toBeNull();
  });

  it("does not match a date outside the tolerance window", () => {
    const farOff = new Date(target.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const found = findMatchingAnnouncement([candidate({ id: 4, delayedPostAt: farOff })], "Week 2", target);
    expect(found).toBeNull();
  });

  it("matches a date within the tolerance window", () => {
    const closeBy = new Date(target.getTime() + 60 * 60 * 1000).toISOString(); // one hour off
    const found = findMatchingAnnouncement([candidate({ id: 5, delayedPostAt: closeBy })], "Week 2", target);
    expect(found?.id).toBe(5);
  });

  it("returns null when nothing is passed in", () => {
    expect(findMatchingAnnouncement([], "Week 2", target)).toBeNull();
  });

  it("skips a candidate with neither delayedPostAt nor postedAt", () => {
    const found = findMatchingAnnouncement(
      [candidate({ id: 6, delayedPostAt: null, postedAt: null })],
      "Week 2",
      target
    );
    expect(found).toBeNull();
  });
});

describe("renderAnnouncementTemplate", () => {
  it("substitutes every {week} occurrence with the week number", () => {
    expect(renderAnnouncementTemplate("Week {week}: check-in", 3)).toBe("Week 3: check-in");
    expect(renderAnnouncementTemplate("{week} of {week}", 5)).toBe("5 of 5");
  });

  it("matches the placeholder case-insensitively", () => {
    expect(renderAnnouncementTemplate("Week {WEEK}", 4)).toBe("Week 4");
  });

  it("leaves a template with no placeholder unchanged", () => {
    expect(renderAnnouncementTemplate("Weekly check-in", 2)).toBe("Weekly check-in");
  });
});

describe("formatWeekOutcomeReport", () => {
  it("lists every week's status and detail, in order", () => {
    const report = formatWeekOutcomeReport([
      { week: 1, status: "created", detail: "Scheduled for Jan 5." },
      { week: 2, status: "failed", detail: "Canvas rejected the request." },
    ]);
    const lines = report.split("\n");
    expect(lines[0]).toBe("Week 1: created - Scheduled for Jan 5.");
    expect(lines[1]).toBe("Week 2: failed - Canvas rejected the request.");
  });

  it("always appends the break-weeks-not-excluded disclosure, even for an empty plan", () => {
    const report = formatWeekOutcomeReport([]);
    expect(report).toContain("break weeks");
  });

  it("states the underlying error for a failure rather than an aggregate message", () => {
    const report = formatWeekOutcomeReport([
      { week: 1, status: "failed", detail: "HTTP 500 from Canvas." },
    ]);
    expect(report).toContain("HTTP 500 from Canvas.");
  });
});

describe("parsePostTime", () => {
  // docs/announcement-post-time-acceptance-criteria.md T2: every valid parse
  // and every blank fallback is explicitly `invalid: false` - only a
  // present-but-unparseable value ever sets `invalid: true`. Asserted via
  // toEqual (a full object match, not toMatchObject) so a future change that
  // adds `invalid: true` somewhere it should not be fails these too, not
  // just the dedicated "reports" describe block below.
  it("parses a valid 24-hour HH:MM time, including the 00:00 and 23:59 boundaries", () => {
    expect(parsePostTime("09:30")).toEqual({ hour: 9, minute: 30, invalid: false });
    expect(parsePostTime("23:59")).toEqual({ hour: 23, minute: 59, invalid: false });
    expect(parsePostTime("00:00")).toEqual({ hour: 0, minute: 0, invalid: false });
  });

  it("tolerates a single-digit hour", () => {
    expect(parsePostTime("9:05")).toEqual({ hour: 9, minute: 5, invalid: false });
  });

  it("falls back to the default post time (8:00 AM) when blank, WITHOUT being reported as invalid", () => {
    // T2 item 4: blank is the documented, intended way to get the default -
    // never a defect, so `invalid` must be false here, not merely "falsy" -
    // toEqual (not toMatchObject) is what actually pins that down.
    expect(parsePostTime("")).toEqual({ hour: DEFAULT_POST_HOUR, minute: DEFAULT_POST_MINUTE, invalid: false });
    expect(parsePostTime(null)).toEqual({ hour: DEFAULT_POST_HOUR, minute: DEFAULT_POST_MINUTE, invalid: false });
    expect(parsePostTime(undefined)).toEqual({
      hour: DEFAULT_POST_HOUR,
      minute: DEFAULT_POST_MINUTE,
      invalid: false,
    });
    // Whitespace-only also counts as blank (trimmed to "" before the blank
    // check), not as a present-but-invalid value.
    expect(parsePostTime("   ")).toEqual({ hour: DEFAULT_POST_HOUR, minute: DEFAULT_POST_MINUTE, invalid: false });
  });

  it("falls back to the default post time for an unparseable value, rather than throwing, AND reports it as invalid", () => {
    // T3 item 8: the strict HH:MM contract is unchanged - a time picker
    // removes the need for lenient parsing, it does not license guessing at
    // any of these. Each of these is present (non-blank) and malformed, so
    // each must come back `invalid: true` - this is the "present-but-
    // unparseable -> default AND reported" half of T2 item 5.
    const cases = [
      "not a time",
      "25:00",
      "12:60",
      "24:00", // out of 24-hour range even though each digit alone is valid
      "9.30", // a period, not a colon - what docs/announcement-post-time-acceptance-criteria.md's own diagnosis names as one of today's silent failures
      "9:30am", // a 12-hour suffix - the OTHER example that diagnosis names
      "09:30 AM",
      "09: 30", // whitespace INSIDE the HH:MM structure - not the same as the
      // surrounding whitespace the next test shows is fine to trim
    ];
    for (const raw of cases) {
      expect(parsePostTime(raw)).toEqual({
        hour: DEFAULT_POST_HOUR,
        minute: DEFAULT_POST_MINUTE,
        invalid: true,
      });
    }
  });

  it("trims ordinary surrounding whitespace around an otherwise-valid time without reporting it as invalid", () => {
    // Only whitespace INSIDE the HH:MM structure (the "09: 30" case above) is
    // invalid - whitespace merely surrounding an otherwise-valid value is not
    // a mistake worth reporting, matching this function's pre-existing trim
    // behavior.
    expect(parsePostTime("  09:30  ")).toEqual({ hour: 9, minute: 30, invalid: false });
  });
});

describe("buildAnnouncementSchedule with an explicit post time", () => {
  const start = new Date(2026, 0, 5); // Monday
  const MONDAY = 1;

  it("defaults every slot to 8:00 AM when no post time is given (unchanged original behavior)", () => {
    const slots = buildAnnouncementSchedule(start, 2, MONDAY);
    for (const slot of slots) {
      expect(slot.postAt.getHours()).toBe(DEFAULT_POST_HOUR);
      expect(slot.postAt.getMinutes()).toBe(DEFAULT_POST_MINUTE);
    }
  });

  it("uses the given post time for every slot", () => {
    const slots = buildAnnouncementSchedule(start, 2, MONDAY, { hour: 14, minute: 15 });
    for (const slot of slots) {
      expect(slot.postAt.getHours()).toBe(14);
      expect(slot.postAt.getMinutes()).toBe(15);
    }
  });

  it("does not change the calendar date - only the time of day", () => {
    const withDefault = buildAnnouncementSchedule(start, 1, MONDAY)[0].postAt;
    const withCustom = buildAnnouncementSchedule(start, 1, MONDAY, { hour: 20, minute: 0 })[0].postAt;
    expect(withCustom.toDateString()).toBe(withDefault.toDateString());
  });
});

// Regression guard: this suite otherwise never imports planAnnouncements, so
// it was blind to a sabotage that made the planner ignore every existing row
// and re-create the whole term (byWeek.get(slot.week) changed to
// byWeek.get(-1) in src/lib/announcement-schedule.ts) - the single most
// important behavior in AC3 (idempotency). announcement-schedule.test.ts
// already covers this from the "TDD contract" side; these two tests close the
// gap independently, from this file's own side, so a future edit to this
// suite alone cannot regress back to blindness.
describe("planAnnouncements consults existing rows before deciding an action (regression guard)", () => {
  const start = new Date(2026, 0, 5); // Monday
  const MONDAY = 1;
  const beforeTerm = new Date(2026, 0, 1);

  it("recognizes a stored row for every desired week as already scheduled, rather than creating duplicates", () => {
    const slots = buildAnnouncementSchedule(start, 3, MONDAY);
    const existing: ExistingAnnouncementRow[] = slots.map((s) => ({
      weekNumber: s.week,
      status: "confirmed",
      topicId: 100 + s.week,
      postedAt: null,
      scheduledFor: s.postAt.toISOString(),
    }));
    const plan = planAnnouncements(slots, existing, beforeTerm);
    expect(plan.map((p) => p.action)).toEqual([
      "already-present",
      "already-present",
      "already-present",
    ]);
  });

  it("keys the lookup on THIS week's number - a row stored only for week 2 must not affect weeks 1 or 3", () => {
    // Distinguishes "existing rows are consulted at all" from "consulted
    // correctly": a planner that ignores the key entirely (or looks every
    // week up under the same wrong key) would either create all three weeks
    // or treat all three as already-present. Only the middle week has a row.
    const slots = buildAnnouncementSchedule(start, 3, MONDAY);
    const existing: ExistingAnnouncementRow[] = [
      {
        weekNumber: 2,
        status: "confirmed",
        topicId: 202,
        postedAt: null,
        scheduledFor: slots[1].postAt.toISOString(),
      },
    ];
    const plan = planAnnouncements(slots, existing, beforeTerm);
    expect(plan.map((p) => p.action)).toEqual(["create", "already-present", "create"]);
  });
});
