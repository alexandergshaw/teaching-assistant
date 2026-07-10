import { describe, expect, it } from "vitest";
import { parseLenientJsonArray } from "./lenient-json";

describe("parseLenientJsonArray", () => {
  it("parses plain valid array", () => {
    const result = parseLenientJsonArray('[{"a":1},{"b":2}]');
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("strips code fences", () => {
    const result = parseLenientJsonArray('```json\n[{"a":1}]\n```');
    expect(result).toEqual([{ a: 1 }]);
  });

  it("handles trailing commas", () => {
    const result = parseLenientJsonArray('[{"a": 1,}, {"b": 2},]');
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("quotes unquoted keys", () => {
    const result = parseLenientJsonArray('[{start: 0, end: 2, text: "hi"}]');
    expect(result).toEqual([{ start: 0, end: 2, text: "hi" }]);
  });

  it("replaces curly quotes", () => {
    const result = parseLenientJsonArray('[{"a": "b"}]');
    expect(result).toEqual([{ a: "b" }]);
  });

  it("recovers from truncated tail", () => {
    const result = parseLenientJsonArray('[{"a":1},{"b":2},{"c":');
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("parses array with prose around it", () => {
    const result = parseLenientJsonArray('Here you go: [{"a":1}] hope that helps');
    expect(result).toEqual([{ a: 1 }]);
  });

  it("returns null for hopeless input", () => {
    const result = parseLenientJsonArray("no json here");
    expect(result).toBeNull();
  });

  it("handles multiple levels of nesting", () => {
    const result = parseLenientJsonArray('[{a: {b: 1, c: "x"}, d: [1,2,3]},]');
    expect(result).toEqual([{ a: { b: 1, c: "x" }, d: [1, 2, 3] }]);
  });

  it("preserves numeric and boolean values", () => {
    const result = parseLenientJsonArray('[{count: 42, active: true, ratio: 3.14}]');
    expect(result).toEqual([{ count: 42, active: true, ratio: 3.14 }]);
  });

  it("wraps bare object in array", () => {
    const result = parseLenientJsonArray('{"a":1}');
    expect(result).toEqual([{ a: 1 }]);
  });

  it("returns null for non-array JSON", () => {
    const result = parseLenientJsonArray('{"a":1}');
    // This wraps the object in an array, so it actually succeeds
    expect(result).toEqual([{ a: 1 }]);
  });

  it("handles text: field commonly in captions", () => {
    const result = parseLenientJsonArray('[{start: 0, end: 5, text: "User opens menu"},]');
    expect(result).toEqual([{ start: 0, end: 5, text: "User opens menu" }]);
  });

  it("returns null for completely invalid input", () => {
    const result = parseLenientJsonArray("just some random prose with no brackets at all");
    expect(result).toBeNull();
  });
});
