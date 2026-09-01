// Unit tests for discussion-persisted-controls.ts's two new coercion
// functions (resource-controls feature: eligible resource kinds, preferred
// video length). The hook itself is not renderable under this repo's
// node-env vitest (no hook is ever rendered - see useReplyRows.ts's own file
// header for the same discipline); these are the plain exported functions
// that actually decide what a malformed/missing localStorage read becomes.

import { describe, it, expect } from "vitest";
import { coerceResourceKinds, coerceVideoLengthMinutes } from "./discussion-persisted-controls";
import { RESOURCE_KINDS } from "@/lib/resource-kind";

describe("coerceResourceKinds", () => {
  it("null (never persisted) defaults to the full RESOURCE_KINDS set - byte-identical to the resource pass's pre-existing behaviour", () => {
    expect(coerceResourceKinds(null)).toEqual(RESOURCE_KINDS);
  });

  it("a valid JSON array of kinds survives, reordered to RESOURCE_KINDS's own canonical order", () => {
    expect(coerceResourceKinds(JSON.stringify(["video", "doc"]))).toEqual(["doc", "video"]);
  });

  it("an unrecognized kind in the array is dropped, not fallen back to the default wholesale", () => {
    expect(coerceResourceKinds(JSON.stringify(["doc", "podcast"]))).toEqual(["doc"]);
  });

  it("a genuinely empty array survives AS empty - a real, legal 'search nothing' state, mirroring composition.ingredients's own zero-selected precedent", () => {
    expect(coerceResourceKinds(JSON.stringify([]))).toEqual([]);
  });

  it("malformed JSON falls back to the full default set", () => {
    expect(coerceResourceKinds("not json")).toEqual(RESOURCE_KINDS);
  });

  it("a non-array JSON value (an object) falls back to the full default set", () => {
    expect(coerceResourceKinds(JSON.stringify({ doc: true }))).toEqual(RESOURCE_KINDS);
  });

  it("duplicate entries collapse without changing the result", () => {
    expect(coerceResourceKinds(JSON.stringify(["doc", "doc", "video"]))).toEqual(["doc", "video"]);
  });

  it("SABOTAGE CHECK: the empty-array case and the malformed-JSON case must resolve DIFFERENTLY - collapsing them into one fallback would silently turn off an instructor's deliberate 'no resources' choice on the next malformed read, or vice versa", () => {
    const empty = coerceResourceKinds(JSON.stringify([]));
    const malformed = coerceResourceKinds("{{{not json");
    expect(empty).toEqual([]);
    expect(malformed).toEqual(RESOURCE_KINDS);
    expect(empty).not.toEqual(malformed);
  });
});

describe("coerceVideoLengthMinutes", () => {
  it("null (never persisted) is 'no preference set'", () => {
    expect(coerceVideoLengthMinutes(null)).toBeUndefined();
  });

  it("an empty string (explicitly cleared) is 'no preference set'", () => {
    expect(coerceVideoLengthMinutes("")).toBeUndefined();
    expect(coerceVideoLengthMinutes("   ")).toBeUndefined();
  });

  it("a valid positive integer string survives as a number", () => {
    expect(coerceVideoLengthMinutes("12")).toBe(12);
  });

  it("zero is not a usable preference - falls back to undefined, never a nonsensical 'no less than 0 minutes'", () => {
    expect(coerceVideoLengthMinutes("0")).toBeUndefined();
  });

  it("a negative number falls back to undefined", () => {
    expect(coerceVideoLengthMinutes("-5")).toBeUndefined();
  });

  it("unparseable text falls back to undefined, never NaN reaching state", () => {
    const result = coerceVideoLengthMinutes("not a number");
    expect(result).toBeUndefined();
    expect(Number.isNaN(result as number)).toBe(false);
  });
});
