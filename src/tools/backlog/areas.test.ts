import { describe, it, expect } from "vitest";
import { BACKLOG_AREAS, isBacklogArea, areaLabel, areaIndex } from "./areas";

describe("BACKLOG_AREAS registry", () => {
  it("has every slug unique", () => {
    const slugs = BACKLOG_AREAS.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has every label unique", () => {
    const labels = BACKLOG_AREAS.map((a) => a.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("gives areaIndex that is total (every registered slug resolves) and matches array position", () => {
    BACKLOG_AREAS.forEach((a, i) => {
      expect(areaIndex(a.slug)).toBe(i);
    });
  });

  it("accepts every registered slug via isBacklogArea", () => {
    for (const a of BACKLOG_AREAS) {
      expect(isBacklogArea(a.slug)).toBe(true);
    }
  });

  it("rejects an unregistered slug via isBacklogArea", () => {
    expect(isBacklogArea("not-a-real-area")).toBe(false);
  });

  it("throws from areaLabel on an unregistered slug rather than guessing a placeholder", () => {
    expect(() => areaLabel("not-a-real-area")).toThrow();
  });

  it("throws from areaIndex on an unregistered slug rather than returning -1 silently", () => {
    expect(() => areaIndex("not-a-real-area")).toThrow();
  });

  it("resolves areaLabel to the exact registered label", () => {
    expect(areaLabel("ask-ai-modal")).toBe("Ask AI modal: persistence and chip copy");
  });
});
