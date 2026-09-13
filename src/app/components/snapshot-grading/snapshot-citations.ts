// Snapshot grading, WAVE 5 (docs/snapshot-grading-acceptance-criteria.md,
// D4). X8 replaced a self-reported role label with a verbatim quotation; D4
// went further, because a model that will emit a role it never used will
// emit a quotation it never read too. This file is the construction that
// closes that class: each rubric area's cited quotation is STRING-MATCHED
// against the actual transcription, and an area whose quote is not found
// there renders as unverified rather than as evidence. A citation the app
// cannot check is decoration, not proof.

import type { SnapshotRubricAreaAnswer } from "./snapshot-parse";

/** Collapses whitespace and case so a citation copied with different
 *  line-wrapping or capitalization still matches the transcript it came
 *  from - the model is not asked to reproduce whitespace exactly, only the
 *  words. */
function normalizeForMatch(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export interface SnapshotCitationResult {
  area: string;
  score: string;
  quote: string;
  shotIndex: number;
  /** True only when `quote` (normalized) is found verbatim inside the
   *  transcript it claims to come from, or inside the combined transcript as
   *  a fallback when shotIndex does not resolve to a known shot. */
  verified: boolean;
}

/**
 * `transcriptsByShotIndex` maps a shot's 1-based global index to that shot's
 * own transcript text. `combinedTranscript` is every shot's transcript
 * joined together (and any pasted rubric/assignment text) - the fallback
 * corpus for a citation whose `shotIndex` is 0 (pasted text, per the grade
 * prompt's own contract) or whose claimed index does not resolve to a known
 * shot, since a wrong-but-real quote should still verify against the whole
 * session rather than being penalized for a bad index alone.
 */
export function verifySnapshotCitations(
  areas: readonly SnapshotRubricAreaAnswer[],
  transcriptsByShotIndex: ReadonlyMap<number, string>,
  combinedTranscript: string
): SnapshotCitationResult[] {
  const normalizedCombined = normalizeForMatch(combinedTranscript);
  return areas.map((a) => {
    const quote = a.quote.trim();
    if (!quote) {
      return { area: a.area, score: a.score, quote: a.quote, shotIndex: a.shotIndex, verified: false };
    }
    const normalizedQuote = normalizeForMatch(quote);
    const ownCorpus = transcriptsByShotIndex.get(a.shotIndex);
    const verifiedAgainstOwnShot = ownCorpus ? normalizeForMatch(ownCorpus).includes(normalizedQuote) : false;
    const verified = verifiedAgainstOwnShot || normalizedCombined.includes(normalizedQuote);
    return { area: a.area, score: a.score, quote: a.quote, shotIndex: a.shotIndex, verified };
  });
}
