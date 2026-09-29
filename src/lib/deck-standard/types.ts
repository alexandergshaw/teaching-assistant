// The Deck Standard: the owner's standing deck rules encoded once as
// versioned config, applied by a pure checker, with provenance carried on
// the checker's own result (never on the shared GeneratedDeck/PptxSlide
// types - see standard.ts for why).
//
// Scope note (divergence, recorded per the brief): docs/pres-2-scope.md
// section 2.1's DeckStandard sketch also lists
// `requirePredictionAnswerSeparation`, routed to a later wave's SlidePlan
// type. That rule is structural (prediction/answer separation across
// slides), not one of the four deck-decidable rules this wave implements,
// so it is left OFF this DeckStandard on purpose (INFO-3): adding the field
// here with no corresponding check would be a config knob that does
// nothing, which is worse than omitting it. A later wave that introduces
// the SlidePlan invariant can extend this config then.

/**
 * The four deck-decidable rules this wave enforces, plus their parameters.
 * `version` is the provenance stamp threaded through `CheckResult`.
 */
export interface DeckStandard {
  /** Provenance stamp, e.g. "deck-standard-v1". */
  version: string;
  /** Rule 1: every slide title must be Title Case. */
  requireTitleCase: boolean;
  /** Rule 2: the title slide (slides[0]) carries only the title, no bullets. */
  titleSlideOnlyTitle: boolean;
  /** Rule 3: no slide may exceed this many bullets. */
  maxBulletsPerSlide: number;
  /** Rule 4: no title may exceed this many characters. */
  titleMaxChars: number;
}

/** The exact rule a violation belongs to. */
export type DeckStandardRule =
  | "requireTitleCase"
  | "titleSlideOnlyTitle"
  | "maxBulletsPerSlide"
  | "titleMaxChars";

/** One itemized finding: which rule, which slide, in plain language. */
export interface StandardViolation {
  /** -1 for a deck-level violation; otherwise the 0-based slide index. */
  slideIndex: number;
  rule: DeckStandardRule;
  detail: string;
}

/**
 * The provenance-carrying result of checkDeckStandard. This is a
 * deck-standard-owned structure, NOT a field on GeneratedDeck/PptxSlide
 * (B1): the shared deck types stay untouched, and any reader who wants to
 * know which standard checked a deck reads this result, produced fresh
 * each time the deck is checked.
 */
export interface CheckResult {
  standardVersion: string;
  violations: StandardViolation[];
}
