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
  it("maps lookahead to its own family", () => {
    expect(scopeFamilyForType("lookahead")).toBe("lookahead");
  });
  it("maps moduleOffset to its own family", () => {
    expect(scopeFamilyForType("moduleOffset")).toBe("moduleOffset");
  });
  it("maps concepts to its own family", () => {
    expect(scopeFamilyForType("concepts")).toBe("concepts");
  });
  it("returns null for non-entity, non-scalar types", () => {
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

  it("a '*' (all) scope covers both LIST and SINGLE hubCourse inputs (fan-out)", () => {
    // Unlike other entity families, hubCourse "*" IS covered when it fans out:
    // the fan-out runs once per course, pinning a concrete id each iteration.
    expect(scopeCoversType({ hubCourse: "*" }, "hubCourse")).toBe(true);
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

  it("treats a course fan-out as covering a single hubCourse input", () => {
    // Course "*" fan-out covers a single hubCourse input: fan-out runs once per
    // course, so the input is never asked.
    expect(scopeCoversType({ hubCourse: "*" }, "hubCourse")).toBe(true);
    // Course multi-id fan-out also covers it.
    expect(scopeCoversType({ hubCourse: "a\nb" }, "hubCourse")).toBe(true);
    expect(scopeCoversType({ hubCourse: "a\nb\nc" }, "hubCourse")).toBe(true);
    // A single course id still covers it via applyWorkflowScope (existing behavior).
    expect(scopeCoversType({ hubCourse: "single" }, "hubCourse")).toBe(true);
  });

  it("covers a lookahead input when the scope sets lookahead", () => {
    expect(scopeCoversType({ lookahead: "14" }, "lookahead")).toBe(true);
    expect(scopeCoversType({ lookahead: "7" }, "lookahead")).toBe(true);
    expect(scopeCoversType({ lookahead: "" }, "lookahead")).toBe(false);
    expect(scopeCoversType({}, "lookahead")).toBe(false);
    expect(scopeCoversType(undefined, "lookahead")).toBe(false);
  });

  it("covers a moduleOffset input when the scope sets moduleOffset", () => {
    expect(scopeCoversType({ moduleOffset: "1" }, "moduleOffset")).toBe(true);
    expect(scopeCoversType({ moduleOffset: "3" }, "moduleOffset")).toBe(true);
    expect(scopeCoversType({ moduleOffset: "" }, "moduleOffset")).toBe(false);
    expect(scopeCoversType({}, "moduleOffset")).toBe(false);
    expect(scopeCoversType(undefined, "moduleOffset")).toBe(false);
  });

  it("covers a concepts input when the scope sets concepts", () => {
    expect(scopeCoversType({ concepts: "A\nB" }, "concepts")).toBe(true);
    expect(scopeCoversType({ concepts: "single concept" }, "concepts")).toBe(true);
    expect(scopeCoversType({ concepts: "" }, "concepts")).toBe(false);
    expect(scopeCoversType({}, "concepts")).toBe(false);
    expect(scopeCoversType(undefined, "concepts")).toBe(false);
  });

  it("rejects '*' in concepts scope (not a valid concepts value)", () => {
    expect(scopeCoversType({ concepts: "*" }, "concepts")).toBe(false);
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

describe("collectRuntimeFields under course fan-out", () => {
  const inputs: Record<string, StepInputSpec[]> = {
    stepB: [
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
        type: "stepB",
        bindings: {
          hubCourse: { source: "runtime", fieldKey: "hubCourse" },
          topic: { source: "runtime", fieldKey: "topic" },
        },
      },
    ],
  };

  it("does not ask for the hubCourse when the scope targets all courses", () => {
    const scoped: WorkflowDef = { ...def, scope: { hubCourse: "*" } };
    const fields = collectRuntimeFields(scoped, lookup);
    expect(fields.map((f) => f.fieldKey)).toEqual(["topic"]);
  });

  it("does not ask for the hubCourse when the scope targets 2+ courses", () => {
    const scoped: WorkflowDef = { ...def, scope: { hubCourse: "a\nb" } };
    const fields = collectRuntimeFields(scoped, lookup);
    expect(fields.map((f) => f.fieldKey)).toEqual(["topic"]);
  });

  it("does not ask for the hubCourse when the scope targets a single course (existing behavior)", () => {
    const scoped: WorkflowDef = { ...def, scope: { hubCourse: "single" } };
    const fields = collectRuntimeFields(scoped, lookup);
    // A single concrete course is covered via applyWorkflowScope (existing behavior).
    expect(fields.map((f) => f.fieldKey)).toEqual(["topic"]);
  });

  it("still asks for the hubCourse when no course scope is set", () => {
    const fields = collectRuntimeFields(def, lookup);
    expect(fields.map((f) => f.fieldKey).sort()).toEqual(["hubCourse", "topic"]);
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

  it("drops a SINGLE entity field when the scope is '*' (all) and fans out", () => {
    // With course fan-out ("*"), the single hubCourse input is covered: fan-out
    // pins a concrete id per iteration.
    const scoped: WorkflowDef = { ...def, scope: { hubCourse: "*" } };
    const fields = collectRuntimeFields(scoped, lookup);
    expect(fields.map((f) => f.fieldKey)).toEqual(["topic"]);
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

  it("drops the module and course input when the course scope is '*' (all) and fans out", () => {
    // With course fan-out ("*"), both the single hubCourse input and the module
    // are covered: the fan-out pins a concrete course per iteration, so the module is derived.
    const scoped: WorkflowDef = { ...def, scope: { hubCourse: "*" } };
    const fields = collectRuntimeFields(scoped, lookup);
    expect(fields.map((f) => f.fieldKey)).toEqual(["topic"]);
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

describe("collectRuntimeFields - courseDerived input under a scoped course", () => {
  const inputs: Record<string, StepInputSpec[]> = {
    content: [
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: false },
      { key: "objectives", label: "Module objectives", type: "longtext", required: false, courseDerived: true },
      { key: "context", label: "Context", type: "longtext", required: false },
    ],
  };
  const lookup = (type: string) => inputs[type];
  const def: WorkflowDef = {
    id: "w",
    name: "W",
    description: "",
    steps: [
      {
        type: "content",
        bindings: {
          hubCourse: { source: "runtime", fieldKey: "hubCourse" },
          objectives: { source: "runtime", fieldKey: "objectives" },
          context: { source: "runtime", fieldKey: "context" },
        },
      },
    ],
  };

  it("drops the courseDerived objectives when a course is scoped, keeps a plain longtext", () => {
    const scoped: WorkflowDef = { ...def, scope: { hubCourse: "tile1" } };
    const fields = collectRuntimeFields(scoped, lookup);
    // hubCourse concrete -> covered (dropped); objectives is courseDerived and a
    // course is scoped -> derived, not asked; context is a plain longtext -> kept.
    expect(fields.map((f) => f.fieldKey)).toEqual(["context"]);
  });

  it("still asks for the objectives when no course is scoped", () => {
    const fields = collectRuntimeFields(def, lookup);
    expect(fields.map((f) => f.fieldKey).sort()).toEqual(["context", "hubCourse", "objectives"]);
  });
});

describe("collectRuntimeFields with lookahead scope", () => {
  const inputs: Record<string, StepInputSpec[]> = {
    checkDeadlines: [
      { key: "lookahead", label: "How far ahead", type: "lookahead", required: false },
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
        type: "checkDeadlines",
        bindings: {
          lookahead: { source: "runtime", fieldKey: "lookahead" },
          topic: { source: "runtime", fieldKey: "topic" },
        },
      },
    ],
  };

  it("hides the lookahead field when the scope sets it", () => {
    const scoped: WorkflowDef = { ...def, scope: { lookahead: "14" } };
    const fields = collectRuntimeFields(scoped, lookup);
    expect(fields.map((f) => f.fieldKey)).toEqual(["topic"]);
  });

  it("asks for the lookahead field when the scope does not set it", () => {
    const fields = collectRuntimeFields(def, lookup);
    expect(fields.map((f) => f.fieldKey).sort()).toEqual(["lookahead", "topic"]);
  });
});

describe("collectRuntimeFields with moduleOffset scope", () => {
  const inputs: Record<string, StepInputSpec[]> = {
    modulesTask: [
      { key: "modulesAhead", label: "Modules ahead", type: "moduleOffset", required: false },
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
        type: "modulesTask",
        bindings: {
          modulesAhead: { source: "runtime", fieldKey: "modulesAhead" },
          topic: { source: "runtime", fieldKey: "topic" },
        },
      },
    ],
  };

  it("hides the moduleOffset field when the scope sets it", () => {
    const scoped: WorkflowDef = { ...def, scope: { moduleOffset: "2" } };
    const fields = collectRuntimeFields(scoped, lookup);
    expect(fields.map((f) => f.fieldKey)).toEqual(["topic"]);
  });

  it("asks for the moduleOffset field when the scope does not set it", () => {
    const fields = collectRuntimeFields(def, lookup);
    expect(fields.map((f) => f.fieldKey).sort()).toEqual(["modulesAhead", "topic"]);
  });
});

describe("collectRuntimeFields with concepts scope", () => {
  const inputs: Record<string, StepInputSpec[]> = {
    deckBuilder: [
      { key: "concepts", label: "Concepts", type: "concepts", required: false },
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
        type: "deckBuilder",
        bindings: {
          concepts: { source: "runtime", fieldKey: "concepts" },
          topic: { source: "runtime", fieldKey: "topic" },
        },
      },
    ],
  };

  it("hides the concepts field when the scope sets it", () => {
    const scoped: WorkflowDef = { ...def, scope: { concepts: "A\nB" } };
    const fields = collectRuntimeFields(scoped, lookup);
    expect(fields.map((f) => f.fieldKey)).toEqual(["topic"]);
  });

  it("asks for the concepts field when the scope does not set it", () => {
    const fields = collectRuntimeFields(def, lookup);
    expect(fields.map((f) => f.fieldKey).sort()).toEqual(["concepts", "topic"]);
  });
});

describe("applyWorkflowScope with lookahead", () => {
  it("returns the scope lookahead value when run form is empty", () => {
    expect(applyWorkflowScope("lookahead", "", { lookahead: "14" })).toBe("14");
    expect(applyWorkflowScope("lookahead", "", { lookahead: "7" })).toBe("7");
  });

  it("returns the run-form value when non-empty (a per-run override)", () => {
    expect(applyWorkflowScope("lookahead", "30", { lookahead: "14" })).toBe("30");
  });

  it("rejects '*' in lookahead scope (not a valid days value) and falls back to run value", () => {
    expect(applyWorkflowScope("lookahead", "", { lookahead: "*" })).toBe("");
    expect(applyWorkflowScope("lookahead", "7", { lookahead: "*" })).toBe("7");
  });
});

describe("applyWorkflowScope with moduleOffset", () => {
  it("returns the scope moduleOffset value when run form is empty", () => {
    expect(applyWorkflowScope("moduleOffset", "", { moduleOffset: "2" })).toBe("2");
    expect(applyWorkflowScope("moduleOffset", "", { moduleOffset: "1" })).toBe("1");
  });

  it("returns the run-form value when non-empty (a per-run override)", () => {
    expect(applyWorkflowScope("moduleOffset", "3", { moduleOffset: "2" })).toBe("3");
  });

  it("rejects '*' in moduleOffset scope (not a valid modules value) and falls back to run value", () => {
    expect(applyWorkflowScope("moduleOffset", "", { moduleOffset: "*" })).toBe("");
    expect(applyWorkflowScope("moduleOffset", "1", { moduleOffset: "*" })).toBe("1");
  });
});

describe("applyWorkflowScope with concepts", () => {
  it("returns the scope concepts value when run form is empty", () => {
    expect(applyWorkflowScope("concepts", "", { concepts: "A\nB" })).toBe("A\nB");
    expect(applyWorkflowScope("concepts", "", { concepts: "single" })).toBe("single");
  });

  it("returns the run-form value when non-empty (a per-run override)", () => {
    expect(applyWorkflowScope("concepts", "user choice", { concepts: "A\nB" })).toBe("user choice");
  });

  it("rejects '*' in concepts scope (not a valid concepts value) and falls back to run value", () => {
    expect(applyWorkflowScope("concepts", "", { concepts: "*" })).toBe("");
    expect(applyWorkflowScope("concepts", "fallback", { concepts: "*" })).toBe("fallback");
  });
});

describe("describeWorkflowScope with lookahead", () => {
  it("includes a lookahead summary in the scope description", () => {
    expect(describeWorkflowScope({ lookahead: "14" })).toBe("looking 14 day(s) ahead");
    expect(describeWorkflowScope({ lookahead: "7" })).toBe("looking 7 day(s) ahead");
    expect(describeWorkflowScope({ institution: "MCC", lookahead: "14" })).toBe(
      "institution MCC, looking 14 day(s) ahead"
    );
  });

  it("ignores invalid lookahead values", () => {
    expect(describeWorkflowScope({ lookahead: "not-a-number" })).toBe("");
    expect(describeWorkflowScope({ lookahead: "  " })).toBe("");
  });
});

describe("describeWorkflowScope with moduleOffset", () => {
  it("includes a moduleOffset summary in the scope description", () => {
    expect(describeWorkflowScope({ moduleOffset: "2" })).toBe("2 module(s) ahead");
    expect(describeWorkflowScope({ moduleOffset: "1" })).toBe("1 module(s) ahead");
    expect(describeWorkflowScope({ institution: "MCC", moduleOffset: "2" })).toBe(
      "institution MCC, 2 module(s) ahead"
    );
  });

  it("ignores zero or invalid moduleOffset values", () => {
    expect(describeWorkflowScope({ moduleOffset: "0" })).toBe("");
    expect(describeWorkflowScope({ moduleOffset: "not-a-number" })).toBe("");
    expect(describeWorkflowScope({ moduleOffset: "  " })).toBe("");
  });
});

describe("describeScopeForType with lookahead", () => {
  it("returns the days ahead for a lookahead type", () => {
    expect(describeScopeForType({ lookahead: "14" }, "lookahead")).toBe("14 day(s) ahead");
    expect(describeScopeForType({ lookahead: "7" }, "lookahead")).toBe("7 day(s) ahead");
  });

  it("returns empty when lookahead scope is not set", () => {
    expect(describeScopeForType(undefined, "lookahead")).toBe("");
    expect(describeScopeForType({}, "lookahead")).toBe("");
  });

  it("still handles entity types correctly", () => {
    expect(describeScopeForType({ hubCourse: "a\nb" }, "hubCourseList")).toBe("2 course tile(s)");
    expect(describeScopeForType({ org: "*" }, "orgList")).toBe("all organizations");
  });
});

describe("describeScopeForType with moduleOffset", () => {
  it("returns the modules ahead for a moduleOffset type", () => {
    expect(describeScopeForType({ moduleOffset: "2" }, "moduleOffset")).toBe("2 module(s) ahead");
    expect(describeScopeForType({ moduleOffset: "1" }, "moduleOffset")).toBe("1 module(s) ahead");
  });

  it("returns empty when moduleOffset scope is not set", () => {
    expect(describeScopeForType(undefined, "moduleOffset")).toBe("");
    expect(describeScopeForType({}, "moduleOffset")).toBe("");
  });

  it("still handles entity types correctly", () => {
    expect(describeScopeForType({ hubCourse: "a\nb" }, "hubCourseList")).toBe("2 course tile(s)");
    expect(describeScopeForType({ org: "*" }, "orgList")).toBe("all organizations");
  });
});

describe("describeWorkflowScope with concepts", () => {
  it("includes a concepts summary in the scope description", () => {
    expect(describeWorkflowScope({ concepts: "A\nB\nC" })).toBe("3 concept(s) targeted");
    expect(describeWorkflowScope({ concepts: "single" })).toBe("1 concept(s) targeted");
    expect(describeWorkflowScope({ institution: "MCC", concepts: "A\nB" })).toBe(
      "institution MCC, 2 concept(s) targeted"
    );
  });

  it("ignores empty concepts values", () => {
    expect(describeWorkflowScope({ concepts: "" })).toBe("");
    expect(describeWorkflowScope({ concepts: "  " })).toBe("");
  });

  it("still handles entity types correctly", () => {
    expect(describeWorkflowScope({ hubCourse: "a\nb" })).toBe("2 course tile(s)");
    expect(describeWorkflowScope({ org: "*" })).toBe("all organizations");
  });
});

describe("describeScopeForType with concepts", () => {
  it("returns the concepts count for a concepts type", () => {
    expect(describeScopeForType({ concepts: "A\nB\nC" }, "concepts")).toBe("3 concept(s) targeted");
    expect(describeScopeForType({ concepts: "single" }, "concepts")).toBe("1 concept(s) targeted");
  });

  it("returns empty when concepts scope is not set", () => {
    expect(describeScopeForType(undefined, "concepts")).toBe("");
    expect(describeScopeForType({}, "concepts")).toBe("");
  });

  it("returns empty for '*' in concepts scope (invalid)", () => {
    expect(describeScopeForType({ concepts: "*" }, "concepts")).toBe("");
  });

  it("still handles entity types correctly", () => {
    expect(describeScopeForType({ hubCourse: "a\nb" }, "hubCourseList")).toBe("2 course tile(s)");
    expect(describeScopeForType({ org: "*" }, "orgList")).toBe("all organizations");
  });
});
