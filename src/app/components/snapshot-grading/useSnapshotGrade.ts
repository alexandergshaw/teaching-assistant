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
import { snapshotGradeAction } from "@/app/actions/snapshot-grade";
import { verifySnapshotCitations } from "./snapshot-citations";
import {
  mintSnapshotRowId,
  computeSnapshotTotalScore,
  resolveGradeTarget,
  upsertSnapshotRow,
  buildShotReports,
  applySnapshotGradeResult,
  type SnapshotAssessmentRow,
  type ShotReadEntry,
  type ConfirmedRubricArea,
} from "./snapshot-row";
import { computeAssignmentCohortKey } from "./snapshotCohortKey";
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
  /** BLOCKER C fix (round 2 remediation). Bumped ONLY by the panel's own
   *  handleNextStudentConfirm, at the student boundary. `handleGrade`
   *  captures this BEFORE its await and compares again after: Next student
   *  is not gated on `grading`, so a grade for student A can still be in
   *  flight when the instructor moves to student B (activeRowIdRef is
   *  already null, shots/transcriptText already cleared) - without this
   *  check, A's belated resolution reads resolveGradeTarget(rows, null,
   *  mint), mints/re-points a row, and B's own grade later resolves THAT
   *  row, overwriting A's persisted assessment with B's score/feedback.
   *  Checked as a generation, not a boolean, so a SECOND boundary crossing
   *  while this call is still in flight is also caught (an equality
   *  comparison against the ORIGINAL value, never merely "has it changed
   *  since I do not remember what"). Deliberately NOT folded into aborting
   *  gradeAbortRef's controller - controller.signal.aborted is also this
   *  file's own gate on setGrading(false) in the finally below, so aborting
   *  here would wedge `grading` true forever for the newly-current student. */
  studentGenerationRef: MutableRefObject<number>;
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

export function useSnapshotGrade(
  params: UseSnapshotGradeParams
): { handleGrade: (explicitShots?: SnapshotShot[]) => Promise<void> } {
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
    studentGenerationRef,
    mountedRef,
    beginGradeAbort,
    commitSessionRows,
    announce,
    setGrading,
    setGradeError,
    setPinnedRubricAreas,
    setSplitNotice,
  } = params;

  // D: THE GRADE PASS. One call, guarded the same way (A6c). N15c (Ruling
  // D2): takes an OPTIONAL explicit shot list - the auto-grade path
  // (useSnapshotAutoGrade.ts) passes the shots it just added, so nothing is
  // ever read from a stale closure; the button path passes nothing, so
  // `gradeShots` falls back to the destructured `shots` param and every line
  // below is byte-identical to the pre-N15c behavior.
  const handleGrade = useCallback(
    async (explicitShots?: SnapshotShot[]) => {
      const gradeShots = explicitShots ?? shots;
      if (gradeShots.length === 0 && !transcriptText.trim()) {
        // H1-A: this only ever fires when there is truly nothing at all (no
        // shots AND no transcript) - Read is not required before Grade, so the
        // message must not imply it is.
        setGradeError("There is nothing to grade yet - add at least one shot to the tray.");
        return;
      }
      // BLOCKER C fix: captured BEFORE the await, compared again after it -
      // never re-read only once, and never substituted for the abort/mounted
      // check above (aborting the controller instead would skip this call's
      // own setGrading(false) in the finally below - see this param's own
      // doc comment).
      const startGeneration = studentGenerationRef.current;
      const controller = beginGradeAbort();
      setGrading(true);
      setGradeError(null);

      // N15c instruction 6: wrapped in try/finally so a REJECTING call still
      // reaches setGrading(false) - before this, a thrown error (never
      // reached by the "error" in result branch below) left `grading` stuck
      // true, disabling the button AND the auto-grade trigger for the rest
      // of the session with no message. The finally below only clears it for
      // THIS call's own controller - a call already superseded (aborted, or
      // the component unmounted) must not clear the state a NEWER call owns.
      try {
        const shotsForGrade = gradeShots.map((shot, i) => ({
          globalIndex: i + 1,
          role: shot.role,
          base64: shot.base64,
        }));
        // Built from the SAME `gradeShots` binding, in the same synchronous
        // stretch, as shotsForGrade above - the documented convention
        // (Ruling R1-B) so a future edit that builds one of these two maps
        // from a different array is visible to a reader, not just correct by
        // the closure-safety argument alone (gradeShots cannot change within
        // one invocation regardless of where in this function body the line
        // sits).
        const idByGlobalIndex = buildIdByGlobalIndex(gradeShots);

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
        // BLOCKER C fix: the student boundary moved while this call awaited
        // snapshotGradeAction - Next student is not gated on `grading`, so
        // this result belongs to a student who has already ended. Discard
        // it exactly like an aborted/unmounted call (no row write, no
        // activeRowIdRef re-point, no announce/notice) - never write onto
        // whichever row resolveGradeTarget happens to pick for the CURRENT
        // student instead.
        // SHOULD-FIX 4 (round 3 remediation): the bare `return` here used to
        // discard a COMPLETED, CORRECT grade with no signal at all - the
        // common case is pressing Grade, then immediately Next student
        // before the response lands. The call still completed and is still
        // billed (this controller is deliberately not aborted - see this
        // param's own doc comment), so silently dropping it reads as data
        // loss with no explanation. Announce it through the same
        // announce() channel every other state change in this file uses,
        // without changing the discard itself: the row-id-capture
        // alternative is a design change, not a remediation.
        if (studentGenerationRef.current !== startGeneration) {
          announce(
            "The previous student's grade finished after you moved on to the next student and was not saved."
          );
          return;
        }

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
        // the SAME numeric position against the CURRENT `gradeShots` array,
        // would let a quote verify against one shot's transcript while the id
        // written alongside it names a DIFFERENT shot - a wrong identity,
        // permanently persisted. Closing the window: match by `shot.id`
        // instead of position, so the transcript and the id both come from
        // the SAME shot.
        const transcriptsByShotId = new Map<string, string>();
        shotReads.forEach((entry) => transcriptsByShotId.set(entry.shotId, entry.transcript));
        const transcriptsByShotIndex = new Map<number, string>();
        gradeShots.forEach((shot, i) => {
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

        const suppliedRoles = new Set(gradeShots.map((shot) => shot.role));
        const hasRubricText = rubricText.trim().length > 0;
        const hasAssignmentText = assignmentText.trim().length > 0;
        const missingRoles = result.answer.missingRoles
          .filter((r): r is SnapshotRole => (SNAPSHOT_ROLES as readonly string[]).includes(r))
          .filter((r) => {
            if (r === "rubric") return !suppliedRoles.has("rubric") && !hasRubricText;
            if (r === "assignment") return !suppliedRoles.has("assignment") && !hasAssignmentText;
            return !suppliedRoles.has(r);
          });

        const shotReports = buildShotReports(gradeShots, shotReads);

        const totalScore = computeSnapshotTotalScore(result.answer.rubricResults);

        const { base, isNewRow, supersededEditedRow } = resolveGradeTarget(
          sessionRowsRef.current,
          activeRowIdRef.current,
          () => mintSnapshotRowId(Date.now())
        );
        if (isNewRow) activeRowIdRef.current = base.id;

        const scored = applySnapshotGradeResult(base, result.answer, totalScore);
        const merged: SnapshotAssessmentRow = {
          ...scored,
          shotReports,
          rubricAreas: verified,
          missingRoles,
          instructionLikeContent: result.answer.instructionLikeContent,
          instructionLikeContentQuote: result.answer.instructionLikeContentQuote,
          imageFallbackNote: result.imageFallbackNote,
          evidenceDropped: false, // a fresh grade always carries full evidence in memory
          // A24 (docs/a24-scope.md section 3; DECISION 4): captured HERE, at
          // grade time, from the same assignmentText already in lexical scope
          // for this call - never re-derived later from a row that no longer
          // has the text in scope. Never the raw text itself (U10) - only its
          // non-reversible digest.
          cohortKey: computeAssignmentCohortKey(assignmentText),
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
      } finally {
        if (!controller.signal.aborted && mountedRef.current) setGrading(false);
      }
    },
    [
      shots,
      transcriptText,
      assignmentText,
      rubricText,
      confirmedRubricAreas,
      instructorInstructions,
      shotReads,
      sessionRowsRef,
      activeRowIdRef,
      studentGenerationRef,
      mountedRef,
      beginGradeAbort,
      commitSessionRows,
      announce,
      setGrading,
      setGradeError,
      setPinnedRubricAreas,
      setSplitNotice,
    ]
  );

  return { handleGrade };
}
