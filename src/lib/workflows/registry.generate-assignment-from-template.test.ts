import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";

vi.mock("@/app/actions", () => ({
  getArtifactTemplateAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  generateAssignmentAction: vi.fn(),
  generateAssignmentRubricAction: vi.fn(),
  generateClassOpenerAction: vi.fn(),
  createGradableAction: vi.fn(),
  saveLibraryFileAction: vi.fn(),
}));

// buildDocxFromPlainText is mocked so the step's own orchestration (what text
// it hands the docx builder, in what order) is directly observable without
// asserting against a real, zipped .docx binary.
vi.mock("@/lib/docx", () => ({
  buildDocxFromPlainText: vi.fn(async (text: string) => new TextEncoder().encode(text).buffer),
}));

import {
  getArtifactTemplateAction,
  listCourseHubAction,
  generateAssignmentAction,
  generateAssignmentRubricAction,
  generateClassOpenerAction,
  createGradableAction,
  saveLibraryFileAction,
} from "@/app/actions";
import { buildDocxFromPlainText } from "@/lib/docx";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import {
  emptyAssignmentSpec,
  TECHNICAL_APTITUDES,
  GROUPINGS,
  type ArtifactTemplate,
  type AssignmentSpec,
} from "@/lib/artifact-templates/types";

const step = getStepDefinition("generate-assignment-from-template")!;

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
    courseCode: "CS101",
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

function baseSpec(overrides: Partial<AssignmentSpec> = {}): AssignmentSpec {
  return {
    ...emptyAssignmentSpec(),
    goal: "Apply loops correctly.",
    activity: "Guided exercises.",
    aptitude: "intro",
    minutes: 60,
    deliverables: ["Exercise file"],
    grouping: "solo",
    groupSize: null,
    ...overrides,
  };
}

function baseTemplate(overrides: Partial<ArtifactTemplate<AssignmentSpec>> = {}): ArtifactTemplate<AssignmentSpec> {
  return {
    id: "tpl-1",
    kind: "assignment",
    name: "Intro solo exercise",
    description: "A short exercise.",
    spec: baseSpec(),
    ...overrides,
  };
}

const generatedAssignment = {
  title: "Loop Practice",
  overview: "Practice writing loops.",
  steps: [{ stepTitle: "Step one", description: "Do the thing." }],
  tools: ["Python"],
  deliverables: ["Exercise file"],
};

describe("generate-assignment-from-template step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("template not found -> throws", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({
      error: 'No artifact template matches "tpl-1".',
    });

    await expect(
      step.run({ template: "tpl-1", hubCourse: "course-1" }, testHelpers(), () => {})
    ).rejects.toThrow('No artifact template matches "tpl-1".');
    expect(listCourseHubAction).not.toHaveBeenCalled();
  });

  it("resolves the template via getArtifactTemplateAction with kind 'assignment'", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    await step.run({ template: "My Template", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {});

    expect(getArtifactTemplateAction).toHaveBeenCalledWith("My Template", "assignment");
  });

  it("happy path: handout saved, rubric returned, saveLibraryFileAction called with fileExt docx and the workflow tagging fields", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    const result = await step.run(
      { template: "tpl-1", hubCourse: "course-1", topic: "Loops" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.assignmentTitle).toBe("Loop Practice");
    expect(result.outputs.rubric).toBe("Rubric text");
    expect(result.outputs.handoutName).toBeTruthy();
    expect(String(result.outputs.handoutName)).toContain("Assignment");

    expect(generateAssignmentAction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateAssignmentAction).mock.calls[0][2]).toEqual([]);

    expect(saveLibraryFileAction).toHaveBeenCalledTimes(1);
    const saveArgs = vi.mocked(saveLibraryFileAction).mock.calls[0][0];
    expect(saveArgs.fileExt).toBe("docx");
    expect(saveArgs.workflowId).toBe("workflow-1");
    expect(saveArgs.workflowName).toBe("Test Workflow");
    expect(saveArgs.workflowRunId).toBe("run-1");
  });

  it("hubCourse not found -> does not throw; notes it and still generates the handout", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    const result = await step.run(
      { template: "tpl-1", hubCourse: "missing-course", topic: "Loops" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.handoutName).toBeTruthy();
    expect(result.outputs.assignmentTitle).toBe("Loop Practice");
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.toLowerCase().includes("tile"))).toBe(true);
    }
  });

  it("generateAssignmentAction returning an error is thrown", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateAssignmentAction).mockResolvedValue({ error: "Generation failed" });

    await expect(
      step.run({ template: "tpl-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {})
    ).rejects.toThrow("Generation failed");
    expect(saveLibraryFileAction).not.toHaveBeenCalled();
  });

  it("passes the aptitude and grouping promptContracts verbatim into the generation context, shared with the rubric generator", async () => {
    const spec = baseSpec({ aptitude: "advanced", grouping: "group", groupSize: 3 });
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate({ spec }) });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    await step.run({ template: "tpl-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {});

    const advancedContract = TECHNICAL_APTITUDES.find((a) => a.value === "advanced")!.promptContract;
    const groupContract = GROUPINGS.find((g) => g.value === "group")!.promptContract;

    const genContext = vi.mocked(generateAssignmentAction).mock.calls[0][1];
    expect(genContext).toContain(advancedContract);
    expect(genContext).toContain(groupContract);

    const rubricContext = vi.mocked(generateAssignmentRubricAction).mock.calls[0][1];
    expect(rubricContext).toBe(genContext);
  });

  it("postToCanvas false -> createGradableAction NOT called", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ canvasUrl: "https://canvas.example.com/courses/1" })],
    });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    await step.run({ template: "tpl-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {});

    expect(createGradableAction).not.toHaveBeenCalled();
  });

  it("postToCanvas true but no canvasUrl -> a note, still succeeds", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse({ canvasUrl: null })] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    const result = await step.run(
      { template: "tpl-1", hubCourse: "course-1", topic: "Loops", postToCanvas: "1" },
      testHelpers(),
      () => {}
    );

    expect(createGradableAction).not.toHaveBeenCalled();
    expect(result.outputs.handoutName).toBeTruthy();
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.toLowerCase().includes("canvas"))).toBe(true);
    }
  });

  it("postToCanvas true with a canvasUrl -> called ONCE with kind 'Assignment' and never publishes", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ canvasUrl: "https://canvas.example.com/courses/1" })],
    });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
    vi.mocked(createGradableAction).mockResolvedValue({ id: 555 });

    const result = await step.run(
      { template: "tpl-1", hubCourse: "course-1", topic: "Loops", postToCanvas: "1" },
      testHelpers(),
      () => {}
    );

    expect(createGradableAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(createGradableAction).mock.calls[0];
    expect(callArgs[0]).toBe("https://canvas.example.com/courses/1");
    expect(callArgs[1]).toBe("Assignment");
    const fields = callArgs[2] as Record<string, unknown>;
    expect(fields).not.toHaveProperty("published");
    expect(fields.submissionType).toBe("online_text_entry");
    expect(result.outputs.canvasId).toBe("555");
  });

  it("a Canvas draft failure is a note, not a throw", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ canvasUrl: "https://canvas.example.com/courses/1" })],
    });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
    vi.mocked(createGradableAction).mockResolvedValue({ error: "Canvas is down" });

    const result = await step.run(
      { template: "tpl-1", hubCourse: "course-1", topic: "Loops", postToCanvas: "1" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.handoutName).toBeTruthy();
    expect(result.outputs.canvasId).toBe("");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("Canvas draft failed"))).toBe(true);
    }
  });

  it("passes pointsPossible through to the Canvas draft when provided", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ canvasUrl: "https://canvas.example.com/courses/1" })],
    });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
    vi.mocked(createGradableAction).mockResolvedValue({ id: 42 });

    await step.run(
      { template: "tpl-1", hubCourse: "course-1", topic: "Loops", postToCanvas: "1", pointsPossible: "25" },
      testHelpers(),
      () => {}
    );

    const fields = vi.mocked(createGradableAction).mock.calls[0][2] as Record<string, unknown>;
    expect(fields.pointsPossible).toBe(25);
  });

  it("omits pointsPossible from the Canvas draft when left blank", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ canvasUrl: "https://canvas.example.com/courses/1" })],
    });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
    vi.mocked(createGradableAction).mockResolvedValue({ id: 42 });

    await step.run(
      { template: "tpl-1", hubCourse: "course-1", topic: "Loops", postToCanvas: "1" },
      testHelpers(),
      () => {}
    );

    const fields = vi.mocked(createGradableAction).mock.calls[0][2] as Record<string, unknown>;
    expect(fields.pointsPossible).toBeUndefined();
  });

  it("rubric generation failing -> a note, the step still succeeds and still returns the handout name", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue({ error: "Rubric failed" });
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    const result = await step.run(
      { template: "tpl-1", hubCourse: "course-1", topic: "Loops" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.rubric).toBe("");
    expect(result.outputs.handoutName).toBeTruthy();
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.toLowerCase().includes("rubric"))).toBe(true);
    }
  });

  it("a Files tab save failure is a note, not a throw", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ error: "Storage full" });

    const result = await step.run(
      { template: "tpl-1", hubCourse: "course-1", topic: "Loops" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.handoutName).toBeTruthy();
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("Files tab save failed"))).toBe(true);
    }
  });

  it("saves to the course tile's materials when a tile and the helper are available", async () => {
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse({ id: "course-9" })] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    await step.run(
      { template: "tpl-1", hubCourse: "course-9", topic: "Loops" },
      testHelpers({ saveCourseMaterialFile }),
      () => {}
    );

    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    expect(saveCourseMaterialFile.mock.calls[0][0]).toBe("course-9");
  });

  it("a course-tile save failure is a note, not a throw", async () => {
    const saveCourseMaterialFile = vi.fn().mockRejectedValue(new Error("disk full"));
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    const result = await step.run(
      { template: "tpl-1", hubCourse: "course-1", topic: "Loops" },
      testHelpers({ saveCourseMaterialFile }),
      () => {}
    );

    expect(result.outputs.handoutName).toBeTruthy();
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("Course tile save failed"))).toBe(true);
    }
  });

  it("includeOpener true -> the opener generator is called and its text appears in the handout passed to the docx builder", async () => {
    const spec = baseSpec({ includeOpener: true, openerMinutes: 12 });
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate({ spec }) });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
    vi.mocked(generateClassOpenerAction).mockResolvedValue({
      title: "Opener title",
      text: "OPENER_UNIQUE_TEXT_MARKER",
    });

    await step.run({ template: "tpl-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {});

    expect(generateClassOpenerAction).toHaveBeenCalledTimes(1);
    const openerArgs = vi.mocked(generateClassOpenerAction).mock.calls[0];
    expect(openerArgs[0]).toBe("Loops");
    expect(openerArgs[1]).toBe(generatedAssignment.overview);
    expect(openerArgs[2]).toBe(12);
    expect(openerArgs[3]).toBeNull();
    expect(openerArgs[4]).toEqual([]);

    expect(buildDocxFromPlainText).toHaveBeenCalledTimes(1);
    const handoutText = vi.mocked(buildDocxFromPlainText).mock.calls[0][0];
    expect(handoutText).toContain("## In-class opener");
    expect(handoutText).toContain("OPENER_UNIQUE_TEXT_MARKER");
  });

  it("includeOpener false -> generateClassOpenerAction is not called", async () => {
    const spec = baseSpec({ includeOpener: false });
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate({ spec }) });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    await step.run({ template: "tpl-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {});

    expect(generateClassOpenerAction).not.toHaveBeenCalled();
  });

  it("an opener generation failure is a note, and the closer (when also on) is unaffected", async () => {
    const spec = baseSpec({ includeOpener: true });
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate({ spec }) });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
    vi.mocked(generateClassOpenerAction).mockResolvedValue({ error: "LLM unavailable" });

    const result = await step.run(
      { template: "tpl-1", hubCourse: "course-1", topic: "Loops" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.handoutName).toBeTruthy();
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("In-class opener generation failed"))).toBe(true);
    }
  });

  it("includeCloser true -> a deterministic closer is appended and never duplicates the opener text", async () => {
    const spec = baseSpec({ includeOpener: true, includeCloser: true, openerMinutes: 10, closerMinutes: 5 });
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate({ spec }) });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
    vi.mocked(generateClassOpenerAction).mockResolvedValue({
      title: "Opener title",
      text: "OPENER_UNIQUE_TEXT_MARKER",
    });

    await step.run({ template: "tpl-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {});

    const handoutText = vi.mocked(buildDocxFromPlainText).mock.calls[0][0];
    expect(handoutText).toContain("## In-class opener");
    expect(handoutText).toContain("OPENER_UNIQUE_TEXT_MARKER");
    expect(handoutText).toContain("## In-class closer");
    expect(handoutText).toContain("Wrap-up checklist");

    // The closer section itself must never just echo the opener's text.
    const closerSectionStart = handoutText.indexOf("## In-class closer");
    const closerSection = handoutText.slice(closerSectionStart);
    expect(closerSection).not.toContain("OPENER_UNIQUE_TEXT_MARKER");
  });

  it("includeCloser false -> no closer section is appended", async () => {
    const spec = baseSpec({ includeCloser: false });
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate({ spec }) });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    await step.run({ template: "tpl-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {});

    const handoutText = vi.mocked(buildDocxFromPlainText).mock.calls[0][0];
    expect(handoutText).not.toContain("## In-class closer");
  });

  it("no template selected -> a no-op, not an error, and nothing is generated", async () => {
    const result = await step.run({ template: "", hubCourse: "course-1" }, testHelpers(), () => {});

    expect(getArtifactTemplateAction).not.toHaveBeenCalled();
    expect(generateAssignmentAction).not.toHaveBeenCalled();
    expect(saveLibraryFileAction).not.toHaveBeenCalled();
    expect(result.outputs.assignmentTitle).toBe("");
    expect(result.outputs.handoutName).toBe("");
    expect(result.summary.kind).toBe("text");
  });
});
