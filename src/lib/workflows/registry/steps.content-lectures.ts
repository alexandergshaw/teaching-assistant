// Client-side step catalog: lecture-related step definitions.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  getRepoZipAction,
  generateLecturePlansAction,
  generateLectureMaterialsFromScheduleAction,
  listCourseContentAction,
  listCourseHubAction,
  generateLectureFromMaterialsAction,
  regenerateAnnouncementAction,
  generateClassOpenerAction,
  findCaseStudyMaterialAction,
  findPracticeProblemsAction,
  saveLibraryFileAction,
} from "@/app/actions";
import {
  type StepRunResult,
  type StepDefinition,
  blobToBase64,
  resolveModulesAhead,
  resolveTileCurrentWeek,
  resolveDeckTheme,
  gatherModuleMaterials,
  assembleLectureFiles,
} from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import { buildSlidesPptx } from "@/lib/pptx";
import { buildDocxFromPlainText } from "@/lib/docx";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { parseLmsModuleValue, liveModuleValue } from "@/lib/workflows/module-value";
import { resolveSourcePolicy, type SourcePolicy } from "@/lib/workflows/source-policy";
import { resolveRepolessSchedule } from "@/lib/workflows/registry/schedule-resolution";

const SOURCES_HELP =
  "Which additional material sources to check (live LMS, course export, uploaded materials zip, repository digest, tile topics/description), their order, and the strategy (stop at first success, check all and merge, or accumulate until a source errors). Blank uses the default (live LMS, then the course export, then the tile's topics/description).";

// Tolerant module-number match: the same idiom used in
// registry-helpers.sources.ts and steps.lms-integrations.ts ("Module NN" vs
// "Week N" style names) - lets a resolved module name target a single
// schedule week in the repoless path (AC5).
const MODULE_NUMBER_PATTERN = /(?:module|week)\s*0*(\d+)/i;

// Non-repo material sources supplement a repo-driven step's primary pipeline;
// the "repo" kind there refers to that pipeline's own required repo input,
// never the generic repo-digest gatherer (which would redundantly re-digest
// the same repository through a different path).
async function gatherSupplementalMaterials(
  hubCourseId: string,
  helpers: Parameters<typeof gatherModuleMaterials>[2],
  onProgress: (msg: string) => void,
  sourcesRaw: string,
  excludeRepo: boolean,
  sourceHint?: string,
  moduleIdRaw = ""
): Promise<{ text: string; notes: string[] }> {
  const policy = resolveSourcePolicy(sourcesRaw);
  const effectivePolicy: SourcePolicy = excludeRepo
    ? { order: policy.order.filter((k) => k !== "repo"), strategy: policy.strategy }
    : policy;
  const notes: string[] = [];
  if (excludeRepo && policy.order.includes("repo")) {
    notes.push("policy's repository entry is ignored here - the step's own repo input is always the primary source");
  }
  if (!hubCourseId || effectivePolicy.order.length === 0) {
    return { text: "", notes };
  }
  const list = await listCourseHubAction();
  if ("error" in list) return { text: "", notes };
  const tile = list.courses.find((c) => c.id === hubCourseId);
  if (!tile) return { text: "", notes };
  const g = await gatherModuleMaterials(tile, moduleIdRaw, helpers, onProgress, effectivePolicy, { sourceHint });
  return { text: g.materialsText, notes: [...notes, ...g.notes] };
}

// lecture-zip without a linked repository: builds the same decks+notes zip
// from the configured material sources and the course schedule, mirroring
// lecture-materials-from-schedule's run (gatherModuleMaterials with the
// resolved policy, generateLectureMaterialsFromScheduleAction,
// assembleLectureFiles) instead of the repo digest pipeline. Never a silent
// skip: missing content sources are a clear error.
async function runLectureZipRepoless(
  values: Record<string, unknown>,
  helpers: Parameters<typeof gatherModuleMaterials>[2],
  onProgress: (msg: string) => void,
  minutes: number
): Promise<StepRunResult> {
  const hubCourseId = String(values.hubCourse ?? "").trim();
  if (!hubCourseId) {
    throw new Error("Link a repository or choose a course tile - the step needs at least one content source.");
  }

  const list = await listCourseHubAction();
  if ("error" in list) {
    throw new Error(list.error);
  }
  const tile = list.courses.find((c) => c.id === hubCourseId);
  if (!tile) {
    throw new Error("Choose a course tile.");
  }

  const moduleIdRaw = String(values.moduleId ?? "").trim();
  const policy = resolveSourcePolicy(String(values.sources ?? ""));
  const gathered = await gatherModuleMaterials(tile, moduleIdRaw, helpers, onProgress, policy);

  const scheduleResolution = resolveRepolessSchedule(values.schedule, tile, gathered.moduleNames);
  let schedule = scheduleResolution.schedule;
  const tierDetail = `schedule tiers tried: ${scheduleResolution.tried.join("; ")}`;

  // AC5: when a module was specified and its name yields a week number (the
  // AC2 regex idiom) that matches a week in the resolved schedule, narrow
  // generation to that single week; otherwise keep the full schedule and
  // note that no week could be matched. Blank/unset moduleId leaves the
  // schedule untouched - today's behavior exactly.
  let moduleTargetingNote: string | null = null;
  if (moduleIdRaw) {
    const picked = parseLmsModuleValue(moduleIdRaw);
    const weekMatch = (picked.name ?? "").match(MODULE_NUMBER_PATTERN);
    if (weekMatch) {
      const weekNum = parseInt(weekMatch[1], 10);
      const matchingWeek = schedule.find((w) => w.week === weekNum);
      if (matchingWeek) {
        schedule = [matchingWeek];
        moduleTargetingNote = `targeted week ${weekNum} for module "${picked.name}"`;
      } else {
        moduleTargetingNote = `module "${picked.name}" names week ${weekNum}, but the resolved schedule has no matching week - using the full schedule`;
      }
    } else if (picked.name) {
      moduleTargetingNote = `module "${picked.name}" has no week number to match - using the full schedule`;
    } else {
      // A bare live id carries no name to derive a week from. Say so rather
      // than silently ignoring a module the user explicitly chose.
      moduleTargetingNote = "the chosen module carries no name to match a schedule week - using the full schedule";
    }
  }

  if (schedule.length === 0) {
    if (!gathered.materialsText.trim()) {
      const checked = [...gathered.notes, tierDetail];
      throw new Error(`No usable content sources for "${tile.name}": ${checked.join("; ")}.`);
    }
    // Materials exist, but the generation action requires topic-bearing
    // weeks - never let its own "Schedule is empty."/"No weeks with topics
    // found in the schedule." errors surface; name exactly what to add.
    throw new Error(
      `No weeks with topics for "${tile.name}": add a schedule with topics to the course tile, bind a schedule, or fill the tile's topics field. ${tierDetail}.`
    );
  }

  const description = [tile.topics ?? "", tile.description ?? ""].filter(Boolean).join("\n\n");

  onProgress("Generating lecture materials from course sources...");
  const scheduleJson = JSON.stringify(schedule);
  const plans = await generateLectureMaterialsFromScheduleAction(
    scheduleJson,
    description,
    minutes,
    helpers.provider,
    undefined,
    undefined,
    gathered.materialsText || undefined
  );

  if ("error" in plans) {
    throw new Error(plans.error);
  }

  const result = await assembleLectureFiles(plans, values, helpers, onProgress, "lecture_materials");
  if (result.summary.kind === "list") {
    result.summary.label = `Built from course sources - no repository linked (${plans.length} deck${plans.length === 1 ? "" : "s"})`;
    result.summary.items = [
      ...result.summary.items,
      ...(scheduleResolution.note ? [scheduleResolution.note] : []),
      ...(moduleTargetingNote ? [moduleTargetingNote] : []),
      ...gathered.notes,
      "includeInstructions is repo-specific and does not apply in repoless mode",
    ];
  }

  return {
    outputs: { files: result.files },
    summary: result.summary,
  };
}

export const contentLectureSteps: StepDefinition[] = [
  {
    type: "lecture-zip",
    name: "Build lecture materials zip",
    description: "Generate presentation slides and lecture notes as a zip file saved to the Files tab. Slides are styled by a PPT Design template (Classic Lecture by default).",
    inputs: [
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: false,
        help: "The repository is the primary source when linked - without one, the step builds the zip from the configured material sources and the course schedule instead.",
      },
      {
        key: "minutes",
        label: "Lecture duration (minutes)",
        type: "number",
        required: true,
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Optional - names the zip after this course tile.",
      },
      {
        key: "includeInstructions",
        label: "Include assignment instructions",
        type: "boolean",
        required: false,
        help: "Adds each week's Instructions document to the materials.",
      },
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: false,
        help: "When bound, each deck is titled with its module's topic.",
      },
      {
        key: "template",
        label: "Deck template",
        type: "deckTemplate",
        required: false,
        help: "A PPT Design template that styles the generated slides. Blank uses Classic Lecture (the app's standard look). Slide content still comes from this step's own generator.",
      },
      {
        key: "sources",
        label: "Material sources",
        type: "sourcePolicy",
        required: false,
        help: `${SOURCES_HELP} The repository is the primary source when linked (this step's own Repository input); other configured sources supplement it, or stand alone as the step's material source when no repository is linked.`,
      },
      {
        key: "moduleId",
        label: "Current module",
        type: "lmsModule",
        required: false,
        help: "Bind to \"Find the current week and module\", pick a module, or set it once in workflow scope. Blank = the step resolves the current module itself.",
      },
    ],
    outputs: [
      { key: "files", label: "Generated files", type: "files" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      const minutes = Number(values.minutes);

      if (!repo) {
        return runLectureZipRepoless(values, helpers, onProgress, minutes);
      }

      onProgress("Downloading repository...");
      const z = await getRepoZipAction(repo);
      if ("error" in z) {
        throw new Error(z.error);
      }

      const hubCourseId = String(values.hubCourse ?? "").trim();
      const moduleIdRaw = String(values.moduleId ?? "").trim();
      const supplemental = await gatherSupplementalMaterials(
        hubCourseId,
        helpers,
        onProgress,
        String(values.sources ?? ""),
        true,
        undefined,
        moduleIdRaw
      );

      onProgress("Generating lecture plans...");
      const plans = await generateLecturePlansAction(
        z.base64,
        minutes,
        undefined,
        undefined,
        helpers.provider,
        supplemental.text || undefined
      );

      if ("error" in plans) {
        throw new Error(plans.error);
      }

      // When schedule is bound, use each module's topic to title the deck.
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      if (schedule.length > 0) {
        for (const plan of plans) {
          const scheduleEntry = schedule.find((s) => s.week === plan.weekNumber);
          if (scheduleEntry && scheduleEntry.topic.trim()) {
            plan.presentationTitle = scheduleEntry.topic;
          }
        }
      }

      const baseName = repo
        .split("/")
        .pop()
        ?.replace(/[^a-z0-9]/gi, "_")
        .replace(/_+/g, "_") || "lecture_plans";

      const result = await assembleLectureFiles(plans, values, helpers, onProgress, baseName);
      if (supplemental.notes.length > 0 && result.summary.kind === "list") {
        result.summary.items = [...result.summary.items, ...supplemental.notes];
      }
      return {
        outputs: { files: result.files },
        summary: result.summary,
      };
    },
  },

  {
    type: "lecture-materials-from-schedule",
    name: "Build lecture materials from schedule",
    description: "Generate presentation slides and lecture notes from a course schedule (for courses without a code base).",
    inputs: [
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: true,
      },
      {
        key: "minutes",
        label: "Lecture duration (minutes)",
        type: "number",
        required: true,
        help: "Target lecture length. Defaults to 50 minutes if blank.",
      },
      {
        key: "description",
        label: "Course description",
        type: "longtext",
        required: false,
        help: "Provides context for generating slides and materials.",
      },
      {
        key: "context",
        label: "Additional context (optional)",
        type: "longtext",
        required: false,
        help: "Steers the generated materials (tone, emphases, constraints, course-specific facts).",
      },
      {
        key: "sourceMaterial",
        label: "Source material (optional)",
        type: "longtext",
        required: false,
        help: "Name the primary source (textbook, course module, etc.) and paste its table of contents or chapter list. Materials reference and ground in the source where applicable. Falls back to the course tile's textbook field (name-only, no TOC alignment) when left blank.",
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Optional - names the zip after this course tile.",
      },
      {
        key: "includeInstructions",
        label: "Include assignment instructions",
        type: "boolean",
        required: false,
        help: "Adds each week's Instructions document to the materials.",
      },
      {
        key: "template",
        label: "Deck template",
        type: "deckTemplate",
        required: false,
        help: "A PPT Design template that styles the generated slides. Blank uses Classic Lecture.",
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
      { key: "files", label: "Generated files", type: "files" },
    ],
    run: async (values, helpers, onProgress) => {
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      const minutes = Number(values.minutes);
      const description = String(values.description ?? "").trim();
      const context = String(values.context ?? "").trim() || undefined;
      let sourceMaterial = String(values.sourceMaterial ?? "").trim();

      // Fallback: an empty sourceMaterial falls back to the course tile's
      // textbook field, used as a name-only source (weaker grounding - the
      // action mentions it by name only, with no chapter/TOC alignment).
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!sourceMaterial && hubCourseId) {
        const tileList = await listCourseHubAction();
        if (!("error" in tileList)) {
          const tile = tileList.courses.find((c) => c.id === hubCourseId);
          const textbook = (tile?.textbook ?? "").trim();
          if (textbook) sourceMaterial = textbook;
        }
      }

      if (!schedule.length) {
        throw new Error("No schedule provided.");
      }

      const supplemental = await gatherSupplementalMaterials(
        hubCourseId,
        helpers,
        onProgress,
        String(values.sources ?? ""),
        false,
        sourceMaterial || undefined
      );

      onProgress("Generating lecture materials from schedule...");
      const scheduleJson = JSON.stringify(schedule);
      const plans = await generateLectureMaterialsFromScheduleAction(
        scheduleJson,
        description,
        minutes,
        helpers.provider,
        context,
        sourceMaterial || undefined,
        supplemental.text || undefined
      );

      if ("error" in plans) {
        throw new Error(plans.error);
      }

      const baseName = "lecture_materials";

      const result = await assembleLectureFiles(plans, values, helpers, onProgress, baseName);
      if (supplemental.notes.length > 0 && result.summary.kind === "list") {
        result.summary.items = [...result.summary.items, ...supplemental.notes];
      }
      return {
        outputs: { files: result.files },
        summary: result.summary,
      };
    },
  },

  {
    type: "generate-class-openers",
    name: "Generate class openers",
    description: "Generate ~30-minute class openers (case study + warm-up coding exercise) for each week as docx files packaged in a zip.",
    inputs: [
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: true,
        help: "The weekly topics for which openers are generated.",
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Optional - when bound, names the zip after this course tile.",
      },
      {
        key: "minutes",
        label: "Target opener length (minutes)",
        type: "number",
        required: false,
        help: "Target opener length in minutes. Default 30.",
      },
    ],
    outputs: [
      { key: "report", label: "Generation report", type: "longtext" },
      { key: "count", label: "Openers generated", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      if (!schedule.length) {
        return {
          outputs: { report: "No schedule provided.", count: 0 },
          summary: { kind: "text", text: "Skipped - no schedule was provided." },
        };
      }

      const targetMinutes = Math.max(5, Math.min(Number(values.minutes ?? 30), 120));
      const reportLines: string[] = [];
      const files: GeneratedCourseFile[] = [];

      onProgress("Generating class openers...");

      for (const week of schedule) {
        if (!week.topic || !week.topic.trim()) {
          reportLines.push(`Week ${week.week}: Skipped (no topic).`);
          continue;
        }

        try {
          const topicText = week.topic.trim();
          onProgress(`Generating opener for week ${week.week}: ${topicText}`);

          const caseStudyResult = await findCaseStudyMaterialAction(topicText);
          const caseStudyMaterial = "material" in caseStudyResult ? caseStudyResult.material : null;

          const practiceResult = await findPracticeProblemsAction(topicText, 2);
          const practiceProblems = "problems" in practiceResult ? practiceResult.problems : [];

          const openerResult = await generateClassOpenerAction(
            topicText,
            week.summary,
            targetMinutes,
            caseStudyMaterial,
            practiceProblems,
            helpers.provider
          );

          if ("error" in openerResult) {
            reportLines.push(`Week ${week.week} (${topicText}): Error - ${openerResult.error}`);
            continue;
          }

          const docxData = await buildDocxFromPlainText(openerResult.text, [], helpers.author);

          files.push({
            name: `Week ${week.week} Opener - ${topicText}.docx`,
            blob: new Blob([docxData], {
              type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            }),
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            weekNumber: week.week,
            sortOrder: 0,
            role: "instructions",
            pageText: openerResult.text,
          });

          reportLines.push(`Week ${week.week} (${topicText}): OK`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          reportLines.push(`Week ${week.week}: Error - ${msg}`);
        }
      }

      if (files.length === 0) {
        throw new Error("Failed to generate any class openers: every week failed or was skipped.");
      }

      onProgress("Assembling zip...");
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      for (const file of files) {
        zip.file(file.name, file.blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });

      const hubCourseId = String(values.hubCourse ?? "").trim();
      let baseName = "class_openers";
      if (hubCourseId) {
        const list = await listCourseHubAction();
        if (!("error" in list)) {
          const tile = list.courses.find((c) => c.id === hubCourseId);
          if (tile?.name?.trim()) {
            baseName = tile.name.trim().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_") || baseName;
          }
        }
      }

      if (typeof document !== "undefined") {
        onProgress("Downloading zip...");
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${baseName}_openers.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      if (helpers.saveBundle) {
        try {
          await helpers.saveBundle(zipBlob, `${baseName} Class Openers`);
        } catch (err) {
          console.error("Library save failed:", err);
        }
      }

      if (helpers.saveCourseMaterialFile && hubCourseId) {
        try {
          await helpers.saveCourseMaterialFile(hubCourseId, zipBlob, `${baseName} Class Openers.zip`);
        } catch (err) {
          console.error("Course tile save failed:", err);
        }
      }

      return {
        outputs: { report: reportLines.join("\n"), count: files.length },
        summary: {
          kind: "list",
          label: `Generated ${files.length} class openers`,
          items: files.map((f) => f.name),
        },
      };
    },
  },

  {
    type: "prepare-lecture",
    name: "Prepare lecture",
    description:
      "Build a lecture deck from a module's materials (page bodies, files, assignment/homework descriptions, and item titles) and save it to the course tile and the Files tab. Pauses for announcement review unless Autonomous is on; in Autonomous mode with no course tile it prepares a lecture for every tile. Slides are styled by a PPT Design template (Classic Lecture by default).",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Leave empty in Autonomous mode to prepare a lecture for every course tile.",
      },
      {
        key: "moduleId",
        label: "Module",
        type: "lmsModule",
        required: false,
        help: "Pick from the live LMS connection or the course's LMS export; without either the step falls back to the tile's topics.",
      },
      {
        key: "autonomous",
        label: "Autonomous (no review, all tiles)",
        type: "boolean",
        required: false,
        help: "Run hands-off: build and save the deck(s) without pausing to review the announcement. With no course tile selected, prepares a lecture for every tile.",
      },
      {
        key: "template",
        label: "Deck template",
        type: "deckTemplate",
        required: false,
        help: "A PPT Design template that styles the generated slides. Blank uses Classic Lecture (the app's standard look). Slide content still comes from this step's own generator.",
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
      { key: "announcement", label: "Announcement", type: "longtext" },
      { key: "moduleName", label: "Module", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const autonomous = String(values.autonomous ?? "") === "1";
      const hubCourseId = String(values.hubCourse ?? "").trim();
      const moduleIdRaw = String(values.moduleId ?? "").trim();
      const modulesAhead = resolveModulesAhead(values);
      const sourcesPolicy = resolveSourcePolicy(String(values.sources ?? ""));

      const list = await listCourseHubAction();
      if ("error" in list) {
        throw new Error(list.error);
      }

      const deck = await resolveDeckTheme(values.template);
      if (deck.note) onProgress(deck.note);

      // Build the deck + recap for one tile: gather materials, generate the
      // lecture, save the pptx to the tile. Downloads only in the interactive
      // single-tile path (guarded for headless); never pauses.
      const buildForTile = async (
        tile: Course,
        download: boolean
      ): Promise<{
        announcement: string;
        moduleName: string;
        slideCount: number;
        fileName: string;
        materialsText: string;
        materialsSource: string;
        notes: string[];
      }> => {
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

        const { moduleName, materialsText, notes, materialsSource } =
          await gatherModuleMaterials(tile, effectiveModuleIdRaw, helpers, onProgress, sourcesPolicy);

        // Combine offset notes with materials gathering notes
        const allNotes = [...offsetNotes, ...notes];

        onProgress(`Generating lecture for ${tile.name}...`);
        const r = await generateLectureFromMaterialsAction(
          tile.name,
          moduleName,
          materialsText,
          helpers.provider
        );
        if ("error" in r) {
          throw new Error(r.error);
        }

        const pptxData = await buildSlidesPptx({
          presentationTitle: r.presentationTitle,
          slides: r.slides,
          subtitle: moduleName,
          author: helpers.author,
          theme: deck.theme,
        });
        const blob = new Blob([pptxData], {
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        });

        const sanitize = (s: string) =>
          s.trim().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
        const fileName = `${sanitize(tile.name)}_${sanitize(moduleName)}_Lecture.pptx`;

        // Browser-only convenience download; skipped server-side (no document)
        // and in the autonomous multi-tile path. The tile save below is the
        // durable artifact either way.
        if (download && typeof document !== "undefined") {
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
              mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              fileExt: "pptx",
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
          announcement: r.announcement,
          moduleName,
          slideCount: r.slides.length,
          fileName,
          materialsText,
          materialsSource,
          notes: allNotes,
        };
      };

      // Autonomous: build for the chosen tile, or every tile when none is
      // picked, with no review pause.
      if (autonomous) {
        const tiles = hubCourseId
          ? list.courses.filter((c) => c.id === hubCourseId)
          : list.courses;
        if (hubCourseId && tiles.length === 0) {
          throw new Error("Choose a course tile.");
        }
        if (tiles.length === 0) {
          return {
            outputs: { announcement: "", moduleName: "" },
            summary: { kind: "text", text: "No course tiles to prepare lectures for." },
          };
        }

        const items: string[] = [];
        const announcements: string[] = [];
        let built = 0;
        for (const tile of tiles) {
          try {
            const b = await buildForTile(tile, false);
            built++;
            announcements.push(`# ${tile.name} - ${b.moduleName}\n${b.announcement}`);
            items.push(`${tile.name}: ${b.slideCount} slide(s) -> ${b.fileName}`);
            for (const n of b.notes) items.push(`  ${tile.name}: ${n}`);
          } catch (err) {
            items.push(
              `${tile.name}: failed - ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        return {
          outputs: {
            announcement: announcements.join("\n\n"),
            moduleName: `${built} lecture(s)`,
          },
          summary: {
            kind: "list",
            label: `Prepared ${built} lecture(s)`,
            items: items.length ? items : ["(nothing prepared)"],
          },
        };
      }

      // Interactive: one tile, then pause to review the recap announcement.
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Choose a course tile.");
      }

      const b = await buildForTile(tile, true);

      const result: StepRunResult = {
        outputs: {
          announcement: b.announcement,
          moduleName: b.moduleName,
        },
        summary: {
          kind: "list",
          label: `Lecture ready for ${b.moduleName}`,
          items: [
            `${b.slideCount} slide(s) -> ${b.fileName}`,
            b.materialsSource,
            ...b.notes,
          ],
        },
      };

      let latestDraft = b.announcement;
      result.requireInput = {
        message: "Review the recap announcement below. Edit it directly, regenerate it with AI, or approve it to schedule; skip to finish without scheduling.",
        key: "announcement",
        kind: "text",
        optional: true,
        initialValue: b.announcement,
        submitLabel: "Approve announcement",
        regenerate: async () => {
          const regen = await regenerateAnnouncementAction(
            tile.name,
            b.moduleName,
            b.materialsText,
            latestDraft,
            helpers.provider
          );
          if ("error" in regen) throw new Error(regen.error);
          latestDraft = regen.announcement;
          return regen.announcement;
        },
      };

      return result;
    },
  },
];
