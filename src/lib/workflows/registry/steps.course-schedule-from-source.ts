// Client-side step catalog: the combined course-schedule-from-source step.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
//
// Why this is ONE step with an internal switch, not seven gated steps
// converging on a shared tail: src/lib/workflows/server-runner.ts (around
// lines 218-232) skips a step transitively when it consumes a gated-off
// (skipped) step's output - the cascade means three-plus front-end steps
// gated on "which source did the instructor pick" could never safely feed
// one shared downstream pipeline, because whichever branches did NOT run
// would drag the shared tail down with them. There is also no "optional /
// first available" binding form to route around that. So the source switch
// lives INSIDE this one step instead: it always runs, and always produces
// (or fails trying to produce) the schedule.
//
// This step normalizes every input shape into the SAME three outputs
// schedule-from-repo already emits (schedule/courseTitle/weeks - see
// steps.planning.ts), so the existing no-code kickoff pipeline binds to
// this step's outputs exactly the way it already binds to schedule-from-
// repo's - only the FRONT END (how the schedule is obtained) varies by
// source. It also emits two more outputs neither schedule-from-repo nor
// generate-schedule declares alone:
//  - "resolvedSourceMaterial" (matching generate-schedule's own output of
//    the same name, steps.planning.ts): the web-search-derived table of
//    contents when the course-description or syllabus-document branch's
//    delegated generateSchedulePlanAction call produced one, otherwise the
//    shared "Source material" field's own text, unchanged. Without this,
//    an instructor who fed a bare URL or short citation into that field got
//    a schedule grounded by the derived TOC but every OTHER artifact
//    (lecture materials, in particular) grounded only in the bare citation,
//    because the preset had nothing but the raw runtime field to bind
//    downstream steps to. See course-setup.ts's COURSE_BUILD, step 3's
//    sourceMaterial binding.
//  - "courseKind" (@/lib/course-kind's CourseKind vocabulary, "coding" or
//    "applied"): this step is the ONE place the instructor's chosen source
//    is actually known, so it resolves the course kind here instead of
//    forcing every downstream courseKind-consuming step in COURSE_BUILD to
//    duplicate a source -> kind mapping of its own (and risk drifting out
//    of sync with the source list above). Only "codebase" and "tile-repo"
//    (the repository already linked on the selected course tile's own row -
//    the same kind of input as "codebase", just read from the tile instead
//    of typed/picked) imply a programming course; every other source
//    carries no signal that the course involves code, so it resolves to
//    "applied" - the same default NO_CODE_KICKOFF already pins everywhere
//    for its own (description-only) pipeline.
//  - "repo" and "isCodebase" (added for the Codebase-and-associated-
//    assignments/Start-Here output families, output-selection.ts): "repo" is
//    the resolved repository string on the "codebase"/"tile-repo" branches
//    (blank on every other source), and "isCodebase" is "1"/"" for the SAME
//    condition courseKind's own "coding"/"applied" split already encodes -
//    exposed as its own boolean so a plain "step" binding can feed it
//    straight into a boolean input with no transform in between. See
//    steps.course-build-codebase.ts's "resolve-codebase-repo" (the "repo"
//    consumer) and course-build.ts's "18.includeGithub" bindOverride (the
//    "isCodebase" consumer).
//
// Three families, not seven independent implementations. Two sources
// ("codebase" and "tile-repo") delegate to the SAME schedule-from-repo
// generation function an existing standalone step already uses
// (generateSchedulePlanFromRepoAction) - see the shared `scheduleFromRepo`
// closure below, called by both branches with nothing but the `repo` string
// differing between them (a typed/picked runtime field vs. the tile's own
// `repos[0]`). Two more sources delegate to generate-schedule's own
// generateSchedulePlanAction ("course description" AND "syllabus document" -
// a syllabus's extracted text is just a course description that happened to
// come from a file instead of a text box). The remaining three structural
// sources ("course cartridge", "existing LMS course", and "the course
// tile's own LMS export") all reduce to "an ordered list of {title, items}
// becomes a schedule" - the exact same shape - so they share ONE normalizer
// (src/lib/course-structure-schedule.ts) instead of three parallel mappings
// that would silently drift apart from each other over time. The
// tile-export source's own "ordered list" comes from src/lib/workflows/
// step-helpers-server.ts's loadCourseExport closure (also wired for
// attended/client runs - see src/app/components/workflows/useWorkflowRun.ts's
// own loadCourseExportData - both resolve to the SAME
// StepRunHelpers.loadCourseExport contract this step's `helpers` parameter
// already carries), which already does exactly what the "course cartridge"
// branch below does by hand: find the tile, take the newest of its saved
// exports, download the blob, and run it through parseCartridgeBlob. So the
// tile-export branch reuses that SAME CartridgeCourseData -> CourseStructure-
// Module mapping the cartridge branch uses, just fed data it no longer has
// to download or parse itself - never a fourth parallel implementation.
//
// The seventh source, "tile-repo" (the repository already linked on the
// selected course tile's own row - src/lib/supabase/courses.ts's `repos`
// column, `CourseRepo[]`; NOT `studentRepos`, which maps individual
// students to their OWN submission repos for grading, a wholly different
// column): the direct analogue of "tile-export" for a repository instead of
// an LMS export - it asks the instructor for nothing beyond the course tile
// already selected elsewhere on this workflow (the shared "hubCourse"
// input every source can fall back to for a title also supplies the tile id
// this source actually needs). Multi-repo rule: when a tile has more than
// one linked repository, this uses `repos[0]` - the FIRST entry - matching
// every other place in this codebase that already resolves "a course
// tile's repo" down to a single value: load-course-tile's own "repo" output
// (steps.course-setup.tiles.ts, `tile.repos[0]?.repo`), steps.github.ts,
// scope.ts's resolveClassRepoRef, and CoursesTab.tsx's own "primary" repo
// display. Unlike tile-export's export files (CourseMaterialFile, which
// carries `addedAt` and is ranked "newest first"), CourseRepo carries no
// timestamp to rank by, so "newest" is not an available rule here - "first"
// is both the only signal available and the one this codebase already
// treats as canonical.
import {
  generateSchedulePlanAction,
  generateSchedulePlanFromRepoAction,
  listCourseContentAction,
  listCourseHubAction,
  extractSyllabusTextAction,
  type ScheduleWeekPlan,
} from "@/app/actions";
import { parseCartridgeBlob } from "@/lib/cartridge-import";
import {
  type StepDefinition,
  type StepRunResult,
  blobToBase64,
} from "@/lib/workflows/registry-helpers";
import { scheduleToCsv } from "@/lib/workflows/types";
import {
  courseStructureToSchedule,
  type CourseStructureModule,
} from "@/lib/course-structure-schedule";
import { resolveCourseKind, courseKindOrNull } from "@/lib/course-kind";
import type { Course } from "@/lib/supabase/courses";
import { isPlaceholderTopic, isFileManifestSummary, summaryNamesGeneratedFile } from "@/lib/schedule-topic-quality";

// Stable lowercase-kebab values (never renamed - they are stored inside
// saved workflow bindings) with self-explanatory text; the run form renders
// them as a select via StepInputSpec.options (types.ts). "tile-repo" is
// appended last, matching how "tile-export" itself was added last - never
// reordered ahead of an existing value, since a stored binding's saved
// value is this literal string, not its position.
const SOURCE_OPTIONS = [
  "codebase",
  "course-description",
  "course-cartridge",
  "syllabus-document",
  "existing-lms-course",
  "tile-export",
  "tile-repo",
];

export const courseScheduleFromSourceSteps: StepDefinition[] = [
  {
    type: "course-schedule-from-source",
    name: "Build a course schedule from a source",
    description:
      "Turn a codebase, a typed description, an uploaded course cartridge, an uploaded syllabus, an existing LMS course, the repository already linked on the selected course tile, or the LMS export already saved on the selected course tile into the same week-by-week schedule shape the rest of course setup consumes. Pick ONE source; only its matching input below is used.",
    inputs: [
      {
        key: "source",
        label: "Course structure source",
        type: "text",
        required: true,
        options: SOURCE_OPTIONS,
        help: "Where the week-by-week schedule comes from. Fill in only the input below that matches your choice.",
      },
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: false,
        help: "Used when the source is codebase.",
        // Shown on the run form only while "source" is set to this input's
        // own matching option - see StepInputSpec.visibleWhen (types.ts).
        // "description" has no such gate: course-build never binds it to a
        // runtime field at all (it is derived from the course tile, see
        // presets/course-build.ts), so it never reaches the run form
        // regardless, and the other four per-source inputs below (cartridge/
        // syllabus/lmsCourse) each get the matching treatment.
        visibleWhen: { fieldKey: "source", equals: "codebase" },
      },
      {
        key: "description",
        label: "Course description",
        type: "longtext",
        required: false,
        help: "Used when the source is course description.",
      },
      {
        key: "cartridge",
        label: "Course cartridge",
        type: "uploads",
        required: false,
        accept: ".imscc",
        help: "Used when the source is course cartridge. Upload a Common Cartridge (.imscc) export.",
        visibleWhen: { fieldKey: "source", equals: "course-cartridge" },
      },
      {
        key: "syllabus",
        label: "Syllabus document",
        type: "uploads",
        required: false,
        accept: ".docx,.pdf,.txt,.md",
        help: "Used when the source is syllabus document.",
        visibleWhen: { fieldKey: "source", equals: "syllabus-document" },
      },
      {
        key: "lmsCourse",
        label: "Existing LMS course",
        type: "lmsCourse",
        required: false,
        help: "Used when the source is existing LMS course.",
        visibleWhen: { fieldKey: "source", equals: "existing-lms-course" },
      },
      {
        key: "weeks",
        label: "Number of weeks",
        type: "number",
        required: false,
        help: "Leave blank to match the source (repo assignment count, or one week per module).",
      },
      {
        key: "tests",
        label: "Number of tests",
        type: "number",
        required: false,
      },
      {
        key: "context",
        label: "Additional context (optional)",
        type: "longtext",
        required: false,
        help: "Steers the generated schedule (tone, emphases, constraints, course-specific facts). Only used by the codebase, course tile's repository, course description, and syllabus document sources.",
      },
      {
        key: "sourceMaterial",
        label: "Source material (optional)",
        type: "longtext",
        required: false,
        help: "Name the primary source (textbook, course module, etc.) and paste its table of contents or chapter list, to align weeks to it. Only used by the course description and syllabus document sources.",
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Used when the source is the course tile's LMS export, or the repository already linked on the course tile - the tile is already selected elsewhere on this workflow, so these two sources ask for nothing further. For every other source, this is a fallback only: it supplies the course title when the chosen source has none of its own (e.g. a cartridge with no course_settings title).",
      },
    ],
    outputs: [
      { key: "schedule", label: "Course schedule", type: "schedule" },
      { key: "courseTitle", label: "Course title", type: "text" },
      { key: "weeks", label: "Number of weeks", type: "number" },
      {
        key: "resolvedSourceMaterial",
        label: "Resolved source material",
        type: "longtext",
      },
      {
        key: "courseKind",
        label: "Course type",
        type: "text",
      },
      {
        // Additive (Codebase-and-associated-assignments output family,
        // output-selection.ts): the repository this run is ALREADY anchored
        // to - non-blank only on the "codebase"/"tile-repo" branches (the
        // exact typed/picked or tile-resolved repo string each already
        // computes for scheduleFromRepo below), blank on every other source.
        // Exposing it here (rather than re-deriving it downstream) is the
        // ONLY way a later step can reuse this SAME repository without a
        // second, potentially-inconsistent lookup - see
        // steps.course-build-codebase.ts's "resolve-codebase-repo", the sole
        // consumer.
        key: "repo",
        label: "Repository",
        type: "repo",
      },
      {
        // Additive, same feature as "repo" above: "1" when this run is
        // already anchored to a codebase ("codebase"/"tile-repo" - the SAME
        // condition courseKind "coding" already encodes), "" otherwise.
        // Exposed as its OWN boolean output (rather than making every
        // consumer re-derive `courseKind === "coding"`) so a plain "step"
        // binding can feed it straight into a boolean input (e.g. course-
        // build.ts's "18.includeGithub" bindOverride) with no transform step
        // in between.
        key: "isCodebase",
        label: "Is a codebase course",
        type: "boolean",
      },
    ],
    run: async (values, helpers, onProgress) => {
      const source = String(values.source ?? "").trim();

      const weeksRaw = String(values.weeks ?? "").trim();
      const weeksOrNull = weeksRaw ? Number(weeksRaw) : null;
      const testsRaw = String(values.tests ?? "").trim();
      const testsOrNull = testsRaw ? Number(testsRaw) : null;
      const context = String(values.context ?? "").trim() || undefined;
      const sourceMaterial = String(values.sourceMaterial ?? "").trim() || undefined;
      const hubCourseId = String(values.hubCourse ?? "").trim();

      // Resolved lazily (only when actually needed - the courseKind
      // precedence check just below, a courseTitle fallback, or the
      // "tile-repo" source's own repo lookup further down), and only once
      // per run, so a blank/stale hubCourse binding never turns into an
      // extra lookup for a source whose own title always resolves, and the
      // "tile-repo" branch's own tile fetch and finalize's courseTitle
      // fallback never pay for the SAME listCourseHubAction call twice. Moved
      // ABOVE the courseKind computation below (it used to sit after) so
      // that computation can await it.
      let hubTileLoaded = false;
      let hubTile: Course | null = null;
      const resolveHubTile = async (): Promise<Course | null> => {
        if (hubTileLoaded) return hubTile;
        hubTileLoaded = true;
        if (!hubCourseId) return null;
        const list = await listCourseHubAction();
        if ("error" in list) return null;
        hubTile = list.courses.find((c) => c.id === hubCourseId) ?? null;
        return hubTile;
      };
      const resolveHubTileName = async (): Promise<string | null> => (await resolveHubTile())?.name ?? null;

      // Defect fix (course-setup.ts's COURSE_BUILD forced every source
      // through courseKind "applied", including "codebase" - a coding
      // course got applied-course materials: no code, the applied slide
      // contract, the applied opener). This is the one place the chosen
      // source is actually known, so the kind is resolved HERE and exposed
      // as an output, rather than duplicating the source -> kind mapping in
      // every preset that uses this step. "codebase" and "tile-repo" both
      // imply a programming course - they are the SAME kind of input (a
      // repository), just obtained differently (typed/picked vs. read off
      // the tile's own row); every other source carries no signal that the
      // course involves code, so it resolves to "applied" - the same
      // default NO_CODE_KICKOFF already pins everywhere for its own
      // (description-only) pipeline.
      const sourceDerivedKind = source === "codebase" || source === "tile-repo" ? "coding" : "applied";
      // F3 fix (course-tile-authoritative-kind): the selected course tile's
      // own "courseKind" column (src/lib/supabase/courses.ts's `Course.
      // courseKind` - null until an instructor explicitly sets it on the
      // tile) is now the AUTHORITATIVE value whenever it is set - it WINS
      // over the source-derivation above. Before this fix, a course's kind
      // was entirely decided by which schedule source happened to be picked,
      // so a CS Principles course built from a course-description source
      // could never be a coding course. resolveHubTile is the SAME
      // lazy/cached tile lookup this step already performs elsewhere in this
      // file, so a run whose source never otherwise needed the tile (e.g.
      // "course-description" with no hubCourse bound) pays for at most ONE
      // extra listCourseHubAction call - never a second implementation of
      // "read the tile," and none at all when hubCourseId is blank (the
      // guard inside resolveHubTile above). courseKindOrNull (not
      // resolveCourseKind) is deliberate here: it returns null for "unset,"
      // which is exactly what lets an unset tile (every course tile that
      // predates this column) fall through to sourceDerivedKind and keep
      // TODAY's exact effective behavior, unchanged - resolveCourseKind's own
      // "anything unrecognized defaults to coding" would have silently
      // overridden the derivation for every tile with no explicit kind.
      const tile = await resolveHubTile();
      const tileKind = courseKindOrNull(tile?.courseKind);
      const courseKind = resolveCourseKind(tileKind ?? sourceDerivedKind);
      // Additive output (Codebase-and-associated-assignments/Start-Here
      // output families): the SAME "codebase"/"tile-repo" check
      // sourceDerivedKind just used, exposed as its own boolean output - see
      // the "isCodebase" StepOutputSpec's own comment above for why a
      // separate boolean (rather than making every consumer parse courseKind
      // itself) earns its place here. Deliberately UNAFFECTED by the F3
      // tile-kind override above: isCodebase is a structural fact ("is this
      // run actually anchored to a repository"), not a pedagogy choice - a
      // tile marked "coding" via a course-description source still has no
      // real repository to write READMEs into or gate a GitHub sign-up on.
      const isCodebase = source === "codebase" || source === "tile-repo" ? "1" : "";

      // Every branch below funnels through here: it fills in a courseTitle
      // fallback when the source produced none of its own, and refuses to
      // report success on an empty schedule (AC: "never return an empty
      // schedule as if it succeeded"). resolvedSourceMaterial is supplied by
      // each branch itself (see the per-branch comments below for what each
      // one passes) since only two of the seven branches (course-description
      // and syllabus-document) can actually derive one.
      // Real-run defect (course "INFO 1020 - Computer Science Principles",
      // source tile-export): the LMS export's own modules were named
      // "Module 01".."Module 16" - zero subject matter - and those bare
      // names became each week's topic, unchanged, straight into the
      // downstream lecture-deck generator. Handed nothing but "Module 08"
      // plus courseKind "applied", the model invented a subject wholesale
      // (a Google Sheets policy exercise about "health objects," for a CS
      // Principles course) rather than refusing. Compounding it, that same
      // week's summary was a manifest of the very files this run was about
      // to generate ("INFO 1020 - Lecture Slides - Week 8.pptx" among
      // them), so the generated deck's own agenda slide cited itself as its
      // source material.
      //
      // Every branch above funnels through this ONE finalize() - the choke
      // point already responsible for the "never a silent empty schedule"
      // rule just below - so the guard lives here rather than being
      // duplicated per branch: for EVERY produced week, a placeholder topic
      // (isPlaceholderTopic - schedule-topic-quality.ts) is refused ONLY
      // when nothing grounds it. "Grounded" means either the run's own
      // resolvedSourceMaterial (the shared "Source material" field, or a
      // web-search-derived TOC - the course-description/syllabus-document
      // branches' own grounding) is non-blank, OR this WEEK's own summary
      // carries real content rather than being a file/deliverable manifest
      // (isFileManifestSummary) - the structural sources' (cartridge/
      // existing-LMS/tile-export) own per-week grounding, since those
      // branches never touch resolvedSourceMaterial at all. A placeholder
      // topic with EITHER kind of real material still proceeds unguarded -
      // the material carries the subject even when the module's own name
      // does not (e.g. this test suite's own "Module 1"/"Covers: Syllabus"
      // fixtures: a badly-named module whose item list is real content).
      //
      // The refusal itself blanks ONLY that week's topic/summary, never
      // removes the week or aborts the run - the SAME "no topic -> skip
      // this week, not the run" convention steps.content-lectures.ts (its
      // class-opener loop: "Week N: Skipped (no topic).") and schedule-
      // resolution.ts's withTopicOnly already apply to every OTHER
      // blank-topic week, so downstream generators treat a refused week
      // exactly like any other topic-less one - no new skip mechanism
      // invented here, no per-branch downstream step touched.
      //
      // Rejected alternative: throwing (failing the whole step) when ANY
      // week is unusable. That would reproduce the "one bad module name
      // takes down the entire course build" failure mode this codebase has
      // already moved away from elsewhere (registry-helpers.ts's own
      // passThroughOnFailure comment cites a real run where 47 of 49
      // errors were cascades from one failed generator) - a single
      // mis-titled LMS module must not block every OTHER week's real
      // schedule from reaching the instructor.
      const guardScheduleAgainstPlaceholders = (
        weeks: ScheduleWeekPlan[],
        resolvedSourceMaterial: string
      ): { schedule: ScheduleWeekPlan[]; notes: string | undefined } => {
        const hasGlobalMaterial = resolvedSourceMaterial.trim().length > 0;
        const noteLines: string[] = [];
        const guarded = weeks.map((week) => {
          if (!isPlaceholderTopic(week.topic)) return week;
          const summaryTrimmed = (week.summary ?? "").trim();
          const weekHasMaterial =
            hasGlobalMaterial || (summaryTrimmed.length > 0 && !isFileManifestSummary(summaryTrimmed));
          if (weekHasMaterial) return week;

          const topicForMessage = week.topic.trim() || "(blank)";
          const reason = summaryTrimmed
            ? summaryNamesGeneratedFile(summaryTrimmed)
              ? `its summary only named files this same run generates ("${summaryTrimmed}")`
              : `its summary was only a file/deliverable manifest, not course content ("${summaryTrimmed}")`
            : "no source material was available for it";
          noteLines.push(
            `Note: Week ${week.week}'s topic ("${topicForMessage}") carries no real subject matter and ${reason} - Course Build cannot generate a schedule item for this week without inventing one, so its topic was cleared and this week was skipped rather than confidently generating unfounded content.`
          );
          return { ...week, topic: "", summary: "" };
        });
        return { schedule: guarded, notes: noteLines.length > 0 ? noteLines.join("\n") : undefined };
      };

      const finalize = async (
        rawCourseTitle: string,
        rawSchedule: ScheduleWeekPlan[],
        resolvedSourceMaterial: string,
        // Additive (Codebase-and-associated-assignments output family): the
        // resolved repo string, when this branch has one - only the
        // "codebase"/"tile-repo" callers (via scheduleFromRepo below) pass a
        // non-blank value; every other branch leaves this at its default, so
        // "repo" comes out blank exactly when "isCodebase" is "".
        repo: string = ""
      ): Promise<StepRunResult> => {
        if (rawSchedule.length === 0) {
          throw new Error(
            "Could not build a schedule from the selected source - no weeks were produced."
          );
        }
        const { schedule, notes } = guardScheduleAgainstPlaceholders(rawSchedule, resolvedSourceMaterial);
        const courseTitle = rawCourseTitle.trim() || (await resolveHubTileName()) || "Course";
        const csv = scheduleToCsv(schedule);
        return {
          outputs: { schedule, courseTitle, weeks: schedule.length, resolvedSourceMaterial, courseKind, repo, isCodebase },
          summary: { kind: "schedule", courseTitle, schedule, csv, ...(notes ? { notes } : {}) },
        };
      };

      // Shared by "codebase" and "tile-repo" below (AC1's required reuse):
      // once a repo reference string is in hand, both sources build the
      // schedule the exact same way - this closure IS that shared path, not
      // a description of one, since both branches below call it rather than
      // each running their own generateSchedulePlanFromRepoAction call.
      const scheduleFromRepo = async (repo: string): Promise<StepRunResult> => {
        onProgress("Generating schedule from repository...");
        const r = await generateSchedulePlanFromRepoAction(
          repo,
          weeksOrNull,
          testsOrNull,
          helpers.provider,
          context
        );
        if ("error" in r) throw new Error(r.error);
        // resolvedSourceMaterial fix: generateSchedulePlanFromRepoAction has
        // no sourceMaterial parameter at all (it builds the schedule from
        // the repo's own assignment folders) - so neither caller of this
        // closure ever runs TOC derivation and neither has anything of its
        // own to resolve. It still forwards whatever the instructor typed
        // into the shared "Source material" field unchanged, rather than
        // blanking it: a downstream step bound to this output (course-
        // setup.ts's COURSE_BUILD, step 3) should still see a hand-pasted
        // TOC even when the schedule itself came from a different source -
        // a blank here would silently strip it. Also forwards `repo` itself
        // (the whole reason scheduleFromRepo takes it as a parameter) so
        // finalize's own "repo"/"isCodebase" outputs above are non-blank for
        // both callers below - see this step's own header comment on the
        // Codebase-and-associated-assignments output family.
        return finalize(r.courseTitle, r.schedule, sourceMaterial ?? "", repo);
      };

      if (source === "codebase") {
        const repo = String(values.repo ?? "").trim();
        if (!repo) {
          throw new Error("Provide a repository - the Codebase source needs it.");
        }
        return scheduleFromRepo(repo);
      }

      if (source === "course-description") {
        const description = String(values.description ?? "").trim();
        if (!description) {
          throw new Error(
            "Provide a course description - the Course description source needs it."
          );
        }
        onProgress("Generating schedule...");
        const r = await generateSchedulePlanAction(
          description,
          weeksOrNull ?? 0,
          testsOrNull ?? 0,
          helpers.provider,
          context,
          sourceMaterial
        );
        if ("error" in r) throw new Error(r.error);
        // resolvedSourceMaterial fix: the SAME contract generate-schedule's
        // own resolvedSourceMaterial output uses (steps.planning.ts) - the
        // web-search-derived TOC when this call found one
        // (shouldDeriveToc/deriveTocFromSource, source-alignment.ts /
        // course-planning.ts), otherwise the sourceMaterial text this call
        // actually used, unchanged.
        const resolvedSourceMaterial = r.derivedToc?.trim() ? r.derivedToc : sourceMaterial ?? "";
        return finalize(r.courseTitle, r.schedule, resolvedSourceMaterial);
      }

      if (source === "course-cartridge") {
        const files = Array.isArray(values.cartridge) ? (values.cartridge as File[]) : [];
        if (files.length === 0) {
          throw new Error(
            "Upload a course cartridge (.imscc) - the Course cartridge source needs it."
          );
        }
        onProgress("Reading the course cartridge...");
        const data = await parseCartridgeBlob(files[0]);
        const modules: CourseStructureModule[] = data.modules.map((m) => ({
          title: m.name,
          items: m.items.map((it) => ({ title: it.title })),
        }));
        const schedule = courseStructureToSchedule(modules, weeksOrNull);
        // resolvedSourceMaterial fix: a cartridge's schedule comes entirely
        // from its own module list (courseStructureToSchedule above) - there
        // is no generateSchedulePlanAction call here to derive a TOC from, so
        // this forwards the shared "Source material" field unchanged, same
        // reasoning as the codebase branch above.
        return finalize(data.title ?? "", schedule, sourceMaterial ?? "");
      }

      if (source === "syllabus-document") {
        const files = Array.isArray(values.syllabus) ? (values.syllabus as File[]) : [];
        if (files.length === 0) {
          throw new Error(
            "Upload a syllabus document - the Syllabus document source needs it."
          );
        }
        onProgress("Reading the syllabus...");
        const file = files[0];
        const base64 = await blobToBase64(file);
        const extracted = await extractSyllabusTextAction({
          name: file.name,
          base64,
          mimeType: file.type,
        });
        if ("error" in extracted) throw new Error(extracted.error);

        // The syllabus text doubles as its own source material: a real
        // syllabus usually already contains the week-by-week outline, so
        // feeding it back in as sourceMaterial lets the same chapter/week
        // alignment machinery generate-schedule uses apply here too. An
        // explicit sourceMaterial input still wins when the instructor
        // provided one (e.g. naming a textbook the syllabus itself only
        // references by title).
        const materialForGeneration = sourceMaterial ?? extracted.text;

        onProgress("Generating schedule from the syllabus...");
        const r = await generateSchedulePlanAction(
          extracted.text,
          weeksOrNull ?? 0,
          testsOrNull ?? 0,
          helpers.provider,
          context,
          materialForGeneration
        );
        if ("error" in r) throw new Error(r.error);
        // resolvedSourceMaterial fix: this branch calls the EXACT SAME
        // generateSchedulePlanAction the course-description branch does
        // (just with the syllabus's extracted text as the course
        // description), so it CAN trigger the same web-search TOC derivation
        // - it is not true that this source "never runs TOC derivation."
        // Derivation fires under the identical condition
        // (shouldDeriveToc, source-alignment.ts): materialForGeneration has
        // no parseable chapter list of its own AND looks like a URL or a
        // short identifier. A full syllabus's own extracted text is normally
        // long, parseable prose, so in the common (no explicit sourceMaterial)
        // case this almost never fires - but whenever the instructor DID type
        // an explicit sourceMaterial value, this behaves exactly like
        // course-description's own branch, and must resolve the same way.
        const resolvedSourceMaterial = r.derivedToc?.trim() ? r.derivedToc : materialForGeneration;
        return finalize(r.courseTitle, r.schedule, resolvedSourceMaterial);
      }

      if (source === "existing-lms-course") {
        const courseUrl = String(values.lmsCourse ?? "").trim();
        if (!courseUrl) {
          throw new Error(
            "Select an existing LMS course - the Existing LMS course source needs it."
          );
        }
        onProgress("Reading the LMS course...");
        const content = await listCourseContentAction(
          courseUrl,
          helpers.activeInstitution || undefined
        );
        if ("error" in content) throw new Error(content.error);
        const modules: CourseStructureModule[] = content.modules.map((m) => ({
          title: m.name,
          items: m.items.map((it) => ({ title: it.title })),
        }));
        const schedule = courseStructureToSchedule(modules, weeksOrNull);
        // resolvedSourceMaterial fix: same reasoning as the course-cartridge
        // branch above - an existing LMS course's schedule comes entirely
        // from its own module list, with no TOC-derivation call to fold in,
        // so the shared "Source material" field passes through unchanged.
        return finalize(content.courseName, schedule, sourceMaterial ?? "");
      }

      if (source === "tile-export") {
        if (!hubCourseId) {
          throw new Error(
            "Choose a course tile - the Course tile's LMS export source needs it."
          );
        }
        if (!helpers.loadCourseExport) {
          throw new Error(
            "Loading the course tile's LMS export is not available in this run context."
          );
        }
        onProgress("Reading the course tile's LMS export...");
        const data = await helpers.loadCourseExport(hubCourseId);
        if (!data) {
          // loadCourseExport (step-helpers-server.ts) returns null both when
          // the tile itself cannot be found and when it has no exportFiles at
          // all - either way there is nothing to build a schedule from, so
          // this must fail loudly rather than fall through to an empty
          // schedule (same "never a silent empty success" rule finalize's own
          // zero-week check enforces below). resolveHubTileName is the SAME
          // lazy/cached lookup finalize's own courseTitle fallback uses below
          // (defined once, above, for every branch to share) - it runs its
          // OWN listCourseHubAction call here (loadCourseExport's internal
          // lookup is not exposed back to this step, so this is a genuine
          // second request, not a reused one), but it is memoized, so this
          // branch never pays for it twice even though it is the only place
          // in this branch that needs a tile NAME rather than a tile id.
          const tileName = (await resolveHubTileName()) ?? hubCourseId;
          throw new Error(
            `The course tile "${tileName}" has no LMS export on file - upload one to its Files tab (or pick a different source) before using the Course tile's LMS export source.`
          );
        }
        // Identical mapping to the course-cartridge branch above:
        // loadCourseExport already ran the SAME parseCartridgeBlob that
        // branch calls by hand (see this file's own header comment), so the
        // returned CartridgeCourseData has the exact same modules/items shape
        // to narrow down before handing off to the shared normalizer.
        const modules: CourseStructureModule[] = data.modules.map((m) => ({
          title: m.name,
          items: m.items.map((it) => ({ title: it.title })),
        }));
        const schedule = courseStructureToSchedule(modules, weeksOrNull);
        // resolvedSourceMaterial fix: same reasoning as the course-cartridge
        // and existing-LMS-course branches above - this source's schedule
        // comes entirely from the export's own module list, with no
        // TOC-derivation call to fold in, so the shared "Source material"
        // field passes through unchanged.
        return finalize(data.title ?? "", schedule, sourceMaterial ?? "");
      }

      if (source === "tile-repo") {
        if (!hubCourseId) {
          throw new Error(
            "Choose a course tile - the Course tile's repository source needs it."
          );
        }
        onProgress("Reading the course tile's repository...");
        // resolveHubTile is the SAME lazy/cached lookup finalize's own
        // courseTitle fallback (via resolveHubTileName) and tile-export's own
        // missing-export message use - defined once, above, for every branch
        // to share. Unlike tile-export, this branch needs the tile's `repos`
        // list itself (not just its name), so it calls resolveHubTile
        // directly rather than through the resolveHubTileName wrapper.
        const tile = await resolveHubTile();
        // AC2's multi-repo rule (see this file's own header comment for the
        // full reasoning): the FIRST linked repository, `repos[0]` - the
        // same rule load-course-tile, steps.github.ts, and scope.ts's
        // resolveClassRepoRef already apply to a course tile's repo list.
        const repo = tile?.repos[0]?.repo?.trim() ?? "";
        if (!repo) {
          // Never a silently empty schedule (AC3): name the tile, exactly as
          // the tile-export branch above does for a missing export - falling
          // back to the raw tile id on the same terms (tile not found, or
          // listCourseHubAction itself failed) resolveHubTile's own null
          // return already covers.
          const tileName = tile?.name ?? hubCourseId;
          throw new Error(
            `The course tile "${tileName}" has no repository linked - add one on the Courses tab (or pick a different source) before using the Course tile's repository source.`
          );
        }
        return scheduleFromRepo(repo);
      }

      throw new Error("Choose a course structure source.");
    },
  },
];
