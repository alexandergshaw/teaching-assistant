import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/lecture-concepts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lecture-concepts")>(
    "@/lib/lecture-concepts"
  );
  return { ...actual, planWeekConcepts: vi.fn() };
});

vi.mock("@/lib/research/index", () => ({
  findCaseStudyMaterial: vi.fn(),
  findPracticeProblems: vi.fn(),
  research: vi.fn(),
}));

vi.mock("@/lib/research/gap", async () => {
  const actual = await vi.importActual<typeof import("@/lib/research/gap")>("@/lib/research/gap");
  return { ...actual, maybeLearnInBackground: vi.fn() };
});

vi.mock("@/lib/research/glossary", () => ({
  rememberDefinitions: vi.fn(),
  lookupDefinitionsForPhrases: vi.fn(async () => new Map<string, string>()),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { planWeekConcepts } from "@/lib/lecture-concepts";
import { findCaseStudyMaterial, findPracticeProblems } from "@/lib/research/index";
import { findWriteCodeViolation } from "@/lib/opener-warmup";
import type { PracticeProblemEntry } from "@/lib/research/practice-problems";
import { buildAssignmentPlan, type AssignmentContentBundle, type LectureTemplates } from "./shared";

const CONCEPTS = ["Numeric representation", "Integer overflow"];
const ASSIGNED_CASE = {
  organization: "Ariane 5 Flight 501",
  period: "1996",
  hook: "A numeric conversion overflow caused the inertial reference software to fail.",
};

const BUNDLE: AssignmentContentBundle = {
  name: "week2",
  content: [
    "=== README.md ===",
    "# Numeric Boundaries",
    "",
    "REPO_GROUNDING_MARKER: Trace the supplied numeric conversion table and explain the overflow boundary.",
    "",
    "```python",
    "value = 32767",
    "```",
  ].join("\n"),
  readmeContent: [
    "# Numeric Boundaries",
    "",
    "REPO_GROUNDING_MARKER: Trace the supplied numeric conversion table and explain the overflow boundary.",
  ].join("\n"),
};

const TEMPLATES: LectureTemplates = {
  introTemplateText: "",
  instructionsTemplateText: "",
  introTemplateHeadings: [],
  instructionsTemplateHeadings: [],
};

const UNSAFE_BANK_PROBLEM: PracticeProblemEntry = {
  kind: "practice_problem",
  id: "unsafe-opener-probe",
  title: "Write a function that converts the supplied value",
  topics: ["numeric representation", "integer overflow"],
  language: "python",
  difficulty: "intro",
  prompt: "Trace the supplied value and predict the result.",
  exampleCode: "value = 32767\nprint(value + 1)",
  solutionCode: "print(32768)",
};

describe("buildAssignmentPlan: embedded repo opener-before-deck continuity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(planWeekConcepts).mockResolvedValue({
      concepts: CONCEPTS,
      targetCount: 5,
      merged: [],
    });
    vi.mocked(findCaseStudyMaterial).mockResolvedValue(null);
    vi.mocked(findPracticeProblems).mockResolvedValue([UNSAFE_BANK_PROBLEM]);
  });

  it("threads one assigned case, concept plan, and assignment context through the guarded opener and the continuing deck", async () => {
    const plan = await buildAssignmentPlan(
      BUNDLE,
      0,
      50,
      TEMPLATES,
      "embedded",
      4,
      ASSIGNED_CASE,
      true
    );

    expect(planWeekConcepts).toHaveBeenCalledTimes(1);
    expect(plan.openerFailed).toBeUndefined();
    expect(plan.openerText).toBeTruthy();
    expect(plan.openerText).toContain(`Case Study: ${ASSIGNED_CASE.organization}`);
    expect(plan.openerText).toContain(`Period: ${ASSIGNED_CASE.period}`);
    expect(plan.openerText).toContain(ASSIGNED_CASE.hook);
    expect(plan.openerText).toContain(`Concepts to preview: ${CONCEPTS.join(", ")}`);
    expect(plan.openerText).toContain("Assignment connection");
    expect(plan.openerText).toContain("Numeric Boundaries");

    // The injected bank title deliberately asks for code. The embedded path
    // must run the same data-layer guard as the model path and replace only
    // that unsafe warm-up, while keeping the case/assignment context above.
    expect(plan.openerText).not.toContain(UNSAFE_BANK_PROBLEM.title);
    expect(plan.openerText).toContain("Map the analogy");
    expect(findWriteCodeViolation(plan.openerText ?? "")).toBeNull();

    const caseSlides = plan.slides.filter((slide) => slide.title === `Case Study: ${ASSIGNED_CASE.organization}`);
    expect(caseSlides).toHaveLength(1);
    expect(caseSlides[0].bullets).toContain(`Period: ${ASSIGNED_CASE.period}.`);
    expect(caseSlides[0].bullets).toContain(ASSIGNED_CASE.hook);

    expect(plan.slides.some((slide) => slide.title === "Numeric Representation")).toBe(true);
    expect(plan.slides.some((slide) => slide.title === "Integer Overflow")).toBe(true);

    const transitions = plan.slides.filter((slide) => slide.title === "Building on the Class Opener");
    expect(transitions).toHaveLength(1);
    expect(transitions[0].bullets.join("\n")).toContain("Class Opener: Numeric Boundaries");
    expect(transitions[0].bullets.join("\n")).toContain(CONCEPTS[0]);

    const deckText = plan.slides
      .flatMap((slide) => [slide.title, ...slide.bullets])
      .join("\n");
    expect(deckText).not.toContain("Assignment connection");
    expect(deckText).not.toContain("Map the analogy");
    expect(deckText).not.toContain("## Warm-up exercise");
    expect(requireOwner).toHaveBeenCalled();
  });

  it("keeps embedded default-off behavior identical whether the new flag is omitted or explicitly false", async () => {
    const implicitDefault = await buildAssignmentPlan(
      BUNDLE,
      0,
      50,
      TEMPLATES,
      "embedded",
      4,
      ASSIGNED_CASE
    );
    const explicitFalse = await buildAssignmentPlan(
      BUNDLE,
      0,
      50,
      TEMPLATES,
      "embedded",
      4,
      ASSIGNED_CASE,
      false
    );

    expect(explicitFalse).toEqual(implicitDefault);
    expect(implicitDefault.openerText).toBeUndefined();
    expect(implicitDefault.openerFailed).toBeUndefined();
    expect(implicitDefault.slides.some((slide) => slide.title === "Building on the Class Opener")).toBe(false);
    expect(planWeekConcepts).not.toHaveBeenCalled();
    expect(requireOwner).not.toHaveBeenCalled();
  });
});
