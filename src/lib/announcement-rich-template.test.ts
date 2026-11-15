import { describe, expect, it } from "vitest";
import { deriveRichTemplate, renderRichTemplate, richTemplatePlaceholders, richTemplateSlotsFromMap } from "./announcement-rich-template";
import { encodePreviousAnnouncementHtml } from "./announcement-library-rich-text";

describe("rich announcement template extraction", () => {
  it("stores emoji positions without example glyphs and inserts chosen emoji", () => {
    const original = String.fromCodePoint(0x1f4cc), chosen = String.fromCodePoint(0x1f4a1);
    const template = deriveRichTemplate(encodePreviousAnnouncementHtml(`<p><strong>${original}</strong> Current text</p>`))!;
    expect(JSON.stringify(template)).not.toContain(original);
    const slots = richTemplateSlotsFromMap(template, { b0_e0_r0: chosen, b0_e0_r1: "Fresh content" });
    expect(slots).not.toBeNull();
    expect(renderRichTemplate(template, slots!)).toContain(chosen);
    const noEmoji = richTemplateSlotsFromMap(template, { b0_e0_r1: "Fresh content" });
    expect(renderRichTemplate(template, noEmoji!)).not.toContain(original);
    expect(renderRichTemplate(template, [{ index: 0, entries: [["not an emoji", "Fresh content"]] }])).toBeNull();
  });
  it("keeps the later list entry style when an emoji-only entry is omitted", () => {
    const old = String.fromCodePoint(0x1f4cc);
    const template = deriveRichTemplate(encodePreviousAnnouncementHtml(`<ul><li>${old}</li><li style="color:red">Old text</li></ul>`))!;
    const slots = richTemplateSlotsFromMap(template, { b0_e1_r0: "Current text" });
    expect(slots).not.toBeNull();
    const html = renderRichTemplate(template, slots!);
    expect(html).toContain('color:red');
    expect(html).toContain('Current text');
    expect(html).not.toContain(old);
  });
  it("maps stable placeholders while rejecting unknown and incomplete entries", () => {
    const template = deriveRichTemplate(encodePreviousAnnouncementHtml('<p>Old <strong>example</strong></p><ul><li>One</li><li>Two</li></ul>'))!;
    expect(richTemplatePlaceholders(template)).toEqual([[["b0_e0_r0", "b0_e0_r1"]], [["b1_e0_r0"], ["b1_e1_r0"]]]);
    expect(richTemplateSlotsFromMap(template, { b0_e0_r0: "New", b0_e0_r1: "content", b1_e0_r0: "Task" })).toEqual([{ index: 0, entries: [["New", "content"]] }, { index: 1, entries: [["Task"]] }]);
    expect(richTemplateSlotsFromMap(template, { b0_e0_r0: "New" })).toBeNull();
    expect(richTemplateSlotsFromMap(template, { extra_key: "Content" })).toBeNull();
    expect(richTemplateSlotsFromMap(template, { b1_e1_r0: "Later" })).toBeNull();
  });
  it("rejects block Markdown in inline template slots", () => {
    const template = deriveRichTemplate(encodePreviousAnnouncementHtml('<p>Old</p>'))!;
    for (const fragment of ["- New item", "1. New item", "## Heading", "> Quote", "```code"]) {
      expect(renderRichTemplate(template, [{ index: 0, entries: [[fragment]] }])).toBeNull();
    }
  });
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
