// The jsonb file-column helpers for the owner's "course hub" table: append/
// remove for materials, Castletop, misc, and export files. See
// src/lib/supabase/courses.ts for the module map.

import { table } from "./courses.row";
import type { CourseMaterialFile } from "./courses.types";

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

/** Append a Castletop file to a course's Castletop list, deduplicating by name. Returns the storage path of any replaced entry, or null if none. */
export async function appendCourseCastletopFile(
  userId: string,
  id: string,
  file: CourseMaterialFile
): Promise<string | null> {
  const { data, error: selectError } = await table()
    .select("castletop_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course Castletop files: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).castletop_files) ? (data as any).castletop_files : [];
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
      castletop_files: updated,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course Castletop files: ${error.message}`);
  }

  return replacedPath;
}

/** Remove a Castletop file from a course's Castletop list by path. */
export async function removeCourseCastletopFile(
  userId: string,
  id: string,
  path: string
): Promise<void> {
  const { data, error: selectError } = await table()
    .select("castletop_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course Castletop files: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).castletop_files) ? (data as any).castletop_files : [];
  const filtered = current.filter((x: CourseMaterialFile) => x && x.path !== path);

  const { error } = await table()
    .update({
      castletop_files: filtered,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course Castletop files: ${error.message}`);
  }
}

/** Append a misc file to a course's misc files list, deduplicating by name. Returns the storage path of any replaced entry, or null if none. */
export async function appendCourseMiscFile(
  userId: string,
  id: string,
  file: CourseMaterialFile
): Promise<string | null> {
  const { data, error: selectError } = await table()
    .select("misc_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course misc files: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).misc_files) ? (data as any).misc_files : [];
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
      misc_files: updated,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course misc files: ${error.message}`);
  }

  return replacedPath;
}

/** Remove a misc file from a course's misc files list by path. */
export async function removeCourseMiscFile(
  userId: string,
  id: string,
  path: string
): Promise<void> {
  const { data, error: selectError } = await table()
    .select("misc_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course misc files: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).misc_files) ? (data as any).misc_files : [];
  const filtered = current.filter((x: CourseMaterialFile) => x && x.path !== path);

  const { error } = await table()
    .update({
      misc_files: filtered,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course misc files: ${error.message}`);
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
