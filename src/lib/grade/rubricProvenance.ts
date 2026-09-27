/**
 * A39 wave 2: the version-provenance half of DECISION 3's leverage claim.
 * "If the rubric is persisted without recording which version graded which
 * submission, this decision buys convenience and no leverage at all"
 * (docs/owner-decisions-2026-09-23.md DECISION 3).
 *
 * W2-3, the removal test: this function reads ONLY the fields already
 * stamped onto the run by engine.ts (rubricUsed/rubricFingerprint) - never
 * rubric-memory.ts's store. Mutating a stored rubric after the run completed
 * must never change what a past run reports it was graded against.
 */

import type { GradingRun } from "./types";

/** Everything RubricProvenance.tsx needs off a run: whether there is
 *  anything to show, the exact text, and a short, stable form of the
 *  fingerprint (the whole hash is too long to read; the first 12 hex
 *  characters are unique enough to tell two rubrics apart at a glance). */
export function describeRunRubricProvenance(
  run: Pick<GradingRun, "rubricUsed" | "rubricFingerprint">
): string | null {
  if (!run.rubricUsed) return null;
  const excerpt = excerptRubric(run.rubricUsed);
  const version = run.rubricFingerprint ? run.rubricFingerprint.slice(0, 12) : "unknown";
  // The "Rubric used" literal itself lives in RubricProvenance.tsx's JSX,
  // not here - W2-8's instrument reads that file as source text, so the
  // required literal has to be visible there rather than only inside a
  // string this function returns.
  return `${excerpt} (version ${version})`;
}

function excerptRubric(rubric: string): string {
  const normalized = rubric.trim().replace(/\s+/g, " ");
  const MAX_CHARS = 80;
  if (normalized.length <= MAX_CHARS) return normalized;
  return `${normalized.slice(0, MAX_CHARS)}...`;
}
