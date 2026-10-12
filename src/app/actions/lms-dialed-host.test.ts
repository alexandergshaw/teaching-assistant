import { beforeEach, describe, expect, it, vi } from "vitest";

const listCourses = vi.fn();
const listAssignments = vi.fn();
const resolveInstitutionByCode = vi.fn();

// Targeted-mock idiom: the client and app-users lookup are mocked so the REAL
// requireUser runs. "@/lib/supabase/auth" itself is never module-mocked.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(() => ({}) as never),
}));
vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});
vi.mock("@/lib/canvas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/canvas")>();
  return { ...actual, listCourses: (...a: unknown[]) => listCourses(...a), listAssignments: (...a: unknown[]) => listAssignments(...a) };
});
vi.mock("@/lib/canvas-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/canvas-core")>();
  return { ...actual, resolveInstitutionByCode: (code: string) => resolveInstitutionByCode(code) };
});

import { createClient } from "@/lib/supabase/server";
import { getAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { listCoursesAction } from "./canvas-inbox";
import { listCourseAssignmentsAction } from "./repo-grades";

function userRow(): AppUserRow {
  return {
    id: "u1",
    email: "m@example.com",
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
  };
}

function fakeAuthClient() {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "u1", email: "m@example.com" } }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
      },
    },
  };
}

const LEAKY = "https://rize.instructure.com/api/v1?access_token=secret";

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(getAppUser).mockReset();
  vi.mocked(createClient).mockResolvedValue(fakeAuthClient() as never);
  vi.mocked(getAppUser).mockResolvedValue(userRow());
  listCourses.mockReset();
  listAssignments.mockReset();
  resolveInstitutionByCode.mockReset();
});

describe("listCoursesAction dialed host", () => {
  it("folds ONLY the host into the error and keeps the discrete attemptedHost", async () => {
    listCourses.mockRejectedValue(new Error("Canvas did not respond."));
    resolveInstitutionByCode.mockResolvedValue({ baseUrl: LEAKY });
    const result = await listCoursesAction("RIZE");
    expect(result).toEqual({
      error: "Canvas did not respond. (dialed rize.instructure.com)",
      attemptedHost: "rize.instructure.com",
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|access_token|api\/v1/);
  });

  it("falls back to the bare message when the host cannot be resolved", async () => {
    listCourses.mockRejectedValue(new Error("Canvas did not respond."));
    resolveInstitutionByCode.mockRejectedValue(new Error("no credential"));
    const result = await listCoursesAction("RIZE");
    expect(result).toEqual({ error: "Canvas did not respond.", attemptedHost: undefined });
  });
});

describe("listCourseAssignmentsAction dialed host", () => {
  it("folds ONLY the host into the error and returns a discrete attemptedHost", async () => {
    listAssignments.mockRejectedValue(new Error("Canvas did not respond."));
    resolveInstitutionByCode.mockResolvedValue({ baseUrl: LEAKY });
    const result = await listCourseAssignmentsAction(" rize ", "123");
    expect(result).toEqual({
      error: "Canvas did not respond. (dialed rize.instructure.com)",
      attemptedHost: "rize.instructure.com",
    });
    expect(resolveInstitutionByCode).toHaveBeenCalledWith("RIZE");
    expect(JSON.stringify(result)).not.toMatch(/secret|access_token|api\/v1/);
  });

  it("falls back to the bare message when the host cannot be resolved", async () => {
    listAssignments.mockRejectedValue(new Error("Canvas did not respond."));
    resolveInstitutionByCode.mockRejectedValue(new Error("no credential"));
    const result = await listCourseAssignmentsAction("RIZE", "123");
    expect(result).toEqual({ error: "Canvas did not respond.", attemptedHost: undefined });
  });
});
