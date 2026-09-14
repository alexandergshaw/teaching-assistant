"use client";

// Backlog 3.5 (scratchpad/b35-rulings.md, line-budget note under Ruling
// B35-9/amended). SnapshotGradingPanel.tsx's own handleGrade - the panel's
// largest function - extracted here VERBATIM (same logic, same order of
// operations) so this wave's additions to the panel stay under the repo-wide
// 1000-line ceiling (src/file-size-ceiling.structure.test.ts). The panel
// still owns every piece of state this hook reads or writes - it is passed
// in as parameters and setters, never re-declared here - so this is a pure
// mechanical extraction, not a new ownership boundary.
//
// A6c/A7c (unchanged): guarded the same way as before extraction - a single
// in-flight guard via gradeAbortRef, reachable ONLY from the Grade button's
// onClick in the panel, never from an effect in this file or the panel.

import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { DEFAULT_PROVIDER } from "@/lib/llm";
import { applyAssessmentResult } from "../assessment-shared/assessment-row";
import { snapshotGradeAction } from "@/app/actions/snapshot-grade";
import { verifySnapshotCitations } from "./snapshot-citations";
import {
  mintSnapshotRowId,
  computeSnapshotTotalScore,
  resolveGradeTarget,
  upsertSnapshotRow,
  buildShotReports,
  type SnapshotAssessmentRow,
  type ShotReadEntry,
  type ConfirmedRubricArea,
} from "./snapshot-row";
import { SNAPSHOT_ROLES, buildIdByGlobalIndex, type SnapshotShot, type SnapshotRole } from "./snapshot-shot";

export interface UseSnapshotGradeParams {
  shots: SnapshotShot[];
  transcriptText: string;
  assignmentText: string;
  rubricText: string;
  confirmedRubricAreas: ConfirmedRubricArea[] | null;
  instructorInstructions: string;
  shotReads: Map<number, ShotReadEntry>;
  sessionRowsRef: MutableRefObject<SnapshotAssessmentRow[]>;
  activeRowIdRef: MutableRefObject<string | null>;
  mountedRef: MutableRefObject<boolean>;
  /** Aborts any in-flight grade call and starts a fresh AbortController,
   *  returning it - owned and called by the PANEL (SnapshotGradingPanel.tsx),
   *  not by this hook, so the underlying ref's read/write stays visible to
   *  eslint's react-hooks/exhaustive-deps in the same file as the cleanup
   *  effect that also aborts it on unmount. See the panel's own
   *  beginGradeAbort declaration comment for the measured lint consequence
   *  of doing this the other way around. */
  beginGradeAbort: () => AbortController;
  commitSessionRows: (rows: SnapshotAssessmentRow[]) => void;
  announce: (message: string) => void;
  setGrading: (value: boolean) => void;
  setGradeError: (value: string | null) => void;
  setPinnedRubricAreas: (value: { name: string; points: number | null }[] | null) => void;
  setSplitNotice: (value: string | null) => void;
}

export function useSnapshotGrade(params: UseSnapshotGradeParams): { handleGrade: () => Promise<void> } {
  const {
    shots,
    transcriptText,
    assignmentText,
    rubricText,
    confirmedRubricAreas,
    instructorInstructions,
    shotReads,
    sessionRowsRef,
    activeRowIdRef,
    mountedRef,
    beginGradeAbort,
    commitSessionRows,
    announce,
    setGrading,
    setGradeError,
    setPinnedRubricAreas,
    setSplitNotice,
  } = params;

  // D: THE GRADE PASS. One call, guarded the same way (A6c).
  const handleGrade = useCallback(async () => {
    if (shots.length === 0 && !transcriptText.trim()) {
      // H1-A: this only ever fires when there is truly nothing at all (no
      // shots AND no transcript) - Read is not required before Grade, so the
      // message must not imply it is.
      setGradeError("There is nothing to grade yet - add at least one shot to the tray.");
      return;
    }
    const controller = beginGradeAbort();
    setGrading(true);
    setGradeError(null);

    const shotsForGrade = shots.map((shot, i) => ({ globalIndex: i + 1, role: shot.role, base64: shot.base64 }));
    // Built from the SAME `shots` binding, in the same synchronous stretch,
    // as shotsForGrade above - the documented convention (Ruling R1-B) so a
    // future edit that builds one of these two maps from a different array
    // is visible to a reader, not just correct by the closure-safety
    // argument alone (shots cannot change within one invocation regardless
    // of where in this function body the line sits).
    const idByGlobalIndex = buildIdByGlobalIndex(shots);

    const result = await snapshotGradeAction(
      {
        assignmentText,
        rubricText,
        transcriptBlock: transcriptText,
        shots: shotsForGrade,
        // Ruling B35-17 (BINDING): no null-guard added to handleGrade - the
        // no-rubric path must stay reachable (an instructor who never opens
        // the rubric modal has confirmedRubricAreas === null forever, and
        // Grade must still work). `?? []` is the whole handling: an empty
        // list is a legitimate "grade unpinned" request, not a blocked one.
        confirmedRubricAreas: confirmedRubricAreas ?? [],
        provider: DEFAULT_PROVIDER,
      },
      instructorInstructions
    );

    if (controller.signal.aborted || !mountedRef.current) return;
    setGrading(false);

    if ("error" in result) {
      setGradeError(result.error);
      return;
    }

    setPinnedRubricAreas(result.pinnedRubricAreas);
    // MAJOR-3 fix: this is the only channel that reveals a rubric area was
    // dropped from grading, and it renders asynchronously after Grade
    // completes - a screen-reader user checking the page at that moment
    // hears nothing unless this panel's own announce() helper is used, the
    // same as every other state change in this file.
    if (result.pinnedRubricAreas.length > 0) {
      announce(
        `Pinned rubric areas: ${result.pinnedRubricAreas.map((a) => a.name).join(", ")}. Other rubric areas, if any, were not graded.`
      );
    } else if (rubricText.trim()) {
      announce("No rubric areas could be parsed from the rubric text - the model chose its own areas.");
    }

    // RULING R1-E: `shotReads` is keyed by READ-TIME position and is cleared
    // at only two sites (next-student, the read pass itself) - neither
    // delete nor reorder clears it. Looking a citation's transcript up by
    // that stale numeric position, while `idByGlobalIndex` above resolves
    // the SAME numeric position against the CURRENT `shots` array, would let
    // a quote verify against one shot's transcript while the id written
    // alongside it names a DIFFERENT shot - a wrong identity, permanently
    // persisted. Closing the window: match by `shot.id` instead of
    // position, so the transcript and the id both come from the SAME shot.
    const transcriptsByShotId = new Map<string, string>();
    shotReads.forEach((entry) => transcriptsByShotId.set(entry.shotId, entry.transcript));
    const transcriptsByShotIndex = new Map<number, string>();
    shots.forEach((shot, i) => {
      const transcript = transcriptsByShotId.get(shot.id);
      if (transcript !== undefined) transcriptsByShotIndex.set(i + 1, transcript);
    });
    // The DEDICATED corpus a `source: "pasted"` citation verifies against -
    // never consulted for a "shot" or "unknown" citation (RULING A).
    const pastedTextCorpus = `${rubricText}\n\n${assignmentText}`;
    const verified = verifySnapshotCitations(
      result.answer.rubricResults,
      transcriptsByShotIndex,
      transcriptText,
      pastedTextCorpus,
      idByGlobalIndex
    );

    const suppliedRoles = new Set(shots.map((shot) => shot.role));
    const hasRubricText = rubricText.trim().length > 0;
    const hasAssignmentText = assignmentText.trim().length > 0;
    const missingRoles = result.answer.missingRoles
      .filter((r): r is SnapshotRole => (SNAPSHOT_ROLES as readonly string[]).includes(r))
      .filter((r) => {
        if (r === "rubric") return !suppliedRoles.has("rubric") && !hasRubricText;
        if (r === "assignment") return !suppliedRoles.has("assignment") && !hasAssignmentText;
        return !suppliedRoles.has(r);
      });

    const shotReports = buildShotReports(shots, shotReads);

    const totalScore = computeSnapshotTotalScore(result.answer.rubricResults);

    const { base, isNewRow, supersededEditedRow } = resolveGradeTarget(
      sessionRowsRef.current,
      activeRowIdRef.current,
      () => mintSnapshotRowId(Date.now())
    );
    if (isNewRow) activeRowIdRef.current = base.id;

    const scored = applyAssessmentResult(base, {
      state: "ready",
      totalScore,
      strengths: "",
      improvements: result.answer.improvements,
      overallComment: result.answer.overallComment,
    });
    const merged: SnapshotAssessmentRow = {
      ...scored,
      shotReports,
      rubricAreas: verified,
      missingRoles,
      instructionLikeContent: result.answer.instructionLikeContent,
      instructionLikeContentQuote: result.answer.instructionLikeContentQuote,
      imageFallbackNote: result.imageFallbackNote,
      evidenceDropped: false, // a fresh grade always carries full evidence in memory
    };
    commitSessionRows(upsertSnapshotRow(sessionRowsRef.current, merged));

    if (supersededEditedRow) {
      const name = supersededEditedRow.studentName || "this student";
      setSplitNotice(
        `Kept the earlier edited feedback for ${name} as its own entry - this new grade was saved alongside it, not over it.`
      );
      announce("Saved as a new entry next to the earlier edited one, so your edits were not overwritten.");
    } else {
      setSplitNotice(null);
    }
  }, [
    shots,
    transcriptText,
    assignmentText,
    rubricText,
    confirmedRubricAreas,
    instructorInstructions,
    shotReads,
    sessionRowsRef,
    activeRowIdRef,
    mountedRef,
    beginGradeAbort,
    commitSessionRows,
    announce,
    setGrading,
    setGradeError,
    setPinnedRubricAreas,
    setSplitNotice,
  ]);

  return { handleGrade };
}
