import { describe, it, expect, vi, beforeEach } from "vitest";

// generateLectureQaAction calls requireOwner() (auth) and callLlm() (network) -
// both are mocked so the prompt-building, JSON parsing, and example-programs
// gating logic runs for real without needing a Supabase session or hitting
// the Gemini API.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { generateLectureQaAction } from "./course-planning";
import { buildExampleProgramsDocLines } from "@/lib/lecture-qa";

const questionsOnly = (count = 12) => ({
  questions: Array.from({ length: count }, (_, i) => ({
    question: `Question ${i + 1}?`,
    answer: `Answer ${i + 1}.`,
  })),
});

const exampleFixture = (title: string, language = "python") => ({
  title,
  language,
  code: `print("${title}")`,
  explanation: `Demonstrates ${title}.`,
});

describe("generateLectureQaAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  it("a coding course whose model returns 3 examples yields 3", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        ...questionsOnly(),
        examples: [exampleFixture("One"), exampleFixture("Two"), exampleFixture("Three")],
      }),
    });

    const result = await generateLectureQaAction("Intro to CS", "Loops", "materials", [], "gemini", "coding");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.questions.length).toBe(12);
    expect(result.examples).toHaveLength(3);
    expect(result.examples!.map((e) => e.title)).toEqual(["One", "Two", "Three"]);
  });

  it("a returned list of 5 examples clamps to 3", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        ...questionsOnly(),
        examples: [
          exampleFixture("One"),
          exampleFixture("Two"),
          exampleFixture("Three"),
          exampleFixture("Four"),
          exampleFixture("Five"),
        ],
      }),
    });

    const result = await generateLectureQaAction("Intro to CS", "Loops", "materials", [], "gemini", "coding");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.examples).toHaveLength(3);
  });

  it("drops entries with empty code", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        ...questionsOnly(),
        examples: [exampleFixture("Good"), { title: "Bad", language: "python", code: "", explanation: "" }],
      }),
    });

    const result = await generateLectureQaAction("Intro to CS", "Loops", "materials", [], "gemini", "coding");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.examples).toHaveLength(1);
    expect(result.examples![0].title).toBe("Good");
  });

  it("a malformed examples value yields [] and the questions still come back", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ ...questionsOnly(), examples: "not an array" }),
    });

    const result = await generateLectureQaAction("Intro to CS", "Loops", "materials", [], "gemini", "coding");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.questions.length).toBe(12);
    expect(result.examples).toEqual([]);
  });

  it("an applied course's prompt contains no request for code and its result carries no examples", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify(questionsOnly()),
    });

    const result = await generateLectureQaAction("Business Ethics", "Case Studies", "materials", [], "gemini", "applied");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.examples ?? []).toEqual([]);

    const promptText = vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0];
    const prompt = "text" in promptText ? promptText.text : "";
    expect(prompt.toLowerCase()).not.toContain("example programs");
    expect(prompt.toLowerCase()).not.toContain("runnable");
  });

  it("an applied course ignores an examples array even if the model sends one back", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ ...questionsOnly(), examples: [exampleFixture("Sneaky")] }),
    });

    const result = await generateLectureQaAction("Business Ethics", "Case Studies", "materials", [], "gemini", "applied");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.examples ?? []).toEqual([]);

    // End to end: feeding this applied-course result into the same doc-lines
    // builder the step uses produces no fence at all - not merely an empty
    // heading, no ``` marker anywhere in the document markdown.
    const docLines = buildExampleProgramsDocLines(result.examples ?? []);
    expect(docLines).toEqual([]);
    expect(docLines.some((l) => l.startsWith("```"))).toBe(false);
  });

  it("a coding course with usable examples renders a document fence tagged with the language", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ ...questionsOnly(), examples: [exampleFixture("Loops", "python")] }),
    });

    const result = await generateLectureQaAction("Intro to CS", "Loops", "materials", [], "gemini", "coding");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    const docLines = buildExampleProgramsDocLines(result.examples ?? []);
    expect(docLines).toContain("```python");
    expect(docLines.some((l) => l === "```")).toBe(true);
  });

  it("a coding course's prompt requests example programs", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ ...questionsOnly(), examples: [exampleFixture("One")] }),
    });

    await generateLectureQaAction("Intro to CS", "Loops", "materials", [], "gemini", "coding");

    const promptText = vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0];
    const prompt = "text" in promptText ? promptText.text : "";
    expect(prompt.toLowerCase()).toContain("example programs");
    expect(prompt).toContain("COMPLETE, RUNNABLE");
  });

  it("the embedded branch returns no examples and makes no LLM call", async () => {
    const result = await generateLectureQaAction(
      "Intro to CS",
      "Loops",
      "# Loops\n# Conditionals\n# Functions",
      [],
      "embedded",
      "coding"
    );
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.examples).toBeUndefined();
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("defaults courseKind to 'coding' when omitted, so existing callers are unchanged", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ ...questionsOnly(), examples: [exampleFixture("One")] }),
    });

    // No courseKind argument passed - mirrors every pre-existing call site.
    const result = await generateLectureQaAction("Intro to CS", "Loops", "materials", [], "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.examples).toHaveLength(1);
  });
});
