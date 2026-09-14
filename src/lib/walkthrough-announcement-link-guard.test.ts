import { describe, it, expect } from "vitest";

import { collectPermittedUrls, stripUnpermittedUrls } from "./walkthrough-announcement-link-guard";
import { EMPTY_ANNOUNCEMENT_OUTLINE, type AnnouncementOutline, type OutlineSection } from "./announcement-outline-types";

function section(overrides: Partial<OutlineSection> = {}): OutlineSection {
  return {
    index: 1,
    heading: null,
    break: "heading",
    listKind: null,
    sentenceRange: [1, 2],
    ...overrides,
  };
}

function outlineWithHeading(heading: string): AnnouncementOutline {
  return { ...EMPTY_ANNOUNCEMENT_OUTLINE, sections: [section({ heading })] };
}

function baseCollectArgs(overrides: Partial<Parameters<typeof collectPermittedUrls>[0]> = {}) {
  return {
    courseLabel: "PSYC 101",
    moduleLabel: "Week 4",
    materialsText: "",
    outline: EMPTY_ANNOUNCEMENT_OUTLINE,
    coverageBlock: "",
    notes: "",
    styleBlock: "",
    researchedResources: [] as { url: string }[],
    ...overrides,
  };
}

describe("stripUnpermittedUrls - Ruling 20: never rewrites text it did not decide to strip", () => {
  it("returns a draft with headings, a bulleted list, an ordered list and blank lines BYTE-IDENTICALLY when nothing is stripped", () => {
    const draft = [
      "# Heading",
      "",
      "Some prose that mentions no URL at all.",
      "",
      "- bullet one",
      "- bullet two",
      "",
      "1. step one",
      "2. step two",
      "",
      "Closing paragraph.",
    ].join("\n");

    const result = stripUnpermittedUrls(draft, new Set());

    expect(result.text).toBe(draft);
    expect(result.stripped).toEqual([]);
  });

  // Sabotage used to prove this test can fail: temporarily replace the
  // implementation's two `.replace(...)` calls with a single
  // `draftText.replace(/[\t\n\r]/g, "")` (the withdrawn round-3 whole-
  // document strip Ruling 20 forbids) - confirmed this collapses the fixture
  // above to "# Heading- one prose...- bullet one- bullet two...", which
  // fails `toBe(draft)` immediately. Restored afterward.

  it("a permitted markdown link survives byte-for-byte, including any incidental whitespace inside it", () => {
    const draft = "See [Docs](https://good.example/x) for more.";
    const permitted = collectPermittedUrls(baseCollectArgs({ researchedResources: [{ url: "https://good.example/x" }] }));

    const result = stripUnpermittedUrls(draft, permitted);

    expect(result.text).toBe(draft);
    expect(result.stripped).toEqual([]);
  });

  it("an unpermitted markdown link becomes its own visible text, and the surrounding sentence is untouched (Res-r3-7)", () => {
    const draft = "Check out this [Great tutorial](https://evil.example) before you start.";

    const result = stripUnpermittedUrls(draft, new Set());

    expect(result.text).toBe("Check out this Great tutorial before you start.");
    expect(result.stripped).toEqual(["https://evil.example"]);
  });

  it("an unpermitted bare URL in plain prose (never inside [text](url)) is removed", () => {
    const draft = "Read more at https://evil.example for details.";

    const result = stripUnpermittedUrls(draft, new Set());

    expect(result.text).not.toContain("evil.example");
    expect(result.stripped).toEqual(["https://evil.example"]);
  });

  it("Ruling 18b: a URL that READS as a permitted host via userinfo smuggling is NOT treated as permitted", () => {
    const permitted = collectPermittedUrls(baseCollectArgs({ researchedResources: [{ url: "https://permitted.example/x" }] }));
    // https://permitted.example/x IS a member, confirmed directly:
    expect(permitted.has("https://permitted.example/x")).toBe(true);

    const draft = "See [Read this](https://permitted.example@evil.example/x) now.";
    const result = stripUnpermittedUrls(draft, permitted);

    // The link is stripped down to its text - it was NOT treated as
    // permitted just because its visible prefix reads as the permitted host.
    expect(result.text).toBe("See Read this now.");
    expect(result.stripped).toEqual(["https://permitted.example@evil.example/x"]);
  });

  it("Ruling 26: three malformed URL forms that make new URL() throw are all stripped, never crash the enforcer", () => {
    const forms = ["https://[", "https://%", "https://ok.example:99999/a"];
    for (const form of forms) {
      const draft = `See ${form} for more.`;
      expect(() => stripUnpermittedUrls(draft, new Set())).not.toThrow();
      const result = stripUnpermittedUrls(draft, new Set());
      expect(result.stripped).toEqual([form]);
      expect(result.text).not.toContain(form);
    }
  });

  it("Ruling 26: a well-formed permitted URL survives, and a case-variant scheme/host still compares equal", () => {
    const permitted = collectPermittedUrls(baseCollectArgs({ researchedResources: [{ url: "https://ok.example/a" }] }));

    const lower = stripUnpermittedUrls("See https://ok.example/a here.", permitted);
    expect(lower.text).toBe("See https://ok.example/a here.");
    expect(lower.stripped).toEqual([]);

    // Only the scheme and host vary in case here - the path stays "/a" in
    // both, since URL paths are case-sensitive and this fixture is testing
    // scheme/host case-insensitivity specifically (Ruling 26's own note:
    // "new URL() lowercases the host... do not add one" - it does NOT
    // lowercase the path, so a path-case difference is a real mismatch, not
    // the case-variant smuggling this fixture targets).
    const upper = stripUnpermittedUrls("See HTTPS://OK.EXAMPLE/a here.", permitted);
    expect(upper.text).toBe("See HTTPS://OK.EXAMPLE/a here.");
    expect(upper.stripped).toEqual([]);
  });

  it("Ruling 29: a relative-path link target is skipped entirely - left byte-identical and never reported as stripped", () => {
    const draft = "See [the syllabus](/courses/101/syllabus) for details.";
    const result = stripUnpermittedUrls(draft, new Set());
    expect(result.text).toBe(draft);
    expect(result.stripped).toEqual([]);
  });

  it("Ruling 29: a mailto: link target is skipped entirely", () => {
    const draft = "Email [the instructor](mailto:prof@example.edu) with questions.";
    const result = stripUnpermittedUrls(draft, new Set());
    expect(result.text).toBe(draft);
    expect(result.stripped).toEqual([]);
  });

  it("Ruling 29: an attachment: link target (Canvas's own file-link scheme) is skipped entirely", () => {
    const draft = "Download [the handout](attachment:12345) before class.";
    const result = stripUnpermittedUrls(draft, new Set());
    expect(result.text).toBe(draft);
    expect(result.stripped).toEqual([]);
  });

  it("Ruling 29: an in-page anchor link target is skipped entirely", () => {
    const draft = "Jump to [the summary](#summary) at the top.";
    const result = stripUnpermittedUrls(draft, new Set());
    expect(result.text).toBe(draft);
    expect(result.stripped).toEqual([]);
  });

  it("Ruling 29: the link-text group cannot span a line break, matching the renderer's own per-line semantics", () => {
    // The renderer (markdown.ts) splits into lines BEFORE testing its own
    // link regex, so it can never form a link whose bracketed text spans
    // two lines - "[broken" on one line and "link](https://evil.example)"
    // on the next are each tested independently and neither matches on its
    // own. This enforcer must agree: it must NOT treat the two lines
    // together as one link construct and strip the brackets away, because
    // the renderer would never have linkified them as a unit in the first
    // place.
    const draft = "See [broken\nlink](https://evil.example) here.";
    const result = stripUnpermittedUrls(draft, new Set());

    // The bracket/paren text survives untouched (pass 1 never matched it as
    // one construct); only the bare URL substring pass 2 finds is removed,
    // leaving the enclosing "(" and ")" exactly where they were.
    expect(result.text).toBe("See [broken\nlink]() here.");
    expect(result.stripped).toEqual(["https://evil.example"]);
  });

  // Sabotage used to prove the previous test can fail: widen
  // MARKDOWN_LINK_RE's text group back to `[^\]]*` (spanning newlines).
  // Confirmed this makes the match span both lines, and the unpermitted
  // branch then replaces the WHOLE two-line construct with just its text
  // ("broken\nlink"), dropping the literal "[" and "](" the renderer would
  // have shown - failing the `toBe` assertion above. Restored afterward.
});

describe("collectPermittedUrls - walks every legitimate carrier field", () => {
  it("collects a URL found in courseLabel", () => {
    const permitted = collectPermittedUrls(baseCollectArgs({ courseLabel: "See https://course.example for the syllabus" }));
    expect(permitted.has("https://course.example")).toBe(true);
  });

  it("collects a URL found in moduleLabel", () => {
    const permitted = collectPermittedUrls(baseCollectArgs({ moduleLabel: "https://module.example" }));
    expect(permitted.has("https://module.example")).toBe(true);
  });

  it("collects a URL found in materialsText", () => {
    const permitted = collectPermittedUrls(baseCollectArgs({ materialsText: "Read https://materials.example first." }));
    expect(permitted.has("https://materials.example")).toBe(true);
  });

  it("collects a URL found in an outline section's own heading text", () => {
    const permitted = collectPermittedUrls(baseCollectArgs({ outline: outlineWithHeading("See https://heading.example") }));
    expect(permitted.has("https://heading.example")).toBe(true);
  });

  it("collects a URL found in coverageBlock, notes, and styleBlock", () => {
    const permitted = collectPermittedUrls(
      baseCollectArgs({
        coverageBlock: "https://coverage.example",
        notes: "https://notes.example",
        styleBlock: "https://style.example",
      })
    );
    expect(permitted.has("https://coverage.example")).toBe(true);
    expect(permitted.has("https://notes.example")).toBe(true);
    expect(permitted.has("https://style.example")).toBe(true);
  });

  it("collects a researched resource's own url", () => {
    const permitted = collectPermittedUrls(baseCollectArgs({ researchedResources: [{ url: "https://research.example/page" }] }));
    expect(permitted.has("https://research.example/page")).toBe(true);
  });

  it("does not permit a URL that appears nowhere in any carrier", () => {
    const permitted = collectPermittedUrls(baseCollectArgs());
    expect(permitted.has("https://never-mentioned.example")).toBe(false);
  });
});
