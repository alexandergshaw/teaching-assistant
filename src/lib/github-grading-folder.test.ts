import { describe, it, expect } from "vitest";
import { normalizeGradingFolder, describeGradingFolder } from "./github-grading-folder";

describe("normalizeGradingFolder", () => {
  it("returns '' for undefined", () => {
    expect(normalizeGradingFolder(undefined)).toBe("");
  });

  it("returns '' for null", () => {
    expect(normalizeGradingFolder(null)).toBe("");
  });

  it("returns '' for an empty string", () => {
    expect(normalizeGradingFolder("")).toBe("");
  });

  it("returns '' for a whitespace-only string", () => {
    expect(normalizeGradingFolder("   \t  ")).toBe("");
  });

  it("strips a single leading and trailing slash", () => {
    expect(normalizeGradingFolder("/week3/")).toBe("week3");
  });

  it("strips multiple leading and trailing slashes", () => {
    expect(normalizeGradingFolder("///week3///")).toBe("week3");
  });

  it("collapses duplicate internal slashes", () => {
    expect(normalizeGradingFolder("week3//solutions////part1")).toBe("week3/solutions/part1");
  });

  it("leaves a normal nested path intact", () => {
    expect(normalizeGradingFolder("a/b/c")).toBe("a/b/c");
  });

  it("trims surrounding whitespace before stripping slashes", () => {
    expect(normalizeGradingFolder("  /week3/  ")).toBe("week3");
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(normalizeGradingFolder("week3\\solutions")).toBe("week3/solutions");
  });

  it("rejects a value containing a '..' segment, falling back to whole-repo", () => {
    expect(normalizeGradingFolder("../secrets")).toBe("");
  });

  it("rejects a '..' segment in the middle of a path", () => {
    expect(normalizeGradingFolder("a/../b")).toBe("");
  });

  it("rejects a bare '..'", () => {
    expect(normalizeGradingFolder("..")).toBe("");
  });

  it("drops a stray '.' segment without treating it as a rejection", () => {
    expect(normalizeGradingFolder("a/./b")).toBe("a/b");
  });
});

describe("describeGradingFolder", () => {
  it("describes the whole-repo case for a blank folder", () => {
    expect(describeGradingFolder("")).toBe("Grading the entire repository.");
  });

  it("describes a scoped folder by name", () => {
    expect(describeGradingFolder("week3")).toBe('Grading only the "week3" folder in each repo.');
  });

  it("produces different text for blank vs a set folder", () => {
    expect(describeGradingFolder("")).not.toBe(describeGradingFolder("week3"));
  });
});
