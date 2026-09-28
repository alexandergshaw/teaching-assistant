// R2 wave 1, sub-wave 8 (docs/r2-wave1-subwaves.md section 4, row SW8): the 19
// requireOwner() call sites in canvas-inbox.ts (19 distinct action exports).
// Re-derived rather than inherited (the plan predicted ~2 restrictive / ~17
// permissive) - this file is 0 restrictive / 19 permissive. Every Canvas-
// reaching action here is contained by resolveCanvasCredential
// (src/lib/canvas-credentials.ts:189), which reads the CALLING identity's own
// stored credential first and only falls through to the owner's env pair when
// that identity's own role is "owner" - the same containment SW5-SW7
// established. The two AI-draft actions (suggestAltTextAction,
// suggestLinkTextAction) call only the shared LLM key. See
// action-guard-coverage-github-cohort.test.ts's GITHUB_NOT_OWNER_ONLY entries
// for the per-action reasons.
//
// This file has no sibling *.test.ts that hosts an executing guard for
// canvas-inbox.ts - the five siblings that DO exist
// (canvas-inbox.announcement-image.test.ts, canvas-inbox.message-replies.test.ts,
// canvas-inbox.weekly-announcement-module-content.test.ts,
// canvas-inbox.weekly-announcement-schedule.test.ts,
// canvas-inbox.weekly-announcement-schedule.sequential-fetch.test.ts) all
// module-mock "@/lib/supabase/auth" wholesale (fixed in this same wave to mock
// requireUser instead of requireOwner, since that is the name canvas-inbox.ts
// now imports - none convert into executing hosts). This *.guard.test.ts is
// the new executing-guard host: mocks the client ("@/lib/supabase/server") and
// the app-users lookup ("@/lib/supabase/app-users"), the idiom in
// src/lib/supabase/auth.test.ts:19-30 and grading.guard.test.ts - never a
// module mock of "@/lib/supabase/auth" itself, which would replace the guard
// with a stub and never run it.
//
// Every other import canvas-inbox.ts makes is module-mocked so each action's
// own guard is the only thing under test: none of Canvas, the LLM, or
// Supabase's service-role weekly-announcement tables is ever reached for
// real.
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
  listAnnouncements: vi.fn(),
  createAnnouncement: vi.fn(),
  createScheduledAnnouncementResilient: vi.fn(),
  updateAnnouncementSchedule: vi.fn(),
  getAnnouncementById: vi.fn(),
  resolveAnnouncementImage: vi.fn(),
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  replyToConversation: vi.fn(),
  listCourses: vi.fn(),
  listCoursesByTerm: vi.fn(),
  setConversationWorkflowState: vi.fn(),
  listCourseRoster: vi.fn(),
  listAssignmentTextSubmissions: vi.fn(),
  listCourseAssignmentDueDates: vi.fn(),
  listAssignmentBriefsWithDue: vi.fn(),
  listStudentGradeSummaries: vi.fn(),
}));

vi.mock("@/lib/canvas-core", () => ({
  resolveInstitution: vi.fn(),
  resolveInstitutionByCode: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  callLlm: vi.fn(),
}));

vi.mock("@/lib/supabase/weekly-announcement-schedule", () => ({
  insertPendingScheduledAnnouncement: vi.fn(),
  confirmScheduledAnnouncement: vi.fn(),
  rescheduleScheduledAnnouncement: vi.fn(),
}));

vi.mock("@/lib/weekly-announcement-run", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/weekly-announcement-run")>();
  return { ...actual, loadWeeklyAnnouncementPlan: vi.fn() };
});

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAppUser, ensureAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { requireAppOwner, OWNER_ONLY_MESSAGE } from "@/lib/supabase/auth";
import {
  getCourseName,
  listAnnouncements,
  createAnnouncement,
  createScheduledAnnouncementResilient,
  updateAnnouncementSchedule,
  getAnnouncementById,
  listConversations,
  getConversation,
  listCourses,
  listCoursesByTerm,
  listCourseRoster,
  listAssignmentTextSubmissions,
  listCourseAssignmentDueDates,
  listAssignmentBriefsWithDue,
  listStudentGradeSummaries,
} from "@/lib/canvas";
import { resolveInstitution, resolveInstitutionByCode } from "@/lib/canvas-core";
import { callLlm } from "@/lib/llm";
import { loadWeeklyAnnouncementPlan } from "@/lib/weekly-announcement-run";
import {
  listCoursesAction,
  listCourseRosterAction,
  listCourseGradeSummariesAction,
  listAssignmentTextSubmissionsAction,
  listCourseAssignmentDueDatesAction,
  listAssignmentDueDatesByUrlAction,
  listAssignmentBriefsByUrlAction,
  listAnnouncementsAction,
  createAnnouncementAction,
  listCoursesByTermAction,
  createScheduledAnnouncementAction,
  listConversationsAction,
  getConversationAction,
  replyToConversationAction,
  setConversationStateAction,
  suggestAltTextAction,
  suggestLinkTextAction,
  planWeeklyAnnouncementsAction,
  scheduleWeeklyAnnouncementsAction,
} from "./canvas-inbox";

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
  vi.mocked(listAnnouncements).mockReset().mockResolvedValue([]);
  vi.mocked(createAnnouncement).mockReset().mockResolvedValue({ id: 1 } as never);
  vi.mocked(createScheduledAnnouncementResilient).mockReset().mockResolvedValue({ id: 1 } as never);
  vi.mocked(updateAnnouncementSchedule).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(getAnnouncementById).mockReset().mockResolvedValue(null);
  vi.mocked(listConversations).mockReset().mockResolvedValue([]);
  vi.mocked(getConversation).mockReset().mockResolvedValue({} as never);
  vi.mocked(listCourses).mockReset().mockResolvedValue([]);
  vi.mocked(listCoursesByTerm).mockReset().mockResolvedValue([]);
  vi.mocked(listCourseRoster).mockReset().mockResolvedValue([]);
  vi.mocked(listAssignmentTextSubmissions).mockReset().mockResolvedValue([]);
  vi.mocked(listCourseAssignmentDueDates).mockReset().mockResolvedValue([]);
  vi.mocked(listAssignmentBriefsWithDue).mockReset().mockResolvedValue([]);
  vi.mocked(listStudentGradeSummaries).mockReset().mockResolvedValue([]);

  vi.mocked(resolveInstitution).mockReset().mockResolvedValue({
    institution: { code: "TEST", name: "Test", host: "canvas.test" },
    token: "t",
    baseUrl: "https://canvas.test",
  } as never);
  vi.mocked(resolveInstitutionByCode).mockReset().mockResolvedValue({
    institution: { code: "TEST", name: "Test", host: "canvas.test" },
    token: "t",
    baseUrl: "https://canvas.test",
  } as never);

  vi.mocked(callLlm).mockReset().mockResolvedValue({ ok: true, text: "a suggestion" } as never);

  vi.mocked(loadWeeklyAnnouncementPlan).mockReset().mockResolvedValue({ plan: [], liveAnnouncements: [] } as never);
});

const OWNER_ONLY_ERROR = { error: OWNER_ONLY_MESSAGE };

describe("canvas-inbox.ts permissive sites stay requireUser() (R2 SW8 - 0 restrictive / 19 permissive)", () => {
  it("listCoursesAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await listCoursesAction("TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listCourseRosterAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await listCourseRosterAction("TEST", "1");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listCourseGradeSummariesAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await listCourseGradeSummariesAction("TEST", "1");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listAssignmentTextSubmissionsAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await listAssignmentTextSubmissionsAction("TEST", "1", "2");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listCourseAssignmentDueDatesAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await listCourseAssignmentDueDatesAction("TEST", "1");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listAssignmentDueDatesByUrlAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await listAssignmentDueDatesByUrlAction("https://canvas.test/courses/1", "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listAssignmentBriefsByUrlAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await listAssignmentBriefsByUrlAction("https://canvas.test/courses/1", "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listAnnouncementsAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await listAnnouncementsAction("https://canvas.test/courses/1", "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("createAnnouncementAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await createAnnouncementAction("https://canvas.test/courses/1", "Title", "Message", "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listCoursesByTermAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await listCoursesByTermAction("TEST", "Fall2026");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("createScheduledAnnouncementAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await createScheduledAnnouncementAction(
      "https://canvas.test/courses/1",
      "Title",
      "Message",
      null,
      "TEST"
    );
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listConversationsAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await listConversationsAction("TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("getConversationAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await getConversationAction(1, "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("replyToConversationAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await replyToConversationAction(1, "Reply", "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("setConversationStateAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await setConversationStateAction(1, "read", "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("suggestAltTextAction admits an active, signed-in non-owner - calls only the LLM path", async () => {
    const result = await suggestAltTextAction("Item", "<img src=\"x.png\">");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("suggestLinkTextAction admits an active, signed-in non-owner - calls only the LLM path", async () => {
    const result = await suggestLinkTextAction("Item", "<a href=\"x\">click here</a>");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("planWeeklyAnnouncementsAction admits an active, signed-in non-owner - Canvas read-back is contained by resolveCanvasCredential, Supabase reads scoped to the caller's own user.id", async () => {
    const result = await planWeeklyAnnouncementsAction(
      "hub1",
      "https://canvas.test/courses/1",
      "TEST",
      "2026-01-05",
      3,
      1,
      "08:00"
    );
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("scheduleWeeklyAnnouncementsAction admits an active, signed-in non-owner - Canvas read-back and writes are contained by resolveCanvasCredential, Supabase writes scoped to the caller's own user.id", async () => {
    const result = await scheduleWeeklyAnnouncementsAction(
      "hub1",
      "https://canvas.test/courses/1",
      "TEST",
      "2026-01-05",
      3,
      1,
      "08:00",
      "Week {{n}}",
      "Message {{n}}"
    );
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  // The direction this migration has not exercised until now (RULING 83's
  // permissive exception): a permissive site's own executing test must show
  // it would go RED if the site were later wrongly tightened to
  // requireAppOwner(). Rather than editing production source from inside a
  // test, this proves it directly - the SAME mocked session (active/
  // instructor, i.e. not owner) that every test above shows these 19 actions
  // admit is shown here to be refused by the real requireAppOwner(), which is
  // exactly what each of them would call if this file were ever edited to
  // move it into that guard. The sub-wave's own report separately records the
  // literal sabotage-and-restore (swap requireUser() to requireAppOwner() at
  // three permissive sites structurally different from each other, rerun this
  // file's admit tests, observe them go red, then restore).
  it("the same non-owner session all 19 permissive actions admit is refused by requireAppOwner() - proves the permissive/restrictive distinction is real, not vacuous", async () => {
    await expect(requireAppOwner()).rejects.toThrow(OWNER_ONLY_MESSAGE);
  });
});
