import { describe, it, expect } from "vitest";
import { markdownLiteToHtml } from "./markdown-lite";

describe("markdownLiteToHtml", () => {
  it("converts # heading to h2", () => {
    expect(markdownLiteToHtml("# Introduction")).toBe("<h2>Introduction</h2>");
  });

  it("converts ## heading to h3", () => {
    expect(markdownLiteToHtml("## Getting Started")).toBe("<h3>Getting Started</h3>");
  });

  it("converts three or more # to h4", () => {
    expect(markdownLiteToHtml("### Details")).toBe("<h4>Details</h4>");
    expect(markdownLiteToHtml("#### More")).toBe("<h4>More</h4>");
  });

  it("converts single bullet list items with - to ul with li", () => {
    expect(markdownLiteToHtml("- Item one")).toBe("<ul><li>Item one</li></ul>");
  });

  it("converts single bullet list items with * to ul with li", () => {
    expect(markdownLiteToHtml("* Item one")).toBe("<ul><li>Item one</li></ul>");
  });

  it("groups consecutive bullet lines into one ul", () => {
    const input = "- Item one\n- Item two\n- Item three";
    expect(markdownLiteToHtml(input)).toBe(
      "<ul><li>Item one</li><li>Item two</li><li>Item three</li></ul>"
    );
  });

  it("converts plain text to p", () => {
    expect(markdownLiteToHtml("This is a paragraph.")).toBe(
      "<p>This is a paragraph.</p>"
    );
  });

  it("escapes HTML entities in text", () => {
    expect(markdownLiteToHtml("<script>alert('xss')</script>")).toBe(
      "<p>&lt;script&gt;alert('xss')&lt;/script&gt;</p>"
    );
  });

  it("escapes ampersands and quotes", () => {
    expect(markdownLiteToHtml('Use & when you say "hello"')).toBe(
      '<p>Use &amp; when you say &quot;hello&quot;</p>'
    );
  });

  it("separates blocks with blank lines", () => {
    const input = "First paragraph\n\nSecond paragraph";
    expect(markdownLiteToHtml(input)).toBe(
      "<p>First paragraph</p><p>Second paragraph</p>"
    );
  });

  it("flushes list before non-list block", () => {
    const input = "- Item\n\nParagraph after";
    expect(markdownLiteToHtml(input)).toBe(
      "<ul><li>Item</li></ul><p>Paragraph after</p>"
    );
  });

  it("returns empty string for empty input", () => {
    expect(markdownLiteToHtml("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(markdownLiteToHtml("   \n\n  ")).toBe("");
  });

  it("handles mixed heading, list, and paragraph", () => {
    const input = "# Title\nParagraph text\n- List item\n- Another item";
    expect(markdownLiteToHtml(input)).toBe(
      "<h2>Title</h2><p>Paragraph text</p><ul><li>List item</li><li>Another item</li></ul>"
    );
  });

  it("escapes HTML in heading text", () => {
    expect(markdownLiteToHtml("# Section & Details <new>")).toBe(
      "<h2>Section &amp; Details &lt;new&gt;</h2>"
    );
  });

  it("escapes HTML in list items", () => {
    expect(markdownLiteToHtml("- Use < and > symbols")).toBe(
      "<ul><li>Use &lt; and &gt; symbols</li></ul>"
    );
  });

  describe("inline links", () => {
    it("turns a bare URL in a paragraph into a real <a href>", () => {
      expect(markdownLiteToHtml("Visit https://example.com for details.")).toBe(
        '<p>Visit <a href="https://example.com">https://example.com</a> for details.</p>'
      );
    });

    it("turns a markdown [text](url) link in a paragraph into a real <a href>", () => {
      expect(markdownLiteToHtml("Check out [Google](https://google.com) for search.")).toBe(
        '<p>Check out <a href="https://google.com">Google</a> for search.</p>'
      );
    });

    it("turns a markdown link inside a bullet into a real <a href>", () => {
      expect(markdownLiteToHtml("- See [the docs](https://docs.example.com/guide)")).toBe(
        '<ul><li>See <a href="https://docs.example.com/guide">the docs</a></li></ul>'
      );
    });

    it("turns a bare URL inside a bullet into a real <a href>", () => {
      expect(markdownLiteToHtml("- https://example.com/guide")).toBe(
        '<ul><li><a href="https://example.com/guide">https://example.com/guide</a></li></ul>'
      );
    });

    it("turns a markdown link inside a heading into a real <a href>", () => {
      expect(markdownLiteToHtml("# See [the site](https://example.com)")).toBe(
        '<h2>See <a href="https://example.com">the site</a></h2>'
      );
    });

    it("renders more than one link on the same line", () => {
      expect(
        markdownLiteToHtml("Sources: [A](https://a.example) and [B](https://b.example).")
      ).toBe(
        '<p>Sources: <a href="https://a.example">A</a> and <a href="https://b.example">B</a>.</p>'
      );
    });

    it("still escapes plain text surrounding a link", () => {
      expect(markdownLiteToHtml('Read <this> & [the guide](https://example.com) too')).toBe(
        '<p>Read &lt;this&gt; &amp; <a href="https://example.com">the guide</a> too</p>'
      );
    });

    it("leaves malformed link syntax as escaped plain text (no url)", () => {
      expect(markdownLiteToHtml("[text](not-a-url)")).toBe("<p>[text](not-a-url)</p>");
    });

    it("does not treat a line with no scheme as a link", () => {
      expect(markdownLiteToHtml("Contact us at support@example.com.")).toBe(
        "<p>Contact us at support@example.com.</p>"
      );
    });
  });
});
