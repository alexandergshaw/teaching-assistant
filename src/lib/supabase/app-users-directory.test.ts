// Exercises src/lib/supabase/app-users-directory.ts against a hand-built fake
// of the SERVICE client createServiceClient() resolves to - no database is
// available under vitest (see vitest.config.ts's blanked-out Supabase env).
//
// listAccountPeople composes TWO real functions that each call
// createServiceClient() themselves: listAppUsers (./app-users.ts, reads
// app_users) and this file's own fetchAuthEmailVerificationById (reads
// auth.users via the admin API). Mocking "./server" - the module BOTH of
// them import createServiceClient from - lets one fake client answer both
// kinds of call, exactly like app-users.test.ts's own idiom.
//
// Deliberately duplicates its own fake-client builder rather than importing
// one from another *.test.ts file - importing a helper from another test
// file re-runs that file's own describe blocks (repo rule).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./server", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "./server";
import { listAccountPeople } from "./app-users-directory";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

interface FakeAppUserRow {
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

function makeAppUserRow(overrides: Partial<FakeAppUserRow> = {}): FakeAppUserRow {
  return {
    id: "user-1",
    email: "person@example.com",
    display_name: null,
    status: "active",
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

interface FakeAuthUser {
  id: string;
  email?: string | null;
  email_confirmed_at?: string;
}

type FakeAppUsersSelectResult = { data: FakeAppUserRow[] | null; error: { message: string } | null };
type FakeListUsersResult =
  | { data: { users: FakeAuthUser[]; nextPage: number | null }; error: null }
  | { data: { users: [] }; error: { message: string } };

interface FakeClientConfig {
  /** Response for `supabase.from("app_users").select("*")`, awaited directly. */
  selectAll?: FakeAppUsersSelectResult;
  /** Overrides `selectAll` when present - lets a test control WHEN the app_users read resolves. */
  selectAllFn?: () => Promise<FakeAppUsersSelectResult>;
  /** Successive responses for `auth.admin.listUsers`, one per call in order; the last entry repeats once exhausted. */
  listUsersQueue?: FakeListUsersResult[];
  /** Overrides `listUsersQueue` when present - lets a test compute a response per call (e.g. an ever-incrementing nextPage) or control timing. */
  listUsersFn?: (params: { page?: number; perPage?: number }, callIndex: number) => Promise<FakeListUsersResult>;
  /** Fires synchronously the instant `.select()` is called - before anything is awaited. */
  onSelectAllCall?: () => void;
  /** Fires synchronously the instant `auth.admin.listUsers(...)` is called - before anything is awaited. */
  onListUsersCall?: (params: { page?: number; perPage?: number }) => void;
}

interface Captured {
  listUsersCalls: { page?: number; perPage?: number }[];
}

/**
 * A minimal fake of the typed Supabase client, covering only the two query
 * shapes app-users-directory.ts actually issues: the bare
 * `.select("*")` on `app_users` (via the real listAppUsers) and
 * `auth.admin.listUsers(params)`.
 *
 * Both `onSelectAllCall` and `onListUsersCall` fire SYNCHRONOUSLY, inside the
 * call that triggers them, before either returned promise is awaited - this
 * is what lets the concurrency test below observe call ORDER without relying
 * on wall-clock timing (see that test's own comment).
 */
function makeFakeServiceClient(config: FakeClientConfig = {}) {
  const captured: Captured = { listUsersCalls: [] };
  let listUsersCallCount = 0;

  const client = {
    auth: {
      admin: {
        listUsers: (params?: { page?: number; perPage?: number }) => {
          const p = params ?? {};
          captured.listUsersCalls.push(p);
          config.onListUsersCall?.(p);
          const callIndex = listUsersCallCount++;
          if (config.listUsersFn) {
            return config.listUsersFn(p, callIndex);
          }
          const queue = config.listUsersQueue ?? [];
          const entry = queue[Math.min(callIndex, queue.length - 1)];
          return Promise.resolve(entry ?? { data: { users: [], nextPage: null }, error: null });
        },
      },
    },
    from: (table: string) => {
      if (table !== "app_users") {
        throw new Error(`unexpected table in fake client: ${table}`);
      }
      return {
        select: () => {
          config.onSelectAllCall?.();
          const resultPromise = config.selectAllFn
            ? config.selectAllFn()
            : Promise.resolve(config.selectAll ?? { data: [], error: null });
          return {
            then: (
              resolve: (value: FakeAppUsersSelectResult) => unknown,
              reject: (reason: unknown) => unknown
            ) => resultPromise.then(resolve, reject),
          };
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, captured };
}

describe("app-users-directory: listAccountPeople", () => {
  beforeEach(() => {
    vi.mocked(createServiceClient).mockReset();
  });

  it("the happy join: an app_users row paired with a confirmed auth user reports emailVerified true", async () => {
    const fake = makeFakeServiceClient({
      selectAll: { data: [makeAppUserRow({ id: "u1", email: "confirmed@example.com" })], error: null },
      listUsersQueue: [
        {
          data: {
            users: [{ id: "u1", email: "confirmed@example.com", email_confirmed_at: "2026-01-01T00:00:00.000Z" }],
            nextPage: null,
          },
          error: null,
        },
      ],
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await listAccountPeople();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "u1", email: "confirmed@example.com", emailVerified: true });
    // Every AppUserRow field must still be present, not just the new one.
    expect(result[0]).toHaveProperty("role");
    expect(result[0]).toHaveProperty("status");
    expect(result[0]).toHaveProperty("createdAt");
  });

  it("a user whose email is unconfirmed (no email_confirmed_at at all) reports emailVerified false", async () => {
    const fake = makeFakeServiceClient({
      selectAll: { data: [makeAppUserRow({ id: "u2", email: "unconfirmed@example.com" })], error: null },
      listUsersQueue: [
        { data: { users: [{ id: "u2", email: "unconfirmed@example.com" }], nextPage: null }, error: null },
      ],
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await listAccountPeople();

    expect(result[0].emailVerified).toBe(false);
  });

  it("pages through multiple auth.admin.listUsers results and merges both pages into the join, not just the first", async () => {
    const fake = makeFakeServiceClient({
      selectAll: {
        data: [
          makeAppUserRow({ id: "page1-user", email: "page1@example.com" }),
          makeAppUserRow({ id: "page2-user", email: "page2@example.com" }),
        ],
        error: null,
      },
      listUsersQueue: [
        {
          data: {
            users: [{ id: "page1-user", email: "page1@example.com", email_confirmed_at: "2026-01-01T00:00:00.000Z" }],
            nextPage: 2,
          },
          error: null,
        },
        {
          // No email_confirmed_at here - distinguishes this page's user from
          // page 1's, so the assertion below can only pass if BOTH pages were
          // actually read and merged, not just the first.
          data: { users: [{ id: "page2-user", email: "page2@example.com" }], nextPage: null },
          error: null,
        },
      ],
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await listAccountPeople();

    expect(fake.captured.listUsersCalls).toEqual([
      { page: 1, perPage: 1000 },
      { page: 2, perPage: 1000 },
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.id, r.emailVerified]));
    expect(byId).toEqual({ "page1-user": true, "page2-user": false });
  });

  it("throws rather than truncating when auth.admin.listUsers never reports a final page (page cap)", async () => {
    const fake = makeFakeServiceClient({
      selectAll: { data: [makeAppUserRow({ id: "u3" })], error: null },
      // Every call reports another page - a runaway / never-terminating
      // pagination cursor. The function must give up after a bounded number
      // of pages rather than looping forever.
      listUsersFn: (params) =>
        Promise.resolve({
          data: { users: [], nextPage: (params.page ?? 1) + 1 },
          error: null,
        } as FakeListUsersResult),
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(listAccountPeople()).rejects.toThrow(/did not finish within 20 pages/);
    // Exactly the documented cap's worth of calls were made - neither fewer
    // (giving up early) nor unbounded (never giving up at all).
    expect(fake.captured.listUsersCalls).toHaveLength(20);
  });

  it("an app_users row with no matching auth user fails closed: emailVerified is false, not true", async () => {
    const fake = makeFakeServiceClient({
      selectAll: { data: [makeAppUserRow({ id: "orphan-1", email: "orphan@example.com" })], error: null },
      // The auth side simply has no record of this id at all - e.g. the auth
      // account was deleted out from under the app_users row.
      listUsersQueue: [{ data: { users: [], nextPage: null }, error: null }],
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await listAccountPeople();

    expect(result).toHaveLength(1);
    expect(result[0].emailVerified).toBe(false);
  });

  it("a null email on both the app_users row and the auth user does not break the join - it still keys on id", async () => {
    const fake = makeFakeServiceClient({
      selectAll: { data: [makeAppUserRow({ id: "no-email-user", email: null })], error: null },
      listUsersQueue: [
        {
          data: {
            users: [{ id: "no-email-user", email: null, email_confirmed_at: "2026-01-01T00:00:00.000Z" }],
            nextPage: null,
          },
          error: null,
        },
      ],
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const result = await listAccountPeople();

    expect(result[0].email).toBeNull();
    // email_confirmed_at is still authoritative even though email is null on
    // both sides - the join is keyed on id, never email.
    expect(result[0].emailVerified).toBe(true);
  });

  it("issues the app_users read and the auth.admin.listUsers read CONCURRENTLY - both are issued before either resolves", async () => {
    // Proves concurrency via call ORDER under manual promise control, never
    // via wall-clock timing (a timing-based test would be flaky). If
    // listAccountPeople awaited listAppUsers() and THEN called
    // fetchAuthEmailVerificationById() (the sequential, buggy shape - see
    // that function's own doc comment on GC10), "auth:listUsers" could not
    // appear in callOrder until AFTER resolveAppUsers is called below. Here
    // it is asserted BEFORE that resolution ever happens.
    const callOrder: string[] = [];
    let resolveAppUsers!: (value: FakeAppUsersSelectResult) => void;
    const appUsersPromise = new Promise<FakeAppUsersSelectResult>((resolve) => {
      resolveAppUsers = resolve;
    });

    const fake = makeFakeServiceClient({
      onSelectAllCall: () => callOrder.push("app_users:select"),
      selectAllFn: () => appUsersPromise,
      onListUsersCall: () => callOrder.push("auth:listUsers"),
      listUsersQueue: [{ data: { users: [], nextPage: null }, error: null }],
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const resultPromise = listAccountPeople();

    // Both calls have already been ISSUED at this point - synchronously,
    // before either underlying read has resolved - because Promise.all's
    // array literal invokes both async functions before either is awaited.
    expect(callOrder).toEqual(["app_users:select", "auth:listUsers"]);

    resolveAppUsers({ data: [], error: null });
    await expect(resultPromise).resolves.toEqual([]);
  });

  it("throws when the app_users read itself fails", async () => {
    const fake = makeFakeServiceClient({
      selectAll: { data: null, error: { message: "app_users unreachable" } },
      listUsersQueue: [{ data: { users: [], nextPage: null }, error: null }],
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(listAccountPeople()).rejects.toThrow("app_users unreachable");
  });

  it("throws when auth.admin.listUsers itself fails", async () => {
    const fake = makeFakeServiceClient({
      selectAll: { data: [makeAppUserRow({ id: "u4" })], error: null },
      listUsersQueue: [{ data: { users: [] }, error: { message: "admin API unreachable" } }],
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(listAccountPeople()).rejects.toThrow("admin API unreachable");
  });
});
