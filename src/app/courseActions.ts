"use server";

import { createClient } from "@/lib/supabase/server";
import {
  saveEndToEndCourse,
  saveLecturePlanFiles,
  listCourseNames,
  listCourses,
  getCourseFileSignedUrl,
  type CourseLibraryEntry,
  type GeneratedFileInput,
} from "@/lib/supabase/courses";

export type { CourseLibraryEntry, CourseFileRef, GeneratedFileInput } from "@/lib/supabase/courses";

async function getOptionalUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function saveEndToEndCourseAction(input: {
  title: string;
  description?: string | null;
  term?: string | null;
  scheduleCsv?: string | null;
  scheduleFileName?: string | null;
  geminiPrompt?: string | null;
}): Promise<{ id: string } | { error: string }> {
  try {
    if (!input.title.trim()) {
      return { error: "Course name is required." };
    }
    const userId = await getOptionalUserId();
    const id = await saveEndToEndCourse({
      title: input.title.trim(),
      description: input.description ?? null,
      term: input.term ?? null,
      scheduleCsv: input.scheduleCsv ?? null,
      scheduleFileName: input.scheduleFileName ?? null,
      geminiPrompt: input.geminiPrompt ?? null,
      userId,
    });
    return { id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save course." };
  }
}

export async function saveLecturePlanFilesAction(input: {
  courseId: string;
  codebaseZipBase64?: string | null;
  codebaseZipFileName?: string | null;
  files: GeneratedFileInput[];
}): Promise<{ ok: true } | { error: string }> {
  try {
    if (!input.courseId) {
      return { error: "Please select a course." };
    }
    const userId = await getOptionalUserId();
    await saveLecturePlanFiles({ ...input, userId });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save lecture files." };
  }
}

export async function listCourseNamesAction(): Promise<
  { courses: Array<{ id: string; title: string }> } | { error: string }
> {
  try {
    const courses = await listCourseNames();
    return { courses };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load courses." };
  }
}

export async function listCoursesAction(): Promise<
  { courses: CourseLibraryEntry[] } | { error: string }
> {
  try {
    const courses = await listCourses();
    return { courses };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load courses." };
  }
}

export async function getCourseFileUrlAction(
  filePath: string
): Promise<{ url: string } | { error: string }> {
  try {
    if (!filePath) {
      return { error: "Missing file path." };
    }
    const url = await getCourseFileSignedUrl(filePath);
    return { url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create download link." };
  }
}
