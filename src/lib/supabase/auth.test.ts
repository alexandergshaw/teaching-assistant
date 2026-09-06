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
    // Null is the honest default: only setAppUserRole stamps this, so a
    // fixture that has not been promoted by a human leaves it unset.
    roleGrantedBy: null,
    ...overrides,
  };
}

type FakeAuthUser = {
  id: string;
  email: string | null;
  /**
   * BUG 1 FIX coverage: resolveAccess's OWNER_EMAILS break-glass now also
   * requires `emailVerified`, which this module derives as
   * `Boolean(user?.email_confirmed_at)` - see resolveSessionAccess's own
   * comment. Optional and omitted by every test that does not care about
   * the break-glass, so those keep reading as unverified (`Boolean(undefined)
   * === false`), which is harmless for a non-allowlisted email.
   */
  email_confirmed_at?: string;
} | null;

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
      makeFakeAuthClient({
        user: { id: "u1", email: "boss@example.com", email_confirmed_at: "2026-01-01T00:00:00.000Z" },
      }) as never
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

  it("BUG 1 FIX: does NOT authorize an allowlisted-but-UNVERIFIED email through the break-glass path - it falls through to the normal stored-row path and is denied like anyone else with no row", async () => {
    process.env.OWNER_EMAILS = "boss@example.com";
    vi.mocked(createClient).mockResolvedValue(
      // No email_confirmed_at at all - Supabase has not confirmed this
      // address belongs to whoever created this account.
      makeFakeAuthClient({ user: { id: "u1", email: "boss@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow("Not authorized");

    // Denied via the ordinary no-row path (pending), not granted ownership -
    // and the insert-only recovery still runs (BUG 3), never the promoting
    // ensureAppUser.
    expect(ensureAppUserRowExists).toHaveBeenCalledWith("u1");
    expect(ensureAppUser).not.toHaveBeenCalled();
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
      makeFakeAuthClient({
        user: { id: "u1", email: "boss@example.com", email_confirmed_at: "2026-01-01T00:00:00.000Z" },
      }) as never
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
      makeFakeAuthClient({
        user: { id: "u1", email: "boss@example.com", email_confirmed_at: "2026-01-01T00:00:00.000Z" },
      }) as never
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

    // ADMIN-GUARD FIX: this used to assert the generic "Not authorized. Sign
    // in with an approved account." message - the EXACT message BUG 2 fixes,
    // since it is false for this test's own caller (an active, already
    // signed-in, already-approved account). Updated deliberately to the new
    // owner-only wording rather than left asserting a message that is no
    // longer thrown.
    await expect(requireAppOwner()).rejects.toThrow("limited to the workspace owner");
    await expect(requireAppOwner()).rejects.not.toThrow("Not authorized");
  });

  it("ADMIN-GUARD FIX: the active-non-owner denial is distinguishable from the generic 'Not authorized' message - an approved, signed-in instructor must never be told to sign in with an approved account when they already are one", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "active", role: "instructor" }));

    await expect(requireAppOwner()).rejects.toThrow("This action is limited to the workspace owner.");
  });

  it("ADMIN-GUARD FIX: pending/suspended/unavailable denials for requireAppOwner() keep their EXISTING wording - only the active case's message changed", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "m@example.com" } }) as never
    );

    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "pending", role: "instructor" }));
    await expect(requireAppOwner()).rejects.toThrow("Not authorized. Sign in with an approved account.");

    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "suspended", role: "instructor" }));
    await expect(requireAppOwner()).rejects.toThrow("Not authorized. Sign in with an approved account.");

    vi.mocked(getAppUser).mockRejectedValue(new Error("connection reset"));
    await expect(requireAppOwner()).rejects.toThrow(
      "The account service is temporarily unavailable. Please try again in a moment."
    );
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
      makeFakeAuthClient({
        user: { id: "u1", email: "boss@example.com", email_confirmed_at: "2026-01-01T00:00:00.000Z" },
      }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "suspended", role: "instructor" }));

    const result = await requireAppOwner();

    expect(result.role).toBe("owner");
  });

  it("BUG 1 FIX: does NOT authorize the OWNER_EMAILS break-glass path for an unverified email, even with a stale suspended row", async () => {
    process.env.OWNER_EMAILS = "boss@example.com";
    vi.mocked(createClient).mockResolvedValue(
      makeFakeAuthClient({ user: { id: "u1", email: "boss@example.com" } }) as never
    );
    vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow({ status: "suspended", role: "instructor" }));

    await expect(requireAppOwner()).rejects.toThrow("Not authorized");
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

  it("ADMIN-GUARD FIX: refuses a non-active owner-role identity in the impersonation store for requireAppOwner() too - role==='owner' alone is not enough", async () => {
    // This used to be honoured: requireAppOwner() checked `role` only, making
    // it the MORE privileged guard with the LOOSER impersonation
    // precondition of the two (requireUser() already refused this same
    // identity - see the parity test below). Fixed so a suspended/pending
    // owner account impersonated by mistake, or a hand-rolled identity that
    // never went through resolveImpersonationIdentity, is refused here too.
    const identity: OwnerIdentity = {
      id: "owner-2",
      email: "owner2@example.com",
      role: "owner",
      status: "pending",
    };

    await expect(runAsOwner(identity, () => requireAppOwner())).rejects.toThrow("Not authorized");
  });

  it("ADMIN-GUARD FIX / PARITY CANARY: requireUser() and requireAppOwner() agree on every impersonated role/status combination - this fails if either guard's impersonation precondition drifts from the other's", async () => {
    const statuses: Array<OwnerIdentity["status"]> = ["active", "pending", "suspended"];
    const roles: Array<OwnerIdentity["role"]> = ["owner", "instructor"];

    for (const status of statuses) {
      for (const role of roles) {
        const identity: OwnerIdentity = { id: "parity-check", email: "parity@example.com", role, status };

        const userOutcome = await runAsOwner(identity, () => requireUser())
          .then(() => "accepted" as const)
          .catch(() => "refused" as const);
        const ownerOutcome = await runAsOwner(identity, () => requireAppOwner())
          .then(() => "accepted" as const)
          .catch(() => "refused" as const);

        // Both guards must reach the SAME verdict for the SAME impersonated
        // identity - the exact property BUG 1 (the admin-capability review)
        // found broken: requireAppOwner(), the MORE privileged guard, had a
        // LOOSER precondition (role only) than requireUser() (role AND
        // status). Wrapped with { status, role } so a failure names which
        // combination diverged, rather than just "accepted" !== "refused".
        expect({ status, role, userOutcome }).toEqual({ status, role, userOutcome: ownerOutcome });

        const shouldAccept = role === "owner" && status === "active";
        expect({ status, role, userOutcome }).toEqual({
          status,
          role,
          userOutcome: shouldAccept ? "accepted" : "refused",
        });
      }
    }
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
