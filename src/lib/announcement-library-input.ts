import type { SaveAnnouncementLibraryInput } from "./announcement-library-types";

export const ANNOUNCEMENT_LIBRARY_MAX_BODY_CHARS = 16_000;
export const ANNOUNCEMENT_LIBRARY_MAX_BODY_BYTES = 32 * 1024;
export const ANNOUNCEMENT_LIBRARY_MAX_LABEL_CHARS = 120;
// Legacy rows predate editor bounds. Permit replacing them without reflecting
// an unbounded caller-supplied snapshot into the database transport.
export const ANNOUNCEMENT_LIBRARY_MAX_EXPECTED_BODY_BYTES = 256 * 1024;
export const ANNOUNCEMENT_LIBRARY_MAX_EXPECTED_LABEL_CHARS = 1024;

export function isAnnouncementLibraryUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeAnnouncementLibraryLabel(label: string | null): string | null {
  return label?.trim() || null;
}

/** Body is stored exactly as supplied. Expected snapshots stay byte-exact,
 * including legacy labels; only the new desired label is normalized. */
export function parseAnnouncementLibraryInput(value: unknown): SaveAnnouncementLibraryInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!isAnnouncementLibraryUuid(input.id) || !isAnnouncementLibraryUuid(input.courseId)) return null;
  if (typeof input.exemplarText !== "string" || !input.exemplarText.trim() ||
      input.exemplarText.length > ANNOUNCEMENT_LIBRARY_MAX_BODY_CHARS ||
      new TextEncoder().encode(input.exemplarText).length > ANNOUNCEMENT_LIBRARY_MAX_BODY_BYTES) return null;
  if (input.label !== null && (typeof input.label !== "string" || input.label.length > ANNOUNCEMENT_LIBRARY_MAX_LABEL_CHARS)) return null;
  let expected: SaveAnnouncementLibraryInput["expected"] = null;
  if (input.expected !== null) {
    if (!input.expected || typeof input.expected !== "object") return null;
    const snapshot = input.expected as Record<string, unknown>;
    if (typeof snapshot.exemplarText !== "string" ||
        snapshot.exemplarText.length > ANNOUNCEMENT_LIBRARY_MAX_EXPECTED_BODY_BYTES ||
        new TextEncoder().encode(snapshot.exemplarText).length > ANNOUNCEMENT_LIBRARY_MAX_EXPECTED_BODY_BYTES ||
        (snapshot.label !== null && (typeof snapshot.label !== "string" ||
          snapshot.label.length > ANNOUNCEMENT_LIBRARY_MAX_EXPECTED_LABEL_CHARS))) return null;
    expected = { exemplarText: snapshot.exemplarText, label: snapshot.label as string | null };
  }
  return { id: input.id, courseId: input.courseId, exemplarText: input.exemplarText,
    label: normalizeAnnouncementLibraryLabel(input.label as string | null), expected };
}
