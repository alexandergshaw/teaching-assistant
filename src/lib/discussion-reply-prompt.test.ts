import { describe, it, expect } from "vitest";
import {
  normalizeAudience,
  buildPostExtractionPrompt,
  buildReplyDraftingPrompt,
  EXTRACT_BATCH_SIZE,
  DRAFT_BATCH_SIZE,
  MAX_POST_CHARS,
  DISCUSSION_AUDIENCE_LABELS,
} from "./discussion-reply-prompt";

// Per the repo's "source-text tests over-specify" lesson, these tests pin the
// FACT and the ORDERING of what the prompt builders produce - never the exact
// spelling - so a future wording tweak to the prompt text does not force a
// contorted rewrite here. Assertions on exact sentences are deliberately
// avoided.

describe("EXTRACT_BATCH_SIZE / DRAFT_BATCH_SIZE / MAX_POST_CHARS", () => {
  it("are the values the server and client are both required to enforce (AC8)", () => {
    expect(EXTRACT_BATCH_SIZE).toBe(6);
    expect(DRAFT_BATCH_SIZE).toBe(5);
    expect(MAX_POST_CHARS).toBe(4000);
  });
});

describe("DISCUSSION_AUDIENCE_LABELS", () => {
  it("has a label for both audiences", () => {
    expect(DISCUSSION_AUDIENCE_LABELS.students).toBeTruthy();
    expect(DISCUSSION_AUDIENCE_LABELS.peers).toBeTruthy();
    expect(DISCUSSION_AUDIENCE_LABELS.students).not.toBe(DISCUSSION_AUDIENCE_LABELS.peers);
  });
});

describe("normalizeAudience", () => {
  it("resolves 'peers' case- and whitespace-insensitively", () => {
    expect(normalizeAudience("peers")).toBe("peers");
    expect(normalizeAudience("Peers")).toBe("peers");
    expect(normalizeAudience("PEERS")).toBe("peers");
    expect(normalizeAudience(" PEERS ")).toBe("peers");
    expect(normalizeAudience("  peers  ")).toBe("peers");
  });

  it("resolves anything that is not exactly 'peers' (after trim/lowercase) to 'students'", () => {
    expect(normalizeAudience("students")).toBe("students");
    expect(normalizeAudience("Students")).toBe("students");
    expect(normalizeAudience("")).toBe("students");
    expect(normalizeAudience("peer")).toBe("students");
    expect(normalizeAudience("peerss")).toBe("students");
  });

  it("defaults to 'students' for null, undefined and non-string values", () => {
    expect(normalizeAudience(null)).toBe("students");
    expect(normalizeAudience(undefined)).toBe("students");
    expect(normalizeAudience(42)).toBe("students");
    expect(normalizeAudience(true)).toBe("students");
    expect(normalizeAudience({})).toBe("students");
    expect(normalizeAudience(["peers"])).toBe("students");
  });
});

describe("buildPostExtractionPrompt", () => {
  it("states the frame count somewhere in the prompt", () => {
    const prompt = buildPostExtractionPrompt("", 4);
    expect(prompt).toContain("4");
  });

  it("differs when the frame count differs, so the count is not a fixed placeholder", () => {
    const promptA = buildPostExtractionPrompt("", 3);
    const promptB = buildPostExtractionPrompt("", 6);
    expect(promptA).not.toBe(promptB);
  });

  it("includes the course name, quoted, when one is given", () => {
    const prompt = buildPostExtractionPrompt("Intro to Robotics", 5);
    expect(prompt).toContain('"Intro to Robotics"');
  });

  it("omits any course-name line entirely when courseName is empty", () => {
    const withCourse = buildPostExtractionPrompt("Intro to Robotics", 5);
    const withoutCourse = buildPostExtractionPrompt("", 5);
    expect(withoutCourse).not.toContain("Robotics");
    // The empty-course prompt must not carry a leftover blank section where
    // the course line would have gone - filter(Boolean) should have removed
    // it outright, not left an empty string that .join("\n\n") would render
    // as a stray double-blank-line gap.
    expect(withoutCourse).not.toMatch(/\n\n\n/);
    expect(withCourse.length).toBeGreaterThan(withoutCourse.length);
  });

  it("also trims whitespace-only course names down to the empty-course case", () => {
    const whitespaceOnly = buildPostExtractionPrompt("   ", 5);
    const empty = buildPostExtractionPrompt("", 5);
    expect(whitespaceOnly).toBe(empty);
  });

  it("mentions the JSON output keys author/text/postedAt (the load-bearing schema, AC4b)", () => {
    const prompt = buildPostExtractionPrompt("", 5);
    expect(prompt).toContain("author");
    expect(prompt).toContain("text");
    expect(prompt).toContain("postedAt");
  });

  it("instructs against code fences/backticks (AC64 - lenient-json corrupts fenced content)", () => {
    const prompt = buildPostExtractionPrompt("", 5);
    expect(prompt.toLowerCase()).toContain("backtick");
  });
});

describe("buildReplyDraftingPrompt", () => {
  const posts = [
    { id: "a", author: "Priya", text: "First post text." },
    { id: "b", author: "Marcus", text: "Second post text." },
    { id: "c", author: "Devon", text: "Third post text." },
  ];

  it("includes every post's author and text, in the order given, numbered 1..N", () => {
    const prompt = buildReplyDraftingPrompt(posts, "students", "", "");

    const idxPriya = prompt.indexOf("Priya");
    const idxFirstText = prompt.indexOf("First post text.");
    const idxMarcus = prompt.indexOf("Marcus");
    const idxSecondText = prompt.indexOf("Second post text.");
    const idxDevon = prompt.indexOf("Devon");
    const idxThirdText = prompt.indexOf("Third post text.");

    for (const [name, i] of [
      ["Priya", idxPriya],
      ["Marcus", idxMarcus],
      ["Devon", idxDevon],
      ["First post text.", idxFirstText],
      ["Second post text.", idxSecondText],
      ["Third post text.", idxThirdText],
    ] as const) {
      expect(i, `expected "${name}" to appear in the prompt`).toBeGreaterThanOrEqual(0);
    }

    // Ordering: post 1's content precedes post 2's, which precedes post 3's.
    expect(idxPriya).toBeLessThan(idxMarcus);
    expect(idxMarcus).toBeLessThan(idxDevon);
    expect(idxFirstText).toBeLessThan(idxSecondText);
    expect(idxSecondText).toBeLessThan(idxThirdText);

    // Every post number from 1 to N is present, as a positional reference
    // the model can echo back (id text - "a", "b", "c" - never appears).
    expect(prompt).toContain("1");
    expect(prompt).toContain("2");
    expect(prompt).toContain("3");
    expect(prompt).not.toContain("\"a\"");
    expect(prompt).not.toContain("\"b\"");
    expect(prompt).not.toContain("\"c\"");
  });

  it("never puts the caller's row ids on the wire", () => {
    const prompt = buildReplyDraftingPrompt(posts, "students", "", "");
    expect(prompt).not.toContain("disc-");
  });

  it("states the exact reply count expected back, matching posts.length", () => {
    const prompt3 = buildReplyDraftingPrompt(posts, "students", "", "");
    const prompt1 = buildReplyDraftingPrompt(posts.slice(0, 1), "students", "", "");
    expect(prompt3).toContain("3");
    expect(prompt1).not.toBe(prompt3);
  });

  it("puts styleBlock LAST (format instructions must not be buried under freeform prose)", () => {
    const styleBlock = "\n\nMATCH THE INSTRUCTOR'S PERSONAL WRITING STYLE (tone, rhythm, vocabulary) shown in this sample:\nSome sample text.";
    const prompt = buildReplyDraftingPrompt(posts, "students", "", styleBlock);
    expect(prompt.trim().endsWith(styleBlock.trim())).toBe(true);
  });

  it("omits the style block entirely when it is empty, with no dangling gap", () => {
    const withStyle = buildReplyDraftingPrompt(posts, "students", "", "non-empty style");
    const withoutStyle = buildReplyDraftingPrompt(posts, "students", "", "");
    expect(withoutStyle).not.toContain("non-empty style");
    expect(withStyle.length).toBeGreaterThan(withoutStyle.length);
  });

  it("includes the course name, quoted, when one is given, and omits it entirely when empty", () => {
    const withCourse = buildReplyDraftingPrompt(posts, "students", "Intro to Robotics", "");
    const withoutCourse = buildReplyDraftingPrompt(posts, "students", "", "");
    expect(withCourse).toContain('"Intro to Robotics"');
    expect(withoutCourse).not.toContain("Robotics");
  });

  it("trims a whitespace-only course name down to the empty-course case", () => {
    const whitespaceOnly = buildReplyDraftingPrompt(posts, "students", "   ", "");
    const empty = buildReplyDraftingPrompt(posts, "students", "", "");
    expect(whitespaceOnly).toBe(empty);
  });

  it("produces a DIFFERENT prompt for the two audiences given the same posts (AC65 - structural, not tonal)", () => {
    const studentsPrompt = buildReplyDraftingPrompt(posts, "students", "", "");
    const peersPrompt = buildReplyDraftingPrompt(posts, "peers", "", "");
    expect(studentsPrompt).not.toBe(peersPrompt);
  });

  it("both audience stances forbid emoji, markdown and a greeting/sign-off (shared constraints)", () => {
    for (const audience of ["students", "peers"] as const) {
      const prompt = buildReplyDraftingPrompt(posts, audience, "", "").toLowerCase();
      expect(prompt).toContain("emoji");
      expect(prompt).toContain("markdown");
    }
  });

  it("only the students register mentions a deadline - an assessment-scoped prohibition meaningless between colleagues (AC65)", () => {
    const studentsPrompt = buildReplyDraftingPrompt(posts, "students", "", "").toLowerCase();
    const peersPrompt = buildReplyDraftingPrompt(posts, "peers", "", "").toLowerCase();
    expect(studentsPrompt).toContain("deadline");
    expect(peersPrompt).not.toContain("deadline");
  });
});
