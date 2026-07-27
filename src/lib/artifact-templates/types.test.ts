import { describe, it, expect } from "vitest";
import {
  emptyAssignmentSpec,
  coerceAssignmentSpec,
  emptyTestSpec,
  coerceTestSpec,
  testTotalPoints,
  testQuestionCount,
  emptyArtifactTemplate,
  duplicateArtifactTemplate,
  ARTIFACT_TEMPLATE_KINDS,
  ARTIFACT_TEMPLATE_KIND_LABELS,
  TECHNICAL_APTITUDES,
  GROUPINGS,
  TEST_QUESTION_KINDS,
  TEST_FORMATS,
} from "./types";
import type { ArtifactTemplate, AssignmentSpec, TestSpec } from "./types";
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
    for (const kind of ["discussion", "quiz", "class-session"] as const) {
      const template = emptyArtifactTemplate(kind, "id-x");
      expect(template.kind).toBe(kind);
      expect(template.spec).toEqual({});
    }
  });

  it("builds a blank test template with the designed emptyTestSpec, not a placeholder", () => {
    const template = emptyArtifactTemplate("test", "id-test");
    expect(template.kind).toBe("test");
    expect(template.spec).toEqual(emptyTestSpec());
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

  it("presetsForKind returns every shipped assignment preset, none of a different kind", () => {
    const assignmentPresets = presetsForKind("assignment");
    expect(assignmentPresets.length).toBeGreaterThan(0);
    expect(assignmentPresets.every((t) => t.kind === "assignment")).toBe(true);
  });

  it("presetsForKind returns exactly three test presets", () => {
    const testPresets = presetsForKind("test");
    expect(testPresets.length).toBe(3);
    expect(testPresets.every((t) => t.kind === "test")).toBe(true);
    expect(testPresets.every((t) => isPresetArtifactTemplateId(t.id))).toBe(true);
  });

  it("presetsForKind returns none of the other, undesigned kinds", () => {
    for (const kind of ["discussion", "quiz", "class-session"] as const) {
      expect(presetsForKind(kind)).toEqual([]);
    }
  });

  it("every shipped assignment preset's spec survives coerceAssignmentSpec unchanged", () => {
    for (const preset of presetsForKind("assignment")) {
      expect(coerceAssignmentSpec(preset.spec)).toEqual(preset.spec);
    }
  });

  it("every shipped test preset's spec survives coerceTestSpec unchanged", () => {
    for (const preset of presetsForKind("test")) {
      expect(coerceTestSpec(preset.spec)).toEqual(preset.spec);
    }
  });
});

describe("emptyTestSpec", () => {
  it("returns sensible defaults", () => {
    expect(emptyTestSpec()).toEqual({
      goal: "",
      coverage: "",
      aptitude: "intro",
      format: "in-class",
      minutes: 60,
      sections: [],
      allowedResources: [],
      includeAnswerKey: true,
      includeStudyGuide: false,
    });
  });
});

describe("coerceTestSpec", () => {
  it("returns defaults for an empty object", () => {
    expect(coerceTestSpec({})).toEqual(emptyTestSpec());
  });

  it("falls back to the default aptitude for an unknown value", () => {
    expect(coerceTestSpec({ aptitude: "expert" }).aptitude).toBe("intro");
  });

  it("falls back to the default format for an unknown value", () => {
    expect(coerceTestSpec({ format: "remote-proctored" }).format).toBe("in-class");
  });

  it("falls back to the default minutes for a non-numeric value", () => {
    expect(coerceTestSpec({ minutes: "sixty" }).minutes).toBe(60);
  });

  it("falls back to the default minutes for a negative value", () => {
    expect(coerceTestSpec({ minutes: -30 }).minutes).toBe(60);
  });

  it("falls back to the default minutes for NaN", () => {
    expect(coerceTestSpec({ minutes: NaN }).minutes).toBe(60);
  });

  it("falls back to the default minutes for Infinity", () => {
    expect(coerceTestSpec({ minutes: Infinity }).minutes).toBe(60);
  });

  it("drops a section with an unrecognized kind instead of defaulting it", () => {
    const spec = coerceTestSpec({
      sections: [{ kind: "fill_in_the_blank", count: 5, pointsEach: 2 }],
    });
    expect(spec.sections).toEqual([]);
  });

  it("drops a section with a non-integer, negative, or non-finite count", () => {
    const spec = coerceTestSpec({
      sections: [
        { kind: "multiple_choice", count: 2.5, pointsEach: 1 },
        { kind: "multiple_choice", count: -1, pointsEach: 1 },
        { kind: "multiple_choice", count: NaN, pointsEach: 1 },
      ],
    });
    expect(spec.sections).toEqual([]);
  });

  it("drops a section with a negative or non-finite pointsEach", () => {
    const spec = coerceTestSpec({
      sections: [
        { kind: "multiple_choice", count: 5, pointsEach: -2 },
        { kind: "multiple_choice", count: 5, pointsEach: NaN },
      ],
    });
    expect(spec.sections).toEqual([]);
  });

  it("keeps a well-formed section", () => {
    const spec = coerceTestSpec({
      sections: [{ kind: "essay", count: 2, pointsEach: 15 }],
    });
    expect(spec.sections).toEqual([{ kind: "essay", count: 2, pointsEach: 15 }]);
  });

  it("drops non-object entries from sections", () => {
    const spec = coerceTestSpec({
      sections: [null, "not a section", 42, { kind: "true_false", count: 1, pointsEach: 1 }],
    });
    expect(spec.sections).toEqual([{ kind: "true_false", count: 1, pointsEach: 1 }]);
  });

  it("keeps only non-blank strings in allowedResources", () => {
    const spec = coerceTestSpec({
      allowedResources: ["Open book", "", "   ", 42, null, "One index card"],
    });
    expect(spec.allowedResources).toEqual(["Open book", "One index card"]);
  });

  it("falls back to the default includeAnswerKey/includeStudyGuide when not booleans", () => {
    const spec = coerceTestSpec({ includeAnswerKey: "yes", includeStudyGuide: "no" });
    expect(spec.includeAnswerKey).toBe(true);
    expect(spec.includeStudyGuide).toBe(false);
  });

  it("round-trips a fully valid spec unchanged", () => {
    const valid: TestSpec = {
      goal: "Assess mastery of loops.",
      coverage: "Weeks 1-4.",
      aptitude: "intermediate",
      format: "in-class",
      minutes: 75,
      sections: [
        { kind: "multiple_choice", count: 10, pointsEach: 3 },
        { kind: "essay", count: 1, pointsEach: 20 },
      ],
      allowedResources: ["One index card"],
      includeAnswerKey: true,
      includeStudyGuide: true,
    };
    expect(coerceTestSpec(valid)).toEqual(valid);
  });

  it("yields defaults for null without throwing", () => {
    expect(() => coerceTestSpec(null)).not.toThrow();
    expect(coerceTestSpec(null)).toEqual(emptyTestSpec());
  });

  it("yields defaults for undefined without throwing", () => {
    expect(() => coerceTestSpec(undefined)).not.toThrow();
    expect(coerceTestSpec(undefined)).toEqual(emptyTestSpec());
  });

  it("yields defaults for a string without throwing", () => {
    expect(() => coerceTestSpec("not an object")).not.toThrow();
    expect(coerceTestSpec("not an object")).toEqual(emptyTestSpec());
  });

  it("yields defaults for an array without throwing", () => {
    expect(() => coerceTestSpec([1, 2, 3])).not.toThrow();
    expect(coerceTestSpec([1, 2, 3])).toEqual(emptyTestSpec());
  });

  it("yields defaults for a number without throwing", () => {
    expect(() => coerceTestSpec(42)).not.toThrow();
    expect(coerceTestSpec(42)).toEqual(emptyTestSpec());
  });
});

describe("testTotalPoints", () => {
  it("sums count * pointsEach across every section", () => {
    const spec: TestSpec = {
      ...emptyTestSpec(),
      sections: [
        { kind: "multiple_choice", count: 10, pointsEach: 2 },
        { kind: "essay", count: 1, pointsEach: 20 },
      ],
    };
    expect(testTotalPoints(spec)).toBe(40);
  });

  it("is 0 for a spec with no sections", () => {
    expect(testTotalPoints(emptyTestSpec())).toBe(0);
  });
});

describe("testQuestionCount", () => {
  it("sums count across every section", () => {
    const spec: TestSpec = {
      ...emptyTestSpec(),
      sections: [
        { kind: "multiple_choice", count: 10, pointsEach: 2 },
        { kind: "short_answer", count: 5, pointsEach: 6 },
      ],
    };
    expect(testQuestionCount(spec)).toBe(15);
  });

  it("is 0 for a spec with no sections", () => {
    expect(testQuestionCount(emptyTestSpec())).toBe(0);
  });
});

describe("TEST_QUESTION_KINDS / TEST_FORMATS vocab", () => {
  it("every question-kind entry carries a label, hint, promptContract, and canvasType", () => {
    expect(TEST_QUESTION_KINDS.length).toBe(4);
    for (const entry of TEST_QUESTION_KINDS) {
      expect(entry.label).toBeTruthy();
      expect(entry.hint).toBeTruthy();
      expect(entry.promptContract).toBeTruthy();
      expect(entry.canvasType).toBeTruthy();
    }
  });

  it("maps each kind to its Canvas classic-quiz question type", () => {
    const byValue = Object.fromEntries(TEST_QUESTION_KINDS.map((k) => [k.value, k.canvasType]));
    expect(byValue.multiple_choice).toBe("multiple_choice_question");
    expect(byValue.true_false).toBe("true_false_question");
    expect(byValue.short_answer).toBe("short_answer_question");
    expect(byValue.essay).toBe("essay_question");
  });

  it("every format entry carries a label, hint, and promptContract", () => {
    expect(TEST_FORMATS.length).toBeGreaterThan(0);
    for (const entry of TEST_FORMATS) {
      expect(entry.label).toBeTruthy();
      expect(entry.hint).toBeTruthy();
      expect(entry.promptContract).toBeTruthy();
    }
  });
});
