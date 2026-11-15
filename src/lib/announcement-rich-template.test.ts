import { describe, expect, it } from "vitest";
import { deriveRichTemplate, renderRichTemplate } from "./announcement-rich-template";
import { encodePreviousAnnouncementHtml } from "./announcement-library-rich-text";

describe("rich announcement template extraction", () => {
  it("keeps safe style positions without retaining exemplar content", () => {
    const value = encodePreviousAnnouncementHtml('<p style="color:red;font-size:18px">Private <strong>old text</strong> ending</p>');
    const template = deriveRichTemplate(value);
    expect(template?.blocks[0].style).toContain("font-size:18px");
    expect(template?.blocks[0].entries[0].runs[1].style).toContain("font-weight:bold");
    expect(JSON.stringify(template)).not.toMatch(/Private|old text|ending/);
  });
  it("keeps list item and inline style positions without retaining text", () => {
    const value = encodePreviousAnnouncementHtml('<ul style="color:blue"><li><em>First</em> item</li><li style="font-size:18px">Second</li></ul>');
    const template = deriveRichTemplate(value);
    expect(template?.blocks[0].tag).toBe("ul");
    expect(template?.blocks[0].entries[0].runs[0].style).toContain("font-style:italic");
    expect(template?.blocks[0].entries[1].style).toContain("font-size:18px");
    expect(JSON.stringify(template)).not.toMatch(/First|Second|item/);
  });
  it("preserves div and line break positions, including typed lists", () => {
    const template = deriveRichTemplate(encodePreviousAnnouncementHtml('<div style="color:red">Intro<br>- One<br>- <strong>Two</strong><br>1. First<br>2. Second<br>Done</div>'))!;
    expect(template.blocks.map(block => block.tag)).toEqual(["div", "ul", "ol", "div"]);
    expect(template.blocks[1].entries).toHaveLength(2);
    expect(template.blocks[1].entries[1].runs[0].style).toContain("font-weight:bold");
    expect(template.blocks[2].entries).toHaveLength(2);
    expect(JSON.stringify(template)).not.toMatch(/Intro|One|Two|First|Second|Done/);
  });
  it("retains direct text alongside nested blocks", () => {
    const template = deriveRichTemplate(encodePreviousAnnouncementHtml('<div style="color:red">Text<p>Other</p>Tail</div>'))!;
    expect(template.blocks.map(block => block.tag)).toEqual(["div", "p", "div"]);
    expect(template.blocks.every(block => block.style.includes("color:red"))).toBe(true);
  });
  it("rejects nested lists instead of dropping them", () => {
    for (const html of ['<ul><li>One<ul><li>Nested</li></ul></li></ul>']) {
      expect(deriveRichTemplate(encodePreviousAnnouncementHtml(html))).toBeNull();
    }
  });
  it("renders new slot text with example styling and escapes active content", () => {
    const template = deriveRichTemplate(encodePreviousAnnouncementHtml('<p style="color:red">Old <strong>example</strong></p>'))!;
    const html = renderRichTemplate(template, [{ index: 0, entries: [["New", "<script>bad</script>"]] }]);
    expect(html).toContain('style="color:red"');
    expect(html).toContain('style="font-weight:bold"');
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).not.toContain("Old");
    expect(renderRichTemplate(template, [{ index: 0, entries: [["missing"]] }])).toBeNull();
  });
  it("preserves complete new links and flat div blocks", () => {
    const template = deriveRichTemplate(encodePreviousAnnouncementHtml('<div style="font-size:18px">Example</div>'))!;
    const html = renderRichTemplate(template, [{ index: 0, entries: [["Read [guide](https://example.org/guide)"]] }]);
    expect(html).toContain('<a href="https://example.org/guide">guide</a>');
    expect(html).toContain('font-size:18px');
  });
});
