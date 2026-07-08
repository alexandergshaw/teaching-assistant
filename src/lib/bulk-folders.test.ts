import { describe, it, expect } from "vitest";
import { buildBulkFolderNames } from "./bulk-folders";

describe("buildBulkFolderNames", () => {
  it("appends a zero-padded number when there is no {n}", () => {
    expect(buildBulkFolderNames("Module", 1, 3)).toEqual(["Module 01", "Module 02", "Module 03"]);
  });

  it("substitutes {n} with a zero-padded number", () => {
    expect(buildBulkFolderNames("week-{n}-notes", 1, 2)).toEqual(["week-01-notes", "week-02-notes"]);
  });

  it("honors the start offset", () => {
    expect(buildBulkFolderNames("M{n}", 5, 2)).toEqual(["M05", "M06"]);
  });

  it("pads single digits but leaves multi-digit numbers as-is", () => {
    expect(buildBulkFolderNames("m{n}", 9, 2)).toEqual(["m09", "m10"]);
  });

  it("returns [] for a count below 1", () => {
    expect(buildBulkFolderNames("Module", 1, 0)).toEqual([]);
  });

  it("returns [] for an empty pattern", () => {
    expect(buildBulkFolderNames("", 1, 3)).toEqual([]);
  });

  it("caps the count at 100", () => {
    expect(buildBulkFolderNames("f{n}", 1, 250)).toHaveLength(100);
  });

  it("trims surrounding slashes", () => {
    expect(buildBulkFolderNames("/lib/{n}/", 1, 1)).toEqual(["lib/01"]);
  });
});
