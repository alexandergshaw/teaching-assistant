// The output-token budget for the exemplar-driven walkthrough announcement
// drafter (docs/announcement-from-walkthrough-acceptance-criteria.md, P7). A
// dependency-free leaf, like lecture-script-bounds.ts, so the drafting
// action and its tests share one definition of "how big a budget does this
// outline need" - and so this module stays importable from a client hook
// without pulling in server-only code (see lecture-script-bounds.ts's own
// header on why that matters: its THINKING_HEADROOM_TOKENS is a LOCAL
// constant rather than an import of gemini.ts's equivalent, specifically to
// keep a client-reachable file free of server-only env-reading code).
//
// WHY THIS IS NOT lectureScriptMaxOutputTokens (P7 is explicit that it must
// not be reused). That function converts REQUESTED MINUTES to a word target
// via a fixed speaking pace (LECTURE_SCRIPT_WORDS_PER_MINUTE). This drafter
// has no minutes - it has an AnnouncementOutline, whose only length signal is
// a per-SECTION sentence-count range. The conversion here is sections ->
// sentences -> words -> tokens, not minutes -> words -> tokens. Different
// unit, different function - forking a second copy of the MINUTES version
// would be the "second silent lie" this repo's own review discipline
// flags (see lecture-script-bounds.ts's header for that exact phrase, used
// there for the opposite case - two callers that DO share one relationship
// and should not fork).
//
// THE LESSON THIS FILE MUST REPRODUCE, NOT RE-DERIVE (read
// lecture-script-bounds.ts in full before touching this arithmetic).
// Thinking tokens are drawn from the SAME budget as maxOutputTokens, so a
// too-small budget does not yield a short answer - it yields an EMPTY
// string, because thinking alone can consume the whole thing before any
// content is written. That already shipped as a real bug here ("the intro
// video script never comes up as a modal"): a floor that was sized purely
// for CONTENT collided almost exactly with the model client's own thinking
// floor, so the floor that was supposed to protect the call turned out to be
// the exact number that starved it.
//
// THE FIX, reproduced here in the same shape: add THINKING_HEADROOM_TOKENS
// to the content estimate FIRST, and only THEN clamp to [MIN, MAX] - never
// clamp a content-only estimate up to a floor that also has to cover
// thinking. The trap that shipped the original bug is subtle enough to
// repeat by accident even when copying this comment: setting MIN_OUTPUT_
// TOKENS to the SAME value as THINKING_HEADROOM_TOKENS silently reintroduces
// it, because an empty outline's estimate is then exactly the headroom and
// clamping "up" to a floor equal to that headroom changes nothing - the
// result still has zero tokens left for content. MIN_OUTPUT_TOKENS below is
// therefore deliberately set ABOVE THINKING_HEADROOM_TOKENS, by a margin
// sized for a genuine minimal fallback announcement (see its own comment).
// walkthrough-announcement-bounds.test.ts pins this: an empty outline's
// budget must exceed THINKING_HEADROOM_TOKENS, not merely equal or floor at
// it.

import type { AnnouncementOutline } from "./announcement-outline-types";

// Average English sentence length in running prose, used only to convert
// the outline's per-section SENTENCE range into a word count - there is no
// existing constant for this in the repo (the closest neighbor,
// LECTURE_SCRIPT_WORDS_PER_MINUTE in lecture-script-bounds.ts, converts
// minutes to words via a SPEAKING pace, a different axis entirely). 20 is a
// standard estimate for formal written prose (announcements, not
// conversation), matching the sentence lengths this drafter is actually
// asked to reproduce.
const WORDS_PER_SENTENCE = 20;

// Tokens per word, mirroring TOKENS_PER_WORD in lecture-script-bounds.ts
// (same value, same base reasoning: English prose runs roughly 1.3
// tokens/word, and the extra margin protects against undershooting, which
// truncates content mid-sentence). Reproduced as a local constant rather
// than imported, because that constant is module-private there and this
// file is a dependency-free leaf in its own right (see this file's header).
// If anything this drafter's true ratio runs slightly HIGHER than a spoken
// script's: AC8/P1 has it emit Markdown structural characters (#, -, digits
// and dots for ordered lists) that a word count does not account for at
// all, so 1.6 is, if biased, biased the safe direction here too.
const TOKENS_PER_WORD = 1.6;

// Same value and same calibration as THINKING_HEADROOM_TOKENS in
// lecture-script-bounds.ts (itself matching gemini.ts's own
// DEFAULT_MIN_OUTPUT_TOKENS): thinking alone can consume close to this many
// tokens even for a short, non-grounded prompt at the model's default
// thinking level, so it must be added ON TOP of the content estimate before
// any clamping happens - see this file's header.
const THINKING_HEADROOM_TOKENS = 512;

// Content-only floor: the smallest budget this function will ever return,
// covering both the headroom above AND a genuine minimal fallback
// announcement - never the headroom alone (see this file's header on why
// that distinction is the whole point). Sized for roughly one short
// paragraph (about 8 sentences x 20 words/sentence = 160 words, generously
// rounded to 240 words for margin) at TOKENS_PER_WORD: 240 * 1.6 = 384,
// + THINKING_HEADROOM_TOKENS (512) = 896. An outline with no sections at all
// (EMPTY_ANNOUNCEMENT_OUTLINE) still gets this floor, so it can still
// produce a real one-or-two-paragraph announcement (see
// walkthrough-announcement-prompt.ts's own handling of that same outline)
// rather than being starved down to nothing.
const MIN_OUTPUT_TOKENS = 896;

// The ceiling. A realistic large outline - say 12 sections, each up to 8
// sentences - estimates at 12 * 8 * 20 = 1920 words, * 1.6 = 3072,
// + 512 headroom = 3584, comfortably under this ceiling. 8192 matches the
// ceiling already used for lecture-script-bounds.ts's own MAX_OUTPUT_TOKENS
// and elsewhere in this repo (course-planning.ts, course-planning-
// lecture.ts) - not a new risk, and here too it functions as a backstop
// against a pathological outline (an exemplar mis-parsed into far more
// sections than any real announcement has), not a ceiling any realistic
// outline is expected to reach.
const MAX_OUTPUT_TOKENS = 8192;

/**
 * The output-token budget an announcement matching this outline's structure
 * needs, bounded at both ends. Sized from the outline itself - section count
 * times each section's own sentence-range MAXIMUM (the worst case that must
 * still fit, not an average that could under-budget half the time) -
 * converted to words and then tokens, plus THINKING_HEADROOM_TOKENS, then
 * clamped to [MIN_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS]. See this file's header
 * for why the headroom is added BEFORE the clamp, never folded into a
 * content-only floor.
 */
export function walkthroughAnnouncementMaxOutputTokens(outline: AnnouncementOutline): number {
  const totalSentences = outline.sections.reduce((sum, section) => sum + section.sentenceRange[1], 0);
  const words = totalSentences * WORDS_PER_SENTENCE;
  const estimated = Math.round(words * TOKENS_PER_WORD) + THINKING_HEADROOM_TOKENS;
  return Math.max(MIN_OUTPUT_TOKENS, Math.min(MAX_OUTPUT_TOKENS, estimated));
}
