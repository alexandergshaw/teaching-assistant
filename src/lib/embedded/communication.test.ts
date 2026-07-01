import { describe, it, expect } from "vitest";
import { scaffoldAnnouncement, scaffoldMessageReply } from "./communication";

describe("scaffoldAnnouncement", () => {
  it("derives a subject line and wraps the instruction in a body", () => {
    const a = scaffoldAnnouncement("Tell students that the midterm is moved to Friday.");
    expect(a.title.toLowerCase()).toContain("midterm");
    expect(a.title.toLowerCase()).not.toContain("tell students");
    expect(a.message).toMatch(/^(?:Hi|Hello) (?:everyone|all),/);
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
  it("greets the student by name and restates their question", () => {
    const r = scaffoldMessageReply("Alex Johnson: Can you clarify question 3?");
    expect(r.body).toContain("Hi Alex,");
    expect(r.body).toContain('You asked: "Can you clarify question 3?"');
    expect(r.body).toContain("[Add your response here.]");
  });

  it("only judges the most recent message and skips instructor authors for the greeting", () => {
    const thread = "Instructor: Let me know if you have questions.\n\nJamie Lee: When are office hours?";
    const r = scaffoldMessageReply(thread);
    expect(r.body).toContain("Hi Jamie,");
    expect(r.body).toContain('You asked: "When are office hours?"');
  });

  it("falls back to a generic acknowledgment when there is no question", () => {
    const r = scaffoldMessageReply("Sam: Thanks, that makes sense now.");
    expect(r.body).toContain("Hi Sam,");
    expect(r.body).toContain("want to make sure I address it fully");
    expect(r.body).not.toContain("You asked");
  });

  it("folds a steer note into a clearly marked placeholder", () => {
    const r = scaffoldMessageReply("Pat: I missed the deadline.", "let them resubmit by Friday");
    expect(r.body).toMatch(/\[Respond here\./);
    expect(r.body).toContain("resubmit by Friday");
  });
});
