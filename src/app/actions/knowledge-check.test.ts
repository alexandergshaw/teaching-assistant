import { describe, it, expect, vi, beforeEach } from "vitest";

// generateKnowledgeCheckAction only calls callLlm for a non-embedded provider
// (same pattern as course-guides.test.ts's generateCourseFaqAction tests).
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { generateKnowledgeCheckAction, type KnowledgeCheckQuestion } from "./knowledge-check";
// isUsableKnowledgeCheckQuestion and the question-count bounds live in
// @/lib/knowledge-check-shape, not in the "use server" action module - see
// that file's header comment for why. The type import above still resolves
// because knowledge-check.ts re-exports the (erased) types.
import {
  isUsableKnowledgeCheckQuestion,
  MIN_KNOWLEDGE_CHECK_QUESTIONS,
  MAX_KNOWLEDGE_CHECK_QUESTIONS,
} from "@/lib/knowledge-check-shape";
import { courseKindContract } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

function goodQuestion(overrides: Partial<{ prompt: string }> = {}): KnowledgeCheckQuestion {
  return {
    prompt: overrides.prompt ?? "Which task is on the critical path in this table?",
    choices: [
      { text: "Site survey", correct: true, explanation: "" },
      {
        text: "Foundation pour",
        correct: false,
        explanation: "Chose the single longest task rather than the longest chain of dependent tasks.",
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

function validJson(questions: unknown[]): string {
  return JSON.stringify({ questions });
}

describe("isUsableKnowledgeCheckQuestion", () => {
  it("accepts a well-formed 4-choice question with exactly one correct answer and every distractor explained", () => {
    expect(isUsableKnowledgeCheckQuestion(goodQuestion())).toBe(true);
  });

  it("rejects an empty prompt", () => {
    expect(isUsableKnowledgeCheckQuestion({ ...goodQuestion(), prompt: "  " })).toBe(false);
  });

  it("rejects a question with only 3 choices", () => {
    const q = goodQuestion();
    expect(isUsableKnowledgeCheckQuestion({ ...q, choices: q.choices.slice(0, 3) })).toBe(false);
  });

  it("rejects a question with 5 choices", () => {
    const q = goodQuestion();
    expect(
      isUsableKnowledgeCheckQuestion({
        ...q,
        choices: [...q.choices, { text: "A fifth option", correct: false, explanation: "Another wrong reason." }],
      })
    ).toBe(false);
  });

  it("rejects a question with zero correct choices", () => {
    const q = goodQuestion();
    expect(
      isUsableKnowledgeCheckQuestion({
        ...q,
        choices: q.choices.map((c) => ({ ...c, correct: false })),
      })
    ).toBe(false);
  });

  it("rejects a question with two correct choices", () => {
    const q = goodQuestion();
    const choices = q.choices.map((c, i) => (i === 1 ? { ...c, correct: true } : c));
    expect(isUsableKnowledgeCheckQuestion({ ...q, choices })).toBe(false);
  });

  it("rejects a distractor with an empty explanation (Y2-AC1/AC4: every wrong answer needs one)", () => {
    const q = goodQuestion();
    const choices = q.choices.map((c, i) => (i === 1 ? { ...c, explanation: "" } : c));
    expect(isUsableKnowledgeCheckQuestion({ ...q, choices })).toBe(false);
  });

  it("rejects a distractor with a near-blank placeholder explanation ('Wrong.')", () => {
    const q = goodQuestion();
    const choices = q.choices.map((c, i) => (i === 1 ? { ...c, explanation: "Wrong." } : c));
    expect(isUsableKnowledgeCheckQuestion({ ...q, choices })).toBe(false);
  });

  it("rejects duplicate choice text (a repeated option is never a real distractor)", () => {
    const q = goodQuestion();
    const choices = q.choices.map((c, i) => (i === 1 ? { ...c, text: q.choices[0].text } : c));
    expect(isUsableKnowledgeCheckQuestion({ ...q, choices })).toBe(false);
  });

  it("rejects a choice with empty text", () => {
    const q = goodQuestion();
    const choices = q.choices.map((c, i) => (i === 2 ? { ...c, text: "  " } : c));
    expect(isUsableKnowledgeCheckQuestion({ ...q, choices })).toBe(false);
  });
});

describe("generateKnowledgeCheckAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: validJson([goodQuestion(), goodQuestion({ prompt: "A second, different question." })]),
    } as never);
  });

  it("errors when given no material to ground the check in", async () => {
    const result = await generateKnowledgeCheckAction("Week 1", "Topic", "");
    expect("error" in result).toBe(true);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns the parsed, usable questions on success", async () => {
    const result = await generateKnowledgeCheckAction("Week 1", "Critical Path", "This week's worked example...");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.questions).toHaveLength(2);
      expect(result.questions[0].choices).toHaveLength(4);
      expect(result.questions[0].choices.filter((c) => c.correct)).toHaveLength(1);
    }
  });

  it("composes the course-kind contract and PLAIN_LANGUAGE_CONTRACT verbatim", async () => {
    await generateKnowledgeCheckAction("Week 1", "Topic", "material", "gemini", "applied");
    const prompt = promptFromCall();
    expect(prompt).toContain(courseKindContract("applied"));
    expect(prompt).toContain(PLAIN_LANGUAGE_CONTRACT);
  });

  it("asks for between 5 and 8 questions, Apply/Analyze level, grounded in this week's material", async () => {
    await generateKnowledgeCheckAction("Week 3", "Critical Path", "material");
    const prompt = promptFromCall();
    expect(prompt).toContain(String(MIN_KNOWLEDGE_CHECK_QUESTIONS));
    expect(prompt).toContain(String(MAX_KNOWLEDGE_CHECK_QUESTIONS));
    expect(prompt).toMatch(/APPLY or ANALYZE/);
    expect(prompt).toContain("material");
  });

  it("tells the model distractors must be plausible and diagnostic, and to explain each one", async () => {
    await generateKnowledgeCheckAction("Week 1", "Topic", "material");
    const prompt = promptFromCall();
    expect(prompt).toMatch(/PLAUSIBLE and DIAGNOSTIC/);
    expect(prompt.toLowerCase()).toContain("misconception");
  });

  it("tells the model never to write a URL", async () => {
    await generateKnowledgeCheckAction("Week 1", "Topic", "material");
    const prompt = promptFromCall();
    expect(prompt).toMatch(/MUST NEVER write a URL/);
  });

  it("returns an error when the model response cannot be parsed as JSON", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, body: "", text: "not json at all" } as never);
    const result = await generateKnowledgeCheckAction("Week 1", "Topic", "material");
    expect("error" in result).toBe(true);
  });

  it("returns a descriptive HTTP error when the call fails", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: false, status: 500, body: "server exploded" } as never);
    const result = await generateKnowledgeCheckAction("Week 1", "Topic", "material");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("HTTP 500");
  });

  it("returns an error when the model responds 200 with empty text", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, body: "", text: "" } as never);
    const result = await generateKnowledgeCheckAction("Week 1", "Topic", "material");
    expect("error" in result).toBe(true);
  });

  it("drops a malformed question (wrong choice count) rather than failing the whole call, keeping the good ones", async () => {
    const bad = { ...goodQuestion(), prompt: "A malformed question", choices: goodQuestion().choices.slice(0, 2) };
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: validJson([goodQuestion(), bad]),
    } as never);
    const result = await generateKnowledgeCheckAction("Week 1", "Topic", "material");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].prompt).not.toBe("A malformed question");
    }
  });

  it("errors when every returned question is malformed (nothing usable survives sanitizing)", async () => {
    const bad = { ...goodQuestion(), choices: goodQuestion().choices.slice(0, 2) };
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: validJson([bad]),
    } as never);
    const result = await generateKnowledgeCheckAction("Week 1", "Topic", "material");
    expect("error" in result).toBe(true);
  });

  it("drops a question whose distractor has no explanation", async () => {
    const bad = goodQuestion({ prompt: "Missing explanation question" });
    bad.choices = bad.choices.map((c, i) => (i === 1 ? { ...c, explanation: "" } : c));
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: validJson([goodQuestion(), bad]),
    } as never);
    const result = await generateKnowledgeCheckAction("Week 1", "Topic", "material");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.questions.some((q) => q.prompt === "Missing explanation question")).toBe(false);
    }
  });

  it("deduplicates questions with the same prompt (case-insensitive), keeping only the first", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: validJson([goodQuestion(), goodQuestion({ prompt: goodQuestion().prompt.toUpperCase() })]),
    } as never);
    const result = await generateKnowledgeCheckAction("Week 1", "Topic", "material");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.questions).toHaveLength(1);
    }
  });

  it("caps at MAX_KNOWLEDGE_CHECK_QUESTIONS even when the model returns more", async () => {
    const many = Array.from({ length: MAX_KNOWLEDGE_CHECK_QUESTIONS + 5 }, (_, i) =>
      goodQuestion({ prompt: `Question number ${i}` })
    );
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: validJson(many),
    } as never);
    const result = await generateKnowledgeCheckAction("Week 1", "Topic", "material");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.questions.length).toBe(MAX_KNOWLEDGE_CHECK_QUESTIONS);
    }
  });

  it("never sends an explanation field for the correct choice, even if the model tries to smuggle one in", async () => {
    const q = goodQuestion();
    q.choices = q.choices.map((c) => (c.correct ? { ...c, explanation: "should be dropped" } : c)) as typeof q.choices;
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: validJson([q]),
    } as never);
    const result = await generateKnowledgeCheckAction("Week 1", "Topic", "material");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      const correctChoice = result.questions[0].choices.find((c) => c.correct);
      expect(correctChoice?.explanation).toBe("");
    }
  });

  describe("embedded provider", () => {
    const richMaterial = `
Critical Path Method (CPM) is a scheduling technique that identifies the longest sequence of dependent tasks.
The critical path determines the minimum project duration.
Slack is the amount of time a task can be delayed without affecting the finish date.
A dependency is a relationship where one task cannot start until another finishes.
Float is another term closely related to slack in project scheduling.
The network diagram shows every task and its dependencies visually.
`.repeat(2);

    it("never calls the model", async () => {
      await generateKnowledgeCheckAction("Week 1", "Topic", richMaterial, "embedded");
      expect(callLlm).not.toHaveBeenCalled();
    });

    it("only returns questions that pass the same usability check the LLM path enforces", async () => {
      const result = await generateKnowledgeCheckAction("Week 1", "Topic", richMaterial, "embedded");
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        for (const q of result.questions) {
          expect(isUsableKnowledgeCheckQuestion(q)).toBe(true);
        }
      }
    });
  });
});
