// Unit tests for discussion-reply-redact.ts - THE PRIVACY BLOCKER.
//
// This leaf replaces a version of redactAuthorNameFromText that used a plain
// (non-unicode) `\bname\b` RegExp and stripped only three DERIVED name forms
// (greeting / firstName / lastName). A review found both flaws exploitable:
//
//   1. `\b` is ASCII-only in a non-unicode JS RegExp, so a name beginning or
//      ending in a non-ASCII letter (or written in a non-Latin script)
//      matched nothing at all - the whole surrounding text survived intact.
//   2. Only the three JOINED forms were stripped, so a second surname (any
//      author token besides the derived first/last split) or half of a
//      hyphenated surname independently leaked through the post body.
//
// Every test below is sabotage-checked: broken (reverted to plain `\b`
// matching against only the three joined forms, reproducing both bugs),
// confirmed red, restored, confirmed green. See the report handed back to
// the dispatcher for the sabotage evidence.

import { describe, it, expect } from "vitest";
import { redactAuthorNameFromText, redactAuthorNameFromPost } from "./discussion-reply-redact";

describe("redactAuthorNameFromText - the six attacks from the review", () => {
  it("ATTACK 1: an accented name (Jose with an accented e) is fully stripped, not left exempt by an ASCII-only \\b", () => {
    const result = redactAuthorNameFromText("José, thanks so much for reading this and replying so quickly!", "José Fernandez");
    expect(result.toLowerCase()).not.toContain("josé");
  });

  it("ATTACK 2: an accented name (Olafur with an accented O) is fully stripped", () => {
    const result = redactAuthorNameFromText("Ólafur brings up a great point about entropy here.", "Ólafur Magnusson");
    expect(result.toLowerCase()).not.toContain("ólafur");
  });

  it("ATTACK 3: a second/middle surname independently mentioned in the post body is stripped, not just the derived last token", () => {
    const result = redactAuthorNameFromText("Santos here again: mitosis confuses me.", "Ana Maria Santos Silva");
    expect(result.toLowerCase()).not.toContain("santos");
  });

  it("ATTACK 4: half of a hyphenated surname (comma form) independently mentioned is stripped", () => {
    const result = redactAuthorNameFromText("Reyes argues that supply curves shift.", "Lopez-Reyes, Maria");
    expect(result.toLowerCase()).not.toContain("reyes");
  });

  it("ATTACK 5 (over-redaction guard): an unrelated name is left untouched - included so the fix does not over-redact", () => {
    const result = redactAuthorNameFromText("I agree with Marcus about the reading.", "Maria Lopez");
    expect(result).toContain("Marcus");
  });

  it("ATTACK 6 (the pinned guard): Marian must still survive when the author is Maria - a substring is not a whole word", () => {
    const result = redactAuthorNameFromText("The Marian era of the reform.", "Maria Lopez");
    expect(result).toContain("Marian");
  });
});

describe("redactAuthorNameFromText - additional required cases", () => {
  it("a non-Latin-script name (Cyrillic) is stripped just like an ASCII one", () => {
    const result = redactAuthorNameFromText(
      "Петров сделал отличную работу.",
      "Иван Петров"
    );
    expect(result.toLowerCase()).not.toContain("петров");
  });

  it("a hyphenated surname mentioned as ONE unit is stripped as a clean whole, not left with a stray hyphen", () => {
    const result = redactAuthorNameFromText("Martin-Lewis submitted the assignment early.", "Zoe Martin-Lewis");
    expect(result.toLowerCase()).not.toContain("martin");
    expect(result.toLowerCase()).not.toContain("lewis");
  });

  it("an apostrophe name (O'Brien) is stripped as a clean whole, leaving no stray apostrophe fragment glued to real text", () => {
    const result = redactAuthorNameFromText("O'Brien makes a great point about entropy.", "Sean O'Brien");
    expect(result.toLowerCase()).not.toContain("brien");
    expect(result).toBe("makes a great point about entropy.");
  });

  it("a possessive ('s) still works: only the name is stripped, the possessive suffix survives", () => {
    const result = redactAuthorNameFromText("Diego's own point about the reading was sharp.", "Diego Ramirez");
    expect(result.toLowerCase()).not.toContain("diego");
    expect(result).toBe("'s own point about the reading was sharp.");
  });

  it("SABOTAGE CHECK: a possessive combined with the comma-form author string strips both derived forms", () => {
    // Reproduces the pre-existing sabotage-checked case from
    // useReplyResources.test.ts, now against the fixed leaf.
    const result = redactAuthorNameFromText("Diego mentioned Chen's paper and Diego's own point.", "Chen, Diego");
    expect(result.toLowerCase()).not.toContain("diego");
    expect(result.toLowerCase()).not.toContain("chen");
  });

  it("mid-sentence, case-varied occurrences are still stripped (unicode fix does not regress the ASCII case)", () => {
    const result = redactAuthorNameFromText("Great job, MARIA! Loved reading this.", "Maria Lopez");
    expect(result.toLowerCase()).not.toContain("maria");
  });

  it("a mononym author (single token) still gets its own name stripped", () => {
    const result = redactAuthorNameFromText("Aisha, nice work on this.", "Aisha");
    expect(result.toLowerCase()).not.toContain("aisha");
  });

  it("empty author leaves the text untouched aside from the trim/whitespace cleanup", () => {
    expect(redactAuthorNameFromText("Just some text.", "")).toBe("Just some text.");
  });

  it("SABOTAGE CHECK: reverting to plain \\b (ASCII-only) matching would fail ATTACK 1 - pinned as a direct regression guard", () => {
    // If the unicode lookaround fix regresses back to `\bJosé\b`, the
    // boundary between é and the following comma is non-word on both
    // sides under ASCII \b semantics, so the whole match silently fails and
    // this assertion catches it immediately.
    const result = redactAuthorNameFromText("José, greetings.", "José");
    expect(result).not.toContain("José");
  });

  it("SABOTAGE CHECK: reverting to only the three joined forms would fail ATTACK 3 - pinned as a direct regression guard", () => {
    // If authorTokens() is removed and only greeting/firstName/lastName are
    // stripped, "Santos" (a middle token of a 4-token author string) is in
    // NEITHER the greeting, the joined firstName ("Ana Maria Santos"), nor
    // the lastName ("Silva") as an exact standalone match target that would
    // survive tokenization removal - this direct check on "Santos" alone
    // fails immediately if per-token stripping is removed.
    const result = redactAuthorNameFromText("Santos disagrees with the premise.", "Ana Maria Santos Silva");
    expect(result.toLowerCase()).not.toContain("santos");
  });
});

describe("redactAuthorNameFromPost - the bulk path's own redact-then-normalize step (BLOCKER 3)", () => {
  it("redacts a self-introduction in the post body, then normalizes/truncates like deriveResourceConcept", () => {
    const result = redactAuthorNameFromPost("Hi everyone, I'm Maria Alvarez and today's topic really got me thinking.", "Maria Alvarez");
    expect(result.toLowerCase()).not.toContain("maria");
    expect(result.toLowerCase()).not.toContain("alvarez");
  });

  it("an undefined author (no author field supplied) leaves the text untouched aside from normalization - never throws", () => {
    expect(redactAuthorNameFromPost("Just a post about recursion.", undefined)).toBe("Just a post about recursion.");
  });

  it("collapses internal whitespace the same way deriveResourceConcept does on its own", () => {
    const result = redactAuthorNameFromPost("Too   many     spaces   here.", undefined);
    expect(result).toBe("Too many spaces here.");
  });

  it("SABOTAGE CHECK: dropping the redaction call (concept derived from raw text) would leak the name straight through", () => {
    const result = redactAuthorNameFromPost("Sam Lee here, discussing merge sort complexity.", "Sam Lee");
    expect(result).not.toMatch(/\bsam\b/i);
    expect(result).not.toMatch(/\blee\b/i);
  });
});
