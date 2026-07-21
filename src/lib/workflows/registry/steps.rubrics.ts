// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  getRepoZipAction,
  listCourseContentAction,
  setCourseRubricAction,
  listCourseHubAction,
  createRubricAction,
  generateCourseRubricFromZipAction,
  generateCourseRubricFromScheduleAction,
  rememberRubricAction,
  findBankedRubricAction,
  bulkAssociateRubricAction,
  ingestRepoAction,
  fetchCanvasMetaAction,
} from "@/app/actions";
import {
  type StepDefinition,
  classifyRubricSource,
  resolveModulesAhead,
  resolveTileCurrentWeek,
  loadTileWeekTopic,
  gatherModuleMaterials,
} from "@/lib/workflows/registry-helpers";
import { buildDocxFromPlainText } from "@/lib/docx";
import { generateEmbeddedRubricText } from "@/lib/embedded-grader/rubric";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { parseGeneratedRubric } from "@/app/utils/rubric";
import type { RubricCriterionInput } from "@/lib/canvas-modules";
import { courseProgressStatus } from "@/lib/week-numbering";
import { liveModuleValue } from "@/lib/workflows/module-value";

export const rubricSteps: StepDefinition[] = [
  {
    type: "lms-rubric",
    name: "Save rubric to LMS",
    description: "Generate a course-wide grading rubric from the repository's assignments, or from the course description and schedule if no repository is linked; save it to the LMS course, onto the course tile, and as a document in the LMS export.",
    inputs: [
      {
        key: "course",
        label: "LMS course",
        type: "lmsCourse",
        required: false,
        help: "Optional - leave blank to skip the LMS steps.",
      },
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: false,
        help: "Optional - when blank, the rubric is generated from the course description and schedule instead.",
      },
      {
        key: "description",
        label: "Course description",
        type: "longtext",
        required: false,
        help: "Powers the no-repository rubric fallback when the repository is blank.",
      },
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: false,
      },
      {
        key: "title",
        label: "Rubric title",
        type: "text",
        required: false,
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Optional - saves the generated rubric onto this course tile.",
      },
    ],
    outputs: [
      { key: "rubricFiles", label: "Rubric files", type: "files" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      const hubCourseId = String(values.hubCourse ?? "").trim();
      const repo = String(values.repo ?? "").trim();
      const description = String(values.description ?? "").trim();
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];

      if (!repo && !description && schedule.length === 0) {
        return {
          outputs: { rubricFiles: [] },
          summary: { kind: "text", text: "Skipped - no repository linked; the rubric needs the course codebase." },
        };
      }

      if (!course && !hubCourseId) {
        return {
          outputs: { rubricFiles: [] },
          summary: { kind: "text", text: "Skipped - no LMS course or course tile to receive the rubric." },
        };
      }

      const title = String(values.title ?? "").trim() || "Course Rubric";

      // Generation is best-effort: a rubric hiccup must never block the LMS
      // export (which now consumes rubricFiles) or the rest of the refresh, so
      // any failure here degrades to an empty rubricFiles.
      const DOCX_MIME =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      let rubricText: string;
      let rubricFiles: GeneratedCourseFile[];
      let criteria: RubricCriterionInput[];
      let isFromFallback = false;
      try {
        if (repo) {
          onProgress("Downloading repository...");
          const z = await getRepoZipAction(repo);
          if ("error" in z) throw new Error(z.error);

          onProgress("Generating rubric...");
          const gen = await generateCourseRubricFromZipAction(z.base64, helpers.provider);
          if (typeof gen !== "string") throw new Error(gen.error);
          rubricText = gen;
        } else {
          isFromFallback = true;
          onProgress("Generating rubric from the course description and schedule...");
          const gen = await generateCourseRubricFromScheduleAction(
            description,
            JSON.stringify(schedule),
            helpers.provider
          );
          if (typeof gen !== "string") throw new Error(gen.error);
          rubricText = gen;
        }

        const rows = parseGeneratedRubric(rubricText);
        if (!rows || rows.length === 0) {
          throw new Error("Could not parse the generated rubric.");
        }

        criteria = rows.map((row) => {
          const pointsValue =
            Number(String(row.weight).replace(/[^0-9.]/g, "")) || 10;
          return {
            description: row.area,
            longDescription: [
              row.description,
              ...row.subcategories.map((s) => `${s.label}: ${s.description}`),
            ].join("\n"),
            points: pointsValue,
            ratings: [
              { description: "Full marks", points: pointsValue },
              { description: "Partial credit", points: Math.round(pointsValue / 2) },
              { description: "No marks", points: 0 },
            ],
          };
        });

        const docxData = await buildDocxFromPlainText(rubricText, [], helpers.author);
        rubricFiles = [
          {
            name: "Grading Rubric.docx",
            blob: new Blob([docxData], { type: DOCX_MIME }),
            mimeType: DOCX_MIME,
            weekNumber: 0,
            sortOrder: 0,
            role: "instructions",
          },
        ];
      } catch (err) {
        return {
          outputs: { rubricFiles: [] },
          summary: {
            kind: "text",
            text: `Rubric skipped - ${err instanceof Error ? err.message : "could not generate the rubric."}`,
          },
        };
      }

      const notes: string[] = [];

      if (isFromFallback) {
        notes.push("generated from the course description and schedule");
      }

      if (hubCourseId) {
        try {
          onProgress("Saving rubric to the course tile...");
          const slug =
            title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 60) ||
            "course-rubric";
          const saved = await setCourseRubricAction(hubCourseId, `${slug}.md`, rubricText);
          if ("error" in saved) throw new Error(saved.error);
          notes.push("saved to the course tile");
        } catch (err) {
          notes.push(`tile save failed (${err instanceof Error ? err.message : "unknown error"})`);
        }
      }

      if (course) {
        try {
          onProgress("Saving rubric to the LMS...");
          const created = await createRubricAction(
            course,
            { title, criteria },
            helpers.activeInstitution || undefined
          );
          if ("error" in created) throw new Error(created.error);
          notes.push(`saved to the LMS (${criteria.length} criteria)`);
        } catch (err) {
          notes.push(`LMS save failed (${err instanceof Error ? err.message : "unknown error"})`);
        }
      } else {
        notes.push("no LMS course - LMS save skipped");
      }

      return {
        outputs: { rubricFiles },
        summary: { kind: "text", text: `Rubric "${title}" ${notes.join("; ")}.` },
      };
    },
  },

  {
    type: "generate-rubric-offline",
    name: "Generate a rubric (offline, no AI)",
    description: "Build a tiered weighted grading rubric from an assignment's instructions with no model call -- a fallback rubric source.",
    inputs: [
      { key: "instructions", label: "Assignment instructions", type: "longtext", required: true },
    ],
    outputs: [
      { key: "rubric", label: "Rubric", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const instructions = String(values.instructions ?? "").trim();
      if (!instructions) {
        throw new Error("Provide the assignment instructions.");
      }

      onProgress("Building rubric...");
      const rubric = generateEmbeddedRubricText(instructions);

      return {
        outputs: { rubric },
        summary: { kind: "text", text: rubric },
      };
    },
  },

  {
    type: "generate-rubric-from-repo",
    name: "Generate a rubric from a repo",
    description: "Generate a grading rubric from a repository's contents.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
    ],
    outputs: [
      { key: "rubric", label: "Rubric", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) {
        throw new Error("Provide a repository.");
      }

      onProgress("Downloading repository...");
      const z = await getRepoZipAction(repo);
      if ("error" in z) {
        throw new Error(z.error);
      }

      onProgress("Generating rubric...");
      const r = await generateCourseRubricFromZipAction(z.base64, helpers.provider);
      if (typeof r !== "string") {
        throw new Error(r.error);
      }

      return {
        outputs: { rubric: r },
        summary: { kind: "text", text: r },
      };
    },
  },

  {
    type: "remember-rubric",
    name: "Bank a rubric for reuse",
    description: "Save a rubric with its assignment topic so it can be reused for similar assignments later.",
    inputs: [
      { key: "rubric", label: "Rubric", type: "longtext", required: true },
      { key: "topic", label: "Topic", type: "text", required: true },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const rubric = String(values.rubric ?? "").trim();
      if (!rubric) throw new Error("Provide the rubric to bank.");
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide the assignment topic.");
      onProgress("Banking rubric...");
      const r = await rememberRubricAction(rubric, topic);
      if ("error" in r) throw new Error(r.error);
      return { outputs: {}, summary: { kind: "text", text: `Banked a rubric for "${topic}".` } };
    },
  },

  {
    type: "find-banked-rubric",
    name: "Find a banked rubric",
    description: "Retrieve a previously banked rubric for a matching topic, to reuse before generating a new one.",
    inputs: [
      { key: "topic", label: "Topic", type: "text", required: true },
    ],
    outputs: [
      { key: "rubric", label: "Rubric", type: "longtext" },
      { key: "matched", label: "Matched", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide a topic.");
      onProgress("Looking up a banked rubric...");
      const r = await findBankedRubricAction(topic);
      if ("error" in r) throw new Error(r.error);
      return {
        outputs: { rubric: r.rubric, matched: r.matched ? "1" : "" },
        summary: { kind: "text", text: r.matched ? r.rubric : `No banked rubric found for "${topic}".` },
      };
    },
  },

  {
    type: "resolve-rubric",
    name: "Resolve a rubric",
    description:
      "Find a grading rubric for a course's current module. Reads the current week/module from the course tile, then tries each listed source in priority order (a live LMS assignment link, then a GitHub repo) and returns the first actual rubric it finds, or source material a later step can generate one from.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
        help: "The rubric is resolved for this tile's CURRENT module/week (same derivation as Find the current week and module).",
      },
      {
        key: "sources",
        label: "Rubric sources (one per line, in priority order)",
        type: "longtext",
        required: true,
        help: "One source per line, highest priority first: a live LMS assignment/discussion URL (.../courses/123/assignments/456), or a GitHub repo (owner/name or a github.com URL).",
      },
    ],
    outputs: [
      { key: "rubric", label: "Rubric", type: "longtext" },
      { key: "material", label: "Source material", type: "longtext" },
      { key: "hasRubric", label: "Found a rubric", type: "boolean" },
      { key: "source", label: "Source used", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) throw new Error("Choose a course tile.");
      const lines = String(values.sources ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.length === 0) throw new Error("Add at least one rubric source.");

      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) throw new Error("Course tile not found.");

      // Current module/week from the tile (mirrors course-progress). Route through
      // resolveTileCurrentWeek for deadline-aware resolution, guard for no/invalid start date.
      const weekResolution = await resolveTileCurrentWeek(tile, helpers);
      let moduleLabel = "the current module";
      let topic = "";
      if (!("skip" in weekResolution)) {
        const rawWeek = weekResolution.rawWeek;
        const status = courseProgressStatus(rawWeek, tile.weeks);
        const displayWeek = tile.weeks && tile.weeks > 0 ? Math.min(rawWeek, tile.weeks) : rawWeek;
        if (status === "not-started") {
          moduleLabel = "Not started";
        } else if (status === "complete") {
          moduleLabel = "Complete";
        } else {
          const wt = await loadTileWeekTopic(tile, displayWeek, helpers);
          topic = "skip" in wt ? "" : wt.topic;
          moduleLabel = `Module ${String(displayWeek).padStart(2, "0")}${topic ? `: ${topic}` : ""}`;
        }
      }

      const notes: string[] = [];
      let fallbackMaterial: { text: string; source: string } | null = null;
      const done = (rubric: string, material: string, hasRubric: boolean, source: string) => ({
        outputs: { rubric, material, hasRubric: hasRubric ? "1" : "", source },
        summary: {
          kind: "text" as const,
          text: `${tile.name} - ${moduleLabel}: ${hasRubric ? "rubric" : "material"} from ${source}.${notes.length ? ` Skipped: ${notes.join("; ")}.` : ""}`,
        },
      });

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const kind = classifyRubricSource(line);

        if (kind === "lms") {
          onProgress(`Checking LMS source ${i + 1}/${lines.length}...`);
          const r = await fetchCanvasMetaAction(line);
          if ("error" in r) {
            notes.push(`${line}: ${r.error}`);
            continue;
          }
          if (r.rubricText.trim()) return done(r.rubricText, "", true, line);
          if (r.description.trim() && !fallbackMaterial) {
            fallbackMaterial = { text: r.description, source: line };
          }
          notes.push(`${line}: resolved but no rubric attached`);
          continue;
        }

        if (kind === "repo") {
          onProgress(`Checking repo source ${i + 1}/${lines.length}...`);
          const r = await ingestRepoAction(line);
          if ("error" in r) {
            notes.push(`${line}: ${r.error}`);
            continue;
          }
          // digest.files carries only TEXT files (readme/code); a rubric.pdf or
          // rubric.docx will not appear and falls through to README material.
          const rubricFile = r.digest.files.find((f) => /(^|\/)rubric[^/]*$/i.test(f.path));
          if (rubricFile && rubricFile.content.trim()) {
            return done(rubricFile.content, "", true, line);
          }
          if (r.digest.text.trim()) {
            const material = [r.digest.description, r.digest.text].filter(Boolean).join("\n\n");
            return done("", material, false, line);
          }
          notes.push(`${line}: repo has no readable material`);
          continue;
        }

        if (kind === "topic") {
          onProgress(`Checking the rubric bank for "${line}"...`);
          const r = await findBankedRubricAction(line);
          if (!("error" in r) && r.matched) {
            return done(r.rubric, "", true, `banked:${line}`);
          }
          notes.push(`${line}: no banked rubric`);
          continue;
        }

        notes.push(`${line}: not a recognized source`);
      }

      // Last resort: the derived module topic against the rubric bank.
      if (topic) {
        const r = await findBankedRubricAction(topic);
        if (!("error" in r) && r.matched) {
          return done(r.rubric, "", true, `banked:${topic}`);
        }
      }

      if (fallbackMaterial) {
        return done("", fallbackMaterial.text, false, fallbackMaterial.source);
      }

      return {
        outputs: { rubric: "", material: "", hasRubric: "", source: "" },
        summary: {
          kind: "text" as const,
          text: `No rubric or material found for ${tile.name} - ${moduleLabel}. Tried ${lines.length} source(s).${notes.length ? ` (${notes.join("; ")})` : ""}`,
        },
      };
    },
  },

  {
    type: "pull-fallback-sources",
    name: "Pull from fallback sources",
    description:
      "Pull a priority-ordered list of sources (LMS links and/or GitHub repos) one after another, with a mode that controls how far it goes.",
    inputs: [
      {
        key: "sources",
        label: "Sources (one per line, in priority order)",
        type: "longtext",
        required: true,
        help: "One source per line, highest priority first: a Canvas URL (assignment/discussion/course) or a GitHub repo (owner/name or a github.com URL).",
      },
      {
        key: "mode",
        label: "Mode",
        type: "text",
        required: false,
        help: "until-success (default): stop at the first source that returns content. all-sources: pull every source and combine. until-failure: pull in order and stop at the first source that fails or is empty.",
      },
    ],
    outputs: [
      { key: "material", label: "Pulled material", type: "longtext" },
      { key: "sourcesUsed", label: "Sources used", type: "text" },
      { key: "hasResult", label: "Got a result", type: "boolean" },
      { key: "count", label: "Sources pulled", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const lines = String(values.sources ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.length === 0) throw new Error("Add at least one source.");

      const mode = String(values.mode ?? "").trim().toLowerCase() || "until-success";
      const validModes = ["until-success", "all-sources", "until-failure"];
      if (!validModes.includes(mode)) {
        throw new Error("Mode must be until-success, all-sources, or until-failure.");
      }

      // Per-source pull helper: classify, fetch, and return result.
      const pullSource = async (
        line: string
      ): Promise<{ ok: boolean; text: string; note: string; label: string }> => {
        const kind = classifyRubricSource(line);

        if (kind === "lms") {
          try {
            const r = await fetchCanvasMetaAction(line);
            if ("error" in r) {
              return { ok: false, text: "", note: `${line}: ${r.error}`, label: line };
            }
            const combined = [r.rubricText, r.description].filter(Boolean).join("\n\n");
            if (combined.trim()) {
              return { ok: true, text: combined, note: "", label: line };
            }
            return { ok: false, text: "", note: `${line}: resolved but empty`, label: line };
          } catch (err) {
            return {
              ok: false,
              text: "",
              note: `${line}: ${err instanceof Error ? err.message : String(err)}`,
              label: line,
            };
          }
        }

        if (kind === "repo") {
          try {
            const r = await ingestRepoAction(line);
            if ("error" in r) {
              return { ok: false, text: "", note: `${line}: ${r.error}`, label: line };
            }
            const combined = [r.digest.description, r.digest.text].filter(Boolean).join("\n\n");
            if (combined.trim()) {
              return { ok: true, text: combined, note: "", label: line };
            }
            return { ok: false, text: "", note: `${line}: resolved but empty`, label: line };
          } catch (err) {
            return {
              ok: false,
              text: "",
              note: `${line}: ${err instanceof Error ? err.message : String(err)}`,
              label: line,
            };
          }
        }

        // topic or skip: not a pullable source
        return {
          ok: false,
          text: "",
          note: `${line}: not a pullable source (use a Canvas URL or GitHub repo)`,
          label: line,
        };
      };

      const notes: string[] = [];
      const sources: { text: string; label: string }[] = [];
      let stoppedAt: string | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        onProgress(`Pulling source ${i + 1}/${lines.length}...`);
        const result = await pullSource(line);

        if (result.ok) {
          sources.push({ text: result.text, label: result.label });
          if (mode === "until-success") {
            // Stop at first success
            break;
          }
          // For all-sources and until-failure, continue
        } else {
          notes.push(result.note);
          if (mode === "until-failure") {
            // Stop at first failure
            stoppedAt = result.label;
            break;
          }
          // For until-success and all-sources, continue
        }
      }

      const material = sources.map((s) => s.text).join("\n\n---\n\n");
      const sourcesUsed = sources.map((s) => s.label).join(", ");
      const hasResult = material.trim() ? "1" : "";
      const count = sources.length;

      let modeDesc = mode;
      if (mode === "until-success") {
        modeDesc = "until-success";
      } else if (mode === "all-sources") {
        modeDesc = "all-sources";
      } else if (mode === "until-failure") {
        modeDesc = "until-failure";
      }

      const notesText =
        notes.length > 0 && stoppedAt
          ? `Stopped at ${stoppedAt}. Skipped/failed: ${notes.join("; ")}.`
          : notes.length > 0
            ? `Skipped/failed: ${notes.join("; ")}.`
            : "";

      return {
        outputs: { material, sourcesUsed, hasResult, count },
        summary: {
          kind: "text" as const,
          text: `${modeDesc}: pulled ${count} source(s). ${notesText}`.trim(),
        },
      };
    },
  },

  {
    type: "pull-current-materials",
    name: "Pull current module materials",
    description:
      "Pull the current week/module's materials for a course tile from its LMS course and/or GitHub repos. The current module is taken from the bound week (e.g. from Find the current week and module) or derived from the tile's start date and schedule; the LMS module is the one at the current week's position.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
        help: "The current week/module is derived from this tile (start date + schedule), and its LMS course is one source.",
      },
      {
        key: "week",
        label: "Current week (optional)",
        type: "number",
        required: false,
        help: "Bind from Find the current week and module, or leave blank to derive from the tile's start date.",
      },
      {
        key: "repos",
        label: "GitHub repos (one per line, optional)",
        type: "longtext",
        required: false,
        help: "Also pull the week's materials from these repos (owner/name or a github.com URL), one per line.",
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
      { key: "materials", label: "Materials", type: "longtext" },
      { key: "moduleName", label: "Module", type: "text" },
      { key: "week", label: "Week", type: "number" },
      { key: "sourcesUsed", label: "Sources used", type: "text" },
      { key: "hasMaterials", label: "Got materials", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      // Step 1: Load the hub course tile.
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) throw new Error("Choose a course tile.");

      onProgress("Reading the course...");
      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) throw new Error("Course tile not found.");

      // Step 2: Resolve the week.
      // Precedence: explicit week > modulesAhead > current
      const boundWeek = Number(values.week);
      let rawWeek: number;
      if (Number.isFinite(boundWeek) && boundWeek > 0) {
        rawWeek = boundWeek;
      } else {
        const weekResolution = await resolveTileCurrentWeek(tile, helpers);
        if ("skip" in weekResolution) {
          throw new Error(
            `"${tile.name}" has no start date set - add one on the course tile, or bind a week.`
          );
        }
        rawWeek = weekResolution.rawWeek;
        // Apply modulesAhead only if week is not bound
        const modulesAhead = resolveModulesAhead(values);
        rawWeek = rawWeek + modulesAhead;
      }
      const status = courseProgressStatus(rawWeek, tile.weeks);
      const displayWeek = tile.weeks && tile.weeks > 0 ? Math.min(rawWeek, tile.weeks) : rawWeek;

      // Topic from the course schedule CSV, when present.
      const wt = await loadTileWeekTopic(tile, displayWeek, helpers);
      const topic = "skip" in wt ? "" : wt.topic;
      let moduleName =
        status === "not-started"
          ? "Not started"
          : status === "complete"
            ? "Complete"
            : `Module ${String(displayWeek).padStart(2, "0")}${topic ? `: ${topic}` : ""}`;

      // Step 3: Collect materials into chunks.
      const MATERIALS_CAP = 20000;
      const chunks: string[] = [];
      const notes: string[] = [];
      const used: string[] = [];
      let total = 0;
      let truncated = false;

      const push = (text: string) => {
        if (!text) return;
        if (total >= MATERIALS_CAP) {
          truncated = true;
          return;
        }
        const slice = text.slice(0, MATERIALS_CAP - total);
        if (slice.length < text.length) truncated = true;
        chunks.push(slice);
        total += slice.length;
      };

      // Step 4: LMS pull (only if tile has a canvas URL and status is in-progress).
      const canvasUrlTrimmed = String(tile.canvasUrl ?? "").trim();
      if (
        canvasUrlTrimmed &&
        status !== "not-started" &&
        status !== "complete"
      ) {
        try {
          onProgress("Reading the LMS course modules...");
          const content = await listCourseContentAction(canvasUrlTrimmed, helpers.activeInstitution || undefined);
          if ("error" in content) {
            notes.push(`LMS: ${content.error}`);
          } else {
            const mod = content.modules[displayWeek - 1];
            if (!mod) {
              notes.push(`no LMS module at week ${displayWeek}`);
            } else {
              const g = await gatherModuleMaterials(
                tile,
                liveModuleValue(mod.id, mod.name),
                helpers,
                onProgress
              );
              push(g.materialsText);
              if (g.notes && g.notes.length > 0) {
                notes.push(...g.notes);
              }
              if (g.moduleName) moduleName = g.moduleName;
              if (g.materialsText.trim()) {
                used.push(`LMS module "${g.moduleName}"`);
              }
            }
          }
        } catch (err) {
          notes.push(`LMS error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Step 5: Repo pull (for each non-empty line in repos).
      const repoLines = String(values.repos ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      for (let i = 0; i < repoLines.length; i++) {
        const line = repoLines[i];
        try {
          onProgress(`Reading repo ${i + 1}...`);
          const r = await ingestRepoAction(line);
          if ("error" in r) {
            notes.push(`repo ${line}: ${r.error}`);
            continue;
          }

          // Prefer week-matched files.
          const wk = displayWeek;
          const re = new RegExp(`(week|wk|module|unit)[^0-9]?0*${wk}(?![0-9])`, "i");
          const matched = r.digest.files.filter((f) => re.test(f.path));

          let repoPushed = false;
          if (matched.length > 0) {
            const matchedText = matched
              .map((f) => `# ${f.path}\n${f.content}`)
              .join("\n\n");
            push(matchedText);
            repoPushed = true;
          } else {
            const fallbackText = [r.digest.description, r.digest.text]
              .filter(Boolean)
              .join("\n\n");
            if (fallbackText.trim()) {
              push(fallbackText);
              repoPushed = true;
            }
          }

          if (repoPushed) {
            used.push(
              `repo ${line}${matched.length > 0 ? ` (week ${wk} files)` : ""}`
            );
          } else {
            notes.push(`repo ${line}: had no readable material`);
          }
        } catch (err) {
          notes.push(`repo ${line}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (truncated) {
        notes.push("materials truncated to ~20000 characters");
      }

      // Step 6: Build outputs.
      const materials = chunks.join("\n\n---\n\n");
      const hasMaterials = materials.trim() ? "1" : "";

      const summaryText = `${tile.name} - ${moduleName}: ${
        used.length > 0
          ? `pulled from ${used.join(", ")}`
          : "no materials found"
      }${
        notes.length > 0 ? ` (${notes.join("; ")})` : ""
      }.`;

      return {
        outputs: {
          materials,
          moduleName,
          week: displayWeek,
          sourcesUsed: used.join(", "),
          hasMaterials,
        },
        summary: { kind: "text" as const, text: summaryText },
      };
    },
  },

  {
    type: "bulk-associate-rubric",
    name: "Attach a rubric to assignments",
    description: "Associate one rubric with many assignments across a course at once. Attended-only.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "rubricId", label: "Rubric id", type: "text", required: true, help: "The numeric Canvas rubric id." },
      { key: "assignmentIds", label: "Assignment ids", type: "longtext", required: true, help: "One assignment id per line." },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "succeeded", label: "Succeeded", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) {
        throw new Error("Select an LMS course.");
      }

      const rubricIdRaw = String(values.rubricId ?? "").trim();
      if (!/^\d+$/.test(rubricIdRaw)) {
        throw new Error("Provide the numeric rubric id.");
      }
      const rubricId = Number(rubricIdRaw);

      const ids = String(values.assignmentIds ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) {
        throw new Error("Provide at least one assignment id.");
      }

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Associating rubric...");
      const r = await bulkAssociateRubricAction(course, rubricId, ids, inst);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const succeeded = r.updated;
      return {
        outputs: { succeeded },
        summary: { kind: "text", text: `Associated the rubric with ${succeeded} assignment(s).` },
      };
    },
  },
];
