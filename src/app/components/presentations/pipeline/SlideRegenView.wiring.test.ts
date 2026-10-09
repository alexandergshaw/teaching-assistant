// Source-text pins for the per-slide regen sub-view (PRESENTATIONS-PIPELINE
// reading B). No component renders under vitest, so wiring is asserted by
// reading SlideRegenView.tsx.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "SlideRegenView.tsx"), "utf8");

describe("SlideRegenView wiring (source-text pin)", () => {
  it("builds the regen-slide request from the selected index and the instruction state", () => {
    expect(src).toMatch(
      /buildPipelineRequest\(\s*"regen-slide"\s*,\s*pipelineState\s*,\s*contextText\s*,\s*\{[\s\S]{0,80}slideIndex:\s*selectedIndex[\s\S]{0,80}instruction/
    );
  });

  it("numbers both preview panes from the real slide number", () => {
    expect(src.match(/startNumber=\{selectedIndex \+ 1\}/g)?.length).toBe(2);
  });

  it("posts to the existing pipeline route only", () => {
    expect(src.match(/fetch\(/g)?.length).toBe(1);
    expect(src).toContain('"/api/presentations/pipeline"');
    expect(src).not.toMatch(/\/api\/(?!presentations\/pipeline)/);
  });

  it("fetches the candidate through extractRegenCandidate, never the auto-merging reducer", () => {
    expect(src).toContain("extractRegenCandidate(");
    expect(src).not.toContain("reducePipelineResponse");
    expect(src).not.toContain("mergeRegeneratedSlide");
  });

  it("routes both Accept and Discard through applyRegenDecision", () => {
    expect(src).toMatch(/applyRegenDecision\(prev, candidate, selectedIndex, "accept"\)/);
    expect(src).toMatch(/applyRegenDecision\(prev, candidate, selectedIndex, "discard"\)/);
  });

  it("persists the selected slide and the instruction via usePersistedJSON", () => {
    expect(src).toContain('"ta-pres-regen-slide-index"');
    expect(src).toContain('"ta-pres-regen-instruction"');
    expect(src).toMatch(/usePersistedJSON<number>\(REGEN_SLIDE_INDEX_KEY/);
    expect(src).toMatch(/usePersistedJSON<string>\(REGEN_INSTRUCTION_KEY/);
  });

  it("does not persist the candidate", () => {
    expect(src).not.toMatch(/usePersistedJSON<[^>]*>\(\s*[A-Z_]*CANDIDATE/);
    expect(src).toMatch(/useState<PptxSlide \| null>\(null\)/);
  });
});
