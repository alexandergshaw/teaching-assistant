// Persistence for the course-student-intelligence Q&A history: the store of
// questions an instructor asked the Ask AI feature and the answers it gave,
// for one course - OR ACROSS SEVERAL, since
// supabase/migrations/20261019000000_course_intel_answers_cross_course.sql.
// See supabase/migrations/20261018000000_course_intel_answers.sql for the
// table this reads and writes, and that migration's header for what is
// deliberately NOT stored (the signals snapshot, the assembled corpus, any
// per-student structured record) and why.
//
// SINGLE-COURSE VS CROSS-COURSE (acceptance-criteria decision D24e - "a
// ranking that silently omits courses is worse than a list that does"). A
// row is about ONE course (`courseId` set, `courseIds` empty) or about
// SEVERAL (`courseId` null, `courseIds` the full covered set, at least one
// entry) - never both, never neither. See
// 20261019000000_course_intel_answers_cross_course.sql's header for the full
// account and course_intel_answers_course_scope_check, the constraint that
// enforces it in the database regardless of what a caller in this process
// gets right.
//
// THE SHARED DATABASE TYPE FILE (src/lib/supabase/types.ts) STILL DESCRIBES
// THE OLD SCHEMA - course_id as non-nullable, no course_ids column at all -
// and this change's scope did not include editing that shared, hand-
// maintained file. CourseIntelAnswerRawRow / CourseIntelAnswerRawInsert below
// are declared LOCALLY to cross that gap with one explicit cast per call
// site, in the same spirit as this file's own `as unknown as Json` casts.
// The edit that file still owes: change `course_id: string` to `string |
// null` and add `course_ids: string[] | null` on CourseIntelAnswersRow,
// CourseIntelAnswersInsert and CourseIntelAnswersUpdate.
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
  StudentIdentitySource,
  StudentIndex,
} from "./types";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/**
 * One stored Q&A entry - a superset of CourseIntelAnswerRecord
 * (src/lib/course-intel/types.ts) with the three fields that record
 * deliberately omits because they describe STORAGE, not the answer itself:
 *
 * - `courseId`: which course this entry belongs to, for a single-course
 *   answer - null for a cross-course one, where `courseIds` names the
 *   covered set instead. Never both populated - see
 *   supabase/migrations/20261019000000_course_intel_answers_cross_course.sql.
 * - `courseIds`: the full set of course_hub ids a CROSS-COURSE answer
 *   covered (acceptance-criteria decision D24e - coverage is part of the
 *   answer's meaning). Empty on every single-course row.
 * - `scopeStudent`: "" for the whole course, otherwise the Canvas user id
 *   (as text) of the one student the underlying question was scoped to -
 *   see the migration's header comment on the scope_student column for why
 *   this is never null.
 */
export interface CourseIntelHistoryEntry extends CourseIntelAnswerRecord {
  readonly courseId: string | null;
  readonly courseIds: readonly string[];
  readonly scopeStudent: string;
}

// ---------------------------------------------------------------------------
// The real row shape, after 20261019000000_course_intel_answers_cross_course
// .sql - see this file's own header for why this is declared locally rather
// than by editing the shared src/lib/supabase/types.ts. Exported so a test
// fixture can be built against the real shape without re-deriving it.
// ---------------------------------------------------------------------------

export type CourseIntelAnswerRawRow = Omit<
  Database["public"]["Tables"]["course_intel_answers"]["Row"],
  "course_id"
> & {
  course_id: string | null;
  course_ids: unknown;
};

type CourseIntelAnswerRawInsert = Omit<
  Database["public"]["Tables"]["course_intel_answers"]["Insert"],
  "course_id"
> & {
  course_id: string | null;
  course_ids: string[];
};

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

/** The identity sources a stored row may legally name. Anything else is a row
 * from a future or corrupted writer and falls back rather than throwing. */
const IDENTITY_SOURCES: ReadonlySet<string> = new Set<StudentIdentitySource>([
  "lms-roster",
  "cached-canvas-id",
  "course-roster-name",
  "ambiguous-name",
  "instructor-attached",
]);
function parseCitedStudents(value: Json): CourseIntelAnswerRecord["citedStudents"] {
  if (!Array.isArray(value)) return [];
  const students: {
    index: StudentIndex;
    userId: CanvasUserId | null;
    identitySource: StudentIdentitySource;
  }[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { index, userId, identitySource } = entry;
    if (typeof index !== "number") continue;
    // A null userId is VALID, not malformed - an offline answer identifies a
    // student by name against the course roster and has no Canvas id. Only a
    // non-null value that is not a number is rejected.
    if (userId !== null && userId !== undefined && typeof userId !== "number") continue;
    // An older row written before identity sources existed is read as
    // lms-roster, which is what every row at that time actually was. Guessing
    // anything weaker would misreport a verified identity as a matched one.
    const source: StudentIdentitySource =
      typeof identitySource === "string" && IDENTITY_SOURCES.has(identitySource)
        ? (identitySource as StudentIdentitySource)
        : "lms-roster";
    students.push({ index, userId: typeof userId === "number" ? userId : null, identitySource: source });
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

/** `course_ids` is a real `uuid[]` column, not jsonb, so PostgREST already
 * hands back a plain string array rather than something needing JSON
 * parsing - this only guards against a future or corrupted row where the
 * value is not an array of strings, mirroring parseCitedStudents/
 * parseOmissions' own "drop, never throw" discipline above. */
function parseCourseIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

// Exported so the row -> record mapping is unit-testable without a live
// Supabase client - mirrors mapRecordingFile (src/lib/recording-files.ts)
// and mapScopeQuestion (src/lib/knowledge-overview.ts). Every column is
// named explicitly; never a spread, so an added column shows up here as a
// silent no-op rather than a leaked field.
export function mapCourseIntelAnswer(row: CourseIntelAnswerRawRow): CourseIntelHistoryEntry {
  return {
    id: row.id,
    courseId: row.course_id,
    courseIds: parseCourseIds(row.course_ids),
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
 * Both halves of "every entry touching this course" - a SINGLE-course row
 * about it, or a CROSS-course row that covered it among others - as raw rows,
 * unsorted. Shared by listCourseIntelAnswers and exportCourseIntelAnswers so
 * the two-query, tenant-filtered shape is written once.
 *
 * TWO QUERIES, NEVER ONE `.or()` FILTER. `courseId` traces back to a
 * client-supplied history-panel request (see
 * src/app/actions/course-intel.ts), and PostgREST's `.or()` filter is a small
 * string DSL - building one by interpolating a value that ultimately comes
 * from the client into it is exactly the injection shape
 * src/lib/artifact-templates.ts's own history already warns this project
 * about elsewhere. `.eq()` and `.contains()` each parameterise their argument
 * safely instead. The two result sets can never overlap -
 * course_intel_answers_course_scope_check forbids a row from having both a
 * course_id and a non-empty course_ids - so the caller's merge needs no
 * de-duplication, only a sort.
 *
 * BOTH queries filter on user_id - the real tenant boundary on this app's
 * actual (service-role) path; see this module's header. Losing that filter
 * on either query, and only that one, is exactly the failure mode this
 * function's own tests sabotage-check for.
 */
async function fetchCourseIntelAnswerRows(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string,
  ascending: boolean
): Promise<CourseIntelAnswerRawRow[]> {
  const [own, crossCourse] = await Promise.all([
    supabase
      .from("course_intel_answers")
      .select("*")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .order("created_at", { ascending }),
    supabase
      .from("course_intel_answers")
      .select("*")
      .eq("user_id", userId)
      .contains("course_ids", [courseId])
      .order("created_at", { ascending }),
  ]);

  if (own.error) throw new Error(own.error.message);
  if (crossCourse.error) throw new Error(crossCourse.error.message);

  return [
    ...((own.data ?? []) as unknown as CourseIntelAnswerRawRow[]),
    ...((crossCourse.data ?? []) as unknown as CourseIntelAnswerRawRow[]),
  ];
}

/**
 * Every Q&A entry touching one course, newest first - a single-course row
 * about it, AND a cross-course row that covered it alongside others (D24e: a
 * per-course view must not silently drop a cross-course answer just because
 * it also names other courses). NO CAP - see the migration's header for why
 * this table does not copy institution_knowledge_questions' silent
 * 20-entry prune: a stored assessment about a named person must never be
 * dropped just because a later, unrelated question was asked.
 */
export async function listCourseIntelAnswers(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string
): Promise<CourseIntelHistoryEntry[]> {
  const rows = await fetchCourseIntelAnswerRows(supabase, userId, courseId, false);
  const entries = rows.map(mapCourseIntelAnswer);
  entries.sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1));
  return entries;
}

/**
 * Every Q&A entry touching one course, OLDEST FIRST - the chronological
 * reading order an exported record should have, so an instructor answering
 * "what do you hold about me" gets it in the order it was asked, rather than
 * the newest-first order a history panel displays it in. Same two-query
 * shape as listCourseIntelAnswers (a cross-course answer belongs in this
 * export too - D8's "what do you hold" is not honestly answered by a list
 * that omits an answer just because it also covered other courses), and
 * equally uncapped.
 */
export async function exportCourseIntelAnswers(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string
): Promise<CourseIntelHistoryEntry[]> {
  const rows = await fetchCourseIntelAnswerRows(supabase, userId, courseId, true);
  const entries = rows.map(mapCourseIntelAnswer);
  entries.sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -1 : 1));
  return entries;
}

// ---------------------------------------------------------------------------
// All-scopes read and clear (no course id) - the surface this tab's actual
// control needs. See this module's header for `courseId`/`courseIds`; this
// pair exists because THE TAB HAS NO COURSE ID TO GIVE listCourseIntelAnswers
// / exportCourseIntelAnswers / clearCourseIntelAnswers ABOVE. Acceptance-
// criteria decision D24 (docs/course-student-intelligence-acceptance-
// criteria.md) removed the course picker: the view is one textbox whose
// question resolves its own scope, so there is no selected course to narrow
// a history read to, and there never will be again while this tab has this
// shape. REGRESSION.md entry 408d found the actual consequence: every
// history action existed and NOTHING CALLED ANY OF THEM, because the
// per-course functions above no longer fit any caller this tab can build.
//
// The per-course functions above are UNTOUCHED - "what did I ask about
// COURSE X" is a different, still-valid question a future per-course
// drill-down could still want, and their own tests are real. This pair
// answers the question this tab's single textbox actually asks: "everything
// I have ever asked here, regardless of what it covered."
// ---------------------------------------------------------------------------

/**
 * Every Q&A entry this user has EVER produced in this tab, across every
 * scope - single-course and cross-course alike - newest first.
 *
 * ONE QUERY, not the two-query merge fetchCourseIntelAnswerRows above uses:
 * there is no courseId to narrow by, so there is nothing to reconcile - every
 * row this user owns already belongs in this reader's result by definition.
 * The database does the ordering; there is no need for the JS-side re-sort
 * listCourseIntelAnswers/exportCourseIntelAnswers need to merge two result
 * sets. Still uncapped, for the same reason listCourseIntelAnswers is (see
 * that function's own comment): a stored assessment about a named person
 * must never be dropped just because a later, unrelated question was asked.
 *
 * `.eq("user_id", userId)` is the ONLY filter, and it is the whole tenant
 * boundary on this function - see this module's header. Losing it turns this
 * into "every answer every instructor has ever asked", which is exactly the
 * failure mode this function's own tests sabotage-check for.
 */
export async function listAllCourseIntelAnswers(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<CourseIntelHistoryEntry[]> {
  const { data, error } = await supabase
    .from("course_intel_answers")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as CourseIntelAnswerRawRow[]).map(mapCourseIntelAnswer);
}

/**
 * Delete EVERY Q&A entry this user has ever produced, across every scope -
 * the bulk destructive action this tab's "Clear history" control actually
 * needs, now that there is no course left to scope a clear to. Mirrors
 * clearCourseIntelAnswers's count-then-delete shape (a head-only exact count
 * first, so the confirm step can state the real blast radius before the
 * instructor commits to an irreversible action), filtered on user_id alone.
 *
 * UNLIKE clearCourseIntelAnswers above, there is no "leave a cross-course
 * row's visibility under every OTHER course it covered alone" concern to
 * preserve here - this IS the surface with no narrower scope than
 * "everything I have ever asked", so deleting everything is the whole and
 * correct meaning of the action, not a side effect to guard against.
 */
export async function clearAllCourseIntelAnswers(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<number> {
  const { count, error: countError } = await supabase
    .from("course_intel_answers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countError) throw new Error(countError.message);
  const total = count ?? 0;
  if (total === 0) return 0;

  const { error } = await supabase.from("course_intel_answers").delete().eq("user_id", userId);

  if (error) throw new Error(error.message);
  return total;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

interface AppendCourseIntelAnswerCommon {
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
 * Exactly one of `courseId` (a single-course answer - the only shape this
 * table held before
 * supabase/migrations/20261019000000_course_intel_answers_cross_course.sql)
 * or `courseIds` (a CROSS-course answer - the full covered set, at least one
 * entry) may be given - mirrors course_intel_answers_course_scope_check at
 * the type level, so a caller written in TypeScript cannot even construct
 * the "both" or "neither" shape that constraint would reject. The database
 * constraint is still what actually enforces it end to end - this type only
 * binds callers in this process.
 */
export type AppendCourseIntelAnswerInput =
  | (AppendCourseIntelAnswerCommon & { readonly courseId: string; readonly courseIds?: undefined })
  | (AppendCourseIntelAnswerCommon & { readonly courseId?: undefined; readonly courseIds: readonly string[] });

/**
 * Insert one Q&A entry. A PLAIN INSERT - never an upsert. This table
 * carries no uniqueness constraint (append-only, like
 * announcement_exemplars, 20261017000000), so there is no ON CONFLICT
 * arbiter to need in the first place, and `userId` is taken from the
 * CALLER's own resolved identity, not from `input` - see
 * AppendCourseIntelAnswerInput's own shape above.
 *
 * Throws before ever reaching the database if a cross-course caller passes
 * an empty `courseIds` - the type above already rules this out for a caller
 * written in TypeScript, but this is also reachable from a service-role, no-
 * RLS path (see this module's header), where a shape the database constraint
 * would reject should surface as a clear message here rather than an opaque
 * Postgres constraint-violation error.
 */
export async function appendCourseIntelAnswer(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: AppendCourseIntelAnswerInput
): Promise<CourseIntelHistoryEntry> {
  const courseIds = input.courseIds ?? [];
  if (input.courseId === undefined && courseIds.length === 0) {
    throw new Error("appendCourseIntelAnswer: a cross-course entry needs at least one course id.");
  }

  const insertRow: CourseIntelAnswerRawInsert = {
    user_id: userId,
    course_id: input.courseId ?? null,
    course_ids: [...courseIds],
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
    .insert(insertRow as unknown as Database["public"]["Tables"]["course_intel_answers"]["Insert"])
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapCourseIntelAnswer(data as unknown as CourseIntelAnswerRawRow);
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
 * Delete every SINGLE-COURSE Q&A entry for one course, returning the row
 * count so the UI can state the real blast radius before the instructor
 * confirms an irreversible action - mirrors clearScopeQuestions
 * (src/lib/knowledge-overview.ts). Filters on BOTH user_id and course_id,
 * same reasoning as deleteCourseIntelAnswer above. Uses a head-only exact
 * count (never fetches rows just to count them, and never runs the row
 * mapper over a count-only response).
 *
 * DELIBERATELY DOES NOT TOUCH A CROSS-COURSE ROW THAT ALSO COVERED THIS
 * COURSE - unlike listCourseIntelAnswers/exportCourseIntelAnswers above,
 * which deliberately DO surface one. `.eq("course_id", courseId)` already
 * excludes every cross-course row (their course_id is null), and that is the
 * wanted behaviour here, not an oversight: clearing "this course's" history
 * must not, as a side effect of one course, delete an answer the instructor
 * can still find under every OTHER course it covered - a bulk irreversible
 * delete reaching outside the scope the instructor confirmed would be a
 * worse surprise than the one D24e itself warns about. Deleting a
 * cross-course row is still possible one at a time, by id, via
 * deleteCourseIntelAnswer above - which works on any row regardless of
 * whether course_id is null, since it never filters on it.
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
