import { describe, it, expect } from "vitest";
import { codeFileToPageHtml } from "./canvas-modules";

describe("codeFileToPageHtml", () => {
  it("escapes < in content", () => {
    const result = codeFileToPageHtml("test.ts", "const x = 1 < 2;");
    expect(result).toContain("&lt;");
    expect(result).not.toContain("<2;");
  });

  it("escapes > in content", () => {
    const result = codeFileToPageHtml("test.ts", "const x = 2 > 1;");
    expect(result).toContain("&gt;");
    expect(result).not.toContain(">1;");
  });

  it("escapes & in content", () => {
    const result = codeFileToPageHtml("test.ts", "const x = a && b;");
    expect(result).toContain("&amp;&amp;");
    expect(result).not.toContain("&& b;");
  });

  it("escapes double quotes in content", () => {
    const result = codeFileToPageHtml("test.ts", 'const str = "hello";');
    expect(result).toContain("&quot;");
    expect(result).not.toContain('str = "');
  });

  it("escapes single quotes in content", () => {
    const result = codeFileToPageHtml("test.ts", "const str = 'hello';");
    expect(result).toContain("&#39;");
    expect(result).not.toContain("str = '");
  });

  it("wraps content in <pre><code> tags", () => {
    const result = codeFileToPageHtml("test.ts", "hello");
    expect(result).toContain("<pre><code>");
    expect(result).toContain("</code></pre>");
  });

  it("wraps file path in <h2> tags", () => {
    const result = codeFileToPageHtml("src/app.ts", "code");
    expect(result).toContain("<h2>");
    expect(result).toContain("</h2>");
  });

  it("escapes file path in heading", () => {
    const result = codeFileToPageHtml("src/file<test>.ts", "code");
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
    expect(result).not.toContain("file<test>");
  });

  it("escapes all special characters together", () => {
    const result = codeFileToPageHtml(
      "src/a.ts",
      'const x = 1 < 2 && "hello" && \'world\';'
    );
    expect(result).toContain("&lt;");
    expect(result).toContain("&amp;");
    expect(result).toContain("&quot;");
    expect(result).toContain("&#39;");
  });

  it("preserves newlines in content", () => {
    const result = codeFileToPageHtml("test.ts", "line1\nline2\nline3");
    expect(result).toContain("line1\nline2\nline3");
  });

  it("returns valid HTML structure", () => {
    const result = codeFileToPageHtml("src/app.ts", "const x = 1;");
    expect(result.startsWith("<h2>")).toBe(true);
    expect(result).toContain("</h2>\n<pre><code>");
    expect(result.endsWith("</code></pre>")).toBe(true);
  });
});
