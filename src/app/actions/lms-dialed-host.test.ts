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
import { CanvasTransportError, type CanvasNetworkFailure } from "@/lib/canvas-network-failure";
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
    expect(result).toMatchObject({
      error: "Canvas did not respond. (dialed rize.instructure.com)",
      attemptedHost: "rize.instructure.com",
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|access_token|api\/v1/);
  });

  it("falls back to the bare message when the host cannot be resolved", async () => {
    listCourses.mockRejectedValue(new Error("Canvas did not respond."));
    resolveInstitutionByCode.mockRejectedValue(new Error("no credential"));
    const result = await listCoursesAction("RIZE");
    expect(result).toMatchObject({ error: "Canvas did not respond.", attemptedHost: undefined });
  });
});

describe("listCourseAssignmentsAction dialed host", () => {
  it("folds ONLY the host into the error and returns a discrete attemptedHost", async () => {
    listAssignments.mockRejectedValue(new Error("Canvas did not respond."));
    resolveInstitutionByCode.mockResolvedValue({ baseUrl: LEAKY });
    const result = await listCourseAssignmentsAction(" rize ", "123");
    expect(result).toMatchObject({
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
    expect(result).toMatchObject({ error: "Canvas did not respond.", attemptedHost: undefined });
  });
});

function transportError(): CanvasTransportError {
  const failure: CanvasNetworkFailure = {
    phase: "connect",
    code: "ABORT_ERR",
    name: "AbortError",
    failedAfterMs: 15000,
    host: "rize.instructure.com",
  };
  return new CanvasTransportError("Canvas did not respond.", failure);
}

describe("owner gating of the fine cause (AC-10, AC-12)", () => {
  it("gives the owner the cause sentence and networkFailure, with no host re-resolution", async () => {
    vi.mocked(getAppUser).mockResolvedValue({ ...userRow(), role: "owner" });
    listCourses.mockRejectedValue(transportError());
    const result = await listCoursesAction("RIZE");
    expect(result).toMatchObject({
      attemptedHost: "rize.instructure.com",
      networkFailure: { cause: "connect-timeout", code: "ABORT_ERR", phase: "connect", failedAfterMs: 15000 },
    });
    const error = (result as { error: string }).error;
    expect(error).toContain("Canvas did not respond. ");
    expect(error).toContain("(dialed rize.instructure.com)");
    expect(error.length).toBeGreaterThan("Canvas did not respond. (dialed rize.instructure.com)".length);
    expect(resolveInstitutionByCode).not.toHaveBeenCalled();
  });

  it("gives an instructor the flat message and host, and NO networkFailure key", async () => {
    listCourses.mockRejectedValue(transportError());
    const result = await listCoursesAction("RIZE");
    expect(result).toStrictEqual({
      error: "Canvas did not respond. (dialed rize.instructure.com)",
      attemptedHost: "rize.instructure.com",
      serverMs: expect.any(Number),
    });
    expect(resolveInstitutionByCode).not.toHaveBeenCalled();
  });

  it("applies the same gating to the assignments action", async () => {
    listAssignments.mockRejectedValue(transportError());
    const flat = await listCourseAssignmentsAction("RIZE", "123");
    expect(flat).toStrictEqual({
      error: "Canvas did not respond. (dialed rize.instructure.com)",
      attemptedHost: "rize.instructure.com",
      serverMs: expect.any(Number),
    });
    vi.mocked(getAppUser).mockResolvedValue({ ...userRow(), role: "owner" });
    const fine = await listCourseAssignmentsAction("RIZE", "123");
    expect(fine).toMatchObject({ networkFailure: { cause: "connect-timeout" } });
  });

  it("still re-resolves exactly once when the error carries no failure", async () => {
    listCourses.mockRejectedValue(new Error("Canvas did not respond."));
    resolveInstitutionByCode.mockResolvedValue({ baseUrl: LEAKY });
    await listCoursesAction("RIZE");
    expect(resolveInstitutionByCode).toHaveBeenCalledTimes(1);
  });

  it("reports an HTTP-status cause to a non-owner too (text every user already sees)", async () => {
    listCourses.mockRejectedValue(new Error("Canvas request failed (HTTP 503)."));
    resolveInstitutionByCode.mockResolvedValue({ baseUrl: LEAKY });
    const result = await listCoursesAction("RIZE");
    expect(result).toMatchObject({ networkFailure: { cause: "http-503" } });
  });
});
