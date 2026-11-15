import { describe, expect, it } from "vitest";
import { verifiedStyledAnnouncement } from "./walkthrough-styled-announcement";
describe("styled announcement validation", () => {
  it("accepts matching content and link targets, sanitizing HTML", () => {
    const html = '<p style="color:red">Read <a href="https://example.org/a">guide</a></p><script>bad()</script>';
    expect(verifiedStyledAnnouncement('Read [guide](https://example.org/a)', html)).toBe('<p style="color:red">Read <a href="https://example.org/a">guide</a></p>');
    expect(verifiedStyledAnnouncement('Read [guide](https://example.org/b)', html)).toBeNull();
    expect(verifiedStyledAnnouncement('Changed', html)).toBeNull();
  });
  it("rejects links attached to the wrong words or position", () => {
    const markdown = '[First](https://example.org/a) Second';
    expect(verifiedStyledAnnouncement(markdown, '<p>First <a href="https://example.org/a">Second</a></p>')).toBeNull();
    expect(verifiedStyledAnnouncement('[Go](https://example.org/a) Go', '<p>Go <a href="https://example.org/a">Go</a></p>')).toBeNull();
  });
  it("allows styled paragraph headings but preserves actual heading levels", () => {
    expect(verifiedStyledAnnouncement("## Topic", "<p>Topic</p>")).toBeTruthy();
    expect(verifiedStyledAnnouncement("## Topic", "<h2>Topic</h2>")).toBeTruthy();
    expect(verifiedStyledAnnouncement("## Topic", "<h3>Topic</h3>")).toBeNull();
    expect(verifiedStyledAnnouncement("Topic", "<h2>Topic</h2>")).toBeNull();
  });
});
