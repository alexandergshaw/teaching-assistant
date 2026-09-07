// Persistence for the course-student-intelligence Q&A history: the store of
// questions an instructor asked the Ask AI feature and the answers it gave,
// for one course. See
// supabase/migrations/20261018000000_course_intel_answers.sql for the table
// this reads and writes, and that migration's header for what is
// deliberately NOT stored (the signals snapshot, the assembled corpus, any
// per-student structured record) and why.
//
// Pattern B: every function takes an injected SupabaseClient<Database> as
// its first argument, and this module never imports "@/lib/supabase/server"
// or "next/headers" - mirrors src/lib/knowledge-overview.ts and
// src/lib/artifact-templates.ts. The auth guard lives one layer up, in
// src/app/actions/course-intel.ts.
//
// SECURITY - THIS MODULE IS THE ONLY TENANT BOUNDARY ON THE REAL PATH. The
// action layer calls every function below with a SERVICE-ROLE client, which
// bypasses RLS entirely and leaves auth.uid() null (see the migration's own
// header). So the explicit `.eq("user_id", userId)` (or server-derived
// user_id on a write) in every function here is not a defense in depth - it
// is the WHOLE defense. Two rules follow directly from
// src/lib/artifact-templates.ts's own history (a live cross-tenant hole of
// exactly this shape, found and fixed the same day this file was written):
//
//   1. Never `.upsert(row, { onConflict: "id" })` with any part of the row
//      derived from client input - a client-supplied id becomes a conflict
//      arbiter that can match and rewrite another user's row. This table
//      has no uniqueness constraint at all (append-only, like
//      announcement_exemplars, 20261017000000), so nothing here ever
//      upserts.
//   2. Every read, write and delete filters on user_id, taken from the
//      caller's OWN resolved identity - never accepted as a value that
//      traces back to client input. AppendCourseIntelAnswerInput below has
//      no user_id field at all, so one cannot even be supplied by mistake.
//
// Rows map through an explicitly typed mapper (mapCourseIntelAnswer) rather
// than trusting inference - a column-subset .select() collapses to `never`
// on some tables in this repo. Selecting "*" and mapping by hand (mirrors
// mapRecordingFile in src/lib/recording-files.ts) sidesteps that entirely:
// every column is named explicitly, never spread.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/types";
import type {
  AssemblyOmission,
  AssemblyOmissionKind,
  AssemblyTier,
  CanvasUserId,
  CourseIntelAnswerRecord,
  StudentIndex,
} from "./types";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/**
 * One stored Q&A entry - a superset of CourseIntelAnswerRecord
 * (src/lib/course-intel/types.ts) with the two fields that record
 * deliberately omits because they describe STORAGE, not the answer itself:
 *
 * - `courseId`: which course this entry belongs to.
 * - `scopeStudent`: "" for the whole course, otherwise the Canvas user id
 *   (as text) of the one student the underlying question was scoped to -
 *   see the migration's header comment on the scope_student column for why
 *   this is never null.
 */
export interface CourseIntelHistoryEntry extends CourseIntelAnswerRecord {
  readonly courseId: string;
  readonly scopeStudent: string;
}

// ---------------------------------------------------------------------------
// jsonb narrowing - never a cast. A malformed entry (a hand-edited row, a
// future schema change written by an older deploy, a field of the wrong
// type) is DROPPED rather than trusted - mirrors
// parseSourcePages/parseCitations in src/lib/knowledge-overview.ts. A
// dropped entry degrades a citation list or an omissions list by one item;
// an `as X[]` cast would instead crash whatever tries to render the first
// bad entry.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCitedStudents(value: Json): CourseIntelAnswerRecord["citedStudents"] {
  if (!Array.isArray(value)) return [];
  const students: { index: StudentIndex; userId: CanvasUserId }[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { index, userId } = entry;
    if (typeof index !== "number" || typeof userId !== "number") continue;
    students.push({ index, userId });
  }
  return students;
}

function parseOmissions(value: Json): readonly AssemblyOmission[] {
  if (!Array.isArray(value)) return [];
  const omissions: AssemblyOmission[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { kind, detail, count, studentIndex } = entry;
    if (typeof kind !== "string" || typeof detail !== "string") continue;
    const omission: {
      kind: AssemblyOmissionKind;
      detail: string;
      count?: number;
      studentIndex?: StudentIndex;
    } = {
      kind: kind as AssemblyOmissionKind,
      detail,
    };
    if (typeof count === "number") omission.count = count;
    if (typeof studentIndex === "number") omission.studentIndex = studentIndex;
    omissions.push(omission);
  }
  return omissions;
}

// Exported so the row -> record mapping is unit-testable without a live
// Supabase client - mirrors mapRecordingFile (src/lib/recording-files.ts)
// and mapScopeQuestion (src/lib/knowledge-overview.ts). Every column is
// named explicitly; never a spread, so an added column shows up here as a
// silent no-op rather than a leaked field.
export function mapCourseIntelAnswer(
  row: Database["public"]["Tables"]["course_intel_answers"]["Row"]
): CourseIntelHistoryEntry {
  return {
    id: row.id,
    courseId: row.course_id,
    scopeStudent: row.scope_student,
    question: row.question,
    answerMarkdown: row.answer_markdown,
    citedStudents: parseCitedStudents(row.cited_students),
    omissions: parseOmissions(row.omissions),
    tier: row.tier as AssemblyTier,
    assembledAt: row.assembled_at,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Every Q&A entry for one course, newest first. NO CAP - see the
 * migration's header for why this table does not copy
 * institution_knowledge_questions' silent 20-entry prune: a stored
 * assessment about a named person must never be dropped just because a
 * later, unrelated question was asked. Filters on user_id AND course_id -
 * user_id is the tenant boundary (see this module's header); course_id
 * just scopes the read to one course.
 */
export async function listCourseIntelAnswers(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string
): Promise<CourseIntelHistoryEntry[]> {
  const { data, error } = await supabase
    .from("course_intel_answers")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCourseIntelAnswer);
}

/**
 * Every Q&A entry for one course, OLDEST FIRST - the chronological reading
 * order an exported record should have, so an instructor answering "what
 * do you hold about me" gets it in the order it was asked, rather than the
 * newest-first order a history panel displays it in. Same tenant filter as
 * listCourseIntelAnswers, and equally uncapped - this IS the "what do you
 * hold" export control the acceptance criteria (D8) calls for.
 */
export async function exportCourseIntelAnswers(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string
): Promise<CourseIntelHistoryEntry[]> {
  const { data, error } = await supabase
    .from("course_intel_answers")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCourseIntelAnswer);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface AppendCourseIntelAnswerInput {
  courseId: string;
  /** "" = the whole course. Otherwise the Canvas user id (as text) of the
   * one student this question was scoped to. Defaults to "" - see the
   * migration's header comment on the scope_student column. Deliberately
   * no `userId` field anywhere on this type - see this module's header. */
  scopeStudent?: string;
  question: string;
  answerMarkdown: string;
  citedStudents: CourseIntelAnswerRecord["citedStudents"];
  omissions: readonly AssemblyOmission[];
  tier: AssemblyTier;
  /** The underlying assembly's OWN clock value (CourseIntelAssembly.
   * assembledAt), never left to a column default - mirrors
   * UpsertScopeSummaryInput.generatedAt's own doc comment in
   * src/lib/knowledge-overview.ts. */
  assembledAt: string;
}

/**
 * Insert one Q&A entry. A PLAIN INSERT - never an upsert. This table
 * carries no uniqueness constraint (append-only, like
 * announcement_exemplars, 20261017000000), so there is no ON CONFLICT
 * arbiter to need in the first place, and `userId` is taken from the
 * CALLER's own resolved identity, not from `input` - see
 * AppendCourseIntelAnswerInput's own shape above.
 */
export async function appendCourseIntelAnswer(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: AppendCourseIntelAnswerInput
): Promise<CourseIntelHistoryEntry> {
  const insertRow: Database["public"]["Tables"]["course_intel_answers"]["Insert"] = {
    user_id: userId,
    course_id: input.courseId,
    scope_student: input.scopeStudent ?? "",
    question: input.question,
    answer_markdown: input.answerMarkdown,
    cited_students: input.citedStudents as unknown as Json,
    omissions: input.omissions as unknown as Json,
    tier: input.tier,
    assembled_at: input.assembledAt,
  };

  const { data, error } = await supabase
    .from("course_intel_answers")
    .insert(insertRow)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapCourseIntelAnswer(data);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete one Q&A entry. Filters on BOTH id and user_id - mirrors
 * deleteArtifactTemplate (src/lib/artifact-templates.ts), whose own header
 * comment documents the exact cross-tenant hole an id-only delete opens
 * behind a service-role client: any signed-in account could delete any
 * other account's row by supplying its id. A foreign id filtered on the
 * wrong user_id matches zero rows, which Supabase reports as a successful
 * no-op - correct here, because the caller learns nothing about whether
 * that id exists for somebody else.
 */
export async function deleteCourseIntelAnswer(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("course_intel_answers")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}

/**
 * Delete every Q&A entry for one course, returning the row count so the UI
 * can state the real blast radius before the instructor confirms an
 * irreversible action - mirrors clearScopeQuestions
 * (src/lib/knowledge-overview.ts). Filters on BOTH user_id and course_id,
 * same reasoning as deleteCourseIntelAnswer above. Uses a head-only exact
 * count (never fetches rows just to count them, and never runs the row
 * mapper over a count-only response).
 */
export async function clearCourseIntelAnswers(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string
): Promise<number> {
  const { count, error: countError } = await supabase
    .from("course_intel_answers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("course_id", courseId);

  if (countError) throw new Error(countError.message);
  const total = count ?? 0;
  if (total === 0) return 0;

  const { error } = await supabase
    .from("course_intel_answers")
    .delete()
    .eq("user_id", userId)
    .eq("course_id", courseId);

  if (error) throw new Error(error.message);
  return total;
}
