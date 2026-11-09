import { describe, expect, it } from "vitest";
import { ALL_STAGE_IDS } from "@/lib/presentations/pipeline";
import { STAGE_LABELS } from "./PipelineStepper";

describe("pipeline stage labels", () => {
  it("names every actual stage once without misleading narrative numbers", () => {
    const labels = ALL_STAGE_IDS.map((id) => STAGE_LABELS[id]);
    expect(labels.every((label) => label.length > 0 && !/^\d/.test(label))).toBe(true);
    expect(new Set(labels).size).toBe(ALL_STAGE_IDS.length);
    expect(labels.slice(0, 4)).toEqual(["Sources", "Outline", "Activities", "Frame"]);
  });
});
