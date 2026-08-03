import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";

// starter-materials imports a lot of Canvas + course-hub + syllabus actions
// (it seeds a whole "Start Here" module, not just the syllabus). Every named
// export the step imports from "@/app/actions" must be present here, even the
// ones this file's scenarios never call, or the import binds to undefined.
vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  createModuleAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  createGradableAction: vi.fn(),
  createQuizQuestionAction: vi.fn(),
  bulkUpdateAction: vi.fn(),
  createModuleItemAction: vi.fn(),
  createCourseAssignmentAction: vi.fn(),
  getFinalizedSyllabusAction: vi.fn(),
  generateCourseSyllabusAction: vi.fn(),
  createFinalizedSyllabusAction: vi.fn(),
  placeSyllabusInModuleAction: vi.fn(),
  updateCourseHubAction: vi.fn(),
  createPageAction: vi.fn(),
  requestFileUploadAction: vi.fn(),
}));

import {
  listCourseHubAction,
  listCourseContentAction,
  createGradableAction,
  createQuizQuestionAction,
  bulkUpdateAction,
  createModuleItemAction,
  getFinalizedSyllabusAction,
  generateCourseSyllabusAction,
  createFinalizedSyllabusAction,
  placeSyllabusInModuleAction,
  updateCourseHubAction,
} from "@/app/actions";
import { courseSetupMaterialsSteps } from "./steps.course-setup.materials";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import type { InstitutionField } from "@/lib/institution-fields";

const step = courseSetupMaterialsSteps.find((s) => s.type === "starter-materials")!;

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
    workflowId: "workflow-1",
    workflowName: "Test Workflow",
    workflowRunId: "run-1",
    ...overrides,
  };
}

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "CS 101",
    courseCode: null,
    term: null,
    canvasUrl: "https://canvas.example.edu/courses/123",
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

function institutionFields(fields: Partial<InstitutionField>[]): InstitutionField[] {
  return fields.map((f) => ({
    id: f.id ?? "",
    label: f.label ?? "",
    type: f.type ?? "text",
    value: f.value ?? "",
    ...(f.lms !== undefined ? { lms: f.lms } : {}),
  }));
}

const generatedSyllabus = { base64: "dGVzdCBkYXRh", name: "Generated Syllabus" };
const savedSyllabusMeta = {
  id: "new-syllabus",
  name: "Generated Syllabus",
  fileName: "CS 101 - Syllabus.docx",
  courseCode: null,
  updatedAt: "2024-09-01T00:00:00Z",
};

// Wires up every action call starter-materials makes once it decides to
// generate a syllabus (past the template-resolution branch), so each test
// below only has to vary the tile's syllabusTemplateId / institution fields.
function mockHappyPath(tile: Course) {
  vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
  vi.mocked(listCourseContentAction).mockResolvedValue({
    courseName: tile.name,
    modules: [
      { id: 1, name: "Start Here", position: 1, published: true, itemsCount: 0, items: [] },
    ],
    pages: [],
  });
  vi.mocked(generateCourseSyllabusAction).mockResolvedValue(generatedSyllabus);
  vi.mocked(createFinalizedSyllabusAction).mockResolvedValue({ syllabus: savedSyllabusMeta });
  vi.mocked(updateCourseHubAction).mockResolvedValue({ course: tile });
  vi.mocked(getFinalizedSyllabusAction).mockResolvedValue({
    syllabus: { ...savedSyllabusMeta, content: "ZG9jeCBjb250ZW50" },
  });
  vi.mocked(placeSyllabusInModuleAction).mockResolvedValue({ ok: true });
  vi.mocked(createGradableAction).mockResolvedValue({ id: 555 });
  vi.mocked(createQuizQuestionAction).mockResolvedValue({
    question: {
      id: 1,
      position: 1,
      name: "Syllabus acknowledgement",
      text: "I read and understand the syllabus.",
      type: "true_false_question",
      points: 1,
      answers: [
        { text: "True", correct: true },
        { text: "False", correct: false },
      ],
    },
  });
  vi.mocked(bulkUpdateAction).mockResolvedValue({ updated: 1, failures: [] });
  vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true });
}

// Start-Here-module output family (output-selection.ts): the "selected"
// input lets course-build.ts's own COURSE_BUILD gate this WHOLE step off its
// own "selectedStartHere" boolean without a runIf on the step itself (this
// step declares no outputs, so nothing downstream could ever be
// skip-cascaded through it either way). Every OTHER preset that uses this
// step (course-refresh's own nested include, and the standalone
// starter-materials preset) leaves it unbound, so isGeneratorSelected's own
// "unbound means generate" default must hold for them too.
describe("starter-materials step - selected gate (Start-Here-module output family)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deselected: does no work and calls no Canvas actions at all", async () => {
    const result = await step.run(
      { courses: "https://canvas.example.edu/courses/123", selected: "" },
      testHelpers(),
      () => {}
    );
    expect(result.outputs).toEqual({});
    expect(result.summary).toEqual({
      kind: "text",
      text: "Skipped - the Start Here module was not selected in this run's output selection.",
    });
    expect(listCourseHubAction).not.toHaveBeenCalled();
    expect(listCourseContentAction).not.toHaveBeenCalled();
  });

  it("an unbound 'selected' input (undefined) still generates - every OTHER preset using this step leaves it unbound", async () => {
    const tile = baseCourse();
    mockHappyPath({ ...tile, syllabusId: "existing-syllabus" });
    vi.mocked(getFinalizedSyllabusAction).mockResolvedValue({
      syllabus: { ...savedSyllabusMeta, id: "existing-syllabus", content: "ZG9jeCBjb250ZW50" },
    });

    const result = await step.run({ courses: tile.canvasUrl! }, testHelpers(), () => {});

    expect(listCourseHubAction).toHaveBeenCalled();
    expect(result.summary.kind).toBe("list");
  });

  it("explicitly selected ('1') still generates, same as unbound", async () => {
    const tile = baseCourse();
    mockHappyPath({ ...tile, syllabusId: "existing-syllabus" });
    vi.mocked(getFinalizedSyllabusAction).mockResolvedValue({
      syllabus: { ...savedSyllabusMeta, id: "existing-syllabus", content: "ZG9jeCBjb250ZW50" },
    });

    const result = await step.run({ courses: tile.canvasUrl!, selected: "1" }, testHelpers(), () => {});

    expect(listCourseHubAction).toHaveBeenCalled();
    expect(result.summary.kind).toBe("list");
  });
});

describe("starter-materials step - syllabus template resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // This is the integration-level guard for defect 2 in
  // bug-syllabus-template-resolution.md: the helper test alone proves
  // resolveSyllabusTemplateId's precedence, but not that starter-materials
  // actually calls it. starter-materials is the step that runs on every
  // kickoff/refresh workflow and generates the syllabus in practice (since
  // generate-syllabus short-circuits once a syllabus is already linked), so
  // this is the copy that matters most.
  it("the per-course syllabusTemplateId column wins over the institution field", async () => {
    const tile = baseCourse({
      id: "course-1",
      syllabusTemplateId: "course-tpl",
      institution: "MCC",
    });
    mockHappyPath(tile);
    const getInstitutionFields = vi.fn(async () =>
      institutionFields([{ id: "syllabusTemplate", value: "inst-tpl" }])
    );

    const result = await step.run(
      { courses: tile.canvasUrl as string },
      testHelpers({ getInstitutionFields }),
      () => {}
    );

    expect(generateCourseSyllabusAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateCourseSyllabusAction).mock.calls[0];
    expect(callArgs[0]).toBe("course-tpl");
    expect(result.summary.kind).toBe("list");
  });

  it("the institution field is used when the per-course column is blank", async () => {
    const tile = baseCourse({
      id: "course-1",
      syllabusTemplateId: null,
      institution: "MCC",
    });
    mockHappyPath(tile);
    const getInstitutionFields = vi.fn(async () =>
      institutionFields([{ id: "syllabusTemplate", value: "inst-tpl" }])
    );

    await step.run(
      { courses: tile.canvasUrl as string },
      testHelpers({ getInstitutionFields }),
      () => {}
    );

    expect(generateCourseSyllabusAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateCourseSyllabusAction).mock.calls[0];
    expect(callArgs[0]).toBe("inst-tpl");
  });

  it("a whitespace-only course template column does not win - falls through to the institution field", async () => {
    const tile = baseCourse({
      id: "course-1",
      syllabusTemplateId: "   ",
      institution: "MCC",
    });
    mockHappyPath(tile);
    const getInstitutionFields = vi.fn(async () =>
      institutionFields([{ id: "syllabusTemplate", value: "inst-tpl" }])
    );

    await step.run(
      { courses: tile.canvasUrl as string },
      testHelpers({ getInstitutionFields }),
      () => {}
    );

    expect(generateCourseSyllabusAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateCourseSyllabusAction).mock.calls[0];
    expect(callArgs[0]).toBe("inst-tpl");
  });

  it("no template on the course or the institution - syllabus generation is skipped, not called", async () => {
    const tile = baseCourse({
      id: "course-1",
      syllabusTemplateId: null,
      institution: "MCC",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: tile.name,
      modules: [
        { id: 1, name: "Start Here", position: 1, published: true, itemsCount: 0, items: [] },
      ],
      pages: [],
    });
    vi.mocked(createGradableAction).mockResolvedValue({ id: 555 });
    vi.mocked(createQuizQuestionAction).mockResolvedValue({
      question: {
        id: 1,
        position: 1,
        name: "Syllabus acknowledgement",
        text: "I read and understand the syllabus.",
        type: "true_false_question",
        points: 1,
        answers: [
          { text: "True", correct: true },
          { text: "False", correct: false },
        ],
      },
    });
    vi.mocked(bulkUpdateAction).mockResolvedValue({ updated: 1, failures: [] });
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true });
    const getInstitutionFields = vi.fn(async () => institutionFields([]));

    const result = await step.run(
      { courses: tile.canvasUrl as string },
      testHelpers({ getInstitutionFields }),
      () => {}
    );

    expect(generateCourseSyllabusAction).not.toHaveBeenCalled();
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(
        result.summary.items.some((i) =>
          i.includes("no syllabus template set on the course or its institution")
        )
      ).toBe(true);
    }
  });
});

describe("starter-materials step - syllabus facts mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Integration-level guard for the facts-mapping duplication regression
  // (rca-syllabus-facts-duplication.md): the helper's own tests
  // (syllabus-facts.test.ts) prove buildSyllabusFactsFromCourse's field
  // mapping in isolation, but not that starter-materials actually calls it
  // instead of hand-rolling its own copy of the same 12-key object. The
  // expected value below is hardcoded (not computed via the helper), so a
  // regression back to an inline mapping - or a mutation inside the helper
  // itself - shows up as a failure in this suite too, not just the helper's.
  it("sends the tile's courseCode to generateCourseSyllabusAction through the shared facts mapping", async () => {
    const tile = baseCourse({
      id: "course-1",
      syllabusTemplateId: "course-tpl",
      institution: "MCC",
      courseCode: "CS-100",
    });
    mockHappyPath(tile);
    const getInstitutionFields = vi.fn(async () =>
      institutionFields([{ id: "syllabusTemplate", value: "inst-tpl" }])
    );

    await step.run(
      { courses: tile.canvasUrl as string },
      testHelpers({ getInstitutionFields }),
      () => {}
    );

    expect(generateCourseSyllabusAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateCourseSyllabusAction).mock.calls[0];
    expect(callArgs[1]).toMatchObject({ courseCode: "CS-100" });
  });
});
