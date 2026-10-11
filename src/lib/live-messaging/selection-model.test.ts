import { describe, expect, it } from "vitest";
import { NO_SELECTION, selectionFor, setKeys, toggleKey } from "./selection-model";

describe("per-institution selection", () => {
  it("toggles a key on and off within one institution", () => {
    const on = toggleKey(NO_SELECTION, "MCC", "a");
    expect(selectionFor(on, "MCC")).toEqual(["a"]);
    expect(selectionFor(toggleKey(on, "MCC", "a"), "MCC")).toEqual([]);
  });

  it("does not carry the selection to another institution", () => {
    const mcc = toggleKey(NO_SELECTION, "MCC", "a");
    expect(selectionFor(mcc, "XYZ")).toEqual([]);
  });

  it("starts fresh when a toggle happens in a different institution", () => {
    const mcc = toggleKey(NO_SELECTION, "MCC", "a");
    const xyz = toggleKey(mcc, "XYZ", "b");
    expect(selectionFor(xyz, "XYZ")).toEqual(["b"]);
    expect(selectionFor(xyz, "MCC")).toEqual([]);
  });

  it("adds and removes many keys without duplicates", () => {
    const s1 = setKeys(NO_SELECTION, "MCC", ["a", "b"], true);
    const s2 = setKeys(s1, "MCC", ["b", "c"], true);
    expect(selectionFor(s2, "MCC")).toEqual(["a", "b", "c"]);
    expect(selectionFor(setKeys(s2, "MCC", ["a", "c"], false), "MCC")).toEqual(["b"]);
  });
});
