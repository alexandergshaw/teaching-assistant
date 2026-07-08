// Persistence for the owner's "course hub" -- one row per course that bundles
// its associated resources (GitHub codebase, linked finalized syllabus,
// textbook, Canvas URL). Reads/writes go through the Supabase service-role
// client behind requireOwner() (mirrors src/lib/supabase/syllabus-templates.ts);
// every query is explicitly scoped to the owning user_id.

import { createServiceClient } from "./server";
import type { Database } from "./types";

type CoursesTable = Database["public"]["Tables"]["courses"];

/** A course and the resources bundled with it. */
export interface Course {
  id: string;
  name: string;
  courseCode: string | null;
  term: string | null;
  canvasUrl: string | null;
  githubRepo: string | null;
  githubBranch: string | null;
  textbook: string | null;
  syllabusId: string | null;
  notes: string | null;
  updatedAt: string;
}

/** The editable fields of a course (create/update). */
export interface CourseInput {
  name: string;
  courseCode?: string | null;
  term?: string | null;
  canvasUrl?: string | null;
  githubRepo?: string | null;
  githubBranch?: string | null;
  textbook?: string | null;
  syllabusId?: string | null;
  notes?: string | null;
}

const COLUMNS =
  "id, name, course_code, term, canvas_url, github_repo, github_branch, textbook, syllabus_id, notes, updated_at";

function table() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as any).from("courses");
}

// Shape of a selected row (snake_case, from the DB).
interface CourseRow {
  id: string;
  name: string;
  course_code: string | null;
  term: string | null;
  canvas_url: string | null;
  github_repo: string | null;
  github_branch: string | null;
  textbook: string | null;
  syllabus_id: string | null;
  notes: string | null;
  updated_at: string;
}

function toCourse(r: CourseRow): Course {
  return {
    id: r.id,
    name: r.name,
    courseCode: r.course_code,
    term: r.term,
    canvasUrl: r.canvas_url,
    githubRepo: r.github_repo,
    githubBranch: r.github_branch,
    textbook: r.textbook,
    syllabusId: r.syllabus_id,
    notes: r.notes,
    updatedAt: r.updated_at,
  };
}

// Map the app-facing input onto the DB columns, coercing "" to null.
function toRow(input: CourseInput): Omit<CoursesTable["Insert"], "user_id" | "name"> & { name?: string } {
  const clean = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t;
  };
  return {
    name: input.name.trim(),
    course_code: clean(input.courseCode),
    term: clean(input.term),
    canvas_url: clean(input.canvasUrl),
    github_repo: clean(input.githubRepo),
    github_branch: clean(input.githubBranch),
    textbook: clean(input.textbook),
    syllabus_id: clean(input.syllabusId),
    notes: clean(input.notes),
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
