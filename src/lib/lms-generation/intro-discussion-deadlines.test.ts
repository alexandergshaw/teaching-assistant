import { describe, it, expect } from "vitest";
import {
  INITIAL_POST_RULE,
  REPLIES_RULE,
  REQUIRED_REPLY_COUNT,
  INTRO_DISCUSSION_POINTS,
  INITIAL_POST_POINTS,
  REPLIES_POINTS,
  planIntroDiscussionDeadlines,
  describeMissingDeadlines,
  formatDeadlineForPrompt,
  splitCheckpointPoints,
  NO_DATE_INITIAL_POST_TEXT,
  NO_DATE_REPLIES_TEXT,
} from "./intro-discussion-deadlines";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

describe("INITIAL_POST_RULE / REPLIES_RULE", () => {
  it("is Thursday 23:59 for the initial post and Sunday 23:59 for the replies", () => {
    expect(INITIAL_POST_RULE).toEqual({ day: "thu", time: "23:59" });
    expect(REPLIES_RULE).toEqual({ day: "sun", time: "23:59" });
  });
});

describe("planIntroDiscussionDeadlines - Thursday is 3 days before Sunday", () => {
  it.each([1, 2, 5, 14])("holds for week %d", (week) => {
    const result = planIntroDiscussionDeadlines({
      startDate: "2026-01-05", // a Monday
      moduleName: `Module ${week}`,
    });
    expect(result).not.toBeNull();
    const diff = result!.repliesDueAt.getTime() - result!.initialPostAt.getTime();
    expect(diff).toBe(THREE_DAYS_MS);
  });
});

describe("planIntroDiscussionDeadlines - weekday correctness against frozen literals", () => {
  // Seven consecutive calendar days (Jan 4-10, 2026), one of each weekday -
  // the same convention assignment-due-rule.test.ts uses, so we don't
  // hardcode which real-world date falls on which weekday from scratch.
  // Expected values below were computed BY HAND against the Monday-anchored
  // week rule (never by calling dueDateForWeek/planIntroDiscussionDeadlines
  // itself), per docs/DEV_LOOP.md step 9's "frozen literal oracle" rule.
  const cases: Array<{ start: string; expectedInitialPost: Date; expectedReplies: Date }> = [
    {
      start: "2026-01-04", // Sunday
      expectedInitialPost: new Date(2026, 0, 1, 23, 59, 0, 0),
      expectedReplies: new Date(2026, 0, 4, 23, 59, 0, 0),
    },
    {
      start: "2026-01-05", // Monday
      expectedInitialPost: new Date(2026, 0, 8, 23, 59, 0, 0),
      expectedReplies: new Date(2026, 0, 11, 23, 59, 0, 0),
    },
    {
      start: "2026-01-06", // Tuesday
      expectedInitialPost: new Date(2026, 0, 8, 23, 59, 0, 0),
      expectedReplies: new Date(2026, 0, 11, 23, 59, 0, 0),
    },
    {
      start: "2026-01-07", // Wednesday
      expectedInitialPost: new Date(2026, 0, 8, 23, 59, 0, 0),
      expectedReplies: new Date(2026, 0, 11, 23, 59, 0, 0),
    },
    {
      start: "2026-01-08", // Thursday
      expectedInitialPost: new Date(2026, 0, 8, 23, 59, 0, 0),
      expectedReplies: new Date(2026, 0, 11, 23, 59, 0, 0),
    },
    {
      start: "2026-01-09", // Friday
      expectedInitialPost: new Date(2026, 0, 8, 23, 59, 0, 0),
      expectedReplies: new Date(2026, 0, 11, 23, 59, 0, 0),
    },
    {
      start: "2026-01-10", // Saturday
      expectedInitialPost: new Date(2026, 0, 8, 23, 59, 0, 0),
      expectedReplies: new Date(2026, 0, 11, 23, 59, 0, 0),
    },
  ];

  it.each(cases)(
    "course starting $start yields the frozen-literal week-1 deadlines",
    ({ start, expectedInitialPost, expectedReplies }) => {
      const result = planIntroDiscussionDeadlines({ startDate: start, moduleName: "Module 1" });
      expect(result).not.toBeNull();
      expect(result!.initialPostAt.getTime()).toBe(expectedInitialPost.getTime());
      expect(result!.repliesDueAt.getTime()).toBe(expectedReplies.getTime());
      expect(result!.initialPostAt.getDay()).toBe(4); // Thursday
      expect(result!.repliesDueAt.getDay()).toBe(0); // Sunday
    }
  );
});

describe("planIntroDiscussionDeadlines - both times are exactly 23:59:00.000 local", () => {
  it("zeroes seconds and milliseconds on both deadlines", () => {
    const result = planIntroDiscussionDeadlines({ startDate: "2026-01-05", moduleName: "Module 3" });
    expect(result).not.toBeNull();
    for (const d of [result!.initialPostAt, result!.repliesDueAt]) {
      expect(d.getHours()).toBe(23);
      expect(d.getMinutes()).toBe(59);
      expect(d.getSeconds()).toBe(0);
      expect(d.getMilliseconds()).toBe(0);
    }
  });
});

describe("planIntroDiscussionDeadlines - week comes from the module NAME", () => {
  it.each(["Module 07: Loops", "Week 7", "Module07", "Module 7"])(
    "%s yields week 7",
    (moduleName) => {
      const result = planIntroDiscussionDeadlines({ startDate: "2026-01-05", moduleName });
      expect(result).not.toBeNull();
      expect(result!.week).toBe(7);
    }
  );

  it("is unaffected by list position - only the name is read", () => {
    // Same name, computed standalone: a module named "Module 07: Loops"
    // yields week 7 regardless of where it sits in any caller's array,
    // because this function never receives or looks at an index/position.
    const result = planIntroDiscussionDeadlines({ startDate: "2026-01-05", moduleName: "Module 07: Loops" });
    expect(result).not.toBeNull();
    expect(result!.week).toBe(7);
  });
});

describe("planIntroDiscussionDeadlines - null cases", () => {
  it("is null for a blank or malformed start date", () => {
    expect(planIntroDiscussionDeadlines({ startDate: "", moduleName: "Module 1" })).toBeNull();
    expect(planIntroDiscussionDeadlines({ startDate: "   ", moduleName: "Module 1" })).toBeNull();
    expect(planIntroDiscussionDeadlines({ startDate: null, moduleName: "Module 1" })).toBeNull();
    expect(planIntroDiscussionDeadlines({ startDate: undefined, moduleName: "Module 1" })).toBeNull();
    expect(planIntroDiscussionDeadlines({ startDate: "not-a-date", moduleName: "Module 1" })).toBeNull();
  });

  it("is null for a module name with no derivable week number", () => {
    expect(planIntroDiscussionDeadlines({ startDate: "2026-01-05", moduleName: "Course Resources" })).toBeNull();
  });
});

describe("describeMissingDeadlines", () => {
  it("returns null when deadlines were computed", () => {
    expect(describeMissingDeadlines({ startDate: "2026-01-05", moduleName: "Module 1" })).toBeNull();
  });

  it("returns a distinct, non-empty string for a missing start date", () => {
    const message = describeMissingDeadlines({ startDate: "", moduleName: "Module 1" });
    expect(message).not.toBeNull();
    expect(message!.length).toBeGreaterThan(0);
  });

  it("returns a distinct, non-empty string for a module name with no week number", () => {
    const message = describeMissingDeadlines({ startDate: "2026-01-05", moduleName: "Course Resources" });
    expect(message).not.toBeNull();
    expect(message!.length).toBeGreaterThan(0);
  });

  it("the two failure messages are different from each other", () => {
    const noStartDate = describeMissingDeadlines({ startDate: "", moduleName: "Module 1" });
    const noWeekNumber = describeMissingDeadlines({ startDate: "2026-01-05", moduleName: "Course Resources" });
    expect(noStartDate).not.toBe(noWeekNumber);
  });
});

describe("points constants", () => {
  it("the two checkpoint splits sum to the total", () => {
    expect(INITIAL_POST_POINTS + REPLIES_POINTS).toBe(INTRO_DISCUSSION_POINTS);
  });

  it("required reply count is 2", () => {
    expect(REQUIRED_REPLY_COUNT).toBe(2);
  });
});

describe("splitCheckpointPoints", () => {
  it("splits the real INTRO_DISCUSSION_POINTS total evenly (10/10), matching the ratio constants", () => {
    expect(splitCheckpointPoints(INTRO_DISCUSSION_POINTS)).toEqual({ initialPostPoints: 10, repliesPoints: 10 });
  });

  it("SABOTAGE TARGET: the two halves always sum EXACTLY to the input, for an odd total too", () => {
    for (const total of [1, 3, 7, 15, 21, 100]) {
      const { initialPostPoints, repliesPoints } = splitCheckpointPoints(total);
      expect(initialPostPoints + repliesPoints).toBe(total);
    }
  });

  it("an odd total's leftover half-point lands on the initial-post checkpoint (Math.round rounds .5 up)", () => {
    // 15 * (10/20) = 7.5 -> rounds to 8 for the initial post, leaving 7 for replies.
    expect(splitCheckpointPoints(15)).toEqual({ initialPostPoints: 8, repliesPoints: 7 });
  });

  it("zero splits to zero/zero, never a negative or NaN share", () => {
    expect(splitCheckpointPoints(0)).toEqual({ initialPostPoints: 0, repliesPoints: 0 });
  });
});

describe("formatDeadlineForPrompt", () => {
  it("formats a frozen literal date deterministically", () => {
    // 2026-09-10 is a real Thursday - matches the AC's own worked example.
    expect(formatDeadlineForPrompt(new Date(2026, 8, 10, 23, 59, 0, 0))).toBe(
      "Thursday, September 10, 2026 at 11:59 PM"
    );
  });

  it("formats midnight/AM and single-digit minutes correctly", () => {
    // 2026-01-01 is a real Thursday (see assignment-due-rule.test.ts's own
    // Jan 4-10, 2026 weekday block for the same calendar).
    expect(formatDeadlineForPrompt(new Date(2026, 0, 1, 0, 5, 0, 0))).toBe(
      "Thursday, January 1, 2026 at 12:05 AM"
    );
  });

  it("formats the noon boundary as 12:00 PM, not AM", () => {
    expect(formatDeadlineForPrompt(new Date(2026, 0, 1, 12, 0, 0, 0))).toBe(
      "Thursday, January 1, 2026 at 12:00 PM"
    );
  });
});

describe("NO_DATE_* text", () => {
  it("names Thursday for the initial post and Sunday for the replies", () => {
    expect(NO_DATE_INITIAL_POST_TEXT).toBe("11:59pm Thursday of this module's week");
    expect(NO_DATE_REPLIES_TEXT).toBe("11:59pm Sunday of this module's week");
  });
});
