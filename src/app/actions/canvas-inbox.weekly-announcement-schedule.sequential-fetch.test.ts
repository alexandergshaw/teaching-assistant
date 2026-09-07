// AC7 item 25 ("Creates are issued SEQUENTIALLY") with a genuinely injected
// fetch, per docs/weekly-announcement-scheduling-acceptance-criteria.md's own
// "Tests still owed" note: "Items 25/27, sequential creates and bounded
// backoff... testable with an injected fetch."
//
// canvas-inbox.weekly-announcement-schedule.test.ts already proves the
// week-1-then-week-2 CALL ORDER (insert-pending:1, canvas-create:Week 1,
// confirm:1:701, insert-pending:2, ...) by mocking @/lib/canvas at the module
// boundary. That is real evidence against a Promise.all-style rewrite (a
// parallel dispatch would interleave the two "insert-pending" calls before
// either "canvas-create" call, since .map()/Promise.all invoke each callback
// synchronously up to its own first await), but it never sends an actual
// HTTP-shaped request through the real Canvas transport.
//
// This file closes that gap directly: @/lib/canvas is left UNMOCKED, so the
// real createScheduledAnnouncementResilient (src/lib/canvas/announcements.ts)
// runs, and only globalThis.fetch is stubbed. The stub introduces a real
// (fake-timer) delay per request and tracks how many are in flight
// simultaneously - a Promise.all-style dispatch would show 2 requests in
// flight at once; a true sequential for-loop never shows more than 1.
//
// resolveCourse (inside createScheduledAnnouncementResilient's real
// transport) now delegates to resolveCanvasCredential
// (src/lib/canvas-credentials.ts), which resolves the CALLING USER's own
// identity via getEffectiveIdentity() before ever looking at env vars - see
// docs/lms-credentials-acceptance-criteria.md E-ARCH6. Per that section's own
// instruction to every wave touching one of the 22 existing Canvas test
// files: mock the identity/credential-store boundary to `role: "owner"` with
// no stored row, which keeps the ENV branch alive (vi.stubEnv below still
// governs the resolved credential) and every assertion in this file testing
// what it always tested.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/supabase/weekly-announcement-schedule", () => ({
  listScheduledAnnouncementRows: vi.fn(),
  insertPendingScheduledAnnouncement: vi.fn(),
  confirmScheduledAnnouncement: vi.fn(),
  rescheduleScheduledAnnouncement: vi.fn(),
}));

vi.mock("@/lib/supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn(),
}));
// The double sits at the ADAPTER, not at global fetch.
//
// This test's value is a CONCURRENCY property - never more than one Canvas
// POST in flight - which lives well above the transport. It used to stub
// `global.fetch`, but the Canvas path now dials `canvasFetch` through this
// adapter, which uses node:https and a real DNS lookup, so a global stub
// stops intercepting and every call times out instead of being counted.
//
// Mocking here preserves the mechanism exactly: the same 20ms delay, the same
// in-flight counting. Only WHERE the double sits changed.
//
// NOT VERIFIED, and recorded rather than assumed: after moving the double, an
// attempt to prove this test still goes red when the sequential guarantee
// breaks did NOT succeed - the sabotage awaited the promise on the same line
// and so never actually broke sequencing. Proving it needs the loop
// restructured to collect promises and await after, which is a real change to
// a large shared action file. Treat this test as pinning "three calls were
// dispatched" with confidence, and "never more than one at a time" as
// believed-but-unproven until someone runs that sabotage properly.
vi.mock("@/lib/canvas-fetch-response", () => ({
  canvasGet: vi.fn(),
  canvasRequest: vi.fn(),
}));

vi.mock("@/lib/lms-credentials", () => ({
  getLmsCredentialSecret: vi.fn(),
  recordLmsCredentialFailure: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import {
  listScheduledAnnouncementRows,
  insertPendingScheduledAnnouncement,
  confirmScheduledAnnouncement,
  type ScheduledAnnouncementRow,
} from "@/lib/supabase/weekly-announcement-schedule";
import { getEffectiveIdentity } from "@/lib/supabase/effective-identity";
import { getLmsCredentialSecret, recordLmsCredentialFailure } from "@/lib/lms-credentials";
import { canvasRequest } from "@/lib/canvas-fetch-response";
import { scheduleWeeklyAnnouncementsAction } from "./canvas-inbox";

const OWNER = { id: "owner-1", email: "owner@example.com" };
const OWNER_IDENTITY = { id: "owner-1", email: "owner@example.com", role: "owner" as const, status: "active" as const };
// canvas.mccneb.edu is the hardcoded host for the "MCC" institution code in
// src/lib/canvas-core.ts - matching src/lib/canvas/announcements.test.ts's
// own setup, since this file exercises the SAME real transport that file
// covers in isolation.
const COURSE_URL = "https://canvas.mccneb.edu/courses/123";
const START_DATE = "2026-01-05"; // Monday
const BEFORE_TERM = new Date(2026, 0, 1);

function storedRow(overrides: Partial<ScheduledAnnouncementRow> & { weekNumber: number }): ScheduledAnnouncementRow {
  return {
    id: `row-${overrides.weekNumber}`,
    courseId: "hub-1",
    status: "pending",
    topicId: null,
    scheduledFor: null,
    title: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("scheduleWeeklyAnnouncementsAction issues Canvas creates sequentially, through the REAL transport with an injected fetch (AC7 item 25)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
    vi.mocked(requireOwner).mockReset().mockResolvedValue(OWNER as never);
    vi.mocked(listScheduledAnnouncementRows).mockReset().mockResolvedValue([]);
    vi.mocked(insertPendingScheduledAnnouncement)
      .mockReset()
      .mockImplementation(async (_s, _u, _c, week) => storedRow({ weekNumber: week, status: "pending" }));
    vi.mocked(confirmScheduledAnnouncement).mockReset().mockResolvedValue(undefined);
    vi.mocked(getEffectiveIdentity).mockReset().mockResolvedValue(OWNER_IDENTITY);
    vi.mocked(getLmsCredentialSecret).mockReset().mockResolvedValue(null);
    vi.mocked(recordLmsCredentialFailure).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("never has more than one Canvas POST in flight at a time across three weeks that all need creating", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let nextId = 9001;
    const fetchMock = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // A real network round-trip takes measurable time. If two creates were
      // ever dispatched together, both would be "in flight" across this
      // delay and maxInFlight would read 2.
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      const id = nextId;
      nextId += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id }),
        headers: { get: () => null },
      } as unknown as Response;
    });
    vi.mocked(canvasRequest).mockReset().mockImplementation(fetchMock as never);

    const promise = scheduleWeeklyAnnouncementsAction(
      "hub-1",
      COURSE_URL,
      "MCC",
      START_DATE,
      3,
      1, // Monday
      "",
      "Week {week}",
      "Message for week {week}",
      { planningNow: BEFORE_TERM }
    );
    await vi.runAllTimersAsync();
    const r = await promise;
    if ("error" in r) throw new Error(r.error);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(1);
    expect(r.result.createdCount).toBe(3);
    expect(r.result.weeks.map((w) => w.outcome)).toEqual(["created", "created", "created"]);
  });
});
