// Snapshot grading, WAVE 5 (docs/snapshot-grading-acceptance-criteria.md).
// The session's own row shape, EXTENDING AssessmentRowCore
// (src/app/components/assessment-shared/assessment-row.ts) rather than
// re-deriving copy/edit/persistence-shaped behaviour that shared file
// already owns. Every mutator this file needs (edit a feedback field, apply
// a grading result, remove a row, the clear-table signature) is the shared
// one, imported and reused unchanged - this file adds only what is genuinely
// new to the snapshot surface: the per-shot read report, the verified
// rubric-area evidence, the missing-role list, the instructionLikeContent
// flag, and the grade-pass image/budget selection (A1e's measured fallback).
//
// C (identity): SnapshotAssessmentRow carries NO userId-shaped field, by
// construction - AssessmentRowCore's own NoPostableIdentity guard (a
// tsc-level check, not a runtime one) makes adding one a compile error at
// every shared mutator's call site. Sabotage-checked for this wave: adding
// `userId?: number` to this interface and calling editAssessmentField /
// applyAssessmentResult below turns tsc red at those two call sites; removing
// it turns tsc green again. See the report for both quoted diagnostics.

import type { AssessmentRowCore, NoPostableIdentity } from "../assessment-shared/assessment-row";
import type { SnapshotRole } from "./snapshot-shot";
import type { LlmProvider } from "@/lib/llm";
import type { RubricCriterion } from "@/lib/grade/types";
import { deriveTotalScore } from "@/lib/grade/parsing";

// ---------------------------------------------------------------------------
// The row itself.
// ---------------------------------------------------------------------------

export type SnapshotShotReadStatus = "read" | "partly-read" | "not-read";

export interface SnapshotShotReadReport {
  shotIndex: number;
  role: SnapshotRole;
  status: SnapshotShotReadStatus;
  /** Set for "not-read"/"partly-read" - the model's own unreadableReason, or
   *  a locally-derived note when the read pass failed outright for this
   *  shot's batch. */
  reason?: string;
}

export interface SnapshotRubricAreaEvidence {
  area: string;
  score: string;
  quote: string;
  shotIndex: number;
  verified: boolean;
}

/**
 * OWNER DECISION (this wave's brief, overruling the acceptance criteria's
 * own X9): an unreadable shot among several does NOT block the grade. A role
 * never supplied at all is a STATED GAP (`missingRoles`), not an error; an
 * unreadable shot in a role the instructor DID supply renders as a
 * "Not read"/"Partly read" badge on that shot (`shotReports`), named above
 * the score, never as a thrown error that withholds the whole grade.
 */
export interface SnapshotAssessmentRow extends AssessmentRowCore {
  shotReports: SnapshotShotReadReport[];
  rubricAreas: SnapshotRubricAreaEvidence[];
  missingRoles: SnapshotRole[];
  instructionLikeContent: boolean;
  instructionLikeContentQuote?: string;
  /** A1e's measured fallback: set when the grade call's image budget was
   *  reached and some shots were sent as transcription text only. Rendered
   *  in the SAME block as the score, per the brief - never buried. */
  imageFallbackNote?: string;
}

export type NoPostableSnapshotRow = NoPostableIdentity<SnapshotAssessmentRow>;

let snapshotRowIdCounter = 0;

export function mintSnapshotRowId(now: number): string {
  return `snap-row-${now}-${snapshotRowIdCounter++}`;
}

export function createEmptySnapshotRow(id: string, studentName: string): SnapshotAssessmentRow {
  return {
    id,
    studentName,
    state: "pending",
    error: "",
    userEdited: false,
    totalScore: "",
    strengths: "",
    improvements: "",
    overallComment: "",
    shotReports: [],
    rubricAreas: [],
    missingRoles: [],
    instructionLikeContent: false,
  };
}

/** U8.1's tally, read off `shotReports`: how many shots came back read,
 *  partly read, or not read at all. Used to render group headings like
 *  "REPLIES (3, 1 not read)". */
export function summarizeShotReports(reports: readonly SnapshotShotReadReport[]): {
  read: number;
  partlyRead: number;
  notRead: number;
} {
  let read = 0;
  let partlyRead = 0;
  let notRead = 0;
  for (const r of reports) {
    if (r.status === "read") read++;
    else if (r.status === "partly-read") partlyRead++;
    else notRead++;
  }
  return { read, partlyRead, notRead };
}

// ---------------------------------------------------------------------------
// A1e's measured fallback: the grade pass's own image budget and priority
// selection. Leaves room for the transcript block and the system prompt
// against UPLOAD_WIRE_BUDGET_BYTES (3.5 MB, src/lib/upload-budget.ts:41).
// ---------------------------------------------------------------------------

/** Wire bytes reserved for shot images in the grade call. 2.5 MB, leaving
 *  roughly 1 MB of the 3.5 MB budget for the transcript block, the rubric/
 *  assignment text, and the prompt itself. */
export const GRADE_PASS_IMAGE_BUDGET_BYTES = 2.5 * 1024 * 1024;

const GRADE_ROLE_PRIORITY: readonly SnapshotRole[] = ["rubric", "assignment", "post", "replies", "submission", "other"];

export interface GradeShotCandidate {
  globalIndex: number;
  role: SnapshotRole;
  base64: string;
}

// ---------------------------------------------------------------------------
// D: the two server actions' own request/response shapes, defined HERE (a
// non-"use server" leaf) rather than in snapshot-read.ts/snapshot-grade.ts
// themselves - a "use server" file may export only async functions, and only
// `next build` catches a type re-export violation (src/lib/use-server-
// exports.test.ts covers part of it, but only the part it scans).
// ---------------------------------------------------------------------------

export interface SnapshotReadBatchShotInput {
  /** 1-based, stable across the whole session (not reset per batch) - lets
   *  the caller match a partial-failure batch's results back to the right
   *  shots. */
  globalIndex: number;
  role: SnapshotRole;
  note?: string;
  base64: string;
}

/** D (client-orchestrated): the read pass's own batch size, sized well under
 *  the wire budget even at MAX_SHOTS worth of full-fidelity JPEGs (each shot
 *  is pre-flighted individually at snap time, so four together are nowhere
 *  near UPLOAD_WIRE_BUDGET_BYTES). Small enough that a single batch failure
 *  never loses more than a handful of shots' reads. */
export const READ_BATCH_SIZE = 4;

/**
 * REUSES the shared grading engine's own scoring math (src/lib/grade/parsing
 * .ts's deriveTotalScore) rather than re-deriving a sum-of-areas total here -
 * the same function grading-feedback-prompt.ts's composeGradingRowResult
 * calls for the recording grader. `comment` is set to "" for every area
 * since this feature's own rubricAreaEvidence carries the citation instead,
 * and deriveTotalScore never reads that field.
 */
export function computeSnapshotTotalScore(rubricResults: readonly { area: string; score: string }[]): string {
  return deriveTotalScore(
    "",
    rubricResults.map((r) => ({ area: r.area, score: r.score, comment: "" }))
  );
}

export interface TranscriptEntry {
  shotIndex: number;
  role: SnapshotRole;
  transcript: string;
}

/**
 * A1f: the role-labeled transcription block shown to the instructor before
 * grading, and the exact text sent as the grade pass's TRANSCRIPTION part.
 * Entries with no transcript (never read yet) are omitted, not rendered as
 * an empty labeled block.
 */
export function buildTranscriptBlock(entries: readonly TranscriptEntry[]): string {
  return entries
    .filter((e) => e.transcript.trim() !== "")
    .sort((a, b) => a.shotIndex - b.shotIndex)
    .map((e) => `Shot ${e.shotIndex} (role: ${e.role}):\n${e.transcript.trim()}`)
    .join("\n\n");
}

export interface SnapshotGradeRequestInput {
  assignmentText: string;
  rubricText: string;
  criteria: RubricCriterion[];
  /** The full, role-labeled transcription - possibly edited by the
   *  instructor per A1f - covering every shot regardless of whether its
   *  image made it into the grade call. */
  transcriptBlock: string;
  shots: GradeShotCandidate[];
  provider: LlmProvider;
}

export interface GradeShotSelection {
  included: GradeShotCandidate[];
  excludedRoles: SnapshotRole[];
  /** Set only when at least one shot was dropped to transcript-only -
   *  rendered in the SAME block as the score, per the brief, never buried in
   *  a collapsible. */
  fallbackNote?: string;
}

/**
 * Sums the ACTUAL encoded base64 strings (never `File.size`, per
 * upload-budget.ts's own stated single-most-repeated cap defect) and
 * includes shots in role priority (rubric, assignment, then the "work"
 * roles) until the budget is spent. Everything past that point still has its
 * transcription sent (the caller always sends the full transcript block
 * regardless of this selection) - only the IMAGE goes transcript-only.
 */
export function selectShotsForGradeCall(
  shots: readonly GradeShotCandidate[],
  budgetBytes: number = GRADE_PASS_IMAGE_BUDGET_BYTES
): GradeShotSelection {
  const sorted = [...shots].sort(
    (a, b) => GRADE_ROLE_PRIORITY.indexOf(a.role) - GRADE_ROLE_PRIORITY.indexOf(b.role)
  );
  const included: GradeShotCandidate[] = [];
  const excluded: GradeShotCandidate[] = [];
  let used = 0;
  for (const shot of sorted) {
    const cost = shot.base64.length;
    if (used + cost <= budgetBytes) {
      included.push(shot);
      used += cost;
    } else {
      excluded.push(shot);
    }
  }
  if (excluded.length === 0) return { included, excludedRoles: [] };
  const excludedRoles = Array.from(new Set(excluded.map((s) => s.role)));
  return {
    included,
    excludedRoles,
    fallbackNote: `The image budget for this grading call was reached, so ${excluded.length} shot${
      excluded.length === 1 ? "" : "s"
    } (role${excludedRoles.length === 1 ? "" : "s"}: ${excludedRoles.join(", ")}) were sent as transcription text only, not as images.`,
  };
}
