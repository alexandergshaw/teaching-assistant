import { describe, it, expect } from "vitest";
import { OUTPUT_FAMILIES } from "@/lib/output-selection";
import {
  GENERATION_KIND_IDS,
  GENERATION_KIND_CONFIGS,
  NON_FAMILY_KIND_IDS,
  qaKindConfig,
  currentEventsKindConfig,
  decksKindConfig,
  objectivesKindConfig,
  assignmentsKindConfig,
  knowledgeChecksKindConfig,
  announcementsKindConfig,
  scriptsKindConfig,
  type QaGeneratedContent,
  type CurrentEventsGeneratedContent,
  type DeckGeneratedContent,
  type ObjectivesGeneratedContent,
  type AssignmentGeneratedContent,
  type KnowledgeCheckGeneratedContent,
  type AnnouncementGeneratedContent,
  type ScriptGeneratedContent,
} from "./kinds";

describe("GENERATION_KIND_IDS", () => {
  it("is exactly the eight kinds shipped so far, in a stable order", () => {
    expect(GENERATION_KIND_IDS).toEqual([
      "qa",
      "currentEvents",
      "decks",
      "objectives",
      "assignments",
      "knowledgeChecks",
      "announcements",
      "scripts",
    ]);
  });

  // S3(a): every id is accounted for by EITHER OUTPUT_FAMILIES (the seven
  // family-backed kinds) OR NON_FAMILY_KIND_IDS (the carve-out, "scripts") -
  // replaces the old "reuses OUTPUT_FAMILIES' own ids" test, which assumed
  // every kind had a family.
  it("every id is a member of OUTPUT_FAMILIES or of NON_FAMILY_KIND_IDS", () => {
    for (const id of GENERATION_KIND_IDS) {
      const inFamily = (OUTPUT_FAMILIES as readonly string[]).includes(id);
      const inCarveOut = (NON_FAMILY_KIND_IDS as readonly string[]).includes(id);
      expect(inFamily || inCarveOut).toBe(true);
    }
  });

  // S3(b): without this, the carve-out becomes a loophole - a future id
  // that DOES have an OUTPUT_FAMILIES entry could be parked in
  // NON_FAMILY_KIND_IDS instead, silently losing the per-id compile-time
  // rename protection the Extract in GenerationKindId exists to give it.
  // Disjointness is what keeps the carve-out limited to ids that genuinely
  // have no family.
  it("NON_FAMILY_KIND_IDS and OUTPUT_FAMILIES are disjoint", () => {
    for (const id of NON_FAMILY_KIND_IDS) {
      expect(OUTPUT_FAMILIES as readonly string[]).not.toContain(id);
    }
  });

  // X1: no drift between the id list and the config map, in either
  // direction - a kind added to one but not the other must fail loudly here
  // rather than silently existing half-registered.
  it("has exactly one config per id, and no config for any other id", () => {
    for (const id of GENERATION_KIND_IDS) {
      expect(GENERATION_KIND_CONFIGS[id]).toBeDefined();
      expect(GENERATION_KIND_CONFIGS[id].id).toBe(id);
    }
    expect(Object.keys(GENERATION_KIND_CONFIGS).sort()).toEqual([...GENERATION_KIND_IDS].sort());
  });
});

describe("GENERATION_KIND_CONFIGS", () => {
  it("keys every id to the matching exported config object", () => {
    expect(GENERATION_KIND_CONFIGS.qa).toBe(qaKindConfig);
    expect(GENERATION_KIND_CONFIGS.currentEvents).toBe(currentEventsKindConfig);
    expect(GENERATION_KIND_CONFIGS.decks).toBe(decksKindConfig);
    expect(GENERATION_KIND_CONFIGS.objectives).toBe(objectivesKindConfig);
    expect(GENERATION_KIND_CONFIGS.assignments).toBe(assignmentsKindConfig);
    expect(GENERATION_KIND_CONFIGS.knowledgeChecks).toBe(knowledgeChecksKindConfig);
    expect(GENERATION_KIND_CONFIGS.announcements).toBe(announcementsKindConfig);
    expect(GENERATION_KIND_CONFIGS.scripts).toBe(scriptsKindConfig);
  });
});

describe("R1: commitMode", () => {
  // SABOTAGE TARGET: flipping any of these three literals to "save-and-post"
  // must fail this test - the existing kinds' behaviour is pinned untouched.
  it("the three original kinds still declare commitMode 'save-version'", () => {
    expect(qaKindConfig.commitMode).toBe("save-version");
    expect(currentEventsKindConfig.commitMode).toBe("save-version");
    expect(decksKindConfig.commitMode).toBe("save-version");
  });

  it("the three original kinds carry no commitMeta", () => {
    expect(qaKindConfig.commitMeta).toBeUndefined();
    expect(currentEventsKindConfig.commitMeta).toBeUndefined();
    expect(decksKindConfig.commitMeta).toBeUndefined();
  });

  // SABOTAGE TARGET: swapping commitMode on any new kind to "save-version"
  // must fail this test.
  it("the four new kinds declare commitMode 'save-and-post' with commitMeta", () => {
    for (const config of [
      objectivesKindConfig,
      assignmentsKindConfig,
      knowledgeChecksKindConfig,
      announcementsKindConfig,
    ]) {
      expect(config.commitMode).toBe("save-and-post");
      expect(config.commitMeta).toBeDefined();
    }
  });

  it("declares the right Canvas object kind per new kind", () => {
    expect(objectivesKindConfig.commitMeta?.canvasObjectKind).toBe("page");
    expect(assignmentsKindConfig.commitMeta?.canvasObjectKind).toBe("assignment");
    expect(knowledgeChecksKindConfig.commitMeta?.canvasObjectKind).toBe("quiz");
    expect(announcementsKindConfig.commitMeta?.canvasObjectKind).toBe("announcement");
  });

  it("page/assignment/quiz kinds are unpublished on creation, matching every other creation path in this tab", () => {
    expect(objectivesKindConfig.commitMeta?.publishedOnCreation).toBe(false);
    expect(assignmentsKindConfig.commitMeta?.publishedOnCreation).toBe(false);
    expect(knowledgeChecksKindConfig.commitMeta?.publishedOnCreation).toBe(false);
  });

  it("announcements are published on creation (no unpublished-draft state exists for them)", () => {
    expect(announcementsKindConfig.commitMeta?.publishedOnCreation).toBe(true);
  });

  it("page/assignment/quiz kinds place their content as a module item", () => {
    expect(objectivesKindConfig.commitMeta?.placement).toBe("module-item");
    expect(assignmentsKindConfig.commitMeta?.placement).toBe("module-item");
    expect(knowledgeChecksKindConfig.commitMeta?.placement).toBe("module-item");
  });

  it("announcements are course-level, NOT a module item", () => {
    expect(announcementsKindConfig.commitMeta?.placement).toBe("course-level");
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

describe("objectivesKindConfig", () => {
  it("carries the expected identity fields", () => {
    expect(objectivesKindConfig.id).toBe("objectives");
    expect(objectivesKindConfig.artifactKind).toBe("module-objectives");
    expect(objectivesKindConfig.needsCourseRow).toBe(true);
    expect(objectivesKindConfig.commitMode).toBe("save-and-post");
  });

  it("buildPrompt folds in the course name, module label, and materials text", () => {
    const prompt = objectivesKindConfig.buildPrompt("SOME MATERIALS TEXT", {
      courseName: "Intro to Widgets",
      moduleLabel: "Week 3",
    });
    expect(prompt).toContain("Intro to Widgets");
    expect(prompt).toContain("Week 3");
    expect(prompt).toContain("SOME MATERIALS TEXT");
  });

  it("buildPrompt falls back to a generic course label when courseName is blank", () => {
    const prompt = objectivesKindConfig.buildPrompt("materials", { courseName: "", moduleLabel: "Week 1" });
    expect(prompt).toContain("this course");
  });

  it("render returns the generated text verbatim", () => {
    const generated: ObjectivesGeneratedContent = { text: "By the end of this module, students will..." };
    expect(objectivesKindConfig.render(generated)).toBe("By the end of this module, students will...");
  });

  it("isEmpty is true only when the text is blank", () => {
    expect(objectivesKindConfig.isEmpty({ text: "" })).toBe(true);
    expect(objectivesKindConfig.isEmpty({ text: "   " })).toBe(true);
    expect(objectivesKindConfig.isEmpty({ text: "Objective 1" })).toBe(false);
  });

  it("renderStructured is undefined - a page's text column round-trips it completely", () => {
    expect(objectivesKindConfig.renderStructured).toBeUndefined();
  });
});

describe("assignmentsKindConfig", () => {
  const generated: AssignmentGeneratedContent = {
    title: "Build a Todo API",
    overview: "Students build a small REST API.",
    steps: [
      { stepTitle: "Scaffold the project", description: "Create the repo and install dependencies." },
      { stepTitle: "Implement endpoints", description: "Add CRUD routes for todos." },
    ],
    tools: ["Node.js", "Express"],
    deliverables: ["A working API", "A short README"],
  };

  it("carries the expected identity fields", () => {
    expect(assignmentsKindConfig.id).toBe("assignments");
    expect(assignmentsKindConfig.artifactKind).toBe("assignment");
    expect(assignmentsKindConfig.needsCourseRow).toBe(true);
    expect(assignmentsKindConfig.commitMode).toBe("save-and-post");
  });

  it("buildPrompt folds in the course name, module label, and materials text", () => {
    const prompt = assignmentsKindConfig.buildPrompt("SOME MATERIALS TEXT", {
      courseName: "Intro to Widgets",
      moduleLabel: "Week 3",
    });
    expect(prompt).toContain("Intro to Widgets");
    expect(prompt).toContain("Week 3");
    expect(prompt).toContain("SOME MATERIALS TEXT");
  });

  it("buildPrompt falls back to a generic course label when courseName is blank", () => {
    const prompt = assignmentsKindConfig.buildPrompt("materials", { courseName: "", moduleLabel: "Week 1" });
    expect(prompt).toContain("this course");
  });

  it("render assembles a title, overview, numbered steps, tools and deliverables", () => {
    expect(assignmentsKindConfig.render(generated)).toBe(
      "# Build a Todo API\n\n" +
        "## Overview\n" +
        "Students build a small REST API.\n\n" +
        "## What you will do\n" +
        "1. Scaffold the project\n" +
        "   Create the repo and install dependencies.\n" +
        "2. Implement endpoints\n" +
        "   Add CRUD routes for todos.\n\n" +
        "## Tools\n" +
        "- Node.js\n" +
        "- Express\n\n" +
        "## Deliverables\n" +
        "- A working API\n" +
        "- A short README"
    );
  });

  it("render omits Tools/Deliverables/What you will do headings entirely when their lists are empty", () => {
    const bare: AssignmentGeneratedContent = {
      title: "Minimal",
      overview: "Just an overview.",
      steps: [],
      tools: [],
      deliverables: [],
    };
    const text = assignmentsKindConfig.render(bare);
    expect(text).toBe("# Minimal\n\n## Overview\nJust an overview.");
    expect(text).not.toContain("## What you will do");
    expect(text).not.toContain("## Tools");
    expect(text).not.toContain("## Deliverables");
  });

  it("isEmpty is true only when there are zero steps", () => {
    expect(assignmentsKindConfig.isEmpty({ ...generated, steps: [] })).toBe(true);
    expect(assignmentsKindConfig.isEmpty(generated)).toBe(false);
  });

  it("renderStructured is undefined - the assignment's own text carries everything the runner needs", () => {
    expect(assignmentsKindConfig.renderStructured).toBeUndefined();
  });
});

describe("knowledgeChecksKindConfig", () => {
  const generated: KnowledgeCheckGeneratedContent = {
    questions: [
      {
        prompt: "What does a for-loop do?",
        choices: [
          { text: "Repeats a block of code", correct: true, explanation: "" },
          { text: "Declares a variable", correct: false, explanation: "That is what an assignment does, not a loop." },
          { text: "Ends the program", correct: false, explanation: "Only a return or exit call does that." },
          { text: "Imports a module", correct: false, explanation: "That is what an import statement does." },
        ],
      },
    ],
  };

  it("carries the expected identity fields", () => {
    expect(knowledgeChecksKindConfig.id).toBe("knowledgeChecks");
    expect(knowledgeChecksKindConfig.artifactKind).toBe("knowledge-check");
    expect(knowledgeChecksKindConfig.needsCourseRow).toBe(true);
    expect(knowledgeChecksKindConfig.commitMode).toBe("save-and-post");
  });

  it("buildPrompt folds in the course name, module label, and materials text", () => {
    const prompt = knowledgeChecksKindConfig.buildPrompt("SOME MATERIALS TEXT", {
      courseName: "Intro to Widgets",
      moduleLabel: "Week 3",
    });
    expect(prompt).toContain("Intro to Widgets");
    expect(prompt).toContain("Week 3");
    expect(prompt).toContain("SOME MATERIALS TEXT");
  });

  it("buildPrompt falls back to a generic course label when courseName is blank", () => {
    const prompt = knowledgeChecksKindConfig.buildPrompt("materials", { courseName: "", moduleLabel: "Week 1" });
    expect(prompt).toContain("this course");
  });

  it("render marks the correct choice and trails each wrong choice's explanation", () => {
    const text = knowledgeChecksKindConfig.render(generated);
    expect(text).toBe(
      "Q1: What does a for-loop do?\n" +
        "[x] Repeats a block of code\n" +
        "[ ] Declares a variable (That is what an assignment does, not a loop.)\n" +
        "[ ] Ends the program (Only a return or exit call does that.)\n" +
        "[ ] Imports a module (That is what an import statement does.)"
    );
  });

  it("isEmpty is true only when there are zero questions", () => {
    expect(knowledgeChecksKindConfig.isEmpty({ questions: [] })).toBe(true);
    expect(knowledgeChecksKindConfig.isEmpty(generated)).toBe(false);
  });

  describe("THE STRUCTURED SEAM", () => {
    it("renderStructured is defined, unlike objectives/assignments/announcements", () => {
      expect(knowledgeChecksKindConfig.renderStructured).toBeTypeOf("function");
    });

    // SABOTAGE TARGET: the questions array must survive round-trip losslessly
    // - the same argument decksKindConfig's own structured seam test makes.
    // A render-only path cannot recover this (choice text could itself
    // contain "[x]" or parenthesized text, and correctness/explanation are
    // not reliably recoverable by re-parsing render's output).
    it("renderStructured round-trips the exact questions array, including every explanation", () => {
      const structured = knowledgeChecksKindConfig.renderStructured!(generated) as typeof generated.questions;
      expect(structured).toEqual(generated.questions);
      expect(structured[0].choices[0].correct).toBe(true);
      expect(structured[0].choices[1].explanation).toBe("That is what an assignment does, not a loop.");
    });
  });
});

describe("announcementsKindConfig", () => {
  it("carries the expected identity fields", () => {
    expect(announcementsKindConfig.id).toBe("announcements");
    expect(announcementsKindConfig.artifactKind).toBe("announcement");
    expect(announcementsKindConfig.needsCourseRow).toBe(true);
    expect(announcementsKindConfig.commitMode).toBe("save-and-post");
  });

  it("buildPrompt folds in the course name, module label, and materials text", () => {
    const prompt = announcementsKindConfig.buildPrompt("SOME MATERIALS TEXT", {
      courseName: "Intro to Widgets",
      moduleLabel: "Week 3",
    });
    expect(prompt).toContain("Intro to Widgets");
    expect(prompt).toContain("Week 3");
    expect(prompt).toContain("SOME MATERIALS TEXT");
  });

  it("buildPrompt falls back to a generic course label when courseName is blank", () => {
    const prompt = announcementsKindConfig.buildPrompt("materials", { courseName: "", moduleLabel: "Week 1" });
    expect(prompt).toContain("this course");
  });

  it("render returns the message body only - the title is not folded in", () => {
    const generated: AnnouncementGeneratedContent = {
      title: "Reminder: Assignment due Friday",
      message: "Just a reminder that this week's assignment is due Friday at 11:59pm.",
    };
    const text = announcementsKindConfig.render(generated);
    expect(text).toBe("Just a reminder that this week's assignment is due Friday at 11:59pm.");
    expect(text).not.toContain("Reminder: Assignment due Friday");
  });

  it("isEmpty is true when either the title or the message is blank", () => {
    expect(announcementsKindConfig.isEmpty({ title: "", message: "Body text" })).toBe(true);
    expect(announcementsKindConfig.isEmpty({ title: "Title", message: "" })).toBe(true);
    expect(announcementsKindConfig.isEmpty({ title: "  ", message: "  " })).toBe(true);
    expect(announcementsKindConfig.isEmpty({ title: "Title", message: "Body" })).toBe(false);
  });

  it("renderStructured is undefined - title and message already map 1:1 onto the artifact row's own columns", () => {
    expect(announcementsKindConfig.renderStructured).toBeUndefined();
  });
});

describe("scriptsKindConfig", () => {
  it("carries the expected identity fields", () => {
    expect(scriptsKindConfig.id).toBe("scripts");
    expect(scriptsKindConfig.artifactKind).toBe("lecture-script");
    expect(scriptsKindConfig.needsCourseRow).toBe(true);
  });

  // S4: save-only, like qa/currentEvents/decks - posting a teleprompter
  // script would publish the instructor's spoken lines to students.
  it("commitMode is save-version, with no commitMeta", () => {
    expect(scriptsKindConfig.commitMode).toBe("save-version");
    expect(scriptsKindConfig.commitMeta).toBeUndefined();
  });

  it("buildPrompt folds in the course name, module label, and materials text", () => {
    const prompt = scriptsKindConfig.buildPrompt("SOME MATERIALS TEXT", {
      courseName: "Intro to Widgets",
      moduleLabel: "Week 3",
    });
    expect(prompt).toContain("Intro to Widgets");
    expect(prompt).toContain("Week 3");
    expect(prompt).toContain("SOME MATERIALS TEXT");
  });

  it("buildPrompt falls back to a generic course label when courseName is blank", () => {
    const prompt = scriptsKindConfig.buildPrompt("materials", { courseName: "", moduleLabel: "Week 1" });
    expect(prompt).toContain("this course");
  });

  // S7: the requested length is part of the saved prompt's audit trail.
  it("buildPrompt folds in targetMinutes when supplied", () => {
    const prompt = scriptsKindConfig.buildPrompt("materials", {
      courseName: "Intro to Widgets",
      moduleLabel: "Week 3",
      targetMinutes: 15,
    });
    expect(prompt).toContain("15");
  });

  it("buildPrompt omits any minutes phrasing when targetMinutes is absent", () => {
    const prompt = scriptsKindConfig.buildPrompt("materials", {
      courseName: "Intro to Widgets",
      moduleLabel: "Week 3",
    });
    expect(prompt).not.toMatch(/minute/i);
  });

  it("render returns the generated script verbatim", () => {
    const generated: ScriptGeneratedContent = { script: "Welcome, everyone. Today we will cover loops." };
    expect(scriptsKindConfig.render(generated)).toBe("Welcome, everyone. Today we will cover loops.");
  });

  it("isEmpty is true only when the script is blank", () => {
    expect(scriptsKindConfig.isEmpty({ script: "" })).toBe(true);
    expect(scriptsKindConfig.isEmpty({ script: "   " })).toBe(true);
    expect(scriptsKindConfig.isEmpty({ script: "Welcome, everyone." })).toBe(false);
  });

  it("renderStructured is undefined - a script's text column round-trips it completely", () => {
    expect(scriptsKindConfig.renderStructured).toBeUndefined();
  });
});
