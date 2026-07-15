import { describe, it, expect } from "vitest";
import { parseClassRepoRef, parseClassTileRef, CLASS_REPO_REF, CLASS_TILE_REF } from "./scope";

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

  it("does not treat a @class-tile ref as a repo ref (distinct sentinels)", () => {
    expect(parseClassRepoRef(CLASS_TILE_REF)).toBeNull();
    expect(parseClassRepoRef("@class-tile:t1")).toBeNull();
  });
});

describe("parseClassTileRef", () => {
  it("parses a bare reference as the workflow-scoped tile, and a specific tile", () => {
    expect(parseClassTileRef(CLASS_TILE_REF)).toEqual({ tileId: null });
    expect(parseClassTileRef("@class-tile:")).toEqual({ tileId: null });
    expect(parseClassTileRef("@class-tile:t1")).toEqual({ tileId: "t1" });
    expect(parseClassTileRef("@class-tile: t2 ")).toEqual({ tileId: "t2" });
  });

  it("returns null for a non-reference, including a @class-repo ref", () => {
    expect(parseClassTileRef("MCC")).toBeNull();
    expect(parseClassTileRef("")).toBeNull();
    expect(parseClassTileRef(CLASS_REPO_REF)).toBeNull();
    expect(parseClassTileRef("@class-repo:t1")).toBeNull();
  });
});
