// R2 wave 1, sub-wave 9 (docs/r2-wave1-subwaves.md section 4, row SW9;
// docs/owner-private-secrets.md sections 4.1/5): the 10 requireOwner() call
// sites in canvas-modules.ts (10 distinct action exports, one guard each).
// Re-derived rather than inherited - this file is 0 restrictive / 10
// permissive. Every action here reaches Canvas only through
// @/lib/canvas-modules's own functions, all of which resolve their course
// context via resolveCourse (src/lib/canvas-core.ts) ->
// resolveCanvasCredential (src/lib/canvas-credentials.ts:189), which reads
// the CALLING identity's own stored credential first and only falls through
// to the owner's env pair when that identity's own role is "owner" - the
// same containment SW5-SW8 established for the rest of this cohort. None of
// the 10 imports anything from "@/lib/github" or a GitHub-reaching sibling
// module, and none reaches the HeyGen/Tavus likeness or the ElevenLabs voice
// id. See action-guard-coverage-github-cohort.test.ts's GITHUB_NOT_OWNER_ONLY
// entries for the per-action reasons.
//
// canvas-modules.test.ts (the pre-existing sibling) module-mocks
// "@/lib/supabase/auth" wholesale, which replaces the guard with a stub and
// never runs it (fixed in the same wave to mock requireUser instead of
// requireOwner, since that is the name canvas-modules.ts now imports - it
// still does not convert into an executing host). This *.guard.test.ts is
// the new executing-guard host: mocks the client ("@/lib/supabase/server")
// and the app-users lookup ("@/lib/supabase/app-users"), the idiom in
// src/lib/supabase/auth.test.ts:19-30 and grading.guard.test.ts /
// canvas-inbox.guard.test.ts - never a module mock of "@/lib/supabase/auth"
// itself.
//
// Every other import canvas-modules.ts makes is module-mocked so each
// action's own guard is the only thing under test: neither Canvas nor
// Supabase is ever reached for real.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(() => ({}) as never),
}));

vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});

vi.mock("@/lib/canvas", () => ({
  getCourseName: vi.fn(),
}));

vi.mock("@/lib/canvas-modules", () => ({
  listModules: vi.fn(),
  createModule: vi.fn(),
  updateModule: vi.fn(),
  deleteModule: vi.fn(),
  createModuleItem: vi.fn(),
  updateModuleItem: vi.fn(),
  deleteModuleItem: vi.fn(),
  listAssignmentGroups: vi.fn(),
  createAssignment: vi.fn(),
  uploadFileToModule: vi.fn(),
  listPages: vi.fn(),
}));

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAppUser, ensureAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { requireAppOwner, OWNER_ONLY_MESSAGE } from "@/lib/supabase/auth";
import { getCourseName } from "@/lib/canvas";
import {
  listModules,
  createModule,
  updateModule,
  deleteModule,
  createModuleItem,
  updateModuleItem,
  deleteModuleItem,
  listAssignmentGroups,
  createAssignment,
  uploadFileToModule,
  listPages,
} from "@/lib/canvas-modules";
import {
  listCourseContentAction,
  placeSyllabusInModuleAction,
  createModuleAction,
  updateModuleAction,
  deleteModuleAction,
  createModuleItemAction,
  createCourseAssignmentAction,
  listAssignmentGroupsAction,
  updateModuleItemAction,
  deleteModuleItemAction,
} from "./canvas-modules";

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
  vi.mocked(createServiceClient).mockReset();
  vi.mocked(getAppUser).mockReset();
  vi.mocked(ensureAppUser).mockReset();
  vi.mocked(ensureAppUser).mockResolvedValue(fakeAppUserRow());
  vi.mocked(createClient).mockResolvedValue(makeFakeAuthClient("u1", "m@example.com") as never);
  vi.mocked(createServiceClient).mockReturnValue({} as never);
  vi.mocked(getAppUser).mockResolvedValue(
    fakeAppUserRow({ email: "m@example.com", status: "active", role: "instructor" })
  );

  vi.mocked(getCourseName).mockReset().mockResolvedValue("Course");
  vi.mocked(listModules).mockReset().mockResolvedValue([]);
  vi.mocked(createModule).mockReset().mockResolvedValue({ id: 1, name: "Week 1", position: 1, published: true, itemsCount: 0, items: [] } as never);
  vi.mocked(updateModule).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(deleteModule).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(createModuleItem).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(updateModuleItem).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(deleteModuleItem).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(listAssignmentGroups).mockReset().mockResolvedValue([]);
  vi.mocked(createAssignment).mockReset().mockResolvedValue({ id: 1, name: "Assignment", htmlUrl: "https://x/1" } as never);
  vi.mocked(uploadFileToModule).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(listPages).mockReset().mockResolvedValue([]);
});

const OWNER_ONLY_ERROR = { error: OWNER_ONLY_MESSAGE };

describe("canvas-modules.ts permissive sites stay requireUser() (R2 SW9 - 0 restrictive / 10 permissive)", () => {
  it("listCourseContentAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await listCourseContentAction("https://canvas.test/courses/1", "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("placeSyllabusInModuleAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await placeSyllabusInModuleAction("base64", "https://canvas.test/courses/1", 1, "syllabus.docx", undefined, "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("createModuleAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await createModuleAction("https://canvas.test/courses/1", "Week 1", undefined, "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("updateModuleAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await updateModuleAction("https://canvas.test/courses/1", 1, { name: "Week 1" }, "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("deleteModuleAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await deleteModuleAction("https://canvas.test/courses/1", 1, "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("createModuleItemAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await createModuleItemAction(
      "https://canvas.test/courses/1",
      1,
      { type: "Page", contentId: 1, title: "Item" },
      "TEST"
    );
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("createCourseAssignmentAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await createCourseAssignmentAction(
      "https://canvas.test/courses/1",
      {
        name: "Week 1 Homework",
        description: "Do the thing.",
        pointsPossible: 10,
        dueAt: "",
        submissionType: "online_text_entry",
        published: true,
      },
      null,
      "TEST"
    );
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listAssignmentGroupsAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await listAssignmentGroupsAction("https://canvas.test/courses/1", "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("updateModuleItemAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await updateModuleItemAction("https://canvas.test/courses/1", 1, 1, { title: "Renamed" }, "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("deleteModuleItemAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await deleteModuleItemAction("https://canvas.test/courses/1", 1, 1, "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  // The direction this migration has not exercised until now (RULING 83's
  // permissive exception): a permissive site's own executing test must show
  // it would go RED if the site were later wrongly tightened to
  // requireAppOwner(). The SAME mocked session (active/instructor, i.e. not
  // owner) that every test above shows these 10 actions admit is shown here
  // to be refused by the real requireAppOwner(), which is exactly what each
  // of them would call if this file were ever edited to move it into that
  // guard. The sub-wave's own report separately records the literal
  // sabotage-and-restore (swap requireUser() to requireAppOwner() at three
  // permissive sites structurally different from each other, rerun this
  // file's admit tests, observe them go red, then restore).
  it("the same non-owner session all 10 permissive actions admit is refused by requireAppOwner() - proves the permissive/restrictive distinction is real, not vacuous", async () => {
    await expect(requireAppOwner()).rejects.toThrow(OWNER_ONLY_MESSAGE);
  });
});
