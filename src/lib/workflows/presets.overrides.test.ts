// allWorkflows' merge behavior for preset overrides (AC1/AC2/AC4). Presets
// themselves are exercised in presets.test.ts / presets.kickoff.test.ts;
// this file is only about how a saved custom-workflow row combines with the
// live PRESET_WORKFLOWS list - the actual fix for docs/REGRESSION.md #152/153.

import { describe, it, expect } from "vitest";
import { allWorkflows, getPresetDef, PRESET_WORKFLOWS } from "./presets";
import { expandWorkflowDef, type WorkflowDef } from "./types";

describe("allWorkflows - preset overrides", () => {
  it("shows exactly one entry for a preset with a saved override (AC1: no duplicate)", () => {
    const preset = PRESET_WORKFLOWS[0];
    const override: WorkflowDef = {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      preset: true,
      steps: [],
      scope: { institution: "MCC" },
      presetOverrideDelta: { diverged: false },
    };
    const merged = allWorkflows([override]);
    const matches = merged.filter((w) => w.id === preset.id);
    expect(matches).toHaveLength(1);
    expect(matches[0].scope).toEqual({ institution: "MCC" });
    expect(matches[0].preset).toBe(true);
    expect(matches[0].presetOverride).toEqual({ diverged: false });
  });

  it("a preset with no saved override resolves to the plain code preset, unchanged", () => {
    const merged = allWorkflows([]);
    const preset = PRESET_WORKFLOWS[0];
    const found = merged.find((w) => w.id === preset.id);
    expect(found).toEqual(preset);
    expect(found?.presetOverride).toBeUndefined();
  });

  it("a plain custom workflow (id not matching any preset) passes through untouched", () => {
    const custom: WorkflowDef = {
      id: "custom-uuid-1234",
      name: "My workflow",
      description: "",
      steps: [{ type: "a", bindings: {} }],
    };
    const merged = allWorkflows([custom]);
    expect(merged.find((w) => w.id === "custom-uuid-1234")).toEqual(custom);
  });

  it("AC4: a pre-existing '(copy)' row (a UUID id, full frozen steps, no presetOverrideDelta) resolves exactly as it always has - not merged into any preset", () => {
    const legacyCopy: WorkflowDef = {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Course Kickoff (no codebase) (copy)",
      description: "",
      steps: [
        { type: "load-course-tile", bindings: {} },
        { type: "generate-schedule", bindings: {} },
      ],
      scope: { hubCourse: "abc" },
    };
    const merged = allWorkflows([legacyCopy]);
    const found = merged.find((w) => w.id === legacyCopy.id);
    expect(found).toEqual(legacyCopy);
    // And it did NOT get folded into the preset it was named after - the
    // preset itself is still listed separately, unmodified.
    const presetEntry = merged.find((w) => w.id === "course-kickoff-no-code");
    expect(presetEntry?.presetOverride).toBeUndefined();
  });

  it("preserves the original preset-then-custom display order", () => {
    const custom: WorkflowDef = { id: "zzz-custom", name: "Z", description: "", steps: [] };
    const merged = allWorkflows([custom]);
    expect(merged.slice(0, PRESET_WORKFLOWS.length).map((w) => w.id)).toEqual(
      PRESET_WORKFLOWS.map((w) => w.id)
    );
    expect(merged[merged.length - 1].id).toBe("zzz-custom");
  });

  it("a preset that gains a step reaches an override with only a scope delta automatically (AC2)", () => {
    // Simulate: an override was saved back when the preset had N steps
    // (scope-only edit, so no stepOverrides at all); the preset now has
    // MORE steps than that (a later code change). The override must still
    // resolve with ALL of the current preset's steps.
    const preset = PRESET_WORKFLOWS.find((w) => w.id === "course-kickoff-no-code")!;
    const override: WorkflowDef = {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      preset: true,
      steps: [],
      scope: { hubCourse: "*" },
      presetOverrideDelta: { diverged: false },
    };
    const merged = allWorkflows([override]);
    const resolved = merged.find((w) => w.id === preset.id)!;
    expect(resolved.steps.length).toBe(preset.steps.length);
    expect(resolved.steps.map((s) => s.type)).toEqual(preset.steps.map((s) => s.type));
  });
});

describe("AC7 - a resolved preset override survives expandWorkflowDef unchanged in position", () => {
  it("a stepOverride's changed binding is what the expanded (run-ready) step list actually carries", () => {
    const preset = getPresetDef("draft-and-post-announcement")!;
    const override: WorkflowDef = {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      preset: true,
      steps: [],
      presetOverrideDelta: {
        diverged: false,
        stepOverrides: {
          0: {
            expectedType: "draft-announcement",
            bindings: { instruction: { source: "literal", value: "Midterm moved to Friday" } },
          },
        },
      },
    };
    const merged = allWorkflows([override]);
    const resolved = merged.find((w) => w.id === preset.id)!;
    const expanded = expandWorkflowDef(resolved, (id) => merged.find((w) => w.id === id));

    expect(expanded.steps[0].bindings.instruction).toEqual({
      source: "literal",
      value: "Midterm moved to Friday",
    });
    // Everything NOT overridden (step 1's own bindings, including its "step"
    // reference back to step 0's outputs) is untouched.
    expect(expanded.steps[1].bindings.announcementTitle).toEqual({
      source: "step",
      stepIndex: 0,
      outputKey: "announcementTitle",
    });
  });
});

describe("getPresetDef", () => {
  it("returns the raw preset for a preset id", () => {
    expect(getPresetDef("course-kickoff-no-code")?.name).toBe("Course Kickoff (no codebase)");
  });

  it("returns undefined for a from-scratch custom workflow's id (AC5)", () => {
    expect(getPresetDef(crypto.randomUUID())).toBeUndefined();
  });
});
