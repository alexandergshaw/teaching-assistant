"use server";

// Server actions for the course-student-intelligence Q&A history: reading,
// appending, and pruning the record of what an instructor asked and what
// the feature answered, for one course. Thin owner-scoped wrappers around
// src/lib/course-intel/history.ts, mirroring the idiom
// src/app/actions/knowledge-overview.ts already uses: requireOwner() +
// createServiceClient(), every path returning {error: string} instead of a
// raw exception. requireOwner() below is now an alias for requireUser() -
// any active account, not literally the owner - see that function's own
// doc comment in src/lib/supabase/auth.ts.
//
// This file does not assemble anything and does not call an LLM itself -
// it is pure persistence plumbing for a Q&A result another part of this
// feature (the Ask AI question flow) already produced. See
// src/lib/course-intel/history.ts's own header for the security note this
// bears repeating here: every function it exports is called below with a
// SERVICE-ROLE client, so the explicit user_id filter each of those
// functions applies ITSELF is the real tenant boundary - not this file's
// requireOwner() call alone, and not the table's RLS policies.

import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  listCourseIntelAnswers,
  exportCourseIntelAnswers,
  appendCourseIntelAnswer,
  deleteCourseIntelAnswer,
  clearCourseIntelAnswers,
  type CourseIntelHistoryEntry,
  type AppendCourseIntelAnswerInput,
} from "@/lib/course-intel/history";

// ---------------------------------------------------------------------------
// Read.
// ---------------------------------------------------------------------------

export async function getCourseIntelHistoryAction(
  courseId: string
): Promise<{ entries: CourseIntelHistoryEntry[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const entries = await listCourseIntelAnswers(supabase, user.id, courseId);
    return { entries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the question history." };
  }
}

/**
 * Every stored Q&A entry for this course, oldest first, so an instructor
 * can answer "what do you hold about me" without opening each entry by
 * hand - the export control acceptance-criteria decision D8 requires.
 */
export async function exportCourseIntelHistoryAction(
  courseId: string
): Promise<{ entries: CourseIntelHistoryEntry[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const entries = await exportCourseIntelAnswers(supabase, user.id, courseId);
    return { entries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not export the question history." };
  }
}

// ---------------------------------------------------------------------------
// Write.
// ---------------------------------------------------------------------------

/**
 * Persist one already-answered Q&A entry. This action does NOT ask a
 * question or call an LLM itself - `input` is the finished result of the
 * Ask AI flow another part of this feature owns, and this action's only
 * job is to save it under the CALLING user's own identity, never a
 * client-supplied one (AppendCourseIntelAnswerInput has no user_id field
 * to supply one through).
 */
export async function appendCourseIntelAnswerAction(
  input: AppendCourseIntelAnswerInput
): Promise<{ entry: CourseIntelHistoryEntry } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const entry = await appendCourseIntelAnswer(supabase, user.id, input);
    return { entry };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save that answer." };
  }
}

// ---------------------------------------------------------------------------
// Delete.
// ---------------------------------------------------------------------------

export async function deleteCourseIntelAnswerAction(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await deleteCourseIntelAnswer(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete that entry." };
  }
}

export async function clearCourseIntelHistoryAction(
  courseId: string
): Promise<{ deletedCount: number } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const deletedCount = await clearCourseIntelAnswers(supabase, user.id, courseId);
    return { deletedCount };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not clear the question history." };
  }
}
