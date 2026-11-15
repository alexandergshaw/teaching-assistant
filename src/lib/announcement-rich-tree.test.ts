import { describe, expect, it } from "vitest";
import { encodePreviousAnnouncementHtml } from "./announcement-library-rich-text";
import { deriveRichTree, renderRichTree, richTreePlan } from "./announcement-rich-tree";

describe("rich announcement structural tree", () => {
  it("stores nested emoji positions without storing the source glyph", () => {
    const old = String.fromCodePoint(0x1f4cc), chosen = String.fromCodePoint(0x1f4a1);
    const tree = deriveRichTree(encodePreviousAnnouncementHtml(`<ul><li><strong>${old}</strong> Parent<ul><li>Child</li></ul></li></ul>`))!;
    expect(JSON.stringify(tree)).not.toContain(old);
    expect(richTreePlan(tree)?.emojiSlots).toEqual([0]);
    const html = renderRichTree(tree, [{ slot: 0, text: chosen }, { slot: 1, text: "Parent" }, { slot: 2, text: "Child" }]);
    expect(html).toContain(chosen);
    expect(renderRichTree(tree, [{ slot: 1, text: "Parent" }, { slot: 2, text: "Child" }])).not.toContain(old);
    expect(renderRichTree(tree, [{ slot: 0, text: "important text" }, { slot: 1, text: "Parent" }, { slot: 2, text: "Child" }])).toBeNull();
  });
  it("recreates nested lists and tables from new text without retaining example content", () => {
    const tree = deriveRichTree(encodePreviousAnnouncementHtml('<div><ul><li>Old<ul><li><strong>Private</strong></li></ul></li></ul><table><tr><td colspan="2">Secret</td></tr></table></div>'))!;
    expect(JSON.stringify(tree)).not.toMatch(/Old|Private|Secret/);
    const html = renderRichTree(tree, [{ slot: 0, text: "Parent" }, { slot: 1, text: "Child" }, { slot: 2, text: "Cell" }]);
    expect(html).toContain('<ul><li>Parent<ul><li><strong>Child</strong></li></ul></li></ul>');
    expect(html).toContain('<td colspan="2">Cell</td>');
    expect(renderRichTree(tree, [{ slot: 0, text: "Parent" }])).toBeNull();
    const optional = renderRichTree(tree, [{ slot: 2, text: "Cell" }], ["New current information"]);
    expect(optional).toContain("<td colspan=\"2\">Cell</td>");
    expect(optional).not.toContain("<ul>");
    expect(optional).toContain("New current information");
  });
});
