// Tests for llm-json.ts (docs/llm-command-interface-acceptance-criteria.md,
// section 10 / section 9 item 2).
//
// Sabotage check performed by hand against the real source file (backed up
// first, restored afterward, restore proven with a diff against that
// backup - see the final report for the exact commands and their output):
//   1. `sliceOutermostJsonValue`'s early return on the FIRST zero-depth
//      crossing (`if (depth === 0) return text.slice(...)`) was changed to
//      instead remember the LAST zero-depth crossing and return that at the
//      end of the scan - i.e. reintroducing the naive
//      indexOf("{")/lastIndexOf("}") behaviour this file exists to replace
//      (see the header above). Reddened "does not let a brace inside prose
//      AFTER the JSON extend the slice" (and only that test - the other 14
//      stayed green), because the slice then ran through to the stray
//      closing brace in the trailing "{format}" prose, producing text that
//      fails JSON.parse instead of the real, earlier object.
// Restored, diffed clean against the backup, and the suite returned to
// green - see the report.

import { describe, it, expect } from "vitest";
import { parseLlmJson } from "./llm-json";

describe("parseLlmJson", () => {
  it("parses a bare JSON object with no fence or surrounding text", () => {
    const result = parseLlmJson<{ a: number }>('{"a": 1}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  it("parses a bare JSON array", () => {
    const result = parseLlmJson<number[]>("[1, 2, 3]");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([1, 2, 3]);
  });

  it("parses an object wrapped in a ```json fence", () => {
    const text = '```json\n{"a": 1, "b": "two"}\n```';
    const result = parseLlmJson<{ a: number; b: string }>(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1, b: "two" });
  });

  it("parses an object wrapped in an untagged fence", () => {
    const text = '```\n{"a": 1}\n```';
    const result = parseLlmJson<{ a: number }>(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  it("parses JSON with prose before and after it", () => {
    const text = 'Sure, here is the result:\n{"a": 1, "b": 2}\nLet me know if you need anything else.';
    const result = parseLlmJson<{ a: number; b: number }>(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1, b: 2 });
  });

  it("parses JSON with prose before/after AND a fence", () => {
    const text = 'Here you go:\n```json\n{"a": 1}\n```\nHope that helps!';
    const result = parseLlmJson<{ a: number }>(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  it("does not let a brace inside prose AFTER the JSON extend the slice", () => {
    // The naive indexOf("{")/lastIndexOf("}") approach every existing
    // extractJsonObject uses would slice from the real "{" through the
    // trailing prose's "}" (in "{format}"), producing text that fails
    // JSON.parse even though a perfectly valid object is present.
    const text = 'Here is the object: {"a": 1} - let me know if that {format} works for you.';
    const result = parseLlmJson<{ a: number }>(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  it("does not let a brace INSIDE a JSON string value break bracket matching", () => {
    const text = '{"description": "See the {legacy} config block for details.", "ok": true}';
    const result = parseLlmJson<{ description: string; ok: boolean }>(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.description).toBe("See the {legacy} config block for details.");
      expect(result.value.ok).toBe(true);
    }
  });

  it("handles an escaped quote inside a string without ending the string early", () => {
    const text = '{"title": "The \\"Best\\" Module", "n": 2}';
    const result = parseLlmJson<{ title: string; n: number }>(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('The "Best" Module');
      expect(result.value.n).toBe(2);
    }
  });

  it("returns ok:false with a reason for an empty response, never throwing", () => {
    const result = parseLlmJson("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(typeof result.reason).toBe("string");
  });

  it("returns ok:false with a reason for prose containing no JSON at all", () => {
    const result = parseLlmJson("I could not find anything to change.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });

  it("returns ok:false, never a partial fragment, for an unterminated object", () => {
    const result = parseLlmJson('{"a": 1, "b": 2');
    expect(result.ok).toBe(false);
  });

  it("returns ok:false for a fenced block whose content is not valid JSON, without throwing", () => {
    const text = "```json\nnot actually json\n```";
    expect(() => parseLlmJson(text)).not.toThrow();
    const result = parseLlmJson(text);
    expect(result.ok).toBe(false);
  });

  it("falls back to raw-text scanning when the fenced region itself is not JSON but the object also appears outside it", () => {
    // Defends the candidate-list fallback order: a broken/irrelevant fence
    // must not prevent finding a real object elsewhere in the same text.
    const text = '```json\nnot json\n```\nActual result: {"a": 1}';
    const result = parseLlmJson<{ a: number }>(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  it("never throws on non-string input", () => {
    // @ts-expect-error - deliberately passing a non-string to prove the
    // discriminated result, not an exception, is how this reports it.
    const result = parseLlmJson(null);
    expect(result.ok).toBe(false);
  });
});
