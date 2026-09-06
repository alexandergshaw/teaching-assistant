// Contract tests for src/lib/lms-credentials.ts, the sole reader/writer of
// public.lms_credentials. Drives the REAL module functions against a fake
// Supabase service-role client backed by an in-memory row store, so these
// tests exercise the real encrypt/decrypt/AAD/normalization logic - not a
// re-statement of it - the same reasoning
// src/lib/account-suspend-failure.test.ts gives for running the real
// function rather than asserting against a hand-typed fixture.
//
// Deliberately builds its own fake client rather than importing one from
// another *.test.ts file - importing across test files re-runs that file's
// own describe blocks (repo rule).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "./supabase/server";
import {
  getLmsCredentialSecret,
  listLmsCredentials,
  saveLmsCredential,
  deleteLmsCredential,
  touchLmsCredentialUsed,
  recordLmsCredentialFailure,
  mapLmsCredentialRow,
} from "./lms-credentials";
import { encryptSecret } from "./crypto";
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

const ORIGINAL_KEY = process.env.GOOGLE_TOKEN_ENC_KEY;
const TEST_KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.GOOGLE_TOKEN_ENC_KEY = TEST_KEY;
  delete process.env.GOOGLE_TOKEN_ENC_KEY_PREVIOUS;
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.GOOGLE_TOKEN_ENC_KEY;
  else process.env.GOOGLE_TOKEN_ENC_KEY = ORIGINAL_KEY;
  vi.clearAllMocks();
});

/** A stored row exactly as it would live in Postgres - snake_case, every column, ciphertext included. */
interface FakeDbRow {
  user_id: string;
  institution: string;
  base_url: string;
  encrypted_token: string;
  token_last_four: string;
  canvas_user_id: string | null;
  canvas_user_name: string | null;
  last_verified_at: string | null;
  last_used_at: string | null;
  last_failure_at: string | null;
  last_failure_kind: string | null;
  created_at: string;
  updated_at: string;
}

type FakeError = { message: string } | null;

/**
 * A minimal, genuinely-filtering fake of the chainable query builder
 * postgrest-js returns - PromiseLike so `await table().select(...).eq(...)`
 * (no terminal .single()/.maybeSingle() call, exactly like
 * listLmsCredentials/deleteLmsCredential/touchLmsCredentialUsed call it)
 * resolves correctly, and also exposes .maybeSingle()/.single() for the two
 * call sites that need exactly one row. Filters are applied for real against
 * the shared in-memory `rows` array, rather than pre-canning a response per
 * test, so a bug in lms-credentials.ts's own .eq() chain (e.g. forgetting to
 * scope a delete to institution as well as user_id) would show up as a wrong
 * row count instead of being masked by a fixture that already assumed the
 * right filter was applied.
 */
class FakeQuery implements PromiseLike<{ data: unknown; error: FakeError }> {
  private filters: Array<[string, unknown]> = [];
  private cols: string[] | null = null;

  constructor(
    private rows: FakeDbRow[],
    private op: "select" | "upsert" | "update" | "delete",
    private payload?: Partial<FakeDbRow>,
    private forcedError: FakeError = null
  ) {}

  select(cols: string) {
    this.cols = cols.split(",").map((c) => c.trim());
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }

  private matches(row: FakeDbRow): boolean {
    return this.filters.every(([col, val]) => (row as unknown as Record<string, unknown>)[col] === val);
  }

  private project(row: FakeDbRow): unknown {
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

    if (this.op === "delete") {
      const remaining = this.rows.filter((r) => !this.matches(r));
      const removedCount = this.rows.length - remaining.length;
      this.rows.length = 0;
      this.rows.push(...remaining);
      return { data: null, error: removedCount > 0 ? null : null };
    }

    if (this.op === "update") {
      const touched: FakeDbRow[] = [];
      for (const row of this.rows) {
        if (this.matches(row)) {
          Object.assign(row, this.payload);
          touched.push(row);
        }
      }
      return { data: touched.map((r) => this.project(r)), error: null };
    }

    // upsert: match on the composite primary key (user_id, institution).
    const payload = this.payload as FakeDbRow;
    const existingIndex = this.rows.findIndex(
      (r) => r.user_id === payload.user_id && r.institution === payload.institution
    );
    if (existingIndex >= 0) {
      // Real PostgREST upsert only overwrites columns present in the
      // payload - created_at, deliberately absent from saveLmsCredential's
      // own payload, must survive here exactly like it would in Postgres.
      this.rows[existingIndex] = { ...this.rows[existingIndex], ...payload };
      return { data: [this.project(this.rows[existingIndex])], error: null };
    }
    const created = {
      ...payload,
      created_at: payload.created_at ?? new Date().toISOString(),
      canvas_user_id: payload.canvas_user_id ?? null,
      canvas_user_name: payload.canvas_user_name ?? null,
      last_verified_at: payload.last_verified_at ?? null,
      last_used_at: payload.last_used_at ?? null,
      last_failure_at: payload.last_failure_at ?? null,
      last_failure_kind: payload.last_failure_kind ?? null,
    } as FakeDbRow;
    this.rows.push(created);
    return { data: [this.project(created)], error: null };
  }

  maybeSingle() {
    const { data, error } = this.execute();
    if (error) return Promise.resolve({ data: null, error });
    const rows = data as unknown[];
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  single() {
    const { data, error } = this.execute();
    if (error) return Promise.resolve({ data: null, error });
    const rows = data as unknown[];
    return Promise.resolve(rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "no rows" } });
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
  rows: FakeDbRow[];
}

function makeFakeClient(initialRows: FakeDbRow[] = [], forcedError: FakeError = null): FakeClientHandle {
  const rows = [...initialRows];
  const client = {
    from: (table: string) => {
      if (table !== "lms_credentials") {
        throw new Error(`unexpected table in fake client: ${table}`);
      }
      return {
        select: (cols: string) => new FakeQuery(rows, "select", undefined, forcedError).select(cols),
        upsert: (payload: Partial<FakeDbRow>) => new FakeQuery(rows, "upsert", payload, forcedError),
        update: (payload: Partial<FakeDbRow>) => new FakeQuery(rows, "update", payload, forcedError),
        delete: () => new FakeQuery(rows, "delete", undefined, forcedError),
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, rows };
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function seedRow(overrides: Partial<FakeDbRow> = {}): FakeDbRow {
  const userId = overrides.user_id ?? USER_A;
  const institution = overrides.institution ?? "MCC";
  return {
    user_id: userId,
    institution,
    base_url: "https://canvas.example.edu",
    encrypted_token: encryptSecret("real-token-1234", `${userId}:${institution}`),
    token_last_four: "1234",
    canvas_user_id: "987",
    canvas_user_name: "Jamie Instructor",
    last_verified_at: "2026-01-01T00:00:00.000Z",
    last_used_at: null,
    last_failure_at: null,
    last_failure_kind: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("mapLmsCredentialRow - pure mapping", () => {
  it("maps every snake_case column to its camelCase field, with no encrypted_token field to drop", () => {
    const row = seedRow();
    // Never pass encrypted_token in - the type signature itself
    // (Omit<DbRow, "encrypted_token">) is what listLmsCredentials relies on
    // to make "this function never sees ciphertext" a compile-time fact, not
    // just a runtime habit.
    const { encrypted_token: _dropped, ...rest } = row;
    void _dropped;
    expect(mapLmsCredentialRow(rest)).toEqual({
      institution: "MCC",
      baseUrl: "https://canvas.example.edu",
      tokenLastFour: "1234",
      canvasUserId: "987",
      canvasUserName: "Jamie Instructor",
      lastVerifiedAt: "2026-01-01T00:00:00.000Z",
      lastUsedAt: null,
      lastFailureAt: null,
      lastFailureKind: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("getLmsCredentialSecret", () => {
  it("returns null when no row exists for the (user, institution) pair", async () => {
    const fake = makeFakeClient([seedRow()]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    expect(await getLmsCredentialSecret(USER_A, "UNL")).toBeNull();
  });

  it("returns the decrypted token and base URL for a matching row", async () => {
    const fake = makeFakeClient([seedRow()]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    expect(await getLmsCredentialSecret(USER_A, "MCC")).toEqual({
      baseUrl: "https://canvas.example.edu",
      token: "real-token-1234",
    });
  });

  it("normalizes institution (trim + uppercase) exactly like google-credentials.ts / microsoft-credentials.ts", async () => {
    const fake = makeFakeClient([seedRow()]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    expect(await getLmsCredentialSecret(USER_A, "  mcc  ")).toEqual({
      baseUrl: "https://canvas.example.edu",
      token: "real-token-1234",
    });
  });

  it("returns null (never throws) on a query error", async () => {
    const fake = makeFakeClient([], { message: "connection refused" });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    await expect(getLmsCredentialSecret(USER_A, "MCC")).resolves.toBeNull();
  });

  it("returns null (never throws) when the stored ciphertext cannot be decrypted under the current key - copies microsoft-credentials.ts's shape, not google-credentials.ts's old uncaught-throw one", async () => {
    const row = seedRow();
    // Simulate a key rotation that left this row stranded: nothing in
    // GOOGLE_TOKEN_ENC_KEY or GOOGLE_TOKEN_ENC_KEY_PREVIOUS can open it.
    process.env.GOOGLE_TOKEN_ENC_KEY = randomBytes(32).toString("base64");
    const fake = makeFakeClient([row]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    await expect(getLmsCredentialSecret(USER_A, "MCC")).resolves.toBeNull();
  });

  it("SEC7: a ciphertext bound to a DIFFERENT (user, institution) pair fails to authenticate, even read back through the row it now (illegitimately) sits in", async () => {
    // Simulates the exact hazard SEC7 names: a ciphertext that ended up
    // under the wrong row (e.g. a bug elsewhere copying a whole row by id).
    // Build a row whose institution is "MCC" but whose token was encrypted
    // with an AAD naming a different institution ("UNL") - the row's own key
    // no longer matches the ciphertext's binding.
    const mismatched = seedRow({
      institution: "MCC",
      encrypted_token: encryptSecret("stolen-looking-token", `${USER_A}:UNL`),
    });
    const fake = makeFakeClient([mismatched]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    await expect(getLmsCredentialSecret(USER_A, "MCC")).resolves.toBeNull();
  });
});

describe("listLmsCredentials", () => {
  it("never decrypts: returns correct metadata even when the stored ciphertext is garbage that would throw if decrypted", async () => {
    const row = seedRow({ encrypted_token: "not-a-valid-payload-at-all" });
    const fake = makeFakeClient([row]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const list = await listLmsCredentials(USER_A);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ institution: "MCC", tokenLastFour: "1234" });
    // No field on the summary ever carries the ciphertext or a decrypted
    // value - the shape itself has no such field, checked structurally.
    expect(Object.keys(list[0])).not.toContain("encryptedToken");
    expect(Object.keys(list[0])).not.toContain("token");
  });

  it("returns every institution for the user, sorted, and excludes other users' rows", async () => {
    const fake = makeFakeClient([
      seedRow({ institution: "UNL" }),
      seedRow({ institution: "MCC" }),
      seedRow({ user_id: USER_B, institution: "AAA" }),
    ]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const list = await listLmsCredentials(USER_A);
    expect(list.map((c) => c.institution)).toEqual(["MCC", "UNL"]);
  });

  it("returns an empty array (never throws) on a query error", async () => {
    const fake = makeFakeClient([], { message: "boom" });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    await expect(listLmsCredentials(USER_A)).resolves.toEqual([]);
  });
});

describe("saveLmsCredential", () => {
  it("stores an encrypted token that getLmsCredentialSecret can read back, plus the correct last-four and identity metadata", async () => {
    const fake = makeFakeClient([]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const summary = await saveLmsCredential({
      userId: USER_A,
      institution: "mcc",
      baseUrl: "https://canvas.example.edu",
      token: "brand-new-token-9999",
      canvasUserId: "42",
      canvasUserName: "Alex",
    });

    expect(summary.institution).toBe("MCC");
    expect(summary.tokenLastFour).toBe("9999");
    expect(summary.canvasUserId).toBe("42");
    expect(summary.lastVerifiedAt).not.toBeNull();
    expect(summary.lastFailureAt).toBeNull();
    expect(summary.lastFailureKind).toBeNull();

    expect(await getLmsCredentialSecret(USER_A, "MCC")).toEqual({
      baseUrl: "https://canvas.example.edu",
      token: "brand-new-token-9999",
    });
  });

  it("never stores the plaintext token anywhere in the row - only its ciphertext and its last four characters", async () => {
    const fake = makeFakeClient([]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    await saveLmsCredential({
      userId: USER_A,
      institution: "MCC",
      baseUrl: "https://canvas.example.edu",
      token: "brand-new-token-9999",
      canvasUserId: "42",
      canvasUserName: null,
    });

    const stored = fake.rows[0];
    expect(stored.encrypted_token).not.toContain("brand-new-token-9999");
    expect(JSON.stringify(stored)).not.toContain("brand-new-token-9999");
  });

  it("replacing a credential clears a prior failure diagnostic and updates last four, but preserves created_at", async () => {
    const existing = seedRow({
      last_failure_at: "2026-02-01T00:00:00.000Z",
      last_failure_kind: "rejected",
      created_at: "2020-01-01T00:00:00.000Z",
    });
    const fake = makeFakeClient([existing]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const summary = await saveLmsCredential({
      userId: USER_A,
      institution: "MCC",
      baseUrl: "https://canvas.example.edu",
      token: "replacement-token-4321",
      canvasUserId: "987",
      canvasUserName: "Jamie Instructor",
    });

    expect(summary.lastFailureAt).toBeNull();
    expect(summary.lastFailureKind).toBeNull();
    expect(summary.tokenLastFour).toBe("4321");
    expect(fake.rows[0].created_at).toBe("2020-01-01T00:00:00.000Z");
  });

  it("upserts on (user_id, institution) - a second save for the same pair replaces rather than duplicates the row", async () => {
    const fake = makeFakeClient([]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    const input = {
      userId: USER_A,
      institution: "MCC",
      baseUrl: "https://canvas.example.edu",
      canvasUserId: "1",
      canvasUserName: null,
    };
    await saveLmsCredential({ ...input, token: "first-token-0001" });
    await saveLmsCredential({ ...input, token: "second-token-0002" });

    expect(fake.rows).toHaveLength(1);
    expect(await getLmsCredentialSecret(USER_A, "MCC")).toEqual({
      baseUrl: "https://canvas.example.edu",
      token: "second-token-0002",
    });
  });
});

describe("deleteLmsCredential", () => {
  it("removes only the targeted (user, institution) row", async () => {
    const fake = makeFakeClient([
      seedRow({ institution: "MCC" }),
      seedRow({ institution: "UNL" }),
      seedRow({ user_id: USER_B, institution: "MCC" }),
    ]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await deleteLmsCredential(USER_A, "mcc");

    expect(fake.rows.map((r) => `${r.user_id}:${r.institution}`).sort()).toEqual(
      [`${USER_A}:UNL`, `${USER_B}:MCC`].sort()
    );
  });

  it("throws when the underlying delete reports an error, so a failed delete is never reported as success", async () => {
    const fake = makeFakeClient([seedRow()], { message: "delete blew up" });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    await expect(deleteLmsCredential(USER_A, "MCC")).rejects.toThrow(/delete blew up/);
  });
});

describe("touchLmsCredentialUsed", () => {
  it("stamps last_used_at and clears a prior failure diagnostic", async () => {
    const row = seedRow({ last_failure_at: "2026-02-01T00:00:00.000Z", last_failure_kind: "host_unreachable" });
    const fake = makeFakeClient([row]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await touchLmsCredentialUsed(USER_A, "MCC");

    expect(fake.rows[0].last_used_at).not.toBeNull();
    expect(fake.rows[0].last_failure_at).toBeNull();
    expect(fake.rows[0].last_failure_kind).toBeNull();
  });

  it("is best-effort: a write error is logged, not thrown", async () => {
    const fake = makeFakeClient([seedRow()], { message: "write blew up" });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    await expect(touchLmsCredentialUsed(USER_A, "MCC")).resolves.toBeUndefined();
  });
});

describe("recordLmsCredentialFailure", () => {
  it("stamps last_failure_at/last_failure_kind for each of the three writable kinds", async () => {
    for (const kind of ["unreadable", "rejected", "host_unreachable"] as const) {
      const fake = makeFakeClient([seedRow()]);
      vi.mocked(createServiceClient).mockReturnValue(fake.client);
      await recordLmsCredentialFailure(USER_A, "MCC", kind);
      expect(fake.rows[0].last_failure_kind).toBe(kind);
      expect(fake.rows[0].last_failure_at).not.toBeNull();
    }
  });

  it("is a harmless no-op against a nonexistent row - 'no_credential' has no row to stamp, by construction", async () => {
    const fake = makeFakeClient([]);
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    await expect(recordLmsCredentialFailure(USER_A, "MCC", "rejected")).resolves.toBeUndefined();
    expect(fake.rows).toHaveLength(0);
  });

  it("is best-effort: a write error is logged, not thrown", async () => {
    const fake = makeFakeClient([seedRow()], { message: "write blew up" });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    await expect(recordLmsCredentialFailure(USER_A, "MCC", "rejected")).resolves.toBeUndefined();
  });
});
