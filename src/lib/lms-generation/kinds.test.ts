import { describe, it, expect } from "vitest";
import { OUTPUT_FAMILIES } from "@/lib/output-selection";
import {
  GENERATION_KIND_IDS,
  GENERATION_KIND_CONFIGS,
  qaKindConfig,
  currentEventsKindConfig,
  type QaGeneratedContent,
  type CurrentEventsGeneratedContent,
} from "./kinds";

describe("GENERATION_KIND_IDS", () => {
  it("is exactly the two chunk-1 kinds, in a stable order", () => {
    expect(GENERATION_KIND_IDS).toEqual(["qa", "currentEvents"]);
  });

  it("reuses OUTPUT_FAMILIES' own ids rather than minting parallel ones", () => {
    for (const id of GENERATION_KIND_IDS) {
      expect(OUTPUT_FAMILIES).toContain(id);
    }
  });
});

describe("GENERATION_KIND_CONFIGS", () => {
  it("keys 'qa' and 'currentEvents' to the matching exported config objects", () => {
    expect(GENERATION_KIND_CONFIGS.qa).toBe(qaKindConfig);
    expect(GENERATION_KIND_CONFIGS.currentEvents).toBe(currentEventsKindConfig);
  });
});

describe("qaKindConfig", () => {
  it("carries the expected identity fields", () => {
    expect(qaKindConfig.id).toBe("qa");
    expect(qaKindConfig.artifactKind).toBe("anticipated-qa");
    expect(qaKindConfig.needsCourseRow).toBe(true);
    expect(qaKindConfig.commitMode).toBe("save-version");
  });

  it("buildPrompt folds in the course name, module label, and materials text", () => {
    const prompt = qaKindConfig.buildPrompt("SOME MATERIALS TEXT", {
      courseName: "Intro to Widgets",
      moduleLabel: "Week 3",
    });
    expect(prompt).toContain("Intro to Widgets");
    expect(prompt).toContain("Week 3");
    expect(prompt).toContain("SOME MATERIALS TEXT");
  });

  it("buildPrompt falls back to a generic course label when courseName is blank", () => {
    const prompt = qaKindConfig.buildPrompt("materials", { courseName: "", moduleLabel: "Week 1" });
    expect(prompt).toContain("this course");
  });

  it("render joins every question/answer pair, numbered, separated by a blank line", () => {
    const generated: QaGeneratedContent = {
      questions: [
        { question: "What is a widget?", answer: "A small manufactured part." },
        { question: "Why does it matter?", answer: "It ships in every gadget." },
      ],
    };
    expect(qaKindConfig.render(generated)).toBe(
      "Q1: What is a widget?\n\nA: A small manufactured part.\n\n\nQ2: Why does it matter?\n\nA: It ships in every gadget."
    );
  });

  it("isEmpty is true only when there are zero questions", () => {
    expect(qaKindConfig.isEmpty({ questions: [] })).toBe(true);
    expect(qaKindConfig.isEmpty({ questions: [{ question: "q", answer: "a" }] })).toBe(false);
  });
});

describe("currentEventsKindConfig", () => {
  it("carries the expected identity fields", () => {
    expect(currentEventsKindConfig.id).toBe("currentEvents");
    expect(currentEventsKindConfig.artifactKind).toBe("current-events");
    expect(currentEventsKindConfig.needsCourseRow).toBe(true);
    expect(currentEventsKindConfig.commitMode).toBe("save-version");
  });

  it("render returns the generator's reportMarkdown verbatim", () => {
    const generated: CurrentEventsGeneratedContent = {
      report: "flat report text",
      reportMarkdown: "# Current Events\n\nSomething happened.",
      sourceCount: 3,
      topicsCovered: 2,
    };
    expect(currentEventsKindConfig.render(generated)).toBe("# Current Events\n\nSomething happened.");
  });

  it("isEmpty is true only when zero topics were covered", () => {
    expect(
      currentEventsKindConfig.isEmpty({ report: "", reportMarkdown: "", sourceCount: 0, topicsCovered: 0 })
    ).toBe(true);
    expect(
      currentEventsKindConfig.isEmpty({ report: "x", reportMarkdown: "x", sourceCount: 1, topicsCovered: 1 })
    ).toBe(false);
  });
});
