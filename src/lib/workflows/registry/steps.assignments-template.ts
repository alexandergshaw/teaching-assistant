// Client-side step catalog: turns a saved assignment template into real
// artifacts - a handout, a grading rubric, and (optionally) an UNPUBLISHED
// Canvas assignment draft, plus in-class openers and closers.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  getArtifactTemplateAction,
  listCourseHubAction,
  generateAssignmentAction,
  generateAssignmentRubricAction,
  generateClassOpenerAction,
  createGradableAction,
  saveLibraryFileAction,
  selectRequiredTools,
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
import { DOWNLOADABLE_OUTPUT_KEY } from "@/lib/workflows/run-logging";
import { coerceAssignmentSpec } from "@/lib/artifact-templates/types";
import { resolveCourseKind } from "@/lib/course-kind";
import { milestoneBriefFor } from "@/lib/course-project";
import { ensureCourseProject, ensureCourseTools } from "@/lib/workflows/registry/steps.course-project";
import type { Course } from "@/lib/supabase/courses";
import {
  buildAssignmentObjectives,
  buildAssignmentContext,
  renderAssignmentHandout,
  renderAssignmentCloser,
  type AssignmentBriefContext,
} from "@/lib/assignment-brief";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const assignmentTemplateSteps: StepDefinition[] = [
  {
    type: "generate-assignment-from-template",
    name: "Generate an assignment from a template",
    description:
      "Turn a saved assignment template into a handout (.docx), a grading rubric, and - when turned on - an UNPUBLISHED Canvas assignment draft for you to review before publishing. Adds in-class openers and closers when the template asks for them.",
    inputs: [
      {
        key: "template",
        label: "Assignment template",
        type: "assignmentTemplate",
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
        label: "Create a Canvas assignment draft",
        type: "boolean",
        required: false,
        help: "Creates an UNPUBLISHED Canvas assignment draft for you to review before publishing.",
      },
      { key: "pointsPossible", label: "Points possible", type: "number", required: false },
    ],
    outputs: [
      { key: "files", label: "Course files", type: "files" },
      { key: "handoutName", label: "Handout file name", type: "text" },
      { key: "assignmentTitle", label: "Assignment title", type: "text" },
      { key: "canvasId", label: "Canvas assignment id", type: "text" },
      { key: "rubric", label: "Rubric", type: "longtext" },
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
            handoutName: "",
            assignmentTitle: "",
            canvasId: "",
            rubric: "",
          },
          summary: {
            kind: "text",
            text: "No assignment template selected - nothing generated.",
          },
        };
      }

      onProgress("Loading the assignment template...");
      const templateResult = await getArtifactTemplateAction(templateKey, "assignment");
      if ("error" in templateResult) {
        throw new Error(templateResult.error);
      }
      const spec = coerceAssignmentSpec(templateResult.template.spec);

      // 2. Load the course tile. Unlike template resolution, a missing/
      // unresolvable tile is NOT fatal: the handout and rubric are generated
      // from the template alone, and tile-dependent extras (auto topic,
      // course-tile filing, the Canvas draft) are skipped with a note.
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
      // AC3: the week's summary (only available when the topic came from the
      // tile) is kept alongside it - selectRequiredTools below wants the same
      // {topic, summary} shape buildScheduleWeekPlan already feeds it.
      let topic = String(values.topic ?? "").trim();
      let weekSummary = "";
      if (!topic) {
        if (tile && week !== null) {
          const weekTopic = await loadTileWeekTopic(tile, week, helpers);
          if ("skip" in weekTopic) {
            notes.push(`Could not resolve the week's topic (${weekTopic.skip}) - generated from the template alone.`);
          } else {
            topic = weekTopic.topic;
            weekSummary = weekTopic.summary;
          }
        } else if (tile) {
          notes.push("Could not resolve the course's current week - generated from the template alone.");
        }
      }

      const courseKind = resolveCourseKind(values.courseKind);

      // AC1/AC3 (docs/REGRESSION.md 152): the course-long project must not
      // depend on a separate define-course-project step having already run -
      // a saved copy of a kickoff preset can silently lack that step
      // entirely. ensureCourseProject is idempotent (a no-op once the tile
      // already has a project) and applied-course-only (see its own comment
      // for why), so this changes nothing for a coding course or a course
      // that already has a project - it only fills the gap for exactly the
      // workflows this feature targets.
      let courseProject = tile?.courseProject;
      if (tile) {
        const ensured = await ensureCourseProject(tile, helpers.provider, courseKind, []);
        courseProject = ensured.project;
        if (ensured.created) {
          notes.push(
            'This course had no project yet - one was generated automatically from its schedule/topics (a "Define the course project" step may be missing from this workflow).'
          );
        }
      }

      const weekLabel = week ? `Week ${week}` : "";
      const ctx: AssignmentBriefContext = {
        courseName: tile?.name ?? "",
        topic,
        weekLabel,
        // No new binding needed: the step already loads the tile and resolves
        // its own week, so the persisted project is reachable from here.
        milestone: tile && week !== null && courseProject ? milestoneBriefFor(courseProject, week) : null,
      };

      const objectives = buildAssignmentObjectives(spec, ctx);
      const context = buildAssignmentContext(spec, ctx);

      // Tool-churn fix (docs/REGRESSION.md): when a course tile is bound,
      // use the COURSE's committed toolset (ensureCourseTools - the same
      // once-per-course commitment lecture-materials-from-schedule now reads
      // via buildScheduleWeekPlan) instead of picking a tool fresh for just
      // this topic - that per-topic pick is exactly what let this step's own
      // choice drift from a same-week deck's, and from every other week of
      // the same course. With no tile bound, there is nothing to persist a
      // commitment onto, so this falls back to the old per-topic
      // selectRequiredTools call (an applied-only concept, and there is
      // nothing meaningful to ask about with no topic either).
      let requiredToolsText = "";
      if (tile && courseKind === "applied" && courseProject) {
        const ensuredTools = await ensureCourseTools(tile, courseProject, helpers.provider, courseKind, []);
        courseProject = { ...courseProject, tools: ensuredTools.tools };
        requiredToolsText = ensuredTools.tools.join("; ");
        if (ensuredTools.created) {
          notes.push(
            `This course had no committed toolset yet - one was chosen automatically for the whole term: ${ensuredTools.tools.join("; ")}.`
          );
        }
      } else if (!tile && courseKind === "applied" && topic) {
        const requiredTools = await selectRequiredTools(topic, weekSummary, helpers.provider);
        requiredToolsText = requiredTools.join("; ");
      }

      // 3. Generate the assignment. A failure here is fatal - without it there
      // is no handout, no rubric basis, and no Canvas draft to build.
      onProgress("Generating the assignment...");
      const generated = await generateAssignmentAction(
        objectives,
        context,
        [],
        helpers.provider,
        courseKind,
        requiredToolsText
      );
      if ("error" in generated) {
        throw new Error(generated.error);
      }

      // 4a. Assemble the handout text. The Canvas draft's description reuses
      // this core text (before the opener/closer, which are in-person
      // facilitation notes, not part of the student-facing assignment prompt).
      const handoutCore = renderAssignmentHandout(generated, spec, ctx);
      let handoutText = handoutCore;

      // 7. Openers and closers.
      if (spec.includeOpener) {
        onProgress("Generating the in-class opener...");
        try {
          const openerResult = await generateClassOpenerAction(
            topic,
            generated.overview,
            spec.openerMinutes ?? 15,
            null,
            [],
            helpers.provider,
            // Same courseKind already resolved above for generateAssignmentAction -
            // left unset before this fix, the opener's own prompt defaulted to
            // "coding" and asked for a warm-up coding exercise (starter code,
            // pseudocode, "implement in your chosen language") even when the
            // assignment itself had just been generated as an applied/no-code one.
            courseKind
          );
          if ("error" in openerResult) {
            notes.push(`In-class opener generation failed: ${openerResult.error}`);
          } else {
            handoutText += `\n\n## In-class opener\n\n${openerResult.text}`;
          }
        } catch (err) {
          notes.push(
            `In-class opener generation failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      if (spec.includeCloser) {
        // There is no closer generator anywhere in the repo (only
        // generateClassOpenerAction) and this wave does not add a new server
        // action. A deterministic, spec-built closer (as opposed to a second
        // call to the opener action with a "closer-framed" topic) is used
        // instead: generateClassOpenerAction's prompt and its embedded/
        // deterministic fallback both hard-code an opener's shape (title
        // "Class Opener: ...", then case-study-discussion / warm-up-exercise /
        // debrief sections), so reusing it for a closer would - at best -
        // mislabel the section, and - for the embedded provider, which never
        // calls an LLM - would echo largely the same generic boilerplate as
        // the opener because both calls pass null/[] for case study material
        // and practice problems. Building the closer from the spec instead
        // guarantees it is always structurally and textually distinct from
        // whatever the opener produced.
        handoutText += `\n\n${renderAssignmentCloser(spec, ctx)}`;
      }

      // 4b. Build the docx, name it, download it (guarded for headless runs),
      // and save it. The handout is the primary artifact: a save failure is a
      // note, not a throw.
      onProgress("Building the handout...");
      const handoutName = buildWorkflowFileName({
        course: tile ?? null,
        artifact: "Assignment",
        qualifier: generated.title || weekLabel,
        ext: "docx",
      });

      const docxBuffer = await buildDocxFromPlainText(handoutText, [], helpers.author);
      const blob = new Blob([new Uint8Array(docxBuffer)], { type: DOCX_MIME });

      // Join the run's file set so a later LMS step posts this document along
      // with everything else, instead of it only reaching the Files tab.
      const incomingFiles = (values.files as GeneratedCourseFile[] | undefined) ?? [];
      const outgoingFiles: GeneratedCourseFile[] = [
        ...incomingFiles,
        {
          name: handoutName,
          blob,
          mimeType: DOCX_MIME,
          // Week 1 is the fallback: an unresolved week must not drop the file
          // out of the module upload, which keys on weekNumber.
          weekNumber: week ?? 1,
          sortOrder: 4,
          role: "assignment",
        },
      ];

      onProgress("Saving the handout...");
      try {
        const base64 = await blobToBase64(blob);
        const lib = await saveLibraryFileAction({
          name: handoutName,
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
          await helpers.saveCourseMaterialFile(tile.id, blob, handoutName);
        } catch (err) {
          notes.push(`Course tile save failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // 5. Rubric. A failure here is a note, not a throw - the handout still
      // shipped.
      onProgress("Generating the rubric...");
      let rubric = "";
      const rubricResult = await generateAssignmentRubricAction(objectives, context, helpers.provider);
      if (typeof rubricResult === "string") {
        rubric = rubricResult;
      } else {
        notes.push(`Rubric generation failed: ${rubricResult.error}`);
      }

      // 6. Canvas draft - only when asked for and only when there is a Canvas
      // URL to post to. createGradableAction always creates the item
      // UNPUBLISHED (see src/lib/canvas-modules/gradables.ts); it is never
      // published here.
      const postToCanvas = String(values.postToCanvas ?? "") === "1";
      const canvasUrl = (tile?.canvasUrl ?? "").trim();
      let canvasId = "";
      if (postToCanvas) {
        if (!canvasUrl) {
          notes.push("Canvas draft skipped - the course tile has no Canvas URL.");
        } else {
          onProgress("Creating the Canvas assignment draft...");
          const pointsRaw = values.pointsPossible;
          const pointsPossible =
            String(pointsRaw ?? "").trim() !== "" && Number.isFinite(Number(pointsRaw))
              ? Number(pointsRaw)
              : undefined;
          const canvasResult = await createGradableAction(
            canvasUrl,
            "Assignment",
            {
              title: generated.title,
              description: handoutCore,
              pointsPossible,
              submissionType: "online_text_entry",
            },
            helpers.activeInstitution || undefined
          );
          if ("error" in canvasResult) {
            notes.push(`Canvas draft failed: ${canvasResult.error}`);
          } else {
            canvasId = String(canvasResult.id);
            notes.push(
              `Created an UNPUBLISHED Canvas assignment draft (id ${canvasId}) - review and publish it from Canvas when ready.`
            );
          }
        }
      }

      return {
        outputs: {
          files: outgoingFiles,
          handoutName,
          assignmentTitle: generated.title,
          canvasId,
          rubric,
          // Defect-2 fix: hand the handout to the runner instead of
          // downloading it here directly - see DOWNLOADABLE_OUTPUT_KEY's
          // doc comment (run-logging.ts).
          ...(typeof document !== "undefined" ? { [DOWNLOADABLE_OUTPUT_KEY]: { blob, fileName: handoutName } } : {}),
        },
        summary: {
          kind: "list",
          label: `Assignment generated: ${generated.title}`,
          items: notes,
        },
      };
    },
  },
];
