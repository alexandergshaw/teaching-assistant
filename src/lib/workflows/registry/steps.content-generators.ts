// Client-side step catalog: generator-related step definitions.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  extractTopicsFromRepoAction,
  generateModuleIntroAction,
  generateLessonPlanAction,
  generateExamplesAction,
  extractPptxSlidesAction,
  generateDocumentTextAction,
  findPracticeProblemsAction,
} from "@/app/actions";
import {
  type StepDefinition,
  resolveModuleObjectives,
} from "@/lib/workflows/registry-helpers";
import { applyTextRevision } from "@/lib/embedded/revise";
import { draftUpcomingLecturesStep } from "@/lib/workflows/registry/steps.content-generators.draft-upcoming-lectures";

export const contentGeneratorSteps: StepDefinition[] = [
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

  draftUpcomingLecturesStep,
];
