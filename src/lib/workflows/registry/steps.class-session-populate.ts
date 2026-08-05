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
import {
  emptyCourseProject,
  hasProject,
  milestoneBriefFor,
  renderMilestoneContract,
  type CourseProject,
} from "@/lib/course-project";
import type { CourseKind } from "@/lib/course-kind";
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
// Canvas-only guard, shared with lms-wipe/lms-modules/lms-populate/
// lms-assignments (docs/REGRESSION.md entry 217) and
// integrate-source-into-lms (steps.lms-integrations.ts). Only the
// tile-shaped helper is used here: this step already has the resolved tile
// in hand (see `tile` below), so resolveTileLms's id-lookup wrapper would
// cost a redundant network call.
import {
  resolveLmsFromTile,
  isCanvasLms,
  canvasOnlySkipText,
} from "@/lib/workflows/registry/lms-target-guard";

/**
 * Resolve one run's `projectMode`/`projectDescription` inputs against the
 * course tile's persisted project. Precedence: the template's own setting <
 * the course's persisted project < an explicit run override.
 *   - `values.projectMode` left blank/"template" (the only value COURSE_BUILD
 *     could ever supply before its own bindings were fixed - see
 *     presets/course-build.ts) defers entirely: a persisted course-long
 *     project (hasProject(courseProject) true) silently promotes the run to
 *     "course-long" - the bridge between the class-session template's own
 *     project fields and the course-long project system; with no persisted
 *     project it stays "template", a no-op (applyClassSessionOverrides,
 *     artifact-templates/types.ts, returns the spec unchanged).
 *   - `values.projectMode` set to "none" or "course-long" is an EXPLICIT run
 *     override and always wins outright, regardless of what the tile carries
 *     - this is the one case the auto-promotion above cannot express: turning
 *     the project off for one populate run even though the tile has one, or
 *     forcing it on with this run's own description.
 *   - `values.projectDescription`, when non-blank, always wins over the
 *     persisted project's own description. It is otherwise carried through
 *     unused unless projectMode resolves to "course-long" -
 *     applyClassSessionOverrides ignores it for "template"/"none".
 * Exported so this precedence rule is directly unit-testable without
 * exercising the rest of run() (template/LLM/Canvas calls) - see this
 * module's own test file.
 */
export function resolveClassSessionProjectOverrides(
  values: { projectMode?: unknown; projectDescription?: unknown },
  courseProject: CourseProject
): Pick<ClassSessionOverrides, "projectMode" | "projectDescription"> {
  const runMode = String(values.projectMode ?? "template").trim() || "template";
  const runDesc = String(values.projectDescription ?? "").trim();
  return {
    projectMode:
      runMode !== "template"
        ? (runMode as ClassSessionOverrides["projectMode"])
        : hasProject(courseProject)
          ? "course-long"
          : "template",
    projectDescription: runDesc || courseProject.definition,
  };
}

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
        // The old help text ("Overrides the template's own setting for this
        // run") was true of "none" and "course-long" and FALSE of "template",
        // which is the option a reader is most likely to pick expecting it to
        // do something. "template" is a restated default, not an override:
        // resolveClassSessionProjectOverrides above treats it identically to
        // an unset value, INCLUDING the auto-promotion to "course-long" when
        // the tile already carries a saved project - so picking it can switch
        // the project ON, the opposite of what "use the template's setting"
        // sounds like. Only "none" and "course-long" actually force anything.
        // Text, not behaviour, was changed here: the resolution rule and its
        // pinning test (see this module's test file) are deliberately intact.
        help: 'Only "none" and "course-long" force anything. "template" is the same as leaving this blank: the course tile\'s saved project still wins if it has one, which can turn the project on.',
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

      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) throw new Error("Choose a course tile.");
      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) throw new Error("Course tile not found.");

      // Precedence: the template's own setting < the course's persisted
      // project < an explicit run override - see
      // resolveClassSessionProjectOverrides's own doc comment for the full
      // rule. Resolving here, BEFORE applyClassSessionOverrides, keeps that
      // function's identity guarantee (an all-default override returns the
      // same object) intact.
      const courseProject = tile?.courseProject ?? emptyCourseProject();
      const overrides: ClassSessionOverrides = {
        ...resolveClassSessionProjectOverrides(values, courseProject),
        activitySource: (String(values.activitySource ?? "template").trim() ||
          "template") as ClassSessionOverrides["activitySource"],
        setupBurden: (String(values.setupBurden ?? "template").trim() ||
          "template") as ClassSessionOverrides["setupBurden"],
      };

      // Built only now, because the resolution above needs the tile's project.
      const spec = applyClassSessionOverrides(
        coerceClassSessionSpec(templateResult.template.spec),
        overrides
      );


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
      // Canvas-only guard (docs/REGRESSION.md entry 217/218's pattern),
      // applied to ONLY the Canvas-posting branch below - deliberately NOT a
      // whole-step skip the way integrate-source-into-lms's guard is
      // (steps.lms-integrations.ts). This step's real value is the per-week
      // LLM generation and the local outline it builds, both of which are
      // fully usable on any LMS; only the createGradableAction /
      // createQuizQuestionAction calls inside the per-week loop are
      // Canvas-specific. Before this guard, a Blackboard course (whose
      // canvasUrl is NON-BLANK - entry 218: the DB column is canvas_url and
      // holds Blackboard URLs too, so the `!canvasUrl` check above can never
      // catch it) ran the full LLM generation for every week, then threw
      // inside the per-week try/catch when the Canvas call rejected the
      // non-Canvas URL ("Expected a link like .../courses/123") - which
      // skipped `populated++` (it sits AFTER the Canvas block) and reported
      // weeksPopulated: 0 despite a fully generated outline, plus one
      // cryptic note per week. Resolving `canPostToCanvas` once here and
      // gating only the Canvas block on it keeps every week's generation and
      // the outline intact, and reports an honest non-zero weeksPopulated.
      // Resolved ONLY when the answer can change something: with no Canvas
      // post requested, or no URL at all, canPostToCanvas is already false
      // and the note below cannot fire, so resolving would be pure cost.
      // resolveLmsFromTile falls back to a getInstitutionFields fetch when
      // the tile carries no `lms` of its own, and entry 217 established that
      // this guard must add nothing to the path it does not change.
      const tileLms = postToCanvas && canvasUrl ? await resolveLmsFromTile(tile, helpers) : "";
      const canPostToCanvas = postToCanvas && !!canvasUrl && isCanvasLms(tileLms);
      if (postToCanvas && canvasUrl && !isCanvasLms(tileLms)) {
        notes.push(canvasOnlySkipText(tileLms));
      }
      const acronym = helpers.activeInstitution || undefined;
      const variant = CLASS_SESSION_VARIANTS.find((v) => v.value === spec.variant);
      // The template variant IS the course type, so no separate input is needed.
      const courseKind: CourseKind = spec.variant === "no-code" ? "applied" : "coding";

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

        const milestone = milestoneBriefFor(courseProject, week);
        const ctx: ClassSessionContext = {
          courseName: tile.name,
          topic,
          weekLabel: `Week ${week}`,
          milestone,
        };
        if (hasProject(courseProject) && !milestone) {
          // The week still generates, but with no project context at all - so
          // a gap in the plan must be visible rather than silent.
          notes.push(`Week ${week}: the course project has no milestone for this week.`);
        }
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
            helpers.provider,
            courseKind
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

          if (canPostToCanvas) {
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

      if (canPostToCanvas && populated > 0) {
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
