/**
 * The messaging composer draft (LIVE-LMS-STUDENT-MESSAGING W3). VIEW-LEVEL
 * state: independent of the selected institution, so it survives an
 * institution switch and a reload. It stores subject + body ONLY - never the
 * selected students and never the institution. Mirrors the ta-one-off-draft /
 * ta-ppt-ask-draft draft-persistence pattern (coerce untrusted persisted
 * state, versioned envelope, ta- key).
 */

export const MESSAGING_DRAFT_KEY = "ta-live-messaging-draft";

export const SUBJECT_MAX = 200;
export const BODY_MAX = 10000;

export interface MessagingDraft {
  subject: string;
  body: string;
}

export const EMPTY_MESSAGING_DRAFT: MessagingDraft = { subject: "", body: "" };

export function serializeDraft(draft: MessagingDraft): string {
  return JSON.stringify({ v: 1, subject: draft.subject, body: draft.body });
}

/** Coerces whatever is in storage into a draft; anything malformed -> empty. */
export function parseDraft(raw: string | null | undefined): MessagingDraft {
  if (!raw) return { ...EMPTY_MESSAGING_DRAFT };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...EMPTY_MESSAGING_DRAFT };
    const p = parsed as Record<string, unknown>;
    if (p.v !== 1) return { ...EMPTY_MESSAGING_DRAFT };
    return {
      subject: typeof p.subject === "string" ? p.subject.slice(0, SUBJECT_MAX) : "",
      body: typeof p.body === "string" ? p.body.slice(0, BODY_MAX) : "",
    };
  } catch {
    return { ...EMPTY_MESSAGING_DRAFT };
  }
}
