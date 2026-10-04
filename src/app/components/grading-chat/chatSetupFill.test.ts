// Frozen-table oracle for the setup-fill precedence (ruling I1). Every expected
// value is a hand-written literal, independent of the implementation.
import { describe, expect, it } from "vitest";
import { resolveSetupFill, type FillSource, type ResolveSetupFillInput, type ResolveSetupFillResult, type SetupFields } from "./chatSetupFill";

const f = (instructions: string, rubric: string): SetupFields => ({ instructions, rubric });

interface Row {
  readonly name: string;
  readonly typed: SetupFields;
  readonly canvasMeta: SetupFields | null;
  readonly storedMemory: SetupFields | null;
  readonly want: ResolveSetupFillResult;
}

const ROWS: readonly Row[] = [
  {
    name: "1 typed beats canvas and memory (never overwritten)",
    typed: f("T-INS", "T-RUB"),
    canvasMeta: f("C-INS", "C-RUB"),
    storedMemory: f("M-INS", "M-RUB"),
    want: { instructions: "T-INS", rubric: "T-RUB", instructionsSource: "typed", rubricSource: "typed" },
  },
  {
    name: "2 blank typed: canvas beats memory",
    typed: f("", ""),
    canvasMeta: f("C-INS", "C-RUB"),
    storedMemory: f("M-INS", "M-RUB"),
    want: { instructions: "C-INS", rubric: "C-RUB", instructionsSource: "canvas", rubricSource: "canvas" },
  },
  {
    name: "3 no canvas: memory fills",
    typed: f("", ""),
    canvasMeta: null,
    storedMemory: f("M-INS", "M-RUB"),
    want: { instructions: "M-INS", rubric: "M-RUB", instructionsSource: "memory", rubricSource: "memory" },
  },
  {
    name: "4 canvas present but empty: memory fills",
    typed: f("", ""),
    canvasMeta: f("", ""),
    storedMemory: f("M-INS", "M-RUB"),
    want: { instructions: "M-INS", rubric: "M-RUB", instructionsSource: "memory", rubricSource: "memory" },
  },
  {
    name: "5 nothing anywhere: blank",
    typed: f("", ""),
    canvasMeta: null,
    storedMemory: null,
    want: { instructions: "", rubric: "", instructionsSource: "blank", rubricSource: "blank" },
  },
  {
    name: "6 whitespace-only typed counts as blank",
    typed: f("   ", "\t\n"),
    canvasMeta: f("C-INS", "C-RUB"),
    storedMemory: null,
    want: { instructions: "C-INS", rubric: "C-RUB", instructionsSource: "canvas", rubricSource: "canvas" },
  },
  {
    name: "7 per-field independence",
    typed: f("T-INS", ""),
    canvasMeta: f("C-INS", "C-RUB"),
    storedMemory: null,
    want: { instructions: "T-INS", rubric: "C-RUB", instructionsSource: "typed", rubricSource: "canvas" },
  },
  {
    name: "8 canvas empty and no memory: blank",
    typed: f("", ""),
    canvasMeta: f("", ""),
    storedMemory: null,
    want: { instructions: "", rubric: "", instructionsSource: "blank", rubricSource: "blank" },
  },
];

describe("resolveSetupFill - frozen precedence table", () => {
  for (const row of ROWS) {
    it(row.name, () => {
      expect(resolveSetupFill({ typed: row.typed, canvasMeta: row.canvasMeta, storedMemory: row.storedMemory })).toEqual(row.want);
    });
  }
});

// Sabotage proofs: each mutant is a deliberately wrong implementation run
// against the SAME frozen rows, proving the table can fail. Each precedence
// mutant must be killed by at least one row.
type Fn = (input: ResolveSetupFillInput) => ResolveSetupFillResult;

function failingRows(fn: Fn): string[] {
  return ROWS.filter((row) => {
    const got = fn({ typed: row.typed, canvasMeta: row.canvasMeta, storedMemory: row.storedMemory });
    return JSON.stringify(got) !== JSON.stringify(row.want);
  }).map((row) => row.name.split(" ")[0]);
}

function blankish(value: string | undefined): boolean {
  return !value || value.trim() === "";
}

function mutantFromOrder(order: readonly ("typed" | "canvas" | "memory")[], trim: boolean): Fn {
  const pickOne = (t: string, c: string | undefined, m: string | undefined): [string, FillSource] => {
    for (const tier of order) {
      if (tier === "typed" && (trim ? !blankish(t) : t !== "")) return [t, "typed"];
      if (tier === "canvas" && !blankish(c)) return [c as string, "canvas"];
      if (tier === "memory" && !blankish(m)) return [m as string, "memory"];
    }
    return ["", "blank"];
  };
  return ({ typed, canvasMeta, storedMemory }) => {
    const a = pickOne(typed.instructions, canvasMeta?.instructions, storedMemory?.instructions);
    const b = pickOne(typed.rubric, canvasMeta?.rubric, storedMemory?.rubric);
    return { instructions: a[0], rubric: b[0], instructionsSource: a[1], rubricSource: b[1] };
  };
}

describe("resolveSetupFill - the table kills the known wrong implementations", () => {
  it("the mutant harness agrees with the real function when the order is correct", () => {
    expect(failingRows(mutantFromOrder(["typed", "canvas", "memory"], true))).toEqual([]);
    expect(failingRows(resolveSetupFill)).toEqual([]);
  });

  it("S1 canvas checked before typed: killed by row 1 (the worst-failure guard)", () => {
    expect(failingRows(mutantFromOrder(["canvas", "typed", "memory"], true))).toContain("1");
  });

  it("S2 no trim on the typed field: killed by row 6", () => {
    expect(failingRows(mutantFromOrder(["typed", "canvas", "memory"], false))).toContain("6");
  });

  it("S3 never consults stored memory: killed by rows 3 and 4", () => {
    const failed = failingRows(mutantFromOrder(["typed", "canvas"], true));
    expect(failed).toContain("3");
    expect(failed).toContain("4");
  });

  it("S4 rubric decided from the instructions decision: killed by row 7", () => {
    const mutant: Fn = (input) => {
      const real = resolveSetupFill(input);
      return {
        instructions: real.instructions,
        rubric: real.instructionsSource === "typed" ? input.typed.rubric : real.rubric,
        instructionsSource: real.instructionsSource,
        rubricSource: real.instructionsSource,
      };
    };
    expect(failingRows(mutant)).toContain("7");
  });
});
