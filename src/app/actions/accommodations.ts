"use server";

// Server actions for the accommodations/extensions feature (backlog N4) - a
// per-institution, per-assignment list of students who have accommodations
// or extensions.
//
// THIS IS DISABILITY-RELATED STUDENT DATA - the most sensitive data this
// application holds. See src/lib/accommodations.ts's own header for the full
// rationale behind the choices below; this file is a thin wrapper and does
// not repeat that reasoning, only its conclusions:
//
// - The RLS-respecting SESSION client (createClient(), from
//   "@/lib/supabase/server"), NEVER createServiceClient(). This is the one
//   place in this file that most differs from this repo's usual "use server"
//   idiom (compare src/app/actions/knowledge-overview.ts, which uses
//   createServiceClient()) - deliberately, because for this table RLS is a
//   real second layer, not decorative.
// - Every read/insert/update/delete this file triggers goes through
//   src/lib/accommodations.ts, which itself throws if called from an
//   impersonated/unattended context (assertNotImpersonated) - this file adds
//   no impersonation handling of its own because that module already makes
//   the bad state unrepresentable.
// - EVERY EXPORT HERE IS RE-EXPORTED THROUGH THE ACTIONS BARREL
//   (src/app/actions.ts). This is not a style choice: action-guard-coverage.
//   test.ts's root-layout reachability walk collects action identifiers ONLY
//   from imports of that barrel (see that test's own comment, "if (target
//   === barrel && clause)") - an action imported directly from this file
//   instead would be invisible to it. This feature is globally mounted (a
//   later wave adds an always-present ambient control to src/app/layout.tsx),
//   which is exactly the surface that reachability check exists to police, so
//   barrel routing here is what makes these actions visible to it at all.
// - NOTHING here may ever reach the app's downloadable per-session diagnostic
//   log, or any other diagnostic surface - not an id, not a note, not a
//   count, not even the fact that a fetch happened. A count is still a count:
//   "fetched 3 accommodations" discloses three students.
//
//   That module's own guard test scans server-side files for its specifier as
//   a plain substring, so naming its path HERE - even inside a comment
//   forbidding the import - makes this file an offender. That is the guard
//   working as intended and being blunt about it; the right response is to
//   describe the module rather than to loosen the scan, so the prohibition is
//   stated without the literal path.
//
// requireOwner() is used below, matching this repo's existing "use server" +
// data-module precedent (src/app/actions/knowledge-overview.ts:27-28,100-101
// and src/app/actions/canvas-inbox.ts's listCoursesAction). FLAGGED, NOT
// RESOLVED HERE: requireOwner() is a deprecated alias that delegates to
// requireUser() - any active account, not owner-only (src/lib/supabase/
// auth.ts). Whether this data's sensitivity warrants requireAppOwner()
// instead is an open question the architect design routed to a later
// security-review wave, not settled by this build wave's brief.

import { requireOwner } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { listAssignments, listStudents, type CanvasAssignmentBrief, type CanvasPerson } from "@/lib/canvas/listings";
import {
  listAccommodations,
  addAccommodation,
  updateAccommodation,
  deleteAccommodation,
  type AccommodationEntry,
  type AddAccommodationInput,
} from "@/lib/accommodations";

// ---------------------------------------------------------------------------
// Cascade support - assignments and students. Courses reuse the existing
// listCoursesAction (src/app/actions/canvas-inbox.ts) rather than a new
// wrapper here; these two are new only because no "use server" wrapper for
// listAssignments/listStudents existed yet, not because the underlying
// Canvas fetch logic is new.
// ---------------------------------------------------------------------------

export async function listAssignmentsAction(
  institution: string,
  courseId: string
): Promise<{ assignments: CanvasAssignmentBrief[] } | { error: string }> {
  try {
    await requireOwner();
    return { assignments: await listAssignments(institution, courseId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load assignments." };
  }
}

export async function listStudentsAction(
  institution: string,
  courseId: string
): Promise<{ students: CanvasPerson[] } | { error: string }> {
  try {
    await requireOwner();
    return { students: await listStudents(institution, courseId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load students." };
  }
}

// ---------------------------------------------------------------------------
// Accommodations CRUD.
// ---------------------------------------------------------------------------

export async function listAccommodationsAction(
  institution: string,
  courseId: string,
  assignmentId: string
): Promise<{ entries: AccommodationEntry[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = await createClient();
    const entries = await listAccommodations(supabase, user.id, institution, courseId, assignmentId);
    return { entries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load accommodations." };
  }
}

export async function addAccommodationAction(
  input: AddAccommodationInput
): Promise<{ entry: AccommodationEntry } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = await createClient();
    const entry = await addAccommodation(supabase, user.id, input);
    return { entry };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save that accommodation." };
  }
}

export async function updateAccommodationAction(
  id: string,
  note: string
): Promise<{ entry: AccommodationEntry } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = await createClient();
    const entry = await updateAccommodation(supabase, user.id, id, { note });
    return { entry };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update that accommodation." };
  }
}

export async function deleteAccommodationAction(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = await createClient();
    await deleteAccommodation(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete that accommodation." };
  }
}
