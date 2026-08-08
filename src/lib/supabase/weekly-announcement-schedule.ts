// Persistence for weekly-announcement-scheduling's idempotency mapping table
// (docs/weekly-announcement-scheduling-acceptance-criteria.md AC3): one row
// per (course, week), the ONLY source of dedupe since Canvas offers no
// client-supplied idempotency key, external id, or SIS id for discussion
// topics.
//
// Pattern B: every function takes an injected SupabaseClient<Database> as
// its first argument, and this module never imports "@/lib/supabase/server"
// or "next/headers" - mirrors src/lib/knowledge-base.ts (see its own header
// comment) and src/lib/supabase/course-tasks.ts, which documents the same
// convention explicitly. This keeps the module unit-testable without a live
// Supabase client, and keeps the caller ("use server"
// src/app/actions/canvas-inbox.ts) the one place that actually creates a
// client and resolves the signed-in owner.
//
// `posted_at` is deliberately NOT a column here - see the migration's own
// comment (supabase/migrations/20260925000000_weekly_announcement_schedule.sql)
// for why: the write-ahead insert (AC3 item 10) always commits this row
// BEFORE Canvas is called, so this table can never itself learn whether
// Canvas has posted. Only a caller's read-back against Canvas's own API can,
// and it is merged into src/lib/announcement-schedule.ts's
// ExistingAnnouncementRow at the call site, never persisted back here.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export interface ScheduledAnnouncementRow {
  id: string;
  courseId: string;
  weekNumber: number;
  status: "pending" | "confirmed";
  topicId: number | null;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
}

// Exported so the row -> record mapping is unit-testable without a live
// Supabase client (mirrors mapCourseTaskRow in src/lib/supabase/course-tasks.ts
// and mapRecordingFile in src/lib/recording-files.ts).
export function mapScheduledAnnouncementRow(
  row: Database["public"]["Tables"]["weekly_announcement_schedule"]["Row"]
): ScheduledAnnouncementRow {
  return {
    id: row.id,
    courseId: row.course_id,
    weekNumber: row.week_number,
    status: row.status === "confirmed" ? "confirmed" : "pending",
    topicId: row.topic_id,
    scheduledFor: row.scheduled_for,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every mapped row for one course - a small per-course table (at most one
 * row per in-session week), so one unfiltered read is cheap and lets the
 * caller do all of a run's per-week lookups in memory rather than one query
 * per week. */
export async function listScheduledAnnouncementRows(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string
): Promise<ScheduledAnnouncementRow[]> {
  const { data: rows, error } = await supabase
    .from("weekly_announcement_schedule")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId);

  if (error) throw new Error(error.message);
  return (rows || []).map(mapScheduledAnnouncementRow);
}

/**
 * The write-ahead insert (AC3 item 10, step (i)): commits a `pending` row
 * BEFORE Canvas is ever called. `scheduledFor` is recorded immediately
 * (never left null until confirm) so a later run's targeted read-back
 * (AC3 item 11) has a concrete date to match against even when the crash
 * landed before Canvas ever returned a topic id - see
 * findMatchingAnnouncement in src/lib/announcement-schedule.ts.
 *
 * Throws (surfacing the unique constraint violation on
 * (course_id, week_number)) if a row for this week already exists. The
 * caller only reaches this function when its own prior read found none, so
 * a conflict here means a concurrent run just claimed the same week; the
 * caller treats that as a failed week for THIS run rather than forcing the
 * write, since forcing one would defeat the very constraint that makes this
 * feature idempotent.
 */
export async function insertPendingScheduledAnnouncement(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string,
  weekNumber: number,
  scheduledForIso: string
): Promise<ScheduledAnnouncementRow> {
  const { data: row, error } = await supabase
    .from("weekly_announcement_schedule")
    .insert({
      user_id: userId,
      course_id: courseId,
      week_number: weekNumber,
      status: "pending",
      topic_id: null,
      scheduled_for: scheduledForIso,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapScheduledAnnouncementRow(row);
}

/** The write-ahead ordering's step (iii): update a week's row to
 * `confirmed` with the topic id Canvas returned, once Canvas's create call
 * has actually succeeded - or once a targeted read-back has resolved a
 * pending row to a real topic (AC3 item 11), whether that topic already
 * existed on Canvas or had to be created just now. */
export async function confirmScheduledAnnouncement(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string,
  weekNumber: number,
  topicId: number,
  scheduledForIso: string
): Promise<void> {
  const { error } = await supabase
    .from("weekly_announcement_schedule")
    .update({
      status: "confirmed",
      topic_id: topicId,
      scheduled_for: scheduledForIso,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("week_number", weekNumber);

  if (error) throw new Error(error.message);
}

/** AC6's reschedule path: rewrite the recorded target date on an existing,
 * not-yet-posted, confirmed row after Canvas's own delayed_post_at update
 * succeeds. Leaves status/topic_id untouched - it is the same Canvas topic,
 * just repointed at a new date. */
export async function rescheduleScheduledAnnouncement(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string,
  weekNumber: number,
  scheduledForIso: string
): Promise<void> {
  const { error } = await supabase
    .from("weekly_announcement_schedule")
    .update({
      scheduled_for: scheduledForIso,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("week_number", weekNumber);

  if (error) throw new Error(error.message);
}
