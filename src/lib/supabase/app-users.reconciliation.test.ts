// Additional coverage for src/lib/supabase/app-users.ts's BUG 1/3/5/6/7
// fixes (see docs/multi-user-login-acceptance-criteria.md, "DEPLOY GATE: TWO
// BLOCKERS" and "FOLLOW-UP FINDINGS ON THE AS-BUILT CODE" for the source
// findings). Split into its own file because app-users.test.ts is already at
// the repo's 1000-line ceiling (src/file-size-ceiling.structure.test.ts) -
// see that file's own note on this split.
//
// Deliberately duplicates its own fake-client builder rather than importing
// one from app-users.test.ts - importing a helper from another test file
// re-runs that file's own describe blocks (repo rule).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./server", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "./server";
import {
  ensureAppUser,
  ensureAppUserRowExists,
  appUserNeedsReconciliation,
  mapAppUserRow,
} from "./app-users";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

interface FakeRow {
  id: string;
  email: string | null;
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
  maybeSingle?: { data: FakeRow | null; error: FakeError };
  maybeSingleSequence?: { data: FakeRow | null; error: FakeError }[];
  updateSingle?: { data: FakeRow | null; error: FakeError };
  upsert?: { error: FakeError };
  getUserById?: {
    data: { user: { id: string; email: string | null; user_metadata?: Record<string, unknown> } | null };
    error: FakeError;
  };
}

interface Captured {
  updates: Record<string, unknown>[];
  upserts: Record<string, unknown>[];
  upsertOptions: (Record<string, unknown> | undefined)[];
}

/** A minimal fake of the typed Supabase client - only the query shapes
 * app-users.ts's ensureAppUser/ensureAppUserRowExists actually issue. */
function makeFakeServiceClient(config: FakeClientConfig = {}) {
  const captured: Captured = { updates: [], upserts: [], upsertOptions: [] };

  const client = {
    auth: {
      admin: {
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
        select: () => ({
          eq: () => ({
            maybeSingle: () => {
              if (config.maybeSingleSequence && config.maybeSingleSequence.length > 0) {
                return Promise.resolve(config.maybeSingleSequence.shift()!);
              }
              return Promise.resolve(config.maybeSingle ?? { data: null, error: null });
            },
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          captured.updates.push(payload);
          return {
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve(config.updateSingle ?? { data: null, error: null }),
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

describe("app-users: BUG 1 / FU1 - demotion and the human-approval / explicit-promotion exceptions", () => {
  const OWNER_EMAILS_BEFORE = process.env.OWNER_EMAILS;
  beforeEach(() => vi.mocked(createServiceClient).mockReset());
  afterEach(() => {
    process.env.OWNER_EMAILS = OWNER_EMAILS_BEFORE;
  });

  it("demotes role but leaves status ALONE when the account was explicitly approved by a human (approved_by set) - only the allowlist-granted role reverts", async () => {
    process.env.OWNER_EMAILS = "someone-else@example.com";

    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "approved-then-allowlisted", email: "removed2@example.com" } }, error: null },
      maybeSingle: {
        data: makeRow({
          id: "approved-then-allowlisted",
          email: "removed2@example.com",
          role: "owner",
          status: "active",
          approved_by: "a-real-owner-id",
        }),
        error: null,
      },
      updateSingle: {
        data: makeRow({ id: "approved-then-allowlisted", email: "removed2@example.com", role: "instructor", status: "active" }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await ensureAppUser({ id: "approved-then-allowlisted" });

    expect(result.role).toBe("instructor");
    expect(fake.captured.updates).toHaveLength(1);
    expect(fake.captured.updates[0]).toMatchObject({ role: "instructor" });
    expect("status" in fake.captured.updates[0]).toBe(false);
  });

  it("FU1: does NOT demote a role='owner' row an owner explicitly promoted via setAppUserRole (status_changed_by already set) - reconciliation must not silently undo an explicit promotion", async () => {
    process.env.OWNER_EMAILS = "someone-else@example.com";

    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "explicitly-promoted", email: "promoted@example.com" } }, error: null },
      maybeSingle: {
        data: makeRow({
          id: "explicitly-promoted",
          email: "promoted@example.com",
          role: "owner",
          status: "active",
          status_changed_by: "the-owner-who-promoted-them",
        }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await ensureAppUser({ id: "explicitly-promoted" });

    expect(result.role).toBe("owner");
    expect(fake.captured.updates).toHaveLength(0);
  });
});

describe("app-users: BUG 6 - ensureAppUser's own writes stamp attribution", () => {
  const OWNER_EMAILS_BEFORE = process.env.OWNER_EMAILS;
  beforeEach(() => vi.mocked(createServiceClient).mockReset());
  afterEach(() => {
    process.env.OWNER_EMAILS = OWNER_EMAILS_BEFORE;
  });

  it("a brand-new promotion (never approved by anyone) leaves approved_by null and stamps status_changed_by null - the system-caused sentinel, distinguishable from a row nothing has ever touched", async () => {
    process.env.OWNER_EMAILS = "owner@example.com";

    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "owner-id", email: "owner@example.com" } }, error: null },
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

    await ensureAppUser({ id: "owner-id" });

    const payload = fake.captured.updates[0];
    expect(payload.approved_by).toBeNull();
    expect(payload.status_changed_by).toBeNull();
    expect(typeof payload.status_changed_at).toBe("string");
  });

  it("a promotion of a row a human already approved PRESERVES that approver's id in approved_by, rather than overwriting it with the system sentinel", async () => {
    process.env.OWNER_EMAILS = "owner2@example.com";

    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "owner-id-2", email: "owner2@example.com" } }, error: null },
      maybeSingle: {
        data: makeRow({
          id: "owner-id-2",
          email: "owner2@example.com",
          role: "instructor",
          status: "active",
          approved_by: "human-approver-id",
          approved_at: "2026-01-01T00:00:00.000Z",
        }),
        error: null,
      },
      updateSingle: {
        data: makeRow({ id: "owner-id-2", email: "owner2@example.com", role: "owner", status: "active" }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await ensureAppUser({ id: "owner-id-2" });

    const payload = fake.captured.updates[0];
    expect(payload.approved_by).toBe("human-approver-id");
    expect(payload.approved_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("a display_name-only reconciliation does NOT stamp status_changed_at/status_changed_by - those columns track role/status changes, not name fills", async () => {
    delete process.env.OWNER_EMAILS;

    const fake = makeFakeServiceClient({
      getUserById: {
        data: { user: { id: "name-only-id", email: "person@example.com", user_metadata: { full_name: "Jane" } } },
        error: null,
      },
      maybeSingle: {
        data: makeRow({ id: "name-only-id", email: "person@example.com", display_name: null, status: "active" }),
        error: null,
      },
      updateSingle: {
        data: makeRow({ id: "name-only-id", email: "person@example.com", display_name: "Jane", status: "active" }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await ensureAppUser({ id: "name-only-id" });

    const payload = fake.captured.updates[0];
    expect("status_changed_at" in payload).toBe(false);
    expect("status_changed_by" in payload).toBe(false);
  });
});

describe("app-users: BUG 7 - stale email reconciliation", () => {
  beforeEach(() => vi.mocked(createServiceClient).mockReset());

  it("corrects app_users.email when it differs from the verified auth email", async () => {
    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "changed-email-id", email: "new@example.com" } }, error: null },
      maybeSingle: {
        data: makeRow({ id: "changed-email-id", email: "old@example.com", status: "active" }),
        error: null,
      },
      updateSingle: {
        data: makeRow({ id: "changed-email-id", email: "new@example.com", status: "active" }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await ensureAppUser({ id: "changed-email-id" });

    expect(result.email).toBe("new@example.com");
    expect(fake.captured.updates).toHaveLength(1);
    expect(fake.captured.updates[0]).toMatchObject({ email: "new@example.com" });
  });

  it("does NOT touch email when it already matches the verified auth email - no spurious write on the hot path", async () => {
    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "same-email-id", email: "same@example.com" } }, error: null },
      maybeSingle: {
        data: makeRow({ id: "same-email-id", email: "same@example.com", status: "active" }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await ensureAppUser({ id: "same-email-id" });

    expect(fake.captured.updates).toHaveLength(0);
  });

  it("reconciles a null stored email (a phone/anonymous account that has since added an email) to the verified value", async () => {
    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "added-email-id", email: "added@example.com" } }, error: null },
      maybeSingle: {
        data: makeRow({ id: "added-email-id", email: null, status: "active" }),
        error: null,
      },
      updateSingle: {
        data: makeRow({ id: "added-email-id", email: "added@example.com", status: "active" }),
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await ensureAppUser({ id: "added-email-id" });

    expect(result.email).toBe("added@example.com");
    expect(fake.captured.updates[0]).toMatchObject({ email: "added@example.com" });
  });

  it("appUserNeedsReconciliation reports true for a stale email even when role/status/display_name are all already correct", () => {
    const row = mapAppUserRow(
      makeRow({ email: "old@example.com", status: "active" }) as unknown as Database["public"]["Tables"]["app_users"]["Row"]
    );

    expect(appUserNeedsReconciliation(row, "new@example.com")).toBe(true);
  });
});

describe("app-users: BUG 3 - ensureAppUserRowExists (insert-only recovery)", () => {
  beforeEach(() => vi.mocked(createServiceClient).mockReset());

  it("creates a bare row when none exists, tolerating a null email (BUG 5's phone/anonymous case)", async () => {
    const fake = makeFakeServiceClient({
      getUserById: { data: { user: { id: "phone-user", email: null } }, error: null },
      maybeSingle: { data: null, error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await ensureAppUserRowExists("phone-user");

    expect(fake.captured.upserts).toHaveLength(1);
    expect(fake.captured.upserts[0]).toMatchObject({ id: "phone-user", email: null });
    // Same target-less upsert as ensureAppUser's own insert-if-missing step -
    // absorbs a duplicate primary key AND a lower(email) collision alike.
    expect(fake.captured.upsertOptions[0]).not.toHaveProperty("onConflict");
    expect(fake.captured.upsertOptions[0]).toMatchObject({ ignoreDuplicates: true });
  });

  it("is a no-op when a row already exists - never overwrites, never touches role/status/display_name/email", async () => {
    const fake = makeFakeServiceClient({
      maybeSingle: { data: makeRow({ id: "already-has-row" }), error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await ensureAppUserRowExists("already-has-row");

    expect(fake.captured.upserts).toHaveLength(0);
  });

  it("does not throw when the auth identity cannot be verified - best-effort, retried on the account's next request", async () => {
    const fake = makeFakeServiceClient({
      maybeSingle: { data: null, error: null },
      getUserById: { data: { user: null }, error: { message: "no such user" } },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(ensureAppUserRowExists("unverifiable-user")).resolves.toBeUndefined();
    expect(fake.captured.upserts).toHaveLength(0);
  });

  it("fills display_name from the verified user's metadata on the recovery insert too", async () => {
    const fake = makeFakeServiceClient({
      getUserById: {
        data: { user: { id: "recovered-user", email: "recovered@example.com", user_metadata: { full_name: "Recovered Name" } } },
        error: null,
      },
      maybeSingle: { data: null, error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await ensureAppUserRowExists("recovered-user");

    expect(fake.captured.upserts[0]).toMatchObject({
      id: "recovered-user",
      email: "recovered@example.com",
      display_name: "Recovered Name",
    });
  });
});
