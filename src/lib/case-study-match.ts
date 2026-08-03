/**
 * Z1 (Group Z): the generic "best matching curated case-study entry" scorer,
 * shared by the APPLIED case-study library (src/lib/case-study-library.ts,
 * APPLIED_CASE_STUDIES) and the CODING case-study bank
 * (src/lib/research/case-studies.ts, CASE_STUDIES) - same mechanism, same
 * guarantees (whole-word topic matching, one anchor case per week, an
 * excludable id so a curated entry is never claimed by two different weeks)
 * for both course kinds, rather than two independently-written matchers that
 * could quietly drift apart.
 *
 * DOMAIN-FIT NOTE (the "off-domain case study" fix): this function - and
 * every caller of it - only ever sees a single week's own topic + summary
 * text. Nothing about the COURSE reaches it: not its kind, name, code,
 * description, or textbook. matchCaseStudyLibraryEntry's caller
 * (planCourseCaseStudies, src/app/actions/case-study-plan.ts) does receive a
 * courseDescription string, but only forwards it to the LLM fallback prompt
 * used for weeks THIS matcher could not confidently assign - never into this
 * deterministic scorer. So this function cannot know, and must never assume,
 * anything about what field a course is actually in - the only lever it has
 * is deciding how much evidence a single week's text must show before it is
 * willing to assert a specific, factual, named historical case for that
 * week at all. See requireDistinctiveMatch below.
 *
 * Pure: no I/O, no Date, no randomness.
 */

export interface TopicTaggedEntry {
  id: string;
  /** Keyword/topic tags used for matching against a week's topic + summary. */
  topics: string[];
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase();
}

function wholeWordMatch(term: string, normalizedText: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(normalizedText);
}

/**
 * A tag of more than one word (e.g. "vendor management", "safety culture")
 * only registers a whole-word match when that EXACT phrase appears
 * adjacent, in order, in the week's text - wholeWordMatch escapes the tag as
 * one unit, it never matches the words separately. A phrase match is
 * therefore harder to hit BY ACCIDENT than any one of its component words
 * would be alone, so it counts for more than a single-word match (see
 * PHRASE_WEIGHT) - but, contrary to this codebase's first attempt at this
 * function (see the regression writeup this file's git history and
 * case-study-library.test.ts point to), it is NOT treated as automatically
 * sufficient by itself. See QUALIFY_FLOOR for why: this library's phrase
 * tags ("quality assurance", "vendor management", "risk management",
 * "integration testing", "iterative delivery", ...) are ordinary
 * project-management vocabulary, not case-specific jargon, and every one of
 * them appears somewhere in another curated entry's OWN prose - so a single
 * phrase hit and nothing else is exactly as coincidental as a single
 * single-word hit, just rarer. A lone single-word tag ("risk", "web",
 * "communication", "requirements", ...) is ordinary English vocabulary that
 * any technical week's text can contain regardless of subject, so on its
 * own it is weaker still.
 */
function isPhraseTag(tag: string): boolean {
  return tag.trim().split(/\s+/).length > 1;
}

/**
 * Points awarded per matched tag when scoring how much EVIDENCE the winning
 * candidate's matched tags represent (see qualifyingEvidenceScore). A phrase
 * match is worth 3x a single-word match: hard enough to hit by accident that
 * it should dominate a handful of incidental single-word overlaps, but - see
 * QUALIFY_FLOOR - never enough **on its own** to clear the bar, because this
 * library's phrase tags are not reliably case-specific (see isPhraseTag).
 */
const PHRASE_WEIGHT = 3;

/**
 * The minimum evidence score (see qualifyingEvidenceScore) the WINNING
 * candidate must reach to be returned at all - used only when the caller
 * opts into requireDistinctiveMatch (see matchBestByTopics). Below this, the
 * match is judged too coincidental to assert a specific, factual, named case
 * study for a week, and matchBestByTopics returns null instead.
 *
 * Calibrated directly off real, adversarial inputs rather than picked in the
 * abstract - and recalibrated once already (from 4 to 5; see the "why not 4"
 * note below for exactly what broke at 4). 5 is the smallest floor that
 * rejects every reproduced false positive while still admitting every case a
 * week can legitimately earn. Concretely (see case-study-library.test.ts for
 * the full data-driven checks this anchors):
 *   - Every one of the eight off-domain inputs this floor is regression-
 *     tested against - each built from a REALISTIC, non-empty week summary,
 *     not a degenerate empty one (see the "why not an empty summary" note on
 *     the off-domain describe block in case-study-library.test.ts) - tops
 *     out at an evidence score of 4: either two incidental single-word tags
 *     (1+1), one word plus one phrase that individually can't clear 5 (e.g.
 *     "quality assurance" alone is 3), or - the adversarial case built to
 *     stress-test this exact floor - TWO different generic phrase tags
 *     coincidentally both present at once ("risk management" + "quality
 *     assurance", 3+3=6, the highest of the eight - see below for why that
 *     candidate's "risk management" tag was subsequently retuned away).
 *     None of the eight reaches 5.
 *   - Every one of the 12 curated APPLIED_CASE_STUDIES entries, fed its own
 *     organization + summary + lesson text, scores at least 5 EXCEPT
 *     citytime (which scores 1 - its own write-up only reuses one of its own
 *     tag words, "fraud" - see the module comment on citytime's topics in
 *     case-study-library.ts). That is the one miss the self-match acceptance
 *     criterion (>= 11 of 12) budgets for; a floor low enough to also catch
 *     citytime would have to drop to 1, which would readmit every off-domain
 *     false positive above.
 *
 * WHY NOT 4 (the previous value): raising the floor alone was not enough -
 * a regression gate proved 4 insufficient against REALISTIC (non-empty,
 * ordinarily-worded) week summaries once the degenerate empty-summary tests
 * that used to pass at 4 were replaced with them. Concretely, at floor 4:
 * healthcare-gov coincidentally hit 5 on a "Web Application Security" week
 * merely mentioning "launch" and "quality assurance" (two ordinary words,
 * neither specific to Healthcare.gov); deepwater-horizon coincidentally hit
 * 6 on a cybersecurity week's "risk management" + "quality assurance" (two
 * generic phrase tags, neither specific to an oil-rig disaster);
 * fbi-sentinel hit 4 on a plain "the team writes software in sprints"
 * sentence via its "software" tag (a word every FBI case in this library
 * shares); and denver/london both hit 4 on "unit testing" via their shared
 * "testing" + "quality assurance" tags. Raising the floor to 5 rejects all
 * of these outright. But 5 alone would ALSO have dropped 7 of the 12
 * curated entries' own self-match below the floor (healthcare-gov,
 * big-dig, berlin-brandenburg, fbi-sentinel, boeing-787, challenger, and
 * deepwater-horizon each self-matched at exactly the old floor of 4, no
 * higher) - so each of those 7 entries also gained ONE new tag, in every
 * case a specific multi-word phrase drawn verbatim from that entry's OWN
 * summary/lesson text (e.g. "single owner" for healthcare-gov, "warning
 * signs" for deepwater-horizon, "prime contractor" for boeing-787) - never
 * an invented tag chosen merely to inflate a score (see the citytime module
 * comment in case-study-library.ts for why that specific shortcut is
 * rejected on principle here). Two entries' tag lists also lost words that
 * were pure false-positive fuel and did nothing for that entry's own
 * self-match anyway: healthcare-gov's "web" (never appears in Healthcare.gov's
 * own write-up) and fbi-sentinel's "software" (never appears in Sentinel's
 * own write-up - only fbi-vcf's does).
 *
 * REJECTED ALTERNATIVE: a floor expressed as a fraction of the candidate's
 * total tag count (a "coverage ratio") rather than an absolute score. This
 * was tried first and discarded: it punishes entries that carry more tags
 * for no reason connected to evidence quality (an entry with 10 tags needs
 * proportionally more matches than one with 6 to clear the same ratio, even
 * when the raw evidence - e.g. one strong phrase hit - is identical), and it
 * does not actually separate the false positives from the genuine
 * self-matches any better than the flat score does; the two off-domain
 * cases built from a real curated entry's own generic phrase tag land at
 * the SAME 0.09-0.17 coverage ratio as several genuine self-matches. The
 * absolute evidence score, not a ratio, is what tracks the real signal here.
 */
export const QUALIFY_FLOOR = 5;

/**
 * How much matching evidence a set of already-matched tags represents -
 * PHRASE_WEIGHT points per phrase tag, 1 point per single-word tag. This is
 * rankingScore's value under requireDistinctiveMatch (see matchBestByTopics)
 * - the SAME number used to both rank every candidate against every other
 * candidate AND gate the winner against QUALIFY_FLOOR, which is the whole
 * point: a phrase hit outranks an equally-sized single-word-only match
 * during ranking for exactly the same reason it counts for more when the
 * gate checks it afterward - it is the same arithmetic read twice, not two
 * different rules that happen to agree.
 */
function qualifyingEvidenceScore(matchedTopics: readonly string[]): number {
  const phraseCount = matchedTopics.filter(isPhraseTag).length;
  const wordCount = matchedTopics.length - phraseCount;
  return phraseCount * PHRASE_WEIGHT + wordCount;
}

/**
 * The best-matching entry for a week's topic + summary, or null when nothing
 * matches (every candidate is excluded, or - with requireDistinctiveMatch -
 * the single best candidate's evidence is too weak to trust). `exclude`
 * holds entry ids already claimed by another week in this same run, so the
 * same curated case is never assigned to two different weeks.
 *
 * ONE METRIC, END TO END. Every candidate is scored ONCE per call, by
 * rankingScore (below); the single top scorer by THAT SAME NUMBER is picked
 * (ties broken as described below); and, if requireDistinctiveMatch is set,
 * THAT SAME NUMBER - not a second, differently-computed one - is what gets
 * checked against QUALIFY_FLOOR. If it fails, this returns null outright -
 * it never falls back to the next-best candidate, because a candidate that
 * scored lower than the (rejected) winner is, by definition, even less
 * trustworthy evidence, not more.
 *
 *   function rankingScore(matchedTopics): requireDistinctiveMatch
 *     ? qualifyingEvidenceScore(matchedTopics)   // phrase-weighted evidence
 *     : matchedTopics.length;                    // raw tag-match count
 *
 * THIS IS THE FIX for a real, reproduced defect: ranking and gating used to
 * run on two DIFFERENT measures - ranking used the raw matched-tag COUNT,
 * while gating checked the phrase-weighted qualifyingEvidenceScore of
 * whichever candidate the count-based ranking happened to pick. Those two
 * measures do not always agree on which candidate is "best", and when they
 * disagreed, ranking (which the gate never got to see or correct) had
 * already locked in the wrong winner. Reproduced on the real curated
 * library: for a cybersecurity week built from real matched vocabulary,
 * denver-baggage (raw count 2, evidence 4) outranked deepwater-horizon (raw
 * count also 2, evidence 6, but declared LATER in the array) purely because
 * the count-based ranking step had no way to see that deepwater-horizon's
 * two matched tags were both phrases and denver-baggage's were not - that
 * distinction only existed inside qualifyingEvidenceScore, which ranking
 * never called. Making ranking and gating consume the exact same computed
 * number removes the possibility of disagreement structurally, not just in
 * the cases this file happens to test: there is only ever one score per
 * candidate anywhere in this function, so there is nothing left for a
 * "ranking metric" and a "gating metric" to disagree ABOUT.
 *
 * (This is the second fix in this function's history, and a different bug
 * from the first. The FIRST fix, still true and still enforced by the
 * ordering below, was that the old code ran its distinctiveness check as a
 * PRE-FILTER over every candidate before ranking - which could eliminate
 * the correct, higher-scoring entry while a lower-scoring, coincidentally-
 * matching entry survived the filter and won by default. Scoring every
 * candidate first, picking the single winner, and gating ONLY that winner
 * (never falling back to a runner-up) closed that hole. It did not,
 * on its own, close THIS one - a pre-filter bug and a ranking/gating-
 * disagreement bug are independent defects that both happen to look like
 * "the wrong entry won"; fixing the order of two steps does not fix what
 * number each step reads.)
 *
 * Tiebreak (deterministic - same input always yields the same output):
 *   1. Higher rankingScore wins (see above - this is raw count under the
 *      default path, and phrase-weighted evidence under
 *      requireDistinctiveMatch; either way, whatever the gate later checks
 *      is exactly what already won this step).
 *   2. Still tied, AND requireDistinctiveMatch is set: higher raw
 *      matched-tag COUNT wins. This only matters under
 *      requireDistinctiveMatch, because only there can two candidates share
 *      a rankingScore while differing in raw count at all (e.g. four
 *      single-word tags = evidence 4 at raw count 4, vs one phrase plus one
 *      word = evidence 4 at raw count 2 - same evidence, but the first
 *      candidate has twice as many independent tags corroborating it, which
 *      this tiebreak treats as the stronger case). Under the default path
 *      rankingScore already IS the raw count, so a rankingScore tie is
 *      already a raw-count tie and this step can never change anything -
 *      it falls straight through to step 3, exactly like before this fix.
 *   3. Still tied: the library's own declared order wins (earlier entries
 *      win) - a plain, total, order-of-declaration tiebreak with no
 *      remaining ambiguity.
 *
 * requireDistinctiveMatch (default false, so every pre-existing caller,
 * including matchCodingCaseStudyEntry's default path over CASE_STUDIES, is
 * completely unaffected): when true, the winner - and only the winner - must
 * clear QUALIFY_FLOOR to be returned. This exists because a library that
 * pools case studies from many UNRELATED industries under one shared
 * vocabulary of generic project-management/engineering words (risk,
 * schedule, testing, requirements, quality assurance, communication,
 * government, ...) lets a week from any technical field coincidentally
 * "match" an entry from a completely different field, on nothing but
 * ordinary shared English vocabulary - see matchCaseStudyLibraryEntry
 * (src/lib/case-study-library.ts) for the concrete defect this fixes (a
 * real course had a space-shuttle disaster, a Mars probe, a federal
 * healthcare website, and an airport baggage system - none of them software
 * or security cases - matched into a cybersecurity course this way).
 * CASE_STUDIES (src/lib/research/case-studies.ts) does not opt in: it is
 * already one coherent software-engineering domain, not a cross-industry
 * pool, so the extra caution is unneeded there and this parameter defaults
 * to off, which also means the default path's rankingScore stays the plain
 * raw count it always was - matchCodingCaseStudyEntry's behavior is
 * byte-for-byte unaffected by any of the above, because none of it runs
 * unless a caller opts in.
 *
 * REJECTED ALTERNATIVE: weighting each tag by inverse document frequency
 * (rarer-in-the-library tags count for more) looks appealing but makes this
 * exact defect WORSE, not better. Tags like "interfaces", "units", and
 * "handoff" each appear on exactly one curated entry, so IDF gives them the
 * maximum possible weight - yet they are common English words with no real
 * tie to that entry's specific story. In-library rarity is not the same
 * thing as domain relevance, especially in a library this small; a single
 * evidence score, ranked and gated identically, avoids relying on that
 * false signal entirely.
 */
function rankingScore(matchedTopics: readonly string[], requireDistinctiveMatch: boolean): number {
  return requireDistinctiveMatch ? qualifyingEvidenceScore(matchedTopics) : matchedTopics.length;
}

export function matchBestByTopics<T extends TopicTaggedEntry>(
  library: readonly T[],
  topic: string,
  summary: string,
  exclude: ReadonlySet<string> = new Set(),
  requireDistinctiveMatch: boolean = false
): T | null {
  const text = normalizeForMatch(`${topic} ${summary}`);
  if (!text.trim()) return null;

  let best: { entry: T; rankScore: number; rawCount: number } | null = null;
  for (const entry of library) {
    if (exclude.has(entry.id)) continue;
    const matchedTopics = entry.topics.filter((tag) => wholeWordMatch(tag, text));
    if (matchedTopics.length === 0) continue;
    const rawCount = matchedTopics.length;
    const rankScore = rankingScore(matchedTopics, requireDistinctiveMatch);
    const winsTiebreak =
      !!best && rankScore === best.rankScore && rawCount > best.rawCount;
    if (!best || rankScore > best.rankScore || winsTiebreak) {
      best = { entry, rankScore, rawCount };
    }
  }
  if (!best) return null;
  // Gate the SAME number that just won the ranking step above - see the
  // "ONE METRIC, END TO END" note on this function for why a second,
  // differently-computed number is never consulted here.
  if (requireDistinctiveMatch && best.rankScore < QUALIFY_FLOOR) {
    return null;
  }
  return best.entry;
}
