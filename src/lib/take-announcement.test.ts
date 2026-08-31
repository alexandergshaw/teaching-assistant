import { describe, it, expect } from "vitest";
import {
  truncateTranscriptForPrompt,
  buildTakeAnnouncementInstruction,
  TAKE_ANNOUNCEMENT_INSTRUCTION,
  TRANSCRIPT_PROMPT_CAP,
} from "./take-announcement";

describe("truncateTranscriptForPrompt", () => {
  it("returns a transcript at or under the cap completely unchanged", () => {
    const short = "This is a short transcript.";
    expect(truncateTranscriptForPrompt(short, 8000)).toBe(short);
    const exact = "x".repeat(100);
    expect(truncateTranscriptForPrompt(exact, 100)).toBe(exact);
  });

  it("cuts a transcript over the cap at a word boundary and appends the marker", () => {
    const words = "alpha bravo charlie delta echo foxtrot golf hotel india juliet ".repeat(20);
    const cap = 100;
    const result = truncateTranscriptForPrompt(words, cap);
    expect(result.length).toBeLessThanOrEqual(cap);
    expect(result.endsWith("[transcript truncated]")).toBe(true);
    // The text before the marker must not end mid-word: strip the marker and
    // confirm what's left ends exactly where the original had a space, i.e.
    // it is a prefix of a whitespace-joined sequence of whole words.
    const beforeMarker = result.slice(0, result.indexOf(" [transcript truncated]"));
    expect(words.startsWith(beforeMarker)).toBe(true);
    if (beforeMarker.length < words.length) {
      // the character right after the kept text in the source was a space,
      // i.e. we cut between words, not inside one.
      expect(words[beforeMarker.length]).toBe(" ");
    }
  });

  it("never exceeds the cap even accounting for the marker", () => {
    const long = "word ".repeat(5000);
    const result = truncateTranscriptForPrompt(long, TRANSCRIPT_PROMPT_CAP);
    expect(result.length).toBeLessThanOrEqual(TRANSCRIPT_PROMPT_CAP);
  });

  it("defaults to TRANSCRIPT_PROMPT_CAP (8000)", () => {
    expect(TRANSCRIPT_PROMPT_CAP).toBe(8000);
    const long = "x".repeat(TRANSCRIPT_PROMPT_CAP * 2);
    expect(truncateTranscriptForPrompt(long).length).toBeLessThanOrEqual(TRANSCRIPT_PROMPT_CAP);
  });
});

describe("buildTakeAnnouncementInstruction", () => {
  const baseContext = { takeName: "Take 3", durationSec: 615 };

  it("includes the standing instruction verbatim, at the start", () => {
    const out = buildTakeAnnouncementInstruction("some transcript text", baseContext);
    expect(out.startsWith(TAKE_ANNOUNCEMENT_INSTRUCTION)).toBe(true);
  });

  it("places the standing instruction before the transcript (ordering, not prose)", () => {
    const out = buildTakeAnnouncementInstruction("UNIQUE_TRANSCRIPT_MARKER_TEXT", baseContext);
    const instructionIdx = out.indexOf(TAKE_ANNOUNCEMENT_INSTRUCTION);
    const transcriptIdx = out.indexOf("UNIQUE_TRANSCRIPT_MARKER_TEXT");
    expect(instructionIdx).toBeGreaterThanOrEqual(0);
    expect(transcriptIdx).toBeGreaterThan(instructionIdx);
  });

  it("includes the take name and the transcript text", () => {
    const out = buildTakeAnnouncementInstruction("hello world", baseContext);
    expect(out).toContain("Take 3");
    expect(out).toContain("hello world");
  });

  it("includes optional context fields when provided", () => {
    const out = buildTakeAnnouncementInstruction("t", {
      ...baseContext,
      topic: "Recursion",
      objectives: "Understand base cases",
      cardTitle: "Week 4",
      cardSubtitle: "Recursion basics",
    });
    expect(out).toContain("Recursion");
    expect(out).toContain("Understand base cases");
    expect(out).toContain("Week 4");
    expect(out).toContain("Recursion basics");
  });

  it("omits optional context fields when absent, rather than printing empty labels", () => {
    const out = buildTakeAnnouncementInstruction("t", baseContext);
    expect(out).not.toContain("Course topic:");
    expect(out).not.toContain("Learning objectives:");
    expect(out).not.toContain("Recording title card:");
    expect(out).not.toContain("Recording subtitle card:");
  });

  it("truncates an over-cap transcript before including it", () => {
    const longTranscript = "word ".repeat(5000);
    const out = buildTakeAnnouncementInstruction(longTranscript, baseContext);
    expect(out).toContain("[transcript truncated]");
  });
});
