import { describe, it, expect } from "vitest";
import {
  buildTestObjectives,
  buildTestContext,
  renderTestDocument,
  renderTestAnswerKey,
  renderTestStudyGuide,
  type TestBriefContext,
  type TestBriefData,
} from "./test-brief";
import { emptyTestSpec, TECHNICAL_APTITUDES, TEST_FORMATS, type TestSpec } from "@/lib/artifact-templates/types";

function baseSpec(overrides: Partial<TestSpec> = {}): TestSpec {
  return {
    ...emptyTestSpec(),
    goal: "Assess mastery of loops.",
    coverage: "Weeks 1-4.",
    aptitude: "intro",
    format: "in-class",
    minutes: 60,
    sections: [{ kind: "multiple_choice", count: 2, pointsEach: 5 }],
    allowedResources: [],
    includeAnswerKey: true,
    includeStudyGuide: false,
    ...overrides,
  };
}

function baseCtx(overrides: Partial<TestBriefContext> = {}): TestBriefContext {
  return {
    courseName: "Intro to Programming",
    topic: "Loops",
    weekLabel: "Week 3",
    ...overrides,
  };
}

function baseData(overrides: Partial<TestBriefData> = {}): TestBriefData {
  return {
    title: "Loops Quiz",
    instructions: "Answer every question.",
    questions: [
      { kind: "multiple_choice", prompt: "Which loop runs at least once?", choices: ["for", "while", "do-while", "foreach"], answer: "do-while", points: 5 },
      { kind: "multiple_choice", prompt: "Which keyword exits a loop early?", choices: ["break", "continue", "return", "pass"], answer: "break", points: 5 },
    ],
    ...overrides,
  };
}

describe("buildTestObjectives", () => {
  it("includes the topic and the spec's goal", () => {
    const objectives = buildTestObjectives(baseSpec(), baseCtx());
    expect(objectives).toContain("Loops");
    expect(objectives).toContain("Assess mastery of loops.");
  });

  it("omits the topic line when the topic is blank", () => {
    const objectives = buildTestObjectives(baseSpec(), baseCtx({ topic: "" }));
    expect(objectives).not.toContain("Topic:");
    expect(objectives).toContain("Assess mastery of loops.");
  });

  it("is empty when both the topic and the goal are blank", () => {
    const objectives = buildTestObjectives(baseSpec({ goal: "" }), baseCtx({ topic: "" }));
    expect(objectives).toBe("");
  });
});

describe("buildTestContext", () => {
  it("includes the aptitude promptContract verbatim", () => {
    for (const aptitude of TECHNICAL_APTITUDES) {
      const context = buildTestContext(baseSpec({ aptitude: aptitude.value }), baseCtx());
      expect(context).toContain(aptitude.promptContract);
    }
  });

  it("includes the format promptContract verbatim", () => {
    for (const format of TEST_FORMATS) {
      const context = buildTestContext(baseSpec({ format: format.value }), baseCtx());
      expect(context).toContain(format.promptContract);
    }
  });

  it("states the coverage", () => {
    const context = buildTestContext(baseSpec({ coverage: "Chapters 1-3" }), baseCtx());
    expect(context).toContain("Chapters 1-3");
  });

  it("states the time budget", () => {
    const context = buildTestContext(baseSpec({ minutes: 45 }), baseCtx());
    expect(context).toContain("45");
  });

  it("states the allowed resources when present", () => {
    const context = buildTestContext(baseSpec({ allowedResources: ["Open book", "Open notes"] }), baseCtx());
    expect(context).toContain("Open book");
    expect(context).toContain("Open notes");
  });

  it("omits the allowed-resources line when empty", () => {
    const context = buildTestContext(baseSpec({ allowedResources: [] }), baseCtx());
    expect(context).not.toContain("Allowed resources");
  });

  it("states the week label when present", () => {
    const context = buildTestContext(baseSpec(), baseCtx({ weekLabel: "Week 3" }));
    expect(context).toContain("Week 3");
  });
});

describe("renderTestDocument", () => {
  it("starts with a title line that includes the week label", () => {
    const doc = renderTestDocument(baseData(), baseSpec(), baseCtx({ weekLabel: "Week 3" }));
    expect(doc.split("\n")[0]).toBe("# Week 3: Loops Quiz");
  });

  it("starts with a plain title line when there is no week label", () => {
    const doc = renderTestDocument(baseData(), baseSpec(), baseCtx({ weekLabel: "" }));
    expect(doc.split("\n")[0]).toBe("# Loops Quiz");
  });

  it("always includes the Instructions section with the time budget and total points", () => {
    const doc = renderTestDocument(baseData(), baseSpec({ minutes: 60 }), baseCtx());
    expect(doc).toContain("## Instructions");
    expect(doc).toContain("Time allowed: about 60 minute(s).");
    expect(doc).toContain("Total points: 10.");
  });

  it("states allowed resources in Instructions when present", () => {
    const doc = renderTestDocument(baseData(), baseSpec({ allowedResources: ["Open book"] }), baseCtx());
    expect(doc).toContain("Allowed resources: Open book.");
  });

  it("omits the allowed-resources line in Instructions when empty", () => {
    const doc = renderTestDocument(baseData(), baseSpec({ allowedResources: [] }), baseCtx());
    const instructionsSection = doc.slice(doc.indexOf("## Instructions"));
    expect(instructionsSection).not.toContain("Allowed resources");
  });

  it("renders one heading per spec section, in spec order", () => {
    const spec = baseSpec({
      sections: [
        { kind: "multiple_choice", count: 2, pointsEach: 5 },
        { kind: "essay", count: 1, pointsEach: 20 },
      ],
    });
    const data = baseData({
      questions: [
        ...baseData().questions,
        { kind: "essay", prompt: "Explain how a for-loop works.", choices: [], answer: "A for-loop repeats a block a set number of times.", points: 20 },
      ],
    });
    const doc = renderTestDocument(data, spec, baseCtx());
    const mcIndex = doc.indexOf("## Multiple choice");
    const essayIndex = doc.indexOf("## Essay");
    expect(mcIndex).toBeGreaterThan(-1);
    expect(essayIndex).toBeGreaterThan(mcIndex);
  });

  it("numbers questions continuously across sections", () => {
    const spec = baseSpec({
      sections: [
        { kind: "multiple_choice", count: 2, pointsEach: 5 },
        { kind: "essay", count: 1, pointsEach: 20 },
      ],
    });
    const data = baseData({
      questions: [
        ...baseData().questions,
        { kind: "essay", prompt: "Explain how a for-loop works.", choices: [], answer: "...", points: 20 },
      ],
    });
    const doc = renderTestDocument(data, spec, baseCtx());
    expect(doc).toContain("1. (5 point(s)) Which loop runs at least once?");
    expect(doc).toContain("2. (5 point(s)) Which keyword exits a loop early?");
    expect(doc).toContain("3. (20 point(s)) Explain how a for-loop works.");
  });

  it("renders multiple-choice choices as a) b) c) ...", () => {
    const doc = renderTestDocument(baseData(), baseSpec(), baseCtx());
    expect(doc).toContain("a) for");
    expect(doc).toContain("b) while");
    expect(doc).toContain("c) do-while");
    expect(doc).toContain("d) foreach");
  });

  it("renders a blank response-area marker for essay questions", () => {
    const spec = baseSpec({ sections: [{ kind: "essay", count: 1, pointsEach: 20 }] });
    const data: TestBriefData = {
      title: "Essay Test",
      instructions: "",
      questions: [{ kind: "essay", prompt: "Explain recursion.", choices: [], answer: "...", points: 20 }],
    };
    const doc = renderTestDocument(data, spec, baseCtx());
    expect(doc).toContain("[Write your response below.]");
  });

  it("omits a section heading entirely when its section has zero questions", () => {
    const spec = baseSpec({
      sections: [
        { kind: "multiple_choice", count: 0, pointsEach: 5 },
        { kind: "essay", count: 1, pointsEach: 20 },
      ],
    });
    const data: TestBriefData = {
      title: "Essay Only",
      instructions: "",
      questions: [{ kind: "essay", prompt: "Explain recursion.", choices: [], answer: "...", points: 20 }],
    };
    const doc = renderTestDocument(data, spec, baseCtx());
    expect(doc).not.toContain("## Multiple choice");
    expect(doc).toContain("## Essay");
  });

  it("emits no section headings for an empty section list", () => {
    const data: TestBriefData = { title: "Empty Test", instructions: "", questions: [] };
    const doc = renderTestDocument(data, baseSpec({ sections: [] }), baseCtx());
    // The Instructions block is unconditional, so this asserts the absence of
    // the per-kind SECTION headings specifically rather than of all headings.
    expect(doc).not.toContain("## Multiple choice");
    expect(doc).not.toContain("## True / false");
    expect(doc).not.toContain("## Short answer");
    expect(doc).not.toContain("## Essay");
    expect(doc).toContain("## Instructions");
  });
});

describe("renderTestAnswerKey", () => {
  it("returns '' when there are no questions", () => {
    expect(renderTestAnswerKey({ title: "Empty", instructions: "", questions: [] })).toBe("");
  });

  it("includes the Answer Key heading and every answer, numbered", () => {
    const key = renderTestAnswerKey(baseData());
    expect(key).toContain("## Answer Key");
    expect(key).toContain("1. do-while");
    expect(key).toContain("2. break");
  });

  it("leads with a page-break marker before the heading", () => {
    const key = renderTestAnswerKey(baseData());
    const headingIndex = key.indexOf("## Answer Key");
    expect(headingIndex).toBeGreaterThan(0);
    expect(key.slice(0, headingIndex)).toContain("\f");
  });
});

describe("renderTestStudyGuide", () => {
  it("includes the Study Guide heading", () => {
    const guide = renderTestStudyGuide(baseSpec(), baseCtx());
    expect(guide).toContain("## Study Guide");
  });

  it("references the coverage text", () => {
    const guide = renderTestStudyGuide(baseSpec({ coverage: "Chapters 1-3" }), baseCtx());
    expect(guide).toContain("Chapters 1-3");
  });

  it("describes what to practice for each section", () => {
    const spec = baseSpec({
      sections: [
        { kind: "multiple_choice", count: 5, pointsEach: 2 },
        { kind: "essay", count: 1, pointsEach: 20 },
      ],
    });
    const guide = renderTestStudyGuide(spec, baseCtx());
    expect(guide).toContain("5 Multiple choice question(s) (2 point(s) each)");
    expect(guide).toContain("1 Essay question(s) (20 point(s) each)");
  });

  it("omits the practice list when there are no sections", () => {
    const guide = renderTestStudyGuide(baseSpec({ sections: [] }), baseCtx());
    expect(guide).not.toContain("Practice the following");
  });

  it("is deterministic and pure - the same inputs always produce the same text", () => {
    const spec = baseSpec();
    const ctx = baseCtx();
    expect(renderTestStudyGuide(spec, ctx)).toBe(renderTestStudyGuide(spec, ctx));
  });

  it("never echoes any generated question text (no LLM call, spec-derived only)", () => {
    const guide = renderTestStudyGuide(baseSpec(), baseCtx());
    expect(guide).not.toContain("Which loop runs at least once?");
    expect(guide).not.toContain("do-while");
  });
});
