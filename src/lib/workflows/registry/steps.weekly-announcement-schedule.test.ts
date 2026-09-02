// docs/weekly-announcement-scheduling-acceptance-criteria.md AC8 item 31 -
// the SOURCE-READING GUARD TEST covering item 30 (registry files are
// client-bundled; this step must not import, even transitively,
// @/lib/supabase/server, @/app/actions/shared, or next/headers). Modeled on
// src/lib/workflows/course-schedule-docx.test.ts:40-48, whose own comment
// records that only `next build` caught the original incident this pattern
// guards against - tsc/eslint/vitest all stay green on a violation.
//
// EXTENDED by docs/weekly-announcement-package-io-acceptance-criteria.md
// (Tests written BEFORE implementation, item 11): the guard now also reads
// src/lib/workflows/announcement-package-run.ts's own source and, for that
// file specifically, additionally asserts it makes NO "@/app/actions"
// import at all - that module's whole design (see its own header comment)
// is to take every server call as an injected callback instead, so unlike
// this step file, it should never need that import in the first place.
//
// The rest of this file covers the step's own input validation and its
// thin orchestration over scheduleWeeklyAnnouncementsAction (mocked here);
// the actual scheduling/idempotency logic is covered by
// src/lib/announcement-schedule.test.ts (pure) and
// src/app/actions/canvas-inbox.weekly-announcement-schedule.test.ts (the
// server action). The package path's own decision logic is covered by
// src/lib/workflows/announcement-package-run.test.ts; this file covers only
// what only the step itself can exercise - dispatch, tile/cartridge
// lookups, and the "deliver === ''/''" byte-identical guarantee (AC2 item
// 12) and the "cartridge forces zero live calls" guarantee (AC2 item 13).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
import type { Course } from "@/lib/supabase/courses";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import { buildCartridgeStampJson, CARTRIDGE_STAMP_PATH } from "@/lib/cartridge-import-stamp";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  scheduleWeeklyAnnouncementsAction: vi.fn(),
  planWeeklyAnnouncementsAction: vi.fn(),
  draftModuleAnnouncementsAction: vi.fn(),
  draftPackageAnnouncementsAction: vi.fn(),
}));

import {
  listCourseHubAction,
  scheduleWeeklyAnnouncementsAction,
  planWeeklyAnnouncementsAction,
  draftModuleAnnouncementsAction,
  draftPackageAnnouncementsAction,
} from "@/app/actions";
import { weeklyAnnouncementScheduleSteps } from "./steps.weekly-announcement-schedule";

const step = weeklyAnnouncementScheduleSteps.find(
  (s) => s.type === "schedule-weekly-announcements-for-term"
)!;

describe("steps.weekly-announcement-schedule.ts stays client-bundle-safe", () => {
  it("never imports @/lib/supabase/server, @/app/actions/shared, or next/headers", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./steps.weekly-announcement-schedule.ts", import.meta.url)),
      "utf8"
    );
    expect(source).not.toMatch(/from ["']@\/lib\/supabase\/server["']/);
    expect(source).not.toMatch(/from ["']@\/app\/actions\/shared["']/);
    // Matches an actual import specifier (quoted), not this file's own
    // explanatory comments, which mention next/headers in prose while
    // explaining exactly why this guard exists.
    expect(source).not.toMatch(/from ["']next\/headers["']/);
    expect(source).toContain('from "@/app/actions"');
  });

  // Package-io AC, "Tests written BEFORE implementation" item 11: the same
  // guard, extended to the new orchestration module.
  it("announcement-package-run.ts never imports @/lib/supabase/server, @/app/actions/shared, next/headers, or @/app/actions at all", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../announcement-package-run.ts", import.meta.url)),
      "utf8"
    );
    expect(source).not.toMatch(/from ["']@\/lib\/supabase\/server["']/);
    expect(source).not.toMatch(/from ["']@\/app\/actions\/shared["']/);
    expect(source).not.toMatch(/from ["']next\/headers["']/);
    // Unlike the step file above, this module's own design (its header
    // comment) is to take every server call as an INJECTED callback, so it
    // should never import the "@/app/actions" barrel at all - not even the
    // sanctioned route the step file uses.
    expect(source).not.toMatch(/from ["']@\/app\/actions["']/);
  });

  // File-size-ceiling split (src/file-size-ceiling.structure.test.ts): the
  // guard above only reads this file's OWN source, so it would stay green
  // even if a leaf extracted out of this file introduced exactly the import
  // it exists to catch. Extending it to the two leaves closes that gap the
  // same way the package-run assertion above already does for
  // announcement-package-run.ts.
  it("steps.weekly-announcement-schedule.shared.ts never imports @/lib/supabase/server, @/app/actions/shared, next/headers, or @/app/actions at all", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./steps.weekly-announcement-schedule.shared.ts", import.meta.url)),
      "utf8"
    );
    expect(source).not.toMatch(/from ["']@\/lib\/supabase\/server["']/);
    expect(source).not.toMatch(/from ["']@\/app\/actions\/shared["']/);
    expect(source).not.toMatch(/from ["']next\/headers["']/);
    // Pure helpers/constants only - like announcement-package-run.ts, this
    // leaf should never need the "@/app/actions" barrel at all.
    expect(source).not.toMatch(/from ["']@\/app\/actions["']/);
  });

  it("steps.weekly-announcement-schedule.package-paths.ts never imports @/lib/supabase/server, @/app/actions/shared, or next/headers", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./steps.weekly-announcement-schedule.package-paths.ts", import.meta.url)),
      "utf8"
    );
    expect(source).not.toMatch(/from ["']@\/lib\/supabase\/server["']/);
    expect(source).not.toMatch(/from ["']@\/app\/actions\/shared["']/);
    expect(source).not.toMatch(/from ["']next\/headers["']/);
    // This leaf DOES use the same sanctioned "@/app/actions" route the
    // parent step file uses (draftModuleAnnouncementsAction,
    // draftPackageAnnouncementsAction, listCourseHubAction) - unlike
    // announcement-package-run.ts, which takes every server call injected.
    expect(source).toContain('from "@/app/actions"');
  });
});

function testHelpers(overrides: Partial<StepRunHelpers> = {}): StepRunHelpers {
  return {
    activeInstitution: null,
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
  };
}

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "CS 101",
    courseCode: "CS101",
    term: null,
    canvasUrl: "https://canvas.example.edu/courses/123",
    repos: [],
    githubOrg: null,
    textbook: null,
    syllabusId: null,
    institution: "MCC",
    integrations: [],
    roster: null,
    notes: null,
    topics: null,
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: "2026-01-05",
    description: null,
    weeks: 15,
    tests: null,
    lms: null,
    dayTime: null,
    modality: null,
    topicOutline: null,
    syllabusTemplateId: null,
    endDate: null,
    breaks: null,
    assignmentDueRule: null,
    email: null,
    emailClient: null,
    classLengthMinutes: null,
    courseProject: { milestones: [] } as unknown as Course["courseProject"],
    materialsFiles: [],
    castletopFiles: [],
    miscFiles: [],
    exportFiles: [],
    materialsZipName: null,
    materialsZipPath: null,
    materialsZipSize: null,
    customTiles: [],
    hiddenTiles: [],
    studentRepos: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const noop = () => {};

describe("schedule-weekly-announcements-for-term", () => {
  beforeEach(() => {
    vi.mocked(listCourseHubAction).mockReset();
    vi.mocked(scheduleWeeklyAnnouncementsAction).mockReset();
    // The default draftFrom is now module content (blank), so every test
    // below that reaches step.run without setting draftFrom exercises that
    // path too. A plan of zero weeks needing text is the sensible default:
    // it keeps these pre-existing tests exercising exactly what they always
    // asserted, without pulling drafting into their assertions.
    vi.mocked(planWeeklyAnnouncementsAction).mockReset().mockResolvedValue({ weeks: [] } as never);
    vi.mocked(draftModuleAnnouncementsAction).mockReset().mockResolvedValue({ drafts: [] } as never);
  });

  it("throws when no course tile is chosen", async () => {
    await expect(
      step.run({ weekday: "1", title: "Week {week}", message: "Hi" }, testHelpers(), noop)
    ).rejects.toThrow(/choose a course tile/i);
    expect(listCourseHubAction).not.toHaveBeenCalled();
  });

  it("throws when the weekday is missing or not one of the seven options", async () => {
    await expect(
      step.run({ hubCourse: "course-1", title: "Week {week}", message: "Hi" }, testHelpers(), noop)
    ).rejects.toThrow(/weekday/i);
    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "7", title: "Week {week}", message: "Hi" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow(/weekday/i);
  });

  it("throws when title or message is blank", async () => {
    // This now describes TEMPLATE mode only - module mode (the new default,
    // draftFrom blank) requires neither (AC4 item 17).
    await expect(
      step.run({ hubCourse: "course-1", weekday: "1", message: "Hi", draftFrom: "template" }, testHelpers(), noop)
    ).rejects.toThrow(/title and message/i);
    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "1", title: "Week {week}", draftFrom: "template" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow(/title and message/i);
  });

  it("throws when the chosen course tile cannot be found", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] });
    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow(/choose a course tile/i);
  });

  it("throws a clear error when listCourseHubAction itself errors", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ error: "hub unavailable" });
    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow("hub unavailable");
  });

  it("throws when the tile has no LMS course linked", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ canvasUrl: null })],
    });
    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow(/lms course/i);
  });

  it("DEFECT 1 FIX: skips cleanly with ZERO database writes on a non-Canvas tile, even though its canvasUrl field is non-blank (docs/REGRESSION.md #218, #229 - a Blackboard tile's canvasUrl holds the Blackboard URL, not a Canvas one)", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        baseCourse({
          lms: "blackboard",
          canvasUrl: "https://blackboard.example.edu/ultra/courses/_33114_1/outline",
        }),
      ],
    });

    const result = await step.run(
      { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
      testHelpers(),
      noop
    );

    // scheduleWeeklyAnnouncementsAction is the ONLY path to a database write
    // (it owns every insert/update against weekly_announcement_schedule) -
    // asserting it was never called IS the proof of zero database writes.
    expect(scheduleWeeklyAnnouncementsAction).not.toHaveBeenCalled();
    // The step now reaches two MORE actions on this path, and the guard has to
    // sit above all three. planWeeklyAnnouncementsAction reads the mapping
    // table and paginates Canvas; draftModuleAnnouncementsAction spends a
    // term's worth of LLM calls. Asserting only the write action would stay
    // green if the guard were ever moved below them, while a Blackboard course
    // quietly burned both.
    expect(planWeeklyAnnouncementsAction).not.toHaveBeenCalled();
    expect(draftModuleAnnouncementsAction).not.toHaveBeenCalled();
    expect(result.outputs.scheduledCount).toBe(0);
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text.toLowerCase()).toContain("blackboard");
    }
  });

  it("does not skip a tile with no recorded LMS at all (blank lms treated as Canvas, matching every tile that predates this guard)", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse({ lms: null })] });
    vi.mocked(scheduleWeeklyAnnouncementsAction).mockResolvedValue({
      result: {
        weeks: [],
        createdCount: 0,
        resolvedCreatedCount: 0,
        rescheduledCount: 0,
        alreadyPresentCount: 0,
        skippedPastCount: 0,
        failedCount: 0,
        stoppedEarly: false,
        report: "",
        lines: [],
      },
    });

    await step.run(
      { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
      testHelpers(),
      noop
    );

    expect(scheduleWeeklyAnnouncementsAction).toHaveBeenCalled();
  });

  it("throws when the tile has no start date", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ startDate: null })],
    });
    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow(/start date/i);
  });

  it("throws when the tile has no weeks set", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ weeks: null })],
    });
    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow(/number of weeks/i);
  });

  it("calls scheduleWeeklyAnnouncementsAction with the tile's resolved fields and renders its report", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(scheduleWeeklyAnnouncementsAction).mockResolvedValue({
      result: {
        weeks: [{ week: 1, outcome: "created", detail: "Scheduled for Jan 5." }],
        createdCount: 1,
        resolvedCreatedCount: 0,
        rescheduledCount: 0,
        alreadyPresentCount: 0,
        skippedPastCount: 0,
        failedCount: 0,
        stoppedEarly: false,
        report: "Week 1: created - Scheduled for Jan 5.\nNote: ...",
        lines: ["Week 1: created - Scheduled for Jan 5.", "Note: ..."],
      },
    });

    const result = await step.run(
      {
        hubCourse: "course-1",
        weekday: "4",
        postTime: "09:30",
        title: "Week {week}",
        message: "Hello week {week}",
      },
      testHelpers(),
      noop
    );

    // draftFrom is unset - the new default is module content, not template
    // mode - so the step also plans, appends the (unused) testOverrides slot,
    // and hands over a drafts option. This beforeEach's default plan has zero
    // weeks needing text, so that option is an EMPTY array rather than absent:
    // the action reads the option's presence as "module mode, resolve per
    // week" and its absence as "template mode, both templates required".
    // Asserting `undefined` here is what let a re-run against a fully
    // scheduled term reject itself whenever the templates were left blank.
    expect(scheduleWeeklyAnnouncementsAction).toHaveBeenCalledWith(
      "course-1",
      "https://canvas.example.edu/courses/123",
      "MCC",
      "2026-01-05",
      15,
      4,
      "09:30",
      "Week {week}",
      "Hello week {week}",
      undefined,
      { drafts: [] }
    );
    expect(result.outputs.scheduledCount).toBe(1);
    expect(result.outputs.report).toContain("Week 1: created");
    expect(result.summary.kind).toBe("list");
  });

  // docs/announcement-post-time-acceptance-criteria.md T2: a present-but-
  // unparseable "Post time" must still fall back to the default (never
  // throw - scheduleWeeklyAnnouncementsAction is still called with the raw
  // string UNCHANGED, since parsing/reporting happens in the step layer,
  // not by altering what is handed downstream) but must say so in the run's
  // own report, not stay quiet about it.
  it("reports (but does not throw on) a present-but-unparseable Post time, and still passes the raw value through unchanged", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(scheduleWeeklyAnnouncementsAction).mockResolvedValue({
      result: {
        weeks: [],
        createdCount: 1,
        resolvedCreatedCount: 0,
        rescheduledCount: 0,
        alreadyPresentCount: 0,
        skippedPastCount: 0,
        failedCount: 0,
        stoppedEarly: false,
        report: "Week 1: created - Scheduled for Jan 5.",
        lines: ["Week 1: created - Scheduled for Jan 5."],
      },
    });

    const result = await step.run(
      {
        hubCourse: "course-1",
        weekday: "1",
        postTime: "9:30am",
        title: "Week {week}",
        message: "Hello week {week}",
      },
      testHelpers(),
      noop
    );

    // The invalid raw string still reaches the downstream action UNCHANGED -
    // this step only ADDS reporting, it never rewrites or blocks the value.
    expect(scheduleWeeklyAnnouncementsAction).toHaveBeenCalledWith(
      "course-1",
      "https://canvas.example.edu/courses/123",
      "MCC",
      "2026-01-05",
      15,
      1,
      "9:30am",
      "Week {week}",
      "Hello week {week}",
      undefined,
      { drafts: [] }
    );
    expect(result.outputs.report).toContain('"Post time" value "9:30am"');
    expect(result.outputs.report).toContain("08:00");
    expect(result.outputs.report).toContain("Week 1: created");
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items[0]).toContain('"Post time" value "9:30am"');
    }
  });

  it("does NOT report anything when Post time is left blank (the documented default, not a mistake)", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(scheduleWeeklyAnnouncementsAction).mockResolvedValue({
      result: {
        weeks: [],
        createdCount: 1,
        resolvedCreatedCount: 0,
        rescheduledCount: 0,
        alreadyPresentCount: 0,
        skippedPastCount: 0,
        failedCount: 0,
        stoppedEarly: false,
        report: "Week 1: created - Scheduled for Jan 5.",
        lines: ["Week 1: created - Scheduled for Jan 5."],
      },
    });

    const result = await step.run(
      {
        hubCourse: "course-1",
        weekday: "1",
        title: "Week {week}",
        message: "Hello week {week}",
      },
      testHelpers(),
      noop
    );

    expect(result.outputs.report).toBe("Week 1: created - Scheduled for Jan 5.");
    expect(result.outputs.report).not.toContain("Post time");
  });

  it("throws the action's error message when it fails", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(scheduleWeeklyAnnouncementsAction).mockResolvedValue({ error: "Canvas rejected the request." });

    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow("Canvas rejected the request.");
  });
});

// Package-io AC (docs/weekly-announcement-package-io-acceptance-criteria.md),
// "Tests written BEFORE implementation" item 1: a FROZEN LITERAL of the
// expected scheduleWeeklyAnnouncementsAction arguments for `deliver === ""`
// (the default) - a comparison against a hand-written expected call, not
// against this step's own new code path, so a future change that
// accidentally alters the live path's call shape fails THIS test even if it
// never touches the package path at all.
describe("AC2 item 12 (package-io AC): deliver === \"\" reproduces today's behavior byte for byte", () => {
  beforeEach(() => {
    vi.mocked(listCourseHubAction).mockReset();
    vi.mocked(scheduleWeeklyAnnouncementsAction).mockReset();
    vi.mocked(planWeeklyAnnouncementsAction).mockReset().mockResolvedValue({ weeks: [] } as never);
    vi.mocked(draftModuleAnnouncementsAction).mockReset().mockResolvedValue({ drafts: [] } as never);
    vi.mocked(draftPackageAnnouncementsAction).mockReset();
  });

  it('template mode (draftFrom: "template"): calls scheduleWeeklyAnnouncementsAction with EXACTLY the original nine positional arguments, no trailing options, no plan call, no draft call', async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(scheduleWeeklyAnnouncementsAction).mockResolvedValue({
      result: {
        weeks: [],
        createdCount: 2,
        resolvedCreatedCount: 0,
        rescheduledCount: 0,
        alreadyPresentCount: 0,
        skippedPastCount: 0,
        failedCount: 0,
        stoppedEarly: false,
        report: "frozen template report",
        lines: ["frozen template line"],
      },
    });

    const result = await step.run(
      {
        hubCourse: "course-1",
        weekday: "2",
        postTime: "10:00",
        draftFrom: "template",
        title: "Week {week} title",
        message: "Week {week} message",
      },
      testHelpers(),
      noop
    );

    expect(scheduleWeeklyAnnouncementsAction).toHaveBeenCalledTimes(1);
    expect(scheduleWeeklyAnnouncementsAction).toHaveBeenCalledWith(
      "course-1",
      "https://canvas.example.edu/courses/123",
      "MCC",
      "2026-01-05",
      15,
      2,
      "10:00",
      "Week {week} title",
      "Week {week} message"
    );
    expect(planWeeklyAnnouncementsAction).not.toHaveBeenCalled();
    expect(draftModuleAnnouncementsAction).not.toHaveBeenCalled();
    expect(draftPackageAnnouncementsAction).not.toHaveBeenCalled();
    expect(result.outputs).toEqual({ scheduledCount: 2, report: "frozen template report" });
  });

  it('module mode (draftFrom blank): calls scheduleWeeklyAnnouncementsAction with the original nine arguments PLUS the drafts option, unchanged from before the package-io feature existed', async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(scheduleWeeklyAnnouncementsAction).mockResolvedValue({
      result: {
        weeks: [],
        createdCount: 3,
        resolvedCreatedCount: 0,
        rescheduledCount: 0,
        alreadyPresentCount: 0,
        skippedPastCount: 0,
        failedCount: 0,
        stoppedEarly: false,
        report: "frozen module report",
        lines: ["frozen module line"],
      },
    });

    const result = await step.run(
      {
        hubCourse: "course-1",
        weekday: "3",
        postTime: "11:15",
      },
      testHelpers(),
      noop
    );

    expect(scheduleWeeklyAnnouncementsAction).toHaveBeenCalledTimes(1);
    expect(scheduleWeeklyAnnouncementsAction).toHaveBeenCalledWith(
      "course-1",
      "https://canvas.example.edu/courses/123",
      "MCC",
      "2026-01-05",
      15,
      3,
      "11:15",
      "",
      "",
      undefined,
      { drafts: [] }
    );
    expect(planWeeklyAnnouncementsAction).toHaveBeenCalledTimes(1);
    expect(draftModuleAnnouncementsAction).not.toHaveBeenCalled();
    expect(draftPackageAnnouncementsAction).not.toHaveBeenCalled();
    expect(result.outputs).toEqual({ scheduledCount: 3, report: "frozen module report" });
  });
});

// Builds a minimal, valid Canvas-shaped cartridge zip (real JSZip archive,
// not the app's own buildCommonCartridge - that would stamp it as
// app-generated, which is a DIFFERENT test case below) with `moduleCount`
// empty modules - enough for parseCartridgeBlob to resolve `data.modules`
// without ever needing real module item content, since these tests mock
// draftPackageAnnouncementsAction directly rather than exercising the real
// drafting pipeline.
async function buildTestCartridgeBlob(moduleCount: number): Promise<Blob> {
  const zip = new JSZip();
  const modulesXml = Array.from({ length: moduleCount }, (_, i) => {
    const n = i + 1;
    return `<module identifier="m${n}"><title>Module ${n}</title><items></items></module>`;
  }).join("\n");
  zip.file(
    "course_settings/module_meta.xml",
    `<?xml version="1.0"?><modules xmlns="http://canvas.instructure.com/xsd/cccv1p0">${modulesXml}</modules>`
  );
  zip.file(
    "imsmanifest.xml",
    `<?xml version="1.0"?><manifest identifier="m1"><resources></resources></manifest>`
  );
  return zip.generateAsync({ type: "blob" });
}

// Package-io AC "Tests written BEFORE implementation" item 2: draftFrom ===
// "cartridge" makes ZERO calls to scheduleWeeklyAnnouncementsAction,
// planWeeklyAnnouncementsAction, and (its own draft call, mocked to a
// template fallback so the run succeeds without needing real module item
// content) draftModuleAnnouncementsAction, for all three `deliver` values.
describe('AC2 item 13 (package-io AC): draftFrom === "cartridge" makes ZERO live-path calls, whatever deliver holds', () => {
  beforeEach(() => {
    vi.mocked(listCourseHubAction).mockReset();
    vi.mocked(scheduleWeeklyAnnouncementsAction).mockReset();
    vi.mocked(planWeeklyAnnouncementsAction).mockReset();
    vi.mocked(draftModuleAnnouncementsAction).mockReset();
    vi.mocked(draftPackageAnnouncementsAction).mockReset().mockResolvedValue({ drafts: [] });
  });

  it.each(["", "package", "both"])(
    'deliver=%j: never calls scheduleWeeklyAnnouncementsAction, planWeeklyAnnouncementsAction, or draftModuleAnnouncementsAction, and reports scheduledCount 0',
    async (deliver) => {
      const blob = await buildTestCartridgeBlob(2);
      const file = new File([blob], "export.zip", { type: "application/zip" });

      const result = await step.run(
        {
          draftFrom: "cartridge",
          cartridge: [file],
          weekday: "1",
          startDate: "2026-01-05",
          // Non-blank fallback templates so every week resolves content even
          // though draftPackageAnnouncementsAction is mocked to return no
          // drafts - these tests are about which ACTIONS get called, not
          // about drafting content.
          title: "Week {week}",
          message: "Message for week {week}",
          deliver,
        },
        testHelpers(),
        noop
      );

      expect(scheduleWeeklyAnnouncementsAction).not.toHaveBeenCalled();
      expect(planWeeklyAnnouncementsAction).not.toHaveBeenCalled();
      expect(draftModuleAnnouncementsAction).not.toHaveBeenCalled();
      expect(draftPackageAnnouncementsAction).toHaveBeenCalledTimes(1);
      expect(result.outputs.scheduledCount).toBe(0);
    }
  );
});

// Package-io AC "Tests written BEFORE implementation" item 4.
describe("AC1 item 5 (package-io AC): an app-generated cartridge is refused", () => {
  beforeEach(() => {
    vi.mocked(listCourseHubAction).mockReset();
    vi.mocked(draftPackageAnnouncementsAction).mockReset();
  });

  it("throws the self-consumption refusal verbatim, before parsing anything else", async () => {
    const zip = new JSZip();
    zip.file(CARTRIDGE_STAMP_PATH, buildCartridgeStampJson({ title: "Some course" }));
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "export.zip", { type: "application/zip" });

    await expect(
      step.run({ draftFrom: "cartridge", cartridge: [file], weekday: "1" }, testHelpers(), noop)
    ).rejects.toThrow(
      "That cartridge was produced by this app, not exported from a real course - drafting announcements from it would feed the app its own output back in. Upload the LMS's own export instead."
    );
    expect(draftPackageAnnouncementsAction).not.toHaveBeenCalled();
  });
});

// Package-io AC "Tests written BEFORE implementation" item 5.
describe("AC1 item 6 (package-io AC): a zero-module package is refused", () => {
  beforeEach(() => {
    vi.mocked(listCourseHubAction).mockReset();
    vi.mocked(draftPackageAnnouncementsAction).mockReset();
  });

  it("throws rather than producing an empty term", async () => {
    const blob = await buildTestCartridgeBlob(0);
    const file = new File([blob], "export.zip", { type: "application/zip" });

    await expect(
      step.run({ draftFrom: "cartridge", cartridge: [file], weekday: "1" }, testHelpers(), noop)
    ).rejects.toThrow(
      "The uploaded package has no modules - nothing to draft each week's announcement from."
    );
    expect(draftPackageAnnouncementsAction).not.toHaveBeenCalled();
  });

  it("also throws for a missing upload (AC1 item 3), before any parsing", async () => {
    await expect(
      step.run({ draftFrom: "cartridge", weekday: "1" }, testHelpers(), noop)
    ).rejects.toThrow(
      "Upload a course cartridge or course export (.imscc or .zip) - the uploaded package source needs it."
    );
    expect(listCourseHubAction).not.toHaveBeenCalled();
  });
});
