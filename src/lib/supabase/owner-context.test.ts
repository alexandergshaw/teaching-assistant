// Tests for resolveImpersonationIdentity (this module) - the identity
// resolution step all four runAsOwner callers (cron schedules, the
// per-trigger webhook token route, the GitHub push webhook, and the
// unattended event-trigger loop) use before impersonating an account. See
// this module's own security preamble for the full caller list and the
// rationale for what OwnerIdentity carries.
//
// This suite exists to prove the fix for the gap the previous agent's
// `emailVerified`-required change to resolveAccess (src/lib/access.ts)
// exposed HERE: resolveImpersonationIdentity is a THIRD caller of
// resolveAccess (alongside the request gate in proxy.ts and the
// server-action guard in auth.ts), and it must never pass a hard-coded
// `true` (or otherwise supply a permissive value) for `emailVerified` -
// doing so would let an allowlisted-but-unconfirmed address impersonate the
// owner through any of the four unattended entry points. See BUG 1 in
// docs/REGRESSION.md (or the deploy history) for the concrete exploit this
// closes.
//
// No live Supabase is available under vitest (see vitest.config.ts's
// blanked-out env), so "./app-users"'s getAppUser is mocked. Deliberately
// duplicates its own fake rather than importing another *.test.ts file's
// helpers - importing a helper from another test file re-runs that file's
// own describe blocks (repo rule).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./app-users")>();
  return { ...actual, getAppUser: vi.fn() };
});

import { getAppUser, type AppUserRow } from "./app-users";
import { resolveImpersonationIdentity } from "./owner-context";

function fakeAppUserRow(overrides: Partial<AppUserRow> = {}): AppUserRow {
  return {
    id: "u1",
    email: "boss@example.com",
    displayName: null,
    status: "active",
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

const ORIGINAL_OWNER_EMAILS = process.env.OWNER_EMAILS;

beforeEach(() => {
  vi.mocked(getAppUser).mockReset();
  process.env.OWNER_EMAILS = "boss@example.com";
});

afterEach(() => {
  if (ORIGINAL_OWNER_EMAILS === undefined) delete process.env.OWNER_EMAILS;
  else process.env.OWNER_EMAILS = ORIGINAL_OWNER_EMAILS;
});

describe("resolveImpersonationIdentity", () => {
  it("SECURITY: does NOT resolve an allowlisted-but-UNVERIFIED address to an owner identity, even though its stored row is active", async () => {
    vi.mocked(getAppUser).mockResolvedValue(
      fakeAppUserRow({ role: "instructor", status: "active" })
    );

    const identity = await resolveImpersonationIdentity("u1", "boss@example.com", false);

    // The account is still impersonable (it is an active row) - what must
    // NOT happen is the OWNER_EMAILS break-glass promoting it to "owner"
    // purely because the address matches, with no confirmed email behind it.
    expect(identity).not.toBeNull();
    expect(identity?.role).toBe("instructor");
  });

  it("grants owner impersonation for the SAME allowlisted address once verified - the only difference from the previous test is emailVerified", async () => {
    vi.mocked(getAppUser).mockResolvedValue(
      fakeAppUserRow({ role: "instructor", status: "active" })
    );

    const identity = await resolveImpersonationIdentity("u1", "boss@example.com", true);

    expect(identity?.role).toBe("owner");
  });

  it("SECURITY: an allowlisted-but-unverified address with no stored app_users row at all resolves to null, not owner", async () => {
    vi.mocked(getAppUser).mockResolvedValue(null);

    const identity = await resolveImpersonationIdentity("u1", "boss@example.com", false);

    expect(identity).toBeNull();
  });

  it("SECURITY: an allowlisted-but-unverified address whose app_users lookup fails fails CLOSED (null), not owner", async () => {
    vi.mocked(getAppUser).mockRejectedValue(new Error("connection reset"));

    const identity = await resolveImpersonationIdentity("u1", "boss@example.com", false);

    expect(identity).toBeNull();
  });

  it("a non-allowlisted active account's role is unaffected by emailVerified either way - the flag only ever gates the break-glass", async () => {
    process.env.OWNER_EMAILS = "someone-else@example.com";
    vi.mocked(getAppUser).mockResolvedValue(
      fakeAppUserRow({ email: "member@example.com", role: "instructor", status: "active" })
    );

    const unverified = await resolveImpersonationIdentity("u2", "member@example.com", false);
    const verified = await resolveImpersonationIdentity("u2", "member@example.com", true);

    expect(unverified?.role).toBe("instructor");
    expect(verified?.role).toBe("instructor");
  });
});
