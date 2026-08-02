import { describe, it, expect } from "vitest";
import { courseStructureToSchedule, type CourseStructureModule } from "./course-structure-schedule";

describe("courseStructureToSchedule", () => {
  it("returns an empty schedule for zero modules, regardless of targetWeeks", () => {
    expect(courseStructureToSchedule([], null)).toEqual([]);
    expect(courseStructureToSchedule([], 5)).toEqual([]);
  });

  it("maps a single module to a single week when targetWeeks is null", () => {
    const modules: CourseStructureModule[] = [
      { title: "Intro", items: [{ title: "Syllabus" }, { title: "Icebreaker" }] },
    ];
    const schedule = courseStructureToSchedule(modules, null);
    expect(schedule).toEqual([
      {
        week: 1,
        topic: "Intro",
        summary: "Covers: Syllabus, Icebreaker",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      },
    ]);
  });

  it("pads with Review placeholder weeks when there is one module and more weeks than modules", () => {
    const modules: CourseStructureModule[] = [{ title: "Intro", items: [] }];
    const schedule = courseStructureToSchedule(modules, 3);
    expect(schedule).toHaveLength(3);
    expect(schedule[0]).toMatchObject({ week: 1, topic: "Intro" });
    expect(schedule[1]).toMatchObject({ week: 2, topic: "Review" });
    expect(schedule[2]).toMatchObject({ week: 3, topic: "Review" });
  });

  it("spreads modules across weeks (fewer modules than weeks) rather than bunching them at the start", () => {
    const modules: CourseStructureModule[] = [
      { title: "Module A", items: [] },
      { title: "Module B", items: [] },
    ];
    const schedule = courseStructureToSchedule(modules, 5);
    expect(schedule).toHaveLength(5);
    // bucket index = floor(i * 5 / 2): module 0 -> bucket 0, module 1 -> bucket 2.
    expect(schedule.map((w) => w.topic)).toEqual([
      "Module A",
      "Review",
      "Module B",
      "Review",
      "Review",
    ]);
  });

  it("groups modules into shared weeks when there are more modules than weeks", () => {
    const modules: CourseStructureModule[] = [
      { title: "M1", items: [{ title: "Reading 1" }] },
      { title: "M2", items: [{ title: "Reading 2" }] },
      { title: "M3", items: [] },
      { title: "M4", items: [{ title: "Reading 4" }] },
      { title: "M5", items: [] },
    ];
    const schedule = courseStructureToSchedule(modules, 2);
    expect(schedule).toHaveLength(2);
    // bucket index = floor(i * 2 / 5): modules 0,1,2 -> bucket 0; modules 3,4 -> bucket 1.
    expect(schedule[0].topic).toBe("M1; M2; M3");
    expect(schedule[0].summary).toBe("Covers: Reading 1, Reading 2");
    expect(schedule[1].topic).toBe("M4; M5");
    expect(schedule[1].summary).toBe("Covers: Reading 4");
  });

  it("drops items with blank titles, keeping only the non-blank ones", () => {
    const modules: CourseStructureModule[] = [
      {
        title: "Week 1",
        items: [{ title: "   " }, { title: "Real Item" }, { title: "" }],
      },
    ];
    const schedule = courseStructureToSchedule(modules, null);
    expect(schedule[0].summary).toBe("Covers: Real Item");
  });

  it("falls back to a generic no-items message when every item title is blank", () => {
    const modules: CourseStructureModule[] = [
      { title: "Week 1", items: [{ title: "   " }, { title: "" }] },
    ];
    const schedule = courseStructureToSchedule(modules, null);
    expect(schedule[0].summary).toBe("No items listed for this module.");
  });

  it("defaults a blank module title to 'Untitled module'", () => {
    const modules: CourseStructureModule[] = [{ title: "   ", items: [] }];
    const schedule = courseStructureToSchedule(modules, null);
    expect(schedule[0].topic).toBe("Untitled module");
  });

  it("treats a non-positive or non-integer targetWeeks the same as null (one week per module)", () => {
    const modules: CourseStructureModule[] = [
      { title: "M1", items: [] },
      { title: "M2", items: [] },
    ];
    for (const badWeeks of [0, -3, 2.5, NaN]) {
      const schedule = courseStructureToSchedule(modules, badWeeks);
      expect(schedule).toHaveLength(2);
      expect(schedule.map((w) => w.topic)).toEqual(["M1", "M2"]);
    }
  });
});
