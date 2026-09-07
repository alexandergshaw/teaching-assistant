"use server";

// Server actions for the course-student-intelligence Q&A history: reading,
// appending, and pruning the record of what an instructor asked and what
// the feature answered - PER COURSE (the original shape) and ALL-SCOPES (the
// pair the tab's own UI actually calls since D24 removed the course picker -
// see the "All-scopes read and clear" section below and REGRESSION.md entry
// 408d). Thin owner-scoped wrappers around src/lib/course-intel/history.ts,
// mirroring the idiom src/app/actions/knowledge-overview.ts already uses:
// requireOwner() + createServiceClient(), every path returning {error:
// string} instead of a raw exception. requireOwner() below is now an alias
// for requireUser() - any active account, not literally the owner - see that
// function's own doc comment in src/lib/supabase/auth.ts.
//
// This file does not assemble anything and does not call an LLM itself -
// it is pure persistence plumbing for a Q&A result another part of this
// feature (the Ask AI question flow) already produced. See
// src/lib/course-intel/history.ts's own header for the security note this
// bears repeating here: every function it exports is called below with a
// SERVICE-ROLE client, so the explicit user_id filter each of those
// functions applies ITSELF is the real tenant boundary - not this file's
// requireOwner() call alone, and not the table's RLS policies.
//
// THE PER-COURSE ACTIONS BELOW (get/export/clear) HAVE NO CALLER IN THIS
// UI ANY MORE, and that is a fact worth stating rather than hiding: D24
// removed the only thing that could ever supply their courseId argument.
// They are left in place rather than deleted - a per-course drill-down is a
// plausible future surface, and their own tests are real - but they remain
// exactly as unreachable from this app's current UI as they were before this
// change. Only the all-scopes pair and the pre-existing per-id delete are
// wired to anything.

import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { listCourses } from "@/lib/supabase/courses";
import {
  listCourseIntelAnswers,
  exportCourseIntelAnswers,
  listAllCourseIntelAnswers,
  clearAllCourseIntelAnswers,
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
// All-scopes read and clear - the actions the tab's actual control uses.
//
// D24 (docs/course-student-intelligence-acceptance-criteria.md) removed the
// course picker, so nothing in this UI can ever supply the courseId
// getCourseIntelHistoryAction/exportCourseIntelHistoryAction/
// clearCourseIntelHistoryAction above require - REGRESSION.md entry 408d is
// exactly this: the actions existed and nothing called them, because they no
// longer fit the tab's own shape. These two call the all-scopes lib pair
// instead, and are what src/app/components/course-intel/useCourseIntel.ts
// actually calls.
// ---------------------------------------------------------------------------

/**
 * Every stored Q&A entry this user has ever produced in this tab, newest
 * first, across every scope - plus `courseNames`, a course_hub id -> name
 * map built from this user's OWN current course list (listCourses), so the
 * caller can render which course(s) an entry covered by name rather than by
 * uuid (D24e: coverage is part of an answer's meaning, and a raw id would
 * tell an instructor nothing). Built from the full course list regardless of
 * whether any entry references it, so a caller can also tell "covers every
 * course I currently have" apart from "covers some of them" without a
 * separate count to keep in sync.
 */
export async function getAllCourseIntelHistoryAction(): Promise<
  { entries: CourseIntelHistoryEntry[]; courseNames: Record<string, string> } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const [entries, courses] = await Promise.all([listAllCourseIntelAnswers(supabase, user.id), listCourses(user.id)]);
    const courseNames: Record<string, string> = {};
    for (const course of courses) courseNames[course.id] = course.name;
    return { entries, courseNames };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load your question history." };
  }
}

/**
 * Delete every stored Q&A entry this user has ever produced, across every
 * scope. See clearAllCourseIntelAnswers's own doc comment for why "clear
 * everything" is the whole and correct meaning of this action on a surface
 * with no narrower scope to offer.
 */
export async function clearAllCourseIntelHistoryAction(): Promise<{ deletedCount: number } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const deletedCount = await clearAllCourseIntelAnswers(supabase, user.id);
    return { deletedCount };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not clear your question history." };
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
