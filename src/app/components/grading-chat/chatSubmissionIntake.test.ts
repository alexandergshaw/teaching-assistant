import { describe, it, expect } from "vitest";
import { buildTextEntry, CHAT_LABEL_MAX_CHARS, type ChatSubmissionInput, type IntakeOutcome } from "./chatSubmissionIntake";

describe("buildTextEntry", () => {
  it("defaults the label to Submission <ordinal> when no label is given", () => {
    const entry = buildTextEntry({ content: "hello" }, 3);
    expect(entry.student).toBe("Submission 3");
    expect(entry.content).toBe("hello");
    expect(entry.mergedFileCount).toBe(0);
    expect(entry.submittedFiles).toEqual([]);
  });

  it("uses a trimmed custom label when one is given", () => {
    const entry = buildTextEntry({ label: "  Jane Doe  ", content: "hi" }, 1);
    expect(entry.student).toBe("Jane Doe");
  });

  it("falls back to the default when the label is blank/whitespace-only", () => {
    const entry = buildTextEntry({ label: "   ", content: "hi" }, 5);
    expect(entry.student).toBe("Submission 5");
  });

  // F4 Gap 2 (docs/grading-chat-security.md SEC-GC-4): an overlong custom
  // label degrades (sliced) rather than failing closed at the route's own
  // 500-char rejection. RED if the defaulter is changed to leave the label
  // unbounded - a 600-char label would then reach route.ts:88-90's own
  // MAX_STUDENT_CHARS check and 400 the whole submission instead.
  it("slices an overlong custom label to CHAT_LABEL_MAX_CHARS after defaulting", () => {
    const longLabel = "x".repeat(600);
    const entry = buildTextEntry({ label: longLabel, content: "hi" }, 1);
    expect(entry.student.length).toBe(CHAT_LABEL_MAX_CHARS);
    expect(entry.student).toBe("x".repeat(500));
  });

  it("never produces an empty student label", () => {
    const entry = buildTextEntry({ content: "hi" }, 1);
    expect(entry.student.length).toBeGreaterThan(0);
  });
});

describe("ChatSubmissionInput / IntakeOutcome shapes (type-level smoke, no runtime import)", () => {
  it("accepts a text/file/url discriminated value for each kind", () => {
    const text: ChatSubmissionInput = { kind: "text", content: "hi" };
    const file: ChatSubmissionInput = { kind: "file", file: new File(["x"], "a.txt") };
    const url: ChatSubmissionInput = { kind: "url", url: "https://example.com" };
    expect(text.kind).toBe("text");
    expect(file.kind).toBe("file");
    expect(url.kind).toBe("url");
  });

  it("the entries outcome carries pointsPossible (wave-plan BLOCKER-1)", () => {
    const outcome: IntakeOutcome = { kind: "entries", entries: [], pointsPossible: 100 };
    expect(outcome.kind).toBe("entries");
    if (outcome.kind === "entries") {
      expect(outcome.pointsPossible).toBe(100);
    }
  });
});
