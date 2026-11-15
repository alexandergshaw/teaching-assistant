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
  it("does not accept a table or nested list in place of flat prose", () => {
    expect(verifiedStyledAnnouncement("Cell", "<table><tr><td>Cell</td></tr></table>")).toBeNull();
    expect(verifiedStyledAnnouncement("- Parent Child", "<ul><li>Parent<ul><li>Child</li></ul></li></ul>")).toBeNull();
  });
  it("accepts nested pinned structure only with a plain reference, and rejects conflicting list claims", () => {
    const html = "<ul><li>Parent<ol><li>Child</li></ol></li></ul>";
    expect(verifiedStyledAnnouncement("Parent Child", html, "plain-tree")).toBeTruthy();
    expect(verifiedStyledAnnouncement("- Parent Child", html, "plain-tree")).toBeNull();
    expect(verifiedStyledAnnouncement("1. Parent Child", html, "plain-tree")).toBeNull();
    expect(verifiedStyledAnnouncement("Parent Changed", html, "plain-tree")).toBeNull();
  });
});
