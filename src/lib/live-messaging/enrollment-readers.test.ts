import { describe, it, expect, vi } from "vitest";
import { aggregateEnrollments } from "./enrollment-aggregator";
import { buildLiveEnrollmentReaders, type LiveCanvasDeps } from "./enrollment-readers";

const CTX = { institution: { code: "CC", name: "CC", host: "cc.example" }, token: "tok", baseUrl: "https://cc.example" };

function deps(over: Partial<LiveCanvasDeps> = {}): LiveCanvasDeps {
  return {
    resolveInstitutionByCode: vi.fn(async () => CTX),
    listActiveTeacherCourses: vi.fn(async () => [
      { id: "1", name: "CS 101" },
      { id: "2", name: "CS 202" },
    ]),
    listCoursesByTerm: vi.fn(async () => [
      { id: "1", name: "CS 101", courseCode: null, termName: "Fall 2026", startAt: null },
      { id: "2", name: "CS 202", courseCode: null, termName: null, startAt: null },
      { id: "9", name: "Concluded", courseCode: null, termName: "Old", startAt: null },
    ]),
    listAssignments: vi.fn(async () => [
      { id: "a1", name: "A1", pointsPossible: 10 },
      { id: "a2", name: "A2", pointsPossible: 10 },
    ]),
    listCourseRoster: vi.fn(async () => [
      { id: "10", name: "Ada Lovelace", sortableName: "Lovelace, Ada", loginId: "ada" },
    ]),
    listStudentGradeSummaries: vi.fn(async () => [
      { userId: "10", name: "Ada Lovelace", currentScore: 91, finalScore: 90 },
    ]),
    listCourseSectionAssignments: vi.fn(async () => [{ userId: "10", sectionId: "s1", sectionName: "Sec A" }]),
    listCourseSubmissionGrid: vi.fn(async () => ({
      source: "bulk" as unknown as "per-assignment-fallback",
      rows: [
        { userId: 10, missing: true },
        { userId: 10, missing: true },
        { userId: 10, missing: false },
      ] as unknown as never[],
    })),
    ...over,
  } as LiveCanvasDeps;
}

describe("buildLiveEnrollmentReaders", () => {
  it("lists ACTIVE courses only, enriched with term; unknown term is null", async () => {
    const out = await buildLiveEnrollmentReaders(deps()).listCourses("CC");
    expect(out).toEqual([
      { id: "1", name: "CS 101", termName: "Fall 2026" },
      { id: "2", name: "CS 202", termName: null },
    ]);
  });
  it("degrades term to null when the term lookup throws", async () => {
    const d = deps({ listCoursesByTerm: vi.fn(async () => { throw new Error("boom"); }) });
    const out = await buildLiveEnrollmentReaders(d).listCourses("CC");
    expect(out.map((c) => c.termName)).toEqual([null, null]);
  });
  it("propagates an active-list failure", async () => {
    const d = deps({ listActiveTeacherCourses: vi.fn(async () => { throw new Error("down"); }) });
    await expect(buildLiveEnrollmentReaders(d).listCourses("CC")).rejects.toThrow("down");
  });
  it("listMissing resolves the credential, feeds assignment ids to the grid, and counts", async () => {
    const d = deps();
    const counts = await buildLiveEnrollmentReaders(d).listMissing("CC", "1");
    expect(counts).toEqual({ "10": 2 });
    expect(d.resolveInstitutionByCode).toHaveBeenCalledWith("CC");
    expect(d.listAssignments).toHaveBeenCalledWith("CC", "1");
    expect(d.listCourseSubmissionGrid).toHaveBeenCalledWith("https://cc.example", "tok", CTX.institution, "1", ["a1", "a2"]);
  });
  it("maps roster, grades and sections", async () => {
    const r = buildLiveEnrollmentReaders(deps());
    expect(await r.listRoster("CC", "1")).toEqual([{ id: "10", name: "Ada Lovelace", sortableName: "Lovelace, Ada" }]);
    expect(await r.listGrades("CC", "1")).toEqual([{ userId: "10", currentScore: 91 }]);
    expect(await r.listSections("CC", "1")).toEqual([{ userId: "10", sectionId: "s1", sectionName: "Sec A" }]);
  });
  it("runs end to end through the aggregator", async () => {
    const result = await aggregateEnrollments(buildLiveEnrollmentReaders(deps()), "CC");
    expect(result.listError).toBeNull();
    const first = result.rows.find((x) => x.courseId === "1");
    expect(first).toMatchObject({ term: "Fall 2026", section: "Sec A", grade: 91, missingCount: 2 });
  });
});
