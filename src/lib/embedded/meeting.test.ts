import { describe, it, expect } from "vitest";
import { detectMeetingRequestEmbedded } from "./meeting";

describe("detectMeetingRequestEmbedded", () => {
  it("flags an explicit request to meet live", () => {
    const r = detectMeetingRequestEmbedded(
      "Prof: Sure, what's up?\n\nStudent: Could we hop on a Zoom call this week to go over my project?"
    );
    expect(r.isMeetingRequest).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("flags office-hours and can-we-talk phrasing", () => {
    expect(detectMeetingRequestEmbedded("Student: Are you free during office hours tomorrow?").isMeetingRequest).toBe(true);
    expect(detectMeetingRequestEmbedded("Student: Can we talk about my grade?").isMeetingRequest).toBe(true);
  });

  it("does not flag a plain content question", () => {
    const r = detectMeetingRequestEmbedded("Student: Can you clarify what part 3 of the assignment is asking for?");
    expect(r.isMeetingRequest).toBe(false);
  });

  it("only judges the most recent message", () => {
    const thread =
      "Student: Can we meet to discuss this?\n\n" +
      "Prof: I answered your question below.\n\n" +
      "Student: Thanks, that makes sense now.";
    expect(detectMeetingRequestEmbedded(thread).isMeetingRequest).toBe(false);
  });

  it("does not treat a bare mention of a 'meeting' as a request", () => {
    const r = detectMeetingRequestEmbedded("Student: I missed the lecture because of a work meeting.");
    expect(r.isMeetingRequest).toBe(false);
  });

  it("returns no request for empty input", () => {
    expect(detectMeetingRequestEmbedded("   ")).toEqual({ isMeetingRequest: false, confidence: 0 });
  });
});
