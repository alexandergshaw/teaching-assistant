import { describe, it, expect } from "vitest";
import { validateAnimationHtml, wrapAnimationDocument } from "./animation-html";

describe("validateAnimationHtml", () => {
  // Valid case
  it("passes a valid animation HTML", () => {
    const html = `
      <svg viewBox="0 0 200 200">
        <rect x="10" y="10" width="50" height="50" fill="blue"/>
      </svg>
      <style>
        @keyframes slide {
          from { transform: translateX(0); }
          to { transform: translateX(100px); }
        }
        rect {
          animation: slide 2s infinite;
        }
      </style>
      ${"x".repeat(800)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  // REQUIRE tests
  it("reports missing <svg element", () => {
    const html = `
      <style>@keyframes loop { from { } to { } }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Missing <svg element");
    expect(result.ok).toBe(false);
  });

  it("reports missing @keyframes and <animate", () => {
    const html = `
      <svg viewBox="0 0 200 200">
        <rect x="10" y="10" width="50" height="50" fill="blue"/>
      </svg>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Missing @keyframes or <animate element");
    expect(result.ok).toBe(false);
  });

  it("accepts @keyframes (case-insensitive)", () => {
    const html = `
      <svg><rect/></svg>
      <style>@KEYFRAMES loop { from { } to { } }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).not.toContain("Missing @keyframes or <animate element");
  });

  it("accepts <animate element", () => {
    const html = `
      <svg><animate dur="2s"/></svg>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).not.toContain("Missing @keyframes or <animate element");
  });

  it("reports HTML too short", () => {
    const html = `<svg><rect/></svg><style>@keyframes f { }</style>${"x".repeat(100)}`;
    const result = validateAnimationHtml(html);
    expect(result.problems.some((p) => p.includes("too short"))).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("reports HTML too long", () => {
    const html = `<svg><rect/></svg><style>@keyframes f { }</style>${"x".repeat(200010)}`;
    const result = validateAnimationHtml(html);
    expect(result.problems.some((p) => p.includes("too long"))).toBe(true);
    expect(result.ok).toBe(false);
  });

  // FORBID tests
  it("forbids <script tag (lowercase)", () => {
    const html = `
      <svg><rect/></svg>
      <script>console.log('x')</script>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden <script tag");
  });

  it("forbids <script tag (uppercase)", () => {
    const html = `
      <svg><rect/></svg>
      <SCRIPT>alert('x')</SCRIPT>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden <script tag");
  });

  it("forbids <script tag with spacing", () => {
    const html = `
      <svg><rect/></svg>
      <  script  >bad</script>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden <script tag");
  });

  it("forbids <iframe", () => {
    const html = `
      <svg><rect/></svg>
      <iframe src="http://example.com"></iframe>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden <iframe tag");
  });

  it("forbids <object", () => {
    const html = `
      <svg><rect/></svg>
      <object data="http://example.com"></object>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden <object tag");
  });

  it("forbids <embed", () => {
    const html = `
      <svg><rect/></svg>
      <embed src="http://example.com"/>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden <embed tag");
  });

  it("forbids <link", () => {
    const html = `
      <svg><rect/></svg>
      <link rel="stylesheet" href="http://example.com/style.css"/>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden <link tag");
  });

  it("forbids @import", () => {
    const html = `
      <svg><rect/></svg>
      <style>
        @import url("http://example.com/style.css");
        @keyframes f { }
      </style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden @import");
  });

  it("forbids url() with http", () => {
    const html = `
      <svg><rect/></svg>
      <style>
        @keyframes f { }
        div { background: url(http://example.com/img.jpg); }
      </style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden url() with http");
  });

  it("forbids url() with https", () => {
    const html = `
      <svg><rect/></svg>
      <style>
        @keyframes f { }
        div { background: url(https://example.com/img.jpg); }
      </style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden url() with http");
  });

  it("forbids url() with leading whitespace before scheme", () => {
    const html = `
      <svg><rect/></svg>
      <style>
        @keyframes f { }
        div { background: url(\t https://example.com/img.jpg); }
      </style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden url() with http");
  });

  it("forbids url() with quoted whitespace-prefixed scheme", () => {
    const html = `
      <svg><rect/></svg>
      <style>
        @keyframes f { }
        div { background: url("\n  http://example.com/img.jpg"); }
      </style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden url() with http");
  });

  it("forbids src= with http://", () => {
    const html = `
      <svg><rect/></svg>
      <img src="http://example.com/img.jpg"/>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden src or href with external URL");
  });

  it("forbids href= with https://", () => {
    const html = `
      <svg><rect/></svg>
      <a href="https://example.com">link</a>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden src or href with external URL");
  });

  it("forbids src= with //", () => {
    const html = `
      <svg><rect/></svg>
      <script src="//example.com/script.js"></script>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden <script tag");
    expect(result.problems).toContain("Forbidden src or href with external URL");
  });

  it("forbids src= with leading whitespace before http", () => {
    const html = `
      <svg><rect/></svg>
      <img src="\t http://example.com/img.jpg"/>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden src or href with external URL");
  });

  it("forbids href= with leading newline before https", () => {
    const html = `
      <svg><rect/></svg>
      <a href="\n  https://example.com">link</a>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden src or href with external URL");
  });

  it("forbids href= with leading space before //", () => {
    const html = `
      <svg><rect/></svg>
      <a href=" //example.com/page">link</a>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).toContain("Forbidden src or href with external URL");
  });

  // Allow data: URLs
  it("allows data: URLs", () => {
    const html = `
      <svg><rect/></svg>
      <img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="/>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).not.toContain("Forbidden src or href with external URL");
    expect(result.ok).toBe(true);
  });

  // Allow fragment URLs
  it("allows fragment URLs", () => {
    const html = `
      <svg id="mySvg"><rect/></svg>
      <a href="#section">link</a>
      <style>@keyframes f { }</style>
      ${"x".repeat(1000)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.problems).not.toContain("Forbidden src or href with external URL");
    expect(result.ok).toBe(true);
  });

  // Multiple problems reported
  it("reports multiple problems at once", () => {
    const html = `
      <script>bad</script>
      <link rel="stylesheet" href="http://example.com/style.css"/>
      <style>
        @import url("http://example.com/style.css");
        @keyframes f { }
      </style>
      <svg><rect/></svg>
      ${"x".repeat(100)}
    `;
    const result = validateAnimationHtml(html);
    expect(result.ok).toBe(false);
    expect(result.problems.length).toBeGreaterThanOrEqual(4);
    expect(result.problems).toContain("Forbidden <script tag");
    expect(result.problems).toContain("Forbidden <link tag");
    expect(result.problems).toContain("Forbidden @import");
    expect(result.problems).toContain("Forbidden url() with http");
  });

  it("reports all missing requirements with multiple violations", () => {
    const html = `<div>too short</div>`;
    const result = validateAnimationHtml(html);
    expect(result.ok).toBe(false);
    expect(result.problems).toContain("Missing <svg element");
    expect(result.problems).toContain("Missing @keyframes or <animate element");
    expect(result.problems.some((p) => p.includes("too short"))).toBe(true);
  });
});

describe("wrapAnimationDocument", () => {
  it("wraps animation body in full HTML document", () => {
    const title = "My Animation";
    const bodyHtml = '<svg><rect width="100" height="100"/></svg>';
    const result = wrapAnimationDocument(title, bodyHtml);

    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain('<html lang="en">');
    expect(result).toContain('<meta charset="UTF-8">');
    expect(result).toContain("<title>My Animation</title>");
    expect(result).toContain(bodyHtml);
    expect(result).toContain("</html>");
  });

  it("includes base styles with system font stack", () => {
    const result = wrapAnimationDocument("Test", "<svg/>");
    expect(result).toContain("-apple-system");
    expect(result).toContain("BlinkMacSystemFont");
    expect(result).toContain("Segoe UI");
  });

  it("includes muted background color", () => {
    const result = wrapAnimationDocument("Test", "<svg/>");
    expect(result).toContain("#f5f5f5");
    expect(result).toContain("#fff");
  });

  it("escapes HTML entities in title", () => {
    const title = 'Test & "Concepts" <Demo>';
    const result = wrapAnimationDocument(title, "<svg/>");
    expect(result).toContain("&amp;");
    expect(result).toContain("&quot;");
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
  });

  it("preserves body HTML without escaping", () => {
    const body = '<svg><text x="10" y="20">Hello &amp; Goodbye</text></svg>';
    const result = wrapAnimationDocument("Test", body);
    expect(result).toContain(body);
  });

  it("wraps body in animation-container div", () => {
    const body = "<svg/>";
    const result = wrapAnimationDocument("Test", body);
    expect(result).toContain('class="animation-container"');
    expect(result).toContain(body);
  });

  it("round-trip contains title and body", () => {
    const title = "Week 1: Algorithms";
    const body =
      '<svg viewBox="0 0 200 200"><circle cx="50" cy="50" r="40" fill="blue"/></svg>';
    const wrapped = wrapAnimationDocument(title, body);

    expect(wrapped).toContain(title);
    expect(wrapped).toContain(body);
    expect(wrapped).toMatch(/<title>[^<]*Week 1: Algorithms[^<]*<\/title>/);
  });

  it("includes viewport meta tag", () => {
    const result = wrapAnimationDocument("Test", "<svg/>");
    expect(result).toContain('name="viewport"');
    expect(result).toContain("width=device-width");
  });

  it("includes max-width container in styles", () => {
    const result = wrapAnimationDocument("Test", "<svg/>");
    expect(result).toContain("max-width");
    expect(result).toContain("900px");
  });
});
