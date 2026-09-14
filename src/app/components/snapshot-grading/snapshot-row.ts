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
import type { SnapshotRole, SnapshotShot } from "./snapshot-shot";
import type { LlmProvider } from "@/lib/llm";
import { deriveTotalScore } from "@/lib/grade/parsing";

// ---------------------------------------------------------------------------
// The row itself.
// ---------------------------------------------------------------------------

export type SnapshotShotReadStatus = "read" | "partly-read" | "not-read";

/** The read pass's own per-shot entry (WAVE 5). Declared here, not inline in
 *  SnapshotGradingPanel.tsx, so it can be shared with useSnapshotGrade.ts
 *  (backlog 3.5's line-budget extraction) without either file importing
 *  from the other - a leaf both can depend on, avoiding a cycle. */
export interface ShotReadEntry {
  shotIndex: number;
  role: SnapshotRole;
  transcript: string;
  status: SnapshotShotReadStatus;
  reason?: string;
  /** RULING R1-E: the shot.id this entry was read FROM, captured at read
   *  time from the then-current `shots` array. Required, not optional -
   *  without it, the grade pass can only match a read transcript back to a
   *  shot by READ-TIME position, and `shotReads` is cleared at only two
   *  sites (next-student, the read pass itself) - neither delete nor
   *  reorder clears it. Read, then delete/reorder a shot, then Grade: the
   *  quote would verify against one shot's transcript while the persisted
   *  id came from a DIFFERENT shot at the same numeric position - a wrong
   *  shot IDENTITY, permanently persisted, with no index left to fall back
   *  on. Keying the grade-time transcript lookup by this id instead (see
   *  useSnapshotGrade.ts) makes that divergence unrepresentable: the
   *  transcript and the id both come from the SAME shot, matched by id, not
   *  from two different arrays matched only by coincidentally-equal
   *  position. */
  shotId: string;
  /** N1 (suggest-and-confirm shot roles, Ruling H1-E): the read pass's own
   *  role SUGGESTION for this shot, captured from the SAME read response
   *  this entry's transcript came from - never applied to shot.role by
   *  anything that reads this field (snapshot-role-suggestion.ts's
   *  acceptAllSuggestions is the ONLY writer, and only on an explicit
   *  instructor action). Absent when the model declined ("unsure") or named
   *  anything outside the closed SnapshotRole set - snapshot-parse.ts is the
   *  only place that string is validated. */
  roleSuggestion?: SnapshotRole;
}

export interface SnapshotShotReadReport {
  shotIndex: number;
  role: SnapshotRole;
  status: SnapshotShotReadStatus;
  /** Set for "not-read"/"partly-read" - the model's own unreadableReason, or
   *  a locally-derived note when the read pass failed outright for this
   *  shot's batch. */
  reason?: string;
  /** shot.id at construction time (buildShotReports below) - REQUIRED, not
   *  optional: R1-E's closed window depends on every fresh entry carrying a
   *  real id. Always non-null for a freshly built report - every entry is
   *  shot-sourced by construction, there is no model-authored index to
   *  hallucinate here. null only for a row persisted before this field
   *  existed (drop-tolerant default in snapshot-row-serialization.ts). */
  shotId: string | null;
}

export interface SnapshotRubricAreaEvidence {
  area: string;
  score: string;
  quote: string;
  shotIndex: number;
  // RULING A / M1: classified by the parser from the RAW shotIndex value
  // before coercion (never "pasted" for a missing or non-numeric field). A
  // row persisted by F1 before this field existed reads back as "unknown"
  // (snapshot-row-serialization.ts's fromWire default) - never "pasted",
  // which would misrender an old row's evidence as rubric/assignment text.
  source: "shot" | "pasted" | "unknown";
  verified: boolean;
  /** Resolved ONCE, at grade time, from the SAME globalIndex -> shot.id map
   *  the model's own labels were built from (buildIdByGlobalIndex,
   *  snapshot-shot.ts). null when final `source !== "shot"`, when the
   *  model's shotIndex has no entry in that map (a hallucinated index), or
   *  when this row was persisted before this field existed (drop-tolerant
   *  default in snapshot-row-serialization.ts - RULING R1-D: a legacy
   *  `source: "shot"` row with no shotId and a genuinely-hallucinated-index
   *  row with a shotId that fails to resolve now render IDENTICALLY, by
   *  owner decision - the citation is reported only as "cannot be
   *  resolved", never as "removed"). */
  shotId: string | null;
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
  /** F1: set true ONLY by the codec's dropBulk write path - never by a
   *  fresh grade (handleGrade always sets this false on a row it just
   *  produced). Read by SnapshotResultCard to render a DURABLE, post-reload
   *  notice that this row's evidence citations were not saved, closing the
   *  gap where `persistError` (a useState, not persisted) would otherwise
   *  say nothing once the tab that saw the quota failure is gone. REQUIRED,
   *  not optional - an optional field would make both the wire enumeration
   *  and the read-side default decorative, since a caller could always omit
   *  it and TypeScript would not object. */
  evidenceDropped: boolean;
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
    evidenceDropped: false,
  };
}

// ---------------------------------------------------------------------------
// F1 (A4d/A4b): the session list's own in-memory mutator and grade-target
// resolution. Named pure functions rather than inline logic in
// SnapshotGradingPanel.tsx - this repo renders no component in any test, so
// the find/map/spread these replace would have been unreachable by every
// test here if left inline.
// ---------------------------------------------------------------------------

/** Replaces the row with the same id if one exists, appends otherwise. */
export function upsertSnapshotRow(
  rows: readonly SnapshotAssessmentRow[],
  row: SnapshotAssessmentRow
): SnapshotAssessmentRow[] {
  const idx = rows.findIndex((r) => r.id === row.id);
  if (idx === -1) return [...rows, row];
  return rows.map((r, i) => (i === idx ? row : r));
}

export interface GradeTargetResolution {
  base: SnapshotAssessmentRow;
  /** true when the caller must upsert this as a NEW row rather than the
   *  active one - either because there is no active row yet, or because of
   *  the case below. */
  isNewRow: boolean;
  /** Set to the PREVIOUS active row ONLY when `isNewRow` is true BECAUSE
   *  that row was already hand-edited by the instructor - null when
   *  `isNewRow` is true simply because there was no active row yet. Lets
   *  the caller announce a split ONLY when a split actually happened, never
   *  on an ordinary first grade. */
  supersededEditedRow: SnapshotAssessmentRow | null;
}

/** A re-grade of a row the instructor has already hand-edited
 *  (`userEdited === true`) must NEVER merge into it - `applyAssessmentResult`
 *  holds back only the four AssessmentFeedback fields on an edited row; it
 *  does nothing to protect `rubricAreas`, `shotReports`, `missingRoles`, or
 *  `instructionLikeContent`, all of which the panel's own merge object
 *  overwrites unconditionally. This function makes that state
 *  unrepresentable: an edited row is never touched again; a re-grade
 *  becomes a NEW row instead, inheriting the student's typed name so it is
 *  not misread as a different student. */
export function resolveGradeTarget(
  rows: readonly SnapshotAssessmentRow[],
  activeId: string | null,
  mintId: () => string
): GradeTargetResolution {
  const existing = activeId ? rows.find((r) => r.id === activeId) ?? null : null;
  if (existing && !existing.userEdited) {
    return { base: existing, isNewRow: false, supersededEditedRow: null };
  }
  return {
    base: createEmptySnapshotRow(mintId(), existing?.studentName ?? ""),
    isNewRow: true,
    supersededEditedRow: existing && existing.userEdited ? existing : null,
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

/**
 * Resolves a persisted shotId to its CURRENT 1-based position in the live
 * `shots` array - the SAME global-position convention the model itself was
 * given (useSnapshotGrade.ts:95, and snapshot-read-prompt.ts's identical
 * scheme for the read pass), tracked live through deletes and reorders.
 * Returns null when shotId is null, or when it names no shot currently in
 * `shots` - RULING R1-D: that null is reported as "cannot be resolved",
 * never as "removed", because a genuine deletion and a not-yet-loaded tray
 * (the dominant case, every reload - `shots` is `[]` on every mount) are
 * indistinguishable here on purpose. Reused at multiple render sites in
 * SnapshotResultCard.tsx: the rubric-area citation line and the read-report
 * line - one function, not a classifier per call site.
 */
export function resolveCitationShotPosition(
  shots: readonly SnapshotShot[],
  shotId: string | null
): number | null {
  if (shotId === null) return null;
  const idx = shots.findIndex((s) => s.id === shotId);
  return idx === -1 ? null : idx + 1;
}

/**
 * The read report's per-shot entries, built directly from `shots` by array
 * position - never from a model answer, so there is no hallucination risk
 * and shot.id is already in scope at construction time (unlike the
 * rubric-area case, which needs idByGlobalIndex because the model's
 * shotIndex is untrusted input - see snapshot-citations.ts). Extracted here
 * (Ruling R1-B) so a vitest leaf can execute it without importing the hook -
 * there is no useSnapshotGrade.test.ts, and importing a .ts file that wraps
 * its only export in useCallback does not exercise it.
 */
export function buildShotReports(
  shots: readonly SnapshotShot[],
  shotReads: ReadonlyMap<number, ShotReadEntry>
): SnapshotShotReadReport[] {
  return shots.map((shot, i) => {
    const idx = i + 1;
    const entry = shotReads.get(idx);
    return {
      shotIndex: idx,
      shotId: shot.id,
      role: shot.role,
      status: entry ? entry.status : "not-read",
      reason: entry?.reason,
    };
  });
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
  /** The full, role-labeled transcription - possibly edited by the
   *  instructor per A1f - covering every shot regardless of whether its
   *  image made it into the grade call. */
  transcriptBlock: string;
  shots: GradeShotCandidate[];
  /** Backlog 3.5 (scratchpad/b35-rulings.md, Ruling B35-7/B35-14): the
   *  instructor-confirmed rubric-area list, sent EXACTLY as edited - REQUIRED
   *  (never optional, never falls back to a server-side parse of rubricText).
   *  The panel is the sole caller and always passes `confirmedRubricAreas ??
   *  []` (Ruling B35-17), so `[]` here means either no rubric text was
   *  supplied at all, or the instructor removed every confirmed area - both
   *  are legitimate "grade unpinned" states, not a control failure. */
  confirmedRubricAreas: { name: string; points: number | null }[];
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

// ---------------------------------------------------------------------------
// Backlog 3.5 (scratchpad/b35-rulings.md): the confirmed-rubric-areas
// control's own pure functions. This repo renders no component in any test
// (docs/loop/this-repo.md section 2), so this logic lives in a plain leaf,
// never inline in SnapshotGradingPanel.tsx, or none of it could be tested.
// ---------------------------------------------------------------------------

export type ConfirmedRubricArea = { name: string; points: number | null };

/** Ruling B35-19: a pure, unit-tested increment-and-return helper so a
 *  non-incrementing staleness guard (`const id = ref.current;`, which reads
 *  without advancing) cannot be written where this is used - the shape is
 *  made unrepresentable rather than merely pinned by a source-text regex,
 *  which failed three times on this exact control (see the ruling). */
export function nextParseRequestId(ref: { current: number }): number {
  ref.current += 1;
  return ref.current;
}

/** `true` when `requestId` is no longer the LATEST id issued - i.e. a newer
 *  rubric submission has already superseded the parse this result belongs
 *  to, and the result must be discarded rather than seeded into state. */
export function isStaleParseResult(requestId: number, latestRequestId: number): boolean {
  return requestId !== latestRequestId;
}

/** Ruling B35-13: the Grade button's gate is a function of BOTH pieces of
 *  state, not `confirmedRubricAreas` alone - an instructor who never opens
 *  the rubric modal has `rubricText === ""` and `confirmedRubricAreas ===
 *  null` forever, and grading with no rubric text is a first-class, shipped
 *  path that must stay enabled. Only when rubric text actually exists does a
 *  `null` confirmed list (parse pending, or parse errored) block Grade. */
export function isConfirmedAreasReady(
  rubricText: string,
  confirmedRubricAreas: ConfirmedRubricArea[] | null
): boolean {
  return rubricText.trim() === "" || confirmedRubricAreas !== null;
}

/** Removes the area at `index`. Out-of-range indexes are a no-op (the array
 *  is returned unchanged) rather than throwing - the caller's index always
 *  comes from a render of the same array, but a stale closure must not crash
 *  the panel. */
export function removeConfirmedArea(
  areas: readonly ConfirmedRubricArea[],
  index: number
): ConfirmedRubricArea[] {
  return areas.filter((_, i) => i !== index);
}

/** Ruling B35-11: an added area may carry `null` points - requiring points on
 *  add was withdrawn once the scoring instruction itself was scoped to
 *  "every area has points" (src/lib/grade/prompts.ts), since a null-points
 *  added area no longer risks an invented denominator. Only the NAME is
 *  validated. */
export function addConfirmedArea(
  areas: readonly ConfirmedRubricArea[],
  name: string,
  points: number | null
): { areas: ConfirmedRubricArea[] } | { error: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { error: "Enter a name for the rubric area before adding it." };
  }
  return { areas: [...areas, { name: trimmed, points }] };
}
