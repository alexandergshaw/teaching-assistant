import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { fillMissingGraphics } from "./slide-graphics-repair";
import type { SlideData } from "../actions-types";
import type { SlideGraphicGap } from "@/lib/slide-graphics";

const validMatrixRaw = () => ({
  kind: "matrix2x2",
  xAxisLabel: "Interest",
  yAxisLabel: "Power",
  quadrants: {
    topLeft: { label: "Keep Satisfied", items: ["Finance"] },
    topRight: { label: "Manage Closely", items: ["Sponsor"] },
    bottomLeft: { label: "Monitor", items: [] },
    bottomRight: { label: "Keep Informed", items: ["End Users"] },
  },
});

describe("fillMissingGraphics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the slides unchanged when there are no gaps", async () => {
    const slides: SlideData[] = [{ title: "Principle: risk", bullets: ["b"] }];
    const result = await fillMissingGraphics(slides, [], "gemini");
    expect(result).toBe(slides);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns the slides unchanged for the embedded provider without calling the LLM", async () => {
    const slides: SlideData[] = [{ title: "Artifact: a register", bullets: ["b"] }];
    const gaps: SlideGraphicGap[] = [{ index: 0, title: "Artifact: a register" }];
    const result = await fillMissingGraphics(slides, gaps, "embedded");
    expect(result).toBe(slides);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("fills in a valid repaired graphic on the exact slide named by the gap", async () => {
    const slides: SlideData[] = [
      { title: "Principle: risk", bullets: ["b"] },
      { title: "Artifact: a stakeholder register", bullets: ["Name", "Interest", "Power"] },
    ];
    const gaps: SlideGraphicGap[] = [{ index: 1, title: "Artifact: a stakeholder register" }];

    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      text: JSON.stringify({ graphics: [{ index: 1, graphic: validMatrixRaw() }] }),
    });

    const result = await fillMissingGraphics(slides, gaps, "gemini");
    expect(result).not.toBe(slides);
    expect(result[0]).toEqual(slides[0]);
    expect(result[1].graphic).toEqual(validMatrixRaw());
    // Every other field on the repaired slide survives untouched.
    expect(result[1].title).toBe("Artifact: a stakeholder register");
    expect(result[1].bullets).toEqual(["Name", "Interest", "Power"]);
  });

  it("degrades to leaving the slide unrepaired when the repair itself is malformed", async () => {
    const slides: SlideData[] = [{ title: "Judgment Call: cost vs schedule", bullets: ["b"] }];
    const gaps: SlideGraphicGap[] = [{ index: 0, title: "Judgment Call: cost vs schedule" }];

    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      text: JSON.stringify({ graphics: [{ index: 1, graphic: { kind: "barChart", data: [1, 2, 3] } }] }),
    });

    const result = await fillMissingGraphics(slides, gaps, "gemini");
    expect(result[0].graphic).toBeUndefined();
  });

  it("never throws when the LLM call fails - the deck ships exactly as it was handed in", async () => {
    const slides: SlideData[] = [{ title: "Agenda: this week", bullets: ["b"] }];
    const gaps: SlideGraphicGap[] = [{ index: 0, title: "Agenda: this week" }];

    vi.mocked(callLlm).mockResolvedValue({ ok: false, status: 500, body: "server error" });

    const result = await fillMissingGraphics(slides, gaps, "gemini");
    expect(result).toBe(slides);
  });

  it("never throws when the LLM response is not parseable JSON", async () => {
    const slides: SlideData[] = [{ title: "Artifact: a register", bullets: ["b"] }];
    const gaps: SlideGraphicGap[] = [{ index: 0, title: "Artifact: a register" }];

    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "Sorry, I cannot help with that." });

    const result = await fillMissingGraphics(slides, gaps, "gemini");
    expect(result).toBe(slides);
  });

  it("never throws when callLlm itself rejects", async () => {
    const slides: SlideData[] = [{ title: "Artifact: a register", bullets: ["b"] }];
    const gaps: SlideGraphicGap[] = [{ index: 0, title: "Artifact: a register" }];

    vi.mocked(callLlm).mockRejectedValueOnce(new Error("network down"));

    const result = await fillMissingGraphics(slides, gaps, "gemini");
    expect(result).toBe(slides);
  });

  it("ignores a gap index that no longer resolves to a real slide", async () => {
    const slides: SlideData[] = [{ title: "Artifact: a register", bullets: ["b"] }];
    const gaps: SlideGraphicGap[] = [{ index: 5, title: "stale gap" }];

    const result = await fillMissingGraphics(slides, gaps, "gemini");
    expect(result).toBe(slides);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("repairs multiple gaps independently, one graphic per named slide", async () => {
    const slides: SlideData[] = [
      { title: "Agenda: this week", bullets: ["b"] },
      { title: "Principle: risk", bullets: ["b"] },
      { title: "Artifact: a register", bullets: ["b"] },
    ];
    const gaps: SlideGraphicGap[] = [
      { index: 0, title: "Agenda: this week" },
      { index: 2, title: "Artifact: a register" },
    ];

    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        graphics: [
          { index: 1, graphic: { kind: "process", steps: [{ label: "A" }, { label: "B" }, { label: "C" }] } },
          { index: 2, graphic: validMatrixRaw() },
        ],
      }),
    });

    const result = await fillMissingGraphics(slides, gaps, "gemini");
    expect(result[0].graphic?.kind).toBe("process");
    expect(result[1].graphic).toBeUndefined();
    expect(result[2].graphic?.kind).toBe("matrix2x2");
  });

  // One repair call covers EVERY gap in a deck with no cap on how many, under a
  // fixed 4096-token output budget, so a long response can be cut off partway
  // through the graphics array. jsonObjectSlice then slices to the last "}" it
  // can see, which lands mid-array and leaves unbalanced JSON, JSON.parse
  // throws, and the catch returns the ORIGINAL slides - discarding the
  // graphics that arrived complete and correct along with the one that got
  // truncated. Losing the truncated graphic is unavoidable; losing the ones
  // that parsed is not, and it happens with nothing logged.
  it("keeps the repairs that arrived complete when the response is truncated mid-array", async () => {
    const slides: SlideData[] = [
      { title: "Artifact: the change log", bullets: ["b"] },
      { title: "Artifact: the project charter", bullets: ["b"] },
    ];
    const gaps: SlideGraphicGap[] = [
      { index: 0, title: "Artifact: the change log" },
      { index: 1, title: "Artifact: the project charter" },
    ];

    // The first graphic is whole; the second is cut off by the token budget.
    const truncated =
      '{"graphics":[' +
      '{"index":1,"graphic":{"kind":"process","steps":[{"label":"Draft"},{"label":"Review"},{"label":"Approve"}]}},' +
      '{"index":2,"graphic":{"kind":"table","headers":["Field","Why it exists"],"rows":[["Scope",';

    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: truncated });

    const result = await fillMissingGraphics(slides, gaps, "gemini");

    expect(
      result[0].graphic?.kind,
      "a complete, valid repair must not be thrown away because a LATER one was truncated"
    ).toBe("process");
    // The truncated one legitimately stays unrepaired.
    expect(result[1].graphic).toBeUndefined();
  });

  // Same defect as above, but with three gaps and the cutoff landing after
  // the second entry - proves the salvage keeps EVERY complete entry that
  // arrived before the cutoff, not just a single leading one.
  it("salvages every complete repair before the cutoff, not just the first", async () => {
    const slides: SlideData[] = [
      { title: "Artifact: one", bullets: ["b"] },
      { title: "Artifact: two", bullets: ["b"] },
      { title: "Artifact: three", bullets: ["b"] },
    ];
    const gaps: SlideGraphicGap[] = [
      { index: 0, title: "Artifact: one" },
      { index: 1, title: "Artifact: two" },
      { index: 2, title: "Artifact: three" },
    ];

    const truncated =
      '{"graphics":[' +
      '{"index":1,"graphic":{"kind":"process","steps":[{"label":"A"},{"label":"B"},{"label":"C"}]}},' +
      '{"index":2,"graphic":{"kind":"process","steps":[{"label":"D"},{"label":"E"},{"label":"F"}]}},' +
      '{"index":3,"graphic":{"kind":"table","headers":["H"],"rows":[["cut off here';

    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: truncated });

    const result = await fillMissingGraphics(slides, gaps, "gemini");

    expect(result[0].graphic?.kind).toBe("process");
    expect(result[1].graphic?.kind).toBe("process");
    expect(result[2].graphic).toBeUndefined();
  });

  // The response can also be cut off before even the FIRST entry finishes -
  // there is nothing to salvage, so this must degrade exactly like the
  // pre-existing "unparseable response" case: the original slides, untouched.
  it("returns the original slides unchanged when the response is truncated before even one entry completes", async () => {
    const slides: SlideData[] = [{ title: "Artifact: the change log", bullets: ["b"] }];
    const gaps: SlideGraphicGap[] = [{ index: 0, title: "Artifact: the change log" }];

    const truncated = '{"graphics":[{"index":1,"graphic":{"kind":"table","headers":["Field"';

    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: truncated });

    const result = await fillMissingGraphics(slides, gaps, "gemini");
    expect(result).toBe(slides);
  });
});
