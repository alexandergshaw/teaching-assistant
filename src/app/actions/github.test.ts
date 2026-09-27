// R4 (docs/r4-scope.md section 5/6): ingestRepoAction is its own
// client-reachable "use server" endpoint on the same GitHub-PAT chain as
// extractDeckSourceRepoAction (deck-source.ts), referenced from the workflow
// registry that ships in the client bundle. Its guard moved from the
// permissive requireOwner() alias to requireAppOwner() at github.ts:260.
//
// Executes the REAL guard: mocks the client ("./server") and the app-users
// lookup ("./app-users"), the idiom in src/lib/supabase/auth.test.ts:19-30 -
// never a module mock of "@/lib/supabase/auth" itself, which would replace
// the guard with a stub and never run it. This file duplicates the small
// fixture helpers locally per this repo's rule against cross-test-file
// imports (auth.test.ts:13-16).
//
// This module also imports @/lib/github, which reaches live network code
// (ghFetch etc.) - none of that runs here because a non-owner is refused
// before ingestRepoAction calls parseRepoRef or ingestRepo.
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
import { ingestRepoAction } from "./github";

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

describe("ingestRepoAction - R4 guard swap", () => {
  it("rejects an active, signed-in non-owner with the owner-only message - the guard actually runs, not a mocked stub", async () => {
    const result = await ingestRepoAction("owner/repo");

    expect(result).toEqual({ error: "This action is limited to the workspace owner." });
  });
});
