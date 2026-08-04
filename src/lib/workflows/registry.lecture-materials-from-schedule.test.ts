import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateLectureMaterialsFromScheduleAction: vi.fn(),
  // docs/REGRESSION.md 152: ensureCourseProject's own two calls, exercised in
  // the "course-long project chaining" describe block below.
  generateCourseProjectAction: vi.fn(),
  setCourseProjectAction: vi.fn(),
  // Tool-churn fix (docs/REGRESSION.md): ensureCourseTools' own selection
  // call, exercised in the "committed toolset" describe block below.
  selectCourseTools: vi.fn(),
}));

// assembleLectureFiles drives real pptx/docx/zip generation (via jszip),
// which requires browser Blob-reading support that vitest's node environment
// doesn't provide - mocked for the same reason registry.lecture-zip.test.ts
// mocks it.
vi.mock("@/lib/workflows/registry-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflows/registry-helpers")>();
  return { ...actual, assembleLectureFiles: vi.fn() };
});

import {
  listCourseHubAction,
  generateLectureMaterialsFromScheduleAction,
  generateCourseProjectAction,
  setCourseProjectAction,
  selectCourseTools,
} from "@/app/actions";
import { getStepDefinition } from "./registry";
import { assembleLectureFiles, type StepRunHelpers } from "./registry-helpers";
import { emptyCourseProject } from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";
import type { AssignmentPlan } from "@/app/actions-types";

const step = getStepDefinition("lecture-materials-from-schedule")!;

describe("lecture-materials-from-schedule step", () => {
  it("has correct inputs and outputs", () => {
    const step = getStepDefinition("lecture-materials-from-schedule");
    expect(step, "step is registered").toBeTruthy();

    const inputs = step!.inputs;
    const inputByKey = new Map(inputs.map((inp) => [inp.key, inp]));

    // Verify required inputs
    expect(inputByKey.has("schedule"), "has schedule input").toBe(true);
    expect(inputByKey.get("schedule")!.required, "schedule is required").toBe(true);
    expect(inputByKey.get("schedule")!.type, "schedule type").toBe("schedule");

    expect(inputByKey.has("minutes"), "has minutes input").toBe(true);
    expect(inputByKey.get("minutes")!.required, "minutes is required").toBe(true);
    expect(inputByKey.get("minutes")!.type, "minutes type").toBe("number");
    expect(
      inputByKey.get("minutes")!.help,
      "minutes has help text about default 50 behavior"
    ).toContain("50");

    // Verify optional inputs
    expect(inputByKey.has("description"), "has description input").toBe(true);
    expect(inputByKey.get("description")!.required, "description is optional").toBe(false);
    expect(inputByKey.get("description")!.type, "description type").toBe("longtext");

    expect(inputByKey.has("hubCourse"), "has hubCourse input").toBe(true);
    expect(inputByKey.get("hubCourse")!.required, "hubCourse is optional").toBe(false);
    expect(inputByKey.get("hubCourse")!.type, "hubCourse type").toBe("hubCourse");

    expect(inputByKey.has("includeInstructions"), "has includeInstructions input").toBe(true);
    expect(inputByKey.get("includeInstructions")!.required, "includeInstructions is optional").toBe(
      false
    );
    expect(inputByKey.get("includeInstructions")!.type, "includeInstructions type").toBe("boolean");

    expect(inputByKey.has("template"), "has template input").toBe(true);
    expect(inputByKey.get("template")!.required, "template is optional").toBe(false);
    expect(inputByKey.get("template")!.type, "template type").toBe("deckTemplate");

    expect(inputByKey.has("sources"), "has sources input").toBe(true);
    expect(inputByKey.get("sources")!.required, "sources is optional").toBe(false);
    expect(inputByKey.get("sources")!.type, "sources type").toBe("sourcePolicy");

    // Verify outputs
    const outputs = step!.outputs;
    const outputByKey = new Map(outputs.map((out) => [out.key, out]));

    expect(outputByKey.has("files"), "has files output").toBe(true);
    expect(outputByKey.get("files")!.type, "files type").toBe("files");
  });
});

function testHelpers(): StepRunHelpers {
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
  };
}

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "PM 101",
    courseCode: "PM101",
    term: null,
    canvasUrl: null,
    repos: [],
    githubOrg: null,
    textbook: null,
    syllabusId: null,
    institution: null,
    integrations: [],
    roster: null,
    notes: null,
    topics: null,
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: null,
    description: null,
    weeks: null,
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
    courseProject: emptyCourseProject(),
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
    updatedAt: "2024-09-01T00:00:00Z",
    ...overrides,
  };
}

function plan(overrides: Partial<AssignmentPlan> = {}): AssignmentPlan {
  return {
    assignmentName: "week-01",
    slides: [{ title: "Slide 1", bullets: ["a"] }],
    presentationTitle: "Week 1",
    label: "Week 1",
    moduleIntroduction: "Intro text",
    assignmentInstructions: "Instructions text",
    moduleObjectives: "Objectives text",
    weekNumber: 1,
    introTemplateHeadings: [],
    instructionsTemplateHeadings: [],
    ...overrides,
  };
}

const SCHEDULE = [
  { week: 1, topic: "Stakeholder Analysis", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
  { week: 2, topic: "Project Charter", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
];

const generatedProject = {
  name: "Community Garden Launch",
  brief: "Plan and pitch a community garden to the city.",
  milestones: [
    { week: 1, title: "Stakeholder map", deliverable: "A one-page stakeholder map." },
    { week: 2, title: "Project charter", deliverable: "A signed-off project charter." },
  ],
};

// docs/REGRESSION.md 152: this step is exactly step 2 in the reported
// "Course Kickoff (no codebase) (copy)" run, and buildScheduleWeekPlan (the
// pipeline it drives) is the per-week spine AC1 targeted. A saved copy of a
// kickoff preset can silently lack a define-course-project step entirely, so
// this step must be able to derive a project on its own the first time it
// needs one.
describe("lecture-materials-from-schedule step: course-long project chaining (docs/REGRESSION.md 152)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([plan()]);
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [],
      summary: { kind: "list", label: "label", items: [] },
    });
    // Default: no committed toolset found - the same "nothing usable" state
    // ensureCourseTools already degrades to on any failure. Individual tests
    // override this when they need to exercise a real commitment.
    vi.mocked(selectCourseTools).mockResolvedValue([]);
  });

  it("AC1/AC3: a course with no project yet (courseKind applied) gets one on demand, and the resolved project (not the tile's empty one) is threaded into generateLectureMaterialsFromScheduleAction", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "course-1", weeks: 2, courseProject: emptyCourseProject() })],
    });
    vi.mocked(generateCourseProjectAction).mockResolvedValue(generatedProject);
    vi.mocked(setCourseProjectAction).mockResolvedValue({ ok: true });

    const result = await step.run(
      {
        schedule: SCHEDULE,
        minutes: 50,
        hubCourse: "course-1",
        courseKind: "applied",
      },
      testHelpers(),
      () => {}
    );

    expect(generateCourseProjectAction).toHaveBeenCalledTimes(1);
    expect(setCourseProjectAction).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    const courseProjectArg = callArgs[8] as { mode: string; name: string };
    expect(courseProjectArg.mode).toBe("course-long");
    expect(courseProjectArg.name).toBe("Community Garden Launch");

    // AC7: a cheap, honest note that a project was invented on this run.
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.toLowerCase().includes("no project yet"))).toBe(true);
    }
  });

  it("AC2/AC4: a course that already has a project never regenerates - the EXISTING project is threaded through unchanged", async () => {
    const existingProject = {
      mode: "course-long" as const,
      name: "Existing Project",
      definition: "Existing Project",
      brief: "Brief.",
      briefFileName: "",
      milestones: [{ week: 1, title: "Kickoff", deliverable: "A plan." }],
      tools: [],
      generatedAt: "2024-01-01T00:00:00Z",
    };
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "course-1", weeks: 2, courseProject: existingProject })],
    });

    await step.run(
      { schedule: SCHEDULE, minutes: 50, hubCourse: "course-1", courseKind: "applied" },
      testHelpers(),
      () => {}
    );

    expect(generateCourseProjectAction).not.toHaveBeenCalled();
    expect(setCourseProjectAction).not.toHaveBeenCalled();
    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    expect(callArgs[8]).toEqual(existingProject);
  });

  it("AC2: a CODING course (the default courseKind) with no project never auto-generates one - the applied-only gate", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "course-1", weeks: 2, courseProject: emptyCourseProject() })],
    });

    await step.run(
      { schedule: SCHEDULE, minutes: 50, hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );

    expect(generateCourseProjectAction).not.toHaveBeenCalled();
    expect(setCourseProjectAction).not.toHaveBeenCalled();
    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    expect((callArgs[8] as { mode: string }).mode).toBe("none");
  });

  it("no hubCourse bound: ensureCourseProject is never invoked (nothing to persist to), and courseProject is undefined - byte-identical to before this feature", async () => {
    await step.run(
      { schedule: SCHEDULE, minutes: 50, hubCourse: "", courseKind: "applied" },
      testHelpers(),
      () => {}
    );

    expect(listCourseHubAction).not.toHaveBeenCalled();
    expect(generateCourseProjectAction).not.toHaveBeenCalled();
    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    expect(callArgs[8]).toBeUndefined();
  });
});

// Tool-churn fix (docs/REGRESSION.md): a student was sent to Trello in week
// 1, Miro in week 5, and Asana plus a spreadsheet in week 8 of the SAME
// course, because the old per-week tool decision had no memory of an earlier
// week's choice. This step now ensures a COURSE-level commitment (the same
// once-per-course pattern as the project above) before buildScheduleWeekPlan
// runs, so the toolset threaded into generateLectureMaterialsFromScheduleAction
// is the same for every week of the same course.
describe("lecture-materials-from-schedule step: committed toolset (tool-churn fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([plan()]);
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [],
      summary: { kind: "list", label: "label", items: [] },
    });
  });

  it("a course with no committed toolset gets one on demand, and it is threaded into generateLectureMaterialsFromScheduleAction's courseProject", async () => {
    const existingProject = {
      mode: "course-long" as const,
      name: "Existing Project",
      definition: "Existing Project",
      brief: "Brief.",
      briefFileName: "",
      milestones: [{ week: 1, title: "Kickoff", deliverable: "A plan." }],
      tools: [],
      generatedAt: "2024-01-01T00:00:00Z",
    };
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "course-1", weeks: 2, courseProject: existingProject })],
    });
    vi.mocked(selectCourseTools).mockResolvedValue(["Trello (free plan)", "Excel (free trial)"]);

    const result = await step.run(
      { schedule: SCHEDULE, minutes: 50, hubCourse: "course-1", courseKind: "applied" },
      testHelpers(),
      () => {}
    );

    expect(setCourseProjectAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    const courseProjectArg = callArgs[8] as { tools: string[] };
    expect(courseProjectArg.tools).toEqual(["Trello (free plan)", "Excel (free trial)"]);

    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.toLowerCase().includes("no committed toolset yet"))).toBe(true);
    }
  });

  it("a course that already has a committed toolset never regenerates - the EXISTING toolset is threaded through unchanged, and a later run reuses it rather than choosing anew", async () => {
    const existingProject = {
      mode: "course-long" as const,
      name: "Existing Project",
      definition: "Existing Project",
      brief: "Brief.",
      briefFileName: "",
      milestones: [{ week: 1, title: "Kickoff", deliverable: "A plan." }],
      tools: ["Asana (free plan)"],
      generatedAt: "2024-01-01T00:00:00Z",
    };
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "course-1", weeks: 2, courseProject: existingProject })],
    });

    await step.run(
      { schedule: SCHEDULE, minutes: 50, hubCourse: "course-1", courseKind: "applied" },
      testHelpers(),
      () => {}
    );

    // Never even asked the model - the idempotency check short-circuits
    // before selectCourseTools is reached.
    expect(selectCourseTools).not.toHaveBeenCalled();
    expect(setCourseProjectAction).not.toHaveBeenCalled();
    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    expect((callArgs[8] as { tools: string[] }).tools).toEqual(["Asana (free plan)"]);
  });

  it("a CODING course never gets a committed toolset - the applied-only gate", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "course-1", weeks: 2, courseProject: emptyCourseProject() })],
    });

    await step.run({ schedule: SCHEDULE, minutes: 50, hubCourse: "course-1" }, testHelpers(), () => {});

    expect(selectCourseTools).not.toHaveBeenCalled();
    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    expect((callArgs[8] as { tools: string[] }).tools).toEqual([]);
  });
});

// T2 (no-code pipeline reorder) / Z3 (Group Z): this step turns
// buildScheduleWeekPlan's sequenceOpenerBeforeDeck phase ON - the 10th
// positional argument (index 9) to generateLectureMaterialsFromScheduleAction.
// Z3 SUPERSEDES the old "gated on courseKind === 'applied'" behavior: the
// user explicitly asked to port the no-code opener/case-study sequencing to
// the coding kickoff/refresh path too, so this is now ALWAYS true regardless
// of course kind.
describe("lecture-materials-from-schedule step: sequenceOpenerBeforeDeck wiring (T2/Z3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([plan()]);
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [],
      summary: { kind: "list", label: "label", items: [] },
    });
  });

  it("passes true when courseKind is applied", async () => {
    await step.run({ schedule: SCHEDULE, minutes: 50, courseKind: "applied" }, testHelpers(), () => {});

    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    expect(callArgs[9]).toBe(true);
  });

  it("Z3: also passes true when courseKind is coding (parity port)", async () => {
    await step.run({ schedule: SCHEDULE, minutes: 50, courseKind: "coding" }, testHelpers(), () => {});

    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    expect(callArgs[9]).toBe(true);
  });

  it("Z3: also passes true when courseKind is left unbound (default 'coding')", async () => {
    await step.run({ schedule: SCHEDULE, minutes: 50 }, testHelpers(), () => {});

    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    expect(callArgs[9]).toBe(true);
  });
});

// V3-AC2 (professional-lift audit): a week whose deck fell back to the
// placeholder template used to be visible only inside assembleLectureFiles'
// own step summary - a run's header could still read "Error count:
// (unknown)" while a placeholder deck shipped. This must surface at RUN
// level too, the same PARTIAL_FAILURE_OUTPUT_KEY mechanism the
// weekly-announcements step already uses.
describe("lecture-materials-from-schedule step: partial-failure surfacing (V3-AC2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [],
      summary: { kind: "list", label: "label", items: [] },
    });
  });

  it("sets the partial-failure output key when a week's slides fell back to the placeholder", async () => {
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([
      plan({ weekNumber: 1, slidesFailed: undefined }),
      plan({ weekNumber: 2, slidesFailed: true }),
    ]);

    const result = await step.run({ schedule: SCHEDULE, minutes: 50 }, testHelpers(), () => {});

    expect(result.outputs.__partialFailureDetail).toBeDefined();
    expect(result.outputs.__partialFailureDetail as string).toContain("1 of 2");
    expect(result.outputs.__partialFailureDetail as string).toContain("week 2");
    expect(result.outputs.__partialFailureDetail as string).toContain("NEEDS REGENERATION");
  });

  it("never sets the partial-failure key when every week's slides generated cleanly", async () => {
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([
      plan({ weekNumber: 1 }),
      plan({ weekNumber: 2 }),
    ]);

    const result = await step.run({ schedule: SCHEDULE, minutes: 50 }, testHelpers(), () => {});

    expect(result.outputs.__partialFailureDetail).toBeUndefined();
  });
});

// V2-AC2: a reused organization dated differently across weeks is a plain
// contradiction inside one course - report it in the run's own notes.
describe("lecture-materials-from-schedule step: case-study date-conflict reporting (V2-AC2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [],
      summary: { kind: "list", label: "label", items: [] },
    });
  });

  it("reports a case study dated inconsistently across weeks", async () => {
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([
      plan({
        weekNumber: 1,
        slides: [{ title: "Case Study: The 2002 Denver International Airport Baggage System", bullets: ["b"] }],
      }),
      plan({
        weekNumber: 8,
        slides: [{ title: "Case Study: The 2011 Denver International Airport Baggage System", bullets: ["b"] }],
      }),
    ]);

    const result = await step.run({ schedule: SCHEDULE, minutes: 50 }, testHelpers(), () => {});

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind !== "list") return;
    const dateNote = result.summary.items.find((i) => i.toLowerCase().includes("dated inconsistently"));
    expect(dateNote, "no date-conflict note in the run summary").toBeTruthy();
    expect(dateNote).toContain("Denver");
  });
});

// AC3/AC4 ("deck template should default to just pull from the type of
// class it is"): assembleLectureFiles' own blank-template default now reads
// this step's resolved courseKind (see registry-helpers.
// assembleLectureFiles.ts's resolveDeckTheme wiring) - so THIS step (the
// spine of COURSE_BUILD's multi-course fan-out) must pass its own resolved
// courseKind straight through, per course, unchanged from before this
// feature. assembleLectureFiles is mocked wholesale in this file (see the
// top-of-file vi.mock), so this only pins the WIRING - which value reaches
// assembleLectureFiles' 6th argument; the preset each courseKind resolves to
// is covered directly in registry-helpers.resolveDeckTheme.test.ts.
describe("lecture-materials-from-schedule step: courseKind reaches assembleLectureFiles unchanged (AC3/AC4 wiring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([plan()]);
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [],
      summary: { kind: "list", label: "label", items: [] },
    });
  });

  it("courseKind 'coding' reaches assembleLectureFiles' 6th argument", async () => {
    await step.run({ schedule: SCHEDULE, minutes: 50, courseKind: "coding" }, testHelpers(), () => {});
    const callArgs = vi.mocked(assembleLectureFiles).mock.calls[0];
    expect(callArgs[5]).toBe("coding");
  });

  it("courseKind 'applied' reaches assembleLectureFiles' 6th argument - a DIFFERENT value from the coding case above, from the SAME step", async () => {
    await step.run({ schedule: SCHEDULE, minutes: 50, courseKind: "applied" }, testHelpers(), () => {});
    const callArgs = vi.mocked(assembleLectureFiles).mock.calls[0];
    expect(callArgs[5]).toBe("applied");
  });

  it("an unbound courseKind defaults to 'coding' before reaching assembleLectureFiles (unchanged default)", async () => {
    await step.run({ schedule: SCHEDULE, minutes: 50 }, testHelpers(), () => {});
    const callArgs = vi.mocked(assembleLectureFiles).mock.calls[0];
    expect(callArgs[5]).toBe("coding");
  });
});
