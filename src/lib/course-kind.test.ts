import { describe, it, expect } from "vitest";
import {
  COURSE_KINDS,
  resolveCourseKind,
  courseKindContract,
  courseKindNoun,
} from "./course-kind";
import {
  slideDeckJsonShape,
  slideStructureRequirements,
  SLIDE_DECK_JSON_SHAPE,
  SLIDE_STRUCTURE_REQUIREMENTS,
} from "./slide-prompt";

describe("resolveCourseKind", () => {
  // Defaulting to coding is what keeps every pre-existing caller and stored
  // workflow behaving exactly as it did; applied is strictly opt-in.
  it("defaults to coding for anything unrecognized", () => {
    for (const raw of [undefined, null, "", "   ", "python", 7, {}]) {
      expect(resolveCourseKind(raw)).toBe("coding");
    }
  });

  it("accepts both real values, trimming whitespace", () => {
    expect(resolveCourseKind("applied")).toBe("applied");
    expect(resolveCourseKind("  applied  ")).toBe("applied");
    expect(resolveCourseKind("coding")).toBe("coding");
  });
});

describe("the applied contract forbids code outright", () => {
  it("says plainly that it is not a programming course", () => {
    const applied = courseKindContract("applied");
    expect(applied).toContain("NOT a programming course");
    expect(applied).toContain("Do NOT ask students to read, write, or run code");
  });

  it("redirects examples to real practice instead of software", () => {
    const applied = courseKindContract("applied");
    expect(applied).toContain("real organizations");
    expect(applied.toLowerCase()).toContain("artifact");
  });

  it("the coding contract still asks for real code", () => {
    expect(courseKindContract("coding")).toContain("read, write, and run real code");
  });

  it("every kind has a non-empty contract, label and hint", () => {
    for (const kind of COURSE_KINDS) {
      expect(kind.promptContract.trim().length).toBeGreaterThan(0);
      expect(kind.label.trim().length).toBeGreaterThan(0);
      expect(kind.hint.trim().length).toBeGreaterThan(0);
    }
  });

  it("names the course differently in running prose", () => {
    expect(courseKindNoun("coding")).toBe("programming course");
    expect(courseKindNoun("applied")).not.toContain("programming");
  });
});

describe("slide contract by course kind", () => {
  // The existing constants ARE the coding contract and must be returned
  // unchanged, so the 40+ assertions already pinning them stay meaningful.
  it("coding returns the existing constants unchanged", () => {
    expect(slideDeckJsonShape("coding")).toBe(SLIDE_DECK_JSON_SHAPE);
    expect(slideStructureRequirements("coding")).toBe(SLIDE_STRUCTURE_REQUIREMENTS);
  });

  it("the applied deck shape has no code fields at all", () => {
    const shape = slideDeckJsonShape("applied");
    expect(shape).not.toContain("codeLanguage");
    expect(shape).not.toContain('"code"');
    expect(shape).toContain("presentationTitle");
    expect(shape).toContain("notes");
  });

  it("the applied requirements forbid code explicitly", () => {
    const reqs = slideStructureRequirements("applied");
    expect(reqs).toContain('NEVER include a "code" or "codeLanguage" field');
    expect(reqs).toContain("does not involve programming");
  });

  // The applied deck must keep the same pedagogy, not become a lesser deck.
  it("the applied requirements keep the full pedagogical shape", () => {
    const reqs = slideStructureRequirements("applied");
    for (const marker of [
      "Case Study:",
      "Example:",
      "Walkthrough:",
      "Practice:",
      "Answer:",
      "Post-Lecture Practice",
      "Documentation:",
      "Modern Tech:",
      "Documentation & References",
      "BREADTH",
    ]) {
      expect(reqs, `applied requirements keep "${marker}"`).toContain(marker);
    }
  });

  it("both variants require speaker notes on every slide", () => {
    expect(slideStructureRequirements("applied")).toContain('"notes"');
    expect(slideStructureRequirements("coding")).toContain('"notes"');
  });
});
