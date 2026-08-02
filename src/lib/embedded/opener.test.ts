import { describe, expect, it } from "vitest";

import { buildEmbeddedOpener, type EmbeddedOpenerInput } from "./opener";
import { findWriteCodeViolation } from "@/lib/opener-warmup";
import type { PracticeProblemEntry } from "@/lib/research/practice-problems";

const BASE: EmbeddedOpenerInput = {
  topic: "Numeric Boundaries",
  caseStudyMinutes: 20,
  warmupMinutes: 10,
  debriefMinutes: 5,
  warmupHeading: "Warm-up exercise",
  isCoding: true,
  concepts: ["Numeric representation", "Integer overflow"],
  assignment: "Week 2: Conversion Audit",
  caseStudyMaterial: null,
  practiceProblems: [],
};

const SAFE_PROBLEM: PracticeProblemEntry = {
  kind: "practice_problem",
  id: "safe-trace",
  title: "Trace the conversion table",
  topics: ["numeric representation"],
  language: "python",
  difficulty: "intro",
  prompt: "Predict the printed value.",
  exampleCode: "value = 32767\nprint(value + 1)",
  solutionCode: "print(32768)",
};

/** Same entry, but with a bank title authored for a "solve this" context. */
const WRITE_CODE_TITLE_PROBLEM: PracticeProblemEntry = {
  ...SAFE_PROBLEM,
  id: "unsafe-title",
  title: "Write a function that converts the supplied value",
};

/**
 * Extract just the warm-up section's body (from its "## <heading>" line up to
 * the next "## " heading, or end of the document) - mirrors
 * enforceReadOnlyWarmup's own boundary logic in src/lib/opener-warmup.ts.
 *
 * A whole-document findWriteCodeViolation check would be WRONG here: when the
 * instructor's own assignment or concept plan is genuinely titled with
 * write-code language (e.g. "Write a Function to Reverse a String"), the
 * opener correctly NAMES that title elsewhere in the document (the case study
 * discussion questions, the "Before the warm-up" section) - so the phrase
 * legitimately appears outside the warm-up. The contract this scaffold
 * actually guarantees is narrower: the WARM-UP SECTION itself must never ask
 * the student to write code. Do not "tighten" this back into a
 * whole-document check - it will fail on legitimate assignment/concept
 * titles that have nothing to do with the warm-up exercise.
 */
function extractWarmupSection(text: string, warmupHeading: string): string {
  const escapedHeading = warmupHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingRe = new RegExp(`^## ${escapedHeading}.*$`, "m");
  const headingMatch = text.match(headingRe);
  if (!headingMatch || headingMatch.index === undefined) {
    throw new Error(`extractWarmupSection: heading "${warmupHeading}" not found in text`);
  }
  const sectionStart = headingMatch.index + headingMatch[0].length;
  const rest = text.slice(sectionStart);
  const nextHeadingMatch = rest.match(/\n## /);
  const sectionEnd =
    nextHeadingMatch && nextHeadingMatch.index !== undefined ? sectionStart + nextHeadingMatch.index : text.length;
  return text.slice(sectionStart, sectionEnd);
}

describe("buildEmbeddedOpener", () => {
  it("emits the three sections, the assigned case, the concept preview, and the assignment connection", () => {
    const { title, text } = buildEmbeddedOpener({
      ...BASE,
      assignedCaseStudy: {
        organization: "Ariane 5 Flight 501",
        period: "1996",
        hook: "A numeric conversion overflow caused the inertial reference software to fail.",
      },
    });

    expect(title).toBe("Class Opener: Numeric Boundaries");
    expect(text).toContain("## Case study discussion (about 20 minutes)");
    expect(text).toContain("## Warm-up exercise (about 10 minutes)");
    expect(text).toContain("## Debrief (about 5 minutes)");
    expect(text).toContain("Case Study: Ariane 5 Flight 501");
    expect(text).toContain("- Period: 1996.");
    expect(text).toContain("Concepts to preview: Numeric representation, Integer overflow.");
    expect(text).toContain("Assignment connection: Before implementation");
    expect(text).toContain("Week 2: Conversion Audit");
  });

  it("omits the period line when the assigned case has no confident period", () => {
    const { text } = buildEmbeddedOpener({
      ...BASE,
      assignedCaseStudy: {
        organization: "Ariane 5 Flight 501",
        period: "",
        hook: "A numeric conversion overflow caused the software to fail.",
      },
    });

    expect(text).toContain("Case Study: Ariane 5 Flight 501");
    expect(text).not.toContain("Period:");
  });

  it("prefers the assigned case over supplied case-study material, so the deck cannot diverge", () => {
    const { text } = buildEmbeddedOpener({
      ...BASE,
      assignedCaseStudy: {
        organization: "Ariane 5 Flight 501",
        period: "1996",
        hook: "A numeric conversion overflow caused the software to fail.",
      },
      caseStudyMaterial: { title: "Some Other Incident", bullets: ["Unrelated detail."] },
    });

    expect(text).toContain("Ariane 5 Flight 501");
    expect(text).not.toContain("Some Other Incident");
  });

  it("falls back to supplied material, then to a topic-only case, when no case is assigned", () => {
    const fromMaterial = buildEmbeddedOpener({
      ...BASE,
      caseStudyMaterial: { title: "Mars Climate Orbiter", bullets: ["Unit mismatch.", "Loss of vehicle."] },
    });
    expect(fromMaterial.text).toContain("Mars Climate Orbiter");
    expect(fromMaterial.text).toContain("- Unit mismatch.");

    const fromTopic = buildEmbeddedOpener(BASE);
    expect(fromTopic.text).toContain("Case Study: Numeric Boundaries");
    expect(fromTopic.text).toContain("real-world application of Numeric Boundaries");
  });

  it("uses a clean bank entry as READING material and debriefs that same trace", () => {
    const { text } = buildEmbeddedOpener({ ...BASE, practiceProblems: [SAFE_PROBLEM] });

    expect(text).toContain("Trace the conversion table");
    expect(text).toContain("value = 32767");
    expect(text).toContain("do not write or run any code yourself");
    expect(text).toContain("Discuss the trace as a class");
    expect(text).not.toContain("Map the analogy");
    expect(findWriteCodeViolation(text)).toBeNull();
  });

  it("rejects a bank entry whose title asks for code, keeping the concept and assignment context intact", () => {
    const { text } = buildEmbeddedOpener({ ...BASE, practiceProblems: [WRITE_CODE_TITLE_PROBLEM] });

    // The offending entry is dropped whole rather than repaired by the
    // section-wide guard, which would also have deleted the two context
    // lines below it.
    expect(text).not.toContain(WRITE_CODE_TITLE_PROBLEM.title);
    expect(text).not.toContain("value = 32767");
    expect(text).toContain("Map the analogy");
    expect(text).toContain("Concepts to preview: Numeric representation, Integer overflow.");
    expect(text).toContain("Assignment connection: Before implementation");
    expect(findWriteCodeViolation(text)).toBeNull();
  });

  it("keeps the warm-up and debrief in agreement when the bank entry is rejected", () => {
    const { text } = buildEmbeddedOpener({ ...BASE, practiceProblems: [WRITE_CODE_TITLE_PROBLEM] });

    // The debrief must not discuss a trace the warm-up never showed.
    expect(text).not.toContain("Discuss the trace as a class");
    expect(text).toContain("Key concepts: Focus on how Numeric representation, Integer overflow");
  });

  // exampleCode is a required string on PracticeProblemEntry, so "no usable
  // snippet" means a BLANK one, not a missing field.
  it("ignores a bank entry whose example code is blank", () => {
    const { text } = buildEmbeddedOpener({
      ...BASE,
      practiceProblems: [{ ...SAFE_PROBLEM, exampleCode: "" }],
    });

    expect(text).not.toContain("Trace the conversion table");
    expect(text).toContain("Map the analogy");
  });

  it("names the remaining concepts in the fallback warm-up without asking for code", () => {
    const { text } = buildEmbeddedOpener(BASE);

    expect(text).toContain("Map the analogy: think of Numeric representation");
    expect(text).toContain("how Integer overflow changes the reasoning");
    expect(findWriteCodeViolation(text)).toBeNull();
  });

  it("drops both context lines when the caller has neither a concept plan nor an assignment", () => {
    const { text } = buildEmbeddedOpener({ ...BASE, concepts: [], assignment: "" });

    expect(text).not.toContain("Concepts to preview:");
    expect(text).not.toContain("Assignment connection:");
    // Falls back to the topic wherever a concept would have been named.
    expect(text).toContain("What key principles of Numeric Boundaries were at play");
    expect(text).toContain("Map the analogy: think of Numeric Boundaries");
  });

  it("gives an applied course a written-artifact exercise and never any code", () => {
    const { text } = buildEmbeddedOpener({
      ...BASE,
      isCoding: false,
      practiceProblems: [SAFE_PROBLEM],
    });

    expect(text).toContain("Produce a short written artifact");
    expect(text).not.toContain("Map the analogy");
    // AC3 guard: a coding bank entry that reached an applied opener is ignored.
    expect(text).not.toContain("Trace the conversion table");
    expect(text).not.toContain("value = 32767");
    expect(text).not.toContain("```");
  });

  it("is deterministic: the same input always produces byte-identical output", () => {
    const input = { ...BASE, practiceProblems: [SAFE_PROBLEM] };
    expect(buildEmbeddedOpener(input)).toEqual(buildEmbeddedOpener(input));
  });

  // F1 regression: "Concepts to preview"/"Assignment connection" now live in
  // their own "## Before the warm-up" section, placed BEFORE the warm-up
  // heading, so enforceReadOnlyWarmup's whole-section-body replacement
  // (heading to next heading) structurally cannot reach them - even when the
  // assignment title or a concept name itself contains write-code language.
  // Every existing test above uses a safe assignment ("Week 2: Conversion
  // Audit") and safe concept names, so none of them would have caught the
  // original bug (both context lines used to live INSIDE the warm-up
  // section, where a tainted value could trigger the guard and delete them
  // as collateral damage).
  describe("F1: the 'Before the warm-up' section survives a tainted assignment or concept name", () => {
    it("a tainted ASSIGNMENT title still leaves both context lines intact and the warm-up section clean", () => {
      const { text } = buildEmbeddedOpener({
        ...BASE,
        assignment: "Write a Function to Reverse a String",
      });

      expect(text).toContain("Concepts to preview: Numeric representation, Integer overflow.");
      expect(text).toContain(
        "Assignment connection: Before implementation, map each concept above to one requirement in Write a Function to Reverse a String."
      );
      // No practice problems in BASE, so the warm-up is the plain fallback -
      // the assignment text plays no part in choosing it either way.
      expect(text).toContain("Map the analogy");

      // The real contract: NOT a whole-document check (see
      // extractWarmupSection's own comment for why that would be wrong here
      // - the assignment title legitimately appears in "Assignment
      // connection:" above) - only the warm-up SECTION itself must be clean.
      const warmup = extractWarmupSection(text, BASE.warmupHeading);
      expect(findWriteCodeViolation(warmup)).toBeNull();
    });

    it("a tainted CONCEPT name still leaves both context lines intact and the warm-up section clean", () => {
      const { text } = buildEmbeddedOpener({
        ...BASE,
        concepts: ["Write a function that validates input", "Integer overflow"],
      });

      expect(text).toContain("Concepts to preview: Write a function that validates input, Integer overflow.");
      expect(text).toContain("Assignment connection: Before implementation");
      expect(text).toContain("Week 2: Conversion Audit");

      const warmup = extractWarmupSection(text, BASE.warmupHeading);
      expect(findWriteCodeViolation(warmup)).toBeNull();
      // The tainted concept name also reaches buildFallbackWarmup itself
      // (concepts[0] names the analogy's subject), which would otherwise
      // plant the same write-code language INSIDE the warm-up section -
      // enforceReadOnlyWarmup's backstop catches that and rebuilds the
      // section from the TOPIC instead, so the repaired warm-up names
      // "Numeric Boundaries" (the topic), never the tainted concept.
      expect(warmup).toContain("Map the analogy: think of Numeric Boundaries");
      expect(warmup).not.toContain("Write a function");
    });

    it("a tainted assignment alongside a clean practice-bank entry still uses the real trace warm-up, proving the guard never fires", () => {
      const { text } = buildEmbeddedOpener({
        ...BASE,
        assignment: "Write a Function to Reverse a String",
        practiceProblems: [SAFE_PROBLEM],
      });

      // The trace warm-up (unrelated to the assignment) survives untouched -
      // if the guard had fired, this would have been replaced by the plain
      // "Map the analogy" fallback instead.
      expect(text).toContain("Trace the conversion table");
      expect(text).toContain("value = 32767");
      expect(text).toContain("Discuss the trace as a class");
      expect(text).toContain("Concepts to preview: Numeric representation, Integer overflow.");
      expect(text).toContain(
        "Assignment connection: Before implementation, map each concept above to one requirement in Write a Function to Reverse a String."
      );

      const warmup = extractWarmupSection(text, BASE.warmupHeading);
      expect(findWriteCodeViolation(warmup)).toBeNull();
    });

    it("drops the 'Before the warm-up' heading entirely when there is nothing to hand off", () => {
      const { text } = buildEmbeddedOpener({ ...BASE, concepts: [], assignment: "" });

      // Covered from the content side already ("drops both context lines..."
      // above); this asserts no dangling empty heading is emitted either.
      expect(text).not.toContain("## Before the warm-up");
    });
  });
});
