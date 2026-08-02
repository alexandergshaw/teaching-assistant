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
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  type KnowledgeCheckQuestion,
  listCourseHubAction,
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
import type { GeneratedCourseFile, EnsuredModule } from "@/lib/workflows/types";
import type { Course } from "@/lib/supabase/courses";
import { buildDocxFromPlainText } from "@/lib/docx";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { resolveCourseKind } from "@/lib/course-kind";
import { stripModelUrls } from "@/lib/urls";
import { PARTIAL_FAILURE_OUTPUT_KEY } from "@/lib/workflows/run-logging";
import { gatherWeekMaterials, isNonTransientQuotaRefusal } from "./steps.weekly-announcements";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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

export const knowledgeCheckSteps: StepDefinition[] = [
  {
    type: "generate-knowledge-checks",
    name: "Generate weekly knowledge checks",
    description:
      "Build a short, auto-gradable knowledge check for every week in the schedule - 5 to 8 Apply/Analyze-level multiple-choice questions grounded in that week's ACTUAL generated module materials (objectives, deck, opener, assignment), each with a one-sentence explanation of why every wrong answer is wrong. Ships as a Word document in that week's zip folder, and optionally as a real Canvas quiz placed in that week's module.",
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
        help: "When bound, the Canvas quiz is placed in that week's module.",
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
      },
    ],
    outputs: [
      { key: "files", label: "Course files", type: "files" },
      { key: "checkCount", label: "Knowledge checks generated", type: "number" },
      { key: "report", label: "Report", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      const incoming = (values.files as GeneratedCourseFile[] | undefined) ?? [];

      if (schedule.length === 0) {
        return {
          outputs: { files: incoming, checkCount: 0, report: "No schedule provided." },
          summary: { kind: "text", text: "Skipped - no schedule was provided." },
        };
      }

      const courseKind = resolveCourseKind(values.courseKind);
      const postToLms = String(values.postToLms ?? "") === "1";
      const modules = Array.isArray(values.modules) ? (values.modules as EnsuredModule[]) : [];

      const hubCourseId = String(values.hubCourse ?? "").trim();
      let tile: Course | undefined;
      if (hubCourseId) {
        const list = await listCourseHubAction();
        if (!("error" in list)) tile = list.courses.find((c) => c.id === hubCourseId);
      }

      const courseUrl = (tile?.canvasUrl ?? "").trim();
      const acronym = tile?.institution || helpers.activeInstitution || undefined;

      const files: GeneratedCourseFile[] = [];
      const reportLines: string[] = [];

      onProgress("Composing weekly knowledge checks from each week's module materials...");

      // Mirrors generate-weekly-announcements' own U7-AC1/AC2 accounting:
      // incremented only for a week that did NOT get a knowledge check
      // because something actually went wrong, never for a week skipped for
      // having no generated materials to ground in (an expected data gap,
      // not a failure).
      let failedWeekCount = 0;
      let quotaStoppedAtWeek: number | null = null;

      for (let scheduleIndex = 0; scheduleIndex < schedule.length; scheduleIndex++) {
        const week = schedule[scheduleIndex];
        const weekNumber = week.week;
        const topic = (week.topic ?? "").trim();

        const materials = gatherWeekMaterials(incoming, weekNumber);
        if (!materials.trim()) {
          reportLines.push(`Week ${weekNumber}: skipped - no generated module materials found for this week.`);
          continue;
        }

        try {
          onProgress(`Composing the Week ${weekNumber} knowledge check...`);
          const generated = await generateKnowledgeCheckAction(
            `Week ${weekNumber}`,
            topic,
            materials,
            helpers.provider,
            courseKind
          );

          if ("error" in generated) {
            // Same non-transient-quota short-circuit generate-weekly-
            // announcements uses (U7-AC1): a spend-cap/billing refusal cannot
            // recover inside this run, so stop issuing further calls instead
            // of working through every remaining week one doomed call at a
            // time.
            if (isNonTransientQuotaRefusal(generated.error)) {
              const notAttempted = schedule.length - scheduleIndex - 1;
              quotaStoppedAtWeek = weekNumber;
              failedWeekCount += 1 + notAttempted;
              reportLines.push(
                `Stopped after week ${weekNumber} - the LLM quota was exhausted; ${notAttempted} week(s) not attempted.`
              );
              break;
            }
            failedWeekCount += 1;
            reportLines.push(`Week ${weekNumber}: error - ${generated.error}`);
            continue;
          }

          // No model-authored URL ever reaches the document or the LMS
          // (stripModelUrls convention). Stripping can hollow out a field, so
          // every question is re-validated against the SAME usability check
          // the action itself applies, rather than trusting the pre-strip
          // shape.
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
            failedWeekCount += 1;
            reportLines.push(`Week ${weekNumber}: error - could not produce enough usable questions after cleanup.`);
            continue;
          }

          const title = `Week ${weekNumber} Knowledge Check${topic ? `: ${topic}` : ""}`;
          const pageText = renderKnowledgeCheckDocument(title, questions);
          const docxBuffer = await buildDocxFromPlainText(pageText, [], helpers.author);
          const fileName = buildWorkflowFileName({
            course: tile ?? null,
            artifact: "Knowledge Check",
            qualifier: topic || `Week ${weekNumber}`,
            ext: "docx",
          });

          files.push({
            name: fileName,
            blob: new Blob([docxBuffer], { type: DOCX_MIME }),
            mimeType: DOCX_MIME,
            weekNumber,
            // Sits right after the Test slot (5) and before the weekly
            // announcement (6) - see GeneratedCourseFile's own sortOrder
            // doc comment (types.ts) for the fractional-insertion convention
            // this follows (Objectives already does the same thing at 0.5).
            sortOrder: 5.5,
            role: "supplement",
            pageText,
          });

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
                    description:
                      "Check your understanding of this week's material. Review the explanations for any question you miss.",
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

                  const published = await bulkUpdateAction(
                    courseUrl,
                    "Quiz",
                    [String(created.id)],
                    { published: true },
                    acronym
                  );
                  const publishNote = "error" in published ? `; publish failed - ${published.error}` : "";

                  let placementNote = "; not placed in a module (no module for this week)";
                  const targetModule = modules.find((m) => m.week === weekNumber);
                  if (targetModule) {
                    const linked = await createModuleItemAction(
                      courseUrl,
                      targetModule.id,
                      { type: "Quiz", contentId: created.id, title },
                      acronym
                    );
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

          reportLines.push(
            `Week ${weekNumber}${topic ? ` (${topic})` : ""}: generated ${questions.length} question(s) - ${postNote}`
          );
        } catch (err) {
          failedWeekCount += 1;
          reportLines.push(`Week ${weekNumber}: error - ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }

      const report = reportLines.join("\n");

      const partialFailureDetail =
        failedWeekCount > 0
          ? quotaStoppedAtWeek !== null
            ? `The LLM quota was exhausted after week ${quotaStoppedAtWeek}; ${failedWeekCount} of ${schedule.length} week(s) did not get a knowledge check.`
            : `${failedWeekCount} of ${schedule.length} week(s) failed to generate a knowledge check - see this step's own report for detail.`
          : null;

      if (files.length === 0) {
        return {
          outputs: {
            files: incoming,
            checkCount: 0,
            report,
            ...(partialFailureDetail ? { [PARTIAL_FAILURE_OUTPUT_KEY]: partialFailureDetail } : {}),
          },
          summary: { kind: "text", text: report || "No weekly knowledge checks were generated." },
        };
      }

      return {
        outputs: {
          files: [...incoming, ...files],
          checkCount: files.length,
          report,
          ...(partialFailureDetail ? { [PARTIAL_FAILURE_OUTPUT_KEY]: partialFailureDetail } : {}),
        },
        summary: {
          kind: "list",
          label: `Generated ${files.length} weekly knowledge check(s)`,
          items: reportLines,
        },
      };
    },
  },
];
