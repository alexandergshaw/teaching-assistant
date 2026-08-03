import { describe, it, expect } from "vitest";
import {
  COURSE_KINDS,
  resolveCourseKind,
  courseKindOrNull,
  courseKindContract,
  courseKindNoun,
  courseKindFromCourseName,
  APPLIED_REAL_TOOL_RULE,
  COMMITTED_TOOLSET_RULE,
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

// F3 (course-tile-authoritative-kind fix): courseKindOrNull is the "unset-
// safe" counterpart to resolveCourseKind above - it must return null (never
// "coding") for anything not exactly one of the two known values, so a
// caller (steps.course-schedule-from-source.ts's own precedence check) can
// tell "the tile has an explicit kind" apart from "nothing is set, derive
// one instead."
describe("courseKindOrNull", () => {
  it("returns null for anything unrecognized - unlike resolveCourseKind, it never defaults to coding", () => {
    for (const raw of [undefined, null, "", "   ", "python", 7, {}]) {
      expect(courseKindOrNull(raw)).toBe(null);
    }
  });

  it("accepts both real values, trimming whitespace", () => {
    expect(courseKindOrNull("applied")).toBe("applied");
    expect(courseKindOrNull("  applied  ")).toBe("applied");
    expect(courseKindOrNull("coding")).toBe("coding");
    expect(courseKindOrNull("  coding  ")).toBe("coding");
  });
});

// AC5 (docs/REGRESSION.md entry 196): sourceDerivedKind
// (steps.course-schedule-from-source.ts) resolves "applied" for every
// source except codebase/tile-repo, with nothing inspecting the course
// NAME - so "INFO 1020 - Computer Science Principles" built from a
// tile-export source defaulted to applied, which is why its artifacts were
// Google Sheets and policy memos instead of code. courseKindFromCourseName
// is the fix: a conservative, name-only "coding" detector.
describe("courseKindFromCourseName", () => {
  it("matches the real defect course, and other unambiguous programming subjects", () => {
    // The actual course from the reported defect (REGRESSION.md entry 196).
    expect(courseKindFromCourseName("INFO 1020 - Computer Science Principles")).toBe("coding");
    // A named programming language, unambiguous on its own.
    expect(courseKindFromCourseName("Intro to Python")).toBe("coding");
    // Case-insensitive.
    expect(courseKindFromCourseName("intro to PYTHON")).toBe("coding");
    // Other phrases from the vocabulary, each an unambiguous programming subject.
    expect(courseKindFromCourseName("Data Structures and Algorithms")).toBe("coding");
    expect(courseKindFromCourseName("Web Development Bootcamp")).toBe("coding");
    expect(courseKindFromCourseName("Software Engineering I")).toBe("coding");
    expect(courseKindFromCourseName("Introduction to Programming")).toBe("coding");
    expect(courseKindFromCourseName("Object-Oriented Programming in C++")).toBe("coding");
    expect(courseKindFromCourseName("Game Development with Unity")).toBe("coding");
    // A course code prefix does not disqualify a match when a real subject
    // phrase follows it - it is the bare prefix alone that carries no signal.
    expect(courseKindFromCourseName("CS 201 - Computer Science II")).toBe("coding");
  });

  it("stays null for the real negatives that must never become coding", () => {
    // The exact negatives the AC calls out - none of these teaches code.
    expect(courseKindFromCourseName("MGT 422 - Project Management")).toBeNull();
    expect(courseKindFromCourseName("Business Ethics")).toBeNull();
    expect(courseKindFromCourseName("Computer Applications")).toBeNull();
    expect(courseKindFromCourseName("Health Information Technology")).toBeNull();
    expect(courseKindFromCourseName("")).toBeNull();
  });

  it("never matches the bare nouns the AC singles out - they belong to many non-coding fields", () => {
    expect(courseKindFromCourseName("Computer Fundamentals")).toBeNull();
    expect(courseKindFromCourseName("Software Fundamentals")).toBeNull();
    expect(courseKindFromCourseName("Database Systems")).toBeNull();
    expect(courseKindFromCourseName("Educational Technology")).toBeNull();
  });

  it("never matches a bare course-code prefix alone - ambiguous across departments", () => {
    // "CS" alone (with no real subject phrase in the title) is deliberately
    // NOT in the vocabulary - it is equally the prefix for Communication
    // Studies, Cultural Studies, or Christian Studies at different
    // institutions, and a bare prefix carries no signal on its own.
    expect(courseKindFromCourseName("CS Principles")).toBeNull();
    expect(courseKindFromCourseName("CS 101")).toBeNull();
  });

  it("is anchored to real word boundaries, not a bare substring search", () => {
    // "Javanese" contains the literal substring "java" but is not the
    // language - a naive .includes("java") would wrongly match this. The
    // word-boundary regex must not.
    expect(courseKindFromCourseName("A Survey of Javanese History and Culture")).toBeNull();
  });

  it("never returns \"applied\" - it can only upgrade an evidence-free default to \"coding\", never overturn evidence by handing back \"applied\"", () => {
    const names = [
      "INFO 1020 - Computer Science Principles",
      "Intro to Python",
      "MGT 422 - Project Management",
      "Business Ethics",
      "Computer Applications",
      "Health Information Technology",
      "",
      "Data Structures and Algorithms",
      "Applied Ethics in Technology",
    ];
    for (const name of names) {
      expect(courseKindFromCourseName(name)).not.toBe("applied");
    }
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
  // Applied no longer clones the coding cycle (Example -> Walkthrough ->
  // Practice -> Answer) - "Walkthrough" means explaining code line by line
  // and "Answer" implies one right response, neither of which fits a field
  // with no source code and no single correct move. It runs its own
  // six-slide cycle instead (Principle, In Practice, Artifact, Judgment
  // Call, Your Turn, Model Response) plus two deck-level sections coding
  // does not need (Failure Modes, Terminology), alongside everything that
  // legitimately carried over unchanged.
  it("the applied requirements keep the full pedagogical shape", () => {
    const reqs = slideStructureRequirements("applied");
    for (const marker of [
      // Carried over unchanged from the previous design.
      "Case Study:",
      "Post-Lecture Practice",
      "Documentation:",
      "Modern Tech:",
      "Documentation & References",
      "BREADTH",
      // The six-slide applied concept cycle that replaced
      // Example/Walkthrough/Practice/Answer.
      "Principle:",
      "In Practice:",
      "Artifact:",
      "Judgment Call:",
      "Your Turn:",
      "Model Response:",
      // New deck-level sections the applied variant needs that coding does not.
      "Failure Modes:",
      "Terminology:",
    ]) {
      expect(reqs, `applied requirements keep "${marker}"`).toContain(marker);
    }
  });

  // Pins the redesign: if someone later re-clones the coding cycle into
  // applied, this must go red. "Practice:" is deliberately excluded here -
  // it is a substring of both "In Practice:" and "Post-Lecture Practice",
  // both of which legitimately belong in the applied requirements, so a
  // bare toContain("Practice:") would pass for the wrong reason.
  it("the applied requirements do not resurrect the coding-only cycle", () => {
    const reqs = slideStructureRequirements("applied");
    for (const marker of ["Example:", "Walkthrough:", "Answer:"]) {
      expect(reqs, `applied requirements do not contain "${marker}"`).not.toContain(marker);
    }
  });

  it("both variants require speaker notes on every slide", () => {
    expect(slideStructureRequirements("applied")).toContain('"notes"');
    expect(slideStructureRequirements("coding")).toContain('"notes"');
  });
});

// Y8-AC1/AC2/AC3/AC4: the tiered CORE/SPECIALIST toolset fix ("far more
// varied free professional tool usage") - a real 16-week course used a
// spreadsheet in 14 of 16 weeks because the committed-toolset rule gave the
// model no vocabulary for a legitimate, non-churning exception. These pin the
// substance of that fix directly on the two constants every tool-naming
// prompt in the app composes, without re-testing prompt assembly (already
// covered per call site in shared.test.ts, llm-content.test.ts,
// schedule-week-plan.test.ts).
describe("Y8: tiered CORE/SPECIALIST toolset rule", () => {
  it("COMMITTED_TOOLSET_RULE still opens with the exact sentence llm-content.test.ts pins verbatim", () => {
    // llm-content.ts's own test file (out of scope for this change) asserts
    // `toContain("Default to using ONLY these committed tool(s)")` directly
    // against the composed prompt rather than importing this constant - this
    // guards that the phrase survives future edits to this constant too.
    expect(COMMITTED_TOOLSET_RULE).toContain("Default to using ONLY these committed tool(s)");
  });

  it("states the CORE tier: holds persistent project data, never changes", () => {
    expect(COMMITTED_TOOLSET_RULE).toContain("CORE");
    expect(COMMITTED_TOOLSET_RULE.toLowerCase()).toContain("persistent project data");
    expect(COMMITTED_TOOLSET_RULE.toLowerCase()).toContain("must never change");
  });

  it("states the SPECIALIST tier and the produced-in/exported test explicitly", () => {
    expect(COMMITTED_TOOLSET_RULE).toContain("SPECIALIST");
    expect(COMMITTED_TOOLSET_RULE).toContain("PRODUCED IN");
    expect(COMMITTED_TOOLSET_RULE).toContain("EXPORTED");
    expect(COMMITTED_TOOLSET_RULE.toLowerCase()).toContain("file, screenshot, or link");
  });

  it("still requires a stated reason before introducing any new tool (anti-churn, entries 137/141/142)", () => {
    expect(COMMITTED_TOOLSET_RULE.toLowerCase()).toContain("explicitly state why");
    expect(COMMITTED_TOOLSET_RULE.toLowerCase()).toContain("churn");
  });

  it("still requires the specialist tool's free access to be stated, same as a committed tool", () => {
    expect(COMMITTED_TOOLSET_RULE.toLowerCase()).toContain("free tier");
    expect(COMMITTED_TOOLSET_RULE.toLowerCase()).toContain("free trial");
    expect(COMMITTED_TOOLSET_RULE.toLowerCase()).toContain("community edition");
    expect(COMMITTED_TOOLSET_RULE.toLowerCase()).toContain("spreadsheet equivalent");
  });

  it("APPLIED_REAL_TOOL_RULE's example list now includes a genuinely free scheduling tool", () => {
    // MS Project (already in the example list) has no free tier, which is
    // exactly why the model had no free scheduling tool to reach for.
    expect(APPLIED_REAL_TOOL_RULE).toContain("GanttProject");
  });

  it("APPLIED_REAL_TOOL_RULE keeps every substring llm-content.test.ts pins verbatim", () => {
    expect(APPLIED_REAL_TOOL_RULE).toContain("name a REAL, widely used tool");
    expect(APPLIED_REAL_TOOL_RULE).toContain("never invent a product");
    expect(APPLIED_REAL_TOOL_RULE.toLowerCase()).toContain("free tier");
    expect(APPLIED_REAL_TOOL_RULE.toLowerCase()).toContain("free trial");
    expect(APPLIED_REAL_TOOL_RULE.toLowerCase()).toContain("community edition");
    expect(APPLIED_REAL_TOOL_RULE.toLowerCase()).toContain("spreadsheet equivalent");
  });
});
