import { describe, expect, it } from "vitest";
import {
  buildRepoGradeAssignmentOptions,
  isPostableAssignmentOption,
  parseRepoGradeAssignmentValue,
  type RepoGradeAssignmentOption,
} from "./repoGradesAssignmentSources";

describe("buildRepoGradeAssignmentOptions", () => {
  it("returns an empty list when both sources are empty", () => {
    expect(buildRepoGradeAssignmentOptions({ live: [], export: [] })).toEqual([]);
  });

  it("builds live-only options with the bare Canvas id as value and a real canvasAssignmentId", () => {
    const result = buildRepoGradeAssignmentOptions({
      live: [
        { id: "101", name: "Homework 1" },
        { id: "102", name: "Homework 2" },
      ],
      export: [],
    });
    expect(result).toEqual([
      { value: "101", label: "Homework 1", source: "live", canvasAssignmentId: "101" },
      { value: "102", label: "Homework 2", source: "live", canvasAssignmentId: "102" },
    ]);
  });

  it("builds export-only options with a prefixed value, a labelled source, and a null canvasAssignmentId", () => {
    const result = buildRepoGradeAssignmentOptions({
      live: [],
      export: [{ key: "0:1", itemTitle: "Lab 1" }],
    });
    expect(result).toEqual([
      { value: "export:0:1", label: "Lab 1 (from export)", source: "export", canvasAssignmentId: null },
    ]);
  });

  it("merges both sources with live options first, each list in the order given", () => {
    const result = buildRepoGradeAssignmentOptions({
      live: [
        { id: "200", name: "Live B" },
        { id: "199", name: "Live A" },
      ],
      export: [
        { key: "1:0", itemTitle: "Export B" },
        { key: "0:0", itemTitle: "Export A" },
      ],
    });
    expect(result.map((o) => o.value)).toEqual(["200", "199", "export:1:0", "export:0:0"]);
    expect(result[0].source).toBe("live");
    expect(result[1].source).toBe("live");
    expect(result[2].source).toBe("export");
    expect(result[3].source).toBe("export");
  });

  it("never mutates the input arrays", () => {
    const live = Object.freeze([{ id: "1", name: "A" }]) as readonly { id: string; name: string }[];
    const exportItems = Object.freeze([{ key: "0:0", itemTitle: "B" }]) as readonly {
      key: string;
      itemTitle: string;
    }[];
    expect(() => buildRepoGradeAssignmentOptions({ live, export: exportItems })).not.toThrow();
    expect(live).toEqual([{ id: "1", name: "A" }]);
    expect(exportItems).toEqual([{ key: "0:0", itemTitle: "B" }]);
  });

  it("does not mistake a purely numeric export key for a live assignment id", () => {
    const result = buildRepoGradeAssignmentOptions({
      live: [{ id: "5", name: "Live Five" }],
      export: [{ key: "5", itemTitle: "Export Five" }],
    });
    const exportOption = result.find((o) => o.source === "export")!;
    // The export option's value is namespaced, so it is textually distinct
    // from the live option's bare "5" even though the underlying key is the
    // same numeral - the whole point of the prefix.
    expect(exportOption.value).toBe("export:5");
    expect(exportOption.value).not.toBe("5");
    const parsed = parseRepoGradeAssignmentValue(exportOption.value);
    expect(parsed).toEqual({ source: "export", id: "5" });
  });
});

describe("parseRepoGradeAssignmentValue", () => {
  it("round-trips an export value back to its source and key, key containing a colon", () => {
    expect(parseRepoGradeAssignmentValue("export:0:1")).toEqual({ source: "export", id: "0:1" });
  });

  it("round-trips a live value back to its source and bare id", () => {
    expect(parseRepoGradeAssignmentValue("101")).toEqual({ source: "live", id: "101" });
  });

  it("returns null for an empty string", () => {
    expect(parseRepoGradeAssignmentValue("")).toBeNull();
  });

  it("returns null for a bare export prefix with no id after it", () => {
    expect(parseRepoGradeAssignmentValue("export:")).toBeNull();
  });

  it("returns null for a whitespace-only live-side value", () => {
    expect(parseRepoGradeAssignmentValue("   ")).toBeNull();
  });

  it("trims a live value with surrounding whitespace", () => {
    expect(parseRepoGradeAssignmentValue("  101  ")).toEqual({ source: "live", id: "101" });
  });
});

describe("isPostableAssignmentOption", () => {
  it("is true for a live option", () => {
    const option: RepoGradeAssignmentOption = { value: "1", label: "A", source: "live", canvasAssignmentId: "1" };
    expect(isPostableAssignmentOption(option)).toBe(true);
  });

  it("is false for an export option", () => {
    const option: RepoGradeAssignmentOption = {
      value: "export:0:0",
      label: "A (from export)",
      source: "export",
      canvasAssignmentId: null,
    };
    expect(isPostableAssignmentOption(option)).toBe(false);
  });

  it("is false for null", () => {
    expect(isPostableAssignmentOption(null)).toBe(false);
  });
});
