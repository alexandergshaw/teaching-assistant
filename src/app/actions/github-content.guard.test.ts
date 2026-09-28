// R2 wave 1, sub-wave 4 (docs/r2-wave1-subwaves.md section 4, row SW4): the 5
// requireOwner() sites in this file. Re-derived rather than inherited: every
// one of the 5 actions below calls a function imported directly from
// "@/lib/github" (downloadRepoZipball, getRepoTree, putFile x2, getFileText -
// see the file's own import line) - the shared GitHub personal access token
// module, per src/lib/supabase/auth.ts's own doc comment on requireAppOwner()
// (":369-375") reserving it for exactly this shape: "call sites that spend
// or reach an OWNER-PRIVATE resource through a shared server secret (Canvas,
// GitHub, ...)". None of the 5 is added to GITHUB_NOT_OWNER_ONLY; all 5 are
// restrictive.
//
// github-content.ts has no sibling *.test.ts today (measured:
// `test -f src/app/actions/github-content.test.ts` misses), so this
// *.guard.test.ts file IS its sibling, per this repo's rule that a new
// executing-guard test goes in a fresh file whenever the sibling would
// otherwise module-mock the auth factory and stub the guard away.
//
// Executes the REAL guard: mocks the client ("@/lib/supabase/server") and the
// app-users lookup ("@/lib/supabase/app-users"), the idiom in
// src/lib/supabase/auth.test.ts:19-30 and github.test.ts - never a module
// mock of "@/lib/supabase/auth" itself, which would replace the guard with a
// stub and never run it. Fixture helpers are duplicated locally per this
// repo's rule against cross-test-file imports.
//
// This module also imports @/lib/github and @/lib/llm, both reaching live
// network/API code - none of that runs here because a non-owner is refused
// before any action below reaches parseRepoRef or any downstream call.
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
  generateSchedulePlanFromRepoAction,
  fillAssignmentReadmesAction,
  getAssignmentSyncStateAction,
  syncAssignmentToRepoAction,
  syncAssignmentFromRepoAction,
} from "./github-content";

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

const sw4Cases: Array<[string, () => Promise<unknown>]> = [
  ["generateSchedulePlanFromRepoAction", () => generateSchedulePlanFromRepoAction("owner/repo", 10, 2)],
  ["fillAssignmentReadmesAction", () => fillAssignmentReadmesAction("owner/repo", [], "a course")],
  ["getAssignmentSyncStateAction", () => getAssignmentSyncStateAction("https://x/courses/1/assignments/2", "owner/repo", "path.md")],
  ["syncAssignmentToRepoAction", () => syncAssignmentToRepoAction("https://x/courses/1/assignments/2", "owner/repo", "path.md")],
  ["syncAssignmentFromRepoAction", () => syncAssignmentFromRepoAction("https://x/courses/1/assignments/2", "owner/repo", "path.md")],
];

describe("github-content.ts sites 1-5 - R2 SW4 guard swap", () => {
  it.each(sw4Cases)(
    "%s rejects an active, signed-in non-owner with the owner-only message - the guard actually runs, not a mocked stub",
    async (_name, run) => {
      const result = await run();
      expect(result).toEqual(OWNER_ONLY_ERROR);
    }
  );
});
