// Add items to modules on an export-only course
// (docs/export-module-additions-acceptance-criteria.md): the pure,
// client-safe coercer for the `course_hub.export_module_additions` jsonb
// column, plus the read-time activation rule and the small edit-ops helpers
// a caller mutates the stored list with. Mirrors
// src/lib/repo-module-pairing.ts's own split of concerns (coercer /
// activation / edit helpers in one file) - read that file's header before
// this one; the shape and the discipline are deliberately the same.
//
// SHAPE (the design settled in the AC doc, not renegotiable here):
//   { v: 1, additions: [{ id, moduleRef, title, type, body?, addedAt }] }
// `moduleRef` is a CartridgeModule.identifier (docs/REGRESSION.md entry 303
// proved it present on 17/17 modules and stable across re-parses of the same
// export bytes) - never array position, never a hash (entry 264 check 1
// rejected hashing for exactly this reason).
//
// AC4 - THE MOST IMPORTANT RULE THIS FILE SUPPORTS BUT DOES NOT ITSELF
// ENFORCE: a stale addition (naming a moduleRef that is not present in the
// currently-parsed export tree) is preserved here, unmodified - this coercer
// never drops an entry for being "currently invalid", and neither does
// `activateExportModuleAdditions` below (it only classifies, never deletes).
// Computing which additions are ACTIVE right now, gated on a genuinely
// LOADED export tree (never a transient empty one mid-reload), is a
// read-time concern owned by the caller
// (useExportModuleAdditions.ts) - see that hook's own comment for the gate.
//
// Pure: no I/O, no React, no Supabase - safe to import from a client
// component (courses.types.ts's own "ZERO runtime code" header explains why
// that file only ever `import type`s this one).

import { MAX_CARTRIDGE_ITEM_BODY_CHARS } from "@/lib/cartridge-import";
import type { ContentSource } from "@/lib/lms-export-source";

/** One instructor-added module item, targeting an export snapshot rather
 * than Canvas (see this file's own header - "THE EXPORT, never Canvas"). */
export interface ExportModuleAddition {
  /** This addition's own stable id - generated once when added, never
   * recomputed - so a remove can name exactly one entry regardless of
   * position or title collisions. */
  id: string;
  /** The CartridgeModule.identifier this addition targets. */
  moduleRef: string;
  title: string;
  /** Free-text item-type label, matching CartridgeModuleItem.type's own
   * looseness (display-module-tree.ts's header: "type can be an empty
   * string on a generic cartridge" - never itself a presence signal). */
  type: string;
  /** Optional prose body, capped at MAX_CARTRIDGE_ITEM_BODY_CHARS (AC2) -
   * the same cap the cartridge parser already applies to a resolved export
   * item's own body (cartridge-import-shared.ts), so an addition can never
   * make this column bigger per-item than a real parsed item already can. */
  body?: string;
  /** ISO timestamp of when this addition was made - informational only,
   * never read for activation. */
  addedAt: string;
}

/** The full stored shape of `course_hub.export_module_additions`. `v: 1` is
 * a format tag, not a course-content version - `coerceExportModuleAdditions`
 * degrades ANY value with a different (or missing) `v` to the empty default
 * rather than guessing how to read an unknown format. */
export interface ExportModuleAdditions {
  v: 1;
  additions: ExportModuleAddition[];
}

// Bounds, mirroring repo-module-pairing.ts's own MAX_ASSOCIATIONS reasoning:
// the whole column is selected on every course list read, so an unbounded
// list would make listing courses progressively slower for everyone.
// MAX_ADDITIONS is far smaller than MAX_ASSOCIATIONS (1000) because every
// entry here can also carry an up-to-3000-char body, unlike a repo
// association's short paths.
const MAX_ADDITIONS = 300;
const MAX_ID_LEN = 100;
const MAX_MODULE_REF_LEN = 300;
const MAX_TITLE_LEN = 300;
const MAX_TYPE_LEN = 100;

export function emptyExportModuleAdditions(): ExportModuleAdditions {
  return { v: 1, additions: [] };
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * Defensive coercion for the `export_module_additions` jsonb: never throws,
 * and any unknown/missing/malformed field falls back to the empty default
 * rather than propagating garbage to callers. Tolerates the column being
 * entirely absent (`raw === undefined`, e.g. a migration that has not
 * applied yet) by reading it exactly like "no additions", the same
 * degrade-gracefully contract coerceRepoModulePairing already has for its
 * own column.
 *
 * A malformed ADDITION (no id, no moduleRef, or no title) is DROPPED rather
 * than defaulted - inventing any of those three would silently fabricate an
 * instructor decision that was never made. A duplicate id is collapsed to
 * its LAST occurrence, matching coerceRepoModulePairing's own duplicate rule
 * for the same reason (the newest entry for a given id wins on hand-edited
 * or replayed jsonb). The body is re-capped at MAX_CARTRIDGE_ITEM_BODY_CHARS
 * on every read, not just on write, so a column written by a future looser
 * writer (or edited by hand) can never exceed the bound this app enforces.
 */
export function coerceExportModuleAdditions(raw: unknown): ExportModuleAdditions {
  const defaults = emptyExportModuleAdditions();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;

  const obj = raw as Record<string, unknown>;
  if (obj.v !== 1) return defaults;

  const byId = new Map<string, ExportModuleAddition>();
  if (Array.isArray(obj.additions)) {
    for (const entry of obj.additions) {
      if (byId.size >= MAX_ADDITIONS) break;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const a = entry as Record<string, unknown>;

      const id = str(a.id, MAX_ID_LEN).trim();
      if (!id) continue;

      const moduleRef = str(a.moduleRef, MAX_MODULE_REF_LEN).trim();
      if (!moduleRef) continue;

      const title = str(a.title, MAX_TITLE_LEN).trim();
      if (!title) continue;

      const type = str(a.type, MAX_TYPE_LEN);
      const addedAt = str(a.addedAt, 64);

      const addition: ExportModuleAddition = { id, moduleRef, title, type, addedAt };
      // Optional/undefined (never null), same "absence is real absence"
      // discipline display-module-tree.ts's cartridgeItemToDisplay uses for
      // `body` - a plain `body: a.body` would set a literal `undefined` own
      // property when the stored entry never had one.
      if (typeof a.body === "string") addition.body = a.body.slice(0, MAX_CARTRIDGE_ITEM_BODY_CHARS);

      byId.set(id, addition);
    }
  }

  return { v: 1, additions: Array.from(byId.values()) };
}

// ---------------------------------------------------------------------------
// AC4 activation - the read-time "which stored additions target a module
// present in the currently-loaded export tree" computation.
// ---------------------------------------------------------------------------

export interface ActiveExportModuleAdditions {
  /** Every addition whose moduleRef is present in the caller's loaded
   * module-ref set - safe to merge straight into
   * `cartridgeModulesToDisplay`'s optional second argument. */
  active: readonly ExportModuleAddition[];
  /** Every addition whose moduleRef is NOT present right now (AC4 - "a
   * newer export upload replaces the file and identifiers are only stable
   * for the same bytes"). Never dropped from `additions`, never mutated -
   * a VIEW only, rendered in its own list rather than silently lost. */
  inactive: readonly ExportModuleAddition[];
}

/**
 * AC4 - THE MOST IMPORTANT FUNCTION IN THIS FILE. Never drops anything:
 * every addition in `additions` ends up in exactly one of the two returned
 * lists, in input order. `presentModuleRefs` should be the CALLER's cached
 * "last successfully loaded export tree" set, not a transient/possibly-empty
 * set mid-fetch - see useExportModuleAdditions.ts's own "ready module refs"
 * state for why a mid-reload empty tree must never reach this function as if
 * it were real (that would flag every stored addition inactive for the
 * moment a reload takes - losing an item the instructor typed is worse than
 * losing an inferred pairing, entry 306's own AC3/AC5 applied again here).
 */
export function activateExportModuleAdditions(
  additions: readonly ExportModuleAddition[],
  presentModuleRefs: readonly string[]
): ActiveExportModuleAdditions {
  const present = new Set(presentModuleRefs);
  const active: ExportModuleAddition[] = [];
  const inactive: ExportModuleAddition[] = [];
  for (const a of additions) (present.has(a.moduleRef) ? active : inactive).push(a);
  return { active, inactive };
}

/** Appends one new addition. Pure - returns a new array, never mutates
 * `additions`. The caller (useExportModuleAdditions.ts) is responsible for
 * generating a fresh `id` and `addedAt` before calling this. */
export function appendExportModuleAddition(
  additions: readonly ExportModuleAddition[],
  addition: ExportModuleAddition
): ExportModuleAddition[] {
  return [...additions, addition];
}

/** Removes one addition by its own id (AC "Add and remove only" - editing an
 * existing addition beyond removing it is deliberately deferred, see the AC
 * doc's own Deferred section). Pure - returns a new array. Removing an id
 * that is not present is a no-op (returns an array with the same entries,
 * not an error) - this is deletion, not a lookup that must succeed. */
export function removeExportModuleAddition(
  additions: readonly ExportModuleAddition[],
  id: string
): ExportModuleAddition[] {
  return additions.filter((a) => a.id !== id);
}

// ---------------------------------------------------------------------------
// AC7 - the one real precondition an "add item to this export" control has.
// ---------------------------------------------------------------------------

/**
 * AC7 - follows DownloadSelectionSection.tsx's own precedent (see that
 * file's header comment) rather than `contentSourceGating.ts`'s
 * `gateOperation`: adding an item to an EXPORT is not a Canvas write with
 * the gating removed - there is no Canvas destination involved at any point
 * (see the AC doc's own "What this is, and what it is not"), so it is not
 * one of `gateOperation`'s seven `GatedSubject`s and must never become one
 * (that invariant - every subject refused for an export source - is
 * load-bearing, entry 265 check 4, entry 300). The only two real
 * preconditions: the active source is genuinely an export (there is no
 * "add to modules" concept for a live Canvas tree - that is a real Canvas
 * write, and stays refused by `gateOperation` as it always has), and there
 * is a course_hub row id to persist against (mirrors
 * `useExportModuleAdditions`'s own courseId resolution - absent while the
 * course row hasn't resolved yet, or for a selection with no saved course
 * behind it at all). A read is not a write, and neither is an edit to a
 * file - this function is never consulted by any Canvas-write control.
 */
export function exportEditUnavailableReason(source: ContentSource, courseId: string | null | undefined): string | null {
  if (source !== "export") {
    return "Adding items to modules only applies to a stored export - this module is live Canvas content.";
  }
  if (!courseId) {
    return "This export isn't saved to a course yet, so there's nowhere to store an added item.";
  }
  return null;
}
