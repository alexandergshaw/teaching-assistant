import { describe, it, expect } from "vitest";
import type { MessageDraft, MessageDraftPayload } from "@/lib/message-drafts";
import {
  buildCourseRecipientIndex,
  describeMessageDraftRecipients,
  resolveMessageDraftSubject,
  messageDraftArmSignature,
} from "./message-drafts-helpers";

function payload(overrides: Partial<MessageDraftPayload> = {}): MessageDraftPayload {
  return { kind: "reply", body: "Body text.", ...overrides };
}

function draft(overrides: Partial<MessageDraft> = {}): MessageDraft {
  return {
    id: "draft-1",
    userId: "user-1",
    status: "pending",
    summary: "Drafted reply",
    payload: payload(),
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

// ── buildCourseRecipientIndex / describeMessageDraftRecipients (B1) ────────

describe("buildCourseRecipientIndex", () => {
  it("counts only student rows with a non-blank email", () => {
    const index = buildCourseRecipientIndex([
      {
        id: "c1",
        name: "CS-210",
        studentRepos: [
          { email: "a@example.edu" },
          { email: "b@example.edu" },
          { email: "" },
          { email: "   " },
          { email: null },
          { email: undefined },
        ],
      },
    ]);
    expect(index.get("c1")).toEqual({ name: "CS-210", emailCount: 2 });
  });

  it("indexes every course by id, independently", () => {
    const index = buildCourseRecipientIndex([
      { id: "c1", name: "CS-210", studentRepos: [{ email: "a@example.edu" }] },
      { id: "c2", name: "MATH-101", studentRepos: [] },
    ]);
    expect(index.size).toBe(2);
    expect(index.get("c1")?.emailCount).toBe(1);
    expect(index.get("c2")?.emailCount).toBe(0);
  });
});

describe("describeMessageDraftRecipients", () => {
  const courseIndex = buildCourseRecipientIndex([
    { id: "course-cs210", name: "CS-210", studentRepos: Array.from({ length: 34 }, () => ({ email: "s@example.edu" })) },
  ]);

  it("names the exact course and student-email count for an announcement (B1's headline example)", () => {
    const result = describeMessageDraftRecipients(
      payload({ kind: "announcement", hubCourseId: "course-cs210", title: "Midterm reminder" }),
      courseIndex
    );
    expect(result).toEqual({ text: "34 students in CS-210", count: 34 });
  });

  it("uses singular phrasing for exactly one recipient", () => {
    const single = buildCourseRecipientIndex([{ id: "c1", name: "Seminar", studentRepos: [{ email: "only@example.edu" }] }]);
    const result = describeMessageDraftRecipients(payload({ kind: "announcement", hubCourseId: "c1" }), single);
    expect(result.text).toBe("1 student in Seminar");
  });

  it("never guesses a count for an announcement whose course is not in the index", () => {
    const result = describeMessageDraftRecipients(payload({ kind: "announcement", hubCourseId: "gone" }), courseIndex);
    expect(result.count).toBeNull();
    expect(result.text).toContain("unrecognized course");
  });

  it("never guesses a count for an announcement with no course selected at all", () => {
    const result = describeMessageDraftRecipients(payload({ kind: "announcement" }), courseIndex);
    expect(result.count).toBeNull();
    expect(result.text).toContain("no course selected");
  });

  it("describes a reply as the one named recipient", () => {
    const result = describeMessageDraftRecipients(payload({ kind: "reply", recipientName: "Jordan Lee" }), courseIndex);
    expect(result).toEqual({ text: "Jordan Lee", count: 1 });
  });

  it("describes a message by name, falling back to email, falling back to a generic label", () => {
    expect(describeMessageDraftRecipients(payload({ kind: "message", recipientName: "Ravi" }), courseIndex).text).toBe("Ravi");
    expect(
      describeMessageDraftRecipients(payload({ kind: "message", recipientEmail: "ravi@example.edu" }), courseIndex).text
    ).toBe("ravi@example.edu");
    expect(describeMessageDraftRecipients(payload({ kind: "message" }), courseIndex).text).toBe("this student");
  });
});

// ── resolveMessageDraftSubject (B3) ─────────────────────────────────────────

describe("resolveMessageDraftSubject", () => {
  it("uses the instructor-set title when present", () => {
    expect(resolveMessageDraftSubject({ title: "Office hours moved" }, "Reply about office hours")).toBe(
      "Office hours moved"
    );
  });

  it("falls back to the AI summary when there is no title", () => {
    expect(resolveMessageDraftSubject({}, "Reply about office hours")).toBe("Reply about office hours");
  });

  it("falls back to the summary for a whitespace-only title, matching messaging-outlook.ts's own falsy check", () => {
    expect(resolveMessageDraftSubject({ title: "   " }, "Reply about office hours")).toBe("Reply about office hours");
  });

  it("this is the exact resolution messaging-outlook.ts applies server-side for reply/message subjects (pinning the shared fallback)", () => {
    // messaging-outlook.ts:154 - subject = payload.title || draft.summary;
    const d = draft({ summary: "AI summary of the thread", payload: payload({ kind: "message", title: "" }) });
    expect(resolveMessageDraftSubject(d.payload, d.summary)).toBe(d.payload.title || d.summary);
  });
});

// ── messageDraftArmSignature (B2) ───────────────────────────────────────────

describe("messageDraftArmSignature", () => {
  it("differs for two different actions on the exact same draft", () => {
    const d = draft();
    expect(messageDraftArmSignature(d, "post")).not.toBe(messageDraftArmSignature(d, "email"));
    expect(messageDraftArmSignature(d, "post")).not.toBe(messageDraftArmSignature(d, "delete"));
    expect(messageDraftArmSignature(d, "email")).not.toBe(messageDraftArmSignature(d, "delete"));
  });

  it("differs for the same action on two different drafts", () => {
    const a = draft({ id: "draft-a" });
    const b = draft({ id: "draft-b" });
    expect(messageDraftArmSignature(a, "post")).not.toBe(messageDraftArmSignature(b, "post"));
  });

  it("changes when the body changes - an edit invalidates a stale arm by construction", () => {
    const before = draft({ payload: payload({ body: "Original body." }) });
    const after = draft({ payload: payload({ body: "Edited body." }) });
    expect(messageDraftArmSignature(before, "post")).not.toBe(messageDraftArmSignature(after, "post"));
  });

  it("changes when the subject/title changes", () => {
    const before = draft({ payload: payload({ title: "Old subject" }) });
    const after = draft({ payload: payload({ title: "New subject" }) });
    expect(messageDraftArmSignature(before, "email")).not.toBe(messageDraftArmSignature(after, "email"));
  });

  it("is stable (same signature) for the exact same draft/action pair - arming is a property of content, not a timer", () => {
    const d = draft();
    expect(messageDraftArmSignature(d, "post")).toBe(messageDraftArmSignature(d, "post"));
  });

  it("does not collide when id/action and body/title could otherwise transpose (position matters, unlike a sorted signature)", () => {
    const left = draft({ id: "post", payload: payload({ kind: "reply", body: "delete" }) });
    // If this were built by sorting ["post-draft-id","post","body","delete"]-shaped
    // tokens (the way confirmArming.ts's Set signature does), a tuple whose id
    // and action happen to look like each other's body/title could collide.
    // JSON.stringify keeps every field pinned to its own array slot instead.
    const right = draft({ id: "delete", payload: payload({ kind: "reply", body: "post" }) });
    expect(messageDraftArmSignature(left, "post")).not.toBe(messageDraftArmSignature(right, "post"));
  });
});
