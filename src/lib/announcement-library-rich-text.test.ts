import { describe, it, expect } from "vitest";
import { encodePreviousAnnouncementHtml, previousAnnouncementHtml, previousAnnouncementText, sanitizePreviousAnnouncementHtml } from "./announcement-library-rich-text";

describe("previous announcement rich paste", () => {
  it("preserves safe color, size, bold and lists through save and reopen", () => {
    const pasted = '<div><span style="font-size:18px;color:rgb(10, 20, 30)"><b>Welcome</b></span></div><ul><li>Read</li></ul>';
    const saved = encodePreviousAnnouncementHtml(pasted);
    const reopened = previousAnnouncementHtml(saved);
    expect(reopened).toContain('style="font-size:18px;color:rgb(10, 20, 30)"');
    expect(reopened).toContain('<b>Welcome</b>');
    expect(reopened).toContain('<ul><li>Read</li></ul>');
    expect(previousAnnouncementText(saved)).toContain("Welcome");
    expect(previousAnnouncementText(saved)).not.toContain("font-size");
  });
  it("retains legacy font element color, face and size", () => {
    expect(sanitizePreviousAnnouncementHtml('<font color="red" face="Arial" size="4">Hello</font>')).toBe('<span style="color:red;font-family:Arial;font-size:18px">Hello</span>');
  });
  it("retains table structure, cell spans and common safe layout styles on reopen", () => {
    const pasted = '<table style="border-collapse:collapse;width:100%"><tbody><tr><th colspan="2" style="border:1px solid #333;padding:4px">Title</th></tr><tr><td style="vertical-align:top;line-height:1.5">One</td><td>Two</td></tr></tbody></table>';
    const reopened = previousAnnouncementHtml(encodePreviousAnnouncementHtml(pasted));
    expect(reopened).toBe(sanitizePreviousAnnouncementHtml(pasted));
    expect(reopened).toContain('<th style="border:1px solid #333;padding:4px" colspan="2">Title</th>');
    expect(previousAnnouncementText(encodePreviousAnnouncementHtml(pasted))).toContain("Title");
  });
  it("rejects unsafe layout values and invalid table spans", () => {
    const pasted = '<table style="width:expression(alert(1));background-image:url(https://x);border:1px solid red"><tr><td colspan="1000" rowspan="2" style="position:fixed;padding:2px;line-height:url(x)">Text</td></tr></table>';
    expect(sanitizePreviousAnnouncementHtml(pasted)).toBe('<table style="border:1px solid red"><tr><td style="padding:2px" rowspan="2">Text</td></tr></table>');
  });
  it("drops scripts, event handlers, unsafe links and unsafe CSS", () => {
    const safe = sanitizePreviousAnnouncementHtml('<script>alert(1)</script><p onclick="evil()" style="color:red;background-image:url(x);font-size:20px"><a href="javascript:evil()">Hello</a></p>');
    expect(safe).toBe('<p style="color:red;font-size:20px"><a>Hello</a></p>');
  });
  it("keeps legacy plain text as literal visible text", () => {
    expect(previousAnnouncementText('Hello <there>\nNext')).toBe('Hello <there>\nNext');
    expect(previousAnnouncementHtml('Hello <there>\nNext')).toBe('<div>Hello &lt;there&gt;</div><div>Next</div>');
  });
});
