// InputBindingRow.tsx's OptionsSelect (the "options WITHOUT multi" literal
// editor) cannot be rendered in this codebase's test suite - there is no
// @testing-library/react (or any .test.tsx) anywhere in this repo, so this
// pins its pure decision surface instead:
//
//  1. usesMultiSelect(input) stays false for a real production single-select
//     StepInputSpec (options set, no multi), so InputBindingRow's ternary
//     still routes it to OptionsSelect, unchanged, exactly as it did before
//     OptionsSelect's dead multi-select branch was removed.
//  2. firstSelectedOption - the single-value-extraction logic OptionsSelect
//     renders with - behaves identically to the inline expression it was
//     pulled out of (`value.split("\n").map(s => s.trim()).filter(Boolean)[0]
//     ?? ""`), so the live single-select path's displayed value is unchanged.
//  3. OptionsSelect is no longer part of this module's public surface: no
//     file in src imports it (grep-verified against the whole tree - the
//     only other occurrences of the name are comments and this file's own
//     production-fixture-driven assertions), so narrowing the named export
//     to just InputBindingRow/TileRefPicker removes a future misuse path
//     (a caller handing a multi field to a component that can only render
//     single-select) rather than leaving it silently reachable.
import { describe, it, expect } from "vitest";
import { usesMultiSelect } from "@/lib/multi-select-value";
import { firstSelectedOption } from "./InputBindingRow";
import * as InputBindingRowModule from "./InputBindingRow";
import { courseGuideSteps } from "@/lib/workflows/registry/steps.course-guides";

const courseKindInput = courseGuideSteps
  .find((s) => s.type === "generate-course-guides")!
  .inputs.find((i) => i.key === "courseKind")!;

describe("InputBindingRow single-select routing is unchanged (AC)", () => {
  it("course-guides' real 'courseKind' StepInputSpec (options set, no multi) does NOT route to the multi-select branch", () => {
    // Guards against a future edit to steps.course-guides.ts silently adding
    // `multi: true` and changing which branch this fixture exercises.
    expect(courseKindInput.multi).toBeUndefined();
    expect(courseKindInput.options).toEqual(["coding", "applied"]);
    expect(usesMultiSelect(courseKindInput)).toBe(false);
  });

  it("an options-without-multi field still falls into InputBindingRow's OptionsSelect branch (options.length > 0, usesMultiSelect false)", () => {
    const routesToOptionsSelect =
      !usesMultiSelect(courseKindInput) &&
      !!courseKindInput.options &&
      courseKindInput.options.length > 0;
    expect(routesToOptionsSelect).toBe(true);
  });
});

describe("firstSelectedOption - OptionsSelect's single-value extraction (AC)", () => {
  it("returns the plain value unchanged", () => {
    expect(firstSelectedOption("coding")).toBe("coding");
  });

  it("returns '' for an empty stored value", () => {
    expect(firstSelectedOption("")).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(firstSelectedOption("  coding  ")).toBe("coding");
  });

  it("skips leading blank lines and returns the first non-blank one", () => {
    expect(firstSelectedOption("\n\n  coding\napplied")).toBe("coding");
  });

  it("only ever returns the first line even if the stored value has more than one (defensive - a single-select field's value should never be multi-line in practice)", () => {
    expect(firstSelectedOption("coding\napplied")).toBe("coding");
  });

  it("all-blank input returns ''", () => {
    expect(firstSelectedOption("   \n   \n")).toBe("");
  });
});

describe("OptionsSelect is not part of this module's exported surface (export-narrowing decision)", () => {
  it("the module does not export OptionsSelect by name", () => {
    expect(Object.prototype.hasOwnProperty.call(InputBindingRowModule, "OptionsSelect")).toBe(false);
  });

  it("still exports InputBindingRow (named), TileRefPicker, and the default", () => {
    expect(typeof InputBindingRowModule.InputBindingRow).toBe("function");
    expect(typeof InputBindingRowModule.TileRefPicker).toBe("function");
    expect(typeof InputBindingRowModule.default).toBe("function");
  });
});
