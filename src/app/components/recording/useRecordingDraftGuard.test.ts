import { describe, expect, it } from "vitest";
import { createTakeOperationLock } from "./take-operation-lock";
import { recordingDraftIsUnsaved, recordingSavePending } from "./useRecordingDraftGuard";

describe("recording draft departure guard", () => {
  const saved = { subject: "Title", body: "<p>Message</p>", courseId: "course-a" };
  it("blocks departure in the same tick as save before React updates state", () => {
    const lock = createTakeOperationLock();
    expect(recordingSavePending(false, lock.isHeld)).toBe(false);
    expect(lock.acquire()).toBe(true);
    expect(recordingSavePending(false, lock.isHeld)).toBe(true);
    lock.release();
    expect(recordingSavePending(false, lock.isHeld)).toBe(false);
    expect(recordingSavePending(true, lock.isHeld)).toBe(true);
  });
  it("warns for a generated draft and protects content changed during a save", () => {
    expect(recordingDraftIsUnsaved(saved, null, false)).toBe(true);
    expect(recordingDraftIsUnsaved(saved, saved, false)).toBe(false);
    expect(recordingDraftIsUnsaved({ ...saved, body: "<p>Edited</p>" }, saved, false)).toBe(true);
    expect(recordingDraftIsUnsaved({ ...saved, courseId: "course-b" }, saved, false)).toBe(true);
  });
  it("protects an explicitly edited direction or selected format even before a draft exists", () => {
    const empty = { subject: "", body: "", courseId: "default-course" };
    expect(recordingDraftIsUnsaved(empty, null, false)).toBe(false);
    expect(recordingDraftIsUnsaved(empty, null, false, true)).toBe(true);
    expect(recordingDraftIsUnsaved(empty, null, true, true)).toBe(false);
    expect(recordingDraftIsUnsaved(saved, saved, false, true)).toBe(true);
  });
  it("does not warn for empty or successfully posted content", () => {
    expect(recordingDraftIsUnsaved({ subject: "", body: "", courseId: "" }, null, false)).toBe(false);
    expect(recordingDraftIsUnsaved(saved, null, true)).toBe(false);
  });
});