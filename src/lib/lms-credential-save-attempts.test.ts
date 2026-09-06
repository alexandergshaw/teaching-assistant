// Contract tests for src/lib/lms-credential-save-attempts.ts, backing SEC9's
// rate limit (docs/lms-credentials-acceptance-criteria.md). Drives the REAL
// module functions against a fake Supabase service-role client, mirroring
// src/lib/lms-credentials.test.ts's own shape - a genuinely-filtering fake
// query builder, not a per-test canned response, so a bug in this file's own
// filter (e.g. forgetting to scope the cleanup delete to user_id) shows up as
// a wrong row count instead of being masked by a fixture that already assumed
// the right filter was applied.
//
// The "composed with the real decision" describe block below also drives the
// REAL mayAttemptLmsCredentialSave (./lms-credential-save-limit.ts) against
// data this store actually returns, rather than asserting against a
// hand-typed array - proving the two modules compose correctly, not merely
// that each one, in isolation, does what its own unit tests already say it
// does. That module's own logic is never reimplemented here.
//
// Deliberately builds its own fake client rather than importing one from
// another *.test.ts file - importing across test files re-runs that file's
// own describe blocks (repo rule).
import { describe, it, expect, vi } from "vitest";

vi.mock("./supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "./supabase/server";
import { getRecentLmsCredentialSaveAttempts, recordLmsCredentialSaveAttempt } from "./lms-credential-save-attempts";
import {
  mayAttemptLmsCredentialSave,
  LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS,
  LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS,
} from "./lms-credential-save-limit";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

/** A stored row exactly as it would live in Postgres. */
interface FakeRow {
  id: string;
  user_id: string;
  attempted_at: string;
}

type FakeError = { message: string } | null;
type FilterKind = "eq" | "gte" | "lt";

/**
 * A minimal, genuinely-filtering fake of the chainable query builder
 * postgrest-js returns. Supports exactly the three operations
 * lms-credential-save-attempts.ts issues: a `select` (with `.eq`/`.gte`,
 * `.abortSignal`, `.retry`), an `insert`, and a `delete` (with `.eq`/`.lt`) -
 * each awaited directly with no terminal `.single()`/`.maybeSingle()` call,
 * exactly like the real module calls them.
 */
class FakeQuery implements PromiseLike<{ data: unknown; error: FakeError }> {
  private filters: Array<[FilterKind, string, unknown]> = [];
  sawAbortSignal: AbortSignal | null = null;
  sawRetry: boolean | null = null;
  private cols: string[] | null = null;

  constructor(
    private rows: FakeRow[],
    private op: "select" | "insert" | "delete",
    private payload: Partial<FakeRow> | undefined,
    private forcedError: FakeError
  ) {}

  select(cols: string) {
    this.cols = cols.split(",").map((c) => c.trim());
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push(["eq", col, val]);
    return this;
  }

  gte(col: string, val: unknown) {
    this.filters.push(["gte", col, val]);
    return this;
  }

  lt(col: string, val: unknown) {
    this.filters.push(["lt", col, val]);
    return this;
  }

  /**
   * Chain pass-throughs for the two bounds the real read applies, recorded
   * rather than ignored so a test can assert the read is BOUNDED and
   * NON-RETRYING - see the "attempt-history read is bounded" describe block
   * below. Mirrors src/lib/lms-credentials.test.ts's own FakeQuery.
   */
  abortSignal(signal: AbortSignal) {
    this.sawAbortSignal = signal;
    return this;
  }

  retry(enabled: boolean) {
    this.sawRetry = enabled;
    return this;
  }

  private matches(row: FakeRow): boolean {
    return this.filters.every(([kind, col, val]) => {
      const actual = (row as unknown as Record<string, unknown>)[col];
      if (typeof actual !== "string" || typeof val !== "string") return false;
      if (kind === "eq") return actual === val;
      if (kind === "gte") return actual >= val;
      return actual < val; // lt - ISO-8601 strings of identical shape compare lexically like their instants
    });
  }

  private project(row: FakeRow): unknown {
    if (!this.cols) return row;
    const out: Record<string, unknown> = {};
    for (const c of this.cols) out[c] = (row as unknown as Record<string, unknown>)[c];
    return out;
  }

  private execute(): { data: unknown; error: FakeError } {
    if (this.forcedError) return { data: null, error: this.forcedError };

    if (this.op === "select") {
      const matched = this.rows.filter((r) => this.matches(r));
      return { data: matched.map((r) => this.project(r)), error: null };
    }

    if (this.op === "insert") {
      const payload = this.payload as Partial<FakeRow>;
      this.rows.push({
        id: payload.id ?? `generated-${this.rows.length + 1}`,
        user_id: payload.user_id as string,
        attempted_at: payload.attempted_at as string,
      });
      return { data: null, error: null };
    }

    // delete
    const remaining = this.rows.filter((r) => !this.matches(r));
    this.rows.length = 0;
    this.rows.push(...remaining);
    return { data: null, error: null };
  }

  then<TResult1 = { data: unknown; error: FakeError }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: FakeError }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

interface FakeClientHandle {
  client: SupabaseClient<Database>;
  rows: FakeRow[];
  /** The most recent select builder, so a test can assert how the read was bounded. */
  lastSelectQuery: () => FakeQuery | null;
}

function makeFakeClient(
  initialRows: FakeRow[] = [],
  errors: { select?: FakeError; insert?: FakeError; delete?: FakeError } = {}
): FakeClientHandle {
  const rows = [...initialRows];
  let lastSelect: FakeQuery | null = null;
  const client = {
    from: (table: string) => {
      if (table !== "lms_credential_save_attempts") {
        throw new Error(`unexpected table in fake client: ${table}`);
      }
      return {
        select: (cols: string) => {
          const q = new FakeQuery(rows, "select", undefined, errors.select ?? null);
          lastSelect = q;
          return q.select(cols);
        },
        insert: (payload: Partial<FakeRow>) => new FakeQuery(rows, "insert", payload, errors.insert ?? null),
        delete: () => new FakeQuery(rows, "delete", undefined, errors.delete ?? null),
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, rows, lastSelectQuery: () => lastSelect };
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

describe("getRecentLmsCredentialSaveAttempts", () => {
  it("returns the epoch-ms timestamps of this user's attempts at or after sinceMs", async () => {
    const now = Date.parse("2026-01-01T00:10:00.000Z");
    const rows: FakeRow[] = [
      { id: "1", user_id: USER_A, attempted_at: new Date(now - 60_000).toISOString() },
      { id: "2", user_id: USER_A, attempted_at: new Date(now - 5 * 60_000).toISOString() },
    ];
    const fake = makeFakeClient(rows);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await getRecentLmsCredentialSaveAttempts(USER_A, now - 10 * 60_000);
    expect(result?.slice().sort((a, b) => a - b)).toEqual([now - 5 * 60_000, now - 60_000]);
  });

  it("excludes attempts before sinceMs - the window's own lower edge", async () => {
    const now = Date.now();
    const rows: FakeRow[] = [{ id: "1", user_id: USER_A, attempted_at: new Date(now - 20 * 60_000).toISOString() }];
    const fake = makeFakeClient(rows);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    expect(await getRecentLmsCredentialSaveAttempts(USER_A, now - 10 * 60_000)).toEqual([]);
  });

  it("excludes other users' attempts", async () => {
    const now = Date.now();
    const rows: FakeRow[] = [{ id: "1", user_id: USER_B, attempted_at: new Date(now).toISOString() }];
    const fake = makeFakeClient(rows);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    expect(await getRecentLmsCredentialSaveAttempts(USER_A, now - 10 * 60_000)).toEqual([]);
  });

  it("SABOTAGE CHECK (direction 1 of 2 - fail closed): returns null - never [] - when the read itself errors", async () => {
    const fake = makeFakeClient([], { select: { message: "connection refused" } });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    const result = await getRecentLmsCredentialSaveAttempts(USER_A, Date.now() - 10 * 60_000);
    // Deliberately NOT toEqual([]) - collapsing an error into the same value
    // as "no attempts yet" is exactly the fail-OPEN bug this function exists
    // to prevent. See this module's own header for why the two must never
    // share a value.
    expect(result).toBeNull();
  });
});

describe("the attempt-history read is bounded and does not retry", () => {
  /**
   * These two are a pair and neither works alone - see
   * ./lms-credentials.test.ts's identical describe block for the full
   * reasoning (E-REL1): a timed-out SELECT does not match postgrest-js's
   * "AbortError" check, so without `.retry(false)` it is retried three more
   * times with fresh timeouts, and this read sits in series behind
   * requireUser()'s own read and ahead of the Canvas probe SEC9 exists to
   * gate. Without these assertions, deleting either call would pass every
   * other test in this file and only show up as an outage under a degraded
   * database.
   */
  it("SABOTAGE CHECK (direction 2 of 2 - the bound): passes an AbortSignal, so a hung read cannot run unbounded", async () => {
    const fake = makeFakeClient([]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await getRecentLmsCredentialSaveAttempts(USER_A, Date.now() - 10 * 60_000);

    const signal = fake.lastSelectQuery()?.sawAbortSignal;
    expect(signal, "the read was issued with no AbortSignal").toBeInstanceOf(AbortSignal);
  });

  it("SABOTAGE CHECK (direction 2 of 2 - the bound): disables retries, because a rate-limit read has a correct answer on failure (refuse)", async () => {
    const fake = makeFakeClient([]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await getRecentLmsCredentialSaveAttempts(USER_A, Date.now() - 10 * 60_000);

    expect(fake.lastSelectQuery()?.sawRetry, "retries were left enabled on the attempt-history read").toBe(false);
  });
});

describe("recordLmsCredentialSaveAttempt", () => {
  it("inserts a row for this user with the exact attempted_at timestamp supplied", async () => {
    const fake = makeFakeClient([]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    const now = Date.parse("2026-02-01T00:00:00.000Z");

    await recordLmsCredentialSaveAttempt(USER_A, now, 10 * 60_000);

    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0].user_id).toBe(USER_A);
    expect(fake.rows[0].attempted_at).toBe(new Date(now).toISOString());
  });

  it("sweeps this user's rows older than nowMs - retentionMs (cleanup on write), leaving newer rows and other users' rows untouched", async () => {
    const now = Date.parse("2026-02-01T00:20:00.000Z");
    const retentionMs = 10 * 60_000;
    const rows: FakeRow[] = [
      { id: "old", user_id: USER_A, attempted_at: new Date(now - retentionMs - 60_000).toISOString() },
      { id: "recent", user_id: USER_A, attempted_at: new Date(now - 60_000).toISOString() },
      { id: "other-user-old", user_id: USER_B, attempted_at: new Date(now - retentionMs - 60_000).toISOString() },
    ];
    const fake = makeFakeClient(rows);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await recordLmsCredentialSaveAttempt(USER_A, now, retentionMs);

    expect(fake.rows.find((r) => r.id === "old")).toBeUndefined();
    expect(fake.rows.find((r) => r.id === "recent")).toBeDefined();
    expect(fake.rows.find((r) => r.id === "other-user-old")).toBeDefined();
    expect(fake.rows).toHaveLength(3); // recent + other-user-old + the newly inserted row
  });

  it("SABOTAGE CHECK (direction 1 of 2 - fail closed, the write side): throws when the insert itself fails, so the caller can refuse this attempt rather than report it as recorded", async () => {
    const fake = makeFakeClient([], { insert: { message: "insert blew up" } });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(recordLmsCredentialSaveAttempt(USER_A, Date.now(), 10 * 60_000)).rejects.toThrow(/insert blew up/);
  });

  it("does not throw when only the cleanup delete fails - best-effort, because a swept row is never counted again regardless of whether it was actually removed", async () => {
    const fake = makeFakeClient([], { delete: { message: "delete blew up" } });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(recordLmsCredentialSaveAttempt(USER_A, Date.now(), 10 * 60_000)).resolves.toBeUndefined();
    expect(fake.rows).toHaveLength(1); // the insert still happened
  });
});

describe("composed with the real rate-limit decision (mayAttemptLmsCredentialSave) - not reimplemented here", () => {
  it("an attempt inside the limit is allowed", async () => {
    const fake = makeFakeClient([]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    const now = Date.now();

    const recent = await getRecentLmsCredentialSaveAttempts(USER_A, now - LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS);
    expect(recent).toEqual([]);
    expect(mayAttemptLmsCredentialSave(recent as number[], now)).toEqual({ allowed: true });
  });

  it("the limit is reached after LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS recorded attempts, and the next is refused", async () => {
    const fake = makeFakeClient([]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    let now = Date.parse("2026-03-01T00:00:00.000Z");

    for (let i = 0; i < LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS; i++) {
      const recent = await getRecentLmsCredentialSaveAttempts(USER_A, now - LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS);
      expect(mayAttemptLmsCredentialSave(recent as number[], now).allowed).toBe(true);
      await recordLmsCredentialSaveAttempt(USER_A, now, LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS);
      now += 1_000; // one second apart, well inside the ten-minute window
    }

    const recentAfterLimit = await getRecentLmsCredentialSaveAttempts(USER_A, now - LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS);
    expect(mayAttemptLmsCredentialSave(recentAfterLimit as number[], now)).toMatchObject({ allowed: false });
  });

  it("the window rolling forward makes an old attempt stop counting, so a refused user is allowed again", async () => {
    const fake = makeFakeClient([]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    let now = Date.parse("2026-03-01T00:00:00.000Z");

    for (let i = 0; i < LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS; i++) {
      await recordLmsCredentialSaveAttempt(USER_A, now, LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS);
      now += 1_000;
    }

    const stillRefused = await getRecentLmsCredentialSaveAttempts(USER_A, now - LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS);
    expect(mayAttemptLmsCredentialSave(stillRefused as number[], now).allowed).toBe(false);

    // Roll the window fully past every recorded attempt.
    now += LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS + 1;
    const afterWindowRolls = await getRecentLmsCredentialSaveAttempts(USER_A, now - LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS);
    expect(afterWindowRolls).toEqual([]);
    expect(mayAttemptLmsCredentialSave(afterWindowRolls as number[], now)).toEqual({ allowed: true });
  });
});
