// R2 wave 1, sub-wave 6 (docs/r2-wave1-subwaves.md section 4, row SW6): the
// requireOwner() sites in this file. Re-derived rather than inherited: naive
// `grep -c "requireOwner()" src/app/actions/repo-grades.ts` returns 3, but one
// of those three matches is inside this file's own header comment (line 8,
// "`requireOwner()`, first line, before anything else runs"), not a call
// site. The real count is 2 - matching the plan's row (docs/r2-wave1-subwaves.md
// section 4, row SW6: "repo-grades.ts (2)") - and both are covered below.
//
// loadOrgRepoTreesAction calls listOrgRepos/getRepoTree, imported directly
// from "@/lib/github" in this file's own import line, reaching the shared
// GitHub personal access token exactly as src/lib/supabase/auth.ts's
// requireAppOwner() doc comment (":369-375") describes - moved to
// requireAppOwner().
//
// listCourseAssignmentsAction calls listAssignments (src/lib/canvas/listings.ts),
// which resolves its institution via resolveInstitutionByCode ->
// resolveCanvasCredential (src/lib/canvas-credentials.ts:189). That resolver
// reads a non-owner CALLER's own stored credential first and only falls
// through to the owner's env pair when the calling identity's own role is
// "owner" - the same containment RULING 83's postWalkthroughAnnouncementAction
// entry relies on for Canvas (action-guard-coverage-github-cohort.test.ts).
// listCourseAssignmentsAction never imports listOrgRepos/getRepoTree, this
// file's only GitHub PAT calls. It stays on requireUser() and is added to
// GITHUB_NOT_OWNER_ONLY in that file.
//
// This file has NO sibling test (no repo-grades.test.ts exists - confirmed by
// `test -f src/app/actions/repo-grades.test.ts`, matching
// docs/r2-wave1-subwaves.md section 7's list of the 10/14 files with no
// sibling test at all), so this *.guard.test.ts is the file's only executing
// test, not a bypass of an existing one.
//
// Executes the REAL guard: mocks the client ("@/lib/supabase/server") and the
// app-users lookup ("@/lib/supabase/app-users"), the idiom in
// src/lib/supabase/auth.test.ts:19-30 and github.test.ts - never a module
// mock of "@/lib/supabase/auth" itself, which would replace the guard with a
// stub and never run it.
//
// This module also imports @/lib/github and @/lib/canvas, both reaching live
// network code - neither runs here for the restrictive site, because a
// non-owner is refused before it reaches any @/lib/github call; the
// permissive site's own Canvas call is mocked (listAssignments) so this test
// verifies only the guard, not Canvas network behaviour.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});

vi.mock("@/lib/github", () => ({
  listOrgRepos: vi.fn(),
  getRepoTree: vi.fn(),
}));

vi.mock("@/lib/canvas", () => ({
  listAssignments: vi.fn().mockResolvedValue([]),
}));

import { createClient } from "@/lib/supabase/server";
import { getAppUser, ensureAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { requireAppOwner, OWNER_ONLY_MESSAGE } from "@/lib/supabase/auth";
import { listOrgRepos } from "@/lib/github";
import { listCourseAssignmentsAction, loadOrgRepoTreesAction } from "./repo-grades";

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
  vi.mocked(listOrgRepos).mockRejectedValue(new Error("listOrgRepos must not be called for a refused caller"));
});

const OWNER_ONLY_ERROR = { error: OWNER_ONLY_MESSAGE };

describe("repo-grades.ts restrictive site - R2 SW6 guard swap", () => {
  it("loadOrgRepoTreesAction rejects an active, signed-in non-owner with the owner-only message - the guard actually runs, not a mocked stub", async () => {
    const result = await loadOrgRepoTreesAction("some-org", undefined, undefined);
    expect(result).toEqual(OWNER_ONLY_ERROR);
    expect(listOrgRepos).not.toHaveBeenCalled();
  });
});

describe("repo-grades.ts permissive site - listCourseAssignmentsAction stays requireUser()", () => {
  it("admits an active, signed-in non-owner - the guard genuinely differs from requireAppOwner() for this action", async () => {
    const result = await listCourseAssignmentsAction("TEST", "123");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  // The direction this migration has not exercised until now (RULING 83's
  // permissive exception): a permissive site's own executing test must show
  // it would go RED if the site were later wrongly tightened to
  // requireAppOwner(). Rather than editing production source from inside a
  // test, this proves it directly - the SAME mocked session
  // (active/instructor, i.e. not owner) that the test above shows
  // listCourseAssignmentsAction admits is shown here to be refused by the
  // real requireAppOwner(), which is exactly what listCourseAssignmentsAction
  // would call if this file were ever edited to move it into that guard. The
  // sub-wave's own report separately records the literal sabotage-and-restore
  // (swap requireUser() to requireAppOwner() in this file, rerun this
  // describe block, observe the admit-test above go red, then restore).
  it("the same non-owner session that listCourseAssignmentsAction admits is refused by requireAppOwner() - proves the permissive/restrictive distinction is real, not vacuous", async () => {
    await expect(requireAppOwner()).rejects.toThrow(OWNER_ONLY_MESSAGE);
  });
});
