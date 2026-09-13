import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Same vi.mock("@/lib/supabase/server", ...) pattern as
// src/app/api/automations/run-now/route.test.ts:7 - proving, against round
// 3's false claim, that this route CAN be exercised in a node-env test.
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ __fake: "supabase" })),
}));

vi.mock("@/lib/orphan-upload-sweep", async () => {
  const actual = await vi.importActual<typeof import("@/lib/orphan-upload-sweep")>(
    "@/lib/orphan-upload-sweep"
  );
  return {
    ...actual,
    sweepOrphanUploads: vi.fn(),
  };
});

import { createServiceClient } from "@/lib/supabase/server";
import { sweepOrphanUploads, SWEEP_SOFT_DEADLINE_MS, ORPHAN_SWEEP_THRESHOLD_MS } from "@/lib/orphan-upload-sweep";
import { GET, makeOrphanSweepLister, makeOrphanSweepRemover } from "./route";
import type { NextRequest } from "next/server";

const CRON_SECRET = "test-secret";
const PINNED_NOW = new Date("2026-09-13T12:00:00.000Z");

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

function emptySweepResult() {
  return {
    totalUserPrefixes: 0,
    scannedUserPrefixes: 0,
    deleted: [],
    failed: [],
    skippedNotOldEnough: 0,
    skippedUnknownAge: 0,
    truncatedByBudget: false,
    listingErrors: 0,
    matchedByLeafName: 0,
    matchedByFullPath: 0,
  };
}

describe("GET /api/cron/sweep-orphan-uploads", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(PINNED_NOW);
    process.env.CRON_SECRET = CRON_SECRET;
    vi.mocked(sweepOrphanUploads).mockResolvedValue(emptySweepResult());
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    vi.useRealTimers();
  });

  it("returns 500 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    expect(sweepOrphanUploads).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer token does not match", async () => {
    const res = await GET(makeReq({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(sweepOrphanUploads).not.toHaveBeenCalled();
  });

  it("returns 401 when no authorization header is present", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("computes softDeadlineAt as an ABSOLUTE instant - pinnedNow + SWEEP_SOFT_DEADLINE_MS, never the bare duration", async () => {
    await GET(makeReq({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(sweepOrphanUploads).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sweepOrphanUploads).mock.calls[0];
    const options = call[4];
    expect(options.softDeadlineAt).toBeInstanceOf(Date);
    expect(options.softDeadlineAt.getTime()).toBe(PINNED_NOW.getTime() + SWEEP_SOFT_DEADLINE_MS);
  });

  it("passes the production ORPHAN_SWEEP_THRESHOLD_MS as thresholdMs", async () => {
    await GET(makeReq({ authorization: `Bearer ${CRON_SECRET}` }));
    const options = vi.mocked(sweepOrphanUploads).mock.calls[0][4];
    expect(options.thresholdMs).toBe(ORPHAN_SWEEP_THRESHOLD_MS);
  });

  it("calls createServiceClient - the service-role client, not the anon+cookie one", async () => {
    await GET(makeReq({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(createServiceClient).toHaveBeenCalledTimes(1);
  });

  it("returns the counts-only JSON body shape - no paths anywhere", async () => {
    vi.mocked(sweepOrphanUploads).mockResolvedValue({
      totalUserPrefixes: 5,
      scannedUserPrefixes: 2,
      deleted: [{ userId: "u1", segment: "rubric-uploads", uploadId: "a.pdf" }],
      failed: [{ userId: "u2", segment: "syllabus-uploads", uploadId: "b.docx", error: "Not confirmed removed (error)" }],
      skippedNotOldEnough: 3,
      skippedUnknownAge: 1,
      truncatedByBudget: false,
      listingErrors: 0,
      matchedByLeafName: 1,
      matchedByFullPath: 0,
    });
    const res = await GET(makeReq({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      totalUserPrefixes: 5,
      scannedUserPrefixes: 2,
      deletedCount: 1,
      failedCount: 1,
      skippedNotOldEnoughCount: 3,
      skippedUnknownAgeCount: 1,
      truncatedByBudget: false,
      listingErrors: 0,
      matchedByLeafName: 1,
      matchedByFullPath: 0,
    });
    expect(JSON.stringify(body)).not.toContain("u1/");
    expect(JSON.stringify(body)).not.toContain("u2/");
  });

  it("RULING A: surfaces matchedByLeafName and matchedByFullPath from the sweep result verbatim", async () => {
    vi.mocked(sweepOrphanUploads).mockResolvedValue({
      ...emptySweepResult(),
      deleted: [
        { userId: "u1", segment: "rubric-uploads", uploadId: "a.pdf" },
        { userId: "u1", segment: "syllabus-uploads", uploadId: "b.docx" },
      ],
      matchedByLeafName: 1,
      matchedByFullPath: 1,
    });
    const res = await GET(makeReq({ authorization: `Bearer ${CRON_SECRET}` }));
    const body = await res.json();
    expect(body.matchedByLeafName).toBe(1);
    expect(body.matchedByFullPath).toBe(1);
  });

  it("MJ-2: surfaces listingErrors from the sweep result verbatim", async () => {
    vi.mocked(sweepOrphanUploads).mockResolvedValue({
      ...emptySweepResult(),
      truncatedByBudget: true,
      listingErrors: 2,
    });
    const res = await GET(makeReq({ authorization: `Bearer ${CRON_SECRET}` }));
    const body = await res.json();
    expect(body.listingErrors).toBe(2);
  });

  it("reports totalUserPrefixes: null distinctly from 0 when phase 1 was truncated", async () => {
    vi.mocked(sweepOrphanUploads).mockResolvedValue({
      ...emptySweepResult(),
      totalUserPrefixes: null,
      truncatedByBudget: true,
    });
    const res = await GET(makeReq({ authorization: `Bearer ${CRON_SECRET}` }));
    const body = await res.json();
    expect(body.totalUserPrefixes).toBeNull();
    expect(body.truncatedByBudget).toBe(true);
  });

  it("RULING 1: a nonzero failedCount does not change the HTTP status - the sweep's exit code is not gated on it in this deployment", async () => {
    vi.mocked(sweepOrphanUploads).mockResolvedValue({
      ...emptySweepResult(),
      failed: [{ userId: "u1", segment: "rubric-uploads", uploadId: "a.pdf", error: "boom" }],
    });
    const res = await GET(makeReq({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// MJ-4: makeOrphanSweepLister / makeOrphanSweepRemover are the only place
// Supabase Storage SDK results become the sweep's own shapes, and the
// wholesale sweepOrphanUploads mock above means neither adapter is ever
// actually called by the tests up there. These fakes mirror
// src/lib/supabase/storage.test.ts's own fakeSupabaseWithList /
// fakeSupabaseWithRemove shape rather than importing them (no cross-test-
// file imports - duplicating a tiny fake is cheap and each file stays
// independently readable).
// ---------------------------------------------------------------------------
function fakeSupabaseWithList(listResult: {
  data: { name: string; updated_at: string | null }[] | null;
  error: { message: string } | null;
}) {
  return {
    storage: {
      from: () => ({
        list: async () => listResult,
      }),
    },
  } as unknown as Parameters<typeof makeOrphanSweepLister>[0];
}

function fakeSupabaseWithRemove(removeResult: {
  data: { name: string }[] | null;
  error: { message: string } | null;
}) {
  return {
    storage: {
      from: () => ({
        remove: async () => removeResult,
      }),
    },
  } as unknown as Parameters<typeof makeOrphanSweepRemover>[0];
}

describe("makeOrphanSweepLister: the adapter from the SDK's list() result to OrphanSweepLister", () => {
  it("maps a successful list() into {entries, error: null}, entries carrying {name, updatedAt}", async () => {
    const supabase = fakeSupabaseWithList({
      data: [{ name: "abc123.docx", updated_at: "2026-09-01T00:00:00.000Z" }],
      error: null,
    });
    const lister = makeOrphanSweepLister(supabase);
    const page = await lister.listPage("u1/rubric-uploads", { limit: 100, offset: 0 });
    expect(page).toEqual({
      entries: [{ name: "abc123.docx", updatedAt: "2026-09-01T00:00:00.000Z" }],
      error: null,
    });
  });

  it("surfaces a listing error as entries: [] with the SDK's error message - never throws", async () => {
    const supabase = fakeSupabaseWithList({ data: null, error: { message: "boom" } });
    const lister = makeOrphanSweepLister(supabase);
    const page = await lister.listPage("u1/rubric-uploads", { limit: 100, offset: 0 });
    expect(page).toEqual({ entries: [], error: "boom" });
  });
});

describe("makeOrphanSweepRemover: the line deciding whether removedNames holds leaf names or full paths", () => {
  it("forwards the SDK's remove().data[].name entries as removedNames, UNMODIFIED - this adapter does not itself decide leaf-name vs full-path; the live SDK response does (see Ruling 1)", async () => {
    const supabase = fakeSupabaseWithRemove({ data: [{ name: "u1/rubric-uploads/a.pdf" }], error: null });
    const remover = makeOrphanSweepRemover(supabase);
    const result = await remover.remove(["u1/rubric-uploads/a.pdf"]);
    expect(result).toEqual({ removedNames: ["u1/rubric-uploads/a.pdf"], error: null });
  });

  it("also forwards a bare leaf name unmodified, the other candidate shape for the same field", async () => {
    const supabase = fakeSupabaseWithRemove({ data: [{ name: "a.pdf" }], error: null });
    const remover = makeOrphanSweepRemover(supabase);
    const result = await remover.remove(["u1/rubric-uploads/a.pdf"]);
    expect(result).toEqual({ removedNames: ["a.pdf"], error: null });
  });

  it("surfaces a removal error as an empty removedNames array with the SDK's error message", async () => {
    const supabase = fakeSupabaseWithRemove({ data: null, error: { message: "boom" } });
    const remover = makeOrphanSweepRemover(supabase);
    const result = await remover.remove(["u1/rubric-uploads/a.pdf"]);
    expect(result).toEqual({ removedNames: [], error: "boom" });
  });
});
