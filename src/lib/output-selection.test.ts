import { describe, it, expect } from "vitest";
import {
  parseOutputSelection,
  isOutputSelected,
  OUTPUT_FAMILIES,
  OUTPUT_FAMILY_LABELS,
} from "./output-selection";

describe("parseOutputSelection", () => {
  it("blank spec means every family is selected", () => {
    expect(parseOutputSelection("")).toEqual({ all: true, families: new Set() });
    expect(parseOutputSelection("   \n  \n")).toEqual({ all: true, families: new Set() });
  });

  it("parses a single family", () => {
    expect(parseOutputSelection("assignments")).toEqual({
      all: false,
      families: new Set(["assignments"]),
    });
  });

  it("parses several newline-joined families", () => {
    expect(parseOutputSelection("assignments\nguides\ndecks")).toEqual({
      all: false,
      families: new Set(["assignments", "guides", "decks"]),
    });
  });

  it("tolerates blank lines and surrounding whitespace between entries", () => {
    expect(parseOutputSelection("\n  assignments  \n\n  guides\n")).toEqual({
      all: false,
      families: new Set(["assignments", "guides"]),
    });
  });

  it("de-duplicates a repeated family", () => {
    expect(parseOutputSelection("guides\nguides")).toEqual({
      all: false,
      families: new Set(["guides"]),
    });
  });

  it("accepts every declared family with no error", () => {
    const raw = OUTPUT_FAMILIES.join("\n");
    const result = parseOutputSelection(raw);
    expect(result.all).toBe(false);
    expect(result.families).toEqual(new Set(OUTPUT_FAMILIES));
  });

  it("throws, naming the bad value, on an unrecognized family", () => {
    expect(() => parseOutputSelection("not-a-real-output")).toThrow(/"not-a-real-output" is not a recognized output/);
  });

  it("throws on a recognized family mixed with a typo", () => {
    expect(() => parseOutputSelection("guides\nannouncment")).toThrow(/"announcment"/);
  });

  it("every OUTPUT_FAMILIES entry has a label", () => {
    for (const family of OUTPUT_FAMILIES) {
      expect(OUTPUT_FAMILY_LABELS[family], family).toBeTruthy();
    }
  });
});

describe("isOutputSelected", () => {
  it("returns true for every family when the selection is 'all'", () => {
    const selection = { all: true, families: new Set<(typeof OUTPUT_FAMILIES)[number]>() };
    for (const family of OUTPUT_FAMILIES) {
      expect(isOutputSelected(selection, family)).toBe(true);
    }
  });

  it("returns true only for explicitly named families otherwise", () => {
    const selection = parseOutputSelection("assignments\ndecks");
    expect(isOutputSelected(selection, "assignments")).toBe(true);
    expect(isOutputSelected(selection, "decks")).toBe(true);
    expect(isOutputSelected(selection, "guides")).toBe(false);
    expect(isOutputSelected(selection, "announcements")).toBe(false);
    expect(isOutputSelected(selection, "objectives")).toBe(false);
    expect(isOutputSelected(selection, "openers")).toBe(false);
    expect(isOutputSelected(selection, "knowledgeChecks")).toBe(false);
  });
});
