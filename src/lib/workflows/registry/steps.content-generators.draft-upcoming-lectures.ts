// Client-side step catalog: the "draft-upcoming-lectures" step, split out of
// steps.content-generators.ts (that file was over the 1000-line cap - see
// docs/REGRESSION.md's line-count discipline). This step drafts next week's
// lecture materials (script, lesson plan, slides, optional narration) across
// every selected course tile; it shares no state with the other generator
// steps in that file beyond the SOURCES_HELP input-help string (duplicated
// here, the same way steps.content-lectures.prepare.ts already keeps its own
// local copy rather than sharing one across files).
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCourseHubAction,
  generateLectureScriptAction,
  generateLessonPlanAction,
  generateSlidesAction,
  synthesizeLongNarrationAction,
  saveLibraryFileAction,
} from "@/app/actions";
import {
  type StepDefinition,
  resolveTileCurrentWeek,
  resolveDeckTheme,
  gatherModuleMaterials,
  loadTileWeekTopic,
  base64ToBlob,
  blobToBase64,
  getCachedLiveModules,
} from "@/lib/workflows/registry-helpers";
import { nextLectureWeek } from "@/lib/workflows/next-week";
import { buildDocxFromPlainText } from "@/lib/docx";
import { buildSlidesPptx } from "@/lib/pptx";
import { findModuleForWeek } from "@/lib/week-numbering";
import { liveModuleValue, exportModuleValue } from "@/lib/workflows/module-value";
import { resolveSourcePolicy } from "@/lib/workflows/source-policy";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";

const SOURCES_HELP =
  "Which material sources to check (live LMS, course export, uploaded materials zip, repository digest, tile topics/description), their order, and the strategy (stop at first success, check all and merge, or accumulate until a source errors). Blank uses the default (live LMS, then the course export, then the tile's topics/description).";

export const draftUpcomingLecturesStep: StepDefinition = {
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
    {
      key: "sources",
      label: "Material sources",
      type: "sourcePolicy",
      required: false,
      help: SOURCES_HELP,
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

    const sourcesPolicy = resolveSourcePolicy(String(values.sources ?? ""));

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
                  const gathered = await gatherModuleMaterials(tile, moduleId, helpers, onProgress, sourcesPolicy);
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
              const scriptFileName = buildWorkflowFileName({
                course: tile,
                artifact: "Lecture Script",
                qualifier: `Week ${targetWeek}`,
                ext: "docx",
              });

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
              const planFileName = buildWorkflowFileName({
                course: tile,
                artifact: "Lesson Plan",
                qualifier: `Week ${targetWeek}`,
                ext: "docx",
              });

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
              const slideFileName = buildWorkflowFileName({
                course: tile,
                artifact: "Lecture Slides",
                qualifier: `Week ${targetWeek}`,
                ext: "pptx",
              });

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
                  const narFileName = buildWorkflowFileName({
                    course: tile,
                    artifact: "Lecture Narration",
                    qualifier: `Week ${targetWeek}`,
                    ext: "mp3",
                  });
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
};
