// Repo Grades view - U12.52 and the pre-existing postability defect it
// exposes. Pure, no I/O, no React - this module decides, for one cell's raw
// score text and one assignment's pointsPossible, the EXACT number that would
// reach Canvas if this cell were posted right now, and the sentence that
// tells the instructor which number that is. repoGradePostScore.test.ts is
// this module's specification - read that file's header comment for the full
// framing of why both halves below exist.
//
// THE RULE:
//   - a bare number (whatever the instructor typed, or hand-retyped from a
//     graded fraction) posts UNCHANGED - it is an explicit human decision
//     about a specific assignment and must never be silently rescaled.
//   - an "earned/possible" fraction (exactly the shape a freshly graded
//     cell's score is in - src/lib/grade/types.ts:29's totalScore, e.g.
//     "350/400") is converted to a percentage and scaled onto the
//     assignment's own pointsPossible, because the denominator a generated
//     rubric invents is arbitrary (see github-repos.ts:680's header comment
//     on the companion fairness fix) - posting the raw numerator would send
//     different numbers to different students for equivalent work.
//   - when pointsPossible is unknown (null) and the score is a fraction, this
//     REFUSES rather than guessing - posting a percentage into an assignment
//     whose point scale this app cannot see could send the wrong number to a
//     live, no-undo gradebook.
//
// Reuses repoGradeScoreDisplay.ts's parseScoreFraction rather than
// reimplementing the "earned/possible" regex a second time in this same
// folder - that module already owns reading a totalScore-shaped string into
// its earned/possible pair, and already treats a zero denominator as
// unreadable (returns null), exactly the guard this module also needs.
import { parseScoreFraction } from "./repoGradeScoreDisplay";

export type PostScoreResult =
  | { ok: true; score: number; rescaled: boolean }
  | { ok: false; reason: string };

/**
 * Decides the exact number that would post to Canvas for one cell's raw
 * score text, given the assignment's pointsPossible (null when it is not
 * known - the column has no mapped assignment, or the mapped assignment
 * itself carries no points value).
 *
 * A value with no "/" is read exactly the way repo-grade-postability.ts
 * always has - `Number(trimmed)` guarded by `Number.isFinite` - so every
 * bare-number case that predicate already relied on (decimals, zero, a value
 * exceeding pointsPossible - extra credit is the instructor's call) keeps
 * behaving identically, and pointsPossible is never even consulted for this
 * branch.
 *
 * A value containing "/" is read as an earned/possible fraction and SCALED:
 * `earned/possible` becomes a percentage, then that percentage is applied to
 * `pointsPossible` and rounded to two decimal places, so a repeating decimal
 * (e.g. 2/3) never reaches a live gradebook as a long float.
 */
export function resolvePostScore(raw: string, pointsPossible: number | null): PostScoreResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "Enter a score before posting." };

  if (!trimmed.includes("/")) {
    const bare = Number(trimmed);
    if (!Number.isFinite(bare)) return { ok: false, reason: `"${raw}" is not a valid score.` };
    return { ok: true, score: bare, rescaled: false };
  }

  const fraction = parseScoreFraction(trimmed);
  if (!fraction) return { ok: false, reason: `"${raw}" is not a valid score.` };

  if (pointsPossible === null) {
    return {
      ok: false,
      reason:
        "This assignment's points possible is unknown, so a fraction score cannot be safely scaled to it - map this column to a Canvas assignment first.",
    };
  }
  if (!(pointsPossible > 0)) {
    return {
      ok: false,
      reason: `This assignment's points possible (${pointsPossible}) is not a positive value, so a fraction score cannot be scaled to it.`,
    };
  }

  const scaled = (fraction.earned / fraction.possible) * pointsPossible;
  const rounded = Math.round(scaled * 100) / 100;
  return { ok: true, score: rounded, rescaled: true };
}

/**
 * U12.52: the sentence a grid cell shows so the instructor can see exactly
 * which number a post would send, before it happens. Never re-derives the
 * decision - only describes whatever resolvePostScore just decided, so the
 * text shown here and the number an actual post would send can never
 * disagree.
 */
export function describePostScore(raw: string, pointsPossible: number | null): string {
  const result = resolvePostScore(raw, pointsPossible);
  if (!result.ok) return result.reason;
  if (!result.rescaled) return `Will post ${result.score}, exactly as typed.`;
  return `"${raw.trim()}" will post as ${result.score} out of ${pointsPossible} (scaled to the assignment's points).`;
}
