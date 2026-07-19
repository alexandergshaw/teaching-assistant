import { describe, it, expect } from "vitest";
import { mapDraft, coerceMessageDraftPayload } from "./message-drafts";
import type { Database } from "./supabase/types";

type DraftRow = Database["public"]["Tables"]["message_drafts"]["Row"];

function makeRow(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: "m1",
    user_id: "u1",
    status: "pending",
    summary: "Reply to student message",
    payload: { kind: "reply", body: "Thanks for reaching out." } as unknown as DraftRow["payload"],
    created_at: "2026-07-13T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
    workflow_id: null,
    workflow_name: null,
    ...overrides,
  };
}

describe("mapDraft", () => {
  it("maps every scalar column", () => {
    const row = makeRow();
    const draft = mapDraft(row);
    expect(draft).toMatchObject({
      id: "m1",
      userId: "u1",
      status: "pending",
      summary: row.summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  it("coerces an unrecognized status to pending", () => {
    const row = makeRow({ status: "something-else" });
    expect(mapDraft(row).status).toBe("pending");
  });

  it("passes through a reviewed status", () => {
    const row = makeRow({ status: "reviewed" });
    expect(mapDraft(row).status).toBe("reviewed");
  });

  it("round-trips a reply payload", () => {
    const row = makeRow({
      payload: {
        kind: "reply",
        body: "Thanks for reaching out.",
        conversationId: "conv123",
        institution: "UT",
      } as unknown as DraftRow["payload"],
    });
    const draft = mapDraft(row);
    expect(draft.payload.kind).toBe("reply");
    expect(draft.payload.body).toBe("Thanks for reaching out.");
    expect(draft.payload.conversationId).toBe("conv123");
  });

  it("round-trips a message payload with recipient fields", () => {
    const row = makeRow({
      payload: {
        kind: "message",
        body: "You have missing work.",
        courseUrl: "https://canvas.example.com/courses/1",
        recipientUserId: "42",
        recipientName: "Jane Doe",
      } as unknown as DraftRow["payload"],
    });
    const draft = mapDraft(row);
    expect(draft.payload.kind).toBe("message");
    expect(draft.payload.body).toBe("You have missing work.");
    expect(draft.payload.recipientUserId).toBe("42");
    expect(draft.payload.recipientName).toBe("Jane Doe");
  });
});

describe("coerceMessageDraftPayload", () => {
  it("returns a reply with empty body for null/undefined/non-object input", () => {
    expect(coerceMessageDraftPayload(null)).toEqual({ kind: "reply", body: "" });
    expect(coerceMessageDraftPayload(undefined)).toEqual({ kind: "reply", body: "" });
    expect(coerceMessageDraftPayload("not an object")).toEqual({ kind: "reply", body: "" });
  });

  it("defaults to reply kind when kind is missing or unrecognized", () => {
    expect(coerceMessageDraftPayload({})).toMatchObject({ kind: "reply" });
    expect(coerceMessageDraftPayload({ kind: "unknown" })).toMatchObject({ kind: "reply" });
    expect(coerceMessageDraftPayload({ kind: "" })).toMatchObject({ kind: "reply" });
  });

  it("accepts kind 'announcement'", () => {
    expect(coerceMessageDraftPayload({ kind: "announcement", body: "Note to class" })).toMatchObject({
      kind: "announcement",
      body: "Note to class",
    });
  });

  it("accepts kind 'message'", () => {
    expect(coerceMessageDraftPayload({ kind: "message", body: "Missing work" })).toMatchObject({
      kind: "message",
      body: "Missing work",
    });
  });

  it("is case-insensitive for kind", () => {
    expect(coerceMessageDraftPayload({ kind: "ANNOUNCEMENT", body: "test" })).toMatchObject({ kind: "announcement" });
    expect(coerceMessageDraftPayload({ kind: "Message", body: "test" })).toMatchObject({ kind: "message" });
  });

  it("carries recipientUserId and recipientName for message kind", () => {
    const payload = coerceMessageDraftPayload({
      kind: "message",
      body: "You have missing work.",
      recipientUserId: "42",
      recipientName: "Jane Doe",
    });
    expect(payload.recipientUserId).toBe("42");
    expect(payload.recipientName).toBe("Jane Doe");
  });

  it("trims whitespace from recipient fields", () => {
    const payload = coerceMessageDraftPayload({
      kind: "message",
      body: "test",
      recipientUserId: "  42  ",
      recipientName: "  Jane Doe  ",
    });
    expect(payload.recipientUserId).toBe("42");
    expect(payload.recipientName).toBe("Jane Doe");
  });

  it("drops recipient fields when they are empty strings after trimming", () => {
    const payload = coerceMessageDraftPayload({
      kind: "message",
      body: "test",
      recipientUserId: "   ",
      recipientName: "   ",
    });
    expect(payload.recipientUserId).toBeUndefined();
    expect(payload.recipientName).toBeUndefined();
  });

  it("drops recipient fields when they are not strings", () => {
    const payload = coerceMessageDraftPayload({
      kind: "message",
      body: "test",
      recipientUserId: 42,
      recipientName: ["Jane", "Doe"],
    });
    expect(payload.recipientUserId).toBeUndefined();
    expect(payload.recipientName).toBeUndefined();
  });

  it("carries optional fields when present and valid", () => {
    const payload = coerceMessageDraftPayload({
      kind: "reply",
      body: "Thanks.",
      conversationId: "conv123",
      courseUrl: "https://canvas.example.com/courses/1",
      title: "Reply to Jane",
      institution: "UT",
      context: "Course context",
    });
    expect(payload.conversationId).toBe("conv123");
    expect(payload.courseUrl).toBe("https://canvas.example.com/courses/1");
    expect(payload.title).toBe("Reply to Jane");
    expect(payload.institution).toBe("UT");
    expect(payload.context).toBe("Course context");
  });

  it("drops optional fields when they are not strings", () => {
    const payload = coerceMessageDraftPayload({
      kind: "reply",
      body: "test",
      conversationId: 123,
      courseUrl: null,
    });
    expect(payload.conversationId).toBeUndefined();
    expect(payload.courseUrl).toBeUndefined();
  });

  it("carries recipientEmail and hubCourseId when present and valid", () => {
    const payload = coerceMessageDraftPayload({
      kind: "announcement",
      body: "Important announcement",
      recipientEmail: "student@example.com",
      hubCourseId: "course-123",
    });
    expect(payload.recipientEmail).toBe("student@example.com");
    expect(payload.hubCourseId).toBe("course-123");
  });

  it("trims whitespace from recipientEmail and hubCourseId", () => {
    const payload = coerceMessageDraftPayload({
      kind: "announcement",
      body: "test",
      recipientEmail: "  student@example.com  ",
      hubCourseId: "  course-123  ",
    });
    expect(payload.recipientEmail).toBe("student@example.com");
    expect(payload.hubCourseId).toBe("course-123");
  });

  it("drops recipientEmail and hubCourseId when they are empty strings after trimming", () => {
    const payload = coerceMessageDraftPayload({
      kind: "announcement",
      body: "test",
      recipientEmail: "   ",
      hubCourseId: "   ",
    });
    expect(payload.recipientEmail).toBeUndefined();
    expect(payload.hubCourseId).toBeUndefined();
  });

  it("drops recipientEmail and hubCourseId when they are not strings", () => {
    const payload = coerceMessageDraftPayload({
      kind: "announcement",
      body: "test",
      recipientEmail: 123,
      hubCourseId: ["course-123"],
    });
    expect(payload.recipientEmail).toBeUndefined();
    expect(payload.hubCourseId).toBeUndefined();
  });

  it("round-trips an announcement payload with recipientEmail and hubCourseId", () => {
    const row = {
      id: "m1",
      user_id: "u1",
      status: "pending" as const,
      summary: "Announcement for course",
      payload: {
        kind: "announcement",
        body: "Welcome to the course!",
        recipientEmail: "instructor@example.com",
        hubCourseId: "hub-course-abc",
      } as unknown as DraftRow["payload"],
      created_at: "2026-07-13T00:00:00.000Z",
      updated_at: "2026-07-13T00:00:00.000Z",
      workflow_id: null,
      workflow_name: null,
    };
    const draft = mapDraft(row);
    expect(draft.payload.kind).toBe("announcement");
    expect(draft.payload.recipientEmail).toBe("instructor@example.com");
    expect(draft.payload.hubCourseId).toBe("hub-course-abc");
  });
});
