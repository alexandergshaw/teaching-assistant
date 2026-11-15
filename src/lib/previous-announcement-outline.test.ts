import { describe, expect, it } from "vitest";
import { encodePreviousAnnouncementHtml } from "./announcement-library-rich-text";
import { promptSafeAnnouncementOutline } from "./announcement-prompt-outline";
import { derivePreviousAnnouncementOutline } from "./previous-announcement-outline";

describe("saved rich example emphasis", () => {
  it.each([
    ["semantic tags", "<p><strong>Old private words</strong> and <em>old topic</em></p>"],
    ["CSS styles", '<p><span style="font-weight:700">Old private words</span> and <span style="font-style:italic">old topic</span></p>'],
    ["alternate tags", "<p><b>Old private words</b> and <i>old topic</i></p>"],
  ])("derives bold and italic from %s without passing content", (_name, html) => {
    const outline = derivePreviousAnnouncementOutline(encodePreviousAnnouncementHtml(html));
    expect(outline.hasBold).toBe(true);
    expect(outline.hasItalic).toBe(true);
    const safe = JSON.stringify(promptSafeAnnouncementOutline(outline));
    expect(safe).not.toContain("Old private words");
    expect(safe).not.toContain("old topic");
  });
  it("does not treat normal styles or discarded scripts as emphasis", () => {
    const outline = derivePreviousAnnouncementOutline(encodePreviousAnnouncementHtml('<p style="font-weight:400;font-style:normal">Ordinary</p><script><strong>Hidden</strong></script>'));
    expect(outline.hasBold).toBeUndefined();
    expect(outline.hasItalic).toBeUndefined();
  });
});
