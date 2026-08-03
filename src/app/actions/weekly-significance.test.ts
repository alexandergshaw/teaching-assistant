import { describe, it, expect, vi, beforeEach } from "vitest";

// generateWeekSignificanceAction only calls callLlm for a non-embedded
// provider (same pattern as course-guides.test.ts's own mock).
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { generateWeekSignificanceAction } from "./weekly-significance";
import { courseKindContract } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";
import type { CaseStudyAssignment } from "@/lib/case-study-prompt";

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

const CASE_STUDY: CaseStudyAssignment = {
  organization: "Denver International Airport",
  period: "the early 1990s",
  hook: "Its automated baggage system failed spectacularly, delaying the airport's opening by 16 months.",
};

describe("generateWeekSignificanceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: "# Why This Matters\n\nDenver International Airport's baggage system is a cautionary tale.",
    } as never);
  });

  it("errors when given no topic at all (nothing to ground the document in)", async () => {
    const result = await generateWeekSignificanceAction("", "", CASE_STUDY);
    expect("error" in result).toBe(true);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns the model's text on success", async () => {
    const result = await generateWeekSignificanceAction("Project Risk Management", "", CASE_STUDY);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.text).toContain("Denver International Airport");
    }
  });

  it("composes the course-kind contract and PLAIN_LANGUAGE_CONTRACT verbatim", async () => {
    await generateWeekSignificanceAction("Project Risk Management", "", CASE_STUDY, "gemini", "applied");
    const prompt = promptFromCall();
    expect(prompt).toContain(courseKindContract("applied"));
    expect(prompt).toContain(PLAIN_LANGUAGE_CONTRACT);
  });

  it("names the exact assigned case study - organization, period, and hook - in the prompt", async () => {
    await generateWeekSignificanceAction("Project Risk Management", "", CASE_STUDY);
    const prompt = promptFromCall();
    expect(prompt).toContain("Denver International Airport");
    expect(prompt).toContain("the early 1990s");
    expect(prompt).toContain("Its automated baggage system failed spectacularly");
  });

  it("instructs the model to build on the case study, never substitute a different one", async () => {
    await generateWeekSignificanceAction("Project Risk Management", "", CASE_STUDY);
    const prompt = promptFromCall();
    expect(prompt.toLowerCase()).toContain("never substitute a different organization or event");
  });

  it("omits a precise-year instruction when no period was given, instead of inventing one", async () => {
    const noPeriod: CaseStudyAssignment = { organization: "Acme Corp", hook: "Something happened." };
    await generateWeekSignificanceAction("Topic", "", noPeriod);
    const prompt = promptFromCall();
    expect(prompt).toContain("not established with confidence");
  });

  it("tells the model never to write a URL", async () => {
    await generateWeekSignificanceAction("Project Risk Management", "", CASE_STUDY);
    const prompt = promptFromCall();
    expect(prompt).toMatch(/MUST NEVER write a URL/);
  });

  it("strips a URL the model wrote anyway from the returned text", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: "# Why This Matters\n\nSee https://example.com/fabricated for more.",
    } as never);
    const result = await generateWeekSignificanceAction("Topic", "", CASE_STUDY);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.text).not.toContain("https://example.com/fabricated");
    }
  });

  it("returns an error when the model call fails", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: false, status: 500, body: "boom", text: "" } as never);
    const result = await generateWeekSignificanceAction("Topic", "", CASE_STUDY);
    expect("error" in result).toBe(true);
  });

  it("returns an error when the model returns empty text", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, body: "", text: "" } as never);
    const result = await generateWeekSignificanceAction("Topic", "", CASE_STUDY);
    expect("error" in result).toBe(true);
  });

  describe("embedded provider", () => {
    it("never calls the model and returns text built only from the case study's own facts", async () => {
      const result = await generateWeekSignificanceAction("Project Risk Management", "", CASE_STUDY, "embedded");
      expect(callLlm).not.toHaveBeenCalled();
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.text).toContain("Denver International Airport");
        expect(result.text).toContain("Its automated baggage system failed spectacularly");
      }
    });
  });
});
