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
import { generateLectureQaAction, generateLectureFromMaterialsAction } from "./course-planning";
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

// generateLectureFromMaterialsAction is one of the three deck-prompt builders
// (course-planning.ts, course-planning-grounding.ts, shared.ts) that used to
// hardcode the coding-only SLIDE_STRUCTURE_REQUIREMENTS/SLIDE_DECK_JSON_SHAPE
// regardless of courseKind - the root cause of an applied (no-code) course
// receiving Python-filled decks. It is reached only from the "prepare-lecture"
// workflow step (steps.content-lectures.ts), which previously had no
// courseKind input at all.
describe("generateLectureFromMaterialsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  const deckResponse = (slides: Array<Record<string, unknown>>) =>
    JSON.stringify({ presentationTitle: "T", slides, announcement: "Come to class." });

  function promptFromCall(callIndex = 0): string {
    const call = vi.mocked(callLlm).mock.calls[callIndex][0];
    const part = call.contents[0].parts[0];
    return "text" in part ? part.text : "";
  }

  it("an applied course's prompt carries the applied contract and not the coding one", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: deckResponse([{ title: "Principle: Scope", bullets: ["b"], notes: "n" }]),
    });

    const result = await generateLectureFromMaterialsAction(
      "MGT 422",
      "Week 1",
      "materials",
      "gemini",
      "applied"
    );
    expect("error" in result).toBe(false);

    const prompt = promptFromCall();
    // The applied contract: NOT a programming course, and the six-slide cycle.
    expect(prompt).toContain("NOT a programming course");
    expect(prompt).toContain("Principle:");
    expect(prompt).toContain("Your Turn:");
    // The coding-only cycle must be absent.
    expect(prompt).not.toContain("Walkthrough:");
    expect(prompt).not.toContain('"codeLanguage": "python"');
  });

  it("a coding course's prompt still carries the coding contract (unchanged default)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: deckResponse([{ title: "Example: loops", bullets: ["b"], code: "for x in y: pass", codeLanguage: "python" }]),
    });

    const result = await generateLectureFromMaterialsAction(
      "CS 101",
      "Week 1",
      "materials",
      "gemini",
      "coding"
    );
    expect("error" in result).toBe(false);

    const prompt = promptFromCall();
    expect(prompt).toContain("Walkthrough:");
    expect(prompt).toContain('"codeLanguage": "python"');
    expect(prompt).not.toContain("NOT a programming course");
  });

  it("defaults courseKind to 'coding' when omitted, so the pre-existing call site is unchanged", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: deckResponse([{ title: "Example: loops", bullets: ["b"] }]),
    });

    // No courseKind argument - mirrors the call site before this fix.
    const result = await generateLectureFromMaterialsAction("CS 101", "Week 1", "materials", "gemini");
    expect("error" in result).toBe(false);

    const prompt = promptFromCall();
    expect(prompt).toContain("Walkthrough:");
  });

  // AC2 guard: even if the model ignores the applied prompt and returns code
  // anyway, the shipped slides must never carry it.
  it("strips code from an applied deck's slides even if the model returns some, and reports it", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: deckResponse([
        { title: "Principle: Scope", bullets: ["b"], notes: "n" },
        { title: "Example: rogue code", bullets: ["b"], code: "print('leak')", codeLanguage: "python" },
      ]),
    });

    const result = await generateLectureFromMaterialsAction(
      "MGT 422",
      "Week 1",
      "materials",
      "gemini",
      "applied"
    );
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.slides.some((s) => s.code !== undefined)).toBe(false);
    expect(result.slides.some((s) => s.codeLanguage !== undefined)).toBe(false);
    expect(result.codeStripped).toBe(1);
  });

  it("a clean applied deck reports no code stripped", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: deckResponse([{ title: "Principle: Scope", bullets: ["b"], notes: "n" }]),
    });

    const result = await generateLectureFromMaterialsAction(
      "MGT 422",
      "Week 1",
      "materials",
      "gemini",
      "applied"
    );
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.codeStripped).toBeUndefined();
  });

  // RCA18 (RCA round 4): this is the SECOND reachable builder of the applied
  // prompt - generateSlidesFromTopic (course-planning-grounding.ts) builds a
  // CONCEPT PLAN, a LECTURE DURATION line, and week context (PRIOR WEEKS/
  // NEXT WEEK) before appending the shared contract; this action never
  // builds any of the three. This is an end-to-end proof (the ACTUAL prompt
  // this action sends, not just the static contract checked in isolation)
  // that the five rules naming that data still degrade gracefully here
  // rather than silently assuming a plan, a duration, or a next week that
  // never arrives.
  it("RCA18: the prompt carries no CONCEPT PLAN/LECTURE DURATION/week-context data, but the applied contract's rules that name them still carry their absent-data clauses", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: deckResponse([{ title: "Principle: Scope", bullets: ["b"], notes: "n" }]),
    });

    const result = await generateLectureFromMaterialsAction(
      "MGT 422",
      "Week 1",
      "materials",
      "gemini",
      "applied"
    );
    expect("error" in result).toBe(false);

    const prompt = promptFromCall();
    // This builder never supplies any of the three - the defect RCA18 found.
    expect(prompt).not.toContain("CONCEPT PLAN:");
    expect(prompt).not.toContain("LECTURE DURATION:");
    expect(prompt).not.toContain("THIS IS WEEK");
    expect(prompt).not.toContain("PRIOR WEEKS");

    // The shared contract's rules still degrade instead of assuming that
    // data exists.
    expect(prompt).toContain("Absent a CONCEPT PLAN");
    expect(prompt).toContain("Absent a stated LECTURE DURATION or CONCEPT PLAN");
    expect(prompt).toContain("omit this slide entirely");
    expect(prompt).toContain("Absent any information about which week this is");
  });
});
