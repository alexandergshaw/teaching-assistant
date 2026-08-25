// Scheduled publishing from Modules: the pure decisions behind "commit" -
// the second half of the draft/review/commit flow docs/scheduled-publishing-
// from-modules-acceptance-criteria.md's F10 describes ("the refusal is
// surfaced before the instructor commits... committing is an informed act").
//
// PURE ONLY. No Canvas call, no Supabase call, no clock read - every function
// here operates on data its caller already has, so it is directly testable
// in node-env vitest with no fakes beyond plain objects. The impure half (the
// actual Canvas unpublish write and the `scheduleRelease` insert) lives in
// src/app/actions/scheduled-releases.ts's commitScheduledReleaseAction,
// which calls these functions rather than re-deciding any of this inline -
// mirrors this codebase's release-runner.ts / scheduled-releases.ts split
// (pure decisions in one file, thin I/O wrappers in another).
//
// -----------------------------------------------------------------------
// F10's THREE COMMIT-TIME DECISIONS THIS FILE OWNS
// -----------------------------------------------------------------------
// 1. WHICH TARGETS TO ATTEMPT (`selectCommitTargets`). F10's target
//    expansion (release-plan.ts's buildReleaseTargets) already dedupes a
//    selection down to one target per (kind, id) before the instructor ever
//    sees a review row, but the commit action receives a plain
//    `ReleaseTargetRef[]` over the wire from whatever called it - nothing
//    stops a caller from sending the same target twice (a stale double
//    click, a client bug, or simply skipping the plan step and calling
//    commit directly). Re-applying the same dedupe defensively at the one
//    point that actually writes to Canvas and to the database is cheap
//    insurance against double-unpublishing or double-scheduling one target,
//    and doing it as its own named, testable step (rather than an inline
//    `Set` the commit loop happens to build) is what makes "the dedupe step
//    was deleted" a one-line sabotage a test catches, per this repo's
//    standing preference for separating an invariant from the traversal
//    that could accidentally drop it.
// 2. HOW A PER-TARGET FAILURE IS CLASSIFIED (`classifyCommitFailure`).
//    Mirrors `classifyReleaseFailure` in release-runner.ts byte-for-byte in
//    technique (a thrown Error's message, a String() coercion for anything
//    else, and a hostile-value backstop that itself cannot throw) - the two
//    are not the same function only because release-runner.ts is not part of
//    this chunk's edit set and importing a "runner" concept into a "commit"
//    module would blur which file owns which decision.
// 3. WHAT THE SUMMARY SAYS (`summarizeCommitResults`). Tallies a finished
//    commit's per-target outcomes into the exact `{ committed, failed }`
//    shape `commitScheduledReleaseAction` returns to its caller.
//
// -----------------------------------------------------------------------
// F10's REFUSAL DECISION, ENCODED HERE SO IT IS NOT JUST A COMMENT
// -----------------------------------------------------------------------
// "A target Canvas will refuse to hide is shown as such [in the review step,
// built by release-plan.ts]... The release itself is still scheduled for a
// refused target: publishing later is harmless." By the time commit runs,
// the instructor has already seen every refusal in review and chose to
// proceed anyway - so a FAILED unpublish attempt at commit time must never
// itself stop that target from being scheduled. `CommitUnpublishOutcome`
// below is the explicit, testable shape of that decision: an unpublish
// attempt's own success or failure is recorded for visibility, but it is
// NEVER what decides whether the target's `scheduled_releases` row gets
// written - only a failure of the SCHEDULING step itself (the database
// write) makes a target land in `failed`. `describeUnpublishOutcome` turns
// the caught unpublish error (if any) into the same classified string
// `classifyCommitFailure` would produce, so a caller that wants to log or
// display "this one is still visible for now" has real text to show,
// without that text ever gating scheduling.

import type { ReleaseTargetRef } from "@/lib/release-plan";

// ---------------------------------------------------------------------------
// Decision 1: which targets to attempt.

/**
 * Collapse `targets` down to one entry per selectionKey, keeping the FIRST
 * occurrence - selectionKey is the caller-facing identity release-plan.ts's
 * `ReleaseTargetRef` already carries for exactly this purpose (it is what
 * `reconcileReleasePlanWithSelection` keys its own dedupe/lookup on), so
 * reusing it here rather than re-deriving a (kind, id) string keeps this
 * file's notion of "the same target" identical to release-plan.ts's.
 */
export function selectCommitTargets(targets: readonly ReleaseTargetRef[]): ReleaseTargetRef[] {
  const seen = new Set<string>();
  const deduped: ReleaseTargetRef[] = [];
  for (const target of targets) {
    if (seen.has(target.selectionKey)) continue;
    seen.add(target.selectionKey);
    deduped.push(target);
  }
  return deduped;
}

// ---------------------------------------------------------------------------
// Decision 2: how a per-target failure is classified.

/**
 * Total conversion of a caught value to a display-ready failure string.
 * Mirrors `classifyReleaseFailure` in release-runner.ts in technique (an
 * Error's own message, String() for anything else, and a backstop for a
 * value whose own String() coercion throws) - kept as this file's own
 * function rather than an import because release-runner.ts is outside this
 * chunk's edit set and the two concepts ("a release run failed" vs "a commit
 * step failed") are deliberately kept namespaced to the file that owns each
 * decision.
 */
export function classifyCommitFailure(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "Unknown error (could not be converted to a string).";
  }
}

// ---------------------------------------------------------------------------
// F10's refusal decision: an unpublish attempt's outcome is recorded, but
// never gates scheduling.

export type CommitUnpublishOutcome = { ok: true } | { ok: false; detail: string };

/**
 * Turn a caught unpublish error (or its absence) into a `CommitUnpublishOutcome`.
 * Called by the action for every target BEFORE it writes that target's
 * `scheduled_releases` row - never after, and never conditionally: F10 is
 * explicit that a refused/failed unpublish does not stop the schedule, so
 * the action calls this purely to have something honest to log or return
 * alongside a successful commit, not to decide whether to proceed.
 */
export function describeUnpublishOutcome(err: unknown): CommitUnpublishOutcome {
  if (err === null || err === undefined) return { ok: true };
  return { ok: false, detail: classifyCommitFailure(err) };
}

// ---------------------------------------------------------------------------
// Decision 3: what the summary says.

export interface CommitTargetOutcome {
  selectionKey: string;
  status: "committed" | "failed";
  /** Present only for "failed" - the classified scheduling failure (never
   * the unpublish outcome; see describeUnpublishOutcome's own comment for
   * why the two are kept separate). */
  reason?: string;
}

export interface CommitSummary {
  committed: number;
  failed: Array<{ selectionKey: string; reason: string }>;
}

/**
 * Tally a finished commit's per-target outcomes into the exact shape
 * `commitScheduledReleaseAction` returns. A "failed" outcome with no
 * `reason` (should never happen, but this must not silently drop the row
 * from the report if it does) falls back to a generic message rather than
 * an empty string, matching this codebase's "never a silently blank detail"
 * convention (e.g. classifyReleaseFailure's own hostile-value backstop).
 */
export function summarizeCommitResults(outcomes: readonly CommitTargetOutcome[]): CommitSummary {
  let committed = 0;
  const failed: Array<{ selectionKey: string; reason: string }> = [];
  for (const outcome of outcomes) {
    if (outcome.status === "committed") {
      committed += 1;
    } else {
      failed.push({ selectionKey: outcome.selectionKey, reason: outcome.reason ?? "Could not schedule this release." });
    }
  }
  return { committed, failed };
}

// ---------------------------------------------------------------------------
// Shaping one target's row-write input. Not itself a "decision" in the same
// sense as the three above, but pure and worth testing in isolation: this is
// the ONE place that narrows release-plan.ts's rich ReleaseTargetRef (which
// carries moduleId/displayName/selectionKey for the UI's benefit) down to the
// (kind, id) pair scheduled-releases.ts's ScheduleReleaseInput actually
// wants, so a future field added to one shape cannot silently leak into the
// other without a caller noticing here first.

export interface CommitRowInput {
  courseUrl: string;
  courseAcronym: string | null;
  /** Narrower than release-plan.ts's ReleaseTargetRef on purpose - the
   * durable row stores identity, not display text. `moduleId` is part of that
   * identity (F10), and travels in scheduleRelease's own single write. */
  target: { kind: ReleaseTargetRef["kind"]; id: number; moduleId: number | null };
  releaseAt: string;
}

export function buildCommitRowInput(
  target: ReleaseTargetRef,
  releaseAt: string,
  courseUrl: string,
  courseAcronym: string | null
): CommitRowInput {
  return {
    courseUrl,
    courseAcronym,
    // moduleId travels WITH the row, in scheduleRelease's own single write.
    // It used to be applied as a separate follow-up update, because this
    // slice did not own the durable layer - but a rare failure on that second
    // write marked the target "failed" to the instructor even though its row
    // was already written and WOULD still fire. Misreporting a scheduled
    // write as failed is precisely the confusion this feature exists to
    // remove, so the durable layer took the field instead. One write, one
    // truth.
    target: { kind: target.kind, id: target.id, moduleId: target.moduleId ?? null },
    releaseAt,
  };
}

