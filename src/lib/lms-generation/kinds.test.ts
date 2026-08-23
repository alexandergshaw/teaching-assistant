import { describe, it, expect } from "vitest";
import { OUTPUT_FAMILIES } from "@/lib/output-selection";
import type { CanvasPostKind } from "./commit-plan";
import {
  GENERATION_KIND_IDS,
  GENERATION_KIND_CONFIGS,
  NON_FAMILY_KIND_IDS,
  kindDeliveredAloud,
  qaKindConfig,
  currentEventsKindConfig,
  decksKindConfig,
  objectivesKindConfig,
  assignmentsKindConfig,
  knowledgeChecksKindConfig,
  announcementsKindConfig,
  scriptsKindConfig,
  resourcesKindConfig,
  introDiscussionKindConfig,
  type GenerationCommitMeta,
  type QaGeneratedContent,
  type CurrentEventsGeneratedContent,
  type DeckGeneratedContent,
  type ObjectivesGeneratedContent,
  type AssignmentGeneratedContent,
  type KnowledgeCheckGeneratedContent,
  type AnnouncementGeneratedContent,
  type ScriptGeneratedContent,
  type IntroDiscussionGeneratedContent,
} from "./kinds";

// Type-level assertion (docs/intro-discussion-from-modules-acceptance-
// criteria.md, section 5b W7): every value GenerationCommitMeta.canvasObjectKind
// can take must be assignable to CanvasPostKind (src/lib/lms-generation/
// commit-plan.ts). kinds.ts keeps canvasObjectKind as a hand-copied literal
// union rather than importing CanvasPostKind (its own leaf rule forbids that
// import - see kinds.ts's header comment), so this is what stops the two
// duplicate unions from silently drifting apart again. If a value is ever
// added to one side and not the other, this line fails to compile: the
// conditional resolves to `never`, and `true` is not assignable to `never`.
type _AssertCanvasObjectKindAssignableToCanvasPostKind =
  GenerationCommitMeta["canvasObjectKind"] extends CanvasPostKind ? true : never;
const _assertCanvasObjectKindAssignableToCanvasPostKind: _AssertCanvasObjectKindAssignableToCanvasPostKind = true;
void _assertCanvasObjectKindAssignableToCanvasPostKind;

describe("GENERATION_KIND_IDS", () => {
  // CANARY: bump this list (same commit as any GENERATION_KIND_IDS change) -
  // this is the one hand-written enumeration in this file that does not
  // derive from GENERATION_KIND_IDS itself, so a kind added or removed from
  // the registry without a matching edit here fails loudly rather than
  // silently drifting. "resources" (docs/learning-resources-page-acceptance-
  // criteria.md, A1) is the ninth kind; "introDiscussion"
  // (docs/intro-discussion-from-modules-acceptance-criteria.md, AC5) is the
  // TENTH, joining "scripts" and "resources" in NON_FAMILY_KIND_IDS - see
  // that constant's own doc comment (kinds.ts).
  it("is exactly the ten kinds shipped so far, in a stable order", () => {
    expect(GENERATION_KIND_IDS).toEqual([
      "qa",
      "currentEvents",
      "decks",
      "objectives",
      "assignments",
      "knowledgeChecks",
      "announcements",
      "scripts",
      "resources",
      "introDiscussion",
    ]);
  });

  // artifactKind is the PERMANENT version-history query key: every
  // generated_artifacts row is keyed by (courseId, kind), and
  // saveGeneratedArtifactVersion / listGeneratedArtifactVersions both read it
  // straight off the config. Two kinds sharing one string would therefore
  // silently MERGE their version histories - each kind listing and refining
  // the other's saved versions, with no error anywhere to notice it by. That
  // failure is invisible in every other test here, because each per-kind
  // block only ever asserts its own config in isolation; only a cross-kind
  // check can see a collision at all. Derived from GENERATION_KIND_IDS rather
  // than restating the strings, so a tenth kind is covered the moment it is
  // registered, with no edit here.
  it("every kind's artifactKind is unique across the whole registry", () => {
    const artifactKinds = GENERATION_KIND_IDS.map((id) => GENERATION_KIND_CONFIGS[id].artifactKind);
    expect(new Set(artifactKinds).size, `artifactKind collision among: ${artifactKinds.join(", ")}`).toBe(
      artifactKinds.length
    );
  });

  // S3(a): every id is accounted for by EITHER OUTPUT_FAMILIES (the seven
  // family-backed kinds) OR NON_FAMILY_KIND_IDS (the carve-out - "scripts"
  // and "resources") - replaces the old "reuses OUTPUT_FAMILIES' own ids"
  // test, which assumed every kind had a family.
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
    expect(GENERATION_KIND_CONFIGS.resources).toBe(resourcesKindConfig);
    expect(GENERATION_KIND_CONFIGS.introDiscussion).toBe(introDiscussionKindConfig);
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

  // SABOTAGE TARGET: swapping commitMode on any save-and-post kind to
  // "save-version" (or vice versa) must fail this test. Converted to a
  // GENERATION_KIND_IDS-derived loop (finding 5) rather than a hand-listed
  // array of the four original save-and-post kinds - the property itself
  // ("declares commitMeta if and only if commitMode is save-and-post") is
  // one every kind must hold, including "resources" (the fifth save-and-post
  // kind, docs/learning-resources-page-acceptance-criteria.md A3), and this
  // form catches a future save-and-post kind that forgets commitMeta without
  // needing anyone to remember to add it to a hand-written list here. The
  // save-version side (commitMeta undefined) stays hand-pinned per kind in
  // "the three original kinds carry no commitMeta" above and scripts' own
  // S4 test - both are canaries for those SPECIFIC kinds, not this derived
  // cross-cutting property.
  it("every kind's commitMeta is defined if and only if its commitMode is 'save-and-post'", () => {
    for (const id of GENERATION_KIND_IDS) {
      const config = GENERATION_KIND_CONFIGS[id];
      if (config.commitMode === "save-and-post") {
        expect(config.commitMeta).toBeDefined();
      } else {
        expect(config.commitMeta).toBeUndefined();
      }
    }
  });

  // Per-kind canvasObjectKind values have no derivable formula (they are a
  // deliberate per-kind choice, not a function of commitMode), so this stays
  // a hand-written list - including "resources" (finding 5) and
  // "introDiscussion", the first kind whose canvasObjectKind is "discussion"
  // rather than page/assignment/quiz/announcement (docs/intro-discussion-
  // from-modules-acceptance-criteria.md, section 5b W7).
  it("declares the right Canvas object kind per new kind", () => {
    expect(objectivesKindConfig.commitMeta?.canvasObjectKind).toBe("page");
    expect(assignmentsKindConfig.commitMeta?.canvasObjectKind).toBe("assignment");
    expect(knowledgeChecksKindConfig.commitMeta?.canvasObjectKind).toBe("quiz");
    expect(announcementsKindConfig.commitMeta?.canvasObjectKind).toBe("announcement");
    expect(resourcesKindConfig.commitMeta?.canvasObjectKind).toBe("page");
    expect(introDiscussionKindConfig.commitMeta?.canvasObjectKind).toBe("discussion");
  });

  it("page/assignment/quiz/resources/introDiscussion kinds are unpublished on creation, matching every other creation path in this tab", () => {
    expect(objectivesKindConfig.commitMeta?.publishedOnCreation).toBe(false);
    expect(assignmentsKindConfig.commitMeta?.publishedOnCreation).toBe(false);
    expect(knowledgeChecksKindConfig.commitMeta?.publishedOnCreation).toBe(false);
    expect(resourcesKindConfig.commitMeta?.publishedOnCreation).toBe(false);
    expect(introDiscussionKindConfig.commitMeta?.publishedOnCreation).toBe(false);
  });

  it("announcements are published on creation (no unpublished-draft state exists for them)", () => {
    expect(announcementsKindConfig.commitMeta?.publishedOnCreation).toBe(true);
  });

  it("page/assignment/quiz/resources/introDiscussion kinds place their content as a module item", () => {
    expect(objectivesKindConfig.commitMeta?.placement).toBe("module-item");
    expect(assignmentsKindConfig.commitMeta?.placement).toBe("module-item");
    expect(knowledgeChecksKindConfig.commitMeta?.placement).toBe("module-item");
    expect(resourcesKindConfig.commitMeta?.placement).toBe("module-item");
    expect(introDiscussionKindConfig.commitMeta?.placement).toBe("module-item");
  });

  it("announcements are course-level, NOT a module item", () => {
    expect(announcementsKindConfig.commitMeta?.placement).toBe("course-level");
  });
});

describe("T1: deliveredAloud / kindDeliveredAloud", () => {
  // Iterates GENERATION_KIND_IDS rather than listing ids by hand, so a
  // future kind cannot silently skip this check.
  it("exactly one kind is delivered aloud today, and it is scripts", () => {
    const aloudIds = GENERATION_KIND_IDS.filter((id) => kindDeliveredAloud(id));
    expect(aloudIds).toEqual(["scripts"]);
  });

  it("kindDeliveredAloud is true for scripts and false for every other id", () => {
    for (const id of GENERATION_KIND_IDS) {
      expect(kindDeliveredAloud(id)).toBe(id === "scripts");
    }
  });

  // SABOTAGE TARGET: setting deliveredAloud: false explicitly on any
  // non-spoken config, instead of leaving it absent, must fail this test.
  it("deliveredAloud is absent (not false) on every config other than scripts", () => {
    for (const id of GENERATION_KIND_IDS) {
      if (id === "scripts") continue;
      expect(GENERATION_KIND_CONFIGS[id].deliveredAloud).toBeUndefined();
    }
  });

  it("scriptsKindConfig declares deliveredAloud: true", () => {
    expect(scriptsKindConfig.deliveredAloud).toBe(true);
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
    // M1 (docs/module-intro-video-script-acceptance-criteria.md): artifactKind
    // stays "lecture-script" through the module-intro-video re-gear - it is
    // the sole version-history query key, so changing it would orphan every
    // already-saved version with no migration path (finding 2 of that doc).
    expect(scriptsKindConfig.artifactKind).toBe("lecture-script");
    expect(scriptsKindConfig.needsCourseRow).toBe(true);
  });

  // M2: the label has to survive `Generate ${label.toLowerCase()} from the
  // selected content` grammatically ("Generate intro video script from the
  // selected content").
  it("M2: the label is 'Intro video script'", () => {
    expect(scriptsKindConfig.label).toBe("Intro video script");
  });

  // M3: the audit-trail text saved to generated_artifacts.prompt names a
  // module intro video, not a lecture - it is the version history's own
  // record of what was asked for.
  it("M3: buildPrompt's audit text names a module intro video, not a lecture", () => {
    const prompt = scriptsKindConfig.buildPrompt("materials", {
      courseName: "Intro to Widgets",
      moduleLabel: "Week 3",
    });
    expect(prompt).toMatch(/intro video/i);
    expect(prompt).not.toMatch(/lecture/i);
  });

  // M3: same reasoning as buildPrompt above - emptyMessage is instructor-
  // facing, so it should say what was actually being generated.
  it("M3: emptyMessage names an intro video script, not a lecture script", () => {
    expect(scriptsKindConfig.emptyMessage).toMatch(/intro video script/i);
    expect(scriptsKindConfig.emptyMessage).not.toMatch(/lecture/i);
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

// introDiscussionKindConfig's own identity block (docs/intro-discussion-
// from-modules-acceptance-criteria.md, AC4-AC7 as amended by section 5b's
// W1). docs/REGRESSION.md entry 322's Limits records that "resources" shipped
// WITHOUT one of these - this block exists so introDiscussion does not repeat
// that gap.
describe("introDiscussionKindConfig", () => {
  it("carries the expected identity fields", () => {
    expect(introDiscussionKindConfig.id).toBe("introDiscussion");
    // Permanent - the sole version-history query key. See kinds.ts's own
    // comment on introDiscussionKindConfig.artifactKind for why it must
    // never change once shipped.
    expect(introDiscussionKindConfig.artifactKind).toBe("intro-discussion");
    expect(introDiscussionKindConfig.label).toBe("Intro discussion");
    expect(introDiscussionKindConfig.needsCourseRow).toBe(true);
    expect(introDiscussionKindConfig.commitMode).toBe("save-and-post");
  });

  it("buildPrompt folds in the course name, module label, and materials text", () => {
    const prompt = introDiscussionKindConfig.buildPrompt("SOME MATERIALS TEXT", {
      courseName: "Intro to Widgets",
      moduleLabel: "Week 3",
    });
    expect(prompt).toContain("Intro to Widgets");
    expect(prompt).toContain("Week 3");
    expect(prompt).toContain("SOME MATERIALS TEXT");
  });

  it("buildPrompt falls back to a generic course label when courseName is blank", () => {
    const prompt = introDiscussionKindConfig.buildPrompt("materials", {
      courseName: "",
      moduleLabel: "Week 1",
    });
    expect(prompt).toContain("this course");
  });

  it("render returns the generated message verbatim - the title is not folded in", () => {
    const generated: IntroDiscussionGeneratedContent = {
      title: "Introduce Yourself",
      message: "Tell us about your career and how it relates to this course.",
    };
    const text = introDiscussionKindConfig.render(generated);
    expect(text).toBe("Tell us about your career and how it relates to this course.");
    expect(text).not.toContain("Introduce Yourself");
  });

  it("isEmpty is true when either the title or the message is blank", () => {
    expect(introDiscussionKindConfig.isEmpty({ title: "", message: "Body text" })).toBe(true);
    expect(introDiscussionKindConfig.isEmpty({ title: "Title", message: "" })).toBe(true);
    expect(introDiscussionKindConfig.isEmpty({ title: "  ", message: "  " })).toBe(true);
    expect(introDiscussionKindConfig.isEmpty({ title: "Title", message: "Body" })).toBe(false);
  });

  it("renderStructured is undefined - keeps kindSupportsTextEdit true so the prompt stays hand-editable", () => {
    expect(introDiscussionKindConfig.renderStructured).toBeUndefined();
  });

  it("deliveredAloud is absent - a discussion prompt is posted for students to read, never read aloud on camera", () => {
    expect(introDiscussionKindConfig.deliveredAloud).toBeUndefined();
  });

  // AC7/W1: the generated-content shape has NO pointsPossible field. Points
  // are the constant INTRO_DISCUSSION_POINTS, applied at post time - a
  // model-supplied points value would be discarded at save time
  // (saveGeneratedArtifactVersion persists only title/text/structured) and
  // could never reach Canvas.
  //
  // This is a COMPILE-TIME exhaustiveness check, not a runtime one - a
  // runtime object literal typed as the interface can never fail this way
  // (step-10 finding 3a: the previous version built a two-key literal and
  // then asserted Object.keys of THAT SAME LITERAL equalled two keys, which
  // cannot fail no matter what the interface says). `-?` strips optionality
  // from the mapped type, so ALL_KEYS below requires an entry for every key
  // of the interface EVEN AN OPTIONAL ONE - adding any field to
  // IntroDiscussionGeneratedContent, required or optional, makes the object
  // literal below fail to compile with "Property '<name>' is missing",
  // caught by `tsc --noEmit`, not by vitest (vitest's esbuild transform does
  // not type-check).
  it("IntroDiscussionGeneratedContent has exactly title and message - compile-time exhaustiveness", () => {
    const ALL_KEYS: { [K in keyof IntroDiscussionGeneratedContent]-?: true } = {
      title: true,
      message: true,
    };
    expect(Object.keys(ALL_KEYS).sort()).toEqual(["message", "title"]);
  });
});
