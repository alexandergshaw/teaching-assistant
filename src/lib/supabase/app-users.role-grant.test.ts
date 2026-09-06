// GC1 (role_granted_by) and GC5 (countEffectiveOwners) coverage that did not
// fit in app-users.test.ts, which is already at the repo's 1000-line ceiling
// (src/file-size-ceiling.structure.test.ts) - see that file's own note, and
// app-users.reconciliation.test.ts's header, for the same split rationale.
// This file covers the two pieces of src/lib/supabase/app-users.ts that are
// self-contained enough not to need app-users.reconciliation.test.ts's own
// ensureAppUser-shaped fake client:
//   - setAppUserRole's role_granted_by stamp (GC1) and mapAppUserRow's
//     passthrough of it.
//   - countEffectiveOwners (GC5): the union of stored active owners and the
//     OWNER_EMAILS allowlist.
//
// Deliberately duplicates its own fake-client builder rather than importing
// one from another *.test.ts file - importing a helper from another test
// file re-runs that file's own describe blocks (repo rule).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./server", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "./server";
import { setAppUserRole, countEffectiveOwners, mapAppUserRow } from "./app-users";
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
  role_granted_by: string | null;
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
    role_granted_by: null,
    ...overrides,
  };
}

// Mirrors app-users.ts's own DbAppUserRow intersection (role_granted_by is
// not on the generated Database row type) so a FakeRow can be cast to what
// mapAppUserRow actually expects.
type FakeDbRow = Database["public"]["Tables"]["app_users"]["Row"] & { role_granted_by: string | null };

type FakeError = { message: string } | null;

interface FakeClientConfig {
  /** Response for setAppUserRole's `.update(...).eq(...).select().single()` chain. */
  updateSingle?: { data: FakeRow | null; error: FakeError };
  /** Response for countEffectiveOwners' `.select("id, email").eq(...).eq(...)` chain. */
  activeOwnerRows?: { data: { id: string; email: string | null }[] | null; error: FakeError };
}

interface Captured {
  updates: Record<string, unknown>[];
}

function makeFakeServiceClient(config: FakeClientConfig = {}) {
  const captured: Captured = { updates: [] };

  const client = {
    from: (table: string) => {
      if (table !== "app_users") {
        throw new Error(`unexpected table in fake client: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve(config.activeOwnerRows ?? { data: [], error: null }),
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
      };
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, captured };
}

describe("app-users: setAppUserRole stamps/clears role_granted_by (GC1)", () => {
  beforeEach(() => vi.mocked(createServiceClient).mockReset());

  it("granting 'owner' stamps role_granted_by with the acting owner's id", async () => {
    const fake = makeFakeServiceClient({
      updateSingle: { data: makeRow({ id: "u1", role: "owner", role_granted_by: "owner-9" }), error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await setAppUserRole("u1", "owner", "owner-9");

    expect(result.role).toBe("owner");
    expect(result.roleGrantedBy).toBe("owner-9");
    expect(fake.captured.updates[0]).toMatchObject({ role: "owner", role_granted_by: "owner-9" });
  });

  it("granting 'owner' with a null actor stamps role_granted_by null too - matches the null-actor idiom used elsewhere in this module", async () => {
    const fake = makeFakeServiceClient({
      updateSingle: { data: makeRow({ id: "u2", role: "owner", role_granted_by: null }), error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await setAppUserRole("u2", "owner", null);

    expect(fake.captured.updates[0]).toMatchObject({ role: "owner", role_granted_by: null });
  });

  it("demoting to 'instructor' CLEARS role_granted_by to null instead of stamping the demoting actor - even when the row was previously granted by a different human", async () => {
    // Whatever role_granted_by held before this call is irrelevant: demotion
    // always writes null, because a value left over from a demotion would
    // mislead a later, unrelated promotion into inheriting a "human granted
    // this" marker it never earned. See setAppUserRole's own doc comment.
    const fake = makeFakeServiceClient({
      updateSingle: { data: makeRow({ id: "u3", role: "instructor", role_granted_by: null }), error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await setAppUserRole("u3", "instructor", "owner-who-demoted");

    const payload = fake.captured.updates[0];
    expect(payload.role).toBe("instructor");
    expect(payload.role_granted_by).toBeNull();
    // status_changed_by still records who performed THIS demotion - only
    // role_granted_by (the "is the CURRENT role a human's doing" marker) is
    // cleared, not the ordinary audit trail.
    expect(payload.status_changed_by).toBe("owner-who-demoted");
  });
});

describe("app-users: mapAppUserRow passes role_granted_by through (GC1)", () => {
  it("maps a non-null role_granted_by", () => {
    const row = makeRow({ id: "u4", role: "owner", role_granted_by: "owner-1" });
    const mapped = mapAppUserRow(row as unknown as FakeDbRow);
    expect(mapped.roleGrantedBy).toBe("owner-1");
  });

  it("maps a null role_granted_by", () => {
    const row = makeRow({ id: "u5", role: "instructor", role_granted_by: null });
    const mapped = mapAppUserRow(row as unknown as FakeDbRow);
    expect(mapped.roleGrantedBy).toBeNull();
  });
});

describe("app-users: countEffectiveOwners (GC5)", () => {
  const OWNER_EMAILS_BEFORE = process.env.OWNER_EMAILS;
  beforeEach(() => vi.mocked(createServiceClient).mockReset());
  afterEach(() => {
    process.env.OWNER_EMAILS = OWNER_EMAILS_BEFORE;
  });

  it("no allowlist configured: counts only stored active owners", async () => {
    delete process.env.OWNER_EMAILS;
    const fake = makeFakeServiceClient({
      activeOwnerRows: {
        data: [
          { id: "row-1", email: "owner1@example.com" },
          { id: "row-2", email: "owner2@example.com" },
        ],
        error: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(countEffectiveOwners()).resolves.toBe(2);
  });

  it("an allowlisted address with NO app_users row at all still counts - the break-glass admits them with no row required", async () => {
    process.env.OWNER_EMAILS = "never-signed-in@example.com";
    const fake = makeFakeServiceClient({ activeOwnerRows: { data: [], error: null } });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(countEffectiveOwners()).resolves.toBe(1);
  });

  it("an allowlisted address that HAS signed in and been promoted appears in both sets but counts ONCE - a union, not a sum", async () => {
    process.env.OWNER_EMAILS = "owner@example.com";
    const fake = makeFakeServiceClient({
      activeOwnerRows: { data: [{ id: "row-1", email: "owner@example.com" }], error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(countEffectiveOwners()).resolves.toBe(1);
  });

  it("matches emails case-insensitively and trimmed, exactly like isOwnerEmail - an allowlist/stored-email pair differing only in case or whitespace is still one owner", async () => {
    process.env.OWNER_EMAILS = "  Owner@Example.com  ";
    const fake = makeFakeServiceClient({
      activeOwnerRows: { data: [{ id: "row-1", email: "owner@example.com" }], error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(countEffectiveOwners()).resolves.toBe(1);
  });

  it("a stored active owner NOT on the allowlist still counts", async () => {
    process.env.OWNER_EMAILS = "someone-else@example.com";
    const fake = makeFakeServiceClient({
      activeOwnerRows: { data: [{ id: "row-1", email: "off-allowlist-owner@example.com" }], error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    // The allowlisted address (1) plus the off-allowlist stored owner (1) - two distinct identities.
    await expect(countEffectiveOwners()).resolves.toBe(2);
  });

  it("an allowlisted address whose stored row is SUSPENDED still counts - the break-glass ignores stored status entirely, so the query for active rows finding nothing for it does not matter", async () => {
    // The suspended row itself is role='owner' but status='suspended', so it
    // is NOT among the rows countEffectiveOwners' own active-owner query
    // returns (that query filters status='active') - it counts purely
    // because its address is on OWNER_EMAILS.
    process.env.OWNER_EMAILS = "suspended-owner@example.com";
    const fake = makeFakeServiceClient({ activeOwnerRows: { data: [], error: null } });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(countEffectiveOwners()).resolves.toBe(1);
  });

  it("a stored active-owner row with a null email (BUG 5) still counts as one distinct owner, keyed by row id", async () => {
    delete process.env.OWNER_EMAILS;
    const fake = makeFakeServiceClient({
      activeOwnerRows: { data: [{ id: "phone-owner-row", email: null }], error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(countEffectiveOwners()).resolves.toBe(1);
  });

  it("a null `data` from the query is treated as zero stored rows, not a crash", async () => {
    process.env.OWNER_EMAILS = "only-allowlisted@example.com";
    const fake = makeFakeServiceClient({ activeOwnerRows: { data: null, error: null } });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(countEffectiveOwners()).resolves.toBe(1);
  });

  it("throws on a query error", async () => {
    const fake = makeFakeServiceClient({ activeOwnerRows: { data: null, error: { message: "timeout" } } });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(countEffectiveOwners()).rejects.toThrow("timeout");
  });
});
