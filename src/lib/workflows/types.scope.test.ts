import { describe, it, expect } from "vitest";
import {
  scopeFamilyForType,
  scopeCoversType,
  applyWorkflowScope,
  describeWorkflowScope,
  describeScopeForType,
  collectRuntimeFields,
  type WorkflowDef,
  type StepInputSpec,
} from "./types";

describe("scopeFamilyForType", () => {
  it("maps single and list variants to a shared family", () => {
    expect(scopeFamilyForType("institution")).toBe("institution");
    expect(scopeFamilyForType("hubCourse")).toBe("hubCourse");
    expect(scopeFamilyForType("hubCourseList")).toBe("hubCourse");
    expect(scopeFamilyForType("lmsCourse")).toBe("lmsCourse");
    expect(scopeFamilyForType("lmsCourseList")).toBe("lmsCourse");
    expect(scopeFamilyForType("org")).toBe("org");
    expect(scopeFamilyForType("orgList")).toBe("org");
  });
  it("returns null for non-entity types", () => {
    expect(scopeFamilyForType("text")).toBeNull();
    expect(scopeFamilyForType("number")).toBeNull();
    expect(scopeFamilyForType("repo")).toBeNull();
  });
});

describe("scopeCoversType", () => {
  it("is true only when the family has a non-empty value", () => {
    expect(scopeCoversType({ hubCourse: "abc" }, "hubCourse")).toBe(true);
    expect(scopeCoversType({ hubCourse: "abc" }, "hubCourseList")).toBe(true);
    expect(scopeCoversType({ hubCourse: "" }, "hubCourse")).toBe(false);
    expect(scopeCoversType({ hubCourse: "   " }, "hubCourse")).toBe(false);
    expect(scopeCoversType({}, "hubCourse")).toBe(false);
    expect(scopeCoversType(undefined, "hubCourse")).toBe(false);
    expect(scopeCoversType({ hubCourse: "abc" }, "text")).toBe(false);
  });

  it("a '*' (all) scope covers a LIST input but not a SINGLE input", () => {
    // A single input cannot express "all", so it stays in the run form.
    expect(scopeCoversType({ hubCourse: "*" }, "hubCourse")).toBe(false);
    expect(scopeCoversType({ hubCourse: "*" }, "hubCourseList")).toBe(true);
  });

  it("treats institution '*' as covering an institution input (fan-out fills it)", () => {
    // Unlike other single-entity families, institution "*" IS covered: fan-out
    // runs the workflow once per institution, so the input is never asked.
    expect(scopeCoversType({ institution: "*" }, "institution")).toBe(true);
    expect(scopeCoversType({ institution: "MCC" }, "institution")).toBe(true);
    expect(scopeCoversType({}, "institution")).toBe(false);
    expect(scopeCoversType(undefined, "institution")).toBe(false);
  });
});

describe("collectRuntimeFields under institution fan-out", () => {
  const inputs: Record<string, StepInputSpec[]> = {
    stepA: [
      { key: "institution", label: "Institution", type: "institution", required: true },
      { key: "topic", label: "Topic", type: "text", required: true },
    ],
  };
  const lookup = (type: string) => inputs[type];
  const def: WorkflowDef = {
    id: "w",
    name: "W",
    description: "",
    steps: [
      {
        type: "stepA",
        bindings: {
          institution: { source: "runtime", fieldKey: "institution" },
          topic: { source: "runtime", fieldKey: "topic" },
        },
      },
    ],
  };

  it("does not ask for the institution when the scope targets all institutions", () => {
    const scoped: WorkflowDef = { ...def, scope: { institution: "*" } };
    const fields = collectRuntimeFields(scoped, lookup);
    expect(fields.map((f) => f.fieldKey)).toEqual(["topic"]);
  });

  it("still asks for the institution when no institution scope is set", () => {
    const fields = collectRuntimeFields(def, lookup);
    expect(fields.map((f) => f.fieldKey).sort()).toEqual(["institution", "topic"]);
  });
});

describe("applyWorkflowScope", () => {
  it("keeps a non-empty run-form value (a per-run override)", () => {
    expect(applyWorkflowScope("hubCourse", "chosen", { hubCourse: "scoped" })).toBe("chosen");
  });
  it("returns the run value unchanged for non-entity types or no scope", () => {
    expect(applyWorkflowScope("text", "", { hubCourse: "x" })).toBe("");
    expect(applyWorkflowScope("hubCourse", "", undefined)).toBe("");
    expect(applyWorkflowScope("hubCourse", "", {})).toBe("");
  });
  it("fills a list input with the scope value as-is (including '*')", () => {
    expect(applyWorkflowScope("hubCourseList", "", { hubCourse: "a\nb" })).toBe("a\nb");
    expect(applyWorkflowScope("hubCourseList", "", { hubCourse: "*" })).toBe("*");
  });
  it("fills a single input with the first concrete item and never '*'", () => {
    expect(applyWorkflowScope("hubCourse", "", { hubCourse: "a\nb" })).toBe("a");
    expect(applyWorkflowScope("hubCourse", "", { hubCourse: "solo" })).toBe("solo");
    // "*" cannot be a single value -> falls back to the (empty) run value.
    expect(applyWorkflowScope("hubCourse", "", { hubCourse: "*" })).toBe("");
  });
  it("applies institution scope (single) too", () => {
    expect(applyWorkflowScope("institution", "", { institution: "MCC" })).toBe("MCC");
  });
});

describe("describeWorkflowScope", () => {
  it("summarizes set families, using 'all' for the wildcard", () => {
    expect(describeWorkflowScope({ institution: "MCC" })).toBe("institution MCC");
    expect(describeWorkflowScope({ hubCourse: "*" })).toBe("all course tiles");
    expect(describeWorkflowScope({ hubCourse: "a\nb\nc" })).toBe("3 course tile(s)");
    expect(describeWorkflowScope({ org: "*" })).toBe("all organizations");
    expect(describeWorkflowScope({ institution: "*" })).toBe("all institutions");
  });
  it("returns empty for no scope / empty scope", () => {
    expect(describeWorkflowScope(undefined)).toBe("");
    expect(describeWorkflowScope({})).toBe("");
    expect(describeWorkflowScope({ hubCourse: "  " })).toBe("");
  });
});

describe("describeScopeForType", () => {
  it("returns empty when scope does not cover the type", () => {
    expect(describeScopeForType(undefined, "hubCourseList")).toBe("");
    expect(describeScopeForType({}, "hubCourseList")).toBe("");
  });

  it("returns empty for non-entity types", () => {
    expect(describeScopeForType({ hubCourse: "x" }, "text")).toBe("");
  });

  it("shows 'all' for a list with wildcard scope", () => {
    expect(describeScopeForType({ hubCourse: "*" }, "hubCourseList")).toBe("all course tiles");
    expect(describeScopeForType({ org: "*" }, "orgList")).toBe("all organizations");
  });

  it("shows a count for a list with concrete values", () => {
    expect(describeScopeForType({ hubCourse: "a\nb\nc" }, "hubCourseList")).toBe("3 course tile(s)");
  });

  it("passes through a single entity value", () => {
    expect(describeScopeForType({ institution: "MCC" }, "institution")).toBe("MCC");
    expect(describeScopeForType({ hubCourse: "tile1" }, "hubCourse")).toBe("tile1");
  });

  it("returns empty for a single entity with wildcard scope", () => {
    expect(describeScopeForType({ hubCourse: "*" }, "hubCourse")).toBe("");
  });
});

describe("collectRuntimeFields with a workflow scope", () => {
  const inputs: Record<string, StepInputSpec[]> = {
    stepA: [
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: true },
      { key: "topic", label: "Topic", type: "text", required: true },
    ],
  };
  const lookup = (type: string) => inputs[type];
  const def: WorkflowDef = {
    id: "w",
    name: "W",
    description: "",
    steps: [
      {
        type: "stepA",
        bindings: {
          hubCourse: { source: "runtime", fieldKey: "hubCourse" },
          topic: { source: "runtime", fieldKey: "topic" },
        },
      },
    ],
  };

  it("still asks for entity fields when the scope does not cover them", () => {
    const fields = collectRuntimeFields(def, lookup);
    expect(fields.map((f) => f.fieldKey).sort()).toEqual(["hubCourse", "topic"]);
  });

  it("drops a single entity field the workflow scope concretely targets", () => {
    const scoped: WorkflowDef = { ...def, scope: { hubCourse: "tile1" } };
    const fields = collectRuntimeFields(scoped, lookup);
    expect(fields.map((f) => f.fieldKey)).toEqual(["topic"]);
  });

  it("keeps a SINGLE entity field when the scope is '*' (all) - it cannot fill one", () => {
    const scoped: WorkflowDef = { ...def, scope: { hubCourse: "*" } };
    const fields = collectRuntimeFields(scoped, lookup);
    expect(fields.map((f) => f.fieldKey).sort()).toEqual(["hubCourse", "topic"]);
  });
});

describe("collectRuntimeFields - module input under a scoped course", () => {
  const inputs: Record<string, StepInputSpec[]> = {
    prep: [
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: false },
      { key: "moduleId", label: "Module", type: "lmsModule", required: false },
      { key: "topic", label: "Topic", type: "text", required: true },
    ],
  };
  const lookup = (type: string) => inputs[type];
  const def: WorkflowDef = {
    id: "w",
    name: "W",
    description: "",
    steps: [
      {
        type: "prep",
        bindings: {
          hubCourse: { source: "runtime", fieldKey: "hubCourse" },
          moduleId: { source: "runtime", fieldKey: "moduleId" },
          topic: { source: "runtime", fieldKey: "topic" },
        },
      },
    ],
  };

  it("asks for the module when no course is scoped", () => {
    const fields = collectRuntimeFields(def, lookup);
    expect(fields.map((f) => f.fieldKey).sort()).toEqual(["hubCourse", "moduleId", "topic"]);
  });

  it("drops the module when a concrete course is scoped (course + module both filled)", () => {
    const scoped: WorkflowDef = { ...def, scope: { hubCourse: "tile1" } };
    const fields = collectRuntimeFields(scoped, lookup);
    expect(fields.map((f) => f.fieldKey)).toEqual(["topic"]);
  });

  it("drops the module when the course scope is '*' (all), but still asks the single course input", () => {
    const scoped: WorkflowDef = { ...def, scope: { hubCourse: "*" } };
    const fields = collectRuntimeFields(scoped, lookup);
    expect(fields.map((f) => f.fieldKey).sort()).toEqual(["hubCourse", "topic"]);
  });

  it("does NOT skip an opaque 'modules' payload input (only lmsModule is course-derived)", () => {
    const modInputs: Record<string, StepInputSpec[]> = {
      pop: [
        { key: "hubCourse", label: "Course tile", type: "hubCourse", required: false },
        { key: "modules", label: "LMS modules", type: "modules", required: false },
      ],
    };
    const modDef: WorkflowDef = {
      id: "w2",
      name: "W2",
      description: "",
      scope: { hubCourse: "tile1" },
      steps: [
        {
          type: "pop",
          bindings: {
            hubCourse: { source: "runtime", fieldKey: "hubCourse" },
            modules: { source: "runtime", fieldKey: "modules" },
          },
        },
      ],
    };
    const fields = collectRuntimeFields(modDef, (t) => modInputs[t]);
    // hubCourse concrete -> covered (dropped); modules is NOT a course-derived
    // picker -> still asked.
    expect(fields.map((f) => f.fieldKey)).toEqual(["modules"]);
  });
});
