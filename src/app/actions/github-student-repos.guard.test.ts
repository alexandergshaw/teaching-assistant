// R2 wave 1, sub-wave 5 (docs/r2-wave1-subwaves.md section 4, row SW5): the 3
// requireOwner() sites in this file. Re-derived rather than inherited: every
// one of the 3 actions below calls a function imported from "@/lib/github"
// directly in its own body - studentRepoInvitationStatusAction calls
// listOrgRepos/listRepoInvitations/listRepoCollaborators,
// resendStudentRepoInviteAction calls
// listRepoInvitations/deleteRepoInvitation/setRepoCollaborator, and
// revokeStudentRepoInviteAction calls deleteRepoInvitation - so every site
// reaches the shared GitHub personal access token, exactly the shape
// src/lib/supabase/auth.ts's requireAppOwner() doc comment (":369-375")
// reserves it for. None of the 3 is added to GITHUB_NOT_OWNER_ONLY; all 3 are
// restrictive.
//
// This file DOES have a sibling test (github-student-repos.test.ts), but that
// file module-mocks "@/lib/supabase/auth" wholesale (stubbing the guard away
// so it never runs) - the exact shape this repo's rule says cannot host an
// executing guard test. This *.guard.test.ts is the executing-guard host
// instead; github-student-repos.test.ts's stale auth mock (naming only the
// old requireOwner()) is fixed separately, in the same edit, to name
// requireAppOwner() instead so it does not break now that production calls
// it.
//
// Executes the REAL guard: mocks the client ("@/lib/supabase/server") and the
// app-users lookup ("@/lib/supabase/app-users"), the idiom in
// src/lib/supabase/auth.test.ts:19-30 and github.test.ts - never a module
// mock of "@/lib/supabase/auth" itself, which would replace the guard with a
// stub and never run it. This module also imports @/lib/github, which
// reaches live network code (ghFetch etc.) - none of that runs here because a
// non-owner is refused before any action below reaches a @/lib/github call.
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
import {
  studentRepoInvitationStatusAction,
  resendStudentRepoInviteAction,
  revokeStudentRepoInviteAction,
} from "./github-student-repos";

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

const OWNER_ONLY_ERROR = { error: "This action is limited to the workspace owner." };

const sw5Cases: Array<[string, () => Promise<unknown>]> = [
  [
    "studentRepoInvitationStatusAction",
    () => studentRepoInvitationStatusAction("my-org", "cs101", "Smith, John | jsmith"),
  ],
  ["resendStudentRepoInviteAction", () => resendStudentRepoInviteAction("my-org", "cs101-smith-john", "jsmith", "push")],
  ["revokeStudentRepoInviteAction", () => revokeStudentRepoInviteAction("my-org", "cs101-smith-john", 55)],
];

describe("github-student-repos.ts sites 1-3 - R2 SW5 guard swap", () => {
  it.each(sw5Cases)(
    "%s rejects an active, signed-in non-owner with the owner-only message - the guard actually runs, not a mocked stub",
    async (_name, run) => {
      const result = await run();
      expect(result).toEqual(OWNER_ONLY_ERROR);
    }
  );
});
