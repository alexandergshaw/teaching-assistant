// Persistence for announcement_exemplars: a per-user, per-course store of
// pasted announcement FORMAT exemplars, backing AC1 of
// docs/announcement-from-walkthrough-acceptance-criteria.md. See
// supabase/migrations/20261017000000_announcement_exemplars.sql for the
// table this reads and writes, and its header comment for why "most recent
// is the default" is derived at read time (no is_default column) and why
// every save is a plain INSERT (no uniqueness constraint, so no upsert is
// ever needed).
//
// Pattern B, matching src/lib/supabase/generated-artifacts.ts and
// src/lib/supabase/course-tasks.ts: every function takes an injected
// SupabaseClient<Database> as its first argument, and this module never
// imports "@/lib/supabase/server" or "next/headers" - the auth gate lives
// one layer up, in whatever server action ends up calling these.
//
// SECURITY - DO NOT RELY ON RLS ALONE. Every caller in this app invokes
// these functions with a SERVICE-ROLE client, which bypasses RLS entirely
// and leaves auth.uid() null. So the RLS policies on the table are not the
// tenant boundary on the real path - the explicit user_id filter every
// function below applies itself is. This module follows
// src/lib/supabase/generated-artifacts.ts as the precedent to copy (correct
// on both its read and its write), not src/lib/artifact-templates.ts, which
// until a same-day fix had a delete with no owner filter at all and an
// upsert that let a client-supplied id reassign another user's row. Every
// function here takes userId explicitly and filters on it - never on an id
// alone - and userId is always the value the caller derived from the
// authenticated session, never anything read out of the input payload.
//
// Typed Supabase selects can collapse to `never` in this repo when a query
// selects a column subset by string rather than the literal "*" - see
// src/lib/supabase/course-task-attachments.ts's own header comment for the
// mechanics. Every query below selects "*", so rows are still mapped
// through an explicitly typed mapper - mapAnnouncementExemplar below -
// mirroring mapRecordingFile in src/lib/recording-files.ts and
// mapGeneratedArtifact in src/lib/supabase/generated-artifacts.ts, rather
// than trusted by inference.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";

export interface AnnouncementExemplar {
  id: string;
  courseId: string;
  /** The pasted announcement, reduced to plain text before it ever reached
   * this table. Stored for reference and re-derivation; never itself sent
   * to a drafting prompt - see the migration's column comment and AC2/P11
   * of the acceptance-criteria document. Only `outline` below is read into
   * a prompt. */
  exemplarText: string;
  /** The structural outline derived from exemplarText: section order,
   * heading text, list vs. prose, greeting/sign-off/due-date presence,
   * approximate per-section length. Descriptive, never prescriptive about
   * content - the only part of this record a drafting prompt may read. */
  outline: Json;
  /** Optional instructor-facing label distinguishing two shapes of
   * exemplar (e.g. a weekly announcement vs. a module wrap-up). */
  label: string | null;
  createdAt: string;
}

export interface SaveAnnouncementExemplarInput {
  courseId: string;
  exemplarText: string;
  outline: Json;
  label?: string | null;
}

// Exported so the row -> record mapping is unit-testable without a live
// Supabase client (mirrors mapRecordingFile in src/lib/recording-files.ts
// and mapGeneratedArtifact in src/lib/supabase/generated-artifacts.ts). No
// spreading, no destructuring the raw row - every column is mapped by hand.
export function mapAnnouncementExemplar(
  row: Database["public"]["Tables"]["announcement_exemplars"]["Row"]
): AnnouncementExemplar {
  return {
    id: row.id,
    courseId: row.course_id,
    exemplarText: row.exemplar_text,
    outline: row.outline,
    label: row.label,
    createdAt: row.created_at,
  };
}

/**
 * Every exemplar for one user+course, newest first. Filtered on BOTH
 * user_id and course_id: userId is server-derived and is the only tenant
 * boundary that exists on this table's real (service-role) access path -
 * see this module's header.
 */
export async function listAnnouncementExemplars(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string
): Promise<AnnouncementExemplar[]> {
  const { data, error } = await supabase
    .from("announcement_exemplars")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map(mapAnnouncementExemplar);
}

/**
 * The most recent exemplar for one user+course, or null if none has been
 * saved yet. "Most recent is the default" (AC1) is computed HERE, as
 * `order by created_at desc limit 1` - see the migration header for why
 * there is no is_default column to keep in sync instead. Filtered on both
 * user_id and course_id for the same reason as every other function in this
 * module.
 */
export async function getMostRecentAnnouncementExemplar(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string
): Promise<AnnouncementExemplar | null> {
  const { data, error } = await supabase
    .from("announcement_exemplars")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return mapAnnouncementExemplar(data);
}

/**
 * Save a new exemplar. ALWAYS a plain INSERT, never an upsert - see the
 * migration header for why this table carries no uniqueness constraint for
 * `.upsert()` to need an ON CONFLICT arbiter for in the first place. userId
 * is server-derived and is written into the row directly; it is never
 * taken from the caller-supplied input object (SaveAnnouncementExemplarInput
 * has no userId field at all, so there is nothing to smuggle).
 */
export async function saveAnnouncementExemplar(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: SaveAnnouncementExemplarInput
): Promise<AnnouncementExemplar> {
  const insertRow: Database["public"]["Tables"]["announcement_exemplars"]["Insert"] = {
    user_id: userId,
    course_id: input.courseId,
    exemplar_text: input.exemplarText,
    outline: input.outline,
    label: input.label ?? null,
  };

  const { data, error } = await supabase
    .from("announcement_exemplars")
    .insert(insertRow)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapAnnouncementExemplar(data);
}

/**
 * Delete one of THIS USER'S exemplars. userId is required and filtered on
 * alongside id - see this module's header and src/lib/artifact-templates.ts's
 * own history (a delete with no owner filter, reachable by any active
 * account behind a service-role client, was a live cross-tenant hole). A
 * foreign id matches zero rows, which Supabase reports as a successful
 * no-op - correct here, because the caller learns nothing about whether
 * that id exists for somebody else.
 */
export async function deleteAnnouncementExemplar(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("announcement_exemplars")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}
