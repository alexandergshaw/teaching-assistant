// TDD for CHUNK E of the Course Build cleanup, written from the acceptance criteria
// BEFORE the implementation existed. Make these pass without changing what they assert.
//
// THE PROBLEM. Presets wire steps together by ARRAY POSITION: 215 `stepIndex` references
// and 104 positional `"N.key"` include keys across six preset files. A measured
// experiment - insert one step into COURSE_REFRESH at index 6, re-expand COURSE_BUILD -
// silently grew the run form from 29 fields to 37 and re-pointed 20 include keys, with no
// compile error and no runtime error. Every mainstream workflow engine solved this with
// named references (Argo: `steps['my-step'].outputs.result`; GitHub Actions:
// `steps.<id>.outputs`).
//
// THE DESIGN. Ids are an AUTHORING-TIME convenience that `expandWorkflowDef` LOWERS to
// indices, so both run engines keep consuming `stepIndex` exactly as today.
//
// THE TRAP THIS FILE EXISTS TO CATCH, and why an earlier draft was thrown away: an id
// must resolve to its EXPANDED index (`defToExpanded`, which skips include steps and
// accounts for the many steps each absorbs), NOT its raw position in `def.steps`. Those
// agree for every step BEFORE an include and diverge for every step after one. The
// earlier draft placed every include step LAST, so the two coincided everywhere and
// `def.steps.findIndex(s => s.id === id)` passed the entire file - an implementation that
// would mis-wire everything after COURSE_BUILD's mid-list include by ~18 positions.
// Several tests below exist solely to make that implementation fail. Do not "simplify"
// the include steps out of them.
import { describe, it, expect } from "vitest";
import { expandWorkflowDef, type WorkflowDef } from "@/lib/workflows/types";

function def(steps: WorkflowDef["steps"], id = "wf"): WorkflowDef {
  return { id, name: id, description: "", steps };
}

const noLookup = () => undefined;

// A source workflow with THREE steps, so including it shifts everything after it by 3.
const SOURCE_3 = def(
  [
    { id: "s0", type: "load-course-tile", bindings: {} },
    { id: "s1", type: "generate-schedule", bindings: {} },
    { id: "s2", type: "lecture-zip", bindings: {} },
  ],
  "src3"
);
const lookup3 = (id: string) => (id === "src3" ? SOURCE_3 : undefined);

describe("AC E1/E2 - a binding may name its source step by id", () => {
  it("resolves a stepId to the same expanded index the equivalent stepIndex would give", () => {
    const byId = def([
      { id: "tile", type: "load-course-tile", bindings: {} },
      { id: "schedule", type: "generate-schedule", bindings: { description: { source: "step", stepId: "tile", outputKey: "description" } } },
    ]);
    const byIndex = def([
      { type: "load-course-tile", bindings: {} },
      { type: "generate-schedule", bindings: { description: { source: "step", stepIndex: 0, outputKey: "description" } } },
    ]);
    expect(expandWorkflowDef(byId, noLookup).steps[1].bindings.description).toEqual(
      expandWorkflowDef(byIndex, noLookup).steps[1].bindings.description
    );
  });

  it("lowers stepId to stepIndex, so the run engines never see an id", () => {
    const d = def([
      { id: "tile", type: "load-course-tile", bindings: {} },
      { id: "schedule", type: "generate-schedule", bindings: { description: { source: "step", stepId: "tile", outputKey: "description" } } },
    ]);
    const binding = expandWorkflowDef(d, noLookup).steps[1].bindings.description;
    expect(binding).toEqual({ source: "step", stepIndex: 0, outputKey: "description" });
    // Load-bearing: expanded steps are JSON-serialized into run logs, and both engines
    // read `stepIndex` unconditionally. A residual stepId would read as undefined there.
    expect(binding).not.toHaveProperty("stepId");
  });

  // THE headline test. The inserted step goes BEFORE the target, so the target's index
  // genuinely MOVES (0 -> 1). An implementation that hard-codes or mis-resolves fails.
  it("survives a step inserted BEFORE the target - the index moves and the id still lands", () => {
    const d = def([
      { id: "inserted", type: "select-course-modules", bindings: {} },
      { id: "tile", type: "load-course-tile", bindings: {} },
      { id: "schedule", type: "generate-schedule", bindings: { description: { source: "step", stepId: "tile", outputKey: "description" } } },
    ]);
    expect(expandWorkflowDef(d, noLookup).steps[2].bindings.description).toEqual({
      source: "step",
      stepIndex: 1,
      outputKey: "description",
    });
  });

  // THE CRITICAL TEST. An include-workflow step sits BEFORE the id-bound step and absorbs
  // three steps, so the target `tile` is at RAW index 2 but EXPANDED index 4. Resolving
  // against `def.steps` gives 2 and is wrong. This is the only shape that separates a
  // correct implementation from the plausible wrong one.
  it("resolves against EXPANDED coordinates, not the raw def.steps array, when an include precedes the target", () => {
    const d = def([
      { id: "pre", type: "load-course-tile", bindings: {} },
      { id: "inc", type: "include-workflow", bindings: {}, include: { workflowId: "src3", skipSteps: [], remap: {} } },
      { id: "tile", type: "load-course-tile", bindings: {} },
      { id: "consumer", type: "generate-schedule", bindings: { description: { source: "step", stepId: "tile", outputKey: "description" } } },
    ]);
    const out = expandWorkflowDef(d, lookup3);
    // pre(0) + three absorbed(1,2,3) + tile(4) + consumer(5)
    expect(out.steps.map((s) => s.type)).toEqual([
      "load-course-tile",
      "load-course-tile",
      "generate-schedule",
      "lecture-zip",
      "load-course-tile",
      "generate-schedule",
    ]);
    expect(out.steps[5].bindings.description).toEqual({ source: "step", stepIndex: 4, outputKey: "description" });
    // Stated explicitly so nobody "fixes" the expectation to the raw index.
    expect(out.steps[5].bindings.description).not.toEqual({ source: "step", stepIndex: 2, outputKey: "description" });
  });

  it("an id-bound step BEFORE an include is unaffected - raw and expanded agree there", () => {
    const d = def([
      { id: "tile", type: "load-course-tile", bindings: {} },
      { id: "consumer", type: "generate-schedule", bindings: { description: { source: "step", stepId: "tile", outputKey: "description" } } },
      { id: "inc", type: "include-workflow", bindings: {}, include: { workflowId: "src3", skipSteps: [], remap: {} } },
    ]);
    expect(expandWorkflowDef(d, lookup3).steps[1].bindings.description).toEqual({
      source: "step",
      stepIndex: 0,
      outputKey: "description",
    });
  });
});

describe("AC E2 - runIf gates lower too", () => {
  // The expander translates runIf in a SEPARATE code path from bindings. An implementer
  // who lowers only `step.bindings` leaves a raw stepId in the gate, and at run time
  // `String(undefined).trim().toLowerCase()` is "undefined", which is TRUTHY - so a gate
  // that should hold the step back runs it instead. It fails OPEN, which is why this gets
  // its own coverage rather than riding on the bindings tests.
  it("lowers a stepId in a runIf gate on the workflow's OWN step", () => {
    const d = def([
      { id: "resolve", type: "resolve-codebase-repo", bindings: {} },
      {
        id: "fill",
        type: "fill-readmes",
        bindings: {},
        runIf: { binding: { source: "step", stepId: "resolve", outputKey: "repo" }, expected: true },
      },
    ]);
    expect(expandWorkflowDef(d, noLookup).steps[1].runIf).toEqual({
      binding: { source: "step", stepIndex: 0, outputKey: "repo" },
      expected: true,
    });
  });

  it("lowers a stepId in a runIf gate when an include precedes it", () => {
    const d = def([
      { id: "inc", type: "include-workflow", bindings: {}, include: { workflowId: "src3", skipSteps: [], remap: {} } },
      { id: "resolve", type: "resolve-codebase-repo", bindings: {} },
      {
        id: "fill",
        type: "fill-readmes",
        bindings: {},
        runIf: { binding: { source: "step", stepId: "resolve", outputKey: "repo" }, expected: true },
      },
    ]);
    expect(expandWorkflowDef(d, lookup3).steps[4].runIf).toEqual({
      binding: { source: "step", stepIndex: 3, outputKey: "repo" },
      expected: true,
    });
  });
});

describe("AC E2 - an unresolvable id is LOUD, never a silent fallback", () => {
  it("throws naming BOTH the unknown id and the workflow it appears in", () => {
    const d = def(
      [
        { id: "tile", type: "load-course-tile", bindings: {} },
        { id: "schedule", type: "generate-schedule", bindings: { description: { source: "step", stepId: "ghost", outputKey: "description" } } },
      ],
      "my-workflow"
    );
    expect(() => expandWorkflowDef(d, noLookup)).toThrow(/ghost/);
    expect(() => expandWorkflowDef(d, noLookup)).toThrow(/my-workflow/);
  });

  it("a FORWARD id reference throws, and says so distinguishably from an unknown id", () => {
    const d = def([
      { id: "first", type: "generate-schedule", bindings: { description: { source: "step", stepId: "later", outputKey: "description" } } },
      { id: "later", type: "load-course-tile", bindings: {} },
    ]);
    // Must name the id...
    expect(() => expandWorkflowDef(d, noLookup)).toThrow(/later/);
    // ...and must NOT read as a plain unknown/missing id, which would let an
    // implementation skip the forward-reference rule entirely and still pass.
    expect(() => expandWorkflowDef(d, noLookup)).toThrow(/forward|not yet|earlier|before/i);
  });

  // An id naming an include-workflow step is never a valid BINDING target: an include
  // expands to many steps and exposes no outputs of its own, which is exactly why
  // `defToExpanded` deliberately never maps one.
  it("a binding whose stepId names an include-workflow step throws", () => {
    const d = def([
      { id: "inc", type: "include-workflow", bindings: {}, include: { workflowId: "src3", skipSteps: [], remap: {} } },
      { id: "consumer", type: "generate-schedule", bindings: { description: { source: "step", stepId: "inc", outputKey: "description" } } },
    ]);
    expect(() => expandWorkflowDef(d, lookup3)).toThrow(/inc/);
  });

  // Duplicate ids are an AUTHORING-HYGIENE problem, and expansion runs on every render of
  // the workflow list - for stored custom workflows too. A duplicate nobody names must
  // NOT take the render path down; that belongs to the build-time validator. Only an
  // AMBIGUOUS REFERENCE - an id actually used, resolving to more than one step - throws.
  it("tolerates unreferenced duplicate ids rather than breaking the render path", () => {
    const d = def([
      { id: "same", type: "load-course-tile", bindings: {} },
      { id: "same", type: "generate-schedule", bindings: {} },
    ]);
    expect(() => expandWorkflowDef(d, noLookup)).not.toThrow();
  });

  it("throws when a duplicated id is actually REFERENCED, naming it as ambiguous", () => {
    const d = def([
      { id: "same", type: "load-course-tile", bindings: {} },
      { id: "same", type: "generate-schedule", bindings: {} },
      { id: "consumer", type: "lecture-zip", bindings: { schedule: { source: "step", stepId: "same", outputKey: "schedule" } } },
    ]);
    expect(() => expandWorkflowDef(d, noLookup)).toThrow(/same/);
    expect(() => expandWorkflowDef(d, noLookup)).toThrow(/ambiguous|duplicate|more than one/i);
  });
});

describe("AC E3 - include remap and bindOverrides keys may use ids", () => {
  const source = def(
    [
      { id: "src-tile", type: "load-course-tile", bindings: {} },
      { id: "src-guides", type: "generate-course-guides", bindings: { files: { source: "step", stepId: "src-tile", outputKey: "course" } } },
    ],
    "src"
  );
  const lookup = (id: string) => (id === "src" ? source : undefined);

  it("an id-keyed bindOverride hits the same step as the equivalent index-keyed one", () => {
    const byId = def([
      { id: "tile", type: "load-course-tile", bindings: {} },
      {
        id: "inc",
        type: "include-workflow",
        bindings: {},
        include: { workflowId: "src", skipSteps: [], remap: {}, bindOverrides: { "src-guides.selected": { source: "literal", value: "1" } } },
      },
    ]);
    const byIndex = def([
      { type: "load-course-tile", bindings: {} },
      {
        type: "include-workflow",
        bindings: {},
        include: { workflowId: "src", skipSteps: [], remap: {}, bindOverrides: { "1.selected": { source: "literal", value: "1" } } },
      },
    ]);
    const a = expandWorkflowDef(byId, lookup).steps.at(-1)!.bindings.selected;
    expect(a).toEqual({ source: "literal", value: "1" });
    expect(a).toEqual(expandWorkflowDef(byIndex, lookup).steps.at(-1)!.bindings.selected);
  });

  it("an id-keyed remap hits the same dropped step as the equivalent index-keyed one", () => {
    const d = def([
      { id: "tile", type: "load-course-tile", bindings: {} },
      {
        id: "inc",
        type: "include-workflow",
        bindings: {},
        include: { workflowId: "src", skipSteps: [0], remap: { "src-tile.course": { source: "step", stepId: "tile", outputKey: "course" } } },
      },
    ]);
    expect(expandWorkflowDef(d, lookup).steps.at(-1)!.bindings.files).toEqual({
      source: "step",
      stepIndex: 0,
      outputKey: "course",
    });
  });

  // A bindOverride VALUE (not key) carrying a stepId is a separate code path from a remap
  // value and from an own-step binding. All three must lower.
  it("lowers a stepId used as a bindOverride VALUE", () => {
    const d = def([
      { id: "tile", type: "load-course-tile", bindings: {} },
      {
        id: "inc",
        type: "include-workflow",
        bindings: {},
        include: {
          workflowId: "src",
          skipSteps: [],
          remap: {},
          bindOverrides: { "src-guides.selected": { source: "step", stepId: "tile", outputKey: "course" } },
        },
      },
    ]);
    expect(expandWorkflowDef(d, lookup).steps.at(-1)!.bindings.selected).toEqual({
      source: "step",
      stepIndex: 0,
      outputKey: "course",
    });
  });

  it("an include key naming an id that does not exist THROWS, naming it", () => {
    const d = def([
      {
        id: "inc",
        type: "include-workflow",
        bindings: {},
        include: { workflowId: "src", skipSteps: [], remap: {}, bindOverrides: { "no-such-step.selected": { source: "literal", value: "1" } } },
      },
    ]);
    expect(() => expandWorkflowDef(d, lookup)).toThrow(/no-such-step/);
  });

  // THE NESTED-INCLUDE RULE. `expandWithTopIndices` matches an override key against
  // `expanded.topIndices[flatIndex]`, which for an absorbed step is the ENCLOSING INCLUDE
  // STEP's own top-level index in the source workflow. So an id key names the INCLUDE
  // STEP ITSELF, and fans out to EVERY step it absorbs.
  //
  // COURSE_BUILD's real "include-starter-materials.selected" targets exactly this shape. It works today only
  // because STARTER_MATERIALS happens to hold one step, which makes "the include step's
  // id" and "the absorbed step's id" indistinguishable. The inner source here has TWO
  // steps precisely so the two readings give different answers.
  it("an id key naming an include-workflow step fans out to EVERY step it absorbs", () => {
    const inner = def([{ id: "in-a", type: "starter-materials", bindings: {} }, { id: "in-b", type: "lecture-zip", bindings: {} }], "inner");
    const outer = def(
      [
        { id: "out-tile", type: "load-course-tile", bindings: {} },
        { id: "out-inc", type: "include-workflow", bindings: {}, include: { workflowId: "inner", skipSteps: [], remap: {} } },
      ],
      "outer"
    );
    const top = def([
      {
        id: "top-inc",
        type: "include-workflow",
        bindings: {},
        include: { workflowId: "outer", skipSteps: [], remap: {}, bindOverrides: { "out-inc.selected": { source: "literal", value: "1" } } },
      },
    ]);
    const lookupNested = (id: string) => (id === "outer" ? outer : id === "inner" ? inner : undefined);
    const out = expandWorkflowDef(top, lookupNested);
    expect(out.steps.map((s) => s.type)).toEqual(["load-course-tile", "starter-materials", "lecture-zip"]);
    // BOTH absorbed steps receive it - matching today's numeric behavior exactly.
    expect(out.steps[1].bindings.selected).toEqual({ source: "literal", value: "1" });
    expect(out.steps[2].bindings.selected).toEqual({ source: "literal", value: "1" });
    // ...and the step OUTSIDE the inner include does not.
    expect(out.steps[0].bindings.selected).toBeUndefined();
  });

  it("an id key naming an ABSORBED step does not match - the key namespace is the source's own top level", () => {
    const inner = def([{ id: "in-a", type: "starter-materials", bindings: {} }, { id: "in-b", type: "lecture-zip", bindings: {} }], "inner");
    const outer = def(
      [
        { id: "out-tile", type: "load-course-tile", bindings: {} },
        { id: "out-inc", type: "include-workflow", bindings: {}, include: { workflowId: "inner", skipSteps: [], remap: {} } },
      ],
      "outer"
    );
    const top = def([
      {
        id: "top-inc",
        type: "include-workflow",
        bindings: {},
        include: { workflowId: "outer", skipSteps: [], remap: {}, bindOverrides: { "in-a.selected": { source: "literal", value: "1" } } },
      },
    ]);
    const lookupNested = (id: string) => (id === "outer" ? outer : id === "inner" ? inner : undefined);
    // "in-a" is not a top-level id of `outer`, so this is an unresolvable key, not a hit.
    expect(() => expandWorkflowDef(top, lookupNested)).toThrow(/in-a/);
  });

  it("a numeric key prefix is still an index, not an id", () => {
    const d = def([
      {
        id: "inc",
        type: "include-workflow",
        bindings: {},
        include: { workflowId: "src", skipSteps: [], remap: {}, bindOverrides: { "1.selected": { source: "literal", value: "ok" } } },
      },
    ]);
    expect(expandWorkflowDef(d, lookup).steps.at(-1)!.bindings.selected).toEqual({ source: "literal", value: "ok" });
  });
});

describe("AC E - legacy positional definitions keep working untouched", () => {
  it("a def with no ids at all expands exactly as before", () => {
    const d = def([
      { type: "load-course-tile", bindings: {} },
      { type: "generate-schedule", bindings: { description: { source: "step", stepIndex: 0, outputKey: "description" } } },
      { type: "lecture-zip", bindings: { schedule: { source: "step", stepIndex: 1, outputKey: "schedule" } } },
    ]);
    const out = expandWorkflowDef(d, noLookup);
    expect(out.steps.map((s) => s.type)).toEqual(["load-course-tile", "generate-schedule", "lecture-zip"]);
    expect(out.steps[2].bindings.schedule).toEqual({ source: "step", stepIndex: 1, outputKey: "schedule" });
    expect(out.topIndices).toEqual([0, 1, 2]);
  });

  // A positional def with an include still resolves positionally, including the silent
  // fallbacks the expander has always had. Ids must not make legacy defs stricter.
  it("a positional def with an include is unchanged, silent fallbacks and all", () => {
    const d = def([
      { type: "load-course-tile", bindings: {} },
      { type: "include-workflow", bindings: {}, include: { workflowId: "src3", skipSteps: [], remap: {} } },
      { type: "generate-schedule", bindings: { description: { source: "step", stepIndex: 0, outputKey: "description" } } },
    ]);
    const out = expandWorkflowDef(d, lookup3);
    expect(out.steps).toHaveLength(5);
    expect(out.steps[4].bindings.description).toEqual({ source: "step", stepIndex: 0, outputKey: "description" });
    expect(out.topIndices).toEqual([0, 1, 1, 1, 2]);
  });
});
