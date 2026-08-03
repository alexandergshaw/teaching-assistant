import { describe, it, expect } from "vitest";
import { matchBestByTopics, QUALIFY_FLOOR, type TopicTaggedEntry } from "./case-study-match";

interface TestEntry extends TopicTaggedEntry {
  name: string;
}

const LIBRARY: TestEntry[] = [
  { id: "a", name: "Entry A", topics: ["loops", "iteration"] },
  { id: "b", name: "Entry B", topics: ["loops", "iteration", "recursion"] },
  { id: "c", name: "Entry C", topics: ["security", "encryption"] },
];

describe("matchBestByTopics", () => {
  it("returns null for blank topic/summary", () => {
    expect(matchBestByTopics(LIBRARY, "", "")).toBeNull();
    expect(matchBestByTopics(LIBRARY, "   ", "  ")).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(matchBestByTopics(LIBRARY, "Completely unrelated subject", "")).toBeNull();
  });

  it("picks the entry with the highest tag-match score", () => {
    // "loops" and "iteration" both match A and B, but "recursion" only
    // matches B - B should win with 3 matched tags vs A's 2.
    const result = matchBestByTopics(LIBRARY, "Loops, Iteration, and Recursion", "");
    expect(result?.id).toBe("b");
  });

  it("matches whole words only, not substrings", () => {
    // "loopy" contains "loop" as a substring but not as a whole word match
    // for the tag "loops" - a text-processing edge case this library exists
    // to avoid (e.g. "risk" must not match inside "risky").
    const result = matchBestByTopics(LIBRARY, "loopy subject with no real match", "");
    expect(result).toBeNull();
  });

  it("excludes ids already claimed by another week", () => {
    const result = matchBestByTopics(LIBRARY, "Loops, Iteration, and Recursion", "", new Set(["b"]));
    expect(result?.id).toBe("a");
  });

  it("ties keep the library's own declared order (earlier entries win)", () => {
    const tiedLibrary: TestEntry[] = [
      { id: "first", name: "First", topics: ["security"] },
      { id: "second", name: "Second", topics: ["security"] },
    ];
    const result = matchBestByTopics(tiedLibrary, "Security topic", "");
    expect(result?.id).toBe("first");
  });

  it("returns null when every matching candidate is excluded", () => {
    const result = matchBestByTopics(LIBRARY, "Security and encryption week", "", new Set(["c"]));
    expect(result).toBeNull();
  });

  it("matches against combined topic + summary text", () => {
    const result = matchBestByTopics(LIBRARY, "Week 3", "This week covers encryption in depth.");
    expect(result?.id).toBe("c");
  });
});

// The "off-domain case study" fix: requireDistinctiveMatch (5th param,
// default false so every test above - and every pre-existing caller -
// behaves exactly as before) rejects a candidate whose only evidence is a
// small number of single-word tag coincidences, instead of accepting any
// positive score. See case-study-match.ts's own doc comment on
// matchBestByTopics for the full mechanism and why (a library that pools
// unrelated industries under one shared generic vocabulary lets a week from
// any field coincidentally "match" an entry from a totally different one).
//
// HISTORY, kept as ONE consistent account rather than split across two
// comments that used to contradict each other: this describe block was
// originally written against the FIRST version of requireDistinctiveMatch,
// whose qualification rule (hasDistinctiveEvidence) was a pre-filter that
// treated (a) any single matched phrase tag, and (b) near-total coverage of
// a small entry's own single-word tag list, as automatically sufficient
// evidence on their own. A regression gate proved premise (a) false against
// the real curated library (see case-study-library.ts and its test file's
// data-driven self-match suite): generic phrase tags like "quality
// assurance" or "risk management" show up coincidentally in unrelated prose
// just as easily as single words do, so a lone phrase hit is no longer, by
// itself, enough (see QUALIFY_FLOOR). Three of this block's original
// assertions encoded that now-disproven premise - "one matched phrase tag is
// self-sufficient evidence even with no other matches", and the
// "allThree"/"fourOfSix" halves of two coverage-cap tests pinning the old
// MIN_DISTINCTIVE_WEAK_MATCHES cap-relative-to-entry-size formula that
// QUALIFY_FLOOR replaces outright - and were DELETED, not loosened and not
// left red, because a describe block asserting a disproven premise is not a
// meaningful regression test even while "passing" as an expected failure;
// keeping the reasoning here (rather than only in git history) is what
// prevents them from being reinstated by accident. The corrected,
// data-justified behavior is covered by the "one metric, end to end" and
// "evidence, not raw count" describe blocks below, and by
// case-study-library.test.ts's data-driven self-match suite, which loops the
// real APPLIED_CASE_STUDIES array rather than a hand-built fixture.
describe("matchBestByTopics with requireDistinctiveMatch", () => {
  interface DistinctEntry extends TopicTaggedEntry {
    name: string;
  }

  // Deliberately DISJOINT vocabularies per entry (no word reused across
  // entries) so each test below isolates exactly one entry's behavior, with
  // no risk of a second entry accidentally also matching and confusing the
  // result. "p" has a two-word phrase tag ("north south") plus an unrelated
  // single-word tag; "w3" is a single-word-tag-only entry.
  const LIB: DistinctEntry[] = [
    { id: "p", name: "Phrase entry", topics: ["omega", "north south"] },
    { id: "w3", name: "Small weak-only entry", topics: ["alpha", "beta", "gamma"] },
  ];

  it("without the flag (default), a single incidental single-word tag is still enough to win - unchanged prior behavior", () => {
    const result = matchBestByTopics(LIB, "alpha only, nothing else", "");
    // Only w3 has an "alpha" tag at all; a single matched tag is still
    // enough to win when the flag is off, exactly like every pre-existing
    // test above.
    expect(result?.id).toBe("w3");
  });

  it("with the flag, a lone single-word tag match is rejected as too weak - returns null rather than a coincidental pick", () => {
    // w3's "alpha" tag matches (evidence 1, one single-word tag) - nowhere
    // near QUALIFY_FLOOR. Nothing else in the text matches anything at all,
    // so the whole call must degrade to null - not throw, and not fall back
    // to the one weak positive-scoring candidate.
    const result = matchBestByTopics(LIB, "alpha only, nothing else", "", new Set(), true);
    expect(result).toBeNull();
  });

  it("with the flag, exclusion still composes correctly - an excluded entry is never returned regardless of how strong its evidence is", () => {
    const result = matchBestByTopics(LIB, "North South rollout", "", new Set(["p"]), true);
    // Nothing else in this disjoint-vocabulary library matches "North South
    // rollout" at all once "p" itself is excluded, so this correctly falls
    // through to null rather than returning a weak leftover match - and
    // never returns the excluded entry either way.
    expect(result).toBeNull();
  });
});

// FIX 1 ("score first, gate second"): hasDistinctiveEvidence used to run as
// a PRE-FILTER over every candidate BEFORE ranking, so it could only ever
// REMOVE candidates from contention - which meant a correct, higher-scoring
// candidate could be eliminated by the filter while a lower-scoring,
// coincidentally-matching WRONG candidate survived and won by default.
// Scoring every candidate first, picking the single winner, and gating ONLY
// that winner (never falling back to a runner-up) closes this off
// structurally: a candidate that scores lower than the winner can never end
// up chosen over it, because the gate never gets a chance to remove the
// winner from contention first.
//
// This library is intentionally sized RELATIVE TO QUALIFY_FLOOR (via the
// imported constant, not a hardcoded copy of its current value) so these
// tests stay correct evidence-wise even if the floor is recalibrated again.
describe("matchBestByTopics: score first, gate second (the pre-filter-inversion fix)", () => {
  interface DistinctEntry extends TopicTaggedEntry {
    name: string;
  }

  // "correct" carries QUALIFY_FLOOR plain single-word tags - a genuine, if
  // unglamorous, word-only match that exactly clears the floor when every
  // one of its tags hits. "coincidence" has just ONE tag, a phrase, that
  // also happens to appear in the same text (its "alpha beta" sits inside
  // correct's own word list) - the exact shape of the real defect (a
  // week's own text scoring well on its own single-word tags but also
  // incidentally containing another entry's one phrase tag).
  const WORDS = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
  const correctWords = WORDS.slice(0, QUALIFY_FLOOR);
  const LIB: DistinctEntry[] = [
    { id: "correct", name: "Word-only entry sized to QUALIFY_FLOOR", topics: correctWords },
    { id: "coincidence", name: "Single-phrase entry", topics: ["alpha beta"] },
  ];

  it("a full word-only match that clears QUALIFY_FLOOR beats a lower-evidence lone-phrase match", () => {
    // correct matches all QUALIFY_FLOOR of its tags (evidence QUALIFY_FLOOR,
    // clears the floor exactly). coincidence matches its one phrase
    // (evidence 3, PHRASE_WEIGHT). correct's evidence is higher, so it wins
    // the ranking step outright - and it also clears the gate.
    const result = matchBestByTopics(LIB, correctWords.join(" "), "", new Set(), true);
    expect(result?.id).toBe("correct");
  });

  it("never falls back to a lower-evidence candidate when the winner - whichever candidate that is - fails the gate", () => {
    // Drop the last word so "correct" only matches QUALIFY_FLOOR - 1 tags
    // (evidence QUALIFY_FLOOR - 1, one short of the floor); "coincidence"
    // still matches its one phrase (evidence 3). correct's evidence is
    // still higher than coincidence's (QUALIFY_FLOOR - 1, at QUALIFY_FLOOR
    // = 5, is 4 > 3), so correct is still the winner the gate evaluates -
    // and it fails that gate. The whole call must degrade to null, never
    // fall back to coincidence merely because coincidence also scored above
    // zero.
    const partialWords = correctWords.slice(0, correctWords.length - 1);
    const result = matchBestByTopics(LIB, `${partialWords.join(" ")} rollout`, "", new Set(), true);
    expect(result).toBeNull();
  });

  it("is deterministic - repeated calls with the same input agree", () => {
    const calls = Array.from({ length: 5 }, () => matchBestByTopics(LIB, correctWords.join(" "), "", new Set(), true)?.id);
    expect(new Set(calls).size).toBe(1);
    expect(calls[0]).toBe("correct");
  });

  it("a lone phrase-tag match is rejected purely on its own weak evidence, isolated from any stronger rival", () => {
    // Exclude "correct" so nothing outscores "coincidence" - it is the
    // unique top scorer (the only remaining candidate that matches at all)
    // - and confirm the gate still rejects it on its own evidence (3, one
    // phrase, nothing else - below QUALIFY_FLOOR).
    const result = matchBestByTopics(LIB, "alpha beta, nothing else relevant", "", new Set(["correct"]), true);
    expect(result).toBeNull();
  });
});

// FIX 2 ("one metric, end to end") - a SECOND, independent regression, a
// different bug from FIX 1 above, caught later by a regression gate against
// the real library. Even after FIX 1, ranking still used the raw
// matched-tag COUNT while gating used the phrase-weighted
// qualifyingEvidenceScore of whichever candidate that count-based ranking
// happened to pick. Those two measures do not always agree on which
// candidate is "best" - and disagreeing let a worse-evidenced candidate
// outrank a better-evidenced one again: the same CLASS of defect as FIX 1,
// merely relocated from the pre-filter into the ranking/gate mismatch
// instead of being eliminated.
//
// Reproduced on the real curated library (case-study-library.ts): a
// cybersecurity week's text scored denver-baggage at raw count 2 (evidence
// 4) and deepwater-horizon at raw count ALSO 2 (evidence 6, from two
// matched phrase tags) - a genuine raw-count TIE the old
// declared-order-unless-only-the-incumbent-lacks-a-phrase tiebreak could
// not resolve correctly once BOTH candidates had at least one phrase tag -
// and declaration order picked denver-baggage, the worse-evidenced one, in
// both the real library and the reproduction below.
//
// Making ranking and gating consume the exact same number
// (qualifyingEvidenceScore under requireDistinctiveMatch, see rankingScore
// in case-study-match.ts) removes the possibility of disagreement
// structurally, not just in the specific cases tested here: there is only
// ever one score computed per candidate anywhere in matchBestByTopics, so
// there is nothing left for a "ranking metric" and a "gating metric" to
// disagree about.
describe("matchBestByTopics: evidence, not raw count, decides the winner (AC4)", () => {
  interface DistinctEntry extends TopicTaggedEntry {
    name: string;
  }

  it("a candidate with a LOWER raw match count but HIGHER evidence wins over one with a higher raw count", () => {
    // "more-but-weaker" matches 5 tags, all single words (evidence 5).
    // "fewer-but-stronger" matches only 2 tags, both phrases (evidence
    // 2 * PHRASE_WEIGHT = 6). Under raw-count ranking, "more-but-weaker"
    // would have won outright (5 matched tags beats 2) despite carrying
    // LESS total evidence - exactly backwards. Evidence-based ranking picks
    // "fewer-but-stronger" instead, and its evidence (6) clears the gate.
    const LIB: DistinctEntry[] = [
      { id: "more-but-weaker", name: "More matches, less evidence", topics: ["epsilon", "zeta", "eta", "theta", "iota"] },
      { id: "fewer-but-stronger", name: "Fewer matches, more evidence", topics: ["alpha beta", "gamma delta"] },
    ];
    const text = "alpha beta gamma delta epsilon zeta eta theta iota rollout";
    const result = matchBestByTopics(LIB, text, "", new Set(), true);
    expect(result?.id).toBe("fewer-but-stronger");
  });

  it("a higher-evidence candidate is never suppressed by one tied on raw count but carrying less evidence (the real denver/deepwater reproduction, in miniature)", () => {
    // Both candidates match exactly 2 tags each - a genuine raw-count TIE,
    // the shape the old code's ranking-by-raw-count step could not tell
    // apart. "weaker-tied" is 1 word + 1 phrase = evidence 4;
    // "stronger-tied" is 2 phrases = evidence 6. Declaring "weaker-tied"
    // FIRST proves the win is not an accident of declaration order: under
    // the OLD code (rank by raw count, gate the resulting winner by
    // evidence) this exact raw-count tie fell to the phrase tiebreak, which
    // only fires when the INCUMBENT has no phrase tag at all - "weaker-tied"
    // already has one, so the tiebreak never engaged, declaration order
    // decided, and the WORSE-evidenced candidate won. Under the current
    // code there is no tie to break in the first place: ranking reads
    // evidence directly (4 vs 6), so "stronger-tied" simply outranks
    // "weaker-tied" on the primary criterion.
    const LIB: DistinctEntry[] = [
      { id: "weaker-tied", name: "Declared first, less evidence", topics: ["alpha", "beta gamma"] },
      { id: "stronger-tied", name: "Declared second, more evidence", topics: ["delta epsilon", "zeta eta"] },
    ];
    const text = "alpha beta gamma delta epsilon zeta eta rollout";
    const result = matchBestByTopics(LIB, text, "", new Set(), true);
    expect(result?.id).toBe("stronger-tied");
  });
});

// The one tiebreak that remains genuinely necessary: when two candidates end
// up with the EXACT SAME evidence score (not just the same raw count), the
// one backed by MORE independent matched tags wins - more corroborating
// evidence, at an equal weighted total, is the stronger case. This can only
// ever engage under requireDistinctiveMatch: off that path, rankingScore IS
// the raw count, so an evidence tie and a raw-count tie are the same tie,
// and this step can never change the outcome there (see the second test
// below, which proves exactly that on a fixture built the same way).
describe("matchBestByTopics: raw-count tiebreak on a genuine evidence tie, and its absence on the default path", () => {
  interface DistinctEntry extends TopicTaggedEntry {
    name: string;
  }

  it("with the flag, an evidence tie is broken by raw match count - more corroborating tags wins, even when declared second", () => {
    // "one-phrase-plus-two-words" (declared first): one phrase (3) + two
    // words (1 + 1) = evidence 5, raw count 3. "five-plain-words" (declared
    // second): five single-word tags, all matched = evidence 5, raw count
    // 5. Evidence TIES at 5; raw count does not (3 vs 5) - "five-plain-words"
    // should win despite being declared second.
    const tieLib: DistinctEntry[] = [
      { id: "one-phrase-plus-two-words", name: "Declared first, evidence 5 via 1 phrase + 2 words", topics: ["p q", "r", "s"] },
      { id: "five-plain-words", name: "Declared second, evidence 5 via 5 words", topics: ["a", "b", "c", "d", "e"] },
    ];
    const result = matchBestByTopics(tieLib, "p q r s a b c d e rollout", "", new Set(), true);
    expect(result?.id).toBe("five-plain-words");
  });

  it("without the flag, the same shape of fixture keeps plain declared-order tiebreak - rankingScore IS the raw count here, so there is no separate evidence tie to break", () => {
    // "word-only" (declared first, evidence 3, raw 3) and
    // "phrase-plus-two-words" (declared second, evidence 5, raw 3) tie on
    // RAW COUNT (3 = 3) regardless of the flag - raw count does not depend
    // on requireDistinctiveMatch. With the flag ON, ranking reads evidence
    // (3 vs 5) and "phrase-plus-two-words" wins outright, no tie at all
    // (verified first, for contrast). With the flag OFF, ranking reads raw
    // count (3 vs 3, genuinely tied) and falls through to plain declared
    // order, so "word-only" (declared first) wins instead - proving the
    // flag, not luck, is what changes the outcome on identical data.
    const tieLib: DistinctEntry[] = [
      { id: "word-only", name: "Word-only, declared first", topics: ["kappa", "lambda", "mu"] },
      { id: "phrase-plus-two-words", name: "Phrase-plus-two-words, declared second", topics: ["nu xi", "omicron", "pi"] },
    ];
    const text = "kappa lambda mu nu xi omicron pi rollout";

    const withFlag = matchBestByTopics(tieLib, text, "", new Set(), true);
    expect(withFlag?.id).toBe("phrase-plus-two-words");

    const withoutFlag = matchBestByTopics(tieLib, text, "", new Set(), false);
    expect(withoutFlag?.id).toBe("word-only");
  });
});
