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
//
// THINKING-BUDGET STARVATION (found diagnosing "the intro video script never
// comes up as a modal"). script-length.ts (CHUNK 3g) re-geared its own
// offered options to [1, 2, 3, 5] minutes with a default of 2, WITHOUT
// revisiting this file's own MIN_OUTPUT_TOKENS floor, which predates that
// re-gear and was sized purely for CONTENT ("leaves no room for the opening
// hook and closing recap" - see that floor's own comment below): at 2 minutes
// the raw estimate is 280 words * 1.6 = 448 tokens, clamped UP to the 512
// floor. That 512 then collided almost exactly with gemini.ts's OWN,
// independently-sized floor (DEFAULT_MIN_OUTPUT_TOKENS, also 512 - a
// coincidence of two floors solving two different problems landing on the
// same number) - see that floor's doc comment: "thinking tokens are drawn
// from the SAME budget as maxOutputTokens... leaving no room for an answer".
// The floor that was supposed to protect the call ended up being the exact
// number that starved it: 512 tokens had to cover BOTH Gemini 3's thinking
// AND a 448-token script, and thinking is not optional to skip.
//
// THE FIX (below): lectureScriptMaxOutputTokens now adds THINKING_HEADROOM_TOKENS
// on top of the word-based content estimate, instead of clamping the content
// estimate up to a floor that has to double as thinking headroom. Fixed in
// THIS shared function, deliberately, not by forking a second copy for the
// intro-video path alone:
//   - generateLectureScriptAction (media.ts:273) accepts the SAME 1-30 minute
//     range this file defines (checkLectureScriptMinutes) - a workflow step
//     or a future caller asking for a short lecture script (1-4 minutes) hits
//     the identical starvation this file's own history section already
//     records one such caller (steps.media.ts) mis-using. Scoping the fix to
//     only the intro-video call site would leave that path exposed to the
//     exact defect this file exists to prevent.
//   - Both callers already share this one function BEFORE this fix (see
//     media.ts:273,328) - forking a second, intro-video-only budget function
//     would be the "second silent lie" pattern (a near-miss duplicate this
//     repo's own review discipline flags) for no benefit: nothing about the
//     intro-video kind needs a DIFFERENT relationship between minutes and
//     tokens, only a correct one.
//   - THINKING_HEADROOM_TOKENS deliberately does NOT import
//     gemini.ts's getGeminiMinOutputTokens (which would tie the two together
//     by reference and pull server-only env-reading code into every client
//     bundle that reaches this file through teleprompter/scroll.ts's own
//     LECTURE_SCRIPT_WORDS_PER_MINUTE import - see that file's import and
//     this file's own "dependency-free leaf" framing above). It is instead a
//     LOCAL constant, sized to the SAME reasoning gemini.ts's floor documents
//     (thinking can consume close to that floor's own value even for a short,
//     non-grounded prompt at flash-lite's default "minimal" thinking level) -
//     see the constant's own comment for the arithmetic.

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
// and closing recap the prompt also requires. Left in place as a bottom-line
// safety net, but with THINKING_HEADROOM_TOKENS below now added to every
// estimate BEFORE this floor is applied, this floor is no longer reachable in
// practice for any minutes >= LECTURE_SCRIPT_MIN_MINUTES (1 minute already
// produces 224 + 512 = 736, above this floor on its own) - see this file's
// "THINKING-BUDGET STARVATION" header-comment section for why a content-only
// floor could not do this job alone.
const MIN_OUTPUT_TOKENS = 512;

// Added to the word-based estimate BEFORE the MIN/MAX clamp, so a short
// request's budget is "enough room to think, PLUS enough room to write" -
// never one number asked to cover both, which is exactly how the 2-minute
// default starved (see this file's header comment). Sized to 512, matching
// gemini.ts's DEFAULT_MIN_OUTPUT_TOKENS: that floor is calibrated, by its own
// doc comment, to be enough for Gemini 3.x thinking PLUS a small answer on a
// non-grounded flash-lite call - i.e. thinking alone can consume close to
// that many tokens even when the eventual answer is tiny. A call that wants a
// REAL, multi-sentence answer cannot reuse that same floor as its ENTIRE
// budget (thinking would still consume close to it, leaving near nothing for
// the answer) - it needs that much headroom IN ADDITION to its own content
// estimate. This is a local, literal constant rather than an import of that
// getter, on purpose - see this file's header comment on why (client-bundle
// safety for teleprompter/scroll.ts's own import of this module).
const THINKING_HEADROOM_TOKENS = 512;

// The ceiling. At LECTURE_SCRIPT_MAX_MINUTES (30) the estimate is
// 30 * 140 * 1.6 = 6720, plus THINKING_HEADROOM_TOKENS (512) = 7232, so the
// current maximum length still fits under this ceiling with room to spare.
// Values of 8192 and 12288 are already used elsewhere in this repo
// (course-planning.ts:182, course-planning-lecture.ts:96), so this is not a
// new risk. With the headroom now added, the next minutes value that would
// reach this ceiling is (8192 - 512) / (140 * 1.6) = 34.28 - so
// LECTURE_SCRIPT_MAX_MINUTES can still be raised a little further than
// before without moving this ceiling, but not as far as the pre-headroom
// arithmetic implied; raise both together if LECTURE_SCRIPT_MAX_MINUTES ever
// approaches 34 minutes.
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
 * length rather than hardcoding one - extended here with
 * THINKING_HEADROOM_TOKENS (see that constant's own comment, and this file's
 * "THINKING-BUDGET STARVATION" header-comment section for why the estimate
 * alone, even floored, was not enough once Gemini 3's thinking budget shares
 * the same pool as maxOutputTokens.
 *
 * ARITHMETIC for the intro-video kind's offered lengths
 * (src/lib/lms-generation/script-length.ts's SCRIPT_LENGTH_OPTIONS = [1, 2,
 * 3, 5], default 2) - see lecture-script-bounds.test.ts for this same table
 * pinned as an executable, sabotage-checked test:
 *   1 minute:  140 words * 1.6 = 224,  + 512 headroom =  736
 *   2 minutes (DEFAULT): 280 words * 1.6 = 448, + 512 headroom = 960 -
 *     comfortably covers the ~280-word target: even if thinking consumes the
 *     entire 512-token headroom, 960 - 512 = 448 tokens remain, which is
 *     exactly the estimated content size (280 words * 1.6), with the
 *     estimate's own TOKENS_PER_WORD bias (1.6, "deliberately" above word
 *     count) already building in room for [PAUSE] markers and a model that
 *     overshoots "about N words".
 *   3 minutes: 420 words * 1.6 = 672,  + 512 headroom = 1184
 *   5 minutes: 700 words * 1.6 = 1120, + 512 headroom = 1632
 * All four are far under MAX_OUTPUT_TOKENS (8192), so none is ceiling-clamped.
 */
export function lectureScriptMaxOutputTokens(minutes: number): number {
  const estimated = Math.round(lectureScriptWordTarget(minutes) * TOKENS_PER_WORD) + THINKING_HEADROOM_TOKENS;
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
