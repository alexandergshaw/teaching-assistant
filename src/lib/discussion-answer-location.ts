// Discussion reply capture - is a post-question's answer actually present in
// the reply text?
//
// docs/answers-in-the-reply-acceptance-criteria.md A1. Since the drafting
// prompt now weaves each answer INTO the reply and asks for `answer` to be
// the reply's own words copied back, every per-question state the UI shows
// is derived from this one predicate against the LIVE reply text - never
// from a stored flag, which would drift the moment the instructor edits the
// reply (the same reasoning `replyAlreadyHasResource` states at
// discussion-reply-insert.ts:36-58).
//
// Pure and dependency-free - no "use server", no imports from anywhere else
// in the repo. It is imported by a client component
// (DiscussionReplyQuestions.tsx) and by the drafting loop
// (discussion-draft-loop.ts), and deliberately does NOT import
// MAX_ANSWER_CHARS or `truncateWithMarker` from discussion-reply-prompt.ts:
// the truncation case below is recognised from the text itself, so this leaf
// stays a leaf and can never form a cycle with the prompt builder if that
// file ever needs to locate an answer of its own.
//
// WHY A RAW `reply.includes(answer)` IS NOT ENOUGH, and why this file exists
// at all: `parsePostQuestions` REWRITES an answer before it is ever stored.
// `normalizePostQuestionAnswer` (discussion-reply-prompt.ts:188-197) splits
// the model's answer on blank lines, collapses every internal whitespace run
// to ONE space inside each paragraph, and truncates past MAX_ANSWER_CHARS
// with a literal three-period marker. So a model that copies a reply span
// back perfectly - across a soft line break, or from a reply longer than the
// cap - still yields a stored `answer` that is NOT a substring of the reply.
// A raw containment test would report "not in the reply" for the feature's
// own success case.
//
// WHY NOT REUSE `normalizeForMatch`
// (src/app/components/recording/discussion-capture.ts:233-240), which is the
// same shape of function and is already used for normalised containment at
// discussion-table-view.ts:142-147. Read, not imported, for three reasons:
//   1. It is far looser than a claim about literal text can afford. It maps
//      every non-[a-z0-9 ] character to a space, so "Yes, no" and "Yes. No!"
//      are equal to it, and so are "due on 3/14" and "due on 3 14". This
//      predicate drives a badge that tells the instructor the reply CONTAINS
//      these words; it must not be satisfied by punctuation-blind near-hits.
//   2. Its exact output is frozen by discussion-capture.dedupe.test.ts:32-46
//      and consumed by seven other modules. Widening it to serve this caller
//      is the "coercion changes set membership" trap - a change here would
//      silently move dedupe, table filtering and Canvas thread matching.
//   3. discussion-capture.ts imports @/lib/upload-budget, so importing it
//      from src/lib would invert this repo's lib -> app direction.

/** Below this many normalised characters an answer is treated as
 *  unlocatable rather than matched. A three-word fragment can appear in an
 *  unrelated reply by coincidence, and this predicate's whole value is that
 *  a positive result means something. */
export const MIN_LOCATABLE_ANSWER_CHARS = 12;

/** Attempt 3 only: how far apart the answer's sentences may be spread in the
 *  reply, as a multiple of the answer's own normalised length. A model that
 *  answers one question in two places leaves a sentence or two of other
 *  reply between them; two unrelated fragments a long way apart are not an
 *  answer, however literally both appear. */
export const MAX_SPLIT_ANSWER_SPREAD = 3;

/** The projection both sides are compared in: case-folded, with the
 *  typographic characters a model swaps freely folded to their ASCII forms,
 *  and every whitespace run - including the "\n\n" paragraph joins
 *  `normalizePostQuestionAnswer` writes - collapsed to a single space.
 *  Deliberately DELETES nothing: every word survives, so a match still means
 *  the same words in the same order. */
function normalizeForAnswerMatch(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Trailing ASCII periods (and the space `truncateWithMarker` may leave in
 *  front of them once whitespace is collapsed) stripped from the END of an
 *  already-normalised answer. Used ONLY for the truncation retry below. */
function stripTrailingPeriods(normalized: string): string {
  return normalized.replace(/[. ]+$/, "");
}

/** An already-normalised answer split after each sentence-ending `.`, `!` or
 *  `?`. A mid-answer elision (the model writing "... " where it skipped some
 *  of the reply's own words) splits here too, which is exactly what makes
 *  attempt 3 below able to see through one. */
function splitSentences(normalized: string): string[] {
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * True when `reply` contains `answer` - i.e. when the drafted reply really
 * does say the thing this question's answer claims it says.
 *
 * Three attempts, each of them EXACT containment in the normalised
 * projection - never a similarity score, never an n-word prefix. Those were
 * considered and rejected: a prefix or fuzzy match reports "in the reply"
 * for a reply that merely drifted onto the same subject, and a false
 * positive here is the one failure that matters. It tells the instructor the
 * reply answers a question it does not, and they post it. A false NEGATIVE
 * only costs the item its one-line form: it renders the answer text and a
 * Copy control instead, which is honest and still useful.
 *
 *  1. the whole answer, verbatim;
 *  2. the whole answer minus a trailing truncation marker;
 *  3. every sentence of the answer, in order, allowing other reply text
 *     between them - which covers a model that answers one question in two
 *     places, and one that elides the middle of its own quotation.
 */
export function replyContainsAnswer(reply: string, answer: string): boolean {
  const needle = normalizeForAnswerMatch(answer);
  if (needle.length < MIN_LOCATABLE_ANSWER_CHARS) return false;

  const haystack = normalizeForAnswerMatch(reply);
  if (haystack.includes(needle)) return true;

  // Attempt 2 - the truncation case. `normalizePostQuestionAnswer` appends a
  // literal three-period marker past MAX_ANSWER_CHARS, cutting at a word
  // boundary, so the stored answer is a PREFIX of the reply's words plus a
  // marker the reply itself never contains. Still exact containment, just of
  // the surviving prefix.
  if (needle.endsWith(".")) {
    const withoutMarker = stripTrailingPeriods(needle);
    if (withoutMarker.length >= MIN_LOCATABLE_ANSWER_CHARS && haystack.includes(withoutMarker)) {
      return true;
    }
  }

  // Attempt 3 - sentence by sentence, in order. Each sentence keeps its own
  // terminating punctuation, which is what stops a short one ("no.") from
  // matching inside a longer word; only the LAST may shed a truncation
  // marker. `from` advances past each hit, so the sentences must appear in
  // the answer's own order and can never all match the same span twice.
  const sentences = splitSentences(needle);
  if (sentences.length < 2) return false;

  let from = 0;
  let firstMatchStart = -1;
  for (let i = 0; i < sentences.length; i += 1) {
    const raw = sentences[i];
    const isLast = i === sentences.length - 1;
    // Two periods or more is an ellipsis the reply itself never contains -
    // either the truncation marker or the model eliding part of its own
    // quotation - so any segment may shed one. A SINGLE trailing period is
    // ordinary punctuation and is shed only from the last segment, where it
    // rescues final-punctuation drift. The 4-character floor is what keeps a
    // stripped short sentence ("no.") from matching inside a longer word
    // ("not"); below it the segment keeps its punctuation and must be found
    // with it.
    const stripped = stripTrailingPeriods(raw);
    const mayStrip = (/\.\.+$/.test(raw) || isLast) && stripped.length >= 4;
    const sentence = mayStrip ? stripped : raw;
    const at = haystack.indexOf(sentence, from);
    if (at === -1) return false;
    if (firstMatchStart === -1) firstMatchStart = at;
    from = at + sentence.length;
  }

  // VERIFY PASS - the span the matched sentences cover must stay in the same
  // league as the answer itself. Without this, two sentences arbitrarily far
  // apart satisfy the loop above: an answer of "First, the rubric is
  // unchanged. That is the part I would push on." matches a reply that says
  // those two things three paragraphs apart about different subjects, and the
  // badge then claims the reply answers a question it never joins up. The
  // allowance is generous on purpose - a model legitimately answers one
  // question in two places, with a sentence or two of other reply in between
  // - so this only rejects the case where the "answer" is really two
  // unrelated fragments of a long reply.
  return from - firstMatchStart <= needle.length * MAX_SPLIT_ANSWER_SPREAD;
}
