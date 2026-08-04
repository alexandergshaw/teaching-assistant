import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";

vi.mock("@/app/actions", () => ({
  getRepoZipAction: vi.fn(),
  generateLecturePlansAction: vi.fn(),
  generateLectureMaterialsFromScheduleAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  generateLectureFromMaterialsAction: vi.fn(),
  regenerateAnnouncementAction: vi.fn(),
  generateClassOpenerAction: vi.fn(),
  findCaseStudyMaterialAction: vi.fn(),
  findPracticeProblemsAction: vi.fn(),
  saveLibraryFileAction: vi.fn(),
  getDeckTemplateAction: vi.fn(),
}));

// buildSlidesPptx drives real pptx-shape/theme rendering that this test does
// not care about (that is buildSlidesPptx's own test's job) - mocked so the
// step's own orchestration (what courseKind reaches the generator) is
// directly observable.
vi.mock("@/lib/pptx", () => ({
  buildSlidesPptx: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
}));

import { listCourseHubAction, generateLectureFromMaterialsAction, getDeckTemplateAction } from "@/app/actions";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";

describe("prepare-lecture step", () => {
  const def = getStepDefinition("prepare-lecture");
  expect(def, "prepare-lecture step exists").toBeTruthy();

  it("has the correct name and category", () => {
    expect(def!.name).toBe("Prepare lecture");
    expect(def!.type).toBe("prepare-lecture");
  });

  it("mentions grounding in module materials in the description", () => {
    const desc = def!.description;
    expect(desc).toContain("module's materials");
  });

  it("has optional inputs: hubCourse, moduleId, autonomous, template, and modulesAhead", () => {
    const hubCourseInput = def!.inputs.find((i) => i.key === "hubCourse");
    expect(hubCourseInput, "hubCourse input exists").toBeTruthy();
    expect(hubCourseInput!.type).toBe("hubCourse");
    expect(hubCourseInput!.required).toBe(false);

    const moduleIdInput = def!.inputs.find((i) => i.key === "moduleId");
    expect(moduleIdInput, "moduleId input exists").toBeTruthy();
    expect(moduleIdInput!.type).toBe("lmsModule");
    expect(moduleIdInput!.required).toBe(false);

    const autonomousInput = def!.inputs.find((i) => i.key === "autonomous");
    expect(autonomousInput, "autonomous input exists").toBeTruthy();
    expect(autonomousInput!.type).toBe("boolean");
    expect(autonomousInput!.required).toBe(false);

    const templateInput = def!.inputs.find((i) => i.key === "template");
    expect(templateInput, "template input exists").toBeTruthy();
    expect(templateInput!.type).toBe("deckTemplate");
    expect(templateInput!.required).toBe(false);

    const modulesAheadInput = def!.inputs.find((i) => i.key === "modulesAhead");
    expect(modulesAheadInput, "modulesAhead input exists").toBeTruthy();
    expect(modulesAheadInput!.type).toBe("moduleOffset");
    expect(modulesAheadInput!.required).toBe(false);

    const sourcesInput = def!.inputs.find((i) => i.key === "sources");
    expect(sourcesInput, "sources input exists").toBeTruthy();
    expect(sourcesInput!.type).toBe("sourcePolicy");
    expect(sourcesInput!.required).toBe(false);
  });

  // AC1: this step calls generateLectureFromMaterialsAction directly (not
  // through the schedule-driven path), so without its own courseKind input
  // it had no way to tell that generator an applied course must not receive
  // code - the "fourth path" the MGT 422 incident traced back to.
  it("has a courseKind input with coding/applied options, defaulting to unset (coding)", () => {
    const courseKindInput = def!.inputs.find((i) => i.key === "courseKind");
    expect(courseKindInput, "courseKind input exists").toBeTruthy();
    expect(courseKindInput!.type).toBe("text");
    expect(courseKindInput!.required).toBe(false);
    expect(courseKindInput!.options).toEqual(["coding", "applied"]);
  });

  it("has correct outputs: announcement and moduleName", () => {
    const announcementOutput = def!.outputs.find((o) => o.key === "announcement");
    expect(announcementOutput, "announcement output exists").toBeTruthy();
    expect(announcementOutput!.type).toBe("longtext");

    const moduleNameOutput = def!.outputs.find((o) => o.key === "moduleName");
    expect(moduleNameOutput, "moduleName output exists").toBeTruthy();
    expect(moduleNameOutput!.type).toBe("text");
  });

  it("has exactly 2 outputs", () => {
    expect(def!.outputs.length).toBe(2);
  });

  it("has exactly 7 inputs", () => {
    expect(def!.inputs.length).toBe(7);
  });
});

// AC1 (run-level): the metadata tests above only assert that a courseKind
// INPUT exists on the step; they cannot catch a regression where the input
// is declared but never actually reaches generateLectureFromMaterialsAction.
// These tests drive step.run() for real (materials gathered from the tile's
// topics/description, the only network-free source tier) and inspect what
// courseKind the generator was actually called with.
describe("prepare-lecture step run(): courseKind reaches the generator", () => {
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
      name: "MGT 422",
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
      topics: "Stakeholder analysis",
      csvName: null,
      csvData: null,
      rubricName: null,
      rubricData: null,
      startDate: null,
      description: "A no-code project management course.",
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

  const runValues = (extra: Record<string, unknown> = {}) => ({
    hubCourse: "course-1",
    // Forces the network-free tile-meta gatherer, same idiom as
    // registry.lecture-zip.test.ts's "blank repo builds the zip from course
    // sources" test.
    sources: JSON.stringify({ order: ["tile-meta"], strategy: "first-success" }),
    ...extra,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(getDeckTemplateAction).mockResolvedValue({ error: "not found" });
    vi.mocked(generateLectureFromMaterialsAction).mockResolvedValue({
      presentationTitle: "T",
      slides: [{ title: "Principle: Scope", bullets: ["b"] }],
      announcement: "Come to class.",
    });
  });

  const def = getStepDefinition("prepare-lecture")!;

  it("passes 'applied' through when courseKind is bound to applied", async () => {
    await def.run(runValues({ courseKind: "applied" }), testHelpers(), () => {});

    expect(generateLectureFromMaterialsAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateLectureFromMaterialsAction).mock.calls[0];
    expect(callArgs[4]).toBe("applied");
  });

  it("defaults to 'coding' when courseKind is left unbound (unchanged prior behavior)", async () => {
    await def.run(runValues(), testHelpers(), () => {});

    expect(generateLectureFromMaterialsAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateLectureFromMaterialsAction).mock.calls[0];
    expect(callArgs[4]).toBe("coding");
  });

  // AC2: the note surfaces even though the guard already made the shipped
  // slides safe - a run that received code for a no-code course must not
  // look silently clean.
  it("surfaces a note when the generator reports code was stripped", async () => {
    vi.mocked(generateLectureFromMaterialsAction).mockResolvedValue({
      presentationTitle: "T",
      slides: [{ title: "Principle: Scope", bullets: ["b"] }],
      announcement: "Come to class.",
      codeStripped: 2,
    });

    const result = await def.run(runValues({ courseKind: "applied" }), testHelpers(), () => {});

    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("code removed from 2 slide(s)"))).toBe(true);
    } else {
      throw new Error("expected a list summary");
    }
  });

  // AC2 (graphics-gap-reporting hand-off): generateLectureFromMaterialsAction
  // used to return a `graphicsMissing` count nothing read (see that action's
  // own comment) - this step now recomputes the same check directly from the
  // generated slides, so this is a THIRD applied-deck-producing path (beyond
  // assembleLectureFiles' two callers, AC1) whose surviving gap must not ship
  // silently.
  it("surfaces a note when a required-graphic slide comes back with no graphic", async () => {
    vi.mocked(generateLectureFromMaterialsAction).mockResolvedValue({
      presentationTitle: "T",
      slides: [{ title: "Judgment Call: cost vs schedule", bullets: ["b"] }],
      announcement: "Come to class.",
    });

    const result = await def.run(runValues({ courseKind: "applied" }), testHelpers(), () => {});

    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("missing a required graphic"))).toBe(true);
    } else {
      throw new Error("expected a list summary");
    }
  });

  it("reports no gap when every required-prefix slide carries its graphic", async () => {
    vi.mocked(generateLectureFromMaterialsAction).mockResolvedValue({
      presentationTitle: "T",
      slides: [
        {
          title: "Artifact: a register",
          bullets: ["b"],
          graphic: { kind: "table", headers: ["A"], rows: [["1"]] },
        },
      ],
      announcement: "Come to class.",
    });

    const result = await def.run(runValues({ courseKind: "applied" }), testHelpers(), () => {});

    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("missing a required graphic"))).toBe(false);
    } else {
      throw new Error("expected a list summary");
    }
  });

  // A coding course must never be flagged - graphics are an applied-only
  // concept (enforceGraphicsForApplied is a no-op for `kind !== "applied"`).
  it("a coding course is never flagged, even with an Artifact:-titled slide and no graphic", async () => {
    vi.mocked(generateLectureFromMaterialsAction).mockResolvedValue({
      presentationTitle: "T",
      slides: [{ title: "Artifact: a register", bullets: ["b"] }],
      announcement: "Come to class.",
    });

    const result = await def.run(runValues({ courseKind: "coding" }), testHelpers(), () => {});

    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("missing a required graphic"))).toBe(false);
    } else {
      throw new Error("expected a list summary");
    }
  });

  // DOCUMENTED GAP (not a defect of this pass): the "deck template should
  // default to just pull from the type of class it is" fix lives at the
  // resolveDeckTheme/assembleLectureFiles choke point (registry-helpers.
  // assembleLectureFiles.ts). This step calls resolveDeckTheme directly with
  // only `values.template` (steps.content-lectures.prepare.ts) - it never
  // passes its own resolved `courseKind` through - so unlike lecture-zip and
  // lecture-materials-from-schedule (both of which route through
  // assembleLectureFiles and DO now default per course kind), a blank
  // template here still resolves preset-classic-lecture regardless of this
  // step's own courseKind. Pinned here so a future change to
  // steps.content-lectures.prepare.ts is a deliberate choice, not a silent
  // side effect.
  it("current behavior: a blank template resolves preset-classic-lecture even for a coding course, because this step never threads its own courseKind into resolveDeckTheme", async () => {
    await def.run(runValues({ courseKind: "coding", template: "" }), testHelpers(), () => {});
    expect(getDeckTemplateAction).toHaveBeenCalledWith("preset-classic-lecture");
  });
});
