import { describe, expect, it } from "vitest";
import { deriveReplyAuthorName, greetingNameFromAuthor, isGreetingDegradedForAuthor, type ReplyAuthorName } from "./person-name";

// F16: a frozen literal oracle. Every expectation below is a hand-written
// literal - never re-derived by calling deriveReplyAuthorName - so the test
// can actually fail if the implementation drifts from the rule order in
// docs/discussion-reply-sort-filter-acceptance-criteria.md section 3 (F2/F3),
// adopted from REGRESSION entry 361.
const ORACLE: ReadonlyArray<{ readonly label: string; readonly input: string; readonly expected: ReplyAuthorName }> = [
  {
    label: "two tokens, no comma - last word is the surname",
    input: "John Smith",
    expected: {
      firstName: "John",
      lastName: "Smith",
      source: "derived",
      correctionHint:
        'Guessed by treating the last word of "John Smith" as the surname - if that is wrong ' +
        '(for example, a multi-part surname), correct it as "Smith, John".',
    },
  },
  {
    label: "comma is the correction channel",
    input: "Smith, John",
    expected: { firstName: "John", lastName: "Smith", source: "explicit" },
  },
  {
    label: "multi-part given name, no comma - only the last token is the surname",
    input: "Maria de la Cruz",
    expected: {
      firstName: "Maria de la",
      lastName: "Cruz",
      source: "derived",
      correctionHint:
        'Guessed by treating the last word of "Maria de la Cruz" as the surname - if that is wrong ' +
        '(for example, a multi-part surname), correct it as "Cruz, Maria de la".',
    },
  },
  {
    label: "three tokens, no comma",
    input: "Rajesh Kumar Patel",
    expected: {
      firstName: "Rajesh Kumar",
      lastName: "Patel",
      source: "derived",
      correctionHint:
        'Guessed by treating the last word of "Rajesh Kumar Patel" as the surname - if that is wrong ' +
        '(for example, a multi-part surname), correct it as "Patel, Rajesh Kumar".',
    },
  },
  {
    label: "hyphenated surname token - the hyphen is not a token boundary",
    input: "Kim Jong-un",
    expected: {
      firstName: "Kim",
      lastName: "Jong-un",
      source: "derived",
      correctionHint:
        'Guessed by treating the last word of "Kim Jong-un" as the surname - if that is wrong ' +
        '(for example, a multi-part surname), correct it as "Jong-un, Kim".',
    },
  },
  {
    label: "mononym - the surname is UNKNOWN, not an empty first name with a filled surname",
    input: "Cher",
    expected: { firstName: "Cher", lastName: "", source: "single" },
  },
  {
    label: "empty string",
    input: "",
    expected: { firstName: "", lastName: "", source: "none" },
  },
  {
    label: "whitespace-only string",
    input: "   ",
    expected: { firstName: "", lastName: "", source: "none" },
  },
  {
    label: "trailing timestamp artifact - a vision-read author string can carry one; the rule is mechanical, not semantic",
    input: "John Smith 10:45am",
    expected: {
      firstName: "John Smith",
      lastName: "10:45am",
      source: "derived",
      correctionHint:
        'Guessed by treating the last word of "John Smith 10:45am" as the surname - if that is wrong ' +
        '(for example, a multi-part surname), correct it as "10:45am, John Smith".',
    },
  },
  {
    label: "middle initial",
    input: "John Q. Public",
    expected: {
      firstName: "John Q.",
      lastName: "Public",
      source: "derived",
      correctionHint:
        'Guessed by treating the last word of "John Q. Public" as the surname - if that is wrong ' +
        '(for example, a multi-part surname), correct it as "Public, John Q.".',
    },
  },
];

describe("deriveReplyAuthorName", () => {
  it.each(ORACLE.map((c) => [c.label, c.input, c.expected] as const))(
    "%s",
    (_label, input, expected) => {
      expect(deriveReplyAuthorName(input)).toEqual(expected);
    }
  );

  it("does not attach a correctionHint to explicit, single, or none sources", () => {
    expect(deriveReplyAuthorName("Smith, John").correctionHint).toBeUndefined();
    expect(deriveReplyAuthorName("Cher").correctionHint).toBeUndefined();
    expect(deriveReplyAuthorName("").correctionHint).toBeUndefined();
  });

  it("F3: the sort key for an unknown surname is the empty string, never a display marker", () => {
    // A mononym's lastName must be "" so it sorts blank-last - the em dash
    // rendered in the table cell is display-only and lives in the panel,
    // never in this function's return value.
    const single = deriveReplyAuthorName("Cher");
    expect(single.lastName).toBe("");
    expect(single.lastName).not.toBe("—"); // em dash

    const none = deriveReplyAuthorName("");
    expect(none.lastName).toBe("");
  });

  it("trims surrounding whitespace before splitting", () => {
    expect(deriveReplyAuthorName("  Smith, John  ")).toEqual({
      firstName: "John",
      lastName: "Smith",
      source: "explicit",
    });
  });

  it("takes the FIRST comma when more than one is present", () => {
    expect(deriveReplyAuthorName("Smith, John, Jr.")).toEqual({
      firstName: "John, Jr.",
      lastName: "Smith",
      source: "explicit",
    });
  });
});

// C1b-i: a frozen literal oracle, same discipline as ORACLE above - every
// expectation is a hand-written literal, never re-derived by calling
// greetingNameFromAuthor.
const GREETING_ORACLE: ReadonlyArray<{ readonly label: string; readonly input: string; readonly expected: string }> = [
  { label: "multi-part given name, no comma - first token only, never the sort-key firstName", input: "Maria de la Cruz", expected: "Maria" },
  { label: "three tokens, no comma", input: "Rajesh Kumar Patel", expected: "Rajesh" },
  { label: "middle initial", input: "John Q. Public", expected: "John" },
  { label: "comma form - first token AFTER the comma", input: "Smith, John", expected: "John" },
  // BLOCKER 1 fixer pass: this used to expect "mchen" - that was the
  // exact defect the fixer pass closed (a handle-shaped single token was
  // returned as-is and reached a student as a greeting). A lowercase,
  // comma-free, single-token author now degrades to "" - see the dedicated
  // "degrade rules (BLOCKER 1)" describe block below for the full oracle.
  { label: "single token (C1c), all-lowercase - reads as a handle, degrades to \"\"", input: "mchen", expected: "" },
  { label: "empty string", input: "", expected: "" },
];

describe("greetingNameFromAuthor", () => {
  it.each(GREETING_ORACLE.map((c) => [c.label, c.input, c.expected] as const))(
    "%s",
    (_label, input, expected) => {
      expect(greetingNameFromAuthor(input)).toBe(expected);
    }
  );

  it("C1b-i: never matches deriveReplyAuthorName's sort-key firstName for a multi-token name", () => {
    const author = "Maria de la Cruz";
    expect(greetingNameFromAuthor(author)).toBe("Maria");
    expect(greetingNameFromAuthor(author)).not.toBe(deriveReplyAuthorName(author).firstName);
    expect(deriveReplyAuthorName(author).firstName).toBe("Maria de la");
  });

  it("documented decision: a trailing comma with nothing after it has no given name to report, and returns \"\" rather than falling back to the surname", () => {
    expect(greetingNameFromAuthor("Smith,")).toBe("");
    expect(greetingNameFromAuthor("Smith,  ")).toBe("");
  });

  it("BLOCKER 1 fixer pass: a token that is only punctuation (no letters at all) degrades to \"\" - it was previously returned whole, which was the exact defect this pass closed", () => {
    expect(greetingNameFromAuthor("...")).toBe("");
    expect(greetingNameFromAuthor("---")).toBe("");
  });

  it("a bare comma with nothing on either meaningful side also returns \"\" (no given name after the comma)", () => {
    expect(greetingNameFromAuthor(",")).toBe("");
  });

  it("trims surrounding whitespace before splitting", () => {
    expect(greetingNameFromAuthor("  Smith, John  ")).toBe("John");
    // BLOCKER 1 fixer pass: "mchen" degrades (see above) - trimming
    // whitespace off it must not change that outcome.
    expect(greetingNameFromAuthor("  mchen  ")).toBe("");
  });

  it("whitespace-only input returns \"\", same as empty", () => {
    expect(greetingNameFromAuthor("   ")).toBe("");
  });

  it("hyphenated first token is not split further (the hyphen is not a token boundary)", () => {
    expect(greetingNameFromAuthor("Jong-un Kim")).toBe("Jong-un");
  });
});

// docs/reply-composition-controls-acceptance-criteria.md BLOCKER 1 fixer
// pass: the three degrade rules, each tested independently (a single
// combined test would pass on any one rule alone), plus the mononym
// exception the AC explicitly calls out as the thing this must NOT break.
// Every expectation is a frozen literal, same discipline as GREETING_ORACLE
// above.
describe("greetingNameFromAuthor degrade rules (BLOCKER 1)", () => {
  describe("rule 1: the first token contains no letters at all", () => {
    it("punctuation-only degrades to \"\"", () => {
      expect(greetingNameFromAuthor("...")).toBe("");
      expect(greetingNameFromAuthor("---")).toBe("");
    });

    it("digit-only degrades to \"\"", () => {
      expect(greetingNameFromAuthor("12345")).toBe("");
    });
  });

  describe("rule 2: the first token contains a character outside letters/hyphen/apostrophe/period", () => {
    it("a digit mixed with letters degrades to \"\"", () => {
      expect(greetingNameFromAuthor("mchen2")).toBe("");
    });

    it("an underscore degrades to \"\"", () => {
      expect(greetingNameFromAuthor("_user")).toBe("");
    });

    it("an @ (a handle/mention shape) degrades to \"\"", () => {
      expect(greetingNameFromAuthor("@handle")).toBe("");
    });

    it("a slash degrades to \"\"", () => {
      expect(greetingNameFromAuthor("user/name")).toBe("");
    });

    it("still KEEPS the characters the rule explicitly allows: hyphen, apostrophe, period", () => {
      expect(greetingNameFromAuthor("Anne-Marie")).toBe("Anne-Marie");
      expect(greetingNameFromAuthor("O'Brien")).toBe("O'Brien");
      expect(greetingNameFromAuthor("J.R. Smith")).toBe("J.R.");
    });
  });

  describe("rule 3: a single-token author with no uppercase letter (narrow - single-token authors ONLY)", () => {
    it("an all-lowercase single-token author degrades to \"\" - reads as a handle", () => {
      expect(greetingNameFromAuthor("mchen")).toBe("");
    });

    it("does NOT degrade a capitalised mononym - a real name must still be greeted", () => {
      expect(greetingNameFromAuthor("Maria")).toBe("Maria");
      expect(greetingNameFromAuthor("Cher")).toBe("Cher");
    });

    it("does NOT apply to a multi-token author, even when its first token is itself lowercase", () => {
      // Two tokens is direct evidence of a real name typed in lowercase,
      // not a handle - rule 3 is scoped to single-token authors only, per
      // the AC's explicit "the asymmetry is deliberate" instruction.
      expect(greetingNameFromAuthor("chen wei")).toBe("chen");
    });

    it("does NOT apply to a comma-form author, even when the given name after the comma is one lowercase word", () => {
      // "Smith, chen" has already supplied TWO components (a surname and a
      // given name) - that is direct evidence of a real name, so the
      // comma-form path never counts as "the ONLY token in the author
      // string" for rule 3's purposes.
      expect(greetingNameFromAuthor("Smith, chen")).toBe("chen");
    });
  });

  describe("every previously-passing row keeps its exact result (regression oracle)", () => {
    it("multi-token names are unaffected", () => {
      expect(greetingNameFromAuthor("Maria de la Cruz")).toBe("Maria");
      expect(greetingNameFromAuthor("Rajesh Kumar Patel")).toBe("Rajesh");
      expect(greetingNameFromAuthor("John Q. Public")).toBe("John");
    });

    it("comma form is unaffected", () => {
      expect(greetingNameFromAuthor("Smith, John")).toBe("John");
    });

    it("empty and trailing-comma inputs are unaffected", () => {
      expect(greetingNameFromAuthor("")).toBe("");
      expect(greetingNameFromAuthor("Smith,")).toBe("");
    });
  });
});

// docs/reply-composition-controls-acceptance-criteria.md C1c-i (BLOCKER 2,
// fixer pass): DiscussionReplyRow.tsx's degrade marker is shown exactly when
// this returns true. Since vitest here renders no component, this is the
// ONLY test surface for the marker's condition - the JSX itself (placement,
// aria-describedby wiring, the visible "(no greeting)" text) is verified by
// reading DiscussionReplyRow.tsx, not by a rendered test.
describe("isGreetingDegradedForAuthor (C1c-i)", () => {
  it("true when the toggle is ON and the author's greeting name is unaddressable", () => {
    expect(isGreetingDegradedForAuthor(true, "mchen")).toBe(true);
    expect(isGreetingDegradedForAuthor(true, "...")).toBe(true);
    expect(isGreetingDegradedForAuthor(true, "")).toBe(true);
  });

  it("false when the toggle is ON but the author DOES have a usable greeting name", () => {
    expect(isGreetingDegradedForAuthor(true, "Maria de la Cruz")).toBe(false);
    expect(isGreetingDegradedForAuthor(true, "Maria")).toBe(false);
    expect(isGreetingDegradedForAuthor(true, "Smith, John")).toBe(false);
  });

  it("false whenever the toggle is OFF, regardless of whether the author would degrade - no greeting decision to report", () => {
    expect(isGreetingDegradedForAuthor(false, "mchen")).toBe(false);
    expect(isGreetingDegradedForAuthor(false, "...")).toBe(false);
    expect(isGreetingDegradedForAuthor(false, "")).toBe(false);
    expect(isGreetingDegradedForAuthor(false, "Maria")).toBe(false);
  });
});
