// Dedupe/merge leaf for grading-via-recording
// (docs/grading-via-recording-acceptance-criteria.md R4b). Consecutive
// screen-capture frames overlap heavily - the same submission is scrolled
// past, re-enters a later frame, gets read again by the extraction model.
// This module decides whether two extracted readings are the SAME
// submission or two different ones, and merges a matching pair into the
// fuller reading.
//
// R4b is explicit that mergeCapturedPosts/isSamePost
// (src/app/components/recording/discussion-capture.ts) must NOT be reused -
// "a second instance sharing an engine, not a parameterisation of the
// discussion surface." Every function below is a fresh, independent
// implementation; nothing here is imported from that file.
//
// Entry 367's measured lesson (see discussion-capture.ts's own AC11/AC11a/
// AC11b header) is carried over STRUCTURALLY, not just in spirit: identity
// is decided by comparing two readings' stable fields directly, never by
// collapsing either one to a derived key/hash first. A derived key over a
// text prefix was the mechanism entry 367 measured a 10-of-16 false-split
// rate from - hashing a vision-transcribed string throws away exactly the
// tail characters two overlapping reads of the same content are most likely
// to disagree on. Nothing below builds a key; isSameSubmission always
// compares the two readings' own fields.
//
// Pure and dependency-free (no React, no DOM, no "use server"), matching
// discussion-capture.ts's own discipline, so this is safe to import from
// both a future client capture module and the "use server" extraction
// action (src/app/actions/grading-submission-extract.ts).
//
// WHAT THIS FILE IS NOT: it does not mint GradingRow ids, does not carry
// GradingRow's state/roster/scoring fields, and does not build a GradingRow
// at all. grading-row.ts's own header says the table/row layer owns turning
// a merged submission into a GradingRow (minting its opaque id) - that layer
// is a sibling file set ("any file named *table* or *rows*"), out of scope
// here. This module's output is the plain extracted shape below, nothing
// more.
//
// POST-REVIEW HARDENING (this pass): a review found two ways for
// isSameSubmission to fuse two different students into one row, losing one
// of them entirely, PLUS a related failure mode where the SAME student's
// submission, split across two extraction batches, wrongly reads as two
// different students and never rejoins. See the doc comments on
// nameMatchConfidence, submissionTextSimilarityDistance and
// findContinuationOverlap below for the mechanics of each fix, and this
// file's own report (delivered alongside this change) for the attack that
// remains open.

/**
 * One submission as READ off a batch of frames, before any merging and
 * before it becomes a GradingRow. Deliberately NOT GradingRow
 * (grading-row.ts) - no id, no state, no roster verdict, no score. Those are
 * the table/row layer's job once it consumes a merge result.
 */
export interface ExtractedSubmission {
  name: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Identity: name + text-similarity, both compared directly (never hashed).
// ---------------------------------------------------------------------------

export const PREFIX_TOKENS = 40;
export const SIMILARITY_THRESHOLD = 0.25;
export const MIN_TOKENS_FOR_SIMILARITY = 4;

/** How tight a text match must be before a WEAK name signal (see
 * nameMatchConfidence) is allowed to carry a merge on its own. A cropped
 * single-token name is corroborating evidence, not identity - it is only
 * trusted when the text is a near-verbatim re-read, not merely "similar
 * enough" by the general SIMILARITY_THRESHOLD bar two DIFFERENT students'
 * answers to the same prompt can clear by chance. */
export const WEAK_NAME_SIMILARITY_THRESHOLD = 0.05;

/** Number of trailing/leading tokens compared to detect a batch-boundary
 * continuation splice. See findContinuationOverlap. */
export const CONTINUATION_OVERLAP_TOKENS = 6;

/** lowercase; delete intra-word marks FIRST (straight `'` and curly `'`),
 * so "don't" collapses to the one token "dont" instead of splitting into
 * "don" and "t"; THEN strip everything else outside [a-z0-9 ] to a space, so
 * "smith,jane" still becomes two tokens "smith jane" rather than gluing into
 * "smithjane"; collapse whitespace; trim. Order matters, mirroring the same
 * ordering discussion-capture.ts's own normalizeForMatch uses (written fresh
 * here, not imported - see this file's header). */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(s: string): string[] {
  const n = normalizeForMatch(s);
  return n.length ? n.split(" ") : [];
}

type NameMatchConfidence = "exact" | "weak" | "none";

/**
 * How strong the evidence is that `a` and `b` name the same student.
 *
 *  - "exact": normalized-string-equal, OR both sides give multiple tokens
 *    and the FIRST and LAST tokens agree (only a middle initial appearing
 *    in one read and not the other is allowed to differ). This is strong
 *    enough that the general SIMILARITY_THRESHOLD alone decides identity.
 *
 *  - "weak": the last tokens agree ONLY because one side is a single
 *    token - a cropped header read as just a surname ("Smith"). THE BUG
 *    THIS CLOSES: a cropped surname used to be treated as identity-grade
 *    evidence by itself, which matches every classmate who shares that
 *    surname. It is still tolerated (a cropped read must still be able to
 *    join its own submission's fuller reading - see the "surname-only"
 *    test), but it is now demoted to corroborating evidence: isSameSubmission
 *    requires WEAK_NAME_SIMILARITY_THRESHOLD (near-verbatim text), not the
 *    general threshold, before trusting it, and it is never enough on its
 *    own to justify the continuation path (that always requires "exact" -
 *    a continuation is the SAME capture session re-reading the SAME
 *    on-screen name, not a plausible-but-ambiguous crop).
 *
 *  - "none": last tokens disagree, or either side has no tokens at all.
 */
function nameMatchConfidence(a: string, b: string): NameMatchConfidence {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na === nb) return "exact";

  const ta = tokensOf(a);
  const tb = tokensOf(b);
  if (ta.length === 0 || tb.length === 0) return "none";

  const lastA = ta[ta.length - 1];
  const lastB = tb[tb.length - 1];
  if (lastA !== lastB) return "none";

  if (ta[0] === tb[0]) return "exact";
  if (ta.length === 1 || tb.length === 1) return "weak";
  return "none";
}

/** Surname-anchored compatibility check (Boolean view of
 * nameMatchConfidence, kept as its own export because it is a useful,
 * independently meaningful signal on its own - see grading-roster-match.ts's
 * sibling concerns). Written independently of authorsMatch
 * (discussion-capture.ts), per this file's header. */
export function studentNamesMatch(a: string, b: string): boolean {
  return nameMatchConfidence(a, b) !== "none";
}

/** Token-level Levenshtein distance. */
function tokenLevenshtein(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function commonPrefixLength(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/**
 * Levenshtein over tokens, normalized to a 0..1 distance.
 *
 * THE BUG THIS CLOSES: the old version always compared each text's first
 * PREFIX_TOKENS tokens - the document's opening. For a real submission that
 * restates a shared assignment prompt/template before any original content
 * ("Introduction: In this essay I will discuss...", a quoted question),
 * that opening is IDENTICAL across every student's submission, and for a
 * long submission it can consume the entire 40-token window - so two
 * genuinely different students' answers compared 0, not a real distance,
 * because the only tokens ever examined were the shared boilerplate sitting
 * in front of their actual (different) content.
 *
 * THE FIX: find the length of the tokens the two readings share as a
 * common PREFIX. If one reading is wholly a prefix of the other (or they
 * are identical) - the classic overlapping-frame re-read, where a shorter
 * read is simply an earlier/incomplete capture of the same longer one -
 * there is nothing to diverge on and the distance is 0, exactly as before.
 * Otherwise a real divergence exists within the shorter reading's own
 * length, and THAT is what gets compared: a PREFIX_TOKENS-sized window
 * starting AT the divergence point, not the shared opening sitting in
 * front of it. Two different students who happen to restate the same
 * prompt can no longer hide their real difference behind that boilerplate;
 * two overlapping re-reads of the true document opening are unaffected
 * (their shared prefix simply runs to the end of the shorter one, hitting
 * the same "prefix relationship" short-circuit as before this fix).
 */
export function submissionTextSimilarityDistance(aText: string, bText: string): number {
  const allA = tokensOf(aText);
  const allB = tokensOf(bText);
  const minLen = Math.min(allA.length, allB.length);
  if (minLen === 0) return allA.length === allB.length ? 0 : 1;

  const shared = commonPrefixLength(allA, allB);
  if (shared >= minLen) return 0;

  const tokensA = allA.slice(shared, shared + PREFIX_TOKENS);
  const tokensB = allB.slice(shared, shared + PREFIX_TOKENS);
  const windowMin = Math.min(tokensA.length, tokensB.length);
  if (windowMin === 0) return 0;
  const trimmedA = tokensA.slice(0, windowMin);
  const trimmedB = tokensB.slice(0, windowMin);
  return tokenLevenshtein(trimmedA, trimmedB) / windowMin;
}

/**
 * Detects a batch-boundary CONTINUATION splice: the last
 * CONTINUATION_OVERLAP_TOKENS tokens of `earlierText` reappearing verbatim
 * as the first CONTINUATION_OVERLAP_TOKENS tokens of `laterText`.
 *
 * THE GAP THIS CLOSES: a long submission whose top lands in one extraction
 * batch and whose body lands in the next has NOTHING in common with its own
 * earlier reading under submissionTextSimilarityDistance - that function
 * compares openings (real or divergence-point), and a body-only reading's
 * "opening" is the middle of the document, unrelated to the top reading's
 * real opening. The one signal available is the natural overlap two
 * adjacent frames leave at a batch boundary: the capture keeps scrolling
 * through the boundary, so the model's later-batch reading typically
 * re-transcribes a few words it also transcribed at the very end of the
 * earlier-batch reading, before continuing into content the earlier batch
 * never saw. That shared splice phrase is the signal this function looks
 * for.
 *
 * Returns CONTINUATION_OVERLAP_TOKENS when found, else null. Directional by
 * parameter name for the merge call site (see joinContinuationText, which
 * appends the non-overlapping remainder of `laterText` onto `earlierText`);
 * isSameSubmission checks BOTH directions before deciding "same submission"
 * (nothing here guarantees which of its two arguments was read first), but
 * mergeExtractedSubmissions only ever JOINS text in the expected
 * earlier-then-later direction (existing entry, then incoming batch) - see
 * this file's report for what happens when only the reverse direction
 * matches.
 */
export function findContinuationOverlap(earlierText: string, laterText: string): number | null {
  const earlierTokens = tokensOf(earlierText);
  const laterTokens = tokensOf(laterText);
  if (earlierTokens.length < CONTINUATION_OVERLAP_TOKENS || laterTokens.length < CONTINUATION_OVERLAP_TOKENS) {
    return null;
  }
  const tail = earlierTokens.slice(earlierTokens.length - CONTINUATION_OVERLAP_TOKENS);
  const head = laterTokens.slice(0, CONTINUATION_OVERLAP_TOKENS);
  for (let i = 0; i < CONTINUATION_OVERLAP_TOKENS; i++) {
    if (tail[i] !== head[i]) return null;
  }
  return CONTINUATION_OVERLAP_TOKENS;
}

/**
 * Whether `a` and `b` are two readings of the SAME submission.
 *
 * STABLE FIELDS COMPARED, AND WHY EACH IS STABLE:
 *
 *  - `name`, via nameMatchConfidence. The printed name on a submission's
 *    header/byline is fixed text baked into the page itself - re-reading
 *    the SAME on-screen name across overlapping frames reproduces the same
 *    characters, modulo the odd OCR slip (a middle initial in one read, a
 *    surname-only read when a header got cropped). It is compared directly,
 *    never hashed. How much weight that match carries now depends on its
 *    confidence tier (see nameMatchConfidence's own doc comment) - this is
 *    the fix for a cropped surname alone matching every classmate who
 *    shares it.
 *
 *  - `text`, compared by TOKEN SIMILARITY over a window that skips a shared
 *    leading prefix (submissionTextSimilarityDistance), never by a derived
 *    key or hash. This is stable because a second read of the SAME scrolled
 *    region reproduces nearly the same tokens starting from wherever the two
 *    readings first diverge, while a genuinely different submission's
 *    content differs enough there to clear the threshold. Comparing (not
 *    hashing) is exactly the fix entry 367 measured: a derived key thrown
 *    away after the first N characters is the volatile mechanism that
 *    produced a 10-of-16 false-split rate on vision-transcribed text.
 *
 *  - As a THIRD signal, a continuation splice (findContinuationOverlap),
 *    used only when the name match is "exact": a long submission split
 *    across two extraction batches shares no leading window at all with
 *    its own earlier reading (the later batch's reading starts mid-
 *    document), so the text-similarity check above cannot see it as the
 *    same submission - the splice check is what lets it rejoin instead of
 *    becoming a second row.
 *
 * Unlike isSamePost (discussion-capture.ts), there is no `postedAt` field
 * here to lean on as a primary signal - a document, PDF or code view carries
 * no reliable on-screen submission timestamp the way a discussion board
 * prints one next to every post. That is a genuine capability gap versus the
 * discussion surface, not an oversight.
 */
export function isSameSubmission(
  a: { name: string; text: string },
  b: { name: string; text: string }
): boolean {
  const confidence = nameMatchConfidence(a.name, b.name);
  if (confidence === "none") return false;

  const tokenCount = Math.min(tokensOf(a.text).length, tokensOf(b.text).length);
  if (tokenCount < MIN_TOKENS_FOR_SIMILARITY) {
    return normalizeForMatch(a.text) === normalizeForMatch(b.text);
  }

  const threshold = confidence === "weak" ? WEAK_NAME_SIMILARITY_THRESHOLD : SIMILARITY_THRESHOLD;
  if (submissionTextSimilarityDistance(a.text, b.text) <= threshold) return true;

  if (
    confidence === "exact" &&
    (findContinuationOverlap(a.text, b.text) !== null || findContinuationOverlap(b.text, a.text) !== null)
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Merge: fold a batch of newly-extracted submissions into an existing list.
// ---------------------------------------------------------------------------

export interface MergeSubmissionsResult {
  submissions: ExtractedSubmission[];
  /** Count of `incoming` entries that did not match any existing submission
   *  and were appended as new. */
  addedCount: number;
  /** Count of `incoming` entries that matched an existing submission
   *  (isSameSubmission) and were folded into it, regardless of whether that
   *  fold actually changed the stored text. */
  mergedCount: number;
}

/** Appends the NON-overlapping tail of `laterText` onto `earlierText`, using
 * `overlapTokens` (from findContinuationOverlap) to skip the raw words in
 * `laterText` that already reappear at the end of `earlierText` - so a
 * continuation's shared splice phrase is not duplicated in the joined
 * result. Walks `laterText`'s RAW whitespace-split words (not the
 * normalized token stream) so the kept remainder preserves the original
 * casing/punctuation; a raw word that normalizes to nothing (bare
 * punctuation) still counts as one word consumed, so the walk always
 * terminates. This is an approximation, not a byte-exact splice - see this
 * file's report. */
function joinContinuationText(earlierText: string, laterText: string, overlapTokens: number): string {
  const rawWords = laterText.split(/\s+/).filter(Boolean);
  let consumed = 0;
  let wordIndex = 0;
  while (wordIndex < rawWords.length && consumed < overlapTokens) {
    consumed += tokensOf(rawWords[wordIndex]).length || 1;
    wordIndex++;
  }
  const remainder = rawWords.slice(wordIndex).join(" ");
  return remainder ? `${earlierText} ${remainder}` : earlierText;
}

/**
 * Pure; takes no `now`/id-minting concern (unlike mergeCapturedPosts) because
 * this leaf's output is not a row - see this file's header. A linear scan
 * with isSameSubmission, so an incoming submission is matched against
 * existing entries AND against entries already added earlier in this same
 * call, which covers "the same submission appears twice in one batch"
 * collapsing to one entry.
 *
 * Fold behavior on a match now branches on WHY it matched:
 *  - a continuation splice (findContinuationOverlap on the existing entry's
 *    text as "earlier" and the incoming submission's text as "later"):
 *    JOIN the two texts (joinContinuationText) - neither reading alone is
 *    the full submission, so picking a "winner" would still leave a
 *    fragment for grading.
 *  - anything else (the classic overlapping-frame re-read): the same
 *    equal-or-shorter-text tie-break mergeCapturedPosts uses - the FIRST
 *    (or longer) reading wins, and a match whose fold changes nothing
 *    leaves the array entry at the same object reference.
 */
export function mergeExtractedSubmissions(
  existing: ReadonlyArray<ExtractedSubmission>,
  incoming: ReadonlyArray<ExtractedSubmission>
): MergeSubmissionsResult {
  let next = existing.slice();
  let addedCount = 0;
  let mergedCount = 0;

  for (const submission of incoming) {
    const matchIndex = next.findIndex((s) => isSameSubmission(s, submission));

    if (matchIndex === -1) {
      next = [...next, { name: submission.name, text: submission.text }];
      addedCount++;
      continue;
    }

    mergedCount++;
    const current = next[matchIndex];
    const overlap = findContinuationOverlap(current.text, submission.text);
    if (overlap !== null) {
      const joined = joinContinuationText(current.text, submission.text, overlap);
      next = next.map((s, i) => (i === matchIndex ? { ...s, text: joined } : s));
    } else if (submission.text.length > current.text.length) {
      next = next.map((s, i) => (i === matchIndex ? { ...s, text: submission.text } : s));
    }
    // else: equal-or-shorter, non-continuation text - the existing (longer-
    // or-equal) reading wins and the entry keeps its existing object
    // identity.
  }

  return { submissions: next, addedCount, mergedCount };
}
