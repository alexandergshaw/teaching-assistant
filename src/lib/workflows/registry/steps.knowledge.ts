// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCourseHubAction,
  generateConceptPlanAction,
  researchTopicAction,
  measureKnowledgeGapAction,
  runResearchLoopAction,
  listUnverifiedKnowledgeAction,
  saveLibraryFileAction,
  findVisualizerConceptAction,
  createVisualizerConceptAction,
  researchCurrentEventsAction,
  extractPptxSlidesAction,
} from "@/app/actions";
import {
  type StepDefinition,
  blobToBase64,
  resolveTileCurrentWeek,
  loadTileWeekTopic,
} from "@/lib/workflows/registry-helpers";
import { buildDocxFromPlainText } from "@/lib/docx";
import { nextLectureWeek } from "@/lib/workflows/next-week";
import { extractDefinitions } from "@/lib/embedded/scaffold";

export const knowledgeSteps: StepDefinition[] = [
  {
    type: "extract-glossary-terms",
    name: "Extract glossary terms",
    description: "Pull term and definition pairs out of course material into a glossary.",
    inputs: [
      { key: "text", label: "Source material", type: "longtext", required: true }
    ],
    outputs: [
      { key: "glossary", label: "Glossary", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const text = String(values.text ?? "").trim();
      if (!text) {
        throw new Error("Provide the source material to scan.");
      }

      onProgress("Extracting glossary terms...");
      const defs = extractDefinitions(text);

      const items: string[] = [];
      const glossaryLines: string[] = [];
      for (const def of defs) {
        glossaryLines.push(`${def.term}: ${def.definition}`);
        items.push(def.term);
      }
      const glossary = glossaryLines.join("\n");

      return {
        outputs: { glossary },
        summary: {
          kind: "list",
          label: `${defs.length} term(s)`,
          items: items.length ? items : ["(none found)"],
        },
      };
    },
  },

  {
    type: "research-topic",
    name: "Research a topic",
    description: "Fetch external, cited research (case studies and practice material) for a topic, to seed lecture or assignment content.",
    inputs: [
      { key: "topic", label: "Topic", type: "text", required: true },
      { key: "count", label: "How many results", type: "number", required: false, help: "Default 5." }
    ],
    outputs: [
      { key: "results", label: "Research results", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide a topic.");

      const countRaw = String(values.count ?? "").trim();
      const limit = countRaw && Number.isInteger(Number(countRaw)) && Number(countRaw) > 0 ? Number(countRaw) : 5;

      onProgress("Researching...");
      const r = await researchTopicAction(topic, limit);
      if ("error" in r) throw new Error(r.error);

      const items: string[] = [];
      const lines: string[] = [];

      for (const result of r.results) {
        items.push(result.title);
        lines.push(result.title);
        lines.push(`Source: ${result.source}`);
        if (result.url) {
          lines.push(`URL: ${result.url}`);
        }
        lines.push("");
        lines.push(result.summary);
        lines.push("");
        lines.push("---");
        lines.push("");
      }

      const results = lines.join("\n").trim();
      return {
        outputs: { results },
        summary: { kind: "list", label: `${r.results.length} result(s)`, items: r.results.length ? items : ["(none found)"] }
      };
    },
  },

  {
    type: "measure-knowledge-gap",
    name: "Measure knowledge coverage",
    description: "Score how well the stored knowledge base covers a topic and list the uncovered terms, as a diagnostic before generating materials.",
    inputs: [
      { key: "topic", label: "Topic", type: "text", required: true }
    ],
    outputs: [
      { key: "coverage", label: "Coverage (0-1)", type: "number" },
      { key: "uncoveredTerms", label: "Uncovered terms", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide a topic.");

      onProgress("Measuring coverage...");
      const r = await measureKnowledgeGapAction(topic);
      if ("error" in r) throw new Error(r.error);

      const rep = r.report;
      const uncovered = rep.uncoveredTerms.join("\n");

      return {
        outputs: { coverage: rep.coverage, uncoveredTerms: uncovered },
        summary: {
          kind: "text",
          text: `Coverage ${(rep.coverage * 100).toFixed(0)}% (gap ${(rep.gap * 100).toFixed(0)}%). Uncovered: ${rep.uncoveredTerms.length ? rep.uncoveredTerms.join(", ") : "none"}.`
        }
      };
    },
  },

  {
    type: "run-research-loop",
    name: "Grow the knowledge base for a topic",
    description: "Retrieve external knowledge for a topic's uncovered terms and store it (unverified) for later review. Ideal as an unattended background-research step.",
    inputs: [
      { key: "topic", label: "Topic", type: "text", required: true }
    ],
    outputs: [
      { key: "learned", label: "Entries learned", type: "number" }
    ],
    run: async (values, helpers, onProgress) => {
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide a topic.");

      onProgress("Researching and learning...");
      const r = await runResearchLoopAction(topic);
      if ("error" in r) throw new Error(r.error);

      const learnedCount = r.report.stored;
      const rounds = r.report.rounds;

      return {
        outputs: { learned: learnedCount },
        summary: {
          kind: "text",
          text: `Learned ${learnedCount} new entr${learnedCount === 1 ? "y" : "ies"} over ${rounds} round(s) for "${topic}".`
        }
      };
    },
  },

  {
    type: "list-unverified-knowledge",
    name: "List unverified knowledge",
    description: "List knowledge entries the research loop learned but that are awaiting review, so they can be checked before use.",
    inputs: [],
    outputs: [
      { key: "entries", label: "Unverified entries", type: "longtext" },
      { key: "count", label: "Count", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      onProgress("Loading unverified knowledge...");
      const r = await listUnverifiedKnowledgeAction();
      if ("error" in r) throw new Error(r.error);

      const titles = r.entries.map((entry) => entry.title);
      const entriesText = r.entries
        .map((entry) => {
          const topic = Array.isArray(entry.topics) ? entry.topics.join(", ") : entry.topics || "";
          const snippet = entry.summary ? entry.summary.split("\n")[0].slice(0, 60) : "";
          return `${entry.title}\n  Topic: ${topic}\n  Kind: ${entry.kind}\n  Summary: ${snippet}${snippet.length >= 60 ? "..." : ""}`;
        })
        .join("\n\n");

      return {
        outputs: { entries: entriesText, count: r.entries.length },
        summary: {
          kind: "list",
          label: `${r.entries.length} unverified entr${r.entries.length === 1 ? "y" : "ies"}`,
          items: r.entries.length ? titles : ["(none)"],
        },
      };
    },
  },

  {
    type: "ensure-visualizer-pages",
    name: "Ensure concept visualizer pages",
    description:
      "For each upcoming concept, check the external site https://programming-concept-visualizer.vercel.app/ for an existing page; if it exists, record the link; if not, an agent creates the page (LLM-generates the component, commits it to GitHub) and records the link.",
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
        help: "How far ahead to check. Default 7 days (the coming week).",
      },
      {
        key: "concepts",
        label: "Concepts (optional)",
        type: "longtext",
        required: false,
        help: "One concept per line. When set, skips deriving concepts from courses.",
      },
      {
        key: "maxConcepts",
        label: "Concepts per course",
        type: "number",
        required: false,
        help: "How many concepts per course when deriving from courses. Default 3, max 6.",
      },
    ],
    outputs: [
      { key: "report", label: "Report", type: "longtext" },
      { key: "links", label: "Concept links", type: "longtext" },
      { key: "hasCreated", label: "Any created?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (ids.length === 0) {
        throw new Error("Select at least one course tile.");
      }

      let maxConceptsVal = Number(values.maxConcepts ?? 3);
      if (Number.isNaN(maxConceptsVal) || maxConceptsVal < 1 || maxConceptsVal > 6) {
        maxConceptsVal = 3;
      } else {
        maxConceptsVal = Math.round(maxConceptsVal);
      }

      const lookaheadRaw = String(values.lookahead ?? "").trim();
      const daysAhead = Number.isFinite(Number(lookaheadRaw)) && Number(lookaheadRaw) >= 1
        ? Math.floor(Number(lookaheadRaw))
        : 7;
      const weeksAhead = Math.max(1, Math.min(4, Math.ceil(daysAhead / 7)));

      const conceptsInput = String(values.concepts ?? "").trim();
      const providedConcepts = conceptsInput
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const reportLines: string[] = [];
      const linkLines: string[] = [];
      let hasCreated = false;

      // Collect all concepts to check
      const conceptsToCheck: Array<{ concept: string; source: string }> = [];

      if (providedConcepts.length > 0) {
        // Use provided concepts
        for (const concept of providedConcepts) {
          conceptsToCheck.push({ concept, source: "provided" });
        }
      } else {
        // Derive concepts from courses
        for (const id of ids) {
          const tile = hub.courses.find((c) => c.id === id);
          if (!tile) continue;

          try {
            onProgress(`Deriving concepts for ${tile.name}...`);
            const weekResolution = await resolveTileCurrentWeek(tile, helpers);
            const nw = nextLectureWeek({
              startDate: tile.startDate,
              weeks: tile.weeks,
              nowMs: Date.now(),
              rawWeek: "skip" in weekResolution ? undefined : weekResolution.rawWeek,
            });

            if ("skip" in nw) {
              continue;
            }

            const startWeek = nw.week;

            for (let w = 0; w < weeksAhead; w++) {
              const targetWeek = startWeek + w;

              if (tile.weeks && tile.weeks > 0 && targetWeek > tile.weeks) {
                break;
              }

              try {
                const weekTopic = await loadTileWeekTopic(tile, targetWeek, helpers);
                if ("skip" in weekTopic) {
                  break;
                }

                const topic = weekTopic.topic;
                const summary = weekTopic.summary;

                const planResult = await generateConceptPlanAction(topic, summary, maxConceptsVal, helpers.provider);
                if ("error" in planResult) {
                  continue;
                }

                for (const { concept } of planResult.concepts) {
                  conceptsToCheck.push({ concept, source: `${tile.name} Week ${targetWeek}` });
                }
              } catch {
                // Skip this week
              }
            }
          } catch {
            // Skip this course
          }
        }
      }

      if (conceptsToCheck.length === 0) {
        throw new Error("No concepts to check. Provide concepts or ensure courses have upcoming weeks.");
      }

      // Check/create each concept
      for (const { concept, source } of conceptsToCheck) {
        try {
          onProgress(`Checking "${concept}"...`);

          const findResult = await findVisualizerConceptAction(concept);
          if ("error" in findResult) {
            reportLines.push(`${concept} (${source}): ${findResult.error}`);
            continue;
          }

          if (findResult.found) {
            linkLines.push(`[${concept}](${findResult.url})`);
            reportLines.push(`${concept} (${source}): found at ${findResult.url}`);
          } else {
            // Create the concept
            onProgress(`Creating "${concept}"...`);
            const createResult = await createVisualizerConceptAction(concept, source, helpers.provider);
            if ("error" in createResult) {
              reportLines.push(`${concept} (${source}): creation failed - ${createResult.error}`);
            } else {
              hasCreated = true;
              linkLines.push(`[${concept}](${createResult.url}) (new)`);
              reportLines.push(`${concept} (${source}): created at ${createResult.url}`);
            }
          }
        } catch (err) {
          reportLines.push(
            `${concept}: ${err instanceof Error ? err.message : "failed"}`
          );
        }
      }

      const report = reportLines.join("\n");
      const links = linkLines.join("\n");

      // Save artifact
      if (helpers.saveCourseMaterialFile) {
        const markdown = `# Visualizer Concept Links\n\n${links}\n`;
        const blob = new Blob([markdown], { type: "text/markdown" });
        const base64 = await blobToBase64(blob);
        await saveLibraryFileAction({
          name: "Visualizer Concept Links.md",
          base64,
          mimeType: "text/markdown",
          fileExt: "md",
          workflowId: helpers.workflowId,
          workflowName: helpers.workflowName,
          workflowRunId: helpers.workflowRunId,
        });
      }

      return {
        outputs: {
          report,
          links,
          hasCreated: hasCreated ? "1" : "",
        },
        summary: { kind: "list", label: "Concept links", items: linkLines },
      };
    },
  },

  {
    type: "list-open-problems",
    name: "List open problems",
    description: "Retrieve the user's currently open problems and their count",
    inputs: [],
    outputs: [
      { key: "problems", label: "Problems", type: "longtext" },
      { key: "count", label: "Problem count", type: "number" },
      { key: "hasProblems", label: "Has problems?", type: "boolean" },
    ],
    run: async () => {
      const { listOpenProblemsAction } = await import("@/app/actions");
      const result = await listOpenProblemsAction();

      if ("error" in result) {
        throw new Error(result.error);
      }

      const problemsJson = JSON.stringify(
        result.problems.map((p) => ({
          id: p.id,
          title: p.title,
          detail: p.detail,
        }))
      );

      return {
        outputs: {
          problems: problemsJson,
          count: result.count,
          hasProblems: result.count > 0 ? "1" : "",
        },
        summary: {
          kind: "text",
          text: `Found ${result.count} open problem(s).`,
        },
      };
    },
  },

  {
    type: "propose-problem-solutions",
    name: "Propose solutions to problems",
    description:
      "For each open problem, generate 2-3 fresh solution proposals using an LLM. New proposals are always materially different from every prior suggestion.",
    inputs: [
      {
        key: "problems",
        label: "Problems",
        type: "longtext",
        required: true,
        help: "JSON from List open problems",
      },
    ],
    outputs: [
      { key: "report", label: "Report", type: "longtext" },
      { key: "proposed", label: "Proposed count", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const problemsJson = String(values.problems ?? "").trim();
      if (!problemsJson) {
        throw new Error("Provide the problems JSON from List open problems.");
      }

      onProgress("Generating solutions for open problems...");
      const { processProblemSolutionsAction } = await import("@/app/actions");
      const result = await processProblemSolutionsAction(problemsJson, helpers.provider);

      if ("error" in result) {
        throw new Error(result.error);
      }

      onProgress("Saving solutions artifact...");
      const { saveLibraryFileAction } = await import("@/app/actions");
      const markdownContent = result.report;
      const base64 = Buffer.from(markdownContent, "utf-8").toString("base64");
      const fileResult = await saveLibraryFileAction({
        name: "Problem Solutions.md",
        base64,
        mimeType: "text/markdown",
        fileExt: "md",
        workflowId: helpers.workflowId,
        workflowName: helpers.workflowName,
      });

      if ("error" in fileResult) {
        throw new Error(`Failed to save artifact: ${fileResult.error}`);
      }

      const items = result.report.split("\n").filter(line => line.trim().length > 0);

      return {
        outputs: {
          report: result.report,
          proposed: result.proposedCount,
        },
        summary: {
          kind: "list",
          label: `Proposed ${result.proposedCount} solution(s)`,
          items,
        },
      };
    },
  },

  {
    type: "current-events-report",
    name: "Current events for a slide deck",
    description:
      "Search the web for current events and recent developments related to a lecture deck's topics, within a user-specified recency window. The report is saved as a text document.",
    inputs: [
      {
        key: "slides",
        label: "Slide deck (.pptx)",
        type: "uploads",
        required: false,
        accept: ".pptx",
      },
      {
        key: "slidesText",
        label: "Deck from a previous step (optional)",
        type: "longtext",
        required: false,
        help: "Bind a deck generated earlier in this workflow (Generate a presentation from a template -> Deck, Generate slides -> Deck, or Extract slides -> Slides).",
      },
      {
        key: "recentWindow",
        label: "What counts as recent",
        type: "text",
        required: false,
        help: 'e.g. "the past 2 weeks" or "the last 3 months". Blank = the past 30 days.',
      },
      {
        key: "hubCourse",
        label: "Course tile (optional)",
        type: "hubCourse",
        required: false,
      },
    ],
    outputs: [
      { key: "reportText", label: "Report", type: "longtext" },
      { key: "fileName", label: "File name", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const uploads = Array.isArray(values.slides) ? (values.slides as File[]) : [];
      const priorSlidesText = String(values.slidesText ?? "").trim();
      const recentWindow = String(values.recentWindow ?? "").trim();
      const hubCourseId = String(values.hubCourse ?? "").trim();

      let deckText = priorSlidesText;

      if (uploads.length > 0) {
        const file = uploads[0];
        onProgress("Extracting slides from file...");

        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        const base64 = btoa(binary);

        const r = await extractPptxSlidesAction(base64);
        if ("error" in r) throw new Error(r.error);

        const slidesLines: string[] = [];
        for (const s of r.slides) {
          slidesLines.push(`Slide ${s.slide}: ${s.title}`);
          if (s.text) {
            slidesLines.push(s.text);
          }
          slidesLines.push("");
        }
        deckText = slidesLines.join("\n");
      }

      if (!deckText) {
        throw new Error("Provide a slide deck - upload a .pptx or bind a deck from an earlier step.");
      }

      const window = recentWindow || "the past 30 days";

      onProgress("Researching current events...");
      const r = await researchCurrentEventsAction(deckText, window, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      const reportText = r.report;
      const sourceCount = r.sourceCount;

      const docText = reportText;
      const docxBuffer = await buildDocxFromPlainText(docText, [], helpers.author);
      const blob = new Blob([new Uint8Array(docxBuffer)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const sanitize = (s: string) =>
        s.trim().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");

      let courseTitle = "";
      if (hubCourseId) {
        const list = await listCourseHubAction();
        if (!("error" in list)) {
          courseTitle =
            list.courses
              .find((c) => c.id === hubCourseId)
              ?.name?.substring(0, 20) || "";
        }
      }

      const baseTitle = courseTitle || "Current_Events";
      const fileName = `${sanitize(baseTitle)}_${Date.now()}.docx`;

      const notes: string[] = [];

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

      try {
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
          notes.push(`library save skipped: ${lib.error}`);
        }
      } catch (err) {
        notes.push(`saving to library failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (hubCourseId && helpers.saveCourseMaterialFile) {
        try {
          const list = await listCourseHubAction();
          if ("error" in list) {
            notes.push(`course tile save skipped: ${list.error}`);
          } else {
            const tile = list.courses.find((c) => c.id === hubCourseId);
            if (tile) {
              await helpers.saveCourseMaterialFile(tile.id, blob, fileName);
            }
          }
        } catch (err) {
          notes.push(`saving to the course tile failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const reportLines = reportText
        .split("\n")
        .filter((l) => l.trim().startsWith("##"))
        .map((l) => l.replace(/^##\s*/, ""));

      const sourceLine = `${sourceCount} source(s) cited`;

      return {
        outputs: { reportText, fileName },
        summary: {
          kind: "list",
          label: `Current events report (${window}) -> ${fileName}`,
          items: [sourceLine, ...reportLines, ...notes],
        },
      };
    },
  },
];
