import { describe, it, expect } from "vitest";
import {
  looksLikeQuestion,
  scoreQuestion,
  detectQuestions,
  dedupeAgainstAnswered,
  mergeInterim,
  expandContractions,
  DEFAULT_MIN_CONFIDENCE,
  type Utterance,
  type DetectedQuestion,
} from "./questions";

describe("expandContractions", () => {
  // One representative sentence per contraction family from the bug report
  // (K1), each paired with the exact expansion `expandContractions` is
  // expected to produce. Covers every family listed in the acceptance
  // criteria. Output is asserted in lowercase because `expandContractions`
  // is used purely for internal matching (both call sites lowercase
  // downstream anyway) and always emits the expansion in lowercase
  // regardless of the input's case - see the case-insensitivity case below.
  const families: Array<[string, string]> = [
    ["what's", "what is"],
    ["who's", "who is"],
    ["where's", "where is"],
    ["when's", "when is"],
    ["why's", "why is"],
    ["how's", "how is"],
    ["that's", "that is"],
    ["there's", "there is"],
    ["here's", "here is"],
    ["it's", "it is"],
    ["he's", "he is"],
    ["she's", "she is"],
    ["let's", "let us"],
    ["what're", "what are"],
    ["we're", "we are"],
    ["they're", "they are"],
    ["you're", "you are"],
    ["i'm", "i am"],
    ["i've", "i have"],
    ["we've", "we have"],
    ["you've", "you have"],
    ["they've", "they have"],
    ["i'd", "i would"],
    ["we'd", "we would"],
    ["you'd", "you would"],
    ["i'll", "i will"],
    ["we'll", "we will"],
    ["you'll", "you will"],
    ["don't", "do not"],
    ["doesn't", "does not"],
    ["didn't", "did not"],
    ["can't", "cannot"],
    ["cannot", "cannot"],
    ["won't", "will not"],
    ["wouldn't", "would not"],
    ["couldn't", "could not"],
    ["shouldn't", "should not"],
    ["isn't", "is not"],
    ["aren't", "are not"],
    ["wasn't", "was not"],
    ["weren't", "were not"],
    ["haven't", "have not"],
    ["hasn't", "has not"],
    ["hadn't", "had not"],
    ["ain't", "is not"],
  ];

  for (const [contracted, expanded] of families) {
    it(`expands "${contracted}" to "${expanded}"`, () => {
      expect(expandContractions(contracted)).toBe(expanded);
    });
  }

  it("matches case-insensitively but always emits a lowercase expansion", () => {
    expect(expandContractions("DON'T")).toBe("do not");
    expect(expandContractions("Won't")).toBe("will not");
    expect(expandContractions("WHAT'S")).toBe("what is");
  });

  it("expands both the straight apostrophe (') and the typographic apostrophe (U+2019)", () => {
    const straight = ["don't", "can't", "it's", "what's", "won't", "isn't"];
    const curly = straight.map((s) => s.replace(/'/g, "’"));
    for (let i = 0; i < straight.length; i++) {
      expect(
        expandContractions(curly[i]),
        `curly-apostrophe form "${curly[i]}" should expand the same as "${straight[i]}"`
      ).toBe(expandContractions(straight[i]));
    }
    // Concrete values, not just cross-equality, so a broken pattern that
    // happens to leave both forms equally untouched cannot slip through.
    expect(expandContractions("don’t")).toBe("do not");
    expect(expandContractions("can’t")).toBe("cannot");
    expect(expandContractions("it’s")).toBe("it is");
  });

  it("leaves bare words that merely resemble a contraction untouched", () => {
    // "wont" and "cant" are real (if unusual) words without an apostrophe -
    // they must never be rewritten into "will not" / "cannot".
    expect(expandContractions("wont")).toBe("wont");
    expect(expandContractions("cant")).toBe("cant");
    expect(expandContractions("I wont be able to make the wont fabric class")).toBe(
      "I wont be able to make the wont fabric class"
    );
  });

  it("expands multiple contractions within one sentence", () => {
    expect(expandContractions("I can't tell what's wrong, isn't it obvious?")).toBe(
      "I cannot tell what is wrong, is not it obvious?"
    );
  });

  it("leaves text with no contractions unchanged", () => {
    const text = "How does recursion terminate for a base case";
    expect(expandContractions(text)).toBe(text);
  });

  it("is safe with non-string input", () => {
    // @ts-expect-error - deliberately malformed input to prove this never throws
    expect(expandContractions(null)).toBe("");
    // @ts-expect-error - deliberately malformed input to prove this never throws
    expect(expandContractions(undefined)).toBe("");
  });
});

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
    // Contraction-normalization regression cases: "that's" -> "that is" and
    // "let's" -> "let us" must not accidentally create a new opener/embedded
    // match that makes these slip through the rhetorical filter.
    "That's fine.",
    "That's it.",
    "Let's move on.",
  ];

  it(`every instructor filler/rhetorical utterance is rejected by looksLikeQuestion (${instructorFillerCorpus.length} cases)`, () => {
    for (const text of instructorFillerCorpus) {
      expect(looksLikeQuestion(text), `expected looksLikeQuestion(${JSON.stringify(text)}) to be false`).toBe(
        false
      );
    }
  });
});

// Contraction-normalization regression suite (the bug report's core issue):
// a contracted question and its expanded twin must be judged IDENTICALLY by
// both looksLikeQuestion and scoreQuestion - not just both truthy/above
// threshold, but the exact same confidence number. Before the fix,
// `looksLikeQuestion`/`scoreQuestion` matched literal strings with no
// contraction handling, so a contracted interrogative like "What's a
// dictionary comprehension" (no "?") was not detected at all, and every
// other contracted question scored materially lower than its expanded twin
// purely because the apostrophe hid it from the opener/embedded-phrase
// lists.
describe("contraction normalization: expanded/contracted pairs score identically", () => {
  // [expanded, contracted] pairs taken from the bug report's measurements.
  // Adding a pair here automatically extends every assertion below - no
  // other code needs to change to cover a new pair.
  const pairTable: Array<[expanded: string, contracted: string]> = [
    ["What is a dictionary comprehension", "What's a dictionary comprehension"],
    ["Where is the file saved?", "Where's the file saved?"],
    ["What is the complexity of this loop?", "What's the complexity of this loop?"],
    ["Why is the index zero based?", "Why's the index zero based?"],
    ["How is that different from a list?", "How's that different from a list?"],
    ["What are the edge cases here?", "What're the edge cases here?"],
    ["Do not we need to close the file?", "Don't we need to close the file?"],
    ["Cannot you just use a set?", "Can't you just use a set?"],
    ["I am confused about recursion", "I'm confused about recursion"],
    ["It is confusing how the loop ends", "It's confusing how the loop ends"],
  ];

  it(`looksLikeQuestion agrees for every expanded/contracted pair (${pairTable.length} pairs)`, () => {
    for (const [expanded, contracted] of pairTable) {
      expect(
        looksLikeQuestion(contracted),
        `looksLikeQuestion(${JSON.stringify(contracted)}) should equal looksLikeQuestion(${JSON.stringify(
          expanded
        )})`
      ).toBe(looksLikeQuestion(expanded));
    }
  });

  it(`scoreQuestion returns the SAME number for every expanded/contracted pair (${pairTable.length} pairs)`, () => {
    for (const [expanded, contracted] of pairTable) {
      const expandedScore = scoreQuestion(expanded);
      const contractedScore = scoreQuestion(contracted);
      expect(
        contractedScore,
        `scoreQuestion(${JSON.stringify(contracted)}) = ${contractedScore} should equal scoreQuestion(${JSON.stringify(
          expanded
        )}) = ${expandedScore}`
      ).toBe(expandedScore);
    }
  });

  it("the user's exact reported case: a contracted interrogative with no question mark is detected", () => {
    // "What's a dictionary comprehension" - no "?" - was the exact utterance
    // the bug report was filed against: not detected at all pre-fix.
    const text = "What's a dictionary comprehension";
    expect(looksLikeQuestion(text)).toBe(true);
    expect(scoreQuestion(text)).toBeGreaterThanOrEqual(DEFAULT_MIN_CONFIDENCE);

    const results = detectQuestions([{ id: "q1", text, atMs: 0, final: true }]);
    expect(results.map((r) => r.id)).toEqual(["q1"]);
  });

  it("all four confusion-form spellings survive detectQuestions at the default threshold", () => {
    // K4: both spellings of "I'm confused"/"I don't understand" must now be
    // recognized, since EMBEDDED_ASK_PHRASES holds expanded forms and both
    // spellings normalize onto them.
    const utterances: Utterance[] = [
      { id: "a", text: "I'm confused about recursion", atMs: 0, final: true },
      { id: "b", text: "I am confused about recursion", atMs: 1000, final: true },
      { id: "c", text: "I don't understand the accumulator pattern", atMs: 2000, final: true },
      { id: "d", text: "I do not understand the accumulator pattern", atMs: 3000, final: true },
    ];
    const results = detectQuestions(utterances);
    expect(results.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    for (const r of results) {
      expect(r.confidence).toBeGreaterThanOrEqual(DEFAULT_MIN_CONFIDENCE);
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
