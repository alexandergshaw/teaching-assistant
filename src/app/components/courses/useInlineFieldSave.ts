"use client";

// Saves one inline-editable table cell/row-detail field through the exact
// save path the tile editors used (courseToInput + updateCourseHubAction),
// including the background topic-extraction side effect that used to follow
// a "codebases" (repos) save. Ported from CoursesTab's saveTileEdit.
import { useCallback } from "react";
import { updateCourseHubAction, extractTopicsFromRepoAction } from "@/app/actions";
import type { Course, CourseInput } from "@/lib/supabase/courses";
import { courseToInput } from "@/lib/courses-tab-helpers";
import { computeFieldPatch, type TableEditableField } from "@/lib/courses-table-helpers";
import { getStoredProvider } from "@/lib/llm-provider";

export interface UseInlineFieldSaveReturn {
  /** Save one field's raw editor value through the standard patch mapping.
   * `extra` merges additional CourseInput keys into the same save call (used
   * by the LMS cell, which saves lms + canvasUrl together). */
  saveField: (course: Course, field: TableEditableField, rawValue: string, extra?: Partial<CourseInput>) => Promise<Course | null>;
}

export function useInlineFieldSave(
  onCourseUpdated: (course: Course) => void,
  setError: (message: string | null) => void
): UseInlineFieldSaveReturn {
  const saveField = useCallback(
    async (course: Course, field: TableEditableField, rawValue: string, extra?: Partial<CourseInput>): Promise<Course | null> => {
      const patch = { ...computeFieldPatch(field, rawValue), ...extra };
      const r = await updateCourseHubAction(course.id, { ...courseToInput(course), ...patch });
      if ("error" in r) {
        setError(r.error);
        return null;
      }
      const savedCourse = r.course;
      onCourseUpdated(savedCourse);

      // After a successful repos ("codebases") save, re-extract topics from
      // the repo the user just linked (fire-and-forget, matches the tile
      // system's behavior exactly).
      if (field === "repos" && patch.repos && patch.repos.length > 0) {
        const prevRepos = new Set(course.repos.map((x) => x.repo.toLowerCase()));
        const added = patch.repos.filter((x) => !prevRepos.has(x.repo.toLowerCase()));
        const extractRepo = (added.length > 0 ? added[added.length - 1] : patch.repos[patch.repos.length - 1]).repo;
        const topicsEmpty = !savedCourse.topics || savedCourse.topics.trim() === "";
        if (added.length > 0 || topicsEmpty) {
          void (async () => {
            const extractResult = await extractTopicsFromRepoAction(extractRepo, getStoredProvider());
            if ("error" in extractResult) {
              setError(extractResult.error);
              return;
            }
            const updatedInput = {
              ...courseToInput(savedCourse),
              repos: savedCourse.repos,
              topics: extractResult.topics.join("\n"),
            };
            const updateResult = await updateCourseHubAction(savedCourse.id, updatedInput);
            if ("error" in updateResult) {
              setError(updateResult.error);
              return;
            }
            onCourseUpdated(updateResult.course);
            setError(`Topics extracted from ${extractRepo}.`);
          })();
        }
      }
      return savedCourse;
    },
    [onCourseUpdated, setError]
  );

  return { saveField };
}
