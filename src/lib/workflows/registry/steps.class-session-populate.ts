// Client-side step catalog: run a class-session template across every week of
// a course, filling an LMS course with each week's case study, discussion,
// hands-on assignment, and quiz as UNPUBLISHED drafts.
//
// This is the step a course kickoff wires in. It is separate from the
// single-week step (steps.class-session-template.ts) because the two have
// genuinely different shapes: this one takes a week RANGE, reports per-week
// outcomes, and must survive one bad week without abandoning the course. Both
// build each week from the SAME pure helpers in class-session-brief.ts, so the
// single-week package and the populated course can never diverge.
import {
  getArtifactTemplateAction,
  listCourseHubAction,
  findCaseStudyMaterialAction,
  generateAssignmentAction,
  generateTestQuestionsAction,
  createGradableAction,
  createQuizQuestionAction,
} from "@/app/actions";
import { type StepDefinition, loadTileWeekTopic } from "@/lib/workflows/registry-helpers";
import {
  coerceClassSessionSpec,
  applyClassSessionOverrides,
  CLASS_SESSION_VARIANTS,
  type ClassSessionOverrides,
  TEST_QUESTION_KINDS,
} from "@/lib/artifact-templates/types";
import type { QuizAnswerInput } from "@/lib/canvas-modules/types";
import {
  sessionTitle,
  renderDiscussionPrompt,
  buildSessionAssignmentObjectives,
  buildSessionAssignmentContext,
  quizSectionsFor,
  type CaseStudyLike,
  type ClassSessionContext,
} from "@/lib/class-session-brief";

export const classSessionPopulateSteps: StepDefinition[] = [
  {
    type: "populate-lms-from-class-template",
    name: "Populate an LMS course from a class session template",
    description:
      "Run a class-session template across every week of the course, creating each week's case study, discussion, hands-on assignment, and quiz as UNPUBLISHED Canvas drafts. This is the step a course kickoff uses to fill an LMS course from one template.",
    inputs: [
      {
        key: "template",
        label: "Class session template",
        type: "classSessionTemplate",
        required: false,
        help: "Blank does nothing - so the step can sit in a kickoff workflow without forcing a template choice on every run.",
      },
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: true },
      { key: "fromWeek", label: "First week", type: "number", required: false, help: "Defaults to week 1." },
      {
        key: "toWeek",
        label: "Last week",
        type: "number",
        required: false,
        help: "Defaults to the course's week count.",
      },
      {
        key: "projectMode",
        label: "Semester-long project",
        type: "text",
        required: false,
        options: [
          "template",
          "none",
          "course-long",
        ],
        help: "Overrides the template's own setting for this run.",
      },
      {
        key: "projectDescription",
        label: "Semester project description",
        type: "text",
        required: false,
        help: "Used when you turn the project on and the template has none.",
      },
      {
        key: "activitySource",
        label: "Where hands-on activities come from",
        type: "text",
        required: false,
        options: [
          "template",
          "textbook",
          "course-repo",
          "instructor-materials",
          "web-research",
        ],
      },
      {
        key: "setupBurden",
        label: "Instructor setup",
        type: "text",
        required: false,
        options: [
          "template",
          "professor-setup",
          "out-of-box",
        ],
      },
      {
        key: "postToCanvas",
        label: "Create Canvas drafts",
        type: "boolean",
        required: false,
        help: "Creates each week's items as UNPUBLISHED Canvas drafts for you to review before publishing.",
      },
    ],
    outputs: [
      { key: "weeksPopulated", label: "Weeks populated", type: "number" },
      { key: "outline", label: "Course outline", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const notes: string[] = [];

      const templateKey = String(values.template ?? "").trim();
      if (!templateKey) {
        return {
          outputs: { weeksPopulated: 0, outline: "" },
          summary: { kind: "text", text: "No class session template selected - nothing generated." },
        };
      }

      onProgress("Loading the class session template...");
      const templateResult = await getArtifactTemplateAction(templateKey, "class-session");
      if ("error" in templateResult) {
        throw new Error(templateResult.error);
      }
      // The run's course-design choices. Every field defaults to "template",
      // so a run that sets none of them produces exactly what the template
      // stored - which is why they are overrides rather than spec fields.
      const overrides: ClassSessionOverrides = {
        projectMode: (String(values.projectMode ?? "template").trim() ||
          "template") as ClassSessionOverrides["projectMode"],
        activitySource: (String(values.activitySource ?? "template").trim() ||
          "template") as ClassSessionOverrides["activitySource"],
        setupBurden: (String(values.setupBurden ?? "template").trim() ||
          "template") as ClassSessionOverrides["setupBurden"],
        projectDescription: String(values.projectDescription ?? "").trim(),
      };

      const spec = applyClassSessionOverrides(
        coerceClassSessionSpec(templateResult.template.spec),
        overrides
      );

      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) throw new Error("Choose a course tile.");
      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) throw new Error("Course tile not found.");

      const numeric = (raw: unknown): number | null => {
        const text = String(raw ?? "").trim();
        return text !== "" && Number.isFinite(Number(text)) ? Number(text) : null;
      };

      const fromWeek = Math.max(1, numeric(values.fromWeek) ?? 1);
      // Without a week count there is no defensible range to invent, so the
      // step reports why it stopped rather than guessing one and filling the
      // course with the wrong number of weeks.
      const toWeek = numeric(values.toWeek) ?? tile.weeks;
      if (toWeek === null) {
        return {
          outputs: { weeksPopulated: 0, outline: "" },
          summary: {
            kind: "text",
            text: "Set the course's week count (or the Last week input) before populating - there is no range to run over.",
          },
        };
      }
      if (toWeek < fromWeek) {
        throw new Error(`Last week (${toWeek}) is before the first week (${fromWeek}).`);
      }

      const postToCanvas = String(values.postToCanvas ?? "") === "1";
      const canvasUrl = (tile.canvasUrl ?? "").trim();
      if (postToCanvas && !canvasUrl) {
        notes.push("Canvas drafts skipped - the course tile has no Canvas URL.");
      }
      const acronym = helpers.activeInstitution || undefined;
      const variant = CLASS_SESSION_VARIANTS.find((v) => v.value === spec.variant);

      const outlineLines: string[] = [`# ${tile.name} - weekly plan`, ""];
      let populated = 0;

      for (let week = fromWeek; week <= toWeek; week++) {
        onProgress(`Week ${week} of ${toWeek}...`);

        let topic = "";
        const weekTopic = await loadTileWeekTopic(tile, week, helpers);
        if ("skip" in weekTopic) {
          notes.push(`Week ${week}: could not resolve a topic (${weekTopic.skip}).`);
        } else {
          topic = weekTopic.topic;
        }

        const ctx: ClassSessionContext = { courseName: tile.name, topic, weekLabel: `Week ${week}` };
        const title = sessionTitle(ctx);

        let caseStudy: CaseStudyLike | null = null;
        if (spec.includeCaseStudy && topic) {
          try {
            const found = await findCaseStudyMaterialAction(topic);
            if (!("error" in found) && found.material) caseStudy = found.material;
          } catch {
            // A missing case study degrades that one week; the rest of the
            // package is still worth creating.
          }
        }

        // A failure on one week must never abandon the remaining weeks, so the
        // per-week body is guarded and recorded rather than thrown.
        try {
          const generated = await generateAssignmentAction(
            buildSessionAssignmentObjectives(spec, ctx),
            buildSessionAssignmentContext(spec, ctx, caseStudy, overrides),
            [],
            helpers.provider
          );
          if ("error" in generated) {
            notes.push(`Week ${week}: assignment generation failed (${generated.error}).`);
            continue;
          }

          outlineLines.push(`## ${title}`);
          if (caseStudy) outlineLines.push(`- Case study: ${caseStudy.title}`);
          outlineLines.push(`- Discussion: ${spec.discussion.points} point(s)`);
          outlineLines.push(`- Assignment: ${generated.title} (${spec.assignment.points} point(s))`);
          outlineLines.push(`- Quiz: ${Math.floor(spec.quiz.questionCount)} question(s)`);
          outlineLines.push("");

          if (postToCanvas && canvasUrl) {
            const discussionResult = await createGradableAction(
              canvasUrl,
              "Discussion",
              {
                title: `Discussion: ${title}`,
                description: renderDiscussionPrompt(spec, ctx, caseStudy),
                pointsPossible: spec.discussion.points,
              },
              acronym
            );
            if ("error" in discussionResult) {
              notes.push(`Week ${week}: discussion draft failed (${discussionResult.error}).`);
            }

            const assignmentResult = await createGradableAction(
              canvasUrl,
              "Assignment",
              {
                title: generated.title,
                description: generated.overview,
                pointsPossible: spec.assignment.points,
                // The variant decides this: a codebase course's students
                // submit the URL of their GitHub repository.
                submissionType: variant?.submissionType ?? "online_text_entry",
              },
              acronym
            );
            if ("error" in assignmentResult) {
              notes.push(`Week ${week}: assignment draft failed (${assignmentResult.error}).`);
            }

            const sections = quizSectionsFor(spec);
            if (sections.length > 0) {
              const quizResult = await generateTestQuestionsAction(
                `Topic: ${topic}`,
                `Quiz for ${title}. Cover only this week's material.`,
                sections,
                helpers.provider
              );
              if ("error" in quizResult) {
                notes.push(`Week ${week}: quiz generation failed (${quizResult.error}).`);
              } else {
                const created = await createGradableAction(
                  canvasUrl,
                  "Quiz",
                  { title: `Quiz: ${title}`, description: `Quiz on ${topic || title}.` },
                  acronym
                );
                if ("error" in created) {
                  notes.push(`Week ${week}: quiz draft failed (${created.error}).`);
                } else {
                  let failures = 0;
                  for (const q of quizResult.questions) {
                    const canvasType =
                      TEST_QUESTION_KINDS.find((k) => k.value === q.kind)?.canvasType ?? "essay_question";
                    const answers: QuizAnswerInput[] =
                      q.kind === "multiple_choice"
                        ? q.choices.map((choice) => ({ text: choice, correct: choice === q.answer }))
                        : q.kind === "true_false"
                          ? [
                              { text: "True", correct: /^true$/i.test(q.answer.trim()) },
                              { text: "False", correct: /^false$/i.test(q.answer.trim()) },
                            ]
                          : q.kind === "short_answer"
                            ? [{ text: q.answer, correct: true }]
                            : [];
                    try {
                      const madeQuestion = await createQuizQuestionAction(
                        canvasUrl,
                        created.id,
                        { name: q.prompt.slice(0, 80), text: q.prompt, type: canvasType, points: q.points, answers },
                        acronym
                      );
                      if ("error" in madeQuestion) failures += 1;
                    } catch {
                      failures += 1;
                    }
                  }
                  if (failures > 0) {
                    notes.push(
                      `Week ${week}: ${failures} of ${quizResult.questions.length} quiz question(s) failed to create.`
                    );
                  }
                }
              }
            }
          }

          populated++;
        } catch (err) {
          notes.push(`Week ${week}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (postToCanvas && canvasUrl && populated > 0) {
        notes.push("Every Canvas item created is an UNPUBLISHED draft - review and publish from Canvas.");
      }

      return {
        outputs: { weeksPopulated: populated, outline: outlineLines.join("\n").trim() },
        summary: {
          kind: "list",
          label: `Populated ${populated} of ${toWeek - fromWeek + 1} week(s)`,
          items: notes.length > 0 ? notes : [`Weeks ${fromWeek}-${toWeek} generated.`],
        },
      };
    },
  },
];
