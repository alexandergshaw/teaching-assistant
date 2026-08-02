import { describe, it, expect } from "vitest";
import { normalizeTypography } from "./text-normalize";

// Every fixture below builds its em/en dash and curly-quote input characters
// from their numeric code point (String.fromCharCode) rather than typing them
// as literals, so this test file itself never carries the typography under
// test - matching the house rule that only ASCII hyphens belong in code and
// comments (and normalizeTypography's own doc comment, which does the same).
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const LEFT_SINGLE_QUOTE = String.fromCharCode(0x2018);
const RIGHT_SINGLE_QUOTE = String.fromCharCode(0x2019);
const LEFT_DOUBLE_QUOTE = String.fromCharCode(0x201c);
const RIGHT_DOUBLE_QUOTE = String.fromCharCode(0x201d);

describe("normalizeTypography", () => {
  // ── Real measured output (fixtures from an actual generated course) ──────
  it("normalizes the exact TJX Companies em-dash sentence measured in a real generated course", () => {
    const input = `TJX Companies${EM_DASH}the parent company of TJ Maxx and Marshalls${EM_DASH}suffered one of the largest data breaches in retail history`;
    expect(normalizeTypography(input)).toBe(
      "TJX Companies - the parent company of TJ Maxx and Marshalls - suffered one of the largest data breaches in retail history"
    );
  });

  it("normalizes the exact Tesla curly-quote/apostrophe sentence measured in a real generated course", () => {
    const input =
      `Tesla${RIGHT_SINGLE_QUOTE}s Gigafactory program. Tesla shifted from traditional, slow-moving construction to a ` +
      `${LEFT_DOUBLE_QUOTE}machine that builds the machine${RIGHT_DOUBLE_QUOTE} philosophy`;
    expect(normalizeTypography(input)).toBe(
      'Tesla\'s Gigafactory program. Tesla shifted from traditional, slow-moving construction to a "machine that builds the machine" philosophy'
    );
    // The pre-existing ASCII hyphen in "slow-moving" must survive untouched.
    expect(normalizeTypography(input)).toContain("slow-moving");
  });

  // ── Em dash ────────────────────────────────────────────────────────────
  it("replaces a tightly-set em dash with a spaced hyphen", () => {
    expect(normalizeTypography(`word${EM_DASH}word`)).toBe("word - word");
  });

  it("replaces an already-spaced em dash without doubling the spaces", () => {
    expect(normalizeTypography(`word ${EM_DASH} word`)).toBe("word - word");
  });

  // ── En dash ────────────────────────────────────────────────────────────
  it("collapses an en dash in a numeric range to a plain hyphen with no surrounding spaces", () => {
    expect(normalizeTypography(`2013${EN_DASH}2016`)).toBe("2013-2016");
  });

  it("still collapses a numeric-range en dash to no-space form even when the source has incidental spaces", () => {
    expect(normalizeTypography(`2013 ${EN_DASH} 2016`)).toBe("2013-2016");
  });

  it("treats a non-numeric en dash the same as an em dash (spaced hyphen)", () => {
    expect(normalizeTypography(`word ${EN_DASH} word`)).toBe("word - word");
  });

  // ── Hyphenated words: must never be touched ───────────────────────────
  it("never touches a pre-existing ASCII hyphen in a hyphenated word", () => {
    // No em/en dash or curly quote anywhere in this input, so this alone only
    // proves the fast-path no-op returns the string unchanged - it never
    // actually reaches the substitution logic. See the next test for the
    // case that matters: a hyphenated word sitting in the SAME string as a
    // real trigger character.
    expect(normalizeTypography("well-known co-founder twenty-one")).toBe(
      "well-known co-founder twenty-one"
    );
  });

  it("never touches a hyphenated word even when the same string also contains a real em dash (forces the substitution path to run)", () => {
    const input = `well-known co-founder twenty-one word${EM_DASH}word`;
    expect(normalizeTypography(input)).toBe("well-known co-founder twenty-one word - word");
  });

  // ── Curly quotes/apostrophes ───────────────────────────────────────────
  it("replaces a curly apostrophe inside a word with a plain ASCII apostrophe, no spacing change", () => {
    expect(normalizeTypography(`Tesla${RIGHT_SINGLE_QUOTE}s Gigafactory`)).toBe("Tesla's Gigafactory");
  });

  it("replaces curly double quotes with straight ASCII double quotes", () => {
    expect(normalizeTypography(`a ${LEFT_DOUBLE_QUOTE}quoted phrase${RIGHT_DOUBLE_QUOTE} here`)).toBe(
      'a "quoted phrase" here'
    );
  });

  it("replaces a curly left single quote used as an opening quote", () => {
    expect(normalizeTypography(`${LEFT_SINGLE_QUOTE}quoted${RIGHT_SINGLE_QUOTE}`)).toBe("'quoted'");
  });

  // ── Fenced code blocks: never touched ─────────────────────────────────
  it("does not touch an em dash, en dash, or curly quote inside a fenced code block", () => {
    const input = [
      `Intro line with an em dash${EM_DASH}here.`,
      "```",
      `const s = "word${EM_DASH}word ${LEFT_DOUBLE_QUOTE}quoted${RIGHT_DOUBLE_QUOTE}";`,
      "```",
      `Outro line with a curly quote${RIGHT_SINGLE_QUOTE}s apostrophe.`,
    ].join("\n");
    const result = normalizeTypography(input);
    const lines = result.split("\n");

    expect(lines[0]).toBe("Intro line with an em dash - here.");
    // The fenced line is byte-for-byte unchanged.
    expect(lines[2]).toBe(`const s = "word${EM_DASH}word ${LEFT_DOUBLE_QUOTE}quoted${RIGHT_DOUBLE_QUOTE}";`);
    expect(lines[4]).toBe("Outro line with a curly quote's apostrophe.");
  });

  it("does not throw and still normalizes surrounding lines when a fence is left unterminated", () => {
    const input = [`Before${EM_DASH}fence.`, "```", `code${EM_DASH}line`].join("\n");
    const result = normalizeTypography(input);
    expect(result.split("\n")[0]).toBe("Before - fence.");
    // Everything from the unterminated fence onward stays untouched.
    expect(result.split("\n")[2]).toBe(`code${EM_DASH}line`);
  });

  // ── URLs: never touched ────────────────────────────────────────────────
  it("does not touch a dash character sitting inside a bare URL", () => {
    const input = `See https://example.com/2013${EN_DASH}2016/page for details${EM_DASH}it explains everything.`;
    const result = normalizeTypography(input);
    expect(result).toContain(`https://example.com/2013${EN_DASH}2016/page`);
    expect(result).toContain("details - it explains everything.");
  });

  it("does not touch a curly quote character sitting inside a bare URL", () => {
    const input = `See https://example.com/${LEFT_DOUBLE_QUOTE}weird${RIGHT_DOUBLE_QUOTE} for details.`;
    const result = normalizeTypography(input);
    expect(result).toContain(`https://example.com/${LEFT_DOUBLE_QUOTE}weird${RIGHT_DOUBLE_QUOTE}`);
  });

  // ── Multi-field / no-op behavior ───────────────────────────────────────
  it("returns plain ASCII text completely unchanged", () => {
    const input = "Plain text with a normal - hyphen and nothing fancy, \"quoted\" and 'apostrophe'd'.";
    expect(normalizeTypography(input)).toBe(input);
  });

  it("normalizes a single-line field with no fence just like a plain string (slide title / bullet shape)", () => {
    expect(normalizeTypography(`Case Study: TJX${EM_DASH}A Retail Breach`)).toBe(
      "Case Study: TJX - A Retail Breach"
    );
  });

  it("handles an empty string without throwing", () => {
    expect(normalizeTypography("")).toBe("");
  });
});
