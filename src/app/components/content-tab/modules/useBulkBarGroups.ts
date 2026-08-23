"use client";

// The bulk bar's group OPEN/CLOSED state, persisted per course
// (docs/bulk-bar-reorganization-acceptance-criteria.md, AC3 and section
// 3b/D2's correction of AC3's own text: ONE key, not thirteen - a JSON
// id-to-boolean map under a single `ta-` key, read through a tolerant
// resolver).
//
// CRITICAL (section 3b/D3): this hook is called EXACTLY ONCE, from
// ModulesView - never from inside BulkBarGroup.tsx, which is instantiated
// 13+ times (once per group). Calling this hook per-instance would mean 13+
// independent reads of the same localStorage key, 13+ independent effects
// writing back to it, and each group's "open" toggle silently clobbering
// every sibling group's persisted value with whatever it last read on its
// own mount. ModulesView owns the one instance and threads the returned
// `BulkBarGroupsApi` down as a prop.
//
// Follows the read-on-init / write-on-change idiom useLmsGeneration.ts uses
// for `scriptMinutes` (see that file around its `scriptMinutes`/
// `setScriptMinutes` declarations): seed useState from whatever is already
// stored, then a plain effect writes back on every change. No setState is
// ever reached synchronously from an effect body here - the write-back
// effect only calls `localStorage.setItem`, never `setState` - so this file
// does not need the inline-async-IIFE-plus-cancelled-flag idiom that rule
// exists for; there is nothing here to await.
//
// The read path goes through `resolveBulkBarGroupsStored`, the tolerant
// resolver `resolveScriptMinutes` (@/lib/lms-generation/script-length) is
// the precedent for: a hand-edited, stale, malformed, or otherwise
// non-object stored value degrades to "nothing persisted" (an empty map)
// rather than throwing, exactly as `resolveScriptMinutes` degrades an
// unrecognised value to its default instead of rendering an unselectable
// option. Exported for the same reason `scriptMinutesKey` is exported: this
// vitest setup is node-environment (vitest.config.ts: environment: "node"),
// so `window` is undefined here and the read-on-init/write-on-change effect
// itself is unexercisable end to end in a node test - the resolver and the
// key function are the reachable halves, and this file's own test exercises
// exactly those two.
import { useEffect, useState } from "react";
import type { BulkBarGroupId } from "./bulkBarGroups";

export interface BulkBarGroupsApi {
  /** `undefined` means nothing persisted for this group - the caller (via
   * `groupOpen` in ./bulkBarGroups) falls back to the group's own declared
   * `defaultOpen`. Never coerced to `false` here: that would make "never
   * saved" indistinguishable from "explicitly closed". */
  isOpen(id: BulkBarGroupId): boolean | undefined;
  setOpen(id: BulkBarGroupId, open: boolean): void;
}

/** PER COURSE, following scriptMinutesKey's own `ta-`-prefixed, per-course
 * naming (lmsGenerationKindHelpers.ts). ONE key for all thirteen groups -
 * section 3b/D2's correction of AC3's original "a `ta-` key" (plural
 * intent, singular wording) into an explicit single key holding a JSON map. */
export function bulkBarGroupsKey(courseUrl: string): string {
  return `ta-modules-bulkbar-groups-${courseUrl}`;
}

function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

/**
 * Coerce whatever is sitting under `bulkBarGroupsKey(courseUrl)` - possibly
 * `null` (nothing saved yet), possibly hand-edited, possibly left over from
 * a shape this file no longer writes - into a plain id-to-boolean map, never
 * throwing.
 *
 * Every rejection degrades to "nothing persisted" (an empty object), the
 * same posture `resolveScriptMinutes` takes for an out-of-range or
 * unrecognised value: malformed JSON, a JSON array, a JSON string, a JSON
 * number, `null`, and the empty string all resolve to `{}` here. A key
 * inside an otherwise-valid object whose id this file does not recognise is
 * kept rather than dropped (it is harmless: `isOpen` is only ever called
 * with a real `BulkBarGroupId`, so an unknown key is simply never read) -
 * only a key whose VALUE is not a genuine boolean is dropped, since a
 * truthy-but-not-boolean value (e.g. a hand-edited `"true"` string) would
 * otherwise make `isOpen` return something other than `boolean | undefined`,
 * which `groupOpen` is not written to tolerate.
 */
export function resolveBulkBarGroupsStored(raw: string | null): Partial<Record<BulkBarGroupId, boolean>> {
  if (raw === null || raw.trim() === "") return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const result: Partial<Record<BulkBarGroupId, boolean>> = {};
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "boolean") {
      result[id as BulkBarGroupId] = value;
    }
  }
  return result;
}

/**
 * ONE instance, owned by ModulesView (see this file's header). Returns an
 * API object rather than the raw state so every BulkBarGroup instance reads
 * through `isOpen`/`setOpen` and never touches localStorage or the
 * underlying map directly.
 */
export function useBulkBarGroups(courseUrl: string): BulkBarGroupsApi {
  const [stored, setStored] = useState<Partial<Record<BulkBarGroupId, boolean>>>(() =>
    resolveBulkBarGroupsStored(readStored(bulkBarGroupsKey(courseUrl)))
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(bulkBarGroupsKey(courseUrl), JSON.stringify(stored));
  }, [courseUrl, stored]);

  return {
    isOpen: (id) => stored[id],
    setOpen: (id, open) => setStored((prev) => ({ ...prev, [id]: open })),
  };
}
