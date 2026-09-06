// Behavioural coverage for the five owner-only account-admin actions
// (./actions.ts). Every collaborator these actions call into is mocked EXCEPT
// canPerformAccountAction (src/lib/account-admin-rules.ts), which is left real
// - it is a pure function with its own dedicated test suite, and exercising it
// for real here proves the actions wire the context together correctly rather
// than merely proving they call a mock the way they were told to.
//
// requireAppOwner is mocked (never the real Supabase-backed implementation) -
// these tests are about what performAccountAction does ONCE the caller is
// already authorized, plus the not_authorized short-circuit when it is not.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/supabase/app-users", () => ({
  getAppUser: vi.fn(),
  setAppUserStatus: vi.fn(),
  setAppUserRole: vi.fn(),
  countEffectiveOwners: vi.fn(),
}));

vi.mock("@/lib/owner", () => ({
  isOwnerEmail: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { requireAppOwner, type AuthorizedUser } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getAppUser,
  setAppUserStatus,
  setAppUserRole,
  countEffectiveOwners,
  type AppUserRow,
} from "@/lib/supabase/app-users";
import { isOwnerEmail } from "@/lib/owner";
import { revalidatePath } from "next/cache";
import {
  approveAccountAction,
  suspendAccountAction,
  restoreAccountAction,
  promoteAccountAction,
  demoteAccountAction,
} from "./actions";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const TARGET_ID = "22222222-2222-2222-2222-222222222222";

function makeRow(overrides: Partial<AppUserRow> = {}): AppUserRow {
  return {
    id: TARGET_ID,
    email: "person@example.edu",
    displayName: "Person",
    status: "pending",
    role: "instructor",
    approvedAt: null,
    approvedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    statusChangedAt: null,
    statusChangedBy: null,
    roleGrantedBy: null,
    ...overrides,
  };
}

function ownerActor(overrides: Partial<AuthorizedUser> = {}): AuthorizedUser {
  return { id: OWNER_ID, email: "owner@example.edu", role: "owner", status: "active", ...overrides };
}

/** Authorizes the caller as the (non-self, unless overridden) owner. */
function mockOwnerActor(overrides: Partial<AuthorizedUser> = {}) {
  vi.mocked(requireAppOwner).mockResolvedValue(ownerActor(overrides));
}

/** A fake service client exposing only the `.auth.admin.getUserById` surface these actions read. */
function fakeServiceClientWithEmailConfirmedAt(emailConfirmedAt: string | null) {
  return {
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { email_confirmed_at: emailConfirmedAt } },
          error: null,
        }),
      },
    },
  } as unknown as ReturnType<typeof createServiceClient>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isOwnerEmail).mockReturnValue(false);
  vi.mocked(countEffectiveOwners).mockResolvedValue(5);
});

describe("account admin actions: authorization (step 1)", () => {
  it("returns not_authorized for every action when requireAppOwner denies the caller, without touching the target", async () => {
    vi.mocked(requireAppOwner).mockRejectedValue(new Error("This action is limited to the workspace owner."));

    expect(await approveAccountAction(TARGET_ID)).toEqual({ kind: "not_authorized" });
    expect(await suspendAccountAction(TARGET_ID)).toEqual({ kind: "not_authorized" });
    expect(await restoreAccountAction(TARGET_ID)).toEqual({ kind: "not_authorized" });
    expect(await promoteAccountAction(TARGET_ID)).toEqual({ kind: "not_authorized" });
    expect(await demoteAccountAction(TARGET_ID)).toEqual({ kind: "not_authorized" });

    expect(getAppUser).not.toHaveBeenCalled();
  });
});

describe("account admin actions: accountId validation (step 2)", () => {
  it("refuses a malformed accountId before any query runs", async () => {
    mockOwnerActor();

    const result = await suspendAccountAction("not-a-uuid");

    expect(result).toEqual({ kind: "invalid_id" });
    expect(getAppUser).not.toHaveBeenCalled();
    expect(countEffectiveOwners).not.toHaveBeenCalled();
  });

  it("refuses a non-string accountId the same way (a server action is an unauthenticated endpoint)", async () => {
    mockOwnerActor();

    // @ts-expect-error - deliberately calling with a shape the wire protocol
    // could hand this function despite the TypeScript signature saying `string`.
    const result = await suspendAccountAction(12345);

    expect(result).toEqual({ kind: "invalid_id" });
    expect(getAppUser).not.toHaveBeenCalled();
  });
});

describe("account admin actions: target lookup (step 3)", () => {
  it("returns not_found when the target row does not exist", async () => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockResolvedValue(null);

    expect(await approveAccountAction(TARGET_ID)).toEqual({ kind: "not_found" });
  });

  it("returns failed, never the raw error, when the target lookup itself throws", async () => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockRejectedValue(new Error("Could not read app_users row 1: connection reset by peer"));

    expect(await approveAccountAction(TARGET_ID)).toEqual({ kind: "failed" });
  });

  it("returns failed when the fresh owner-count query throws", async () => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ status: "pending" }));
    vi.mocked(countEffectiveOwners).mockRejectedValue(new Error("Could not count effective owners: timeout"));

    expect(await approveAccountAction(TARGET_ID)).toEqual({ kind: "failed" });
  });

  it("recomputes the owner count fresh on every call rather than reusing a prior value (GC5)", async () => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ status: "active", role: "owner" }));
    vi.mocked(countEffectiveOwners).mockResolvedValue(1);

    await suspendAccountAction(TARGET_ID);
    await suspendAccountAction(TARGET_ID);

    expect(countEffectiveOwners).toHaveBeenCalledTimes(2);
  });
});

describe("account admin actions: rules refusal, exercised through the real canPerformAccountAction", () => {
  it("refuses an owner acting on their own row, with that rule's own reason, and never mutates", async () => {
    mockOwnerActor({ id: TARGET_ID });
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ id: TARGET_ID, status: "active", role: "owner" }));
    vi.mocked(countEffectiveOwners).mockResolvedValue(3);

    const result = await suspendAccountAction(TARGET_ID);

    expect(result).toEqual({ kind: "refused", reason: "You cannot suspend your own account." });
    expect(setAppUserStatus).not.toHaveBeenCalled();
  });

  it("refuses demoting the last active owner", async () => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ status: "active", role: "owner" }));
    vi.mocked(countEffectiveOwners).mockResolvedValue(1);

    const result = await demoteAccountAction(TARGET_ID);

    expect(result).toEqual({ kind: "refused", reason: "This is the last active owner and cannot be demoted." });
    expect(setAppUserRole).not.toHaveBeenCalled();
  });

  it("refuses suspending an allowlisted, email-VERIFIED target, and never calls setAppUserStatus", async () => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ status: "active", role: "instructor", email: "vip@example.edu" }));
    vi.mocked(isOwnerEmail).mockReturnValue(true);
    vi.mocked(createServiceClient).mockReturnValue(fakeServiceClientWithEmailConfirmedAt("2026-01-01T00:00:00.000Z"));

    const result = await suspendAccountAction(TARGET_ID);

    expect(result).toEqual({
      kind: "refused",
      reason: "This account is protected by the owner allowlist and cannot be suspended.",
    });
    expect(setAppUserStatus).not.toHaveBeenCalled();
  });

  it("does NOT extend allowlist protection to an allowlisted-but-UNVERIFIED address - the exploitable half-condition this action must not supply", async () => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ status: "active", role: "instructor", email: "claimant@example.edu" }));
    vi.mocked(isOwnerEmail).mockReturnValue(true);
    vi.mocked(createServiceClient).mockReturnValue(fakeServiceClientWithEmailConfirmedAt(null));

    const result = await suspendAccountAction(TARGET_ID);

    // Not allowlisted (never verified) + active + not self + owners to spare
    // -> the ordinary active-account suspend path is ALLOWED, exactly as it
    // would be for any other unremarkable instructor row.
    expect(result).toEqual({ kind: "ok" });
    expect(setAppUserStatus).toHaveBeenCalledWith(TARGET_ID, "suspended", OWNER_ID);
  });

  it("never calls the admin API at all when the target's email is not on the allowlist (cost only paid when it could matter)", async () => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ status: "active" }));
    vi.mocked(isOwnerEmail).mockReturnValue(false);

    const result = await suspendAccountAction(TARGET_ID);

    expect(result).toEqual({ kind: "ok" });
    expect(createServiceClient).not.toHaveBeenCalled();
  });
});

describe("account admin actions: success path (steps 4-5)", () => {
  it("approves a pending account, writes via setAppUserStatus, and revalidates the list", async () => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ status: "pending" }));
    vi.mocked(setAppUserStatus).mockResolvedValue(makeRow({ status: "active" }));

    const result = await approveAccountAction(TARGET_ID);

    expect(result).toEqual({ kind: "ok" });
    expect(setAppUserStatus).toHaveBeenCalledWith(TARGET_ID, "active", OWNER_ID);
    expect(revalidatePath).toHaveBeenCalledWith("/account/people");
  });

  it("restores a suspended account", async () => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ status: "suspended" }));
    vi.mocked(setAppUserStatus).mockResolvedValue(makeRow({ status: "active" }));

    const result = await restoreAccountAction(TARGET_ID);

    expect(result).toEqual({ kind: "ok" });
    expect(setAppUserStatus).toHaveBeenCalledWith(TARGET_ID, "active", OWNER_ID);
  });

  it("allows an owner to restore their OWN suspended row - restore is exempt from the self-action guard", async () => {
    mockOwnerActor({ id: TARGET_ID });
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ id: TARGET_ID, status: "suspended" }));
    vi.mocked(setAppUserStatus).mockResolvedValue(makeRow({ id: TARGET_ID, status: "active" }));

    const result = await restoreAccountAction(TARGET_ID);

    expect(result).toEqual({ kind: "ok" });
  });

  it("promotes an active instructor to owner", async () => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ status: "active", role: "instructor" }));
    vi.mocked(setAppUserRole).mockResolvedValue(makeRow({ role: "owner" }));

    const result = await promoteAccountAction(TARGET_ID);

    expect(result).toEqual({ kind: "ok" });
    expect(setAppUserRole).toHaveBeenCalledWith(TARGET_ID, "owner", OWNER_ID);
  });

  it("demotes an owner to instructor when a spare owner exists", async () => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ status: "active", role: "owner" }));
    vi.mocked(countEffectiveOwners).mockResolvedValue(2);
    vi.mocked(setAppUserRole).mockResolvedValue(makeRow({ role: "instructor" }));

    const result = await demoteAccountAction(TARGET_ID);

    expect(result).toEqual({ kind: "ok" });
    expect(setAppUserRole).toHaveBeenCalledWith(TARGET_ID, "instructor", OWNER_ID);
  });
});

describe("account admin actions: suspend failure classification", () => {
  beforeEach(() => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ status: "active" }));
  });

  it("classifies a provider ban-call failure - the row is never touched", async () => {
    vi.mocked(setAppUserStatus).mockRejectedValue(
      new Error(`Could not suspend the Supabase session for app_users ${TARGET_ID}: rate limited`)
    );

    expect(await suspendAccountAction(TARGET_ID)).toEqual({ kind: "suspend_provider_failed" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("classifies a row-write failure that was successfully reversed", async () => {
    vi.mocked(setAppUserStatus).mockRejectedValue(
      new Error(
        `Could not set status for app_users ${TARGET_ID}: constraint violation. The provider-side ban has been ` +
          `reversed so the account is not left locked out while this write keeps failing - retry once the ` +
          `underlying error is resolved.`
      )
    );

    expect(await suspendAccountAction(TARGET_ID)).toEqual({ kind: "suspend_reversed" });
  });

  it("classifies the unrecoverable locked-out case (the most alarming state this system can produce)", async () => {
    vi.mocked(setAppUserStatus).mockRejectedValue(
      new Error(
        `Could not set status for app_users ${TARGET_ID}: constraint violation. The account was already banned at ` +
          `the provider, and reversing that ban ALSO failed (network error) - the account may be locked out at the ` +
          `provider with no automatic recovery. This needs manual intervention at the auth provider (lift the ban ` +
          `on user ${TARGET_ID} directly).`
      )
    );

    expect(await suspendAccountAction(TARGET_ID)).toEqual({ kind: "suspend_locked_out" });
  });

  it("falls back to the generic failed kind for an unrecognised suspend error, never echoing it", async () => {
    vi.mocked(setAppUserStatus).mockRejectedValue(new Error("something entirely unanticipated"));

    expect(await suspendAccountAction(TARGET_ID)).toEqual({ kind: "failed" });
  });
});

describe("account admin actions: non-suspend mutation failure never leaks the provider message", () => {
  it("maps an approve failure to the generic failed kind", async () => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ status: "pending" }));
    vi.mocked(setAppUserStatus).mockRejectedValue(new Error("Could not set status for app_users x: raw pg error 23505"));

    const result = await approveAccountAction(TARGET_ID);

    expect(result).toEqual({ kind: "failed" });
    expect(JSON.stringify(result)).not.toContain("23505");
  });

  it("maps a promote failure to the generic failed kind", async () => {
    mockOwnerActor();
    vi.mocked(getAppUser).mockResolvedValue(makeRow({ status: "active", role: "instructor" }));
    vi.mocked(setAppUserRole).mockRejectedValue(new Error("Could not set role for app_users x: raw pg error"));

    expect(await promoteAccountAction(TARGET_ID)).toEqual({ kind: "failed" });
  });
});
