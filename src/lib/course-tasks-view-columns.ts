// Persisted column-visibility helpers for the Tasks tab (AC7 items 38/39,
// amendment 118) - split out of course-tasks-view.ts to stay under this
// repo's 1000-line-per-file cap (item 240), the same reason
// course-tasks-view-column-filters.ts was split out before it (see that
// file's own header comment for the identical rationale). Everything
// exported here is re-exported from course-tasks-view.ts, so every caller -
// including this feature's own test file, which imports exclusively from
// "./course-tasks-view" - resolves these names from one place regardless of
// which file actually implements them.
//
// Self-contained: no dependency on course-tasks.ts or course-tasks-view.ts,
// so there is no import-cycle concern to design around here, unlike
// course-tasks-view-column-filters.ts's own comment and
// course-tasks-view-csv.ts's.
//
// CLIENT-SAFE like every other module in this feature: no Date.now(), no
// supabase/server import, no next/headers.
//
// Reuses the versioned `{v, columns}` + "added in version N" union idiom
// from courses-table-helpers.ts's parseColumnSet/serializeColumnSet, EXTENDED
// with a `known` id list (amendment 118). The plain versioned union alone
// handles a built-in column added by an app upgrade (every existing
// instructor's persisted set predates it, so it is unioned in once via
// CURRENT_TASK_COLUMNS_VERSION/TASK_COLUMNS_ADDED_IN) but it CANNOT handle a
// user-created CUSTOM task, because a custom task has no version number to
// key off of: "a custom task created since this set was written" and "a
// custom task the user deliberately hid" are indistinguishable from a bare
// list of custom ids alone, so the naive versioned-union design would
// re-add a hidden custom column on every single parse, forever - making
// AC7 item 37 ("task columns can be individually hidden") permanently
// unachievable for exactly the columns AC9 introduces. `known` breaks that
// tie: it is the full set of task ids that existed AT WRITE TIME, so an id
// in `allIds` but missing from `known` is unambiguously "never seen before"
// (union it in, once) rather than "seen and hidden" (leave it alone).
//
// The `known`-based union is deliberately gated on the payload actually
// carrying a `known` array - see parseTaskColumnSet's own comment below for
// why defaulting it (e.g. to the listed columns, or to `allIds`) when the
// field is simply ABSENT would break the plain versioned-union tests this
// idiom is inherited from.

export const CURRENT_TASK_COLUMNS_VERSION = 1;

/** Columns introduced by each version, unioned into every persisted set
 * stored at an earlier version - see COLUMNS_ADDED_IN in
 * courses-table-helpers.ts for the identical idiom. Ships empty at v1
 * (amendment 145): there is no "version 0" Tasks-tab column set to migrate
 * from, since this is the feature's first release. */
export const TASK_COLUMNS_ADDED_IN: Record<number, string[]> = {};

export interface TaskColumnSetContext {
  allIds: string[];
  addedIn?: Record<number, string[]>;
}

/**
 * Parses a persisted ta-tasks-*-columns value into the list of currently
 * VISIBLE task ids. Falls back to every id in `ctx.allIds` (i.e. nothing
 * hidden) on anything malformed or absent, rather than throwing.
 *
 * Accepts the current `{v, columns, known}` shape and, like
 * courses-table-helpers.ts's parseColumnSet, the legacy bare-array shape
 * (treated as version 0, and as never carrying a `known` list at all - a
 * bare array predates the entire `{v, columns}` wrapper, let alone `known`).
 *
 * The `known`-based union (amendment 118) ONLY runs when the parsed payload
 * actually contains a `known` array. When it is absent - a legacy bare
 * array, or a `{v, columns}` value written before `known` existed -
 * reconciliation falls back to the addedIn/version union ALONE, exactly as
 * it behaved before `known` was introduced. This is deliberate, not an
 * oversight: defaulting `known` to "the ids this value lists" (so anything
 * else gets unioned in) would resurrect every built-in column a user has
 * EVER explicitly hidden via the ordinary versioned mechanism, the moment
 * they hide it - the versioned-union tests below (a v1 set that hid a
 * column introduced at v1, or at a version below the current one) pin
 * exactly this, and only run the `known` union when the caller has actually
 * started recording one via serializeTaskColumnSet.
 */
export function parseTaskColumnSet(raw: string | null | undefined, ctx: TaskColumnSetContext): string[] {
  const allSet = new Set(ctx.allIds);
  if (!raw) return [...ctx.allIds];

  let storedVersion: number;
  let columnsRaw: unknown;
  let knownRaw: unknown;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      storedVersion = 0;
      columnsRaw = parsed;
    } else if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { v?: unknown }).v === "number" &&
      Array.isArray((parsed as { columns?: unknown }).columns)
    ) {
      storedVersion = (parsed as { v: number }).v;
      columnsRaw = (parsed as { columns: unknown[] }).columns;
      knownRaw = (parsed as { known?: unknown }).known;
    } else {
      return [...ctx.allIds];
    }
  } catch {
    return [...ctx.allIds];
  }

  const seen = new Set<string>();
  const visible: string[] = [];
  for (const rawId of columnsRaw as unknown[]) {
    if (typeof rawId !== "string") continue;
    if (allSet.has(rawId) && !seen.has(rawId)) {
      seen.add(rawId);
      visible.push(rawId);
    }
  }

  const addedIn = ctx.addedIn ?? {};
  for (const [versionStr, added] of Object.entries(addedIn)) {
    if (Number(versionStr) <= storedVersion) continue;
    for (const id of added) {
      if (allSet.has(id) && !seen.has(id)) {
        seen.add(id);
        visible.push(id);
      }
    }
  }

  if (Array.isArray(knownRaw)) {
    const known = new Set((knownRaw as unknown[]).filter((id): id is string => typeof id === "string"));
    for (const id of ctx.allIds) {
      if (!known.has(id) && !seen.has(id)) {
        seen.add(id);
        visible.push(id);
      }
    }
  }

  return visible;
}

/** Serializes a column set at CURRENT_TASK_COLUMNS_VERSION, recording the
 * FULL `knownIds` list (every task id that exists at write time - built-ins
 * and the instructor's own custom tasks alike) so the next parse can tell
 * "created since this was written" (show it) apart from "existed, and the
 * user hid it" (respect that). Callers should re-serialize through this
 * function whenever they persist a value read via parseTaskColumnSet, so a
 * legacy or older-version value is upgraded on write. */
export function serializeTaskColumnSet(columns: string[], knownIds: string[]): string {
  return JSON.stringify({ v: CURRENT_TASK_COLUMNS_VERSION, columns, known: knownIds });
}
