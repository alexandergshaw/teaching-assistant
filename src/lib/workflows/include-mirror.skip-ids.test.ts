// TDD companion for CHUNK F, written from the acceptance criteria BEFORE the
// implementation existed. Make these pass without changing what they assert.
//
// WHY THIS FILE EXISTS SEPARATELY FROM types.expand.skip-ids.test.ts.
//
// That file tests the EXPANDER. This one tests the four consumers that read or write
// `skipSteps` and would otherwise break SILENTLY - which is the whole failure mode of the
// change. An implementer who widens the type, patches the expander's skip Set, migrates
// the presets and watches the expander tests pass would ship:
//
//   - a builder checkbox showing the OPPOSITE of the truth, because
//     `skipSteps.includes(srcIdx)` never matches an id, so an id-skipped step renders as
//     mirrored while the expander drops it;
//   - the "wire outputs from skipped steps" panel GONE, because `danglingOutputs` builds a
//     Set of skip entries and compares it against indices, finds nothing, and its caller
//     renders null - taking with it the only UI for editing Course Build's 8 remap entries;
//   - malformed JSON persisted to Supabase on the first checkbox click, because
//     `toggleSkipStep` does `skip.delete(sourceIndex)` (which cannot remove a string) and
//     then `Array.from(skip).sort((a, b) => a - b)` (which is NaN for every string pair).
//
// THE STORAGE DECISION THIS FILE PINS: the builder keeps WRITING numbers. Ids in
// `skipSteps` are a code-preset authoring feature; nothing user-authored ever puts a string
// there. That deliberately avoids a one-way door - if the builder wrote ids, a stored row
// read back by an older build would silently MIRROR a step it should skip, because the old
// code compares against indices only. Read paths must handle both forms; the write path
// stays numeric.
import { describe, it, expect } from "vitest";
import { danglingOutputs, toggleSkipStep } from "@/lib/workflows/include-mirror";
import { getStepDefinition } from "@/lib/workflows/registry";
import type { WorkflowStepConfig } from "@/lib/workflows/types";

// load-course-tile emits `description` (longtext); generate-schedule consumes it. So with
// step 0 dropped, step 1's binding dangles and must be reported.
const SOURCE: WorkflowStepConfig[] = [
  { id: "src-tile", type: "load-course-tile", bindings: {} },
  {
    id: "src-schedule",
    type: "generate-schedule",
    bindings: { description: { source: "step", stepIndex: 0, outputKey: "description" } },
  },
];

describe("danglingOutputs recognises a step skipped by id", () => {
  it("reports the dangling output when the step is skipped BY ID", () => {
    const byId = danglingOutputs(SOURCE, ["src-tile"], getStepDefinition);
    expect(byId).toHaveLength(1);
    expect(byId[0].outputKey).toBe("description");
  });

  // The control: the numeric path must be unchanged.
  it("reports the same dangling output when the step is skipped by index", () => {
    const byIndex = danglingOutputs(SOURCE, [0], getStepDefinition);
    expect(byIndex).toHaveLength(1);
    expect(byIndex[0].outputKey).toBe("description");
    expect(danglingOutputs(SOURCE, ["src-tile"], getStepDefinition)).toEqual(byIndex);
  });

  it("reports nothing when the referenced step is KEPT", () => {
    expect(danglingOutputs(SOURCE, [], getStepDefinition)).toEqual([]);
    expect(danglingOutputs(SOURCE, ["src-schedule"], getStepDefinition)).toEqual([]);
  });

  it("handles an id and an index naming the same step without double-reporting", () => {
    expect(danglingOutputs(SOURCE, [0, "src-tile"], getStepDefinition)).toHaveLength(1);
  });

  // An id that matches no source step must not silently behave as "nothing skipped" -
  // that is the failure this whole chunk exists to remove. Whether it throws or reports,
  // it must not quietly drop the entry on the floor.
  it("does not silently ignore an unresolvable id", () => {
    expect(() => danglingOutputs(SOURCE, ["ghost"], getStepDefinition)).toThrow(/ghost/);
  });
});

describe("toggleSkipStep survives an id-bearing skipSteps", () => {
  const include = (skipSteps: NonNullable<WorkflowStepConfig["include"]>["skipSteps"], remap = {}) =>
    ({ workflowId: "src", skipSteps, remap }) as NonNullable<WorkflowStepConfig["include"]>;

  it("re-checking a step skipped BY ID actually removes it", () => {
    const next = toggleSkipStep(include(["src-tile"]), 0, true, "src-tile");
    expect(next.skipSteps).toEqual([]);
  });

  it("re-checking removes BOTH forms when the step is listed twice", () => {
    const next = toggleSkipStep(include([0, "src-tile"]), 0, true, "src-tile");
    expect(next.skipSteps).toEqual([]);
  });

  it("re-checking one step leaves another step's id entry alone", () => {
    const next = toggleSkipStep(include(["src-tile", "src-schedule"]), 0, true, "src-tile");
    expect(next.skipSteps).toEqual(["src-schedule"]);
  });

  // The write-path decision: unchecking adds a NUMBER, never an id, so nothing
  // user-authored ever puts a string into stored data.
  it("unchecking adds the numeric index, never an id", () => {
    const next = toggleSkipStep(include([]), 1, false, "src-schedule");
    expect(next.skipSteps).toEqual([1]);
  });

  it("unchecking alongside an existing id entry produces no NaN and no duplicate", () => {
    const next = toggleSkipStep(include(["src-tile"]), 1, false, "src-schedule");
    expect(next.skipSteps).toHaveLength(2);
    expect(next.skipSteps).toContain(1);
    expect(next.skipSteps).toContain("src-tile");
    // `.sort((a, b) => a - b)` on a mixed array yields NaN comparisons and unstable
    // order. Whatever ordering is chosen, every entry must survive intact.
    expect(next.skipSteps.every((s) => s === "src-tile" || s === 1)).toBe(true);
  });

  it("re-checking still prunes remap entries under BOTH key forms", () => {
    const next = toggleSkipStep(
      include(["src-tile"], {
        "0.description": { source: "runtime", fieldKey: "a" },
        "src-tile.description": { source: "runtime", fieldKey: "b" },
        "src-schedule.schedule": { source: "runtime", fieldKey: "keep" },
      }),
      0,
      true,
      "src-tile"
    );
    expect(Object.keys(next.remap)).toEqual(["src-schedule.schedule"]);
  });

  it("a purely numeric include is untouched - the positional path is unchanged", () => {
    expect(toggleSkipStep(include([0, 2]), 2, true).skipSteps).toEqual([0]);
    expect(toggleSkipStep(include([0]), 2, false).skipSteps).toEqual([0, 2]);
  });
});
