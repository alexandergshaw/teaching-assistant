import { describe, it, expect, vi } from "vitest";
import {
  aggregateEnrollments,
  countMissingByUser,
  type EnrollmentReaders,
  type LiveCourse,
} from "./enrollment-aggregator";

const COURSES: LiveCourse[] = [
  { id: "1", name: "CS 101", termName: "Fall 2026" },
  { id: "2", name: "CS 202", termName: "Fall 2026" },
  { id: "3", name: "CS 303", termName: null },
];

function readers(over: Partial<EnrollmentReaders> = {}): EnrollmentReaders {
  return {
    listCourses: async () => COURSES,
    listRoster: async (_i, courseId) => {
      if (courseId === "1") {
        return [
          { id: "10", name: "Ada Lovelace", sortableName: "Lovelace, Ada" },
          { id: "11", name: "Grace Hopper", sortableName: "Hopper, Grace" },
        ];
      }
      if (courseId === "2") return [{ id: "10", name: "Ada Lovelace", sortableName: "Lovelace, Ada" }];
      return [{ id: "12", name: "Alan Turing", sortableName: "Turing, Alan" }];
    },
    listGrades: async (_i, courseId) => {
      if (courseId === "1") {
        return [
          { userId: "10", currentScore: 90 },
          { userId: "11", currentScore: 55 },
        ];
      }
      if (courseId === "2") return [{ userId: "10", currentScore: 70 }];
      return [{ userId: "12", currentScore: null }];
    },
    listMissing: async (_i, courseId): Promise<Record<string, number>> =>
      courseId === "1" ? { "10": 1, "11": 4 } : courseId === "2" ? { "10": 0 } : {},
    listSections: async (_i, courseId) => {
      if (courseId === "1") {
        return [
          { userId: "10", sectionId: "100", sectionName: "Sec A" },
          { userId: "11", sectionId: "101", sectionName: "Sec B" },
        ];
      }
      if (courseId === "2") return [{ userId: "10", sectionId: "200", sectionName: "Sec Z" }];
      return [];
    },
    ...over,
  };
}

describe("aggregateEnrollments - row shape", () => {
  it("makes one row per (student, course, section): a student in two courses is two rows", async () => {
    const result = await aggregateEnrollments(readers(), "MCC");
    expect(result.listError).toBeNull();
    expect(result.rows).toHaveLength(4);
    const ada = result.rows.filter((r) => r.userId === "10");
    expect(ada.map((r) => r.course).sort()).toEqual(["CS 101", "CS 202"]);
    expect(new Set(result.rows.map((r) => r.key)).size).toBe(4);
  });

  it("binds each row's own grade, missing count, section, term and parsed names", async () => {
    const result = await aggregateEnrollments(readers(), "MCC");
    const grace = result.rows.find((r) => r.userId === "11");
    expect(grace).toMatchObject({
      institution: "MCC",
      course: "CS 101",
      term: "Fall 2026",
      section: "Sec B",
      sectionId: "101",
      grade: 55,
      missingCount: 4,
      firstName: "Grace",
      lastName: "Hopper",
    });
    const adaTwo = result.rows.find((r) => r.userId === "10" && r.course === "CS 202");
    expect(adaTwo).toMatchObject({ section: "Sec Z", grade: 70, missingCount: 0 });
  });

  it("emits two rows for a student enrolled in two sections of one course", async () => {
    const result = await aggregateEnrollments(
      readers({
        listCourses: async () => [COURSES[0]],
        listSections: async () => [
          { userId: "10", sectionId: "100", sectionName: "Sec A" },
          { userId: "10", sectionId: "109", sectionName: "Sec Lab" },
        ],
      }),
      "MCC"
    );
    expect(result.rows.filter((r) => r.userId === "10").map((r) => r.section).sort()).toEqual(["Sec A", "Sec Lab"]);
  });

  it("gives a student with no section enrollment a single row with an empty section", async () => {
    const result = await aggregateEnrollments(readers({ listCourses: async () => [COURSES[2]] }), "MCC");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ section: "", sectionId: null, grade: null, missingCount: 0, term: null });
  });
});

describe("aggregateEnrollments - per-course error partition", () => {
  it("a roster failure fails only that course; the others still return rows", async () => {
    const base = readers();
    const result = await aggregateEnrollments(
      readers({
        listRoster: async (i, courseId) => {
          if (courseId === "2") throw new Error("Canvas request failed (HTTP 500)");
          return base.listRoster(i, courseId);
        },
      }),
      "MCC"
    );
    expect(result.rows.map((r) => r.course)).not.toContain("CS 202");
    expect(result.rows.filter((r) => r.course === "CS 101")).toHaveLength(2);
    expect(result.rows.filter((r) => r.course === "CS 303")).toHaveLength(1);
    const failed = result.courses.find((c) => c.courseId === "2");
    expect(failed).toMatchObject({ kind: "failed", error: "Canvas request failed (HTTP 500)" });
    expect(result.courses.filter((c) => c.kind === "ok")).toHaveLength(2);
    expect(result.courses).toHaveLength(3);
  });

  it("a grades failure degrades the course: rows kept, grade null, status partial", async () => {
    const result = await aggregateEnrollments(
      readers({
        listGrades: async (_i, courseId) => {
          if (courseId === "1") throw new Error("grades down");
          return [{ userId: "10", currentScore: 70 }];
        },
      }),
      "MCC"
    );
    const one = result.rows.filter((r) => r.courseId === "1");
    expect(one).toHaveLength(2);
    expect(one.every((r) => r.grade === null)).toBe(true);
    expect(one.every((r) => r.missingCount !== null)).toBe(true);
    expect(result.courses.find((c) => c.courseId === "1")).toMatchObject({
      kind: "partial",
      degraded: ["grades"],
      errors: ["grades down"],
    });
    expect(result.rows.find((r) => r.courseId === "2")?.grade).toBe(70);
  });

  it("missing and sections failures are reported by name and leave null / empty values", async () => {
    const result = await aggregateEnrollments(
      readers({
        listCourses: async () => [COURSES[0]],
        listMissing: async () => {
          throw new Error("m");
        },
        listSections: async () => {
          throw new Error("s");
        },
      }),
      "MCC"
    );
    expect(result.rows.every((r) => r.missingCount === null && r.section === "")).toBe(true);
    expect(result.courses[0]).toMatchObject({ kind: "partial", degraded: ["missing", "sections"] });
  });

  it("a course-list failure returns no rows and a listError, without throwing", async () => {
    const result = await aggregateEnrollments(
      readers({
        listCourses: async () => {
          throw new Error("401");
        },
      }),
      "MCC"
    );
    expect(result).toEqual({ rows: [], courses: [], listError: "401" });
  });

  it("calls the readers with the institution code and respects the concurrency bound", async () => {
    let inFlight = 0;
    let peak = 0;
    const base = readers();
    const listRoster = vi.fn(async (i: string, courseId: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return base.listRoster(i, courseId);
    });
    await aggregateEnrollments(readers({ listRoster }), "MCC", { concurrency: 1 });
    expect(listRoster).toHaveBeenCalledTimes(3);
    expect(listRoster.mock.calls.every((c) => c[0] === "MCC")).toBe(true);
    expect(peak).toBe(1);
  });
});

describe("countMissingByUser", () => {
  it("counts Canvas's missing flag per user and keeps zero-missing users", () => {
    expect(
      countMissingByUser([
        { userId: 1, missing: true },
        { userId: 1, missing: true },
        { userId: 1, missing: false },
        { userId: 2, missing: false },
      ])
    ).toEqual({ "1": 2, "2": 0 });
  });
});
