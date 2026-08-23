import { describe, it, expect, vi } from "vitest";
import { executePostPlanSteps, type CanvasWriters } from "./commit-execute";
import { summarizePostOutcome, type PostPlanStep } from "./commit-plan";

// NewGradedDiscussion (src/lib/canvas-modules/graded-discussion.ts) is owned
// by a sibling agent and is not necessarily on disk yet - this file never
// imports it (even as a type), matching commit-plan.test.ts's own approach.
// useCheckpoints/initialPostPoints/repliesPoints (added to that type by the
// frozen contract, landed concurrently by that sibling agent) are included
// here structurally so this fixture keeps matching the real shape.
function discussionFields() {
  return {
    title: "Introduce Yourself",
    message: "<p>Tell us about yourself.</p>",
    pointsPossible: 20,
    initialPostAt: "2026-09-04T03:59:00.000Z",
    repliesDueAt: "2026-09-07T03:59:00.000Z",
    requiredReplyCount: 2,
    published: false,
    useCheckpoints: false,
    initialPostPoints: 10,
    repliesPoints: 10,
  };
}

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
    createDiscussion: vi.fn(async () => ({ id: 9, path: "checkpoints" as const })),
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

  describe("discussion", () => {
    it("create-discussion then link-discussion: both done, writers called with the right args", async () => {
      const writers = makeWriters();
      const fields = discussionFields();
      const steps: PostPlanStep[] = [
        { step: "create-discussion", fields },
        { step: "link-discussion", title: fields.title },
      ];

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers, "MIT");

      expect(outcomes).toEqual([
        { step: steps[0], status: "done", detail: undefined },
        { step: steps[1], status: "done" },
      ]);
      expect(writers.createDiscussion).toHaveBeenCalledWith(COURSE_URL, fields, "MIT");
      expect(writers.createModuleItem).toHaveBeenCalledWith(
        COURSE_URL,
        MODULE_ID,
        { type: "Discussion", contentId: 9, title: fields.title },
        "MIT"
      );
    });

    // SABOTAGE TARGET: create-discussion is content-defining - a failure
    // there must stop execution immediately (return outcomes right away),
    // exactly like create-page/create-quiz/create-announcement. Nothing
    // downstream can succeed against content that was never created.
    it("SABOTAGE TARGET: create-discussion failure stops execution - link-discussion is never attempted", async () => {
      const writers = makeWriters({ createDiscussion: vi.fn(async () => ({ error: "Canvas is down" })) });
      const fields = discussionFields();
      const steps: PostPlanStep[] = [
        { step: "create-discussion", fields },
        { step: "link-discussion", title: fields.title },
      ];

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(outcomes).toEqual([{ step: steps[0], status: "failed", detail: "Canvas is down" }]);
      expect(writers.createModuleItem).not.toHaveBeenCalled();
    });

    it("the orphan case: discussion created but link-discussion fails - both outcomes recorded, not aborted", async () => {
      const writers = makeWriters({ createModuleItem: vi.fn(async () => ({ error: "link failed" })) });
      const fields = discussionFields();
      const steps: PostPlanStep[] = [
        { step: "create-discussion", fields },
        { step: "link-discussion", title: fields.title },
      ];

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(outcomes).toEqual([
        { step: steps[0], status: "done", detail: undefined },
        { step: steps[1], status: "failed", detail: "link failed" },
      ]);
    });

    it("a link-discussion step reached with moduleId null is reported failed without calling the writer", async () => {
      const writers = makeWriters();
      const fields = discussionFields();
      const steps: PostPlanStep[] = [
        { step: "create-discussion", fields },
        { step: "link-discussion", title: fields.title },
      ];

      const outcomes = await executePostPlanSteps(COURSE_URL, null, steps, writers);

      expect(outcomes[1]).toEqual({ step: steps[1], status: "failed", detail: "No discussion/module to link." });
      expect(writers.createModuleItem).not.toHaveBeenCalled();
    });

    it("a link-discussion step reached with no discussionId (defensive) is reported failed without calling the writer", async () => {
      const writers = makeWriters();
      const steps: PostPlanStep[] = [{ step: "link-discussion", title: "Introduce Yourself" }];

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(outcomes[0].status).toBe("failed");
      expect(writers.createModuleItem).not.toHaveBeenCalled();
    });

    // AC14g: the classic-path fallback must never be silent. When
    // writers.createDiscussion reports path "classic", the reason must
    // survive onto the outcome, not disappear once the step is marked
    // "done".
    it("SABOTAGE TARGET: a classic-path fallback carries its reason on the outcome, not silently as a plain success", async () => {
      const writers = makeWriters({
        createDiscussion: vi.fn(async () => ({
          id: 9,
          path: "classic" as const,
          fallbackReason: "discussion_checkpoints feature flag must be enabled",
        })),
      });
      const fields = discussionFields();
      const steps: PostPlanStep[] = [{ step: "create-discussion", fields }];

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(outcomes[0].status).toBe("done");
      expect(outcomes[0].detail).toBeDefined();
      expect(outcomes[0].detail).toContain("discussion_checkpoints feature flag must be enabled");
    });

    // M1 (fix): the outcome's `detail` used to WRAP fallbackReason
    // ("Classic fallback used (<reason>) - only the initial-post deadline is
    // enforced by Canvas.") even though the write layer's own
    // describeFallback() already ends with that exact warning - doubling it.
    // This custom reason string deliberately shares NO words with either the
    // old wrapper text or the real describeFallback() sentence, so an exact
    // (not `.toContain`) match is the only way this test can pass - any
    // re-introduced wrapping/appending would fail it immediately.
    it("M1: fallbackReason reaches the outcome VERBATIM - no wrapping prefix, no appended suffix", async () => {
      const fallbackReason = "CUSTOM SENTINEL TEXT WITH NO CANVAS WRAPPING WHATSOEVER";
      const writers = makeWriters({
        createDiscussion: vi.fn(async () => ({ id: 9, path: "classic" as const, fallbackReason })),
      });
      const fields = discussionFields();
      const steps: PostPlanStep[] = [{ step: "create-discussion", fields }];

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(outcomes[0].detail).toBe(fallbackReason);
    });

    it("the checkpoints path (the normal case) carries no fallback detail", async () => {
      const writers = makeWriters();
      const fields = discussionFields();
      const steps: PostPlanStep[] = [{ step: "create-discussion", fields }];

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);

      expect(outcomes[0]).toEqual({ step: steps[0], status: "done", detail: undefined });
    });

    // End-to-end (D5's silent-failure hop #1): a fully successful discussion
    // post must summarize as "success", never "Nothing was posted." - the
    // failure this guards against produces exactly that string with a fully
    // successful Canvas write underneath it.
    it("end-to-end: a successful discussion plan summarizes as success, not 'Nothing was posted.'", async () => {
      const writers = makeWriters();
      const fields = discussionFields();
      const steps: PostPlanStep[] = [
        { step: "create-discussion", fields },
        { step: "link-discussion", title: fields.title },
      ];

      const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, steps, writers);
      const summary = summarizePostOutcome(outcomes);

      expect(summary.status).toBe("success");
      expect(summary.text).not.toBe("Nothing was posted.");
      expect(summary.text).toContain(fields.title);
    });
  });

  // A NEW COMPLETENESS TEST (docs/intro-discussion-from-modules-acceptance-
  // criteria.md, "TESTS" section): nothing today pins that every
  // PostPlanStep["step"] literal actually produces an outcome when executed -
  // that switch has no `default` and no return-type pressure, so a missing
  // case is silently skipped rather than a compile error. TypeScript's
  // discriminated union cannot be enumerated at runtime, so this list of
  // every step literal is HAND-WRITTEN and is itself a canary: bump it in the
  // same commit as any future PostPlanStep addition, or this test stops
  // proving anything.
  //
  // Finding 3 (fix): the ORIGINAL `Array<PostPlanStep["step"]>` annotation
  // only enforces that every LISTED value is a valid step kind - it does
  // nothing to enforce the reverse (every valid kind is LISTED). Add a
  // twelfth step kind to PostPlanStep and that old annotation stays green
  // while this list silently omits it - exactly the defect this canary
  // exists to catch. `satisfies Record<PostPlanStep["step"], true>` makes the
  // object literal itself compile-time exhaustive: TypeScript rejects it the
  // moment a PostPlanStep step kind is missing a key, OR a key does not
  // correspond to a real step kind. See this chunk's own report for the
  // sabotage transcript (a thirteenth key added, `tsc --noEmit` re-run,
  // reverted).
  const ALL_POST_PLAN_STEP_KINDS = Object.keys({
    "create-page": true,
    "update-page": true,
    "link-page": true,
    "create-assignment": true,
    "create-quiz": true,
    "create-quiz-question": true,
    "publish-quiz": true,
    "link-quiz": true,
    "create-announcement": true,
    "create-discussion": true,
    "link-discussion": true,
  } satisfies Record<PostPlanStep["step"], true>) as Array<PostPlanStep["step"]>;

  it("COMPLETENESS: every PostPlanStep step kind produces an attempted outcome, none silently skipped", async () => {
    const writers = makeWriters();
    const megaPlan: PostPlanStep[] = [
      { step: "create-page", title: "P", body: "b" },
      { step: "link-page", title: "P" },
      { step: "update-page", pageUrl: "existing-page", title: "P2", body: "b2" },
      { step: "create-assignment", fields: {
        name: "A", description: "d", pointsPossible: null, dueAt: "", submissionType: "none", published: false,
      } },
      { step: "create-quiz", title: "Q", description: "d" },
      { step: "create-quiz-question", index: 0, total: 1, question: QUESTION },
      { step: "publish-quiz" },
      { step: "link-quiz", title: "Q" },
      { step: "create-announcement", title: "N", message: "m" },
      { step: "create-discussion", fields: discussionFields() },
      { step: "link-discussion", title: discussionFields().title },
    ];

    const outcomes = await executePostPlanSteps(COURSE_URL, MODULE_ID, megaPlan, writers);

    // Nothing was skipped: exactly one outcome per planned step, in order.
    expect(outcomes).toHaveLength(megaPlan.length);
    expect(outcomes.every((o) => o.status === "done")).toBe(true);

    const attemptedKinds = outcomes.map((o) => o.step.step);
    for (const kind of ALL_POST_PLAN_STEP_KINDS) {
      expect(attemptedKinds).toContain(kind);
    }
    // And the canary itself is exhaustive against what the mega-plan sent in.
    expect(new Set(attemptedKinds)).toEqual(new Set(ALL_POST_PLAN_STEP_KINDS));
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
