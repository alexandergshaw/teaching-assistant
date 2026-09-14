// Deterministic single-item selection (backlog-automation.md section 6).
// Ordering rule: state, then blocked_by topology, then id.
//
// Blocker B2 / Ruling BA-3 is the whole point of this module's return type:
// a selector that drops what it cannot classify reports "nothing owed" over
// a queue full of real work. `selectNext` therefore never returns a bare
// item-or-undefined - it returns one of three tagged results, and "empty" is
// always accompanied by a reason distinguishing "there is truly nothing" from
// "everything left is blocked" from "nothing is scoped enough to work."

import type { BacklogItem } from "./types";
import { isScoped } from "./types";

export type NextResult =
  | { type: "actionable"; item: BacklogItem }
  | { type: "unscoped"; count: number }
  | { type: "empty"; reason: string };

/** Ids in `blocked_by` that still name an item present in `items`. An id that no longer appears is resolved - closing an item DELETES it (Ruling BA-8), so absence IS the "done" signal. */
function unresolvedBlockers(item: BacklogItem, items: BacklogItem[]): string[] {
  const present = new Set(items.map((i) => i.id));
  return item.blocked_by.filter((id) => present.has(id));
}

export function selectNext(items: BacklogItem[]): NextResult {
  const actionable = items.filter((i) => i.state === "actionable");

  const ready = actionable.filter((i) => isScoped(i) && unresolvedBlockers(i, items).length === 0);
  if (ready.length > 0) {
    const sorted = [...ready].sort((a, b) => a.id.localeCompare(b.id));
    return { type: "actionable", item: sorted[0] };
  }

  const unscopedActionable = actionable.filter((i) => !isScoped(i));
  const unscopedState = items.filter((i) => i.state === "unscoped");
  const unscopedCount = unscopedActionable.length + unscopedState.length;
  if (unscopedCount > 0) {
    return { type: "unscoped", count: unscopedCount };
  }

  const blocked = actionable.filter((i) => isScoped(i) && unresolvedBlockers(i, items).length > 0);
  if (blocked.length > 0) {
    return {
      type: "empty",
      reason: `${blocked.length} actionable item(s) are scoped but blocked: ${blocked
        .map((i) => `${i.id} (blocked_by ${JSON.stringify(unresolvedBlockers(i, items))})`)
        .join(", ")}`,
    };
  }

  const ownerCount = items.filter((i) => i.state === "owner").length;
  const verificationCount = items.filter((i) => i.state === "verification").length;
  return {
    type: "empty",
    reason:
      `no actionable items remain - ${ownerCount} owner-gated, ${verificationCount} verification-gated, ` +
      "0 unscoped. This is the one legitimate stop: everything left needs someone other than an agent.",
  };
}
