import { describe, it, expect } from "vitest";
import { scaffoldDocument, scaffoldModuleIntroDoc, scaffoldAssignmentDoc } from "./docs";

describe("scaffoldDocument", () => {
  it("produces a titled markdown document with sections", () => {
    const md = scaffoldDocument("A study guide for pointers and memory management in C.");
    expect(md.startsWith("# ")).toBe(true);
    expect(md).toContain("## Overview");
    expect(md).toContain("## Details");
    expect(md).toContain("## Summary");
  });

  it("has exactly one level-1 heading", () => {
    const md = scaffoldDocument("- point one\n- point two\n- point three");
    const h1 = md.split("\n").filter((l) => /^# /.test(l));
    expect(h1.length).toBe(1);
  });

  it("renders structured input as prose in the Details section", () => {
    const md = scaffoldDocument("Course: Databases\nRoom: 204\nInstructor: Dr. Shaw");
    expect(md).toContain("The course is Databases.");
    expect(md).toContain("The room is 204.");
    // The structured lines are narrated, not echoed as raw "Label: value" bullets.
    expect(md).not.toContain("- Course: Databases");
  });

  it("narrates a pasted CSV table row by row", () => {
    const md = scaffoldDocument("name,score\nAda,95\nBo,82");
    expect(md).toContain("The table has 2 rows with columns name and score.");
    expect(md).toContain("For Ada, score is 95.");
  });
});

describe("scaffoldModuleIntroDoc", () => {
  it("uses the required section headings", () => {
    const md = scaffoldModuleIntroDoc("Recursion", "Learn recursion and the call stack.");
    expect(md).toContain("# Module Introduction: Recursion");
    expect(md).toContain("## Real-World Applications");
    expect(md).toContain("## What You Will Learn");
  });

  it("fills Real-World Applications with factual bullets for a detected technology", () => {
    const md = scaffoldModuleIntroDoc("Python Basics", "Learn python loops and functions.");
    expect(md).toContain("data science");
    expect(md).not.toContain("Add two or three concrete examples");
  });
});

describe("scaffoldAssignmentDoc", () => {
  it("includes overview, instructions, requirements, resources, and deliverables", () => {
    const md = scaffoldAssignmentDoc("Build a CLI", "- Parse args\n- Read a file\n- Print output");
    expect(md).toContain("# Build a CLI");
    expect(md).toContain("## Assignment Overview");
    expect(md).toContain("## Instructions");
    expect(md).toContain("## Requirements");
    expect(md).toContain("## Helpful Free Resources");
    expect(md).toContain("## Deliverables");
    expect(md).toContain("- Parse args");
  });

  it("lists at least five real resources, technology-matched first", () => {
    const md = scaffoldAssignmentDoc("Data Cleaning", "Use python and pandas to clean a dataset.");
    const resourceLines = md
      .split("## Helpful Free Resources")[1]
      .split("## Deliverables")[0]
      .split("\n")
      .filter((line) => line.startsWith("- "));
    expect(resourceLines.length).toBeGreaterThanOrEqual(5);
    expect(md).toContain("https://docs.python.org/3/tutorial/");
  });
});
