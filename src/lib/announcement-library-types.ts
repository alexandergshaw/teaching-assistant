import type { AnnouncementOutline } from "./announcement-outline-types";

export type AnnouncementLibraryEntry = {
  id: string;
  courseId: string;
  exemplarText: string;
  label: string | null;
  outline: AnnouncementOutline;
  createdAt: string;
};
export type AnnouncementLibrarySnapshot = { exemplarText: string; label: string | null };
export type SaveAnnouncementLibraryInput = {
  id: string;
  courseId: string;
  exemplarText: string;
  label: string | null;
  expected: AnnouncementLibrarySnapshot | null;
};
export type AnnouncementLibraryFailureCode = "unauthenticated" | "invalid" | "not-found" | "conflict" | "unavailable";
export type AnnouncementLibraryResult<T> = { ok: true; value: T } | { ok: false; code: AnnouncementLibraryFailureCode };
