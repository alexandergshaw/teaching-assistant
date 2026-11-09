import { describe, expect, it } from "vitest";
import { recordingDraftIsUnsaved } from "./useRecordingDraftGuard";

describe("recording draft departure guard", () => {
  const saved = { subject: "Title", body: "<p>Message</p>", courseId: "course-a" };
  it("warns for a generated draft and protects content changed during a save", () => {
    expect(recordingDraftIsUnsaved(saved, null, false)).toBe(true);
    expect(recordingDraftIsUnsaved(saved, saved, false)).toBe(false);
    expect(recordingDraftIsUnsaved({ ...saved, body: "<p>Edited</p>" }, saved, false)).toBe(true);
    expect(recordingDraftIsUnsaved({ ...saved, courseId: "course-b" }, saved, false)).toBe(true);
  });
  it("does not warn for empty or successfully posted content", () => {
    expect(recordingDraftIsUnsaved({ subject: "", body: "", courseId: "" }, null, false)).toBe(false);
    expect(recordingDraftIsUnsaved(saved, null, true)).toBe(false);
  });
});