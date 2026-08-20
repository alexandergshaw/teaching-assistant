// The accepted length range for generateLectureScriptAction
// (src/app/actions/media.ts), and the token budget a given length actually
// needs. A dependency-free leaf, so the action, the workflow steps that call
// it, and the tests can all share ONE definition of what a valid length is.
//
// It lives here rather than in media.ts because that module is "use server":
// only async functions may be exported from one, so a plain `const` or a
// synchronous helper cannot live there at all.
//
// WHAT WAS WRONG (this file's reason to exist). The action resolved its
// argument as:
//
//   const minutes = Number.isFinite(targetMinutes) && targetMinutes >= 1 &&
//     targetMinutes <= 30 ? Math.round(targetMinutes) : 5;
//
// An out-of-range value did NOT clamp to the nearest bound - it fell through
// to the DEFAULT of 5. steps.media.ts's "generate-lecture-script" step passed
// 50, so that step shipped ~700-word, 5-minute scripts while its own run form
// said "Default 50", with nothing anywhere reporting the substitution. The
// caller asked for one length and got another, silently. That is the defect;
// the specific number is incidental.
//
// TWO THINGS HAD TO CHANGE, not one. Fixing only the clamp would have moved
// the silent mismatch rather than removed it:
//
//   1. Out of range is now an ERROR, never a substitution
//      (checkLectureScriptMinutes). A caller cannot receive a length it did
//      not ask for. Clamping (50 -> 30) was rejected for the same reason the
//      original fallback was: it still hands back a length nobody requested.
//
//   2. The token budget now FOLLOWS the requested length
//      (lectureScriptMaxOutputTokens). The call previously used a fixed
//      maxOutputTokens of 4096, which at WORDS_PER_MINUTE below is roughly a
//      22-minute script - so every accepted request above ~22 minutes was
//      silently truncated mid-script even when the minutes themselves were
//      in range. An accepted length must be a producible length, or the range
//      is just a second silent lie.
//
// NOT TO BE CONFUSED WITH src/lib/lms-generation/script-length.ts, which is
// the LMS "Lecture script" generation kind's own fixed option list. That file
// routes AROUND this action's bounds by offering only in-range values; this
// file defines the bounds themselves. They are intentionally separate: one is
// a product decision about which lengths to offer in one UI, the other is the
// action's contract with every caller.

/** Shortest script the action will write. */
export const LECTURE_SCRIPT_MIN_MINUTES = 1;

/** Longest script the action will write. Raising this is safe only if
 * lectureScriptMaxOutputTokens' ceiling below still covers the new maximum -
 * see MAX_OUTPUT_TOKENS' own comment. */
export const LECTURE_SCRIPT_MAX_MINUTES = 30;

/** The natural speaking pace the prompt targets. The action turns the
 * requested minutes into a word target with this, so it is also what decides
 * how many output tokens a length needs. */
export const LECTURE_SCRIPT_WORDS_PER_MINUTE = 140;

// Tokens per word, with headroom. English prose runs roughly 1.3 tokens per
// word; the extra allows for the [PAUSE] markers the prompt asks for, heavier
// punctuation, and the fact that a model asked for "about N words" routinely
// overshoots. Undershooting here truncates a script mid-sentence, which is
// exactly the failure this file exists to prevent, so the bias is deliberate.
const TOKENS_PER_WORD = 1.6;

// Never ask for fewer than this many tokens: a 1-minute script is ~140 words
// (~224 tokens), and a budget that tight leaves no room for the opening hook
// and closing recap the prompt also requires.
const MIN_OUTPUT_TOKENS = 512;

// The ceiling. At LECTURE_SCRIPT_MAX_MINUTES (30) the estimate below is
// 30 * 140 * 1.6 = 6720, so the current maximum length fits with room to
// spare. Values of 8192 and 12288 are already used elsewhere in this repo
// (course-planning.ts:182, course-planning-lecture.ts:96), so this is not a
// new risk. If LECTURE_SCRIPT_MAX_MINUTES is ever raised past ~48 minutes,
// this ceiling starts silently truncating again and must be raised with it.
const MAX_OUTPUT_TOKENS = 8192;

/** How many words a script of this many minutes should target. */
export function lectureScriptWordTarget(minutes: number): number {
  return minutes * LECTURE_SCRIPT_WORDS_PER_MINUTE;
}

/**
 * The output-token budget a script of this many minutes needs, bounded at
 * both ends. Mirrors the shape of live-class.ts's own answerMaxOutputTokens
 * (a words-to-tokens estimate clamped to a floor and a ceiling), which is the
 * established precedent in this repo for sizing a budget to a requested
 * length rather than hardcoding one.
 */
export function lectureScriptMaxOutputTokens(minutes: number): number {
  const estimated = Math.round(lectureScriptWordTarget(minutes) * TOKENS_PER_WORD);
  return Math.max(MIN_OUTPUT_TOKENS, Math.min(MAX_OUTPUT_TOKENS, estimated));
}

/** Human sentence naming the accepted range - one definition, so the action's
 * error text and the run form's help string cannot drift apart. */
export const LECTURE_SCRIPT_MINUTES_HELP = `Whole minutes, ${LECTURE_SCRIPT_MIN_MINUTES} to ${LECTURE_SCRIPT_MAX_MINUTES}.`;

export type LectureScriptMinutesCheck =
  | { ok: true; minutes: number }
  | { ok: false; error: string };

/**
 * Validate a requested length. Returns the rounded minutes, or an error
 * naming the accepted range - NEVER a substituted value.
 *
 * A fractional value inside the range IS accepted and rounded: rounding 12.4
 * to 12 keeps what the caller asked for, whereas replacing an out-of-range 50
 * with any other number does not. That is the line this function draws, and
 * it is the whole point of the file.
 */
export function checkLectureScriptMinutes(raw: unknown): LectureScriptMinutesCheck {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { ok: false, error: `Enter a target length in minutes. ${LECTURE_SCRIPT_MINUTES_HELP}` };
  }
  if (raw < LECTURE_SCRIPT_MIN_MINUTES || raw > LECTURE_SCRIPT_MAX_MINUTES) {
    return {
      ok: false,
      error: `A ${raw}-minute lecture script is outside the supported range. ${LECTURE_SCRIPT_MINUTES_HELP}`,
    };
  }
  return { ok: true, minutes: Math.round(raw) };
}
