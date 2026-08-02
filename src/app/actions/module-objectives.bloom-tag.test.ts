// AC3: module objectives ship a visible "(Bloom: Level)" tag the user wants
// gone.
//
// generateModuleObjectivesForAssignment (./module-objectives-generator.ts)
// requires it twice over: once through BLOOM_OBJECTIVES_CONTRACT's "LEVEL
// TAG" clause (src/lib/bloom-taxonomy.ts), interpolated verbatim, and once in
// its own rule 4, which calls out `the "(Bloom: Level)" tag at the end of each
// objective line`. Nothing downstream removes it, so it reaches the student-
// facing document.
//
// THE FIX MUST NOT OVER-REACH. The user asked for the visible LABEL to go,
// not for the taxonomy to stop shaping the objectives. The measurable-verb
// requirement, the banned-verb list, the assignment-alignment rule, and the
// term progression all have to survive. The guard tests at the bottom of this
// file pass today and exist to fail if any of that is deleted along with the
// tag.
//
// WHAT EACH LAYER PROVES:
// - "the generated objectives carry no visible Bloom tag" asserts the
//   FUNCTION'S RETURNED TEXT given a model response that does carry one. That
//   is real observable behavior and holds however the model behaves.
// - The prompt assertions assert PROMPT TEXT ONLY. They prove what the model
//   is asked for; they cannot prove what it writes. No test that mocks the
//   network can.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import { generateModuleObjectivesForAssignment } from "./shared";
import { BLOOM_LEVELS } from "@/lib/bloom-taxonomy";

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

// A model response in exactly the shape today's prompt asks for: measurable
// verbs, and a visible level tag closing every objective line.
const TAGGED_RESPONSE = `# Module Objectives: Week 4

Stakeholder work is what makes the rest of this module's plan credible.

## Learning Objectives
- Explain the purpose of a stakeholder register in project communication. (Bloom: Understand)
- Build a stakeholder register for your own project, covering every party named in the charter. (Bloom: Create)
- Analyze each stakeholder's influence against a power-interest grid. (Bloom: Analyze)
- Justify the engagement approach you chose for the two highest-influence stakeholders. (Bloom: Evaluate)`;

const okResponse = (text: string) => ({ ok: true, status: 200, body: "", text }) as never;

describe("module objectives: no visible Bloom level tag (AC3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("strips the visible Bloom level tag from the returned objectives", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse(TAGGED_RESPONSE));

    const result = await generateModuleObjectivesForAssignment(
      "week-04",
      "Week 4",
      "Build a stakeholder register for your project.",
      "",
      "gemini",
      "applied"
    );

    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.text, "an objective still carries a visible level tag").not.toMatch(/\(\s*Bloom\s*:/i);
    expect(result.text, "the document still names Bloom to the student").not.toMatch(/\bBloom\b/i);
  });

  it("keeps the objective itself intact when the tag is removed", async () => {
    // Removing the label must not take the objective's verb, its observable
    // behavior, or its assessability criterion with it - the whole sentence
    // survives, minus the parenthetical.
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse(TAGGED_RESPONSE));

    const result = await generateModuleObjectivesForAssignment(
      "week-04",
      "Week 4",
      "Build a stakeholder register for your project.",
      "",
      "gemini",
      "applied"
    );

    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.text).toContain("Explain the purpose of a stakeholder register in project communication.");
    expect(result.text).toContain(
      "Build a stakeholder register for your own project, covering every party named in the charter."
    );
    expect(result.text).toContain("Analyze each stakeholder's influence against a power-interest grid.");
    // Still a real objectives document, not a stripped-down fragment.
    expect(result.text).toContain("# Module Objectives: Week 4");
    expect(result.text).toContain("## Learning Objectives");
  });

  it("never asks the model for a visible level tag in the first place", async () => {
    // Prompt-level assertion: proves what is asked for, not what is written.
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("# Module Objectives: Week 4\n\nBody"));

    await generateModuleObjectivesForAssignment("week-04", "Week 4", "assignment", "", "gemini");

    const prompt = promptFromCall();
    expect(prompt, "the prompt still shows the model the tag format").not.toContain("(Bloom:");
    expect(prompt, "the prompt still carries the LEVEL TAG requirement").not.toContain("LEVEL TAG");
  });
});

// --- Over-reach guards: these PASS today and must keep passing -------------
// Bloom's Taxonomy still shapes the objectives; only the visible label goes.
describe("module objectives: Bloom's Taxonomy still shapes the objectives (AC3 guard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callLlm).mockResolvedValue(okResponse("# Module Objectives: Week 4\n\nBody"));
  });

  it("still requires a measurable action verb drawn from a named Bloom level", async () => {
    await generateModuleObjectivesForAssignment("week-04", "Week 4", "assignment", "", "gemini");
    const prompt = promptFromCall();

    expect(prompt, "the measurable-objective requirement was removed along with the tag").toContain("MEASURABLE");
    expect(prompt).toContain("observable behavior");
    expect(prompt).toContain("condition or criterion that makes it assessable");
    for (const level of BLOOM_LEVELS) {
      expect(prompt, `the prompt no longer names the ${level} level`).toContain(level);
    }
  });

  it("still bans the unmeasurable verbs by name and gives the substitutions", async () => {
    await generateModuleObjectivesForAssignment("week-04", "Week 4", "assignment", "", "gemini");
    const prompt = promptFromCall();

    expect(prompt).toContain("BANNED VERBS");
    for (const banned of ['"know"', '"understand"', '"be familiar with"', '"learn about"', '"appreciate"', '"be aware of"']) {
      expect(prompt, `the prompt no longer bans ${banned}`).toContain(banned);
    }
    expect(prompt).toContain('"explain"');
    expect(prompt).toContain('"describe"');
    expect(prompt).toContain('"summarize"');
  });

  it("still makes alignment with the assignment outrank every other rule", async () => {
    await generateModuleObjectivesForAssignment("week-04", "Week 4", "assignment", "", "gemini");
    const prompt = promptFromCall();

    expect(prompt).toContain("ALIGNMENT - THIS RULE OUTRANKS EVERY OTHER RULE HERE");
    expect(prompt).toContain("Progression never overrides ALIGNMENT above");
  });

  it("still carries the term-progression rule and the module's term position", async () => {
    await generateModuleObjectivesForAssignment("week-04", "Week 4", "assignment", "", "gemini", "coding", "", 4, 16);
    const prompt = promptFromCall();

    expect(prompt, "the progression rule was removed along with the tag").toContain("PROGRESSION");
    expect(prompt).toContain("climb toward Apply, Analyze, Evaluate, and Create");
    expect(prompt).toContain("TERM POSITION");
    expect(prompt).toContain("week 4 of 16");
  });
});
