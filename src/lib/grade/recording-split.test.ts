import { describe, it, expect } from "vitest";
import {
  buildRecordingSplitPrompt,
  buildVideoWindowNote,
  formatRecordingWindow,
  isRecordingWindow,
  parseRecordingSplit,
  readRecordingSplitResponse,
  MAX_SEGMENT_LABEL_CHARS,
} from "./recording-split";

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

describe("window helpers (W3)", () => {
  it("formats M:SS and H:MM:SS", () => {
    expect(formatRecordingWindow({ startSec: 0, endSec: 95 })).toBe("0:00 to 1:35");
    expect(formatRecordingWindow({ startSec: 3600, endSec: 3725.9 })).toBe("1:00:00 to 1:02:05");
  });

  it("the note names both ends and tells the model to ignore the rest", () => {
    const note = buildVideoWindowNote({ startSec: 95, endSec: 190 });
    expect(note).toContain("from 1:35 to 3:10");
    expect(note).toContain("ignore everything outside that window");
  });

  it("isRecordingWindow accepts only finite, ordered, bounded windows", () => {
    expect(isRecordingWindow({ startSec: 0, endSec: 1 })).toBe(true);
    for (const bad of [null, 5, {}, { startSec: 1, endSec: 1 }, { startSec: -1, endSec: 2 }, { startSec: 0, endSec: Infinity }, { startSec: "0", endSec: 2 }, { startSec: 0, endSec: 90000 }]) {
      expect(isRecordingWindow(bad)).toBe(false);
    }
  });
});

describe("readRecordingSplitResponse (W2 client read)", () => {
  const two = { kind: "multiple", segments: [{ startSec: 0, endSec: 50, label: "A" }, { startSec: 50, endSec: 99, label: "B" }] };

  it("reads a confirmed multiple with failed absent", () => {
    expect(readRecordingSplitResponse({ split: two })).toEqual({ split: two, failed: false });
  });

  it("reads a model-confirmed single as not failed", () => {
    expect(readRecordingSplitResponse({ split: { kind: "single" } })).toEqual({ split: { kind: "single" }, failed: false });
  });

  it("failed:true forces single even if a multiple rides along", () => {
    expect(readRecordingSplitResponse({ split: two, failed: true })).toEqual({ split: { kind: "single" }, failed: true });
  });

  it("a malformed body or a sub-2-segment multiple is the fail-safe failed single", () => {
    const failedSingle = { split: { kind: "single" }, failed: true };
    expect(readRecordingSplitResponse(null)).toEqual(failedSingle);
    expect(readRecordingSplitResponse({})).toEqual(failedSingle);
    expect(readRecordingSplitResponse({ split: { kind: "multiple", segments: [two.segments[0]] } })).toEqual(failedSingle);
  });
});
