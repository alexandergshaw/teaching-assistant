// Client-side step catalog: insight-related step definitions.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCourseHubAction,
  listCourseContentAction,
  generateLectureQaAction,
  previewFinalizedSyllabusAction,
  analyzeCourseTechAction,
  researchTopicAction,
  generateDocumentTextAction,
  createPageAction,
  saveLibraryFileAction,
} from "@/app/actions";
import {
  type StepRunResult,
  type StepDefinition,
  blobToBase64,
  resolveModulesAhead,
  resolveTileCurrentWeek,
  gatherModuleMaterials,
  loadTileWeekTopic,
} from "@/lib/workflows/registry-helpers";
import { nextLectureWeek } from "@/lib/workflows/next-week";
import { buildDocxFromPlainText } from "@/lib/docx";
import { markdownLiteToHtml } from "@/lib/markdown-lite";
import { parseLmsModuleValue, liveModuleValue } from "@/lib/workflows/module-value";
import { resolveSourcePolicy } from "@/lib/workflows/source-policy";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";

const SOURCES_HELP =
  "Which material sources to check (live LMS, course export, uploaded materials zip, repository digest, tile topics/description), their order, and the strategy (stop at first success, check all and merge, or accumulate until a source errors). Blank uses the default (live LMS, then the course export, then the tile's topics/description).";

export const contentInsightSteps: StepDefinition[] = [
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
        help: "Bind a deck generated earlier in this workflow (Generate slides -> Deck or Slides JSON, Generate a presentation from a template -> Deck, or Extract slides -> Slides). Its text grounds the questions the same way an uploaded deck does.",
      },
      {
        key: "modulesAhead",
        label: "Modules ahead",
        type: "moduleOffset",
        required: false,
        help: "How many modules past the current one to target. 0 or blank = the current module.",
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

      const sourcesPolicy = resolveSourcePolicy(String(values.sources ?? ""));
      const { moduleName, materialsText, notes, materialsSource } =
        await gatherModuleMaterials(tile, effectiveModuleIdRaw, helpers, onProgress, sourcesPolicy);

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
      // JSON, Generate a presentation from a template -> Deck, or Extract slides
      // -> Slides) arrives as longtext, already extracted - fold it into the
      // materials so it grounds the questions the same way an uploaded deck does.
      // Uploaded slideFiles still ride separately, so both paths compose; in an
      // unattended run the uploads resolve to [] and this prior-step text is the
      // only slide grounding.
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

      const fileName = buildWorkflowFileName({
        course: tile,
        artifact: "Lecture Q&A",
        qualifier: moduleName,
        ext: "docx",
      });

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
              const fileName = buildWorkflowFileName({
                course: tile,
                artifact: "Study Guide",
                qualifier: `Week ${targetWeek}`,
                ext: "docx",
              });

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
];
