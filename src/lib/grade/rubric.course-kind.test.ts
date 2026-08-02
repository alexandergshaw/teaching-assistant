// AC2 (prompt layer): generateRubric is where every course-wide rubric
// actually gets written, and it is blind to the course kind.
//
// The call chain is: the lms-rubric / generate-rubric-from-repo steps
// (src/lib/workflows/registry/steps.rubrics.ts) -> the server actions
// generateCourseRubricFromZipAction / generateCourseRubricFromScheduleAction
// (src/app/actions/llm-tools.ts) -> generateRubric (./rubric.ts). No link in
// that chain carries a CourseKind, and generateRubric's prompt hard-codes the
// coding assumption for every course:
//
//   "Every criterion must evaluate only the presence or absence of things in
//    the submitted code itself ... or evaluating anything outside the code
//    files themselves."
//
// That is what produced an ethical-hacking course - whose assignments are
// entirely code-free - graded on "code blocks", "code snippets", and
// "well-commented code".
//
// WHAT THIS FILE PROVES, AND WHAT IT DOES NOT:
// These tests assert on the PROMPT TEXT sent to the model, not on a rubric a
// model produced. They prove the generator is told what kind of course it is
// serving and is no longer told to grade code for an applied one. They do NOT
// prove the model complies - no test that mocks the network can. The
// deterministic half of AC2, which does assert real generated output, is in
// src/lib/workflows/registry/steps.rubrics.course-kind.test.ts (the offline
// generator, no model call at all).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { courseKindContract, type CourseKind } from "../course-kind";

vi.mock("../llm", async () => {
  const actual = await vi.importActual<typeof import("../llm")>("../llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm, type LlmProvider } from "../llm";
import { generateRubric } from "./rubric";

// generateRubric does not take a course kind today. Declaring the call shape
// the fix must satisfy is enough to type-check now (TypeScript accepts a
// narrower function where a wider one is expected) and stays correct once the
// parameter exists. The kind is passed positionally after the provider,
// matching every other kind-aware generator in this repo
// (generateModuleObjectivesForAssignment, generateEmbeddedRubricText); an
// implementer who prefers a different shape should adjust this binding, not
// the assertions.
type KindAwareGenerateRubric = (
  instructions: string,
  provider: LlmProvider,
  courseKind: CourseKind
) => Promise<string>;
const generateRubricForKind: KindAwareGenerateRubric = generateRubric;

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

const RUBRIC_RESPONSE = {
  ok: true as const,
  status: 200,
  body: "",
  text: JSON.stringify({ rubric: "Scope (100%): The memo names every in-scope system." }),
};

const APPLIED_ASSIGNMENT =
  "Draft the rules of engagement for an authorized security assessment. Name every in-scope system.";
const CODING_ASSIGNMENT = "Write a merge_sort function that sorts a list of integers.";

// The verbatim instruction that makes today's prompt a coding-only prompt.
const CODE_ONLY_CRITERIA_INSTRUCTION = "the submitted code itself";
const CODE_FILES_INSTRUCTION = "the code files themselves";

describe("generateRubric course-kind awareness (AC2, prompt layer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callLlm).mockResolvedValue(RUBRIC_RESPONSE as never);
  });

  it("tells the model an APPLIED course is not a programming course", async () => {
    await generateRubricForKind(APPLIED_ASSIGNMENT, "gemini", "applied");

    // The shared constant, verbatim - the same way every other applied-aware
    // prompt in this repo carries it, so the rule cannot drift into a
    // rubric-only paraphrase.
    expect(promptFromCall()).toContain(courseKindContract("applied"));
  });

  it("never asks an APPLIED course's rubric to grade the submitted code", async () => {
    await generateRubricForKind(APPLIED_ASSIGNMENT, "gemini", "applied");
    const prompt = promptFromCall();

    expect(prompt, "the applied rubric prompt still demands code-only criteria").not.toContain(
      CODE_ONLY_CRITERIA_INSTRUCTION
    );
    expect(prompt).not.toContain(CODE_FILES_INSTRUCTION);
    expect(prompt).not.toMatch(/\bsyntax\b/i);
    expect(prompt).not.toMatch(/\bcode snippets?\b/i);
  });

  // OVER-REACH GUARD (passes today by design): the fix must be a branch, not a
  // deletion. A coding course's rubric prompt keeps its code-grounded rule.
  it("a CODING course's rubric prompt still grounds every criterion in the submitted code", async () => {
    await generateRubricForKind(CODING_ASSIGNMENT, "gemini", "coding");
    const prompt = promptFromCall();

    expect(prompt).toContain(CODE_ONLY_CRITERIA_INSTRUCTION);
    expect(prompt).not.toContain(courseKindContract("applied"));
  });

  // OVER-REACH GUARD (passes today by design): stored workflows and existing
  // callers pass no kind at all, and must keep behaving as a coding course
  // (the repo-wide default - resolveCourseKind).
  it("an omitted course kind builds the same prompt as an explicit coding course", async () => {
    await generateRubric(CODING_ASSIGNMENT, "gemini");
    await generateRubricForKind(CODING_ASSIGNMENT, "gemini", "coding");

    expect(promptFromCall(0)).toBe(promptFromCall(1));
  });
});
