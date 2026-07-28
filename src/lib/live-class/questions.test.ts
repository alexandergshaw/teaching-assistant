import { describe, it, expect } from "vitest";
import {
  looksLikeQuestion,
  scoreQuestion,
  detectQuestions,
  dedupeAgainstAnswered,
  mergeInterim,
  DEFAULT_MIN_CONFIDENCE,
  type Utterance,
  type DetectedQuestion,
} from "./questions";

describe("looksLikeQuestion", () => {
  it("is true for text ending in a question mark", () => {
    expect(looksLikeQuestion("Does this always terminate?")).toBe(true);
    expect(looksLikeQuestion("The loop terminates when i exceeds n?")).toBe(true);
  });

  it("is true for text opening with each interrogative word", () => {
    const openers = [
      "what",
      "why",
      "how",
      "when",
      "where",
      "which",
      "who",
      "whose",
      "whom",
      "can",
      "could",
      "would",
      "should",
      "will",
      "does",
      "do",
      "did",
      "is",
      "are",
      "was",
      "were",
      "am",
      "may",
      "might",
      "must",
      "have",
      "has",
      "had",
    ];
    for (const opener of openers) {
      const text = `${opener} data get transmitted here`;
      expect(looksLikeQuestion(text), `opener "${opener}" should be detected`).toBe(true);
    }
  });

  it("is true for each embedded ask phrase, even mid-sentence", () => {
    const phrases = [
      "i don't understand",
      "i'm confused",
      "what if",
      "how come",
      "wait, so",
      "does that mean",
      "can you explain",
      "can you go over",
      "why does",
      "what happens if",
    ];
    for (const phrase of phrases) {
      const text = `honestly ${phrase} at all`;
      expect(looksLikeQuestion(text), `embedded phrase "${phrase}" should be detected`).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(looksLikeQuestion("WHAT IS A HASH MAP?")).toBe(true);
    expect(looksLikeQuestion("HoW DoEs ReCuRsIoN wOrK")).toBe(true);
  });

  it("is tolerant of leading/trailing punctuation and filler", () => {
    expect(looksLikeQuestion("  ...Um, how does recursion work??  ")).toBe(true);
    expect(looksLikeQuestion("So, like, what is a stack?")).toBe(true);
    expect(looksLikeQuestion('"How does that work?"')).toBe(true);
  });

  it("under-3-words rule: a bare one-word interrogative is false even with a question mark", () => {
    expect(looksLikeQuestion("what?")).toBe(false);
    expect(looksLikeQuestion("What?")).toBe(false);
    expect(looksLikeQuestion("why?")).toBe(false);
  });

  it("under-3-words rule: a two-word fragment is true only when it ends in '?'", () => {
    expect(looksLikeQuestion("why not?")).toBe(true);
    expect(looksLikeQuestion("why not")).toBe(false);
  });

  it("is false for filler-only or empty text", () => {
    expect(looksLikeQuestion("um")).toBe(false);
    expect(looksLikeQuestion("")).toBe(false);
    expect(looksLikeQuestion("   ")).toBe(false);
  });

  describe("the rhetorical filter (instructor prompting the room, not a student asking)", () => {
    const rhetoricalPrompts = [
      "any questions",
      "does that make sense",
      "make sense?",
      "everyone good",
      "any thoughts",
      "right?",
      "ok?",
    ];

    for (const prompt of rhetoricalPrompts) {
      it(`filters "${prompt}"`, () => {
        expect(looksLikeQuestion(prompt)).toBe(false);
        // Capitalized, as an instructor would actually say it.
        expect(looksLikeQuestion(prompt[0].toUpperCase() + prompt.slice(1))).toBe(false);
      });
    }

    it("filters a rhetorical prompt even with leading filler", () => {
      expect(looksLikeQuestion("So, does that make sense?")).toBe(false);
      expect(looksLikeQuestion("Okay, any questions?")).toBe(false);
    });
  });

  it("is not fooled by a genuine question containing an ordinary word like 'right'", () => {
    // "right" is only filtered when it IS the whole (filler-stripped) utterance.
    expect(looksLikeQuestion("Is the right-hand rule always true here?")).toBe(true);
  });
});

describe("scoreQuestion", () => {
  it("scores an explicit question above a bare statement", () => {
    const questionScore = scoreQuestion("What is the capital of France?");
    const statementScore = scoreQuestion("The capital of France is Paris.");
    expect(questionScore).toBeGreaterThan(statementScore);
  });

  it("is deterministic: the same input always produces the same output", () => {
    const text = "How does garbage collection actually decide what to free?";
    expect(scoreQuestion(text)).toBe(scoreQuestion(text));
    expect(scoreQuestion(text)).toBe(scoreQuestion(text));
  });

  it("stays within [0, 1]", () => {
    expect(scoreQuestion("")).toBeGreaterThanOrEqual(0);
    expect(scoreQuestion("what")).toBeLessThanOrEqual(1);
    const longRamble = `so ${"blah ".repeat(80)}is that right`;
    const score = scoreQuestion(longRamble);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("scores a very long ramble lower than a clean, sane-length question", () => {
    const clean = "How does the garbage collector decide what memory to reclaim?";
    const ramble = `so ${"um ".repeat(60)}how does the garbage collector decide what memory to reclaim`;
    expect(scoreQuestion(clean)).toBeGreaterThan(scoreQuestion(ramble));
  });
});

// Property tests pinning the invariant a bug report caught: any text
// `looksLikeQuestion` accepts must score at or above DEFAULT_MIN_CONFIDENCE,
// so `detectQuestions` (which chains the two) never silently drops a text it
// already decided was a real question. Regression case: "I'm confused about
// X" and "I don't understand Y" are exactly the phrasing a student uses to
// say they are lost - the single most valuable thing to catch - and were
// being scored below threshold because scoreQuestion under-credited the
// embedded-ask signal relative to an interrogative opener.
describe("looksLikeQuestion / scoreQuestion invariant", () => {
  // At least 15 question-shaped utterances, deliberately spanning every
  // signal looksLikeQuestion recognizes: explicit "?", an interrogative
  // opener with no "?", and - the crux of the bug - an embedded ask phrase
  // with NEITHER a "?" NOR an opener as the first word.
  const questionShapedCorpus = [
    // Explicit question mark, with an opener.
    "Why does split drop the spaces?",
    "What is a hash map?",
    "How does recursion terminate?",
    "Which data structure would be best for this?",
    "Who is responsible for freeing this memory?",
    // Explicit question mark, with an embedded ask phrase too.
    "Wait, so does that mean the loop runs one extra time?",
    // Opener present, no question mark.
    "Is the index zero based or one based",
    "Does that mean the function returns early",
    "When does the garbage collector actually run",
    "How come the output is different every time",
    // Embedded ask phrase only - NO question mark, NO opener as the first
    // word. These are the exact utterances the bug report flagged as
    // silently dropped.
    "I'm confused about how the dictionary get method works.",
    "I don't understand why we need f-strings here.",
    "Wait, so does that mean the loop runs one extra time",
    "Um, I'm confused why the dictionary raises a key error.",
    "Honestly, why does the sort function mutate the original list",
    "Can you explain how binary search works",
    "Can you go over the difference between a list and a tuple",
  ];

  it(`every question-shaped utterance in the corpus is accepted by looksLikeQuestion (${questionShapedCorpus.length} cases)`, () => {
    for (const text of questionShapedCorpus) {
      expect(looksLikeQuestion(text), `expected looksLikeQuestion(${JSON.stringify(text)}) to be true`).toBe(
        true
      );
    }
  });

  it(`every question-shaped utterance scores >= DEFAULT_MIN_CONFIDENCE (${questionShapedCorpus.length} cases)`, () => {
    for (const text of questionShapedCorpus) {
      const score = scoreQuestion(text);
      expect(
        score,
        `expected scoreQuestion(${JSON.stringify(text)}) = ${score} to be >= ${DEFAULT_MIN_CONFIDENCE}`
      ).toBeGreaterThanOrEqual(DEFAULT_MIN_CONFIDENCE);
    }
  });

  // The negative counterpart: instructor filler/rhetorical prompts and plain
  // statements must never reach looksLikeQuestion at all, however question-y
  // they might otherwise look, so they never even reach scoring.
  const instructorFillerCorpus = [
    "Any questions?",
    "Does that make sense?",
    "Make sense?",
    "Everyone good?",
    "Right?",
    "Ok?",
    "Any thoughts?",
    "So, um, okay.",
    "What?",
    "Alright so today we are going to cover regular expressions.",
    "Let's look at the next slide.",
  ];

  it(`every instructor filler/rhetorical utterance is rejected by looksLikeQuestion (${instructorFillerCorpus.length} cases)`, () => {
    for (const text of instructorFillerCorpus) {
      expect(looksLikeQuestion(text), `expected looksLikeQuestion(${JSON.stringify(text)}) to be false`).toBe(
        false
      );
    }
  });
});

describe("detectQuestions", () => {
  it("regression: keeps 'I'm confused' / 'I don't understand' utterances at the default threshold", () => {
    // The exact two utterances the bug report found silently dropped: both
    // hit an embedded ask phrase with no "?" and no interrogative opener as
    // the first word, and both must survive detectQuestions with NO explicit
    // minConfidence (i.e. at DEFAULT_MIN_CONFIDENCE).
    const utterances: Utterance[] = [
      {
        id: "confused",
        text: "I'm confused about how the dictionary get method works.",
        atMs: 1000,
        final: true,
      },
      {
        id: "dont-understand",
        text: "I don't understand why we need f-strings here.",
        atMs: 2000,
        final: true,
      },
    ];
    const results = detectQuestions(utterances);
    expect(results.map((r) => r.id)).toEqual(["confused", "dont-understand"]);
    for (const r of results) {
      expect(r.confidence).toBeGreaterThanOrEqual(DEFAULT_MIN_CONFIDENCE);
    }
  });

  it("ignores interim (non-final) utterances", () => {
    const utterances: Utterance[] = [
      { id: "1", text: "What is a hash map?", atMs: 1000, final: false },
      { id: "2", text: "What is a hash map?", atMs: 2000, final: true },
    ];
    const results = detectQuestions(utterances);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("2");
  });

  it("respects minConfidence, including the default", () => {
    const utterances: Utterance[] = [
      { id: "1", text: "why not?", atMs: 1000, final: true }, // short, lower confidence
      { id: "2", text: "How does a hash map resolve collisions in practice?", atMs: 2000, final: true },
    ];
    const permissive = detectQuestions(utterances, { minConfidence: 0 });
    expect(permissive.map((r) => r.id)).toEqual(["1", "2"]);

    const strict = detectQuestions(utterances, { minConfidence: 0.9 });
    expect(strict.map((r) => r.id)).not.toContain("1");
  });

  it("preserves input order", () => {
    const utterances: Utterance[] = [
      { id: "a", text: "Why does this loop run twice?", atMs: 100, final: true },
      { id: "b", text: "Statement, not a question.", atMs: 200, final: true },
      { id: "c", text: "How does recursion terminate?", atMs: 300, final: true },
    ];
    const results = detectQuestions(utterances);
    expect(results.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("never throws on empty or malformed input", () => {
    expect(detectQuestions([])).toEqual([]);
    // @ts-expect-error - deliberately malformed input to prove this never throws
    expect(() => detectQuestions(null)).not.toThrow();
    // @ts-expect-error - deliberately malformed input to prove this never throws
    expect(() => detectQuestions([{ id: "1" }])).not.toThrow();
  });
});

describe("dedupeAgainstAnswered", () => {
  const candidate = (id: string, text: string, confidence = 0.8): DetectedQuestion => ({
    id,
    text,
    atMs: 0,
    confidence,
  });

  it("drops an exact duplicate (after normalization)", () => {
    const candidates = [candidate("1", "What is a hash map?")];
    const results = dedupeAgainstAnswered(candidates, ["what is a hash map"]);
    expect(results).toHaveLength(0);
  });

  it("drops a contained duplicate", () => {
    const candidates = [candidate("1", "What is a hash map")];
    const results = dedupeAgainstAnswered(candidates, ["what is a hash map, exactly"]);
    expect(results).toHaveLength(0);
  });

  it("drops a revised form (the recognizer extended or trimmed the same question)", () => {
    const candidates = [candidate("1", "how does a hash map resolve collisions")];
    const results = dedupeAgainstAnswered(candidates, [
      "how does a hash map resolve collisions in practice",
    ]);
    expect(results).toHaveLength(0);
  });

  it("does not drop a genuinely different question", () => {
    const candidates = [candidate("1", "What is a binary search tree?")];
    const results = dedupeAgainstAnswered(candidates, ["what is a hash map"]);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("1");
  });

  it("does not drop a short candidate against an unrelated long answered text (below the 60% ratio)", () => {
    const candidates = [candidate("1", "why")];
    const results = dedupeAgainstAnswered(candidates, [
      "why does the garbage collector run at unpredictable times during execution",
    ]);
    expect(results).toHaveLength(1);
  });

  it("is safe with an empty answered list", () => {
    const candidates = [candidate("1", "What is a stack?")];
    expect(dedupeAgainstAnswered(candidates, [])).toHaveLength(1);
  });
});

describe("mergeInterim", () => {
  it("replaces an existing entry by id", () => {
    const existing: Utterance[] = [{ id: "1", text: "what is a", atMs: 100, final: false }];
    const incoming: Utterance = { id: "1", text: "what is a stack", atMs: 150, final: false };
    const result = mergeInterim(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(incoming);
  });

  it("appends an entry with a new id", () => {
    const existing: Utterance[] = [{ id: "1", text: "what is a stack", atMs: 100, final: true }];
    const incoming: Utterance = { id: "2", text: "how does recursion work", atMs: 200, final: false };
    const result = mergeInterim(existing, incoming);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(incoming);
  });

  it("upgrades an interim entry to final in place (same id, same position)", () => {
    const existing: Utterance[] = [
      { id: "0", text: "earlier utterance", atMs: 0, final: true },
      { id: "1", text: "what is a stack", atMs: 100, final: false },
    ];
    const incoming: Utterance = { id: "1", text: "what is a stack?", atMs: 120, final: true };
    const result = mergeInterim(existing, incoming);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(incoming);
    expect(result[1].final).toBe(true);
  });

  it("never mutates its input", () => {
    const existing: Utterance[] = [{ id: "1", text: "what is a", atMs: 100, final: false }];
    const snapshot = JSON.parse(JSON.stringify(existing));
    const incoming: Utterance = { id: "1", text: "what is a stack", atMs: 150, final: false };

    const result = mergeInterim(existing, incoming);

    expect(existing).toEqual(snapshot);
    expect(result).not.toBe(existing);
  });
});
