// Client-side step catalog: assignment answer generation step definitions.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCourseHubAction,
  listCourseContentAction,
  fetchCanvasMetaAction,
  previewFileAction,
  generateModelAnswerAction,
  saveLibraryFileAction,
  createGradableAction,
} from "@/app/actions";
import {
  type StepDefinition,
  resolveModulesAhead,
  resolveTileCurrentWeek,
  gatherModuleMaterials,
} from "@/lib/workflows/registry-helpers";
import { moduleItemContentUrl } from "@/lib/canvas-url";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import { courseProgressStatus, parseWeekToken } from "@/lib/week-numbering";
import { parseLmsModuleValue, liveModuleValue } from "@/lib/workflows/module-value";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";

export const assignmentAnswerSteps: StepDefinition[] = [
  {
    type: "generate-module-answers",
    name: "Generate module homework answers",
    description: "Generate a full-credit model answer for every homework item (assignments and discussions) in a module, grounded in the module's objectives and materials, and save them as an instructor answer key (plain-text file on the course tile and the Files tab). Answers are saved privately to the course tile and Files tab; never published to the LMS.",
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
        help: "Pick from the live LMS connection or the course's LMS export; without either or if left blank, falls back to the tile's current module.",
      },
      {
        key: "maxItems",
        label: "Homework items per module to answer",
        type: "number",
        required: false,
        help: "Default 6, max 10.",
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
      { key: "answers", label: "Answer key", type: "longtext" },
      { key: "report", label: "Report", type: "longtext" },
      { key: "generated", label: "Generated count", type: "number" },
      { key: "hasGenerated", label: "Has generated?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) {
        throw new Error("Choose a course tile.");
      }

      const moduleIdRaw = String(values.moduleId ?? "").trim();
      const maxItemsRaw = Number(values.maxItems ?? 6);
      const maxItems = Math.max(1, Math.min(10, maxItemsRaw));

      // Load the tile
      const list = await listCourseHubAction();
      if ("error" in list) {
        throw new Error(list.error);
      }
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Choose a course tile.");
      }

      const canvasUrl = (tile.canvasUrl ?? "").trim();
      const inst = helpers.activeInstitution || undefined;
      const picked = parseLmsModuleValue(moduleIdRaw);

      // Determine which module to use: picked module or current module
      let targetModule: CanvasModule | null = null;
      let moduleName = "";
      let moduleWeekNumber: number | null = null;

      // Try to resolve the picked module or current module
      if (picked.liveId || picked.fromExport || picked.name) {
        // User picked a module or we need to resolve the current module
        if (!canvasUrl && !picked.fromExport) {
          // No live connection and not an export module
          if (moduleIdRaw) {
            return {
              outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
              summary: {
                kind: "text",
                text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
              },
            };
          }
          // Fall back to current module, but we can't resolve without LMS
          return {
            outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
            summary: {
              kind: "text",
              text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
            },
          };
        }

        if (canvasUrl && picked.liveId) {
          // Fetch from live LMS
          onProgress("Loading module items...");
          try {
            const content = await listCourseContentAction(canvasUrl, inst);
            if ("error" in content) {
              throw new Error(content.error);
            }
            const pickedIdx = content.modules.findIndex((m) => String(m.id) === picked.liveId);
            if (pickedIdx < 0) {
              throw new Error("the chosen module was not found in the LMS course");
            }
            // A modules-ahead offset applies relative to the picked module's
            // position (mirroring prepare-lecture), clamped to the last module.
            const modulesAhead = resolveModulesAhead(values);
            const targetIdx = Math.min(pickedIdx + modulesAhead, content.modules.length - 1);
            const foundModule = content.modules[targetIdx];
            targetModule = foundModule;
            moduleName = foundModule.name;
          } catch {
            return {
              outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
              summary: {
                kind: "text",
                text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
              },
            };
          }
        } else if (picked.fromExport && helpers.loadCourseExport) {
          // Load from course export (not implemented for answers generation)
          return {
            outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
            summary: {
              kind: "text",
              text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
            },
          };
        }
      } else {
        // No module picked - try to derive the current module
        if (!canvasUrl) {
          return {
            outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
            summary: {
              kind: "text",
              text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
            },
          };
        }

        // Use deadline-based current module resolution
        onProgress("Resolving current module...");
        try {
          const weekResolution = await resolveTileCurrentWeek(tile, helpers);
          if ("skip" in weekResolution) {
            return {
              outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
              summary: {
                kind: "text",
                text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
              },
            };
          }

          const rawWeek = weekResolution.rawWeek;
          const status = courseProgressStatus(rawWeek, tile.weeks);
          if (status === "not-started" || status === "complete") {
            return {
              outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
              summary: {
                kind: "text",
                text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
              },
            };
          }

          // Apply modulesAhead offset
          const modulesAhead = resolveModulesAhead(values);
          let effectiveWeek = rawWeek + modulesAhead;
          if (tile.weeks && tile.weeks > 0) {
            effectiveWeek = Math.min(effectiveWeek, tile.weeks);
          }

          // Fetch modules and find the target module
          onProgress("Loading modules...");
          const content = await listCourseContentAction(canvasUrl, inst);
          if ("error" in content) {
            throw new Error(content.error);
          }

          // Find the module matching the target week by iterating through modules
          let foundByWeek: CanvasModule | null = null;
          for (const mod of content.modules) {
            if (parseWeekToken(mod.name) === effectiveWeek) {
              foundByWeek = mod;
              break;
            }
          }

          if (!foundByWeek) {
            return {
              outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
              summary: {
                kind: "text",
                text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
              },
            };
          }

          targetModule = foundByWeek;
          moduleName = foundByWeek.name;
        } catch {
          return {
            outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
            summary: {
              kind: "text",
              text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
            },
          };
        }
      }

      if (!targetModule) {
        return {
          outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
          summary: {
            kind: "text",
            text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
          },
        };
      }

      // Parse week number from module name for the docx filename
      moduleWeekNumber = parseWeekToken(moduleName);

      // Gather module materials for context grounding
      let moduleContextTrimmed = "";
      let materialsSource = "";
      try {
        const gathered = await gatherModuleMaterials(
          tile,
          liveModuleValue(String(targetModule.id), targetModule.name),
          helpers,
          onProgress
        );
        if (gathered.materialsText) {
          moduleContextTrimmed = gathered.materialsText.slice(0, 9000);
          materialsSource = gathered.materialsSource;
        }
      } catch {
        // Fail-soft: continue without context
      }

      // Collect Assignment and Discussion items
      const answerLines: string[] = [];
      const reportLines: string[] = [];
      let generatedCount = 0;
      let erroredCount = 0;

      const assignmentLikeItems = targetModule.items.filter(
        (item: CanvasModuleItem) =>
          (item.type === "Assignment" || item.type === "Discussion") &&
          moduleItemContentUrl(canvasUrl, item.type, item.contentId, item.htmlUrl) !== null
      );

      const itemsToProcess = assignmentLikeItems.slice(0, maxItems);
      const skippedItems = assignmentLikeItems.length - itemsToProcess.length;

      // Categorize non-answerable items
      const nonAnswerableItems: string[] = [];
      for (const item of targetModule.items) {
        if (
          item.type === "Quiz" ||
          item.type === "Page" ||
          item.type === "File" ||
          item.type === "SubHeader" ||
          item.type === "ExternalUrl"
        ) {
          nonAnswerableItems.push(`${item.type}: ${item.title}`);
        }
      }

      // Process each item
      for (const item of itemsToProcess) {
        try {
          onProgress(`Generating answer for: ${item.title}...`);

          // The module item's html_url is the /modules/items/ wrapper link;
          // build the direct assignment/discussion URL from its content id.
          const contentUrl = moduleItemContentUrl(canvasUrl, item.type, item.contentId, item.htmlUrl);
          if (!contentUrl) {
            reportLines.push(`${item.title}: skipped (no URL)`);
            continue;
          }

          // Fetch the description and rubric
          const meta = await fetchCanvasMetaAction(contentUrl);
          if ("error" in meta) {
            reportLines.push(`${item.title}: ${meta.error}`);
            erroredCount++;
            continue;
          }

          let description = meta.description.trim();
          if (!description) {
            reportLines.push(`${item.title}: skipped (no description)`);
            continue;
          }

          const rubric = meta.rubricText ?? "";

          // Process linked files (up to 4)
          const linkedFileIds = meta.linkedFileIds ?? [];
          const filesToProcess = linkedFileIds.slice(0, 4);
          if (filesToProcess.length < linkedFileIds.length) {
            reportLines.push(`${item.title}: skipped ${linkedFileIds.length - filesToProcess.length} linked file(s) beyond the 4-file limit`);
          }

          for (const fileId of filesToProcess) {
            try {
              const filePreview = await previewFileAction(canvasUrl, fileId, inst);
              if ("error" in filePreview) {
                reportLines.push(`${item.title}: could not preview linked file ${fileId} - ${filePreview.error}`);
                continue;
              }

              const previewText = filePreview.preview.text ?? "";
              if (previewText) {
                const trimmedPreview = previewText.slice(0, 4000);
                description += `\n\nLINKED FILE:\n${trimmedPreview}`;
              }
            } catch {
              reportLines.push(`${item.title}: could not load linked file ${fileId}`);
            }
          }

          // Generate the model answer with module context
          const answerResult = await generateModelAnswerAction(
            description,
            rubric,
            helpers.provider,
            moduleContextTrimmed
          );

          if ("error" in answerResult) {
            reportLines.push(`${item.title}: ${answerResult.error}`);
            erroredCount++;
            continue;
          }

          // Add to answer key
          answerLines.push(`## ${item.title}`);

          // Add points and due date when present
          const suffixes: string[] = [];
          if (typeof item.pointsPossible === "number" && item.pointsPossible > 0) {
            suffixes.push(`${item.pointsPossible} point${item.pointsPossible === 1 ? "" : "s"}`);
          }
          if (item.dueAt) {
            const dueDate = new Date(item.dueAt);
            const dateStr = dueDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            suffixes.push(`due ${dateStr}`);
          }
          if (suffixes.length > 0) {
            answerLines.push(`${suffixes.join(", ")}`);
          }

          answerLines.push("");
          answerLines.push(answerResult.modelAnswer);
          answerLines.push("");

          generatedCount++;
          reportLines.push(`${item.title}: OK`);
        } catch (err) {
          reportLines.push(
            `${item.title}: ${err instanceof Error ? err.message : "error"}`
          );
          erroredCount++;
        }
      }

      // Check if all attempted items errored. Surface the first per-item
      // error - the report lines are lost when the step throws, and a bare
      // "failed for all" message hides the actual cause.
      if (itemsToProcess.length > 0 && erroredCount === itemsToProcess.length) {
        const firstError = reportLines.find((l) => !l.endsWith(": OK")) ?? "";
        throw new Error(
          `Failed to generate answers for any items${firstError ? ` - first error: ${firstError}` : ""}.`
        );
      }

      // Add context report line
      if (moduleContextTrimmed) {
        reportLines.push(`answers grounded in module materials (${materialsSource})`);
      } else {
        reportLines.push("module context unavailable - answers generated from assignment text only");
      }

      // Add report sections
      if (skippedItems > 0) {
        reportLines.push(
          `Skipped ${skippedItems} assignment/discussion item(s) beyond the ${maxItems}-item limit.`
        );
      }

      if (nonAnswerableItems.length > 0) {
        reportLines.push("Not answerable items:");
        for (const item of nonAnswerableItems) {
          if (item.includes("Quiz")) {
            reportLines.push(`  ${item} (quiz answers not supported)`);
          } else {
            reportLines.push(`  ${item}`);
          }
        }
      }

      const report = reportLines.join("\n");

      // Build and save the answer key as plain text
      if (generatedCount > 0) {
        onProgress("Building document...");
        const answerText = answerLines.join("\n");
        const base64 = Buffer.from(answerText, "utf-8").toString("base64");

        // Determine the filename
        const filename = buildWorkflowFileName({
          course: tile,
          artifact: "Homework Answers",
          qualifier: `Module ${moduleWeekNumber !== null ? moduleWeekNumber : moduleName}`,
          ext: "txt",
        });

        // Save to library with workflow tagging
        onProgress("Saving to Files tab...");
        const libResult = await saveLibraryFileAction({
          name: filename,
          base64,
          mimeType: "text/plain",
          fileExt: "txt",
          workflowId: helpers.workflowId,
          workflowName: helpers.workflowName,
          workflowRunId: helpers.workflowRunId,
        });

        if ("error" in libResult) {
          reportLines.push(`Files tab save failed: ${libResult.error}`);
        }

        // Save to course tile if available
        if (helpers.saveCourseMaterialFile) {
          try {
            onProgress("Saving to course tile...");
            const blob = new Blob([answerText], { type: "text/plain" });
            await helpers.saveCourseMaterialFile(tile.id, blob, filename);
          } catch (err) {
            reportLines.push(
              `Course tile save failed: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }
      }

      const answers = answerLines.join("\n");

      return {
        outputs: {
          answers,
          report,
          generated: generatedCount,
          hasGenerated: generatedCount > 0 ? "1" : "",
        },
        summary: {
          kind: "list",
          label: `Generated ${generatedCount} answer(s)`,
          items: reportLines,
        },
      };
    },
  },

  {
    type: "fetch-assignment-brief",
    name: "Fetch an assignment brief",
    description: "Read an LMS assignment's description and attached rubric, to prefill instructions and rubric for grading or rubric generation.",
    inputs: [
      { key: "assignmentUrl", label: "Assignment URL", type: "text", required: true },
    ],
    outputs: [
      { key: "description", label: "Description", type: "longtext" },
      { key: "rubric", label: "Rubric", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const url = String(values.assignmentUrl ?? "").trim();
      if (!url) throw new Error("Provide the assignment URL.");
      onProgress("Fetching assignment brief...");
      const r = await fetchCanvasMetaAction(url);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { description: r.description, rubric: r.rubricText }, summary: { kind: "text", text: r.description || "(no description)" } };
    },
  },

  {
    type: "create-canvas-quiz",
    name: "Create a Canvas quiz",
    description:
      "Create an empty classic quiz (unpublished) in a Canvas course, ready for Import quiz questions. Points come from the questions you import; publish it from Canvas when ready.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "title", label: "Quiz title", type: "text", required: true },
      { key: "description", label: "Description (optional)", type: "longtext", required: false },
      { key: "dueAt", label: "Due date (optional)", type: "date", required: false },
      { key: "institution", label: "Institution", type: "institution", required: false, help: "Defaults to the institution matching the course URL." },
    ],
    outputs: [
      { key: "quizId", label: "Quiz id", type: "text" },
      { key: "quizUrl", label: "Quiz URL", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const courseUrl = String(values.course ?? "").trim();
      if (!courseUrl) {
        throw new Error("Select an LMS course.");
      }

      const title = String(values.title ?? "").trim();
      if (!title) {
        throw new Error("Provide a quiz title.");
      }

      const description = String(values.description ?? "").trim() || undefined;
      const dueAt = String(values.dueAt ?? "").trim() || null;
      const inst = String(values.institution ?? "").trim() || undefined;

      onProgress("Creating quiz...");
      const res = await createGradableAction(courseUrl, "Quiz", { title, description, dueAt }, inst);
      if ("error" in res) {
        throw new Error(res.error);
      }

      const quizId = String(res.id);
      const quizUrl = `${courseUrl.replace(/\/+$/, "")}/quizzes/${quizId}`;

      return {
        outputs: { quizId, quizUrl },
        summary: { kind: "link", label: title, url: quizUrl },
      };
    },
  },
];
