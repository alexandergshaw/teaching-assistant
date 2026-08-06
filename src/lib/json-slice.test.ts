// Direct coverage for src/lib/json-slice.ts's jsonObjectSlice, just moved
// into its own dependency-free module to fix a client-bundle build break.
// Roughly 20 LLM-parsing call sites depend on this exact slicing behavior.
//
// jsonObjectSlice was written by a different model than this test. Its own
// doc comment says it returns "the substring from the first '{' to the last
// '}'"; these tests assert what the CODE actually does, and any discrepancy
// from that comment is called out in the handoff report rather than "fixed"
// here.
import { describe, it, expect } from "vitest";
import { jsonObjectSlice } from "./json-slice";

describe("jsonObjectSlice", () => {
  it("returns a bare JSON object unchanged", () => {
    expect(jsonObjectSlice('{"a":1}')).toBe('{"a":1}');
  });

  it("extracts the object out of a ```json fenced block", () => {
    const text = '```json\n{"a":1}\n```';
    expect(jsonObjectSlice(text)).toBe('{"a":1}');
  });

  it("extracts the object out of a bare ``` fenced block (no language tag)", () => {
    const text = '```\n{"a":1}\n```';
    expect(jsonObjectSlice(text)).toBe('{"a":1}');
  });

  it("extracts the object out of prose before and after it", () => {
    const text = 'Here is the result: {"a":1} - hope that helps!';
    expect(jsonObjectSlice(text)).toBe('{"a":1}');
  });

  it("returns null when there are no braces at all", () => {
    expect(jsonObjectSlice("no json here, sorry")).toBeNull();
  });

  it("returns null when a '}' appears before any '{'", () => {
    // The single "}" sits earlier in the string than the single "{" - start
    // (the "{" index) ends up greater than end (the "}" index), so the
    // function's own end <= start guard rejects it rather than slicing
    // backwards or wrapping around.
    const text = "closing brace } shows up before the opening { one";
    expect(jsonObjectSlice(text)).toBeNull();
  });

  it("returns the OUTERMOST object for a nested object, not the inner one", () => {
    const text = '{"a": {"b": 1}, "c": 2}';
    expect(jsonObjectSlice(text)).toBe(text);
  });

  it("returns the outermost object for a nested object embedded in prose and a fence", () => {
    const inner = '{"b": 1}';
    const outer = `{"a": ${inner}, "c": 2}`;
    const fenced = "```json\n" + outer + "\n```";
    const result = jsonObjectSlice(fenced);
    expect(result).toBe(outer);
    expect(result).not.toBe(inner);
  });
});
