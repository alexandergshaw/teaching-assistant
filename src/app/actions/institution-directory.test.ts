import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(() => ({ service: true })),
}));
vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});
vi.mock("@/lib/institution-directory-storage", () => ({
  listInstitutionDirectory: vi.fn(),
  saveInstitutionDirectoryProfile: vi.fn(),
  removeInstitutionDirectoryProfile: vi.fn(),
  saveInstitutionDirectoryColumn: vi.fn(),
  saveInstitutionDirectoryValue: vi.fn(),
  removeInstitutionDirectoryColumn: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getAppUser, ensureAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import {
  listInstitutionDirectory,
  removeInstitutionDirectoryColumn,
  removeInstitutionDirectoryProfile,
  saveInstitutionDirectoryColumn,
  saveInstitutionDirectoryProfile,
  saveInstitutionDirectoryValue,
} from "@/lib/institution-directory-storage";
import {
  listInstitutionDirectoryAction,
  removeInstitutionDirectoryColumnAction,
  removeInstitutionDirectoryProfileAction,
  saveInstitutionDirectoryColumnAction,
  saveInstitutionDirectoryProfileAction,
  saveInstitutionDirectoryValueAction,
} from "./institution-directory";

const user = { id: "user-a", email: "a@example.edu", role: "instructor" as const, status: "active" as const };
function fakeAppUserRow(overrides: Partial<AppUserRow> = {}): AppUserRow {
  return {
    id: user.id,
    email: user.email,
    displayName: "A User",
    status: "active",
    role: "instructor",
    approvedAt: "2026-01-01T00:00:00.000Z",
    approvedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    statusChangedAt: null,
    statusChangedBy: null,
    roleGrantedBy: null,
    ...overrides,
  };
}
function fakeAuthClient(signedIn = true) {
  return {
    auth: {
      getUser: async () => ({ data: { user: signedIn ? { id: user.id, email: user.email } : null }, error: null }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
    },
  };
}
const record = {
  profile: { acronym: "WWU", fullName: "Western Wyoming", emailClient: "outlook" as const, emailClientOtherName: "", lmsOtherName: "", facultyPortalUrl: "", websiteUrl: "", department: "" },
  commonValues: { email: "teacher@example.edu", outlookUrl: "", lmsUrl: "https://canvas.example.edu", lmsType: "canvas" },
  values: {},
};
const state = { records: [record], columns: [{ id: "column-a", label: "Region", type: "text" as const, position: 0 }] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(fakeAuthClient() as never);
  vi.mocked(getAppUser).mockResolvedValue(fakeAppUserRow());
  vi.mocked(ensureAppUser).mockResolvedValue(fakeAppUserRow());
  vi.mocked(listInstitutionDirectory).mockResolvedValue(state as never);
  vi.mocked(saveInstitutionDirectoryColumn).mockResolvedValue(state.columns[0]);
});

describe("institution directory server actions", () => {
  it("loads only from the authenticated identity and returns closed error codes", async () => {
    expect(await listInstitutionDirectoryAction()).toMatchObject({ ok: true, state });
    expect(listInstitutionDirectory).toHaveBeenCalledWith(expect.anything(), user.id);
    vi.mocked(listInstitutionDirectory).mockRejectedValueOnce(new Error("secret raw provider detail"));
    expect(await listInstitutionDirectoryAction()).toEqual({ ok: false, code: "load-failed" });
  });

  it("runs the real requireUser guard and refuses an unsigned session before storage", async () => {
    vi.mocked(createClient).mockResolvedValue(fakeAuthClient(false) as never);
    expect(await listInstitutionDirectoryAction()).toEqual({ ok: false, code: "unauthenticated" });
    expect(listInstitutionDirectory).not.toHaveBeenCalled();
  });

  it("validates and atomically saves fixed fields for the session user only", async () => {
    const input = {
      acronym: " wwu ", fullName: "Western Wyoming", email: "teacher@example.edu", emailClient: "outlook",
      emailClientOtherName: "", emailUrl: "", lmsType: "canvas", lmsOtherName: "", lmsUrl: "https://canvas.example.edu",
      facultyPortalUrl: "", websiteUrl: "", department: "",
    };
    expect(await saveInstitutionDirectoryProfileAction(input, "update")).toEqual({ ok: true });
    expect(saveInstitutionDirectoryProfile).toHaveBeenCalledWith(expect.anything(), user.id, expect.objectContaining({ acronym: "WWU" }), "update");
    expect(await saveInstitutionDirectoryProfileAction({ ...input, api_key: "do-not-store" }, "update")).toMatchObject({ ok: false });
    expect(saveInstitutionDirectoryProfile).toHaveBeenCalledTimes(1);
  });

  it("refuses duplicate creates and stale updates, preserving legacy LMS metadata on edits", async () => {
    const input = { acronym: "WWU", fullName: "Western Wyoming", email: "", emailClient: "", emailClientOtherName: "", emailUrl: "", lmsType: "d2l", lmsOtherName: "", lmsUrl: "", facultyPortalUrl: "", websiteUrl: "", department: "" };
    expect(await saveInstitutionDirectoryProfileAction(input, "create")).toEqual({ ok: false, code: "duplicate-acronym" });
    vi.mocked(listInstitutionDirectory).mockResolvedValueOnce({ ...state, records: [] } as never);
    expect(await saveInstitutionDirectoryProfileAction({ ...input, lmsType: "" }, "create")).toEqual({ ok: true });
    expect(saveInstitutionDirectoryProfile).toHaveBeenCalledWith(expect.anything(), user.id, expect.objectContaining({ acronym: "WWU" }), "create");
    vi.mocked(listInstitutionDirectory).mockResolvedValueOnce({
      ...state,
      records: [{ ...record, commonValues: { ...record.commonValues, lmsType: "d2l" } }],
    } as never);
    expect(await saveInstitutionDirectoryProfileAction(input, "update")).toEqual({ ok: true });
    expect(saveInstitutionDirectoryProfile).toHaveBeenCalledWith(expect.anything(), user.id, expect.objectContaining({ lmsType: "d2l" }), "update");

    vi.mocked(listInstitutionDirectory).mockResolvedValueOnce({ ...state, records: [] } as never);
    expect(await saveInstitutionDirectoryProfileAction(input, "update")).toEqual({ ok: false, code: "target-not-found" });
    expect(saveInstitutionDirectoryProfile).toHaveBeenCalledTimes(2);
  });

  it("rejects custom-column updates for IDs outside the authenticated user's listed rows", async () => {
    expect(await saveInstitutionDirectoryColumnAction({ id: "00000000-0000-0000-0000-000000000000", label: "Area", type: "text" }))
      .toEqual({ ok: false, code: "invalid-column" });
    expect(saveInstitutionDirectoryColumn).not.toHaveBeenCalled();
    expect(await saveInstitutionDirectoryColumnAction({ label: "Time Zone", type: "text" })).toMatchObject({ ok: true });
    expect(saveInstitutionDirectoryColumn).toHaveBeenCalledWith(expect.anything(), user.id, { label: "Time Zone", type: "text" });
  });

  it("saves a value only when its institution and column are both in the user's current directory", async () => {
    expect(await saveInstitutionDirectoryValueAction({ acronym: "WWU", columnId: "column-a", value: "West" })).toEqual({ ok: true });
    expect(saveInstitutionDirectoryValue).toHaveBeenCalledWith(expect.anything(), user.id, "WWU", "column-a", "West");
    expect(await saveInstitutionDirectoryValueAction({ acronym: "OTHER", columnId: "column-a", value: "West" }))
      .toEqual({ ok: false, code: "target-not-found" });
    expect(await saveInstitutionDirectoryValueAction({ acronym: "WWU", columnId: "column-a", value: "", password: "private" }))
      .toEqual({ ok: false, code: "invalid-value" });
    expect(saveInstitutionDirectoryValue).toHaveBeenCalledTimes(1);
  });

  it("normalizes profile-removal keys and scopes removals by the session identity", async () => {
    expect(await removeInstitutionDirectoryProfileAction(" wwu ")).toEqual({ ok: true });
    expect(removeInstitutionDirectoryProfile).toHaveBeenCalledWith(expect.anything(), user.id, "WWU");
    expect(await removeInstitutionDirectoryColumnAction("not-an-id")).toEqual({ ok: false, code: "invalid-column" });
    expect(removeInstitutionDirectoryColumn).not.toHaveBeenCalled();
  });
});
