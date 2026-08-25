import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  isReleaseDue,
  selectDueScheduledReleases,
  isClaimStale,
  decideReleaseRecovery,
  isUniqueViolationError,
  scheduleRelease,
  listDueScheduledReleases,
  listScheduledReleasesForUser,
  claimScheduledRelease,
  cancelScheduledRelease,
  markScheduledReleaseDone,
  markScheduledReleaseFailed,
  listStaleClaimedScheduledReleases,
  recoverStaleScheduledRelease,
  STALE_CLAIM_MS,
  MAX_RECOVERY_ATTEMPTS,
  RELEASE_DUE_BATCH_LIMIT,
  RELEASE_LIST_LIMIT,
  type ReleaseStatus,
  type ScheduledRelease,
} from "./scheduled-releases";
import type { SupabaseClient } from "@supabase/supabase-js";

// Fixed reference instant so every test pins `now` explicitly rather than
// reading the real clock, matching cron-heartbeat.test.ts's NOW idiom.
const NOW = new Date("2026-08-24T12:00:00.000Z");
const NOW_MS = NOW.getTime();

function msAgo(ms: number): string {
  return new Date(NOW_MS - ms).toISOString();
}

function msFromNow(ms: number): string {
  return new Date(NOW_MS + ms).toISOString();
}

// ---------------------------------------------------------------------------
// isReleaseDue - the boundary the whole cron sweep is built on.

describe("isReleaseDue", () => {
  it("a row due at EXACTLY now is due", () => {
    expect(isReleaseDue({ status: "pending", releaseAt: NOW.toISOString() }, NOW)).toBe(true);
  });

  it("a row due 1ms in the future is not yet due", () => {
    expect(isReleaseDue({ status: "pending", releaseAt: msFromNow(1) }, NOW)).toBe(false);
  });

  it("a row due 1ms in the past is due", () => {
    expect(isReleaseDue({ status: "pending", releaseAt: msAgo(1) }, NOW)).toBe(true);
  });

  it.each<ReleaseStatus>(["claimed", "done", "failed", "cancelled"])(
    "a %s row is never due, even with an overdue releaseAt",
    (status) => {
      expect(isReleaseDue({ status, releaseAt: msAgo(60_000) }, NOW)).toBe(false);
    }
  );

  // Dedicated, named test (rather than relying only on the it.each above) for
  // the one property this whole chunk exists to guarantee: a cancelled row
  // must never be selected as due. A new terminal status silently leaking
  // into the due query would publish something the instructor explicitly
  // called off - the worst outcome F11 can produce. Sabotage-checked by hand:
  // temporarily changing isReleaseDue's guard from `row.status !== "pending"`
  // to also accept "cancelled" reddens exactly this test, and restoring the
  // guard (diffed byte-for-byte against a pre-sabotage backup) turns it green
  // again with no other change to the file.
  it("SABOTAGE-CHECKED: a cancelled row is never due, even overdue", () => {
    expect(isReleaseDue({ status: "cancelled", releaseAt: msAgo(60_000) }, NOW)).toBe(false);
  });

  it("an unparseable releaseAt is not due", () => {
    expect(isReleaseDue({ status: "pending", releaseAt: "not-a-timestamp" }, NOW)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// selectDueScheduledReleases - sorting, limiting, and the property the whole
// one-row-per-target design exists to give: a partial run's untouched rows
// stay independently due, regardless of what happened to their siblings.

interface Row {
  id: string;
  status: ReleaseStatus;
  releaseAt: string;
}

describe("selectDueScheduledReleases", () => {
  it("returns only pending, overdue rows, soonest first", () => {
    const rows: Row[] = [
      { id: "future", status: "pending", releaseAt: msFromNow(60_000) },
      { id: "already-done", status: "done", releaseAt: msAgo(60_000) },
      { id: "second", status: "pending", releaseAt: msAgo(1_000) },
      { id: "first", status: "pending", releaseAt: msAgo(5_000) },
    ];
    const due = selectDueScheduledReleases(rows, NOW);
    expect(due.map((r) => r.id)).toEqual(["first", "second"]);
  });

  it("respects the limit", () => {
    const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`,
      status: "pending" as const,
      releaseAt: msAgo(1_000 + i),
    }));
    expect(selectDueScheduledReleases(rows, NOW, 2)).toHaveLength(2);
  });

  it("defaults the limit to RELEASE_DUE_BATCH_LIMIT", () => {
    const rows: Row[] = Array.from({ length: RELEASE_DUE_BATCH_LIMIT + 5 }, (_, i) => ({
      id: `r${i}`,
      status: "pending" as const,
      releaseAt: msAgo(1_000 + i),
    }));
    expect(selectDueScheduledReleases(rows, NOW)).toHaveLength(RELEASE_DUE_BATCH_LIMIT);
  });

  it("PARTIAL RUN INDEPENDENCE: after one target of a release is marked done and another is claimed, the remaining pending targets are still selected - unaffected by their siblings' state", () => {
    // Simulates "crashed after publishing 3 of 10": one release with ten
    // targets, all originally scheduled for the same instant.
    const allTen: Row[] = Array.from({ length: 10 }, (_, i) => ({
      id: `target-${i}`,
      status: "pending" as const,
      releaseAt: msAgo(1_000),
    }));

    // First sweep: everything is due.
    const firstPass = selectDueScheduledReleases(allTen, NOW);
    expect(firstPass).toHaveLength(10);

    // The runner processes three to completion and crashes mid-claim on a
    // fourth - simulate that by mutating ONLY those four rows' status, in a
    // fresh array (never touching the other six).
    const afterCrash: Row[] = allTen.map((row, i) => {
      if (i < 3) return { ...row, status: "done" };
      if (i === 3) return { ...row, status: "claimed" };
      return row; // rows 4-9: untouched, still "pending"
    });

    const secondPass = selectDueScheduledReleases(afterCrash, NOW);
    // The three done rows and the one claimed (in-flight) row are excluded;
    // the six untouched rows are still due, exactly as if nothing else in
    // the release had ever happened to them.
    expect(secondPass).toHaveLength(6);
    expect(secondPass.map((r) => r.id)).toEqual(["target-4", "target-5", "target-6", "target-7", "target-8", "target-9"]);
  });

  it("excludes a cancelled row even though it is overdue - cancelling a release must never leave it selectable", () => {
    const rows: Row[] = [
      { id: "cancelled-but-overdue", status: "cancelled", releaseAt: msAgo(60_000) },
      { id: "still-pending", status: "pending", releaseAt: msAgo(1_000) },
    ];
    expect(selectDueScheduledReleases(rows, NOW).map((r) => r.id)).toEqual(["still-pending"]);
  });
});

// ---------------------------------------------------------------------------
// isClaimStale - the exact boundary the stale sweep hinges on.

describe("isClaimStale", () => {
  it("a claim exactly STALE_CLAIM_MS old is NOT yet stale", () => {
    expect(isClaimStale({ status: "claimed", claimedAt: msAgo(STALE_CLAIM_MS) }, NOW)).toBe(false);
  });

  it("a claim STALE_CLAIM_MS + 1ms old IS stale", () => {
    expect(isClaimStale({ status: "claimed", claimedAt: msAgo(STALE_CLAIM_MS + 1) }, NOW)).toBe(true);
  });

  it("a claim STALE_CLAIM_MS - 1ms old is not stale", () => {
    expect(isClaimStale({ status: "claimed", claimedAt: msAgo(STALE_CLAIM_MS - 1) }, NOW)).toBe(false);
  });

  it.each<ReleaseStatus>(["pending", "done", "failed", "cancelled"])("a %s row is never stale, regardless of claimedAt", (status) => {
    expect(isClaimStale({ status, claimedAt: msAgo(STALE_CLAIM_MS * 10) }, NOW)).toBe(false);
  });

  // Named separately from the it.each above for the same reason as
  // isReleaseDue's sabotage-checked test: this is the property that keeps a
  // cancelled row from ever being swept as an abandoned claim (it cannot be
  // "claimed" and "cancelled" at once, but a regression that widened the
  // status guard could still let this slip through). Sabotage-checked the
  // same way: temporarily widening isClaimStale's `row.status !== "claimed"`
  // guard reddens exactly this test; restoring it (diffed against the
  // pre-sabotage backup) turns it green again with no other change.
  it("SABOTAGE-CHECKED: a cancelled row is never swept as a stale claim, even with a stale claimedAt", () => {
    expect(isClaimStale({ status: "cancelled", claimedAt: msAgo(STALE_CLAIM_MS * 10) }, NOW)).toBe(false);
  });

  it("a claimed row with a null claimedAt is not stale (defensive - should not occur in practice)", () => {
    expect(isClaimStale({ status: "claimed", claimedAt: null }, NOW)).toBe(false);
  });

  it("respects a custom staleMs threshold", () => {
    expect(isClaimStale({ status: "claimed", claimedAt: msAgo(100) }, NOW, 50)).toBe(true);
    expect(isClaimStale({ status: "claimed", claimedAt: msAgo(40) }, NOW, 50)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// decideReleaseRecovery

describe("decideReleaseRecovery", () => {
  it("retries when recoveryAttempts is below the cap", () => {
    expect(MAX_RECOVERY_ATTEMPTS).toBe(1);
    const result = decideReleaseRecovery(0);
    expect(result.retry).toBe(true);
    expect(result.detail.toLowerCase()).toContain("interrupted");
  });

  it("stops retrying once recoveryAttempts has reached the cap", () => {
    const result = decideReleaseRecovery(MAX_RECOVERY_ATTEMPTS);
    expect(result.retry).toBe(false);
  });

  it("the retry and exhausted messages are worded differently, not just flagged differently", () => {
    const retrying = decideReleaseRecovery(0).detail;
    const exhausted = decideReleaseRecovery(MAX_RECOVERY_ATTEMPTS).detail;
    expect(retrying).not.toBe(exhausted);
  });
});

// ---------------------------------------------------------------------------
// isUniqueViolationError

describe("isUniqueViolationError", () => {
  it("true for SQLSTATE 23505", () => {
    expect(isUniqueViolationError({ code: "23505" })).toBe(true);
  });

  it("false for a different SQLSTATE", () => {
    expect(isUniqueViolationError({ code: "23503" })).toBe(false);
  });

  it("false for null, undefined, and non-object values", () => {
    expect(isUniqueViolationError(null)).toBe(false);
    expect(isUniqueViolationError(undefined)).toBe(false);
    expect(isUniqueViolationError("boom")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Thin-wrapper tests with a generic recording stub. A Postgrest query builder
// is thenable at every step (awaiting it at any point in the chain resolves
// the built query), so one small recording builder - rather than one bespoke
// stub per call shape, as in cron-heartbeat.test.ts - covers every function
// below: each `.eq()`/`.select()`/etc. call is recorded and returns the same
// builder, and awaiting it resolves with the result it was constructed with.

interface StubResult {
  data?: unknown;
  error?: unknown;
}

interface RecordedCall {
  method: string;
  args: unknown[];
}

class RecordingQueryBuilder {
  calls: RecordedCall[] = [];
  constructor(private readonly result: StubResult) {}
  private record(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }
  select(...args: unknown[]) {
    return this.record("select", args);
  }
  update(...args: unknown[]) {
    return this.record("update", args);
  }
  insert(...args: unknown[]) {
    return this.record("insert", args);
  }
  eq(...args: unknown[]) {
    return this.record("eq", args);
  }
  lt(...args: unknown[]) {
    return this.record("lt", args);
  }
  lte(...args: unknown[]) {
    return this.record("lte", args);
  }
  order(...args: unknown[]) {
    return this.record("order", args);
  }
  limit(...args: unknown[]) {
    return this.record("limit", args);
  }
  single() {
    return this.record("single", []);
  }
  maybeSingle() {
    return this.record("maybeSingle", []);
  }
  then(
    onResolve: (value: StubResult) => unknown,
    onReject?: (reason: unknown) => unknown
  ) {
    return Promise.resolve(this.result).then(onResolve, onReject);
  }
}

/** One stubbed client whose successive `.from(...)` calls return the given
 * results in order (repeating the last one if more calls happen than results
 * were provided). Each call gets its own builder, so `builders[i].calls`
 * shows exactly what the i-th statement sent. */
function createSequentialStub(results: StubResult[]) {
  const builders: RecordingQueryBuilder[] = [];
  const fromCalls: string[] = [];
  let i = 0;
  const client = {
    from(name: string) {
      fromCalls.push(name);
      const result = results[Math.min(i, results.length - 1)];
      i += 1;
      const builder = new RecordingQueryBuilder(result);
      builders.push(builder);
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as SupabaseClient;
  return { client, builders, fromCalls };
}

function createStub(result: StubResult) {
  return createSequentialStub([result]);
}

const SAMPLE_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  course_url: "https://canvas.example.edu/courses/123",
  course_acronym: "EX",
  target_kind: "module_item",
  target_id: 456,
  module_id: 789,
  release_at: "2026-08-25T09:00:00.000Z",
  was_published: true,
  status: "pending",
  claimed_at: null,
  recovery_attempts: 0,
  last_error: null,
  completed_at: null,
  created_at: "2026-08-24T10:00:00.000Z",
  updated_at: "2026-08-24T10:00:00.000Z",
};

describe("row mapping (via listDueScheduledReleases)", () => {
  it("maps every snake_case column onto the camelCase ScheduledRelease shape", async () => {
    const { client } = createStub({ data: [SAMPLE_ROW], error: null });
    const rows = await listDueScheduledReleases(client as SupabaseClient, NOW);
    expect(rows).toEqual<ScheduledRelease[]>([
      {
        id: SAMPLE_ROW.id,
        userId: SAMPLE_ROW.user_id,
        courseUrl: SAMPLE_ROW.course_url,
        courseAcronym: "EX",
        target: { kind: "module_item", id: 456, moduleId: 789 },
        releaseAt: SAMPLE_ROW.release_at,
        wasPublished: true,
        status: "pending",
        claimedAt: null,
        recoveryAttempts: 0,
        lastError: null,
        completedAt: null,
        createdAt: SAMPLE_ROW.created_at,
        updatedAt: SAMPLE_ROW.updated_at,
      },
    ]);
  });

  it("an unrecognized target_kind defensively maps to module_item, not a thrown error", async () => {
    const { client } = createStub({ data: [{ ...SAMPLE_ROW, target_kind: "something_new" }], error: null });
    const rows = await listDueScheduledReleases(client as SupabaseClient, NOW);
    expect(rows[0].target.kind).toBe("module_item");
  });

  it("target_kind 'module' maps through unchanged", async () => {
    const { client } = createStub({ data: [{ ...SAMPLE_ROW, target_kind: "module" }], error: null });
    const rows = await listDueScheduledReleases(client as SupabaseClient, NOW);
    expect(rows[0].target.kind).toBe("module");
  });

  it("an unrecognized status defensively maps to pending", async () => {
    const { client } = createStub({ data: [{ ...SAMPLE_ROW, status: "not-a-real-status" }], error: null });
    const rows = await listDueScheduledReleases(client as SupabaseClient, NOW);
    expect(rows[0].status).toBe("pending");
  });

  it("a null course_acronym maps to null", async () => {
    const { client } = createStub({ data: [{ ...SAMPLE_ROW, course_acronym: null }], error: null });
    const rows = await listDueScheduledReleases(client as SupabaseClient, NOW);
    expect(rows[0].courseAcronym).toBeNull();
  });

  // wasPublished round-tripping (F11.2). The NULL case is the load-bearing
  // one: a row written before this column existed must stay `null` all the
  // way through the mapper, never silently collapsing to `false` - a cancel
  // reading `false` would skip a restore that may in fact be owed.
  it("was_published: true maps to wasPublished: true", async () => {
    const { client } = createStub({ data: [{ ...SAMPLE_ROW, was_published: true }], error: null });
    const rows = await listDueScheduledReleases(client as SupabaseClient, NOW);
    expect(rows[0].wasPublished).toBe(true);
  });

  it("was_published: false maps to wasPublished: false", async () => {
    const { client } = createStub({ data: [{ ...SAMPLE_ROW, was_published: false }], error: null });
    const rows = await listDueScheduledReleases(client as SupabaseClient, NOW);
    expect(rows[0].wasPublished).toBe(false);
  });

  it("was_published: null (a row written before the column existed) stays null - NEVER becomes false", async () => {
    const { client } = createStub({ data: [{ ...SAMPLE_ROW, was_published: null }], error: null });
    const rows = await listDueScheduledReleases(client as SupabaseClient, NOW);
    expect(rows[0].wasPublished).toBeNull();
    expect(rows[0].wasPublished).not.toBe(false);
  });

  it("a missing was_published key (not just null) also stays null, not false", async () => {
    const row = { ...SAMPLE_ROW } as Record<string, unknown>;
    delete row.was_published;
    const { client } = createStub({ data: [row], error: null });
    const rows = await listDueScheduledReleases(client as SupabaseClient, NOW);
    expect(rows[0].wasPublished).toBeNull();
  });

  it("throws when the select reports an error", async () => {
    const { client } = createStub({ data: null, error: new Error("db down") });
    await expect(listDueScheduledReleases(client as SupabaseClient, NOW)).rejects.toThrow("db down");
  });
});

describe("listDueScheduledReleases - query shape", () => {
  it("filters status = pending, release_at <= now, orders soonest first, limits", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    await listDueScheduledReleases(client as SupabaseClient, NOW, 7);
    const calls = builders[0].calls;
    expect(calls).toContainEqual({ method: "eq", args: ["status", "pending"] });
    expect(calls).toContainEqual({ method: "lte", args: ["release_at", NOW.toISOString()] });
    expect(calls).toContainEqual({ method: "order", args: ["release_at", { ascending: true }] });
    expect(calls).toContainEqual({ method: "limit", args: [7] });
  });
});

describe("claimScheduledRelease", () => {
  it("returns true and sends the claim patch when the CAS finds a row", async () => {
    const { client, builders } = createStub({ data: [{ id: "r1" }], error: null });
    const ok = await claimScheduledRelease(client as SupabaseClient, { id: "r1", releaseAt: "2026-08-25T09:00:00.000Z" }, NOW);
    expect(ok).toBe(true);
    const updateCall = builders[0].calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({ status: "claimed", claimed_at: NOW.toISOString() });
    expect(builders[0].calls).toContainEqual({ method: "eq", args: ["id", "r1"] });
    expect(builders[0].calls).toContainEqual({ method: "eq", args: ["status", "pending"] });
    expect(builders[0].calls).toContainEqual({ method: "eq", args: ["release_at", "2026-08-25T09:00:00.000Z"] });
  });

  it("returns false (lost the CAS) when no row matches", async () => {
    const { client } = createStub({ data: [], error: null });
    const ok = await claimScheduledRelease(client as SupabaseClient, { id: "r1", releaseAt: "2026-08-25T09:00:00.000Z" }, NOW);
    expect(ok).toBe(false);
  });

  it("throws on a database error", async () => {
    const { client } = createStub({ data: null, error: new Error("conflict") });
    await expect(
      claimScheduledRelease(client as SupabaseClient, { id: "r1", releaseAt: "x" }, NOW)
    ).rejects.toThrow("conflict");
  });
});

describe("markScheduledReleaseDone", () => {
  it("sends status done, completed_at, and clears last_error, CAS'd on status=claimed", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    await markScheduledReleaseDone(client as SupabaseClient, "r1", NOW);
    const updateCall = builders[0].calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({
      status: "done",
      completed_at: NOW.toISOString(),
      last_error: null,
    });
    expect(builders[0].calls).toContainEqual({ method: "eq", args: ["id", "r1"] });
    expect(builders[0].calls).toContainEqual({ method: "eq", args: ["status", "claimed"] });
  });
});

describe("markScheduledReleaseFailed", () => {
  it("sends status failed with the detail", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    await markScheduledReleaseFailed(client as SupabaseClient, "r1", NOW, "Canvas refused the write");
    const updateCall = builders[0].calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({ status: "failed", last_error: "Canvas refused the write" });
  });

  it("caps the detail at 500 characters", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    await markScheduledReleaseFailed(client as SupabaseClient, "r1", NOW, "e".repeat(1000));
    const updateCall = builders[0].calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({ last_error: "e".repeat(500) });
  });
});

describe("listStaleClaimedScheduledReleases", () => {
  it("filters status = claimed, claimed_at < (now - STALE_CLAIM_MS)", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    await listStaleClaimedScheduledReleases(client as SupabaseClient, NOW);
    const cutoff = new Date(NOW_MS - STALE_CLAIM_MS).toISOString();
    expect(builders[0].calls).toContainEqual({ method: "eq", args: ["status", "claimed"] });
    expect(builders[0].calls).toContainEqual({ method: "lt", args: ["claimed_at", cutoff] });
  });
});

describe("recoverStaleScheduledRelease", () => {
  it("re-arms to pending, clears claimed_at, and increments recovery_attempts when under the cap", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    const result = await recoverStaleScheduledRelease(client as SupabaseClient, { id: "r1", recoveryAttempts: 0 }, NOW);
    expect(result.retried).toBe(true);
    const updateCall = builders[0].calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({
      status: "pending",
      claimed_at: null,
      recovery_attempts: 1,
    });
  });

  it("marks failed (no further retry) once recoveryAttempts is at the cap", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    const result = await recoverStaleScheduledRelease(
      client as SupabaseClient,
      { id: "r1", recoveryAttempts: MAX_RECOVERY_ATTEMPTS },
      NOW
    );
    expect(result.retried).toBe(false);
    const updateCall = builders[0].calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({ status: "failed" });
    expect(updateCall?.args[0]).not.toHaveProperty("recovery_attempts");
  });

  it("is CAS'd on status = claimed so a concurrently-completed row is left alone", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    await recoverStaleScheduledRelease(client as SupabaseClient, { id: "r1", recoveryAttempts: 0 }, NOW);
    expect(builders[0].calls).toContainEqual({ method: "eq", args: ["status", "claimed"] });
  });
});

describe("scheduleRelease", () => {
  const input = {
    courseUrl: "https://canvas.example.edu/courses/123",
    courseAcronym: "EX",
    target: { kind: "module_item" as const, id: 456 },
    releaseAt: "2026-08-25T09:00:00.000Z",
  };

  it("updates an existing pending row for the target rather than inserting a new one (AC5: replaced, not duplicated)", async () => {
    const { client, builders } = createStub({ data: [SAMPLE_ROW], error: null });
    const result = await scheduleRelease(client as SupabaseClient, "user-1", input);
    expect(result.id).toBe(SAMPLE_ROW.id);
    expect(builders).toHaveLength(1); // only the update statement ran - no insert
    expect(builders[0].calls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
    expect(builders[0].calls).toContainEqual({ method: "eq", args: ["target_kind", "module_item"] });
    expect(builders[0].calls).toContainEqual({ method: "eq", args: ["target_id", 456] });
    expect(builders[0].calls).toContainEqual({ method: "eq", args: ["status", "pending"] });
  });

  it("inserts a new row when no existing pending row matches", async () => {
    const { client, builders } = createSequentialStub([
      { data: [], error: null }, // update: no existing pending row
      { data: SAMPLE_ROW, error: null }, // insert: succeeds
    ]);
    const result = await scheduleRelease(client as SupabaseClient, "user-1", input);
    expect(result.id).toBe(SAMPLE_ROW.id);
    expect(builders).toHaveLength(2);
    const insertCall = builders[1].calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({
      user_id: "user-1",
      course_url: input.courseUrl,
      target_kind: "module_item",
      target_id: 456,
      status: "pending",
    });
  });

  it("on a lost race (unique violation on insert), retries the update and returns the winner's row", async () => {
    const { client, builders } = createSequentialStub([
      { data: [], error: null }, // 1st update: nothing yet
      { data: null, error: { code: "23505", message: "duplicate key" } }, // insert loses the race
      { data: [SAMPLE_ROW], error: null }, // 2nd update: finds the winner's row
    ]);
    const result = await scheduleRelease(client as SupabaseClient, "user-1", input);
    expect(result.id).toBe(SAMPLE_ROW.id);
    expect(builders).toHaveLength(3);
  });

  it("throws immediately on a non-unique-violation insert error", async () => {
    const { client } = createSequentialStub([
      { data: [], error: null },
      { data: null, error: { code: "23502", message: "not null violation" } },
    ]);
    await expect(scheduleRelease(client as SupabaseClient, "user-1", input)).rejects.toThrow("not null violation");
  });

  it("throws immediately when the update itself errors", async () => {
    const { client } = createStub({ data: null, error: new Error("connection reset") });
    await expect(scheduleRelease(client as SupabaseClient, "user-1", input)).rejects.toThrow("connection reset");
  });

  // F11.2: was_published is written in the SAME update/insert as everything
  // else - never a follow-up patch (entry 340 in docs/REGRESSION.md records
  // why: a failure on a second write would mark an already-written,
  // will-still-fire row "failed").
  it("writes was_published in the update payload when rescheduling an existing pending row", async () => {
    const { client, builders } = createStub({ data: [SAMPLE_ROW], error: null });
    await scheduleRelease(client as SupabaseClient, "user-1", { ...input, wasPublished: true });
    const updateCall = builders[0].calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({ was_published: true });
  });

  it("writes was_published in the insert payload for a brand-new target", async () => {
    const { client, builders } = createSequentialStub([
      { data: [], error: null },
      { data: SAMPLE_ROW, error: null },
    ]);
    await scheduleRelease(client as SupabaseClient, "user-1", { ...input, wasPublished: false });
    const insertCall = builders[1].calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ was_published: false });
  });

  it("defaults was_published to null, not false, when the caller omits it", async () => {
    const { client, builders } = createStub({ data: [SAMPLE_ROW], error: null });
    await scheduleRelease(client as SupabaseClient, "user-1", input);
    const updateCall = builders[0].calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({ was_published: null });
  });
});

describe("listScheduledReleasesForUser", () => {
  it("scopes to the user, orders by release_at ascending, and applies the default limit", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    await listScheduledReleasesForUser(client as SupabaseClient, "user-1");
    const calls = builders[0].calls;
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
    expect(calls).toContainEqual({ method: "order", args: ["release_at", { ascending: true }] });
    expect(calls).toContainEqual({ method: "limit", args: [RELEASE_LIST_LIMIT] });
  });

  it("does NOT filter by status - terminal rows (including cancelled) are included so 'what did I call off' stays answerable", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    await listScheduledReleasesForUser(client as SupabaseClient, "user-1");
    const statusFilter = builders[0].calls.find((c) => c.method === "eq" && c.args[0] === "status");
    expect(statusFilter).toBeUndefined();
  });

  it("maps a cancelled row through like any other status", async () => {
    const { client } = createStub({ data: [{ ...SAMPLE_ROW, status: "cancelled" }], error: null });
    const rows = await listScheduledReleasesForUser(client as SupabaseClient, "user-1");
    expect(rows[0].status).toBe("cancelled");
  });

  it("respects a custom limit", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    await listScheduledReleasesForUser(client as SupabaseClient, "user-1", 10);
    expect(builders[0].calls).toContainEqual({ method: "limit", args: [10] });
  });
});

describe("cancelScheduledRelease", () => {
  it("CAS success: transitions a pending row to cancelled and returns it", async () => {
    const cancelledRow = { ...SAMPLE_ROW, status: "cancelled" };
    const { client, builders } = createStub({ data: [cancelledRow], error: null });
    const result = await cancelScheduledRelease(client as SupabaseClient, "user-1", SAMPLE_ROW.id, NOW);
    expect(result.cancelled).toBe(true);
    expect(result.release?.status).toBe("cancelled");
    const updateCall = builders[0].calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({ status: "cancelled" });
    expect(builders[0].calls).toContainEqual({ method: "eq", args: ["id", SAMPLE_ROW.id] });
    expect(builders[0].calls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
    expect(builders[0].calls).toContainEqual({ method: "eq", args: ["status", "pending"] });
    // Only the update statement ran - the CAS succeeded on the first try, so
    // no follow-up read was needed.
    expect(builders).toHaveLength(1);
  });

  it("CAS failure: a row already claimed (running right now) refuses the cancel and says which", async () => {
    const claimedRow = { ...SAMPLE_ROW, status: "claimed" };
    const { client, builders } = createSequentialStub([
      { data: [], error: null }, // CAS: no pending row matched
      { data: claimedRow, error: null }, // re-read: it is claimed
    ]);
    const result = await cancelScheduledRelease(client as SupabaseClient, "user-1", SAMPLE_ROW.id, NOW);
    expect(result.cancelled).toBe(false);
    expect(result.release?.status).toBe("claimed");
    expect(builders).toHaveLength(2);
  });

  it("CAS failure: a row that already ran reports done, not a bare failure", async () => {
    const doneRow = { ...SAMPLE_ROW, status: "done" };
    const { client } = createSequentialStub([
      { data: [], error: null },
      { data: doneRow, error: null },
    ]);
    const result = await cancelScheduledRelease(client as SupabaseClient, "user-1", SAMPLE_ROW.id, NOW);
    expect(result.cancelled).toBe(false);
    expect(result.release?.status).toBe("done");
  });

  it("CAS failure: no row at all for this id/user - release is null, not thrown", async () => {
    const { client } = createSequentialStub([
      { data: [], error: null },
      { data: null, error: null },
    ]);
    const result = await cancelScheduledRelease(client as SupabaseClient, "user-1", "no-such-id", NOW);
    expect(result.cancelled).toBe(false);
    expect(result.release).toBeNull();
  });

  it("throws when the CAS update itself errors", async () => {
    const { client } = createStub({ data: null, error: new Error("db down") });
    await expect(cancelScheduledRelease(client as SupabaseClient, "user-1", SAMPLE_ROW.id, NOW)).rejects.toThrow(
      "db down"
    );
  });

  it("throws when the follow-up read errors", async () => {
    const { client } = createSequentialStub([
      { data: [], error: null },
      { data: null, error: new Error("read failed") },
    ]);
    await expect(cancelScheduledRelease(client as SupabaseClient, "user-1", SAMPLE_ROW.id, NOW)).rejects.toThrow(
      "read failed"
    );
  });
});

// ---------------------------------------------------------------------------
// Migration guard: every column the wrapper functions write must actually
// exist in the migration. Same technique as cron-heartbeat.test.ts's defect-3
// guard (entry 334 in docs/REGRESSION.md) - a mis-spelled column name is
// invisible to tsc/eslint/vitest/next build because the table handle is cast
// to `any`, so this guard reads the real migration file and checks the
// insert/update payloads against it directly.

const MIGRATION_PATH = join(process.cwd(), "supabase/migrations/20261008000000_scheduled_releases.sql");
const migrationSql = readFileSync(MIGRATION_PATH, "utf8");

// A table's columns are the UNION of every migration that touched it, not just
// its create-table. F10 added module_id in a SECOND migration (the target-set
// question entry 338 deliberately left open was still open when the first one
// was written), and reading only the create-table would have made this guard
// reject a column that genuinely exists - a false alarm is as corrosive to a
// guard's credibility as a miss, because the next person "fixes" it by
// deleting the assertion.
const ALTER_MIGRATION_PATH = join(
  process.cwd(),
  "supabase/migrations/20261009000000_scheduled_releases_module_id.sql"
);
const alterMigrationSql = readFileSync(ALTER_MIGRATION_PATH, "utf8");

// F11 (this chunk) added a THIRD migration touching this table -
// was_published, alongside the status CHECK constraint's drop/recreate (which
// adds no column, so it needs no extractor entry). Same reasoning as the
// module_id migration above: the union must include this file too, or this
// guard would reject a column that genuinely exists.
const CANCEL_MIGRATION_PATH = join(
  process.cwd(),
  "supabase/migrations/20261010000000_scheduled_releases_cancel.sql"
);
const cancelMigrationSql = readFileSync(CANCEL_MIGRATION_PATH, "utf8");

/** Columns introduced by `alter table ... add column [if not exists] <name>`. */
function extractAddedColumns(sql: string, tableName: string): string[] {
  // String.raw, not a plain template literal: in a template literal `\s` is
  // simply `s`, so the pattern silently became `alters+tables+...` and matched
  // nothing. The canary above is what caught that - a guard whose extractor
  // finds nothing passes every "is this key a real column" check vacuously.
  const pattern = new RegExp(
    String.raw`alter\s+table\s+(?:if\s+exists\s+)?public\.${tableName}\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)`,
    "gi"
  );
  const found: string[] = [];
  for (const match of sql.matchAll(pattern)) found.push(match[1]);
  return found;
}

/** Every column the table has after all its migrations have run. */
function allScheduledReleaseColumns(): string[] {
  return [
    ...extractCreateTableColumns(migrationSql, "scheduled_releases"),
    ...extractAddedColumns(alterMigrationSql, "scheduled_releases"),
    ...extractAddedColumns(cancelMigrationSql, "scheduled_releases"),
  ];
}

function extractCreateTableColumns(sql: string, tableName: string): string[] {
  const startMarker = `create table if not exists public.${tableName} (`;
  const start = sql.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`could not find "create table if not exists public.${tableName} (" in the migration`);
  }
  const bodyStart = start + startMarker.length;
  const end = sql.indexOf("\n);", bodyStart);
  if (end === -1) {
    throw new Error(`could not find the closing ");" for public.${tableName}`);
  }
  const body = sql.slice(bodyStart, end);
  const columns: string[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("--")) continue;
    const match = line.match(/^([a-z_][a-z0-9_]*)\b/);
    if (match) columns.push(match[1]);
  }
  return columns;
}

describe("extractCreateTableColumns matches the real scheduled_releases migration", () => {
  it("finds every documented column", () => {
    const columns = extractCreateTableColumns(migrationSql, "scheduled_releases");
    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "user_id",
        "course_url",
        "course_acronym",
        "target_kind",
        "target_id",
        "release_at",
        "status",
        "claimed_at",
        "recovery_attempts",
        "last_error",
        "completed_at",
        "created_at",
        "updated_at",
      ])
    );
  });
});

describe("extractAddedColumns finds the second migration's column", () => {
  // Canary: without this, an extractor that matched NOTHING would make the
  // union silently equal the create-table alone, and the guard below would
  // start rejecting module_id again - or, worse, a future added column would
  // go unguarded while the suite stayed green.
  it("finds module_id in the alter-table migration", () => {
    expect(extractAddedColumns(alterMigrationSql, "scheduled_releases")).toContain("module_id");
  });

  it("does not invent columns for a table the migration does not touch", () => {
    expect(extractAddedColumns(alterMigrationSql, "cron_heartbeat")).toEqual([]);
  });
});

describe("extractAddedColumns finds the third (F11 cancel) migration's column", () => {
  // Same canary as the module_id migration above, for the same reason: an
  // extractor that silently matched nothing here would make the union drop
  // back to the first two migrations, and was_published would start reading
  // as "not a real column" even though it genuinely is one.
  it("finds was_published in the cancel migration", () => {
    expect(extractAddedColumns(cancelMigrationSql, "scheduled_releases")).toContain("was_published");
  });

  it("does not invent columns for a table the cancel migration does not touch", () => {
    expect(extractAddedColumns(cancelMigrationSql, "cron_heartbeat")).toEqual([]);
  });
});

describe("every write payload key is a real migration column", () => {
  const columns = allScheduledReleaseColumns();

  function assertKeysAreColumns(payload: Record<string, unknown> | undefined) {
    expect(payload).toBeDefined();
    const missing = Object.keys(payload ?? {}).filter((key) => !columns.includes(key));
    expect(missing, `payload key(s) with no matching migration column: ${missing.join(", ")}`).toEqual([]);
  }

  it("scheduleRelease's update payload", async () => {
    const { client, builders } = createStub({ data: [SAMPLE_ROW], error: null });
    await scheduleRelease(
      client as SupabaseClient,
      "user-1",
      { courseUrl: "u", courseAcronym: null, target: { kind: "module", id: 1 }, releaseAt: "2026-08-25T09:00:00.000Z" }
    );
    assertKeysAreColumns(builders[0].calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>);
  });

  it("scheduleRelease's insert payload", async () => {
    const { client, builders } = createSequentialStub([
      { data: [], error: null },
      { data: SAMPLE_ROW, error: null },
    ]);
    await scheduleRelease(
      client as SupabaseClient,
      "user-1",
      { courseUrl: "u", courseAcronym: null, target: { kind: "module", id: 1 }, releaseAt: "2026-08-25T09:00:00.000Z" }
    );
    assertKeysAreColumns(builders[1].calls.find((c) => c.method === "insert")?.args[0] as Record<string, unknown>);
  });

  it("claimScheduledRelease's update payload", async () => {
    const { client, builders } = createStub({ data: [{ id: "r1" }], error: null });
    await claimScheduledRelease(client as SupabaseClient, { id: "r1", releaseAt: "x" }, NOW);
    assertKeysAreColumns(builders[0].calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>);
  });

  it("markScheduledReleaseDone's update payload", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    await markScheduledReleaseDone(client as SupabaseClient, "r1", NOW);
    assertKeysAreColumns(builders[0].calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>);
  });

  it("markScheduledReleaseFailed's update payload", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    await markScheduledReleaseFailed(client as SupabaseClient, "r1", NOW, "boom");
    assertKeysAreColumns(builders[0].calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>);
  });

  it("recoverStaleScheduledRelease's update payload (retry branch)", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    await recoverStaleScheduledRelease(client as SupabaseClient, { id: "r1", recoveryAttempts: 0 }, NOW);
    assertKeysAreColumns(builders[0].calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>);
  });

  it("recoverStaleScheduledRelease's update payload (exhausted branch)", async () => {
    const { client, builders } = createStub({ data: [], error: null });
    await recoverStaleScheduledRelease(client as SupabaseClient, { id: "r1", recoveryAttempts: MAX_RECOVERY_ATTEMPTS }, NOW);
    assertKeysAreColumns(builders[0].calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>);
  });

  it("cancelScheduledRelease's CAS update payload", async () => {
    const { client, builders } = createStub({ data: [{ ...SAMPLE_ROW, status: "cancelled" }], error: null });
    await cancelScheduledRelease(client as SupabaseClient, "user-1", SAMPLE_ROW.id, NOW);
    assertKeysAreColumns(builders[0].calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>);
  });
});
