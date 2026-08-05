// resolveClassSessionProjectOverrides is the pure precedence rule
// populate-lms-from-class-template's run() applies to its projectMode/
// projectDescription inputs (steps.class-session-populate.ts): the
// template's own setting < the course's persisted project < an explicit run
// override. It was extracted verbatim (no behavior change) from run() so
// this precedence - the exact rule COURSE_BUILD's projectMode/
// projectDescription bindings had no way to exercise before they were fixed
// (presets/course-build.ts) - is directly unit-testable without mocking the
// rest of run() (template loading, Canvas/LLM calls).
//
// Every combination of {run override, persisted project, blank} is pinned
// below, including the two cases that already worked before the binding fix
// (blank run input + no persisted project stays on the template; blank run
// input + a persisted project auto-promotes) so a future change to this
// rule cannot silently regress them.

import { describe, it, expect, vi, beforeEach } from "vitest";

// populate-lms-from-class-template's Canvas-only guard (see the describe
// block near the bottom of this file) needs the step's own action calls
// mocked - getArtifactTemplateAction, listCourseHubAction, and every
// per-week LLM/Canvas call run() makes. Vitest hoists every vi.mock call
// above all imports regardless of where in the file it is written, so
// "./steps.class-session-populate" below picks up this mocked module when
// IT imports from "@/app/actions" internally.
vi.mock("@/app/actions", () => ({
  getArtifactTemplateAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  findCaseStudyMaterialAction: vi.fn(),
  generateAssignmentAction: vi.fn(),
  generateTestQuestionsAction: vi.fn(),
  createGradableAction: vi.fn(),
  createQuizQuestionAction: vi.fn(),
}));

import {
  getArtifactTemplateAction,
  listCourseHubAction,
  listCourseContentAction,
  generateAssignmentAction,
  generateTestQuestionsAction,
  createGradableAction,
  createQuizQuestionAction,
} from "@/app/actions";
import { resolveClassSessionProjectOverrides, classSessionPopulateSteps } from "./steps.class-session-populate";
import { emptyCourseProject, type CourseProject } from "@/lib/course-project";
import { emptyClassSessionSpec, type ArtifactTemplate, type ClassSessionSpec } from "@/lib/artifact-templates/types";
import { canvasOnlySkipText } from "./lms-target-guard";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";

function persistedProject(definition: string): CourseProject {
  return { ...emptyCourseProject(), mode: "course-long", definition };
}

describe("resolveClassSessionProjectOverrides", () => {
  // --- No persisted project on the tile ---

  it("no run override, no persisted project: stays on the template's own setting (unchanged - this case already worked)", () => {
    const result = resolveClassSessionProjectOverrides({}, emptyCourseProject());
    expect(result.projectMode).toBe("template");
    expect(result.projectDescription).toBe("");
  });

  it("blank-string run override, no persisted project: identical to no override at all", () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "", projectDescription: "" },
      emptyCourseProject()
    );
    expect(result.projectMode).toBe("template");
    expect(result.projectDescription).toBe("");
  });

  it('whitespace-only run override is treated as blank, not as a literal "  " mode', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "   ", projectDescription: "   " },
      emptyCourseProject()
    );
    expect(result.projectMode).toBe("template");
    expect(result.projectDescription).toBe("");
  });

  it('explicit run override "none", no persisted project: honored (a genuine no-op here, since there is nothing to turn off)', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "none" },
      emptyCourseProject()
    );
    expect(result.projectMode).toBe("none");
  });

  it('explicit run override "course-long" with a run-supplied description, no persisted project: both honored', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "course-long", projectDescription: "A neighborhood cleanup tracker" },
      emptyCourseProject()
    );
    expect(result.projectMode).toBe("course-long");
    expect(result.projectDescription).toBe("A neighborhood cleanup tracker");
  });

  it('explicit run override "course-long" with NO run-supplied description and no persisted project: projectDescription resolves to "" (applyClassSessionOverrides then falls back to the template\'s own canned text)', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "course-long" },
      emptyCourseProject()
    );
    expect(result.projectMode).toBe("course-long");
    expect(result.projectDescription).toBe("");
  });

  // --- A persisted course-long project on the tile ---

  it("no run override, a persisted project: silently auto-promotes to course-long, using the persisted description (unchanged - this case already worked, it is the bridge documented at the call site)", () => {
    const result = resolveClassSessionProjectOverrides({}, persistedProject("A term-long data pipeline"));
    expect(result.projectMode).toBe("course-long");
    expect(result.projectDescription).toBe("A term-long data pipeline");
  });

  it('explicit run override "none" with a persisted project: the run override wins outright - this is the genuinely NEW capability the binding fix unlocks (previously projectMode could only ever resolve to "" -> "template", so the auto-promotion above always fired and could never be turned off for one run)', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "none" },
      persistedProject("A term-long data pipeline")
    );
    expect(result.projectMode).toBe("none");
  });

  it('explicit run override "course-long" with a persisted project but no run description: falls back to the persisted description', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "course-long" },
      persistedProject("A term-long data pipeline")
    );
    expect(result.projectMode).toBe("course-long");
    expect(result.projectDescription).toBe("A term-long data pipeline");
  });

  it("a run-supplied description alone (no mode override) still wins over the persisted description, even though the mode itself only auto-promotes: the description precedence is independent of how projectMode got to course-long", () => {
    const result = resolveClassSessionProjectOverrides(
      { projectDescription: "This run only: focus on the deployment milestone" },
      persistedProject("A term-long data pipeline")
    );
    expect(result.projectMode).toBe("course-long");
    expect(result.projectDescription).toBe("This run only: focus on the deployment milestone");
  });

  it('explicit run override "course-long" WITH a run description, and a persisted project: the run description wins over the persisted one - "an explicit run override" outranks "the course\'s persisted project" for the description too, not just the mode', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "course-long", projectDescription: "This run only: focus on the deployment milestone" },
      persistedProject("A term-long data pipeline")
    );
    expect(result.projectMode).toBe("course-long");
    expect(result.projectDescription).toBe("This run only: focus on the deployment milestone");
  });

  it('explicit run override literally "template" is indistinguishable from leaving the field blank: it still auto-promotes when the tile has a persisted project. Documented nuance, not a regression - "template" is not a forcing option, only "none"/"course-long" are genuine explicit overrides.', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "template" },
      persistedProject("A term-long data pipeline")
    );
    expect(result.projectMode).toBe("course-long");
    expect(result.projectDescription).toBe("A term-long data pipeline");
  });

  it("a persisted project whose mode is not course-long (hasProject false) is treated exactly like no project at all", () => {
    const notReallyAProject: CourseProject = { ...emptyCourseProject(), mode: "none", definition: "Leftover text" };
    const result = resolveClassSessionProjectOverrides({}, notReallyAProject);
    expect(result.projectMode).toBe("template");
    expect(result.projectDescription).toBe("Leftover text");
  });
});

// THE TRAP: populate-lms-from-class-template's blank `template` is a
// documented, load-bearing NO-OP meaning "skip populating the LMS" (see this
// step's own "Blank does nothing" input help text above) - multiple presets
// (COURSE_KICKOFF, NO_CODE_KICKOFF) rely on leaving this picker empty to mean
// "do not touch the LMS this run." This is the OPPOSITE of deckTemplate's own
// blank-means-course-kind-default fix (defaultDeckTemplateIdForCourseKind,
// decks/presets.ts / resolveDeckTheme, registry-helpers.
// assembleLectureFiles.ts): applying that same defaulting here would
// silently convert an intentional opt-out into unwanted LMS content creation
// for every existing run that leaves this blank - a correctness regression,
// not an improvement. classSessionTemplate is therefore deliberately left
// alone; this test only PINS the existing no-op so a future change cannot
// blur the two apart.
describe("populate-lms-from-class-template step: blank template stays a documented no-op", () => {
  const step = classSessionPopulateSteps.find((s) => s.type === "populate-lms-from-class-template")!;
  const noop = () => {};

  it("a blank template returns weeksPopulated: 0 and the 'nothing generated' summary, without touching hubCourse/LLM/Canvas at all", async () => {
    const result = await step.run({ template: "" }, undefined as never, noop);
    expect(result.outputs).toEqual({ weeksPopulated: 0, outline: "" });
    expect(result.summary).toEqual({
      kind: "text",
      text: "No class session template selected - nothing generated.",
    });
  });

  it("an unbound template input (undefined) is treated identically to an explicit blank string", async () => {
    const result = await step.run({}, undefined as never, noop);
    expect(result.outputs).toEqual({ weeksPopulated: 0, outline: "" });
    expect(result.summary).toEqual({
      kind: "text",
      text: "No class session template selected - nothing generated.",
    });
  });

  it("a whitespace-only template input is trimmed to blank and treated the same way", async () => {
    const result = await step.run({ template: "   " }, undefined as never, noop);
    expect(result.outputs.weeksPopulated).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// populate-lms-from-class-template: Canvas-only guard on the per-week Canvas
// block (docs/REGRESSION.md 217/218, lms-target-guard.ts). Deliberately a
// PARTIAL guard, not a whole-step skip like starter-materials/lms-modules/
// lms-assignments/lms-wipe's guards: this step's value is the per-week LLM
// generation and the local outline, both usable on any LMS, so only the
// createGradableAction/createQuizQuestionAction sub-block is gated on
// `canPostToCanvas`. Before this guard, a Blackboard tile's canvasUrl
// (non-blank - entry 218: the DB column is canvas_url and holds Blackboard
// URLs too, so the pre-existing `!canvasUrl` check could never catch it)
// slipped past the "no Canvas URL" check, ran the full per-week generation,
// then threw inside the per-week try/catch on the Canvas call. That skipped
// `populated++` (it sits AFTER the Canvas block) and reported
// weeksPopulated: 0 despite a fully generated outline, plus one cryptic
// "Expected a link like .../courses/123" note per week.
// ---------------------------------------------------------------------------

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "Intro to Testing",
    courseCode: null,
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

function baseTemplate(
  overrides: Partial<ArtifactTemplate<ClassSessionSpec>> = {}
): ArtifactTemplate<ClassSessionSpec> {
  return {
    id: "tpl-1",
    kind: "class-session",
    name: "Weekly class session",
    description: "A generic weekly template.",
    spec: emptyClassSessionSpec(),
    ...overrides,
  };
}

// The real Blackboard Ultra URL from run 756544e0-f94b-4172-9a19-ecc8967e4a25,
// the run this whole guard family was written against (see
// steps.course-setup.materials.canvas-guard.test.ts / steps.lms-modules.
// test.ts, which use the identical constant).
const BLACKBOARD_URL = "https://wncc.blackboard.com/ultra/courses/_33114_1/outline";
const CANVAS_URL = "https://canvas.example.edu/courses/1";

const populateStep = classSessionPopulateSteps.find((s) => s.type === "populate-lms-from-class-template")!;
const runNoop = () => {};

describe("populate-lms-from-class-template: Canvas-only guard on the per-week Canvas block", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    // No live LMS modules on any tile in this suite - topic resolution falls
    // through to the "could not resolve a topic" note, which is harmless
    // here: sessionTitle always includes the week label even with no topic,
    // so the outline still names every week regardless.
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "Test Course", modules: [], pages: [] });
    vi.mocked(generateAssignmentAction).mockResolvedValue({
      title: "Generated assignment",
      overview: "Overview text",
      steps: [],
      tools: [],
      deliverables: [],
    });
    vi.mocked(generateTestQuestionsAction).mockResolvedValue({
      title: "Generated quiz",
      instructions: "",
      questions: [],
    });
    vi.mocked(createGradableAction).mockResolvedValue({ id: 1 });
  });

  it("case 1 (headline): a Blackboard tile still populates every week locally - weeksPopulated is non-zero and matches the range, the outline names every week, and no Canvas action is ever called", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "blackboard", canvasUrl: BLACKBOARD_URL })],
    });

    const result = await populateStep.run(
      { template: "tpl-1", hubCourse: "tile-1", fromWeek: 1, toWeek: 3, postToCanvas: "1" },
      testHelpers(),
      runNoop
    );

    expect(result.outputs.weeksPopulated).toBe(3);
    expect(result.outputs.outline).not.toBe("");
    expect(result.outputs.outline).toContain("Week 1");
    expect(result.outputs.outline).toContain("Week 2");
    expect(result.outputs.outline).toContain("Week 3");
    expect(createGradableAction).not.toHaveBeenCalled();
    expect(createQuizQuestionAction).not.toHaveBeenCalled();
  });

  it("case 2: pushes the Canvas-only skip note exactly once, not once per week", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "blackboard", canvasUrl: BLACKBOARD_URL })],
    });

    const result = await populateStep.run(
      { template: "tpl-1", hubCourse: "tile-1", fromWeek: 1, toWeek: 3, postToCanvas: "1" },
      testHelpers(),
      runNoop
    );

    expect(result.summary.kind).toBe("list");
    const items = result.summary.kind === "list" ? result.summary.items : [];
    const skipNoteOccurrences = items.filter((item) => item === canvasOnlySkipText("blackboard"));
    expect(skipNoteOccurrences).toHaveLength(1);
  });

  it("case 3: does not promise an unpublished Canvas draft on a Blackboard run, since nothing was created", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "blackboard", canvasUrl: BLACKBOARD_URL })],
    });

    const result = await populateStep.run(
      { template: "tpl-1", hubCourse: "tile-1", fromWeek: 1, toWeek: 3, postToCanvas: "1" },
      testHelpers(),
      runNoop
    );

    const items = result.summary.kind === "list" ? result.summary.items : [];
    expect(items.some((item) => item.includes("UNPUBLISHED draft"))).toBe(false);
  });

  it("case 4: a Canvas course still gets its Canvas drafts created, and the unpublished-draft note still appears - the guard must not break a working Canvas run", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "canvas", canvasUrl: CANVAS_URL })],
    });

    const result = await populateStep.run(
      { template: "tpl-1", hubCourse: "tile-1", fromWeek: 1, toWeek: 1, postToCanvas: "1" },
      testHelpers(),
      runNoop
    );

    expect(createGradableAction).toHaveBeenCalled();
    const items = result.summary.kind === "list" ? result.summary.items : [];
    expect(items.some((item) => item.includes("UNPUBLISHED draft"))).toBe(true);
  });

  it("case 5: a tile with no lms recorded fails open - Canvas drafts are created exactly as they were before this guard existed", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: null, institution: null, canvasUrl: CANVAS_URL })],
    });

    const result = await populateStep.run(
      { template: "tpl-1", hubCourse: "tile-1", fromWeek: 1, toWeek: 1, postToCanvas: "1" },
      testHelpers(),
      runNoop
    );

    expect(createGradableAction).toHaveBeenCalled();
    const items = result.summary.kind === "list" ? result.summary.items : [];
    expect(items.some((item) => item.startsWith("Skipped - this course is on"))).toBe(false);
    expect(items.some((item) => item.includes("UNPUBLISHED draft"))).toBe(true);
  });

  it("case 6 (efficiency): with Canvas posting turned off, the LMS-lookup fallback never runs, even though the tile has no lms of its own and could otherwise trigger the institution fallback - the tileLms ternary must stay short-circuited so the guard costs nothing on a path it cannot change", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: null, institution: "MCC", canvasUrl: CANVAS_URL })],
    });
    const getInstitutionFields = vi.fn().mockResolvedValue([]);

    await populateStep.run(
      { template: "tpl-1", hubCourse: "tile-1", fromWeek: 1, toWeek: 1, postToCanvas: "0" },
      testHelpers({ getInstitutionFields }),
      runNoop
    );

    expect(getInstitutionFields).not.toHaveBeenCalled();
  });
});
