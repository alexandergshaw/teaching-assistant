// Scheduled publishing from Modules: the pure decisions behind "cancel" -
// the requirement docs/scheduled-publishing-from-modules-acceptance-
// criteria.md's F11 names and contracts. F11.1 is the whole point: committing
// a release UNPUBLISHES the selected content immediately (F4), so a cancel
// that merely deletes the row leaves every target hidden - permanently, with
// no scheduled event left to reveal it. Cancelling must therefore be the
// honest inverse of commit (restore the published state commit changed), not
// a row deletion, and it must say what it did rather than leave the
// instructor guessing.
//
// PURE ONLY, mirroring release-commit.ts's own split: no Canvas call, no
// Supabase call, no clock read - every function here operates on data its
// caller already has (the CAS result, the row's persisted `wasPublished`,
// whether a restore attempt was made and how it went). The impure half (the
// actual `cancelScheduledRelease` CAS and the Canvas restore write) lives in
// src/app/actions/scheduled-releases.ts's cancelScheduledReleaseAction, which
// calls these functions rather than re-deciding any of this inline.
//
// -----------------------------------------------------------------------
// THIS IS THE SHAPE THE CONSUMING UI ALREADY CODES AGAINST
// -----------------------------------------------------------------------
// src/app/components/workflows/ScheduledReleasesPanel.tsx and its
// scheduledReleasesPanelLogic.ts (sibling UI files, written concurrently, not
// owned by this chunk) import `CancelReleaseResult` from this file directly
// and switch on `result.status`, reading `result.reason` verbatim for the
// two non-restored cases. `cancelScheduledReleaseAction` returns this type
// DIRECTLY, never a `{ error: string }` alternative - the panel's
// `handleCancel` calls it with no separate error branch, so every failure
// mode (a lost CAS race, a row that does not exist, an unexpected exception)
// is modeled as "could-not-cancel" with an honest `reason`.
// `listScheduledReleasesAction` returns the raw `{ releases: ScheduledRelease[]
// } | { error: string }` (the panel DOES check `"error" in result` there) -
// the UI derives every displayed fact straight from `ScheduledRelease`'s own
// fields, so there is no separate row-shaping type to keep in sync.
//
// -----------------------------------------------------------------------
// F11's THREE OUTCOMES, AND WHY A RESTORE FAILURE STAYS
// "CANCELLED-WITHOUT-RESTORE"
// -----------------------------------------------------------------------
// 1. COULD NOT CANCEL AT ALL (`couldNotCancelOutcome`). F11.3: cancel is a
//    compare-and-set on `pending`, not a delete. A row already claimed, done,
//    failed, or cancelled loses that race, and this reports which, honestly,
//    from the row's own current status, rather than a bare failure that
//    reads as "nothing happened".
// 2. CANCELLED, RESTORE NOT ATTEMPTED (`shouldAttemptRestore` +
//    `cancelledWithoutRestoreOutcome`). F11.2: a row's persisted
//    `wasPublished` is either `false` (already hidden when scheduled -
//    restoring would publish something the instructor never had visible) or
//    `null` (written before this column existed - cancel must say it could
//    not tell, never guess). Both skip the restore, for distinguishable
//    reasons, but read as the SAME `status` ("cancelled-without-restore")
//    since both mean "cancelled, nothing changed on Canvas" - only the
//    `reason` text tells them apart.
// 3. CANCELLED, RESTORE ATTEMPTED (`cancelledAndRestoredOutcome` /
//    `cancelledButRestoreFailedOutcome`). THE SABOTAGE-PRONE ASSERTION THIS
//    BRIEF NAMES EXPLICITLY: entry 340 recorded this exact defect for
//    commit's own unpublish step (a failure in a write that does not gate the
//    outcome must never be misreported as a failure of the write that DOES
//    gate it), and F11 repeats the same shape for cancel. The CAS already
//    succeeded by the time a restore is even attempted, so a restore failure
//    must land as "cancelled-without-restore" (with the failure folded into
//    `reason`) - NEVER as "could-not-cancel", which would tell the
//    instructor their cancel itself failed when the row is, in fact,
//    cancelled.

import type { ReleaseStatus } from "@/lib/scheduled-releases";

// ---------------------------------------------------------------------------
// Result shape - see this file's header for why it mirrors the panel's own
// already-landed usage exactly.

export type CancelReleaseResult =
  | { status: "cancelled-and-restored" }
  | { status: "cancelled-without-restore"; reason: string }
  | { status: "could-not-cancel"; reason: string };

// ---------------------------------------------------------------------------
// Outcome 1: the CAS was lost, or the row could not be acted on at all
// (F11.3).

/**
 * Describe WHY a cancel could not proceed, from the row's own current
 * status (read fresh by cancelScheduledRelease right after the CAS failed,
 * per that function's own doc comment) - `null` only when no such row exists
 * for this user at all. Distinguishing "it is running right now" from "it
 * already ran" from "it was already cancelled" is F11.3's own requirement:
 * a lost race must read honestly, never as an undifferentiated failure.
 */
function describeLostRaceReason(currentStatus: ReleaseStatus | null): string {
  switch (currentStatus) {
    case "claimed":
      return "it is being processed right now.";
    case "done":
      return "it has already run.";
    case "failed":
      return "it already ran and failed, so there is nothing left to cancel.";
    case "cancelled":
      return "it was already cancelled.";
    case "pending":
      // Should not happen (a "pending" row is exactly what the CAS should
      // have won) - kept as an honest fallback rather than an impossible
      // branch that silently falls through to the generic message below.
      return "it could not be cancelled for an unknown reason.";
    default:
      return "it could not be found.";
  }
}

/**
 * The row could not be transitioned pending -> cancelled. `currentStatus` is
 * the row's own status if one was found (so the reason can be specific), or
 * `null` if no row exists for this id/user at all.
 */
export function couldNotCancelOutcome(currentStatus: ReleaseStatus | null = null): CancelReleaseResult {
  return { status: "could-not-cancel", reason: `This release could not be cancelled - ${describeLostRaceReason(currentStatus)}` };
}

// ---------------------------------------------------------------------------
// Whether a restore should even be attempted (F11.2).

/**
 * True only when the row's persisted `wasPublished` is the literal `true`.
 * `false` (already hidden when scheduled - nothing to restore) and `null`
 * (written before this column existed - cannot say) both resolve to "do not
 * attempt", but for reasons that must stay distinguishable to the instructor
 * - see `describeSkippedRestoreReason` below, the only place that
 * distinction is spelled out in prose.
 */
export function shouldAttemptRestore(wasPublished: boolean | null): boolean {
  return wasPublished === true;
}

function describeSkippedRestoreReason(wasPublished: boolean | null): string {
  if (wasPublished === null) {
    return "this release was scheduled before visibility tracking existed, so cancelling could not tell whether to restore it - nothing was changed on Canvas for this target.";
  }
  return "this target was already hidden when the release was scheduled, so there is nothing to restore.";
}

// ---------------------------------------------------------------------------
// Outcome 2: cancelled, restore not attempted (F11.2).

/**
 * The row was cancelled (the CAS was won) and no restore was attempted,
 * because `wasPublished` says either there was nothing to restore (`false`)
 * or that it cannot be known (`null`) - `shouldAttemptRestore` already
 * decided which; this only formats the result. Never called when
 * `wasPublished === true`.
 */
export function cancelledWithoutRestoreOutcome(wasPublished: boolean | null): CancelReleaseResult {
  return { status: "cancelled-without-restore", reason: describeSkippedRestoreReason(wasPublished) };
}

// ---------------------------------------------------------------------------
// Outcome 3a: cancelled, restore succeeded (F11.1 - the honest inverse of
// commit).

export function cancelledAndRestoredOutcome(): CancelReleaseResult {
  return { status: "cancelled-and-restored" };
}

// ---------------------------------------------------------------------------
// Outcome 3b: cancelled, restore FAILED. Entry 340's lesson applied to
// cancel - see this file's header for the full reasoning. `status` stays
// "cancelled-without-restore", identical to the skipped-restore outcome
// above, NEVER "could-not-cancel" - the row IS cancelled either way, and only
// the reason text tells the two "without-restore" cases apart.

export function cancelledButRestoreFailedOutcome(restoreFailureReason: string): CancelReleaseResult {
  return {
    status: "cancelled-without-restore",
    reason: `Restoring the target's visibility on Canvas failed: ${restoreFailureReason}`,
  };
}
