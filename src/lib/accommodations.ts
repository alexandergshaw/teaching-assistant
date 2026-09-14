// Persistence for institution_accommodations: a per-institution,
// per-assignment list of students who have accommodations or extensions
// (backlog N4). See
// supabase/migrations/20261020000000_institution_accommodations.sql for the
// table this reads and writes, and that migration's own header for the
// schema rationale.
//
// THIS IS DISABILITY-RELATED STUDENT DATA - the most sensitive data this
// application holds. A defect here is a privacy harm, not a bug. Three
// things below exist specifically because of that, each measured against a
// real failure mode rather than assumed:
//
// 1. THE SESSION CLIENT, NEVER THE SERVICE-ROLE CLIENT. Every function here
//    takes an injected SupabaseClient<Database> the caller must have built
//    with createClient() (src/lib/supabase/server.ts - the RLS-respecting,
//    cookie-based session client), never createServiceClient(). Most data
//    modules in this repo (see src/lib/knowledge-overview.ts,
//    src/lib/announcement-exemplars.ts) use the service-role client and rely
//    on an explicit user_id filter as the ONLY tenant boundary, because RLS
//    is bypassed entirely for them. That pattern is deliberately NOT
//    followed here: for this table, RLS is a real second layer, not
//    decorative, precisely because of point 2 below - a service-role query
//    with a user_id filter is a correct query with NO backstop if that
//    filter is ever wrong, and for this data class "no backstop" is not an
//    acceptable risk. (There is real precedent for a session client reaching
//    a Pattern-B-shaped module: src/app/api/ai-chat/route.ts:148.)
//
// 2. THE IMPERSONATION GUARD - THE SINGLE MOST IMPORTANT THING IN THIS FILE.
//    Every exported function below calls assertNotImpersonated() as its
//    first line. Measured, this session: requireAppOwner() (see
//    src/lib/supabase/auth.ts) checks getImpersonatedOwner() FIRST and, when
//    an unattended run (a cron schedule, a webhook trigger) is impersonating
//    an owner, returns a full identity BEFORE the cookie/session path is
//    ever reached. Under that impersonation, the session client built by
//    createClient() has NO JWT - there is no browser session to read a
//    cookie from - so auth.uid() is null inside Postgres, and an
//    RLS-denied SELECT returns { data: [], error: null }, NOT an error.
//    Without this guard, an unattended accommodations read would silently
//    return an EMPTY LIST with no error: the instructor (or whatever surface
//    eventually reads it) would be told, confidently and silently, that no
//    student on this assignment has accommodations. That is the single worst
//    output this feature can produce.
//
//    The guard therefore keys on the condition that is TRUE in the bad case
//    (an impersonation context is present at all), never on an identity
//    being absent - a check keyed on "is there an identity" would pass
//    cleanly in exactly the case it exists to catch, since
//    getImpersonatedOwner() returns a full identity under runAsOwner. This
//    guard also enforces, in code rather than only in a comment, that no
//    accommodations read or write may ever run inside runAsOwner /
//    impersonation, and that no accommodations action may ever be added to
//    the unattended workflow-step registry: an impersonated call cannot
//    reach this module without throwing.
//
// 3. user_id FILTERS EVERY READ, EVERY UPDATE, AND EVERY DELETE (not only
//    read and delete) - required IN ADDITION to RLS, not instead of it. Two
//    independent enforcement layers for the one column that decides whose
//    disability data a query can touch.
//
// NOTHING IN THIS FILE MAY EVER REACH recordSessionDiagnosticEntry OR ANY
// OTHER DIAGNOSTIC SURFACE (src/lib/session-diagnostic-log.ts). Not an id,
// not a note, not a count, not even the fact that a fetch happened - "fetched
// 3 accommodations" discloses three students. This module does not import
// that module, and nothing below should ever be changed to call it.
//
// Typed mapper, never a bare `.select<Row>()` - typed selects collapse to
// `never` in this repo when a query selects a column subset by string rather
// than the literal "*" (see src/lib/supabase/course-task-attachments.ts's own
// header for the mechanics). mapAccommodationRow below mirrors
// mapAnnouncementExemplar (src/lib/announcement-exemplars.ts:72-83) exactly:
// every column mapped by hand, no spreading.
//
// NO course_name / assignment_name / student-name field anywhere in this
// file's types, inputs, or mapper - none is stored (see the migration's
// header, orchestrator ruling N4-U). Resolving those three names for display
// is the caller's job, done live via listCourses()/listAssignments()/
// listStudents() in src/lib/canvas/listings.ts - this module never resolves
// or returns a name.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { normalizeInstitution } from "./knowledge-base";
import { getImpersonatedOwner } from "./supabase/owner-context";
import { validateAccommodationEntry } from "./accommodations-logic";

/**
 * Throws if called from inside runAsOwner (an unattended, impersonated
 * run) - see this file's header, point 2, for why this is the load-bearing
 * line in the whole module. Keys on getImpersonatedOwner() returning
 * non-null, which is TRUE in exactly the bad case (the session client has no
 * JWT and RLS would silently return an empty list), rather than on any
 * property of the identity itself - an identity is present in that case, so
 * checking the identity would be a guard that cannot fire.
 */
function assertNotImpersonated(): void {
  if (getImpersonatedOwner()) {
    throw new Error(
      "Accommodations data may never be read or written from an impersonated/unattended context. " +
        "The session client used here has no JWT under impersonation, which makes an RLS-denied " +
        "read look identical to a real empty list - this guard exists to make that unrepresentable."
    );
  }
}

export interface AccommodationEntry {
  id: string;
  institution: string;
  courseId: string;
  assignmentId: string;
  /** Canvas student user id. NEVER a name - see this file's header. */
  canvasUserId: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddAccommodationInput {
  institution: string;
  courseId: string;
  assignmentId: string;
  canvasUserId: string;
  note: string;
}

export interface UpdateAccommodationInput {
  note: string;
}

// No spreading, no destructuring the raw row - every column mapped by hand,
// mirroring mapAnnouncementExemplar (src/lib/announcement-exemplars.ts:72-83).
// No `name`/`courseName`/`assignmentName` field exists on either shape -
// closing the no-stored-name requirement by construction: there is nothing
// in this return type a caller could accidentally persist or display as a
// stored name, because the row itself has no such column to read.
function mapAccommodationRow(
  row: Database["public"]["Tables"]["institution_accommodations"]["Row"]
): AccommodationEntry {
  return {
    id: row.id,
    institution: row.institution,
    courseId: row.course_id,
    assignmentId: row.assignment_id,
    canvasUserId: row.canvas_user_id,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * List entries for one exact (institution, courseId, assignmentId) scope,
 * for the given user. Filters on user_id in addition to RLS - see this
 * file's header, point 3.
 */
export async function listAccommodations(
  supabase: SupabaseClient<Database>,
  userId: string,
  institution: string,
  courseId: string,
  assignmentId: string
): Promise<AccommodationEntry[]> {
  assertNotImpersonated();

  const { data, error } = await supabase
    .from("institution_accommodations")
    .select("*")
    .eq("user_id", userId)
    .eq("institution", normalizeInstitution(institution))
    .eq("course_id", courseId)
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapAccommodationRow);
}

/**
 * Insert one entry. A plain insert, not an upsert: the table's unique
 * constraint on (user_id, institution, course_id, assignment_id,
 * canvas_user_id) means re-adding the same student to the same scope
 * surfaces a 23505 the caller must handle (e.g. by directing the owner to
 * updateAccommodation instead), rather than this function silently
 * overwriting a note the owner did not ask to change.
 */
export async function addAccommodation(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: AddAccommodationInput
): Promise<AccommodationEntry> {
  assertNotImpersonated();

  const validation = validateAccommodationEntry({ canvasUserId: input.canvasUserId, note: input.note });
  if (!validation.ok) {
    throw new Error("A student must be selected before an accommodation entry can be saved.");
  }

  const insertRow: Database["public"]["Tables"]["institution_accommodations"]["Insert"] = {
    user_id: userId,
    institution: normalizeInstitution(input.institution),
    course_id: input.courseId,
    assignment_id: input.assignmentId,
    canvas_user_id: input.canvasUserId,
    note: input.note,
  };

  const { data, error } = await supabase
    .from("institution_accommodations")
    .insert(insertRow)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapAccommodationRow(data);
}

/**
 * Edit an existing entry's note. Added per orchestrator ruling N4-W: the
 * table ships updated_at and a full UPDATE RLS policy, and a correction path
 * for data about someone's disability is an obligation, not a nicety - the
 * alternative (delete-and-retype) means retyping a sensitive note by hand.
 * Filters on BOTH id and user_id - see this file's header, point 3.
 */
export async function updateAccommodation(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  input: UpdateAccommodationInput
): Promise<AccommodationEntry> {
  assertNotImpersonated();

  const updateRow: Database["public"]["Tables"]["institution_accommodations"]["Update"] = {
    note: input.note,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("institution_accommodations")
    .update(updateRow)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapAccommodationRow(data);
}

/** Filters on BOTH id and user_id - see this file's header, point 3. */
export async function deleteAccommodation(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  assertNotImpersonated();

  const { error } = await supabase
    .from("institution_accommodations")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}
