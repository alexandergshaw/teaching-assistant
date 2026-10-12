import { beforeEach, describe, expect, it, vi } from "vitest";

const listCourses = vi.fn();
const resolveInstitutionByCode = vi.fn();

vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: vi.fn(async () => undefined),
}));
vi.mock("@/lib/canvas-core", () => ({
  resolveInstitutionByCode: (code: string) => resolveInstitutionByCode(code),
}));
vi.mock("@/lib/live-messaging/enrollment-readers", () => ({
  buildLiveEnrollmentReaders: () => ({ listCourses }),
}));

import { listLiveCoursesAction } from "./live-messaging-enrollments";

describe("listLiveCoursesAction error branch", () => {
  beforeEach(() => {
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
