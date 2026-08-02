import { describe, it, expect, vi, beforeEach } from "vitest";

// deriveTocFromSource calls requireOwner() (auth) and callLlm() (network) -
// both are mocked so the derivation logic itself (parsing, source dedup,
// null-on-failure) runs for real without needing a Supabase session or
// hitting the Gemini API.
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
import { deriveTocFromSource } from "./course-planning-grounding";
import { selectCourseTools } from "./course-tools-selection";

describe("deriveTocFromSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  it("returns the toc, chapters, and deduped sources on a parseable response", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      text: "Module 1: Introduction\nModule 2: Footprinting\nModule 3: Scanning Networks",
      sources: [
        { title: "uCertify CEH v12", uri: "https://example.com/toc" },
        { title: "uCertify CEH v12 (dup)", uri: "https://example.com/toc" },
        { title: "EC-Council exam blueprint", uri: "https://example.com/blueprint" },
      ],
    });

    const result = await deriveTocFromSource(
      "https://www.ucertify.com/app/?func=load_course&course=CEH-v12.AE1",
      "gemini"
    );

    expect(result).not.toBeNull();
    expect(result!.chapters).toHaveLength(3);
    expect(result!.toc).toContain("Module 1: Introduction");
    // The duplicate uri is dropped; the first-seen title wins.
    expect(result!.sources).toEqual([
      { title: "uCertify CEH v12", uri: "https://example.com/toc" },
      { title: "EC-Council exam blueprint", uri: "https://example.com/blueprint" },
    ]);

    expect(callLlm).toHaveBeenCalledWith(
      expect.objectContaining({ webSearch: true }),
      "gemini"
    );
  });

  it("returns null when the response has no parseable chapters", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      text: "Sorry, I could not find a table of contents for that source.",
      sources: [],
    });

    const result = await deriveTocFromSource("https://example.com/mystery-course", "gemini");
    expect(result).toBeNull();
  });

  it("returns null when the LLM call fails", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: false, status: 500, body: "server error" });

    const result = await deriveTocFromSource("https://example.com/some-course", "gemini");
    expect(result).toBeNull();
  });

  it("returns null for blank source material without calling the LLM", async () => {
    const result = await deriveTocFromSource("   ", "gemini");
    expect(result).toBeNull();
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("never throws - a rejected auth check degrades to null", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized."));

    const result = await deriveTocFromSource("https://example.com/some-course", "gemini");
    expect(result).toBeNull();
  });

  it("never throws - an unexpected callLlm rejection degrades to null", async () => {
    vi.mocked(callLlm).mockRejectedValueOnce(new Error("network down"));

    const result = await deriveTocFromSource("https://example.com/some-course", "gemini");
    expect(result).toBeNull();
  });
});

// Y8-AC1/AC2/AC3: the CORE toolset selection prompt - a real 16-week course
// used a spreadsheet in 14 of 16 weeks because the pre-Y8 prompt asked 1-3
// tools to TOGETHER "cover every kind of hands-on work this course's weeks
// will need", which collapses onto the most generic tools available. These
// pin the prompt's substance directly (never tested before this fix - the
// function had no dedicated test file coverage of its own prompt text).
describe("selectCourseTools (Y8: CORE toolset prompt)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function promptFromCall(): string {
    const part = vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0];
    return "text" in part ? part.text : "";
  }

  it("asks for a CORE set of 2 to 3 tools, not the old 1-to-3 phrasing", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: '{"tools": ["Trello (free plan)"]}' });

    await selectCourseTools("A PM course", "Week 1: Intro\nWeek 2: Scheduling", "gemini");

    const prompt = promptFromCall();
    expect(prompt).toContain("CORE");
    expect(prompt).toContain("2 to 3");
    expect(prompt).not.toContain("1 to 3");
  });

  it("states the CORE set holds persistent project data and must not try to cover every kind of work", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: '{"tools": ["Trello (free plan)"]}' });

    await selectCourseTools("A PM course", "Week 1: Intro", "gemini");

    const prompt = promptFromCall();
    expect(prompt.toLowerCase()).toContain("persistent project data");
    expect(prompt).toContain("Do NOT try to make this small CORE set cover every kind of work");
  });

  it("names AC3's specialist categories as examples of what a later week may introduce on its own", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: '{"tools": ["Trello (free plan)"]}' });

    await selectCourseTools("A PM course", "Week 1: Intro", "gemini");

    const prompt = promptFromCall();
    for (const category of ["scheduling/Gantt tool", "diagramming tool", "survey tool", "dashboard/reporting tool"]) {
      expect(prompt, `mentions "${category}"`).toContain(category);
    }
  });

  it("still requires the produced-in/exported test for a later week's specialist tool", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: '{"tools": ["Trello (free plan)"]}' });

    await selectCourseTools("A PM course", "Week 1: Intro", "gemini");

    const prompt = promptFromCall();
    expect(prompt).toContain("exported as a file, screenshot, or link");
    expect(prompt).toContain("new home for data the student has to keep maintaining");
  });

  it("still returns the parsed tool list unchanged - only the prompt text changed", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      text: '{"tools": ["Trello (free plan)", "Excel (free trial)"]}',
    });

    const tools = await selectCourseTools("A PM course", "Week 1: Intro", "gemini");
    expect(tools).toEqual(["Trello (free plan)", "Excel (free trial)"]);
  });

  it("never calls the LLM for the embedded provider", async () => {
    const tools = await selectCourseTools("A PM course", "Week 1: Intro", "embedded");
    expect(tools).toEqual([]);
    expect(callLlm).not.toHaveBeenCalled();
  });
});
