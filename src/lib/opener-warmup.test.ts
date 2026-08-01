import { describe, it, expect } from "vitest";
import {
  CODING_WARMUP_FORMS,
  describeCodingWarmupMenu,
  findWriteCodeViolation,
  buildFallbackWarmup,
  enforceReadOnlyWarmup,
} from "./opener-warmup";

describe("CODING_WARMUP_FORMS / describeCodingWarmupMenu", () => {
  it("names exactly the six forms Z2-AC2 specifies", () => {
    expect(CODING_WARMUP_FORMS.map((f) => f.name)).toEqual([
      "Trace and predict",
      "Order the steps",
      "Spot the flaw by reading",
      "Compare two approaches",
      "Complete a trace table",
      "Map the analogy",
    ]);
  });

  it("every form has a non-empty description", () => {
    for (const form of CODING_WARMUP_FORMS) {
      expect(form.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("describeCodingWarmupMenu renders every form name and description as a bullet", () => {
    const menu = describeCodingWarmupMenu();
    for (const form of CODING_WARMUP_FORMS) {
      expect(menu).toContain(form.name);
      expect(menu).toContain(form.description);
    }
  });
});

describe("findWriteCodeViolation", () => {
  it("flags 'write a function'", () => {
    expect(findWriteCodeViolation("Write a function that reverses a string.")).not.toBeNull();
  });

  it("flags 'implement a program'", () => {
    expect(findWriteCodeViolation("Implement a program that sorts the list.")).not.toBeNull();
  });

  it("flags 'complete the function'", () => {
    expect(findWriteCodeViolation("Complete the function below so it returns the sum.")).not.toBeNull();
  });

  it("flags 'fill in the blank' in a code context", () => {
    expect(findWriteCodeViolation("Fill in the blank in the code to make it compile.")).not.toBeNull();
  });

  it("flags 'fix the bug in' (debug-by-editing)", () => {
    expect(findWriteCodeViolation("Fix the bug in the code below.")).not.toBeNull();
  });

  it("flags 'your own code'", () => {
    expect(findWriteCodeViolation("Test it with your own code.")).not.toBeNull();
  });

  it("does NOT flag reading-only language", () => {
    const readingOnlyText =
      "Trace through the code below and predict what it prints. Identify what goes wrong and when, without writing a fix.";
    expect(findWriteCodeViolation(readingOnlyText)).toBeNull();
  });

  it("does NOT flag 'spot the flaw by reading' style instructions", () => {
    expect(
      findWriteCodeViolation("Read the snippet and say what goes wrong and when - do not propose a fix in code.")
    ).toBeNull();
  });

  it("does NOT flag plain prose with no code-authoring verbs", () => {
    expect(findWriteCodeViolation("Order these steps of the algorithm from first to last, and explain why.")).toBeNull();
  });
});

describe("buildFallbackWarmup", () => {
  it("names the topic and never contains a code-authoring instruction", () => {
    const text = buildFallbackWarmup("recursion");
    expect(text).toContain("recursion");
    expect(findWriteCodeViolation(text)).toBeNull();
  });

  it("falls back to a generic subject when the topic is blank", () => {
    const text = buildFallbackWarmup("   ");
    expect(text.trim().length).toBeGreaterThan(0);
    expect(findWriteCodeViolation(text)).toBeNull();
  });
});

describe("enforceReadOnlyWarmup", () => {
  const HEADING = "Warm-up exercise";

  function docWithWarmup(body: string): string {
    return `# Class Opener: Loops\n\n## Case study discussion (about 15 minutes)\n\nSome case study text.\n\n## ${HEADING} (about 10 minutes)\n\n${body}\n\n## Debrief (about 5 minutes)\n\nSome debrief text.`;
  }

  it("leaves a clean, reading-only warm-up untouched (violations 0)", () => {
    const doc = docWithWarmup("Trace through the code below and predict what it prints.");
    const result = enforceReadOnlyWarmup(doc, HEADING, "loops");
    expect(result.violations).toBe(0);
    expect(result.text).toBe(doc);
  });

  it("replaces a violating warm-up section with the safe fallback, counting one violation", () => {
    const doc = docWithWarmup("Write a function that counts to ten using a loop.");
    const result = enforceReadOnlyWarmup(doc, HEADING, "loops");
    expect(result.violations).toBe(1);
    expect(result.text).not.toContain("Write a function that counts to ten");
    expect(result.text).toContain("Map the analogy");
    expect(findWriteCodeViolation(result.text)).toBeNull();
  });

  it("preserves the case-study and debrief sections untouched when repairing the warm-up", () => {
    const doc = docWithWarmup("Implement a program that reverses a string.");
    const result = enforceReadOnlyWarmup(doc, HEADING, "strings");
    expect(result.text).toContain("Some case study text.");
    expect(result.text).toContain("Some debrief text.");
    expect(result.text).toContain(`## ${HEADING} (about 10 minutes)`);
  });

  it("repairs a violation in the LAST section of the document (no trailing heading to bound it)", () => {
    const doc = `# Class Opener: Loops\n\n## ${HEADING} (about 10 minutes)\n\nWrite a program that prints Fibonacci numbers.`;
    const result = enforceReadOnlyWarmup(doc, HEADING, "loops");
    expect(result.violations).toBe(1);
    expect(result.text).not.toContain("Write a program that prints Fibonacci");
  });

  it("never misfires when the heading text cannot be found at all", () => {
    const doc = "# Class Opener\n\nNo matching heading here, but it does say write a function somewhere.";
    const result = enforceReadOnlyWarmup(doc, "Warm-up exercise", "loops");
    expect(result.violations).toBe(0);
    expect(result.text).toBe(doc);
  });

  it("does not mutate the input string reference (returns a new string on repair)", () => {
    const doc = docWithWarmup("Write a function that sorts a list.");
    const result = enforceReadOnlyWarmup(doc, HEADING, "sorting");
    expect(result.text).not.toBe(doc);
    // The original string is immutable in JS anyway, but assert doc itself
    // still reads as originally constructed (no accidental shared state).
    expect(doc).toContain("Write a function that sorts a list.");
  });
});
