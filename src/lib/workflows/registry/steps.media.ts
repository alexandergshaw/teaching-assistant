// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
//
// generate-presentation-from-template and generate-concept-animations live
// in their own leaf files (steps.media.presentation-from-template.ts,
// steps.media.concept-animations.ts) - extracted only to keep this file
// under the repo-wide 1000-line ceiling (src/file-size-ceiling.structure.test.ts,
// see each leaf's own header comment for why each is a real, self-contained
// seam). Both arrays are spread back into `mediaSteps` below, at their
// original positions, so this file's own public export is unchanged.
import {
  LECTURE_SCRIPT_MAX_MINUTES,
  LECTURE_SCRIPT_MINUTES_HELP,
  checkLectureScriptMinutes,
} from "@/lib/lecture-script-bounds";
import {
  findCaseStudyMaterialAction,
  generateSlidesAction,
  generateLectureScriptAction,
  reviseLectureSlidesAction,
  extractPptxSlidesAction,
  synthesizeLongNarrationAction,
  generateAvatarVideoAction,
  getAvatarVideoStatusAction,
  type SlideData,
} from "@/app/actions";
import {
  type StepDefinition,
  base64ToBlob,
  resolveModuleContext,
} from "@/lib/workflows/registry-helpers";
import { presentationFromTemplateSteps } from "./steps.media.presentation-from-template";
import { conceptAnimationSteps } from "./steps.media.concept-animations";

export const mediaSteps: StepDefinition[] = [
  ...presentationFromTemplateSteps,

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
      {
        key: "minutes",
        label: "Target minutes",
        type: "number",
        required: false,
        // The help string comes from the same module that enforces the range,
        // so the two cannot drift apart the way "Default 50." drifted from an
        // action that accepted at most 30.
        help: `${LECTURE_SCRIPT_MINUTES_HELP} Blank means ${LECTURE_SCRIPT_MAX_MINUTES}.`,
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
      { key: "script", label: "Lecture script", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const { topic, objectives } = await resolveModuleContext(values, helpers);
      if (!topic) throw new Error("Provide a topic, or scope/bind a course tile to derive it from the current module.");
      if (!objectives) throw new Error("Provide the objectives, or scope/bind a course tile to derive them from the current module.");
      // WAS: `... > 0 ? Number(minutesRaw) : 50`. That default of 50 is
      // outside generateLectureScriptAction's accepted 1-30 range, and the
      // action used to answer an out-of-range value by silently substituting
      // 5 - so this step shipped ~700-word scripts while its own run form
      // said "Default 50". The default is now the real maximum, which is the
      // closest honest reading of the original 50-minute intent, and an
      // out-of-range value entered in the run form FAILS THE STEP with a
      // message naming the range instead of quietly producing some other
      // length. See src/lib/lecture-script-bounds.ts.
      const minutesRaw = String(values.minutes ?? "").trim();
      const checked = minutesRaw
        ? checkLectureScriptMinutes(Number(minutesRaw))
        : ({ ok: true, minutes: LECTURE_SCRIPT_MAX_MINUTES } as const);
      if (!checked.ok) throw new Error(checked.error);
      const minutes = checked.minutes;
      onProgress(`Writing a ${minutes}-minute lecture script...`);
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

  ...conceptAnimationSteps,
];
