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
  type SnapshotAssessmentRow,
  type SnapshotShotReadReport,
  type ShotReadEntry,
  type ConfirmedRubricArea,
} from "./snapshot-row";
import { SNAPSHOT_ROLES, type SnapshotShot, type SnapshotRole } from "./snapshot-shot";

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

    const transcriptsByShotIndex = new Map<number, string>();
    shotReads.forEach((entry, idx) => transcriptsByShotIndex.set(idx, entry.transcript));
    // The DEDICATED corpus a `source: "pasted"` citation verifies against -
    // never consulted for a "shot" or "unknown" citation (RULING A).
    const pastedTextCorpus = `${rubricText}\n\n${assignmentText}`;
    const verified = verifySnapshotCitations(
      result.answer.rubricResults,
      transcriptsByShotIndex,
      transcriptText,
      pastedTextCorpus
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

    const shotReports: SnapshotShotReadReport[] = shots.map((shot, i) => {
      const idx = i + 1;
      const entry = shotReads.get(idx);
      return { shotIndex: idx, role: shot.role, status: entry ? entry.status : "not-read", reason: entry?.reason };
    });

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
    // No `rowsGradedBeforeLastShotChange` update needed here: `merged.id` is
    // never already a member of that set, because a row once added to it can
    // never again be `resolveGradeTarget`'s `existing` (activeRowIdRef never
    // points at an id already in that set).

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
