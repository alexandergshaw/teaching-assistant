// Persistence for the owner's "course hub" -- one row per course that bundles
// its associated resources (GitHub codebase, linked finalized syllabus,
// textbook, Canvas URL). Reads/writes go through the Supabase service-role
// client behind requireOwner() (mirrors src/lib/supabase/syllabus-templates.ts);
// every query is explicitly scoped to the owning user_id.

import { createServiceClient } from "./server";
import type { Database } from "./types";

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
  notes: string | null;
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
  notes?: string | null;
}

const COLUMNS =
  "id, name, course_code, term, canvas_url, repos, github_org, textbook, syllabus_id, institution, integrations, notes, updated_at";

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
    repos: Array.isArray(r.repos) ? r.repos.filter((x) => x && x.repo) : [],
    githubOrg: r.github_org,
    textbook: r.textbook,
    syllabusId: r.syllabus_id,
    institution: r.institution,
    integrations: Array.isArray(r.integrations) ? r.integrations.filter((x) => x && x.name) : [],
    notes: r.notes,
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
