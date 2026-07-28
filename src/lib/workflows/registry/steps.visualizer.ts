// Client-side step catalog: the deck-driven visualizer coverage step.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution. Split into its
// own module (steps.knowledge.ts was already close to the 1000-line cap so
// this step lives here instead) as a sibling of "ensure-visualizer-pages"
// (which derives concepts from COURSE TILES): this step derives concepts
// from a DECK instead - a slide upload, or a deck bound from an earlier step.
import {
  listCourseHubAction,
  saveLibraryFileAction,
  findVisualizerConceptAction,
  createVisualizerConceptAction,
  extractPptxSlidesAction,
  extractDeckConceptsAction,
} from "@/app/actions";
import { type StepDefinition, blobToBase64 } from "@/lib/workflows/registry-helpers";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";

export const visualizerSteps: StepDefinition[] = [
  {
    type: "ensure-visualizer-pages-for-deck",
    name: "Ensure visualizer pages for a deck",
    description:
      "Read the concepts a lecture deck teaches, check each against the external site https://programming-concept-visualizer.vercel.app/, and create a page for any concept that is missing.",
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
        key: "hubCourse",
        label: "Course tile (optional)",
        type: "hubCourse",
        required: false,
      },
      {
        key: "maxConcepts",
        label: "Max concepts",
        type: "number",
        required: false,
        help: "How many concepts to check from the deck. Default 8 (1-20).",
      },
      {
        key: "create",
        label: "Create missing pages",
        type: "boolean",
        required: false,
        help: "On by default. Turn off for a coverage report without committing anything to the visualizer.",
      },
    ],
    outputs: [
      { key: "report", label: "Report", type: "longtext" },
      { key: "links", label: "Concept links", type: "longtext" },
      { key: "created", label: "Created count", type: "number" },
      { key: "missing", label: "Missing count", type: "number" },
      { key: "hasCreated", label: "Any created?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const uploads = Array.isArray(values.slides) ? (values.slides as File[]) : [];
      const priorSlidesText = String(values.slidesText ?? "").trim();

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

      const hubCourseId = String(values.hubCourse ?? "").trim();

      // "create" defaults to ON: unset (no binding at all) or blank (bound
      // but never set to a value) both mean ON - only an explicit value other
      // than "1" (a real, deliberate "off") turns it off.
      const createRaw = values.create;
      const createStr = createRaw === undefined || createRaw === null ? "" : String(createRaw).trim();
      const create = createStr === "" || createStr === "1";

      let course: { courseCode: string | null; name: string } | null = null;
      if (hubCourseId) {
        const list = await listCourseHubAction();
        if (!("error" in list)) {
          const tile = list.courses.find((c) => c.id === hubCourseId);
          if (tile) course = { courseCode: tile.courseCode, name: tile.name };
        }
      }

      const maxConceptsRaw = String(values.maxConcepts ?? "").trim();
      const maxConcepts = maxConceptsRaw ? Number(maxConceptsRaw) : 8;

      onProgress("Reading concepts from the deck...");
      const conceptsResult = await extractDeckConceptsAction(deckText, maxConcepts, helpers.provider);
      if ("error" in conceptsResult) {
        throw new Error(conceptsResult.error);
      }

      const reportLines: string[] = [];
      const linkLines: string[] = [];
      let created = 0;
      let missing = 0;

      for (const { concept, evidence } of conceptsResult.concepts) {
        try {
          onProgress(`Checking "${concept}"...`);
          const findResult = await findVisualizerConceptAction(concept);

          if ("error" in findResult) {
            reportLines.push(`${concept}: ${findResult.error}`);
            continue;
          }

          if (findResult.found) {
            linkLines.push(`[${concept}](${findResult.url})`);
            reportLines.push(`${concept}: found at ${findResult.url}`);
            continue;
          }

          missing++;

          if (!create) {
            reportLines.push(`${concept}: MISSING (creation disabled)`);
            continue;
          }

          onProgress(`Creating "${concept}"...`);
          const contextParts = [evidence, course ? `Course: ${course.name}` : ""].filter(Boolean);
          const context = contextParts.join(" - ");
          const createResult = await createVisualizerConceptAction(concept, context, helpers.provider);
          if ("error" in createResult) {
            reportLines.push(`${concept}: creation failed - ${createResult.error}`);
          } else {
            created++;
            linkLines.push(`[${concept}](${createResult.url}) (new)`);
            reportLines.push(`${concept}: created at ${createResult.url}`);
          }
        } catch (err) {
          reportLines.push(`${concept}: ${err instanceof Error ? err.message : "failed"}`);
        }
      }

      const report = reportLines.join("\n");
      const links = linkLines.join("\n");
      const notes: string[] = [];

      const isoDate = new Date().toISOString().slice(0, 10);
      const fileName = buildWorkflowFileName({
        course,
        artifact: "Visualizer Coverage",
        date: isoDate,
        ext: "md",
      });

      const markdown = `# Visualizer Coverage\n\n${report}\n`;
      const blob = new Blob([markdown], { type: "text/markdown" });

      try {
        const base64 = await blobToBase64(blob);
        const lib = await saveLibraryFileAction({
          name: fileName,
          base64,
          mimeType: "text/markdown",
          fileExt: "md",
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
          await helpers.saveCourseMaterialFile(hubCourseId, blob, fileName);
        } catch (err) {
          notes.push(`saving to the course tile failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return {
        outputs: {
          report,
          links,
          created,
          missing,
          hasCreated: created > 0 ? "1" : "",
        },
        summary: {
          kind: "list",
          label: `Visualizer coverage (${conceptsResult.concepts.length} concept(s)) -> ${fileName}`,
          items: [...reportLines, ...notes],
        },
      };
    },
  },
];
