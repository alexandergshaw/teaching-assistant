// R2 wave 1, sub-wave 6 (docs/r2-wave1-subwaves.md section 4, row SW6): the 4
// requireOwner() sites in this file. Re-derived rather than inherited (the
// plan predicted 2 restrictive / 4 permissive across the sub-wave's two
// files; this file alone is 1 restrictive / 3 permissive, and its sibling
// repo-grades.ts is 1 restrictive / 1 permissive - see that file's own
// *.guard.test.ts).
//
// loadVisualizerIndexAction calls getFileText, imported directly from
// "@/lib/github" in this file's own import line, reaching the shared GitHub
// personal access token exactly as src/lib/supabase/auth.ts's
// requireAppOwner() doc comment (":369-375") describes - moved to
// requireAppOwner().
//
// transcribeLiveAudioAction and answerLiveQuestionAction call only callLlm
// and pure/local helpers - neither ever imports or calls getFileText/putFile,
// this file's only GitHub PAT calls. buildLiveSessionContextAction reaches
// Canvas (via gatherModuleMaterials's "live-lms" source, see
// registry-helpers.sources.ts) and Supabase Storage (via
// buildServerMaterialLoaders's course-export path, see step-helpers-server.ts)
// but never GitHub - it does not import getFileText/putFile either. Every
// Canvas read it triggers funnels through resolveCanvasCredential
// (src/lib/canvas-credentials.ts:189), which reads a non-owner CALLER's own
// stored credential first and only falls through to the owner's env pair when
// the calling identity's own role is "owner" - the same containment RULING
// 83's postWalkthroughAnnouncementAction entry relies on for Canvas
// (action-guard-coverage-github-cohort.test.ts). All three stay on
// requireUser() and are added to GITHUB_NOT_OWNER_ONLY in that file.
//
// This file DOES have a sibling test (live-class.test.ts), but that file
// module-mocks "@/lib/supabase/auth" wholesale (stubbing the guard away so it
// never runs) - the exact shape this repo's rule says cannot host an
// executing guard test. This *.guard.test.ts is the executing-guard host
// instead; live-class.test.ts's stale requireOwner-only auth mock is fixed
// separately, in the same edit, splitting it into requireUser()/
// requireAppOwner() mocks matching what production now imports.
//
// Executes the REAL guard: mocks the client ("@/lib/supabase/server") and the
// app-users lookup ("@/lib/supabase/app-users"), the idiom in
// src/lib/supabase/auth.test.ts:19-30 and github.test.ts - never a module
// mock of "@/lib/supabase/auth" itself, which would replace the guard with a
// stub and never run it.
//
// Dependencies unrelated to the guard question are module-mocked so each
// action's own guard is the only thing under test: callLlm never runs for
// real (no network), listCourseHubAction (course-hub-core.ts, not in this
// sub-wave's scope) is stubbed to fail fast with a distinguishable, non-owner
// message so buildLiveSessionContextAction's admission is visible without
// exercising Canvas/GitHub/Supabase Storage at all, and getFileText is
// stubbed to reject so loadVisualizerIndexAction's restrictive refusal is
// provably BEFORE any fetch.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

vi.mock("@/lib/github", () => ({
  getFileText: vi.fn(),
}));

vi.mock("./course-hub-core", () => ({
  listCourseHubAction: vi.fn().mockResolvedValue({ error: "STUB_NOT_OWNER_ONLY" }),
}));

import { createClient } from "@/lib/supabase/server";
import { getAppUser, ensureAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { requireAppOwner, OWNER_ONLY_MESSAGE } from "@/lib/supabase/auth";
import { callLlm } from "@/lib/llm";
import { getFileText } from "@/lib/github";
import {
  transcribeLiveAudioAction,
  answerLiveQuestionAction,
  buildLiveSessionContextAction,
  loadVisualizerIndexAction,
} from "./live-class";

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
  vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "an answer" });
  vi.mocked(getFileText).mockRejectedValue(new Error("getFileText must not be called for a refused caller"));
});

const OWNER_ONLY_ERROR = { error: OWNER_ONLY_MESSAGE };

describe("live-class.ts restrictive site - R2 SW6 guard swap", () => {
  it("loadVisualizerIndexAction rejects an active, signed-in non-owner with the owner-only message - the guard actually runs, not a mocked stub", async () => {
    const result = await loadVisualizerIndexAction();
    expect(result).toEqual(OWNER_ONLY_ERROR);
    expect(getFileText).not.toHaveBeenCalled();
  });
});

describe("live-class.ts permissive sites stay requireUser()", () => {
  it("transcribeLiveAudioAction admits an active, signed-in non-owner - the guard genuinely differs from requireAppOwner() for this action", async () => {
    const result = await transcribeLiveAudioAction("ZmFrZQ==");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("answerLiveQuestionAction admits an active, signed-in non-owner - the guard genuinely differs from requireAppOwner() for this action", async () => {
    const result = await answerLiveQuestionAction("What is a hash map?", {});
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("buildLiveSessionContextAction admits an active, signed-in non-owner - the guard genuinely differs from requireAppOwner() for this action", async () => {
    const result = await buildLiveSessionContextAction("course-1", "");
    expect(result).toEqual({ error: "STUB_NOT_OWNER_ONLY" });
  });

  // The direction this migration has not exercised until now (RULING 83's
  // permissive exception): a permissive site's own executing test must show
  // it would go RED if the site were later wrongly tightened to
  // requireAppOwner(). Rather than editing production source from inside a
  // test, this proves it directly - the SAME mocked session
  // (active/instructor, i.e. not owner) that the three tests above show these
  // actions admit is shown here to be refused by the real requireAppOwner(),
  // which is exactly what each of them would call if this file were ever
  // edited to move it into that guard. The sub-wave's own report separately
  // records the literal sabotage-and-restore (swap requireUser() to
  // requireAppOwner() at each site, rerun this describe block, observe the
  // admit-test above go red, then restore).
  it("the same non-owner session these actions admit is refused by requireAppOwner() - proves the permissive/restrictive distinction is real, not vacuous", async () => {
    await expect(requireAppOwner()).rejects.toThrow(OWNER_ONLY_MESSAGE);
  });
});
