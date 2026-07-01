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
});

describe("scaffoldModuleIntroDoc", () => {
  it("uses the required section headings", () => {
    const md = scaffoldModuleIntroDoc("Recursion", "Learn recursion and the call stack.");
    expect(md).toContain("# Module Introduction: Recursion");
    expect(md).toContain("## Real-World Applications");
    expect(md).toContain("## What You Will Learn");
  });
});

describe("scaffoldAssignmentDoc", () => {
  it("includes overview, instructions, requirements, and deliverables", () => {
    const md = scaffoldAssignmentDoc("Build a CLI", "- Parse args\n- Read a file\n- Print output");
    expect(md).toContain("# Build a CLI");
    expect(md).toContain("## Assignment Overview");
    expect(md).toContain("## Instructions");
    expect(md).toContain("## Requirements");
    expect(md).toContain("## Deliverables");
    expect(md).toContain("- Parse args");
  });
});
