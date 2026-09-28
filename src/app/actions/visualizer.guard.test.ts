// R2 wave 1, sub-wave 5 (docs/r2-wave1-subwaves.md section 4, row SW5): the 3
// requireOwner() sites in this file. Re-derived rather than inherited (the
// plan predicted 5 restrictive / 1 permissive across the sub-wave's two
// files, and this file alone is 2 restrictive / 1 permissive).
//
// findVisualizerConceptAction calls getFileText and createVisualizerConceptAction
// calls getFileText/putFile - both imported directly from "@/lib/github" in
// this file's own import line - so both reach the shared GitHub personal
// access token exactly as src/lib/supabase/auth.ts's requireAppOwner() doc
// comment (":369-375") describes, and both moved to requireAppOwner().
//
// extractDeckConceptsAction calls only callLlm and the pure helpers
// clampDeckConcepts/parseDeckConcepts/conceptsFromSlideTitles - never
// getFileText or putFile, this file's only GitHub PAT calls - so it stays on
// requireUser() and is added to GITHUB_NOT_OWNER_ONLY
// (action-guard-coverage-github-cohort.test.ts).
//
// This file DOES have a sibling test (visualizer.test.ts), but that file
// module-mocks "@/lib/supabase/auth" wholesale (stubbing the guard away so it
// never runs) - the exact shape this repo's rule says cannot host an
// executing guard test. This *.guard.test.ts is the executing-guard host
// instead; visualizer.test.ts's stale auth mock (naming only the old
// requireOwner()) is fixed separately, in the same edit, to split into
// requireAppOwner()/requireUser() mocks matching what production now imports.
//
// Executes the REAL guard: mocks the client ("@/lib/supabase/server") and the
// app-users lookup ("@/lib/supabase/app-users"), the idiom in
// src/lib/supabase/auth.test.ts:19-30 and github.test.ts - never a module
// mock of "@/lib/supabase/auth" itself, which would replace the guard with a
// stub and never run it. This module also imports @/lib/github and @/lib/llm,
// both reaching live network code - none of that runs here for the two
// restrictive sites, because a non-owner is refused before either reaches a
// @/lib/github call; the permissive site below uses provider "embedded",
// which never calls the LLM either (src/lib/workflows/deck-concepts.ts's own
// deterministic slide-title path).
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
import { requireAppOwner, OWNER_ONLY_MESSAGE } from "@/lib/supabase/auth";
import {
  findVisualizerConceptAction,
  createVisualizerConceptAction,
  extractDeckConceptsAction,
} from "./visualizer";

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

const OWNER_ONLY_ERROR = { error: OWNER_ONLY_MESSAGE };

describe("visualizer.ts restrictive sites - R2 SW5 guard swap", () => {
  it("findVisualizerConceptAction rejects an active, signed-in non-owner with the owner-only message - the guard actually runs, not a mocked stub", async () => {
    const result = await findVisualizerConceptAction("for loops");
    expect(result).toEqual(OWNER_ONLY_ERROR);
  });

  it("createVisualizerConceptAction rejects an active, signed-in non-owner with the owner-only message - the guard actually runs, not a mocked stub", async () => {
    const result = await createVisualizerConceptAction("recursion", "", "gemini");
    expect(result).toEqual(OWNER_ONLY_ERROR);
  });
});

describe("visualizer.ts permissive site - extractDeckConceptsAction stays requireUser()", () => {
  const DECK = "## For loops\n## Recursion\n## Big-O notation";

  it("admits an active, signed-in non-owner - the guard genuinely differs from requireAppOwner() for this action", async () => {
    const result = await extractDeckConceptsAction(DECK, 8, "embedded");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.concepts.length).toBeGreaterThan(0);
  });

  // The direction this migration has not exercised until now (RULING 83's
  // permissive exception): a permissive site's own executing test must show
  // it would go RED if the site were later wrongly tightened to
  // requireAppOwner(). Rather than editing production source from inside a
  // test, this proves it directly - the SAME mocked session
  // (active/instructor, i.e. not owner) that the test above shows
  // extractDeckConceptsAction admits is shown here to be refused by the real
  // requireAppOwner(), which is exactly what extractDeckConceptsAction would
  // call if this file were ever edited to move it into that guard. The
  // sub-wave's own report separately records the literal sabotage-and-restore
  // (swap requireUser() to requireAppOwner() in this file, rerun this describe
  // block, observe the admit-test above go red, then restore).
  it("the same non-owner session that extractDeckConceptsAction admits is refused by requireAppOwner() - proves the permissive/restrictive distinction is real, not vacuous", async () => {
    await expect(requireAppOwner()).rejects.toThrow(OWNER_ONLY_MESSAGE);
  });
});
