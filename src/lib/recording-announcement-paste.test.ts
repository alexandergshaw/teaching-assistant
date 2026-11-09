import { describe, expect, it } from "vitest";
import { recordingClipboardContent, sanitizeRecordingAnnouncementHtml } from "./recording-announcement-html";

describe("formatted recording announcement paste", () => {
  it("keeps safe font, color, emphasis and table markup through the post sanitizer", () => {
    const html = '<p style="font-size:20px;color:#123456"><strong>Hi</strong></p><table><tr><td>Cell</td></tr></table>';
    const result = recordingClipboardContent(html, "Hi Cell");
    expect(result).toEqual({ command: "insertHTML", value: html });
    expect(sanitizeRecordingAnnouncementHtml(result.value)).toBe(html);
  });
  it("removes executable markup and falls back to plain text when no rich content remains", () => {
    const result = recordingClipboardContent('<p onclick="bad()">Safe<script>bad()</script></p>', "Safe");
    expect(result).toEqual({ command: "insertHTML", value: "<p>Safe</p>" });
    expect(recordingClipboardContent("<script>bad()</script>", "text")).toEqual({ command: "insertText", value: "text" });
  });
});