// Snapshot grading, N1 (suggest-and-confirm shot roles - Ruling H1-E, docs
// for this item at n1-acceptance-criteria.md). Pure leaf: no React/DOM
// imports, so every decision below is unit-testable - this repo's vitest is
// node-env and renders no component (docs/loop/this-repo.md), so anything
// written inside the panel or a "use client" hook would be untestable by
// construction (item 10).
//
// THE SAFETY PROPERTY (AC-1): a suggested role must never become the
// effective role without an explicit instructor action, with no confidence
// threshold and no exception. This file is where that property lives: it
// never reads or writes SnapshotShot.role except inside acceptAllSuggestions
// below, which exists ONLY to be called by one explicit "accept" click - it
// is never invoked from the read path itself.

import type { SnapshotRole, SnapshotShot } from "./snapshot-shot";
import type { ShotReadEntry } from "./snapshot-row";

export interface PendingRoleSuggestion {
  shotId: string;
  suggestedRole: SnapshotRole;
  /** The transcript fragment the suggestion is based on (item 7/AC-8) - a
   *  suggestion is never rendered as a bare role label, since a one-click
   *  bulk accept with no visible evidence is a rubber stamp. */
  basis: string;
}

const BASIS_MAX_LENGTH = 200;

/** Truncates a transcript into a short evidence fragment for display next
 *  to a suggestion. Exported so it can be unit-tested independently of the
 *  derivation below (empty input, happy path, and the truncation boundary). */
export function truncateBasis(transcript: string): string {
  const trimmed = transcript.trim();
  if (trimmed.length <= BASIS_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, BASIS_MAX_LENGTH).trimEnd()}...`;
}

/**
 * Derives the pending suggestion list from the read pass's own per-shot
 * entries, keyed by ShotReadEntry.shotId (item 3 - REUSES the id captured at
 * read time, Ruling R1-E; buildIdByGlobalIndex from snapshot-shot.ts is
 * FORBIDDEN for this purpose - it is pure array position
 * (`shots.map((shot, i) => [i + 1, shot.id])`), safe only synchronously at
 * grade time, and using it here would silently re-point a suggestion at the
 * wrong shot after a delete or reorder between Read and Accept).
 *
 * A shot gets NO suggestion entry (never a bare/empty one) when: the model
 * declined (entry.roleSuggestion is absent - item 2/AC-2, "unsure" and any
 * unrecognised value both parse to no suggestion, never to "other" or the
 * armed role), or the shot has no transcript to show as a basis (item 11/Q1
 * - an unreadable shot has no basis, so it is not offered one).
 */
export function buildPendingRoleSuggestions(
  shotReads: ReadonlyMap<number, ShotReadEntry>
): PendingRoleSuggestion[] {
  const suggestions: PendingRoleSuggestion[] = [];
  for (const entry of shotReads.values()) {
    if (!entry.roleSuggestion) continue;
    if (!entry.transcript.trim()) continue;
    suggestions.push({
      shotId: entry.shotId,
      suggestedRole: entry.roleSuggestion,
      basis: truncateBasis(entry.transcript),
    });
  }
  return suggestions;
}

/**
 * THE item's whole safety property, made executable (AC-1/AC-4/Ruling
 * N1-R4): the ONLY function that ever writes a suggested role into
 * shot.role. It runs ONLY when called - never on a timer, never on a
 * confidence threshold, never conditioned on the shot's current role - and
 * ONE call resolves every pending suggestion in the batch (item 6): there is
 * no per-shot variant, because a design that replaces per-shot arming with
 * per-shot confirming delivers nothing (this item exists to remove exactly
 * that per-shot cost). A suggestion naming a shot no longer present (deleted
 * between read and accept) is a no-op for that entry, not an error - and a
 * shot with no suggestion (the model was unsure, or never offered one) is
 * returned unchanged, so accepting the batch never resolves an "unsure" shot
 * (item 11/Q3).
 */
export function acceptAllSuggestions(
  shots: readonly SnapshotShot[],
  suggestions: readonly PendingRoleSuggestion[]
): SnapshotShot[] {
  const roleByShotId = new Map(suggestions.map((s) => [s.shotId, s.suggestedRole]));
  return shots.map((shot) => {
    const suggested = roleByShotId.get(shot.id);
    return suggested ? { ...shot, role: suggested } : shot;
  });
}
