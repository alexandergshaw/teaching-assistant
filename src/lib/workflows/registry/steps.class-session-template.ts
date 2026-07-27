// Client-side step catalog: turns a saved class-session template into one
// week's complete package - a recent-events case study (from the research
// layer), a discussion board post about it, a hands-on assignment, and a quiz
// on the week's material - and, when asked, creates all four as UNPUBLISHED
// Canvas drafts.
//
// The no-code course and the codebase course share this ONE step: they differ
// only in the template's `variant`, which decides whether the assignment asks
// for a GitHub URL. Two parallel steps would drift apart.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  getArtifactTemplateAction,
  listCourseHubAction,
  findCaseStudyMaterialAction,
  generateAssignmentAction,
  generateTestQuestionsAction,
  createGradableAction,
  createQuizQuestionAction,
} from "@/app/actions";
import {
  type StepDefinition,
  resolveTileCurrentWeek,
  loadTileWeekTopic,
} from "@/lib/workflows/registry-helpers";
import {
  coerceClassSessionSpec,
  applyClassSessionOverrides,
  CLASS_SESSION_VARIANTS,
  type ClassSessionOverrides,
  TEST_QUESTION_KINDS,
} from "@/lib/artifact-templates/types";
import {
  emptyCourseProject,
  hasProject,
  milestoneBriefFor,
  renderMilestoneContract,
} from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";
import type { QuizAnswerInput } from "@/lib/canvas-modules/types";
import {
  sessionTitle,
  renderCaseStudy,
  renderDiscussionPrompt,
  renderSessionOverview,
  buildSessionAssignmentObjectives,
  buildSessionAssignmentContext,
  quizSectionsFor,
  type CaseStudyLike,
  type ClassSessionContext,
} from "@/lib/class-session-brief";

export const classSessionTemplateSteps: StepDefinition[] = [
  {
    type: "generate-class-session-from-template",
    name: "Generate a class session from a template",
    description:
      "Turn a saved class-session template into one week's complete package: a recent-events case study, a discussion board post about it, a hands-on assignment (a GitHub URL submission for a codebase course), and a quiz. Creates all four as UNPUBLISHED Canvas drafts when turned on.",
    inputs: [
      {
        key: "template",
        label: "Class session template",
        type: "classSessionTemplate",
        required: false,
        help: "Blank does nothing - so the step can sit in a kickoff workflow without forcing a template choice on every run.",
      },
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: true },
      {
        key: "topic",
        label: "Topic",
        type: "text",
        required: false,
        help: "Blank uses the course's current week topic.",
      },
      { key: "week", label: "Week", type: "number", required: false },
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
        help: "Creates the discussion, assignment, and quiz as UNPUBLISHED Canvas drafts for you to review before publishing.",
      },
    ],
    outputs: [
      { key: "sessionTitle", label: "Session title", type: "text" },
      { key: "overview", label: "Session overview", type: "longtext" },
      { key: "caseStudy", label: "Case study", type: "longtext" },
      { key: "discussion", label: "Discussion prompt", type: "longtext" },
      { key: "assignmentTitle", label: "Assignment title", type: "text" },
      { key: "discussionId", label: "Canvas discussion id", type: "text" },
      { key: "assignmentId", label: "Canvas assignment id", type: "text" },
      { key: "quizId", label: "Canvas quiz id", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const notes: string[] = [];

      const templateKey = String(values.template ?? "").trim();
      if (!templateKey) {
        return {
          outputs: {
            sessionTitle: "",
            overview: "",
            caseStudy: "",
            discussion: "",
            assignmentTitle: "",
            discussionId: "",
            assignmentId: "",
            quizId: "",
          },
          summary: { kind: "text", text: "No class session template selected - nothing generated." },
        };
      }

      // 1. Resolve the template. Fatal - there is nothing to generate from.
      onProgress("Loading the class session template...");
      const templateResult = await getArtifactTemplateAction(templateKey, "class-session");
      if ("error" in templateResult) {
        throw new Error(templateResult.error);
      }

      // 2. Load the course tile. A missing tile is NOT fatal: the package is
      // generated from the template alone and the Canvas drafts are skipped.
      const hubCourseId = String(values.hubCourse ?? "").trim();
      let tile: Course | undefined;
      if (!hubCourseId) {
        notes.push("No course tile selected - generated from the template alone.");
      } else {
        const list = await listCourseHubAction();
        if ("error" in list) {
          notes.push(`Could not load course tiles (${list.error}) - generated from the template alone.`);
        } else {
          tile = list.courses.find((c) => c.id === hubCourseId);
          if (!tile) notes.push("Course tile not found - generated from the template alone.");
        }
      }

      let week: number | null = null;
      const weekRaw = String(values.week ?? "").trim();
      if (weekRaw !== "" && Number.isFinite(Number(weekRaw))) {
        week = Number(weekRaw);
      } else if (tile) {
        const weekResolution = await resolveTileCurrentWeek(tile, helpers);
        if (!("skip" in weekResolution)) week = weekResolution.rawWeek;
      }

      let topic = String(values.topic ?? "").trim();
      if (!topic && tile && week !== null) {
        const weekTopic = await loadTileWeekTopic(tile, week, helpers);
        if ("skip" in weekTopic) {
          notes.push(`Could not resolve the week's topic (${weekTopic.skip}).`);
        } else {
          topic = weekTopic.topic;
        }
      }

      // Precedence: the template's own setting < the course's persisted
      // project < an explicit run override. Resolved BEFORE
      // applyClassSessionOverrides so that function's identity guarantee holds.
      const runMode = String(values.projectMode ?? "template").trim() || "template";
      const runDesc = String(values.projectDescription ?? "").trim();
      const courseProject = tile?.courseProject ?? emptyCourseProject();
      const overrides: ClassSessionOverrides = {
        projectMode:
          runMode !== "template"
            ? (runMode as ClassSessionOverrides["projectMode"])
            : hasProject(courseProject)
              ? "course-long"
              : "template",
        activitySource: (String(values.activitySource ?? "template").trim() ||
          "template") as ClassSessionOverrides["activitySource"],
        setupBurden: (String(values.setupBurden ?? "template").trim() ||
          "template") as ClassSessionOverrides["setupBurden"],
        projectDescription: runDesc || courseProject.definition,
      };

      const spec = applyClassSessionOverrides(
        coerceClassSessionSpec(templateResult.template.spec),
        overrides
      );

      const milestone = week !== null ? milestoneBriefFor(courseProject, week) : null;
      if (hasProject(courseProject) && !milestone) {
        notes.push("The course project has no milestone for this week.");
      }

      const ctx: ClassSessionContext = {
        courseName: tile?.name ?? "",
        topic,
        weekLabel: week ? `Week ${week}` : "",
        milestone,
      };
      const title = sessionTitle(ctx);

      // 3. Case study. A failure is a NOTE: the rest of the package is still
      // worth producing without it, and the research layer legitimately finds
      // nothing for some topics.
      let caseStudy: CaseStudyLike | null = null;
      if (spec.includeCaseStudy) {
        if (!topic) {
          notes.push("Case study skipped - no topic could be resolved to search on.");
        } else {
          onProgress("Researching a recent case study...");
          try {
            const found = await findCaseStudyMaterialAction(topic);
            if ("error" in found) {
              notes.push(`Case study search failed: ${found.error}`);
            } else if (!found.material) {
              notes.push(`No recent case study was found for "${topic}".`);
            } else {
              caseStudy = found.material;
            }
          } catch (err) {
            notes.push(`Case study search failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      const caseStudyText = caseStudy ? renderCaseStudy(caseStudy, ctx) : "";
      const discussionText = renderDiscussionPrompt(spec, ctx, caseStudy);
      const overview = renderSessionOverview(spec, ctx, caseStudy);

      // 4. The hands-on assignment. Fatal - it is the core of the package.
      onProgress("Generating the hands-on assignment...");
      const generated = await generateAssignmentAction(
        buildSessionAssignmentObjectives(spec, ctx),
        buildSessionAssignmentContext(spec, ctx, caseStudy, overrides),
        [],
        helpers.provider
      );
      if ("error" in generated) {
        throw new Error(generated.error);
      }

      // 5. The quiz. A failure is a NOTE - the other three legs still shipped.
      const sections = quizSectionsFor(spec);
      let quizQuestions: Array<{
        kind: (typeof TEST_QUESTION_KINDS)[number]["value"];
        prompt: string;
        choices: string[];
        answer: string;
        points: number;
      }> = [];
      if (sections.length > 0) {
        onProgress("Generating the quiz...");
        const quizResult = await generateTestQuestionsAction(
          `Topic: ${topic}`,
          // The quiz keeps its own hand-rolled context rather than being
          // routed through buildTestContext: a QuizSpec is not a TestSpec, and
          // synthesizing one would inject the aptitude and format contracts
          // and change quiz output far beyond the milestone.
          [
            `Quiz for ${title}. Cover only this week's material.`,
            milestone ? renderMilestoneContract(milestone) : "",
          ]
            .filter(Boolean)
            .join("\n"),
          sections,
          helpers.provider
        );
        if ("error" in quizResult) {
          notes.push(`Quiz generation failed: ${quizResult.error}`);
        } else {
          quizQuestions = quizResult.questions;
        }
      }

      // 6. Canvas drafts. Every item is created UNPUBLISHED; nothing here
      // publishes. A failure on any one leg is a note, never a throw.
      const postToCanvas = String(values.postToCanvas ?? "") === "1";
      const canvasUrl = (tile?.canvasUrl ?? "").trim();
      const variant = CLASS_SESSION_VARIANTS.find((v) => v.value === spec.variant);
      let discussionId = "";
      let assignmentId = "";
      let quizId = "";

      if (postToCanvas && !canvasUrl) {
        notes.push("Canvas drafts skipped - the course tile has no Canvas URL.");
      } else if (postToCanvas) {
        const acronym = helpers.activeInstitution || undefined;

        onProgress("Creating the Canvas discussion draft...");
        const discussionResult = await createGradableAction(
          canvasUrl,
          "Discussion",
          { title: `Discussion: ${title}`, description: discussionText, pointsPossible: spec.discussion.points },
          acronym
        );
        if ("error" in discussionResult) {
          notes.push(`Canvas discussion draft failed: ${discussionResult.error}`);
        } else {
          discussionId = String(discussionResult.id);
        }

        onProgress("Creating the Canvas assignment draft...");
        const assignmentResult = await createGradableAction(
          canvasUrl,
          "Assignment",
          {
            title: generated.title,
            description: generated.overview,
            pointsPossible: spec.assignment.points,
            // The variant decides this: a codebase course's students submit
            // the URL of their GitHub repository.
            submissionType: variant?.submissionType ?? "online_text_entry",
          },
          acronym
        );
        if ("error" in assignmentResult) {
          notes.push(`Canvas assignment draft failed: ${assignmentResult.error}`);
        } else {
          assignmentId = String(assignmentResult.id);
        }

        if (quizQuestions.length > 0) {
          onProgress("Creating the Canvas quiz draft...");
          const quizResult = await createGradableAction(
            canvasUrl,
            "Quiz",
            { title: `Quiz: ${title}`, description: `Quiz on ${topic || title}.` },
            acronym
          );
          if ("error" in quizResult) {
            notes.push(`Canvas quiz draft failed: ${quizResult.error}`);
          } else {
            quizId = String(quizResult.id);
            let failures = 0;
            for (const q of quizQuestions) {
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
                const created = await createQuizQuestionAction(
                  canvasUrl,
                  quizResult.id,
                  { name: q.prompt.slice(0, 80), text: q.prompt, type: canvasType, points: q.points, answers },
                  acronym
                );
                if ("error" in created) failures += 1;
              } catch {
                failures += 1;
              }
            }
            if (failures > 0) {
              notes.push(`${failures} of ${quizQuestions.length} quiz question(s) failed to create.`);
            }
          }
        }

        if (discussionId || assignmentId || quizId) {
          notes.push(
            "Created UNPUBLISHED Canvas drafts - review and publish them from Canvas when ready."
          );
        }
      }

      return {
        outputs: {
          sessionTitle: title,
          overview,
          caseStudy: caseStudyText,
          discussion: discussionText,
          assignmentTitle: generated.title,
          discussionId,
          assignmentId,
          quizId,
        },
        summary: {
          kind: "list",
          label: `Class session generated: ${title}`,
          items: notes.length > 0 ? notes : ["Case study, discussion, assignment, and quiz generated."],
        },
      };
    },
  },
];
