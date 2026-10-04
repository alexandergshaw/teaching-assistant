"use server";

// A29 W2: the one server action behind the course-wide message. Order is
// fixed: requireUser -> getCourse -> canLms gate -> count read -> predicate ->
// the single Canvas POST, which happens only on a permit. The body is passed
// to the builder byte-identical; plain-text stripping is a draft-accept
// concern, not this action's. No per-student data leaves this function.

import { requireUser } from "@/lib/supabase/auth";
import { getCourse } from "@/lib/supabase/courses";
import { canLms } from "@/lib/courses-table-helpers";
import { createCourseConversation } from "@/lib/canvas/inbox";
import { countActiveCourseStudents } from "@/lib/canvas/listings";
import { classifyRecipientCount } from "@/lib/bulk-course-message/refusal";
import { CANVAS_CREDENTIAL_REQUIRED_MESSAGE } from "@/lib/canvas-credentials";

export type RefusalKind =
  | "not-linked"
  | "needs-institution"
  | "no-credential"
  | "canvas-unreachable"
  | "one-student"
  | "over-max"
  | "canvas-refused";

export type BulkCourseMessageOutcome =
  | { status: "accepted" }
  | { status: "refused"; kind: RefusalKind; reason: string }
  | { status: "unknown"; reason: string };

// Not exported: a "use server" module may export only async functions.
const REFUSAL_COPY = {
  "not-linked": "This course is not linked to Canvas yet.",
  "needs-institution": "Choose an institution for this course before messaging it.",
  "no-credential": CANVAS_CREDENTIAL_REQUIRED_MESSAGE,
  "canvas-unreachable": "Canvas could not be reached, so the class size could not be checked. Nothing was posted.",
  "one-student": "A course message needs at least 2 students; this course has {n}.",
  "over-max": "A course message is limited to 100 students; this course has {n}.",
  "canvas-refused": "Canvas refused the message.",
} satisfies Record<RefusalKind, string>;

function refuse(kind: RefusalKind, count?: number, detail?: string): BulkCourseMessageOutcome {
  const base = REFUSAL_COPY[kind].replace("{n}", String(count ?? ""));
  return { status: "refused", kind, reason: detail ? `${base} ${detail}` : base };
}

export async function sendBulkCourseMessageAction(
  courseId: string,
  subject: string,
  body: string
): Promise<BulkCourseMessageOutcome> {
  const user = await requireUser();
  const course = await getCourse(user.id, courseId);
  if (!course) return refuse("not-linked");
  if (!canLms(course)) {
    return refuse((course.canvasUrl ?? "").trim() ? "needs-institution" : "not-linked");
  }
  const canvasUrl = (course.canvasUrl ?? "").trim();
  const institution = (course.institution ?? "").trim();
  const canvasCourseId = canvasUrl.match(/\/courses\/(\d+)/)?.[1];
  if (!canvasCourseId) return refuse("not-linked");

  let count: number;
  try {
    count = await countActiveCourseStudents(institution, canvasCourseId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return refuse(message === CANVAS_CREDENTIAL_REQUIRED_MESSAGE ? "no-credential" : "canvas-unreachable");
  }

  const decision = classifyRecipientCount(count);
  if (!decision.send) return refuse(decision.kind, decision.count);

  const result = await createCourseConversation(canvasUrl, body, subject);
  if (result.status === "accepted") return { status: "accepted" };
  if (result.status === "refused") return refuse("canvas-refused", undefined, result.reason);
  return { status: "unknown", reason: result.reason ?? "Delivery is unconfirmed." };
}
