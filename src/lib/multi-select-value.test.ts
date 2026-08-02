import { describe, it, expect } from "vitest";
import { parseMultiSelectValue, serializeMultiSelectValue, usesMultiSelect } from "./multi-select-value";

describe("parseMultiSelectValue", () => {
  it("blank input parses to an empty list", () => {
    expect(parseMultiSelectValue("")).toEqual([]);
  });

  it("whitespace-only input parses to an empty list", () => {
    expect(parseMultiSelectValue("   \n  \n\t\n")).toEqual([]);
  });

  it("parses a single entry", () => {
    expect(parseMultiSelectValue("assignments")).toEqual(["assignments"]);
  });

  it("parses several newline-joined entries, preserving order", () => {
    expect(parseMultiSelectValue("assignments\nguides\ndecks")).toEqual([
      "assignments",
      "guides",
      "decks",
    ]);
  });

  it("trims surrounding whitespace on each line and drops blank lines between entries", () => {
    expect(parseMultiSelectValue("\n  assignments  \n\n  guides\n")).toEqual([
      "assignments",
      "guides",
    ]);
  });

  it("de-duplicates a repeated entry, keeping only its first occurrence", () => {
    expect(parseMultiSelectValue("guides\nassignments\nguides")).toEqual([
      "guides",
      "assignments",
    ]);
  });

  it("does not validate against any option list - an entry no longer offered parses like any other", () => {
    // This module is option-list-agnostic by design (see header comment):
    // it does not even accept an options list, so a value saved before an
    // option was removed from the field definition parses exactly like a
    // still-current one. Whether to still display it is a caller concern
    // (RuntimeFieldInput.tsx / AC3), not this module's.
    expect(parseMultiSelectValue("assignments\nsomeRemovedFamily")).toEqual([
      "assignments",
      "someRemovedFamily",
    ]);
  });
});

describe("serializeMultiSelectValue", () => {
  it("an empty selection serializes to blank", () => {
    expect(serializeMultiSelectValue([])).toBe("");
  });

  it("serializes a single entry", () => {
    expect(serializeMultiSelectValue(["assignments"])).toBe("assignments");
  });

  it("serializes several entries newline-joined, preserving order", () => {
    expect(serializeMultiSelectValue(["assignments", "guides", "decks"])).toBe(
      "assignments\nguides\ndecks"
    );
  });

  it("trims and drops blank entries", () => {
    expect(serializeMultiSelectValue(["  assignments  ", "", "   ", "guides"])).toBe(
      "assignments\nguides"
    );
  });

  it("de-duplicates a repeated entry", () => {
    expect(serializeMultiSelectValue(["guides", "guides", "assignments"])).toBe(
      "guides\nassignments"
    );
  });
});

describe("round-trip stability", () => {
  it("parse then serialize reproduces the same value for an already-clean value", () => {
    const raw = "assignments\nguides\ndecks";
    expect(serializeMultiSelectValue(parseMultiSelectValue(raw))).toBe(raw);
  });

  it("parse then serialize reproduces the same MEANING for a messy value (whitespace, duplicates, blank lines)", () => {
    const messy = "\n  guides \n\nguides\n assignments\n";
    const cleaned = serializeMultiSelectValue(parseMultiSelectValue(messy));
    // Not byte-identical to the messy input (whitespace/duplicates are
    // normalized away - a checkbox/multi-select selection cannot represent
    // "guides, checked twice"), but re-parsing it must yield the exact same
    // selection as re-parsing the original messy value: the round-trip
    // preserves MEANING, not bytes.
    expect(parseMultiSelectValue(cleaned)).toEqual(parseMultiSelectValue(messy));
    expect(cleaned).toBe("guides\nassignments");
  });

  it("parse(serialize(x)) === x for an already-de-duplicated, trimmed list (idempotent)", () => {
    const clean = ["assignments", "guides", "decks"];
    expect(parseMultiSelectValue(serializeMultiSelectValue(clean))).toEqual(clean);
  });

  it("blank round-trips to blank", () => {
    expect(serializeMultiSelectValue(parseMultiSelectValue(""))).toBe("");
  });

  it("a stale entry (no longer among any field's current options) still round-trips", () => {
    const raw = "assignments\nsomeRemovedFamily";
    expect(serializeMultiSelectValue(parseMultiSelectValue(raw))).toBe(raw);
  });
});

// This is the exact gate RuntimeFieldInput.tsx uses to decide whether a
// runtime field renders as the new multi-select control or falls through to
// whatever its `field.type` already dispatched to. Pinning it here (rather
// than only reading the component) is what actually protects AC4: a
// single-select field (options, no multi) must keep landing on the
// pre-existing "text" + options MenuItem dropdown, completely untouched.
describe("usesMultiSelect", () => {
  it("is true when a field has both options and multi", () => {
    expect(usesMultiSelect({ options: ["a", "b"], multi: true })).toBe(true);
  });

  it("is false for options WITHOUT multi - the pre-existing single-select case, which must stay on its own unchanged path", () => {
    expect(usesMultiSelect({ options: ["a", "b"], multi: false })).toBe(false);
    expect(usesMultiSelect({ options: ["a", "b"] })).toBe(false);
  });

  it("is false for multi WITHOUT options - nothing to pick from, falls through to a plain text field", () => {
    expect(usesMultiSelect({ multi: true })).toBe(false);
    expect(usesMultiSelect({ options: [], multi: true })).toBe(false);
  });

  it("is false when neither options nor multi is set - every ordinary field", () => {
    expect(usesMultiSelect({})).toBe(false);
  });
});
