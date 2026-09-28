// RULING 137 (docs/r2-overtightening-audit.md finding F2): R2 sub-wave 2
// converted fetchSubmissionRepoAction (submission-repo.ts:35) from
// requireOwner() to requireAppOwner() and verified it BY COUNT (the 71-site
// enumeration), not by execution - submission-repo.test.ts:9-11 module-mocks
// "@/lib/supabase/auth" wholesale, so the real guard never runs there. This
// file is the missing executing-guard host, built on the idiom landed in
// canvas-inbox.guard.test.ts and grading.guard.test.ts: mock the client
// ("@/lib/supabase/server") and the app-users lookup
// ("@/lib/supabase/app-users") - never "@/lib/supabase/auth" itself, which
// would replace the guard with a stub and never run it.
//
// fetchSubmissionRepoAction wraps its ENTIRE body, including the
// requireAppOwner() call, in one try/catch (submission-repo.ts:34-118) that
// returns `{ error: err.message }` rather than letting anything reject - this
// is the "returns an error object, not a throw" shape, confirmed by reading
// the source rather than assumed: there is no separate try/catch around the
// guard call, so the outer catch is what turns requireAppOwner()'s thrown
// OWNER_ONLY_MESSAGE into the returned error.
//
// The GitHub client (getRepo/getRepoTree/getFileText/listCommits) is the
// sensitive, PAT-spending dependency this guard exists to protect - it is
// module-mocked so a refusal that still reached GitHub would be caught.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});

vi.mock("@/lib/github", () => ({
  getRepo: vi.fn(),
  getRepoTree: vi.fn(),
  getFileText: vi.fn(),
  listCommits: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getAppUser, ensureAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { requireAppOwner, OWNER_ONLY_MESSAGE } from "@/lib/supabase/auth";
import { getRepo, getRepoTree, getFileText, listCommits } from "@/lib/github";
import { fetchSubmissionRepoAction } from "./submission-repo";

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
  // Active, signed-in, but NOT the owner - the identity every permissive
  // action in this migration admits and every restrictive one refuses.
  vi.mocked(getAppUser).mockResolvedValue(
    fakeAppUserRow({ email: "m@example.com", status: "active", role: "instructor" })
  );

  vi.mocked(getRepo).mockReset();
  vi.mocked(getRepoTree).mockReset();
  vi.mocked(getFileText).mockReset();
  vi.mocked(listCommits).mockReset();
});

const OWNER_ONLY_ERROR = { error: OWNER_ONLY_MESSAGE };

describe("fetchSubmissionRepoAction guard (RULING 137 / F2)", () => {
  it("refuses an active, signed-in non-owner with the owner-only message, returned as an error object (the action's whole body is one try/catch, so the thrown guard error is caught, not left to reject)", async () => {
    const result = await fetchSubmissionRepoAction("https://github.com/octo/cat");
    expect(result).toEqual(OWNER_ONLY_ERROR);
  });

  it("never reaches the GitHub client (the PAT-spending dependency) for that same refused session", async () => {
    await fetchSubmissionRepoAction("https://github.com/octo/cat");
    expect(getRepo).not.toHaveBeenCalled();
    expect(getRepoTree).not.toHaveBeenCalled();
    expect(getFileText).not.toHaveBeenCalled();
    expect(listCommits).not.toHaveBeenCalled();
  });

  // Non-vacuity control: prove the mocked session is real by showing the
  // real requireAppOwner() rejects it directly, independent of this action's
  // own try/catch. Without this, a mis-built fake session (e.g. one that
  // accidentally satisfies isOwnerDecision) would make the assertion above
  // pass for the wrong reason.
  it("the same non-owner session the action refuses is itself refused by the real requireAppOwner()", async () => {
    await expect(requireAppOwner()).rejects.toThrow(OWNER_ONLY_MESSAGE);
  });
});
