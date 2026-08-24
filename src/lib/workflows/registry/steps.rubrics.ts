// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  getRepoZipAction,
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
  resolveTileCurrentWeek,
  loadTileWeekTopic,
} from "@/lib/workflows/registry-helpers";
import { buildDocxFromPlainText } from "@/lib/docx";
import { generateEmbeddedRubricText } from "@/lib/embedded-grader/rubric";
import { resolveCourseKind } from "@/lib/course-kind";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { parseGeneratedRubric } from "@/app/utils/rubric";
import { rubricRatingsForPoints } from "@/lib/grade/rubric-tiers";
import type { RubricCriterionInput } from "@/lib/canvas-modules";
import { courseProgressStatus } from "@/lib/week-numbering";
import { rubricMaterialSteps } from "./steps.rubrics.materials";

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
      {
        key: "courseKind",
        label: "Course type",
        type: "text",
        required: false,
        options: ["coding", "applied"],
        help: "\"applied\" is a no-code course; the rubric is generated against that course's own kind of work instead of assuming a coding assignment.",
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
      const courseKind = resolveCourseKind(values.courseKind);

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
          const gen = await generateCourseRubricFromZipAction(z.base64, helpers.provider, courseKind);
          if (typeof gen !== "string") throw new Error(gen.error);
          rubricText = gen;
        } else {
          isFromFallback = true;
          onProgress("Generating rubric from the course description and schedule...");
          const gen = await generateCourseRubricFromScheduleAction(
            description,
            JSON.stringify(schedule),
            helpers.provider,
            courseKind
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
            // Was a hard-coded "Full marks" / "Partial credit" (half) / "No
            // marks" (zero) ladder, which disagreed with the rubric text this
            // very step had just generated. generateRubric's prompt asks the
            // model for three tiers at 100 / 75 / 50 percent and names them
            // Excellent / Meets Expectations / Needs Improvement; Canvas was
            // then given 100 / 50 / 0 under different names. The document and
            // the scoring disagreed while looking like one artifact - on a
            // 25-point criterion, 6.25 points per criterion between what the
            // rubric said and what it awarded, and invisible to anyone
            // reading it because the labels in the text came from the same
            // generated prose that promised the other numbers.
            //
            // Now built from the model's OWN subcategory labels, so the
            // scoring matches the words next to it, and from the shared
            // RUBRIC_DEDUCTION_TIERS the prompt itself renders from whenever a
            // label carries no percentage. See ../../grade/rubric-tiers.ts.
            ratings: rubricRatingsForPoints(
              pointsValue,
              row.subcategories.map((s) => s.label)
            ),
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
      {
        key: "courseKind",
        label: "Course type",
        type: "text",
        required: false,
        options: ["coding", "applied"],
        help: "\"applied\" is a no-code course; the rubric is built from the assignment's own Requirements/Deliverables instead of assuming code-oriented criteria.",
      },
    ],
    outputs: [
      { key: "rubric", label: "Rubric", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const instructions = String(values.instructions ?? "").trim();
      if (!instructions) {
        throw new Error("Provide the assignment instructions.");
      }
      const courseKind = resolveCourseKind(values.courseKind);

      onProgress("Building rubric...");
      const rubric = generateEmbeddedRubricText(instructions, courseKind);

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

  ...rubricMaterialSteps,

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
