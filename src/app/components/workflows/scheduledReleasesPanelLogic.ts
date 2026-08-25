// Pure decisions behind ScheduledReleasesPanel.tsx -
// docs/scheduled-publishing-from-modules-acceptance-criteria.md F11.
//
// vitest here is node-env and collects only src/**/*.test.ts - nothing inside
// a component's JSX is ever exercised by a test (see RepoGradesLogPanel.tsx /
// repoGradesLog.ts for the established split this file follows: EVERY
// decision that determines what a row says or does lives here as a plain
// function, and the component only calls these and renders the result).
//
// F11.1 IS THE CONTRACT THIS FILE EXISTS TO PROTECT. Committing a release
// unpublishes its targets immediately (F4); cancelling is the honest inverse
// of that, not a row deletion, and every string below that describes a
// cancel action says so in "restore" terms rather than implying an undo it
// cannot perform. A row whose `wasPublished` is `null` predates that field
// (F11.2) and every helper below treats `null` the same as `false` for
// restore purposes - it must never guess "true".
//
// Reads against src/lib/scheduled-releases.ts's ScheduledRelease (the full
// row - listScheduledReleasesAction returns `{ releases: ScheduledRelease[] }`
// verbatim, per that action's own header: this UI derives every displayed
// fact from the row's own fields rather than a separately shaped list type)
// and src/lib/release-cancel.ts's CancelReleaseResult, a sibling file's
// three-case union (cancelled-and-restored / cancelled-without-restore /
// could-not-cancel) written, per its own header, to match this file's
// original `CancelResult` assumption exactly.

import type { ReleaseStatus, ReleaseTargetKind, ScheduledRelease } from "@/lib/scheduled-releases";
import type { CancelReleaseResult } from "@/lib/release-cancel";

// ---------------------------------------------------------------------------
// Target / course / time formatting.

/** The durable row only ever stored Canvas's own (kind, id) pair for a
 * target - never a display name (see ReleaseTargetRef in
 * scheduled-releases.ts) - so this is the most specific label the row alone
 * can support. Deliberately not a Canvas lookup: this panel renders from the
 * stored row only, matching F11.5's "per row" scope. */
export function formatReleaseTargetLabel(target: { kind: ReleaseTargetKind; id: number }): string {
  return target.kind === "module" ? `Module #${target.id}` : `Item #${target.id}`;
}

/** The course a release targets. `courseAcronym` is the friendlier,
 * institution-scoped label when present (the same field resolveCourse's
 * second argument takes); a row resolved by URL-host matching alone falls
 * back to the raw `courseUrl` rather than showing nothing. */
export function formatReleaseCourseLabel(release: { courseUrl: string; courseAcronym: string | null }): string {
  return release.courseAcronym ?? release.courseUrl;
}

/** The release instant in the reader's own locale (F11.5). Falls back to the
 * raw stored string if it will not parse, matching RepoGradesLogPanel's
 * formatEntryTime idiom - a row with an unexpected `releaseAt` is still worth
 * showing, and a thrown RangeError here would take the whole panel down. */
export function formatReleaseInstant(releaseAt: string): string {
  const parsed = new Date(releaseAt);
  if (Number.isNaN(parsed.getTime())) return releaseAt;
  return parsed.toLocaleString();
}

// ---------------------------------------------------------------------------
// Row status (F11.5's "status" column, and the "waiting for the next tick"
// wording F11.5 requires in place of "late").

export type ReleaseStatusTone = "neutral" | "success" | "danger";

export interface ReleaseStatusDisplay {
  label: string;
  tone: ReleaseStatusTone;
  /** A second line of detail under the badge - never the only place a fact
   * lives, so a row is scannable from the label alone and legible in full
   * from the hint. */
  hint: string;
}

/** Maps a tone to the existing ghBadge* class name (AutomationsPanel.tsx
 * already uses this vocabulary for "Needs attention" - see
 * page.module.css's .ghBadgeNeutral/.ghBadgeSuccess/.ghBadgeDanger). Returns
 * the class NAME, not the class itself, so this stays a plain string
 * decision the component looks up in its own styles object - this file
 * never imports a CSS module. */
export function releaseStatusBadgeClassName(tone: ReleaseStatusTone): "ghBadgeNeutral" | "ghBadgeSuccess" | "ghBadgeDanger" {
  if (tone === "success") return "ghBadgeSuccess";
  if (tone === "danger") return "ghBadgeDanger";
  return "ghBadgeNeutral";
}

/**
 * Per-row status text. F11.5's specific requirement: a pending release whose
 * instant has already passed is WAITING FOR THE NEXT TICK, not late or
 * broken - worded that way, and kept at the same calm `neutral` tone as an
 * ordinary pending row (a `danger` tone here would read as a problem this
 * row does not have).
 */
export function describeReleaseRowStatus(
  release: Pick<ScheduledRelease, "status" | "releaseAt" | "lastError">,
  now: Date
): ReleaseStatusDisplay {
  const status: ReleaseStatus = release.status;

  if (status === "pending") {
    const dueAt = Date.parse(release.releaseAt);
    const passed = !Number.isNaN(dueAt) && dueAt <= now.getTime();
    return passed
      ? {
          label: "Pending",
          tone: "neutral",
          hint: "The release time has passed but the scheduler has not ticked yet - this is expected, not an error. It will fire on the next tick.",
        }
      : { label: "Pending", tone: "neutral", hint: "Scheduled to fire at the release time above." };
  }

  if (status === "claimed") {
    return { label: "In progress", tone: "neutral", hint: "The scheduler has picked this up and is releasing it right now." };
  }

  if (status === "done") {
    return { label: "Released", tone: "success", hint: "This release fired successfully." };
  }

  if (status === "failed") {
    return {
      label: "Failed",
      tone: "danger",
      hint: release.lastError ?? "The release did not complete, and no further detail was recorded.",
    };
  }

  // "cancelled". Whether an earlier cancel's restore attempt actually
  // succeeded is a one-time OUTCOME (CancelReleaseResult, surfaced in the
  // note at the moment of cancelling) that the row itself does not retain a
  // separate record of - a row cancelled with `wasPublished: true` could
  // still have had its restore attempt FAIL (release-cancel.ts's
  // cancelledButRestoreFailedOutcome still leaves `status: "cancelled"` on
  // the row). Claiming "restored" here from `wasPublished` alone would risk
  // exactly that false positive, so this stays neutral and makes no restore
  // claim - the same "never guess" discipline F11.2 applies to a null
  // `wasPublished`, extended to a fact this row's shape cannot retain at all.
  return { label: "Cancelled", tone: "neutral", hint: "This release was called off before it fired." };
}

/** A row still ahead of the runner - "pending" (not yet due, or due but not
 * yet ticked) or "claimed" (mid-flight, per F11.3) - can be offered a Cancel
 * action. "done"/"failed"/"cancelled" are terminal: there is nothing left to
 * call off. A "claimed" row is still offered here rather than hidden,
 * because the CAS (cancelScheduledRelease) only ever transitions FROM
 * "pending" - attempting it on a "claimed" row loses the race and
 * couldNotCancelOutcome reports that honestly ("it is being processed right
 * now"), which is a better outcome for the instructor than hiding the button
 * and leaving them no way to even try. */
export function canCancelRelease(status: ReleaseStatus): boolean {
  return status === "pending" || status === "claimed";
}

// ---------------------------------------------------------------------------
// The restore preview and the cancel controls - F11.1's core requirement.

export interface CancelRestorePreview {
  willRestore: boolean;
  /** Always phrased in restore terms (F11.1) - never "this will delete the
   * reminder" or any wording that could read as a no-op. */
  text: string;
}

/**
 * Whether cancelling THIS row will restore the target's visibility, and the
 * honest sentence to show either way. `wasPublished === true` is the only
 * case that restores; `false` (already hidden when scheduled - F11.1's "a
 * target the commit found already unpublished is left alone") and `null`
 * (predates the field - F11.2) are both "will not restore", but for
 * different, distinctly-stated reasons - collapsing them would tell an
 * instructor with a `null` row that nothing changed, when the truth is this
 * app simply does not know.
 */
export function describeCancelRestorePreview(wasPublished: boolean | null): CancelRestorePreview {
  if (wasPublished === true) {
    return { willRestore: true, text: "Cancelling will restore it to published immediately - students will see it again." };
  }
  if (wasPublished === false) {
    return {
      willRestore: false,
      text: "This target was already hidden before the release was scheduled, so cancelling will leave it hidden - there is nothing to restore.",
    };
  }
  return {
    willRestore: false,
    text: "This release was scheduled before visibility tracking existed, so cancelling will NOT automatically restore it - check Canvas directly if it should be visible again.",
  };
}

/** The Cancel button's own label states its effect up front (F11.1: "the
 * button ... must say that, in those terms") rather than relying on the
 * confirm dialog alone to carry the whole warning. */
export function cancelButtonLabel(wasPublished: boolean | null): string {
  return wasPublished === true ? "Cancel & restore" : "Cancel (no restore)";
}

/**
 * The window.confirm text (F11.1): names the target and states plainly what
 * happens to its visibility, in the same restore/no-restore terms the button
 * and the row already use - a reader who only ever sees this dialog still
 * gets the complete, honest answer.
 */
export function buildCancelConfirmMessage(targetLabel: string, wasPublished: boolean | null): string {
  if (wasPublished === true) {
    return `Cancel the scheduled release for "${targetLabel}" and restore it to published right now? Students will be able to see it again immediately.`;
  }
  if (wasPublished === false) {
    return `Cancel the scheduled release for "${targetLabel}"? It was already hidden before this release was scheduled, so cancelling will leave it hidden - this will NOT restore anything.`;
  }
  return `Cancel the scheduled release for "${targetLabel}"? This release predates visibility tracking, so cancelling will NOT automatically restore it. Check Canvas directly if it should be visible again.`;
}

/**
 * Turns the server's CancelReleaseResult into the panel's one-line outcome
 * note. All three `status` values render distinctly (never collapsed) -
 * collapsing "cancelled-and-restored" into "cancelled-without-restore", or
 * either into "could-not-cancel", would hide from the instructor whether
 * their content is actually visible again, the exact failure this panel
 * exists to prevent. The server's own `reason` text is reused verbatim for
 * the two cases that carry one, rather than re-derived here, so the wording
 * release-cancel.ts's own tests already pin is never duplicated a second,
 * driftable time.
 */
export function describeCancelOutcome(
  result: CancelReleaseResult,
  targetLabel: string
): { kind: "success" | "warning" | "error"; text: string } {
  switch (result.status) {
    case "cancelled-and-restored":
      return { kind: "success", text: `Cancelled the release for "${targetLabel}" and restored it to published.` };
    case "cancelled-without-restore":
      return { kind: "warning", text: `Cancelled the release for "${targetLabel}". ${result.reason}` };
    case "could-not-cancel":
      return { kind: "error", text: `Could not cancel the release for "${targetLabel}": ${result.reason}` };
    default: {
      const exhaustive: never = result;
      throw new Error(`Unhandled cancel outcome: ${JSON.stringify(exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Row ordering.

const ACTIVE_STATUSES: ReadonlySet<ReleaseStatus> = new Set<ReleaseStatus>(["pending", "claimed"]);

/**
 * Active rows (pending/claimed - the ones an instructor might still act on)
 * sort first, soonest release first; terminal rows (done/failed/cancelled)
 * follow, most recently updated first. Removing the active-first split makes
 * a long history bury a single still-pending row on page 2 of a mixed list -
 * the sabotage check this ordering exists to prevent.
 */
export function sortScheduledReleasesForDisplay(releases: readonly ScheduledRelease[]): ScheduledRelease[] {
  return [...releases].sort((a, b) => {
    const aActive = ACTIVE_STATUSES.has(a.status);
    const bActive = ACTIVE_STATUSES.has(b.status);
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (aActive) return Date.parse(a.releaseAt) - Date.parse(b.releaseAt);
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}
