import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  listConfiguredInstitutionsAction: vi.fn(),
  listCourseHubAction: vi.fn(),
}));

import { isInstitutionFanout, isCourseFanout, scopeForInstitution, scopeForCourse, resolveFanoutInstitutions, resolveFanoutCourses } from "./fanout";
import { listConfiguredInstitutionsAction, listCourseHubAction } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";

describe("isInstitutionFanout", () => {
  it("is true only when the scope targets every institution", () => {
    expect(isInstitutionFanout({ institution: "*" })).toBe(true);
    expect(isInstitutionFanout({ institution: " * " })).toBe(true);
    expect(isInstitutionFanout({ institution: "MCC" })).toBe(false);
    expect(isInstitutionFanout({})).toBe(false);
    expect(isInstitutionFanout(undefined)).toBe(false);
    expect(isInstitutionFanout({ hubCourse: "*" })).toBe(false);
  });
});

describe("scopeForInstitution", () => {
  it("pins the institution and preserves the other scope families", () => {
    expect(scopeForInstitution({ institution: "*", hubCourse: "a\nb", org: "x" }, "MCC")).toEqual({
      institution: "MCC",
      hubCourse: "a\nb",
      org: "x",
    });
  });

  it("preserves the lookahead value through institution fan-out", () => {
    expect(scopeForInstitution({ institution: "*", lookahead: "14" }, "UT")).toEqual({
      institution: "UT",
      lookahead: "14",
    });
    expect(scopeForInstitution({ institution: "*", hubCourse: "a", lookahead: "7" }, "OSU")).toEqual({
      institution: "OSU",
      hubCourse: "a",
      lookahead: "7",
    });
  });
});

describe("resolveFanoutInstitutions", () => {
  it("returns the configured acronym list", async () => {
    vi.mocked(listConfiguredInstitutionsAction).mockResolvedValue({ acronyms: ["AAA", "BBB"] });
    expect(await resolveFanoutInstitutions()).toEqual({ list: ["AAA", "BBB"] });
  });

  it("propagates an enumeration error instead of returning an empty list", async () => {
    vi.mocked(listConfiguredInstitutionsAction).mockResolvedValue({ error: "no access" });
    expect(await resolveFanoutInstitutions()).toEqual({ error: "no access" });
  });
});

describe("isCourseFanout", () => {
  it("is true when hubCourse is *", () => {
    expect(isCourseFanout({ hubCourse: "*" })).toBe(true);
    expect(isCourseFanout({ hubCourse: " * " })).toBe(true);
  });

  it("is true when hubCourse contains 2+ newline-separated non-empty ids", () => {
    expect(isCourseFanout({ hubCourse: "a\nb" })).toBe(true);
    expect(isCourseFanout({ hubCourse: "a\nb\nc" })).toBe(true);
    expect(isCourseFanout({ hubCourse: "a\n\nb" })).toBe(true);
  });

  it("is false when hubCourse is a single id (no fan-out)", () => {
    expect(isCourseFanout({ hubCourse: "a" })).toBe(false);
    expect(isCourseFanout({ hubCourse: " a " })).toBe(false);
  });

  it("is false when institution is * (institution wins)", () => {
    expect(isCourseFanout({ institution: "*", hubCourse: "*" })).toBe(false);
    expect(isCourseFanout({ institution: "*", hubCourse: "a\nb" })).toBe(false);
  });

  it("is false when hubCourse is empty or absent", () => {
    expect(isCourseFanout({ hubCourse: "" })).toBe(false);
    expect(isCourseFanout({})).toBe(false);
    expect(isCourseFanout(undefined)).toBe(false);
  });
});

describe("scopeForCourse", () => {
  it("pins the course and preserves the other scope families", () => {
    expect(scopeForCourse({ hubCourse: "*", institution: "MCC", org: "x" }, "tile1")).toEqual({
      hubCourse: "tile1",
      institution: "MCC",
      org: "x",
    });
  });

  it("preserves the lookahead value through course fan-out", () => {
    expect(scopeForCourse({ hubCourse: "a\nb", lookahead: "14" }, "a")).toEqual({
      hubCourse: "a",
      lookahead: "14",
    });
  });
});

describe("resolveFanoutCourses", () => {
  it("expands * to all tiles matching the institution", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        { id: "t1", name: "Course A", institution: "MCC" } as Course,
        { id: "t2", name: "Course B", institution: "UT" } as Course,
        { id: "t3", name: "Course C", institution: "MCC" } as Course,
      ],
    });
    const result = await resolveFanoutCourses({ hubCourse: "*" }, "MCC");
    expect(result).toEqual({
      list: [
        { id: "t1", name: "Course A" },
        { id: "t3", name: "Course C" },
      ],
    });
  });

  it("expands * to all tiles when no institution is provided", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        { id: "t1", name: "Course A", institution: "MCC" } as Course,
        { id: "t2", name: "Course B", institution: "UT" } as Course,
      ],
    });
    const result = await resolveFanoutCourses({ hubCourse: "*" }, null);
    expect(result).toEqual({
      list: [
        { id: "t1", name: "Course A" },
        { id: "t2", name: "Course B" },
      ],
    });
  });

  it("resolves a concrete list and skips unresolvable ids", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        { id: "t1", name: "Course A", institution: "MCC" } as Course,
        { id: "t2", name: "Course B", institution: "UT" } as Course,
      ],
    });
    const result = await resolveFanoutCourses({ hubCourse: "t1\nt99\nt2" }, null);
    expect(result).toEqual({
      list: [
        { id: "t1", name: "Course A" },
        { id: "t2", name: "Course B" },
      ],
    });
  });

  it("returns an error when the action fails", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ error: "connection failed" });
    const result = await resolveFanoutCourses({ hubCourse: "*" }, "MCC");
    expect(result).toEqual({ error: "connection failed" });
  });

  it("returns an empty list when hubCourse is empty", async () => {
    const result = await resolveFanoutCourses({ hubCourse: "" }, "MCC");
    expect(result).toEqual({ list: [] });
  });
});
