import { describe, it, expect } from "vitest";
import {
  appendSegment,
  formatOffset,
  transcriptText,
  unsyncedSegments,
  buildSessionMarkdown,
  type LiveSessionState,
  type TranscriptSegment,
} from "./session";

const emptyState = (): LiveSessionState => ({
  startedAtMs: 0,
  segments: [],
  answered: [],
  pending: [],
});

describe("appendSegment", () => {
  it("appends immutably, returning a new state with the segment added", () => {
    const state = emptyState();
    const seg: TranscriptSegment = { id: "1", text: "Hello class", atMs: 0 };
    const result = appendSegment(state, seg);

    expect(result).not.toBe(state);
    expect(result.segments).toEqual([seg]);
    // The original state is untouched.
    expect(state.segments).toEqual([]);
  });

  it("skips a segment whose text is empty after trimming", () => {
    const state = emptyState();
    const result = appendSegment(state, { id: "1", text: "   ", atMs: 0 });
    expect(result).toBe(state);
    expect(result.segments).toEqual([]);
  });

  it("skips an exact duplicate id", () => {
    const withOne = appendSegment(emptyState(), { id: "1", text: "First", atMs: 0 });
    const result = appendSegment(withOne, { id: "1", text: "Second, different text", atMs: 500 });
    expect(result).toBe(withOne);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].text).toBe("First");
  });

  it("does not mutate the segments array of the input state", () => {
    const state = emptyState();
    const originalSegments = state.segments;
    appendSegment(state, { id: "1", text: "Hello", atMs: 0 });
    expect(state.segments).toBe(originalSegments);
    expect(state.segments).toHaveLength(0);
  });
});

describe("formatOffset", () => {
  it("formats under a minute as mm:ss", () => {
    expect(formatOffset(0)).toBe("00:00");
    expect(formatOffset(5000)).toBe("00:05");
    expect(formatOffset(59000)).toBe("00:59");
  });

  it("formats over a minute as mm:ss", () => {
    expect(formatOffset(60000)).toBe("01:00");
    expect(formatOffset(125000)).toBe("02:05");
    expect(formatOffset(3599000)).toBe("59:59");
  });

  it("formats over an hour as hh:mm:ss", () => {
    expect(formatOffset(3600000)).toBe("01:00:00");
    expect(formatOffset(3661000)).toBe("01:01:01");
    expect(formatOffset(7325000)).toBe("02:02:05");
  });

  it("is never negative and safe on malformed input", () => {
    expect(formatOffset(-5000)).toBe("00:00");
    expect(formatOffset(NaN)).toBe("00:00");
  });
});

describe("transcriptText", () => {
  it("prefixes each segment with its [mm:ss] offset, joined with newlines", () => {
    const segments: TranscriptSegment[] = [
      { id: "1", text: "Welcome to class", atMs: 0 },
      { id: "2", text: "Let's start with recursion", atMs: 65000 },
    ];
    expect(transcriptText(segments)).toBe("[00:00] Welcome to class\n[01:05] Let's start with recursion");
  });

  it("returns an empty string for no segments", () => {
    expect(transcriptText([])).toBe("");
  });
});

describe("unsyncedSegments", () => {
  const segments: TranscriptSegment[] = [
    { id: "a", text: "one", atMs: 0 },
    { id: "b", text: "two", atMs: 100 },
    { id: "c", text: "three", atMs: 200 },
  ];

  it("returns everything when lastSyncedId is null", () => {
    expect(unsyncedSegments(segments, null)).toEqual(segments);
  });

  it("returns everything after a known id", () => {
    expect(unsyncedSegments(segments, "a")).toEqual([segments[1], segments[2]]);
  });

  it("returns everything when the id is unknown", () => {
    expect(unsyncedSegments(segments, "not-found")).toEqual(segments);
  });

  it("returns an empty array when lastSyncedId is the last segment", () => {
    expect(unsyncedSegments(segments, "c")).toEqual([]);
  });
});

describe("buildSessionMarkdown", () => {
  const baseMeta = { courseName: "CS 101", moduleName: "Recursion", startedAt: new Date("2026-07-27T14:00:00Z") };

  it("produces the documented headings", () => {
    const state: LiveSessionState = {
      startedAtMs: 0,
      segments: [{ id: "1", text: "Hello class", atMs: 0 }],
      answered: [
        {
          id: "q1",
          question: "What is a base case?",
          answer: "The condition that stops the recursion.",
          askedAtMs: 100,
          answeredAtMs: 200,
          grounded: true,
          sources: ["Lecture 3 slides"],
        },
      ],
      pending: [],
    };
    const md = buildSessionMarkdown(state, baseMeta);
    const lines = md.split("\n");

    expect(lines[0]).toBe("# Class session - CS 101 Recursion");
    expect(md).toContain("## Questions and answers");
    expect(md).toContain("### What is a base case?");
    expect(md).toContain("The condition that stops the recursion.");
    expect(md).toContain("## Full transcript");
    expect(md).toContain("[00:00] Hello class");
  });

  it("omits the Questions section entirely when nothing was answered", () => {
    const state: LiveSessionState = {
      startedAtMs: 0,
      segments: [{ id: "1", text: "Hello class", atMs: 0 }],
      answered: [],
      pending: [],
    };
    const md = buildSessionMarkdown(state, baseMeta);
    expect(md).not.toContain("## Questions and answers");
    expect(md).not.toContain("###");
    expect(md).toContain("## Full transcript");
  });

  it("renders nested source bullets with exactly a two-space indent", () => {
    const state: LiveSessionState = {
      startedAtMs: 0,
      segments: [],
      answered: [
        {
          id: "q1",
          question: "Where can I read more?",
          answer: "See the linked material.",
          askedAtMs: 0,
          answeredAtMs: 10,
          grounded: true,
          sources: ["https://example.test/notes", "Lecture 2 recording"],
        },
      ],
      pending: [],
    };
    const md = buildSessionMarkdown(state, baseMeta);
    const lines = md.split("\n");

    const sourcesIndex = lines.findIndex((l) => l === "- Sources");
    expect(sourcesIndex).toBeGreaterThan(-1);
    expect(lines[sourcesIndex + 1]).toBe("  - [https://example.test/notes](https://example.test/notes)");
    expect(lines[sourcesIndex + 2]).toBe("  - Lecture 2 recording");
    // Sanity: neither is a sibling (0-space) or over-indented (4-space) bullet.
    expect(lines[sourcesIndex + 1].startsWith("- ")).toBe(false);
    expect(lines[sourcesIndex + 1].startsWith("    ")).toBe(false);
  });

  it("omits the Sources bullet list entirely when a question has none", () => {
    const state: LiveSessionState = {
      startedAtMs: 0,
      segments: [],
      answered: [
        {
          id: "q1",
          question: "What is Big O?",
          answer: "A way to describe growth rate.",
          askedAtMs: 0,
          answeredAtMs: 10,
          grounded: false,
        },
      ],
      pending: [],
    };
    const md = buildSessionMarkdown(state, baseMeta);
    expect(md).not.toContain("- Sources");
  });

  it("falls back to a placeholder line when the transcript is empty", () => {
    const state: LiveSessionState = { startedAtMs: 0, segments: [], answered: [], pending: [] };
    const md = buildSessionMarkdown(state, baseMeta);
    expect(md).toContain("No transcript recorded.");
  });

  it("is deterministic for a fixed startedAt", () => {
    const state: LiveSessionState = {
      startedAtMs: 0,
      segments: [{ id: "1", text: "Same input", atMs: 0 }],
      answered: [],
      pending: [],
    };
    expect(buildSessionMarkdown(state, baseMeta)).toBe(buildSessionMarkdown(state, baseMeta));
  });
});
