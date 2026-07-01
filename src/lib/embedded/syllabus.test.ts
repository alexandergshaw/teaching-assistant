import { describe, it, expect } from "vitest";
import { scaffoldSyllabusFields } from "./syllabus";

describe("scaffoldSyllabusFields", () => {
  const paragraphs = [
    { id: "p1", text: "Course Title: Intro to Databases" },
    { id: "p2", text: "Instructor: Dr. Old Name" },
    { id: "p3", text: "Office Hours: Tuesdays 2-4pm" },
    { id: "p4", text: "This is boilerplate about academic integrity that should be ignored." },
    { id: "p5", text: "Meeting Times: MWF 10-11am" },
  ];

  it("detects labeled syllabus fields and skips boilerplate", () => {
    const fields = scaffoldSyllabusFields(paragraphs);
    const labels = fields.map((f) => f.label);
    expect(labels).toContain("Course title");
    expect(labels).toContain("Instructor");
    expect(labels).toContain("Office hours");
    expect(labels).toContain("Meeting times");
    expect(fields.find((f) => f.paragraphId === "p4")).toBeUndefined();
  });

  it("pre-fills a suggestion from the provided course facts", () => {
    const fields = scaffoldSyllabusFields(paragraphs, {
      courseName: "Database Management",
      instructorName: "Prof. New Name",
    });
    expect(fields.find((f) => f.label === "Course title")?.suggestedText).toBe("Database Management");
    expect(fields.find((f) => f.label === "Instructor")?.suggestedText).toBe("Prof. New Name");
  });

  it("keeps the current text as the suggestion when no fact maps", () => {
    const fields = scaffoldSyllabusFields(paragraphs);
    expect(fields.find((f) => f.label === "Office hours")?.suggestedText).toBe("Office Hours: Tuesdays 2-4pm");
  });
});
