/**
 * Heuristic detection of a real-world Case Study subject reused across
 * different weeks of the same course - see the MGT 422 audit ("W7's opening
 * Case Study reuses W1's In Practice case (2012 London Olympics)") and
 * P2-AC8. Pure text-processing only: no LLM call, no I/O, no Date, no
 * Math.random.
 *
 * Two jobs share this module:
 * 1. generateSlidesFromTopic (src/app/actions/course-planning-grounding.ts)
 *    calls caseStudyDescriptor after each week's deck is generated, to grow
 *    the "CASE STUDIES ALREADY USED IN THIS COURSE" prompt-exclusion list
 *    handed to every LATER week's generation call.
 * 2. The lecture-materials-from-schedule step
 *    (src/lib/workflows/registry/steps.content-lectures.ts) calls
 *    detectReusedCaseStudies once, after every week's deck for a run has
 *    been generated, to report - not silently ship - any organization that
 *    ended up on two different weeks' Case Study slides anyway. This can
 *    still happen even with the prompt-time exclusion list: weeks generate
 *    with up to 4 running concurrently (mapWithConcurrency), so a given
 *    week's prompt only ever sees what completed strictly BEFORE it
 *    started, not every other week in the run.
 *
 * extractOrganizationCandidates is deliberately a heuristic (runs of
 * capitalized words), not real named-entity recognition - it exists only to
 * flag a LIKELY collision for a human to confirm, never to silently drop or
 * block a slide.
 */

interface MinimalCaseStudySlide {
  title: string;
  bullets: string[];
}

const CASE_STUDY_PREFIX = /^Case Study:\s*/i;

/** The opening Case Study slide of a deck, or undefined when it has none. */
export function findCaseStudySlide<T extends MinimalCaseStudySlide>(slides: T[]): T | undefined {
  return slides.find((s) => CASE_STUDY_PREFIX.test(s.title));
}

/**
 * A short, human-readable descriptor for a deck's Case Study slide - the
 * title with its "Case Study:" prefix stripped, or (when that leaves
 * nothing usable) the first bullet. Used as the prompt-exclusion list
 * entry: this is what a later week's prompt is told NOT to reuse.
 */
export function caseStudyDescriptor(slide: MinimalCaseStudySlide): string {
  const stripped = slide.title.replace(CASE_STUDY_PREFIX, "").trim();
  if (stripped) return stripped;
  return slide.bullets[0]?.trim() || "an unnamed case study";
}

// Generic capitalized words that are never themselves the organization or
// event a case study names - filtered out of candidate phrases below so
// ordinary sentence-initial capitalization is not flagged as a false-
// positive "reused organization".
const GENERIC_CAPITALIZED_WORDS = new Set([
  "the", "a", "an", "this", "that", "these", "those", "in", "on", "at", "of",
  "for", "and", "or", "but", "with", "when", "case", "study", "practice",
  "before", "after", "during", "its", "it", "as", "by", "to", "from", "was",
  "is", "are", "were", "how", "why", "what",
]);

// Matches a run of up to 4 consecutive capitalized words that are
// whitespace-adjacent IN THE ORIGINAL TEXT (never words merely capitalized
// somewhere in the same sentence with other words between them) - "Federal
// Aviation Administration" is one run; "Boeing and the Federal Aviation
// Administration" is "Boeing" (a run of its own) followed separately by
// "Federal Aviation Administration", because "and the" breaks the
// adjacency.
const CAPITALIZED_RUN_RE = /\b[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,3}\b/g;

// Common English / generic project-management words that must never on
// their own count as a reused-organization token, even though they are
// capitalized in the source text. Capitalization at the START of a sentence
// ("Lack of stakeholder alignment...", "Construction ran over budget...")
// is English orthography, not evidence of a proper noun - a bullet that
// happens to open with one of these words is not naming an organization.
// This is checked in detectReusedCaseStudies (the reuse-detection path),
// not in extractOrganizationCandidates, so the candidate-extraction
// heuristic itself is unchanged; see MEMORY / P2-AC8 bug report for the
// real-course false positives ("Lack" from weeks 4/9/12, "Construction"
// from week 14) that motivated this list.
const COMMON_WORD_STOPLIST = new Set([
  "lack", "construction", "project", "projects", "system", "systems",
  "management", "technical", "program", "programs", "budget", "schedule",
  "team", "teams", "cost", "costs", "risk", "risks", "quality", "scope",
  "delay", "delays", "failure", "failures", "plan", "plans", "process",
  "report", "case", "study", "this", "that", "these", "those", "with",
  "from", "when", "what", "where", "which", "while", "after", "before",
  "during", "their", "would", "could", "should", "because", "however",
  "despite", "without", "using", "used", "over", "under", "into", "more",
  "most", "than", "then", "they", "them", "were", "been", "have", "has",
  "had",
]);

/**
 * Candidate organization/event names from a case study's title + bullets:
 * runs of 1-4 consecutive, whitespace-adjacent capitalized words, with
 * sentence-initial generic words ("The", "This", "Case Study", ...) trimmed
 * from each run's edges rather than discarding the whole run - "The
 * Deepwater Horizon" still yields "Deepwater Horizon". Deliberately a
 * heuristic, not real named-entity recognition - see the module comment.
 */
export function extractOrganizationCandidates(text: string): string[] {
  const candidates = new Set<string>();
  const runs = text.match(CAPITALIZED_RUN_RE) ?? [];

  for (const run of runs) {
    let words = run.split(/\s+/);
    while (words.length > 0 && GENERIC_CAPITALIZED_WORDS.has(words[0].toLowerCase())) {
      words = words.slice(1);
    }
    while (words.length > 0 && GENERIC_CAPITALIZED_WORDS.has(words[words.length - 1].toLowerCase())) {
      words = words.slice(0, -1);
    }
    if (words.length === 0) continue;

    const phrase = words.join(" ");
    // A single short (<4 char) capitalized word is too common (a stray
    // abbreviation, a sentence-initial word the generic list missed) to
    // trust alone; a multi-word phrase or a longer single word is a much
    // stronger signal of a real proper noun.
    if (words.length > 1 || phrase.length >= 4) {
      candidates.add(phrase);
    }
  }

  return [...candidates];
}

export interface CaseStudyPlan {
  weekNumber: number;
  slides: MinimalCaseStudySlide[];
}

export interface ReusedCaseStudy {
  /** Display form of the reused organization/event candidate. */
  organization: string;
  /** Every week whose Case Study slide named this candidate, ascending. */
  weeks: number[];
}

/**
 * After a full schedule run, find every organization/event candidate named
 * on the opening Case Study slide of two or more different weeks. Reports
 * rather than blocks - a real collision here is a defect worth an
 * instructor's attention, not a reason to fail the run or silently drop a
 * deck.
 *
 * Matches at the level of INDIVIDUAL significant words (length >= 4) within
 * each week's candidate phrases, not the whole phrase - two weeks rarely
 * produce a byte-identical candidate phrase even when they clearly name the
 * same event ("London Olympics Construction" vs "London Olympics"), but
 * they do share the distinctive word. Words that end up flagged across the
 * exact same pair (or set) of weeks are reported as ONE collision, not one
 * per word, so "London" and "Olympics" both recurring on weeks 1 and 7
 * reads as a single reused case study.
 *
 * Words in COMMON_WORD_STOPLIST are excluded before a token is ever
 * considered for a collision, because sentence-initial capitalization
 * ("Lack of stakeholder alignment...") is orthography, not a proper noun.
 * A week's OTHER, non-stoplisted tokens still collide normally - filtering
 * "System" out of "Denver International Airport Baggage System" still
 * reports the Denver group via Denver/International/Airport/Baggage - and a
 * group whose every token was filtered out (e.g. three weeks that only
 * shared the word "Lack") is dropped entirely rather than reported with an
 * empty or misleading organization string.
 */
export function detectReusedCaseStudies(plans: CaseStudyPlan[]): ReusedCaseStudy[] {
  const tokenWeeks = new Map<string, { display: string; weeks: Set<number> }>();

  for (const plan of plans) {
    const slide = findCaseStudySlide(plan.slides);
    if (!slide) continue;

    const text = `${slide.title} ${slide.bullets.join(" ")}`;
    const tokensThisWeek = new Set<string>();
    for (const candidate of extractOrganizationCandidates(text)) {
      for (const word of candidate.split(" ")) {
        if (word.length >= 4 && !COMMON_WORD_STOPLIST.has(word.toLowerCase())) {
          tokensThisWeek.add(word);
        }
      }
    }

    for (const token of tokensThisWeek) {
      const key = token.toLowerCase();
      const entry = tokenWeeks.get(key);
      if (entry) {
        entry.weeks.add(plan.weekNumber);
      } else {
        tokenWeeks.set(key, { display: token, weeks: new Set([plan.weekNumber]) });
      }
    }
  }

  // Group tokens that recur across the exact SAME set of >=2 weeks into one
  // reported entry.
  const byWeekSet = new Map<string, { organizations: string[]; weeks: number[] }>();
  for (const { display, weeks } of tokenWeeks.values()) {
    if (weeks.size < 2) continue;
    const sortedWeeks = [...weeks].sort((a, b) => a - b);
    const weekKey = sortedWeeks.join(",");
    const entry = byWeekSet.get(weekKey);
    if (entry) {
      entry.organizations.push(display);
    } else {
      byWeekSet.set(weekKey, { organizations: [display], weeks: sortedWeeks });
    }
  }

  return [...byWeekSet.values()]
    // Defense in depth: every entry here already has >=1 non-stoplisted
    // token (stoplisted words never reach tokenWeeks above), so this never
    // actually drops anything today - but a group must never be reported
    // with an empty organization string, so make that invariant explicit
    // rather than relying solely on the earlier filter.
    .filter(({ organizations }) => organizations.length > 0)
    .map(({ organizations, weeks }) => ({ organization: organizations.join(" / "), weeks }))
    .sort((a, b) => a.organization.localeCompare(b.organization));
}
