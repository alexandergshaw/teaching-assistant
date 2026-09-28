// R2 wave 1, sub-wave 9 (docs/r2-wave1-subwaves.md section 4, row SW9;
// docs/owner-private-secrets.md sections 4.1/5): the 10 requireOwner() call
// sites in course-hub-integrations.ts (10 distinct action exports, one guard
// each - re-derived from the tree, not inherited: the commissioning brief's
// count of 13 does not match `grep -cE "await requireOwner\(\)"
// src/app/actions/course-hub-integrations.ts`, which is 10, matching the
// plan's original figure). This file is 0 restrictive / 10 permissive:
//
//   - getGoogleCalendarStatusAction, disconnectGoogleCalendarAction: read/
//     write only the caller's own Google credential row
//     (src/lib/google-credentials.ts, scoped on user_id).
//   - fetchIcsFeedAction: fetches a caller-supplied URL - no owner secret
//     reached at all.
//   - saveInstitutionFieldsAction, listInstitutionsWithFeedsAction,
//     listInstitutionFeedUrlsAction: read/write only the caller's own
//     institution_fields row (src/lib/institution-fields.ts, scoped on
//     user_id + acronym).
//   - checkInstitutionsAction, listConfiguredInstitutionsAction: BODY
//     containment, not guard containment - see docs/owner-private-secrets.md
//     section 5 step 5, "fixed in the BODY, not the guard". Both actions'
//     `identity.role === "owner"` checks are untouched by this sub-wave; the
//     existing executing tests in course-hub-integrations.test.ts already
//     prove a non-owner never sees the env-derived institution list while an
//     owner does (see that file's "a non-owner NEVER sees the owner's env as
//     configured" and "a non-owner sees ONLY their own stored rows" cases) -
//     this file adds only the guard-admits-non-owner half, so the two files
//     together cover both halves of the containment claim.
//   - getCourseNotificationsAction, exportCourseCartridgeAction: reach
//     Canvas via getCourseNotifications/exportCourseCartridge, both of which
//     resolve their credential through resolveInstitutionByCode /
//     resolveCourse -> resolveCanvasCredential
//     (src/lib/canvas-credentials.ts:189), the same contained path SW5-SW9
//     established for this cohort's other Canvas-reaching actions.
//
// course-hub-integrations.test.ts (the pre-existing sibling) module-mocks
// "@/lib/supabase/auth" wholesale, which replaces the guard with a stub and
// never runs it (fixed in the same wave to mock requireUser instead of
// requireOwner). This *.guard.test.ts is the new executing-guard host: mocks
// the client ("@/lib/supabase/server") and the app-users lookup
// ("@/lib/supabase/app-users"), the idiom in
// src/lib/supabase/auth.test.ts:19-30 and grading.guard.test.ts /
// canvas-inbox.guard.test.ts / canvas-modules.guard.test.ts - never a module
// mock of "@/lib/supabase/auth" itself.
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
  getCourseNotifications: vi.fn(),
  exportCourseCartridge: vi.fn(),
}));

vi.mock("@/lib/canvas-core", () => ({
  CANVAS_INSTITUTIONS: [],
}));

vi.mock("@/lib/lms-credentials", () => ({
  listLmsCredentials: vi.fn(),
}));

vi.mock("@/lib/google-credentials", () => ({
  getCredentials: vi.fn(),
  deleteCredentials: vi.fn(),
}));

vi.mock("@/lib/institution-fields", () => ({
  loadInstitutionFields: vi.fn(),
  saveInstitutionFields: vi.fn(),
  listAllInstitutionFields: vi.fn(),
}));

// fetchIcsFeedAction fetches a real URL if not mocked - stub global fetch so
// this guard-only file never makes a network call.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({ ok: true, text: async () => "BEGIN:VCALENDAR\nEND:VCALENDAR" }) as never)
);

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAppUser, ensureAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { requireAppOwner, OWNER_ONLY_MESSAGE } from "@/lib/supabase/auth";
import { getCourseNotifications, exportCourseCartridge } from "@/lib/canvas";
import { listLmsCredentials } from "@/lib/lms-credentials";
import { getCredentials, deleteCredentials } from "@/lib/google-credentials";
import { loadInstitutionFields, saveInstitutionFields, listAllInstitutionFields } from "@/lib/institution-fields";
import {
  getGoogleCalendarStatusAction,
  disconnectGoogleCalendarAction,
  fetchIcsFeedAction,
  saveInstitutionFieldsAction,
  listInstitutionsWithFeedsAction,
  listInstitutionFeedUrlsAction,
  checkInstitutionsAction,
  listConfiguredInstitutionsAction,
  getCourseNotificationsAction,
  exportCourseCartridgeAction,
} from "./course-hub-integrations";

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

  vi.mocked(getCourseNotifications).mockReset().mockResolvedValue({ needsGrading: 0, unread: 0 });
  vi.mocked(exportCourseCartridge).mockReset().mockResolvedValue({ fileName: "course.imscc", base64: "" });
  vi.mocked(listLmsCredentials).mockReset().mockResolvedValue([]);
  vi.mocked(getCredentials).mockReset().mockResolvedValue(null);
  vi.mocked(deleteCredentials).mockReset().mockResolvedValue(undefined);
  vi.mocked(loadInstitutionFields).mockReset().mockResolvedValue([]);
  vi.mocked(saveInstitutionFields).mockReset().mockResolvedValue(undefined);
  vi.mocked(listAllInstitutionFields).mockReset().mockResolvedValue([]);
});

const OWNER_ONLY_ERROR = { error: OWNER_ONLY_MESSAGE };

describe("course-hub-integrations.ts permissive sites stay requireUser() (R2 SW9 - 0 restrictive / 10 permissive)", () => {
  it("getGoogleCalendarStatusAction admits an active, signed-in non-owner - reads only the caller's own Google credential row", async () => {
    const result = await getGoogleCalendarStatusAction();
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("disconnectGoogleCalendarAction admits an active, signed-in non-owner - deletes only the caller's own Google credential row", async () => {
    const result = await disconnectGoogleCalendarAction();
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("fetchIcsFeedAction admits an active, signed-in non-owner - fetches a caller-supplied URL, no owner secret reached", async () => {
    const result = await fetchIcsFeedAction("https://example.com/feed.ics");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("saveInstitutionFieldsAction admits an active, signed-in non-owner - writes only the caller's own institution_fields row", async () => {
    const result = await saveInstitutionFieldsAction("TEST", []);
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listInstitutionsWithFeedsAction admits an active, signed-in non-owner - reads only the caller's own institution_fields rows", async () => {
    const result = await listInstitutionsWithFeedsAction();
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listInstitutionFeedUrlsAction admits an active, signed-in non-owner - reads only the caller's own institution_fields row", async () => {
    const result = await listInstitutionFeedUrlsAction("TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("checkInstitutionsAction admits an active, signed-in non-owner - the env-derived half stays closed by the untouched body check (course-hub-integrations.test.ts proves the body half)", async () => {
    const result = await checkInstitutionsAction(["TEST"]);
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("listConfiguredInstitutionsAction admits an active, signed-in non-owner - the env-derived half stays closed by the untouched body check (course-hub-integrations.test.ts proves the body half)", async () => {
    const result = await listConfiguredInstitutionsAction();
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("getCourseNotificationsAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await getCourseNotificationsAction("https://canvas.test/courses/1", "TEST");
    expect(result).not.toEqual(OWNER_ONLY_ERROR);
  });

  it("exportCourseCartridgeAction admits an active, signed-in non-owner - Canvas reach is contained by resolveCanvasCredential", async () => {
    const result = await exportCourseCartridgeAction("https://canvas.test/courses/1", "TEST");
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
  // file's admit tests, observe them go red, then restore) and the body-
  // containment sabotage-and-restore (delete checkInstitutionsAction's
  // `isOwner &&` guard, observe a non-owner's env-derived status go RED,
  // restore).
  it("the same non-owner session all 10 permissive actions admit is refused by requireAppOwner() - proves the permissive/restrictive distinction is real, not vacuous", async () => {
    await expect(requireAppOwner()).rejects.toThrow(OWNER_ONLY_MESSAGE);
  });
});
