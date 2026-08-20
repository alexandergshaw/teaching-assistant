// Pure speaking-pace and filler-word logic for teleprompter mode (T8-T11,
// docs/teleprompter-mode-acceptance-criteria.md). This module is a leaf: no
// browser API, no Date.now(), no randomness, and its only import is the pace
// constant below. That is deliberate (see finding 6 in the acceptance
// criteria doc) - vitest here is node-env with no jsdom, so this is the ONLY
// part of the teleprompter feature that can have real, executed tests. The
// hook that feeds utterances from useLiveTranscription into these functions
// is thin, untested glue by design; keep it that way by not adding anything
// here that needs a browser.
//
// Folding interim/revised utterances (so a result revised mid-utterance is
// not counted twice) is NOT this module's job. useLiveTranscription already
// has `mergeInterim` (src/app/components/live-class/questions.ts) for exactly
// that. Re-implementing it here would give the feature two different
// opinions about what "the same utterance" means. The CALLER folds interim
// results with the existing mergeInterim before handing samples to
// speakingRate/countFillers.

import { LECTURE_SCRIPT_WORDS_PER_MINUTE } from "@/lib/lecture-script-bounds";

// T8: the pace target is the SAME constant the script generator wrote to
// (src/lib/lecture-script-bounds.ts, currently 140 wpm). Do not define a
// second pace constant here - the script was sized in words assuming this
// exact pace, so measuring live delivery against any other number would tell
// the instructor they are off-pace for a script that was never written to
// that number in the first place.
export const TELEPROMPTER_TARGET_WPM = LECTURE_SCRIPT_WORDS_PER_MINUTE;

/** One recognised utterance, mirroring the shape useLiveTranscription already
 * produces (see useLiveTranscription.ts around lines 232-300: every
 * utterance carries `text` and an `atMs` timestamp relative to session
 * start). This module does not import that file - only the shape is
 * mirrored, to keep this module a browser-free leaf. */
export interface SpeechSample {
  readonly text: string;
  readonly atMs: number;
}

/**
 * Count words in text, ignoring empty tokens and standalone punctuation.
 * Whitespace-split, then each token must contain at least one letter,
 * digit, or other "word" character - a lone "-" or "..." left over from a
 * split does not count as a word.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

// T10: the window is ROLLING (recent speech only), not a session average. A
// session average converges toward a single stable number as more speech
// accumulates and then stops responding - by minute 10, one slow sentence
// barely moves it, which makes it useless as LIVE feedback (an instructor
// speeding up or slowing down right now would not see it reflected). A
// rolling window stays sensitive to what just happened. 20 seconds is short
// enough to react within a sentence or two, long enough that ordinary
// mid-sentence pauses don't swing the reading wildly.
export const SPEAKING_RATE_WINDOW_MS = 20_000;

// Below this many words in the window, a wpm figure is not a measurement, it
// is noise: two words spoken 400ms apart extrapolates to a nonsensical
// wpm (e.g. "one two" in 0.4s implies ~300 wpm). Reporting "not enough
// speech yet" is more honest than a number that looks precise but is really
// a sampling artefact - a wild number actively misleads where an honest
// "not enough yet" does not.
export const SPEAKING_RATE_MIN_WORDS = 8;

// T10 tolerance bounds around the target. Chosen wide enough that normal
// prosodic variation (breathing, emphasis, a pause for a slide change)
// doesn't flip the verdict every few seconds, narrow enough that a sustained
// rush or drag is still caught. +/-15% of the target is the working
// definition of "on pace" here.
const PACE_TOLERANCE_RATIO = 0.15;
export const SPEAKING_RATE_SLOW_BELOW_WPM = TELEPROMPTER_TARGET_WPM * (1 - PACE_TOLERANCE_RATIO);
export const SPEAKING_RATE_FAST_ABOVE_WPM = TELEPROMPTER_TARGET_WPM * (1 + PACE_TOLERANCE_RATIO);

export type PaceVerdict = "slow" | "on-pace" | "fast";

export type SpeakingRate =
  | { status: "insufficient-data" }
  | { status: "reading"; wpm: number; verdict: PaceVerdict };

function paceVerdict(wpm: number): PaceVerdict {
  if (wpm < SPEAKING_RATE_SLOW_BELOW_WPM) return "slow";
  if (wpm > SPEAKING_RATE_FAST_ABOVE_WPM) return "fast";
  return "on-pace";
}

/**
 * Rolling-window words-per-minute reading (T10). Considers only utterances
 * whose `atMs` falls within SPEAKING_RATE_WINDOW_MS of `nowMs`, inclusive of
 * the window start (nowMs - window) and inclusive of nowMs itself.
 *
 * Defensive by construction: a non-finite or non-positive effective window
 * (nowMs <= 0, or fewer than two samples) simply yields too little data to
 * measure a rate, which is exactly the "insufficient-data" branch - there is
 * no code path that divides by zero.
 */
export function speakingRate(utterances: readonly SpeechSample[], nowMs: number): SpeakingRate {
  if (!Number.isFinite(nowMs)) return { status: "insufficient-data" };

  const windowStart = nowMs - SPEAKING_RATE_WINDOW_MS;
  const inWindow = utterances.filter(
    (u) => Number.isFinite(u.atMs) && u.atMs >= windowStart && u.atMs <= nowMs
  );
  if (inWindow.length === 0) return { status: "insufficient-data" };

  const wordCount = inWindow.reduce((sum, u) => sum + countWords(u.text), 0);
  if (wordCount < SPEAKING_RATE_MIN_WORDS) return { status: "insufficient-data" };

  // Elapsed span actually covered by the samples, clamped to the window and
  // floored so a burst of near-simultaneous utterances (elapsed near 0)
  // cannot produce a division blow-up or a negative span.
  const earliest = Math.min(...inWindow.map((u) => u.atMs));
  const elapsedMs = Math.max(nowMs - earliest, 1);
  const elapsedMinutes = Math.min(elapsedMs, SPEAKING_RATE_WINDOW_MS) / 60_000;
  if (elapsedMinutes <= 0) return { status: "insufficient-data" };

  const wpm = wordCount / elapsedMinutes;
  return { status: "reading", wpm, verdict: paceVerdict(wpm) };
}

// T11: filler word / disfluency list.
//
// This is deliberately split into two confidence tiers rather than one flat
// list, because several of the requested terms are ordinary words far more
// often than they are fillers:
//
//   - "like", "right", "so", "actually" are common in fluent, well-formed
//     sentences ("I like this plan", "you are right", "so, in summary",
//     "we actually found the opposite"). Counting every occurrence as a
//     disfluency would overstate filler use for any instructor who simply
//     talks normally, which is worse than under-counting: it erodes trust in
//     the whole feature.
//   - "um", "uh", "er", "ah", "you know", "I mean", "sort of", "kind of",
//     "basically", "literally" are, in practice, overwhelmingly used as
//     verbal filler/hedges in spoken English and rarely serve as load-bearing
//     content words.
//
// HIGH_CONFIDENCE_FILLERS are counted as disfluencies outright.
// DISCOURSE_MARKER_FILLERS are reported separately (still detected and still
// named on request) so an instructor can see them without the headline
// number being inflated by ordinary usage.
export const HIGH_CONFIDENCE_FILLERS: readonly string[] = [
  "um",
  "uh",
  "er",
  "ah",
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "basically",
  "literally",
];

export const DISCOURSE_MARKER_FILLERS: readonly string[] = ["like", "right", "so", "actually"];

/** Every filler/discourse-marker phrase this module recognises, high
 * confidence first. Exported for callers that want one combined list. */
export const ALL_FILLER_TERMS: readonly string[] = [
  ...HIGH_CONFIDENCE_FILLERS,
  ...DISCOURSE_MARKER_FILLERS,
];

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary matching is the single most important correctness property
// here (per the brief): a substring match on "like" would fire inside
// "unlikely" and "likewise", and "so" would fire inside "solution" and
// "somewhere". \b in JS regex is a word-character/non-word-character
// boundary, which is exactly what is needed for alphabetic terms. A
// multi-word phrase such as "you know" is built the same way but with a
// literal single space between the escaped words, and still opens/closes on
// \b so "you known" does not match.
function fillerRegExp(term: string): RegExp {
  const escaped = escapeRegExp(term).replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "giu");
}

export interface FillerCount {
  readonly total: number;
  readonly byTerm: Readonly<Record<string, number>>;
}

/**
 * Count filler-word occurrences in text, matched case-insensitively on word
 * boundaries. Counts every term in ALL_FILLER_TERMS (both confidence tiers);
 * callers that only want the high-confidence figure can sum
 * HIGH_CONFIDENCE_FILLERS' entries out of `byTerm` instead.
 */
export function countFillers(text: string): FillerCount {
  const byTerm: Record<string, number> = {};
  let total = 0;
  if (!text) return { total: 0, byTerm };

  for (const term of ALL_FILLER_TERMS) {
    const matches = text.match(fillerRegExp(term));
    const count = matches ? matches.length : 0;
    byTerm[term] = count;
    total += count;
  }
  return { total, byTerm };
}

// T11: the caller must be able to tell "zero fillers detected" apart from
// "filler detection cannot run in this browser" (finding 2 - only the Web
// Speech transcription path yields verbatim text with disfluencies intact;
// the segmented/batch fallback posts through a server prompt that cleans
// them out). Reporting a count of zero when detection could not run at all
// would be a lie, so availability is modelled as an explicit union rather
// than folded into the count. This module never inspects a browser API to
// decide which branch applies - the caller (which knows which
// transcription path is active) supplies it.
export type FillerAvailability =
  | { available: true; counts: FillerCount }
  | { available: false; reason: string };

/**
 * Wrap a filler count behind the availability distinction. `isSupported`
 * is supplied by the caller (e.g. whether the Web Speech transcription path
 * is the one active) - this function performs no environment detection
 * itself, so it stays a pure leaf.
 */
export function fillerAvailability(
  text: string,
  isSupported: boolean,
  unsupportedReason = "Filler-word detection needs live speech-to-text, which is not available in this browser or transcription mode."
): FillerAvailability {
  if (!isSupported) return { available: false, reason: unsupportedReason };
  return { available: true, counts: countFillers(text) };
}
