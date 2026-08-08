// Tests for scheduleWeeklyAnnouncementsAction, the ONE server action that
// owns every Canvas call and every mapping-table read/write for the weekly
// announcement scheduling feature
// (docs/weekly-announcement-scheduling-acceptance-criteria.md). Every I/O
// boundary is mocked (auth, the Supabase service client, the mapping-table
// module, and the Canvas transport functions); the REAL
// src/lib/announcement-schedule.ts (buildAnnouncementSchedule,
// planAnnouncements, findMatchingAnnouncement, renderAnnouncementTemplate,
// formatWeekOutcomeReport) runs unmocked, so these tests exercise the true
// wiring between the pure planning layer (already covered on its own by
// src/lib/announcement-schedule.test.ts) and this action's I/O.
//
// Mirrors src/app/actions/institution-page-attachments.test.ts's mocking
// pattern.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/supabase/weekly-announcement-schedule", () => ({
  listScheduledAnnouncementRows: vi.fn(),
  insertPendingScheduledAnnouncement: vi.fn(),
  confirmScheduledAnnouncement: vi.fn(),
  rescheduleScheduledAnnouncement: vi.fn(),
}));

vi.mock("@/lib/canvas", () => ({
  listAnnouncements: vi.fn(),
  createScheduledAnnouncementResilient: vi.fn(),
  updateAnnouncementSchedule: vi.fn(),
  getAnnouncementById: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import {
  listScheduledAnnouncementRows,
  insertPendingScheduledAnnouncement,
  confirmScheduledAnnouncement,
  rescheduleScheduledAnnouncement,
  type ScheduledAnnouncementRow,
} from "@/lib/supabase/weekly-announcement-schedule";
import {
  listAnnouncements,
  createScheduledAnnouncementResilient,
  updateAnnouncementSchedule,
  getAnnouncementById,
  type CanvasAnnouncement,
} from "@/lib/canvas";
import { scheduleWeeklyAnnouncementsAction } from "./canvas-inbox";

const OWNER = { id: "owner-1", email: "owner@example.com" };

// 2026-01-05 is a Monday; slots for weekday=1 (Monday) land on Jan 5 and
// Jan 12, both at 08:00 local (POST_HOUR in announcement-schedule.ts).
const START_DATE = "2026-01-05";
const WEEK1_ISO = new Date(2026, 0, 5, 8, 0, 0, 0).toISOString();
const WEEK2_ISO = new Date(2026, 0, 12, 8, 0, 0, 0).toISOString();
const BEFORE_TERM = new Date(2026, 0, 1);

function storedRow(overrides: Partial<ScheduledAnnouncementRow> & { weekNumber: number }): ScheduledAnnouncementRow {
  return {
    id: `row-${overrides.weekNumber}`,
    courseId: "hub-1",
    status: "confirmed",
    topicId: null,
    scheduledFor: null,
    title: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function liveAnnouncement(overrides: Partial<CanvasAnnouncement> & { id: number }): CanvasAnnouncement {
  return {
    title: "Week",
    message: "",
    postedAt: null,
    delayedPostAt: null,
    author: "",
    htmlUrl: "",
    ...overrides,
  };
}

async function run(
  overrides: Partial<{
    weekCount: number;
    weekday: number;
    postTime: string;
    testOverrides: { planningNow?: Date; clock?: () => number; budgetMs?: number };
  }> = {}
) {
  return scheduleWeeklyAnnouncementsAction(
    "hub-1",
    "https://canvas.example.edu/courses/123",
    "MCC",
    START_DATE,
    overrides.weekCount ?? 2,
    overrides.weekday ?? 1,
    overrides.postTime ?? "",
    "Week {week}",
    "Message for week {week}",
    overrides.testOverrides ?? { planningNow: BEFORE_TERM }
  );
}

describe("scheduleWeeklyAnnouncementsAction", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockReset().mockResolvedValue(OWNER as never);
    vi.mocked(listScheduledAnnouncementRows).mockReset();
    vi.mocked(insertPendingScheduledAnnouncement).mockReset();
    vi.mocked(confirmScheduledAnnouncement).mockReset();
    vi.mocked(rescheduleScheduledAnnouncement).mockReset();
    vi.mocked(listAnnouncements).mockReset();
    vi.mocked(createScheduledAnnouncementResilient).mockReset();
    vi.mocked(updateAnnouncementSchedule).mockReset();
    vi.mocked(getAnnouncementById).mockReset();
  });

  it("returns a clean error when the caller is not authorized", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new Error("Not authorized."));
    const r = await run();
    expect(r).toEqual({ error: "Not authorized." });
  });

  it.each([
    ["blank course tile id", { hubCourseId: "", courseUrl: undefined }],
    ["blank course URL", { hubCourseId: undefined, courseUrl: "" }],
  ])("validates %s", async (_label, override) => {
    const args = [
      override.hubCourseId ?? "hub-1",
      override.courseUrl ?? "https://canvas.example.edu/courses/123",
      "MCC",
      START_DATE,
      2,
      1,
      "",
      "Week {week}",
      "Message",
    ] as const;
    const r = await scheduleWeeklyAnnouncementsAction(...args);
    expect(r).toHaveProperty("error");
  });

  it("rejects an invalid start date, week count, and weekday", async () => {
    expect(
      await scheduleWeeklyAnnouncementsAction("hub-1", "https://canvas.example.edu/courses/123", "MCC", "not-a-date", 2, 1, "", "T", "M")
    ).toEqual({ error: "The course tile has no valid start date set." });
    expect(
      await scheduleWeeklyAnnouncementsAction("hub-1", "https://canvas.example.edu/courses/123", "MCC", START_DATE, 0, 1, "", "T", "M")
    ).toEqual({ error: "The course tile has no valid number of weeks set." });
    expect(
      await scheduleWeeklyAnnouncementsAction("hub-1", "https://canvas.example.edu/courses/123", "MCC", START_DATE, 2, 7, "", "T", "M")
    ).toEqual({ error: "Choose a weekday to post on." });
  });

  it("rejects a blank title or message", async () => {
    expect(
      await scheduleWeeklyAnnouncementsAction("hub-1", "https://canvas.example.edu/courses/123", "MCC", START_DATE, 2, 1, "", "", "M")
    ).toEqual({ error: "Provide a title and message for the announcement." });
  });

  it("DEFECT 2 FIX: a failure in the pre-loop Canvas read-back degrades to a per-week report instead of aborting the whole run into a single error", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([
      storedRow({ weekNumber: 1, topicId: 601, scheduledFor: WEEK1_ISO }),
      storedRow({ weekNumber: 2, topicId: 602, scheduledFor: WEEK2_ISO }),
    ]);
    vi.mocked(listAnnouncements).mockRejectedValue(new Error("Canvas returned HTTP 500."));

    const r = await run();
    if ("error" in r) {
      throw new Error("the action aborted into a single error instead of degrading to a per-week report: " + r.error);
    }

    // Every desired week is reported individually, each carrying the real
    // underlying error - never a single aggregate message (AC9 item 31).
    expect(r.result.weeks.map((w) => w.outcome)).toEqual(["failed", "failed"]);
    expect(r.result.weeks[0].detail).toContain("Canvas returned HTTP 500.");
    expect(r.result.weeks[1].detail).toContain("Canvas returned HTTP 500.");
    expect(r.result.failedCount).toBe(2);
    // Nothing is written to the mapping table when the read-back itself
    // failed - there is nothing safe to plan against.
    expect(insertPendingScheduledAnnouncement).not.toHaveBeenCalled();
    expect(confirmScheduledAnnouncement).not.toHaveBeenCalled();
    expect(createScheduledAnnouncementResilient).not.toHaveBeenCalled();
  });

  it("DEFECT 3 FIX: the elapsed-time budget starts before the read-back, so a slow read-back alone can exhaust it before week 1 is attempted", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([
      storedRow({ weekNumber: 1, topicId: 601, scheduledFor: WEEK1_ISO }),
    ]);
    let clockMs = 0;
    vi.mocked(listAnnouncements).mockImplementation(async () => {
      // Simulate the paginated read-back itself taking long enough, on its
      // own, to exceed the budget - before the per-week loop even starts.
      clockMs = 10_000;
      return [liveAnnouncement({ id: 601, postedAt: null, delayedPostAt: WEEK1_ISO })];
    });

    const r = await run({
      weekCount: 1,
      testOverrides: { planningNow: BEFORE_TERM, clock: () => clockMs, budgetMs: 5_000 },
    });
    if ("error" in r) throw new Error(r.error);

    expect(r.result.weeks.map((w) => w.outcome)).toEqual(["not-attempted"]);
    expect(r.result.stoppedEarly).toBe(true);
  });

  it("RE-RUNNING A FULLY SCHEDULED TERM CREATES NOTHING (AC3 item 12)", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([
      storedRow({ weekNumber: 1, topicId: 601, scheduledFor: WEEK1_ISO }),
      storedRow({ weekNumber: 2, topicId: 602, scheduledFor: WEEK2_ISO }),
    ]);
    vi.mocked(listAnnouncements).mockResolvedValue([
      liveAnnouncement({ id: 601, postedAt: null, delayedPostAt: WEEK1_ISO }),
      liveAnnouncement({ id: 602, postedAt: null, delayedPostAt: WEEK2_ISO }),
    ]);

    const r = await run();
    if ("error" in r) throw new Error(r.error);

    expect(r.result.weeks.map((w) => w.outcome)).toEqual(["already-present", "already-present"]);
    expect(r.result.createdCount).toBe(0);
    expect(createScheduledAnnouncementResilient).not.toHaveBeenCalled();
    expect(insertPendingScheduledAnnouncement).not.toHaveBeenCalled();
    // Opt-in pagination used (AC4): fetched once, with allPages true.
    expect(listAnnouncements).toHaveBeenCalledWith(
      "https://canvas.example.edu/courses/123",
      "MCC",
      { allPages: true }
    );
  });

  it("creates every week when nothing exists yet, write-ahead: insert pending BEFORE Canvas, confirm AFTER (AC3 item 10)", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([]);
    const calls: string[] = [];
    vi.mocked(insertPendingScheduledAnnouncement).mockImplementation(async (_s, _u, _c, week) => {
      calls.push(`insert-pending:${week}`);
      return storedRow({ weekNumber: week, status: "pending" });
    });
    vi.mocked(createScheduledAnnouncementResilient).mockImplementation(async (_url, title) => {
      calls.push(`canvas-create:${title}`);
      return { id: title === "Week 1" ? 701 : 702 };
    });
    vi.mocked(confirmScheduledAnnouncement).mockImplementation(async (_s, _u, _c, week, topicId) => {
      calls.push(`confirm:${week}:${topicId}`);
    });

    const r = await run();
    if ("error" in r) throw new Error(r.error);

    expect(r.result.weeks.map((w) => w.outcome)).toEqual(["created", "created"]);
    expect(r.result.createdCount).toBe(2);
    // listAnnouncements skipped entirely: nothing stored to read back yet.
    expect(listAnnouncements).not.toHaveBeenCalled();
    expect(calls).toEqual([
      "insert-pending:1",
      "canvas-create:Week 1",
      "confirm:1:701",
      "insert-pending:2",
      "canvas-create:Week 2",
      "confirm:2:702",
    ]);
  });

  it("honors an explicit post time instead of the 8am default, and defaults to 8am when blank", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([]);
    vi.mocked(insertPendingScheduledAnnouncement).mockResolvedValue(storedRow({ weekNumber: 1, status: "pending" }));
    vi.mocked(createScheduledAnnouncementResilient).mockResolvedValue({ id: 2001 });
    vi.mocked(confirmScheduledAnnouncement).mockResolvedValue(undefined);

    await run({ weekCount: 1, postTime: "09:30" });
    const [, , , postAtIso] = vi.mocked(createScheduledAnnouncementResilient).mock.calls[0];
    expect(postAtIso).toBe(new Date(2026, 0, 5, 9, 30, 0, 0).toISOString());

    vi.mocked(createScheduledAnnouncementResilient).mockClear();
    await run({ weekCount: 1, postTime: "" });
    const [, , , defaultPostAtIso] = vi.mocked(createScheduledAnnouncementResilient).mock.calls[0];
    expect(defaultPostAtIso).toBe(WEEK1_ISO);
  });

  it("does not abort the run when one week's Canvas call fails (AC5 item 18)", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([]);
    vi.mocked(insertPendingScheduledAnnouncement).mockResolvedValue(storedRow({ weekNumber: 1, status: "pending" }));
    vi.mocked(createScheduledAnnouncementResilient)
      .mockRejectedValueOnce(new Error("Canvas is down"))
      .mockResolvedValueOnce({ id: 802 });
    vi.mocked(confirmScheduledAnnouncement).mockResolvedValue(undefined);

    const r = await run();
    if ("error" in r) throw new Error(r.error);

    expect(r.result.weeks[0]).toMatchObject({ week: 1, outcome: "failed", detail: "Canvas is down" });
    expect(r.result.weeks[1]).toMatchObject({ week: 2, outcome: "created" });
    expect(r.result.failedCount).toBe(1);
    expect(r.result.createdCount).toBe(1);
  });

  it("resolves a pending row that already carries a topic id via a TARGETED read-back, never a blind re-create (AC3 item 11)", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([
      storedRow({ weekNumber: 1, status: "pending", topicId: 903, scheduledFor: WEEK1_ISO }),
    ]);
    vi.mocked(listAnnouncements).mockResolvedValue([]);
    vi.mocked(getAnnouncementById).mockResolvedValue(liveAnnouncement({ id: 903, delayedPostAt: WEEK1_ISO }));

    const r = await run({ weekCount: 1 });
    if ("error" in r) throw new Error(r.error);

    expect(getAnnouncementById).toHaveBeenCalledWith("https://canvas.example.edu/courses/123", 903, "MCC");
    expect(createScheduledAnnouncementResilient).not.toHaveBeenCalled();
    expect(confirmScheduledAnnouncement).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "hub-1",
      1,
      903,
      expect.any(String),
      "Week"
    );
    expect(r.result.weeks[0].outcome).toBe("resolved-existing");
  });

  it("resolves a pending row with NO topic id by matching an existing announcement's title + date, never re-creating it", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([
      storedRow({ weekNumber: 1, status: "pending", topicId: null, scheduledFor: WEEK1_ISO }),
    ]);
    vi.mocked(listAnnouncements).mockResolvedValue([
      liveAnnouncement({ id: 999, title: "Week 1", delayedPostAt: WEEK1_ISO }),
    ]);

    const r = await run({ weekCount: 1 });
    if ("error" in r) throw new Error(r.error);

    expect(getAnnouncementById).not.toHaveBeenCalled();
    expect(createScheduledAnnouncementResilient).not.toHaveBeenCalled();
    expect(confirmScheduledAnnouncement).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "hub-1",
      1,
      999,
      expect.any(String),
      "Week 1"
    );
    expect(r.result.weeks[0].outcome).toBe("resolved-existing");
  });

  it("creates a pending week whose earlier attempt never reached Canvas at all (no topic id, no matching announcement)", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([
      storedRow({ weekNumber: 1, status: "pending", topicId: null, scheduledFor: WEEK1_ISO }),
    ]);
    vi.mocked(listAnnouncements).mockResolvedValue([]);
    vi.mocked(createScheduledAnnouncementResilient).mockResolvedValue({ id: 1001 });

    const r = await run({ weekCount: 1 });
    if ("error" in r) throw new Error(r.error);

    expect(createScheduledAnnouncementResilient).toHaveBeenCalledTimes(1);
    expect(confirmScheduledAnnouncement).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "hub-1",
      1,
      1001,
      expect.any(String),
      "Week 1"
    );
    expect(r.result.weeks[0].outcome).toBe("resolved-created");
  });

  it("reschedules a not-yet-posted announcement whose date drifted, without creating anything (AC6)", async () => {
    const driftedIso = new Date(2026, 0, 6, 8, 0, 0, 0).toISOString();
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([
      storedRow({ weekNumber: 1, topicId: 1101, scheduledFor: driftedIso }),
    ]);
    vi.mocked(listAnnouncements).mockResolvedValue([liveAnnouncement({ id: 1101, postedAt: null, delayedPostAt: driftedIso })]);

    const r = await run({ weekCount: 1 });
    if ("error" in r) throw new Error(r.error);

    expect(updateAnnouncementSchedule).toHaveBeenCalledWith("https://canvas.example.edu/courses/123", 1101, WEEK1_ISO, "MCC");
    expect(rescheduleScheduledAnnouncement).toHaveBeenCalledWith(expect.anything(), "owner-1", "hub-1", 1, WEEK1_ISO);
    expect(createScheduledAnnouncementResilient).not.toHaveBeenCalled();
    expect(r.result.weeks[0].outcome).toBe("rescheduled");
  });

  it("NEVER modifies an announcement Canvas has already posted (AC6 item 23)", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([
      storedRow({ weekNumber: 1, topicId: 1201, scheduledFor: WEEK1_ISO }),
    ]);
    vi.mocked(listAnnouncements).mockResolvedValue([
      liveAnnouncement({ id: 1201, postedAt: "2026-01-05T08:00:00.000Z", delayedPostAt: null }),
    ]);

    const r = await run({ weekCount: 1 });
    if ("error" in r) throw new Error(r.error);

    expect(updateAnnouncementSchedule).not.toHaveBeenCalled();
    expect(rescheduleScheduledAnnouncement).not.toHaveBeenCalled();
    expect(r.result.weeks[0].outcome).toBe("left-posted");
  });

  it("skips a week whose slot has already passed instead of creating it, unless it is already scheduled (AC2 item 6, AC3 item 12a)", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([]);
    const midTerm = new Date(2026, 0, 20); // past both Jan 5 and Jan 12 slots
    const r = await run({ testOverrides: { planningNow: midTerm } });
    if ("error" in r) throw new Error(r.error);
    expect(r.result.weeks.map((w) => w.outcome)).toEqual(["skipped-past", "skipped-past"]);
    expect(createScheduledAnnouncementResilient).not.toHaveBeenCalled();
  });

  it("stops cleanly BETWEEN weeks when the elapsed-time budget is exceeded, leaving the rest for the next run (AC5 items 20/21)", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([]);
    vi.mocked(insertPendingScheduledAnnouncement).mockResolvedValue(storedRow({ weekNumber: 1, status: "pending" }));
    vi.mocked(confirmScheduledAnnouncement).mockResolvedValue(undefined);

    let clockMs = 0;
    vi.mocked(createScheduledAnnouncementResilient).mockImplementation(async () => {
      // Simulate week 1's Canvas call itself taking long enough to blow the
      // budget - the check that matters is BEFORE week 2 starts, not
      // mid-week-1.
      clockMs = 10_000;
      return { id: 1301 };
    });

    const r = await run({
      weekCount: 2,
      testOverrides: { planningNow: BEFORE_TERM, clock: () => clockMs, budgetMs: 5_000 },
    });
    if ("error" in r) throw new Error(r.error);

    expect(r.result.weeks.map((w) => w.outcome)).toEqual(["created", "not-attempted"]);
    expect(r.result.stoppedEarly).toBe(true);
    expect(createScheduledAnnouncementResilient).toHaveBeenCalledTimes(1);
  });

  it("reports break weeks were not excluded, in the joined report text (AC2 item 7 / AC9 item 32)", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([]);
    vi.mocked(insertPendingScheduledAnnouncement).mockResolvedValue(storedRow({ weekNumber: 1, status: "pending" }));
    vi.mocked(createScheduledAnnouncementResilient).mockResolvedValue({ id: 1401 });
    vi.mocked(confirmScheduledAnnouncement).mockResolvedValue(undefined);

    const r = await run({ weekCount: 1 });
    if ("error" in r) throw new Error(r.error);
    expect(r.result.report).toContain("break weeks");
  });

  it("RESUMES a truncated run on a second call: the confirmed week is never re-created, and only the untouched week is (AC5 item 20)", async () => {
    // AC5 item 20: "the next run resumes from the mapping table without
    // duplicating confirmed weeks. No separate continuation token - the
    // mapping table IS the checkpoint." Every other test in this file calls
    // the action exactly once; this one drives it TWICE, with the second
    // call's listScheduledAnnouncementRows mock standing in for whatever the
    // first call actually persisted - the only way to exercise "the mapping
    // table is the checkpoint" across runs rather than within one.

    // --- Run 1: budget blows immediately after week 1, week 2 untouched. ---
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValueOnce([]);
    vi.mocked(insertPendingScheduledAnnouncement).mockResolvedValue(storedRow({ weekNumber: 1, status: "pending" }));
    vi.mocked(confirmScheduledAnnouncement).mockResolvedValue(undefined);
    let clockMs = 0;
    vi.mocked(createScheduledAnnouncementResilient).mockImplementationOnce(async () => {
      clockMs = 10_000; // blow the budget partway through week 1's own call
      return { id: 601 };
    });

    const run1 = await run({
      weekCount: 2,
      testOverrides: { planningNow: BEFORE_TERM, clock: () => clockMs, budgetMs: 5_000 },
    });
    if ("error" in run1) throw new Error(run1.error);
    expect(run1.result.weeks.map((w) => w.outcome)).toEqual(["created", "not-attempted"]);
    expect(createScheduledAnnouncementResilient).toHaveBeenCalledTimes(1);

    // --- Run 2: the mapping table now reflects what run 1 actually
    // persisted (week 1 confirmed with the topic id run 1 got back; no row
    // at all for week 2, since it was never even attempted). Read-back is
    // needed this time because a topic id is now on file. ---
    vi.mocked(createScheduledAnnouncementResilient).mockReset();
    vi.mocked(createScheduledAnnouncementResilient).mockResolvedValue({ id: 602 });
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValueOnce([
      storedRow({ weekNumber: 1, topicId: 601, scheduledFor: WEEK1_ISO }),
    ]);
    vi.mocked(listAnnouncements).mockResolvedValueOnce([
      liveAnnouncement({ id: 601, postedAt: null, delayedPostAt: WEEK1_ISO }),
    ]);

    const run2 = await run({
      weekCount: 2,
      testOverrides: { planningNow: BEFORE_TERM }, // no budget pressure this time
    });
    if ("error" in run2) throw new Error(run2.error);

    expect(run2.result.weeks.map((w) => w.outcome)).toEqual(["already-present", "created"]);
    // The confirmed week is never sent back to Canvas as a create.
    expect(createScheduledAnnouncementResilient).toHaveBeenCalledTimes(1);
    expect(createScheduledAnnouncementResilient).toHaveBeenCalledWith(
      expect.anything(),
      "Week 2",
      expect.anything(),
      WEEK2_ISO,
      "MCC"
    );
  });
});
