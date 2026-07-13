// Persistence for the owner's "course hub" -- one row per course that bundles
// its associated resources (GitHub codebase, linked finalized syllabus,
// textbook, Canvas URL). Reads/writes go through the Supabase service-role
// client behind requireOwner() (mirrors src/lib/supabase/syllabus-templates.ts);
// every query is explicitly scoped to the owning user_id.

import { createServiceClient } from "./server";
import type { Database, Json } from "./types";

type CoursesTable = Database["public"]["Tables"]["course_hub"];

/** One codebase associated with a course. */
export interface CourseRepo {
  repo: string;
  branch: string | null;
}

/** A third-party integration linked to a course (e.g. Cengage) + its URL. */
export interface CourseIntegration {
  name: string;
  url: string | null;
}

/** A single material file (workflow-generated zip, LMS export, etc.). */
export interface CourseMaterialFile {
  name: string;
  path: string;
  size: number;
  addedAt: string;
  /** Storage object paths when the file is stored as chunked parts (large
   * exports above the per-object upload limit); absent for single objects. */
  parts?: string[];
}

/** A custom tile in a course card. */
export interface CourseCustomTile {
  id: string;
  label: string;
  value: string;
  /** layout group this tile lives in */
  groupId: string;
}

/** A course and the resources bundled with it. */
export interface Course {
  id: string;
  name: string;
  courseCode: string | null;
  term: string | null;
  canvasUrl: string | null;
  repos: CourseRepo[];
  githubOrg: string | null;
  textbook: string | null;
  syllabusId: string | null;
  institution: string | null;
  integrations: CourseIntegration[];
  roster: string | null;
  notes: string | null;
  topics: string | null;
  csvName: string | null;
  csvData: string | null;
  rubricName: string | null;
  rubricData: string | null;
  startDate: string | null;
  description: string | null;
  weeks: number | null;
  tests: number | null;
  lms: string | null;
  dayTime: string | null;
  materialsFiles: CourseMaterialFile[];
  exportFiles: CourseMaterialFile[];
  materialsZipName: string | null;
  materialsZipPath: string | null;
  materialsZipSize: number | null;
  customTiles: CourseCustomTile[];
  updatedAt: string;
}

/** The editable fields of a course (create/update). */
export interface CourseInput {
  name: string;
  courseCode?: string | null;
  term?: string | null;
  canvasUrl?: string | null;
  repos?: CourseRepo[];
  githubOrg?: string | null;
  textbook?: string | null;
  syllabusId?: string | null;
  institution?: string | null;
  integrations?: CourseIntegration[];
  roster?: string | null;
  notes?: string | null;
  topics?: string | null;
  csvName?: string | null;
  csvData?: string | null;
  rubricName?: string | null;
  rubricData?: string | null;
  startDate?: string | null;
  description?: string | null;
  weeks?: number | null;
  tests?: number | null;
  lms?: string | null;
  dayTime?: string | null;
  customTiles?: CourseCustomTile[];
}

const COLUMNS =
  "id, name, course_code, term, canvas_url, repos, github_org, textbook, syllabus_id, institution, integrations, roster, notes, topics, csv_name, csv_data, rubric_name, rubric_data, start_date, description, weeks, tests, lms, day_time, materials_files, export_files, materials_zip_name, materials_zip_path, materials_zip_size, custom_tiles, updated_at";

function table() {
  // Dedicated table name (not "courses") to avoid colliding with a pre-existing,
  // unrelated `courses` table in this database.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as any).from("course_hub");
}

// Shape of a selected row (snake_case, from the DB).
interface CourseRow {
  id: string;
  name: string;
  course_code: string | null;
  term: string | null;
  canvas_url: string | null;
  repos: Array<{ repo: string; branch: string | null }> | null;
  github_org: string | null;
  textbook: string | null;
  syllabus_id: string | null;
  institution: string | null;
  integrations: Array<{ name: string; url: string | null }> | null;
  roster: string | null;
  notes: string | null;
  topics: string | null;
  csv_name: string | null;
  csv_data: string | null;
  rubric_name: string | null;
  rubric_data: string | null;
  start_date: string | null;
  description: string | null;
  weeks: number | null;
  tests: number | null;
  lms: string | null;
  day_time: string | null;
  materials_files: Array<{ name: string; path: string; size: number; addedAt: string; parts?: string[] }> | null;
  export_files: Array<{ name: string; path: string; size: number; addedAt: string; parts?: string[] }> | null;
  materials_zip_name: string | null;
  materials_zip_path: string | null;
  materials_zip_size: number | null;
  custom_tiles: Array<{ id: string; label: string; value: string; groupId: string }> | null;
  updated_at: string;
}

function toCourse(r: CourseRow): Course {
  return {
    id: r.id,
    name: r.name,
    courseCode: r.course_code,
    term: r.term,
    canvasUrl: r.canvas_url,
    repos: Array.isArray(r.repos) ? r.repos.filter((x) => x && x.repo) : [],
    githubOrg: r.github_org,
    textbook: r.textbook,
    syllabusId: r.syllabus_id,
    institution: r.institution,
    integrations: Array.isArray(r.integrations) ? r.integrations.filter((x) => x && x.name) : [],
    roster: r.roster,
    notes: r.notes,
    topics: r.topics,
    csvName: r.csv_name,
    csvData: r.csv_data,
    rubricName: r.rubric_name,
    rubricData: r.rubric_data,
    startDate: r.start_date,
    description: r.description,
    weeks: r.weeks,
    tests: r.tests,
    lms: r.lms,
    dayTime: r.day_time,
    materialsFiles: Array.isArray(r.materials_files) ? r.materials_files.filter((x) => x && x.path && x.name) : [],
    exportFiles: Array.isArray(r.export_files) ? r.export_files.filter((x) => x && x.path && x.name) : [],
    materialsZipName: r.materials_zip_name,
    materialsZipPath: r.materials_zip_path,
    materialsZipSize: r.materials_zip_size,
    customTiles: Array.isArray(r.custom_tiles) ? r.custom_tiles.filter((x) => x && typeof x.id === "string" && typeof x.label === "string") : [],
    updatedAt: r.updated_at,
  };
}

// Map the app-facing input onto the DB columns, coercing "" to null and
// dropping empty repo rows.
function toRow(input: CourseInput): Omit<CoursesTable["Insert"], "user_id" | "name"> & { name?: string } {
  const clean = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t;
  };
  const repos = (input.repos ?? [])
    .map((r) => ({ repo: (r.repo ?? "").trim(), branch: (r.branch ?? "").trim() || null }))
    .filter((r) => r.repo !== "");
  const integrations = (input.integrations ?? [])
    .map((i) => ({ name: (i.name ?? "").trim(), url: (i.url ?? "").trim() || null }))
    .filter((i) => i.name !== "" || i.url !== null);
  return {
    name: input.name.trim(),
    course_code: clean(input.courseCode),
    term: clean(input.term),
    canvas_url: clean(input.canvasUrl),
    repos,
    github_org: clean(input.githubOrg),
    textbook: clean(input.textbook),
    syllabus_id: clean(input.syllabusId),
    institution: clean(input.institution),
    integrations,
    roster: clean(input.roster),
    notes: clean(input.notes),
    topics: clean(input.topics),
    csv_name: clean(input.csvName),
    csv_data: clean(input.csvData),
    rubric_name: clean(input.rubricName),
    rubric_data: clean(input.rubricData),
    start_date: clean(input.startDate),
    description: clean(input.description),
    weeks: typeof input.weeks === "number" && Number.isFinite(input.weeks) ? input.weeks : null,
    tests: typeof input.tests === "number" && Number.isFinite(input.tests) ? input.tests : null,
    lms: clean(input.lms),
    day_time: clean(input.dayTime),
    custom_tiles: Array.isArray(input.customTiles) ? (input.customTiles as unknown as Json) : undefined,
    // Omit materials_zip_* fields: inserts use NULL defaults, updates preserve existing
    // values. updateCourseMaterials is the sole writer of these columns.
    // Omit materials_files and export_files: dedicated writers only (appendCourseMaterialFile,
    // removeCourseMaterialFile, appendCourseExportFile, removeCourseExportFile).
    updated_at: new Date().toISOString(),
  };
}

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

/** Delete a course. */
export async function deleteCourse(userId: string, id: string): Promise<void> {
  const { error } = await table().delete().eq("user_id", userId).eq("id", id);
  if (error) {
    throw new Error(`Could not delete the course: ${error.message}`);
  }
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

/** Append a material file to a course's materials list, deduplicating by name. Returns the storage path of any replaced entry, or null if none. */
export async function appendCourseMaterialFile(
  userId: string,
  id: string,
  file: CourseMaterialFile
): Promise<string | null> {
  const { data, error: selectError } = await table()
    .select("materials_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course materials: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).materials_files) ? (data as any).materials_files : [];
  let replacedPath: string | null = null;

  // Remove any existing entry with the same name, capturing its path.
  const filtered = current.filter((x: CourseMaterialFile) => {
    if (x && x.name === file.name) {
      replacedPath = x.path;
      return false;
    }
    return true;
  });

  // Append the new entry.
  const updated = [...filtered, file];

  const { error } = await table()
    .update({
      materials_files: updated,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course materials: ${error.message}`);
  }

  return replacedPath;
}

/** Remove a material file from a course's materials list by path. */
export async function removeCourseMaterialFile(
  userId: string,
  id: string,
  path: string
): Promise<void> {
  const { data, error: selectError } = await table()
    .select("materials_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course materials: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).materials_files) ? (data as any).materials_files : [];
  const filtered = current.filter((x: CourseMaterialFile) => x && x.path !== path);

  const { error } = await table()
    .update({
      materials_files: filtered,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course materials: ${error.message}`);
  }
}

/** Append an export file to a course's exports list, deduplicating by name. Returns the storage object paths of any replaced entry (its parts, or its single path). */
export async function appendCourseExportFile(
  userId: string,
  id: string,
  file: CourseMaterialFile
): Promise<string[]> {
  const { data, error: selectError } = await table()
    .select("export_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course exports: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).export_files) ? (data as any).export_files : [];
  const replacedPaths: string[] = [];

  // Remove every existing entry with the same name, capturing all object paths
  // (legacy rows may hold duplicates).
  const filtered = current.filter((x: CourseMaterialFile) => {
    if (x && x.name === file.name) {
      replacedPaths.push(...(Array.isArray(x.parts) && x.parts.length > 0 ? x.parts : [x.path]));
      return false;
    }
    return true;
  });

  // Append the new entry.
  const updated = [...filtered, file];

  const { error } = await table()
    .update({
      export_files: updated,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course exports: ${error.message}`);
  }

  return replacedPaths;
}

/** Remove an export file from a course's exports list by path. */
export async function removeCourseExportFile(
  userId: string,
  id: string,
  path: string
): Promise<void> {
  const { data, error: selectError } = await table()
    .select("export_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course exports: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).export_files) ? (data as any).export_files : [];
  const filtered = current.filter((x: CourseMaterialFile) => x && x.path !== path);

  const { error } = await table()
    .update({
      export_files: filtered,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course exports: ${error.message}`);
  }
}
