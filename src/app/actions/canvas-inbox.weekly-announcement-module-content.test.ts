// TDD suite for the ACTION side of "draft each scheduled weekly announcement
// from that week's Canvas module content"
// (docs/weekly-announcement-module-content-acceptance-criteria.md AC1 item 6,
// AC3 items 12/13/15, AC4 items 16/18/19, AC5 item 21, AC7 item 29).
//
// Written BEFORE the implementation exists.
//
// The DRAFTING itself does not happen here: the step gathers module content and
// drafts, then hands this action finished per-week text (AC3 item 15's opt-in -
// an action call with no drafts behaves exactly as it does today). So this file
// mocks the same I/O boundaries the existing
// canvas-inbox.weekly-announcement-schedule.test.ts does, and adds nothing new
// to the action's import graph.
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
  type ScheduledAnnouncementRow,
} from "@/lib/supabase/weekly-announcement-schedule";
import {
  listAnnouncements,
  createScheduledAnnouncementResilient,
  getAnnouncementById,
  type CanvasAnnouncement,
} from "@/lib/canvas";
import {
  scheduleWeeklyAnnouncementsAction,
  planWeeklyAnnouncementsAction,
} from "./canvas-inbox";
import type { WeeklyAnnouncementDraft } from "@/lib/announcement-module-content";

const OWNER = { id: "owner-1", email: "owner@example.com" };
const COURSE_URL = "https://canvas.example.edu/courses/123";
const START_DATE = "2026-01-05"; // a Monday
const WEEK1_ISO = new Date(2026, 0, 5, 8, 0, 0, 0).toISOString();
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
    title: "",
    message: "",
    postedAt: null,
    delayedPostAt: null,
    author: "",
    htmlUrl: "",
    ...overrides,
  };
}

async function run(
  drafts: WeeklyAnnouncementDraft[] | undefined,
  overrides: Partial<{ weekCount: number; title: string; message: string }> = {}
) {
  return scheduleWeeklyAnnouncementsAction(
    "hub-1",
    COURSE_URL,
    "MCC",
    START_DATE,
    overrides.weekCount ?? 2,
    1, // Monday
    "",
    overrides.title ?? "Week {week}",
    overrides.message ?? "Message for week {week}",
    { planningNow: BEFORE_TERM },
    drafts ? { drafts } : undefined
  );
}

beforeEach(() => {
  vi.mocked(requireOwner).mockReset().mockResolvedValue(OWNER as never);
  vi.mocked(listScheduledAnnouncementRows).mockReset().mockResolvedValue([]);
  vi.mocked(listAnnouncements).mockReset().mockResolvedValue([]);
  vi.mocked(insertPendingScheduledAnnouncement)
    .mockReset()
    .mockImplementation(async (_s, _u, _c, week) => storedRow({ weekNumber: week, status: "pending" }));
  vi.mocked(confirmScheduledAnnouncement).mockReset().mockResolvedValue(undefined);
  vi.mocked(createScheduledAnnouncementResilient)
    .mockReset()
    .mockImplementation(async () => liveAnnouncement({ id: 700 }));
  vi.mocked(getAnnouncementById).mockReset().mockResolvedValue(null);
});

describe("supplied per-week drafts reach Canvas (AC3 item 15, AC4 item 16)", () => {
  it("posts the drafted body instead of the repeated message template", async () => {
    const r = await run([
      { week: 1, title: "", message: "This week we start with recursion.", note: "drafted from module \"Module 01: Recursion\"" },
      { week: 2, title: "", message: "This week we move on to sorting.", note: "drafted from module \"Module 02: Sorting\"" },
    ]);
    if ("error" in r) throw new Error(r.error);

    const bodies = vi.mocked(createScheduledAnnouncementResilient).mock.calls.map((c) => c[2]);
    expect(bodies).toEqual([
      "This week we start with recursion.",
      "This week we move on to sorting.",
    ]);
    expect(bodies.join(" ")).not.toContain("Message for week");
    expect(r.result.createdCount).toBe(2);
  });

  it("keeps the instructor's title template when they typed one, even with a drafted title available", async () => {
    await run([{ week: 1, title: "Recursion, and why it works", message: "Body one." }], { weekCount: 1 });

    expect(vi.mocked(createScheduledAnnouncementResilient).mock.calls[0][1]).toBe("Week 1");
    // The draft was still consumed - only its TITLE lost to the template.
    expect(vi.mocked(createScheduledAnnouncementResilient).mock.calls[0][2]).toBe("Body one.");
  });

  it("uses the drafted title when the instructor left the title template blank", async () => {
    await run([{ week: 1, title: "Recursion, and why it works", message: "Body one." }], {
      weekCount: 1,
      title: "",
    });

    expect(vi.mocked(createScheduledAnnouncementResilient).mock.calls[0][1]).toBe(
      "Recursion, and why it works"
    );
  });

  it("falls back to the message template for a week the step could not draft (AC3 item 12)", async () => {
    const r = await run([{ week: 1, title: "", message: "Drafted body." }], { weekCount: 2 });
    if ("error" in r) throw new Error(r.error);

    const bodies = vi.mocked(createScheduledAnnouncementResilient).mock.calls.map((c) => c[2]);
    expect(bodies).toEqual(["Drafted body.", "Message for week 2"]);
    expect(r.result.createdCount).toBe(2);
  });

  it("treats a BLANK drafted message as a fallback request, not as content (AC3 item 13a)", async () => {
    // The step emits {week, message: ""} for a week whose draft failed. Canvas
    // will happily POST an empty announcement body, so nothing downstream
    // catches this - it has to be caught here.
    const r = await run([{ week: 1, title: "", message: "", note: "drafting failed (HTTP 500)" }], {
      weekCount: 1,
    });
    if ("error" in r) throw new Error(r.error);

    expect(vi.mocked(createScheduledAnnouncementResilient).mock.calls[0][2]).toBe("Message for week 1");
    expect(r.result.createdCount).toBe(1);
  });

  it("fails a week whose drafted message is blank and whose template is blank too (AC3 item 13a)", async () => {
    const r = await run([{ week: 1, title: "", message: "" }], { weekCount: 1, message: "" });
    if ("error" in r) throw new Error(r.error);

    expect(r.result.weeks[0].outcome).toBe("failed");
    expect(createScheduledAnnouncementResilient).not.toHaveBeenCalled();
  });

  it("reports a week with neither a draft nor a fallback message as failed, and still schedules the others (AC3 item 13)", async () => {
    const r = await run([{ week: 1, title: "", message: "Drafted body." }], {
      weekCount: 2,
      message: "",
    });
    if ("error" in r) throw new Error(r.error);

    expect(r.result.createdCount).toBe(1);
    expect(r.result.failedCount).toBe(1);
    const week2 = r.result.weeks.find((w) => w.week === 2)!;
    expect(week2.outcome).toBe("failed");
    expect(week2.detail).toMatch(/message/i);
    expect(vi.mocked(createScheduledAnnouncementResilient)).toHaveBeenCalledTimes(1);
  });

  it("carries each week's provenance note into its report line (AC7 item 29)", async () => {
    const r = await run([
      { week: 1, title: "", message: "Body one.", note: "drafted from module \"Module 01: Recursion\"" },
      { week: 2, title: "", message: "Body two.", note: "used the message template (no module content for week 2)" },
    ]);
    if ("error" in r) throw new Error(r.error);

    expect(r.result.report).toContain('drafted from module "Module 01: Recursion"');
    expect(r.result.report).toContain("used the message template (no module content for week 2)");
  });

  it("never carries a provenance note into a week it did not actually write (AC7 item 30)", async () => {
    // The step's plan is advisory; the action re-plans. A week the step drafted
    // that turns out to be already scheduled must not report "drafted from
    // module X" - nothing was written.
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([
      storedRow({ weekNumber: 1, status: "confirmed", topicId: 701, scheduledFor: WEEK1_ISO }),
    ]);
    vi.mocked(listAnnouncements).mockResolvedValue([liveAnnouncement({ id: 701, delayedPostAt: WEEK1_ISO })]);

    const r = await run([{ week: 1, title: "", message: "Body one.", note: 'drafted from module "Module 01"' }], {
      weekCount: 1,
    });
    if ("error" in r) throw new Error(r.error);

    expect(r.result.weeks[0].outcome).toBe("already-present");
    expect(r.result.report).not.toContain("drafted from module");
  });
});

describe("a deferred week is left for the next run (AC2 item 11a)", () => {
  it("does not create, does not fall back to the template, and says to re-run", async () => {
    const r = await run(
      [
        { week: 1, title: "", message: "Drafted body." },
        { week: 2, defer: true, note: "not drafted this run - stopped for the drafting time budget" },
      ],
      { weekCount: 2 }
    );
    if ("error" in r) throw new Error(r.error);

    expect(vi.mocked(createScheduledAnnouncementResilient).mock.calls.map((c) => c[2])).toEqual([
      "Drafted body.",
    ]);
    expect(insertPendingScheduledAnnouncement).toHaveBeenCalledTimes(1);
    const week2 = r.result.weeks.find((w) => w.week === 2)!;
    expect(week2.outcome).toBe("not-attempted");
    expect(week2.detail).toMatch(/re-run/i);
  });

  it("reports the run as stopped early, so the caller's summary tells the user to re-run", async () => {
    // The step's summary line is driven by stoppedEarly. Without it, a run that
    // left half the term undrafted reads as a clean, complete success and the
    // per-week "re-run" detail is buried in the report body.
    const r = await run(
      [
        { week: 1, title: "", message: "Drafted body." },
        { week: 2, defer: true, note: "not drafted this run - stopped for the drafting time budget" },
      ],
      { weekCount: 2 }
    );
    if ("error" in r) throw new Error(r.error);

    expect(r.result.stoppedEarly).toBe(true);
  });
});

describe("the title actually sent is stored on the mapping row (AC4 item 18)", () => {
  it("records the drafted title on the write-ahead row, BEFORE Canvas is called", async () => {
    await run([{ week: 1, title: "Recursion, and why it works", message: "Body one." }], {
      weekCount: 1,
      title: "",
    });

    expect(insertPendingScheduledAnnouncement).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "hub-1",
      1,
      WEEK1_ISO,
      "Recursion, and why it works"
    );
    expect(confirmScheduledAnnouncement).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "hub-1",
      1,
      700,
      WEEK1_ISO,
      "Recursion, and why it works"
    );

    const insertOrder = vi.mocked(insertPendingScheduledAnnouncement).mock.invocationCallOrder[0];
    const createOrder = vi.mocked(createScheduledAnnouncementResilient).mock.invocationCallOrder[0];
    expect(insertOrder).toBeLessThan(createOrder);
  });

  it("records the rendered template title when there is no draft at all", async () => {
    await run(undefined, { weekCount: 1 });

    expect(insertPendingScheduledAnnouncement).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "hub-1",
      1,
      WEEK1_ISO,
      "Week 1"
    );
  });
});

describe("a pending row resolves against the title it actually used (AC4 item 19)", () => {
  it("links the announcement a crashed run already created, instead of duplicating it", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([
      storedRow({
        weekNumber: 1,
        status: "pending",
        topicId: null,
        scheduledFor: WEEK1_ISO,
        title: "Recursion, and why it works",
      }),
    ]);
    vi.mocked(listAnnouncements).mockResolvedValue([
      liveAnnouncement({
        id: 555,
        title: "Recursion, and why it works",
        delayedPostAt: WEEK1_ISO,
      }),
    ]);

    const r = await run([{ week: 1, title: "A completely different drafted title", message: "Body." }], {
      weekCount: 1,
      title: "",
    });
    if ("error" in r) throw new Error(r.error);

    expect(r.result.weeks[0].outcome).toBe("resolved-existing");
    expect(createScheduledAnnouncementResilient).not.toHaveBeenCalled();
    // The row must keep the title the announcement ON CANVAS actually carries.
    // Writing this run's freshly drafted title instead would make the row
    // disagree with Canvas and poison the NEXT recovery.
    expect(confirmScheduledAnnouncement).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "hub-1",
      1,
      555,
      WEEK1_ISO,
      "Recursion, and why it works"
    );
  });

  it("RESOLVES a pending week that has no text to post, instead of failing it forever", async () => {
    // A pending row is a crash-recovery state, not a publishing request. If the
    // announcement is already on Canvas, linking it needs no message at all -
    // failing the week here leaves the row pending, and EVERY later run fails
    // it identically, which is the stranded-pending-row failure entry 236
    // check 23 records as severe and permanent.
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([
      storedRow({ weekNumber: 1, status: "pending", topicId: 777, scheduledFor: WEEK1_ISO, title: "Week 1" }),
    ]);
    vi.mocked(listAnnouncements).mockResolvedValue([liveAnnouncement({ id: 777, delayedPostAt: WEEK1_ISO })]);
    vi.mocked(getAnnouncementById).mockResolvedValue(
      liveAnnouncement({ id: 777, title: "Week 1", delayedPostAt: WEEK1_ISO })
    );

    // Neither a drafted message nor a template: nothing to POST, but nothing
    // needs posting.
    const r = await run([{ week: 1, title: "", message: "" }], { weekCount: 1, message: "" });
    if ("error" in r) throw new Error(r.error);

    expect(r.result.weeks[0].outcome).toBe("resolved-existing");
    expect(confirmScheduledAnnouncement).toHaveBeenCalled();
    expect(createScheduledAnnouncementResilient).not.toHaveBeenCalled();
  });

  it("falls back to the rendered template title for a legacy row that has none (AC4 items 19/20)", async () => {
    // Every row written before this feature has title null. Recovery must still
    // work for them, or the migration silently breaks existing courses.
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([
      storedRow({ weekNumber: 1, status: "pending", topicId: null, scheduledFor: WEEK1_ISO, title: null }),
    ]);
    vi.mocked(listAnnouncements).mockResolvedValue([
      liveAnnouncement({ id: 556, title: "Week 1", delayedPostAt: WEEK1_ISO }),
    ]);

    const r = await run([{ week: 1, title: "", message: "Body." }], { weekCount: 1 });
    if ("error" in r) throw new Error(r.error);

    expect(r.result.weeks[0].outcome).toBe("resolved-existing");
    expect(createScheduledAnnouncementResilient).not.toHaveBeenCalled();
  });
});

describe("planWeeklyAnnouncementsAction (AC1 item 6)", () => {
  it("returns one planned action per in-session week and writes NOTHING", async () => {
    const r = await planWeeklyAnnouncementsAction("hub-1", COURSE_URL, "MCC", START_DATE, 3, 1, "", {
      planningNow: BEFORE_TERM,
    });
    if ("error" in r) throw new Error(r.error);

    expect(r.weeks.map((w) => w.week)).toEqual([1, 2, 3]);
    expect(r.weeks.map((w) => w.action)).toEqual(["create", "create", "create"]);
    expect(insertPendingScheduledAnnouncement).not.toHaveBeenCalled();
    expect(confirmScheduledAnnouncement).not.toHaveBeenCalled();
    expect(createScheduledAnnouncementResilient).not.toHaveBeenCalled();
  });

  it("reports the weeks that need nothing, so the caller can skip gathering and drafting entirely", async () => {
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([
      storedRow({ weekNumber: 1, status: "confirmed", topicId: 701, scheduledFor: WEEK1_ISO }),
    ]);
    vi.mocked(listAnnouncements).mockResolvedValue([liveAnnouncement({ id: 701, delayedPostAt: WEEK1_ISO })]);

    const r = await planWeeklyAnnouncementsAction("hub-1", COURSE_URL, "MCC", START_DATE, 1, 1, "", {
      planningNow: BEFORE_TERM,
    });
    if ("error" in r) throw new Error(r.error);

    expect(r.weeks).toEqual([{ week: 1, action: "already-present" }]);
  });

  it("is owner-gated like every other action in this file", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new Error("Not signed in."));

    const r = await planWeeklyAnnouncementsAction("hub-1", COURSE_URL, "MCC", START_DATE, 1, 1, "", {
      planningNow: BEFORE_TERM,
    });

    expect("error" in r).toBe(true);
    expect(listScheduledAnnouncementRows).not.toHaveBeenCalled();
  });
});

describe("module mode with nothing to hand over is still module mode (entry 236 check 4)", () => {
  it("re-runs a fully scheduled term with BLANK templates instead of rejecting the whole run", async () => {
    // The central guarantee: a re-run reports already-present and creates
    // nothing. In module mode both templates are optional and the step's own
    // help text invites leaving them blank, so the blanket "title and message
    // both required" rejection must not apply - an empty drafts array is the
    // caller saying "module mode, nothing needed drafting."
    vi.mocked(listScheduledAnnouncementRows).mockResolvedValue([
      storedRow({ weekNumber: 1, status: "confirmed", topicId: 701, scheduledFor: WEEK1_ISO }),
    ]);
    vi.mocked(listAnnouncements).mockResolvedValue([liveAnnouncement({ id: 701, delayedPostAt: WEEK1_ISO })]);

    const r = await run([], { weekCount: 1, title: "", message: "" });

    if ("error" in r) throw new Error(`expected a report, got: ${r.error}`);
    expect(r.result.weeks[0].outcome).toBe("already-present");
    expect(createScheduledAnnouncementResilient).not.toHaveBeenCalled();
  });

  it("degrades a week it cannot post PER WEEK, rather than aborting the run", async () => {
    // Same configuration, but a week that genuinely needs creating and has no
    // text available. That is one failed week, not a failed run - the other
    // weeks must still be attempted.
    const r = await run([], { weekCount: 2, title: "", message: "" });

    if ("error" in r) throw new Error(`expected a report, got: ${r.error}`);
    expect(r.result.weeks.map((w) => w.outcome)).toEqual(["failed", "failed"]);
    expect(r.result.failedCount).toBe(2);
  });
});

describe("the write budget shrinks when drafting already spent part of the window", () => {
  // An unattended run executes plan + draft + schedule inside ONE 60-second
  // function (server-runner checks its deadline only between fan-out groups,
  // never inside a step), so the drafting budget and the write budget are
  // additive there. A 25s draft plus a 45s write does not fit; the write
  // budget therefore tightens on any run that drafted.
  function runWithClock(drafts: WeeklyAnnouncementDraft[] | undefined, elapsedMs: number) {
    let calls = 0;
    const clock = () => (calls++ === 0 ? 0 : elapsedMs);
    return scheduleWeeklyAnnouncementsAction(
      "hub-1",
      COURSE_URL,
      "MCC",
      START_DATE,
      1,
      1,
      "",
      "Week {week}",
      "Message for week {week}",
      { planningNow: BEFORE_TERM, clock },
      drafts ? { drafts } : undefined
    );
  }

  it("stops a drafted run at 31 seconds of writing", async () => {
    const r = await runWithClock([{ week: 1, title: "", message: "Body." }], 31_000);
    if ("error" in r) throw new Error(r.error);

    expect(r.result.weeks[0].outcome).toBe("not-attempted");
    expect(r.result.stoppedEarly).toBe(true);
  });

  it("leaves the template-only run's original 45-second budget alone", async () => {
    const r = await runWithClock(undefined, 31_000);
    if ("error" in r) throw new Error(r.error);

    expect(r.result.weeks[0].outcome).toBe("created");
  });
});

describe("a database failure is not reported as a Canvas failure", () => {
  it("returns an error rather than a report full of weeks blamed on Canvas", async () => {
    // The mapping-table read and the Canvas read-back sit in the same helper.
    // Only the Canvas half may degrade to per-week reporting (entry 236 check
    // 24); a Supabase outage reported as "could not check Canvas's existing
    // announcements" both misattributes the fault and dresses a failed run up
    // as a successful one.
    vi.mocked(listScheduledAnnouncementRows).mockRejectedValue(new Error("relation does not exist"));

    const r = await run(undefined, { weekCount: 1 });

    expect("error" in r).toBe(true);
    if (!("error" in r)) return;
    expect(r.error).toContain("relation does not exist");
    expect(r.error).not.toMatch(/canvas's existing announcements/i);
  });
});

describe("the shipped template path is untouched (AC3 items 14/15)", () => {
  it("posts the rendered templates when the caller supplies no drafts", async () => {
    const r = await run(undefined);
    if ("error" in r) throw new Error(r.error);

    const calls = vi.mocked(createScheduledAnnouncementResilient).mock.calls;
    expect(calls.map((c) => c[1])).toEqual(["Week 1", "Week 2"]);
    expect(calls.map((c) => c[2])).toEqual(["Message for week 1", "Message for week 2"]);
  });

  it("still refuses a run that has neither templates nor drafts", async () => {
    const r = await run(undefined, { title: "", message: "" });

    expect("error" in r).toBe(true);
    expect(createScheduledAnnouncementResilient).not.toHaveBeenCalled();
  });

  it("keeps Canvas creates sequential when drafts are supplied (entry 236 check 14)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.mocked(createScheduledAnnouncementResilient).mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return liveAnnouncement({ id: 700 });
    });

    await run([
      { week: 1, title: "", message: "Body one." },
      { week: 2, title: "", message: "Body two." },
      { week: 3, title: "", message: "Body three." },
    ], { weekCount: 3 });

    expect(maxInFlight).toBe(1);
  });
});
