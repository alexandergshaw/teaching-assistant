import { describe, it, expect, vi, beforeEach } from "vitest";

// generateInstructorNotesAction only calls callLlm for a non-embedded
// provider (same pattern as course-guides.test.ts's own mock).
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { generateInstructorNotesAction } from "./instructor-notes";
import { courseKindContract } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

const VALID_JSON = JSON.stringify({
  alternatives: [
    { tool: "Asana", freeAlternative: "Trello (free plan)", why: "Both offer kanban boards with a real free tier." },
  ],
  debugging: [
    {
      tool: "Asana",
      problems: [{ issue: "Notifications not arriving", solution: "Check the per-project notification settings." }],
    },
    {
      tool: "Trello (free plan)",
      problems: [{ issue: "Power-Ups locked", solution: "The free plan caps Power-Ups per board at one." }],
    },
  ],
});

describe("generateInstructorNotesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: VALID_JSON,
    } as never);
  });

  it("errors when given no tools at all (nothing to ground the notes in)", async () => {
    const result = await generateInstructorNotesAction("Sprint Planning", []);
    expect("error" in result).toBe(true);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns the parsed alternatives and debugging entries on success", async () => {
    const result = await generateInstructorNotesAction("Sprint Planning", ["Asana"]);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.alternatives).toHaveLength(1);
      expect(result.alternatives[0].tool).toBe("Asana");
      expect(result.alternatives[0].freeAlternative).toBe("Trello (free plan)");
      // Debugging covers BOTH the primary tool AND the named alternative.
      expect(result.debugging.map((d) => d.tool)).toEqual(["Asana", "Trello (free plan)"]);
    }
  });

  it("composes the course-kind contract and PLAIN_LANGUAGE_CONTRACT verbatim", async () => {
    await generateInstructorNotesAction("Sprint Planning", ["Asana"], "gemini", "applied");
    const prompt = promptFromCall();
    expect(prompt).toContain(courseKindContract("applied"));
    expect(prompt).toContain(PLAIN_LANGUAGE_CONTRACT);
  });

  it("names the caller-supplied tools in the prompt - never decides which tools to discuss itself", async () => {
    await generateInstructorNotesAction("Sprint Planning", ["Asana", "Google Sheets"]);
    const prompt = promptFromCall();
    expect(prompt).toContain("Asana");
    expect(prompt).toContain("Google Sheets");
  });

  it("instructs the model to cover the free alternatives in the debugging section too", async () => {
    await generateInstructorNotesAction("Sprint Planning", ["Asana"]);
    const prompt = promptFromCall();
    expect(prompt.toLowerCase()).toContain("both the original tools and every free alternative");
  });

  it("instructs the model never to invent a tool that does not exist", async () => {
    await generateInstructorNotesAction("Sprint Planning", ["Asana"]);
    const prompt = promptFromCall();
    expect(prompt.toLowerCase()).toContain("never invent a tool");
  });

  it("tells the model never to write a URL", async () => {
    await generateInstructorNotesAction("Sprint Planning", ["Asana"]);
    const prompt = promptFromCall();
    expect(prompt).toMatch(/MUST NEVER write a URL/);
  });

  it("drops an alternatives entry missing a tool or freeAlternative rather than failing the whole call", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify({
        alternatives: [
          { tool: "Asana", freeAlternative: "Trello (free plan)", why: "..." },
          { tool: "", freeAlternative: "orphan" },
          { tool: "orphan", freeAlternative: "" },
        ],
        debugging: [{ tool: "Asana", problems: [{ issue: "x", solution: "y" }] }],
      }),
    } as never);
    const result = await generateInstructorNotesAction("Topic", ["Asana"]);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.alternatives).toHaveLength(1);
      expect(result.alternatives[0].tool).toBe("Asana");
    }
  });

  it("drops a debugging problem missing an issue or solution rather than failing the whole call", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify({
        alternatives: [{ tool: "Asana", freeAlternative: "Trello (free plan)", why: "..." }],
        debugging: [
          {
            tool: "Asana",
            problems: [
              { issue: "Real issue", solution: "Real solution" },
              { issue: "", solution: "orphan" },
              { issue: "orphan", solution: "" },
            ],
          },
        ],
      }),
    } as never);
    const result = await generateInstructorNotesAction("Topic", ["Asana"]);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.debugging).toHaveLength(1);
      expect(result.debugging[0].problems).toHaveLength(1);
      expect(result.debugging[0].problems[0].issue).toBe("Real issue");
    }
  });

  it("returns an error when the model response cannot be parsed as JSON", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, body: "", text: "not json at all" } as never);
    const result = await generateInstructorNotesAction("Topic", ["Asana"]);
    expect("error" in result).toBe(true);
  });

  it("returns an error when the model returns nothing usable in either section", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify({ alternatives: [], debugging: [] }),
    } as never);
    const result = await generateInstructorNotesAction("Topic", ["Asana"]);
    expect("error" in result).toBe(true);
  });

  it("returns an error when the model call fails", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: false, status: 500, body: "boom", text: "" } as never);
    const result = await generateInstructorNotesAction("Topic", ["Asana"]);
    expect("error" in result).toBe(true);
  });

  describe("embedded provider", () => {
    it("never calls the model and degrades to an honest empty result rather than inventing software names", async () => {
      const result = await generateInstructorNotesAction("Sprint Planning", ["Asana"], "embedded");
      expect(callLlm).not.toHaveBeenCalled();
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.alternatives).toEqual([]);
        expect(result.debugging).toEqual([]);
      }
    });
  });
});
