// Y2: the per-week KNOWLEDGE CHECK - 5 to 8 Apply/Analyze multiple-choice
// questions grounded in that week's ACTUAL generated module materials, each
// with a one-sentence misconception explanation for every wrong answer.
// renderKnowledgeCheckDocument is exercised directly (pure logic); the full
// step.run() is exercised through mocked actions for the grounding-or-skip,
// stripModelUrls-then-revalidate, opt-in LMS posting, and quota-short-circuit
// behaviors.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScheduleWeekPlan } from "@/app/actions";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile, EnsuredModule } from "@/lib/workflows/types";
import { emptyCourseProject } from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";

// isUsableKnowledgeCheckQuestion is deliberately NOT stubbed here - the step
// (steps.knowledge-checks.ts) imports it directly from
// @/lib/knowledge-check-shape, not from @/app/actions, so it is never mocked
// at all: the REAL, pure predicate runs during these tests. The step
// re-applies it after stripModelUrls, and that re-validation is exactly what
// several tests below exercise (see "drops a question when stripModelUrls
// hollows out its explanation" and "keeps a week's other questions when only
// one is hollowed out"), so leaving the real predicate wired up is what makes
// those tests genuine rather than trivially true.
vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateKnowledgeCheckAction: vi.fn(),
  createGradableAction: vi.fn(),
  createQuizQuestionAction: vi.fn(),
  bulkUpdateAction: vi.fn(),
  createModuleItemAction: vi.fn(),
}));

import {
  listCourseHubAction,
  generateKnowledgeCheckAction,
  createGradableAction,
  createQuizQuestionAction,
  bulkUpdateAction,
  createModuleItemAction,
  type KnowledgeCheckQuestion,
} from "@/app/actions";
import { renderKnowledgeCheckDocument, knowledgeCheckSteps } from "./steps.knowledge-checks";
import { PARTIAL_FAILURE_OUTPUT_KEY } from "@/lib/workflows/run-logging";

const SPEND_CAP_429 =
  'Knowledge check generation failed: HTTP 429 — {"error":{"code":429,"message":"Your project has exceeded its monthly spending cap.","status":"RESOURCE_EXHAUSTED"}}';

const step = knowledgeCheckSteps.find((s) => s.type === "generate-knowledge-checks")!;

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
    name: "MGT 422",
    courseCode: "MGT422",
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
    startDate: "2026-01-05",
    description: null,
    weeks: 3,
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
  } as Course;
}

function objectivesFile(week: number, text: string): GeneratedCourseFile {
  return {
    name: `Week ${week} Objectives.docx`,
    blob: new Blob(["x"]),
    mimeType: "application/octet-stream",
    weekNumber: week,
    sortOrder: 0.5,
    role: "objectives",
    pageText: text,
  };
}

function schedule(): ScheduleWeekPlan[] {
  return [
    { week: 1, topic: "Critical Path", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    { week: 2, topic: "Earned Value", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
  ];
}

// The step's own MIN_USABLE_QUESTIONS_PER_WEEK floor is 3 - every test that
// exercises the "generated successfully" path must mock at least that many
// questions, or the step correctly (and confusingly, if this helper is not
// used) reports "not enough usable questions" regardless of what the test is
// actually trying to exercise.
function manyGoodQuestions(count: number): KnowledgeCheckQuestion[] {
  return Array.from({ length: count }, (_, i) => goodQuestion({ prompt: `Question ${i + 1} about the critical path table.` }));
}

function goodQuestion(overrides: Partial<{ prompt: string; explanation: string }> = {}): KnowledgeCheckQuestion {
  return {
    prompt: overrides.prompt ?? "Which task is on the critical path in this table?",
    choices: [
      { text: "Site survey", correct: true, explanation: "" },
      {
        text: "Foundation pour",
        correct: false,
        explanation: overrides.explanation ?? "Chose the single longest task rather than the longest dependent chain.",
      },
      {
        text: "Permit approval",
        correct: false,
        explanation: "This task has slack, so a delay here does not push the finish date.",
      },
      {
        text: "Interior fit-out",
        correct: false,
        explanation: "This task happens after the project could already finish along the true critical path.",
      },
    ],
  };
}

describe("renderKnowledgeCheckDocument", () => {
  it("lists every choice lettered, names the correct answer, and explains every wrong one", () => {
    const doc = renderKnowledgeCheckDocument("Week 1 Knowledge Check", [goodQuestion()]);
    expect(doc).toContain("# Week 1 Knowledge Check");
    expect(doc).toContain("## Question 1");
    expect(doc).toContain("- A) Site survey");
    expect(doc).toContain("- B) Foundation pour");
    expect(doc).toContain("Correct answer: A) Site survey");
    expect(doc).toContain("Why the others are wrong:");
    expect(doc).toContain("- B) Foundation pour: Chose the single longest task rather than the longest dependent chain.");
    expect(doc).toContain("- C) Permit approval: This task has slack, so a delay here does not push the finish date.");
    // The correct choice never gets a "why it's wrong" line.
    expect(doc).not.toContain("- A) Site survey:");
  });

  it("renders one section per question, numbered in order", () => {
    const doc = renderKnowledgeCheckDocument("Week 1 Knowledge Check", [
      goodQuestion({ prompt: "First question" }),
      goodQuestion({ prompt: "Second question" }),
    ]);
    expect(doc).toContain("## Question 1");
    expect(doc).toContain("First question");
    expect(doc).toContain("## Question 2");
    expect(doc).toContain("Second question");
  });
});

describe("generate-knowledge-checks step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateKnowledgeCheckAction).mockResolvedValue({
      questions: manyGoodQuestions(5),
    });
    vi.mocked(createGradableAction).mockResolvedValue({ id: 42 });
    vi.mocked(createQuizQuestionAction).mockResolvedValue({
      question: { id: 1, position: 1, name: "q", text: "q", type: "multiple_choice_question", points: 1, answers: [] },
    });
    vi.mocked(bulkUpdateAction).mockResolvedValue({ updated: 1, failures: [] });
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true });
  });

  it("returns the incoming files unchanged when the schedule is empty", async () => {
    const incoming: GeneratedCourseFile[] = [objectivesFile(1, "m1")];
    const result = await step.run({ schedule: [], files: incoming }, testHelpers(), () => {});
    expect(result.outputs.files).toBe(incoming);
    expect(result.outputs.checkCount).toBe(0);
  });

  it("skips a week with no generated module materials, rather than testing the bare topic", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Week 1 objectives text")];
    const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});

    expect(generateKnowledgeCheckAction).toHaveBeenCalledTimes(1); // only week 1 has materials
    expect(result.outputs.checkCount).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 2: skipped - no generated module materials");
  });

  // AC1 (COURSE_BUILD's output selector, steps.course-build-scope.ts):
  // "selected" is the boolean input that selector's "select-course-outputs"
  // step feeds into. Deselected means "do no work, pass files through
  // unchanged" - it never even calls generateKnowledgeCheckAction.
  it("selected explicitly off: does no work and passes incoming files through unchanged", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Week 1 objectives text")];
    const result = await step.run({ schedule: schedule(), files, selected: "" }, testHelpers(), () => {});

    expect(generateKnowledgeCheckAction).not.toHaveBeenCalled();
    expect(result.outputs.files).toBe(files);
    expect(result.outputs.checkCount).toBe(0);
  });

  it("selected left unbound (undefined): generates normally, matching every preset that does not wire the output selector", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Week 1 objectives text")];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});

    expect(generateKnowledgeCheckAction).toHaveBeenCalledTimes(1);
    expect(result.outputs.checkCount).toBe(1);
  });

  it("grounds the request in real materials, not just the topic line", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Students will compute the critical path this week.")];
    await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});

    const call = vi.mocked(generateKnowledgeCheckAction).mock.calls[0];
    expect(call[0]).toBe("Week 1");
    expect(call[1]).toBe("Critical Path");
    expect(call[2]).toContain("Students will compute the critical path this week.");
  });

  it("produces a supplement file per week, sortOrder 5.5, filed under that week's own weekNumber", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Materials for week 1")];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    const outFiles = result.outputs.files as GeneratedCourseFile[];
    const check = outFiles.find((f) => f.name.includes("Knowledge Check"));
    expect(check).toBeDefined();
    expect(check!.role).toBe("supplement");
    expect(check!.weekNumber).toBe(1);
    expect(check!.sortOrder).toBe(5.5);
    expect(check!.pageText).toContain("Correct answer:");
  });

  it("does not post to the LMS when postToLms is off (default), and says so", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Materials for week 1")];
    const result = await step.run({ schedule: [schedule()[0]], files, hubCourse: "course-1" }, testHelpers(), () => {});
    expect(createGradableAction).not.toHaveBeenCalled();
    const report = result.outputs.report as string;
    expect(report).toContain("posting is turned off");
  });

  it("creates, publishes, and places a Canvas quiz per week when postToLms is on", async () => {
    const modules: EnsuredModule[] = [{ week: 1, id: 555, name: "Module 01" }];
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Materials for week 1")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", modules, postToLms: "1" },
      testHelpers(),
      () => {}
    );

    expect(createGradableAction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createGradableAction).mock.calls[0][1]).toBe("Quiz");
    expect(createQuizQuestionAction).toHaveBeenCalledTimes(5); // five questions from the default mock
    expect(bulkUpdateAction).toHaveBeenCalledWith(
      "https://canvas.example.edu/courses/123",
      "Quiz",
      ["42"],
      { published: true },
      undefined
    );
    expect(createModuleItemAction).toHaveBeenCalledWith(
      "https://canvas.example.edu/courses/123",
      555,
      { type: "Quiz", contentId: 42, title: expect.stringContaining("Week 1 Knowledge Check") },
      undefined
    );
    const report = result.outputs.report as string;
    expect(report).toContain("quiz created (id 42)");
  });

  it("notes the quiz was not placed in a module when no module matches that week", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Materials for week 1")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", modules: [], postToLms: "1" },
      testHelpers(),
      () => {}
    );
    expect(createModuleItemAction).not.toHaveBeenCalled();
    const report = result.outputs.report as string;
    expect(report).toContain("not placed in a module");
  });

  it("reports 'not posted' when postToLms is on but the tile has no LMS course", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse({ canvasUrl: "" })] });
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Materials for week 1")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", postToLms: "1" },
      testHelpers(),
      () => {}
    );
    expect(createGradableAction).not.toHaveBeenCalled();
    const report = result.outputs.report as string;
    expect(report).toContain("no LMS course on the tile");
  });

  it("strips a model-authored URL out of the prompt, choice text, and explanation before it reaches the document", async () => {
    const withUrl = goodQuestion();
    withUrl.prompt = `${withUrl.prompt} See https://example.com/cheat for more.`;
    withUrl.choices = withUrl.choices.map((c, i) =>
      i === 1 ? { ...c, explanation: `${c.explanation} Source: https://example.com/why.` } : c
    );
    vi.mocked(generateKnowledgeCheckAction).mockResolvedValue({
      questions: [withUrl, ...manyGoodQuestions(3)],
    });

    const files: GeneratedCourseFile[] = [objectivesFile(1, "Materials for week 1")];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});

    const outFiles = result.outputs.files as GeneratedCourseFile[];
    const check = outFiles.find((f) => f.name.includes("Knowledge Check"));
    expect(check!.pageText).not.toContain("https://example.com");
  });

  it("drops a question when stripModelUrls hollows out its explanation, keeping the other otherwise-valid questions", async () => {
    // The whole explanation IS the URL - after stripModelUrls it becomes "".
    // Paired with exactly 2 OTHER good questions (3 total, at the
    // MIN_USABLE_QUESTIONS_PER_WEEK floor) so dropping the hollowed one is
    // what pushes the week below the floor - a version of this test with
    // only the hollowed question would "pass" even if the post-strip
    // re-validation were deleted entirely, since 1 question is already below
    // the floor regardless of whether it is valid.
    const hollowed = goodQuestion({ prompt: "Hollowed-out question", explanation: "https://example.com/only-a-link" });
    vi.mocked(generateKnowledgeCheckAction).mockResolvedValue({ questions: [hollowed, ...manyGoodQuestions(2)] });

    const files: GeneratedCourseFile[] = [objectivesFile(1, "Materials for week 1")];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});

    expect(result.outputs.checkCount).toBe(0);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 1: error - could not produce enough usable questions after cleanup");
  });

  it("keeps a week's other questions when only one is hollowed out and enough real ones remain", async () => {
    const hollowed = goodQuestion({ prompt: "Hollowed-out question", explanation: "https://example.com/only-a-link" });
    vi.mocked(generateKnowledgeCheckAction).mockResolvedValue({ questions: [hollowed, ...manyGoodQuestions(3)] });

    const files: GeneratedCourseFile[] = [objectivesFile(1, "Materials for week 1")];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});

    expect(result.outputs.checkCount).toBe(1);
    const outFiles = result.outputs.files as GeneratedCourseFile[];
    const check = outFiles.find((f) => f.name.includes("Knowledge Check"));
    expect(check!.pageText).not.toContain("Hollowed-out question");
    expect(check!.pageText).toContain("Question 1 about the critical path table.");
  });

  it("continues to the next week when one week's generation fails", async () => {
    vi.mocked(generateKnowledgeCheckAction)
      .mockResolvedValueOnce({ error: "model unavailable" })
      .mockResolvedValueOnce({ questions: manyGoodQuestions(3) });
    const files: GeneratedCourseFile[] = [objectivesFile(1, "m1"), objectivesFile(2, "m2")];
    const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});
    expect(result.outputs.checkCount).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 1: error");
  });

  it("never throws when the LMS post itself fails - it is noted, not fatal", async () => {
    vi.mocked(createGradableAction).mockResolvedValue({ error: "Canvas is down" });
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Materials for week 1")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", postToLms: "1" },
      testHelpers(),
      () => {}
    );
    expect(result.outputs.checkCount).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("LMS error - Canvas is down");
  });

  describe("non-transient quota refusal (mirrors generate-weekly-announcements' U7-AC1)", () => {
    it("stops after the first non-transient quota refusal instead of attempting every remaining week", async () => {
      vi.mocked(generateKnowledgeCheckAction)
        .mockResolvedValueOnce({ questions: manyGoodQuestions(3) })
        .mockResolvedValueOnce({ error: SPEND_CAP_429 });

      const fullSchedule: ScheduleWeekPlan[] = Array.from({ length: 5 }, (_, i) => ({
        week: i + 1,
        topic: `Topic ${i + 1}`,
        summary: "",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      }));
      const files: GeneratedCourseFile[] = fullSchedule.map((w) => objectivesFile(w.week, `Materials for week ${w.week}`));

      const result = await step.run({ schedule: fullSchedule, files }, testHelpers(), () => {});

      expect(generateKnowledgeCheckAction).toHaveBeenCalledTimes(2);
      expect(result.outputs.checkCount).toBe(1);
      const report = result.outputs.report as string;
      expect(report).toContain("Stopped after week 2 - the LLM quota was exhausted; 3 week(s) not attempted.");
    });

    it("sets the partial-failure signal when the quota is exhausted mid-run", async () => {
      vi.mocked(generateKnowledgeCheckAction)
        .mockResolvedValueOnce({ questions: manyGoodQuestions(3) })
        .mockResolvedValueOnce({ error: SPEND_CAP_429 });

      const files: GeneratedCourseFile[] = [objectivesFile(1, "m1"), objectivesFile(2, "m2")];
      const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});

      const detail = result.outputs[PARTIAL_FAILURE_OUTPUT_KEY];
      expect(typeof detail).toBe("string");
      expect(detail as string).toContain("quota was exhausted after week 2");
    });

    it("does not set the partial-failure signal when every week succeeds", async () => {
      const files: GeneratedCourseFile[] = [objectivesFile(1, "m1"), objectivesFile(2, "m2")];
      const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});
      expect(result.outputs[PARTIAL_FAILURE_OUTPUT_KEY]).toBeUndefined();
    });
  });
});
