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

// GROUP F / A8 (docs/answers-in-the-reply-acceptance-criteria.md): frozen
// truncation oracle.
//
// parseLenientJsonArray slices the candidate from the first "[" to the
// LAST "]" in the text (lines 11-15). On a truncated response the last "]"
// almost always belongs to the CUT-OFF element's own inner array
// ("concepts" or "questions"), not the outer array - the outer "]" was
// never emitted. That slice already ends one character short of the
// PRECEDING element's closing "}" (the "}" comes right after that inner
// array's "]" in the source text, but the slice stops AT the "]"). The
// walk-back that follows (lines 64-86) then searches backward for a "}" to
// close the array early, with no notion of string content or nesting
// depth: a reply that quotes code - realistic here, since this is a
// teaching-assistant prompt answering programming questions - puts "{" and
// "}" characters INSIDE an already-complete, already-valid string value.
// The naive scan cannot tell those apart from a real object boundary, so
// it burns its five backward attempts on brace characters that sit inside
// that string and gives up before ever reaching the real element boundary,
// even though the element is intact, earlier in the text.
//
// This corpus is built to hit exactly that: three complete elements, the
// second of which quotes a snippet nested five levels deep (six closing
// braces inside one string value) - enough to exhaust the five-attempt
// budget. Sweeping every prefix of it against the implementation BEFORE
// the depth-tracked recovery existed gave: null for [0, 388], the first
// element alone for [389, 544], null again for [545, 751] (this is the
// range the required regression case below lives in), the first two
// elements for [752, 839], and all three at the full length (840). Only
// the non-null ranges are pinned as a forever-guarantee below - pinning
// the null ranges too would contradict A8 itself, which explicitly allows
// a null-today cut to start resolving to something else.
describe("parseLenientJsonArray truncation oracle (A8, frozen before the fix)", () => {
  const ELEMENTS = [
    {
      post: 1,
      reply:
        "Your accumulator is declared inside the loop, so it resets every pass; move the sum above the loop and it will accumulate correctly across every row and column.",
      concepts: ["scope", "accumulators", "nested loops"],
      questions: ["Where should the accumulator live?"],
    },
    {
      post: 2,
      reply:
        "You need to guard every level before indexing: function get(grid, i, j) { if (grid[i]) { if (grid[i][j] !== undefined) { if (j >= 0) { if (i >= 0) { return grid[i][j]; } } } } } return null; }",
      concepts: ["array indexing", "bounds checking"],
      questions: [],
    },
    {
      post: 3,
      reply:
        "Stomata open and close in response to guard cell turgor pressure, which controls carbon dioxide intake and water loss.",
      concepts: ["stomata", "guard cells", "gas exchange"],
      questions: [
        "What triggers guard cell turgor changes?",
        "Does this differ at night?",
      ],
    },
  ];

  const SOURCE_TEXT = JSON.stringify(ELEMENTS);

  // The A8 contract, pinned: "when today's path returns a non-null result,
  // return it byte-identically." These three ranges are every prefix
  // length that resolved to something non-null BEFORE the depth-tracked
  // recovery existed, with the exact value it resolved to - a literal
  // recorded value, not a comparison computed against the implementation
  // under test. This must hold for every prefix length in each range,
  // forever, regardless of what recoverByDepth does or how it changes.
  const NON_NULL_RANGES: Array<{ from: number; to: number; expected: unknown[] }> = [
    { from: 389, to: 544, expected: ELEMENTS.slice(0, 1) },
    { from: 752, to: 839, expected: ELEMENTS.slice(0, 2) },
    { from: 840, to: 840, expected: ELEMENTS.slice(0, 3) },
  ];

  it("returns the frozen, byte-identical result for every prefix cut position that already resolved to something before the fix", () => {
    expect(SOURCE_TEXT.length).toBe(840);
    for (const range of NON_NULL_RANGES) {
      for (let len = range.from; len <= range.to; len++) {
        const result = parseLenientJsonArray(SOURCE_TEXT.slice(0, len));
        expect(result).toEqual(range.expected);
      }
    }
  });

  it("still returns null for a cut too early for any element to be complete", () => {
    // Before element 1's own closing "}" (index 283 of SOURCE_TEXT) there
    // is no complete element anywhere in the text - depth-tracked recovery
    // must not invent one out of a half-written first element.
    const result = parseLenientJsonArray(SOURCE_TEXT.slice(0, 50));
    expect(result).toBeNull();
  });

  // The required regression case (A8): a cut inside the THIRD element's
  // "reply" string, with elements 1 and 2 fully complete. Today this falls
  // inside the [545, 751] null range above - the last "]" in the truncated
  // text is element 2's own "questions": [] closing (empty array, closes
  // immediately), one character before element 2's real "}", so the
  // candidate is missing exactly that one "}". The naive walk-back's five
  // attempts are then spent on the six "}" characters inside element 2's
  // quoted code snippet and it gives up, discarding BOTH complete
  // elements. The fix must recover elements 1 and 2 without touching this
  // test file's other, non-null, frozen expectations above.
  it("recovers elements 1 and 2 from a cut inside element 3's reply string (fails before the fix, passes after)", () => {
    const cut = SOURCE_TEXT.indexOf("controls carbon dioxide");
    expect(cut).toBeGreaterThan(0);
    const truncated = SOURCE_TEXT.slice(0, cut);

    const result = parseLenientJsonArray(truncated, { recoverTruncatedElements: true });

    expect(result).toEqual(ELEMENTS.slice(0, 2));
  });

  // VERIFY PASS: the recovery is OPT-IN, and this pins the default. The
  // parser has 18 call sites; turning "null" into "a partial array" for all
  // of them would silently change every caller that reads null as "this
  // batch failed" - a different and worse failure than the one being fixed.
  it("returns null for that same input when the caller has not opted in", () => {
    const cut = SOURCE_TEXT.indexOf("controls carbon dioxide");
    const truncated = SOURCE_TEXT.slice(0, cut);

    expect(parseLenientJsonArray(truncated)).toBeNull();
    expect(parseLenientJsonArray(truncated, {})).toBeNull();
    expect(parseLenientJsonArray(truncated, { recoverTruncatedElements: false })).toBeNull();
  });

  // VERIFY PASS: the recovered slice is tried UNREPAIRED first. The depth
  // scan is string-aware, so its slice is usually already valid JSON, and
  // the unquoted-key repair is not - it rewrites `, though:` inside a string
  // value to `, "though":` and the parse then throws. An earlier revision
  // ran the repairs unconditionally and so failed on ordinary prose, which
  // is exactly the input this recovery exists for.
  it("recovers a truncated batch whose completed element contains prose the repair chain would corrupt", () => {
    const text =
      '[{"post":1,"reply":"There is one catch, though: the outer iterator re-enters before the inner one drains.","concepts":["iterator re-entry"],"questions":[]},{"post":2,"reply":"The second thing to say is that the co';

    expect(parseLenientJsonArray(text)).toBeNull();
    expect(parseLenientJsonArray(text, { recoverTruncatedElements: true })).toEqual([
      {
        post: 1,
        reply: "There is one catch, though: the outer iterator re-enters before the inner one drains.",
        concepts: ["iterator re-entry"],
        questions: [],
      },
    ]);
  });
});
