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
  it("drops scripts, event handlers, unsafe links and unsafe CSS", () => {
    const safe = sanitizePreviousAnnouncementHtml('<script>alert(1)</script><p onclick="evil()" style="color:red;background-image:url(x);font-size:20px"><a href="javascript:evil()">Hello</a></p>');
    expect(safe).toBe('<p style="color:red;font-size:20px"><a>Hello</a></p>');
  });
  it("keeps legacy plain text as literal visible text", () => {
    expect(previousAnnouncementText('Hello <there>\nNext')).toBe('Hello <there>\nNext');
    expect(previousAnnouncementHtml('Hello <there>\nNext')).toBe('<div>Hello &lt;there&gt;</div><div>Next</div>');
  });
});
