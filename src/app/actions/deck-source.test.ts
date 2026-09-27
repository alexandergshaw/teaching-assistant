// R4 (docs/r4-scope.md section 3/6): executes the REAL guard rather than
// grepping for its name. Mocks the client ("./server") and the app-users
// lookup ("./app-users"), exactly the idiom in
// src/lib/supabase/auth.test.ts:19-30 - never a module mock of
// "@/lib/supabase/auth" itself, which would replace the guard with a stub and
// never run it. Per this repo's rule against cross-test-file imports
// (auth.test.ts:13-16), the small fixture helpers below are duplicated
// locally rather than imported from auth.test.ts.
//
// The contrast pair is meaningful here because deck-source.ts has a real
// strict sibling split: extractDeckSourceFileAction stays on requireUser()
// (no owner-only resource on its path) while extractDeckSourceRepoAction
// moves to requireAppOwner() (it reaches the deployment's single GitHub PAT
// via ingestRepoAction - see docs/r4-scope.md section 2.2). Using the
// identical mocked "active non-owner" identity for both calls proves the
// split is deliberate, not accidental.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});

import { createClient } from "@/lib/supabase/server";
import { getAppUser, ensureAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { extractDeckSourceFileAction, extractDeckSourceRepoAction } from "./deck-source";

function fakeAppUserRow(overrides: Partial<AppUserRow> = {}): AppUserRow {
  return {
    id: "u1",
    email: "person@example.com",
    displayName: null,
    status: "active",
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

function makeFakeAuthClient(userId: string, email: string) {
  return {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: userId, email } },
          error: null,
        }),
      mfa: {
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({
            data: { currentLevel: "aal1", nextLevel: "aal1" },
            error: null,
          }),
      },
    },
  };
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(getAppUser).mockReset();
  vi.mocked(ensureAppUser).mockReset();
  vi.mocked(ensureAppUser).mockResolvedValue(fakeAppUserRow());
  vi.mocked(createClient).mockResolvedValue(makeFakeAuthClient("u1", "m@example.com") as never);
  vi.mocked(getAppUser).mockResolvedValue(
    fakeAppUserRow({ email: "m@example.com", status: "active", role: "instructor" })
  );
});

describe("extractDeckSourceRepoAction - R4 guard swap", () => {
  it("rejects an active, signed-in non-owner with the owner-only message - the guard actually runs, not a mocked stub", async () => {
    await expect(extractDeckSourceRepoAction("owner/repo")).rejects.toThrow("limited to the workspace owner");
  });
});

describe("extractDeckSourceFileAction - contrast, stays requireUser()", () => {
  it("does NOT reject an active non-owner with the owner-only message - the same identity that requireAppOwner() refuses is admitted here", async () => {
    const result = await extractDeckSourceFileAction("x.txt", "");

    expect(result).toEqual({ error: "Choose a source file." });
  });
});
