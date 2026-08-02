// LiteralEditor.tsx (the workflow builder's "Fixed value" binding editor)
// cannot be rendered in this codebase's test suite - there is no
// @testing-library/react (or any .test.tsx) anywhere in this repo, so every
// existing test here is pure-logic only. These tests pin the pure decision
// surface LiteralEditor and its caller (InputBindingRow.tsx) actually run on:
// usesMultiSelect (src/lib/multi-select-value.ts), fed the REAL StepInputSpec
// objects for the two production fields that declare both `options` and
// `multi` today (course-build's "outputs", messaging's "instructions"), plus
// the AC5 (options-without-multi) and "no options" shapes that must keep
// routing to the pre-existing, unchanged paths (OptionsSelect and the plain
// `type` branches, respectively).
//
// parseMultiSelectValue/serializeMultiSelectValue themselves already have a
// full unit suite (src/lib/multi-select-value.test.ts) - not duplicated here.
// What IS new here is the wiring: confirming LiteralEditor's `options`/`multi`
// props, threaded from InputBindingRow.tsx's `input: StepInputSpec`, resolve
// to the same routing decision the run form's RuntimeFieldInput.tsx makes
// from the same field data - so a workflow definition's input spec drives
// identical behavior in both places.
import { describe, it, expect } from "vitest";
import { usesMultiSelect, parseMultiSelectValue, serializeMultiSelectValue } from "@/lib/multi-select-value";
import { courseBuildScopeSteps } from "@/lib/workflows/registry/steps.course-build-scope";
import { messagingSteps } from "@/lib/workflows/registry/steps.messaging";

const outputsInput = courseBuildScopeSteps
  .find((s) => s.type === "select-course-outputs")!
  .inputs.find((i) => i.key === "outputs")!;

const instructionsInput = messagingSteps
  .find((s) => s.type === "draft-message-reply")!
  .inputs.find((i) => i.key === "instructions")!;

describe("LiteralEditor multi-select routing (AC1)", () => {
  it("course-build's real 'outputs' StepInputSpec (options + multi: true) routes to the multi-select branch", () => {
    expect(outputsInput.multi).toBe(true);
    expect(outputsInput.options && outputsInput.options.length).toBeGreaterThan(0);
    expect(usesMultiSelect(outputsInput)).toBe(true);
  });

  it("messaging's real 'instructions' StepInputSpec (options + multi: true) routes to the multi-select branch", () => {
    expect(instructionsInput.multi).toBe(true);
    expect(instructionsInput.options && instructionsInput.options.length).toBeGreaterThan(0);
    expect(usesMultiSelect(instructionsInput)).toBe(true);
  });
});

describe("LiteralEditor single-select routing is unchanged (AC5)", () => {
  it("options WITHOUT multi does not route to the multi-select branch - stays on InputBindingRow's OptionsSelect", () => {
    const singleSelect = { options: ["assignments", "guides", "decks"], multi: false };
    expect(usesMultiSelect(singleSelect)).toBe(false);
  });

  it("options WITHOUT a multi flag at all (undefined) does not route to the multi-select branch", () => {
    const singleSelect = { options: ["assignments", "guides", "decks"] };
    expect(usesMultiSelect(singleSelect)).toBe(false);
  });

  it("a field with neither options nor multi does not route to the multi-select branch - falls through to LiteralEditor's plain `type` branches, untouched", () => {
    expect(usesMultiSelect({})).toBe(false);
    expect(usesMultiSelect({ options: undefined, multi: undefined })).toBe(false);
  });
});

describe("LiteralEditor <-> run form round-trip compatibility (AC2, AC4)", () => {
  it("a selection saved by the builder's Autocomplete (array -> serializeMultiSelectValue) parses back to the identical selection the run form's Autocomplete would show", () => {
    // LiteralEditor's onChange does serializeMultiSelectValue(newValue) and
    // RuntimeFieldInput.tsx's <Autocomplete value={...}> reads
    // parseMultiSelectValue(value) - both call the exact same two functions,
    // so there is no separate format to drift out of sync with.
    const chosenInBuilder = ["assignments", "decks"];
    const storedValue = serializeMultiSelectValue(chosenInBuilder);
    expect(storedValue).toBe("assignments\ndecks");
    expect(parseMultiSelectValue(storedValue)).toEqual(chosenInBuilder);
  });

  it("a value naming an option no longer in the field's current options list still round-trips and would still display (not silently dropped)", () => {
    // Mirrors AC4: LiteralEditor's Autocomplete passes the full, unfiltered
    // `options` list to MUI but the `value` (selected chips) comes straight
    // from parseMultiSelectValue(value) with no filtering against `options` -
    // so a stale entry stays selected and visible as a freeSolo chip.
    const staleSaved = "assignments\nsomeRemovedFamily";
    const parsed = parseMultiSelectValue(staleSaved);
    expect(parsed).toEqual(["assignments", "someRemovedFamily"]);
    expect(serializeMultiSelectValue(parsed)).toBe(staleSaved);
  });

  it("blank stays blank both ways - this control adds no per-field meaning (AC3)", () => {
    expect(parseMultiSelectValue("")).toEqual([]);
    expect(serializeMultiSelectValue([])).toBe("");
  });
});
