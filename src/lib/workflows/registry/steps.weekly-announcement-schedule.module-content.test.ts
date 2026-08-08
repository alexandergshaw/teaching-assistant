// TDD suite for the STEP side of "draft each scheduled weekly announcement
// from that week's Canvas module content"
// (docs/weekly-announcement-module-content-acceptance-criteria.md AC1 item 6,
// AC2 item 7, AC3 items 14/15, AC4 item 17, AC5 item 22, AC6 items 24/24a/25).
//
// Written BEFORE the implementation exists.
//
// The step is deliberately THIN here. It plans, asks ONE server action to gather
// and draft (Next serializes client-dispatched Server Functions, so a per-week
// call from the step would be strictly serial - see the AC's revision note), and
// hands the finished text to the scheduling action. Everything is mocked at the
// @/app/actions boundary: no network, no LLM, no database.
//
// NOTE for the implementer: steps.weekly-announcement-schedule.test.ts mocks
// "@/app/actions" with a factory listing only listCourseHubAction and
// scheduleWeeklyAnnouncementsAction. Vitest throws "No '<name>' export is
// defined on the mock" when the step CALLS a name that factory omits, so that
// factory must gain the new names. Extend it; do not weaken what it asserts.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Course } from "@/lib/supabase/courses";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  scheduleWeeklyAnnouncementsAction: vi.fn(),
  planWeeklyAnnouncementsAction: vi.fn(),
  draftModuleAnnouncementsAction: vi.fn(),
}));

import {
  listCourseHubAction,
  scheduleWeeklyAnnouncementsAction,
  planWeeklyAnnouncementsAction,
  draftModuleAnnouncementsAction,
} from "@/app/actions";
import { weeklyAnnouncementScheduleSteps } from "./steps.weekly-announcement-schedule";
import { SCHEDULE_WEEKLY_ANNOUNCEMENTS } from "@/lib/workflows/presets/communication";

const step = weeklyAnnouncementScheduleSteps.find(
  (s) => s.type === "schedule-weekly-announcements-for-term"
)!;

function testHelpers(overrides: Partial<StepRunHelpers> = {}): StepRunHelpers {
  return {
    activeInstitution: "MCC",
    provider: "gemini",
    author: "Test Author",
    saveBundle: null,
    saveCourseMaterialFile: null,
    saveCourseCastletopFile: null,
    saveCourseExportFile: null,
    loadCommonResources: null,
    getLibraryFile: null,
    getInstitutionFields: null,
    loadCourseExport: null,
    loadCourseMaterials: null,
    ...overrides,
  } as StepRunHelpers;
}

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "CS 101",
    canvasUrl: "https://canvas.example.edu/courses/123",
    institution: "MCC",
    startDate: "2026-01-05",
    weeks: 3,
    lms: "canvas",
    ...overrides,
  } as Course;
}

const values = (overrides: Record<string, unknown> = {}) => ({
  hubCourse: "course-1",
  weekday: "1",
  postTime: "",
  title: "Week {week}",
  message: "Message for week {week}",
  ...overrides,
});

function scheduleResult() {
  return {
    result: {
      weeks: [],
      createdCount: 0,
      resolvedCreatedCount: 0,
      rescheduledCount: 0,
      alreadyPresentCount: 0,
      skippedPastCount: 0,
      failedCount: 0,
      stoppedEarly: false,
      report: "report",
      lines: ["report"],
    },
  };
}

/** The trailing options bag handed to scheduleWeeklyAnnouncementsAction. */
function suppliedDrafts() {
  const call = vi.mocked(scheduleWeeklyAnnouncementsAction).mock.calls[0];
  const options = call?.[call.length - 1] as
    | { drafts?: Array<{ week: number; title?: string; message?: string; note?: string; defer?: boolean }> }
    | undefined;
  return options?.drafts;
}

/** The weeks the step asked the drafting action to work on. */
function requestedWeeks() {
  return vi.mocked(draftModuleAnnouncementsAction).mock.calls[0]?.[1];
}

const DRAFTS = [
  { week: 1, title: "Drafted one", message: "Body one.", note: 'drafted from module "Module 01: Intro"' },
  { week: 2, title: "Drafted two", message: "Body two.", note: 'drafted from module "Module 02: Loops"' },
  { week: 3, title: "", message: "", note: "no module content for week 3 - used the message template" },
];

beforeEach(() => {
  vi.mocked(listCourseHubAction).mockReset().mockResolvedValue({ courses: [baseCourse()] } as never);
  vi.mocked(scheduleWeeklyAnnouncementsAction).mockReset().mockResolvedValue(scheduleResult() as never);
  vi.mocked(planWeeklyAnnouncementsAction)
    .mockReset()
    .mockResolvedValue({
      weeks: [
        { week: 1, action: "create" },
        { week: 2, action: "create" },
        { week: 3, action: "create" },
      ],
    } as never);
  vi.mocked(draftModuleAnnouncementsAction).mockReset().mockResolvedValue({ drafts: DRAFTS } as never);
});

describe("drafting from module content is what the step does by default (AC6 item 24)", () => {
  it("plans, then makes exactly ONE gather-and-draft call, then schedules with the result", async () => {
    await step.run(values(), testHelpers(), () => {});

    expect(planWeeklyAnnouncementsAction).toHaveBeenCalledTimes(1);
    expect(draftModuleAnnouncementsAction).toHaveBeenCalledTimes(1);
    expect(requestedWeeks()).toEqual([1, 2, 3]);
    expect(suppliedDrafts()).toEqual(DRAFTS);
  });

  it("passes the course URL, the term length, the institution and the run's provider through", async () => {
    await step.run(values({ extraNotes: "Advising week - book a slot." }), testHelpers(), () => {});

    const call = vi.mocked(draftModuleAnnouncementsAction).mock.calls[0];
    expect(call[0]).toBe("https://canvas.example.edu/courses/123");
    expect(call[2]).toBe(3); // the tile's week count - AC1 item 1b needs it
    expect(call[3]).toBe("MCC");
    expect(call[4]).toMatchObject({
      provider: "gemini",
      courseName: "CS 101",
      extraNotes: "Advising week - book a slot.",
    });
  });

  it("asks only for the weeks whose plan actually needs an announcement (AC5 item 22)", async () => {
    vi.mocked(planWeeklyAnnouncementsAction).mockResolvedValue({
      weeks: [
        { week: 1, action: "already-present" },
        { week: 2, action: "create" },
        { week: 3, action: "reschedule" },
        { week: 4, action: "resolve-pending" },
        { week: 5, action: "skip-past" },
        { week: 6, action: "leave-posted" },
      ],
    } as never);

    await step.run(values(), testHelpers(), () => {});

    // A reschedule moves a date; it never re-drafts (AC5 item 22). A
    // resolve-pending may still have to create, so it DOES need text.
    expect(requestedWeeks()).toEqual([2, 4]);
  });

  it("does no gathering and no drafting at all when every week is already scheduled (AC1 item 6)", async () => {
    vi.mocked(planWeeklyAnnouncementsAction).mockResolvedValue({
      weeks: [
        { week: 1, action: "already-present" },
        { week: 2, action: "already-present" },
        { week: 3, action: "leave-posted" },
      ],
    } as never);

    await step.run(values(), testHelpers(), () => {});

    // The plan is what makes the skip possible - a step that never consulted it
    // would satisfy the two negative assertions vacuously.
    expect(planWeeklyAnnouncementsAction).toHaveBeenCalledTimes(1);
    expect(draftModuleAnnouncementsAction).not.toHaveBeenCalled();
    expect(scheduleWeeklyAnnouncementsAction).toHaveBeenCalledTimes(1);
    // Module mode ALWAYS hands over a drafts option, even an empty one: the
    // action reads its PRESENCE as "resolve per week" and its absence as
    // "template mode, both templates required". Sending nothing here made the
    // advertised zero-cost re-run reject a run whose templates are blank -
    // which module mode's own help text invites.
    expect(suppliedDrafts()).toEqual([]);
  });
});

describe("fallbacks (AC3 items 14/15)", () => {
  it("skips planning and drafting entirely in template mode, and still posts the templates", async () => {
    await step.run(values({ draftFrom: "template" }), testHelpers(), () => {});

    expect(planWeeklyAnnouncementsAction).not.toHaveBeenCalled();
    expect(draftModuleAnnouncementsAction).not.toHaveBeenCalled();
    expect(suppliedDrafts()).toBeUndefined();
    const call = vi.mocked(scheduleWeeklyAnnouncementsAction).mock.calls[0];
    expect(call[7]).toBe("Week {week}");
    expect(call[8]).toBe("Message for week {week}");
  });

  it("still requires a title and a message in template mode (AC4 item 17)", async () => {
    await expect(
      step.run(values({ draftFrom: "template", message: "" }), testHelpers(), () => {})
    ).rejects.toThrow();
    await expect(
      step.run(values({ draftFrom: "template", title: "" }), testHelpers(), () => {})
    ).rejects.toThrow();
  });

  it("accepts a blank title and a blank message in module mode (AC4 item 17)", async () => {
    await expect(
      step.run(values({ title: "", message: "" }), testHelpers(), () => {})
    ).resolves.toBeTruthy();
  });

  it("still schedules when planning itself fails - it just drafts nothing", async () => {
    vi.mocked(planWeeklyAnnouncementsAction).mockResolvedValue({ error: "Canvas is down" } as never);

    await step.run(values(), testHelpers(), () => {});

    expect(planWeeklyAnnouncementsAction).toHaveBeenCalledTimes(1);
    expect(draftModuleAnnouncementsAction).not.toHaveBeenCalled();
    expect(scheduleWeeklyAnnouncementsAction).toHaveBeenCalledTimes(1);
    expect(suppliedDrafts()).toEqual([]);
  });

  it("still schedules when the gather-and-draft call fails", async () => {
    vi.mocked(draftModuleAnnouncementsAction).mockResolvedValue({ error: "Canvas is down" } as never);

    await step.run(values(), testHelpers(), () => {});

    expect(draftModuleAnnouncementsAction).toHaveBeenCalledTimes(1);
    expect(scheduleWeeklyAnnouncementsAction).toHaveBeenCalledTimes(1);
    expect(suppliedDrafts()).toEqual([]);
  });

  it("survives the gather-and-draft call THROWING", async () => {
    vi.mocked(draftModuleAnnouncementsAction).mockRejectedValue(new Error("boom"));

    await expect(step.run(values(), testHelpers(), () => {})).resolves.toBeTruthy();
    expect(scheduleWeeklyAnnouncementsAction).toHaveBeenCalledTimes(1);
  });
});

describe("the step's inputs and the preset's bindings (AC6 items 24/24a/25)", () => {
  it("offers a draftFrom choice whose DEFAULT VALUE IS BLANK, so the select renders", () => {
    const byKey = new Map(step.inputs.map((i) => [i.key, i]));
    const draftFrom = byKey.get("draftFrom")!;

    expect(draftFrom).toBeTruthy();
    // RuntimeFieldInput renders `options` as the complete MenuItem list. Omitting
    // the stored default ("") leaves the control blank with an out-of-range
    // warning - and vitest is node-env, so no test can ever see that.
    expect(draftFrom.options).toContain("");
    expect(draftFrom.options).toContain("template");
    expect(draftFrom.optionLabels?.[""]).toBeTruthy();
    expect(draftFrom.optionLabels?.template).toBeTruthy();
  });

  it("offers extra notes, and no longer forces a title or a message", () => {
    const byKey = new Map(step.inputs.map((i) => [i.key, i]));

    expect(byKey.get("extraNotes")!.type).toBe("longtext");
    expect(byKey.get("title")!.required).not.toBe(true);
    expect(byKey.get("message")!.required).not.toBe(true);
  });

  it("binds every input the step declares, so the run form can never silently skip one", () => {
    const bindings = SCHEDULE_WEEKLY_ANNOUNCEMENTS.steps[0].bindings;

    for (const input of step.inputs) {
      expect(Object.keys(bindings)).toContain(input.key);
    }
  });
});
