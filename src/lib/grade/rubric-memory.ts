/**
 * A39 wave 2 (docs/owner-decisions-2026-09-23.md DECISION 3): the rubric
 * non-persistence policy is dropped. This is the one leaf every persisting
 * surface calls - path A (GradingTab.tsx) and path H (CartridgeDropPanel.tsx)
 * today, path F/G (GradingRecordingPanel.tsx, SnapshotGradingPanel.tsx)
 * added as a second caller by wave 3b.
 *
 * DECISION 3's own warning: Repo Grades already persists a rubric as ONE
 * GLOBAL VALUE for every assignment (`ta-repo-grades-rubric`). Copying that
 * shape here would silently grade one assignment against another's rubric.
 * So this module never has a single slot - every entry is stored under a
 * SCOPE KEY the caller derives from something the app actually knows (an
 * uploaded file name, a course+assignment label pair), inside one JSON map
 * per `ta-` storage key (one key per calling surface, never one shared key -
 * docs/a39-architecture.md 6.2/6.3).
 *
 * Restoring silently, before the caller has any scope to restore INTO, is
 * the wrong-grades-that-look-right trap (docs/a39-architecture.md 6.2.1): an
 * instructor opens the tab, last week's rubric is already in the field, they
 * upload this week's submissions against it unnoticed. So an empty-string
 * scope is treated as "nothing known yet" and always returns null - no
 * last-used fallback, no restore - rather than trusting a caller to gate the
 * call itself. A caller only has a real scope once it knows the identity the
 * scope key is built from (a chosen file's name, a filled-in course/
 * assignment pair).
 *
 * Once a real scope IS known, an exact match restores directly; failing
 * that, the most recently saved entry across every scope in this same `ta-`
 * key is restored instead, so the field is never left blank when the app has
 * something to offer - but ALWAYS labelled with the scope it actually came
 * from (describeRubricOrigin), never presented as belonging to the scope
 * that was requested. "A filled textarea plus the origin label is that
 * label; no confirmation is added and none removed" (architecture 6.3).
 */

function readMap(storageKey: string): Record<string, RubricMemoryEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, RubricMemoryEntry> = {};
    for (const [scope, value] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = coerceEntry(value);
      if (entry) out[scope] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(storageKey: string, map: Record<string, RubricMemoryEntry>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // Storage full/blocked: best-effort only, same as every other ta- key.
  }
}

function coerceEntry(value: unknown): RubricMemoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (typeof o.rubric !== "string") return null;
  if (typeof o.savedAt !== "number") return null;
  return {
    rubric: o.rubric,
    instructions: typeof o.instructions === "string" ? o.instructions : undefined,
    savedAt: o.savedAt,
  };
}

/** One saved rubric (plus the assignment instructions that went with it,
 *  when the caller has those too) and when it was saved. */
export interface RubricMemoryEntry {
  rubric: string;
  instructions?: string;
  savedAt: number;
}

/** What loadRubricMemory actually found: the entry, and the scope it was
 *  really saved under - which may differ from the scope that was requested
 *  (the last-used fallback). describeRubricOrigin reads THIS scope, never
 *  the requested one, so the label never claims a match that did not happen. */
export interface LoadedRubricMemory {
  entry: RubricMemoryEntry;
  scope: string;
}

/**
 * Save `entry` under `scope` inside the map at `storageKey`. A blank scope
 * is refused (nothing to key it to) rather than silently landing in a
 * shared "" slot that every unscoped caller would then collide on.
 */
export function saveRubricMemory(
  storageKey: string,
  scope: string,
  entry: { rubric: string; instructions?: string }
): void {
  if (!scope) return;
  const map = readMap(storageKey);
  map[scope] = { rubric: entry.rubric, instructions: entry.instructions, savedAt: Date.now() };
  writeMap(storageKey, map);
}

/**
 * Restore for `scope`, or null when nothing is known yet. `scope` empty
 * ALWAYS returns null (see the module comment) - a caller that has not yet
 * acquired an identity to key on must not receive a restore.
 */
export function loadRubricMemory(storageKey: string, scope: string): LoadedRubricMemory | null {
  if (!scope) return null;
  const map = readMap(storageKey);
  const exact = map[scope];
  if (exact) return { entry: exact, scope };

  let newest: LoadedRubricMemory | null = null;
  for (const [savedScope, entry] of Object.entries(map)) {
    if (!newest || entry.savedAt >= newest.entry.savedAt) {
      newest = { entry, scope: savedScope };
    }
  }
  return newest;
}

/** Human-readable origin label naming the scope an entry ACTUALLY came from
 *  (never the requested scope) and when it was saved - the visible half of
 *  "the field IS the receipt" (architecture 6.3). Never returns "": every
 *  branch names a scope and a time. */
export function describeRubricOrigin(loaded: LoadedRubricMemory, requestedScope: string): string {
  const when = formatSavedAt(loaded.entry.savedAt);
  const from = describeScope(loaded.scope);
  return loaded.scope === requestedScope
    ? `Rubric restored from ${from}, saved ${when}.`
    : `Rubric restored from your last saved rubric (${from}), saved ${when}.`;
}

function describeScope(scope: string): string {
  const uploadMatch = /^upload:(.*)$/.exec(scope);
  if (uploadMatch) return `your upload of "${uploadMatch[1]}"`;
  const cartridgeMatch = /^cartridge:(.*)\|(.*)$/.exec(scope);
  if (cartridgeMatch) return `${cartridgeMatch[1]} / ${cartridgeMatch[2]}`;
  return scope;
}

function formatSavedAt(savedAt: number): string {
  const diffMs = Date.now() - savedAt;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}
