"use client";

// docs/rubric-bulk-log-acceptance-criteria.md (B1/B2): the durable, per-course
// record of every "Generate & associate rubric" run's per-target outcomes and
// orphan rubrics - extracted out of useBulkItemActions.ts (974 of this repo's
// 1000-line ceiling) to keep that file under it, a STRUCTURAL split only, no
// behaviour change. This is a real, pre-existing boundary, not an arbitrary
// slice: the run log is its own acceptance-criteria document, separate from
// "Generate & associate rubric" itself (rubric-bulk-action-acceptance-
// criteria.md), and already has its own dedicated persistence module
// (rubricRunLogStore.ts) that this hook - not bulkGenerateAndAssociateRubric -
// is the only caller of. `bulkGenerateAndAssociateRubric` itself (the
// pinned wiring useBulkItemActions.test.ts scans by source text) stays in
// useBulkItemActions.ts unmoved - it is what WRITES to this log via
// `recordRubricRunLog`, returned below and called the same way it always was,
// just now sourced from this hook instead of being a same-file sibling
// function.
import { useEffect, useState } from "react";
import type { RubricTargetOutcome } from "@/app/actions/rubric-bulk";
import type { BulkRubricGenerateReport } from "./bulkRubricGenerateSummary";
import {
  appendRubricRunLogEntries,
  buildRubricRunLogEntries,
  type RubricRunLogEntry,
} from "@/lib/rubric-run-log";
import { loadRubricRunLog, persistRubricRunLog } from "./rubricRunLogStore";

export interface UseRubricRunLogReturn {
  rubricRunLog: readonly RubricRunLogEntry[];
  clearRubricRunLog: () => void;
  recordRubricRunLog: (
    outcomes: RubricTargetOutcome[],
    orphans: BulkRubricGenerateReport["orphans"],
    runLevel: { actionError?: string; generationFailedReason?: string }
  ) => void;
}

/**
 * docs/rubric-bulk-log-acceptance-criteria.md (B1/B2): unlike
 * `bulkRubricGenerateReport` (still owned by useBulkItemActions.ts - a
 * single run's own outcome, never restored from storage), this DOES persist -
 * the durable record of every run's per-target outcomes and orphan rubrics,
 * which the report (and the note built from it) does not survive past the
 * next run or a reload. Restored per COURSE, matching entry 333's
 * RepoGradesLogPanel precedent (src/app/components/repo-grades/index.tsx):
 * `rubricRunLogLoadedFor` records which course's slice is currently loaded
 * into `rubricRunLog`, and the render-phase branch below keeps the two in
 * lockstep whenever `courseUrl` changes - the same guard that file's own
 * comment explains is required to stop the persist effect below from firing
 * with the pre-restore `[]` and overwriting a course's real stored log before
 * its restore has even run.
 */
export function useRubricRunLog(courseUrl: string): UseRubricRunLogReturn {
  const [rubricRunLog, setRubricRunLog] = useState<RubricRunLogEntry[]>([]);
  const [rubricRunLogLoadedFor, setRubricRunLogLoadedFor] = useState<string | null>(null);
  if (courseUrl !== rubricRunLogLoadedFor) {
    setRubricRunLogLoadedFor(courseUrl);
    setRubricRunLog(loadRubricRunLog(courseUrl));
  }

  // Appending happens inside the setState updater (pure array math, safe to
  // re-run) rather than at each call site, matching entry 333's own
  // reasoning: two "Generate & associate rubric" runs could in principle
  // overlap (a second click before the first's async work resolves), and
  // each resolves holding a closure over whatever `rubricRunLog` was at ITS
  // own render - computing `next` there and persisting that would let the
  // slower run's persist clobber the faster run's already-appended entries.
  useEffect(() => {
    if (rubricRunLogLoadedFor !== courseUrl) return;
    persistRubricRunLog(courseUrl, rubricRunLog);
  }, [rubricRunLog, courseUrl, rubricRunLogLoadedFor]);

  // docs/rubric-bulk-log-acceptance-criteria.md B1.2 - THE CORE INSTRUCTION:
  // builds the log from the exact SAME `outcomes`/`orphans` arrays the
  // caller (bulkGenerateAndAssociateRubric, useBulkItemActions.ts) already
  // passed to `summarizeRubricGenerateOutcomes` (never a second
  // classification of what happened), plus whatever run-level
  // `actionError`/`generationFailedReason` that same call site is reporting.
  // Appends inside the `setRubricRunLog` updater, matching the reasoning on
  // the effect above.
  const recordRubricRunLog = (
    outcomes: RubricTargetOutcome[],
    orphans: BulkRubricGenerateReport["orphans"],
    runLevel: { actionError?: string; generationFailedReason?: string }
  ) => {
    const entries = buildRubricRunLogEntries(outcomes, orphans, runLevel, new Date().toISOString());
    if (entries.length === 0) return;
    setRubricRunLog((prev) => appendRubricRunLogEntries(prev, entries));
  };

  // docs/rubric-bulk-log-acceptance-criteria.md B3 item 8: clears this
  // course's persisted run log. The confirm itself lives in
  // RubricRunLogPanel.tsx, which calls this only after the user has already
  // confirmed, naming the count - this function does not confirm again.
  const clearRubricRunLog = () => setRubricRunLog([]);

  return { rubricRunLog, clearRubricRunLog, recordRubricRunLog };
}
