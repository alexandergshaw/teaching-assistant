// TDD for CHUNK F: naming the steps an include DROPS, written from the acceptance
// criteria BEFORE the implementation existed. Make these pass without changing what they
// assert.
//
// THE LAST POSITIONAL SYSTEM. Chunk E gave bindings and include KEYS named ids, and
// docs/WORKFLOW-ARCHITECTURE.md records the honest limit that survived it:
// `include.skipSteps` is still `number[]`. It is arguably the most dangerous of the three,
// because it does not merely mis-wire a value - it decides WHICH ABSORBED STEPS EXIST AT
// ALL. Insert a step into an included workflow at or below a `skipSteps` entry and a
// different step is silently dropped from every workflow that includes it, with no compile
// error and no runtime error.
//
// THE DESIGN, matching chunk E exactly: `skipSteps` accepts a step id alongside an index.
// A numeric entry is still an INDEX (backward compatible, and stored custom workflows only
// ever contain numbers). A string entry is an id resolved against the INCLUDED workflow's
// own top-level steps - the same namespace, and the same resolution, that an include KEY
// prefix already uses. Unresolvable or ambiguous throws, naming it.
//
// The fan-out rule carries over unchanged: an entry naming a step that is ITSELF an
// include-workflow drops every step that step absorbs, because `topIndices` maps all of
// them back to it.
import { describe, it, expect } from "vitest";
import { expandWorkflowDef, type WorkflowDef } from "@/lib/workflows/types";

function def(steps: WorkflowDef["steps"], id = "wf"): WorkflowDef {
  return { id, name: id, description: "", steps };
}

// A four-step source. `drop-me` sits at index 1 so an insertion ahead of it moves it.
const SOURCE = def(
  [
    { id: "keep-first", type: "load-course-tile", bindings: {} },
    { id: "drop-me", type: "generate-schedule", bindings: {} },
    { id: "keep-last", type: "lecture-zip", bindings: {} },
  ],
  "src"
);
const lookup = (id: string) => (id === "src" ? SOURCE : undefined);

const including = (skipSteps: WorkflowDef["steps"][number]["include"] extends undefined
  ? never
  : NonNullable<WorkflowDef["steps"][number]["include"]>["skipSteps"]) =>
  def([
    {
      id: "inc",
      type: "include-workflow",
      bindings: {},
      include: { workflowId: "src", skipSteps, remap: {} },
    },
  ]);

describe("AC F1 - skipSteps accepts a step id", () => {
  it("an id drops the same step the equivalent index does", () => {
    const byId = expandWorkflowDef(including(["drop-me"]), lookup);
    const byIndex = expandWorkflowDef(including([1]), lookup);
    expect(byId.steps.map((s) => s.type)).toEqual(["load-course-tile", "lecture-zip"]);
    expect(byId.steps.map((s) => s.type)).toEqual(byIndex.steps.map((s) => s.type));
    // Compare the surviving steps' own ids, not topIndices - for this fixture topIndices
    // is [0,0] on both sides regardless of which step was dropped, so asserting it would
    // be comparing a constant against itself.
    expect(byId.steps.map((s) => s.id)).toEqual(["keep-first", "keep-last"]);
    expect(byId.steps.map((s) => s.id)).toEqual(byIndex.steps.map((s) => s.id));
  });

  // Uncovered by the expander's own Set<number> (which dedupes for free) but NOT by the
  // builder, where a length-based mirrored-count and a Set-based toggle both get it wrong.
  it("an index and an id naming the SAME step drop it once, not twice", () => {
    const out = expandWorkflowDef(including([1, "drop-me"]), lookup);
    expect(out.steps.map((s) => s.id)).toEqual(["keep-first", "keep-last"]);
  });

  it("a numeric entry is still an INDEX - stored custom workflows only ever contain numbers", () => {
    expect(expandWorkflowDef(including([0]), lookup).steps.map((s) => s.type)).toEqual([
      "generate-schedule",
      "lecture-zip",
    ]);
  });

  it("ids and indices may be mixed in one array", () => {
    expect(expandWorkflowDef(including([0, "keep-last"]), lookup).steps.map((s) => s.type)).toEqual([
      "generate-schedule",
    ]);
  });

  it("an empty skipSteps keeps everything, exactly as before", () => {
    expect(expandWorkflowDef(including([]), lookup).steps).toHaveLength(3);
  });

  // Deliberately UNLIKE an include KEY prefix, where everything is a string so a numeric
  // prefix has to be sniffed. Here the array is typed `(number | string)[]`, so the
  // distinction is carried by the TYPE: a number is an index, a string is an id, always.
  // A string "1" is therefore an id named "1" - which no step has - and must throw rather
  // than silently meaning index 1.
  it("a numeric STRING is an id, not an index - the type carries the distinction", () => {
    // Tight on purpose: a bare /\b1\b/ would match any message mentioning the number 1
    // anywhere, including one about a completely different include. Require the quoted id
    // AND a discriminating word, the same shape the unknown-id assertions below use.
    expect(() => expandWorkflowDef(including(["1"]), lookup)).toThrow(/"1"/);
    expect(() => expandWorkflowDef(including(["1"]), lookup)).toThrow(/unknown|no such|not found/i);
  });
});

// THE POINT OF THE CHUNK. Inserting a step into the SOURCE ahead of the dropped one must
// not change WHICH step is dropped. With an index it silently does.
describe("AC F2 - inserting a step into the included workflow no longer changes what is dropped", () => {
  const shifted = def(
    [
      { id: "inserted", type: "select-course-modules", bindings: {} },
      { id: "keep-first", type: "load-course-tile", bindings: {} },
      { id: "drop-me", type: "generate-schedule", bindings: {} },
      { id: "keep-last", type: "lecture-zip", bindings: {} },
    ],
    "src"
  );
  const shiftedLookup = () => shifted;

  it("an ID keeps dropping the step it names", () => {
    expect(expandWorkflowDef(including(["drop-me"]), shiftedLookup).steps.map((s) => s.type)).toEqual([
      "select-course-modules",
      "load-course-tile",
      "lecture-zip",
    ]);
  });

  // The control, and the whole justification for this chunk: the equivalent INDEX now
  // drops a completely different step, silently. This test documents the old hazard - it
  // must keep passing, because numeric entries stay index-based for backward compatibility.
  it("the equivalent INDEX silently drops a different step - the hazard this replaces", () => {
    expect(expandWorkflowDef(including([1]), shiftedLookup).steps.map((s) => s.type)).toEqual([
      "select-course-modules",
      "generate-schedule",
      "lecture-zip",
    ]);
  });
});

describe("AC F3 - an unresolvable or ambiguous id is LOUD", () => {
  it("throws naming the unknown id, the including workflow and the included one", () => {
    expect(() => expandWorkflowDef(including(["ghost"]), lookup)).toThrow(/ghost/);
    expect(() => expandWorkflowDef(including(["ghost"]), lookup)).toThrow(/wf/);
    expect(() => expandWorkflowDef(including(["ghost"]), lookup)).toThrow(/src/);
  });

  it("throws naming an ambiguous id", () => {
    const dupes = def(
      [
        { id: "same", type: "load-course-tile", bindings: {} },
        { id: "same", type: "generate-schedule", bindings: {} },
      ],
      "src"
    );
    expect(() => expandWorkflowDef(including(["same"]), () => dupes)).toThrow(/same/);
    expect(() => expandWorkflowDef(including(["same"]), () => dupes)).toThrow(/ambiguous|duplicate|more than one/i);
  });

  // A numeric entry naming no step has ALWAYS been silently ignored, and stored custom
  // workflows can contain one. Ids are strict; indices must stay lenient or a saved
  // workflow could stop expanding.
  it("an out-of-range numeric entry stays silently ignored, as it always has", () => {
    expect(() => expandWorkflowDef(including([99]), lookup)).not.toThrow();
    expect(expandWorkflowDef(including([99]), lookup).steps).toHaveLength(3);
  });
});

describe("AC F4 - the fan-out rule carries over", () => {
  // An entry naming a step that is ITSELF an include drops every step it absorbs, because
  // topIndices maps all of them back to that one step. Identical to the numeric behavior,
  // and identical to how an include KEY prefix fans out. The inner source has TWO steps so
  // "dropped the include" and "dropped one absorbed step" give different answers.
  const inner = def(
    [
      { id: "in-a", type: "starter-materials", bindings: {} },
      { id: "in-b", type: "lecture-zip", bindings: {} },
    ],
    "inner"
  );
  const outer = def(
    [
      { id: "out-tile", type: "load-course-tile", bindings: {} },
      { id: "out-inc", type: "include-workflow", bindings: {}, include: { workflowId: "inner", skipSteps: [], remap: {} } },
    ],
    "outer"
  );
  const nested = (id: string) => (id === "outer" ? outer : id === "inner" ? inner : undefined);

  it("an id naming an include-workflow step drops EVERY step it absorbs", () => {
    const d = def([
      { id: "inc", type: "include-workflow", bindings: {}, include: { workflowId: "outer", skipSteps: ["out-inc"], remap: {} } },
    ]);
    expect(expandWorkflowDef(d, nested).steps.map((s) => s.type)).toEqual(["load-course-tile"]);
  });

  // The numeric CONTROL for the assertion above. Without it, "identical to the numeric
  // behavior" is a claim in a comment rather than something the suite checks.
  it("the equivalent INDEX fans out the same way", () => {
    const d = def([
      { id: "inc", type: "include-workflow", bindings: {}, include: { workflowId: "outer", skipSteps: [1], remap: {} } },
    ]);
    expect(expandWorkflowDef(d, nested).steps.map((s) => s.type)).toEqual(["load-course-tile"]);
  });

  // Crosses the two dimensions the other tests keep apart: a nested include dropped BY ID,
  // in a source whose surviving step binds across the dropped fan-out. A keptMap offset
  // error hides exactly here - the binding must lower to the survivor's real position.
  it("a kept step's binding still lowers correctly across an id-dropped fan-out", () => {
    const inner2 = def(
      [
        { id: "i-a", type: "starter-materials", bindings: {} },
        { id: "i-b", type: "lecture-zip", bindings: {} },
      ],
      "inner2"
    );
    const outer2 = def(
      [
        { id: "o-tile", type: "load-course-tile", bindings: {} },
        { id: "o-inc", type: "include-workflow", bindings: {}, include: { workflowId: "inner2", skipSteps: [], remap: {} } },
        { id: "o-guides", type: "generate-course-guides", bindings: { files: { source: "step", stepId: "o-tile", outputKey: "course" } } },
      ],
      "outer2"
    );
    const d = def([
      { id: "pre", type: "load-course-tile", bindings: {} },
      { id: "inc", type: "include-workflow", bindings: {}, include: { workflowId: "outer2", skipSteps: ["o-inc"], remap: {} } },
    ]);
    const out = expandWorkflowDef(d, (id) => (id === "outer2" ? outer2 : id === "inner2" ? inner2 : undefined));
    expect(out.steps.map((s) => s.type)).toEqual(["load-course-tile", "load-course-tile", "generate-course-guides"]);
    // o-tile landed at expanded index 1 (after `pre`), and the two absorbed steps are gone.
    expect(out.steps[2].bindings.files).toEqual({ source: "step", stepIndex: 1, outputKey: "course" });
  });

  it("an id belonging to a step nested inside a FURTHER include is not visible here", () => {
    // "in-a" lives in `inner`, a different workflow's id namespace - not a top-level step
    // of `outer`, so it is unresolvable rather than a silent no-op.
    const d = def([
      { id: "inc", type: "include-workflow", bindings: {}, include: { workflowId: "outer", skipSteps: ["in-a"], remap: {} } },
    ]);
    expect(() => expandWorkflowDef(d, nested)).toThrow(/in-a/);
  });
});

describe("AC F5 - remap still finds a step dropped by id", () => {
  // remap keys name a DROPPED step's output. Skipping by id must not break that pairing -
  // both sides resolve through the same source-id namespace.
  it("an id-keyed remap resolves for a step skipped by id", () => {
    const source = def(
      [
        { id: "src-tile", type: "load-course-tile", bindings: {} },
        { id: "src-guides", type: "generate-course-guides", bindings: { files: { source: "step", stepId: "src-tile", outputKey: "course" } } },
      ],
      "src2"
    );
    const d = def([
      { id: "tile", type: "load-course-tile", bindings: {} },
      {
        id: "inc",
        type: "include-workflow",
        bindings: {},
        include: {
          workflowId: "src2",
          skipSteps: ["src-tile"],
          remap: { "src-tile.course": { source: "step", stepId: "tile", outputKey: "course" } },
        },
      },
    ]);
    const out = expandWorkflowDef(d, (id) => (id === "src2" ? source : undefined));
    expect(out.steps.map((s) => s.type)).toEqual(["load-course-tile", "generate-course-guides"]);
    expect(out.steps[1].bindings.files).toEqual({ source: "step", stepIndex: 0, outputKey: "course" });
  });

  it("an id-keyed remap resolves for a step skipped by INDEX - the other direction", () => {
    const source = def(
      [
        { id: "src-tile", type: "load-course-tile", bindings: {} },
        { id: "src-guides", type: "generate-course-guides", bindings: { files: { source: "step", stepIndex: 0, outputKey: "course" } } },
      ],
      "src4"
    );
    const d = def([
      { id: "tile", type: "load-course-tile", bindings: {} },
      {
        id: "inc",
        type: "include-workflow",
        bindings: {},
        include: {
          workflowId: "src4",
          skipSteps: [0],
          remap: { "src-tile.course": { source: "step", stepId: "tile", outputKey: "course" } },
        },
      },
    ]);
    const out = expandWorkflowDef(d, (id) => (id === "src4" ? source : undefined));
    expect(out.steps[1].bindings.files).toEqual({ source: "step", stepIndex: 0, outputKey: "course" });
  });

  it("a numeric-keyed remap still resolves for a step skipped by id", () => {
    const source = def(
      [
        { id: "src-tile", type: "load-course-tile", bindings: {} },
        { id: "src-guides", type: "generate-course-guides", bindings: { files: { source: "step", stepIndex: 0, outputKey: "course" } } },
      ],
      "src3"
    );
    const d = def([
      { id: "tile", type: "load-course-tile", bindings: {} },
      {
        id: "inc",
        type: "include-workflow",
        bindings: {},
        include: {
          workflowId: "src3",
          skipSteps: ["src-tile"],
          remap: { "0.course": { source: "step", stepId: "tile", outputKey: "course" } },
        },
      },
    ]);
    const out = expandWorkflowDef(d, (id) => (id === "src3" ? source : undefined));
    expect(out.steps[1].bindings.files).toEqual({ source: "step", stepIndex: 0, outputKey: "course" });
  });
});
