import { describe, it, expect } from "vitest";
import {
  CodeFenceTracker,
  MARKDOWN_HEADING_RE,
  bulletLevelFromIndent,
  hasMarkdownHeading,
  markdownHeadingKind,
  stripListMarker,
  tokenizeInline,
} from "./docx-blocks";

describe("markdownHeadingKind", () => {
  it("maps # to TITLE, ## to HEADING_1, ### to HEADING_2, #### to HEADING_3", () => {
    expect(markdownHeadingKind(1)).toBe("TITLE");
    expect(markdownHeadingKind(2)).toBe("HEADING_1");
    expect(markdownHeadingKind(3)).toBe("HEADING_2");
    expect(markdownHeadingKind(4)).toBe("HEADING_3");
  });

  it("collapses ##### and ###### into HEADING_3, the deepest style defined", () => {
    expect(markdownHeadingKind(5)).toBe("HEADING_3");
    expect(markdownHeadingKind(6)).toBe("HEADING_3");
  });
});

describe("bulletLevelFromIndent", () => {
  it("treats 0-1 leading spaces as level 0", () => {
    expect(bulletLevelFromIndent("- item")).toBe(0);
    expect(bulletLevelFromIndent(" - item")).toBe(0);
  });

  it("treats 2-3 leading spaces as level 1", () => {
    expect(bulletLevelFromIndent("  - item")).toBe(1);
    expect(bulletLevelFromIndent("   - item")).toBe(1);
  });

  it("treats 4+ leading spaces as level 2, the deepest level defined", () => {
    expect(bulletLevelFromIndent("    - item")).toBe(2);
    expect(bulletLevelFromIndent("      - item")).toBe(2);
  });

  it("counts a leading tab as 4 spaces", () => {
    expect(bulletLevelFromIndent("\t- item")).toBe(2);
  });
});

describe("stripListMarker", () => {
  it("strips a dash, asterisk, or bullet marker", () => {
    expect(stripListMarker("- item")).toBe("item");
    expect(stripListMarker("* item")).toBe("item");
    expect(stripListMarker("• item")).toBe("item");
  });

  it("strips a numbered-list marker, discarding the number", () => {
    expect(stripListMarker("1. item")).toBe("item");
    expect(stripListMarker("42. another item")).toBe("another item");
  });

  it("returns null for a non-list line", () => {
    expect(stripListMarker("Just text.")).toBeNull();
  });
});

describe("CodeFenceTracker", () => {
  it("classifies the opening and closing fence lines as delimiters, and lines between as code", () => {
    const tracker = new CodeFenceTracker();
    expect(tracker.consume("```js")).toBe("delimiter");
    expect(tracker.consume("const x = 1;")).toBe("code");
    expect(tracker.consume("```")).toBe("delimiter");
    expect(tracker.consume("back to normal text")).toBe("normal");
  });

  it("never throws on an unterminated fence, and keeps classifying lines as code", () => {
    const tracker = new CodeFenceTracker();
    expect(tracker.consume("```")).toBe("delimiter");
    expect(tracker.consume("orphaned line one")).toBe("code");
    expect(tracker.consume("orphaned line two")).toBe("code");
    expect(tracker.inFence).toBe(true);
  });

  it("treats lines outside any fence as normal", () => {
    const tracker = new CodeFenceTracker();
    expect(tracker.consume("plain text")).toBe("normal");
  });
});

describe("tokenizeInline", () => {
  it("returns a single text token for plain text with no links", () => {
    expect(tokenizeInline("Just plain text.")).toEqual([{ kind: "text", text: "Just plain text." }]);
  });

  it("emits a mix of text, markdown-link, and bare-URL tokens in source order", () => {
    const tokens = tokenizeInline("Read [docs](https://a.example/docs) or visit https://b.example directly.");
    expect(tokens).toEqual([
      { kind: "text", text: "Read " },
      { kind: "link", text: "docs", url: "https://a.example/docs" },
      { kind: "text", text: " or visit " },
      { kind: "link", text: "https://b.example", url: "https://b.example" },
      { kind: "text", text: " directly." },
    ]);
  });

  it("does not re-linkify a markdown link's own url as a separate bare URL", () => {
    const tokens = tokenizeInline("[site](https://example.com/page)");
    expect(tokens).toEqual([{ kind: "link", text: "site", url: "https://example.com/page" }]);
    // Exactly one link token — the url never appears a second time as a bare match.
    expect(tokens.filter((t) => t.kind === "link")).toHaveLength(1);
  });

  it("does not scan a markdown link's display text for an embedded bare URL", () => {
    const tokens = tokenizeInline("[https://fake.example](https://real.example)");
    expect(tokens).toEqual([{ kind: "link", text: "https://fake.example", url: "https://real.example" }]);
  });

  it("renders a line that is only a markdown link as a single link token", () => {
    expect(tokenizeInline("[python.org](https://python.org)")).toEqual([
      { kind: "link", text: "python.org", url: "https://python.org" },
    ]);
  });

  it("handles two markdown links on the same line", () => {
    const tokens = tokenizeInline("[a](https://a.example) and [b](https://b.example)");
    expect(tokens).toEqual([
      { kind: "link", text: "a", url: "https://a.example" },
      { kind: "text", text: " and " },
      { kind: "link", text: "b", url: "https://b.example" },
    ]);
  });

  it("falls back to the url as display text for an empty markdown-link label", () => {
    expect(tokenizeInline("[](https://example.com)")).toEqual([
      { kind: "link", text: "https://example.com", url: "https://example.com" },
    ]);
  });

  it("treats a markdown-link-shaped line with no scheme as literal text", () => {
    expect(tokenizeInline("[text](not-a-url)")).toEqual([{ kind: "text", text: "[text](not-a-url)" }]);
  });

  it("treats an unclosed bracket with no following parens as literal text", () => {
    expect(tokenizeInline("[text]")).toEqual([{ kind: "text", text: "[text]" }]);
  });

  it("treats an unterminated '[text](' with no url after it as literal text", () => {
    expect(tokenizeInline("Before [text]( and no closing.")).toEqual([
      { kind: "text", text: "Before [text]( and no closing." },
    ]);
  });

  it("still linkifies a real bare URL trailing an unterminated markdown-link attempt", () => {
    // The `[text](` never closes, so it is not a markdown link — but the
    // `https://truncated` fragment after it is still a well-formed bare URL,
    // and the existing bare-URL rule still applies to it independently. No
    // text is lost either way: "See [text](" + the linkified URL reconstructs
    // the source exactly.
    expect(tokenizeInline("See [text](https://truncated")).toEqual([
      { kind: "text", text: "See [text](" },
      { kind: "link", text: "https://truncated", url: "https://truncated" },
    ]);
  });

  it("does not throw on nested or unbalanced brackets, and never loses any text", () => {
    const input = "[a [b] c](https://example.com)";
    const tokens = tokenizeInline(input);
    // Whatever the split, every token's rendered text/url must be a literal
    // substring of the input recovered strictly in order, together covering
    // the input exactly — no characters dropped, nothing invented.
    let cursor = 0;
    for (const token of tokens) {
      const piece = token.kind === "text" ? token.text : token.url;
      const at = input.indexOf(piece, cursor);
      expect(at).toBeGreaterThanOrEqual(0);
      cursor = at + piece.length;
    }
    expect(cursor).toBe(input.length);
    // The nested brackets can never form a valid link (no "(" immediately
    // follows any "]" reachable without crossing another bracket), so no
    // token's display text is "a [b] c" or "b".
    expect(tokens.some((t) => t.kind === "link" && (t.text === "a [b] c" || t.text === "b"))).toBe(false);
  });

  it("still bolds a Label: prefix's remainder correctly around a markdown link (E6, checked at the docx.ts layer)", () => {
    // tokenizeInline itself is label-agnostic; this just confirms it parses
    // the remainder-after-label text (as docx.ts would hand it) correctly.
    const tokens = tokenizeInline(" [python.org](https://example.com/redirect)");
    expect(tokens).toEqual([
      { kind: "text", text: " " },
      { kind: "link", text: "python.org", url: "https://example.com/redirect" },
    ]);
  });
});

describe("hasMarkdownHeading", () => {
  it("is true for a document containing a markdown heading", () => {
    expect(hasMarkdownHeading(["# Title", "", "Body text."])).toBe(true);
    expect(hasMarkdownHeading(["Intro.", "", "## Section", "", "More body text."])).toBe(true);
  });

  it("is false for a document with no markdown heading at all", () => {
    expect(hasMarkdownHeading(["Just a plain paragraph.", "", "Another paragraph.", "", "- a bullet"])).toBe(false);
    expect(hasMarkdownHeading([])).toBe(false);
  });

  it("is false when the only '#' line is inside a fenced code block", () => {
    expect(hasMarkdownHeading(["```", "# not a heading, just a python comment style", "```", "", "Body text."])).toBe(
      false
    );
  });

  it("is true when the heading appears after a fenced code block", () => {
    expect(hasMarkdownHeading(["```", "code line", "```", "", "## Section after the fence"])).toBe(true);
  });
});

describe("MARKDOWN_HEADING_RE", () => {
  it("matches 1-6 leading hashes followed by a space and text", () => {
    const match = "### Section Title".match(MARKDOWN_HEADING_RE);
    expect(match?.[1]).toBe("###");
    expect(match?.[2]).toBe("Section Title");
  });

  it("does not match a hash with no following space (not a heading)", () => {
    expect("#nospace".match(MARKDOWN_HEADING_RE)).toBeNull();
  });
});
