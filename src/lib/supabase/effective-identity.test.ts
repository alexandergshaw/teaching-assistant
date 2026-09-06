// Contract tests for getEffectiveIdentity() (./effective-identity.ts).
//
// Both modules it composes are fully mocked - "./auth" (requireUser) and
// "./owner-context" (getImpersonatedOwner) - so this file never reaches a
// real Supabase client and never exercises requireUser()'s or
// resolveImpersonationIdentity()'s own logic. Those are covered by
// auth.test.ts and owner-context.test.ts respectively; duplicating their
// assertions here would be the exact tautology this repo has already
// shipped once (see the "no cross-test-file imports" and "refactors disarm
// tests" project history) - this file only pins what getEffectiveIdentity()
// itself does with whatever the two mocks return.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./auth", () => ({
  requireUser: vi.fn(),
}));

vi.mock("./owner-context", () => ({
  getImpersonatedOwner: vi.fn(),
}));

import { requireUser } from "./auth";
import { getImpersonatedOwner } from "./owner-context";
import { getEffectiveIdentity } from "./effective-identity";

describe("getEffectiveIdentity", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(getImpersonatedOwner).mockReset();
  });

  it("falls through to requireUser()'s result when there is no impersonated identity", async () => {
    vi.mocked(getImpersonatedOwner).mockReturnValue(null);
    vi.mocked(requireUser).mockResolvedValue({
      id: "session-user",
      email: "person@example.com",
      role: "instructor",
      status: "active",
    });

    const result = await getEffectiveIdentity();

    expect(result).toEqual({
      id: "session-user",
      email: "person@example.com",
      role: "instructor",
      status: "active",
    });
    expect(requireUser).toHaveBeenCalledTimes(1);
  });

  it("returns the impersonated identity directly, without ever calling requireUser()", async () => {
    vi.mocked(getImpersonatedOwner).mockReturnValue({
      id: "impersonated-user",
      email: "member@example.com",
      role: "instructor",
      status: "active",
    });

    const result = await getEffectiveIdentity();

    expect(result).toEqual({
      id: "impersonated-user",
      email: "member@example.com",
      role: "instructor",
      status: "active",
    });
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("returns a non-owner impersonated identity too - this module does not reapply auth.ts's owner-only BLOCK2 stopgap (E-ARCH8)", async () => {
    vi.mocked(getImpersonatedOwner).mockReturnValue({
      id: "member-impersonated",
      email: "member@example.com",
      role: "instructor",
      status: "active",
    });

    const result = await getEffectiveIdentity();

    expect(result.role).toBe("instructor");
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("returns an owner-role impersonated identity too, unconditionally, the same way", async () => {
    vi.mocked(getImpersonatedOwner).mockReturnValue({
      id: "owner-impersonated",
      email: "owner@example.com",
      role: "owner",
      status: "active",
    });

    const result = await getEffectiveIdentity();

    expect(result.role).toBe("owner");
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("passes a non-active impersonated identity through unchanged rather than re-checking status - resolveImpersonationIdentity's own contract already guarantees this input can never actually be suspended, so there is nothing left for this module to re-check", async () => {
    vi.mocked(getImpersonatedOwner).mockReturnValue({
      id: "suspended-somehow",
      email: "suspended@example.com",
      role: "instructor",
      status: "suspended",
    });

    const result = await getEffectiveIdentity();

    expect(result).toStrictEqual({
      id: "suspended-somehow",
      email: "suspended@example.com",
      role: "instructor",
      status: "suspended",
    });
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("propagates requireUser()'s rejection (e.g. NOT_AUTHORIZED_MESSAGE) when there is no impersonation and no valid session", async () => {
    vi.mocked(getImpersonatedOwner).mockReturnValue(null);
    vi.mocked(requireUser).mockRejectedValue(
      new Error("Not authorized. Sign in with an approved account.")
    );

    await expect(getEffectiveIdentity()).rejects.toThrow("Not authorized");
  });

  it("maps every OwnerIdentity field honestly - nothing invented, nothing dropped", async () => {
    vi.mocked(getImpersonatedOwner).mockReturnValue({
      id: "abc-123",
      email: "weird+case@example.com",
      role: "instructor",
      status: "active",
    });

    const result = await getEffectiveIdentity();

    expect(result).toStrictEqual({
      id: "abc-123",
      email: "weird+case@example.com",
      role: "instructor",
      status: "active",
    });
    expect(Object.keys(result).sort()).toEqual(["email", "id", "role", "status"]);
  });
});
