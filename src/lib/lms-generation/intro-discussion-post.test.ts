import { describe, it, expect, vi } from "vitest";
import { planIntroDiscussionPost } from "./intro-discussion-post";

describe("planIntroDiscussionPost - real deadlines", () => {
  // Finding 9 (fix): this used to compare against
  // `planIntroDiscussionDeadlines(...).toISOString()` - the LITERAL
  // expression the implementation itself evaluates, making the assertion a
  // tautology that can never fail even if the underlying week/weekday
  // arithmetic were wrong. Replaced with a frozen literal date, computed BY
  // HAND (docs/DEV_LOOP.md step 9): 2026-01-05 is a Monday, so week 1's
  // Thursday is 2026-01-08 and week 1's Sunday is 2026-01-11
  // (intro-discussion-deadlines.test.ts's own frozen-literal block owns
  // proving that arithmetic; this test's job is only "did this leaf wire the
  // ISO conversion/note text correctly").
  it("returns both ISO instants (frozen literal oracle) and a note stating both dates in full", () => {
    const result = planIntroDiscussionPost({ startDate: "2026-01-05", targetModuleName: "Module 1" });

    const expectedInitialPostAt = new Date(2026, 0, 8, 23, 59, 0, 0).toISOString();
    const expectedRepliesDueAt = new Date(2026, 0, 11, 23, 59, 0, 0).toISOString();

    expect(result.deadlines.initialPostAt).toBe(expectedInitialPostAt);
    expect(result.deadlines.repliesDueAt).toBe(expectedRepliesDueAt);
    expect(result.note).toContain("Initial post due");
    expect(result.note).toContain("Replies due");
    expect(result.note.length).toBeGreaterThan(0);
  });

  // Finding 10 (fix): the old version of this test called
  // planIntroDiscussionPost twice back-to-back and compared the results -
  // that passes for a Date.now()-based implementation just as readily as a
  // correct one, since two calls made microseconds apart almost always land
  // in the same millisecond. Made ACTUALLY able to fail by pinning the system
  // clock to two very different instants (via vi.useFakeTimers) around the
  // two calls: if the implementation ever read the ambient clock instead of
  // only `startDate`/`targetModuleName`, the two results would differ here.
  it("SABOTAGE TARGET: the two ISO instants are independent of the ambient clock - not derived from Date.now()", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2000, 0, 1));
      const a = planIntroDiscussionPost({ startDate: "2026-01-05", targetModuleName: "Module 3" });
      vi.setSystemTime(new Date(2030, 5, 15));
      const b = planIntroDiscussionPost({ startDate: "2026-01-05", targetModuleName: "Module 3" });
      expect(a).toEqual(b);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("planIntroDiscussionPost - the two null causes stay distinct", () => {
  it("no start date: empty deadlines and a note naming that specific reason", () => {
    const result = planIntroDiscussionPost({ startDate: "", targetModuleName: "Module 1" });
    expect(result.deadlines).toEqual({ initialPostAt: "", repliesDueAt: "" });
    expect(result.note.toLowerCase()).toContain("start date");
  });

  it("no derivable week number: empty deadlines and a note naming that specific reason", () => {
    const result = planIntroDiscussionPost({ startDate: "2026-01-05", targetModuleName: "Course Resources" });
    expect(result.deadlines).toEqual({ initialPostAt: "", repliesDueAt: "" });
    expect(result.note.toLowerCase()).toContain("week number");
  });

  it("the two failure notes are different from each other - never one generic message", () => {
    const noStartDate = planIntroDiscussionPost({ startDate: "", targetModuleName: "Module 1" });
    const noWeekNumber = planIntroDiscussionPost({ startDate: "2026-01-05", targetModuleName: "Course Resources" });
    expect(noStartDate.note).not.toBe(noWeekNumber.note);
  });
});
