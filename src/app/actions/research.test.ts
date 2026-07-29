import { describe, it, expect, vi, beforeEach } from "vitest";

// generateClassOpenerAction calls requireOwner() (auth), getWritingStyleBlock()
// (a DB read for the instructor's writing sample), and callLlm() (network) for
// a non-embedded provider - all three are mocked so the prompt-building logic
// runs for real without a Supabase session or a live model call.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("./shared", async () => {
  const actual = await vi.importActual<typeof import("./shared")>("./shared");
  return {
    ...actual,
    getWritingStyleBlock: vi.fn().mockResolvedValue(""),
  };
});

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { generateClassOpenerAction } from "./research";
import { PLAIN_LANGUAGE_CONTRACT, CONCRETE_DIRECTION_CONTRACT } from "@/lib/artifact-voice";
import type { PracticeProblemEntry } from "@/lib/research/practice-problems";

// A representative bank-sourced coding practice problem - the bank is a
// SOFTWARE bank (see docs/REGRESSION.md 84.5), so every entry can carry
// exampleCode/solutionCode regardless of which course it gets fetched for.
const codingPracticeProblem: PracticeProblemEntry = {
  kind: "practice_problem",
  id: "loops-sum-even",
  title: "Sum the even numbers",
  topics: ["loops"],
  language: "python",
  difficulty: "intro",
  prompt: "PRACTICE_PROMPT_MARKER: write a loop that sums even numbers.",
  exampleCode: "for n in range(10):\n    pass",
  solutionCode: "total = sum(n for n in range(10) if n % 2 == 0)",
};

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

describe("generateClassOpenerAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("composes both the plain-language and concrete-direction voice contracts into the prompt", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Stakeholder Analysis\n\n## Case study discussion (about 15 minutes)\nBody",
    });

    const result = await generateClassOpenerAction(
      "Stakeholder Analysis",
      "This week covers stakeholder mapping.",
      30,
      null,
      [],
      "gemini",
      "applied"
    );

    expect("error" in result).toBe(false);

    const prompt = promptFromCall();
    expect(prompt).toContain(PLAIN_LANGUAGE_CONTRACT);
    expect(prompt).toContain(CONCRETE_DIRECTION_CONTRACT);
  });

  it("raises the model's output ceiling above the old 3000-token cap so worked examples are not truncated", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Topic\n\n## Case study discussion (about 15 minutes)\nBody",
    });

    await generateClassOpenerAction("Topic", "Summary", 30, null, [], "gemini", "coding");

    const call = vi.mocked(callLlm).mock.calls[0][0];
    expect(call.generationConfig?.maxOutputTokens).toBe(4096);
  });

  it("does not call the LLM at all for the embedded provider (voice contracts are LLM-only)", async () => {
    const result = await generateClassOpenerAction("Topic", "Summary", 30, null, [], "embedded", "coding");

    expect("error" in result).toBe(false);
    expect(callLlm).not.toHaveBeenCalled();
  });

  // AC3: the prompt used to inject practiceProblems[0] verbatim regardless of
  // exerciseKind. Both current callers already skip fetching the (coding-only)
  // practice bank for an applied warm-up, but this guard holds even if a
  // future or careless caller passes one through anyway - a no-code course's
  // opener must never see a coding practice problem's title or prompt text.
  it("an applied opener ignores a coding practice problem even if one reaches it", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Risk\n\n## Case study discussion (about 15 minutes)\nBody",
    });

    await generateClassOpenerAction(
      "Risk Management",
      "Summary",
      30,
      null,
      [codingPracticeProblem],
      "gemini",
      "applied"
    );

    const prompt = promptFromCall();
    expect(prompt).not.toContain("PRACTICE_PROMPT_MARKER");
    expect(prompt).not.toContain(codingPracticeProblem.title);
    expect(prompt).toContain("Topic: Risk Management");
  });

  it("a coding opener still uses the practice problem when one is supplied", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Loops\n\n## Case study discussion (about 15 minutes)\nBody",
    });

    await generateClassOpenerAction(
      "Loops",
      "Summary",
      30,
      null,
      [codingPracticeProblem],
      "gemini",
      "coding"
    );

    const prompt = promptFromCall();
    expect(prompt).toContain("PRACTICE_PROMPT_MARKER");
  });
});
