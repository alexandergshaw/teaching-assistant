"use server";

import { listCourses as listCourseHubRows, createCourse as createCourseRow, updateCourse as updateCourseRow, deleteCourse as deleteCourseRow, updateCourseMaterials, updateCourseCsv, updateCourseRubric, updateCourseRepoPairing, updateCourseExportModuleAdditions, appendCourseMaterialFile, removeCourseMaterialFile, appendCourseCastletopFile, removeCourseCastletopFile, appendCourseMiscFile, removeCourseMiscFile, appendCourseExportFile, removeCourseExportFile, type Course as CourseHub, type CourseInput as CourseHubInput } from "@/lib/supabase/courses";
import { requireOwner } from "@/lib/supabase/auth";
import { coerceRepoModulePairing, type RepoModulePairing } from "@/lib/repo-module-pairing";
import { coerceExportModuleAdditions, type ExportModuleAdditions } from "@/lib/export-module-additions";

// ── Course hub (bundle a course's resources: codebase, syllabus, textbook, Canvas) ──
// Named "CourseHub" to avoid collision with the Canvas listCoursesAction above.

/** List the owner's saved courses. */
export async function listCourseHubAction(): Promise<{ courses: CourseHub[] } | { error: string }> {
  try {
    const user = await requireOwner();
    return { courses: await listCourseHubRows(user.id) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list your courses." };
  }
}

/** Create a course. */
export async function createCourseHubAction(input: CourseHubInput): Promise<{ course: CourseHub } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!input.name?.trim()) return { error: "Enter a course name." };
    return { course: await createCourseRow(user.id, input) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the course." };
  }
}

/** Update a course. */
export async function updateCourseHubAction(
  id: string,
  input: CourseHubInput
): Promise<{ course: CourseHub } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a course." };
    if (!input.name?.trim()) return { error: "Enter a course name." };
    return { course: await updateCourseRow(user.id, id, input) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course." };
  }
}

/** Delete a course. */
export async function deleteCourseHubAction(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a course." };
    await deleteCourseRow(user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the course." };
  }
}

/** Update a course's materials zip metadata. */
export async function setCourseMaterialsAction(
  courseId: string,
  fields: {
    materialsZipName: string | null;
    materialsZipPath: string | null;
    materialsZipSize: number | null;
  }
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await updateCourseMaterials(user.id, courseId, fields);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course materials." };
  }
}

/** Update a course's CSV metadata. */
export async function setCourseCsvAction(
  courseId: string,
  csvName: string | null,
  csvData: string | null
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await updateCourseCsv(user.id, courseId, { csvName, csvData });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course schedule CSV." };
  }
}

/** Update a course's rubric metadata. */
export async function setCourseRubricAction(
  courseId: string,
  rubricName: string | null,
  rubricData: string | null
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await updateCourseRubric(user.id, courseId, { rubricName, rubricData });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course rubric." };
  }
}

/**
 * The SOLE server entry point that writes repo_module_pairing
 * (docs/durable-repo-module-associations-acceptance-criteria.md AC7/AC9).
 * The record is coerced before it is stored (mirrors setCourseProjectAction's
 * own coerceCourseProject call), so a malformed payload from any caller is
 * normalized on the way in rather than on every read afterwards. This is the
 * ONLY path useRepoPairing.ts (content-tab/modules/) reaches the database
 * through - every hook in that directory imports from the actions barrel,
 * never `@/lib/supabase` at runtime.
 */
export async function setCourseRepoPairingAction(
  courseId: string,
  pairing: RepoModulePairing
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await updateCourseRepoPairing(user.id, courseId, coerceRepoModulePairing(pairing));
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the repo-module pairing." };
  }
}

/**
 * The SOLE server entry point that writes export_module_additions
 * (docs/export-module-additions-acceptance-criteria.md AC1/AC7). The record
 * is coerced before it is stored (mirrors setCourseRepoPairingAction's own
 * coerceRepoModulePairing call), so a malformed payload from any caller is
 * normalized on the way in rather than on every read afterwards. This is the
 * ONLY path useExportModuleAdditions.ts (content-tab/modules/) reaches the
 * database through - every hook in that directory imports from the actions
 * barrel, never `@/lib/supabase` at runtime.
 */
export async function setCourseExportModuleAdditionsAction(
  courseId: string,
  additions: ExportModuleAdditions
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await updateCourseExportModuleAdditions(user.id, courseId, coerceExportModuleAdditions(additions));
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the export module additions." };
  }
}

/** Append a material file to a course's materials list. Returns the storage path of any replaced entry. */
export async function appendCourseMaterialFileAction(
  courseId: string,
  file: { name: string; path: string; size: number }
): Promise<{ replacedPath: string | null } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    const replacedPath = await appendCourseMaterialFile(user.id, courseId, {
      ...file,
      addedAt: new Date().toISOString(),
    });
    return { replacedPath };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to the course materials." };
  }
}

/** Remove a material file from a course's materials list. */
export async function removeCourseMaterialFileAction(
  courseId: string,
  path: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await removeCourseMaterialFile(user.id, courseId, path);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the file from the course materials." };
  }
}

/** Append a Castletop file to a course's Castletop list. Returns the storage path of any replaced entry. */
export async function appendCourseCastletopFileAction(
  courseId: string,
  file: { name: string; path: string; size: number }
): Promise<{ replacedPath: string | null } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    const replacedPath = await appendCourseCastletopFile(user.id, courseId, {
      ...file,
      addedAt: new Date().toISOString(),
    });
    return { replacedPath };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to the course Castletop files." };
  }
}

/** Remove a Castletop file from a course's Castletop list. */
export async function removeCourseCastletopFileAction(
  courseId: string,
  path: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await removeCourseCastletopFile(user.id, courseId, path);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the file from the course Castletop files." };
  }
}

/** Append a misc file to a course's misc files list. Returns the storage path of any replaced entry. */
export async function appendCourseMiscFileAction(
  courseId: string,
  file: { name: string; path: string; size: number }
): Promise<{ replacedPath: string | null } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    const replacedPath = await appendCourseMiscFile(user.id, courseId, {
      ...file,
      addedAt: new Date().toISOString(),
    });
    return { replacedPath };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to the course misc files." };
  }
}

/** Remove a misc file from a course's misc files list. */
export async function removeCourseMiscFileAction(
  courseId: string,
  path: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await removeCourseMiscFile(user.id, courseId, path);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the file from the course misc files." };
  }
}

/** Append an export file to a course's exports list. Returns the storage object paths of any replaced entry. */
export async function appendCourseExportFileAction(
  courseId: string,
  file: { name: string; path: string; size: number; parts?: string[]; generated?: boolean }
): Promise<{ replacedPaths: string[] } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    const replacedPaths = await appendCourseExportFile(user.id, courseId, {
      ...file,
      addedAt: new Date().toISOString(),
    });
    return { replacedPaths };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to the course exports." };
  }
}

/** Remove an export file from a course's exports list. */
export async function removeCourseExportFileAction(
  courseId: string,
  path: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await removeCourseExportFile(user.id, courseId, path);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the file from the course exports." };
  }
}
