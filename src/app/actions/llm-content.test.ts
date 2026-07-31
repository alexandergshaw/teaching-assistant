import { describe, it, expect, vi, beforeEach } from "vitest";

// generateAssignmentAction only calls callLlm (no auth, no DB) for a
// non-embedded provider, so only callLlm needs mocking to exercise the real
// prompt-building logic - same pattern as shared.test.ts.
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { generateAssignmentAction } from "./llm-content";
import { courseKindContract, APPLIED_REAL_TOOL_RULE } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

const VALID_ASSIGNMENT_JSON = JSON.stringify({
  title: "Assignment",
  overview: "Overview",
  steps: [{ stepTitle: "Step 1", description: "Do the thing" }],
  tools: ["Tool"],
  deliverables: ["Deliverable"],
});

describe("generateAssignmentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: VALID_ASSIGNMENT_JSON,
    } as never);
  });

  // AC1: the applied branch used to be a pure negative ("do not list
  // programming languages...") plus category hints ("boards, planners") -
  // never a requirement to actually NAME a product. It now reuses the deck's
  // "REAL PROFESSIONAL TOOLS" rule verbatim via APPLIED_REAL_TOOL_RULE.
  describe("applied tool rule (AC1)", () => {
    it("requires a named real tool and the free-access statement", async () => {
      await generateAssignmentAction("Objectives", "Context", [], "gemini", "applied");

      const prompt = promptFromCall();
      expect(prompt).toContain(APPLIED_REAL_TOOL_RULE);
      expect(prompt).toContain("name a REAL, widely used tool");
      expect(prompt).toContain("never invent a product");
      expect(prompt.toLowerCase()).toContain("free tier");
      expect(prompt.toLowerCase()).toContain("free trial");
      expect(prompt.toLowerCase()).toContain("community edition");
      expect(prompt.toLowerCase()).toContain("spreadsheet equivalent");
    });

    it("keeps the no-code prohibition intact", async () => {
      await generateAssignmentAction("Objectives", "Context", [], "gemini", "applied");

      const prompt = promptFromCall();
      expect(prompt).toContain("Do not list programming languages, IDEs, or developer platforms.");
    });

    it("never lets an applied course fall back to the coding tool examples", async () => {
      await generateAssignmentAction("Objectives", "Context", [], "gemini", "applied");

      const prompt = promptFromCall();
      expect(prompt).not.toContain("Google Colab");
      expect(prompt).not.toContain("Replit");
    });
  });

  // AC2: an optional pre-selected tool hint, mirroring
  // generateAssignmentInstructionsForAssignment's requiredTools parameter
  // (shared.ts).
  describe("requiredTools hint (AC2)", () => {
    it("an absent hint (the default) still produces a valid applied prompt with no tool-lock sentence", async () => {
      const result = await generateAssignmentAction("Objectives", "Context", [], "gemini", "applied");

      expect("error" in result).toBe(false);
      const prompt = promptFromCall();
      expect(prompt).not.toContain("already decided");
    });

    it("a supplied hint appears in the prompt and instructs the model to build on it", async () => {
      await generateAssignmentAction("Objectives", "Context", [], "gemini", "applied", "Trello (free plan)");

      const prompt = promptFromCall();
      expect(prompt).toContain("already decided");
      expect(prompt).toContain("Trello (free plan)");
      expect(prompt).toContain("Default to using ONLY these committed tool(s)");
    });
  });

  // AC4: the coding branch must be completely unaffected by this feature -
  // same text as before, and a requiredTools hint must never reach it.
  describe("coding course is unaffected (AC4)", () => {
    // Reconstructed from the SAME building blocks the function itself
    // composes with (courseKindContract, PLAIN_LANGUAGE_CONTRACT) rather than
    // a hand-typed duplicate, so this pins the coding TEMPLATE shape - the
    // thing AC1/AC2 touched only on the applied side - without also pinning
    // unrelated constants that are free to change for their own reasons.
    function expectedCodingPrompt(moduleObjectives: string, contextText: string): string {
      return `You are an expert educator designing a hands-on, industry-simulating assignment.

${courseKindContract("coding")}

MODULE OBJECTIVES:
${moduleObjectives}

CONTEXT:
${contextText}

Design a practical assignment that simulates real industry workflows and that students can complete entirely for free. Return ONLY valid JSON:
{
  "title": "...",
  "overview": "...",
  "steps": [
    { "stepTitle": "...", "description": "..." }
  ],
  "tools": ["..."],
  "deliverables": ["..."]
}

Requirements:
- Simulate authentic challenges students will face on the job.
- Every tool listed must be free and accessible, and must be a tool practitioners in THIS field actually use. For a programming course that means things like Python, VS Code, Google Colab, GitHub, or Replit.
- 4–8 concrete, sequential steps that a student can complete working alone.
- Tie every step clearly to the module objectives.
- Deliverables should be specific and assessable.
- ${PLAIN_LANGUAGE_CONTRACT}
- Do not include any text outside the JSON object.`;
    }

    it("the prompt is byte-identical to the pre-existing template with no hint", async () => {
      await generateAssignmentAction("Objectives here", "Context here", [], "gemini", "coding");

      const prompt = promptFromCall();
      expect(prompt).toBe(expectedCodingPrompt("Objectives here", "Context here"));
    });

    it("a requiredTools hint has zero effect on the coding prompt", async () => {
      await generateAssignmentAction(
        "Objectives here",
        "Context here",
        [],
        "gemini",
        "coding",
        "Trello (free plan)"
      );

      const prompt = promptFromCall();
      expect(prompt).toBe(expectedCodingPrompt("Objectives here", "Context here"));
      expect(prompt).not.toContain("Trello");
      expect(prompt).not.toContain("already decided");
    });

    it("defaults to coding when courseKind is omitted, unaffected by this feature", async () => {
      await generateAssignmentAction("Objectives here", "Context here", []);

      const prompt = promptFromCall();
      expect(prompt).toBe(expectedCodingPrompt("Objectives here", "Context here"));
    });
  });
});
