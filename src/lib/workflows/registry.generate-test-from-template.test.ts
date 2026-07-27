import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";

vi.mock("@/app/actions", () => ({
  getArtifactTemplateAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  generateTestQuestionsAction: vi.fn(),
  generateAssignmentRubricAction: vi.fn(),
  createGradableAction: vi.fn(),
  createQuizQuestionAction: vi.fn(),
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
  generateTestQuestionsAction,
  generateAssignmentRubricAction,
  createGradableAction,
  createQuizQuestionAction,
  saveLibraryFileAction,
} from "@/app/actions";
import { buildDocxFromPlainText } from "@/lib/docx";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import {
  emptyTestSpec,
  type ArtifactTemplate,
  type TestSpec,
} from "@/lib/artifact-templates/types";

const step = getStepDefinition("generate-test-from-template")!;

/** The text handed to the docx builder on the most recent call. */
function docxText(): string {
  const calls = vi.mocked(buildDocxFromPlainText).mock.calls;
  return String(calls[calls.length - 1][0]);
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

function baseSpec(overrides: Partial<TestSpec> = {}): TestSpec {
  return {
    ...emptyTestSpec(),
    goal: "Measure understanding of loops.",
    coverage: "Weeks 1-3",
    aptitude: "intro",
    format: "in-class",
    minutes: 50,
    sections: [
      { kind: "multiple_choice", count: 2, pointsEach: 5 },
      { kind: "short_answer", count: 1, pointsEach: 10 },
    ],
    allowedResources: [],
    includeAnswerKey: true,
    includeStudyGuide: false,
    ...overrides,
  };
}

function baseTemplate(overrides: Partial<ArtifactTemplate<TestSpec>> = {}): ArtifactTemplate<TestSpec> {
  return {
    id: "tpl-test-1",
    kind: "test",
    name: "Unit quiz",
    description: "A short unit test.",
    spec: baseSpec(),
    ...overrides,
  };
}

const generatedTest = {
  title: "Loops Unit Test",
  instructions: "Answer every question.",
  questions: [
    {
      kind: "multiple_choice" as const,
      prompt: "Which loop runs at least once?",
      choices: ["for", "while", "do-while", "foreach"],
      answer: "do-while",
      points: 5,
    },
    {
      kind: "multiple_choice" as const,
      prompt: "Which keyword exits a loop?",
      choices: ["stop", "break", "exit", "halt"],
      answer: "break",
      points: 5,
    },
    {
      kind: "short_answer" as const,
      prompt: "Name the loop counter variable convention.",
      choices: [],
      answer: "i",
      points: 10,
    },
  ],
};

/** Wire up the mocks for a run that succeeds end to end. */
function mockHappyPath(spec: TestSpec = baseSpec(), course: Course = baseCourse()) {
  vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate({ spec }) });
  vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [course] });
  vi.mocked(generateTestQuestionsAction).mockResolvedValue(generatedTest);
  vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Essay rubric text");
  vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
}

describe("generate-test-from-template step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Template resolution (fatal) ───────────────────────────────────────────

  it("template not found -> throws and never loads course tiles", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({
      error: 'No artifact template matches "tpl-test-1".',
    });

    await expect(
      step.run({ template: "tpl-test-1", hubCourse: "course-1" }, testHelpers(), () => {})
    ).rejects.toThrow('No artifact template matches "tpl-test-1".');
    expect(listCourseHubAction).not.toHaveBeenCalled();
  });

  it("resolves the template with kind 'test'", async () => {
    mockHappyPath();

    await step.run(
      { template: "Unit quiz", hubCourse: "course-1", topic: "Loops" },
      testHelpers(),
      () => {}
    );

    expect(getArtifactTemplateAction).toHaveBeenCalledWith("Unit quiz", "test");
  });

  // ── Question generation (fatal) ───────────────────────────────────────────

  it("generateTestQuestionsAction returning an error is thrown", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateTestQuestionsAction).mockResolvedValue({ error: "Test generation failed" });

    await expect(
      step.run({ template: "tpl-test-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {})
    ).rejects.toThrow("Test generation failed");
    expect(saveLibraryFileAction).not.toHaveBeenCalled();
  });

  it("passes the spec's sections through to the generator", async () => {
    const spec = baseSpec();
    mockHappyPath(spec);

    await step.run({ template: "tpl-test-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {});

    expect(vi.mocked(generateTestQuestionsAction).mock.calls[0][2]).toEqual(spec.sections);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("happy path: outputs the title, question count, file name, and answer key", async () => {
    mockHappyPath();

    const result = await step.run(
      { template: "tpl-test-1", hubCourse: "course-1", topic: "Loops" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.testTitle).toBe("Loops Unit Test");
    expect(result.outputs.questionCount).toBe(3);
    expect(String(result.outputs.testName)).toContain("Test");
    expect(String(result.outputs.answerKey)).toContain("do-while");

    const saveArgs = vi.mocked(saveLibraryFileAction).mock.calls[0][0];
    expect(saveArgs.fileExt).toBe("docx");
    expect(saveArgs.workflowId).toBe("workflow-1");
    expect(saveArgs.workflowName).toBe("Test Workflow");
    expect(saveArgs.workflowRunId).toBe("run-1");
  });

  // ── Non-fatal degradation ─────────────────────────────────────────────────

  it("hubCourse not found -> notes it and still produces the test", async () => {
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate() });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] });
    vi.mocked(generateTestQuestionsAction).mockResolvedValue(generatedTest);
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    const result = await step.run(
      { template: "tpl-test-1", hubCourse: "missing-course", topic: "Loops" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.testTitle).toBe("Loops Unit Test");
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.toLowerCase().includes("tile"))).toBe(true);
    }
  });

  it("a Files tab save failure is a note, not a throw", async () => {
    mockHappyPath();
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ error: "storage is full" });

    const result = await step.run(
      { template: "tpl-test-1", hubCourse: "course-1", topic: "Loops" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.testTitle).toBe("Loops Unit Test");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("storage is full"))).toBe(true);
    }
  });

  // ── Document assembly toggles ─────────────────────────────────────────────

  it("includeAnswerKey off -> no answer key in the document or the output", async () => {
    mockHappyPath(baseSpec({ includeAnswerKey: false }));

    const result = await step.run(
      { template: "tpl-test-1", hubCourse: "course-1", topic: "Loops" },
      testHelpers(),
      () => {}
    );

    expect(docxText()).not.toContain("## Answer Key");
    expect(result.outputs.answerKey).toBe("");
  });

  it("includeAnswerKey on -> the answer key is appended to the document", async () => {
    mockHappyPath(baseSpec({ includeAnswerKey: true }));

    await step.run({ template: "tpl-test-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {});

    expect(docxText()).toContain("## Answer Key");
  });

  it("includeStudyGuide off -> no study guide; on -> a study guide", async () => {
    mockHappyPath(baseSpec({ includeStudyGuide: false }));
    await step.run({ template: "tpl-test-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {});
    expect(docxText()).not.toContain("## Study Guide");

    vi.clearAllMocks();
    mockHappyPath(baseSpec({ includeStudyGuide: true }));
    await step.run({ template: "tpl-test-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {});
    expect(docxText()).toContain("## Study Guide");
  });

  it("no essay section -> the rubric action is never called", async () => {
    mockHappyPath(baseSpec({ sections: [{ kind: "multiple_choice", count: 2, pointsEach: 5 }] }));

    await step.run({ template: "tpl-test-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {});

    expect(generateAssignmentRubricAction).not.toHaveBeenCalled();
    expect(docxText()).not.toContain("## Essay grading guide");
  });

  it("an essay section -> essay grading guidance is generated and appended", async () => {
    mockHappyPath(
      baseSpec({
        sections: [
          { kind: "multiple_choice", count: 2, pointsEach: 5 },
          { kind: "essay", count: 1, pointsEach: 20 },
        ],
      })
    );

    await step.run({ template: "tpl-test-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {});

    expect(generateAssignmentRubricAction).toHaveBeenCalledTimes(1);
    expect(docxText()).toContain("## Essay grading guide");
    expect(docxText()).toContain("Essay rubric text");
  });

  it("an essay-rubric failure is a note, not a throw", async () => {
    mockHappyPath(baseSpec({ sections: [{ kind: "essay", count: 1, pointsEach: 20 }] }));
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue({ error: "rubric model down" });

    const result = await step.run(
      { template: "tpl-test-1", hubCourse: "course-1", topic: "Loops" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.testTitle).toBe("Loops Unit Test");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("rubric model down"))).toBe(true);
    }
  });

  // ── The points override ───────────────────────────────────────────────────

  it("no pointsPossible -> the document states the spec-derived total", async () => {
    // baseSpec is 2 x 5 + 1 x 10 = 20 points.
    mockHappyPath();

    await step.run({ template: "tpl-test-1", hubCourse: "course-1", topic: "Loops" }, testHelpers(), () => {});

    expect(docxText()).toContain("Total points: 20.");
  });

  it("pointsPossible overrides the total printed on the document", async () => {
    mockHappyPath();

    await step.run(
      { template: "tpl-test-1", hubCourse: "course-1", topic: "Loops", pointsPossible: "75" },
      testHelpers(),
      () => {}
    );

    expect(docxText()).toContain("Total points: 75.");
    expect(docxText()).not.toContain("Total points: 20.");
  });

  // ── Canvas draft ──────────────────────────────────────────────────────────

  it("postToCanvas off -> no Canvas call at all", async () => {
    mockHappyPath(baseSpec(), baseCourse({ canvasUrl: "https://canvas.test/courses/1" }));

    const result = await step.run(
      { template: "tpl-test-1", hubCourse: "course-1", topic: "Loops" },
      testHelpers(),
      () => {}
    );

    expect(createGradableAction).not.toHaveBeenCalled();
    expect(createQuizQuestionAction).not.toHaveBeenCalled();
    expect(result.outputs.canvasId).toBe("");
  });

  it("postToCanvas on but no Canvas URL -> notes the skip and makes no Canvas call", async () => {
    mockHappyPath(baseSpec(), baseCourse({ canvasUrl: null }));

    const result = await step.run(
      { template: "tpl-test-1", hubCourse: "course-1", topic: "Loops", postToCanvas: "1" },
      testHelpers(),
      () => {}
    );

    expect(createGradableAction).not.toHaveBeenCalled();
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("no Canvas URL"))).toBe(true);
    }
  });

  it("creates an unpublished Quiz draft and one question per generated question", async () => {
    mockHappyPath(baseSpec(), baseCourse({ canvasUrl: "https://canvas.test/courses/1" }));
    vi.mocked(createGradableAction).mockResolvedValue({ id: 4242 });
    vi.mocked(createQuizQuestionAction).mockResolvedValue({ question: { id: 1 } } as never);

    const result = await step.run(
      { template: "tpl-test-1", hubCourse: "course-1", topic: "Loops", postToCanvas: "1" },
      testHelpers(),
      () => {}
    );

    expect(createGradableAction).toHaveBeenCalledTimes(1);
    // The gradable kind must be "Quiz" - createGradable's Quiz branch is the
    // one that sends quiz[published]=false.
    expect(vi.mocked(createGradableAction).mock.calls[0][1]).toBe("Quiz");
    expect(result.outputs.canvasId).toBe("4242");

    expect(createQuizQuestionAction).toHaveBeenCalledTimes(3);
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("UNPUBLISHED"))).toBe(true);
    }
  });

  it("maps each question kind to its Canvas question type and answer shape", async () => {
    const spec = baseSpec({
      sections: [
        { kind: "multiple_choice", count: 1, pointsEach: 5 },
        { kind: "true_false", count: 1, pointsEach: 2 },
        { kind: "short_answer", count: 1, pointsEach: 10 },
        { kind: "essay", count: 1, pointsEach: 20 },
      ],
    });
    vi.mocked(getArtifactTemplateAction).mockResolvedValue({ template: baseTemplate({ spec }) });
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ canvasUrl: "https://canvas.test/courses/1" })],
    });
    vi.mocked(generateTestQuestionsAction).mockResolvedValue({
      title: "Mixed Test",
      instructions: "Answer all.",
      questions: [
        { kind: "multiple_choice", prompt: "MC?", choices: ["a", "b"], answer: "b", points: 5 },
        { kind: "true_false", prompt: "TF?", choices: [], answer: "False", points: 2 },
        { kind: "short_answer", prompt: "SA?", choices: [], answer: "answer text", points: 10 },
        { kind: "essay", prompt: "Essay?", choices: [], answer: "sketch", points: 20 },
      ],
    });
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Essay rubric text");
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
    vi.mocked(createGradableAction).mockResolvedValue({ id: 7 });
    vi.mocked(createQuizQuestionAction).mockResolvedValue({ question: { id: 1 } } as never);

    await step.run(
      { template: "tpl-test-1", hubCourse: "course-1", topic: "Loops", postToCanvas: "1" },
      testHelpers(),
      () => {}
    );

    const posted = vi.mocked(createQuizQuestionAction).mock.calls.map((c) => c[2]);

    expect(posted[0].type).toBe("multiple_choice_question");
    expect(posted[0].answers).toEqual([
      { text: "a", correct: false },
      { text: "b", correct: true },
    ]);

    expect(posted[1].type).toBe("true_false_question");
    expect(posted[1].answers).toEqual([
      { text: "True", correct: false },
      { text: "False", correct: true },
    ]);

    expect(posted[2].type).toBe("short_answer_question");
    expect(posted[2].answers).toEqual([{ text: "answer text", correct: true }]);

    expect(posted[3].type).toBe("essay_question");
    expect(posted[3].answers).toEqual([]);
    expect(posted[3].points).toBe(20);
  });

  it("a per-question failure does not abort the remaining questions and does not throw", async () => {
    mockHappyPath(baseSpec(), baseCourse({ canvasUrl: "https://canvas.test/courses/1" }));
    vi.mocked(createGradableAction).mockResolvedValue({ id: 4242 });
    vi.mocked(createQuizQuestionAction)
      .mockResolvedValueOnce({ error: "Canvas rejected the question" } as never)
      .mockResolvedValue({ question: { id: 1 } } as never);

    const result = await step.run(
      { template: "tpl-test-1", hubCourse: "course-1", topic: "Loops", postToCanvas: "1" },
      testHelpers(),
      () => {}
    );

    // All three attempted despite the first failing.
    expect(createQuizQuestionAction).toHaveBeenCalledTimes(3);
    expect(result.outputs.canvasId).toBe("4242");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("1 of 3"))).toBe(true);
    }
  });

  it("a Canvas draft failure is a note, not a throw, and posts no questions", async () => {
    mockHappyPath(baseSpec(), baseCourse({ canvasUrl: "https://canvas.test/courses/1" }));
    vi.mocked(createGradableAction).mockResolvedValue({ error: "Canvas is down" });

    const result = await step.run(
      { template: "tpl-test-1", hubCourse: "course-1", topic: "Loops", postToCanvas: "1" },
      testHelpers(),
      () => {}
    );

    expect(createQuizQuestionAction).not.toHaveBeenCalled();
    expect(result.outputs.canvasId).toBe("");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("Canvas is down"))).toBe(true);
    }
  });

  // ── The Course Refresh no-op ──────────────────────────────────────────────

  it("no template selected -> a no-op, not an error, and nothing is generated", async () => {
    const result = await step.run({ template: "", hubCourse: "course-1" }, testHelpers(), () => {});

    expect(getArtifactTemplateAction).not.toHaveBeenCalled();
    expect(generateTestQuestionsAction).not.toHaveBeenCalled();
    expect(saveLibraryFileAction).not.toHaveBeenCalled();
    expect(createGradableAction).not.toHaveBeenCalled();
    expect(result.outputs.testTitle).toBe("");
    expect(result.outputs.questionCount).toBe(0);
    expect(result.summary.kind).toBe("text");
  });
});
