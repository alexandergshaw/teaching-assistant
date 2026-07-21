// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  getRepoZipAction,
  generateLecturePlansAction,
  generateLectureMaterialsFromScheduleAction,
  listCourseContentAction,
  listCourseHubAction,
  createPageAction,
  generateLectureFromMaterialsAction,
  generateLectureQaAction,
  regenerateAnnouncementAction,
  analyzeCourseTechAction,
  previewFinalizedSyllabusAction,
  extractTopicsFromRepoAction,
  generateModuleIntroAction,
  generateLessonPlanAction,
  generateExamplesAction,
  generateDocumentTextAction,
  generateClassOpenerAction,
  findCaseStudyMaterialAction,
  findPracticeProblemsAction,
  researchTopicAction,
  generateSlidesAction,
  generateLectureScriptAction,
  extractPptxSlidesAction,
  synthesizeLongNarrationAction,
  saveLibraryFileAction,
} from "@/app/actions";
import {
  type StepRunResult,
  type StepDefinition,
  base64ToBlob,
  blobToBase64,
  getCachedLiveModules,
  resolveModulesAhead,
  resolveTileCurrentWeek,
  resolveModuleObjectives,
  loadTileWeekTopic,
  resolveDeckTheme,
  gatherModuleMaterials,
  assembleLectureFiles,
} from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import { nextLectureWeek } from "@/lib/workflows/next-week";
import { buildSlidesPptx } from "@/lib/pptx";
import { buildDocxFromPlainText } from "@/lib/docx";
import { markdownLiteToHtml } from "@/lib/markdown-lite";
import { applyTextRevision } from "@/lib/embedded/revise";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { findModuleForWeek } from "@/lib/week-numbering";
import { parseLmsModuleValue, liveModuleValue, exportModuleValue } from "@/lib/workflows/module-value";

export const contentSteps: StepDefinition[] = [
  {
    type: "lecture-zip",
    name: "Build lecture materials zip",
    description: "Generate presentation slides and lecture notes as a zip file saved to the Files tab. Slides are styled by a PPT Design template (Classic Lecture by default).",
    inputs: [
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: true,
      },
      {
        key: "minutes",
        label: "Lecture duration (minutes)",
        type: "number",
        required: true,
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Optional - names the zip after this course tile.",
      },
      {
        key: "includeInstructions",
        label: "Include assignment instructions",
        type: "boolean",
        required: false,
        help: "Adds each week's Instructions document to the materials.",
      },
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: false,
        help: "When bound, each deck is titled with its module's topic.",
      },
      {
        key: "template",
        label: "Deck template",
        type: "deckTemplate",
        required: false,
        help: "A PPT Design template that styles the generated slides. Blank uses Classic Lecture (the app's standard look). Slide content still comes from this step's own generator.",
      },
    ],
    outputs: [
      { key: "files", label: "Generated files", type: "files" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      const minutes = Number(values.minutes);

      if (!repo) {
        return {
          outputs: { files: [] },
          summary: {
            kind: "text",
            text: "Skipped - no repository linked; no lecture materials were generated.",
          },
        };
      }

      onProgress("Downloading repository...");
      const z = await getRepoZipAction(repo);
      if ("error" in z) {
        throw new Error(z.error);
      }

      onProgress("Generating lecture plans...");
      const plans = await generateLecturePlansAction(
        z.base64,
        minutes,
        undefined,
        undefined,
        helpers.provider
      );

      if ("error" in plans) {
        throw new Error(plans.error);
      }

      // When schedule is bound, use each module's topic to title the deck.
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      if (schedule.length > 0) {
        for (const plan of plans) {
          const scheduleEntry = schedule.find((s) => s.week === plan.weekNumber);
          if (scheduleEntry && scheduleEntry.topic.trim()) {
            plan.presentationTitle = scheduleEntry.topic;
          }
        }
      }

      const baseName = repo
        .split("/")
        .pop()
        ?.replace(/[^a-z0-9]/gi, "_")
        .replace(/_+/g, "_") || "lecture_plans";

      const result = await assembleLectureFiles(plans, values, helpers, onProgress, baseName);
      return {
        outputs: { files: result.files },
        summary: result.summary,
      };
    },
  },

  {
    type: "lecture-materials-from-schedule",
    name: "Build lecture materials from schedule",
    description: "Generate presentation slides and lecture notes from a course schedule (for courses without a code base).",
    inputs: [
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: true,
      },
      {
        key: "minutes",
        label: "Lecture duration (minutes)",
        type: "number",
        required: true,
        help: "Target lecture length. Defaults to 50 minutes if blank.",
      },
      {
        key: "description",
        label: "Course description",
        type: "longtext",
        required: false,
        help: "Provides context for generating slides and materials.",
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Optional - names the zip after this course tile.",
      },
      {
        key: "includeInstructions",
        label: "Include assignment instructions",
        type: "boolean",
        required: false,
        help: "Adds each week's Instructions document to the materials.",
      },
      {
        key: "template",
        label: "Deck template",
        type: "deckTemplate",
        required: false,
        help: "A PPT Design template that styles the generated slides. Blank uses Classic Lecture.",
      },
    ],
    outputs: [
      { key: "files", label: "Generated files", type: "files" },
    ],
    run: async (values, helpers, onProgress) => {
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      const minutes = Number(values.minutes);
      const description = String(values.description ?? "").trim();

      if (!schedule.length) {
        throw new Error("No schedule provided.");
      }

      onProgress("Generating lecture materials from schedule...");
      const scheduleJson = JSON.stringify(schedule);
      const plans = await generateLectureMaterialsFromScheduleAction(
        scheduleJson,
        description,
        minutes,
        helpers.provider
      );

      if ("error" in plans) {
        throw new Error(plans.error);
      }

      const baseName = "lecture_materials";

      const result = await assembleLectureFiles(plans, values, helpers, onProgress, baseName);
      return {
        outputs: { files: result.files },
        summary: result.summary,
      };
    },
  },

  {
    type: "generate-class-openers",
    name: "Generate class openers",
    description: "Generate ~30-minute class openers (case study + warm-up coding exercise) for each week as docx files packaged in a zip.",
    inputs: [
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: true,
        help: "The weekly topics for which openers are generated.",
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Optional - when bound, names the zip after this course tile.",
      },
      {
        key: "minutes",
        label: "Target opener length (minutes)",
        type: "number",
        required: false,
        help: "Target opener length in minutes. Default 30.",
      },
    ],
    outputs: [
      { key: "report", label: "Generation report", type: "longtext" },
      { key: "count", label: "Openers generated", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      if (!schedule.length) {
        return {
          outputs: { report: "No schedule provided.", count: 0 },
          summary: { kind: "text", text: "Skipped - no schedule was provided." },
        };
      }

      const targetMinutes = Math.max(5, Math.min(Number(values.minutes ?? 30), 120));
      const reportLines: string[] = [];
      const files: GeneratedCourseFile[] = [];

      onProgress("Generating class openers...");

      for (const week of schedule) {
        if (!week.topic || !week.topic.trim()) {
          reportLines.push(`Week ${week.week}: Skipped (no topic).`);
          continue;
        }

        try {
          const topicText = week.topic.trim();
          onProgress(`Generating opener for week ${week.week}: ${topicText}`);

          const caseStudyResult = await findCaseStudyMaterialAction(topicText);
          const caseStudyMaterial = "material" in caseStudyResult ? caseStudyResult.material : null;

          const practiceResult = await findPracticeProblemsAction(topicText, 2);
          const practiceProblems = "problems" in practiceResult ? practiceResult.problems : [];

          const openerResult = await generateClassOpenerAction(
            topicText,
            week.summary,
            targetMinutes,
            caseStudyMaterial,
            practiceProblems,
            helpers.provider
          );

          if ("error" in openerResult) {
            reportLines.push(`Week ${week.week} (${topicText}): Error - ${openerResult.error}`);
            continue;
          }

          const docxData = await buildDocxFromPlainText(openerResult.text, [], helpers.author);

          files.push({
            name: `Week ${week.week} Opener - ${topicText}.docx`,
            blob: new Blob([docxData], {
              type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            }),
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            weekNumber: week.week,
            sortOrder: 0,
            role: "instructions",
            pageText: openerResult.text,
          });

          reportLines.push(`Week ${week.week} (${topicText}): OK`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          reportLines.push(`Week ${week.week}: Error - ${msg}`);
        }
      }

      if (files.length === 0) {
        throw new Error("Failed to generate any class openers: every week failed or was skipped.");
      }

      onProgress("Assembling zip...");
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      for (const file of files) {
        zip.file(file.name, file.blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });

      const hubCourseId = String(values.hubCourse ?? "").trim();
      let baseName = "class_openers";
      if (hubCourseId) {
        const list = await listCourseHubAction();
        if (!("error" in list)) {
          const tile = list.courses.find((c) => c.id === hubCourseId);
          if (tile?.name?.trim()) {
            baseName = tile.name.trim().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_") || baseName;
          }
        }
      }

      if (typeof document !== "undefined") {
        onProgress("Downloading zip...");
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${baseName}_openers.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      if (helpers.saveBundle) {
        try {
          await helpers.saveBundle(zipBlob, `${baseName} Class Openers`);
        } catch (err) {
          console.error("Library save failed:", err);
        }
      }

      if (helpers.saveCourseMaterialFile && hubCourseId) {
        try {
          await helpers.saveCourseMaterialFile(hubCourseId, zipBlob, `${baseName} Class Openers.zip`);
        } catch (err) {
          console.error("Course tile save failed:", err);
        }
      }

      return {
        outputs: { report: reportLines.join("\n"), count: files.length },
        summary: {
          kind: "list",
          label: `Generated ${files.length} class openers`,
          items: files.map((f) => f.name),
        },
      };
    },
  },

  {
    type: "prepare-lecture",
    name: "Prepare lecture",
    description:
      "Build a lecture deck from a module's materials (page bodies, files, assignment/homework descriptions, and item titles) and save it to the course tile and the Files tab. Pauses for announcement review unless Autonomous is on; in Autonomous mode with no course tile it prepares a lecture for every tile. Slides are styled by a PPT Design template (Classic Lecture by default).",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Leave empty in Autonomous mode to prepare a lecture for every course tile.",
      },
      {
        key: "moduleId",
        label: "Module",
        type: "lmsModule",
        required: false,
        help: "Pick from the live LMS connection or the course's LMS export; without either the step falls back to the tile's topics.",
      },
      {
        key: "autonomous",
        label: "Autonomous (no review, all tiles)",
        type: "boolean",
        required: false,
        help: "Run hands-off: build and save the deck(s) without pausing to review the announcement. With no course tile selected, prepares a lecture for every tile.",
      },
      {
        key: "template",
        label: "Deck template",
        type: "deckTemplate",
        required: false,
        help: "A PPT Design template that styles the generated slides. Blank uses Classic Lecture (the app's standard look). Slide content still comes from this step's own generator.",
      },
      {
        key: "modulesAhead",
        label: "Modules ahead",
        type: "moduleOffset",
        required: false,
        help: "How many modules past the current one to target. 0 or blank = the current module.",
      },
    ],
    outputs: [
      { key: "announcement", label: "Announcement", type: "longtext" },
      { key: "moduleName", label: "Module", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const autonomous = String(values.autonomous ?? "") === "1";
      const hubCourseId = String(values.hubCourse ?? "").trim();
      const moduleIdRaw = String(values.moduleId ?? "").trim();
      const modulesAhead = resolveModulesAhead(values);

      const list = await listCourseHubAction();
      if ("error" in list) {
        throw new Error(list.error);
      }

      const deck = await resolveDeckTheme(values.template);
      if (deck.note) onProgress(deck.note);

      // Build the deck + recap for one tile: gather materials, generate the
      // lecture, save the pptx to the tile. Downloads only in the interactive
      // single-tile path (guarded for headless); never pauses.
      const buildForTile = async (
        tile: Course,
        download: boolean
      ): Promise<{
        announcement: string;
        moduleName: string;
        slideCount: number;
        fileName: string;
        materialsText: string;
        materialsSource: string;
        notes: string[];
      }> => {
        // Apply module offset: when no module is picked, derive from current+N;
        // when a module is picked, apply offset relative to that module's position.
        let effectiveModuleIdRaw = moduleIdRaw;
        const offsetNotes: string[] = [];
        if (modulesAhead > 0) {
          const canvasUrl = (tile.canvasUrl ?? "").trim();
          if (canvasUrl) {
            try {
              const picked = parseLmsModuleValue(moduleIdRaw);
              if (picked.fromExport) {
                // Export modules: offset not supported
                offsetNotes.push("modules-ahead is not supported for export-sourced modules");
              } else if (moduleIdRaw) {
                // Explicit live module picked: find its index and offset from there
                const content = await listCourseContentAction(
                  canvasUrl,
                  helpers.activeInstitution || undefined
                );
                if (!("error" in content)) {
                  let targetIdx: number | null = null;
                  const pickedIdx = content.modules.findIndex(
                    (m) => String(m.id) === picked.liveId
                  );
                  if (pickedIdx >= 0) {
                    targetIdx = Math.min(
                      pickedIdx + modulesAhead,
                      content.modules.length - 1
                    );
                  }
                  if (targetIdx !== null && targetIdx >= 0) {
                    const mod = content.modules[targetIdx];
                    effectiveModuleIdRaw = liveModuleValue(String(mod.id), mod.name);
                  }
                }
              } else {
                // No module picked: derive from current + offset
                const content = await listCourseContentAction(
                  canvasUrl,
                  helpers.activeInstitution || undefined
                );
                if (!("error" in content)) {
                  let targetIdx: number | null = null;
                  const weekResolution = await resolveTileCurrentWeek(tile, helpers);
                  if (!("skip" in weekResolution)) {
                    const rawWeek = weekResolution.rawWeek;
                    targetIdx = Math.min(
                      rawWeek - 1 + modulesAhead,
                      content.modules.length - 1
                    );
                  }
                  if (targetIdx !== null && targetIdx >= 0) {
                    const mod = content.modules[targetIdx];
                    effectiveModuleIdRaw = liveModuleValue(String(mod.id), mod.name);
                  }
                }
              }
            } catch {
              // Fall back to using original moduleIdRaw or empty (will use tile.topics)
            }
          }
        }

        const { moduleName, materialsText, notes, materialsSource } =
          await gatherModuleMaterials(tile, effectiveModuleIdRaw, helpers, onProgress);

        // Combine offset notes with materials gathering notes
        const allNotes = [...offsetNotes, ...notes];

        onProgress(`Generating lecture for ${tile.name}...`);
        const r = await generateLectureFromMaterialsAction(
          tile.name,
          moduleName,
          materialsText,
          helpers.provider
        );
        if ("error" in r) {
          throw new Error(r.error);
        }

        const pptxData = await buildSlidesPptx({
          presentationTitle: r.presentationTitle,
          slides: r.slides,
          subtitle: moduleName,
          author: helpers.author,
          theme: deck.theme,
        });
        const blob = new Blob([pptxData], {
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        });

        const sanitize = (s: string) =>
          s.trim().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
        const fileName = `${sanitize(tile.name)}_${sanitize(moduleName)}_Lecture.pptx`;

        // Browser-only convenience download; skipped server-side (no document)
        // and in the autonomous multi-tile path. The tile save below is the
        // durable artifact either way.
        if (download && typeof document !== "undefined") {
          onProgress(`Downloading ${fileName}...`);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }

        if (helpers.saveCourseMaterialFile) {
          try {
            await helpers.saveCourseMaterialFile(tile.id, blob, fileName);
            const base64 = await blobToBase64(blob);
            const lib = await saveLibraryFileAction({
              name: fileName,
              base64,
              mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              fileExt: "pptx",
              workflowId: helpers.workflowId,
              workflowName: helpers.workflowName,
              workflowRunId: helpers.workflowRunId,
            });
            if ("error" in lib) {
              allNotes.push(`library save skipped: ${lib.error}`);
            }
          } catch (err) {
            allNotes.push(
              `saving to the course tile failed: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }

        return {
          announcement: r.announcement,
          moduleName,
          slideCount: r.slides.length,
          fileName,
          materialsText,
          materialsSource,
          notes: allNotes,
        };
      };

      // Autonomous: build for the chosen tile, or every tile when none is
      // picked, with no review pause.
      if (autonomous) {
        const tiles = hubCourseId
          ? list.courses.filter((c) => c.id === hubCourseId)
          : list.courses;
        if (hubCourseId && tiles.length === 0) {
          throw new Error("Choose a course tile.");
        }
        if (tiles.length === 0) {
          return {
            outputs: { announcement: "", moduleName: "" },
            summary: { kind: "text", text: "No course tiles to prepare lectures for." },
          };
        }

        const items: string[] = [];
        const announcements: string[] = [];
        let built = 0;
        for (const tile of tiles) {
          try {
            const b = await buildForTile(tile, false);
            built++;
            announcements.push(`# ${tile.name} - ${b.moduleName}\n${b.announcement}`);
            items.push(`${tile.name}: ${b.slideCount} slide(s) -> ${b.fileName}`);
            for (const n of b.notes) items.push(`  ${tile.name}: ${n}`);
          } catch (err) {
            items.push(
              `${tile.name}: failed - ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        return {
          outputs: {
            announcement: announcements.join("\n\n"),
            moduleName: `${built} lecture(s)`,
          },
          summary: {
            kind: "list",
            label: `Prepared ${built} lecture(s)`,
            items: items.length ? items : ["(nothing prepared)"],
          },
        };
      }

      // Interactive: one tile, then pause to review the recap announcement.
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Choose a course tile.");
      }

      const b = await buildForTile(tile, true);

      const result: StepRunResult = {
        outputs: {
          announcement: b.announcement,
          moduleName: b.moduleName,
        },
        summary: {
          kind: "list",
          label: `Lecture ready for ${b.moduleName}`,
          items: [
            `${b.slideCount} slide(s) -> ${b.fileName}`,
            b.materialsSource,
            ...b.notes,
          ],
        },
      };

      let latestDraft = b.announcement;
      result.requireInput = {
        message: "Review the recap announcement below. Edit it directly, regenerate it with AI, or approve it to schedule; skip to finish without scheduling.",
        key: "announcement",
        kind: "text",
        optional: true,
        initialValue: b.announcement,
        submitLabel: "Approve announcement",
        regenerate: async () => {
          const regen = await regenerateAnnouncementAction(
            tile.name,
            b.moduleName,
            b.materialsText,
            latestDraft,
            helpers.provider
          );
          if ("error" in regen) throw new Error(regen.error);
          latestDraft = regen.announcement;
          return regen.announcement;
        },
      };

      return result;
    },
  },

  {
    type: "lecture-qa",
    name: "Anticipate lecture Q&A",
    description:
      "Predict the questions students are likely to ask during a lecture and draft instructor-ready answers from the module's materials and optional slide deck. Saved to the course tile and the Files tab.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
      },
      {
        key: "moduleId",
        label: "Module",
        type: "lmsModule",
        required: false,
        help: "Pick from the live LMS connection or the course's LMS export; without either the step falls back to the tile's topics.",
      },
      {
        key: "slides",
        label: "Lecture slides (optional)",
        type: "uploads",
        required: false,
        help: "Attach the lecture deck (.pptx, .pdf, or .docx, up to 3 files of ~6 MB each) to ground the questions in what will actually be presented.",
        accept: ".pptx,.pdf,.docx,.ppt,.doc",
      },
      {
        key: "slidesText",
        label: "Slides from a previous step (optional)",
        type: "longtext",
        required: false,
        help: "Bind a deck generated earlier in this workflow (Generate slides -> Deck or Slides JSON, or Extract slides -> Slides). Its text grounds the questions the same way an uploaded deck does.",
      },
      {
        key: "modulesAhead",
        label: "Modules ahead",
        type: "moduleOffset",
        required: false,
        help: "How many modules past the current one to target. 0 or blank = the current module.",
      },
    ],
    outputs: [
      { key: "qaText", label: "Q&A", type: "longtext" },
      { key: "moduleName", label: "Module", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();
      const list = await listCourseHubAction();
      if ("error" in list) {
        throw new Error(list.error);
      }
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Choose a course tile.");
      }

      const moduleIdRaw = String(values.moduleId ?? "").trim();
      const modulesAhead = resolveModulesAhead(values);

      // Apply module offset: when no module is picked, derive from current+N;
      // when a module is picked, apply offset relative to that module's position.
      let effectiveModuleIdRaw = moduleIdRaw;
      const offsetNotes: string[] = [];
      if (modulesAhead > 0) {
        const canvasUrl = (tile.canvasUrl ?? "").trim();
        if (canvasUrl) {
          try {
            const picked = parseLmsModuleValue(moduleIdRaw);
            if (picked.fromExport) {
              // Export modules: offset not supported
              offsetNotes.push("modules-ahead is not supported for export-sourced modules");
            } else if (moduleIdRaw) {
              // Explicit live module picked: find its index and offset from there
              const content = await listCourseContentAction(
                canvasUrl,
                helpers.activeInstitution || undefined
              );
              if (!("error" in content)) {
                let targetIdx: number | null = null;
                const pickedIdx = content.modules.findIndex(
                  (m) => String(m.id) === picked.liveId
                );
                if (pickedIdx >= 0) {
                  targetIdx = Math.min(
                    pickedIdx + modulesAhead,
                    content.modules.length - 1
                  );
                }
                if (targetIdx !== null && targetIdx >= 0) {
                  const mod = content.modules[targetIdx];
                  effectiveModuleIdRaw = liveModuleValue(String(mod.id), mod.name);
                }
              }
            } else {
              // No module picked: derive from current + offset
              const content = await listCourseContentAction(
                canvasUrl,
                helpers.activeInstitution || undefined
              );
              if (!("error" in content)) {
                let targetIdx: number | null = null;
                const weekResolution = await resolveTileCurrentWeek(tile, helpers);
                if (!("skip" in weekResolution)) {
                  const rawWeek = weekResolution.rawWeek;
                  targetIdx = Math.min(
                    rawWeek - 1 + modulesAhead,
                    content.modules.length - 1
                  );
                }
                if (targetIdx !== null && targetIdx >= 0) {
                  const mod = content.modules[targetIdx];
                  effectiveModuleIdRaw = liveModuleValue(String(mod.id), mod.name);
                }
              }
            }
          } catch {
            // Fall back to using original moduleIdRaw or empty (will use tile.topics)
          }
        }
      }

      const { moduleName, materialsText, notes, materialsSource } =
        await gatherModuleMaterials(tile, effectiveModuleIdRaw, helpers, onProgress);

      // Combine offset notes with materials gathering notes
      const allNotes = [...offsetNotes, ...notes];

      // Optional slide uploads ride to the server as base64 for text
      // extraction. Server actions cap request bodies at 10 MB, so oversized
      // or extra files are skipped with a note instead of failing the run.
      const uploads = Array.isArray(values.slides) ? (values.slides as File[]) : [];
      const MAX_SLIDE_FILES = 3;
      const MAX_SLIDE_BYTES = 6 * 1024 * 1024;
      if (uploads.length > MAX_SLIDE_FILES) {
        allNotes.push(
          `only the first ${MAX_SLIDE_FILES} slide files are used (${uploads.length} attached)`
        );
      }
      const slideFiles: Array<{ name: string; base64: string }> = [];
      for (const file of uploads.slice(0, MAX_SLIDE_FILES)) {
        if (file.size > MAX_SLIDE_BYTES) {
          allNotes.push(`${file.name}: too large (max ~6 MB) - skipped`);
          continue;
        }
        try {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          const CHUNK = 0x8000;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
          }
          slideFiles.push({ name: file.name, base64: btoa(binary) });
        } catch (err) {
          allNotes.push(
            `${file.name}: ${err instanceof Error ? err.message : "could not read"}`
          );
        }
      }

      // A deck produced by an earlier step (Generate slides -> Deck / Slides
      // JSON, or Extract slides -> Slides) arrives as longtext, already
      // extracted - fold it into the materials so it grounds the questions the
      // same way an uploaded deck does. Uploaded slideFiles still ride
      // separately, so both paths compose; in an unattended run the uploads
      // resolve to [] and this prior-step text is the only slide grounding.
      const priorSlidesText = String(values.slidesText ?? "").trim();
      const materialsForPrompt = priorSlidesText
        ? `# Slides from a previous step\n${priorSlidesText}\n\n${materialsText}`
        : materialsText;

      onProgress("Anticipating student questions...");
      const r = await generateLectureQaAction(
        tile.name,
        moduleName,
        materialsForPrompt,
        slideFiles,
        helpers.provider
      );
      if ("error" in r) {
        throw new Error(r.error);
      }
      if (r.questions.length === 0) {
        throw new Error("The model returned no questions. Try again.");
      }

      const qaText = r.questions
        .map((q, i) => `Q${i + 1}: ${q.question}\n\nA: ${q.answer}`)
        .join("\n\n\n");

      // Markdown headings make the docx structure deterministic (the plain-text
      // builder's heading heuristics depend on line length otherwise).
      const docText = [
        `# ${tile.name} - ${moduleName}: Anticipated student questions`,
        "",
        ...r.questions.flatMap((q, i) => [`## Q${i + 1}: ${q.question}`, "", q.answer, ""]),
      ].join("\n");
      const docxBuffer = await buildDocxFromPlainText(docText, [], helpers.author);
      const blob = new Blob([new Uint8Array(docxBuffer)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const sanitize = (s: string) =>
        s.trim().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
      const fileName = `${sanitize(tile.name)}_${sanitize(moduleName)}_QA.docx`;

      // Headless (server) runs have no `document` to build a download link
      // with; the course-tile save below still carries the file.
      if (typeof document !== "undefined") {
        onProgress(`Downloading ${fileName}...`);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      if (helpers.saveCourseMaterialFile) {
        try {
          await helpers.saveCourseMaterialFile(tile.id, blob, fileName);
          const base64 = await blobToBase64(blob);
          const lib = await saveLibraryFileAction({
            name: fileName,
            base64,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            fileExt: "docx",
            workflowId: helpers.workflowId,
            workflowName: helpers.workflowName,
            workflowRunId: helpers.workflowRunId,
          });
          if ("error" in lib) {
            allNotes.push(`library save skipped: ${lib.error}`);
          }
        } catch (err) {
          allNotes.push(
            `saving to the course tile failed: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }

      return {
        outputs: { qaText, moduleName },
        summary: {
          kind: "list",
          label: `${r.questions.length} anticipated question(s) for ${moduleName} -> ${fileName}`,
          items: [
            ...r.questions.map((q) => q.question),
            materialsSource,
            ...(slideFiles.length > 0
              ? [`slides included: ${slideFiles.map((f) => f.name).join(", ")}`]
              : []),
            ...allNotes,
          ],
        },
      };
    },
  },

  {
    type: "tech-report",
    name: "New-tech report",
    description:
      "Analyze the selected courses' materials and produce a report of emerging-technology opportunities with integration recommendations.",
    inputs: [
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: true,
      },
      {
        key: "collectImprovements",
        label: "Ask for improvements",
        type: "boolean",
        required: false,
        help: "Pause after the report to collect improvement instructions for the Copilot step.",
      },
    ],
    outputs: [
      { key: "report", label: "Report text", type: "longtext" },
      { key: "improvements", label: "Improvements", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const payloads: Array<{
        name: string;
        topics: string;
        syllabusText: string;
        textbook: string;
        repoDigest: string;
        modulesSummary: string;
        assignmentsSummary: string;
      }> = [];

      const missing: string[] = [];

      for (const id of ids) {
        const tile = hub.courses.find((c) => c.id === id);
        if (!tile) {
          missing.push(`${id}: not found`);
          continue;
        }

        onProgress(`Gathering ${tile.name}...`);

        // Every enrichment fails forward to "" so a missing syllabus or a
        // dead LMS connection never blocks the analysis.
        let syllabusText = "";
        if (tile.syllabusId?.trim()) {
          try {
            const s = await previewFinalizedSyllabusAction(tile.syllabusId);
            if (!("error" in s)) {
              syllabusText = s.paragraphs.map((p) => p.text).join("\n");
            }
          } catch {
            // Fail-forward to "".
          }
        }

        let modulesSummary = "";
        let assignmentsSummary = "";
        const canvasUrl = (tile.canvasUrl ?? "").trim();
        if (canvasUrl) {
          try {
            const content = await listCourseContentAction(
              canvasUrl,
              helpers.activeInstitution || undefined
            );
            if (!("error" in content)) {
              modulesSummary = content.modules.map((m) => m.name).join("\n");

              const byType = new Map<string, string[]>();
              for (const m of content.modules) {
                for (const item of m.items) {
                  if (!byType.has(item.type)) byType.set(item.type, []);
                  byType.get(item.type)!.push(item.title);
                }
              }
              assignmentsSummary = Array.from(byType.entries())
                .map(([type, titles]) => `${type}: ${titles.join("; ")}`)
                .join("\n");
            }
          } catch {
            // Fail-forward to "".
          }
        }

        payloads.push({
          name: tile.name,
          topics: tile.topics ?? "",
          syllabusText,
          textbook: tile.textbook ?? "",
          repoDigest: tile.repos.map((r) => r.repo).join(", "),
          modulesSummary,
          assignmentsSummary,
        });
      }

      if (payloads.length === 0) {
        throw new Error("None of the selected course tiles exist anymore.");
      }

      onProgress("Analyzing courses...");
      const r = await analyzeCourseTechAction(payloads, helpers.provider);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const combined = r.reports
        .map((rep) => `# ${rep.name}\n${rep.report}`)
        .join("\n\n");

      onProgress("Building the report document...");
      const docxData = await buildDocxFromPlainText(
        combined,
        undefined,
        helpers.author
      );
      const blob = new Blob([docxData], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "new_tech_report.docx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const result: StepRunResult = {
        outputs: { report: combined, improvements: "" },
        summary: {
          kind: "list",
          label: `Analyzed ${r.reports.length} course(s)`,
          items: [
            ...r.reports.map(
              (rep) =>
                `${rep.name}: ${
                  rep.report.split("\n").find((l) => l.trim())?.trim() ?? ""
                }`
            ),
            "Full report downloaded (new_tech_report.docx)",
            ...missing,
          ],
        },
      };

      if (String(values.collectImprovements ?? "") === "1") {
        result.requireInput = {
          message:
            "Review the report, then list the improvements the Copilot agent should make to the course repositories - one per line.",
          key: "improvements",
          kind: "text",
        };
      }

      return result;
    },
  },

  {
    type: "draft-weekly-study-guides",
    name: "Draft weekly study guides",
    description: "For every selected course tile, build study guides for the coming weeks - overview, key concepts, cited readings from the research library, and self-check questions - saved to the course tile and the Files tab as Word documents. Optionally also create each guide as an UNPUBLISHED Canvas page. The week's topic comes from the live LMS first, then the course's LMS export, then the tile's schedule CSV, then its topics list.",
    inputs: [
      {
        key: "courses",
        label: "Course tiles",
        type: "hubCourseList",
        required: true,
        help: "One, several, or all course tiles.",
      },
      {
        key: "lookahead",
        label: "How far ahead",
        type: "lookahead",
        required: false,
        help: "How far ahead to prepare. Default 7 days (the coming week); 14 days prepares the next two weeks.",
      },
      {
        key: "citations",
        label: "Cited sources",
        type: "number",
        required: false,
        help: "How many cited readings to pull from research. Default 4.",
      },
      {
        key: "extraNotes",
        label: "Extra notes (optional)",
        type: "longtext",
        required: false,
        help: "Folded into every guide (e.g. emphasize exam-relevant material).",
      },
      {
        key: "publish",
        label: "Create Canvas pages?",
        type: "boolean",
        required: false,
        help: "Also create each guide as an UNPUBLISHED page in the tile's Canvas course.",
      },
    ],
    outputs: [
      { key: "report", label: "Report", type: "longtext" },
      { key: "generated", label: "Guides generated", type: "number" },
      { key: "hasGenerated", label: "Any generated?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (ids.length === 0) {
        throw new Error("Select at least one course tile.");
      }

      const lookaheadRaw = String(values.lookahead ?? "").trim();
      const daysAhead = Number.isFinite(Number(lookaheadRaw)) && Number(lookaheadRaw) >= 1
        ? Math.floor(Number(lookaheadRaw))
        : 7;
      const weeksAhead = Math.max(1, Math.min(4, Math.ceil(daysAhead / 7)));

      let citationsVal = Number(values.citations ?? 4);
      if (Number.isNaN(citationsVal) || citationsVal < 1 || citationsVal > 8) {
        citationsVal = 4;
      } else {
        citationsVal = Math.round(citationsVal);
      }

      const extraNotes = String(values.extraNotes ?? "").trim();
      const publish = String(values.publish ?? "").trim() === "1";

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const reportLines: string[] = [];
      let generated = 0;

      const sanitize = (s: string) =>
        s.trim().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");

      for (const id of ids) {
        const tile = hub.courses.find((c) => c.id === id);
        if (!tile) {
          reportLines.push(`${id}: course tile not found - skipped`);
          continue;
        }

        try {
          const weekResolution = await resolveTileCurrentWeek(tile, helpers);
          const nw = nextLectureWeek({
            startDate: tile.startDate,
            weeks: tile.weeks,
            nowMs: Date.now(),
            rawWeek: "skip" in weekResolution ? undefined : weekResolution.rawWeek,
          });

          if ("skip" in nw) {
            reportLines.push(`${tile.name}: skipped - ${nw.skip}.`);
            continue;
          }

          const startWeek = nw.week;
          let sourceNote = "skip" in weekResolution ? "" : (weekResolution.source === "deadlines" ? " (from module deadlines)" : "");
          let tileSuccessCount = 0;
          let tileEndWeek = startWeek + weeksAhead - 1;

          for (let w = 0; w < weeksAhead; w++) {
            const targetWeek = startWeek + w;

            if (tile.weeks && tile.weeks > 0 && targetWeek > tile.weeks) {
              if (w === 0) {
                reportLines.push(`${tile.name}: skipped - target week ${targetWeek} is past course end.`);
              }
              tileEndWeek = targetWeek - 1;
              break;
            }

            try {
              onProgress(`Generating study guide for ${tile.name}, week ${targetWeek}...`);

              const weekTopic = await loadTileWeekTopic(tile, targetWeek, helpers);
              if ("skip" in weekTopic) {
                if (w === 0) {
                  reportLines.push(`${tile.name}: skipped - ${weekTopic.skip}.`);
                }
                tileEndWeek = targetWeek - 1;
                break;
              }

              const topic = weekTopic.topic;
              const summary = weekTopic.summary;
              if (w === 0) {
                sourceNote = weekTopic.source !== "schedule"
                  ? ` (topic from the ${
                      weekTopic.source === "live"
                        ? "live LMS"
                        : weekTopic.source === "export"
                          ? "LMS export"
                          : "tile's topics list"
                    })`
                  : "";
              }

              let researchText = "";
              try {
                onProgress(`Researching for ${tile.name}, week ${targetWeek}...`);
                const researchResult = await researchTopicAction(topic, citationsVal);
                if ("error" in researchResult) {
                  reportLines.push(`${tile.name}, week ${targetWeek}: research skipped - ${researchResult.error}`);
                } else {
                  const items: string[] = [];
                  for (const result of researchResult.results) {
                    items.push(result.title);
                    items.push(`Source: ${result.source}`);
                    if (result.url) {
                      items.push(`URL: ${result.url}`);
                    }
                    items.push("");
                    items.push(result.summary);
                    items.push("");
                  }
                  if (items.length > 0) {
                    researchText = items.join("\n").trim();
                  }
                }
              } catch (err) {
                // Research fail-forward: continue with empty citations section
                reportLines.push(`${tile.name}, week ${targetWeek}: research skipped - ${err instanceof Error ? err.message : "unknown error"}`);
              }

              const prompt = [
                `# ${tile.name} - Week ${targetWeek} Study Guide`,
                "",
                "## Overview",
                `${topic}`,
                "",
                summary,
                extraNotes ? `\n${extraNotes}` : "",
                "",
                "## Key Concepts",
                topic.split(/[,;]/).map((c) => `- ${c.trim()}`).filter((c) => c.length > 2).slice(0, 5).join("\n"),
                "",
                "## Readings and Sources",
                researchText || "(No research results found)",
                "",
                "## Check Yourself",
                "1. What is the main concept of this week?",
                "2. How does this week build on previous topics?",
                "3. What are the key takeaways?",
                "4. How might this apply to real-world scenarios?",
                "5. What questions do you still have?",
              ].filter(Boolean).join("\n");

              const gen = await generateDocumentTextAction(prompt, helpers.provider);
              const text = ("text" in gen) ? gen.text : prompt;

              const docx = await buildDocxFromPlainText(text, [], helpers.author);
              const blob = new Blob([new Uint8Array(docx)], {
                type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              });
              const fileName = `${sanitize(tile.name)}_Week${targetWeek}_StudyGuide.docx`;

              if (helpers.saveCourseMaterialFile) {
                try {
                  await helpers.saveCourseMaterialFile(tile.id, blob, fileName);
                  const base64 = await blobToBase64(blob);
                  const lib = await saveLibraryFileAction({
                    name: fileName,
                    base64,
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    fileExt: "docx",
                    workflowId: helpers.workflowId,
                    workflowName: helpers.workflowName,
                    workflowRunId: helpers.workflowRunId,
                  });
                  if ("error" in lib) {
                    reportLines.push(`${tile.name}: library save skipped - ${lib.error}`);
                  }
                } catch (err) {
                  reportLines.push(
                    `${tile.name}: saving to course tile failed - ${err instanceof Error ? err.message : String(err)}`
                  );
                }
              }

              if (publish && tile.canvasUrl) {
                try {
                  await createPageAction(
                    tile.canvasUrl,
                    {
                      title: `Week ${targetWeek}: Study Guide`,
                      body: markdownLiteToHtml(text),
                      published: false,
                    },
                    tile.institution ?? undefined
                  );
                } catch {
                  // Canvas page creation fail-forward: note only
                  reportLines.push(
                    `${tile.name}, week ${targetWeek}: Canvas page creation skipped`
                  );
                }
              }

              tileSuccessCount++;
              generated++;
            } catch (err) {
              reportLines.push(
                `${tile.name}, week ${targetWeek}: ${err instanceof Error ? err.message : "failed"}`
              );
            }
          }

          if (tileSuccessCount > 0) {
            reportLines.push(
              `${tile.name}: generated guide${weeksAhead > 1 ? `s for weeks ${startWeek}-${tileEndWeek}` : ` for week ${startWeek}`}${sourceNote}`
            );
          }
        } catch (err) {
          reportLines.push(
            `${tile.name}: ${err instanceof Error ? err.message : "failed"}`
          );
        }
      }

      const report = reportLines.join("\n");
      return {
        outputs: {
          report,
          generated: String(generated),
          hasGenerated: generated > 0 ? "1" : "",
        },
        summary: { kind: "text", text: report },
      };
    },
  },

  {
    type: "extract-topics-from-repo",
    name: "Extract topics from a repo",
    description: "Mine a repository's contents for a structured list of course topics, to seed schedule or content generation.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
    ],
    outputs: [
      { key: "topics", label: "Topics", type: "longtext" },
      { key: "hasTopics", label: "Has topics", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      onProgress("Reading repository topics...");
      const r = await extractTopicsFromRepoAction(repo, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: { topics: r.topics.join("\n"), hasTopics: r.topics.length > 0 ? "1" : "" },
        summary: {
          kind: "list",
          label: `${r.topics.length} topic(s)`,
          items: r.topics.length ? r.topics : ["(none found)"],
        },
      };
    },
  },

  {
    type: "generate-module-intro",
    name: "Generate a module introduction",
    description: "Produce a module overview plus key-terms text from the week's objectives, ready to save as a module intro.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile (optional)",
        type: "hubCourse",
        required: false,
        help: "Scope the workflow to a course tile (or bind one) to auto-fill the objectives from its current module - no need to paste them.",
      },
      {
        key: "objectives",
        label: "Module objectives",
        type: "longtext",
        required: false,
        courseDerived: true,
      },
      {
        key: "context",
        label: "Context",
        type: "longtext",
        required: false,
        help: "Optional source material to draw on.",
      },
      {
        key: "modulesAhead",
        label: "Modules ahead",
        type: "moduleOffset",
        required: false,
        help: "How many modules past the current one to target. 0 or blank = the current module.",
      },
    ],
    outputs: [
      { key: "intro", label: "Module intro", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const objectives = await resolveModuleObjectives(values, helpers);
      if (!objectives) {
        throw new Error("Provide the module objectives, or scope/bind a course tile to derive them from its current module.");
      }
      const context = String(values.context ?? "");

      onProgress("Generating module intro...");
      const r = await generateModuleIntroAction(objectives, context, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      const intro = [r.overview, r.keyTerms ? "Key terms:\n" + r.keyTerms : ""].filter(Boolean).join("\n\n");

      return {
        outputs: { intro },
        summary: { kind: "text", text: intro },
      };
    },
  },

  {
    type: "generate-lesson-plan",
    name: "Generate a lesson plan",
    description: "Generate a lesson plan (slides and talking points) from a module's objectives.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile (optional)",
        type: "hubCourse",
        required: false,
        help: "Scope the workflow to a course tile (or bind one) to auto-fill the objectives from its current module - no need to paste them.",
      },
      { key: "objectives", label: "Module objectives", type: "longtext", required: false, courseDerived: true },
      { key: "context", label: "Context", type: "longtext", required: false, help: "Optional source material." },
      {
        key: "modulesAhead",
        label: "Modules ahead",
        type: "moduleOffset",
        required: false,
        help: "How many modules past the current one to target. 0 or blank = the current module.",
      },
    ],
    outputs: [
      { key: "lessonPlan", label: "Lesson plan", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const objectives = await resolveModuleObjectives(values, helpers);
      if (!objectives) {
        throw new Error("Provide the module objectives, or scope/bind a course tile to derive them from its current module.");
      }
      const context = String(values.context ?? "");

      onProgress("Generating lesson plan...");
      const r = await generateLessonPlanAction(objectives, context, [], undefined, undefined, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      const lines: string[] = [];
      for (const slide of r.slides) {
        lines.push(`${slide.title}\n`);
        for (const bullet of slide.bullets) {
          lines.push(`- ${bullet}`);
        }
        if (slide.code) {
          lines.push(`\n(Code: ${slide.codeLanguage || "code"})\n${slide.code}\n`);
        }
        lines.push("");
      }
      const lessonPlan = lines.join("\n").trim();

      const items = r.slides.map((s) => s.title).length > 0 ? r.slides.map((s) => s.title) : ["(generated)"];

      return {
        outputs: { lessonPlan },
        summary: { kind: "list", label: `Lesson plan (${r.slides.length} slides)`, items },
      };
    },
  },

  {
    type: "generate-worked-examples",
    name: "Generate worked examples",
    description: "Produce worked examples per concept from a module's objectives, for use in a lecture or handout.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile (optional)",
        type: "hubCourse",
        required: false,
        help: "Scope the workflow to a course tile (or bind one) to auto-fill the objectives from its current module - no need to paste them.",
      },
      {
        key: "objectives",
        label: "Module objectives",
        type: "longtext",
        required: false,
        courseDerived: true,
      },
      {
        key: "context",
        label: "Context",
        type: "longtext",
        required: false,
        help: "Optional source material.",
      },
      {
        key: "slides",
        label: "Slides (optional)",
        type: "uploads",
        required: false,
        help: "Attach a .pptx deck to ground the examples in your slides.",
        accept: ".pptx",
      },
      {
        key: "modulesAhead",
        label: "Modules ahead",
        type: "moduleOffset",
        required: false,
        help: "How many modules past the current one to target. 0 or blank = the current module.",
      },
    ],
    outputs: [
      {
        key: "examples",
        label: "Worked examples",
        type: "longtext",
      },
    ],
    run: async (values, helpers, onProgress) => {
      const objectives = await resolveModuleObjectives(values, helpers);
      if (!objectives) {
        throw new Error("Provide the module objectives, or scope/bind a course tile to derive them from its current module.");
      }

      const context = String(values.context ?? "");

      // Optional .pptx uploads: extract the deck's slide text and fold it into
      // the context so examples are grounded in the actual slides. Uploads never
      // persist to an unattended run (they resolve to []), so this is a no-op there.
      const slideUploads = Array.isArray(values.slides) ? (values.slides as File[]) : [];
      const MAX_SLIDE_FILES = 3;
      const MAX_SLIDE_BYTES = 6 * 1024 * 1024;
      const slideBlocks: string[] = [];
      for (const file of slideUploads.slice(0, MAX_SLIDE_FILES)) {
        if (file.size > MAX_SLIDE_BYTES) continue;
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          const CHUNK = 0x8000;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
          }
          const extracted = await extractPptxSlidesAction(btoa(binary));
          if ("error" in extracted) continue;
          for (const s of extracted.slides) {
            slideBlocks.push(`Slide ${s.slide}: ${s.title}${s.text ? `\n${s.text}` : ""}`);
          }
        } catch {
          // skip a file we cannot read; the run continues with whatever we have
        }
      }
      const contextWithSlides = [context, slideBlocks.join("\n\n")]
        .filter((t) => t.trim())
        .join("\n\n");

      onProgress("Generating worked examples...");
      const r = await generateExamplesAction(objectives, contextWithSlides, [], helpers.provider);

      if ("error" in r) {
        throw new Error(r.error);
      }

      const lines: string[] = [];
      lines.push(`Lesson Type: ${r.lessonType}`);
      lines.push("");

      for (const example of r.examples) {
        lines.push(`## ${example.concept}`);
        lines.push(`Title: ${example.title}`);
        lines.push(`${example.content}`);
        lines.push("");
      }

      const examples = lines.join("\n").trim();
      const items = r.examples.map((e) => e.concept).length > 0 ? r.examples.map((e) => e.concept) : ["(generated)"];

      return {
        outputs: { examples },
        summary: { kind: "list", label: "Worked examples", items },
      };
    },
  },

  {
    type: "generate-document",
    name: "Generate a document",
    description: "Generate a handout or document (overview, details, key terms, summary) from a freeform prompt.",
    inputs: [
      {
        key: "prompt",
        label: "What should the document cover?",
        type: "longtext",
        required: true,
      },
    ],
    outputs: [
      { key: "document", label: "Document", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const prompt = String(values.prompt ?? "").trim();
      if (!prompt) {
        throw new Error("Describe the document to generate first.");
      }

      onProgress("Generating document...");
      const r = await generateDocumentTextAction(prompt, helpers.provider);
      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { document: r.text },
        summary: { kind: "text", text: r.text },
      };
    },
  },

  {
    type: "revise-generated-document",
    name: "Revise a document",
    description: "Apply a natural-language edit instruction (replace, retitle, remove a section, add a bullet, shorten) to a generated markdown document.",
    inputs: [
      {
        key: "document",
        label: "Document",
        type: "longtext",
        required: true,
      },
      {
        key: "instruction",
        label: "Edit instruction",
        type: "text",
        required: true,
        help: "e.g. 'remove the Prerequisites section', 'shorten the overview'.",
      },
    ],
    outputs: [
      { key: "document", label: "Revised document", type: "longtext" },
      { key: "applied", label: "Edit applied", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const document = String(values.document ?? "").trim();
      if (!document) {
        throw new Error("Provide the document to revise.");
      }

      const instruction = String(values.instruction ?? "").trim();
      if (!instruction) {
        throw new Error("Provide the edit instruction.");
      }

      onProgress("Applying edit...");
      const result = applyTextRevision(document, instruction);

      return {
        outputs: {
          document: result.text,
          applied: result.applied ? "1" : "",
        },
        summary: {
          kind: "text",
          text: result.applied ? result.text : "Could not parse that edit instruction; document unchanged.",
        },
      };
    },
  },

  {
    type: "find-practice-problems",
    name: "Find practice problems",
    description: "Retrieve hand-verified practice problems (example, prompt, solution) for a topic from the curated knowledge base.",
    inputs: [
      { key: "topic", label: "Topic", type: "text", required: true },
      { key: "count", label: "How many", type: "number", required: false, help: "Default 3." }
    ],
    outputs: [
      { key: "problems", label: "Practice problems", type: "longtext" },
      { key: "count", label: "Count", type: "number" }
    ],
    run: async (values, helpers, onProgress) => {
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide a topic.");

      const countRaw = String(values.count ?? "").trim();
      const limit = countRaw && Number.isInteger(Number(countRaw)) && Number(countRaw) > 0 ? Number(countRaw) : 3;

      onProgress("Finding practice problems...");
      const r = await findPracticeProblemsAction(topic, limit);
      if ("error" in r) throw new Error(r.error);

      const items: string[] = [];
      const lines: string[] = [];

      for (const problem of r.problems) {
        items.push(problem.title);
        lines.push(`[${problem.language}] ${problem.title}`);
        lines.push("");
        lines.push("Prompt:");
        lines.push(problem.prompt);
        lines.push("");
        lines.push("Example:");
        lines.push(problem.exampleCode);
        lines.push("");
        lines.push("Solution:");
        lines.push(problem.solutionCode);
        lines.push("");
        lines.push("---");
        lines.push("");
      }

      const problems = lines.join("\n").trim();
      return {
        outputs: { problems, count: r.problems.length },
        summary: { kind: "list", label: `${r.problems.length} problem(s)`, items: items.length ? items : ["(none found)"] }
      };
    },
  },

  {
    type: "draft-upcoming-lectures",
    name: "Draft next week's lectures",
    description:
      "For every selected course tile, detect NEXT week's module and draft a lesson plan, a lecture script, and a slide deck into the tile's materials, grounded in everything in the week's module (topics, objectives, homework/assignment descriptions, pages, files). The week's topic comes from the live LMS first, then the course's LMS export, then the tile's schedule CSV, then its topics list. Courses that are finished, not yet near their start, or where no topic is found are skipped with a note. Slides are styled by a PPT Design template (Classic Lecture by default). All artifacts are saved to the course tile and the Files tab.",
    inputs: [
      {
        key: "courses",
        label: "Course tiles",
        type: "hubCourseList",
        required: true,
        help: "One, several, or all course tiles.",
      },
      {
        key: "minutes",
        label: "Script minutes",
        type: "number",
        required: false,
        help: "Target lecture script length in minutes (1-30). Default 20.",
      },
      {
        key: "lookahead",
        label: "How far ahead",
        type: "lookahead",
        required: false,
        help: "How far ahead to prepare. Default 7 days (the coming week); 14 days prepares the next two weeks.",
      },
      {
        key: "extraNotes",
        label: "Extra notes (optional)",
        type: "longtext",
        required: false,
        help: "Optional guidance folded into every generated document.",
      },
      {
        key: "template",
        label: "Deck template",
        type: "deckTemplate",
        required: false,
        help: "A PPT Design template that styles the generated slides. Blank uses Classic Lecture (the app's standard look). Slide content still comes from this step's own generator.",
      },
      {
        key: "includeNarration",
        label: "Narrated audio?",
        type: "boolean",
        required: false,
        help: "Also synthesize a narrated mp3 of each lecture script (ElevenLabs) for asynchronous students.",
      },
    ],
    outputs: [
      { key: "report", label: "Report", type: "longtext" },
      { key: "prepared", label: "Courses prepared", type: "number" },
      { key: "hasPrepared", label: "Any prepared?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (ids.length === 0) {
        throw new Error("Select at least one course tile.");
      }

      let minutesVal = Number(values.minutes ?? 20);
      if (Number.isNaN(minutesVal) || minutesVal < 1 || minutesVal > 30) {
        minutesVal = 20;
      } else {
        minutesVal = Math.round(minutesVal);
      }

      const lookaheadRaw = String(values.lookahead ?? "").trim();
      const daysAhead = Number.isFinite(Number(lookaheadRaw)) && Number(lookaheadRaw) >= 1
        ? Math.floor(Number(lookaheadRaw))
        : 7;
      const weeksAhead = Math.max(1, Math.min(4, Math.ceil(daysAhead / 7)));

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const deck = await resolveDeckTheme(values.template);
      if (deck.note) onProgress(deck.note);

      const extraNotes = String(values.extraNotes ?? "").trim();
      const reportLines: string[] = [];
      let prepared = 0;

      for (const id of ids) {
        const tile = hub.courses.find((c) => c.id === id);
        if (!tile) {
          reportLines.push(`${id}: course tile not found - skipped`);
          continue;
        }

        try {
          onProgress(`Drafting week for ${tile.name}...`);
          const weekResolution = await resolveTileCurrentWeek(tile, helpers);
          const nw = nextLectureWeek({
            startDate: tile.startDate,
            weeks: tile.weeks,
            nowMs: Date.now(),
            rawWeek: "skip" in weekResolution ? undefined : weekResolution.rawWeek,
          });

          if ("skip" in nw) {
            reportLines.push(`${tile.name}: skipped - ${nw.skip}.`);
            continue;
          }

          const startWeek = nw.week;
          let sourceNote = "skip" in weekResolution ? "" : (weekResolution.source === "deadlines" ? " (from module deadlines)" : "");
          let tileSuccessCount = 0;
          let tileEndWeek = startWeek;
          let tileGroundedInModules = false;
          const sanitize = (s: string) =>
            s.trim().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");

          for (let w = 0; w < weeksAhead; w++) {
            const targetWeek = startWeek + w;

            if (tile.weeks && tile.weeks > 0 && targetWeek > tile.weeks) {
              if (w === 0) {
                reportLines.push(`${tile.name}: skipped - target week ${targetWeek} is past course end.`);
              }
              break;
            }

            try {
              const weekTopic = await loadTileWeekTopic(tile, targetWeek, helpers);
              if ("skip" in weekTopic) {
                if (w === 0) {
                  reportLines.push(`${tile.name}: skipped - ${weekTopic.skip}.`);
                }
                break;
              }

              const topic = weekTopic.topic;
              const summary = weekTopic.summary;
              if (w === 0) {
                sourceNote = weekTopic.source !== "schedule"
                  ? ` (topic from the ${
                      weekTopic.source === "live"
                        ? "live LMS"
                        : weekTopic.source === "export"
                          ? "LMS export"
                          : "tile's topics list"
                    })`
                  : "";
              }

              // Try to gather module materials to ground the lecture in the week's full content
              let modulesText = "";
              let groundedInModules = false;
              try {
                // Priority 1: Try live modules first
                type ModuleItem = { title?: string | null; name?: string | null; position?: number; id?: number };
                let moduleFound: ModuleItem | null = null;
                if (tile.canvasUrl) {
                  const cached = getCachedLiveModules(tile.canvasUrl);
                  if (cached) {
                    moduleFound = findModuleForWeek(cached, targetWeek);
                  }
                }

                // Priority 2: Try export modules if live didn't work
                if (!moduleFound && helpers.loadCourseExport) {
                  try {
                    const exported = await helpers.loadCourseExport(tile.id);
                    if (exported && typeof exported === "object" && "modules" in exported) {
                      const exportedModules = (exported as { modules: unknown[] }).modules.map((m: unknown) => {
                        const mod = m as { name: string; position: number; items: unknown[] };
                        return {
                          title: mod.name,
                          name: mod.name,
                          position: mod.position,
                        };
                      });
                      moduleFound = findModuleForWeek(exportedModules, targetWeek);
                    }
                  } catch {
                    // Silent fallback
                  }
                }

                // If module found, gather its materials
                if (moduleFound) {
                  const moduleTitle = moduleFound.title ?? moduleFound.name ?? "";
                  let moduleId = "";
                  if (tile.canvasUrl && moduleFound.id) {
                    // Live module
                    moduleId = liveModuleValue(moduleFound.id, moduleTitle);
                  } else {
                    // Export module
                    moduleId = exportModuleValue(moduleTitle);
                  }

                  try {
                    const gathered = await gatherModuleMaterials(tile, moduleId, helpers, onProgress);
                    if (gathered.materialsText.trim()) {
                      // Cap module materials at 12000 chars as per spec
                      modulesText = gathered.materialsText.trim().slice(0, 12000);
                      if (modulesText.length < gathered.materialsText.length) {
                        modulesText += "\n(module materials truncated)";
                      }
                      groundedInModules = true;
                    }
                  } catch {
                    // Silent fallback - proceed without module materials
                  }
                }
              } catch {
                // Silent fallback - proceed without module materials
              }

              const baseObjectives = extraNotes
                ? `Topic: ${topic}\n${summary}\n${extraNotes}`
                : `Topic: ${topic}\n${summary}`;
              const objectives = modulesText
                ? `${baseObjectives}\n\nModule materials (topics, objectives, homework, pages):\n${modulesText}`
                : baseObjectives;

              let tilePrepared = false;
              let scriptResult: { script: string } | undefined;

              try {
                onProgress(`Generating lecture script for ${tile.name}, week ${targetWeek}...`);
                const result = await generateLectureScriptAction(
                  topic,
                  objectives,
                  minutesVal,
                  helpers.provider
                );
                if ("error" in result) {
                  throw new Error(result.error);
                }
                scriptResult = result;

                const scriptText = [
                  `# ${tile.name} - Week ${targetWeek} Lecture Script`,
                  `## ${topic}`,
                  scriptResult.script,
                ].join("\n");
                const scriptDocx = await buildDocxFromPlainText(scriptText, [], helpers.author);
                const scriptBlob = new Blob([new Uint8Array(scriptDocx)], {
                  type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                });
                const scriptFileName = `${sanitize(tile.name)}_Week${targetWeek}_LectureScript.docx`;

                if (helpers.saveCourseMaterialFile) {
                  try {
                    await helpers.saveCourseMaterialFile(tile.id, scriptBlob, scriptFileName);
                    tilePrepared = true;
                    const scriptBase64 = await blobToBase64(scriptBlob);
                    const scriptLib = await saveLibraryFileAction({
                      name: scriptFileName,
                      base64: scriptBase64,
                      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                      fileExt: "docx",
                      workflowId: helpers.workflowId,
                      workflowName: helpers.workflowName,
                      workflowRunId: helpers.workflowRunId,
                    });
                    if ("error" in scriptLib) {
                      reportLines.push(`${tile.name}: library save skipped - ${scriptLib.error}`);
                    }
                  } catch (err) {
                    reportLines.push(
                      `${tile.name}: failed to save lecture script - ${
                        err instanceof Error ? err.message : String(err)
                      }`
                    );
                  }
                } else {
                  reportLines.push(`${tile.name}: sign in to save files`);
                }
              } catch (err) {
                reportLines.push(
                  `${tile.name}, week ${targetWeek}: lecture script generation failed - ${
                    err instanceof Error ? err.message : String(err)
                  }`
                );
              }

              try {
                onProgress(`Generating lesson plan for ${tile.name}, week ${targetWeek}...`);
                const planResult = await generateLessonPlanAction(
                  objectives,
                  modulesText || String(extraNotes ?? ""),
                  [],
                  undefined,
                  undefined,
                  helpers.provider
                );
                if ("error" in planResult) {
                  throw new Error(planResult.error);
                }

                const planLines: string[] = [
                  `# ${tile.name} - Week ${targetWeek} Lesson Plan`,
                ];
                for (const slide of planResult.slides) {
                  planLines.push(slide.title);
                  for (const bullet of slide.bullets) {
                    planLines.push(`- ${bullet}`);
                  }
                  if (slide.code) {
                    planLines.push(
                      `\n(Code: ${slide.codeLanguage || "code"})\n${slide.code}\n`
                    );
                  }
                  planLines.push("");
                }
                const planDocx = await buildDocxFromPlainText(planLines.join("\n"), [], helpers.author);
                const planBlob = new Blob([new Uint8Array(planDocx)], {
                  type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                });
                const planFileName = `${sanitize(tile.name)}_Week${targetWeek}_LessonPlan.docx`;

                if (helpers.saveCourseMaterialFile) {
                  try {
                    await helpers.saveCourseMaterialFile(tile.id, planBlob, planFileName);
                    tilePrepared = true;
                    const planBase64 = await blobToBase64(planBlob);
                    const planLib = await saveLibraryFileAction({
                      name: planFileName,
                      base64: planBase64,
                      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                      fileExt: "docx",
                      workflowId: helpers.workflowId,
                      workflowName: helpers.workflowName,
                      workflowRunId: helpers.workflowRunId,
                    });
                    if ("error" in planLib) {
                      reportLines.push(`${tile.name}: library save skipped - ${planLib.error}`);
                    }
                  } catch (err) {
                    reportLines.push(
                      `${tile.name}: failed to save lesson plan - ${
                        err instanceof Error ? err.message : String(err)
                      }`
                    );
                  }
                }
              } catch (err) {
                reportLines.push(
                  `${tile.name}, week ${targetWeek}: lesson plan generation failed - ${
                    err instanceof Error ? err.message : String(err)
                  }`
                );
              }

              try {
                onProgress(`Generating slides for ${tile.name}, week ${targetWeek}...`);
                const slidePrompt = modulesText
                  ? `Create a lecture slide deck for week ${targetWeek} of ${tile.name} on "${topic}". ${summary}${extraNotes ? ` ${extraNotes}` : ""}\n\nModule materials (topics, objectives, homework, pages):\n${modulesText}`
                  : `Create a lecture slide deck for week ${targetWeek} of ${tile.name} on "${topic}". ${summary}${extraNotes ? ` ${extraNotes}` : ""}`;
                const slideResult = await generateSlidesAction(slidePrompt, helpers.provider);
                if ("error" in slideResult) {
                  throw new Error(slideResult.error);
                }

                const pptxData = await buildSlidesPptx({
                  presentationTitle: slideResult.presentationTitle,
                  slides: slideResult.slides,
                  subtitle: `Week ${targetWeek} - ${topic}`,
                  author: helpers.author,
                  theme: deck.theme,
                });
                const slideBlob = new Blob([pptxData], {
                  type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                });
                const slideFileName = `${sanitize(tile.name)}_Week${targetWeek}_Slides.pptx`;

                if (helpers.saveCourseMaterialFile) {
                  try {
                    await helpers.saveCourseMaterialFile(tile.id, slideBlob, slideFileName);
                    tilePrepared = true;
                    const slideBase64 = await blobToBase64(slideBlob);
                    const slideLib = await saveLibraryFileAction({
                      name: slideFileName,
                      base64: slideBase64,
                      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                      fileExt: "pptx",
                      workflowId: helpers.workflowId,
                      workflowName: helpers.workflowName,
                      workflowRunId: helpers.workflowRunId,
                    });
                    if ("error" in slideLib) {
                      reportLines.push(`${tile.name}: library save skipped - ${slideLib.error}`);
                    }
                  } catch (err) {
                    reportLines.push(
                      `${tile.name}: failed to save slides - ${
                        err instanceof Error ? err.message : String(err)
                      }`
                    );
                  }
                }
              } catch (err) {
                reportLines.push(
                  `${tile.name}, week ${targetWeek}: slide generation failed - ${
                    err instanceof Error ? err.message : String(err)
                  }`
                );
              }

              if (tilePrepared && String(values.includeNarration ?? "") === "1" && scriptResult) {
                try {
                  onProgress(`Synthesizing narration for ${tile.name}, week ${targetWeek}...`);
                  const narResult = await synthesizeLongNarrationAction(scriptResult.script, undefined);
                  if ("error" in narResult) {
                    reportLines.push(
                      `${tile.name}, week ${targetWeek}: narration synthesis failed - ${narResult.error}`
                    );
                  } else {
                    const narFileName = `${sanitize(tile.name)}_Week${targetWeek}_Narration.mp3`;
                    if (helpers.saveCourseMaterialFile) {
                      try {
                        const narBlob = base64ToBlob(narResult.base64, narResult.mimeType);
                        await helpers.saveCourseMaterialFile(tile.id, narBlob, narFileName);
                        const narLib = await saveLibraryFileAction({
                          name: narFileName,
                          base64: narResult.base64,
                          mimeType: narResult.mimeType,
                          fileExt: "mp3",
                          workflowId: helpers.workflowId,
                          workflowName: helpers.workflowName,
                          workflowRunId: helpers.workflowRunId,
                        });
                        if ("error" in narLib) {
                          reportLines.push(`${tile.name}: library save skipped - ${narLib.error}`);
                        }
                      } catch (err) {
                        reportLines.push(
                          `${tile.name}: failed to save narration - ${
                            err instanceof Error ? err.message : String(err)
                          }`
                        );
                      }
                    }
                  }
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  if (msg.includes("ELEVENLABS_API_KEY")) {
                    reportLines.push(`${tile.name}, week ${targetWeek}: narration unavailable (missing ElevenLabs API key)`);
                  } else {
                    reportLines.push(`${tile.name}, week ${targetWeek}: narration synthesis failed - ${msg}`);
                  }
                }
              }

              if (tilePrepared) {
                prepared++;
                tileSuccessCount++;
                tileEndWeek = targetWeek;
                if (groundedInModules) {
                  tileGroundedInModules = true;
                }
              }
            } catch (err) {
              reportLines.push(
                `${tile.name}, week ${targetWeek}: ${err instanceof Error ? err.message : "failed"}`
              );
            }
          }

          // Mirror the sibling weekly generators: only claim success when at
          // least one week actually produced artifacts, and report the real
          // last-prepared week (the loop may stop early at course end).
          if (tileSuccessCount > 0) {
            const groundingNote = tileGroundedInModules ? " (grounded in module materials)" : "";
            reportLines.push(`${tile.name}: prepared ${tileEndWeek > startWeek ? `weeks ${startWeek}-${tileEndWeek}` : `week ${startWeek}`}${sourceNote}${groundingNote}`);
          }
        } catch (err) {
          reportLines.push(
            `${tile.name}: ${err instanceof Error ? err.message : "failed"}`
          );
        }
      }

      const report = reportLines.join("\n");
      return {
        outputs: {
          report,
          prepared: String(prepared),
          hasPrepared: prepared > 0 ? "1" : "",
        },
        summary: { kind: "text", text: report },
      };
    },
  },
];
