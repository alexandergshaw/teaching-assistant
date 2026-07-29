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
      { id: "1", text: "why not?", atMs: 1000, final: true }, // trailing "?" - decisive (AC2), see below
      { id: "2", text: "How does a hash map resolve collisions in practice?", atMs: 2000, final: true },
      { id: "3", text: "How does that generally work", atMs: 3000, final: true }, // opener, no "?" - normal gating
    ];
    const permissive = detectQuestions(utterances, { minConfidence: 0 });
    expect(permissive.map((r) => r.id)).toEqual(["1", "2", "3"]);

    const strict = detectQuestions(utterances, { minConfidence: 0.9 });
    // "1" survives an unreachable-by-score threshold: AC2 makes a trailing
    // "?" decisive on its own, so it is admitted regardless of minConfidence
    // once looksLikeQuestion has already accepted it. This is a deliberate
    // flip from the pre-recall-bias behavior (which excluded "1" here) - see
    // the module-header comment and detectQuestions' doc comment.
    expect(strict.map((r) => r.id)).toContain("1");
    // "3" has no "?", so it is NOT decisive and must still be gated normally
    // by minConfidence like any other opener-only utterance.
    expect(strict.map((r) => r.id)).not.toContain("3");
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

// Recall-bias rework: the live-class Q&A panel deliberately errs toward
// flagging something as a question when it isn't, rather than the reverse -
// a missed question is invisible and unrecoverable, a false positive costs
// an instructor one glance. See the module-header comment in questions.ts.
// This suite covers the concrete acceptance criteria for that rework:
//   AC2 - broadened recall signals (decisive "?", confusion phrases, trailing-off)
//   AC3 - the lowered DEFAULT_MIN_CONFIDENCE and its boundary
//   AC4 - the floor still holds: plain lecturing must not be flagged
//   AC5 - dedupe still holds under a recall-biased detector's extra volume
describe("recall bias: AC2 broadened signals", () => {
  describe("a trailing '?' is decisive on its own, regardless of score", () => {
    it("admits a long, low-scoring ramble purely because it ends in '?'", () => {
      // Long enough (81 content words after filler-stripping) to saturate
      // scoreQuestion's ramble taper at its -0.3 cap, and carrying no
      // opener/embedded-ask signal: 0.20 baseline + 0.35 question-mark bonus
      // - 0.30 ramble cap = 0.25, well under DEFAULT_MIN_CONFIDENCE (0.35).
      // If anything should be excluded by score alone, it's this - the "?"
      // at the end must still get it through.
      const ramble = `um so ${"anyway ".repeat(80)}right?`;
      expect(looksLikeQuestion(ramble)).toBe(true);
      expect(scoreQuestion(ramble)).toBeLessThan(DEFAULT_MIN_CONFIDENCE);
      const results = detectQuestions([{ id: "q", text: ramble, atMs: 0, final: true }]);
      expect(results.map((r) => r.id)).toEqual(["q"]);
      // The reported confidence is still the true (low) score - the bypass
      // affects inclusion, not the number shown to the instructor.
      expect(results[0].confidence).toBeLessThan(DEFAULT_MIN_CONFIDENCE);
    });

    it("is not fooled into admitting a rhetorical prompt just because it has a '?'", () => {
      // The decisive-"?" bypass only ever runs AFTER looksLikeQuestion has
      // already accepted the text - a rhetorical prompt is rejected there
      // first and never reaches the bypass at all.
      const results = detectQuestions([{ id: "q", text: "Does that make sense?", atMs: 0, final: true }]);
      expect(results).toEqual([]);
    });

    it("even at an explicit minConfidence of 1, a '?' utterance is still admitted", () => {
      const results = detectQuestions([{ id: "q", text: "is that right?", atMs: 0, final: true }], {
        minConfidence: 1,
      });
      expect(results.map((r) => r.id)).toEqual(["q"]);
    });
  });

  describe("confusion/uncertainty phrases count as questions with no interrogative form", () => {
    // Each of these has neither a "?" nor an interrogative opener as its
    // first word - the only reason any of them should be detected is the
    // embedded-ask-phrase signal added for AC2. Every contracted spelling is
    // handled through expandContractions, not a separate list entry.
    const confusionUtterances = [
      "Honestly I do not get it at all",
      "Honestly I don't get it at all",
      "I am lost on this one",
      "I'm lost on this one",
      "Wait, that does not make sense",
      "Wait, that doesn't make sense",
      "I am not sure how that works",
      "I am not sure why that happens",
      "I am not sure what you mean",
      "Honestly wait I am behind",
      "Huh, that is strange",
    ];

    for (const text of confusionUtterances) {
      it(`detects "${text}" as a question`, () => {
        expect(looksLikeQuestion(text), `looksLikeQuestion(${JSON.stringify(text)}) should be true`).toBe(true);
        expect(
          scoreQuestion(text),
          `scoreQuestion(${JSON.stringify(text)}) should clear DEFAULT_MIN_CONFIDENCE`
        ).toBeGreaterThanOrEqual(DEFAULT_MIN_CONFIDENCE);
      });
    }

    it("word-boundary matching: 'wait' does not fire inside 'waiting' or 'await'", () => {
      // Sabotage-relevant: if the phrase match regressed to a plain
      // substring search, these would incorrectly flip to true.
      expect(looksLikeQuestion("We are waiting for everyone to join the call")).toBe(false);
      expect(looksLikeQuestion("Please await the results before continuing")).toBe(false);
    });
  });

  describe("an utterance that trails off mid-ask still scores as a question", () => {
    it("detects a two-clause truncated utterance ('so if we... what about when...')", () => {
      const text = "so if we... what about when...";
      expect(looksLikeQuestion(text)).toBe(true);
      expect(scoreQuestion(text)).toBeGreaterThanOrEqual(DEFAULT_MIN_CONFIDENCE);
      const results = detectQuestions([{ id: "q", text, atMs: 0, final: true }]);
      expect(results.map((r) => r.id)).toEqual(["q"]);
    });

    it("detects a trailed-off question even without the leading filler", () => {
      const text = "what about when the list is empty and";
      expect(looksLikeQuestion(text)).toBe(true);
      expect(scoreQuestion(text)).toBeGreaterThanOrEqual(DEFAULT_MIN_CONFIDENCE);
    });
  });
});

describe("recall bias: AC3 threshold boundary", () => {
  it("a minimal 3-word embedded-ask-phrase utterance (no '?', no opener) clears the new default", () => {
    // "not sure why" alone: 0.20 baseline + 0.25 embedded-ask weight - 0.05
    // short-length penalty = 0.40, comfortably above the new 0.35 floor and
    // below the OLD 0.5 floor - this is exactly the case the lowered
    // threshold exists to admit.
    const text = "not sure why";
    const score = scoreQuestion(text);
    expect(score).toBeCloseTo(0.4, 5);
    expect(score).toBeGreaterThanOrEqual(DEFAULT_MIN_CONFIDENCE);
    expect(score).toBeLessThan(0.5); // would have been rejected at the old default
    const results = detectQuestions([{ id: "q", text, atMs: 0, final: true }]);
    expect(results.map((r) => r.id)).toEqual(["q"]);
  });

  it("a plain declarative never crosses the new default no matter its length", () => {
    // Zero interrogative signal always clips to a score of exactly 0 (see
    // DEFAULT_MIN_CONFIDENCE's doc comment) - the floor is nowhere near this,
    // by a wide margin, regardless of how low DEFAULT_MIN_CONFIDENCE is set.
    const text = "The professor uploaded the slides for next week to the course site";
    // toBeCloseTo, not toBe: 0.2 + 0.1 - 0.3 lands on a float epsilon
    // (5.55e-17), not exactly 0 - the formula's intent is "no signal, no
    // score", not literal IEEE-754 zero.
    expect(scoreQuestion(text)).toBeCloseTo(0, 5);
    expect(scoreQuestion(text)).toBeLessThan(DEFAULT_MIN_CONFIDENCE);
  });

  it("an explicit minConfidence just above the new default excludes what the default admits", () => {
    const text = "not sure why";
    const atDefault = detectQuestions([{ id: "q", text, atMs: 0, final: true }]);
    expect(atDefault.map((r) => r.id)).toEqual(["q"]);

    const stricter = detectQuestions([{ id: "q", text, atMs: 0, final: true }], {
      minConfidence: DEFAULT_MIN_CONFIDENCE + 0.1,
    });
    expect(stricter).toEqual([]);
  });
});

describe("recall bias: AC4 the floor still holds against plain instructor lecturing", () => {
  // Plain declaratives and classroom instructions - no question anywhere in
  // them - must still be rejected outright, even with every AC2 signal
  // broadened. This is the "hard part" of the rework: recall goes up without
  // the panel also filling with ordinary lecture narration.
  const instructorDeclaratives = [
    "Open your books to page forty.",
    "Today we are covering stakeholder analysis.",
    "The midterm is next Tuesday.",
    "Let us take a ten minute break.",
  ];

  for (const text of instructorDeclaratives) {
    it(`rejects "${text}"`, () => {
      expect(looksLikeQuestion(text), `looksLikeQuestion(${JSON.stringify(text)}) should be false`).toBe(false);
      expect(
        scoreQuestion(text),
        `scoreQuestion(${JSON.stringify(text)}) should be ~0`
      ).toBeCloseTo(0, 5);
    });
  }

  it("rejects all four declaratives together through detectQuestions at the default threshold", () => {
    const utterances: Utterance[] = instructorDeclaratives.map((text, i) => ({
      id: `d${i}`,
      text,
      atMs: i * 1000,
      final: true,
    }));
    expect(detectQuestions(utterances)).toEqual([]);
  });
});

describe("recall bias: AC5 dedupe holds under a recall-biased detector's extra volume", () => {
  it("mergeInterim collapses successive interim revisions of a confused utterance to a single entry before detection ever runs", () => {
    // A recall-biased detector produces more candidates from partial text,
    // which is exactly the condition that stresses mergeInterim/dedupe - if
    // interim revisions leaked through as separate entries, one spoken
    // question would surface three times as the recognizer firms it up.
    let stream: Utterance[] = [];
    stream = mergeInterim(stream, { id: "u1", text: "wait", atMs: 100, final: false });
    stream = mergeInterim(stream, { id: "u1", text: "wait i am", atMs: 200, final: false });
    stream = mergeInterim(stream, { id: "u1", text: "wait i am lost", atMs: 300, final: false });
    stream = mergeInterim(stream, {
      id: "u1",
      text: "wait, I am lost, can you explain that again",
      atMs: 400,
      final: true,
    });
    expect(stream).toHaveLength(1);
    const results = detectQuestions(stream);
    expect(results.map((r) => r.id)).toEqual(["u1"]);
  });

  it("dedupeAgainstAnswered collapses multiple near-identical low-confidence detections against a single answered text", () => {
    // Two borderline confusion-phrase detections that are near-duplicates of
    // each other (the recognizer extended the same utterance across two
    // separate "final" results, a known quirk of some speech APIs) plus one
    // genuinely different question. All near-duplicates of the answered text
    // must collapse, not just the exact match - a recall-biased detector
    // that only deduped exact matches would still let the extended variant
    // back onto the panel.
    const candidates: DetectedQuestion[] = [
      { id: "a", text: "wait, that does not make sense to me", atMs: 100, confidence: 0.6 },
      { id: "b", text: "wait, that does not make sense to me at all", atMs: 300, confidence: 0.65 },
      { id: "c", text: "why does the loop run one extra time?", atMs: 500, confidence: 0.9 },
    ];
    const survivors = dedupeAgainstAnswered(candidates, ["wait, that does not make sense to me"]);
    expect(survivors.map((c) => c.id)).toEqual(["c"]);
  });

  it("end-to-end: detectQuestions -> dedupeAgainstAnswered never lets a recall-biased duplicate through", () => {
    const utterances: Utterance[] = [
      { id: "1", text: "not sure why that works", atMs: 100, final: true },
      { id: "2", text: "not sure why that works exactly", atMs: 300, final: true },
    ];
    const detected = detectQuestions(utterances);
    expect(detected.map((d) => d.id)).toEqual(["1", "2"]);

    // "1" has already been answered - its near-duplicate "2" must not slip
    // through just because it scored via a broadened AC2 signal.
    const survivors = dedupeAgainstAnswered(detected, ["not sure why that works"]);
    expect(survivors).toEqual([]);
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
