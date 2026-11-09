import { describe, expect, it } from "vitest";
import { recordingDraftToHtml, sanitizeRecordingAnnouncementHtml } from "./recording-announcement-html";

describe("recording announcement HTML", () => {
  it("preserves paragraphs, emphasis, headings, lists, and literal text", () => {
    const input = "<h2>Week &amp; work</h2><p>Hello <strong>class</strong></p><ul><li>Read</li><li><em>Write</em></li></ul>";
    expect(sanitizeRecordingAnnouncementHtml(input)).toBe(input);
    expect(sanitizeRecordingAnnouncementHtml(sanitizeRecordingAnnouncementHtml(input))).toBe(input);
  });
  it("strips active content, attributes and unsafe links", () => {
    const html = '<p onclick="bad()">Hello<script>alert(1)</script><a href="javascript:alert(1)">bad</a><img src="x" onerror="bad()"></p>';
    expect(sanitizeRecordingAnnouncementHtml(html)).toBe("<p>Hellobad</p>");
    expect(sanitizeRecordingAnnouncementHtml('<a href="https://example.org/x?a=1&amp;b=2">Link</a>')).toBe('<a href="https://example.org/x?a=1&amp;b=2">Link</a>');
  });
  it("turns model Markdown into formatted HTML rather than showing Markdown syntax", () => {
    expect(recordingDraftToHtml("## This week\n\n- **Read** the chapter\n- Write a response"))
      .toBe("<h2>This week</h2>\n<ul><li><strong>Read</strong> the chapter</li><li>Write a response</li></ul>");
  });
  it("preserves literal supplementary characters through editing and posting sanitization", () => {
    const symbol = String.fromCodePoint(0x1f4d8);
    expect(sanitizeRecordingAnnouncementHtml(recordingDraftToHtml(`## ${symbol} Reading`))).toBe(`<h2>${symbol} Reading</h2>`);
  });
});
