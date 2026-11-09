import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ALL_STAGE_IDS, createInitialPipelineState } from "@/lib/presentations/pipeline";
import { STAGE_LABELS, stageNavigationLabel } from "./PipelineStepper";

describe("pipeline stage labels", () => {
  it("names every actual stage once without misleading narrative numbers", () => {
    const labels = ALL_STAGE_IDS.map((id) => STAGE_LABELS[id]);
    expect(labels.every((label) => label.length > 0 && !/^\d/.test(label))).toBe(true);
    expect(new Set(labels).size).toBe(ALL_STAGE_IDS.length);
    expect(labels.slice(0, 4)).toEqual(["Sources", "Outline", "Activities", "Frame"]);
  });
  it("distinguishes runnable, prerequisite-locked and completed stages", () => {
    const state = createInitialPipelineState();
    expect(stageNavigationLabel(state, "sources")).toBe("Sources");
    expect(stageNavigationLabel(state, "deck")).toBe("Deck (needs prerequisites)");
    expect(stageNavigationLabel({ ...state, deck: { ...state.deck, status: "done" } }, "deck")).toBe("Deck (done)");
  });
  it("uses MUI tab navigation and associates the active panel", () => {
    const stepper = readFileSync("src/app/components/presentations/pipeline/PipelineStepper.tsx", "utf8");
    const tab = readFileSync("src/app/components/presentations/pipeline/PipelineTab.tsx", "utf8");
    expect(stepper).toContain("selectionFollowsFocus");
    expect(stepper).toContain('aria-controls="pipeline-stage-panel"');
    expect(tab).toContain('role="tabpanel" id="pipeline-stage-panel"');
    expect(tab).toContain('aria-labelledby={`pipeline-stage-tab-${activeStage}`}');
  });
});
