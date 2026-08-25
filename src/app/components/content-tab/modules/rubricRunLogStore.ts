// Persistence for the "Generate & associate rubric" run log
// (docs/rubric-bulk-log-acceptance-criteria.md, B2). Follows
// src/app/components/repo-grades/repoGradesUiState.ts's
// loadRepoGradeLog/persistRepoGradeLog pair (entry 333's precedent for this
// exact problem) without importing it, since that module is
// repo-grades-specific: one `ta-` localStorage key holding a per-course
// record, because one course's log means nothing shown under another
// course's key, and a single key stays simple to reason about and to clear.
//
// Keyed by `courseUrl` rather than a numeric course id: useBulkItemActions.ts
// (this store's only caller) already treats `courseUrl` as this feature's
// course identity - it is the same value threaded through every Canvas call
// that hook makes - and introducing a second, differently-shaped course key
// here would be a new source of "which course is this really" bugs for no
// benefit.
import {
  MAX_RUBRIC_RUN_LOG_ENTRIES,
  parseRubricRunLogEntries,
  type RubricRunLogEntry,
} from "@/lib/rubric-run-log";

const LOG_KEY = "ta-rubric-run-log";

function parseLogByCourse(raw: string | null): Record<string, RubricRunLogEntry[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, RubricRunLogEntry[]> = {};
    for (const [courseUrl, entries] of Object.entries(parsed as Record<string, unknown>)) {
      result[courseUrl] = parseRubricRunLogEntries(entries);
    }
    return result;
  } catch {
    return {};
  }
}

/** Reads `courseUrl`'s slice of the persisted run log - always an array
 * (never null), already validated and capped by parseRubricRunLogEntries, so
 * a malformed or hand-edited blob degrades to "fewer entries" rather than a
 * crashed bulk bar (B2). */
export function loadRubricRunLog(courseUrl: string): RubricRunLogEntry[] {
  if (typeof window === "undefined" || !courseUrl) return [];
  return parseLogByCourse(localStorage.getItem(LOG_KEY))[courseUrl] ?? [];
}

/** Writes `courseUrl`'s slice of the persisted run log, preserving every
 * OTHER course's slice untouched. Best-effort: a throw (quota, private
 * browsing) loses persistence for this one write and nothing else, matching
 * persistRepoGradeLog's identical posture. Callers are expected to pass an
 * already-capped array (MAX_RUBRIC_RUN_LOG_ENTRIES, via
 * appendRubricRunLogEntries) - this function re-applies the cap defensively
 * rather than trusting that, so a caller that forgets cannot grow the blob
 * without bound. */
export function persistRubricRunLog(courseUrl: string, entries: readonly RubricRunLogEntry[]): void {
  if (typeof window === "undefined" || !courseUrl) return;
  try {
    const byCourse = parseLogByCourse(localStorage.getItem(LOG_KEY));
    const capped =
      entries.length <= MAX_RUBRIC_RUN_LOG_ENTRIES ? entries.slice() : entries.slice(entries.length - MAX_RUBRIC_RUN_LOG_ENTRIES);
    byCourse[courseUrl] = capped;
    localStorage.setItem(LOG_KEY, JSON.stringify(byCourse));
  } catch {
    // best-effort persistence only, matching persistRepoGradeLog above.
  }
}
