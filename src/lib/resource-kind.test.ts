import { describe, it, expect } from "vitest";
import { RESOURCE_KINDS, RESOURCE_KIND_LABELS, coerceResourceKind } from "./resource-kind";

describe("resource-kind leaf", () => {
  it("RESOURCE_KINDS names exactly the five kinds, in this order", () => {
    expect(RESOURCE_KINDS).toEqual(["doc", "video", "tutorial", "news", "paper"]);
  });

  it("RESOURCE_KIND_LABELS carries a human label for every one of the five kinds", () => {
    expect(RESOURCE_KIND_LABELS).toEqual({
      doc: "Docs",
      video: "Video",
      tutorial: "Tutorial",
      news: "News",
      paper: "Paper",
    });
    // Every key in RESOURCE_KINDS has a label, and there are no extra keys -
    // a Record<ResourceKind, string> literal already enforces this at
    // compile time, but pin it at runtime too so a future refactor that
    // loosens the type doesn't silently drop a label.
    expect(Object.keys(RESOURCE_KIND_LABELS).sort()).toEqual([...RESOURCE_KINDS].sort());
  });

  describe("coerceResourceKind", () => {
    it.each(RESOURCE_KINDS)("passes a recognized kind %s through unchanged", (kind) => {
      expect(coerceResourceKind(kind)).toBe(kind);
    });

    it("defaults an unrecognized string to doc", () => {
      expect(coerceResourceKind("podcast")).toBe("doc");
      expect(coerceResourceKind("")).toBe("doc");
    });

    it("defaults a non-string value to doc without throwing", () => {
      expect(coerceResourceKind(undefined)).toBe("doc");
      expect(coerceResourceKind(null)).toBe("doc");
      expect(coerceResourceKind(42)).toBe("doc");
      expect(coerceResourceKind({ kind: "video" })).toBe("doc");
      expect(coerceResourceKind(["video"])).toBe("doc");
    });
  });
});
