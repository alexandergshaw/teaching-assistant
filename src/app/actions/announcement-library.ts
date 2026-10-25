"use server";

import { requireUser } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getCourse } from "@/lib/supabase/courses";
import { listAnnouncementLibraryEntries, saveAnnouncementLibraryEntry, deleteAnnouncementLibraryEntry } from "@/lib/announcement-exemplars";
import { isAnnouncementLibraryUuid, parseAnnouncementLibraryInput } from "@/lib/announcement-library-input";
import type { AnnouncementLibraryEntry, AnnouncementLibraryResult, SaveAnnouncementLibraryInput } from "@/lib/announcement-library-types";

export async function listAnnouncementLibraryAction(courseId: string): Promise<AnnouncementLibraryResult<AnnouncementLibraryEntry[]>> {
  let user;
  try { user = await requireUser(); } catch { return { ok: false, code: "unauthenticated" }; }
  if (!isAnnouncementLibraryUuid(courseId)) return { ok: false, code: "invalid" };
  try {
    if (!await getCourse(user.id, courseId)) return { ok: false, code: "not-found" };
    return { ok: true, value: await listAnnouncementLibraryEntries(createServiceClient(), user.id, courseId) };
  } catch { return { ok: false, code: "unavailable" }; }
}

export async function saveAnnouncementLibraryEntryAction(input: SaveAnnouncementLibraryInput): Promise<AnnouncementLibraryResult<AnnouncementLibraryEntry>> {
  let user;
  try { user = await requireUser(); } catch { return { ok: false, code: "unauthenticated" }; }
  const parsed = parseAnnouncementLibraryInput(input);
  if (!parsed) return { ok: false, code: "invalid" };
  try {
    if (!await getCourse(user.id, parsed.courseId)) return { ok: false, code: "not-found" };
    return await saveAnnouncementLibraryEntry(createServiceClient(), user.id, parsed);
  } catch { return { ok: false, code: "unavailable" }; }
}

export async function deleteAnnouncementLibraryEntryAction(courseId: string, id: string): Promise<AnnouncementLibraryResult<void>> {
  let user;
  try { user = await requireUser(); } catch { return { ok: false, code: "unauthenticated" }; }
  if (!isAnnouncementLibraryUuid(courseId) || !isAnnouncementLibraryUuid(id)) return { ok: false, code: "invalid" };
  try {
    if (!await getCourse(user.id, courseId)) return { ok: false, code: "not-found" };
    await deleteAnnouncementLibraryEntry(createServiceClient(), user.id, courseId, id);
    return { ok: true, value: undefined };
  } catch { return { ok: false, code: "unavailable" }; }
}
