// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCourseContentAction,
  listCourseHubAction,
  createPageAction,
  generateConceptPlanAction,
  generateConceptAnimationAction,
  findCaseStudyMaterialAction,
  generateSlidesAction,
  generateLectureScriptAction,
  reviseLectureSlidesAction,
  extractPptxSlidesAction,
  synthesizeLongNarrationAction,
  generateAvatarVideoAction,
  getAvatarVideoStatusAction,
  getDeckTemplateAction,
  generateDeckFromTemplateAction,
  savePresentationFileAction,
  saveLibraryFileAction,
  type SlideData,
} from "@/app/actions";
import {
  type StepDefinition,
  base64ToBlob,
  blobToBase64,
  resolveModulesAhead,
  resolveTileCurrentWeek,
  resolveModuleContext,
  loadTileWeekTopic,
  gatherModuleMaterials,
} from "@/lib/workflows/registry-helpers";
import { nextLectureWeek } from "@/lib/workflows/next-week";
import type { DeckGenContext } from "@/lib/decks/generate";
import { wrapAnimationDocument } from "@/lib/animation-html";
import { parseLmsModuleValue, liveModuleValue } from "@/lib/workflows/module-value";
import { resolveSourcePolicy } from "@/lib/workflows/source-policy";

const SOURCES_HELP =
  "Which material sources to check (live LMS, course export, uploaded materials zip, repository digest, tile topics/description), their order, and the strategy (stop at first success, check all and merge, or accumulate until a source errors). Blank uses the default (live LMS, then the course export, then the tile's topics/description).";

export const mediaSteps: StepDefinition[] = [
  {
    type: "generate-presentation-from-template",
    name: "Generate a presentation from a template",
    description: "Generate a slide deck from a saved PowerPoint Design template (the assistant fills each slide role) and save it to the Files library. Repeats any loop block over the concepts you list.",
    inputs: [
      { key: "template", label: "Template", type: "deckTemplate", required: true, help: "Pick a PowerPoint Design template." },
      { key: "hubCourse", label: "Course", type: "hubCourse", required: false, help: "Pick the course whose module to build from (optional)." },
      { key: "moduleId", label: "Module", type: "lmsModule", required: false, help: "Pick a module from the course's LMS connection or export; its materials ground the deck." },
      { key: "subject", label: "Subject / topic", type: "text", required: false, help: "Defaults to the picked module or the template name." },
      { key: "concepts", label: "Concepts (one per line)", type: "concepts", required: false, help: "Loop items; defaults to the module's topics when a module is picked." },
      { key: "audience", label: "Audience", type: "text", required: false },
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
      { key: "draftId", label: "Draft id", type: "text" },
      { key: "slideCount", label: "Slide count", type: "text" },
      { key: "presentationTitle", label: "Presentation title", type: "text" },
      { key: "deck", label: "Deck (readable)", type: "longtext" },
      { key: "slidesJson", label: "Slides (JSON)", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const key = String(values.template ?? "").trim();
      if (!key) throw new Error("Provide the template.");
      const tplRes = await getDeckTemplateAction(key);
      if ("error" in tplRes) throw new Error(tplRes.error);
      const template = tplRes.template;

      const hubCourseId = String(values.hubCourse ?? "").trim();
      const moduleIdRaw = String(values.moduleId ?? "").trim();
      const modulesAhead = resolveModulesAhead(values);
      let moduleName = "";
      let materials: string | undefined;
      let moduleNotes: string[] = [];
      let materialSourceNotes: string[] = [];
      const offsetNotes: string[] = [];
      if (hubCourseId) {
        const list = await listCourseHubAction();
        if ("error" in list) throw new Error(list.error);
        const tile = list.courses.find((c) => c.id === hubCourseId);
        if (tile) {
          // Apply module offset: when a module is picked, apply offset relative to that
          // module's position; when no module is picked, derive from current+N.
          let effectiveModuleIdRaw = moduleIdRaw;
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

          onProgress("Gathering module materials...");
          const sourcesPolicy = resolveSourcePolicy(String(values.sources ?? ""));
          const g = await gatherModuleMaterials(tile, effectiveModuleIdRaw, helpers, onProgress, sourcesPolicy);
          moduleName = g.moduleName;
          materials = g.materialsText || undefined;
          moduleNotes = [...moduleNotes, ...g.notes];
          materialSourceNotes = g.notes;
        }
      }
      const subject = String(values.subject ?? "").trim() || moduleName || template.name;
      const concepts = String(values.concepts ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const effectiveConcepts = concepts.length > 0 ? concepts : moduleNotes;
      const audience = String(values.audience ?? "").trim() || template.audience || undefined;
      const loopItems: Record<string, string[]> = {};
      for (const g of template.loops) {
        loopItems[g.id] = g.source === "literal" && g.items.length > 0 ? g.items : effectiveConcepts;
      }
      onProgress("Generating the slide deck...");
      const ctx: DeckGenContext = { subject, audience, tone: template.tone, materials, loopItems };
      // Call the server ACTION (not the shared core directly) so the LLM call
      // runs server-side. Attended workflow runs execute this step in the
      // browser, where process.env.GEMINI_API_KEY does not exist; the action
      // runs on the server where it does. Unattended runs work either way.
      const deck = await generateDeckFromTemplateAction(template, ctx, helpers.provider);
      if ("error" in deck) throw new Error(deck.error);
      // Save the real, downloadable .pptx to the Files library as the primary
      // deliverable. A failure here throws so the run fails loudly rather than
      // silently producing nothing.
      const fileRes = await savePresentationFileAction({
        presentationTitle: deck.presentationTitle,
        slides: deck.slides,
        theme: template.theme,
        author: helpers.author,
        workflowName: helpers.workflowName ?? null,
        workflowId: helpers.workflowId,
        workflowRunId: helpers.workflowRunId,
      });
      if ("error" in fileRes) throw new Error(fileRes.error);
      const safeName = deck.presentationTitle.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "Presentation";
      const summaryText = `Generated a ${deck.slides.length}-slide deck from "${template.name}"${moduleName ? ` for ${moduleName}` : ""} and saved "${safeName}.pptx" to the Files library.`;

      const deckLines: string[] = [deck.presentationTitle];
      for (const slide of deck.slides) {
        deckLines.push(`\n## ${slide.title}`);
        for (const bullet of slide.bullets) {
          deckLines.push(`- ${bullet}`);
        }
        if (slide.code) {
          const codeLanguage = slide.codeLanguage || "";
          deckLines.push(`\`\`\`${codeLanguage}`);
          deckLines.push(slide.code);
          deckLines.push("```");
        }
      }
      const readableDeck = deckLines.join("\n");
      const slidesJson = JSON.stringify(deck.slides);

      return {
        outputs: {
          draftId: fileRes.id,
          slideCount: String(deck.slides.length),
          presentationTitle: deck.presentationTitle,
          deck: readableDeck,
          slidesJson
        },
        summary: (() => {
          const items = [...offsetNotes, ...materialSourceNotes];
          return items.length > 0
            ? { kind: "list" as const, label: summaryText, items }
            : { kind: "text" as const, text: summaryText };
        })(),
      };
    },
  },

  {
    type: "find-case-study-slide",
    name: "Find a case-study slide",
    description: "Retrieve ready slide material (title, factual bullets, lesson) for the best real case study on a topic, from the curated knowledge base.",
    inputs: [
      { key: "topic", label: "Topic", type: "text", required: true }
    ],
    outputs: [
      { key: "caseStudy", label: "Case study", type: "longtext" },
      { key: "found", label: "Found", type: "boolean" }
    ],
    run: async (values, helpers, onProgress) => {
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide a topic.");

      onProgress("Finding a case study...");
      const r = await findCaseStudyMaterialAction(topic);
      if ("error" in r) throw new Error(r.error);

      if (!r.material) {
        return {
          outputs: { caseStudy: "", found: "" },
          summary: { kind: "text", text: `No case study found for "${topic}".` }
        };
      }

      const lines: string[] = [r.material.title, ""];
      for (const bullet of r.material.bullets) {
        lines.push(`- ${bullet}`);
      }

      const caseStudy = lines.join("\n").trim();
      return {
        outputs: { caseStudy, found: "1" },
        summary: { kind: "text", text: `Found case study: ${r.material.title}` }
      };
    },
  },

  {
    type: "generate-slides-standalone",
    name: "Generate slides",
    description: "Generate a single lecture deck (title and slides) from a prompt. Emits the slides as JSON so a later step can revise them.",
    inputs: [
      { key: "prompt", label: "What should the deck cover?", type: "longtext", required: true }
    ],
    outputs: [
      { key: "presentationTitle", label: "Presentation title", type: "text" },
      { key: "deck", label: "Deck (readable)", type: "longtext" },
      { key: "slidesJson", label: "Slides (JSON)", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const prompt = String(values.prompt ?? "").trim();
      if (!prompt) throw new Error("Describe the slides to generate first.");

      onProgress("Generating slides...");
      const r = await generateSlidesAction(prompt, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      const deckLines: string[] = [r.presentationTitle];
      for (const slide of r.slides) {
        deckLines.push(`\n## ${slide.title}`);
        for (const bullet of slide.bullets) {
          deckLines.push(`- ${bullet}`);
        }
      }
      const deck = deckLines.join("\n");

      const slidesJson = JSON.stringify(r.slides);
      const titles = r.slides.map((s) => s.title);

      return {
        outputs: { presentationTitle: r.presentationTitle, deck, slidesJson },
        summary: { kind: "list", label: r.presentationTitle, items: titles.length ? titles : ["(no slides)"] }
      };
    },
  },

  {
    type: "generate-lecture-script",
    name: "Generate a lecture script",
    description: "Write a spoken lecture script for a topic and objectives, to feed narration or an avatar video.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile (optional)",
        type: "hubCourse",
        required: false,
        help: "Scope the workflow to a course tile (or bind one) to auto-fill the topic and objectives from its current module - no need to type them.",
      },
      { key: "topic", label: "Topic", type: "text", required: false, courseDerived: true },
      { key: "objectives", label: "Objectives", type: "longtext", required: false, courseDerived: true },
      { key: "minutes", label: "Target minutes", type: "number", required: false, help: "Default 50." },
      {
        key: "modulesAhead",
        label: "Modules ahead",
        type: "moduleOffset",
        required: false,
        help: "How many modules past the current one to target. 0 or blank = the current module.",
      },
    ],
    outputs: [
      { key: "script", label: "Lecture script", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const { topic, objectives } = await resolveModuleContext(values, helpers);
      if (!topic) throw new Error("Provide a topic, or scope/bind a course tile to derive it from the current module.");
      if (!objectives) throw new Error("Provide the objectives, or scope/bind a course tile to derive them from the current module.");
      const minutesRaw = String(values.minutes ?? "").trim();
      const minutes = minutesRaw && Number.isFinite(Number(minutesRaw)) && Number(minutesRaw) > 0 ? Number(minutesRaw) : 50;
      onProgress("Writing lecture script...");
      const r = await generateLectureScriptAction(topic, objectives, minutes, helpers.provider);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { script: r.script }, summary: { kind: "text", text: r.script } };
    },
  },

  {
    type: "revise-generated-slides",
    name: "Revise slides",
    description: "Apply an edit instruction (rename, remove, add a slide, trim bullets) to a deck's slides. Takes the slides JSON emitted by Generate slides.",
    inputs: [
      {
        key: "presentationTitle",
        label: "Presentation title",
        type: "text",
        required: true,
      },
      {
        key: "slidesJson",
        label: "Slides (JSON)",
        type: "longtext",
        required: true,
        help: "Slides JSON, e.g. wired from Generate slides.",
      },
      {
        key: "instruction",
        label: "Edit instruction",
        type: "text",
        required: true,
      },
    ],
    outputs: [
      {
        key: "slidesJson",
        label: "Revised slides (JSON)",
        type: "longtext",
      },
      {
        key: "deck",
        label: "Deck (readable)",
        type: "longtext",
      },
    ],
    run: async (values, helpers, onProgress) => {
      const title = String(values.presentationTitle ?? "").trim();
      if (!title) throw new Error("Provide the presentation title.");
      const instruction = String(values.instruction ?? "").trim();
      if (!instruction) throw new Error("Provide the edit instruction.");
      const raw = String(values.slidesJson ?? "").trim();
      if (!raw) throw new Error("Provide the slides JSON (wire it from Generate slides).");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("The slides JSON is not valid JSON.");
      }
      if (!Array.isArray(parsed)) throw new Error("The slides JSON must be an array of slides.");
      const currentSlides = parsed as SlideData[];
      onProgress("Revising slides...");
      const r = await reviseLectureSlidesAction(title, currentSlides, instruction, helpers.provider);
      if ("error" in r) throw new Error(r.error);
      const deckLines: string[] = [`# ${title}`];
      for (const slide of r.slides) {
        deckLines.push(`\n## ${slide.title}`);
        for (const bullet of slide.bullets) {
          deckLines.push(`- ${bullet}`);
        }
      }
      const deck = deckLines.join("\n");
      return {
        outputs: {
          slidesJson: JSON.stringify(r.slides),
          deck,
        },
        summary: {
          kind: "list",
          label: title,
          items: r.slides.map((s) => s.title),
        },
      };
    },
  },

  {
    type: "extract-pptx-slides",
    name: "Extract slides from a PowerPoint",
    description: "Read the slide text out of an uploaded .pptx deck, to feed narration or Q&A. Attended-only (needs an uploaded file).",
    inputs: [
      {
        key: "deck",
        label: "PowerPoint file",
        type: "uploads",
        required: true,
        accept: ".pptx",
      },
    ],
    outputs: [
      { key: "slides", label: "Slides", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const files = values.deck as File[] | undefined;
      if (!files || files.length === 0) {
        throw new Error("Upload a .pptx file.");
      }

      const file = files[0];
      onProgress("Reading slides...");

      // Convert the File to base64 (browser-safe, chunked to avoid call-stack limits)
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const base64 = btoa(binary);

      const r = await extractPptxSlidesAction(base64);
      if ("error" in r) throw new Error(r.error);

      // Build a readable slides text: one block per slide
      const slidesLines: string[] = [];
      for (const s of r.slides) {
        slidesLines.push(`Slide ${s.slide}: ${s.title}`);
        if (s.text) {
          slidesLines.push(s.text);
        }
        slidesLines.push("");
      }
      const slides = slidesLines.join("\n");

      // Build items list for summary
      const items = r.slides.length > 0
        ? r.slides.map((s) => `Slide ${s.slide}: ${s.title}`)
        : ["(empty)"];

      return {
        outputs: { slides },
        summary: {
          kind: "list",
          label: `${r.slides.length} slide(s)`,
          items,
        },
      };
    },
  },

  {
    type: "synthesize-narration",
    name: "Synthesize narration audio",
    description: "Turn a script into narration audio with the in-house voice, and save it to a course's materials. Long scripts are synthesized in segments automatically.",
    inputs: [
      {
        key: "text",
        label: "Script",
        type: "longtext",
        required: true,
      },
      {
        key: "voiceId",
        label: "Voice id",
        type: "text",
        required: false,
        help: "Optional - overrides the default voice.",
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Save the audio to this course's materials.",
      },
      {
        key: "fileName",
        label: "File name",
        type: "text",
        required: false,
        help: "Defaults to narration.mp3.",
      },
    ],
    outputs: [
      { key: "saved", label: "Saved", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const text = String(values.text ?? "").trim();
      if (!text) throw new Error("Provide the script to synthesize.");
      const voiceId = String(values.voiceId ?? "").trim() || undefined;
      onProgress("Synthesizing narration...");
      const r = await synthesizeLongNarrationAction(text, voiceId);
      if ("error" in r) throw new Error(r.error);
      const blob = base64ToBlob(r.base64, r.mimeType);
      const hubCourse = String(values.hubCourse ?? "").trim();
      const fileName = String(values.fileName ?? "").trim() || "narration.mp3";
      if (hubCourse && helpers.saveCourseMaterialFile) {
        await helpers.saveCourseMaterialFile(hubCourse, blob, fileName);
        return {
          outputs: { saved: "1" },
          summary: {
            kind: "text",
            text: `Saved ${fileName} to the course materials.`,
          },
        };
      }
      return {
        outputs: { saved: "" },
        summary: {
          kind: "text",
          text: `Generated narration audio (${Math.round(blob.size / 1024)} KB). Select a course tile to save it.`,
        },
      };
    },
  },

  {
    type: "generate-avatar-video",
    name: "Generate an avatar video",
    description: "Start an in-house avatar (talking-head) lecture-video render from a script. Emits a video id for a later poll step.",
    inputs: [
      {
        key: "script",
        label: "Script",
        type: "longtext",
        required: true,
      },
    ],
    outputs: [
      { key: "videoId", label: "Video id", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const script = String(values.script ?? "").trim();
      if (!script) throw new Error("Provide the script to render.");
      onProgress("Starting avatar render...");
      const r = await generateAvatarVideoAction(script);
      if ("error" in r) throw new Error(r.error);
      return {
        outputs: { videoId: r.videoId },
        summary: {
          kind: "text",
          text: `Avatar render started (id ${r.videoId}). Use Poll avatar video to fetch it when ready.`,
        },
      };
    },
  },

  {
    type: "poll-avatar-video",
    name: "Poll an avatar video",
    description: "Check an avatar video render's status and return its download URL when ready.",
    inputs: [
      {
        key: "videoId",
        label: "Video id",
        type: "text",
        required: true,
        help: "The id from Generate an avatar video.",
      },
    ],
    outputs: [
      { key: "status", label: "Status", type: "text" },
      { key: "videoUrl", label: "Video URL", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const videoId = String(values.videoId ?? "").trim();
      if (!videoId) throw new Error("Provide the video id.");
      onProgress("Checking render status...");
      const r = await getAvatarVideoStatusAction(videoId);
      if ("error" in r) throw new Error(r.error);
      const url = r.videoUrl ?? "";
      if (url) {
        return {
          outputs: { status: r.status, videoUrl: url },
          summary: { kind: "link", label: `Render ${r.status}`, url },
        };
      }
      return {
        outputs: { status: r.status, videoUrl: url },
        summary: { kind: "text", text: `Render status: ${r.status}` },
      };
    },
  },

  {
    type: "generate-concept-animations",
    name: "Generate concept animations",
    description:
      "For each selected course tile, detect NEXT week's module and generate a set of animated concept visualizations (self-contained SVG/CSS, no JavaScript) into the tile's materials and the Files tab - optionally also created as unpublished Canvas pages. The week's topic comes from the live LMS first, then the course's LMS export, then the tile's schedule CSV, then its topics list. Courses that are finished, not yet near their start, or where no topic is found are skipped with a note.",
    inputs: [
      {
        key: "courses",
        label: "Course tiles",
        type: "hubCourseList",
        required: true,
        help: "One, several, or all course tiles.",
      },
      {
        key: "maxConcepts",
        label: "Concepts per course",
        type: "number",
        required: false,
        help: "How many animations per course. Default 3 (max 6).",
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
        help: "Optional guidance folded into every animation (e.g. emphasize runtime complexity).",
      },
      {
        key: "publish",
        label: "Create Canvas pages?",
        type: "boolean",
        required: false,
        help: "Also create each animation as an UNPUBLISHED page in the tile's Canvas course - publish them from Canvas when happy.",
      },
    ],
    outputs: [
      { key: "report", label: "Report", type: "longtext" },
      { key: "generated", label: "Animations generated", type: "number" },
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

      const extraNotes = String(values.extraNotes ?? "").trim();
      const publish = String(values.publish ?? "") === "1";

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
          onProgress(`Generating animations for ${tile.name}...`);
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
              const context = extraNotes
                ? `${tile.name} week ${targetWeek}: ${topic}. ${summary}. ${extraNotes}`
                : `${tile.name} week ${targetWeek}: ${topic}. ${summary}`;

          const sanitize = (s: string) =>
            s.trim().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");

          const pageNotes: string[] = [];
          let tileSaved = 0;
          let signInNeeded = false;

          try {
            onProgress(`Planning concepts for ${tile.name}...`);
            const planResult = await generateConceptPlanAction(
              topic,
              summary,
              maxConceptsVal,
              helpers.provider
            );
            if ("error" in planResult) {
              throw new Error(planResult.error);
            }

            for (const { concept, visualIdea } of planResult.concepts) {
              try {
                onProgress(`Animating "${concept}" for ${tile.name}...`);
                const animResult = await generateConceptAnimationAction(
                  concept,
                  visualIdea,
                  context,
                  helpers.provider
                );
                if ("error" in animResult) {
                  throw new Error(animResult.error);
                }

                const fileName = `${sanitize(tile.name)}_Week${targetWeek}_${sanitize(concept)}_Animation.html`;
                const wrapped = wrapAnimationDocument(`${concept} - Week ${targetWeek}`, animResult.html);
                const blob = new Blob([wrapped], { type: "text/html" });

                if (helpers.saveCourseMaterialFile) {
                  try {
                    await helpers.saveCourseMaterialFile(tile.id, blob, fileName);
                    generated++;
                    tileSaved++;
                    const base64 = await blobToBase64(blob);
                    const animLib = await saveLibraryFileAction({
                      name: fileName,
                      base64,
                      mimeType: "text/html",
                      fileExt: "html",
                      workflowId: helpers.workflowId,
                      workflowName: helpers.workflowName,
                      workflowRunId: helpers.workflowRunId,
                    });
                    if ("error" in animLib) {
                      pageNotes.push(`${concept}: library save skipped - ${animLib.error}`);
                    }
                  } catch (err) {
                    pageNotes.push(
                      `Failed to save ${concept}: ${err instanceof Error ? err.message : String(err)}`
                    );
                  }
                } else {
                  signInNeeded = true;
                }

                if (publish && tile.canvasUrl) {
                  try {
                    await createPageAction(
                      tile.canvasUrl,
                      {
                        title: `Week ${targetWeek}: ${concept} (animation)`,
                        body: animResult.html,
                        published: false,
                      },
                      tile.institution ?? undefined
                    );
                  } catch (err) {
                    pageNotes.push(
                      `Failed to create Canvas page for ${concept}: ${
                        err instanceof Error ? err.message : String(err)
                      }`
                    );
                  }
                }
              } catch (err) {
                pageNotes.push(
                  `Concept "${concept}": ${err instanceof Error ? err.message : "failed"}`
                );
              }
            }

            if (signInNeeded) {
              pageNotes.push("Sign in to save animations");
            }

            const notesSuffix = pageNotes.length > 0 ? ` (${pageNotes.join("; ")})` : "";
            reportLines.push(`${tile.name}: week ${targetWeek} (${topic}) - ${tileSaved} animation(s) saved${sourceNote}${notesSuffix}`);
          } catch (err) {
            reportLines.push(
              `${tile.name}: planning failed - ${err instanceof Error ? err.message : "failed"}`
            );
          }
            } catch (err) {
              reportLines.push(
                `${tile.name}, week ${targetWeek}: ${err instanceof Error ? err.message : "failed"}`
              );
            }
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
