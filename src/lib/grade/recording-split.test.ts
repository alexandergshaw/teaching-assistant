import { describe, it, expect } from "vitest";
import { buildRecordingSplitPrompt, parseRecordingSplit, MAX_SEGMENT_LABEL_CHARS } from "./recording-split";

describe("parseRecordingSplit: frozen cases", () => {
  it("a clean single answer is a confident single", () => {
    expect(parseRecordingSplit('{"kind":"single"}')).toEqual({ split: { kind: "single" }, confident: true });
  });

  it("a clean multiple answer carries its segments in order", () => {
    const text = JSON.stringify({
      kind: "multiple",
      segments: [
        { startSec: 0, endSec: 90, label: "Alice" },
        { startSec: 95, endSec: 200, label: "Bob" },
      ],
    });
    expect(parseRecordingSplit(text)).toEqual({
      split: {
        kind: "multiple",
        segments: [
          { startSec: 0, endSec: 90, label: "Alice" },
          { startSec: 95, endSec: 200, label: "Bob" },
        ],
      },
      confident: true,
    });
  });

  it("tolerates a code fence and prose around the object", () => {
    expect(parseRecordingSplit('```json\n{"kind":"single"}\n```').split).toEqual({ kind: "single" });
    expect(parseRecordingSplit('Sure. {"kind":"single"} done').confident).toBe(true);
  });

  it("sorts out-of-order segments", () => {
    const text = JSON.stringify({
      kind: "multiple",
      segments: [
        { startSec: 100, endSec: 150, label: "B" },
        { startSec: 0, endSec: 50, label: "A" },
      ],
    });
    const out = parseRecordingSplit(text);
    expect(out.split.kind === "multiple" && out.split.segments.map((s) => s.label)).toEqual(["A", "B"]);
  });

  it("clips long labels and fills empty ones", () => {
    const text = JSON.stringify({
      kind: "multiple",
      segments: [
        { startSec: 0, endSec: 10, label: "x".repeat(500) },
        { startSec: 10, endSec: 20, label: "  " },
      ],
    });
    const out = parseRecordingSplit(text);
    if (out.split.kind !== "multiple") throw new Error("expected multiple");
    expect(out.split.segments[0].label).toHaveLength(MAX_SEGMENT_LABEL_CHARS);
    expect(out.split.segments[1].label).toBe("Segment 2");
  });
});

describe("parseRecordingSplit: fail-safe collapse to single", () => {
  const unconfidentSingle = { split: { kind: "single" }, confident: false };

  it.each([
    ["garbage text", "I think maybe two people?"],
    ["empty string", ""],
    ["a JSON array", "[1,2]"],
    ["an unknown kind", '{"kind":"several"}'],
    ["multiple without segments", '{"kind":"multiple"}'],
    ["multiple with one segment", '{"kind":"multiple","segments":[{"startSec":0,"endSec":5,"label":"a"}]}'],
    [
      "overlapping segments",
      '{"kind":"multiple","segments":[{"startSec":0,"endSec":50,"label":"a"},{"startSec":40,"endSec":90,"label":"b"}]}',
    ],
    [
      "a negative start",
      '{"kind":"multiple","segments":[{"startSec":-1,"endSec":5,"label":"a"},{"startSec":6,"endSec":9,"label":"b"}]}',
    ],
    [
      "an end before its start",
      '{"kind":"multiple","segments":[{"startSec":10,"endSec":5,"label":"a"},{"startSec":20,"endSec":30,"label":"b"}]}',
    ],
    [
      "one bad segment among good ones",
      '{"kind":"multiple","segments":[{"startSec":0,"endSec":5,"label":"a"},{"startSec":"x","endSec":9},{"startSec":20,"endSec":30,"label":"c"}]}',
    ],
  ])("%s -> single, not confident", (_name, text) => {
    expect(parseRecordingSplit(text)).toEqual(unconfidentSingle);
  });
});

describe("buildRecordingSplitPrompt", () => {
  it("carries the assignment and the rubric, and a placeholder when absent", () => {
    const p = buildRecordingSplitPrompt("Each student presents", "Clarity: 10");
    expect(p).toContain("Each student presents");
    expect(p).toContain("Clarity: 10");
    expect(buildRecordingSplitPrompt("", " ")).toContain("no assignment instructions");
  });
});
