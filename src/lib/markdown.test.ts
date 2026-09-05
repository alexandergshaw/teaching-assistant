// Regression coverage for a link/attribute-injection hole in markdownToHtml.
// Its output is injected into the DOM verbatim via dangerouslySetInnerHTML
// (src/app/components/knowledge/PageBody.tsx), so anything renderInlineMd
// writes into an HTML attribute is a stored-XSS vector for whoever can edit
// a page's Markdown body. Two independent bugs combined to make this
// exploitable:
//
//   1. escapeHtml did not escape the double quote, so a link target like
//      `[click](" autofocus onfocus="alert(1)  x)` could break out of the
//      `href="..."` attribute renderInlineMd interpolates it into and
//      inject arbitrary attributes (onfocus fires with no click needed).
//   2. The link rule had no scheme check at all, so a target like
//      `[click](javascript:alert(1))` became a real `javascript:` href that
//      executes on click.
//
// Raw `<script>` and `<img onerror>` were already neutralized (escapeHtml
// strips `<`/`>` from ordinary text), so this file focuses on the link path,
// which was the actual hole.

import { describe, it, expect } from "vitest";
import { markdownToHtml, htmlToMarkdown } from "./markdown";
import { splitBodyIntoSegments } from "@/app/components/knowledge/attachment-embed";

describe("markdownToHtml - link href security", () => {
  it("does not turn a javascript: target into a clickable link", () => {
    const html = markdownToHtml("[click](javascript:alert%281%29)");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
    // Content is preserved as plain text, never silently dropped.
    expect(html).toContain("click");
    expect(html).toBe("<p>click</p>");
  });

  it("does not let a quote-breakout href inject an onfocus/onerror attribute", () => {
    const html = markdownToHtml('[click](" autofocus onfocus="alert(1)  x)');
    expect(html).not.toContain("onfocus=");
    expect(html).not.toContain("autofocus");
    expect(html).not.toContain("<a ");
    expect(html).toBe("<p>click  x)</p>");
  });

  it("rejects a data: URI target the same way", () => {
    const html = markdownToHtml("[click](data:text/html,<script>alert(1)</script>)");
    expect(html).not.toContain("data:");
    expect(html).not.toContain("<a ");
  });

  it("rejects a vbscript: URI target", () => {
    const html = markdownToHtml("[click](VBScript:msgbox(1))");
    expect(html).not.toContain("<a ");
  });

  it("still renders a normal https link as an anchor", () => {
    const html = markdownToHtml("[Visit us](https://example.com/path?a=1&b=2)");
    expect(html).toBe('<p><a href="https://example.com/path?a=1&amp;b=2">Visit us</a></p>');
  });

  it("still renders a mailto link as an anchor", () => {
    const html = markdownToHtml("[Email](mailto:someone@example.com)");
    expect(html).toBe('<p><a href="mailto:someone@example.com">Email</a></p>');
  });

  it("still renders a #anchor link as an anchor", () => {
    const html = markdownToHtml("[Section](#top)");
    expect(html).toBe('<p><a href="#top">Section</a></p>');
  });

  it("still renders a site-relative path as an anchor", () => {
    const html = markdownToHtml("[Docs](/docs/page)");
    expect(html).toBe('<p><a href="/docs/page">Docs</a></p>');
  });

  it("allows an allowed scheme regardless of case (HTTPS:// still links)", () => {
    const html = markdownToHtml("[click](HTTPS://example.com)");
    expect(html).toBe('<p><a href="HTTPS://example.com">click</a></p>');
  });

  it("rejects a protocol-relative //host target even though it starts with a single slash", () => {
    // A bare `/` prefix is meant to allow site-relative paths, but `//host/x`
    // is not "on this site" - a browser resolves the missing scheme against
    // whatever the current page happens to be loaded over and leaves the
    // site entirely. This is a narrower allowance than the bug report's
    // literal "^/" spec, added because it is the same class of bug (an
    // attacker-controlled navigation target) the allowlist exists to stop.
    const html = markdownToHtml("[Bad](//evil.example/x)");
    expect(html).not.toContain("<a ");
    expect(html).toBe("<p>Bad</p>");
  });
});

describe("markdownToHtml - quote escaping", () => {
  it("escapes a double quote in ordinary text", () => {
    const html = markdownToHtml('She said "hello" to the class.');
    expect(html).toBe("<p>She said &quot;hello&quot; to the class.</p>");
    expect(html).not.toContain('"hello"');
  });

  it("escapes a double quote inside a heading", () => {
    const html = markdownToHtml('## The "big" reveal');
    expect(html).toBe("<h2>The &quot;big&quot; reveal</h2>");
  });
});

describe("markdownToHtml - attachment:// interaction (do not silently break embeds)", () => {
  // PageBody.tsx (src/app/components/knowledge/PageBody.tsx) runs
  // splitBodyIntoSegments BEFORE markdownToHtml: a line containing ONLY
  // `[label](attachment://id)` is extracted as an "embed" segment and never
  // reaches markdownToHtml at all, so the link rule's allowlist never sees
  // it in that case.
  it("extracts a standalone attachment:// reference as an embed segment, never as markdown", () => {
    const body = "[My Handout](attachment://3fa85f64-5717-4562-b3fc-2c963f66afa6)";
    const segments = splitBodyIntoSegments(body);
    expect(segments).toEqual([
      { type: "embed", label: "My Handout", attachmentId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" },
    ]);
    // No "markdown" segment exists here for markdownToHtml to even run on.
    expect(segments.some((s) => s.type === "markdown")).toBe(false);
  });

  // BUT attachment-embed.ts's own module comment documents that a reference
  // typed inline within a sentence (not alone on its own line) is NOT
  // extracted - it intentionally falls through and round-trips as an
  // ordinary Markdown link. That markdown segment DOES reach
  // markdownToHtml's link rule, so `attachment:` must stay in the allowlist
  // or this documented graceful-degrade path would silently regress to
  // plain text instead of a link.
  it("lets an inline (mid-sentence) attachment:// reference reach markdownToHtml as an ordinary link", () => {
    const body = "See the [Handout](attachment://3fa85f64-5717-4562-b3fc-2c963f66afa6) for details.";
    const segments = splitBodyIntoSegments(body);
    expect(segments).toEqual([{ type: "markdown", text: body }]);

    const html = markdownToHtml(segments[0].type === "markdown" ? segments[0].text : "");
    expect(html).toBe(
      '<p>See the <a href="attachment://3fa85f64-5717-4562-b3fc-2c963f66afa6">Handout</a> for details.</p>'
    );
  });
});

describe("markdownToHtml - unchanged rendering behavior (pinned against the pre-fix implementation)", () => {
  // These fixtures contain no quotes and no links, so they exercise none of
  // the two lines this fix touches (escapeHtml's new &quot; branch, and the
  // link rule's new allowlist check). Expected values below were captured by
  // running the UNMODIFIED pre-fix markdownToHtml (git show HEAD, before
  // this change, on the trimmed Markdown -> HTML section only - the only
  // part these fixtures exercise) against the same inputs, then confirmed
  // byte-identical to this fix's output - so this pins real prior behavior,
  // not a restatement of the new implementation.

  it("renders headings h1-h6", () => {
    expect(markdownToHtml("# Hello World")).toBe("<h1>Hello World</h1>");
    expect(markdownToHtml("## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6")).toBe(
      "<h2>H2</h2>\n<h3>H3</h3>\n<h4>H4</h4>\n<h5>H5</h5>\n<h6>H6</h6>"
    );
  });

  it("renders a dash bullet list", () => {
    expect(markdownToHtml("- one\n- two\n- three")).toBe("<ul><li>one</li><li>two</li><li>three</li></ul>");
  });

  it("renders a star bullet list", () => {
    expect(markdownToHtml("* alpha\n* beta")).toBe("<ul><li>alpha</li><li>beta</li></ul>");
  });

  it("renders an ordered list", () => {
    expect(markdownToHtml("1. first\n2. second\n3. third")).toBe(
      "<ol><li>first</li><li>second</li><li>third</li></ol>"
    );
  });

  it("renders bold text", () => {
    expect(markdownToHtml("This is **bold** text.")).toBe("<p>This is <strong>bold</strong> text.</p>");
  });

  it("renders italic text", () => {
    expect(markdownToHtml("This is *italic* text.")).toBe("<p>This is <em>italic</em> text.</p>");
  });

  it("renders inline code", () => {
    expect(markdownToHtml("Run `npm test` now.")).toBe("<p>Run <code>npm test</code> now.</p>");
  });

  it("renders a fenced code block", () => {
    expect(markdownToHtml("```\nconst x = 1;\nconsole.log(x);\n```")).toBe(
      "<pre><code>const x = 1;\nconsole.log(x);</code></pre>"
    );
  });

  it("joins consecutive lines in a paragraph with <br>", () => {
    expect(markdownToHtml("line one\nline two")).toBe("<p>line one<br>line two</p>");
  });

  it("renders a plain paragraph", () => {
    expect(markdownToHtml("Just a plain paragraph of text.")).toBe("<p>Just a plain paragraph of text.</p>");
  });

  it("renders mixed inline formatting within a heading", () => {
    expect(markdownToHtml("## Use `code` and **bold** and *italic*")).toBe(
      "<h2>Use <code>code</code> and <strong>bold</strong> and <em>italic</em></h2>"
    );
  });
});

describe("htmlToMarkdown - unaffected by the escapeHtml quote fix", () => {
  // escapeHtml is never called from this direction (renderInline/renderBlock/
  // listToMarkdown build Markdown strings directly from the parsed DOM), so
  // widening it to escape quotes cannot change anything here. A quote in the
  // source HTML's text should simply pass through unescaped, same as before.
  it("passes a double quote in HTML text through unescaped", () => {
    expect(htmlToMarkdown("<p>She said \"hello\" to the class.</p>")).toBe('She said "hello" to the class.');
  });

  it("round-trips a heading and a list", () => {
    expect(htmlToMarkdown("<h2>Title</h2><ul><li>one</li><li>two</li></ul>")).toBe("## Title\n\n- one\n- two");
  });

  it("round-trips a link", () => {
    expect(htmlToMarkdown('<p><a href="https://example.com">Visit</a></p>')).toBe("[Visit](https://example.com)");
  });
});
