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
  // Carried through so the UI can render pasted-text evidence distinctly
  // from shot-verified evidence (Ruling D) - never the numeric shotIndex
  // alone, which cannot distinguish a sanctioned pasted citation from a
  // missing/non-numeric one (see snapshot-parse.ts's own classification).
  source: "shot" | "pasted" | "unknown";
  /** True only when `quote` (normalized) is found verbatim inside the
   *  transcript it claims to come from, inside the dedicated pasted-text
   *  corpus (only for a `source: "pasted"` citation), or inside the combined
   *  transcript as a fallback when the source cannot be resolved that way. */
  verified: boolean;
}

/**
 * `transcriptsByShotIndex` maps a shot's 1-based global index to that shot's
 * own transcript text. `combinedTranscript` is every shot's transcript
 * joined together - the fallback corpus for a citation whose claimed index
 * does not resolve to a known shot, since a wrong-but-real quote should
 * still verify against the whole session rather than being penalized for a
 * bad index alone. `pastedTextCorpus` is the instructor's own pasted
 * rubric/assignment text - the ONLY corpus a `source: "pasted"` citation may
 * verify against; it is never consulted for a `"shot"` or `"unknown"`
 * citation, which closes the fabrication vector a numeric-sentinel
 * `shotIndex: 0` discriminator could not (RULING A).
 */
export function verifySnapshotCitations(
  areas: readonly SnapshotRubricAreaAnswer[],
  transcriptsByShotIndex: ReadonlyMap<number, string>,
  combinedTranscript: string,
  pastedTextCorpus: string
): SnapshotCitationResult[] {
  const normalizedCombined = normalizeForMatch(combinedTranscript);
  const normalizedPastedText = normalizeForMatch(pastedTextCorpus);
  return areas.map((a) => {
    const quote = a.quote.trim();
    if (!quote) {
      return { area: a.area, score: a.score, quote: a.quote, shotIndex: a.shotIndex, source: a.source, verified: false };
    }
    const normalizedQuote = normalizeForMatch(quote);
    const ownCorpus = a.source === "shot" ? transcriptsByShotIndex.get(a.shotIndex) : undefined;
    const verifiedAgainstOwnShot = ownCorpus ? normalizeForMatch(ownCorpus).includes(normalizedQuote) : false;
    const verifiedAgainstPastedText = a.source === "pasted" ? normalizedPastedText.includes(normalizedQuote) : false;
    const verified = verifiedAgainstOwnShot || verifiedAgainstPastedText || normalizedCombined.includes(normalizedQuote);
    // BLOCKER 2 fix: `source` must reflect which corpus actually verified the
    // quote, not the model's self-reported claim - a "pasted" citation whose
    // quote only matched the student transcript (the combined-transcript
    // fallback) must not render as rubric evidence.
    const resolvedSource: SnapshotCitationResult["source"] = verifiedAgainstPastedText
      ? "pasted"
      : verifiedAgainstOwnShot
        ? "shot"
        : "unknown";
    return { area: a.area, score: a.score, quote: a.quote, shotIndex: a.shotIndex, source: resolvedSource, verified };
  });
}
