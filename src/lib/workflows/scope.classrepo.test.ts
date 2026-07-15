import { describe, it, expect } from "vitest";
import { parseClassRepoRef, CLASS_REPO_REF } from "./scope";

describe("parseClassRepoRef", () => {
  it("parses a bare reference as the workflow-scoped tile (tileId null)", () => {
    expect(parseClassRepoRef(CLASS_REPO_REF)).toEqual({ tileId: null });
    expect(parseClassRepoRef("  @class-repo  ")).toEqual({ tileId: null });
    // A trailing colon with no id also means the scoped tile.
    expect(parseClassRepoRef("@class-repo:")).toEqual({ tileId: null });
  });

  it("parses a specific-tile reference", () => {
    expect(parseClassRepoRef("@class-repo:tile1")).toEqual({ tileId: "tile1" });
    expect(parseClassRepoRef("@class-repo: tile2 ")).toEqual({ tileId: "tile2" });
  });

  it("returns null for a non-reference (concrete repo, empty, or other text)", () => {
    expect(parseClassRepoRef("owner/repo")).toBeNull();
    expect(parseClassRepoRef("")).toBeNull();
    expect(parseClassRepoRef("https://github.com/owner/repo")).toBeNull();
  });
});
