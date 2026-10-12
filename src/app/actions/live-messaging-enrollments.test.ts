import { beforeEach, describe, expect, it, vi } from "vitest";

const listCourses = vi.fn();
const resolveInstitutionByCode = vi.fn();

// Targeted-mock idiom (grading.guard.test.ts, canvas-inbox.guard.test.ts): the
// client and the app-users lookup are mocked so the REAL requireAppOwner runs
// and resolves for an active owner session. "@/lib/supabase/auth" itself is
// never module-mocked.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(() => ({}) as never),
}));
vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});
vi.mock("@/lib/canvas-core", () => ({
  resolveInstitutionByCode: (code: string) => resolveInstitutionByCode(code),
}));
vi.mock("@/lib/live-messaging/enrollment-readers", () => ({
  buildLiveEnrollmentReaders: () => ({ listCourses }),
}));

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { listLiveCoursesAction } from "./live-messaging-enrollments";

function ownerRow(): AppUserRow {
  return {
    id: "u1",
    email: "m@example.com",
    displayName: null,
    status: "active",
    role: "owner",
    approvedAt: null,
    approvedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    statusChangedAt: null,
    statusChangedBy: null,
    roleGrantedBy: null,
  };
}

function makeFakeAuthClient(userId: string, email: string) {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: userId, email } }, error: null }),
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

describe("listLiveCoursesAction error branch", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createServiceClient).mockReset();
    vi.mocked(getAppUser).mockReset();
    vi.mocked(createClient).mockResolvedValue(makeFakeAuthClient("u1", "m@example.com") as never);
    vi.mocked(createServiceClient).mockReturnValue({} as never);
    vi.mocked(getAppUser).mockResolvedValue(ownerRow());
    listCourses.mockReset();
    resolveInstitutionByCode.mockReset();
  });

  it("names the dialed host only, never the path or query", async () => {
    listCourses.mockRejectedValue(new Error("Canvas did not respond."));
    resolveInstitutionByCode.mockResolvedValue({
      baseUrl: "https://rize.instructure.com/api/v1?access_token=secret",
    });
    const result = await listLiveCoursesAction(" RIZE ");
    expect(result).toEqual({
      error: "Canvas did not respond. (dialed rize.instructure.com)",
    });
    expect(resolveInstitutionByCode).toHaveBeenCalledWith("RIZE");
  });

  it("falls back to the bare message when the host cannot be resolved", async () => {
    listCourses.mockRejectedValue(new Error("Canvas did not respond."));
    resolveInstitutionByCode.mockRejectedValue(new Error("no credential"));
    const result = await listLiveCoursesAction("RIZE");
    expect(result).toEqual({ error: "Canvas did not respond." });
  });

  it("keeps the empty-code guard", async () => {
    const result = await listLiveCoursesAction("  ");
    expect(result).toEqual({ error: "Choose an institution first." });
  });
});
