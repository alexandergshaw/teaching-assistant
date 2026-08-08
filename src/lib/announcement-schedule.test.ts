// TDD contract for weekly announcement scheduling -
// docs/weekly-announcement-scheduling-acceptance-criteria.md.
//
// Written BEFORE the implementation; these currently FAIL because the two
// modules under test do not exist yet. Make them pass without changing what
// they assert. If one is wrong, report it rather than editing it.
//
// Both modules must stay PURE. The scheduling module is reachable from a
// workflow registry file, and registry files are client-bundled - importing
// @/lib/supabase/server, @/app/actions/shared or next/headers from here would
// break `next build` while tsc, eslint and vitest all stayed green.
//
// Nothing here calls Date.now(). `now` is injected everywhere so the suite
// cannot drift into vacuity as real time passes.
import { describe, it, expect } from "vitest";
import { parseNextLink } from "@/lib/canvas/pagination";
import {
  buildAnnouncementSchedule,
  planAnnouncements,
  type ExistingAnnouncementRow,
} from "@/lib/announcement-schedule";

describe("parseNextLink", () => {
  const full =
    '<https://x.instructure.com/api/v1/courses/1/discussion_topics?page=1>; rel="current",' +
    '<https://x.instructure.com/api/v1/courses/1/discussion_topics?page=2>; rel="next",' +
    '<https://x.instructure.com/api/v1/courses/1/discussion_topics?page=1>; rel="first",' +
    '<https://x.instructure.com/api/v1/courses/1/discussion_topics?page=9>; rel="last"';

  it("returns the next page URL", () => {
    expect(parseNextLink(full)).toBe(
      "https://x.instructure.com/api/v1/courses/1/discussion_topics?page=2"
    );
  });

  it("returns null when there is no next rel, even though last is present", () => {
    // AC4 item 14: absence of rel="next" is the ONLY reliable terminator.
    const lastPage =
      '<https://x.instructure.com/api/v1/courses/1/discussion_topics?page=9>; rel="current",' +
      '<https://x.instructure.com/api/v1/courses/1/discussion_topics?page=1>; rel="first",' +
      '<https://x.instructure.com/api/v1/courses/1/discussion_topics?page=9>; rel="last"';
    expect(parseNextLink(lastPage)).toBeNull();
  });

  it("returns a next URL even when rel=last is omitted entirely", () => {
    // Canvas may omit rel="last" when the total is expensive to compute, so a
    // reader that requires it would stop after page one.
    const noLast =
      '<https://x.instructure.com/api/v1/courses/1/discussion_topics?page=1>; rel="current",' +
      '<https://x.instructure.com/api/v1/courses/1/discussion_topics?page=2>; rel="next"';
    expect(parseNextLink(noLast)).toBe(
      "https://x.instructure.com/api/v1/courses/1/discussion_topics?page=2"
    );
  });

  it("handles a missing or empty header", () => {
    expect(parseNextLink(null)).toBeNull();
    expect(parseNextLink(undefined)).toBeNull();
    expect(parseNextLink("")).toBeNull();
  });

  it("does not mistake rel=next-page or similar for rel=next", () => {
    const decoy = '<https://x/api/v1/a?page=2>; rel="next-page"';
    expect(parseNextLink(decoy)).toBeNull();
  });

  it("matches rel case-insensitively", () => {
    // AC4 item 14 requires the header be read case-insensitively.
    expect(parseNextLink('<https://x/api/v1/a?page=2>; rel="NEXT"')).toBe(
      "https://x/api/v1/a?page=2"
    );
  });

  it("tolerates single quotes, no quotes, and extra whitespace around rel", () => {
    expect(parseNextLink("<https://x/api/v1/a?page=2>;   rel=next")).toBe(
      "https://x/api/v1/a?page=2"
    );
    expect(parseNextLink("<https://x/api/v1/a?page=2>; rel='next'")).toBe(
      "https://x/api/v1/a?page=2"
    );
  });
});

describe("buildAnnouncementSchedule", () => {
  // 2026-01-05 is a Monday. Constructed with explicit numeric args rather than
  // a date-only string, which Date.parse would read as UTC midnight and shift
  // the weekday for anyone west of UTC.
  const start = new Date(2026, 0, 5);
  const MONDAY = 1;
  const THURSDAY = 4;

  it("produces one slot per in-session week", () => {
    expect(buildAnnouncementSchedule(start, 15, MONDAY)).toHaveLength(15);
  });

  it("numbers weeks from 1", () => {
    const slots = buildAnnouncementSchedule(start, 5, MONDAY);
    expect(slots.map((s) => s.week)).toEqual([1, 2, 3, 4, 5]);
  });

  it("ANCHORS week 1 to an absolute date", () => {
    // Without an absolute anchor, every other test in this block is invariant
    // under a whole-week shift: count, numbering, weekday, 7-day spacing and
    // the empty case all still hold if the schedule starts a week late. This
    // test is the only thing standing between the suite and an off-by-one-week
    // implementation.
    expect(buildAnnouncementSchedule(start, 1, MONDAY)[0].postAt.toDateString()).toBe(
      "Mon Jan 05 2026"
    );
  });

  it("anchors a non-start weekday to an absolute date too", () => {
    // The term starts Monday Jan 5; the first Thursday of week 1 is Jan 8.
    expect(buildAnnouncementSchedule(start, 1, THURSDAY)[0].postAt.toDateString()).toBe(
      "Thu Jan 08 2026"
    );
  });

  it("anchors the full four-week Monday run", () => {
    expect(
      buildAnnouncementSchedule(start, 4, MONDAY).map((s) => s.postAt.toDateString())
    ).toEqual([
      "Mon Jan 05 2026",
      "Mon Jan 12 2026",
      "Mon Jan 19 2026",
      "Mon Jan 26 2026",
    ]);
  });

  it("puts EVERY slot on the requested weekday", () => {
    // AC1 item 1 - the whole point of the feature. The existing step inherits
    // whatever weekday the course start date falls on; this must not.
    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
      for (const slot of buildAnnouncementSchedule(start, 15, day)) {
        expect(slot.postAt.getDay()).toBe(day);
      }
    }
  });

  it("chooses a weekday independent of the start date's own weekday", () => {
    // Thursday slots must be Thursdays even though the term starts on a Monday.
    const slots = buildAnnouncementSchedule(start, 4, THURSDAY);
    expect(slots.every((s) => s.postAt.getDay() === THURSDAY)).toBe(true);
  });

  it("spaces consecutive slots exactly seven days apart", () => {
    const slots = buildAnnouncementSchedule(start, 6, THURSDAY);
    for (let i = 1; i < slots.length; i++) {
      const days =
        (slots[i].postAt.getTime() - slots[i - 1].postAt.getTime()) / 86_400_000;
      expect(Math.round(days)).toBe(7);
    }
  });

  it("returns an empty schedule for a zero or negative week count", () => {
    expect(buildAnnouncementSchedule(start, 0, MONDAY)).toEqual([]);
    expect(buildAnnouncementSchedule(start, -3, MONDAY)).toEqual([]);
  });
});

describe("planAnnouncements", () => {
  const start = new Date(2026, 0, 5);
  const MONDAY = 1;
  const slots = () => buildAnnouncementSchedule(start, 4, MONDAY);
  /** Before the term begins, so every slot is in the future. */
  const beforeTerm = new Date(2026, 0, 1);

  const row = (
    over: Partial<ExistingAnnouncementRow> & { weekNumber: number }
  ): ExistingAnnouncementRow => ({
    status: "confirmed",
    topicId: 100 + over.weekNumber,
    postedAt: null,
    scheduledFor: null,
    ...over,
  });

  it("creates every week when nothing exists yet", () => {
    const plan = planAnnouncements(slots(), [], beforeTerm);
    expect(plan.map((p) => p.action)).toEqual([
      "create",
      "create",
      "create",
      "create",
    ]);
  });

  it("RE-RUNNING A FULLY SCHEDULED TERM CREATES NOTHING", () => {
    // AC3 item 12, the single most important check here. Today, with no
    // idempotency anywhere in the Canvas layer, a re-run duplicates the term.
    const existing = slots().map((s) =>
      row({ weekNumber: s.week, scheduledFor: s.postAt.toISOString() })
    );
    const plan = planAnnouncements(slots(), existing, beforeTerm);
    // Asserted as an exact array, NOT with .every/.some: `every` on an empty
    // array is vacuously true and `some` is false, so a plan of [] would sail
    // through both and this test would pass while returning nothing at all.
    expect(plan.map((p) => p.action)).toEqual([
      "already-present",
      "already-present",
      "already-present",
      "already-present",
    ]);
  });

  it("skips a week whose slot has already passed instead of creating it", () => {
    // AC2 item 6. Slots are Mon Jan 5, 12, 19, 26. Evaluated on Wed Jan 14,
    // weeks 1 and 2 are behind us and weeks 3 and 4 are still ahead.
    const midTerm = new Date(2026, 0, 14);
    const plan = planAnnouncements(slots(), [], midTerm);
    expect(plan.filter((p) => p.action === "skip-past").map((p) => p.week)).toEqual([
      1, 2,
    ]);
    expect(plan.filter((p) => p.action === "create").map((p) => p.week)).toEqual([
      3, 4,
    ]);
  });

  it("treats the boundary correctly one day after a slot", () => {
    // Jan 20 is one day past the week-3 slot (Mon Jan 19), so THREE weeks are
    // behind us, not two. Pins the boundary that the previous test deliberately
    // steps around.
    const plan = planAnnouncements(slots(), [], new Date(2026, 0, 20));
    expect(plan.filter((p) => p.action === "skip-past").map((p) => p.week)).toEqual([
      1, 2, 3,
    ]);
    expect(plan.filter((p) => p.action === "create").map((p) => p.week)).toEqual([4]);
  });

  it("reschedules a not-yet-posted announcement whose date drifted", () => {
    // AC6 item 22 - a start-date edit keys to the SAME row and updates it.
    const existing = [
      row({ weekNumber: 1, scheduledFor: new Date(2026, 0, 12).toISOString() }),
    ];
    const plan = planAnnouncements(slots(), existing, beforeTerm);
    const week1 = plan.find((p) => p.week === 1)!;
    expect(week1.action).toBe("reschedule");
    expect(plan.some((p) => p.week === 1 && p.action === "create")).toBe(false);
  });

  it("NEVER modifies an announcement Canvas has already posted", () => {
    // AC6 item 23. Updating delayed_post_at on an already-posted topic is
    // undocumented in the Canvas API and reported as buggy in production, so
    // the feature must not depend on it - it reports and leaves it alone.
    const existing = [
      row({
        weekNumber: 1,
        postedAt: new Date(2026, 0, 5).toISOString(),
        scheduledFor: new Date(2026, 0, 12).toISOString(),
      }),
    ];
    const plan = planAnnouncements(slots(), existing, beforeTerm);
    const week1 = plan.find((p) => p.week === 1)!;
    expect(week1.action).toBe("leave-posted");
  });

  it("treats a pending row as ambiguous, never as a licence to re-create", () => {
    // AC3 item 11: a crash may have landed either side of Canvas's create, so a
    // pending row is resolved by targeted read-back, not a blind second POST.
    const existing = [row({ weekNumber: 2, status: "pending", topicId: null })];
    const plan = planAnnouncements(slots(), existing, beforeTerm);
    const week2 = plan.find((p) => p.week === 2)!;
    expect(week2.action).toBe("resolve-pending");
    expect(week2.action).not.toBe("create");
  });

  it("still resolves a pending row that DOES carry a topic id", () => {
    // The crash-landed-after-create case AC3 item 11 exists for: Canvas
    // returned an id but the confirm write never committed. Still ambiguous,
    // still resolved by read-back, never re-created.
    const existing = [row({ weekNumber: 2, status: "pending", topicId: 902 })];
    const plan = planAnnouncements(slots(), existing, beforeTerm);
    expect(plan.find((p) => p.week === 2)!.action).toBe("resolve-pending");
  });

  it("reports an existing row as already present even when its slot has passed", () => {
    // AC2 item 6 says a past week is skipped; AC3 item 12 says a re-run reports
    // every week as already present. A mid-term re-run is the ordinary case and
    // hits both at once. An existing row WINS: reporting "skipped, past" when an
    // announcement is in fact scheduled would tell the user the opposite of the
    // truth.
    const existing = slots().map((s) =>
      row({ weekNumber: s.week, scheduledFor: s.postAt.toISOString() })
    );
    const plan = planAnnouncements(slots(), existing, new Date(2026, 0, 14));
    expect(plan.map((p) => p.action)).toEqual([
      "already-present",
      "already-present",
      "already-present",
      "already-present",
    ]);
  });

  it("reschedules a confirmed row whose scheduledFor was never recorded", () => {
    // A confirmed row with scheduledFor null means we do not know what date was
    // written to Canvas. Rewriting the date is safe and idempotent; creating is
    // not. So the ambiguity resolves toward reschedule, never toward create.
    const existing = [row({ weekNumber: 1, scheduledFor: null })];
    const plan = planAnnouncements(slots(), existing, beforeTerm);
    expect(plan.find((p) => p.week === 1)!.action).toBe("reschedule");
  });

  it("keys on week number, not on date, so a shifted term reuses its rows", () => {
    // AC3 item 9. Re-derive the schedule from a start date one week later:
    // every date changes, but the four rows must still be recognised.
    const shifted = buildAnnouncementSchedule(new Date(2026, 0, 12), 4, MONDAY);
    const existing = slots().map((s) =>
      row({ weekNumber: s.week, scheduledFor: s.postAt.toISOString() })
    );
    const plan = planAnnouncements(shifted, existing, beforeTerm);
    // Exact array again, for the same empty-plan reason as above.
    expect(plan.map((p) => p.action)).toEqual([
      "reschedule",
      "reschedule",
      "reschedule",
      "reschedule",
    ]);
  });

  it("returns exactly one action per desired week, in week order", () => {
    const existing = [
      row({ weekNumber: 2, postedAt: new Date(2026, 0, 12).toISOString() }),
      row({ weekNumber: 4, status: "pending", topicId: null }),
    ];
    const plan = planAnnouncements(slots(), existing, beforeTerm);
    expect(plan.map((p) => p.week)).toEqual([1, 2, 3, 4]);
  });

  it("ignores a stored row for a week that is no longer in session", () => {
    // Term shortened from 4 weeks to 2: weeks 3 and 4 are no longer desired and
    // must not appear in the plan at all.
    const existing = slots().map((s) => row({ weekNumber: s.week }));
    const shorter = buildAnnouncementSchedule(start, 2, MONDAY);
    const plan = planAnnouncements(shorter, existing, beforeTerm);
    expect(plan.map((p) => p.week)).toEqual([1, 2]);
  });
});
