import { describe, it, expect } from "vitest";
import {
  INSTITUTION_TRIGGER_CHAR,
  MAX_TRIGGER_QUERY_LEN,
  parseInstitutionTrigger,
  filterInstitutions,
  orderInstitutions,
  applyInstitutionSelection,
  nextHighlightIndex,
} from "./institution-trigger";

describe("INSTITUTION_TRIGGER_CHAR / MAX_TRIGGER_QUERY_LEN", () => {
  it("is the @ character", () => {
    expect(INSTITUTION_TRIGGER_CHAR).toBe("@");
  });

  it("caps queries at 12 characters", () => {
    expect(MAX_TRIGGER_QUERY_LEN).toBe(12);
  });
});

describe("parseInstitutionTrigger - prose false positives (word-boundary rule)", () => {
  // Each of these is typed out in full, caret at the end - the position the
  // user is actually at once they have finished typing the sentence. The
  // word-boundary rule (the character before "@" must be whitespace or
  // absent) is what keeps every one of these from ever opening the popup.

  it("never triggers inside an email address", () => {
    const text = "alexandergshaw@gmail.com";
    expect(parseInstitutionTrigger(text, text.length)).toBeNull();
    // Also check a caret sitting mid-domain, not just at the very end -
    // the alnum scan would otherwise walk straight through to the "@".
    expect(parseInstitutionTrigger(text, text.indexOf("gmail") + 3)).toBeNull();
  });

  it('never triggers in "email me at a@b.com"', () => {
    const text = "email me at a@b.com";
    expect(parseInstitutionTrigger(text, text.length)).toBeNull();
  });

  it('never triggers in "email me @ 3pm" once the sentence is fully typed', () => {
    // The "@" here IS preceded by a space, so the popup legitimately opens
    // for an instant right after "@" is typed - but by the time the rest of
    // the sentence is typed, the caret has moved past a space that breaks
    // the backward scan before it ever reaches the "@", so the settled,
    // fully-typed sentence is not a trigger.
    const text = "email me @ 3pm";
    expect(parseInstitutionTrigger(text, text.length)).toBeNull();
  });

  it('never triggers in "3.14" (no "@" present at all)', () => {
    const text = "3.14";
    expect(parseInstitutionTrigger(text, text.length)).toBeNull();
  });

  it('never triggers in "- item" (no "@" present at all)', () => {
    const text = "- item";
    expect(parseInstitutionTrigger(text, text.length)).toBeNull();
  });

  it('never triggers in "# Heading" (no "@" present at all)', () => {
    const text = "# Heading";
    expect(parseInstitutionTrigger(text, text.length)).toBeNull();
  });
});

describe("parseInstitutionTrigger - recognized triggers", () => {
  it('triggers on "@" at index 0', () => {
    const text = "@MC";
    expect(parseInstitutionTrigger(text, text.length)).toEqual({ start: 0, query: "MC" });
  });

  it('triggers on "@MC" preceded by a space', () => {
    const text = "hi @MC";
    expect(parseInstitutionTrigger(text, text.length)).toEqual({ start: 3, query: "MC" });
  });

  it("resolves the FIRST of two tokens when the caret sits inside it, not the last @ in the string", () => {
    const text = "hi @MCC and @MPCC";
    // Caret placed inside the first token, between "MC" and the closing "C":
    // "hi @MC" + "C and @MPCC" - i.e. right after typing "hi @MC".
    const caret = "hi @MC".length;
    expect(parseInstitutionTrigger(text, caret)).toEqual({ start: 3, query: "MC" });
  });

  it("resolves the SECOND token when the caret sits inside it", () => {
    const text = "hi @MCC and @MPCC";
    const caret = text.length; // end of string, inside/after the second token
    expect(parseInstitutionTrigger(text, caret)).toEqual({ start: text.indexOf("@MPCC"), query: "MPCC" });
  });

  it("returns an empty query for a bare, just-typed @", () => {
    const text = "@";
    expect(parseInstitutionTrigger(text, 1)).toEqual({ start: 0, query: "" });
  });

  it("returns null once the query exceeds MAX_TRIGGER_QUERY_LEN", () => {
    const longQuery = "ThisIsAVeryLongQuery"; // 20 chars, well past the 12 cap
    const text = `@${longQuery}`;
    expect(longQuery.length).toBeGreaterThan(MAX_TRIGGER_QUERY_LEN);
    expect(parseInstitutionTrigger(text, text.length)).toBeNull();
  });

  it("still triggers at exactly MAX_TRIGGER_QUERY_LEN characters (boundary, not off-by-one)", () => {
    const query = "A".repeat(MAX_TRIGGER_QUERY_LEN);
    const text = `@${query}`;
    expect(parseInstitutionTrigger(text, text.length)).toEqual({ start: 0, query });
  });
});

describe("filterInstitutions", () => {
  it("matches case-insensitively by prefix", () => {
    expect(filterInstitutions(["MCC", "MPCC", "GCU"], "mc")).toEqual(["MCC"]);
  });

  it("returns everything for an empty query", () => {
    expect(filterInstitutions(["MCC", "MPCC", "GCU"], "")).toEqual(["MCC", "MPCC", "GCU"]);
  });

  it('uses startsWith, not includes: "P" does not match "MPCC"', () => {
    // includes() would wrongly surface MPCC here (the "P" is its second
    // letter) - startsWith is what makes the result predictable.
    expect(filterInstitutions(["MPCC"], "P")).toEqual([]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterInstitutions(["MCC", "MPCC"], "ZZ")).toEqual([]);
  });
});

describe("orderInstitutions", () => {
  it("hoists the active institution to index 0, preserving the rest of registry order", () => {
    expect(orderInstitutions(["AAA", "MCC", "MPCC"], "MPCC")).toEqual(["MPCC", "AAA", "MCC"]);
  });

  it("leaves order untouched when active is already first", () => {
    expect(orderInstitutions(["MCC", "AAA"], "MCC")).toEqual(["MCC", "AAA"]);
  });

  it("leaves order untouched when active is empty (no institution set)", () => {
    expect(orderInstitutions(["MCC", "AAA"], "")).toEqual(["MCC", "AAA"]);
  });

  it("leaves order untouched when active is not present in the list (stale setting)", () => {
    expect(orderInstitutions(["MCC", "AAA"], "ZZZ")).toEqual(["MCC", "AAA"]);
  });
});

describe("applyInstitutionSelection", () => {
  it("deletes the token and parks the caret at its start", () => {
    const result = applyInstitutionSelection("@MC", 0, 3);
    expect(result).toEqual({ text: "", caret: 0 });
  });

  it("collapses the double space left behind when the token sat between two words", () => {
    // "what does @MCC say" -> delete "@MCC" (indices 10..14) -> "what does  say"
    // (a space before AND after the deleted token) -> collapses to one space.
    const text = "what does @MCC say";
    const start = text.indexOf("@");
    const caret = start + "@MCC".length;
    const result = applyInstitutionSelection(text, start, caret);
    expect(result).toEqual({ text: "what does say", caret: 10 });
  });

  it("does not collapse a space when the token was at the very start of the message", () => {
    // No character before the token at all, so there is nothing to collapse
    // against even though a space follows the deleted token.
    const text = "@MCC say";
    const start = 0;
    const caret = "@MCC".length;
    const result = applyInstitutionSelection(text, start, caret);
    expect(result).toEqual({ text: " say", caret: 0 });
  });

  it("does not collapse a space when the token butts against punctuation, not a following space", () => {
    const text = "hi @MCC, thanks";
    const start = text.indexOf("@");
    const caret = start + "@MCC".length;
    const result = applyInstitutionSelection(text, start, caret);
    expect(result).toEqual({ text: "hi , thanks", caret: 3 });
  });

  it("returns both the resulting text and the caret position together", () => {
    const result = applyInstitutionSelection("hello @MC world", 6, 9);
    expect(result.text).toBe("hello world");
    expect(result.caret).toBe(6);
  });
});

describe("nextHighlightIndex", () => {
  it("moves forward by one within bounds", () => {
    expect(nextHighlightIndex(0, 3, 1)).toBe(1);
  });

  it("moves backward by one within bounds", () => {
    expect(nextHighlightIndex(2, 3, -1)).toBe(1);
  });

  it("wraps from the last option to the first when moving forward", () => {
    expect(nextHighlightIndex(2, 3, 1)).toBe(0);
  });

  it("wraps from the first option to the last when moving backward", () => {
    expect(nextHighlightIndex(0, 3, -1)).toBe(2);
  });

  it("returns -1 when there are no options to highlight", () => {
    expect(nextHighlightIndex(0, 0, 1)).toBe(-1);
    expect(nextHighlightIndex(0, 0, -1)).toBe(-1);
  });
});
