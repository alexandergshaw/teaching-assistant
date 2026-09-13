// The scheduled sweep for orphaned rubric/syllabus upload objects
// (docs and rulings: see the orphan-uploads-sweep design and the
// orchestrator's binding rulings for this feature). Two independent
// mechanisms leave objects behind under
// `${userId}/rubric-uploads/${uploadId}${ext}` and
// `${userId}/syllabus-uploads/${uploadId}${ext}` in the private
// "course-files" bucket (src/lib/syllabus-upload-source.ts): a failed
// removal that used to be swallowed silently, and a tab-close/navigate-away
// between the browser's direct upload and the immediately-following
// extract call. This module is the backstop that removes what either
// mechanism leaves behind, on a timer, independent of any request.
//
// RULING 1 (binding): the delete/failure accounting below ships
// OBSERVATIONAL ONLY. `deleted`/`failed` are computed and returned, but the
// caller (the route) does not fail the workflow's exit code on a nonzero
// failedCount in this first deployment - see route.ts and the workflow
// file. The reconciliation rule itself may still be wrong (remove()'s real
// `data` semantics for a named delete are unmeasured in this checkout); this
// module still deletes regardless of whether the accounting is later found
// to need fixing.
//
// RULING 2 (binding): phase 2's listing path has NO trailing slash -
// `${userPrefix}/${segment}`, not `${userPrefix}/${segment}/` - because
// Supabase Storage v1 treats a trailing slash as a literal path component,
// yielding a doubled separator and an empty result set. Pinned in
// listPrefixSegment below and asserted in orphan-upload-sweep.test.ts.
import { UPLOAD_PATH_SEGMENTS, type UploadPathSegment } from "./syllabus-upload-source";

/** Default sweep threshold - the ONE place the production value lives. The
 * object's intended lifetime is seconds (upload immediately followed by
 * extract, with no user-facing pause anywhere in this feature); 10 minutes
 * is padding against GitHub Actions' own best-effort scheduling lag and a
 * legitimately slow extraction. */
export const ORPHAN_SWEEP_THRESHOLD_MS = 10 * 60 * 1000;

/** Soft deadline inside the platform's 60s maxDuration cap - identical
 * reasoning to run-schedules/route.ts's runDeadlineMs. Checked inside every
 * loop level (root pass, per-prefix page loop, delete loop) - not only
 * between prefixes. This is a DURATION; the parameter it feeds
 * (softDeadlineAt, below) is an ABSOLUTE Date computed by the route - the
 * two must never be conflated (see sweepOrphanUploads' options below). */
export const SWEEP_SOFT_DEADLINE_MS = 50_000;

/** The BREAK-EVEN point, not a conservative margin: assumed (not measured -
 * no live Storage in this checkout) per-user-prefix cost of two .list()
 * calls at up to 250ms each = ~500ms/prefix; 50_000 / 500 = 100 consumes the
 * ENTIRE soft-deadline budget with nothing left for the phase-1 root pass or
 * any remove() call. Real protection comes from the inner-loop deadline
 * checks below, not from this ceiling - a wrong (too-low) latency assumption
 * makes the sweep UNDER-clean (the safe direction: fewer prefixes swept this
 * tick, never a wrong deletion). Revisit with real latency data post-deploy. */
export const MAX_USER_PREFIXES_PER_TICK = 100;

/** Phase 1's OWN sub-budget, distinct from SWEEP_SOFT_DEADLINE_MS (which
 * bounds the WHOLE tick as a backstop). Assumed ~250ms per root .list() call
 * (100 entries/page): 20_000 / 250 = 80 page calls, i.e. up to 8,000 user
 * prefixes counted before phase 1 itself gives up - leaving at least 30s of
 * the 50s overall budget for phase 2 even in the worst case where phase 1
 * consumes its entire sub-budget. Revisit with real latency data post-deploy. */
export const PHASE1_ROOT_LISTING_BUDGET_MS = 20_000;

/** Page size for every paginated .list() call this module makes - explicit
 * rather than relying on the SDK default. */
export const SWEEP_LIST_PAGE_SIZE = 100;

/** The closed set of path segments this sweep will ever list or delete under
 * a user prefix - THE SAME ARRAY as syllabus-upload-source.ts's own
 * UPLOAD_PATH_SEGMENTS, imported directly rather than hand-restated here:
 * a restated copy could silently drift from the real list (a third segment
 * added only in syllabus-upload-source.ts would never be swept, with `tsc`
 * staying silent because `readonly UploadPathSegment[]` accepts any subset
 * of the union). Never lists or touches any other path shape - this is the
 * containment argument that keeps the sweep from reaching a course's
 * materials zip (`${userId}/${courseId}/...`) or a Tasks-cell attachment
 * (`${userId}/${courseId}/task-attachments/...`) living in the same bucket. */
const SWEPT_PATH_SEGMENTS: readonly UploadPathSegment[] = UPLOAD_PATH_SEGMENTS;

/** One page-fetching call, injected so this module never imports
 * @supabase/supabase-js or next/headers directly - same testability
 * reasoning as withUploadedSyllabusFile. Used for BOTH phase 1 (called with
 * `path: ""`, the bucket root - each returned name is a user id) and phase 2
 * (called with `path: "${userPrefix}/${segment}"`). MUST be called
 * repeatedly, stepping the offset by exactly the requested `limit` each
 * time, until a page shorter than `limit` is returned - a single call is not
 * a complete listing. */
export interface OrphanSweepLister {
  listPage(path: string, page: { limit: number; offset: number }): Promise<{
    entries: { name: string; updatedAt: string | null }[];
    error: string | null;
  }>;
}

/** `removedNames` is the SDK's own `data` field (via removeFilesAs),
 * forwarded verbatim, narrowed to leaf names - NOT a bare `ok: boolean`.
 * `remove()` is called ONCE per prefix-segment, in a batch over every path
 * that prefix-segment's age check selected - never once per object.
 * `error: null` is NOT proof every requested path was removed - callers
 * reconcile `removedNames` against what they asked for. */
export interface OrphanSweepRemover {
  remove(paths: string[]): Promise<{ removedNames: string[]; error: string | null }>;
}

/** Injected so a genuine CSPRNG draw (crypto.randomInt) is never itself
 * exercised inside a test - only the sweep's use of whatever index it is
 * handed is tested. NEVER called with total === 0 - randomInt(0, 0) throws
 * a RangeError, and the zero-prefix guard below returns before this is ever
 * reached. */
export interface StartIndexPicker {
  /** Must return an integer in [0, total). */
  pick(total: number): number;
}

/** A swept object identified by its THREE decomposed parts, never as a
 * concatenated path - the counts-only HTTP response body is what actually
 * matters here: a full path begins with a real user id, and the body
 * crosses into the GitHub Actions log, a different retention/access domain
 * than Vercel's own function logs. */
export interface SweptObject {
  userId: string;
  segment: UploadPathSegment;
  uploadId: string; // includes extension, e.g. "abc123.docx"
}

export interface OrphanSweepResult {
  /** From phase 1 (the full root pass) - null if phase 1 itself did not
   * complete within phase1BudgetMs. NEVER 0 unless phase 1 genuinely
   * completed and found no user prefixes at all - that distinction (null vs
   * 0) is what lets a caller tell "ran out of time" apart from "genuinely
   * empty." */
  totalUserPrefixes: number | null;
  scannedUserPrefixes: number;
  deleted: SweptObject[];
  /** Includes every requested path NOT present in a remove() call's
   * removedNames - whether because the SDK reported an error, or because
   * error was null but the path was simply absent (already gone). */
  failed: (SweptObject & { error: string })[];
  /** Verifiably younger than thresholdMs - a real, parsed updatedAt. */
  skippedNotOldEnough: number;
  /** Entries whose updatedAt was null - counted SEPARATELY from
   * skippedNotOldEnough, never folded into it. A spike here with
   * deleted.length staying near zero is the signal that the updated_at
   * mapping (storage.ts's mapStorageListEntry) has regressed. */
  skippedUnknownAge: number;
  /** True when SWEEP_SOFT_DEADLINE_MS, phase1BudgetMs, or
   * maxUserPrefixesThisTick was hit before every prefix was examined,
   * INCLUDING mid-phase-1 - NOT a failure; a later tick's random draw picks
   * up elsewhere. Also set when a listing call returned an error (see
   * `listingErrors` below) - `listingErrors` is what distinguishes "ran out
   * of time" from "a listing call actually failed"; this flag alone does
   * not. */
  truncatedByBudget: boolean;
  /** Count of `.listPage` calls (phase 1's root pass, or phase 2's
   * per-prefix-segment listing) that returned a non-null `error`, as
   * opposed to simply running out of budget. A persistent nonzero value here
   * (wrong bucket, a revoked service-role key, a storage policy change) is a
   * DIFFERENT failure mode than budget exhaustion, and previously produced
   * the exact same `truncatedByBudget: true` with every other count at zero
   * - indistinguishable from a merely-slow tick, and watched by nothing.
   * This counter exists so that state has its own signal. */
  listingErrors: number;
  /** Of `deleted`, how many were reconciled against `removedNames` by the
   * requested path's LEAF name (`candidate.uploadId`) rather than its full
   * key. See `matchedByFullPath` and Ruling 1's open question: the SDK's
   * real `remove()` response shape for a named delete is unmeasured in this
   * checkout, and this module accepts either shape defensively. These two
   * counters are the production signal that answers which shape the live
   * SDK actually returns - a first tick with `deletedCount > 0` and one of
   * these at 0 settles it outright. */
  matchedByLeafName: number;
  /** Of `deleted`, how many were reconciled by the full requested path
   * (`${path}/${candidate.uploadId}`) instead of the leaf name. See
   * `matchedByLeafName` above. */
  matchedByFullPath: number;
}

function emptyResult(overrides: Partial<OrphanSweepResult> = {}): OrphanSweepResult {
  return {
    totalUserPrefixes: 0,
    scannedUserPrefixes: 0,
    deleted: [],
    failed: [],
    skippedNotOldEnough: 0,
    skippedUnknownAge: 0,
    truncatedByBudget: false,
    listingErrors: 0,
    matchedByLeafName: 0,
    matchedByFullPath: 0,
    ...overrides,
  };
}

/** Pages the bucket root (`lister.listPage("", ...)`) to completion,
 * collecting every top-level name (each one is a user id - see the
 * containment note on SWEPT_PATH_SEGMENTS above). Returns `null` for `names`
 * if `phase1BudgetMs` is exceeded before the pass completes. */
async function listAllRootPrefixes(
  lister: OrphanSweepLister,
  pageSize: number,
  phase1DeadlineAt: number
): Promise<{ names: string[] | null; truncated: boolean; erroredOut: boolean }> {
  const names: string[] = [];
  let offset = 0;
  for (;;) {
    if (Date.now() > phase1DeadlineAt) {
      return { names: null, truncated: true, erroredOut: false };
    }
    const { entries, error } = await lister.listPage("", { limit: pageSize, offset });
    if (error) {
      return { names: null, truncated: true, erroredOut: true };
    }
    names.push(...entries.map((e) => e.name));
    if (entries.length < pageSize) {
      return { names, truncated: false, erroredOut: false };
    }
    offset += pageSize;
  }
}

/** Pages ONE `${userPrefix}/${segment}` listing to COMPLETION, buffered in
 * memory, before any age check or delete is evaluated for it - per Ruling
 * 1(b): Supabase's `.list()` offset is a SQL OFFSET over the live result
 * set, so deleting while paging shifts the remainder and silently skips
 * entries. Returns `truncated: true` if the soft deadline is hit mid-page. */
async function listPrefixSegmentToCompletion(
  lister: OrphanSweepLister,
  path: string,
  pageSize: number,
  softDeadlineAtMs: number
): Promise<{ entries: { name: string; updatedAt: string | null }[]; truncated: boolean; erroredOut: boolean }> {
  const entries: { name: string; updatedAt: string | null }[] = [];
  let offset = 0;
  for (;;) {
    if (Date.now() > softDeadlineAtMs) {
      return { entries, truncated: true, erroredOut: false };
    }
    const { entries: pageEntries, error } = await lister.listPage(path, { limit: pageSize, offset });
    if (error) {
      return { entries, truncated: true, erroredOut: true };
    }
    entries.push(...pageEntries);
    if (pageEntries.length < pageSize) {
      return { entries, truncated: false, erroredOut: false };
    }
    offset += pageSize;
  }
}

/**
 * TWO PHASES - never interleaved:
 *
 * Phase 1: pages the bucket root FULLY (names only, no per-object work),
 * bounded by options.phase1BudgetMs - its OWN sub-budget, distinct from
 * options.softDeadlineAt - to get the REAL totalUserPrefixes for this tick.
 * If phase1BudgetMs is hit before phase 1 completes, returns IMMEDIATELY
 * with totalUserPrefixes: null, truncatedByBudget: true, and every count at
 * zero - no object is ever touched on an incomplete root pass.
 *
 * ZERO-PREFIX GUARD, evaluated next, before phase 2 and before the picker is
 * ever invoked: if phase 1 completed and totalUserPrefixes === 0, returns
 * the all-zero result immediately. randomInt(0, 0) throws; this guard exists
 * so picker.pick is NEVER called with a zero total.
 *
 * Phase 2: startIndex = picker.pick(totalUserPrefixes) - a genuine CSPRNG
 * draw via the injected StartIndexPicker, guaranteed in range because
 * totalUserPrefixes is real (phase 1) and never zero (the guard above).
 * Starting there, wrapping to 0 as needed, for up to
 * maxUserPrefixesThisTick prefixes or until Date.now() exceeds
 * softDeadlineAt (checked inside this loop, not only between prefixes): for
 * each prefix, for each segment in SWEPT_PATH_SEGMENTS, page through EVERY
 * object under `${prefix}/${segment}` (NO trailing slash - Ruling 2) TO
 * COMPLETION FIRST (buffered in memory), THEN evaluate age against
 * thresholdMs relative to `now` (the frozen business-logic timestamp - NOT
 * the live clock used for the deadline check) for the whole buffered list,
 * THEN issue ONE BATCHED remove() call per prefix-segment over every path
 * selected as old enough - never delete while still paging the same
 * prefix-segment.
 *
 * An object whose updatedAt is a real, parseable timestamp older than
 * thresholdMs is a removal CANDIDATE; one with updatedAt: null is counted in
 * skippedUnknownAge and never becomes a candidate - fail-closed on unknown
 * age in a delete path. Every candidate path is then reconciled against the
 * batched remove() call's removedNames: present -> deleted; absent (whether
 * the call errored, or simply omitted it) -> failed, with a synthetic
 * message distinguishing the two cases.
 */
export async function sweepOrphanUploads(
  lister: OrphanSweepLister,
  remover: OrphanSweepRemover,
  picker: StartIndexPicker,
  now: Date,
  options: {
    thresholdMs: number;
    /** ABSOLUTE - the real wall-clock instant the tick must stop by,
     * computed by the ROUTE as `new Date(now.getTime() +
     * SWEEP_SOFT_DEADLINE_MS)`. Deliberately typed Date, not a bare number,
     * and deliberately NOT named the same as the SWEEP_SOFT_DEADLINE_MS
     * duration constant. */
    softDeadlineAt: Date;
    phase1BudgetMs: number; // PHASE1_ROOT_LISTING_BUDGET_MS in production
    maxUserPrefixesThisTick: number;
    pageSize: number;
  }
): Promise<OrphanSweepResult> {
  const softDeadlineAtMs = options.softDeadlineAt.getTime();
  const phase1DeadlineAt = Date.now() + options.phase1BudgetMs;

  // Phase 1: the full root pass.
  const phase1 = await listAllRootPrefixes(lister, options.pageSize, phase1DeadlineAt);
  if (phase1.names === null) {
    return emptyResult({
      totalUserPrefixes: null,
      truncatedByBudget: true,
      listingErrors: phase1.erroredOut ? 1 : 0,
    });
  }

  const totalUserPrefixes = phase1.names.length;

  // Zero-prefix guard: MUST run before the picker is ever called.
  if (totalUserPrefixes === 0) {
    return emptyResult({ totalUserPrefixes: 0 });
  }

  const startIndex = picker.pick(totalUserPrefixes);

  const deleted: SweptObject[] = [];
  const failed: (SweptObject & { error: string })[] = [];
  let skippedNotOldEnough = 0;
  let skippedUnknownAge = 0;
  let scannedUserPrefixes = 0;
  let truncatedByBudget = false;
  let listingErrors = 0;
  let matchedByLeafName = 0;
  let matchedByFullPath = 0;
  const nowMs = now.getTime();

  for (let i = 0; i < options.maxUserPrefixesThisTick && i < totalUserPrefixes; i++) {
    if (Date.now() > softDeadlineAtMs) {
      truncatedByBudget = true;
      break;
    }
    const prefixIndex = (startIndex + i) % totalUserPrefixes;
    const userId = phase1.names[prefixIndex];
    // Counted as "scanned" only if this prefix's segment loop actually
    // attempted at least one listing below - not merely because we entered
    // this outer iteration. Counting it here, before the segment loop even
    // runs, would let a prefix that breaks immediately at the very first
    // budget check still count as scanned, biasing the residual instrument
    // ("a positive scan count with every other count at zero") toward a
    // false positive.
    let scannedThisPrefix = false;

    for (const segment of SWEPT_PATH_SEGMENTS) {
      if (Date.now() > softDeadlineAtMs) {
        truncatedByBudget = true;
        break;
      }
      scannedThisPrefix = true;

      // RULING 2: no trailing slash on this path - a trailing slash yields a
      // doubled separator against Supabase Storage v1 and an empty result
      // set. Pinned and asserted in orphan-upload-sweep.test.ts.
      const path = `${userId}/${segment}`;

      const { entries, truncated, erroredOut } = await listPrefixSegmentToCompletion(
        lister,
        path,
        options.pageSize,
        softDeadlineAtMs
      );
      if (truncated) truncatedByBudget = true;
      if (erroredOut) listingErrors += 1;

      const candidates: { uploadId: string }[] = [];
      for (const entry of entries) {
        if (entry.updatedAt === null) {
          skippedUnknownAge += 1;
          continue;
        }
        const updatedAtMs = Date.parse(entry.updatedAt);
        if (Number.isNaN(updatedAtMs)) {
          // An unparseable timestamp is treated the same as unknown age -
          // fail-closed, never deleted.
          skippedUnknownAge += 1;
          continue;
        }
        if (nowMs - updatedAtMs < options.thresholdMs) {
          skippedNotOldEnough += 1;
          continue;
        }
        candidates.push({ uploadId: entry.name });
      }

      if (candidates.length === 0) continue;

      const candidatePaths = candidates.map((c) => `${path}/${c.uploadId}`);
      const { removedNames, error } = await remover.remove(candidatePaths);
      const removedSet = new Set(removedNames);

      for (const candidate of candidates) {
        const requestedPath = `${path}/${candidate.uploadId}`;
        const swept: SweptObject = { userId, segment, uploadId: candidate.uploadId };
        // RULING A: the two halves of this disjunction each get their own
        // counter (matchedByLeafName / matchedByFullPath) - see
        // OrphanSweepResult's docs above. The behaviour (accept either
        // shape) is unchanged; only the signal is new.
        if (removedSet.has(candidate.uploadId)) {
          matchedByLeafName += 1;
          deleted.push(swept);
        } else if (removedSet.has(requestedPath)) {
          matchedByFullPath += 1;
          deleted.push(swept);
        } else {
          failed.push({
            ...swept,
            error: error
              ? "Not confirmed removed (error)"
              : "Not confirmed removed (object was not present in the removal response - possibly already deleted by a concurrent sweep)",
          });
        }
      }

      if (truncated) break;
    }

    if (scannedThisPrefix) scannedUserPrefixes += 1;
  }

  return {
    totalUserPrefixes,
    scannedUserPrefixes,
    deleted,
    failed,
    skippedNotOldEnough,
    skippedUnknownAge,
    truncatedByBudget,
    listingErrors,
    matchedByLeafName,
    matchedByFullPath,
  };
}
