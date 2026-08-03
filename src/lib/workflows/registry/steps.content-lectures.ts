// Client-side step catalog: lecture-related step definitions.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  getRepoZipAction,
  generateLecturePlansAction,
  generateLectureMaterialsFromScheduleAction,
  listCourseHubAction,
  generateWeekOpener,
} from "@/app/actions";
import {
  type StepRunResult,
  type StepDefinition,
  gatherModuleMaterials,
  assembleLectureFiles,
} from "@/lib/workflows/registry-helpers";
import { buildDocxFromPlainText } from "@/lib/docx";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import type { Course } from "@/lib/supabase/courses";
import { parseLmsModuleValue } from "@/lib/workflows/module-value";
import { resolveSourcePolicy, type SourcePolicy } from "@/lib/workflows/source-policy";
import { resolveRepolessSchedule, parseTargetedModule } from "@/lib/workflows/registry/schedule-resolution";
import { buildWorkflowFileName, sanitizeFileNamePart } from "@/lib/workflows/file-names";
import { resolveCourseKind, type CourseKind } from "@/lib/course-kind";
import { ensureCourseProject, ensureCourseTools } from "@/lib/workflows/registry/steps.course-project";
import { prepareLectureStep } from "@/lib/workflows/registry/steps.content-lectures.prepare";
import { detectReusedCaseStudies, detectCaseStudyDateConflicts } from "@/lib/case-study-reuse";
import { PARTIAL_FAILURE_OUTPUT_KEY, DOWNLOADABLE_OUTPUT_KEY } from "@/lib/workflows/run-logging";

const SOURCES_HELP =
  "Which additional material sources to check (live LMS, course export, uploaded materials zip, repository digest, tile topics/description), their order, and the strategy (stop at first success, check all and merge, or accumulate until a source errors). Blank uses the default (live LMS, then the course export, then the tile's topics/description).";

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

// V3-AC2 (professional-lift audit): a week whose deck fell back to the
// placeholder template is reported in assembleLectureFiles' own step
// summary, but that alone let a real run's header read "Error count:
// (unknown)" while the placeholder deck shipped to Canvas as an ordinary
// lecture. This surfaces it at RUN level too - the same PARTIAL_FAILURE_
// OUTPUT_KEY mechanism the weekly-announcements step already uses - shared
// by every step here that calls assembleLectureFiles.
function slidesFailedPartialFailureDetail(
  plans: Array<{ weekNumber: number; slidesFailed?: boolean }>
): string | null {
  const weeks = plans.filter((p) => p.slidesFailed).map((p) => p.weekNumber);
  if (weeks.length === 0) return null;
  return `${weeks.length} of ${plans.length} week(s) fell back to a placeholder deck (week${weeks.length === 1 ? "" : "s"} ${weeks.join(", ")}) - marked "NEEDS REGENERATION" and never uploaded to the LMS.`;
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
  minutes: number,
  courseKind: CourseKind
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
  // generation to that single week (today's behavior, unchanged). Otherwise
  // an explicitly targeted module must never be silently replaced by
  // unrelated weeks - SYNTHESIZE a single week from the module name itself
  // (AC1) and use ONLY that; the old full-schedule fallback is removed
  // entirely. Blank/unset moduleId leaves the schedule untouched - today's
  // behavior exactly.
  let moduleTargetingNote: string | null = null;
  if (moduleIdRaw) {
    const picked = parseLmsModuleValue(moduleIdRaw);
    if (picked.name) {
      const parsed = parseTargetedModule(picked.name);
      const matchingWeek = parsed.week !== null ? schedule.find((w) => w.week === parsed.week) : undefined;
      if (matchingWeek) {
        schedule = [matchingWeek];
        moduleTargetingNote = `targeted week ${parsed.week} for module "${picked.name}"`;
      } else {
        const synthesizedWeek = parsed.week ?? 1;
        schedule = [
          {
            week: synthesizedWeek,
            topic: parsed.topic || picked.name,
            summary: "",
            assignmentTitle: null,
            assignmentSlug: null,
            testName: null,
          },
        ];
        moduleTargetingNote = `module "${picked.name}" is not in the resolved schedule - generated week ${synthesizedWeek} from the module name itself`;
      }
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
    gathered.materialsText || undefined,
    // AC7 fix (docs/REGRESSION.md entry 80): this repoless branch used to
    // pass undefined here unconditionally, which defaults to "coding" inside
    // generateLectureMaterialsFromScheduleAction - so a standalone Course
    // Refresh run against a no-code (applied) course tile with no linked
    // repository produced a coding warm-up and fetched coding practice
    // problems even though the run form's own "Course type" field said
    // "applied". This step now declares its own courseKind input (resolved
    // by the caller above, just like lecture-materials-from-schedule's
    // sibling step already does) and threads it straight through, so an
    // applied course tile stays applied all the way to generateWeekOpener.
    // courseProject is threaded past it so a project-based course still gets
    // chained assignments here too (AC1/AC6: the tile is already loaded above
    // for this branch, so this is a free carry, not a new fetch).
    courseKind,
    tile.courseProject,
    // Z3 (Group Z): the opener-before-deck sequencing that used to be
    // applied-only now also runs for this repoless coding path - the SAME
    // reasoning that motivated it for applied applies here unchanged: the
    // opener exists when the deck is generated, so the deck can build on it
    // (buildOpenerContinuityBlock) instead of the two never meeting.
    true
  );

  if ("error" in plans) {
    throw new Error(plans.error);
  }

  // AC1 (choke point): this repoless branch threads courseKind straight into
  // generateLectureMaterialsFromScheduleAction above (see the comment on that
  // call), so it produces an applied deck exactly like the schedule-driven
  // sibling step does - assembleLectureFiles now reports any surviving
  // required-graphic gap for BOTH, from the same one place.
  const result = await assembleLectureFiles(plans, values, helpers, onProgress, "Lecture Materials", courseKind);
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

  const partialFailureDetail = slidesFailedPartialFailureDetail(plans);

  return {
    outputs: {
      files: result.files,
      ...(partialFailureDetail ? { [PARTIAL_FAILURE_OUTPUT_KEY]: partialFailureDetail } : {}),
    },
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
      {
        // AC7 fix (docs/REGRESSION.md entry 80): only consulted on the
        // REPOLESS path - a repo-driven deck is always coding by
        // construction (see the run() function's own comment), so this input
        // is a no-op whenever "Repository" above is filled in. Appended at
        // the end of this array (not grouped with the other content-source
        // inputs above) so it lands right after "moduleId" in the run form's
        // deduplicated runtime-field order - see EXPECTED_RUNTIME_FIELDS in
        // presets.kickoff.test.ts, which pins that order.
        key: "courseKind",
        label: "Course type",
        type: "text",
        required: false,
        options: ["coding", "applied"],
        help: "\"applied\" is a no-code course (project management, business, ethics): no code appears anywhere in the slides, notes, or assignment instructions. Only used when no repository is linked - a repo-driven deck is always a coding deck by construction.",
      },
    ],
    outputs: [
      { key: "files", label: "Generated files", type: "files" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      const minutes = Number(values.minutes);

      if (!repo) {
        // AC7 fix: resolved here (not inside the repoless helper itself) so
        // the REPO branch below is untouched - a repo-driven deck is always
        // coding by construction (see the "coding" literal passed to
        // generateWeekOpener inside shared.ts, with its own comment on why).
        return runLectureZipRepoless(values, helpers, onProgress, minutes, resolveCourseKind(values.courseKind));
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
        supplemental.text || undefined,
        // Repo-driven coding parity: lecture-zip now sequences each week's
        // opener inside the repo path itself, before that week's deck, so the
        // deck can build on the opener instead of never seeing it.
        true
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

      const baseName = sanitizeFileNamePart(repo.split("/").pop() ?? "") || "Lecture Plans";

      // AC1 (choke point): a repo-driven deck is always coding by
      // construction (see generateLecturePlansAction's own call above and
      // buildAssignmentPlan's courseKind comment in shared.ts) - passed
      // explicitly so that is a stated fact about this call site, not a
      // silent default. assembleLectureFiles' graphics-gap report is a no-op
      // for a coding deck either way.
      const result = await assembleLectureFiles(plans, values, helpers, onProgress, baseName, "coding");
      if (supplemental.notes.length > 0 && result.summary.kind === "list") {
        result.summary.items = [...result.summary.items, ...supplemental.notes];
      }
      const partialFailureDetail = slidesFailedPartialFailureDetail(plans);
      return {
        outputs: {
          files: result.files,
          ...(partialFailureDetail ? { [PARTIAL_FAILURE_OUTPUT_KEY]: partialFailureDetail } : {}),
        },
        summary: result.summary,
      };
    },
  },

  {
    type: "lecture-materials-from-schedule",
    name: "Build lecture materials from schedule",
    description: "Generate presentation slides - with the lecture notes as their speaker notes - from a course schedule (for courses without a code base).",
    inputs: [
      {
        key: "courseKind",
        label: "Course type",
        type: "text",
        required: false,
        options: ["coding", "applied"],
        help: "\"applied\" is a no-code course (project management, business, ethics): no code appears anywhere in the slides, notes, or assignment instructions.",
      },
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
      // The four inputs below back COURSE_BUILD's output selector
      // (steps.course-build-scope.ts's "select-course-outputs" step, bound
      // only there). Each defaults to "generate" when unbound - see
      // assembleLectureFiles' own isGeneratorSelected usage - so every OTHER
      // preset that uses this step (NO_CODE_KICKOFF, and this step's own use
      // in a hand-built custom workflow) leaves them unbound and is
      // unaffected. "Module introductions" have no toggle of their own; they
      // ride as the deck's own speaker notes, so selectedDecks covers both.
      {
        key: "selectedObjectives",
        label: "Generate module objectives",
        type: "boolean",
        required: false,
        help: "From this run's output selection. Blank/unbound = generate (unchanged default).",
      },
      {
        key: "selectedDecks",
        label: "Generate lecture decks",
        type: "boolean",
        required: false,
        help: "From this run's output selection (also covers the module introduction, which rides in the deck's speaker notes). Blank/unbound = generate (unchanged default).",
      },
      {
        key: "selectedAssignments",
        label: "Generate assignments",
        type: "boolean",
        required: false,
        help: "From this run's output selection. Blank/unbound = generate (unchanged default).",
      },
      {
        key: "selectedOpeners",
        label: "Generate class openers",
        type: "boolean",
        required: false,
        help: "From this run's output selection. Blank/unbound = generate (unchanged default).",
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
      const courseKind = resolveCourseKind(values.courseKind);

      // The tile is loaded unconditionally when one is chosen (not just when
      // sourceMaterial is blank): AC1/AC6 need its persisted courseProject
      // regardless of whether the textbook fallback below fires.
      const hubCourseId = String(values.hubCourse ?? "").trim();
      let projectTile: Course | undefined;
      if (hubCourseId) {
        const tileList = await listCourseHubAction();
        if (!("error" in tileList)) {
          projectTile = tileList.courses.find((c) => c.id === hubCourseId);
        }
      }

      // Fallback: an empty sourceMaterial falls back to the course tile's
      // textbook field, used as a name-only source (weaker grounding - the
      // action mentions it by name only, with no chapter/TOC alignment).
      if (!sourceMaterial) {
        const textbook = (projectTile?.textbook ?? "").trim();
        if (textbook) sourceMaterial = textbook;
      }

      if (!schedule.length) {
        throw new Error("No schedule provided.");
      }

      // AC1/AC3 (docs/REGRESSION.md 152): the course-long project must not
      // depend on a separate define-course-project step having already run -
      // a saved copy of a kickoff preset can silently lack that step
      // entirely. ensureCourseProject is idempotent (a no-op once the tile
      // already has a project) and applied-course-only (see its own comment
      // for why), so this changes nothing for a coding course or a course
      // that already has a project - it only fills the gap for exactly the
      // workflows this feature targets.
      let courseProject = projectTile?.courseProject;
      const projectNotes: string[] = [];
      if (projectTile) {
        const ensured = await ensureCourseProject(projectTile, helpers.provider, courseKind, schedule);
        courseProject = ensured.project;
        if (ensured.created) {
          projectNotes.push(
            'This course had no project yet - one was generated automatically from the schedule (a "Define the course project" step may be missing from this workflow).'
          );
        }

        // Tool-churn fix (docs/REGRESSION.md): the course's committed
        // toolset, ensured the SAME way the project just was above - a no-op
        // once one is already committed, so every week of the same course
        // reads the identical requiredTools inside buildScheduleWeekPlan
        // instead of each week choosing its own (which is what previously
        // sent a student to a different SaaS tool almost every week).
        const ensuredTools = await ensureCourseTools(projectTile, courseProject, helpers.provider, courseKind, schedule);
        courseProject = { ...courseProject, tools: ensuredTools.tools };
        if (ensuredTools.created) {
          projectNotes.push(
            `This course had no committed toolset yet - one was chosen automatically for the whole term: ${ensuredTools.tools.join("; ")}.`
          );
        }
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
        supplemental.text || undefined,
        courseKind,
        courseProject,
        // T2 (no-code pipeline reorder): this step's opener is generated
        // INSIDE this call, sequenced before the deck and grounded in it,
        // rather than by the separate generate-class-openers step.
        // Z3 (Group Z): now ALWAYS on, for both course kinds - it used to be
        // gated to "applied" only ("a coding course should keep today's
        // exact behavior"), but the user explicitly asked for the same
        // case-study/opener sequencing to reach the coding kickoff/refresh
        // path too, so a coding-flavored use of this step type (via
        // generateWeekOpener's own exerciseKind branch, which already
        // handles "coding") now sequences its opener before the deck exactly
        // like an applied course does.
        true
      );

      if ("error" in plans) {
        throw new Error(plans.error);
      }

      const baseName = "Lecture Materials";

      // AC1 (choke point): the graphics-gap report (P3-AC3) used to be
      // computed inline right here and nowhere else - it now lives inside
      // assembleLectureFiles itself, so this step and the repoless lecture-zip
      // branch (runLectureZipRepoless above) both inherit it from the same
      // one place instead of only this step having it.
      const result = await assembleLectureFiles(plans, values, helpers, onProgress, baseName, courseKind);

      // P2-AC8: after the whole run, detect any organization named on two
      // different weeks' Case Study slides - the prompt-time exclusion list
      // (course-planning-grounding.ts) only ever sees what completed
      // strictly before a given week started, so a real collision under
      // concurrent generation is still possible and must be surfaced, not
      // discovered later in the .pptx.
      const caseStudyPlans = plans.map((p) => ({ weekNumber: p.weekNumber, slides: p.slides }));
      const reusedCaseStudies = detectReusedCaseStudies(caseStudyPlans);
      // V2-AC2: a reused organization dated differently across weeks (e.g.
      // Denver cited as both 2002 and 2011 in the same course) is a plain
      // contradiction - surface it the same way a reused case is surfaced.
      const dateConflicts = detectCaseStudyDateConflicts(caseStudyPlans);

      const runNotes = [
        ...supplemental.notes,
        ...projectNotes,
        ...reusedCaseStudies.map(
          (r) => `Case study "${r.organization}" appears on more than one week's Case Study slide (weeks ${r.weeks.join(", ")}).`
        ),
        ...dateConflicts.map(
          (c) =>
            `Case study "${c.organization}" is dated inconsistently across weeks (${c.years
              .map((y) => `${y.year}: week ${y.weeks.join(", ")}`)
              .join("; ")}) - needs a human check.`
        ),
      ];
      if (runNotes.length > 0 && result.summary.kind === "list") {
        result.summary.items = [...result.summary.items, ...runNotes];
      }

      const partialFailureDetail = slidesFailedPartialFailureDetail(plans);

      return {
        outputs: {
          files: result.files,
          ...(partialFailureDetail ? { [PARTIAL_FAILURE_OUTPUT_KEY]: partialFailureDetail } : {}),
        },
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
      {
        key: "exerciseKind",
        label: "Warm-up exercise",
        type: "text",
        required: false,
        options: ["coding", "applied"],
        help: "A no-code course (project management, business, ethics) wants \"applied\": a practical exercise producing a written artifact rather than a program.",
      },
      {
        key: "files",
        label: "Course files so far",
        type: "files",
        required: false,
        help: "Files generated earlier in the run. The openers are appended to them, so a later LMS step can post everything in one pass.",
      },
      {
        key: "groundInAssignment",
        label: "Ground in that week's assignment",
        type: "boolean",
        required: false,
        help: "When on, each week's opener is written to prepare students for that week's already-generated assignment (matched by week number in \"Course files so far\"), not just its topic. Off by default - left unbound, this step's behavior is unchanged.",
      },
    ],
    outputs: [
      { key: "report", label: "Generation report", type: "longtext" },
      { key: "count", label: "Openers generated", type: "number" },
      { key: "files", label: "Course files", type: "files" },
    ],
    run: async (values, helpers, onProgress) => {
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      if (!schedule.length) {
        return {
          outputs: { report: "No schedule provided.", count: 0, files: (values.files as GeneratedCourseFile[] | undefined) ?? [] },
          summary: { kind: "text", text: "Skipped - no schedule was provided." },
        };
      }

      const targetMinutes = Math.max(5, Math.min(Number(values.minutes ?? 30), 120));
      const exerciseKind = String(values.exerciseKind ?? "").trim() === "applied" ? "applied" : "coding";
      const reportLines: string[] = [];
      // Seeded with whatever earlier steps produced, so this step ADDS to the
      // run's file set rather than replacing it.
      const incoming = (values.files as GeneratedCourseFile[] | undefined) ?? [];
      const files: GeneratedCourseFile[] = [];

      // The tile is loaded ONCE, up front, when one is chosen - reused both
      // for the course's committed toolset below (P1-AC4) and for the
      // course-name/code lookup the zip's file name already needed (see the
      // "course" lookup further down, now just reading this same tile).
      const hubCourseId = String(values.hubCourse ?? "").trim();
      let tile: Course | undefined;
      if (hubCourseId) {
        const list = await listCourseHubAction();
        if (!("error" in list)) {
          tile = list.courses.find((c) => c.id === hubCourseId);
        }
      }
      // P1-AC4: the course's already-committed toolset (ensureCourseTools,
      // steps.course-project.ts) - [] for a course with no committed
      // toolset, or none chosen, which leaves renderToolsYouWillUseSection's
      // committed-tools half empty (the body-text-mention half still works).
      const committedToolNames = tile?.courseProject?.tools ?? [];
      // AC1/AC2/AC4: opt-in only, and unbound (the default) in every preset
      // except the no-code kickoff (course-setup.ts's NO_CODE_KICKOFF), so
      // the coding kickoff and a standalone Course Refresh run are byte-for-
      // byte unaffected. When on, each week's already-generated assignment
      // instructions (role "instructions", the same file lecture-zip/
      // lecture-materials-from-schedule already produce - see
      // assembleLectureFiles) are matched by week number and handed to the
      // opener generator as real grounding, not just a restated topic.
      const groundInAssignment = String(values.groundInAssignment ?? "") === "1";
      const assignmentTextForWeek = (weekNumber: number): string => {
        if (!groundInAssignment) return "";
        const match = incoming.find((f) => f.role === "instructions" && f.weekNumber === weekNumber);
        return match?.pageText ?? "";
      };

      onProgress("Generating class openers...");

      for (const week of schedule) {
        if (!week.topic || !week.topic.trim()) {
          reportLines.push(`Week ${week.week}: Skipped (no topic).`);
          continue;
        }

        try {
          const topicText = week.topic.trim();
          onProgress(`Generating opener for week ${week.week}: ${topicText}`);

          // generateWeekOpener (src/app/actions/research.ts) is the SAME
          // function buildScheduleWeekPlan's in-plan opener phase calls
          // (course-planning-grounding.ts, gated by its own
          // sequenceOpenerBeforeDeck parameter) - the case-study/practice-
          // problem lookup, the LLM call, the URL strip, and the "Tools You
          // Will Use" section all live there now, extracted verbatim from
          // what used to be inline here.
          const openerResult = await generateWeekOpener(
            topicText,
            week.summary,
            targetMinutes,
            helpers.provider,
            exerciseKind,
            assignmentTextForWeek(week.week),
            committedToolNames
          );

          if ("error" in openerResult) {
            reportLines.push(`Week ${week.week} (${topicText}): Error - ${openerResult.error}`);
            continue;
          }

          const openerText = openerResult.text;

          const docxData = await buildDocxFromPlainText(openerText, [], helpers.author);

          files.push({
            name: `Week ${week.week} Opener - ${topicText}.docx`,
            blob: new Blob([docxData], {
              type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            }),
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            weekNumber: week.week,
            sortOrder: 3,
            role: "opener",
            pageText: openerText,
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

      // AC4: openers join the SAME materials zip instead of shipping in a
      // second, separate one. When this step is chained after a
      // materials-generating step (lecture-zip / lecture-materials-from-
      // schedule - both course-refresh and each kickoff feed that step's
      // "files" output straight into this step's own "files" input, and
      // both name their zip via buildWorkflowFileName's "Lecture Materials"
      // artifact, keyed by the same hubCourse runtime field this step also
      // reads), the zip built here is re-assembled from the FULL accumulated
      // file set - not just this step's own openers - and saved under that
      // SAME name. appendCourseMaterialFile (src/lib/supabase/courses.ts)
      // replaces any existing entry with an identical name, so this
      // supersedes the earlier materials-only save rather than leaving two
      // zips in the Files tab/course tile.
      //
      // A standalone run of this step - no incoming files, e.g. a custom or
      // saved workflow that never bound one - is completely unaffected: it
      // still builds and saves only its own opener files under the original
      // "Class Openers" name, byte-for-byte the same as before this change.
      // The step's own generation logic (case study/practice lookups, the
      // LLM call, groundInAssignment) is untouched either way.
      const isChained = incoming.length > 0;
      const zipFiles = isChained ? [...incoming, ...files] : files;

      onProgress("Assembling zip...");
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      for (const file of zipFiles) {
        zip.file(file.name, file.blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });

      // Reuses the tile already loaded up front (for the committed toolset,
      // P1-AC4) rather than fetching it a second time.
      const course: { courseCode: string | null; name: string } | null = tile
        ? { courseCode: tile.courseCode, name: tile.name }
        : null;

      const fileName = buildWorkflowFileName({
        course,
        artifact: isChained ? "Lecture Materials" : "Class Openers",
        ext: "zip",
      });

      if (helpers.saveBundle) {
        try {
          await helpers.saveBundle(zipBlob, fileName);
        } catch (err) {
          console.error("Library save failed:", err);
        }
      }

      if (helpers.saveCourseMaterialFile && hubCourseId) {
        try {
          await helpers.saveCourseMaterialFile(hubCourseId, zipBlob, fileName);
        } catch (err) {
          console.error("Course tile save failed:", err);
        }
      }

      return {
        outputs: {
          report: reportLines.join("\n"),
          count: files.length,
          files: [...incoming, ...files],
          // Defect-2 fix: hand the zip to the runner instead of downloading
          // it here directly - see DOWNLOADABLE_OUTPUT_KEY's doc comment
          // (run-logging.ts). The runner downloads only once per course,
          // when that course's step group finishes, instead of once per
          // step in the files-accumulator chain; a standalone run of just
          // this step is its own one-step group, so it still downloads
          // exactly once, unchanged.
          ...(typeof document !== "undefined" ? { [DOWNLOADABLE_OUTPUT_KEY]: { blob: zipBlob, fileName } } : {}),
        },
        summary: {
          kind: "list",
          label: isChained
            ? `Generated ${files.length} class openers (joined "${fileName}", the course materials zip)`
            : `Generated ${files.length} class openers`,
          items: files.map((f) => f.name),
        },
      };
    },
  },

  prepareLectureStep,
];
