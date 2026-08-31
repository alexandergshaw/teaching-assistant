// Unit tests for the pure discussion-capture module - the dedupe side:
// normalizeForMatch, authorsMatch, postSimilarityDistance, and isSamePost.
//
// This file was split out of a single discussion-capture.test.ts to stay
// under this directory's line-count ceiling (see
// recording-split.structure.test.ts). See also:
//   - discussion-capture.test.ts (frame/capture constants and functions,
//     plus the loop-policy predicates)
//   - discussion-capture.rows.test.ts (the reply-table side: merge, sort,
//     move, serialize/deserialize)
//
// Every test here is sabotage-checked - see the report handed back to the
// dispatcher for the exact sabotages run. Fixtures are frozen literals: the
// dedupe oracle below hardcodes the AC11 perturbation table (input pairs +
// expected same/different) rather than deriving expectations by calling the
// implementation under test, per this repo's "refactors disarm tests" and
// "fixtures must match emitted shape" lessons.

import { describe, it, expect } from "vitest";
import {
  SIMILARITY_THRESHOLD,
  normalizeForMatch,
  authorsMatch,
  postSimilarityDistance,
  isSamePost,
} from "./discussion-capture";

// ---------------------------------------------------------------------------
// AC11: normalizeForMatch / authorsMatch / postSimilarityDistance
// ---------------------------------------------------------------------------

describe("normalizeForMatch", () => {
  it("lowercases, strips punctuation to spaces, and collapses whitespace", () => {
    expect(normalizeForMatch("  Hello,  World!  ")).toBe("hello world");
  });

  it("does not glue adjacent words together across stripped punctuation", () => {
    expect(normalizeForMatch("user,name")).toBe("user name");
  });

  it("F3: collapses a straight-apostrophe contraction to one token, not two", () => {
    expect(normalizeForMatch("don't")).toBe("dont");
  });

  it("F3: collapses a curly-apostrophe (U+2019) contraction to one token, not two - what a real LMS renders", () => {
    expect(normalizeForMatch("don’t")).toBe("dont");
  });
});

describe("authorsMatch (AC11)", () => {
  it("matches identical names", () => {
    expect(authorsMatch("Maria Alvarez", "Maria Alvarez")).toBe(true);
  });

  it("matches case/whitespace variants", () => {
    expect(authorsMatch("Maria Alvarez", "  maria   alvarez ")).toBe(true);
  });

  it("matches a name against the same name plus a middle initial", () => {
    expect(authorsMatch("Maria Alvarez", "Maria J Alvarez")).toBe(true);
  });

  it("matches a full name against a surname-only read", () => {
    expect(authorsMatch("Maria Alvarez", "Alvarez")).toBe(true);
  });

  it("does not match different surnames", () => {
    expect(authorsMatch("Maria Alvarez", "Maria Chen")).toBe(false);
  });

  it("does not match same surname with disagreeing given names when both have more than one token", () => {
    expect(authorsMatch("Maria Alvarez", "John Alvarez")).toBe(false);
  });
});

describe("postSimilarityDistance (AC11)", () => {
  it("is 0 for identical text", () => {
    expect(postSimilarityDistance("hello world", "hello world")).toBe(0);
  });

  it("is 0 when one text is a prefix of the other (the truncate-to-shorter trick)", () => {
    const full = "the quick brown fox jumps over the lazy dog and keeps running";
    const truncated = "the quick brown fox jumps over the lazy dog";
    expect(postSimilarityDistance(full, truncated)).toBe(0);
  });

  it("is a small fraction for a single one-token substitution in a long post", () => {
    const a = "one two three four five six seven eight nine ten eleven twelve";
    const b = "one two three four five six seven eight nine ten eleven TWELVETYPO";
    const d = postSimilarityDistance(a, b);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(SIMILARITY_THRESHOLD);
  });

  it("is large for two texts sharing no tokens", () => {
    const d = postSimilarityDistance("alpha beta gamma delta", "zulu yankee xray whiskey");
    expect(d).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC11 / AC11a: isSamePost - frozen literal oracle
//
// Every input pair and its expected same/different verdict below is a
// hardcoded literal, reasoned by hand against the algorithm's documented
// rules (normalizeForMatch's strip, authorsMatch's surname anchor,
// postSimilarityDistance's truncate-to-shorter token Levenshtein, and
// AC11a's postedAt short-circuit) - never by calling isSamePost first and
// copying its answer. This is deliberately NOT a re-derivation of the
// scheme; it is an independent check of it.
// ---------------------------------------------------------------------------

const BASE_TEXT =
  "I really appreciated how the reading connected utilitarian calculus to the trolley problem, but I " +
  "think it glosses over how hard it is to actually quantify happiness across different people in " +
  "practice, which feels like the weakest link in the argument.";

// First 20 words of BASE_TEXT, used for the truncation-style perturbations.
const TRUNCATED_TEXT =
  "I really appreciated how the reading connected utilitarian calculus to the trolley problem, but I think it glosses over";

interface DedupeCase {
  name: string;
  a: { author: string; text: string; postedAt?: string };
  b: { author: string; text: string; postedAt?: string };
  expectedSame: boolean;
}

const DEDUPE_ORACLE: DedupeCase[] = [
  {
    name: "identical read",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: BASE_TEXT },
    expectedSame: true,
  },
  {
    name: "comma dropped",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: {
      author: "Maria Alvarez",
      text:
        "I really appreciated how the reading connected utilitarian calculus to the trolley problem but I " +
        "think it glosses over how hard it is to actually quantify happiness across different people in " +
        "practice which feels like the weakest link in the argument.",
    },
    expectedSame: true,
  },
  {
    name: "period added mid-sentence",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: {
      author: "Maria Alvarez",
      text: BASE_TEXT.replace("trolley problem,", "trolley problem. And"),
    },
    expectedSame: true,
  },
  {
    name: "truncated at Show more",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: TRUNCATED_TEXT },
    expectedSame: true,
  },
  {
    name: "cut at frame edge, mid-word",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: TRUNCATED_TEXT.slice(0, -3) + "ov" }, // "...glosses ov" (over cut mid-word)
    expectedSame: true,
  },
  {
    name: "one word misread (clean/dean style, later in the text)",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: BASE_TEXT.replace("practice,", "practce,") },
    expectedSame: true,
  },
  {
    name: "one word misread inside the first 120 characters",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: BASE_TEXT.replace("appreciated", "apreciated") },
    expectedSame: true,
  },
  {
    name: "leading quote artifact",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: `"${BASE_TEXT}` },
    expectedSame: true,
  },
  {
    name: "model rewrapped whitespace",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: BASE_TEXT.replace(/ /g, "  ").replace("trolley", "\n trolley") },
    expectedSame: true,
  },
  {
    name: "author read with middle initial",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria J Alvarez", text: BASE_TEXT },
    expectedSame: true,
  },
  {
    name: "author surname only (avatar clipped)",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Alvarez", text: BASE_TEXT },
    expectedSame: true,
  },
  {
    name: "model prefixed a short timestamp fragment onto the text",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: "Mar 12 " + BASE_TEXT },
    expectedSame: true,
  },
  {
    name: "Show more suffix kept",
    a: { author: "Maria Alvarez", text: TRUNCATED_TEXT },
    b: { author: "Maria Alvarez", text: TRUNCATED_TEXT + " Show more" },
    expectedSame: true,
  },
  {
    name: "first word dropped",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: BASE_TEXT.replace("I really", "really") },
    expectedSame: true,
  },
  // --- negative cases: genuinely different posts ---
  {
    name: "different author, same text",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Diego Chen", text: BASE_TEXT },
    expectedSame: false,
  },
  {
    name: "same author, unrelated text",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: {
      author: "Maria Alvarez",
      text: "The scheduling conflict this week made it hard for our study group to meet before the deadline.",
    },
    expectedSame: false,
  },
  {
    name: "AC11a: both sides carry postedAt and they differ -- conclusive, short-circuits even with identical text",
    a: { author: "Maria Alvarez", text: BASE_TEXT, postedAt: "Mar 12 at 9:04 PM" },
    b: { author: "Maria Alvarez", text: BASE_TEXT, postedAt: "Mar 14 at 2:00 PM" },
    expectedSame: false,
  },
  {
    name: "AC11a: both sides carry the same postedAt and authors match -- short-circuits to same despite unrelated text",
    a: { author: "Maria Alvarez", text: BASE_TEXT, postedAt: "Mar 12 at 9:04 PM" },
    b: {
      author: "Maria Alvarez",
      text: "Completely different unrelated sentence about something else entirely.",
      postedAt: "mar 12 at 9:04 pm",
    },
    expectedSame: true,
  },
  {
    name: "AC11a: same postedAt but authors do not match -- still different",
    a: { author: "Maria Alvarez", text: BASE_TEXT, postedAt: "Mar 12 at 9:04 PM" },
    b: { author: "Diego Chen", text: BASE_TEXT, postedAt: "Mar 12 at 9:04 PM" },
    expectedSame: false,
  },
  {
    name: "below MIN_TOKENS_FOR_SIMILARITY: short posts require exact equality, not distance",
    a: { author: "Maria Alvarez", text: "I agree completely" },
    b: { author: "Maria Alvarez", text: "I agree totally" },
    expectedSame: false,
  },
  {
    name: "below MIN_TOKENS_FOR_SIMILARITY: identical short post (case/whitespace only) still matches",
    a: { author: "Maria Alvarez", text: "I agree completely" },
    b: { author: "Maria Alvarez", text: "  i AGREE   completely " },
    expectedSame: true,
  },
];

describe("isSamePost (AC11 / AC11a) - frozen literal oracle", () => {
  it.each(DEDUPE_ORACLE.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(isSamePost(c.a, c.b)).toBe(c.expectedSame);
  });

  it("SABOTAGE CHECK (b): documents that a hardcoded return-true implementation would fail the negative cases above", () => {
    // The negative-case rows in DEDUPE_ORACLE (different author, unrelated
    // text, differing postedAt, mismatched postedAt+author, distinct short
    // posts) are exactly the rows an `isSamePost` mutated to always return
    // `true` would fail. Verified by sabotage - see report.
    const negativeCases = DEDUPE_ORACLE.filter((c) => !c.expectedSame);
    expect(negativeCases.length).toBeGreaterThan(0);
    for (const c of negativeCases) {
      expect(isSamePost(c.a, c.b)).toBe(false);
    }
  });
});
