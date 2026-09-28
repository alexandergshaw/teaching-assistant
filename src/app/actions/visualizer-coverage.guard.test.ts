// R2 wave 1, sub-wave 4 (docs/r2-wave1-subwaves.md section 4, row SW4): the 1
// requireOwner() site in this file. Re-derived rather than inherited: the
// plan's own scope note flagged this file as the interesting one - a single
// site in a file whose name suggests a read-only coverage view, ranked 2a by
// the plan rather than assumed Rank 1. Traced anyway: auditVisualizerCoverageAction
// imports createCopilotAgentTask/listCopilotTasks directly from "@/lib/github"
// (this file's own import line), which is the barrel over github.repos.ts -
// the module that authenticates with `Bearer ${githubToken()}`
// (src/lib/github.copilot.ts:12). createCopilotAgentTask genuinely spends
// that token to open a GitHub issue on the visualizer repo (only reached when
// dispatch=true and at least one gap is found - a conditional call, but still
// a real, function-level reference on a path the action actually takes, not
// a name it never calls). So this site reaches the shared GitHub personal
// access token exactly as src/lib/supabase/auth.ts's requireAppOwner() doc
// comment (":369-375") describes, and is restrictive, not added to
// GITHUB_NOT_OWNER_ONLY.
//
// visualizer-coverage.ts DOES have a sibling test (visualizer-coverage.test.ts),
// but that file module-mocks "@/lib/supabase/auth" wholesale (stubbing the
// guard away so it never runs) - the exact shape this repo's rule says cannot
// host an executing guard test. This *.guard.test.ts is the executing-guard
// host instead; visualizer-coverage.test.ts's stale auth mock (naming only
// the old requireOwner()) is fixed separately, in the same edit, to also name
// requireAppOwner() so it does not break now that production calls it.
//
// Executes the REAL guard: mocks the client ("@/lib/supabase/server") and the
// app-users lookup ("@/lib/supabase/app-users"), the idiom in
// src/lib/supabase/auth.test.ts:19-30 and github.test.ts - never a module
// mock of "@/lib/supabase/auth" itself. This module also imports @/lib/github,
// @/lib/lecture-concepts and two sibling action modules, all reaching live
// network/API code - none of that runs here because a non-owner is refused
// before any of those are called.
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
import { auditVisualizerCoverageAction } from "./visualizer-coverage";

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

describe("auditVisualizerCoverageAction - R2 SW4 guard swap", () => {
  it("rejects an active, signed-in non-owner with the owner-only message - the guard actually runs, not a mocked stub", async () => {
    const result = await auditVisualizerCoverageAction([], 50, 20, false, "", "gemini");

    expect(result).toEqual({ error: "This action is limited to the workspace owner." });
  });
});
