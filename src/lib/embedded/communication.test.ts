import { describe, it, expect } from "vitest";
import { scaffoldAnnouncement, scaffoldMessageReply } from "./communication";

describe("scaffoldAnnouncement", () => {
  it("derives a subject line and wraps the instruction in a body", () => {
    const a = scaffoldAnnouncement("Tell students that the midterm is moved to Friday.");
    expect(a.title.toLowerCase()).toContain("midterm");
    expect(a.title.toLowerCase()).not.toContain("tell students");
    expect(a.message).toContain("Hi everyone,");
    expect(a.message).toContain("Friday");
    expect(a.message).toContain("Your instructor");
  });

  it("strips long dashes from the body", () => {
    const a = scaffoldAnnouncement("Office hours — now on Zoom — start next week.");
    expect(a.message).not.toMatch(/[—–]/);
  });

  it("falls back to a generic title when nothing is left after stripping", () => {
    const a = scaffoldAnnouncement("Announce that:");
    expect(a.title.length).toBeGreaterThan(0);
  });
});

describe("scaffoldMessageReply", () => {
  it("produces a courteous template with a placeholder to fill in", () => {
    const r = scaffoldMessageReply("Student: Can you clarify question 3?");
    expect(r.body).toContain("Thanks for reaching out");
    expect(r.body).toContain("[Add your response here.]");
  });

  it("folds a steer note into a clearly marked placeholder", () => {
    const r = scaffoldMessageReply("Student: I missed the deadline.", "let them resubmit by Friday");
    expect(r.body).toMatch(/\[Respond here\./);
    expect(r.body).toContain("resubmit by Friday");
  });
});
