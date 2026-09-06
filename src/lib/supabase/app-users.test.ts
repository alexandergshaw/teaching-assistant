// Exercises src/lib/supabase/app-users.ts against a hand-built fake of the
// SERVICE client createServiceClient() resolves to - no database is
// available under vitest (see vitest.config.ts's blanked-out Supabase env).
//
// app-users.ts calls createServiceClient() directly (it never takes an
// injected client), so getting a fake into it means mocking the "./server"
// module it imports from - the same vi.mock("./server", ...) idiom already
// used in courses.deleteCourse.test.ts, against the RELATIVE specifier
// app-users.ts itself uses.
//
// Deliberately duplicates its own fake-client builder rather than importing
// one from another *.test.ts file - importing a helper from another test
// file re-runs that file's own describe blocks (repo rule).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./server", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "./server";
import {
  getAppUser,
  ensureAppUser,
  appUserNeedsReconciliation,
  setAppUserStatus,
  setAppUserRole,
  countActiveOwners,
  listAppUsers,
  mapAppUserRow,
} from "./app-users";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

interface FakeRow {
  id: string;
  email: string;
  display_name: string | null;
  status: string;
  role: string;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  status_changed_at: string | null;
  status_changed_by: string | null;
}

function makeRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    id: "user-1",
    email: "person@example.com",
    display_name: null,
    status: "pending",
    role: "instructor",
    approved_at: null,
    approved_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    status_changed_at: null,
    status_changed_by: null,
    ...overrides,
  };
}

type FakeError = { message: string } | null;

interface FakeClientConfig {
  /** Response for the `.select("*").eq("id", ...).maybeSingle()` chain (getAppUser / ensureAppUser's own read-back). Used for every call once `maybeSingleSequence` (below) is absent or exhausted. */
  maybeSingle?: { data: FakeRow | null; error: FakeError };
  /**
   * Successive responses for the `.select("*").eq("id", ...).maybeSingle()`
   * chain - each call shifts the next entry off this queue; once exhausted,
   * further calls fall back to `maybeSingle` above. ensureAppUser reads this
   * chain up to twice in one invocation (once before deciding whether to
   * insert, and once more after an insert to read the authoritative row
   * back) - this queue is what lets a test simulate "the row did not exist
   * yet, then did" without a real database.
   */
  maybeSingleSequence?: { data: FakeRow | null; error: FakeError }[];
  /** Response for the bare `.select("*")` chain, awaited directly (listAppUsers). */
  selectAll?: { data: FakeRow[] | null; error: FakeError };
  /** Response for the `.update(...).eq(...).select().single()` chain. */
  updateSingle?: { data: FakeRow | null; error: FakeError };
  /** Response for the `.upsert(...)` call, awaited directly. */
  upsert?: { error: FakeError };
  /** Response for the `.select("id", {count, head}).eq().eq()` chain (countActiveOwners). */
  count?: { count: number | null; error: FakeError };
  /** Response for `auth.admin.updateUserById(...)` - BUG 4's ban/unban call. Defaults to success. */
  updateUserById?: { error: FakeError };
  /** Response for `auth.admin.getUserById(...)` - ensureAppUser's own verified-email read. Defaults to a generic found user. */
  getUserById?: {
    data: { user: { id: string; email: string | null; user_metadata?: Record<string, unknown> } | null };
    error: FakeError;
  };
}

interface Captured {
  updates: Record<string, unknown>[];
  upserts: Record<string, unknown>[];
  /** The options object passed to each `.upsert(row, options)` call, in the
   * same order as `upserts` - lets a test assert on `onConflict`/`ignoreDuplicates`
   * without the fake caring what they mean. */
  upsertOptions: (Record<string, unknown> | undefined)[];
  /** Every `auth.admin.updateUserById(id, attributes)` call - BUG 4's ban/unban. */
  banCalls: { id: string; attributes: Record<string, unknown> }[];
}

/** A minimal fake of the typed Supabase client, covering only the query
 * shapes app-users.ts actually issues against the app_users table, plus the
 * one auth.admin method BUG 4 added (updateUserById, for ban/unban). */
function makeFakeServiceClient(config: FakeClientConfig = {}) {
  const captured: Captured = { updates: [], upserts: [], upsertOptions: [], banCalls: [] };

  const client = {
    auth: {
      admin: {
        updateUserById: (id: string, attributes: Record<string, unknown>) => {
          captured.banCalls.push({ id, attributes });
          return Promise.resolve(config.updateUserById ?? { data: { user: null }, error: null });
        },
        getUserById: (id: string) =>
          Promise.resolve(
            config.getUserById ?? { data: { user: { id, email: "person@example.com" } }, error: null }
          ),
      },
    },
    from: (table: string) => {
      if (table !== "app_users") {
        throw new Error(`unexpected table in fake client: ${table}`);
      }
      return {
        select: (_columns?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts && opts.count) {
            return {
              eq: () => ({
                eq: () =>
                  Promise.resolve(config.count ?? { count: 0, error: null }),
              }),
            };
          }
          // Thenable AND chainable: listAppUsers awaits the select() result
          // directly, while getAppUser/ensureAppUser chain .eq(...).maybeSingle()
          // off it first - mirrors how a real PostgrestFilterBuilder behaves.
          return {
            eq: () => ({
              maybeSingle: () => {
                if (config.maybeSingleSequence && config.maybeSingleSequence.length > 0) {
                  return Promise.resolve(config.maybeSingleSequence.shift()!);
                }
                return Promise.resolve(config.maybeSingle ?? { data: null, error: null });
              },
            }),
            then: (
              resolve: (value: { data: FakeRow[] | null; error: FakeError }) => unknown,
              reject: (reason: unknown) => unknown
            ) =>
              Promise.resolve(config.selectAll ?? { data: [], error: null }).then(resolve, reject),
          };
        },
        update: (payload: Record<string, unknown>) => {
          captured.updates.push(payload);
          return {
            eq: () => ({
              select: () => ({
                single: () =>
                  Promise.resolve(config.updateSingle ?? { data: null, error: null }),
              }),
            }),
          };
        },
        upsert: (payload: Record<string, unknown>, options?: Record<string, unknown>) => {
          captured.upserts.push(payload);
          captured.upsertOptions.push(options);
          return Promise.resolve(config.upsert ?? { error: null });
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, captured };
}

describe("app-users: mapAppUserRow", () => {
  it("maps a row with null display_name/approved_at/approved_by/status_changed_at/status_changed_by, passing everything else through", () => {
    const row = makeRow({
      id: "user-9",
      email: "nobody@example.com",
      display_name: null,
      status: "suspended",
      role: "owner",
      approved_at: null,
      approved_by: null,
      created_at: "2026-02-01T00:00:00.000Z",
      updated_at: "2026-02-02T00:00:00.000Z",
      status_changed_at: null,
      status_changed_by: null,
    });

    const mapped = mapAppUserRow(row as unknown as Database["public"]["Tables"]["app_users"]["Row"]);

    expect(mapped).toEqual({
      id: "user-9",
      email: "nobody@example.com",
      displayName: null,
      status: "suspended",
      role: "owner",
      approvedAt: null,
      approvedBy: null,
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-02T00:00:00.000Z",
      statusChangedAt: null,
      statusChangedBy: null,
    });
  });

  it("BUG 3: maps status_changed_at/status_changed_by through when present", () => {
    const row = makeRow({
      id: "user-10",
      status_changed_at: "2026-04-01T00:00:00.000Z",
      status_changed_by: "owner-3",
    });

    const mapped = mapAppUserRow(row as unknown as Database["public"]["Tables"]["app_users"]["Row"]);

    expect(mapped.statusChangedAt).toBe("2026-04-01T00:00:00.000Z");
    expect(mapped.statusChangedBy).toBe("owner-3");
  });
});

describe("app-users: getAppUser", () => {
  beforeEach(() => {
    vi.mocked(createServiceClient).mockReset();
  });

  it("returns null for a missing row (no error)", async () => {
    const fake = makeFakeServiceClient({ maybeSingle: { data: null, error: null } });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(getAppUser("missing-user-getappuser")).resolves.toBeNull();
  });

  it("THROWS on a query error rather than returning null - a caller must never confuse an outage with 'no account yet'", async () => {
    const fake = makeFakeServiceClient({
      maybeSingle: { data: null, error: { message: "connection reset" } },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(getAppUser("broken-user-getappuser")).rejects.toThrow("connection reset");
  });

  it("maps a found row through mapAppUserRow", async () => {
    const fake = makeFakeServiceClient({
      maybeSingle: { data: makeRow({ id: "found-user-getappuser", role: "owner", status: "active" }), error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await getAppUser("found-user-getappuser");
    expect(result?.role).toBe("owner");
    expect(result?.status).toBe("active");
  });
});

describe("app-users: ensureAppUser", () => {
  const OWNER_EMAILS_BEFORE = process.env.OWNER_EMAILS;

  beforeEach(() => {
    vi.mocked(createServiceClient).mockReset();
  });

  afterEach(() => {
    process.env.OWNER_EMAILS = OWNER_EMAILS_BEFORE;
  });

  it("forces role='owner', status='active' for an allowlisted email, even when the existing row is pending/instructor", async () => {
    process.env.OWNER_EMAILS = "owner@example.com";

    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "owner-id", email: "owner@example.com" } }, error: null },
      upsert: { error: null },
      maybeSingle: {
        data: makeRow({ id: "owner-id", email: "owner@example.com", role: "instructor", status: "pending" }),
        error: null,
      },
      updateSingle: {
        data: makeRow({ id: "owner-id", email: "owner@example.com", role: "owner", status: "active" }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await ensureAppUser({ id: "owner-id", displayName: "Owner" });

    expect(result.role).toBe("owner");
    expect(result.status).toBe("active");
    // The row already existed (maybeSingle returns non-null on the first
    // read), so no insert-if-missing upsert should have run at all - only
    // the reconciliation update.
    expect(fake.captured.upserts).toHaveLength(0);
    expect(fake.captured.updates).toHaveLength(1);
    expect(fake.captured.updates[0]).toMatchObject({ role: "owner", status: "active" });
  });

  it("does NOT force owner/active for an email that is not on OWNER_EMAILS, and performs NO write at all (already-correct row)", async () => {
    process.env.OWNER_EMAILS = "owner@example.com";

    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "regular-id", email: "regular@example.com" } }, error: null },
      upsert: { error: null },
      maybeSingle: {
        data: makeRow({ id: "regular-id", email: "regular@example.com", role: "instructor", status: "pending" }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await ensureAppUser({ id: "regular-id" });

    expect(result.role).toBe("instructor");
    expect(result.status).toBe("pending");
    // WRITE-PER-REQUEST REGRESSION CANARY: an account that is not on the
    // allowlist and already has a row needs no reconciliation at all - not
    // an insert-if-missing upsert (the row already exists), not an update.
    // ensureAppUser runs on requireUser()'s hot path (~1000 call sites), so
    // this is the assertion that stops it from writing on every request.
    expect(fake.captured.upserts).toHaveLength(0);
    expect(fake.captured.updates).toHaveLength(0);
  });

  it("creates a row when none exists yet, using the verified email and any metadata name - and reconciles it in the SAME pass if it also needs promotion", async () => {
    process.env.OWNER_EMAILS = "new-owner@example.com";

    const fake = makeFakeServiceClient({
      getUserById: {
        data: {
          user: {
            id: "brand-new-id",
            email: "new-owner@example.com",
            user_metadata: { full_name: "New Owner" },
          },
        },
        error: null,
      },
      upsert: { error: null },
      // First read (before deciding whether to insert): no row. Second read
      // (ensureAppUser's own read-back after the insert): the row the
      // insert just created, still pending/instructor because the insert
      // itself does not apply the OWNER_EMAILS rule.
      maybeSingleSequence: [
        { data: null, error: null },
        {
          data: makeRow({
            id: "brand-new-id",
            email: "new-owner@example.com",
            display_name: "New Owner",
            role: "instructor",
            status: "pending",
          }),
          error: null,
        },
      ],
      updateSingle: {
        data: makeRow({
          id: "brand-new-id",
          email: "new-owner@example.com",
          display_name: "New Owner",
          role: "owner",
          status: "active",
        }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await ensureAppUser({ id: "brand-new-id" });

    expect(fake.captured.upserts).toHaveLength(1);
    expect(fake.captured.upserts[0]).toMatchObject({
      id: "brand-new-id",
      email: "new-owner@example.com",
      display_name: "New Owner",
    });
    // Promotion happens in the SAME reconciliation pass as the insert - one
    // update call, not a second round trip.
    expect(fake.captured.updates).toHaveLength(1);
    expect(fake.captured.updates[0]).toMatchObject({ role: "owner", status: "active" });
    expect(result.role).toBe("owner");
    expect(result.status).toBe("active");
  });

  it("is a no-op reconciliation write when an allowlisted account is already owner/active", async () => {
    process.env.OWNER_EMAILS = "owner@example.com";

    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "already-owner", email: "owner@example.com" } }, error: null },
      upsert: { error: null },
      maybeSingle: {
        data: makeRow({ id: "already-owner", email: "owner@example.com", role: "owner", status: "active" }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await ensureAppUser({ id: "already-owner" });

    expect(result.role).toBe("owner");
    expect(result.status).toBe("active");
    expect(fake.captured.upserts).toHaveLength(0);
    expect(fake.captured.updates).toHaveLength(0);
  });

  it("SECURITY: ignores a caller-supplied email entirely - only the verified auth record decides ownership", async () => {
    // Even if a caller manages to smuggle an allowlisted email onto the input
    // (bypassing the type system, exactly like a stray `as any` or a form
    // field forwarded unchecked would), the verified auth record - not the
    // input - is what ensureAppUser reads and reconciles against. Simulates
    // a brand-new account (row missing, then created by the insert) so the
    // insert row's own `email` field - the one value this test can actually
    // observe getting written - is exercised too, not just the post-hoc
    // role/status decision.
    process.env.OWNER_EMAILS = "owner@example.com";

    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "attacker-id", email: "attacker@example.com" } }, error: null },
      upsert: { error: null },
      maybeSingleSequence: [
        { data: null, error: null },
        {
          data: makeRow({ id: "attacker-id", email: "attacker@example.com", role: "instructor", status: "pending" }),
          error: null,
        },
      ],
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await ensureAppUser({
      id: "attacker-id",
      ...({ email: "owner@example.com" } as Record<string, unknown>),
    });

    expect(result.role).toBe("instructor");
    expect(result.status).toBe("pending");
    expect(fake.captured.upserts[0]).toMatchObject({ email: "attacker@example.com" });
    expect(fake.captured.updates).toHaveLength(0);
  });

  it("BUG 1 FIX: demotes role AND resets status to 'pending' when the account was never explicitly approved by a human, stamping status_changed_at/status_changed_by (BUG 6) with a null actor - see app-users.reconciliation.test.ts for the explicitly-approved and FU1 (explicit-promotion) counter-cases this composes with", async () => {
    process.env.OWNER_EMAILS = "someone-else@example.com";

    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "removed-owner", email: "removed@example.com" } }, error: null },
      upsert: { error: null },
      // approved_by defaults to null via makeRow - never explicitly approved
      // by a human, only ever active by virtue of OWNER_EMAILS.
      maybeSingle: {
        data: makeRow({ id: "removed-owner", email: "removed@example.com", role: "owner", status: "active" }),
        error: null,
      },
      updateSingle: {
        data: makeRow({ id: "removed-owner", email: "removed@example.com", role: "instructor", status: "pending" }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await ensureAppUser({ id: "removed-owner" });

    expect(result.role).toBe("instructor");
    expect(result.status).toBe("pending");
    expect(fake.captured.updates).toHaveLength(1);
    expect(fake.captured.updates[0]).toMatchObject({ role: "instructor", status: "pending", status_changed_by: null });
    expect(typeof fake.captured.updates[0].status_changed_at).toBe("string");
  });

  it("does NOT demote a stored role='owner' row when OWNER_EMAILS is unset - an unpropagated env var must not mass-demote", async () => {
    delete process.env.OWNER_EMAILS;

    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "still-owner", email: "still-owner@example.com" } }, error: null },
      upsert: { error: null },
      maybeSingle: {
        data: makeRow({ id: "still-owner", email: "still-owner@example.com", role: "owner", status: "active" }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await ensureAppUser({ id: "still-owner" });

    expect(result.role).toBe("owner");
    expect(fake.captured.updates).toHaveLength(0);
  });

  it("throws when the auth identity cannot be verified", async () => {
    const fake = makeFakeServiceClient({
      getUserById: { data: { user: null }, error: { message: "no such user" } },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(ensureAppUser({ id: "missing-auth-user" })).rejects.toThrow("Could not verify the auth identity");
  });

  it("throws when the verified auth user has no email on file", async () => {
    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "no-email-user", email: null } }, error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(ensureAppUser({ id: "no-email-user" })).rejects.toThrow("has no email on file");
  });

  it("fills display_name from the verified user's metadata when the stored row has none, without touching role/status", async () => {
    delete process.env.OWNER_EMAILS;

    const fake = makeFakeServiceClient({
      getUserById: {
        data: {
          user: {
            id: "no-name-id",
            email: "person@example.com",
            user_metadata: { full_name: "Jane Doe" },
          },
        },
        error: null,
      },
      upsert: { error: null },
      maybeSingle: {
        data: makeRow({
          id: "no-name-id",
          email: "person@example.com",
          display_name: null,
          role: "instructor",
          status: "active",
        }),
        error: null,
      },
      updateSingle: {
        data: makeRow({
          id: "no-name-id",
          email: "person@example.com",
          display_name: "Jane Doe",
          role: "instructor",
          status: "active",
        }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await ensureAppUser({ id: "no-name-id" });

    expect(result.displayName).toBe("Jane Doe");
    expect(fake.captured.upserts).toHaveLength(0);
    expect(fake.captured.updates).toHaveLength(1);
    expect(fake.captured.updates[0]).toMatchObject({ display_name: "Jane Doe" });
    expect("role" in fake.captured.updates[0]).toBe(false);
    expect("status" in fake.captured.updates[0]).toBe(false);
  });

  it("prefers metadata's 'name' field over nothing, but 'full_name' wins when both are present", async () => {
    delete process.env.OWNER_EMAILS;

    const fake = makeFakeServiceClient({
      getUserById: {
        data: {
          user: {
            id: "both-names-id",
            email: "person2@example.com",
            user_metadata: { full_name: "Full Name Wins", name: "Short Name" },
          },
        },
        error: null,
      },
      upsert: { error: null },
      maybeSingle: {
        data: makeRow({ id: "both-names-id", email: "person2@example.com", display_name: null, status: "active" }),
        error: null,
      },
      updateSingle: {
        data: makeRow({
          id: "both-names-id",
          email: "person2@example.com",
          display_name: "Full Name Wins",
          status: "active",
        }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await ensureAppUser({ id: "both-names-id" });

    expect(fake.captured.updates[0]).toMatchObject({ display_name: "Full Name Wins" });
  });

  it("does NOT overwrite an existing display_name, even when metadata carries a different name", async () => {
    delete process.env.OWNER_EMAILS;

    const fake = makeFakeServiceClient({
      getUserById: {
        data: {
          user: {
            id: "has-name-id",
            email: "person3@example.com",
            user_metadata: { full_name: "New Metadata Name" },
          },
        },
        error: null,
      },
      upsert: { error: null },
      maybeSingle: {
        data: makeRow({
          id: "has-name-id",
          email: "person3@example.com",
          display_name: "Existing Name",
          role: "instructor",
          status: "active",
        }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await ensureAppUser({ id: "has-name-id" });

    expect(result.displayName).toBe("Existing Name");
    // Nothing else needed reconciling either (non-owner email, unset
    // allowlist, name already present) - genuinely no write at all.
    expect(fake.captured.upserts).toHaveLength(0);
    expect(fake.captured.updates).toHaveLength(0);
  });

  it("BUG FIX: the insert-if-missing upsert names no onConflict target, so it can absorb a case-differing duplicate email (23505 on app_users_email_lower_idx) instead of throwing forever", async () => {
    // A narrower `{ onConflict: "id" }` emits `ON CONFLICT (id) DO NOTHING`,
    // which only absorbs a duplicate primary key - a duplicate
    // lower(email) collision (two auth.users rows differing only by case)
    // would still raise 23505 and make this call fail below. This fake
    // cannot simulate Postgres's own conflict-target resolution, so what it
    // pins is the call SHAPE that makes that absorption possible at all:
    // no onConflict option, matching the trigger's own target-less
    // `on conflict do nothing` (supabase/migrations/20261012000000_create_app_users.sql).
    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "case-diff-user", email: "Person@Example.com" } }, error: null },
      upsert: { error: null },
      // First read: no row (this account predates the trigger). Second read
      // (ensureAppUser's own post-insert read-back): the row exists now,
      // however it actually got there server-side - the absorbed-conflict
      // path this test is pinning is exactly what makes that possible.
      maybeSingleSequence: [
        { data: null, error: null },
        {
          data: makeRow({ id: "case-diff-user", email: "Person@Example.com", role: "instructor", status: "pending" }),
          error: null,
        },
      ],
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(ensureAppUser({ id: "case-diff-user" })).resolves.toMatchObject({ status: "pending" });

    expect(fake.captured.upsertOptions).toHaveLength(1);
    expect(fake.captured.upsertOptions[0]).not.toHaveProperty("onConflict");
    expect(fake.captured.upsertOptions[0]).toMatchObject({ ignoreDuplicates: true });
  });

  it("does not throw when the insert-if-missing upsert reports no error at all (the absorbed-conflict path)", async () => {
    // Once PostgREST absorbs the conflict server-side (via the target-less
    // DO NOTHING this fix produces), the upsert call itself reports success
    // with no error - this is the actual "does not throw" behavior a
    // duplicate-email conflict must produce end to end.
    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "already-exists-user", email: "existing@example.com" } }, error: null },
      upsert: { error: null },
      maybeSingleSequence: [
        { data: null, error: null },
        {
          data: makeRow({ id: "already-exists-user", email: "existing@example.com", role: "instructor", status: "active" }),
          error: null,
        },
      ],
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(ensureAppUser({ id: "already-exists-user" })).resolves.toMatchObject({ status: "active" });
  });
});

// Differential, table-driven tests for appUserNeedsReconciliation: the pure
// predicate requireUser() (src/lib/supabase/auth.ts) consults so it can skip
// calling ensureAppUser in the common case - see its own doc comment in
// app-users.ts for the round-trip cost this avoids. Each case asserts the
// predicate's answer AND drives the real ensureAppUser against a fake client
// built from the SAME row/email/metadata, so the two can never silently
// drift apart: `false` must be matched by ensureAppUser writing nothing;
// every `true` case here is constructed so ensureAppUser's real rule
// actually does write something too (a strict differential, not just "true
// permits either outcome").
describe("app-users: appUserNeedsReconciliation (differential against ensureAppUser)", () => {
  const OWNER_EMAILS_BEFORE = process.env.OWNER_EMAILS;
  beforeEach(() => vi.mocked(createServiceClient).mockReset());
  afterEach(() => {
    process.env.OWNER_EMAILS = OWNER_EMAILS_BEFORE;
  });

  interface Case {
    name: string;
    ownerEmails?: string;
    email: string;
    row: Partial<FakeRow> | null; // null = missing row
    metadata?: Record<string, unknown>;
    expected: boolean;
  }

  const cases: Case[] = [
    { name: "a missing row", email: "brand-new@example.com", row: null, expected: true },
    {
      name: "an allowlisted email with a stale row",
      ownerEmails: "boss@example.com",
      email: "boss@example.com",
      row: { role: "instructor", status: "pending", display_name: "Boss" },
      expected: true,
    },
    {
      name: "a de-allowlisted owner with a non-empty allowlist",
      ownerEmails: "someone-else@example.com",
      email: "removed@example.com",
      row: { role: "owner", status: "active", display_name: "Removed" },
      expected: true,
    },
    {
      name: "an unset allowlist with a stored role='owner' row",
      email: "owner-without-allowlist@example.com",
      row: { role: "owner", status: "active", display_name: "Owner" },
      expected: false,
    },
    {
      name: "an empty display_name (conservative true)",
      email: "no-name@example.com",
      row: { role: "instructor", status: "active", display_name: "" },
      metadata: { full_name: "Found Name" },
      expected: true,
    },
    {
      name: "the fully-correct row",
      email: "correct@example.com",
      row: { role: "instructor", status: "active", display_name: "Correct Name" },
      expected: false,
    },
  ];

  for (const c of cases) {
    it(`${c.name}: predicate says ${c.expected}, and ensureAppUser agrees`, async () => {
      if (c.ownerEmails) process.env.OWNER_EMAILS = c.ownerEmails;
      else delete process.env.OWNER_EMAILS;

      const predicateRow = c.row
        ? mapAppUserRow(makeRow({ email: c.email, ...c.row }) as unknown as Database["public"]["Tables"]["app_users"]["Row"])
        : null;
      expect(appUserNeedsReconciliation(predicateRow, c.email)).toBe(c.expected);

      const id = "differential-id";
      const fake = makeFakeServiceClient({
        getUserById: { data: { user: { id, email: c.email, user_metadata: c.metadata } }, error: null },
        upsert: { error: null },
        ...(c.row
          ? { maybeSingle: { data: makeRow({ id, email: c.email, ...c.row }), error: null } }
          : {
              maybeSingleSequence: [
                { data: null, error: null },
                { data: makeRow({ id, email: c.email, role: "instructor", status: "pending" }), error: null },
              ],
            }),
        updateSingle: { data: makeRow({ id, email: c.email, ...c.row }), error: null },
      });
      vi.mocked(createServiceClient).mockReturnValue(fake.client);

      await ensureAppUser({ id });

      const wroteSomething = fake.captured.upserts.length > 0 || fake.captured.updates.length > 0;
      expect(wroteSomething).toBe(c.expected);
    });
  }
});

describe("app-users: setAppUserStatus", () => {
  beforeEach(() => {
    vi.mocked(createServiceClient).mockReset();
  });

  it("stamps approved_at and approved_by when the transition lands on 'active'", async () => {
    const fake = makeFakeServiceClient({
      updateSingle: {
        data: makeRow({ id: "u1", status: "active", approved_at: "2026-03-01T00:00:00.000Z", approved_by: "owner-1" }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await setAppUserStatus("u1", "active", "owner-1");

    expect(fake.captured.updates).toHaveLength(1);
    const payload = fake.captured.updates[0];
    expect(payload.status).toBe("active");
    expect(payload.approved_by).toBe("owner-1");
    expect(typeof payload.approved_at).toBe("string");
    expect(typeof payload.updated_at).toBe("string");
  });

  it("does NOT stamp approved_at/approved_by for a suspend - overwriting an existing approval record would be wrong", async () => {
    const fake = makeFakeServiceClient({
      updateSingle: { data: makeRow({ id: "u2", status: "suspended" }), error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await setAppUserStatus("u2", "suspended", null);

    expect(fake.captured.updates).toHaveLength(1);
    const payload = fake.captured.updates[0];
    expect(payload.status).toBe("suspended");
    expect("approved_at" in payload).toBe(false);
    expect("approved_by" in payload).toBe(false);
  });

  it("does NOT stamp approved_at/approved_by for a pending transition either", async () => {
    const fake = makeFakeServiceClient({
      updateSingle: { data: makeRow({ id: "u3", status: "pending" }), error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await setAppUserStatus("u3", "pending", null);

    const payload = fake.captured.updates[0];
    expect("approved_at" in payload).toBe(false);
    expect("approved_by" in payload).toBe(false);
  });

  it("BUG 3: stamps status_changed_at/status_changed_by on every transition, not only 'active'", async () => {
    const fake = makeFakeServiceClient({
      updateSingle: { data: makeRow({ id: "u2b", status: "suspended" }), error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await setAppUserStatus("u2b", "suspended", "owner-9");

    const payload = fake.captured.updates[0];
    expect(payload.status_changed_by).toBe("owner-9");
    expect(typeof payload.status_changed_at).toBe("string");
  });

  it("throws on a query error", async () => {
    const fake = makeFakeServiceClient({
      updateSingle: { data: null, error: { message: "row not found" } },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(setAppUserStatus("missing", "active", "owner-1")).rejects.toThrow("row not found");
  });

  it("BUG 4: suspending bans the Supabase account via auth.admin.updateUserById before writing app_users", async () => {
    const fake = makeFakeServiceClient({
      updateSingle: { data: makeRow({ id: "u5", status: "suspended" }), error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await setAppUserStatus("u5", "suspended", "owner-1");

    expect(fake.captured.banCalls).toHaveLength(1);
    expect(fake.captured.banCalls[0].id).toBe("u5");
    expect(fake.captured.banCalls[0].attributes.ban_duration).toBe("876000h");
  });

  it("BUG 4: restoring (any non-suspended status) lifts the ban via ban_duration 'none'", async () => {
    const fake = makeFakeServiceClient({
      updateSingle: { data: makeRow({ id: "u6", status: "active" }), error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await setAppUserStatus("u6", "active", "owner-1");

    expect(fake.captured.banCalls).toHaveLength(1);
    expect(fake.captured.banCalls[0].attributes.ban_duration).toBe("none");
  });

  it("BUG 4: a suspend that fails to ban the account THROWS and never writes app_users - failure must not be reported as success", async () => {
    const fake = makeFakeServiceClient({
      updateUserById: { error: { message: "admin API unreachable" } },
      updateSingle: { data: makeRow({ id: "u7", status: "suspended" }), error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(setAppUserStatus("u7", "suspended", "owner-1")).rejects.toThrow("admin API unreachable");
    expect(fake.captured.updates).toHaveLength(0);
  });

  it("BUG 4: a restore that fails to lift the ban ALSO throws and never writes app_users", async () => {
    const fake = makeFakeServiceClient({
      updateUserById: { error: { message: "admin API unreachable" } },
      updateSingle: { data: makeRow({ id: "u8", status: "active" }), error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(setAppUserStatus("u8", "active", "owner-1")).rejects.toThrow("admin API unreachable");
    expect(fake.captured.updates).toHaveLength(0);
  });
});

describe("app-users: setAppUserRole", () => {
  beforeEach(() => {
    vi.mocked(createServiceClient).mockReset();
  });

  it("updates role, updated_at, and (BUG 3) status_changed_at/status_changed_by", async () => {
    const fake = makeFakeServiceClient({
      updateSingle: { data: makeRow({ id: "u4", role: "owner" }), error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await setAppUserRole("u4", "owner", "owner-2");

    expect(result.role).toBe("owner");
    const payload = fake.captured.updates[0];
    expect(payload.role).toBe("owner");
    expect(typeof payload.updated_at).toBe("string");
    expect(payload.status_changed_by).toBe("owner-2");
    expect(typeof payload.status_changed_at).toBe("string");
    expect("status" in payload).toBe(false);
  });
});

describe("app-users: countActiveOwners", () => {
  beforeEach(() => {
    vi.mocked(createServiceClient).mockReset();
  });

  it("returns the count from the query", async () => {
    const fake = makeFakeServiceClient({ count: { count: 2, error: null } });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(countActiveOwners()).resolves.toBe(2);
  });

  it("treats a null count as zero", async () => {
    const fake = makeFakeServiceClient({ count: { count: null, error: null } });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(countActiveOwners()).resolves.toBe(0);
  });

  it("throws on a query error", async () => {
    const fake = makeFakeServiceClient({ count: { count: null, error: { message: "timeout" } } });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(countActiveOwners()).rejects.toThrow("timeout");
  });
});

describe("app-users: listAppUsers", () => {
  beforeEach(() => {
    vi.mocked(createServiceClient).mockReset();
  });

  it("sorts pending accounts first, then everyone else newest first", async () => {
    const fake = makeFakeServiceClient({
      selectAll: {
        data: [
          makeRow({ id: "old-active", status: "active", created_at: "2026-01-01T00:00:00.000Z" }),
          makeRow({ id: "new-pending", status: "pending", created_at: "2026-03-01T00:00:00.000Z" }),
          makeRow({ id: "new-active", status: "active", created_at: "2026-02-01T00:00:00.000Z" }),
          makeRow({ id: "old-pending", status: "pending", created_at: "2026-01-15T00:00:00.000Z" }),
        ],
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await listAppUsers();

    expect(result.map((r) => r.id)).toEqual(["new-pending", "old-pending", "new-active", "old-active"]);
  });

  it("throws on a query error", async () => {
    const fake = makeFakeServiceClient({ selectAll: { data: null, error: { message: "down" } } });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(listAppUsers()).rejects.toThrow("down");
  });
});
