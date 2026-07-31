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
  // AC3: the step's own tool-selection call for an applied course with NO
  // course tile bound - see "the applied tool decision" describe block below.
  selectRequiredTools: vi.fn(),
  // docs/REGRESSION.md 152: ensureCourseProject's own two calls, exercised in
  // the "course-long project chaining" describe block below.
  generateCourseProjectAction: vi.fn(),
  setCourseProjectAction: vi.fn(),
  // Tool-churn fix (docs/REGRESSION.md): ensureCourseTools' own selection
  // call for an applied course WITH a course tile bound.
  selectCourseTools: vi.fn(),
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
  selectRequiredTools,
  generateCourseProjectAction,
  setCourseProjectAction,
  selectCourseTools,
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

  // Regression: the opener call omitted courseKind entirely, so its own
  // prompt always defaulted to "coding" and asked for a warm-up coding
  // exercise (starter code, "implement in your chosen language") even when
  // this same step had just generated an APPLIED assignment a few lines
  // above - the same class of bug AC1-AC3 fix elsewhere in this incident.
  it("the opener receives the SAME courseKind the assignment was generated with", async () => {
    const spec = baseSpec({ includeOpener: true });
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate({ spec }) });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
    vi.mocked(generateClassOpenerAction).mockResolvedValue({ title: "Opener title", text: "text" });
    vi.mocked(selectRequiredTools).mockResolvedValue([]);

    await step.run(
      { template: "tpl-1", hubCourse: "course-1", topic: "Loops", courseKind: "applied" },
      testHelpers(),
      () => {}
    );

    expect(generateAssignmentAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      "applied",
      ""
    );
    const openerArgs = vi.mocked(generateClassOpenerAction).mock.calls[0];
    expect(openerArgs[6]).toBe("applied");
  });

  // Tool-churn fix (docs/REGRESSION.md): when a course tile is bound, this
  // step now reads the COURSE's committed toolset (ensureCourseTools) rather
  // than picking a tool fresh for just this topic - selectRequiredTools
  // (the per-topic decision) survives ONLY as the fallback for when there is
  // no tile to persist a commitment onto (AC3's original design (a) still
  // holds for that narrow case: no step output to bind a same-week deck's
  // choice to - docs/REGRESSION.md entry 141 point 7).
  describe("the applied tool decision - committed course toolset (tool-churn fix)", () => {
    it("a tile with weekly topics: ensures a committed toolset via selectCourseTools, and feeds it into generateAssignmentAction as requiredTools", async () => {
      vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [baseCourse({ csvData: "Week,Topic\n1,Stakeholder Analysis" })],
      });
      vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
      vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
      vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
      vi.mocked(selectCourseTools).mockResolvedValue(["Trello (free plan)", "Excel (free trial)"]);
      vi.mocked(setCourseProjectAction).mockResolvedValue({ ok: true });

      await step.run(
        { template: "tpl-1", hubCourse: "course-1", topic: "Stakeholder Analysis", courseKind: "applied" },
        testHelpers(),
        () => {}
      );

      expect(selectCourseTools).toHaveBeenCalledTimes(1);
      expect(selectRequiredTools).not.toHaveBeenCalled();
      expect(vi.mocked(generateAssignmentAction).mock.calls[0][5]).toBe("Trello (free plan); Excel (free trial)");
    });

    it("a course with an already-committed toolset reuses it rather than choosing anew", async () => {
      const project = {
        ...emptyCourseProject(),
        mode: "course-long" as const,
        name: "X",
        definition: "X",
        tools: ["Asana (free plan)"],
      };
      vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [baseCourse({ courseProject: project })],
      });
      vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
      vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
      vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

      await step.run(
        { template: "tpl-1", hubCourse: "course-1", topic: "Stakeholder Analysis", courseKind: "applied" },
        testHelpers(),
        () => {}
      );

      // The idempotency check short-circuits before the model is ever asked.
      expect(selectCourseTools).not.toHaveBeenCalled();
      expect(setCourseProjectAction).not.toHaveBeenCalled();
      expect(vi.mocked(generateAssignmentAction).mock.calls[0][5]).toBe("Asana (free plan)");
    });

    it("falls back to the per-topic selectRequiredTools when no course tile is bound - nothing to persist a commitment onto", async () => {
      vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
      vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
      vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
      vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
      vi.mocked(selectRequiredTools).mockResolvedValue(["Trello (free plan)", "Excel (free trial)"]);

      await step.run(
        { template: "tpl-1", topic: "Stakeholder Analysis", courseKind: "applied" },
        testHelpers(),
        () => {}
      );

      expect(listCourseHubAction).not.toHaveBeenCalled();
      expect(selectCourseTools).not.toHaveBeenCalled();
      expect(selectRequiredTools).toHaveBeenCalledTimes(1);
      expect(vi.mocked(selectRequiredTools).mock.calls[0][0]).toBe("Stakeholder Analysis");
      expect(vi.mocked(generateAssignmentAction).mock.calls[0][5]).toBe("Trello (free plan); Excel (free trial)");
    });

    it("never calls selectCourseTools for a coding course, and requiredTools is blank", async () => {
      vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [baseCourse({ csvData: "Week,Topic\n1,Loops" })],
      });
      vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
      vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
      vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

      await step.run(
        { template: "tpl-1", hubCourse: "course-1", topic: "Loops" },
        testHelpers(),
        () => {}
      );

      expect(selectCourseTools).not.toHaveBeenCalled();
      expect(selectRequiredTools).not.toHaveBeenCalled();
      expect(vi.mocked(generateAssignmentAction).mock.calls[0][5]).toBe("");
    });

    it("never calls selectCourseTools or selectRequiredTools when an applied course's topic could not be resolved", async () => {
      vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
      vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] });
      vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
      vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
      vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

      await step.run(
        { template: "tpl-1", hubCourse: "missing-course", courseKind: "applied" },
        testHelpers(),
        () => {}
      );

      expect(selectCourseTools).not.toHaveBeenCalled();
      expect(selectRequiredTools).not.toHaveBeenCalled();
      expect(vi.mocked(generateAssignmentAction).mock.calls[0][5]).toBe("");
    });
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

  // docs/REGRESSION.md 152: this step is exactly step 5 in the reported
  // "Course Kickoff (no codebase) (copy)" run - an 11-step saved workflow
  // copy with NO define-course-project step at all, so tile.courseProject
  // was stuck at emptyCourseProject() forever. ensureCourseProject closes
  // that gap on demand.
  describe("course-long project chaining (docs/REGRESSION.md 152)", () => {
    const generatedProject = {
      name: "Community Garden Launch",
      brief: "Plan and pitch a community garden to the city.",
      milestones: [
        { week: 1, title: "Stakeholder map", deliverable: "A one-page stakeholder map." },
        { week: 2, title: "Project charter", deliverable: "A signed-off project charter." },
      ],
    };

    it("AC1/AC3: a course with no project yet (courseKind applied) gets one on demand, and its milestone reaches the assignment context - mirrors the broken copy's exact step/courseKind shape", async () => {
      vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [baseCourse({ id: "course-1", weeks: 2, courseProject: emptyCourseProject() })],
      });
      vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
      vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
      vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
      vi.mocked(selectRequiredTools).mockResolvedValue([]);
      vi.mocked(generateCourseProjectAction).mockResolvedValue(generatedProject);
      vi.mocked(setCourseProjectAction).mockResolvedValue({ ok: true });

      const result = await step.run(
        { template: "tpl-1", hubCourse: "course-1", topic: "Stakeholder Analysis", week: "1", courseKind: "applied" },
        testHelpers(),
        () => {}
      );

      expect(generateCourseProjectAction).toHaveBeenCalledTimes(1);
      expect(setCourseProjectAction).toHaveBeenCalledTimes(1);
      expect(vi.mocked(setCourseProjectAction).mock.calls[0][0]).toBe("course-1");

      // AC5: the milestone genuinely reaches the context handed to the
      // generator - the same argument the existing aptitude/grouping test
      // above checks, not merely that ensureCourseProject compiles.
      const genContext = vi.mocked(generateAssignmentAction).mock.calls[0][1];
      expect(genContext).toContain('milestone 1 of the course project "Community Garden Launch"');
      expect(genContext).toContain("Stakeholder map");

      // AC7: a cheap, honest note that a project was invented on this run.
      if (result.summary.kind === "list") {
        expect(
          result.summary.items.some((i) => i.toLowerCase().includes("no project yet"))
        ).toBe(true);
      }
    });

    it("AC2/AC4: a course that already has a project never regenerates - no calls to generateCourseProjectAction/setCourseProjectAction at all", async () => {
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
      vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [baseCourse({ id: "course-1", weeks: 2, courseProject: existingProject })],
      });
      vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
      vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
      vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
      vi.mocked(selectRequiredTools).mockResolvedValue([]);

      const result = await step.run(
        { template: "tpl-1", hubCourse: "course-1", topic: "Loops", week: "1", courseKind: "applied" },
        testHelpers(),
        () => {}
      );

      expect(generateCourseProjectAction).not.toHaveBeenCalled();
      expect(setCourseProjectAction).not.toHaveBeenCalled();

      const genContext = vi.mocked(generateAssignmentAction).mock.calls[0][1];
      expect(genContext).toContain("Kickoff");

      if (result.summary.kind === "list") {
        expect(result.summary.items.some((i) => i.toLowerCase().includes("no project yet"))).toBe(false);
      }
    });

    it("AC2: a CODING course (the default courseKind) with no project never auto-generates one - the applied-only gate", async () => {
      vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [baseCourse({ id: "course-1", weeks: 2, courseProject: emptyCourseProject() })],
      });
      vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
      vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
      vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

      await step.run(
        { template: "tpl-1", hubCourse: "course-1", topic: "Loops", week: "1" },
        testHelpers(),
        () => {}
      );

      expect(generateCourseProjectAction).not.toHaveBeenCalled();
      expect(setCourseProjectAction).not.toHaveBeenCalled();
      const genContext = vi.mocked(generateAssignmentAction).mock.calls[0][1];
      expect(genContext).not.toContain("This week's work is milestone");
      expect(genContext).not.toContain("Project milestone:");
    });

    it("AC2/AC4: idempotent across two runs for the SAME course - the second run (tile now carrying the persisted project) reuses it rather than regenerating", async () => {
      vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
      vi.mocked(generateAssignmentAction).mockResolvedValue(generatedAssignment);
      vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Rubric text");
      vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
      vi.mocked(selectRequiredTools).mockResolvedValue([]);
      vi.mocked(generateCourseProjectAction).mockResolvedValue(generatedProject);
      vi.mocked(setCourseProjectAction).mockResolvedValue({ ok: true });

      // Run 1: week 1, no project yet.
      vi.mocked(listCourseHubAction).mockResolvedValueOnce({
        courses: [baseCourse({ id: "course-1", weeks: 2, courseProject: emptyCourseProject() })],
      });
      await step.run(
        { template: "tpl-1", hubCourse: "course-1", topic: "Stakeholder Analysis", week: "1", courseKind: "applied" },
        testHelpers(),
        () => {}
      );
      expect(generateCourseProjectAction).toHaveBeenCalledTimes(1);

      // Run 2 (e.g. week 2's own later run): the tile now carries the
      // project run 1 persisted - must NOT invent a second one, and week 2's
      // context must reference week 1's milestone as prior work.
      const persisted = {
        mode: "course-long" as const,
        name: generatedProject.name,
        definition: generatedProject.name,
        brief: generatedProject.brief,
        briefFileName: "",
        milestones: generatedProject.milestones,
        tools: [],
        generatedAt: "2024-01-01T00:00:00Z",
      };
      vi.mocked(listCourseHubAction).mockResolvedValueOnce({
        courses: [baseCourse({ id: "course-1", weeks: 2, courseProject: persisted })],
      });
      await step.run(
        { template: "tpl-1", hubCourse: "course-1", topic: "Project Charter", week: "2", courseKind: "applied" },
        testHelpers(),
        () => {}
      );

      expect(generateCourseProjectAction).toHaveBeenCalledTimes(1);
      expect(setCourseProjectAction).toHaveBeenCalledTimes(1);
      const secondRunContext = vi.mocked(generateAssignmentAction).mock.calls[1][1];
      expect(secondRunContext).toContain('milestone 2 of the course project "Community Garden Launch"');
      expect(secondRunContext).toContain("Earlier milestones are already done (Stakeholder map)");
    });
  });
});
