import { describe, it, expect } from "vitest";
import { globsOverlap, ownsIntersect } from "./glob-intersect";

describe("globsOverlap", () => {
  it("treats identical globs as overlapping", () => {
    expect(globsOverlap("src/a.ts", "src/a.ts")).toBe(true);
  });

  it("treats a wildcard glob as overlapping a concrete file under its static prefix", () => {
    expect(globsOverlap("src/config/resolver.*", "src/config/resolver.test.ts")).toBe(true);
  });

  it("treats disjoint directories as not overlapping", () => {
    expect(globsOverlap("src/config/resolver.*", "src/other/thing.ts")).toBe(false);
  });

  it("treats a nested-directory glob as overlapping its parent-directory glob", () => {
    expect(globsOverlap("src/a/*", "src/a/b/*")).toBe(true);
  });

  it("treats an empty-prefix glob (starts with a wildcard) as overlapping everything", () => {
    expect(globsOverlap("*.ts", "src/anything/at/all.ts")).toBe(true);
    expect(globsOverlap("src/x.ts", "*.ts")).toBe(true);
  });

  it("treats sibling files with a shared prefix but distinct names as not overlapping", () => {
    expect(globsOverlap("src/foo.ts", "src/foobar.ts")).toBe(false);
  });
});

describe("ownsIntersect", () => {
  it("is false for two items with entirely disjoint owns lists", () => {
    expect(ownsIntersect(["src/a/*"], ["src/b/*"])).toBe(false);
  });

  it("is true as soon as any pair overlaps, even with other non-overlapping pairs present", () => {
    expect(ownsIntersect(["src/a/*", "src/x.ts"], ["src/b/*", "src/x.ts"])).toBe(true);
  });

  it("is false when either side owns nothing", () => {
    expect(ownsIntersect([], ["src/a.ts"])).toBe(false);
    expect(ownsIntersect(["src/a.ts"], [])).toBe(false);
  });

  it("is deterministic across repeated calls", () => {
    const a = ["src/a/*", "src/shared.ts"];
    const b = ["src/b/*", "src/shared.ts"];
    expect(ownsIntersect(a, b)).toBe(ownsIntersect(a, b));
  });
});
