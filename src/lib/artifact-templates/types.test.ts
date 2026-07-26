import { describe, it, expect } from "vitest";
import {
  emptyAssignmentSpec,
  coerceAssignmentSpec,
  emptyArtifactTemplate,
  duplicateArtifactTemplate,
  ARTIFACT_TEMPLATE_KINDS,
  ARTIFACT_TEMPLATE_KIND_LABELS,
  TECHNICAL_APTITUDES,
  GROUPINGS,
} from "./types";
import type { ArtifactTemplate, AssignmentSpec } from "./types";
import { ARTIFACT_TEMPLATE_PRESETS, isPresetArtifactTemplateId, presetsForKind } from "./presets";

describe("emptyAssignmentSpec", () => {
  it("returns sensible defaults", () => {
    expect(emptyAssignmentSpec()).toEqual({
      goal: "",
      activity: "",
      aptitude: "intro",
      minutes: 60,
      deliverables: [],
      grouping: "solo",
      groupSize: null,
      includeOpener: false,
      openerMinutes: null,
      includeCloser: false,
      closerMinutes: null,
    });
  });
});

describe("coerceAssignmentSpec", () => {
  it("returns defaults for an empty object", () => {
    expect(coerceAssignmentSpec({})).toEqual(emptyAssignmentSpec());
  });

  it("falls back to the default aptitude for an unknown value", () => {
    expect(coerceAssignmentSpec({ aptitude: "expert" }).aptitude).toBe("intro");
  });

  it("falls back to the default grouping for an unknown value", () => {
    expect(coerceAssignmentSpec({ grouping: "trio" }).grouping).toBe("solo");
  });

  it("falls back to the default minutes for a non-numeric value", () => {
    expect(coerceAssignmentSpec({ minutes: "sixty" }).minutes).toBe(60);
  });

  it("falls back to the default minutes for a negative value", () => {
    expect(coerceAssignmentSpec({ minutes: -30 }).minutes).toBe(60);
  });

  it("falls back to the default minutes for NaN", () => {
    expect(coerceAssignmentSpec({ minutes: NaN }).minutes).toBe(60);
  });

  it("keeps only non-blank strings in deliverables", () => {
    const spec = coerceAssignmentSpec({
      deliverables: ["A working demo", "", "   ", 42, null, "A short writeup"],
    });
    expect(spec.deliverables).toEqual(["A working demo", "A short writeup"]);
  });

  it("falls back to null for a non-numeric groupSize/openerMinutes/closerMinutes", () => {
    const spec = coerceAssignmentSpec({
      groupSize: "two",
      openerMinutes: -5,
      closerMinutes: NaN,
    });
    expect(spec.groupSize).toBeNull();
    expect(spec.openerMinutes).toBeNull();
    expect(spec.closerMinutes).toBeNull();
  });

  it("round-trips a fully valid spec unchanged", () => {
    const valid: AssignmentSpec = {
      goal: "Build a small API",
      activity: "Implement three endpoints and test them",
      aptitude: "intermediate",
      minutes: 120,
      deliverables: ["A working API", "A short test suite"],
      grouping: "group",
      groupSize: 3,
      includeOpener: true,
      openerMinutes: 10,
      includeCloser: true,
      closerMinutes: 5,
    };
    expect(coerceAssignmentSpec(valid)).toEqual(valid);
  });

  it("yields defaults for null without throwing", () => {
    expect(() => coerceAssignmentSpec(null)).not.toThrow();
    expect(coerceAssignmentSpec(null)).toEqual(emptyAssignmentSpec());
  });

  it("yields defaults for undefined without throwing", () => {
    expect(() => coerceAssignmentSpec(undefined)).not.toThrow();
    expect(coerceAssignmentSpec(undefined)).toEqual(emptyAssignmentSpec());
  });

  it("yields defaults for a string without throwing", () => {
    expect(() => coerceAssignmentSpec("not an object")).not.toThrow();
    expect(coerceAssignmentSpec("not an object")).toEqual(emptyAssignmentSpec());
  });

  it("yields defaults for an array without throwing", () => {
    expect(() => coerceAssignmentSpec([1, 2, 3])).not.toThrow();
    expect(coerceAssignmentSpec([1, 2, 3])).toEqual(emptyAssignmentSpec());
  });
});

describe("emptyArtifactTemplate", () => {
  it("builds a blank assignment template with the caller-supplied id", () => {
    const template = emptyArtifactTemplate("assignment", "id-1");
    expect(template.id).toBe("id-1");
    expect(template.kind).toBe("assignment");
    expect(template.name).toBe("");
    expect(template.description).toBe("");
    expect(template.spec).toEqual(emptyAssignmentSpec());
  });

  it("builds a blank template with a placeholder {} spec for each undesigned kind", () => {
    for (const kind of ["test", "discussion", "quiz", "class-session"] as const) {
      const template = emptyArtifactTemplate(kind, "id-x");
      expect(template.kind).toBe(kind);
      expect(template.spec).toEqual({});
    }
  });
});

describe("duplicateArtifactTemplate", () => {
  const original: ArtifactTemplate<AssignmentSpec> = {
    id: "orig-id",
    kind: "assignment",
    name: "Original",
    description: "An original template",
    spec: { ...emptyAssignmentSpec(), deliverables: ["A", "B"] },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };

  it("assigns the new id, suffixes the name, and clears timestamps", () => {
    const dup = duplicateArtifactTemplate(original, "new-id");

    expect(dup.id).toBe("new-id");
    expect(dup.id).not.toBe(original.id);
    expect(dup.name).toBe("Original (copy)");
    expect(dup.createdAt).toBeUndefined();
    expect(dup.updatedAt).toBeUndefined();
  });

  it("deep-clones the spec: it is deep-equal but not the same reference, so mutating the copy leaves the original untouched", () => {
    const dup = duplicateArtifactTemplate(original, "new-id");

    expect(dup.spec).toEqual(original.spec);
    expect(dup.spec).not.toBe(original.spec);

    dup.spec.deliverables.push("C");

    expect(original.spec.deliverables).toEqual(["A", "B"]);
    expect(dup.spec.deliverables).toEqual(["A", "B", "C"]);
  });
});

describe("ARTIFACT_TEMPLATE_KINDS / ARTIFACT_TEMPLATE_KIND_LABELS", () => {
  it("has exactly the five families, each with a label", () => {
    expect(ARTIFACT_TEMPLATE_KINDS).toEqual([
      "assignment",
      "test",
      "discussion",
      "quiz",
      "class-session",
    ]);
    for (const kind of ARTIFACT_TEMPLATE_KINDS) {
      expect(ARTIFACT_TEMPLATE_KIND_LABELS[kind]).toBeTruthy();
    }
  });
});

describe("TECHNICAL_APTITUDES / GROUPINGS vocab", () => {
  it("every aptitude entry carries a label, hint, and promptContract", () => {
    expect(TECHNICAL_APTITUDES.length).toBeGreaterThan(0);
    for (const entry of TECHNICAL_APTITUDES) {
      expect(entry.label).toBeTruthy();
      expect(entry.hint).toBeTruthy();
      expect(entry.promptContract).toBeTruthy();
    }
  });

  it("every grouping entry carries a label, hint, and promptContract", () => {
    expect(GROUPINGS.length).toBeGreaterThan(0);
    for (const entry of GROUPINGS) {
      expect(entry.label).toBeTruthy();
      expect(entry.hint).toBeTruthy();
      expect(entry.promptContract).toBeTruthy();
    }
  });
});

describe("artifact template presets", () => {
  it("every preset id starts with preset-", () => {
    expect(ARTIFACT_TEMPLATE_PRESETS.length).toBeGreaterThan(0);
    for (const preset of ARTIFACT_TEMPLATE_PRESETS) {
      expect(isPresetArtifactTemplateId(preset.id)).toBe(true);
    }
  });

  it("isPresetArtifactTemplateId is false for a non-preset id", () => {
    expect(isPresetArtifactTemplateId("some-user-template-id")).toBe(false);
    expect(isPresetArtifactTemplateId("")).toBe(false);
  });

  it("presetsForKind returns every shipped preset for kind assignment", () => {
    const assignmentPresets = presetsForKind("assignment");
    expect(assignmentPresets.length).toBe(ARTIFACT_TEMPLATE_PRESETS.length);
    expect(assignmentPresets.every((t) => t.kind === "assignment")).toBe(true);
  });

  it("presetsForKind returns none of the other, undesigned kinds", () => {
    for (const kind of ["test", "discussion", "quiz", "class-session"] as const) {
      expect(presetsForKind(kind)).toEqual([]);
    }
  });

  it("every shipped preset's spec survives coerceAssignmentSpec unchanged", () => {
    for (const preset of ARTIFACT_TEMPLATE_PRESETS) {
      expect(coerceAssignmentSpec(preset.spec)).toEqual(preset.spec);
    }
  });
});
