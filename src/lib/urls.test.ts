import { describe, it, expect } from "vitest";
import { stripModelUrls, sanitizeResourceUrl } from "./urls";

describe("stripModelUrls", () => {
  it("removes a bare URL, leaving nothing where it was", () => {
    const input = "Read the docs at https://docs.python.org/3/tutorial for details";
    expect(stripModelUrls(input)).toBe("Read the docs at for details");
  });

  it("keeps a markdown link's display text and drops the url", () => {
    const input = "Check [the docs](https://example.com/docs) for more.";
    expect(stripModelUrls(input)).toBe("Check the docs for more.");
  });

  it("also strips a www.-prefixed bare domain (no http scheme)", () => {
    const input = "See www.example.com/research/paper for more.";
    expect(stripModelUrls(input)).toBe("See for more.");
  });

  it("leaves text with no links unchanged", () => {
    const input = "Loops let you repeat an action without writing it multiple times.";
    expect(stripModelUrls(input)).toBe(input);
  });

  it("never throws on a non-string input", () => {
    expect(() => stripModelUrls(null as unknown as string)).not.toThrow();
    expect(stripModelUrls(null as unknown as string)).toBe("");
    expect(() => stripModelUrls(undefined as unknown as string)).not.toThrow();
  });
});

describe("sanitizeResourceUrl", () => {
  it("returns a clean http(s) URL unchanged", () => {
    expect(sanitizeResourceUrl("https://www.pmi.org/")).toBe("https://www.pmi.org/");
    expect(sanitizeResourceUrl("http://miro.com")).toBe("http://miro.com");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeResourceUrl("  https://www.pmi.org/  ")).toBe("https://www.pmi.org/");
  });

  it("returns '' for a non-string input", () => {
    expect(sanitizeResourceUrl(null as unknown as string)).toBe("");
    expect(sanitizeResourceUrl(undefined as unknown as string)).toBe("");
  });

  it("returns '' for a scheme-less or non-http(s) URL", () => {
    expect(sanitizeResourceUrl("www.pmi.org")).toBe("");
    expect(sanitizeResourceUrl("pmi.org")).toBe("");
    expect(sanitizeResourceUrl("ftp://files.example.com/x")).toBe("");
    expect(sanitizeResourceUrl("not a url at all")).toBe("");
    expect(sanitizeResourceUrl("")).toBe("");
  });

  it("keeps a real trailing balanced paren (a legitimate URL segment)", () => {
    expect(sanitizeResourceUrl("https://en.wikipedia.org/wiki/Critical_path_method_(disambiguation)")).toBe(
      "https://en.wikipedia.org/wiki/Critical_path_method_(disambiguation)"
    );
  });

  // The 14 malformed hrefs below are representative of the punctuation-
  // baked-into-href defect measured in the MGT 422 audit (37/73 unique URLs
  // dead, 14 of them from trailing sentence punctuation or an unmatched
  // trailing bracket carried into the href). Every one must come out clean,
  // and per P1-AC6, none may still end in "." "," ";" or ")" afterward.
  const malformed: Array<[string, string]> = [
    ["https://www.pmi.org/certifications/project-management-pmp.", "https://www.pmi.org/certifications/project-management-pmp"],
    ["https://asana.com/guide/,", "https://asana.com/guide/"],
    ["https://www.mindtools.com/pages/article/newPPM_04.htm,", "https://www.mindtools.com/pages/article/newPPM_04.htm"],
    ["https://www.smartsheet.com/content/project-management-guide;", "https://www.smartsheet.com/content/project-management-guide"],
    ["https://www.scrum.org/resources/what-is-scrum:", "https://www.scrum.org/resources/what-is-scrum"],
    ["https://www.iso.org/standard/79415.html!", "https://www.iso.org/standard/79415.html"],
    ["https://www.axelos.com/certifications/prince2?", "https://www.axelos.com/certifications/prince2"],
    ["https://www.pmi.org/learning/library/critical-path-method-analysis-6193)", "https://www.pmi.org/learning/library/critical-path-method-analysis-6193"],
    ["https://www.gao.gov/products/gao-19-45)", "https://www.gao.gov/products/gao-19-45"],
    ["https://www.nist.gov/cyberframework]", "https://www.nist.gov/cyberframework"],
    ["https://www.sba.gov/business-guide}", "https://www.sba.gov/business-guide"],
    ["https://www.shrm.org/topics-tools/news.,", "https://www.shrm.org/topics-tools/news"],
    ["https://ocw.mit.edu/courses/.", "https://ocw.mit.edu/courses/"],
    ["https://openstax.org/subjects/business.;", "https://openstax.org/subjects/business"],
  ];

  it.each(malformed)("cleans malformed href %s", (raw, expected) => {
    expect(sanitizeResourceUrl(raw)).toBe(expected);
  });

  it("never leaves a trailing '.' ',' ';' or ')' on any cleaned URL (P1-AC6)", () => {
    for (const [raw] of malformed) {
      const cleaned = sanitizeResourceUrl(raw);
      expect(cleaned).not.toMatch(/[.,;)]$/);
    }
  });

  it("strips several trailing punctuation characters in a row", () => {
    expect(sanitizeResourceUrl("https://example.com/page.,;!?")).toBe("https://example.com/page");
  });

  it("strips a mixed trailing run of punctuation and an unmatched bracket", () => {
    expect(sanitizeResourceUrl("https://example.com/page).")).toBe("https://example.com/page");
    expect(sanitizeResourceUrl("https://example.com/page.)")).toBe("https://example.com/page");
  });

  it("strips an unmatched trailing bracket with nothing else after it", () => {
    expect(sanitizeResourceUrl("https://example.com/page]")).toBe("https://example.com/page");
    expect(sanitizeResourceUrl("https://example.com/page}")).toBe("https://example.com/page");
  });

  it("is case-insensitive about the scheme", () => {
    expect(sanitizeResourceUrl("HTTPS://WWW.PMI.ORG/")).toBe("HTTPS://WWW.PMI.ORG/");
  });
});
