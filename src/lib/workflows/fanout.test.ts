import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  listConfiguredInstitutionsAction: vi.fn(),
  listCourseHubAction: vi.fn(),
}));

import {
  isInstitutionFanout,
  isCourseFanout,
  hasCourseMultiplicity,
  isComposedFanout,
  composedGroupLabel,
  scopeForInstitution,
  scopeForCourse,
  resolveFanoutInstitutions,
  resolveFanoutCourses,
} from "./fanout";
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

describe("hasCourseMultiplicity", () => {
  it("is true when hubCourse is *", () => {
    expect(hasCourseMultiplicity({ hubCourse: "*" })).toBe(true);
    expect(hasCourseMultiplicity({ hubCourse: " * " })).toBe(true);
  });

  it("is true when hubCourse contains 2+ newline-separated non-empty ids", () => {
    expect(hasCourseMultiplicity({ hubCourse: "a\nb" })).toBe(true);
    expect(hasCourseMultiplicity({ hubCourse: "a\nb\nc" })).toBe(true);
    expect(hasCourseMultiplicity({ hubCourse: "a\n\nb" })).toBe(true);
  });

  it("is false when hubCourse is a single id", () => {
    expect(hasCourseMultiplicity({ hubCourse: "a" })).toBe(false);
    expect(hasCourseMultiplicity({ hubCourse: " a " })).toBe(false);
  });

  it("is false when hubCourse is empty or absent", () => {
    expect(hasCourseMultiplicity({ hubCourse: "" })).toBe(false);
    expect(hasCourseMultiplicity({})).toBe(false);
    expect(hasCourseMultiplicity(undefined)).toBe(false);
  });

  it("is institution-blind (true regardless of institution)", () => {
    expect(hasCourseMultiplicity({ institution: "*", hubCourse: "*" })).toBe(true);
    expect(hasCourseMultiplicity({ institution: "*", hubCourse: "a\nb" })).toBe(true);
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

  it("is false when institution is * (institution wins - see isComposedFanout)", () => {
    expect(isCourseFanout({ institution: "*", hubCourse: "*" })).toBe(false);
    expect(isCourseFanout({ institution: "*", hubCourse: "a\nb" })).toBe(false);
  });

  it("is false when hubCourse is empty or absent", () => {
    expect(isCourseFanout({ hubCourse: "" })).toBe(false);
    expect(isCourseFanout({})).toBe(false);
    expect(isCourseFanout(undefined)).toBe(false);
  });
});

describe("isComposedFanout", () => {
  it("is true only when institution is * AND hubCourse has multiplicity", () => {
    expect(isComposedFanout({ institution: "*", hubCourse: "*" })).toBe(true);
    expect(isComposedFanout({ institution: "*", hubCourse: "a\nb" })).toBe(true);
  });

  it("is false when only institution fans out (single course tile)", () => {
    expect(isComposedFanout({ institution: "*", hubCourse: "a" })).toBe(false);
    expect(isComposedFanout({ institution: "*" })).toBe(false);
  });

  it("is false when only the course dimension fans out", () => {
    expect(isComposedFanout({ institution: "MCC", hubCourse: "*" })).toBe(false);
    expect(isComposedFanout({ hubCourse: "*" })).toBe(false);
  });

  it("is false when neither dimension fans out", () => {
    expect(isComposedFanout({ institution: "MCC", hubCourse: "a" })).toBe(false);
    expect(isComposedFanout(undefined)).toBe(false);
  });
});

describe("composedGroupLabel", () => {
  it("prefixes the institution when present", () => {
    expect(composedGroupLabel("Intro to CS", "MCC")).toBe("MCC: Intro to CS");
  });

  it("falls back to the course name alone when the institution is empty or null", () => {
    expect(composedGroupLabel("Intro to CS", "")).toBe("Intro to CS");
    expect(composedGroupLabel("Intro to CS", null)).toBe("Intro to CS");
    expect(composedGroupLabel("Intro to CS", undefined)).toBe("Intro to CS");
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
  it("expands * to all tiles matching the institution, carrying each tile's institution", async () => {
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
        { id: "t1", name: "Course A", institution: "MCC" },
        { id: "t3", name: "Course C", institution: "MCC" },
      ],
    });
  });

  it("expands * to all tiles across every institution when no institution is provided (the composed fan-out path)", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        { id: "t1", name: "Course A", institution: "MCC" } as Course,
        { id: "t2", name: "Course B", institution: "UT" } as Course,
      ],
    });
    const result = await resolveFanoutCourses({ hubCourse: "*" }, null);
    expect(result).toEqual({
      list: [
        { id: "t1", name: "Course A", institution: "MCC" },
        { id: "t2", name: "Course B", institution: "UT" },
      ],
    });
  });

  it("carries a null institution for a tile with none set", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "t1", name: "Course A", institution: null } as Course],
    });
    const result = await resolveFanoutCourses({ hubCourse: "*" }, null);
    expect(result).toEqual({ list: [{ id: "t1", name: "Course A", institution: null }] });
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
        { id: "t1", name: "Course A", institution: "MCC" },
        { id: "t2", name: "Course B", institution: "UT" },
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
