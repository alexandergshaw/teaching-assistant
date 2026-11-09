import { describe, expect, it } from "vitest";
import { discussionClassFilters, discussionSchoolLabel } from "./discussion-class-filters";

const courses = [
  { id: "a", name: "Biology", institution: "North", courseCode: "BIO", term: "Fall" },
  { id: "b", name: "Biology", institution: "North", courseCode: "BIO", term: "Fall" },
  { id: "c", name: "Biology", institution: "South", courseCode: null, term: null },
  { id: "d", name: "History", institution: null, courseCode: null, term: null },
];

describe("discussion class hierarchy", () => {
  it("shows one school's classes and disambiguates otherwise identical labels", () => {
    const north = discussionClassFilters(courses, "North");
    expect(north.institutions).toEqual(["North", "South", ""]);
    expect(north.classes).toEqual([{ id: "a", label: "Biology (BIO · Fall) (a)" }, { id: "b", label: "Biology (BIO · Fall) (b)" }]);
    expect(discussionClassFilters(courses, "South").classes).toEqual([{ id: "c", label: "Biology" }]);
    expect(discussionClassFilters(courses, "").classes).toEqual([{ id: "d", label: "History" }]);
  });
  it("handles empty and removed schools without inventing classes", () => {
    expect(discussionClassFilters([], "North").classes).toEqual([]);
    expect(discussionClassFilters(courses, "Missing").activeInstitution).toBe("North");
  });
  it("distinguishes missing schools even when real schools use the fallback names", () => {
    const schools = ["School not set", "School not set (missing)", ""];
    expect(discussionSchoolLabel("", schools)).toBe("School not set (missing) (missing)");
    expect(discussionSchoolLabel("School not set", schools)).toBe("School not set");
  });
});
