import { describe, it, expect } from "vitest";
import { scaffoldCourseProjectRubric, scaffoldCourseOutline } from "./course";

describe("scaffoldCourseProjectRubric", () => {
  it("produces three criteria whose max points sum to 100", () => {
    const text = scaffoldCourseProjectRubric();
    expect(text).toContain("COURSE-WIDE GRADING RUBRIC (100 points)");
    const maxScores = [...text.matchAll(/\((\d+)pts\)/g)].map((m) => Number(m[1]));
    expect(maxScores).toEqual([40, 30, 30]);
    expect(maxScores.reduce((a, b) => a + b, 0)).toBe(100);
    expect(text).toContain("Excellent:");
    expect(text).toContain("Needs Improvement:");
  });
});

describe("scaffoldCourseOutline", () => {
  it("names detected technologies and one week per top-level directory", () => {
    const paths = [
      "README.md",
      "backend/app.py",
      "backend/models.py",
      "frontend/index.html",
      "frontend/app.js",
    ];
    const outline = scaffoldCourseOutline("acme/demo", paths);
    expect(outline).toContain("# Course from acme/demo");
    expect(outline).toContain("Python");
    expect(outline).toContain("## Week 1 — Getting Started");
    expect(outline).toContain("Backend");
    expect(outline).toContain("Frontend");
    expect(outline).toContain("## Capstone");
  });

  it("falls back to files when the repo is flat", () => {
    const outline = scaffoldCourseOutline("acme/flat", ["main.py", "utils.py"]);
    expect(outline).toContain("## Week 2");
    expect(outline).toContain("## Capstone");
  });

  it("notes truncation when set", () => {
    const outline = scaffoldCourseOutline("acme/big", ["src/a.ts"], true);
    expect(outline.toLowerCase()).toContain("sampled");
  });
});
