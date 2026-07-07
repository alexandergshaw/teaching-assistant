import { describe, it, expect } from "vitest";
import { buildBulkFolderNames } from "./bulk-folders";

describe("buildBulkFolderNames", () => {
  it("appends number when pattern has no {n}", () => {
    const result = buildBulkFolderNames("Module", 1, 3);
    expect(result).toEqual(["Module 1", "Module 2", "Module 3"]);
  });

  it("replaces {n} in the pattern", () => {
    const result = buildBulkFolderNames("week-{n}-notes", 1, 2);
    expect(result).toEqual(["week-1-notes", "week-2-notes"]);
  });

  it("respects start offset", () => {
    const result = buildBulkFolderNames("M{n}", 5, 2);
    expect(result).toEqual(["M5", "M6"]);
  });

  it("returns empty array when count is 0", () => {
    const result = buildBulkFolderNames("Module", 1, 0);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty pattern", () => {
    const result = buildBulkFolderNames("", 1, 3);
    expect(result).toEqual([]);
  });

  it("caps count at 100", () => {
    const result = buildBulkFolderNames("f{n}", 1, 250);
    expect(result).length(100);
  });

  it("trims surrounding slashes", () => {
    const result = buildBulkFolderNames("/lib/{n}/", 1, 1);
    expect(result).toEqual(["lib/1"]);
  });
});
