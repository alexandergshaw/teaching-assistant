// A29 W3: the pure model behind the course-wide message surface. Everything
// that needs a test lives here, not in the .tsx (no component is rendered
// under vitest). Types come from the server action file as TYPE imports only.

import type { Course } from "@/lib/supabase/courses.types";
import type {
  BulkCourseMessageOutcome,
  BulkCoursePreview,
  RefusalKind,
} from "@/app/actions/bulk-course-message";
import { canLms } from "@/lib/courses-table-helpers";
import { canvasInboxPlainText } from "@/lib/bulk-course-message/plain-text";

export type { RefusalKind };

/** What the instructor confirmed: built ONLY by confirmFromPreview, from a
 * server-issued ready preview. The send handler takes one of these. */
export interface ConfirmedMessage {
  courseId: string;
  courseName: string;
  count: number;
  subject: string;
  body: string;
}

export interface ComposeFields {
  subject: string;
  body: string;
  prompt: string;
}

export const EMPTY_FIELDS: ComposeFields = { subject: "", body: "", prompt: "" };

/** The ONE constructor of ConfirmedMessage. Null unless the preview is ready. */
export function confirmFromPreview(
  preview: BulkCoursePreview,
  courseId: string,
  subject: string,
  body: string
): ConfirmedMessage | null {
  if (preview.status !== "ready") return null;
  return {
    courseId,
    courseName: preview.courseName,
    count: preview.count,
    subject: subject.trim(),
    body: body.trim(),
  };
}

// Order-PRESERVING, NUL-delimited join. Not a sorted signature: sorting would
// make a subject/body swap collide, and the banner would fail to disarm.
function joinSignature(courseId: string, count: number, subject: string, body: string): string {
  const sep = String.fromCharCode(0);
  return [courseId, String(count), subject.trim(), body.trim()].join(sep);
}

export function confirmSignature(c: ConfirmedMessage): string {
  return joinSignature(c.courseId, c.count, c.subject, c.body);
}

/** True while the live inputs still match what was confirmed. Editing a field
 * (or switching course) changes the live signature, so the banner disarms with
 * no reset code. Never persisted. */
export function stillMatchesConfirmed(
  confirmed: ConfirmedMessage | null,
  courseId: string | null,
  subject: string,
  body: string
): confirmed is ConfirmedMessage {
  if (!confirmed || !courseId) return false;
  return confirmSignature(confirmed) === joinSignature(courseId, confirmed.count, subject, body);
}

export function bannerText(c: ConfirmedMessage): string {
  return [
    `Send this message to ${c.courseName}? Canvas lists ${c.count} active students. It uses Canvas Inbox, not a course announcement. Sending cannot be undone.`,
    `Subject: ${c.subject}`,
    c.body,
  ].join("\n");
}

/** Courses with a live LMS connection. Delegates to canLms; no second predicate. */
export function eligibleLiveCourses(courses: readonly Course[]): Course[] {
  return courses.filter(canLms);
}

/** The course the surface acts on, or null. A stored id that is no longer
 * eligible never resolves; with exactly one eligible course it is selected. */
export function resolveSelectedCourse(
  storedId: string | null,
  eligible: readonly { id: string }[]
): string | null {
  if (storedId && eligible.some((c) => c.id === storedId)) return storedId;
  if (eligible.length === 1) return eligible[0].id;
  return null;
}

export type ComposeAction =
  | { kind: "typed"; field: keyof ComposeFields; value: string }
  | { kind: "drafted"; result: { title: string; message: string } | { error: string } }
  | { kind: "cleared-after-accept" };

/** Typed text is stored byte-for-byte. The plain-text strip applies only at
 * draft-accept, to what a drafter produced. A drafter error changes nothing. */
export function reduceCompose(fields: ComposeFields, action: ComposeAction): ComposeFields {
  if (action.kind === "typed") return { ...fields, [action.field]: action.value };
  if (action.kind === "cleared-after-accept") return { ...fields, subject: "", body: "" };
  const result = action.result;
  if ("error" in result) return fields;
  const plain = (text: string) => canvasInboxPlainText(text);
  return { ...fields, subject: plain(result.title), body: plain(result.message) };
}

export type NoticeTone = "success" | "warning" | "error";

export function outcomeNotice(
  outcome: BulkCourseMessageOutcome,
  courseName: string
): { tone: NoticeTone; text: string } {
  if (outcome.status === "accepted") {
    return {
      tone: "success",
      text: `Canvas accepted the message for ${courseName}. Whether each student also gets an email depends on their Canvas notification settings, which this app cannot see.`,
    };
  }
  if (outcome.status === "unknown") {
    return {
      tone: "warning",
      text: `Canvas did not confirm the message. It may or may not have gone out. Check your Canvas Inbox before trying again, so it is not posted twice. ${outcome.reason}`,
    };
  }
  return { tone: "error", text: outcome.reason };
}

export interface SendLock {
  tryClaim(): boolean;
  release(): void;
}

export function createSendLock(): SendLock {
  let held = false;
  return {
    tryClaim() {
      if (held) return false;
      held = true;
      return true;
    },
    release() {
      held = false;
    },
  };
}
