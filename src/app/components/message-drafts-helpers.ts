// Pure UI-logic helpers for the Message Drafts tab (src/app/components/MessageDraftsTab.tsx).
// Split out so the recipient-naming and subject-resolution logic that decides
// what an instructor is TOLD before a send reaches a real student is
// unit-testable without rendering React - see message-drafts-helpers.test.ts.
// Mirrors the split in src/app/components/knowledge/knowledge-helpers.ts
// (pure helpers pulled out of a big tab component).

import type { MessageDraft, MessageDraftPayload } from "@/lib/message-drafts";

// ── Recipients (B1) ─────────────────────────────────────────────────────────
// Every send this tab can fire must name who it reaches before the instructor
// confirms it. An announcement reaches every student email on the course
// tile whether it is posted straight to Canvas (Send) or routed through
// Outlook (Send by email) - messaging-outlook.ts's BCC list is not a special
// case, it is the same "whole class" blast radius the Canvas announcement
// itself has. A reply/message reaches exactly the one named recipient
// already carried on the draft.

export interface CourseRecipientInfo {
  name: string;
  /** Count of student rows on the course tile with a usable (non-blank)
   *  email address - exactly the set src/app/actions/messaging-outlook.ts's
   *  sendMessageDraftByEmailAction BCCs for an announcement, and the set a
   *  Canvas announcement reaches independent of email. */
  emailCount: number;
}

/** Build a hubCourseId -> {name, emailCount} lookup from the courses already
 *  loaded for this tab. Pure so the lookup itself, and everything built on
 *  it below, is testable with frozen literals rather than a live course
 *  list or a server round-trip. */
export function buildCourseRecipientIndex(
  courses: ReadonlyArray<{ id: string; name: string; studentRepos: ReadonlyArray<{ email?: string | null }> }>
): Map<string, CourseRecipientInfo> {
  const index = new Map<string, CourseRecipientInfo>();
  for (const course of courses) {
    const emailCount = course.studentRepos.filter(
      (s) => typeof s.email === "string" && s.email.trim().length > 0
    ).length;
    index.set(course.id, { name: course.name, emailCount });
  }
  return index;
}

export interface RecipientSummary {
  /** Human-readable description of who a send reaches, e.g.
   *  "34 students in CS-210" or "Jordan Lee". Never empty - a draft this
   *  cannot describe still gets a legible fallback rather than silence. */
  text: string;
  /** Individual recipient count, when known. Null for a reply/message (a
   *  single named recipient - a count adds nothing) and for an announcement
   *  whose course cannot be resolved (unknown/deleted course - count is
   *  unavailable, and must never be guessed as 0 or 1). */
  count: number | null;
}

/**
 * Describe who a message draft's send reaches (B1). Shared by BOTH the
 * Send-to-Canvas and Send-by-email confirmations, and by the card's meta
 * line - an announcement reaches the whole class either way, so naming the
 * course and count is not an email-only concern.
 */
export function describeMessageDraftRecipients(
  payload: MessageDraftPayload,
  courseIndex: ReadonlyMap<string, CourseRecipientInfo>
): RecipientSummary {
  if (payload.kind === "reply") {
    return { text: payload.recipientName ? payload.recipientName : "the original sender", count: 1 };
  }
  if (payload.kind === "message") {
    const who = payload.recipientName || payload.recipientEmail || "this student";
    return { text: who, count: 1 };
  }
  // announcement
  if (!payload.hubCourseId) {
    return { text: "no course selected - recipients unknown", count: null };
  }
  const course = courseIndex.get(payload.hubCourseId);
  if (!course) {
    return { text: "an unrecognized course - recipients unknown", count: null };
  }
  return {
    text: `${course.emailCount} student${course.emailCount === 1 ? "" : "s"} in ${course.name}`,
    count: course.emailCount,
  };
}

// ── Subject (B3) ─────────────────────────────────────────────────────────
// The one line every email send puts first in a student's inbox, and the
// Subject an instructor must be able to see and edit for EVERY draft kind,
// not just announcements. Mirrors the exact fallback
// src/app/actions/messaging-outlook.ts already applies server-side
// (payload.title || draft.summary) so the field the instructor edits and
// the subject a student actually receives are never two different strings
// computed two different ways.

export function resolveMessageDraftSubject(payload: Pick<MessageDraftPayload, "title">, summary: string): string {
  return payload.title && payload.title.trim() ? payload.title : summary;
}

// ── Arming signature (B2) ─────────────────────────────────────────────────
// One send/delete action, on one draft, in its currently-saved content -
// see content-tab/modules/confirmArming.ts's module comment for why
// recording WHAT a confirmation was armed for (rather than clearing a bare
// flag from every possible reset path) makes a stale arm impossible by
// construction. A reload that fetches a changed payload, arming a
// different draft's (or a different action's) button, or an edit to the
// body/subject all naturally produce a different signature - there is
// nothing to remember to reset.
//
// Deliberately NOT built on confirmArming.ts's own selectionSignature: that
// helper sorts its inputs because it signs an unordered Set (order must not
// matter there). Here the four inputs are a fixed-position tuple - id,
// action, body, title - where POSITION carries meaning, so sorting them
// would risk two different tuples colliding on the same joined string.
// JSON.stringify preserves position and is exact, so it is used directly;
// confirmArming.ts's isConfirmArmed (a plain value comparison) is reused
// as-is to compare a signature against the currently-armed one.

export type MessageDraftAction = "post" | "email" | "delete";

export function messageDraftArmSignature(draft: MessageDraft, action: MessageDraftAction): string {
  return JSON.stringify([draft.id, action, draft.payload.body, draft.payload.title ?? ""]);
}
