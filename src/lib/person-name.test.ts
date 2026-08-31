import { describe, expect, it } from "vitest";
import { deriveReplyAuthorName, type ReplyAuthorName } from "./person-name";

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
