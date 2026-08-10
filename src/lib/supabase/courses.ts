// Persistence for the owner's "course hub" -- one row per course that bundles
// its associated resources (GitHub codebase, linked finalized syllabus,
// textbook, Canvas URL). Reads/writes go through the Supabase service-role
// client behind requireOwner() (mirrors src/lib/supabase/syllabus-templates.ts);
// every query is explicitly scoped to the owning user_id.
//
// This module was split (docs/REGRESSION.md entry 225) because growth kept
// forcing doc comments to be trimmed to stay under the repo's 1000-line cap.
// What lives where now:
//   - courses.types.ts  - every exported type (`Course`, `CourseInput`, and
//                          the smaller shapes they're built from). Zero
//                          runtime code, so importing a type here can never
//                          drag in `./server`/`next/headers`.
//   - courses.row.ts     - the row layer: the `course_hub` table handle
//                          (`table`), the snake_case column list (`COLUMNS`),
//                          the DB row shape (`CourseRow`), and the mappers
//                          between rows and `Course`/`CourseInput`
//                          (`toCourse`, `toRow`). Not part of the public
//                          barrel - internal to this group.
//   - courses.files.ts   - the eight jsonb file-column helpers (append/remove
//                          for materials, Castletop, misc, and export files).
//   - courses.ts (here)  - the CRUD functions or aggregate queries, plus a
//                          re-export barrel for the types and file helpers.
//                          THIS is the only module callers should import from
//                          (`@/lib/supabase/courses`) - several tests mock
//                          that exact specifier, so nothing above should be
//                          imported directly by application code.

import { createServiceClient } from "./server";
import type { Json } from "./types";
import type { CourseProject } from "@/lib/course-project";
import { listTaskAttachmentStoragePathsForCourse, taskAttachmentStorageSweep } from "./course-task-attachments";
import { table, COLUMNS, toCourse, toRow, type CoursesTable, type CourseRow } from "./courses.row";
import type { Course, CourseInput } from "./courses.types";

export type {
  Course,
  CourseCustomTile,
  CourseInput,
  CourseIntegration,
  CourseMaterialFile,
  CourseRepo,
  CourseStudentRepo,
} from "./courses.types";

export {
  appendCourseCastletopFile,
  appendCourseExportFile,
  appendCourseMaterialFile,
  appendCourseMiscFile,
  removeCourseCastletopFile,
  removeCourseExportFile,
  removeCourseMaterialFile,
  removeCourseMiscFile,
} from "./courses.files";

/** List the owner's courses, newest first. */
export async function listCourses(userId: string): Promise<Course[]> {
  const { data, error } = await table()
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[courses] Could not list courses:", error.message);
    return [];
  }
  return ((data ?? []) as CourseRow[]).map(toCourse);
}

/** Fetch one course by id, or null if not found. */
export async function getCourse(userId: string, id: string): Promise<Course | null> {
  const { data, error } = await table()
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[courses] Could not read course:", error.message);
    return null;
  }
  return data ? toCourse(data as CourseRow) : null;
}

/** Create a course. Returns the created row. */
export async function createCourse(userId: string, input: CourseInput): Promise<Course> {
  const row = { user_id: userId, ...toRow(input) } as CoursesTable["Insert"];
  const { data, error } = await table().insert(row).select(COLUMNS).single();
  if (error) {
    throw new Error(`Could not save the course: ${error.message}`);
  }
  return toCourse(data as CourseRow);
}

/** Update a course. Returns the updated row. */
export async function updateCourse(userId: string, id: string, input: CourseInput): Promise<Course> {
  const row = toRow(input) as CoursesTable["Update"];
  const { data, error } = await table()
    .update(row)
    .eq("user_id", userId)
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) {
    throw new Error(`Could not update the course: ${error.message}`);
  }
  return toCourse(data as CourseRow);
}

/**
 * Delete a course. Sweeps and removes this course's task-cell attachment
 * objects from Storage BEFORE the row delete (AC6 item 31,
 * docs/task-cell-attachments-acceptance-criteria.md): the FK cascade removes
 * the attachment ROWS automatically but never touches Storage, so without
 * this sweep every object would orphan the moment the row delete runs -
 * mirrors deleteInstitutionPageAndAttachments. A failed removal throws
 * instead of deleting the row, so the course survives for a retry (AC6 item
 * 32 - materials/misc/Castletop/LMS files share this same gap, unclosed).
 */
export async function deleteCourse(userId: string, id: string): Promise<void> {
  const supabase = createServiceClient();
  const storagePaths = await listTaskAttachmentStoragePathsForCourse(supabase, userId, id);
  await taskAttachmentStorageSweep.remove(supabase, storagePaths);
  const { error } = await table().delete().eq("user_id", userId).eq("id", id);
  if (error) {
    throw new Error(`Could not delete the course: ${error.message}`);
  }
}

/**
 * Count how many course tiles are filed under an institution acronym - used
 * by the institution-removal confirmation (AC1 of the "delete institutions"
 * feature, src/lib/institution-removal.ts) to state the real blast radius
 * before an acronym is hidden. Filters in JS rather than via .eq() at the DB
 * layer because course_hub.institution is NOT normalized on write the way
 * institution_pages.institution is (see courses.row.ts's toRow plain clean(),
 * versus knowledge-base.ts's normalizeInstitution) - the institution field is
 * a freeSolo Autocomplete (AddCourseForm.tsx), so a typed value could be any
 * casing, and an exact-match DB filter would silently undercount.
 */
export async function countCoursesByInstitution(userId: string, institution: string): Promise<number> {
  const code = institution.trim().toUpperCase();
  const { data, error } = await table().select("institution").eq("user_id", userId);
  if (error) {
    throw new Error(`Could not count course tiles: ${error.message}`);
  }
  return ((data ?? []) as Array<{ institution: string | null }>).filter(
    (r) => (r.institution ?? "").trim().toUpperCase() === code
  ).length;
}

/** Update a course's materials zip metadata. */
export async function updateCourseMaterials(
  userId: string,
  id: string,
  fields: {
    materialsZipName: string | null;
    materialsZipPath: string | null;
    materialsZipSize: number | null;
  }
): Promise<void> {
  const { error } = await table()
    .update({
      materials_zip_name: fields.materialsZipName,
      materials_zip_path: fields.materialsZipPath,
      materials_zip_size: fields.materialsZipSize,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course materials: ${error.message}`);
  }
}

/** Update a course's CSV metadata. */
export async function updateCourseCsv(
  userId: string,
  id: string,
  fields: {
    csvName: string | null;
    csvData: string | null;
  }
): Promise<void> {
  const { error } = await table()
    .update({
      csv_name: fields.csvName,
      csv_data: fields.csvData,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course schedule CSV: ${error.message}`);
  }
}

/**
 * The SOLE writer of the course_project column. It is kept out of CourseInput
 * and out of toRow precisely so that updateCourse can never clobber it; that
 * only holds while this stays the only path that writes it.
 */
export async function updateCourseProject(
  userId: string,
  id: string,
  project: CourseProject
): Promise<void> {
  const { error } = await table()
    .update({
      course_project: project as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course project: ${error.message}`);
  }
}

/** Update a course's rubric metadata. */
export async function updateCourseRubric(
  userId: string,
  id: string,
  fields: {
    rubricName: string | null;
    rubricData: string | null;
  }
): Promise<void> {
  const { error } = await table()
    .update({
      rubric_name: fields.rubricName,
      rubric_data: fields.rubricData,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course rubric: ${error.message}`);
  }
}
