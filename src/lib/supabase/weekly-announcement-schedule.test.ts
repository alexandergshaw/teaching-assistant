// Mirrors src/lib/supabase/course-tasks.test.ts's own scope: the row ->
// record mapper is the one pure, synchronous piece of this module worth
// unit-testing directly (the async query functions need a live or
// hand-rolled fake Supabase client - exercised end-to-end instead through
// src/app/actions/canvas-inbox.weekly-announcement-schedule.test.ts, which
// mocks this whole module at the boundary the server action calls it
// through).
import { describe, it, expect } from "vitest";
import { mapScheduledAnnouncementRow } from "./weekly-announcement-schedule";
import type { Database } from "./types";

type Row = Database["public"]["Tables"]["weekly_announcement_schedule"]["Row"];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "row-1",
    user_id: "user-1",
    course_id: "course-1",
    week_number: 3,
    status: "pending",
    topic_id: null,
    scheduled_for: null,
    title: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("mapScheduledAnnouncementRow", () => {
  it("maps every column to its camelCase field", () => {
    const mapped = mapScheduledAnnouncementRow(
      row({ status: "confirmed", topic_id: 42, scheduled_for: "2026-01-19T08:00:00.000Z" })
    );
    expect(mapped).toEqual({
      id: "row-1",
      courseId: "course-1",
      weekNumber: 3,
      status: "confirmed",
      topicId: 42,
      scheduledFor: "2026-01-19T08:00:00.000Z",
      title: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("treats any status other than the literal 'confirmed' as pending, rather than propagating a corrupt value", () => {
    expect(mapScheduledAnnouncementRow(row({ status: "pending" })).status).toBe("pending");
    expect(mapScheduledAnnouncementRow(row({ status: "something-unexpected" })).status).toBe("pending");
  });

  it("carries a null topic id and null scheduled_for through unchanged", () => {
    const mapped = mapScheduledAnnouncementRow(row({ topic_id: null, scheduled_for: null }));
    expect(mapped.topicId).toBeNull();
    expect(mapped.scheduledFor).toBeNull();
  });
});
