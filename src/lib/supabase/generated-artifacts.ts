// Persistence for generated_artifacts: versioned storage for content
// generated from selected LMS material (anticipated Q&A, current events,
// sample answers, announcements, and eventually decks). See
// supabase/migrations/20261004000000_generated_artifacts.sql for the table
// this reads and writes, and its header comment for why this is a new
// table rather than a reuse of an existing draft/template table.
//
// Pattern B, matching src/lib/supabase/course-tasks.ts and
// src/lib/supabase/weekly-announcement-schedule.ts: every function takes an
// injected SupabaseClient<Database> as its first argument, and this module
// never imports "@/lib/supabase/server" or "next/headers" - the auth gate
// lives one layer up, in whatever server action ends up calling these.
//
// The pure version arithmetic (next version number, which row is current,
// newest-first ordering) lives in src/lib/generated-artifact-version.ts, a
// dependency-free sibling, so that logic is unit-testable without a
// database. This module wires it to real Supabase reads/writes.
//
// Typed Supabase selects can collapse to `never` in this repo when a query
// selects a column subset by string rather than the literal "*" (every
// insert/update would then need an `as any`) - see
// src/lib/supabase/course-task-attachments.ts's own header comment for the
// mechanics. Every query below selects "*", which resolves to the real Row
// type directly (mirrors src/lib/supabase/course-tasks.ts and
// src/lib/supabase/weekly-announcement-schedule.ts), so rows are still
// mapped through an explicitly typed mapper - mapGeneratedArtifact below -
// rather than trusted by inference.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./types";
import {
  nextArtifactVersion,
  pickCurrentArtifactVersion,
  sortArtifactVersionsNewestFirst,
} from "@/lib/generated-artifact-version";

export interface GeneratedArtifact {
  id: string;
  courseId: string;
  /** Which generator produced this row (e.g. "anticipated-qa",
   * "current-events", "sample-answers", "announcement", "deck"). Open-ended
   * on purpose - see the migration's header comment for why the column
   * carries no CHECK constraint. */
  kind: string;
  /** Monotonic per (courseId, kind) - see nextArtifactVersion. */
  version: number;
  /** The supersede marker - see pickCurrentArtifactVersion and the
   * migration's header comment. At most one true row per (courseId, kind),
   * enforced in the database by generated_artifacts_one_current_idx. */
  isCurrent: boolean;
  /** Announcements need a title distinct from their body; every other kind
   * is expected to leave this null. */
  title: string | null;
  /** Serves preview, refine and diff for EVERY kind. */
  text: string;
  /** Nullable - only the deck kind is expected to ever populate this
   * (slidesToText is lossy, so text alone cannot round-trip a deck). */
  structured: Json | null;
  /** The full prompt/instruction that produced this version, captured
   * before any redaction step - see the migration's header comment for why
   * this is never sourced from the workflow run log. */
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveGeneratedArtifactVersionInput {
  courseId: string;
  kind: string;
  title?: string | null;
  text: string;
  structured?: Json | null;
  prompt: string;
}

// Exported so the row -> record mapping is unit-testable without a live
// Supabase client (mirrors mapRecordingFile in src/lib/recording-files.ts
// and mapCourseTaskRow in src/lib/supabase/course-tasks.ts).
export function mapGeneratedArtifact(
  row: Database["public"]["Tables"]["generated_artifacts"]["Row"]
): GeneratedArtifact {
  return {
    id: row.id,
    courseId: row.course_id,
    kind: row.kind,
    version: row.version,
    isCurrent: row.is_current,
    title: row.title,
    text: row.text,
    structured: row.structured,
    prompt: row.prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Every version for one course+kind, newest first. Small per-scope result
 * set (a handful of regenerations at most), so this is one unfiltered read
 * plus a client-side sort via sortArtifactVersionsNewestFirst - mirrors
 * listScheduledAnnouncementRows in src/lib/supabase/weekly-announcement-schedule.ts,
 * which reasons the same way about its own per-course row count.
 */
export async function listGeneratedArtifactVersions(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string,
  kind: string
): Promise<GeneratedArtifact[]> {
  const { data, error } = await supabase
    .from("generated_artifacts")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("kind", kind);

  if (error) throw new Error(error.message);

  const mapped = (data ?? []).map(mapGeneratedArtifact);
  return sortArtifactVersionsNewestFirst(mapped);
}

/**
 * The current version for one course+kind, or null when nothing has been
 * generated yet. Built on listGeneratedArtifactVersions + the pure
 * pickCurrentArtifactVersion helper rather than a second, differently
 * shaped query, so "which row is current" is decided by the same logic
 * everywhere it matters (and is covered by
 * src/lib/generated-artifact-version.test.ts without a database).
 */
export async function getCurrentGeneratedArtifact(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string,
  kind: string
): Promise<GeneratedArtifact | null> {
  const versions = await listGeneratedArtifactVersions(supabase, userId, courseId, kind);
  return pickCurrentArtifactVersion(versions);
}

/**
 * Save a new version for one course+kind: computes the next version number
 * (nextArtifactVersion, over this course+kind's existing versions only -
 * kinds do not share a counter), clears is_current on whatever row was
 * previously current, and inserts the new row as current. Two sequential
 * writes rather than one transaction - mirrors setDefaultAvatarLikeness in
 * src/lib/avatar-likeness.ts, which reasons the same way: the database-level
 * partial unique index (generated_artifacts_one_current_idx) is what
 * actually guarantees at most one current row exists at rest, and this app
 * is attended-only and owner-gated (a single actor), so the brief window
 * between the two writes is not a real race in practice.
 *
 * The clear-current update is unconditional (no prior read to check whether
 * a current row exists) - an update that matches zero rows is a harmless
 * no-op, and this is exactly what makes the very first version for a
 * course+kind require no special-casing.
 */
export async function saveGeneratedArtifactVersion(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: SaveGeneratedArtifactVersionInput
): Promise<GeneratedArtifact> {
  const existing = await listGeneratedArtifactVersions(supabase, userId, input.courseId, input.kind);
  const version = nextArtifactVersion(existing.map((row) => row.version));

  const { error: clearError } = await supabase
    .from("generated_artifacts")
    .update({ is_current: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("course_id", input.courseId)
    .eq("kind", input.kind)
    .eq("is_current", true);

  if (clearError) throw new Error(clearError.message);

  const insertRow: Database["public"]["Tables"]["generated_artifacts"]["Insert"] = {
    user_id: userId,
    course_id: input.courseId,
    kind: input.kind,
    version,
    is_current: true,
    title: input.title ?? null,
    text: input.text,
    structured: input.structured ?? null,
    prompt: input.prompt,
  };

  const { data: row, error: insertError } = await supabase
    .from("generated_artifacts")
    .insert(insertRow)
    .select("*")
    .single();

  if (insertError) throw new Error(insertError.message);
  return mapGeneratedArtifact(row);
}
