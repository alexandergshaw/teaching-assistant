import { describe, expect, it } from "vitest";

import {
  anonymizeGradeResults,
  buildClassTrendsInsightPrompt,
  hasSubmissionsToAnalyze,
  parseClassTrendsInsightResponse,
} from "./class-trends-insight";
import type { GradeResult, GradingRunEntry } from "./types";

// Real-looking names, on purpose - this fixture exists to prove the
// anonymiser never lets one of these strings reach the composed prompt.
const REAL_LOOKING_NAMES = ["Priya Natarajan", "Marcus Whitfield", "Yuki Tanaka"];

function makeResult(overrides: Partial<GradeResult> & { student: string }): GradeResult {
  return {
    overallComment: "",
    strengths: "",
    improvements: "",
    resubmitNotice: "",
    rubricAreas: [{ area: "Analysis", score: "60%", comment: "conflated correlation with causation" }],
    totalScore: "60%",
    feedback: "",
    mergedFileCount: 0,
    submittedFiles: [],
    ...overrides,
  };
}

describe("class-trends-insight: anonymizeGradeResults strips names", () => {
  it("carries no field capable of holding the student's name, for real-looking names", () => {
    const results: GradeResult[] = REAL_LOOKING_NAMES.map((student) =>
      makeResult({ student, overallComment: `Great work, ${student.split(" ")[0]}.` })
    );

    const anonymized = anonymizeGradeResults(results);

    expect(anonymized).toHaveLength(3);
    expect(anonymized[0].slot).toBe(1);
    expect(anonymized[1].slot).toBe(2);
    expect(anonymized[2].slot).toBe(3);

    // The overall comment still carries whatever text the grader wrote -
    // including, in this fixture, a first name folded into that prose. The
    // anonymiser cannot scrub arbitrary prose; what it guarantees is that the
    // STRUCTURED student field never reaches the output, which the prompt
    // test below (composed from this same anonymized shape via slot labels
    // only, never via a name field) is what actually matters for requirement
    // 1. This test pins the structural guarantee: no key on the anonymized
    // shape is named "student", and JSON-serialising it does not carry the
    // key at all.
    const serialized = JSON.stringify(anonymized);
    expect(serialized).not.toContain("student");
    for (const submission of anonymized) {
      expect(Object.keys(submission)).not.toContain("student");
    }
  });

  it("never lets a real-looking name reach the composed prompt text", () => {
    const results: GradeResult[] = REAL_LOOKING_NAMES.map((student) => makeResult({ student }));
    const anonymized = anonymizeGradeResults(results);
    const prompt = buildClassTrendsInsightPrompt({ assignmentName: "Essay 1", submissions: anonymized });

    for (const name of REAL_LOOKING_NAMES) {
      expect(prompt).not.toContain(name);
      expect(prompt).not.toContain(name.split(" ")[0]);
      expect(prompt).not.toContain(name.split(" ")[1]);
    }
    expect(prompt).toContain("Submission 1");
    expect(prompt).toContain("Submission 2");
    expect(prompt).toContain("Submission 3");
  });
});

describe("class-trends-insight: the prompt carries no forbidden completeness phrase", () => {
  it("the instructions and a composed prompt never say 'the class', 'all students', 'every student', or 'the cohort'", () => {
    const anonymized = anonymizeGradeResults([
      makeResult({ student: "Priya Natarajan" }),
      makeResult({ student: "Marcus Whitfield" }),
    ]);
    const prompt = buildClassTrendsInsightPrompt({ assignmentName: "Essay 1", submissions: anonymized });
    const lower = prompt.toLowerCase();
    for (const phrase of ["the class", "all students", "every student", "the cohort"]) {
      expect(lower).not.toContain(phrase);
    }
    expect(lower).toContain("submissions graded so far");
  });
});

describe("class-trends-insight: parseClassTrendsInsightResponse", () => {
  it("accepts a well-formed response", () => {
    const raw = JSON.stringify({
      observations: [
        { concept: "correlation vs causation", reading: "A pattern in the submissions graded so far conflated the two." },
      ],
    });
    const result = parseClassTrendsInsightResponse(raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.observations).toEqual([
        {
          kind: "inferred",
          concept: "correlation vs causation",
          reading: "A pattern in the submissions graded so far conflated the two.",
        },
      ]);
    }
  });

  it("rejects and drops an observation containing a forbidden completeness phrase", () => {
    const raw = JSON.stringify({
      observations: [{ concept: "correlation vs causation", reading: "All students conflated the two ideas." }],
    });
    const result = parseClassTrendsInsightResponse(raw);
    expect(result.status).toBe("rejected");
  });

  it("keeps the compliant observations and drops only the offending one when both are present", () => {
    const raw = JSON.stringify({
      observations: [
        { concept: "correlation vs causation", reading: "A pattern in the submissions graded so far conflated the two." },
        { concept: "scope creep", reading: "The cohort struggled with scope." },
      ],
    });
    const result = parseClassTrendsInsightResponse(raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.observations).toHaveLength(1);
      expect(result.observations[0].concept).toBe("correlation vs causation");
    }
  });

  it("handles malformed JSON without throwing", () => {
    expect(() => parseClassTrendsInsightResponse("{not valid json")).not.toThrow();
    const result = parseClassTrendsInsightResponse("{not valid json");
    expect(result.status).toBe("rejected");
  });

  it("handles a response missing the observations array without throwing", () => {
    expect(() => parseClassTrendsInsightResponse(JSON.stringify({ foo: "bar" }))).not.toThrow();
    const result = parseClassTrendsInsightResponse(JSON.stringify({ foo: "bar" }));
    expect(result.status).toBe("rejected");
  });

  it("reports an empty observations array as empty, not rejected", () => {
    const result = parseClassTrendsInsightResponse(JSON.stringify({ observations: [] }));
    expect(result.status).toBe("empty");
  });

  it("every parsed observation is tagged inferred, never plain", () => {
    const raw = JSON.stringify({
      observations: [{ concept: "x", reading: "y" }],
    });
    const result = parseClassTrendsInsightResponse(raw);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      for (const observation of result.observations) {
        expect(observation.kind).toBe("inferred");
      }
    }
  });
});

describe("class-trends-insight: hasSubmissionsToAnalyze - an empty run produces no call", () => {
  it("is false for an empty results array", () => {
    const entry: Pick<GradingRunEntry, "run"> = { run: { results: [], rubricAreaNames: [], fullCreditChecklist: [] } };
    expect(hasSubmissionsToAnalyze(entry)).toBe(false);
  });

  it("is true when at least one result is present", () => {
    const entry: Pick<GradingRunEntry, "run"> = {
      run: {
        results: [makeResult({ student: "Priya Natarajan" })],
        rubricAreaNames: [],
        fullCreditChecklist: [],
      },
    };
    expect(hasSubmissionsToAnalyze(entry)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SABOTAGE CONTROL (run manually, not part of the suite): temporarily change
// anonymizeGradeResults to pass `student` through on AnonymizedSubmission and
// confirm the "never lets a real-looking name reach the composed prompt text"
// test above goes RED, then restore it. Recorded here so the control travels
// with the test it is meant to prove is not vacuous - see the report handed
// back with this change for the actual run and its result.
// ---------------------------------------------------------------------------
