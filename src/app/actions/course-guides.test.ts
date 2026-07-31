import { describe, it, expect, vi, beforeEach } from "vitest";

// generateCourseFaqAction only calls callLlm for a non-embedded provider
// (same pattern as llm-content.test.ts / course-project.ts's own generator).
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { generateCourseFaqAction } from "./course-guides";
import { courseKindContract, APPLIED_REAL_TOOL_RULE } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

const VALID_FAQ_JSON = JSON.stringify([
  { question: "What does this course cover?", answer: "An overview of the material." },
  { question: "What tools do I need?", answer: "A laptop and an internet connection." },
]);

describe("generateCourseFaqAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: VALID_FAQ_JSON,
    } as never);
  });

  it("errors when given no course facts at all (nothing to ground the FAQ in)", async () => {
    const result = await generateCourseFaqAction("", "", "", []);
    expect("error" in result).toBe(true);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns the parsed question/answer pairs on success", async () => {
    const result = await generateCourseFaqAction("Course facts", "Week 1: Intro", "", []);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.pairs).toHaveLength(2);
      expect(result.pairs[0].question).toBe("What does this course cover?");
    }
  });

  it("composes the course-kind contract and PLAIN_LANGUAGE_CONTRACT verbatim", async () => {
    await generateCourseFaqAction("Course facts", "", "", [], "gemini", "applied");
    const prompt = promptFromCall();
    expect(prompt).toContain(courseKindContract("applied"));
    expect(prompt).toContain(PLAIN_LANGUAGE_CONTRACT);
  });

  it("includes the committed toolset and the real-tool/free-access rule when tools are committed", async () => {
    await generateCourseFaqAction("Course facts", "", "", ["Trello", "Miro"], "gemini", "applied");
    const prompt = promptFromCall();
    expect(prompt).toContain("Trello");
    expect(prompt).toContain("Miro");
    expect(prompt).toContain(APPLIED_REAL_TOOL_RULE);
  });

  it("tells the model never to write a URL", async () => {
    await generateCourseFaqAction("Course facts", "", "", []);
    const prompt = promptFromCall();
    expect(prompt).toMatch(/MUST NEVER write a URL/);
  });

  it("tells the model never to invent an unstated policy", async () => {
    await generateCourseFaqAction("Course facts", "", "", []);
    const prompt = promptFromCall();
    expect(prompt.toLowerCase()).toContain("never invent a policy");
  });

  it("returns an error when the model response cannot be parsed as JSON", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, body: "", text: "not json at all" } as never);
    const result = await generateCourseFaqAction("Course facts", "", "", []);
    expect("error" in result).toBe(true);
  });

  it("drops a pair missing a question or answer rather than failing the whole call", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify([
        { question: "Real question", answer: "Real answer" },
        { question: "", answer: "orphan answer" },
        { question: "orphan question", answer: "" },
      ]),
    } as never);
    const result = await generateCourseFaqAction("Course facts", "", "", []);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0].question).toBe("Real question");
    }
  });

  describe("embedded provider", () => {
    it("never calls the model and always returns usable pairs", async () => {
      const result = await generateCourseFaqAction("Course facts here", "Week 1: Intro", "Project brief", ["Trello"], "embedded");
      expect(callLlm).not.toHaveBeenCalled();
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.pairs.length).toBeGreaterThan(0);
      }
    });
  });
});
