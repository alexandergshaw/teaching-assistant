// Client-side step catalog: lecture-related step definitions.
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
  generateLectureFromMaterialsAction,
  regenerateAnnouncementAction,
  generateClassOpenerAction,
  findCaseStudyMaterialAction,
  findPracticeProblemsAction,
  saveLibraryFileAction,
} from "@/app/actions";
import {
  type StepRunResult,
  type StepDefinition,
  blobToBase64,
  resolveModulesAhead,
  resolveTileCurrentWeek,
  resolveDeckTheme,
  gatherModuleMaterials,
  assembleLectureFiles,
} from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import { buildSlidesPptx } from "@/lib/pptx";
import { buildDocxFromPlainText } from "@/lib/docx";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { parseLmsModuleValue, liveModuleValue } from "@/lib/workflows/module-value";

export const contentLectureSteps: StepDefinition[] = [
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
];
