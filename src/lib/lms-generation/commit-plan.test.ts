import { describe, it, expect } from "vitest";
import {
  planModuleTarget,
  planPostSteps,
  summarizePostOutcome,
  type PostStepOutcome,
} from "./commit-plan";
import type { NewAssignment, QuizQuestionInput } from "@/lib/canvas-modules/types";

describe("planModuleTarget", () => {
  it("an existing target always resolves to using that id, with no lookup needed", () => {
    const plan = planModuleTarget({ kind: "existing", moduleId: 42 }, []);
    expect(plan).toEqual({ action: "use", moduleId: 42 });
  });

  it("a new name with no collision resolves to create", () => {
    const plan = planModuleTarget(
      { kind: "new", name: "Course Information" },
      [{ id: 1, name: "Week 1" }]
    );
    expect(plan).toEqual({ action: "create", name: "Course Information" });
  });

  // SABOTAGE TARGET: this is P5/P3's headline rule - createModuleAction has
  // no idempotency, so a case/trim-insensitive collision MUST resolve to
  // reusing the existing module, never creating a duplicate.
  it("a new name that collides case-insensitively with an existing module resolves to REUSE, not create", () => {
    const plan = planModuleTarget(
      { kind: "new", name: "  course information  " },
      [{ id: 7, name: "Course Information" }]
    );
    expect(plan).toEqual({ action: "use", moduleId: 7 });
  });

  it("a blank new-module name is a validation error, not a module named \"\"", () => {
    const plan = planModuleTarget({ kind: "new", name: "   " }, []);
    expect(plan).toEqual({ error: "Enter a name for the new module." });
  });
});

describe("planPostSteps - page", () => {
  it("creates a new page and links it when no same-title page exists", () => {
    const steps = planPostSteps(
      { kind: "page", title: "Week 3 Objectives", body: "<p>body</p>" },
      { pages: [], linkedPageUrls: new Set() }
    );
    expect(steps).toEqual([
      { step: "create-page", title: "Week 3 Objectives", body: "<p>body</p>" },
      { step: "link-page", title: "Week 3 Objectives" },
    ]);
  });

  it("reuses (updates) an existing same-title page instead of creating a duplicate", () => {
    const steps = planPostSteps(
      { kind: "page", title: "Week 3 Objectives", body: "<p>new body</p>" },
      {
        pages: [{ title: "week 3 objectives", url: "week-3-objectives" }],
        linkedPageUrls: new Set(),
      }
    );
    expect(steps[0]).toEqual({
      step: "update-page",
      pageUrl: "week-3-objectives",
      title: "Week 3 Objectives",
      body: "<p>new body</p>",
    });
    // Not linked yet in THIS module, so a link step is still required.
    expect(steps[1]).toEqual({ step: "link-page", title: "Week 3 Objectives" });
    expect(steps).toHaveLength(2);
  });

  // SABOTAGE TARGET: re-run safety (P3) - a page that already exists AND is
  // already linked into the target module must not be re-linked.
  it("does not emit a link step when the reused page is already linked in the target module", () => {
    const steps = planPostSteps(
      { kind: "page", title: "Week 3 Objectives", body: "<p>body</p>" },
      {
        pages: [{ title: "Week 3 Objectives", url: "week-3-objectives" }],
        linkedPageUrls: new Set(["week-3-objectives"]),
      }
    );
    expect(steps).toEqual([
      { step: "update-page", pageUrl: "week-3-objectives", title: "Week 3 Objectives", body: "<p>body</p>" },
    ]);
  });
});

describe("planPostSteps - assignment", () => {
  const fields: NewAssignment = {
    name: "Week 3 Assignment",
    description: "<p>do the thing</p>",
    pointsPossible: 100,
    dueAt: "",
    submissionType: "online_text_entry",
    published: false,
  };

  // SABOTAGE TARGET: createCourseAssignmentAction creates AND links in one
  // Canvas call, so a plan that also emitted a link step would cause a
  // second, redundant module-item POST.
  it("emits exactly one create-assignment step and no separate link step", () => {
    const steps = planPostSteps(
      { kind: "assignment", fields },
      { pages: [], linkedPageUrls: new Set() }
    );
    expect(steps).toEqual([{ step: "create-assignment", fields }]);
  });
});

describe("planPostSteps - announcement", () => {
  // SABOTAGE TARGET: a Canvas announcement is not a module item - emitting a
  // link step for it would describe an impossible Canvas call.
  it("emits only create-announcement, never a link step", () => {
    const steps = planPostSteps(
      { kind: "announcement", title: "Week 3 update", message: "<p>hello</p>" },
      { pages: [], linkedPageUrls: new Set() }
    );
    expect(steps).toEqual([
      { step: "create-announcement", title: "Week 3 update", message: "<p>hello</p>" },
    ]);
    expect(steps.some((s) => s.step === "link-page" || s.step === "link-quiz")).toBe(false);
  });
});

describe("planPostSteps - quiz", () => {
  const questions: QuizQuestionInput[] = [
    { name: "Q1", text: "What is 1+1?", type: "multiple_choice_question", points: 1, answers: [{ text: "2", correct: true }, { text: "3", correct: false }] },
    { name: "Q2", text: "What is 2+2?", type: "multiple_choice_question", points: 1, answers: [{ text: "4", correct: true }, { text: "5", correct: false }] },
  ];

  // SABOTAGE TARGET: the exact ORDER matters to the executor (each question
  // needs the quiz id from the create step; publish/link must come after
  // every question is in).
  it("emits create, then one step per question in order, then publish, then link", () => {
    const steps = planPostSteps(
      { kind: "quiz", title: "Week 3 Knowledge Check", description: "Check yourself.", questions },
      { pages: [], linkedPageUrls: new Set() }
    );
    expect(steps.map((s) => s.step)).toEqual([
      "create-quiz",
      "create-quiz-question",
      "create-quiz-question",
      "publish-quiz",
      "link-quiz",
    ]);
    expect(steps[0]).toEqual({ step: "create-quiz", title: "Week 3 Knowledge Check", description: "Check yourself." });
    expect(steps[1]).toMatchObject({ index: 0, total: 2, question: questions[0] });
    expect(steps[2]).toMatchObject({ index: 1, total: 2, question: questions[1] });
    expect(steps[4]).toEqual({ step: "link-quiz", title: "Week 3 Knowledge Check" });
  });
});

describe("summarizePostOutcome", () => {
  it("success: every step done", () => {
    const outcomes: PostStepOutcome[] = [
      { step: { step: "create-page", title: "Week 3 Objectives", body: "x" }, status: "done" },
      { step: { step: "link-page", title: "Week 3 Objectives" }, status: "done" },
    ];
    const summary = summarizePostOutcome(outcomes);
    expect(summary.status).toBe("success");
    expect(summary.text).toContain("Week 3 Objectives");
  });

  it("failed: the content-defining step itself failed - nothing was created", () => {
    const outcomes: PostStepOutcome[] = [
      { step: { step: "create-page", title: "Week 3 Objectives", body: "x" }, status: "failed", detail: "Canvas 500" },
    ];
    const summary = summarizePostOutcome(outcomes);
    expect(summary.status).toBe("failed");
    expect(summary.text).toContain("Week 3 Objectives");
    expect(summary.text).toContain("Canvas 500");
  });

  it("failed: no outcomes at all", () => {
    expect(summarizePostOutcome([])).toEqual({ status: "failed", text: "Nothing was posted." });
  });

  // SABOTAGE TARGET: the orphan case (P4) - content created, link failed -
  // must be "partial" and must name the created object, never a bare
  // "failed" and never a bare "success".
  it("partial: an orphan (created but not linked) is reported as partial and names what was created", () => {
    const outcomes: PostStepOutcome[] = [
      { step: { step: "create-page", title: "Week 3 Objectives", body: "x" }, status: "done" },
      { step: { step: "link-page", title: "Week 3 Objectives" }, status: "failed", detail: "module not found" },
    ];
    const summary = summarizePostOutcome(outcomes);
    expect(summary.status).toBe("partial");
    expect(summary.text).toContain("Week 3 Objectives");
    expect(summary.text.toLowerCase()).toContain("not linked");
    expect(summary.text).not.toMatch(/^failed/i);
  });

  // SABOTAGE TARGET: a quiz whose questions partly failed must be partial,
  // and must name how many landed - not just "some failed".
  it("partial: a quiz whose questions partly failed names how many landed", () => {
    const q1: QuizQuestionInput = { name: "Q1", text: "t1", type: "multiple_choice_question", points: 1, answers: [] };
    const q2: QuizQuestionInput = { name: "Q2", text: "t2", type: "multiple_choice_question", points: 1, answers: [] };
    const q3: QuizQuestionInput = { name: "Q3", text: "t3", type: "multiple_choice_question", points: 1, answers: [] };
    const outcomes: PostStepOutcome[] = [
      { step: { step: "create-quiz", title: "Week 3 Knowledge Check", description: "d" }, status: "done" },
      { step: { step: "create-quiz-question", index: 0, total: 3, question: q1 }, status: "done" },
      { step: { step: "create-quiz-question", index: 1, total: 3, question: q2 }, status: "failed", detail: "bad question" },
      { step: { step: "create-quiz-question", index: 2, total: 3, question: q3 }, status: "done" },
      { step: { step: "publish-quiz" }, status: "done" },
      { step: { step: "link-quiz", title: "Week 3 Knowledge Check" }, status: "done" },
    ];
    const summary = summarizePostOutcome(outcomes);
    expect(summary.status).toBe("partial");
    expect(summary.text).toContain("2 of 3");
    expect(summary.text).toContain("Week 3 Knowledge Check");
  });

  it("partial: quiz created and linked but publish failed", () => {
    const outcomes: PostStepOutcome[] = [
      { step: { step: "create-quiz", title: "Week 3 Knowledge Check", description: "d" }, status: "done" },
      { step: { step: "publish-quiz" }, status: "failed", detail: "Canvas timeout" },
      { step: { step: "link-quiz", title: "Week 3 Knowledge Check" }, status: "done" },
    ];
    const summary = summarizePostOutcome(outcomes);
    expect(summary.status).toBe("partial");
    expect(summary.text).toContain("could not be published");
  });

  it("success: an assignment with its single create step done", () => {
    const fields: NewAssignment = {
      name: "Week 3 Assignment",
      description: "d",
      pointsPossible: 10,
      dueAt: "",
      submissionType: "online_text_entry",
      published: false,
    };
    const outcomes: PostStepOutcome[] = [{ step: { step: "create-assignment", fields }, status: "done" }];
    const summary = summarizePostOutcome(outcomes);
    expect(summary.status).toBe("success");
    expect(summary.text).toContain("Week 3 Assignment");
  });

  it("failed: an announcement whose create step failed", () => {
    const outcomes: PostStepOutcome[] = [
      { step: { step: "create-announcement", title: "Week 3 update", message: "m" }, status: "failed", detail: "no permission" },
    ];
    const summary = summarizePostOutcome(outcomes);
    expect(summary.status).toBe("failed");
    expect(summary.text).toContain("Week 3 update");
    expect(summary.text).toContain("no permission");
  });
});
