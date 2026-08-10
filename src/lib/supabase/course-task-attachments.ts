// Persistence for course_task_attachments (files attached to a single
// Tasks-grid cell) - see
// supabase/migrations/20261002000000_course_task_attachments.sql for the
// table this reads and writes, and
// docs/task-cell-attachments-acceptance-criteria.md for the AC.
//
// Pattern B, matching src/lib/supabase/task-institution-instructions.ts:
// every function takes an injected SupabaseClient<Database> as its first
// argument, and this module never imports "@/lib/supabase/server" or
// "next/headers" - the auth gate lives one layer up, in
// src/app/actions/course-task-attachments.ts.
//
// Typed Supabase selects collapse to `never` in this repo (every insert/
// update call would otherwise need an `as any`), so rows are mapped through
// the explicitly typed mapTaskAttachment function below rather than through
// inference - mirrors mapRecordingFile (src/lib/recording-files.ts) and
// mapInstitutionPageAttachment (src/lib/institution-page-attachments.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { type TaskAttachment } from "@/lib/course-task-attachments";

/** The row shape actually selected - a subset of the full table row (no
 * user_id: every query below is already scoped to one owner, so the caller
 * never needs it echoed back). AC4 item 19: the grid's read selects only the
 * columns it needs, not "*". */
interface TaskAttachmentSelectedRow {
  id: string;
  course_id: string;
  task_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  storage_path: string;
  created_at: string;
}

const SELECT_COLUMNS = "id, course_id, task_id, file_name, mime_type, size_bytes, storage_path, created_at";

// Exported so the row -> record mapping is unit-testable without a live
// Supabase client (mirrors mapTaskInstructionRow / mapRecordingFile /
// mapInstitutionPageAttachment).
export function mapTaskAttachment(row: TaskAttachmentSelectedRow): TaskAttachment {
  return {
    id: row.id,
    courseId: row.course_id,
    taskId: row.task_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    createdAt: row.created_at,
  };
}

/** Rows requested per `.range()` page. Deliberately kept BELOW PostgREST's
 * own server-side ceiling (`db.max_rows`, 1000 by default) rather than equal
 * to it - see the module header for why `.limit()` cannot be used to page
 * past that ceiling instead. If PAGE_SIZE matched the ceiling exactly and the
 * ceiling were ever configured lower (a deploy-time setting this module has
 * no visibility into), every page would come back short on the very first
 * request, and the loop below would read that as "no more rows" and stop -
 * silently truncating the read. Staying comfortably under the ceiling means a
 * full page genuinely means "there may be more". */
const PAGE_SIZE = 500;

/**
 * Every attachment this user has recorded, across every course and task,
 * oldest first - loaded once per Tasks tab mount, in the same Promise.all as
 * courses/cells/defs/instructions (AC4 item 18), then indexed client-side
 * via indexTaskAttachments (src/lib/course-task-attachments.ts).
 *
 * PAGINATED with `.range()`, looped until a short page comes back (AC4 item
 * 19). An earlier draft used `.limit(1000)`: PostgREST's 1000-row default
 * (`db.max_rows`) is a SERVER-side ceiling that `.limit()` requests at most
 * n rows and cannot exceed, so that draft would have silently truncated
 * exactly like a bare `select()` - both hiding a user's own files and
 * corrupting the per-cell count cap check, which counts what was loaded.
 */
export async function listTaskAttachments(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<TaskAttachment[]> {
  const rows: TaskAttachmentSelectedRow[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("course_task_attachments")
      .select(SELECT_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as unknown as TaskAttachmentSelectedRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows.map(mapTaskAttachment);
}

/**
 * Every attachment's storage_path for one course, across every task cell -
 * used only by deleteCourse's pre-cascade Storage sweep
 * (src/lib/supabase/courses.ts, AC6 item 31), so it selects just the one
 * column that sweep needs. Also paginated with `.range()` for the same
 * reason listTaskAttachments is - a course with more than 1000 attachments
 * must still have every object swept, not just the first page.
 */
export async function listTaskAttachmentStoragePathsForCourse(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string
): Promise<string[]> {
  const paths: string[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("course_task_attachments")
      .select("storage_path")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as unknown as Array<{ storage_path: string }>;
    paths.push(...page.map((row) => row.storage_path));

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return paths;
}

/** Bucket task-attachment objects live in - the same private "course-files"
 * bucket every convention in this feature uses (see this module's header,
 * and src/lib/course-task-attachments.ts's own header, for why no new bucket
 * was created). */
const ATTACHMENT_STORAGE_BUCKET = "course-files";

/** Paths removed per underlying `storage.remove()` call by
 * taskAttachmentStorageSweep.remove below. `listTaskAttachmentStoragePathsForCourse`
 * above already paginates past PostgREST's 1000-row ceiling specifically
 * because a course can carry more than 1000 attachments - passing the WHOLE
 * accumulated array to a single `remove()` call would defeat that pagination
 * on the write side, so removal chunks the same way. Kept well under
 * PAGE_SIZE, matching this module's existing "stay comfortably under any
 * ceiling" posture rather than probing Storage's real per-call limit.
 */
const REMOVE_CHUNK_SIZE = 100;

/**
 * Removes every given storage_path from the course-files bucket, chunked at
 * REMOVE_CHUNK_SIZE rather than one unbounded `remove()` call (AC6 item 31,
 * docs/task-cell-attachments-acceptance-criteria.md). Namespaced under a
 * `.remove()` method - mirroring the real `supabase.storage.from(bucket)`
 * shape, and this feature's own `TaskAttachmentStorageClient` interface
 * (src/lib/course-task-attachments.ts) - rather than exported as a bare
 * function, so the call site (deleteCourse, src/lib/supabase/courses.ts)
 * still reads as an object`.remove(...)` call: the wiring test
 * (taskCellAttachments.wiring.test.ts) proves ordering by searching
 * deleteCourse's source text for a remove/sweep call between the collected
 * storage_path values and the row delete. The ONLY caller is deleteCourse's
 * pre-cascade sweep - kept here, not inlined there, so that file does not
 * grow past its 1000-line cap.
 *
 * A no-op for an empty array (no underlying `remove()` call at all - matches
 * the single-call version this replaces). Stops and throws on the FIRST
 * failing chunk: never removes past a failure and never swallows the error,
 * so a caller can still rely on "a thrown error means every row is safe to
 * leave in place for a retry."
 */
export const taskAttachmentStorageSweep = {
  async remove(supabase: SupabaseClient<Database>, storagePaths: string[]): Promise<void> {
    for (let i = 0; i < storagePaths.length; i += REMOVE_CHUNK_SIZE) {
      const chunk = storagePaths.slice(i, i + REMOVE_CHUNK_SIZE);
      const { error } = await supabase.storage.from(ATTACHMENT_STORAGE_BUCKET).remove(chunk);
      if (error) {
        throw new Error(
          `Could not remove this course's attached files: ${error.message}. The course was not deleted - please retry.`
        );
      }
    }
  },
};

export interface CreateTaskAttachmentRowInput {
  /** Generated in the browser before the upload (AC1 item 6) - this is an
   * insert of a row whose id is already fixed, never a fresh
   * `gen_random_uuid()` default. */
  id: string;
  courseId: string;
  taskId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  storagePath: string;
}

/** Insert one attachment row. Called AFTER the object has already been
 * uploaded to Storage (AC2 item 12) - this function does no Storage I/O of
 * its own, matching upsertTaskInstruction's pure-persistence shape. */
export async function createTaskAttachmentRow(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: CreateTaskAttachmentRowInput
): Promise<TaskAttachment> {
  const insertRow: Database["public"]["Tables"]["course_task_attachments"]["Insert"] = {
    id: input.id,
    user_id: userId,
    course_id: input.courseId,
    task_id: input.taskId,
    file_name: input.fileName,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    storage_path: input.storagePath,
  };

  const { data: row, error } = await supabase
    .from("course_task_attachments")
    .insert(insertRow)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return mapTaskAttachment(row as unknown as TaskAttachmentSelectedRow);
}

/** Delete one attachment row by id, scoped to its owner. Called AFTER the
 * object has already been removed from Storage (AC2 item 12's reverse
 * ordering) - this function does no Storage I/O of its own. */
export async function deleteTaskAttachmentRow(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await supabase.from("course_task_attachments").delete().eq("user_id", userId).eq("id", id);

  if (error) throw new Error(error.message);
}
