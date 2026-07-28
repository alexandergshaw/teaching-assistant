import { describe, it, expect } from "vitest";
import { buildSessionLogText } from "./session-log";
import type { LiveSessionState } from "./session";
import type { AnswerLink } from "./links";

const emptyState = (): LiveSessionState => ({
  startedAtMs: 0,
  segments: [],
  answered: [],
  pending: [],
});

const baseMeta = {
  courseName: "CS 101",
  moduleName: "Recursion",
  startedAt: new Date("2026-07-27T14:00:00.000Z"),
  endedAt: new Date("2026-07-27T14:50:00.000Z"),
};

describe("buildSessionLogText", () => {
  it("includes every documented section, in order", () => {
    const state: LiveSessionState = {
      ...emptyState(),
      segments: [{ id: "1", text: "Hello class", atMs: 0 }],
      answered: [
        {
          id: "q1",
          question: "What is a base case?",
          answer: "The condition that stops the recursion.",
          askedAtMs: 100,
          answeredAtMs: 200,
          grounded: true,
        },
      ],
    };
    const text = buildSessionLogText(state, baseMeta);

    expect(text.startsWith("LIVE CLASS SESSION LOG - CS 101 - Recursion")).toBe(true);
    const headerIdx = text.indexOf("Course: CS 101");
    const qaIdx = text.indexOf("QUESTIONS AND ANSWERS");
    const transcriptIdx = text.indexOf("FULL TRANSCRIPT");
    expect(headerIdx).toBeGreaterThan(-1);
    expect(qaIdx).toBeGreaterThan(headerIdx);
    expect(transcriptIdx).toBeGreaterThan(qaIdx);
  });

  it("renders the header block: course, module, start, end, elapsed, and counts", () => {
    const state: LiveSessionState = {
      ...emptyState(),
      segments: [
        { id: "1", text: "one", atMs: 0 },
        { id: "2", text: "two", atMs: 1000 },
      ],
      answered: [
        {
          id: "q1",
          question: "Q?",
          answer: "A.",
          askedAtMs: 0,
          answeredAtMs: 10,
          grounded: true,
        },
      ],
    };
    const text = buildSessionLogText(state, baseMeta);
    expect(text).toContain("Course: CS 101");
    expect(text).toContain("Module: Recursion");
    expect(text).toContain("Session started: 2026-07-27T14:00:00.000Z");
    expect(text).toContain("Session ended: 2026-07-27T14:50:00.000Z");
    expect(text).toContain("Elapsed: 50:00");
    expect(text).toContain("Transcript segments: 2");
    expect(text).toContain("Questions answered: 1");
  });

  it('reports "still running" and computes elapsed from nowMs when the session has not ended', () => {
    const state = emptyState();
    const text = buildSessionLogText(state, {
      courseName: "CS 101",
      moduleName: "",
      startedAt: new Date("2026-07-27T14:00:00.000Z"),
      endedAt: null,
      nowMs: new Date("2026-07-27T14:10:00.000Z").getTime(),
    });
    expect(text).toContain("Session ended: still running");
    expect(text).toContain("Elapsed: 10:00");
  });

  it("renders an answer's asked/answered offsets, grounded flag, links, and sources", () => {
    const links: AnswerLink[] = [
      { label: "Python documentation", url: "https://docs.python.org/3/", kind: "docs" },
      { label: "For Loops", url: "https://programming-concept-visualizer.vercel.app/for-loops", kind: "visualizer" },
    ];
    const state: LiveSessionState = {
      ...emptyState(),
      answered: [
        {
          id: "q1",
          question: "How do for loops work?",
          answer: "A for loop repeats a fixed number of times.",
          askedAtMs: 65_000,
          answeredAtMs: 70_000,
          grounded: true,
          sources: ["Lecture 3 slides"],
          links,
        },
      ],
    };
    const text = buildSessionLogText(state, baseMeta);

    expect(text).toContain("Q: How do for loops work?");
    expect(text).toContain("Asked: [01:05]   Answered: [01:10]");
    expect(text).toContain("Grounded in course material: Yes");
    expect(text).toContain("Links:");
    expect(text).toContain("  Python documentation - https://docs.python.org/3/");
    expect(text).toContain("  For Loops - https://programming-concept-visualizer.vercel.app/for-loops");
    expect(text).toContain("Sources:");
    expect(text).toContain("  Lecture 3 slides");
  });

  it("renders 'Grounded in course material: No' for an ungrounded answer", () => {
    const state: LiveSessionState = {
      ...emptyState(),
      answered: [
        { id: "q1", question: "Q?", answer: "A.", askedAtMs: 0, answeredAtMs: 10, grounded: false },
      ],
    };
    const text = buildSessionLogText(state, baseMeta);
    expect(text).toContain("Grounded in course material: No");
  });

  it("preserves an answer's bullet lines as separate lines", () => {
    const state: LiveSessionState = {
      ...emptyState(),
      answered: [
        {
          id: "q1",
          question: "How do for loops work?",
          answer: "- A for loop repeats a fixed number of times.\n- The loop variable updates each pass.",
          askedAtMs: 0,
          answeredAtMs: 10,
          grounded: true,
        },
      ],
    };
    const text = buildSessionLogText(state, baseMeta);
    const lines = text.split("\n");
    expect(lines).toContain("- A for loop repeats a fixed number of times.");
    expect(lines).toContain("- The loop variable updates each pass.");
  });

  it("renders an explicit line when no questions were answered, not an empty section", () => {
    const state = emptyState();
    const text = buildSessionLogText(state, baseMeta);
    expect(text).toContain("No questions were answered during this session.");
  });

  it("lists a pending (unanswered) question rather than omitting it", () => {
    const state: LiveSessionState = {
      ...emptyState(),
      pending: [{ id: "p1", text: "What is Big O notation?", atMs: 30_000, confidence: 0.9 }],
    };
    const text = buildSessionLogText(state, baseMeta);
    expect(text).toContain("Pending questions (not yet answered when this log was generated):");
    expect(text).toContain("Q: What is Big O notation? (asked [00:30])");
  });

  it("lists both answered and pending questions when both are present", () => {
    const state: LiveSessionState = {
      ...emptyState(),
      answered: [{ id: "q1", question: "Answered Q?", answer: "A.", askedAtMs: 0, answeredAtMs: 10, grounded: true }],
      pending: [{ id: "p1", text: "Pending Q?", atMs: 20_000, confidence: 0.8 }],
    };
    const text = buildSessionLogText(state, baseMeta);
    expect(text).not.toContain("No questions were answered during this session.");
    expect(text).toContain("Q: Answered Q?");
    expect(text).toContain("Q: Pending Q? (asked [00:20])");
  });

  it("prefixes each transcript line with its [mm:ss] offset", () => {
    const state: LiveSessionState = {
      ...emptyState(),
      segments: [
        { id: "1", text: "Welcome to class", atMs: 0 },
        { id: "2", text: "Let's start with recursion", atMs: 65_000 },
      ],
    };
    const text = buildSessionLogText(state, baseMeta);
    expect(text).toContain("[00:00] Welcome to class");
    expect(text).toContain("[01:05] Let's start with recursion");
  });

  it("falls back to a placeholder line when the transcript is empty", () => {
    const text = buildSessionLogText(emptyState(), baseMeta);
    expect(text).toContain("No transcript recorded.");
  });

  it("is deterministic for identical input", () => {
    const state: LiveSessionState = {
      ...emptyState(),
      segments: [{ id: "1", text: "Same input", atMs: 0 }],
      answered: [{ id: "q1", question: "Q?", answer: "A.", askedAtMs: 0, answeredAtMs: 10, grounded: true }],
    };
    expect(buildSessionLogText(state, baseMeta)).toBe(buildSessionLogText(state, baseMeta));
  });
});
