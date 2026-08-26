// Pure guard for the "confirm a suggested binding" defect (Slice A, U9.36/37 -
// docs/repo-grades-ux-overhaul-acceptance-criteria.md). Its contract is
// defined by repoGradesBindingConfirm.test.ts; read that file first if this
// comment and the test ever disagree - the test wins.
//
// THE DEFECT. The course-table roster link (rosterUsernameOverlay.ts:144-147)
// pushes rows with `canvasUserId: null` by construction. Those repos derive a
// single binding candidate whose `canvasUserId` is the empty string
// (src/lib/repo-student-bindings.ts's tierRosterLoginId/tierRosterNameSlug
// tiers below suggestOne, feeding a "suggested" state), so the grid offers
// "Confirm binding" and the batch panel offers "Confirm all N suggested
// bindings" for a row that CANNOT actually be confirmed: writing a binding
// with `canvasUserId: ""` is re-derived on the very next render
// (repo-student-bindings.ts:156-159, the `isNumeric` check on the stored
// row) as UNBOUND, not confirmed. The row loses its suggestion and its
// confirm button in the same click that was supposed to move it forward.
//
// THE RULE, verified against repo-student-bindings.ts:156-159 rather than
// assumed: a stored binding round-trips as CONFIRMED only when its
// canvasUserId, trimmed, is a non-empty run of digits. That is exactly
// `isConfirmableCandidate` below. It is deliberately re-stated here as a
// literal rather than imported from repo-student-bindings.ts, matching this
// project's standing lesson that a guard importing the very logic it exists
// to check can agree with a later regression there instead of catching it.

/** One suggested candidate a confirm action would write as a binding. */
export interface ConfirmableBindingCandidate {
  canvasUserId: string;
  name: string;
}

/** One row a confirm path (per-row or batch) is considering. `candidate` is
 * optional because a "suggested" row's type does not guarantee one is
 * present (RepoGradeRow's own candidates array can be empty even in that
 * state), and that absence must be handled explicitly, not by throwing. */
export interface ConfirmableBindingRow {
  repo: string;
  candidate?: ConfirmableBindingCandidate;
}

/** A row cleared to confirm, carrying the NORMALIZED (trimmed) Canvas user id
 * the caller should actually write - `applyRepoGradeBinding` stores whatever
 * it is handed verbatim, so a padded id like " 41 " must be trimmed here,
 * once, rather than left to every call site to remember. */
export interface ConfirmableBinding {
  repo: string;
  candidate: ConfirmableBindingCandidate;
  canvasUserId: string;
  student: string;
}

/** A row that must NOT be sent to the binding write, with a human-readable
 * reason a surface can display. */
export interface BlockedBindingConfirmation {
  repo: string;
  candidate?: ConfirmableBindingCandidate;
  reason: string;
}

export interface PartitionedBindingConfirmations {
  confirmable: ConfirmableBinding[];
  blocked: BlockedBindingConfirmation[];
}

export interface ConfirmableBindingSummary {
  confirmable: number;
  blocked: number;
  /** Empty when nothing was blocked; otherwise names the count and why, so a
   * batch-confirm surface never has to invent its own wording. */
  blockedDetail: string;
}

const CONFIRMABLE_ID_PATTERN = /^\d+$/;

/** The frozen rule: only a non-empty, trimmed, all-digit Canvas user id
 * survives the binding deriver as confirmed. Accepts a missing candidate
 * (undefined/null) rather than throwing, since callers pass a row's possibly-
 * absent top candidate straight through. */
export function isConfirmableCandidate(
  candidate: ConfirmableBindingCandidate | null | undefined
): boolean {
  if (!candidate) return false;
  return CONFIRMABLE_ID_PATTERN.test(candidate.canvasUserId.trim());
}

/** Splits a batch of candidate rows into what a confirm action may safely
 * send (`confirmable`) and what it must refuse, with a reason (`blocked`).
 * Every input row lands in exactly one list, in input order. */
export function partitionConfirmableBindings(
  rows: readonly ConfirmableBindingRow[]
): PartitionedBindingConfirmations {
  const confirmable: ConfirmableBinding[] = [];
  const blocked: BlockedBindingConfirmation[] = [];

  for (const row of rows) {
    if (!row.candidate) {
      blocked.push({ repo: row.repo, candidate: undefined, reason: "no candidate to confirm" });
      continue;
    }
    if (!isConfirmableCandidate(row.candidate)) {
      blocked.push({ repo: row.repo, candidate: row.candidate, reason: "no Canvas user id" });
      continue;
    }
    confirmable.push({
      repo: row.repo,
      candidate: row.candidate,
      canvasUserId: row.candidate.canvasUserId.trim(),
      student: row.candidate.name,
    });
  }

  return { confirmable, blocked };
}

/** Describes a `blocked` list as one sentence naming the total count and
 * every distinct reason with its own count, so a batch confirm can never
 * silently drop rows behind a single opaque number. Generic over whatever
 * reason strings the caller's `blocked` entries carry - it does not assume
 * they came from `partitionConfirmableBindings`. */
export function describeBlockedConfirmations(
  blocked: readonly Pick<BlockedBindingConfirmation, "reason">[]
): string {
  if (blocked.length === 0) return "";

  const countsByReason = new Map<string, number>();
  for (const entry of blocked) {
    countsByReason.set(entry.reason, (countsByReason.get(entry.reason) ?? 0) + 1);
  }
  const breakdown = Array.from(countsByReason.entries())
    .map(([reason, count]) => `${count} ${reason}`)
    .join(", ");

  return `${blocked.length} binding${blocked.length === 1 ? "" : "s"} could not be confirmed: ${breakdown}.`;
}

/** What a batch "Confirm all suggested bindings" button must derive its
 * label AND its payload from - the same call, so the two can never disagree.
 * THE DEFECT THIS PREVENTS: a button labelled from a raw suggested-row count
 * while the click handler separately filters that list down to nothing,
 * leaving an instructor who sees "Confirm all 11 suggested bindings" met
 * with "No bindings to confirm." after clicking it. */
export function confirmableBindingSummary(
  rows: readonly ConfirmableBindingRow[]
): ConfirmableBindingSummary {
  const { confirmable, blocked } = partitionConfirmableBindings(rows);
  return {
    confirmable: confirmable.length,
    blocked: blocked.length,
    blockedDetail: describeBlockedConfirmations(blocked),
  };
}
