// Contract tests for requireUser()/requireAppOwner()/requireOwner(), written
// against docs/multi-user-login-acceptance-criteria.md (A6, A7) and the
// privilege-escalation fixes described in owner-context.ts's module preamble
// and auth.ts's own BUG 2 doc comment (DEPLOY GATE BLOCK2): as of that
// stopgap fix, an impersonated identity is honoured by requireAppOwner()
// ONLY when role==='owner', and by requireUser() ONLY when role==='owner'
// AND status==='active' - a merely-active, non-owner identity is refused by
// BOTH functions now, not just requireAppOwner(). See the BUG 2 CANARY tests
// below for the escalation this closes.
//
// No live Supabase is available under vitest (see vitest.config.ts's
// blanked-out env), so "./server" (the cookie-bound client factory) and
// "./app-users"'s getAppUser are mocked. Deliberately duplicates its own
// fakes rather than importing another *.test.ts file's helpers - importing a
// helper from another test file re-runs that file's own describe blocks
// (repo rule).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./server", () => ({
  createClient: vi.fn(),
}));

vi.mock("./app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});

import { createClient } from "./server";
import { getAppUser, ensureAppUser, ensureAppUserRowExists, type AppUserRow } from "./app-users";
import { requireUser, requireAppOwner, requireOwner } from "./auth";
import { runAsOwner, type OwnerIdentity } from "./owner-context";

function fakeAppUserRow(overrides: Partial<AppUserRow> = {}): AppUserRow {
  return {
    id: "u1",
    email: "person@example.com",
    displayName: null,
    status: "pending",
    role: "instructor",
    approvedAt: null,
    approvedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    statusChangedAt: null,
    statusChangedBy: null,
    ...overrides,
  };
}

type FakeAuthUser = { id: string; email: string | null } | null;

function makeFakeAuthClient(opts: {
  user?: FakeAuthUser;
  /**
   * Anything shaped like a Supabase auth error. BUG 4's tests pass a fake
   * AuthRetryableFetchError here (`{ __isAuthError: true, name:
   * "AuthRetryableFetchError", message }`) - `isAuthRetryableFetchError`
   * (from @supabase/supabase-js) only checks for `__isAuthError` and `name`,
   * so a plain object satisfies it without importing the real error class.
   */
  userError?: Record<string, unknown> | null;
  currentLevel?: string;
  nextLevel?: string;
}) {
  return {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: opts.user ?? null },
          error: opts.userError ?? null,
        }),
      mfa: {
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({
            data: {
              currentLevel: opts.currentLevel ?? "aal1",
              nextLevel: opts.nextLevel ?? "aal1",
            },
            error: null,
          }),
      },
    },
  };
}

const ORIGINAL_OWNER_EMAILS = process.env.OWNER_EMAILS;

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(getAppUser).mockReset();
  vi.mocked(ensureAppUser).mockReset();
  vi.mocked(ensureAppUserRowExists).mockReset();
  // Default: reconciliation succeeds and reports no change needed. Tests
  // that care about ensureAppUser's own call args/count, or about a
  // reconciliation FAILURE, override this explicitly.
  vi.mocked(ensureAppUser).mockResolvedValue(fakeAppUserRow());
  vi.mocked(ensureAppUserRowExists).mockResolvedValue(undefined);
  delete process.env.OWNER_EMAILS;
});

afterEach(() => {
  if (ORIGINAL_OWNER_EMAILS === undefined) delete process.env.OWNER_EMAILS;
  else process.env.OWNER_EMAILS = ORIGINAL_OWNER_EMAILS;
});

describe("requireUser", () => {
  it("throws when there is no session", async () => {
    vi.mocked(createClient).mockResolvedValue(makeFakeAuthClient({ user: null }) as never);

    await expect(requireUser()).rejects.toThrow("Not authorized");
  });

  it("throws for a pending account", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "pending" }));

    await expect(requireUser()).rejects.toThrow("Not authorized");
  });

  it("throws for a suspended account", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "suspended" }));

    await expect(requireUser()).rejects.toThrow("Not authorized");
  });

  it("FAILS CLOSED when the app_users lookup throws, rather than treating it as no-row/pending - and (BUG 4) throws the distinguishable 'unavailable' message, not the generic 'Not authorized'", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockRejectedValue(new Error("connection reset"));

    await expect(requireUser()).rejects.toThrow("temporarily unavailable");
    // And no insert-if-missing recovery attempt (BUG 3) - a LOOKUP FAILURE is
    // not the same as "no row"; this module cannot tell whether a row exists
    // and must not write during what might be an outage.
    expect(ensureAppUserRowExists).not.toHaveBeenCalled();
  });

  it("BUG 4 FIX: throws the distinguishable 'unavailable' message when getUser() itself fails with a transport error, not 'Not authorized' about the account", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({
        user: null,
        userError: { __isAuthError: true, name: "AuthRetryableFetchError", message: "fetch failed" },
      }) as never
    );

    await expect(requireUser()).rejects.toThrow("temporarily unavailable");
  });

  it("BUG 4 FIX: an ordinary signed-out visitor (no error at all) still gets 'Not authorized', never the 'unavailable' message", async () => {
    vi.mocked(createClient).mockResolvedValue(makeFakeAuthClient({ user: null }) as never);

    await expect(requireUser()).rejects.toThrow("Not authorized");
  });

  it("BUG 3 FIX: a denied decision with NO app_users row at all creates that bare row via ensureAppUserRowExists before throwing", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "rowless-user", email: "rowless@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow("Not authorized");

    expect(ensureAppUserRowExists).toHaveBeenCalledTimes(1);
    expect(ensureAppUserRowExists).toHaveBeenCalledWith("rowless-user");
  });

  it("BUG 3 FIX: does NOT attempt the insert-only recovery for an account that already has a row - a denied request performs no OTHER reconciliation write, and this recovery is no exception", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "pending" }));

    await expect(requireUser()).rejects.toThrow("Not authorized");

    expect(ensureAppUserRowExists).not.toHaveBeenCalled();
  });

  it("BUG 3 FIX: a FAILED insert-only recovery still throws the original denial, never surfacing its own error", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "rowless-user-2", email: "rowless2@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(null);
    vi.mocked(ensureAppUserRowExists).mockRejectedValue(new Error("insert failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(requireUser()).rejects.toThrow("Not authorized");

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("authorizes an active instructor and returns the superset shape", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "active", role: "instructor" }));

    const result = await requireUser();

    expect(result).toEqual({ id: "u1", email: "m@example.com", role: "instructor", status: "active" });
  });

  it("authorizes an allowlisted email through the break-glass path even with no app_users row", async () => {
    process.env.OWNER_EMAILS = "boss@example.com";
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "boss@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(null);

    const result = await requireUser();

    expect(result.role).toBe("owner");
    expect(result.status).toBe("active");
    // The break-glass path grants access with no row at all - ensureAppUser
    // is still called so the row gets created/promoted for future reads
    // (e.g. the admin surface, or display_name lookups) even though this
    // request's own authorization never depended on it.
    expect(ensureAppUser).toHaveBeenCalledWith({ id: "u1" });
  });

  it("reconciles the caller's own app_users row via ensureAppUser once authorized", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "active", role: "instructor" }));

    await requireUser();

    expect(ensureAppUser).toHaveBeenCalledTimes(1);
    expect(ensureAppUser).toHaveBeenCalledWith({ id: "u1" });
  });

  it("ROUND-TRIP REGRESSION: skips ensureAppUser entirely for an already fully-reconciled row - no admin.getUserById call and no row fetch beyond the guard's own getAppUser call", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(
      // BUG 7: email must also match the verified auth email for this row to
      // be truly "fully-reconciled" - fakeAppUserRow()'s own default email
      // ("person@example.com") would otherwise read as stale against this
      // test's signed-in user and defeat the round-trip assertion below.
      fakeAppUserRow({ email: "m@example.com", status: "active", role: "instructor", displayName: "Already Set" })
    );

    const result = await requireUser();

    expect(result).toEqual({ id: "u1", email: "m@example.com", role: "instructor", status: "active" });
    // ensureAppUser is what issues auth.admin.getUserById and the uncached
    // fetchAppUserRow read - asserting it is never called IS the assertion
    // that neither of those two round trips happened.
    expect(ensureAppUser).not.toHaveBeenCalled();
    // And the guard's own getAppUser lookup (inside resolveSessionAccess)
    // ran exactly once - no second row fetch snuck in anywhere else.
    expect(getAppUser).toHaveBeenCalledTimes(1);
  });

  it("still calls ensureAppUser when the row is correct except for an empty display_name - the predicate's conservative case", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(
      fakeAppUserRow({ status: "active", role: "instructor", displayName: "" })
    );

    await requireUser();

    expect(ensureAppUser).toHaveBeenCalledTimes(1);
    expect(ensureAppUser).toHaveBeenCalledWith({ id: "u1" });
  });

  it("still calls ensureAppUser for an allowlisted email whose row is not yet owner/active, even though a row exists", async () => {
    process.env.OWNER_EMAILS = "boss@example.com";
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "boss@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(
      fakeAppUserRow({ status: "pending", role: "instructor", displayName: "Boss" })
    );

    await requireUser();

    expect(ensureAppUser).toHaveBeenCalledTimes(1);
  });

  it("skips ensureAppUser for an allowlisted email whose row is ALREADY owner/active with a display name", async () => {
    process.env.OWNER_EMAILS = "boss@example.com";
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "boss@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(
      // BUG 7: email must match the verified auth email too - see the
      // ROUND-TRIP REGRESSION test above for the same fixture gap.
      fakeAppUserRow({ email: "boss@example.com", status: "active", role: "owner", displayName: "Boss" })
    );

    const result = await requireUser();

    expect(result.role).toBe("owner");
    expect(ensureAppUser).not.toHaveBeenCalled();
  });

  it("does NOT call ensureAppUser for a pending account - a denied request performs no reconciliation", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "pending" }));

    await expect(requireUser()).rejects.toThrow("Not authorized");

    expect(ensureAppUser).not.toHaveBeenCalled();
  });

  it("does NOT call ensureAppUser for a suspended account", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "suspended" }));

    await expect(requireUser()).rejects.toThrow("Not authorized");

    expect(ensureAppUser).not.toHaveBeenCalled();
  });

  it("WRITE-PER-REQUEST REGRESSION CANARY: a FAILED reconciliation still returns an authorized result, never denying an otherwise-valid request", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "active", role: "instructor" }));
    vi.mocked(ensureAppUser).mockRejectedValue(new Error("database unreachable"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await requireUser();

    expect(result).toEqual({ id: "u1", email: "m@example.com", role: "instructor", status: "active" });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("performs NO reconciliation at all on the impersonation path - an unattended run must not write account rows for the identity it impersonates", async () => {
    // BUG 2 FIX: role must be 'owner' here - see the CANARY test below.
    // requireUser()'s impersonation branch no longer honours a merely-active
    // non-owner identity (that used to be "member-3"/instructor here); this
    // test's own point (no reconciliation write on the impersonation path)
    // needs an identity that actually clears the branch to demonstrate it.
    const identity: OwnerIdentity = {
      id: "owner-3",
      email: "owner3@example.com",
      role: "owner",
      status: "active",
    };

    const result = await runAsOwner(identity, () => requireUser());

    expect(result).toEqual(identity);
    expect(ensureAppUser).not.toHaveBeenCalled();
    // And no cookie-bound session lookup happened either - the impersonation
    // branch returns before resolveSessionAccess ever runs.
    expect(createClient).not.toHaveBeenCalled();
  });

  it("BUG 2 CANARY: a non-owner identity in the impersonation store is refused by requireUser() too - the impersonation escalation this closes (docs/multi-user-login-acceptance-criteria.md, DEPLOY GATE BLOCK2) reaches every requireOwner() call site, since requireOwner() delegates to requireUser()", async () => {
    const identity: OwnerIdentity = {
      id: "member-escalation",
      email: "member-escalation@example.com",
      role: "instructor",
      status: "active",
    };

    await expect(runAsOwner(identity, () => requireUser())).rejects.toThrow("Not authorized");
  });

  it("requires the AAL2 step-up exactly like the original requireOwner() did", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({
        user: { id: "u1", email: "m@example.com" },
        currentLevel: "aal1",
        nextLevel: "aal2",
      }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "active" }));

    await expect(requireUser()).rejects.toThrow("Multi-factor authentication required");
  });
});

describe("requireAppOwner", () => {
  it("throws for an active instructor - active is not enough to be an owner", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "active", role: "instructor" }));

    await expect(requireAppOwner()).rejects.toThrow("Not authorized");
  });

  it("throws when the app_users lookup throws (fails closed) - and (BUG 4) with the distinguishable 'unavailable' message", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockRejectedValue(new Error("connection reset"));

    await expect(requireAppOwner()).rejects.toThrow("temporarily unavailable");
  });

  it("authorizes an active owner-role account", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "boss@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "active", role: "owner" }));

    const result = await requireAppOwner();

    expect(result).toEqual({ id: "u1", email: "boss@example.com", role: "owner", status: "active" });
  });

  it("authorizes the OWNER_EMAILS break-glass path even with a stale suspended row", async () => {
    process.env.OWNER_EMAILS = "boss@example.com";
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "boss@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "suspended", role: "instructor" }));

    const result = await requireAppOwner();

    expect(result.role).toBe("owner");
  });

  // CANARY - the exact privilege escalation owner-context.ts's fix closes:
  // AM3 amends the four runAsOwner callers to re-check "is an ACTIVE
  // account" rather than "is the owner", so a member's own scheduled
  // workflow can run. Combined with the ORIGINAL requireOwner(), which
  // honoured whatever sat in the ALS store immediately with no role check at
  // all, a merely-active (non-owner) impersonated identity would have been
  // accepted here too - letting a member's headless-safe workflow reach the
  // owner's Canvas/GitHub credentials via requireAppOwner(). This must fail.
  it("CANARY: a non-owner identity in the impersonation store fails requireAppOwner()", async () => {
    const identity: OwnerIdentity = {
      id: "member-1",
      email: "member@example.com",
      role: "instructor",
      status: "active",
    };

    await expect(runAsOwner(identity, () => requireAppOwner())).rejects.toThrow("Not authorized");
  });

  it("BUG 2 FIX: the SAME non-owner identity is now ALSO refused by requireUser() - the asymmetry this test used to pin (requireAppOwner() refuses, requireUser() accepts) is exactly BLOCK2's escalation, and no longer holds", async () => {
    const identity: OwnerIdentity = {
      id: "member-1",
      email: "member@example.com",
      role: "instructor",
      status: "active",
    };

    await expect(runAsOwner(identity, () => requireUser())).rejects.toThrow("Not authorized");
  });

  it("honours an owner identity in the impersonation store", async () => {
    const identity: OwnerIdentity = {
      id: "owner-1",
      email: "owner@example.com",
      role: "owner",
      status: "active",
    };

    const result = await runAsOwner(identity, () => requireAppOwner());

    expect(result).toEqual(identity);
  });

  it("refuses a non-active identity in the impersonation store even for requireUser()", async () => {
    const identity: OwnerIdentity = {
      id: "member-2",
      email: "member2@example.com",
      role: "instructor",
      status: "suspended",
    };

    await expect(runAsOwner(identity, () => requireUser())).rejects.toThrow("Not authorized");
  });

  it("refuses a non-active owner-role identity in the impersonation store for requireAppOwner() too", async () => {
    // role==='owner' alone must not be enough - a suspended/pending owner
    // account impersonated by mistake must not be honoured either.
    const identity: OwnerIdentity = {
      id: "owner-2",
      email: "owner2@example.com",
      role: "owner",
      status: "pending",
    };

    // requireAppOwner() only checks `role`, by design (see its own doc
    // comment) - this pins that this is a deliberate, narrow contract: the
    // four callers of runAsOwner are responsible for never impersonating a
    // non-active identity at all (resolveImpersonationIdentity always
    // returns status 'active' or null), so requireAppOwner() itself does not
    // re-derive status from an impersonated identity. Documented here so a
    // future reader does not "fix" this into a status check without
    // reading resolveImpersonationIdentity's contract first.
    const result = await runAsOwner(identity, () => requireAppOwner());
    expect(result.role).toBe("owner");
  });
});

describe("requireOwner (deprecated alias)", () => {
  it("is still exported and delegates to requireUser() - any active account, not owner-only", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "active", role: "instructor" }));

    const result = await requireOwner();

    expect(result).toEqual({ id: "u1", email: "m@example.com", role: "instructor", status: "active" });
  });

  it("still throws for a pending account", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "pending" }));

    await expect(requireOwner()).rejects.toThrow("Not authorized");
  });
});
