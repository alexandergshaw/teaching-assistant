import { describe, expect, it } from "vitest";
import {
  ALL_FILLER_TERMS,
  DISCOURSE_MARKER_FILLERS,
  HIGH_CONFIDENCE_FILLERS,
  SPEAKING_RATE_FAST_ABOVE_WPM,
  SPEAKING_RATE_MIN_WORDS,
  SPEAKING_RATE_SLOW_BELOW_WPM,
  SPEAKING_RATE_WINDOW_MS,
  TELEPROMPTER_TARGET_WPM,
  countFillers,
  countWords,
  fillerAvailability,
  speakingRate,
  type SpeechSample,
} from "./speech-feedback";

describe("countWords", () => {
  it("counts whitespace-separated words", () => {
    expect(countWords("the quick brown fox")).toBe(4);
  });

  it("ignores empty tokens from repeated whitespace", () => {
    expect(countWords("the   quick    fox")).toBe(3);
  });

  it("ignores standalone punctuation tokens", () => {
    expect(countWords("well - actually ... yes")).toBe(3);
  });

  it("returns zero for empty or whitespace-only text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("speakingRate word-boundary-adjacent setup: TELEPROMPTER_TARGET_WPM", () => {
  it("is exactly the lecture script generator's target, not a second opinion", () => {
    // Regression guard for T8: this must stay wired to
    // LECTURE_SCRIPT_WORDS_PER_MINUTE rather than a locally redefined value.
    expect(TELEPROMPTER_TARGET_WPM).toBe(140);
  });
});

function sample(text: string, atMs: number): SpeechSample {
  return { text, atMs };
}

describe("speakingRate", () => {
  it("reports insufficient-data for no utterances", () => {
    const result = speakingRate([], 10_000);
    expect(result.status).toBe("insufficient-data");
  });

  it("reports insufficient-data below the minimum word threshold", () => {
    // "one two" is 2 words, well under SPEAKING_RATE_MIN_WORDS.
    const utterances = [sample("one two", 1_000)];
    const result = speakingRate(utterances, 1_500);
    expect(result.status).toBe("insufficient-data");
    expect(SPEAKING_RATE_MIN_WORDS).toBeGreaterThan(2);
  });

  it("produces a reading once the minimum word count is met", () => {
    const words = Array.from({ length: SPEAKING_RATE_MIN_WORDS }, () => "word").join(" ");
    const utterances = [sample(words, 0)];
    const result = speakingRate(utterances, 5_000);
    expect(result.status).toBe("reading");
  });

  it("excludes an utterance just outside the rolling window", () => {
    const now = 100_000;
    const justOutside = now - SPEAKING_RATE_WINDOW_MS - 1;
    const words = Array.from({ length: 20 }, () => "word").join(" ");
    const utterances = [sample(words, justOutside)];
    const result = speakingRate(utterances, now);
    expect(result.status).toBe("insufficient-data");
  });

  it("includes an utterance just inside the rolling window", () => {
    const now = 100_000;
    const justInside = now - SPEAKING_RATE_WINDOW_MS + 1;
    const words = Array.from({ length: 20 }, () => "word").join(" ");
    const utterances = [sample(words, justInside)];
    const result = speakingRate(utterances, now);
    expect(result.status).toBe("reading");
  });

  it("includes an utterance exactly at the window boundary (inclusive)", () => {
    const now = 100_000;
    const atBoundary = now - SPEAKING_RATE_WINDOW_MS;
    const words = Array.from({ length: 20 }, () => "word").join(" ");
    const utterances = [sample(words, atBoundary)];
    const result = speakingRate(utterances, now);
    expect(result.status).toBe("reading");
  });

  it("computes on-pace when words-per-minute lands on the target", () => {
    // 47 words spoken over the full rolling window (20s = 1/3 minute) is
    // ~141 wpm - inside the +/-15% tolerance band around the 140 target, and
    // far from both the slow (119) and fast (161) boundaries. Deliberately
    // spans the whole window rather than 1 full minute, since speakingRate
    // only ever looks back SPEAKING_RATE_WINDOW_MS.
    const wordCount = 47;
    const words = Array.from({ length: wordCount }, () => "word").join(" ");
    const utterances = [sample(words, 0)];
    const result = speakingRate(utterances, SPEAKING_RATE_WINDOW_MS);
    expect(result.status).toBe("reading");
    if (result.status === "reading") {
      expect(result.wpm).toBeGreaterThan(SPEAKING_RATE_SLOW_BELOW_WPM);
      expect(result.wpm).toBeLessThan(SPEAKING_RATE_FAST_ABOVE_WPM);
      expect(result.verdict).toBe("on-pace");
    }
  });

  it("computes slow below the lower tolerance bound", () => {
    // Speak few words over a long span to drive wpm below the slow bound.
    const wordCount = SPEAKING_RATE_MIN_WORDS + 2;
    const words = Array.from({ length: wordCount }, () => "word").join(" ");
    // Spread across the full window at a wpm well under the slow threshold.
    const utterances = [sample(words, 0)];
    const result = speakingRate(utterances, SPEAKING_RATE_WINDOW_MS);
    expect(result.status).toBe("reading");
    if (result.status === "reading") {
      expect(result.wpm).toBeLessThan(SPEAKING_RATE_SLOW_BELOW_WPM);
      expect(result.verdict).toBe("slow");
    }
  });

  it("computes fast above the upper tolerance bound", () => {
    // Many words in a short span drives wpm above the fast threshold.
    const wordCount = 40;
    const words = Array.from({ length: wordCount }, () => "word").join(" ");
    const utterances = [sample(words, 0)];
    const result = speakingRate(utterances, 5_000);
    expect(result.status).toBe("reading");
    if (result.status === "reading") {
      expect(result.wpm).toBeGreaterThan(SPEAKING_RATE_FAST_ABOVE_WPM);
      expect(result.verdict).toBe("fast");
    }
  });

  it("never divides by zero when nowMs is zero or negative", () => {
    expect(() => speakingRate([sample("a b c", 0)], 0)).not.toThrow();
    expect(() => speakingRate([sample("a b c", -10)], -5)).not.toThrow();
    const result = speakingRate([sample("a b c", 0)], 0);
    expect(result.status).toBe("insufficient-data");
  });

  it("handles a non-finite nowMs defensively", () => {
    expect(() => speakingRate([sample("a b c", 0)], NaN)).not.toThrow();
    expect(speakingRate([sample("a b c", 0)], NaN).status).toBe("insufficient-data");
  });
});

describe("countFillers - word boundary correctness (the critical property)", () => {
  it("does not match 'like' inside 'unlikely'", () => {
    const result = countFillers("that seems unlikely to me");
    expect(result.byTerm.like).toBe(0);
  });

  it("does not match 'like' inside 'likewise'", () => {
    const result = countFillers("likewise, we agree");
    expect(result.byTerm.like).toBe(0);
  });

  it("does not match 'so' inside 'solution'", () => {
    const result = countFillers("here is the solution");
    expect(result.byTerm.so).toBe(0);
  });

  it("does not match 'so' inside 'somewhere'", () => {
    const result = countFillers("it is somewhere in the file");
    expect(result.byTerm.so).toBe(0);
  });

  it("matches a standalone 'like' as a real word boundary hit", () => {
    const result = countFillers("it was like a big deal");
    expect(result.byTerm.like).toBe(1);
  });

  it("matches a standalone 'so' as a real word boundary hit", () => {
    const result = countFillers("so, let's begin");
    expect(result.byTerm.so).toBe(1);
  });

  it("is case-insensitive for single-word fillers", () => {
    const result = countFillers("Um, UM, uM this is UM");
    expect(result.byTerm.um).toBe(4);
  });

  it("matches multi-word phrases across a single space", () => {
    const result = countFillers("you know, this is you know important");
    expect(result.byTerm["you know"]).toBe(2);
  });

  it("is case-insensitive for multi-word phrases", () => {
    const result = countFillers("You Know what I mean");
    expect(result.byTerm["you know"]).toBe(1);
    expect(result.byTerm["i mean"]).toBe(1);
  });

  it("does not match a multi-word phrase across a word boundary mismatch", () => {
    const result = countFillers("you knows this");
    expect(result.byTerm["you know"]).toBe(0);
  });

  it("returns a total equal to the sum of the per-term breakdown", () => {
    const text = "um, so, like, you know, basically this is kind of a test";
    const result = countFillers(text);
    const summed = Object.values(result.byTerm).reduce((a, b) => a + b, 0);
    expect(result.total).toBe(summed);
    expect(result.total).toBeGreaterThan(0);
  });

  it("returns zero total for empty text", () => {
    const result = countFillers("");
    expect(result.total).toBe(0);
  });

  it("returns zero total for text with no fillers", () => {
    const result = countFillers("the derivative of x squared is two x");
    expect(result.total).toBe(0);
  });

  it("keeps high-confidence and discourse-marker fillers as disjoint, exhaustive lists", () => {
    const highSet = new Set(HIGH_CONFIDENCE_FILLERS);
    const markerSet = new Set(DISCOURSE_MARKER_FILLERS);
    for (const term of highSet) {
      expect(markerSet.has(term)).toBe(false);
    }
    expect(ALL_FILLER_TERMS.length).toBe(HIGH_CONFIDENCE_FILLERS.length + DISCOURSE_MARKER_FILLERS.length);
  });
});

describe("fillerAvailability", () => {
  it("distinguishes zero fillers detected from detection being unsupported", () => {
    const unsupported = fillerAvailability("um so like whatever", false);
    const supportedZero = fillerAvailability("the derivative of x squared", true);

    expect(unsupported.available).toBe(false);
    expect(supportedZero.available).toBe(true);
    if (supportedZero.available) {
      expect(supportedZero.counts.total).toBe(0);
    }
  });

  it("carries a reason string when unsupported", () => {
    const unsupported = fillerAvailability("anything", false);
    expect(unsupported.available).toBe(false);
    if (!unsupported.available) {
      expect(typeof unsupported.reason).toBe("string");
      expect(unsupported.reason.length).toBeGreaterThan(0);
    }
  });

  it("reports actual counts when supported and fillers are present", () => {
    const result = fillerAvailability("um, this is like a test", true);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.counts.total).toBeGreaterThan(0);
    }
  });
});
