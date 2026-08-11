import { describe, it, expect } from "vitest";
import { OUTPUT_FAMILIES } from "@/lib/output-selection";
import {
  GENERATION_KIND_IDS,
  GENERATION_KIND_CONFIGS,
  qaKindConfig,
  currentEventsKindConfig,
  decksKindConfig,
  type QaGeneratedContent,
  type CurrentEventsGeneratedContent,
  type DeckGeneratedContent,
} from "./kinds";

describe("GENERATION_KIND_IDS", () => {
  it("is exactly the three kinds shipped so far, in a stable order", () => {
    expect(GENERATION_KIND_IDS).toEqual(["qa", "currentEvents", "decks"]);
  });

  it("reuses OUTPUT_FAMILIES' own ids rather than minting parallel ones", () => {
    for (const id of GENERATION_KIND_IDS) {
      expect(OUTPUT_FAMILIES).toContain(id);
    }
  });
});

describe("GENERATION_KIND_CONFIGS", () => {
  it("keys 'qa', 'currentEvents' and 'decks' to the matching exported config objects", () => {
    expect(GENERATION_KIND_CONFIGS.qa).toBe(qaKindConfig);
    expect(GENERATION_KIND_CONFIGS.currentEvents).toBe(currentEventsKindConfig);
    expect(GENERATION_KIND_CONFIGS.decks).toBe(decksKindConfig);
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

describe("only decksKindConfig populates renderStructured", () => {
  // THE STRUCTURED SEAM: entry 261's whole reason for the
  // generated_artifacts.structured column is that decks (unlike qa/
  // currentEvents) need a lossless payload alongside the lossy text. Pinning
  // that qa/currentEvents carry NO renderStructured at all - not merely one
  // that happens to return something falsy - is what would catch a future
  // edit that accidentally gave every kind the field.
  it("qa and currentEvents leave renderStructured undefined", () => {
    expect(qaKindConfig.renderStructured).toBeUndefined();
    expect(currentEventsKindConfig.renderStructured).toBeUndefined();
  });

  it("decks defines renderStructured", () => {
    expect(decksKindConfig.renderStructured).toBeTypeOf("function");
  });
});

describe("decksKindConfig", () => {
  const generated: DeckGeneratedContent = {
    presentationTitle: "Week 3: Loops",
    slides: [
      { title: "Loops", bullets: ["for", "while"], code: "for i in range(3): pass", codeLanguage: "python", notes: "say hi", graphic: { kind: "matrix" } },
      { title: "Summary", bullets: ["recap"] },
    ],
  };

  it("carries the expected identity fields", () => {
    expect(decksKindConfig.id).toBe("decks");
    expect(decksKindConfig.artifactKind).toBe("deck");
    expect(decksKindConfig.needsCourseRow).toBe(true);
    expect(decksKindConfig.commitMode).toBe("save-version");
  });

  it("buildPrompt folds in the course name, module label, materials text and (when given) the template name", () => {
    const withTemplate = decksKindConfig.buildPrompt("SOME MATERIALS TEXT", {
      courseName: "Intro to Widgets",
      moduleLabel: "Week 3",
      templateName: "Classic Lecture",
    });
    expect(withTemplate).toContain("Intro to Widgets");
    expect(withTemplate).toContain("Week 3");
    expect(withTemplate).toContain("SOME MATERIALS TEXT");
    expect(withTemplate).toContain("Classic Lecture");
  });

  it("buildPrompt omits any template mention when templateName is absent", () => {
    const withoutTemplate = decksKindConfig.buildPrompt("materials", {
      courseName: "Intro to Widgets",
      moduleLabel: "Week 3",
    });
    expect(withoutTemplate).not.toContain("using the");
  });

  it("buildPrompt falls back to a generic course label when courseName is blank", () => {
    const prompt = decksKindConfig.buildPrompt("materials", { courseName: "", moduleLabel: "Week 1" });
    expect(prompt).toContain("this course");
  });

  describe("THE TEXT/STRUCTURED SPLIT", () => {
    it("render (text) carries only the title and bullets - the SAME lossy projection slidesToText performs", () => {
      // Verified by reading src/app/components/content-tab/utils.ts's
      // slidesToText directly: it destructures only `s.title`/`s.bullets`,
      // so it silently drops `code`, `codeLanguage`, `notes` and `graphic`.
      // This asserts decksKindConfig.render drops the exact same four
      // fields, by using a slide that carries all of them and checking none
      // of their VALUES leak into the text.
      const text = decksKindConfig.render(generated);
      expect(text).toBe("# Week 3: Loops\n\n## Loops\n- for\n- while\n\n## Summary\n- recap");
      expect(text).not.toContain("for i in range(3)");
      expect(text).not.toContain("say hi");
      expect(text).not.toContain("matrix");
    });

    it("SABOTAGE TARGET: renderStructured keeps every field render dropped", () => {
      const structured = decksKindConfig.renderStructured!(generated) as typeof generated.slides;
      expect(structured).toEqual(generated.slides);
      expect(structured[0].code).toBe("for i in range(3): pass");
      expect(structured[0].codeLanguage).toBe("python");
      expect(structured[0].notes).toBe("say hi");
      expect(structured[0].graphic).toEqual({ kind: "matrix" });
    });
  });

  it("isEmpty is true only when there are zero slides", () => {
    expect(decksKindConfig.isEmpty({ presentationTitle: "x", slides: [] })).toBe(true);
    expect(decksKindConfig.isEmpty(generated)).toBe(false);
  });
});
