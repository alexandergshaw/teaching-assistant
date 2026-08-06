// TDD suite written from the AC BEFORE the implementation (F1/F2/F5).
//
// The formatter tests use a FROZEN LITERAL ORACLE: every expected string is
// written out in full here rather than rebuilt from the implementation's own
// label constants. That is deliberate - if a later refactor re-derives the
// labels or reorders the fields, a test that composed its expectation from
// those same constants would silently keep passing. See docs/REGRESSION.md's
// note on refactors making equivalence tests tautological.
import { describe, it, expect } from "vitest";
import {
  applyUrlCorroboration,
  emptyFields,
  formatTextbookValue,
  parseTextbookFields,
  parseTextbookRecommendations,
  TEXTBOOK_FIELD_LABELS,
  TEXTBOOK_FIELD_ORDER,
  type TextbookFields,
  type TextbookRecommendation,
} from "./textbook-recommendations";

const FULL: TextbookFields = {
  title: "Introduction to Java Programming",
  authors: "Y. Daniel Liang",
  edition: "12th",
  isbn: "978-0135935118",
  publisher: "Pearson",
  year: "2020",
  url: "https://www.cengage.com/c/example",
};

describe("formatTextbookValue - AC42/AC43/AC44 (always the same shape)", () => {
  it("renders every field as labelled lines in the fixed order", () => {
    expect(formatTextbookValue(FULL)).toBe(
      [
        "Title: Introduction to Java Programming",
        "Authors: Y. Daniel Liang",
        "Edition: 12th",
        "ISBN: 978-0135935118",
        "Publisher: Pearson",
        "Year: 2020",
        "URL: https://www.cengage.com/c/example",
      ].join("\n")
    );
  });

  it("omits empty fields entirely - no empty label, no placeholder text", () => {
    const value = formatTextbookValue({
      title: "Discrete Mathematics",
      authors: "Susanna Epp",
      edition: "",
      isbn: "   ",
      publisher: "",
      year: "2019",
      url: "",
    });

    expect(value).toBe(
      ["Title: Discrete Mathematics", "Authors: Susanna Epp", "Year: 2019"].join("\n")
    );
    expect(value).not.toContain("Edition");
    expect(value).not.toContain("ISBN");
    expect(value).not.toContain("Publisher");
    expect(value).not.toContain("URL");
    expect(value).not.toMatch(/N\/A|unknown|not listed/i);
  });

  it("keeps the field ORDER fixed regardless of the key order of the input object", () => {
    const scrambled = {
      url: FULL.url,
      year: FULL.year,
      isbn: FULL.isbn,
      title: FULL.title,
      publisher: FULL.publisher,
      authors: FULL.authors,
      edition: FULL.edition,
    };
    expect(formatTextbookValue(scrambled)).toBe(
      [
        "Title: Introduction to Java Programming",
        "Authors: Y. Daniel Liang",
        "Edition: 12th",
        "ISBN: 978-0135935118",
        "Publisher: Pearson",
        "Year: 2020",
        "URL: https://www.cengage.com/c/example",
      ].join("\n")
    );
  });

  it("trims each value and collapses internal whitespace/newlines to one space", () => {
    expect(
      formatTextbookValue({
        title: "  Introduction to\n   Java   Programming  ",
        authors: "Y. Daniel\tLiang",
        edition: "",
        isbn: "",
        publisher: "",
        year: "",
        url: "",
      })
    ).toBe(["Title: Introduction to Java Programming", "Authors: Y. Daniel Liang"].join("\n"));
  });

  it("never emits a trailing newline", () => {
    expect(formatTextbookValue(FULL).endsWith("\n")).toBe(false);
    expect(formatTextbookValue({ title: "Solo" })).toBe("Title: Solo");
  });

  it("returns an empty string when every field is empty (AC18 refuses to save this)", () => {
    expect(formatTextbookValue({})).toBe("");
    expect(
      formatTextbookValue({ title: " ", authors: "", edition: "", isbn: "", publisher: "", year: "", url: "" })
    ).toBe("");
  });

  it("ignores extra keys, so a recommendation object formats identically to bare fields", () => {
    const withExtras = { ...FULL, whyItFits: "Great fit.", unverified: true };
    expect(formatTextbookValue(withExtras)).toBe(formatTextbookValue(FULL));
    expect(formatTextbookValue(withExtras)).not.toContain("Great fit");
    expect(formatTextbookValue(withExtras)).not.toContain("whyItFits");
  });

  it("exposes the canonical field order, and it matches what the formatter emits", () => {
    expect([...TEXTBOOK_FIELD_ORDER]).toEqual([
      "title",
      "authors",
      "edition",
      "isbn",
      "publisher",
      "year",
      "url",
    ]);
    const lines = formatTextbookValue(FULL).split("\n");
    expect(lines).toHaveLength(TEXTBOOK_FIELD_ORDER.length);
  });
});

describe("parseTextbookFields - AC46 (extraction JSON contract)", () => {
  it("reads the seven fields out of a well-formed JSON object", () => {
    expect(parseTextbookFields(JSON.stringify(FULL))).toEqual(FULL);
  });

  it("tolerates a fenced/chatty response by slicing the JSON object out", () => {
    const parsed = parseTextbookFields(
      "Here is what I read:\n```json\n" + JSON.stringify({ title: "Fenced Book" }) + "\n```\nHope that helps."
    );
    expect(parsed.title).toBe("Fenced Book");
  });

  it("trims strings, stringifies finite numbers, and empties everything else", () => {
    const parsed = parseTextbookFields(
      JSON.stringify({
        title: "  Only Title  ",
        authors: null,
        edition: 12,
        isbn: ["x"],
        publisher: true,
        year: { a: 1 },
        url: "https://x.test",
      })
    );
    expect(parsed).toEqual({
      title: "Only Title",
      authors: "",
      edition: "12",
      isbn: "",
      publisher: "",
      year: "",
      url: "https://x.test",
    });
    for (const key of TEXTBOOK_FIELD_ORDER) {
      expect(typeof parsed[key]).toBe("string");
    }
  });

  it("returns all-empty fields for unparseable text rather than throwing", () => {
    const empty = {
      title: "",
      authors: "",
      edition: "",
      isbn: "",
      publisher: "",
      year: "",
      url: "",
    };
    expect(parseTextbookFields("the model rambled and returned no JSON at all")).toEqual(empty);
    expect(parseTextbookFields("")).toEqual(empty);
    expect(parseTextbookFields("{ not valid json")).toEqual(empty);
  });
});

describe("parseTextbookRecommendations - AC5/AC7 (2-3 titles, never padded)", () => {
  const rec = (title: string) => ({
    title,
    authors: "An Author",
    edition: "1st",
    isbn: "111",
    publisher: "Cengage",
    year: "2024",
    url: "https://www.cengage.com/c/" + title.toLowerCase(),
    whyItFits: "It matches the description.",
  });

  it("parses a list of recommendations with their why-it-fits rationale", () => {
    const parsed = parseTextbookRecommendations(
      JSON.stringify({ textbooks: [rec("Alpha"), rec("Beta")] })
    );
    expect(parsed.map((r) => r.title)).toEqual(["Alpha", "Beta"]);
    expect(parsed[0].whyItFits).toBe("It matches the description.");
    expect(parsed[1].url).toBe("https://www.cengage.com/c/beta");
  });

  it("caps the list at three even when the model returns more", () => {
    const parsed = parseTextbookRecommendations(
      JSON.stringify({ textbooks: [rec("A"), rec("B"), rec("C"), rec("D"), rec("E")] })
    );
    expect(parsed.map((r) => r.title)).toEqual(["A", "B", "C"]);
  });

  it("drops entries with no title rather than emitting a blank card", () => {
    const parsed = parseTextbookRecommendations(
      JSON.stringify({ textbooks: [{ ...rec("Real"), title: "" }, rec("Kept")] })
    );
    expect(parsed.map((r) => r.title)).toEqual(["Kept"]);
  });

  it("returns exactly the one match when only one exists - it never invents a second", () => {
    const parsed = parseTextbookRecommendations(JSON.stringify({ textbooks: [rec("Lonely")] }));
    expect(parsed.map((r) => r.title)).toEqual(["Lonely"]);
  });

  it("AC5: does NOT filter by publisher - the Cengage constraint is prompted, not parsed", () => {
    // Deliberate, decided behavior, not an oversight: a real MindTap title
    // can list its imprint several ways, so silently dropping rows on a
    // publisher string match would hide genuine results. The modal shows the
    // publisher and the corroborated link and lets the instructor judge.
    const parsed = parseTextbookRecommendations(
      JSON.stringify({ textbooks: [{ ...rec("Other"), publisher: "Pearson" }] })
    );
    expect(parsed.map((r) => r.title)).toEqual(["Other"]);
    expect(parsed[0].publisher).toBe("Pearson");
  });

  it("marks every recommendation unverified until corroboration runs", () => {
    const parsed = parseTextbookRecommendations(JSON.stringify({ textbooks: [rec("Fresh")] }));
    expect(parsed[0].unverified).toBe(true);
  });

  it("returns an empty array for no results, malformed JSON, or a missing key", () => {
    expect(parseTextbookRecommendations(JSON.stringify({ textbooks: [] }))).toEqual([]);
    expect(parseTextbookRecommendations("not json")).toEqual([]);
    expect(parseTextbookRecommendations(JSON.stringify({ books: [rec("Wrong key")] }))).toEqual([]);
  });

  it("produces recommendations the shared formatter can render (AC19/AC42)", () => {
    const [only] = parseTextbookRecommendations(JSON.stringify({ textbooks: [rec("Shared")] }));
    expect(formatTextbookValue(only)).toBe(
      [
        "Title: Shared",
        "Authors: An Author",
        "Edition: 1st",
        "ISBN: 111",
        "Publisher: Cengage",
        "Year: 2024",
        "URL: https://www.cengage.com/c/shared",
      ].join("\n")
    );
  });
});

describe("applyUrlCorroboration - AC6 (no fabricated link is ever shown as clickable)", () => {
  const base: TextbookRecommendation = {
    ...FULL,
    url: "https://www.cengage.com/c/real",
    whyItFits: "Fits.",
    unverified: true,
  };

  it("clears unverified when the URL's host is backed by a grounding source", () => {
    const [out] = applyUrlCorroboration(
      [base],
      [{ title: "Cengage", uri: "https://www.cengage.com/c/real" }]
    );
    expect(out.unverified).toBe(false);
    expect(out.url).toBe("https://www.cengage.com/c/real");
  });

  it("keeps the recommendation but drops the URL when no source backs its host", () => {
    const [out] = applyUrlCorroboration(
      [base],
      [{ title: "Somewhere else", uri: "https://unrelated.test/page" }]
    );
    expect(out.unverified).toBe(true);
    expect(out.url).toBe("");
    // AC6: nothing is silently dropped - the title survives for the instructor.
    expect(out.title).toBe(FULL.title);
    expect(out.whyItFits).toBe("Fits.");
  });

  it("treats an absent or placeholder URL as uncorroborated", () => {
    const [noUrl] = applyUrlCorroboration([{ ...base, url: "" }], [
      { title: "Cengage", uri: "https://www.cengage.com/c/real" },
    ]);
    expect(noUrl.unverified).toBe(true);
    expect(noUrl.url).toBe("");

    const [placeholder] = applyUrlCorroboration([{ ...base, url: "https://example.com/book" }], [
      { title: "Cengage", uri: "https://www.cengage.com/c/real" },
    ]);
    expect(placeholder.unverified).toBe(true);
    expect(placeholder.url).toBe("");
  });

  it("marks everything unverified when the call returned no grounding sources at all", () => {
    const out = applyUrlCorroboration([base, { ...base, title: "Second" }], []);
    expect(out.map((r) => r.unverified)).toEqual([true, true]);
    expect(out.map((r) => r.url)).toEqual(["", ""]);
  });

  it("preserves order and length", () => {
    const out = applyUrlCorroboration(
      [
        { ...base, title: "One" },
        { ...base, title: "Two" },
        { ...base, title: "Three" },
      ],
      [{ title: "Cengage", uri: "https://www.cengage.com/x" }]
    );
    expect(out.map((r) => r.title)).toEqual(["One", "Two", "Three"]);
  });
});

describe("TEXTBOOK_FIELD_LABELS - BUG-4 (single shared source, no drift)", () => {
  it("is the exact label map formatTextbookValue's frozen-literal oracle above expects", () => {
    expect(TEXTBOOK_FIELD_LABELS).toEqual({
      title: "Title",
      authors: "Authors",
      edition: "Edition",
      isbn: "ISBN",
      publisher: "Publisher",
      year: "Year",
      url: "URL",
    });
  });

  it("formatTextbookValue's emitted line for each field starts with the frozen literal label, for every field in TEXTBOOK_FIELD_ORDER", () => {
    // Hand-written FROZEN LITERAL, not TEXTBOOK_FIELD_LABELS itself - the
    // previous version of this test built its expectation from
    // TEXTBOOK_FIELD_LABELS[key], the exact same constant formatTextbookValue
    // reads its label from, so it would keep passing even if every label were
    // renamed (this directly contradicted docs/REGRESSION.md's check 18,
    // which requires a frozen literal oracle "not rebuilt from the module's
    // own constants"). Comparing against these hand-typed strings instead is
    // what actually catches a rename in TEXTBOOK_FIELD_LABELS or in
    // formatTextbookValue's own formatting.
    const FROZEN_LABELS: Record<keyof TextbookFields, string> = {
      title: "Title",
      authors: "Authors",
      edition: "Edition",
      isbn: "ISBN",
      publisher: "Publisher",
      year: "Year",
      url: "URL",
    };
    for (const key of TEXTBOOK_FIELD_ORDER) {
      const value = formatTextbookValue({ [key]: "Some Value" } as Partial<TextbookFields>);
      expect(value).toBe(`${FROZEN_LABELS[key]}: Some Value`);
    }
  });
});

describe("emptyFields - BUG-5 (single shared source for the all-blank literal)", () => {
  it("returns every field in TEXTBOOK_FIELD_ORDER as an empty string, and nothing else", () => {
    const fields = emptyFields();
    for (const key of TEXTBOOK_FIELD_ORDER) {
      expect(fields[key]).toBe("");
    }
    expect(Object.keys(fields).sort()).toEqual([...TEXTBOOK_FIELD_ORDER].sort());
  });

  it("formats to an empty string via the shared formatter, matching the AC18/AC44 all-empty case", () => {
    expect(formatTextbookValue(emptyFields())).toBe("");
  });
});
