import { describe, it, expect } from "vitest";
import {
  expandWorkflowDef,
  loadDisabledSteps,
  parseDisabledSteps,
  saveDisabledSteps,
  type WorkflowDef,
} from "./types";

// Minimal defs exercising expandWorkflowDef's topIndices mapping: a plain
// workflow (own steps only) and one that includes another workflow's steps,
// which must all report the INCLUDING workflow's own top-level index.
function makeDef(id: string, stepTypes: string[]): WorkflowDef {
  return {
    id,
    name: id,
    description: "",
    steps: stepTypes.map((type) => ({ type, bindings: {} })),
  };
}

describe("expandWorkflowDef topIndices", () => {
  it("maps each own step to its own top-level index", () => {
    const def = makeDef("solo", ["a", "b", "c"]);
    const result = expandWorkflowDef(def, () => undefined);

    expect(result.steps.map((s) => s.type)).toEqual(["a", "b", "c"]);
    expect(result.topIndices).toEqual([0, 1, 2]);
    expect(result.origins).toEqual([null, null, null]);
  });

  it("maps every absorbed step from an include-workflow step to the include step's own top-level index", () => {
    const source = makeDef("source", ["x", "y", "z"]);
    const including: WorkflowDef = {
      id: "including",
      name: "including",
      description: "",
      steps: [
        { type: "before", bindings: {} },
        {
          type: "include-workflow",
          bindings: {},
          include: {
            workflowId: "source",
            skipSteps: [],
            remap: {},
          },
        },
        { type: "after", bindings: {} },
      ],
    };

    const result = expandWorkflowDef(including, (id) =>
      id === "source" ? source : undefined
    );

    // Expanded order: before(top 0), x/y/z (all top 1, the include step's own
    // index), after(top 2).
    expect(result.steps.map((s) => s.type)).toEqual([
      "before",
      "x",
      "y",
      "z",
      "after",
    ]);
    expect(result.topIndices).toEqual([0, 1, 1, 1, 2]);
    expect(result.origins).toEqual([null, "source", "source", "source", null]);
  });

  it("skips dropped source steps but keeps topIndices aligned to the including step for the rest", () => {
    const source = makeDef("source", ["x", "y", "z"]);
    const including: WorkflowDef = {
      id: "including",
      name: "including",
      description: "",
      steps: [
        {
          type: "include-workflow",
          bindings: {},
          include: {
            workflowId: "source",
            skipSteps: [1],
            remap: {},
          },
        },
      ],
    };

    const result = expandWorkflowDef(including, (id) =>
      id === "source" ? source : undefined
    );

    expect(result.steps.map((s) => s.type)).toEqual(["x", "z"]);
    expect(result.topIndices).toEqual([0, 0]);
  });
});

describe("parseDisabledSteps", () => {
  it("returns an empty array for null/empty input", () => {
    expect(parseDisabledSteps(null)).toEqual([]);
    expect(parseDisabledSteps("")).toEqual([]);
  });

  it("round-trips a plain number array", () => {
    expect(parseDisabledSteps(JSON.stringify([0, 2, 5]))).toEqual([0, 2, 5]);
  });

  it("ignores malformed JSON", () => {
    expect(parseDisabledSteps("not json")).toEqual([]);
  });

  it("ignores a non-array JSON payload", () => {
    expect(parseDisabledSteps(JSON.stringify({ a: 1 }))).toEqual([]);
  });

  it("filters out non-number entries from an otherwise valid array", () => {
    expect(parseDisabledSteps(JSON.stringify([1, "two", 3, null]))).toEqual([
      1, 3,
    ]);
  });
});

describe("loadDisabledSteps / saveDisabledSteps SSR safety", () => {
  it("no-op / empty-array under a window-less (SSR) environment instead of throwing", () => {
    // vitest's "node" environment has no `window`, mirroring SSR - both
    // helpers must degrade gracefully rather than touch localStorage.
    expect(typeof window).toBe("undefined");
    expect(() => saveDisabledSteps("wf-1", [0, 1])).not.toThrow();
    expect(loadDisabledSteps("wf-1")).toEqual([]);
  });
});
