import { describe, it, expect, vi } from "vitest";
import { executePostPlanSteps, type CanvasWriters } from "./commit-execute";
import type { PostPlanStep } from "./commit-plan";

// Pure in-memory fixtures only - no vi.mock (X1). vi.fn() below is a plain
// spy on an object literal method, not module mocking.
const COURSE_URL = "https://canvas.example.edu/courses/100";
const MODULE_ID = 55;

function makeWriters(overrides: Partial<CanvasWriters> = {}): CanvasWriters {
  return {
    createPage: vi.fn(async () => ({ page: { url: "new-page" } })),
    updatePage: vi.fn(async () => ({ page: { url: "existing-page" } })),
    createModuleItem: vi.fn(async () => ({ ok: true as const })),
    createAssignment: vi.fn(async () => ({ id: 1 })),
    createQuiz: vi.fn(async () => ({ id: 7 })),
    createQuizQuestion: vi.fn(async () => ({ question: {} })),
    publishQuiz: vi.fn(async () => ({ ok: true as const })),
    createAnnouncement: vi.fn(async () => ({ announcement: {} })),
    ...overrides,
  };
}

const QUESTION = {
  name: "Q1",
  text: "What is X?",
  type: "multiple_choice_question" as const,
  points: 1,
  answers: [{ text: "X", correct: true }],
};

describe("executePostPlanSteps", () => {
  describe("page", () => {
    it("create-page then link-page: both done, writers called with the right args", async () => {
      const writers = makeWriters();
      const steps: PostPlanStep[] = [
        { step: "create-page", title: "Week 2 Objectives", body: "<p>x</p>" },
        { step: "link-page", title: "Week 2 Objectives" },
      ];

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers, "MIT");

      expect(outcomes).toEqual([
        { step: steps[0], status: "done" },
        { step: steps[1], status: "done" },
      ]);
      expect(writers.createPage).toHaveBeenCalledWith(
        COURSE_URL,
        { title: "Week 2 Objectives", body: "<p>x</p>" },
        "MIT"
      );
      expect(writers.createModuleItem).toHaveBeenCalledWith(
        COURSE_URL,
        MODULE_ID,
        { type: "Page", pageUrl: "new-page" },
        "MIT"
      );
    });

    it("update-page reuses the existing page's url for the link step", async () => {
      const writers = makeWriters();
      const steps: PostPlanStep[] = [
        { step: "update-page", pageUrl: "existing-page", title: "Week 2 Objectives", body: "<p>y</p>" },
        { step: "link-page", title: "Week 2 Objectives" },
      ];

      await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(writers.updatePage).toHaveBeenCalledWith(
        COURSE_URL,
        "existing-page",
        { title: "Week 2 Objectives", body: "<p>y</p>" },
        undefined
      );
      expect(writers.createModuleItem).toHaveBeenCalledWith(
        COURSE_URL,
        MODULE_ID,
        { type: "Page", pageUrl: "existing-page" },
        undefined
      );
    });

    it("SABOTAGE TARGET: create-page failure stops execution - link-page is never attempted", async () => {
      const writers = makeWriters({ createPage: vi.fn(async () => ({ error: "Canvas is down" })) });
      const steps: PostPlanStep[] = [
        { step: "create-page", title: "T", body: "b" },
        { step: "link-page", title: "T" },
      ];

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(outcomes).toEqual([{ step: steps[0], status: "failed", detail: "Canvas is down" }]);
      expect(writers.createModuleItem).not.toHaveBeenCalled();
    });

    it("the orphan case: page created but link-page fails - both outcomes recorded, not aborted", async () => {
      const writers = makeWriters({ createModuleItem: vi.fn(async () => ({ error: "link failed" })) });
      const steps: PostPlanStep[] = [
        { step: "create-page", title: "T", body: "b" },
        { step: "link-page", title: "T" },
      ];

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(outcomes).toEqual([
        { step: steps[0], status: "done" },
        { step: steps[1], status: "failed", detail: "link failed" },
      ]);
    });

    it("a link-page step reached with moduleId null is reported failed without calling the writer", async () => {
      const writers = makeWriters();
      const steps: PostPlanStep[] = [
        { step: "create-page", title: "T", body: "b" },
        { step: "link-page", title: "T" },
      ];

      const outcomes = await executePostPlanSteps(COURSE_URL, null, steps, writers);

      expect(outcomes[1].status).toBe("failed");
      expect(writers.createModuleItem).not.toHaveBeenCalled();
    });
  });

  describe("assignment", () => {
    it("create-assignment done, passing moduleId straight through (createCourseAssignmentAction links in one call)", async () => {
      const writers = makeWriters();
      const fields = {
        name: "Assignment",
        description: "d",
        pointsPossible: null,
        dueAt: "",
        submissionType: "online_text_entry",
        published: false,
      };
      const steps: PostPlanStep[] = [{ step: "create-assignment", fields }];

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(outcomes).toEqual([{ step: steps[0], status: "done" }]);
      expect(writers.createAssignment).toHaveBeenCalledWith(COURSE_URL, fields, MODULE_ID, undefined);
    });

    it("create-assignment failure is reported failed", async () => {
      const writers = makeWriters({ createAssignment: vi.fn(async () => ({ error: "quota" })) });
      const steps: PostPlanStep[] = [
        {
          step: "create-assignment",
          fields: { name: "A", description: "d", pointsPossible: null, dueAt: "", submissionType: "none", published: false },
        },
      ];

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(outcomes).toEqual([{ step: steps[0], status: "failed", detail: "quota" }]);
    });
  });

  describe("quiz", () => {
    function quizSteps(questionCount: number): PostPlanStep[] {
      const steps: PostPlanStep[] = [{ step: "create-quiz", title: "Knowledge Check", description: "d" }];
      for (let i = 0; i < questionCount; i++) {
        steps.push({ step: "create-quiz-question", index: i, total: questionCount, question: QUESTION });
      }
      steps.push({ step: "publish-quiz" });
      steps.push({ step: "link-quiz", title: "Knowledge Check" });
      return steps;
    }

    it("full success: create, every question, publish, link - all done", async () => {
      const writers = makeWriters();
      const steps = quizSteps(3);

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(outcomes.every((o) => o.status === "done")).toBe(true);
      expect(outcomes).toHaveLength(6);
      expect(writers.createQuizQuestion).toHaveBeenCalledTimes(3);
      expect(writers.createQuizQuestion).toHaveBeenCalledWith(COURSE_URL, 7, QUESTION, undefined);
      expect(writers.publishQuiz).toHaveBeenCalledWith(COURSE_URL, 7, undefined);
      expect(writers.createModuleItem).toHaveBeenCalledWith(
        COURSE_URL,
        MODULE_ID,
        { type: "Quiz", contentId: 7, title: "Knowledge Check" },
        undefined
      );
    });

    it("SABOTAGE TARGET: create-quiz failure stops execution - no question/publish/link writer is ever called", async () => {
      const writers = makeWriters({ createQuiz: vi.fn(async () => ({ error: "down" })) });
      const steps = quizSteps(2);

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(outcomes).toEqual([{ step: steps[0], status: "failed", detail: "down" }]);
      expect(writers.createQuizQuestion).not.toHaveBeenCalled();
      expect(writers.publishQuiz).not.toHaveBeenCalled();
      expect(writers.createModuleItem).not.toHaveBeenCalled();
    });

    it("PARTIAL QUESTIONS: a failing question does not stop the remaining questions, publish, or link", async () => {
      let call = 0;
      const writers = makeWriters({
        createQuizQuestion: vi.fn(async () => {
          call += 1;
          return call === 2 ? { error: "bad question" } : { question: {} };
        }),
      });
      const steps = quizSteps(3);

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(writers.createQuizQuestion).toHaveBeenCalledTimes(3);
      const questionOutcomes = outcomes.filter((o) => o.step.step === "create-quiz-question");
      expect(questionOutcomes.map((o) => o.status)).toEqual(["done", "failed", "done"]);
      // publish and link still attempted despite the failed question:
      expect(writers.publishQuiz).toHaveBeenCalledTimes(1);
      expect(writers.createModuleItem).toHaveBeenCalledTimes(1);
      const publishOutcome = outcomes.find((o) => o.step.step === "publish-quiz");
      const linkOutcome = outcomes.find((o) => o.step.step === "link-quiz");
      expect(publishOutcome?.status).toBe("done");
      expect(linkOutcome?.status).toBe("done");
    });

    it("a publish failure does not prevent the link step from being attempted", async () => {
      const writers = makeWriters({ publishQuiz: vi.fn(async () => ({ error: "publish failed" })) });
      const steps = quizSteps(1);

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      const publishOutcome = outcomes.find((o) => o.step.step === "publish-quiz");
      const linkOutcome = outcomes.find((o) => o.step.step === "link-quiz");
      expect(publishOutcome).toEqual({ step: steps[2], status: "failed", detail: "publish failed" });
      expect(linkOutcome?.status).toBe("done");
      expect(writers.createModuleItem).toHaveBeenCalledTimes(1);
    });

    it("a create-quiz-question step reached with no quizId (defensive) is reported failed without calling the writer", async () => {
      const writers = makeWriters();
      const steps: PostPlanStep[] = [{ step: "create-quiz-question", index: 0, total: 1, question: QUESTION }];

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(outcomes[0].status).toBe("failed");
      expect(writers.createQuizQuestion).not.toHaveBeenCalled();
    });
  });

  describe("announcement", () => {
    it("create-announcement done, called with moduleId irrelevant (course-level - null is passed)", async () => {
      const writers = makeWriters();
      const steps: PostPlanStep[] = [{ step: "create-announcement", title: "Hi", message: "Body" }];

      const outcomes = await executePostPlanSteps(COURSE_URL, null, steps, writers);

      expect(outcomes).toEqual([{ step: steps[0], status: "done" }]);
      expect(writers.createAnnouncement).toHaveBeenCalledWith(COURSE_URL, "Hi", "Body", undefined);
    });

    it("create-announcement failure is reported failed", async () => {
      const writers = makeWriters({ createAnnouncement: vi.fn(async () => ({ error: "nope" })) });
      const steps: PostPlanStep[] = [{ step: "create-announcement", title: "Hi", message: "Body" }];

      const outcomes = await executePostPlanSteps(COURSE_URL, null, steps, writers);

      expect(outcomes).toEqual([{ step: steps[0], status: "failed", detail: "nope" }]);
    });
  });

  it("an empty plan produces an empty outcome list without calling any writer", async () => {
    const writers = makeWriters();
    const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, [], writers);
    expect(outcomes).toEqual([]);
    for (const fn of Object.values(writers)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});
