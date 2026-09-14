// Ruling BA-4 / Blocker B3: docs/BACKLOG.md numbered items PER SECTION (1.1,
// 2.1, 3.2, ...), so a bare per-section number is not a safe key - three
// sections could each have an item "1" and an escalation ledger keyed on that
// would silently merge them. backlog.yml ids are namespaced (V/D/N/R/G...)
// and must be globally unique across the WHOLE file. This module is the one
// place that checks it, by a duplicate COUNT - never "by looking".

import type { BacklogItem } from "./types";

export interface DuplicateIdReport {
  id: string;
  count: number;
}

/** Returns one entry per id that appears more than once, each carrying its exact count. Empty array is the only pass. */
export function findDuplicateIds(items: BacklogItem[]): DuplicateIdReport[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  }
  const duplicates: DuplicateIdReport[] = [];
  for (const [id, count] of counts) {
    if (count > 1) duplicates.push({ id, count });
  }
  return duplicates.sort((a, b) => a.id.localeCompare(b.id));
}
