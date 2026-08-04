// Pins the "dispatch" input on the "audit-visualizer-coverage" step
// (steps.visualizer.ts) to the explicit `group: "details"` hint that field
// was built for (StepInputSpec.group, types.ts / workflow-field-groups.ts's
// classifySecondaryField) but never actually declared.
//
// Why this matters: "dispatch" is a `boolean` field. Without an explicit
// `group`, classifySecondaryField's type-based fallback (boolean -> Posting)
// files it under "Posting" on the run form, next to the six "Post ... to the
// LMS" toggles. It is bound in Course Build as "dispatchVisualizerGaps"
// ("Dispatch Copilot task for gaps") and does not post anything to an LMS -
// it opens a GitHub Copilot coding-agent task. `group: "details"` overrides
// the wrong type-based guess so the field lands in the right secondary
// section.
//
// The barrel mock below is required even though this test never runs the
// step: getStepDefinition loads the whole registry, which pulls in every
// other export from steps.visualizer.ts (including
// ensure-visualizer-pages-for-deck, which calls these actions at module
// scope via import), so an incomplete/missing mock would leave those
// imports undefined - the same established pattern as
// registry.audit-visualizer-coverage.test.ts and
// registry.ensure-visualizer-pages-for-deck.test.ts.
vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  saveLibraryFileAction: vi.fn(),
  findVisualizerConceptAction: vi.fn(),
  createVisualizerConceptAction: vi.fn(),
  extractPptxSlidesAction: vi.fn(),
  extractDeckConceptsAction: vi.fn(),
}));

vi.mock("@/app/actions/visualizer-coverage", () => ({
  auditVisualizerCoverageAction: vi.fn(),
}));

import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { getStepDefinition } from "../registry";

function dispatchInput() {
  const step = getStepDefinition("audit-visualizer-coverage");
  if (!step) throw new Error("audit-visualizer-coverage step not found in registry");
  const input = step.inputs.find((i) => i.key === "dispatch");
  if (!input) throw new Error("dispatch input not found on audit-visualizer-coverage");
  return input;
}

describe("audit-visualizer-coverage's dispatch input declares its secondary group explicitly", () => {
  it('declares group: "details" (not left to the boolean -> "posting" type-based fallback)', () => {
    expect(dispatchInput().group).toBe("details");
  });

  // Sabotage-checked directly against source (not just the getter above) so
  // this test cannot pass merely because some OTHER input on the step
  // happens to be named "dispatch" and happens to carry the hint.
  it("the declaration lives on steps.visualizer.ts's dispatch input spec", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/workflows/registry/steps.visualizer.ts"),
      "utf-8"
    );
    const dispatchBlockMatch = source.match(/key:\s*"dispatch"[\s\S]*?\n\s*\},/);
    expect(dispatchBlockMatch, "could not locate the dispatch input's object literal in steps.visualizer.ts").not.toBeNull();
    expect(dispatchBlockMatch![0]).toContain('group: "details"');
  });

  it("still declares its existing key/label/type/required unchanged", () => {
    const input = dispatchInput();
    expect(input.key).toBe("dispatch");
    expect(input.label).toBe("Dispatch Copilot task for gaps");
    expect(input.type).toBe("boolean");
    expect(input.required).toBe(false);
  });
});
