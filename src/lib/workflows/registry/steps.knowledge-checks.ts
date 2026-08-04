// Client-side step catalog: the per-week KNOWLEDGE CHECK (Y2) - a short,
// auto-gradable multiple-choice check for every week in the schedule,
// grounded in that week's ACTUAL generated module materials (objectives,
// deck, opener, assignment) the same way generate-weekly-announcements does
// via gatherWeekMaterials - added ONCE to COURSE_REFRESH (reaching both
// COURSE_KICKOFF and NO_CODE_KICKOFF via include-workflow), placed right
// after generate-weekly-announcements so it extends the SAME accumulated
// "files" chain (see the placement comment on the preset wiring in
// presets/course-setup.ts).
//
// CHUNK C: the per-week orchestration (the isGeneratorSelected guard, the
// course-tile lookup, the per-week loop, the non-transient-quota short-
// circuit, partial-failure accounting, both terminal return shapes) now
// lives once in weekly-generator.ts's runWeeklyGenerator, shared with the
// other five weekly per-module generators - see that module's own header
// comment. This file supplies only what is genuinely unique to knowledge
// checks: the stripModelUrls re-validation against MIN_USABLE_QUESTIONS_PER_
// WEEK, its own document rendering, and its own LMS side effect (a gradable
// quiz plus per-question items plus a bulk publish - the only one of the six
// that creates more than one kind of LMS object per week).
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type KnowledgeCheckQuestion,
  generateKnowledgeCheckAction,
  createGradableAction,
  createQuizQuestionAction,
  bulkUpdateAction,
  createModuleItemAction,
} from "@/app/actions";
// Pure predicate, deliberately NOT re-exported from the "use server" action
// module - see @/lib/knowledge-check-shape's header.
import { isUsableKnowledgeCheckQuestion } from "@/lib/knowledge-check-shape";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { stripModelUrls } from "@/lib/urls";
import type { OutputFamily } from "@/lib/output-selection";
import { groundInWeekMaterials, runWeeklyGenerator, type WeeklyGeneratorConfig } from "./weekly-generator";

// A week whose generated questions, after cleanup, fall below this floor is
// treated as a genuine failure (reported per week) rather than shipped
// half-finished - Y2-AC1 asks for 5-8 questions; 3 is the floor below which a
// "knowledge check" is no longer a meaningfully useful retrieval-practice set.
const MIN_USABLE_QUESTIONS_PER_WEEK = 3;

/**
 * Renders one week's knowledge check as a markdown-lite document (consumed by
 * buildDocxFromPlainText for the .docx, and stored as the file's own
 * pageText). Every choice is lettered; the correct answer is named plainly,
 * and every wrong choice's misconception explanation follows - the whole
 * reason this is a teaching document rather than a bare answer key (Y2-AC1).
 * Exported for steps.knowledge-checks.test.ts.
 */
export function renderKnowledgeCheckDocument(title: string, questions: KnowledgeCheckQuestion[]): string {
  const lines: string[] = [
    `# ${title}`,
    "",
    "Check your understanding of this week's material before moving on. For every question, the correct answer is named below, and each incorrect choice explains the specific misconception it represents - if you picked a wrong answer, that explanation is what to actually learn from, not just which letter was right.",
  ];

  questions.forEach((q, i) => {
    lines.push("");
    lines.push(`## Question ${i + 1}`);
    lines.push(q.prompt);
    lines.push("");

    q.choices.forEach((c, ci) => {
      const letter = String.fromCharCode(65 + ci);
      lines.push(`- ${letter}) ${c.text}`);
    });

    const correctIndex = q.choices.findIndex((c) => c.correct);
    const correctLetter = correctIndex >= 0 ? String.fromCharCode(65 + correctIndex) : "?";
    lines.push("");
    lines.push(`Correct answer: ${correctLetter}) ${q.choices[correctIndex]?.text ?? ""}`);

    const wrongChoices = q.choices.filter((c) => !c.correct);
    if (wrongChoices.length > 0) {
      lines.push("");
      lines.push("Why the others are wrong:");
      q.choices.forEach((c, ci) => {
        if (c.correct) return;
        const letter = String.fromCharCode(65 + ci);
        lines.push(`- ${letter}) ${c.text}: ${c.explanation}`);
      });
    }
  });

  return lines.join("\n");
}

const knowledgeChecksConfig: WeeklyGeneratorConfig<undefined, string, { questions: KnowledgeCheckQuestion[] }, KnowledgeCheckQuestion[]> = {
  selectedKey: "selected",
  countOutputKey: "checkCount",
  sortOrder: 5.5,
  itemLabel: "a knowledge check",
  itemLabelPlural: "weekly knowledge check",
  notSelectedSummaryText: "Skipped - knowledge checks were not selected in this run's output selection.",
  noneGeneratedText: "No weekly knowledge checks were generated.",
  startProgressText: "Composing weekly knowledge checks from each week's module materials...",
  weekProgressText: (weekNumber) => `Composing the Week ${weekNumber} knowledge check...`,

  ground: (incoming, weekNumber) => groundInWeekMaterials(incoming, weekNumber),

  generate: async (materials, week, ctx) => {
    const weekNumber = week.week;
    const topic = (week.topic ?? "").trim();
    return generateKnowledgeCheckAction(`Week ${weekNumber}`, topic, materials, ctx.helpers.provider, ctx.courseKind);
  },

  // No model-authored URL ever reaches the document or the LMS
  // (stripModelUrls convention). Stripping can hollow out a field, so every
  // question is re-validated against the SAME usability check the action
  // itself applies, rather than trusting the pre-strip shape.
  validate: (generated, weekNumber) => {
    const questions: KnowledgeCheckQuestion[] = generated.questions
      .map((q) => ({
        prompt: stripModelUrls(q.prompt).trim(),
        choices: q.choices.map((c) => ({
          text: stripModelUrls(c.text).trim(),
          correct: c.correct,
          explanation: c.correct ? "" : stripModelUrls(c.explanation).trim(),
        })),
      }))
      .filter(isUsableKnowledgeCheckQuestion);

    if (questions.length < MIN_USABLE_QUESTIONS_PER_WEEK) {
      return { ok: false, asFailure: true, message: `Week ${weekNumber}: error - could not produce enough usable questions after cleanup.` };
    }
    return { ok: true, value: questions };
  },

  render: ({ value: questions, weekNumber, topic, tile }) => {
    const title = `Week ${weekNumber} Knowledge Check${topic ? `: ${topic}` : ""}`;
    const pageText = renderKnowledgeCheckDocument(title, questions);
    const fileName = buildWorkflowFileName({
      course: tile ?? null,
      artifact: "Knowledge Check",
      qualifier: topic || `Week ${weekNumber}`,
      ext: "docx",
    });
    return { docxSourceText: pageText, pageText, fileName };
  },

  publish: async (_rendered, { value: questions, weekNumber, topic, courseUrl, acronym, postToLms, modules }) => {
    const title = `Week ${weekNumber} Knowledge Check${topic ? `: ${topic}` : ""}`;
    let postNote = "not posted - posting is turned off.";
    if (postToLms) {
      if (!courseUrl) {
        postNote = "not posted - no LMS course on the tile.";
      } else {
        try {
          const created = await createGradableAction(
            courseUrl,
            "Quiz",
            {
              title,
              description: "Check your understanding of this week's material. Review the explanations for any question you miss.",
            },
            acronym
          );

          if ("error" in created) {
            postNote = `LMS error - ${created.error}`;
          } else {
            let questionFailures = 0;
            for (const q of questions) {
              const r = await createQuizQuestionAction(
                courseUrl,
                created.id,
                {
                  name: q.prompt.slice(0, 80),
                  text: q.prompt,
                  type: "multiple_choice_question",
                  points: 1,
                  answers: q.choices.map((c) => ({ text: c.text, correct: c.correct })),
                },
                acronym
              );
              if ("error" in r) questionFailures += 1;
            }

            const published = await bulkUpdateAction(courseUrl, "Quiz", [String(created.id)], { published: true }, acronym);
            const publishNote = "error" in published ? `; publish failed - ${published.error}` : "";

            let placementNote = "; not placed in a module (no module for this week)";
            const targetModule = modules.find((m) => m.week === weekNumber);
            if (targetModule) {
              const linked = await createModuleItemAction(courseUrl, targetModule.id, { type: "Quiz", contentId: created.id, title }, acronym);
              placementNote = "error" in linked ? `; module placement failed - ${linked.error}` : "";
            }

            postNote = `quiz created (id ${created.id})${
              questionFailures ? `, ${questionFailures} of ${questions.length} question(s) failed` : ""
            }${publishNote}${placementNote}`;
          }
        } catch (err) {
          postNote = `LMS error - ${err instanceof Error ? err.message : "unknown error"}`;
        }
      }
    }
    return `Week ${weekNumber}${topic ? ` (${topic})` : ""}: generated ${questions.length} question(s) - ${postNote}`;
  },
};

export const knowledgeCheckSteps: StepDefinition[] = [
  {
    type: "generate-knowledge-checks",
    name: "Generate weekly knowledge checks",
    description:
      "Build a short, auto-gradable knowledge check for every week in the schedule - 5 to 8 Apply/Analyze-level multiple-choice questions grounded in that week's ACTUAL generated module materials (objectives, deck, opener, assignment), each with a one-sentence explanation of why every wrong answer is wrong. Ships as a Word document in that week's zip folder, and optionally as a real Canvas quiz. This step depends only on the course schedule, not on the LMS modules step, so an LMS outage no longer skips it - the cost is that in every built-in preset the quiz is no longer placed into that week's Canvas module (see the \"modules\" input below).",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "The tile's LMS course is where the quiz posts when turned on.",
      },
      { key: "schedule", label: "Course schedule", type: "schedule", required: true },
      {
        key: "files",
        label: "Course files so far",
        type: "files",
        required: false,
        help: "The run's per-week materials (objectives, deck, opener, assignment) - each week's knowledge check is grounded in these, not just the topic.",
      },
      {
        key: "modules",
        label: "LMS modules",
        type: "modules",
        required: false,
        help: "When bound, the Canvas quiz is placed in that week's module. None of the built-in presets bind this any more (this step now depends only on the course schedule, not on the LMS modules step, so an LMS-side failure no longer skips this step's local deliverables) - so when postToLms is on, the quiz is still created and published but reports \"not placed in a module\", even on a fully successful LMS modules run.",
      },
      {
        key: "courseKind",
        label: "Course type",
        type: "text",
        required: false,
        options: ["coding", "applied"],
        help: "\"applied\" is a no-code course: nothing generated may involve reading, writing, or running code.",
      },
      {
        key: "postToLms",
        label: "Post knowledge checks to the LMS",
        type: "boolean",
        required: false,
        help: "Off by default - creates and publishes a real Canvas quiz per week, placed in that week's module. When off, the knowledge check still ships as a Word document in the zip.",
        // Meaningless (and hidden) once "knowledgeChecks" is deselected from
        // COURSE_BUILD's own "outputs" multi-select - see workflow-field-
        // visibility.ts's isFieldVisible for the shared predicate. A blank
        // "outputs" (today's default) still shows this - "blank means all".
        visibleWhen: { fieldKey: "outputs", contains: "knowledgeChecks" satisfies OutputFamily },
      },
      {
        key: "selected",
        label: "Generate this run",
        type: "boolean",
        required: false,
        help: "From COURSE_BUILD's output selection (steps.course-build-scope.ts). Blank/unbound = generate (unchanged default) - every OTHER preset that uses this step leaves it unbound.",
      },
    ],
    outputs: [
      { key: "files", label: "Course files", type: "files" },
      { key: "checkCount", label: "Knowledge checks generated", type: "number" },
      { key: "report", label: "Report", type: "longtext" },
    ],
    // Deliverable-resilience pass-through (registry-helpers.ts's
    // StepDefinition.passThroughOnFailure): this step sits mid-chain in
    // COURSE_BUILD/COURSE_REFRESH's "files" accumulator - a thrown failure
    // here would otherwise cascade to every later chain generator AND both
    // terminal deliverables (the Common Cartridge export and the course
    // zip). On a throw, the run loop republishes the incoming "files" it
    // received unchanged instead.
    passThroughOnFailure: { files: "files" },
    run: (values, helpers, onProgress) => runWeeklyGenerator(knowledgeChecksConfig, values, helpers, onProgress),
  },
];
