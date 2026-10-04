// A29 W3: persistence for the course-wide message surface. Two keys only:
// the selected course id, and ONE map of per-course drafts. Nothing that could
// authorise a send (armed signature, preview, confirmed message) is stored.

import type { ComposeFields } from "./bulk-message-model";

export const STORAGE_KEY_COURSE = "ta-bulk-msg-course";
export const STORAGE_KEY_DRAFTS = "ta-bulk-msg-drafts";

/** A thunk, not a Storage value: in a blocked-storage browser the throw can
 * come from the property access itself, so it must land inside the caller's try. */
export function browserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export type DraftMap = Record<string, ComposeFields>;

export function readStoredCourse(getStorage: () => Storage | null): string {
  try {
    return getStorage()?.getItem(STORAGE_KEY_COURSE) ?? "";
  } catch {
    return "";
  }
}

export function writeStoredCourse(getStorage: () => Storage | null, courseId: string): void {
  try {
    getStorage()?.setItem(STORAGE_KEY_COURSE, courseId);
  } catch {
    // Best-effort: blocked storage must not break the surface.
  }
}

export function readStoredDrafts(getStorage: () => Storage | null): DraftMap {
  try {
    const raw = getStorage()?.getItem(STORAGE_KEY_DRAFTS);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: DraftMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      out[id] = {
        subject: typeof v.subject === "string" ? v.subject : "",
        body: typeof v.body === "string" ? v.body : "",
        prompt: typeof v.prompt === "string" ? v.prompt : "",
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** Writes one course's draft. The three fields are enumerated explicitly (no
 * spread) so a future field cannot leak into storage. An all-empty draft
 * removes the course's entry. */
export function writeStoredDraft(
  getStorage: () => Storage | null,
  courseId: string,
  fields: ComposeFields
): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    const drafts = readStoredDrafts(getStorage);
    if (!fields.subject && !fields.body && !fields.prompt) {
      delete drafts[courseId];
    } else {
      drafts[courseId] = { subject: fields.subject, body: fields.body, prompt: fields.prompt };
    }
    storage.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(drafts));
  } catch {
    // Best-effort: blocked storage must not break the surface.
  }
}
