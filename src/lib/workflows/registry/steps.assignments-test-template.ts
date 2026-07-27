// Client-side step catalog: turns a saved test template into real artifacts -
// a student-facing test (.docx) with an optional answer key and study guide,
// essay grading guidance when the spec has essay questions, and (optionally)
// an UNPUBLISHED Canvas quiz draft with real quiz questions.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  getArtifactTemplateAction,
  listCourseHubAction,
  generateTestQuestionsAction,
  generateAssignmentRubricAction,
  createGradableAction,
  createQuizQuestionAction,
  saveLibraryFileAction,
} from "@/app/actions";
import {
  type StepDefinition,
  blobToBase64,
  resolveTileCurrentWeek,
  loadTileWeekTopic,
} from "@/lib/workflows/registry-helpers";
import { buildDocxFromPlainText } from "@/lib/docx";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import {
  coerceTestSpec,
  testTotalPoints,
  TEST_MODES,
  TEST_QUESTION_KINDS,
  type TestMode,
} from "@/lib/artifact-templates/types";
import { milestoneBriefFor } from "@/lib/course-project";
import { resolveCourseKind } from "@/lib/course-kind";
import type { Course } from "@/lib/supabase/courses";
import type { QuizAnswerInput } from "@/lib/canvas-modules/types";
import {
  buildTestObjectives,
  buildTestContext,
  renderTestDocument,
  renderTestAnswerKey,
  renderTestStudyGuide,
  type TestBriefContext,
} from "@/lib/test-brief";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const assignmentTestTemplateSteps: StepDefinition[] = [
  {
    type: "generate-test-from-template",
    name: "Generate a test from a template",
    description:
      "Turn a saved test template into a student-facing test (.docx) - with an optional answer key and study guide - and, when turned on, an UNPUBLISHED Canvas quiz draft with real questions for you to review before publishing.",
    inputs: [
      {
        key: "template",
        label: "Test template",
        type: "testTemplate",
        required: false,
        help: "Blank does nothing - so the step can sit in Course Refresh without forcing a template choice on every run.",
      },
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: true },
      {
        key: "courseKind",
        label: "Course type",
        type: "text",
        required: false,
        options: ["coding", "applied"],
        help: "\"applied\" is a no-code course (project management, business, ethics): nothing generated may involve reading, writing, or running code.",
      },
      {
        key: "files",
        label: "Course files so far",
        type: "files",
        required: false,
        help: "Files generated earlier in the run. This document is appended to them, so a later LMS step can post everything in one pass.",
      },
      {
        key: "topic",
        label: "Topic",
        type: "text",
        required: false,
        help: "Blank uses the course's current week topic.",
      },
      { key: "week", label: "Week", type: "number", required: false },
      {
        key: "postToCanvas",
        label: "Create a Canvas quiz draft",
        type: "boolean",
        required: false,
        help: "Creates an UNPUBLISHED Canvas quiz draft with real questions for you to review before publishing.",
      },
      {
        key: "mode",
        label: "Hands-on or written",
        type: "text",
        required: false,
        options: ["template", "written", "project-based"],
        help: "Overrides the template's own setting for this run. A project-based test asks students to redo the motions their project has already required of them.",
      },
      {
        key: "pointsPossible",
        label: "Points possible",
        type: "number",
        required: false,
        help: "Overrides the template's own point total.",
      },
    ],
    outputs: [
      { key: "files", label: "Course files", type: "files" },
      { key: "testName", label: "Test file name", type: "text" },
      { key: "testTitle", label: "Test title", type: "text" },
      { key: "canvasId", label: "Canvas quiz id", type: "text" },
      { key: "answerKey", label: "Answer key", type: "longtext" },
      { key: "questionCount", label: "Question count", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const notes: string[] = [];

      // 1. Resolve the template. A template that cannot be resolved is fatal -
      // there is nothing to generate from.
      const templateKey = String(values.template ?? "").trim();

      // No template selected is a deliberate no-op, not an error: this step is
      // appended to COURSE_REFRESH, and a required template there would force
      // every refresh run to pick one. Mirrors how generate-syllabus reports
      // success when it decides to leave an existing syllabus alone.
      if (!templateKey) {
        return {
          outputs: {
            files: (values.files as GeneratedCourseFile[] | undefined) ?? [],
            testName: "",
            testTitle: "",
            canvasId: "",
            answerKey: "",
            questionCount: 0,
          },
          summary: {
            kind: "text",
            text: "No test template selected - nothing generated.",
          },
        };
      }

      onProgress("Loading the test template...");
      const templateResult = await getArtifactTemplateAction(templateKey, "test");
      if ("error" in templateResult) {
        throw new Error(templateResult.error);
      }
      const stored = coerceTestSpec(templateResult.template.spec);

      // "template" (or anything unrecognized) leaves the template's own mode
      // alone, so a run that does not set this changes nothing.
      const modeOverride = String(values.mode ?? "").trim();
      const spec = TEST_MODES.some((m) => m.value === modeOverride)
        ? { ...stored, mode: modeOverride as TestMode }
        : stored;

      // 2. Load the course tile. Unlike template resolution, a missing/
      // unresolvable tile is NOT fatal: the test document is generated from
      // the template alone, and tile-dependent extras (auto topic, course-tile
      // filing, the Canvas draft) are skipped with a note.
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
          if (!tile) {
            notes.push("Course tile not found - generated from the template alone.");
          }
        }
      }

      // Resolve the week number: the explicit input wins; otherwise derive it
      // from the tile (when one resolved) via the same helper other steps use.
      let week: number | null = null;
      const weekRaw = String(values.week ?? "").trim();
      if (weekRaw !== "" && Number.isFinite(Number(weekRaw))) {
        week = Number(weekRaw);
      } else if (tile) {
        const weekResolution = await resolveTileCurrentWeek(tile, helpers);
        if (!("skip" in weekResolution)) {
          week = weekResolution.rawWeek;
        }
      }

      // Resolve the topic: the explicit input wins; otherwise derive it from
      // the tile's current week. A topic that cannot be resolved is NOT fatal.
      let topic = String(values.topic ?? "").trim();
      if (!topic) {
        if (tile && week !== null) {
          const weekTopic = await loadTileWeekTopic(tile, week, helpers);
          if ("skip" in weekTopic) {
            notes.push(`Could not resolve the week's topic (${weekTopic.skip}) - generated from the template alone.`);
          } else {
            topic = weekTopic.topic;
          }
        } else if (tile) {
          notes.push("Could not resolve the course's current week - generated from the template alone.");
        }
      }

      const weekLabel = week ? `Week ${week}` : "";
      const ctx: TestBriefContext = {
        courseName: tile?.name ?? "",
        topic,
        weekLabel,
        // A project-based test walks the student back through THIS milestone.
        milestone: tile && week !== null ? milestoneBriefFor(tile.courseProject, week) : null,
      };

      const objectives = buildTestObjectives(spec, ctx);
      const context = buildTestContext(spec, ctx);

      // 3. Generate the test questions. A failure here is fatal - without it
      // there is no test document, no answer key, and no Canvas draft to build.
      onProgress("Generating the test questions...");
      const generated = await generateTestQuestionsAction(
        objectives,
        context,
        spec.sections,
        helpers.provider,
        resolveCourseKind(values.courseKind)
      );
      if ("error" in generated) {
        throw new Error(generated.error);
      }

      // The optional points override. Resolved here (rather than inside the
      // Canvas block) because the document is where it actually takes effect:
      // Canvas discards a classic quiz's points_possible and derives the total
      // from its questions instead.
      const pointsRaw = values.pointsPossible;
      const pointsOverride =
        String(pointsRaw ?? "").trim() !== "" && Number.isFinite(Number(pointsRaw))
          ? Number(pointsRaw)
          : null;

      // 4a. Assemble the test document text, then append the answer key and
      // study guide when the spec asks for them.
      let testText = renderTestDocument(generated, spec, ctx, pointsOverride);

      if (spec.includeAnswerKey) {
        const answerKeyText = renderTestAnswerKey(generated);
        if (answerKeyText) {
          testText += `\n\n${answerKeyText}`;
        }
      }

      if (spec.includeStudyGuide) {
        testText += `\n\n${renderTestStudyGuide(spec, ctx)}`;
      }

      // Essay grading guidance - only when the spec has at least one essay
      // section. A failure here is a note, not a throw - the test already
      // shipped without it.
      if (spec.sections.some((s) => s.kind === "essay")) {
        onProgress("Generating essay grading guidance...");
        try {
          const rubricResult = await generateAssignmentRubricAction(objectives, context, helpers.provider);
          if (typeof rubricResult === "string") {
            testText += `\n\n## Essay grading guide\n\n${rubricResult}`;
          } else {
            notes.push(`Essay grading guide generation failed: ${rubricResult.error}`);
          }
        } catch (err) {
          notes.push(
            `Essay grading guide generation failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // 4b. Build the docx, name it, download it (guarded for headless runs),
      // and save it. The test document is the primary artifact: a save
      // failure is a note, not a throw.
      onProgress("Building the test document...");
      const testName = buildWorkflowFileName({
        course: tile ?? null,
        artifact: "Test",
        qualifier: generated.title || weekLabel,
        ext: "docx",
      });

      const docxBuffer = await buildDocxFromPlainText(testText, [], helpers.author);
      const blob = new Blob([new Uint8Array(docxBuffer)], { type: DOCX_MIME });

      // Join the run's file set so a later LMS step posts this document along
      // with everything else, instead of it only reaching the Files tab.
      const incomingFiles = (values.files as GeneratedCourseFile[] | undefined) ?? [];
      const outgoingFiles: GeneratedCourseFile[] = [
        ...incomingFiles,
        {
          name: testName,
          blob,
          mimeType: DOCX_MIME,
          // Week 1 is the fallback: an unresolved week must not drop the file
          // out of the module upload, which keys on weekNumber.
          weekNumber: week ?? 1,
          sortOrder: 5,
          role: "test",
        },
      ];

      if (typeof document !== "undefined") {
        onProgress(`Downloading ${testName}...`);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = testName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      onProgress("Saving the test document...");
      try {
        const base64 = await blobToBase64(blob);
        const lib = await saveLibraryFileAction({
          name: testName,
          base64,
          mimeType: DOCX_MIME,
          fileExt: "docx",
          workflowId: helpers.workflowId,
          workflowName: helpers.workflowName,
          workflowRunId: helpers.workflowRunId,
        });
        if ("error" in lib) {
          notes.push(`Files tab save failed: ${lib.error}`);
        }
      } catch (err) {
        notes.push(`Files tab save failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (tile && helpers.saveCourseMaterialFile) {
        try {
          await helpers.saveCourseMaterialFile(tile.id, blob, testName);
        } catch (err) {
          notes.push(`Course tile save failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // 5. Canvas draft - only when asked for and only when there is a Canvas
      // URL to post to. createGradableAction always creates the quiz
      // UNPUBLISHED (see src/lib/canvas-modules/gradables.ts); it is never
      // published here.
      const postToCanvas = String(values.postToCanvas ?? "") === "1";
      const canvasUrl = (tile?.canvasUrl ?? "").trim();
      let canvasId = "";
      if (postToCanvas) {
        if (!canvasUrl) {
          notes.push("Canvas draft skipped - the course tile has no Canvas URL.");
        } else {
          onProgress("Creating the Canvas quiz draft...");
          // Canvas ignores this for a classic quiz (it sums the questions
          // instead); it is sent for consistency with the assignment path and
          // so the value is correct if Canvas ever starts honoring it.
          const pointsPossible = pointsOverride ?? testTotalPoints(spec);
          const canvasResult = await createGradableAction(
            canvasUrl,
            "Quiz",
            {
              title: generated.title,
              description: generated.instructions,
              pointsPossible,
            },
            helpers.activeInstitution || undefined
          );
          if ("error" in canvasResult) {
            notes.push(`Canvas draft failed: ${canvasResult.error}`);
          } else {
            canvasId = String(canvasResult.id);

            // Add one question per generated question. A per-question
            // failure is collected and reported in the summary; it does not
            // abort the remaining questions and does not throw.
            onProgress("Adding quiz questions...");
            let questionFailures = 0;
            for (const q of generated.questions) {
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
                const questionResult = await createQuizQuestionAction(
                  canvasUrl,
                  canvasResult.id,
                  {
                    name: q.prompt.slice(0, 80),
                    text: q.prompt,
                    type: canvasType,
                    points: q.points,
                    answers,
                  },
                  helpers.activeInstitution || undefined
                );
                if ("error" in questionResult) {
                  questionFailures += 1;
                }
              } catch {
                questionFailures += 1;
              }
            }
            if (questionFailures > 0) {
              notes.push(`${questionFailures} of ${generated.questions.length} quiz question(s) failed to create.`);
            }
            notes.push(
              `Created an UNPUBLISHED Canvas quiz draft (id ${canvasId}) - review and publish it from Canvas when ready.`
            );
          }
        }
      }

      return {
        outputs: {
          files: outgoingFiles,
          testName,
          testTitle: generated.title,
          canvasId,
          answerKey: spec.includeAnswerKey ? renderTestAnswerKey(generated) : "",
          questionCount: generated.questions.length,
        },
        summary: {
          kind: "list",
          label: `Test generated: ${generated.title}`,
          items: notes,
        },
      };
    },
  },
];
