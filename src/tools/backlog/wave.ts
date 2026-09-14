// 2-3 items whose `owns` globs do not intersect (backlog-automation.md
// section 6), intersected MECHANICALLY via glob-intersect.ts rather than
// eyeballed - docs/loop/parallel-disjointness.md is this repo's authority on
// why that matters and what "disjoint" has to mean.
//
// Same B2/BA-3 shape as next.ts: a wave selector that finds nothing must say
// WHY, not return an empty array indistinguishable from "no work exists."

import type { BacklogItem } from "./types";
import { isScoped } from "./types";
import { ownsIntersect } from "./glob-intersect";

export type WaveResult =
  | { type: "wave"; items: BacklogItem[] }
  | { type: "insufficient"; reason: string; readyCount: number };

const MIN_WAVE = 2;
const MAX_WAVE = 3;

function unresolvedBlockers(item: BacklogItem, items: BacklogItem[]): string[] {
  const present = new Set(items.map((i) => i.id));
  return item.blocked_by.filter((id) => present.has(id));
}

/** The pool `next` would also draw from: actionable, scoped, and not currently blocked by a still-open item. */
function readyPool(items: BacklogItem[]): BacklogItem[] {
  return items
    .filter((i) => i.state === "actionable" && isScoped(i) && unresolvedBlockers(i, items).length === 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function selectWave(items: BacklogItem[]): WaveResult {
  const pool = readyPool(items);

  if (pool.length < MIN_WAVE) {
    return {
      type: "insufficient",
      reason: `only ${pool.length} ready actionable item(s) - a wave needs at least ${MIN_WAVE}`,
      readyCount: pool.length,
    };
  }

  const wave: BacklogItem[] = [pool[0]];
  for (const candidate of pool.slice(1)) {
    if (wave.length >= MAX_WAVE) break;
    const combinedOwns = wave.flatMap((w) => w.owns);
    if (!ownsIntersect(candidate.owns, combinedOwns)) {
      wave.push(candidate);
    }
  }

  if (wave.length < MIN_WAVE) {
    return {
      type: "insufficient",
      reason:
        `${pool.length} item(s) are ready, but every candidate's owns intersects ${pool[0].id}'s ` +
        `(${JSON.stringify(pool[0].owns)}) - no non-intersecting pair could be formed`,
      readyCount: pool.length,
    };
  }

  return { type: "wave", items: wave };
}
