// Persistence for grading drafts: the durable output of the unattended
// grade-to-draft workflow step. A draft holds a self-contained, rawBase64-
// stripped `runs` array (see stripGradingRunEntriesForDraft in
// src/lib/grade.ts) that the app-open review-grading-draft step later loads,
// reconstructs into the same review table grade-submissions uses, and - only
// after the user approves rows there - feeds to post-grades. This module
// never posts to Canvas and has no Canvas dependency at all.
//
// Mirrors src/lib/workflow-schedules.ts: functions take an explicit
// SupabaseClient + userId (so the same code works from a browser session and
// from the cron's service-role client via requireOwner()'s runAsOwner
// impersonation), every query is scoped with .eq("user_id", userId), and a
// cast-through-any table() helper works around the generated Database type
// not yet describing this table's row shape everywhere the client needs it.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";
import type {
  GradeResult,
  GradingRun,
  GradingRunEntry,
  RubricAreaResult,
  SubmittedFileInfo,
} from "./grade";

export type GradingDraftStatus = "pending" | "reviewed";

export interface GradingDraftPayload {
  runs: GradingRunEntry[];
}

export interface GradingDraft {
  id: string;
  userId: string;
  status: GradingDraftStatus;
  summary: string;
  payload: GradingDraftPayload;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight listing shape for pickers - avoids shipping every draft's
 * full (possibly large) payload down to a list view. */
export interface GradingDraftSummary {
  id: string;
  summary: string;
  createdAt: string;
}

type DraftRow = Database["public"]["Tables"]["grading_drafts"]["Row"];

function coerceRubricArea(value: unknown): RubricAreaResult | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (typeof o.area !== "string") return null;
  return {
    area: o.area,
    score: typeof o.score === "string" ? o.score : "",
    comment: typeof o.comment === "string" ? o.comment : "",
  };
}

function coerceSubmittedFile(value: unknown): SubmittedFileInfo | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (typeof o.name !== "string") return null;
  return {
    name: o.name,
    extension: typeof o.extension === "string" ? o.extension : "",
    previewContent: typeof o.previewContent === "string" ? o.previewContent : "",
    previewTruncated: !!o.previewTruncated,
    mimeType: typeof o.mimeType === "string" ? o.mimeType : undefined,
    // rawBase64 is intentionally never read back, even if a raw payload
    // somehow carried it - a draft must never resurrect submitted-file
    // bytes once stripped.
  };
}

function coerceGradeResult(value: unknown): GradeResult | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (typeof o.student !== "string") return null;

  const rubricAreas = Array.isArray(o.rubricAreas)
    ? o.rubricAreas
        .map(coerceRubricArea)
        .filter((a): a is RubricAreaResult => a !== null)
    : [];
  const submittedFiles = Array.isArray(o.submittedFiles)
    ? o.submittedFiles
        .map(coerceSubmittedFile)
        .filter((f): f is SubmittedFileInfo => f !== null)
    : [];

  return {
    student: o.student,
    overallComment: typeof o.overallComment === "string" ? o.overallComment : "",
    rubricAreas,
    totalScore: typeof o.totalScore === "string" ? o.totalScore : "",
    feedback: typeof o.feedback === "string" ? o.feedback : "",
    mergedFileCount: typeof o.mergedFileCount === "number" ? o.mergedFileCount : 0,
    submittedFiles,
    userId: typeof o.userId === "number" ? o.userId : undefined,
    // codeExecution is display-only and never persisted - see
    // stripGradeResultForDraft.
  };
}

function coerceGradingRun(value: unknown): GradingRun | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const results = Array.isArray(o.results)
    ? o.results.map(coerceGradeResult).filter((r): r is GradeResult => r !== null)
    : [];
  return {
    results,
    rubricAreaNames: Array.isArray(o.rubricAreaNames)
      ? o.rubricAreaNames.filter((n): n is string => typeof n === "string")
      : [],
    fullCreditChecklist: Array.isArray(o.fullCreditChecklist)
      ? o.fullCreditChecklist.filter((n): n is string => typeof n === "string")
      : [],
    speedGraderUrl: typeof o.speedGraderUrl === "string" ? o.speedGraderUrl : null,
    sampleAnswer: typeof o.sampleAnswer === "string" ? o.sampleAnswer : undefined,
  };
}

function coerceRunEntry(value: unknown): GradingRunEntry | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (typeof o.courseName !== "string" || typeof o.assignmentName !== "string") return null;
  const run = coerceGradingRun(o.run);
  if (!run) return null;

  return {
    courseName: o.courseName,
    assignmentName: o.assignmentName,
    canvasUrl: typeof o.canvasUrl === "string" ? o.canvasUrl : "",
    run,
    institution: typeof o.institution === "string" ? o.institution : undefined,
    assignmentId: typeof o.assignmentId === "string" ? o.assignmentId : undefined,
    pointsPossible:
      typeof o.pointsPossible === "number"
        ? o.pointsPossible
        : o.pointsPossible === null
          ? null
          : undefined,
    offline: !!o.offline,
  };
}

/** Coerce an untyped jsonb payload into a typed GradingDraftPayload,
 * dropping anything malformed rather than throwing - a hand-edited or
 * partially-written row degrades to fewer runs, never a crash. */
export function coerceGradingDraftPayload(raw: unknown): GradingDraftPayload {
  if (!raw || typeof raw !== "object") return { runs: [] };
  const o = raw as Record<string, unknown>;
  const runs = Array.isArray(o.runs)
    ? o.runs.map(coerceRunEntry).filter((r): r is GradingRunEntry => r !== null)
    : [];
  return { runs };
}

/** Explicit row -> domain mapper, mirroring mapSchedule in
 * workflow-schedules.ts. */
export function mapDraft(row: DraftRow): GradingDraft {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status === "reviewed" ? "reviewed" : "pending",
    summary: row.summary,
    payload: coerceGradingDraftPayload(row.payload),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function table(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("grading_drafts");
}

/** The owner's pending drafts, oldest first (review-grading-draft always
 * takes the head of this list). */
export async function listPendingGradingDrafts(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<GradingDraft[]> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as DraftRow[]).map(mapDraft);
}

/** One draft by id, scoped to its owner; null when missing or not owned. */
export async function getGradingDraft(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<GradingDraft | null> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapDraft(data as DraftRow);
}

export async function createGradingDraft(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { summary: string; payload: GradingDraftPayload }
): Promise<GradingDraft> {
  const { data, error } = await table(supabase)
    .insert({
      user_id: userId,
      status: "pending",
      summary: input.summary,
      payload: input.payload as unknown as Json,
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return mapDraft(data as DraftRow);
}

/** Idempotent: marking an already-reviewed (or missing) draft reviewed again
 * is a no-op success, so a best-effort caller never needs to check first. */
export async function markGradingDraftReviewed(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await table(supabase)
    .update({ status: "reviewed", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

/** Overwrite a draft's payload (e.g. after the user edits scores/comments in
 * the Drafts tab). Scoped to the owner; leaves status unchanged. */
export async function updateGradingDraft(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  input: { payload: GradingDraftPayload }
): Promise<void> {
  const { error } = await table(supabase)
    .update({ payload: input.payload as unknown as Json, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteGradingDraft(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await table(supabase).delete().eq("user_id", userId).eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}
