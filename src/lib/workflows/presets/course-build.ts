// COURSE_BUILD, split out of presets/course-setup.ts once adding the two new
// scope-selector steps pushed that file past this repo's 1000-line cap.
// COURSE_KICKOFF, NO_CODE_KICKOFF, and COURSE_REFRESH stay in course-
// setup.ts; this file references "course-refresh" only by its string id
// (the include-workflow contract), never its TS object, so there is no
// import cycle back to that file.
import type { WorkflowDef } from "@/lib/workflows/types";
import { BLANK_TEMPLATE_AND_CASTLETOP_OVERRIDES } from "@/lib/workflows/presets/course-setup-shared";

// Reruns NO_CODE_KICKOFF's entire pipeline through one swap (course-
// schedule-from-source instead of generate-schedule - picks which of seven
// sources builds the schedule) and one derivation (courseKind resolved from
// the source instead of pinned "applied" - see that step's comment below),
// plus two scope selectors spliced in after the schedule. Measured shape:
// exactly ONE byte-identical step at the same position as NO_CODE_KICKOFF's
// (load-course-tile), out of its 7 steps and this preset's own 14 - "one
// swap" is a claim about semantics, not array shape.
//
// Both selectors are pure narrowing, never a runIf gate: a gate's skip
// cascades transitively to every step bound to its output (evaluateStepGate,
// run-step-core.ts), taking the terminal cartridge/zip down with it. Every
// narrowed generator instead treats deselection as an ordinary INPUT. The
// instructor-facing result is deliberately identical to NO_CODE_KICKOFF's
// regardless of source, and to a full run of it when both selectors are
// blank - "identical" means the ARTIFACT SET, never that every source or
// selection forces the same pedagogy. Full per-family accounting of what
// each selector narrows: docs/WORKFLOW-ARCHITECTURE.md.
export const COURSE_BUILD: WorkflowDef = {
  id: "course-build",
  preset: true,
  category: "course-setup",
  name: "Course Build",
  description:
    "Pick a course tile and how to build its schedule - a codebase, a typed course description, an uploaded course cartridge (.imscc), an uploaded syllabus document, an existing LMS course, the repository already linked on the selected course tile, or the LMS export already saved on the selected course tile. The run form asks for the tile, which source to use, and the deck template; whichever source is fed in, the tile's description, weeks, tests, LMS course, and start date still drive everything the chosen source itself does not supply. " +
    "Two more fields make this workflow general-purpose: which modules to (re)generate this run (blank = every module - build the whole course; a number, a list, or a range narrows it to a synchronous course's already-built modules) and which outputs to generate (blank = everything; or pick just assignments, objectives, openers, decks, guides, announcements, knowledge checks, weekly Significance of the Material documents, per-module instructor notes, the codebase and its associated assignments, the Start Here module, anticipated lecture Q&A, and/or current events). " +
    "Generates the schedule from that source, defines (or, on a re-run, reuses) the course-long project the whole term builds toward, then - per SELECTED module - that module's assignment first, and grounds the module intro, class opener, deck, and any test in it, so every artifact serves the project AND the assignment instead of being generated independently (the class opener generates as part of this same step, sequenced before that module's deck). " +
    "Then runs everything Course Refresh does (dynamically: changes to Course Refresh apply here automatically), skipping only the repository-dependent steps, (re)generating the course's syllabus from its Syllabus template column (always describing the WHOLE course, regardless of the module selection), generating the Castletop credit-hour workload workbook onto the course tile's Castletop column and the Files tab, and bundling everything the run produced into one zip that downloads and saves to the course tile, before the final two steps integrate the source material into the LMS and populate it from the class session template - so any pages or assignments those final steps create are not reflected in the workbook or the zip. " +
    "When this run is already anchored to a codebase (source: Codebase or the course tile's repository) and the \"Codebase and associated assignments\" output is selected, assignment READMEs are written/refreshed into that repository and each module's LMS assignment grounds in its own README; selecting that output on any other source fails loudly rather than doing nothing. The \"Start Here module\" output seeds the course's syllabus and a syllabus-acknowledgement quiz (and, only when a codebase is involved, a GitHub sign-up + username-submission assignment). " +
    "Every run finishes by sweeping the whole course's planned concepts against the programming concept visualizer's own page index and reporting any gaps found in its own step summary - opening a batched GitHub Copilot coding-agent task naming those gaps only when \"Dispatch Copilot task for gaps\" is explicitly turned on for that run (off by default). The terminal Common Cartridge export and zip always run, no matter which modules or outputs were selected.",
  steps: [
    {
      id: "load-course-tile",
      type: "load-course-tile",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        allowMissingRepo: { source: "literal", value: "1" },
      },
    },
    {
      // Emits the SAME schedule/courseTitle/weeks generate-schedule emitted
      // (course-refresh below is unaffected) plus two new outputs,
      // "resolvedSourceMaterial" and "courseKind" (see lecture-materials-
      // from-schedule's binding below). "sources" (generate-schedule's
      // sourcePolicy checklist) is deliberately NOT bound here - this step
      // declares no such input; it stays alive on lecture-materials-from-
      // schedule's own "sources" binding.
      id: "course-schedule-from-source",
      type: "course-schedule-from-source",
      bindings: {
        source: { source: "runtime", fieldKey: "source" },
        repo: { source: "runtime", fieldKey: "repo" },
        description: { source: "step", stepId: "load-course-tile", outputKey: "description" },
        cartridge: { source: "runtime", fieldKey: "cartridge" },
        syllabus: { source: "runtime", fieldKey: "syllabus" },
        lmsCourse: { source: "runtime", fieldKey: "lmsCourse" },
        weeks: { source: "step", stepId: "load-course-tile", outputKey: "weeks" },
        tests: { source: "step", stepId: "load-course-tile", outputKey: "tests" },
        context: { source: "runtime", fieldKey: "context" },
        sourceMaterial: { source: "runtime", fieldKey: "sourceMaterial" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
      },
    },
    {
      // Validates the "modules" runtime field (blank/a number/a list/a
      // range - src/lib/module-selection.ts) against the real schedule: an
      // out-of-range module throws, naming it. Only lecture-materials-from-
      // schedule below reads this step's NARROWED output; every course-wide
      // step reads the unnarrowed schedule instead.
      id: "select-course-modules",
      type: "select-course-modules",
      bindings: {
        schedule: { source: "step", stepId: "course-schedule-from-source", outputKey: "schedule" },
        modules: { source: "runtime", fieldKey: "modules" },
      },
    },
    {
      // Parses "outputs" into one boolean per family. Four feed lecture-
      // materials-from-schedule below; one each feeds generate-weekly-qa/
      // generate-weekly-current-events/resolve-codebase-repo (this preset's
      // own steps); six more feed course-refresh steps via the include's
      // bindOverrides below.
      id: "select-course-outputs",
      type: "select-course-outputs",
      bindings: {
        outputs: { source: "runtime", fieldKey: "outputs" },
        // F1 fix: blank ("all") must not imply "codebase" with no repo to
        // anchor it - steps.course-build-scope.ts's own "isCodebase" input
        // comment has the full rule.
        isCodebase: { source: "step", stepId: "course-schedule-from-source", outputKey: "isCodebase" },
      },
    },
    {
      // SPINE of a project-based course; courseKind derives from the
      // resolved source (defect fix). `schedule` deliberately reads course-
      // schedule-from-source directly, not the narrowed output - the
      // course-long project describes the WHOLE course.
      id: "define-course-project",
      type: "define-course-project",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        courseKind: { source: "step", stepId: "course-schedule-from-source", outputKey: "courseKind" },
        definition: { source: "runtime", fieldKey: "courseProject" },
        regenerate: { source: "literal", value: "" },
        schedule: { source: "step", stepId: "course-schedule-from-source", outputKey: "schedule" },
        autoDefine: { source: "literal", value: "1" },
      },
    },
    {
      // Per SELECTED module, generates the assignment FIRST, then grounds
      // the intro, opener, and deck in it (buildScheduleWeekPlan). Runs
      // AFTER define-course-project so the tile already carries a project.
      id: "lecture-materials-from-schedule",
      type: "lecture-materials-from-schedule",
      bindings: {
        // The ONE binding the module selector actually narrows; blank
        // "modules" makes it byte-identical to NO_CODE_KICKOFF's own binding.
        schedule: { source: "step", stepId: "select-course-modules", outputKey: "schedule" },
        minutes: { source: "literal", value: "50" },
        description: { source: "step", stepId: "load-course-tile", outputKey: "description" },
        context: { source: "runtime", fieldKey: "context" },
        // Same derived-TOC-or-unchanged contract NO_CODE_KICKOFF's binding to
        // generate-schedule's own output uses.
        sourceMaterial: { source: "step", stepId: "course-schedule-from-source", outputKey: "resolvedSourceMaterial" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        includeInstructions: { source: "literal", value: "1" },
        template: { source: "runtime", fieldKey: "deckTemplate" },
        sources: { source: "runtime", fieldKey: "sources" },
        // Derived rather than pinned "applied" (defect fix) so a codebase-
        // sourced run gets coding materials here; byte-identical to
        // NO_CODE_KICKOFF's own behavior on every other source.
        courseKind: { source: "step", stepId: "course-schedule-from-source", outputKey: "courseKind" },
        // Blank "outputs" emits "1" for all four - byte-identical to
        // NO_CODE_KICKOFF's own (unbound) behavior when nothing was narrowed.
        selectedObjectives: { source: "step", stepId: "select-course-outputs", outputKey: "selectedObjectives" },
        selectedDecks: { source: "step", stepId: "select-course-outputs", outputKey: "selectedDecks" },
        selectedAssignments: { source: "step", stepId: "select-course-outputs", outputKey: "selectedAssignments" },
        selectedOpeners: { source: "step", stepId: "select-course-outputs", outputKey: "selectedOpeners" },
      },
    },
    {
      // "Anticipated lecture Q&A" family: reuses generateLectureQaAction
      // unchanged, adding only the per-week loop grounded in that week's own
      // materials. Deselected: passes files through unchanged.
      id: "generate-weekly-qa",
      type: "generate-weekly-qa",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepId: "course-schedule-from-source", outputKey: "schedule" },
        files: { source: "step", stepId: "lecture-materials-from-schedule", outputKey: "files" },
        courseKind: { source: "step", stepId: "course-schedule-from-source", outputKey: "courseKind" },
        selected: { source: "step", stepId: "select-course-outputs", outputKey: "selectedQa" },
      },
    },
    {
      // "Current events" family: reuses researchCurrentEventsAction
      // unchanged, reading generate-weekly-qa's "files" to extend the same
      // mini-chain. Deselected: passes files through unchanged.
      id: "generate-weekly-current-events",
      type: "generate-weekly-current-events",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepId: "course-schedule-from-source", outputKey: "schedule" },
        files: { source: "step", stepId: "generate-weekly-qa", outputKey: "files" },
        recentWindow: { source: "runtime", fieldKey: "recentWindow" },
        // Off by default (matches this preset's other per-week postToLms
        // fields) - posting a term's pages to a live course is outward-facing.
        postToLms: { source: "runtime", fieldKey: "currentEventsPostToLms" },
        selected: { source: "step", stepId: "select-course-outputs", outputKey: "selectedCurrentEvents" },
      },
    },
    {
      // "Codebase and associated assignments" family (steps.course-build-
      // codebase.ts). Selected without a codebase-anchored source: throws a
      // clear, actionable error rather than doing nothing - see this step's
      // own file for the full condition/scope write-up.
      id: "resolve-codebase-repo",
      type: "resolve-codebase-repo",
      bindings: {
        repo: { source: "step", stepId: "course-schedule-from-source", outputKey: "repo" },
        selected: { source: "step", stepId: "select-course-outputs", outputKey: "selectedCodebase" },
      },
    },
    {
      // Reuses fill-readmes (steps.github.ts) UNCHANGED. runIf-gated (not a
      // "selected" input) because it is SAFE: fill-readmes declares NO
      // outputs, so nothing downstream can be skip-cascaded through gating
      // it off (evaluateStepGate, run-step-core.ts).
      id: "fill-readmes",
      type: "fill-readmes",
      bindings: {
        repo: { source: "step", stepId: "resolve-codebase-repo", outputKey: "repo" },
        schedule: { source: "step", stepId: "course-schedule-from-source", outputKey: "schedule" },
        description: { source: "step", stepId: "load-course-tile", outputKey: "description" },
        context: { source: "runtime", fieldKey: "context" },
      },
      runIf: {
        binding: { source: "step", stepId: "resolve-codebase-repo", outputKey: "repo" },
        expected: true,
      },
    },
    {
      // skipSteps/remap, and 16 of this block's 31 bindOverrides entries
      // (the 15 blanks from BLANK_TEMPLATE_AND_CASTLETOP_OVERRIDES below,
      // plus groundInAssignment), are byte-for-byte the same as NO_CODE_
      // KICKOFF's own course-refresh include (course-setup.ts). The other 15
      // differ or are new: seven courseKind entries (derived here instead of
      // pinned "applied" - a defect fix, see this file's header), five
      // "selected" entries feeding select-course-outputs' matching booleans
      // into course-refresh's own generators (each treats deselected as "do
      // no work" - never gated off), and three entries new to the Codebase
      // and Start-Here families - see each entry's own comment below.
      id: "include-course-refresh",
      type: "include-workflow",
      bindings: {},
      include: {
        workflowId: "course-refresh",
        skipSteps: [0, 1, 3],
        bindOverrides: {
          "generate-assignment-from-template.courseKind": {
            source: "step",
            stepId: "course-schedule-from-source",
            outputKey: "courseKind",
          },
          "generate-test-from-template.courseKind": {
            source: "step",
            stepId: "course-schedule-from-source",
            outputKey: "courseKind",
          },
          "generate-course-guides.courseKind": {
            source: "step",
            stepId: "course-schedule-from-source",
            outputKey: "courseKind",
          },
          // F2 fix: lms-rubric's own "courseKind" input (course-setup.ts's
          // COURSE_REFRESH) - avoids resolveCourseKind's "unbound defaults
          // to coding" fallback.
          "lms-rubric.courseKind": {
            source: "step",
            stepId: "course-schedule-from-source",
            outputKey: "courseKind",
          },
          "generate-knowledge-checks.courseKind": {
            source: "step",
            stepId: "course-schedule-from-source",
            outputKey: "courseKind",
          },
          "generate-weekly-significance.courseKind": {
            source: "step",
            stepId: "course-schedule-from-source",
            outputKey: "courseKind",
          },
          "generate-instructor-notes.courseKind": {
            source: "step",
            stepId: "course-schedule-from-source",
            outputKey: "courseKind",
          },
          "generate-course-guides.selected": { source: "step", stepId: "select-course-outputs", outputKey: "selectedGuides" },
          "generate-weekly-announcements.selected": {
            source: "step",
            stepId: "select-course-outputs",
            outputKey: "selectedAnnouncements",
          },
          "generate-knowledge-checks.selected": {
            source: "step",
            stepId: "select-course-outputs",
            outputKey: "selectedKnowledgeChecks",
          },
          "generate-weekly-significance.selected": {
            source: "step",
            stepId: "select-course-outputs",
            outputKey: "selectedSignificance",
          },
          "generate-instructor-notes.selected": {
            source: "step",
            stepId: "select-course-outputs",
            outputKey: "selectedInstructorNotes",
          },
          // Codebase family: feeds lms-assignments resolve-codebase-repo
          // instead of the "" every other preset remaps it to, so its
          // EXISTING repo-driven grounding fires when resolved.
          "lms-assignments.repo": { source: "step", stepId: "resolve-codebase-repo", outputKey: "repo" },
          ...BLANK_TEMPLATE_AND_CASTLETOP_OVERRIDES,
          "generate-test-from-template.groundInAssignment": { source: "literal", value: "1" },
          // Start-Here family: "selected" gates the WHOLE starter-materials
          // seeding on "selectedStartHere". "includeGithub" derives from
          // "isCodebase" (not gated on the codebase family's own selection)
          // instead of the "" every OTHER preset pins.
          "include-starter-materials.selected": {
            source: "step",
            stepId: "select-course-outputs",
            outputKey: "selectedStartHere",
          },
          "include-starter-materials.includeGithub": {
            source: "step",
            stepId: "course-schedule-from-source",
            outputKey: "isCodebase",
          },
        },
        remap: {
          "load-course-tile.repo": { source: "literal", value: "" },
          "load-course-tile.course": { source: "step", stepId: "load-course-tile", outputKey: "course" },
          "load-course-tile.startDate": { source: "step", stepId: "load-course-tile", outputKey: "startDate" },
          "load-course-tile.description": { source: "step", stepId: "load-course-tile", outputKey: "description" },
          // course-schedule-from-source's own FULL schedule/weeks, NOT
          // select-course-modules' narrowed output - every course-refresh
          // step reached here is course-wide.
          "schedule-from-repo.schedule": { source: "step", stepId: "course-schedule-from-source", outputKey: "schedule" },
          "schedule-from-repo.courseTitle": {
            source: "step",
            stepId: "course-schedule-from-source",
            outputKey: "courseTitle",
          },
          "schedule-from-repo.weeks": { source: "step", stepId: "course-schedule-from-source", outputKey: "weeks" },
          // Tail of the local files mini-chain, so course-refresh's own
          // chain and the terminal cartridge/zip see the Q&A and current-
          // events documents too.
          "lecture-zip.files": { source: "step", stepId: "generate-weekly-current-events", outputKey: "files" },
        },
      },
    },
    {
      id: "integrate-source-into-lms",
      type: "integrate-source-into-lms",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepId: "course-schedule-from-source", outputKey: "schedule" },
        sourceMaterial: { source: "runtime", fieldKey: "sourceMaterial" },
        sourceUrl: { source: "runtime", fieldKey: "sourceUrl" },
      },
    },
    {
      // Appended here, matching NO_CODE_KICKOFF. Unlike the two kickoffs'
      // own copies (course-setup.ts), which pin projectMode/
      // projectDescription literal "" deliberately, COURSE_BUILD binds both
      // to runtime fields - a PER-RUN override distinct from courseProject's
      // PERSISTED project above.
      id: "populate-lms-from-class-template",
      type: "populate-lms-from-class-template",
      bindings: {
        template: { source: "runtime", fieldKey: "classSessionTemplate" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        fromWeek: { source: "literal", value: "1" },
        toWeek: { source: "literal", value: "" },
        projectMode: { source: "runtime", fieldKey: "classSessionProjectMode" },
        projectDescription: { source: "runtime", fieldKey: "classSessionProjectDescription" },
        activitySource: { source: "literal", value: "template" },
        setupBurden: { source: "literal", value: "template" },
        postToCanvas: { source: "runtime", fieldKey: "classSessionPostToCanvas" },
      },
    },
    {
      // Appended LAST deliberately, so adding it never shifted any earlier
      // bindOverrides target. SCOPE (HANDOFF.md Q2): sweeps EVERY week, not
      // just the modules narrowed this run to - same as define-course-
      // project above. Dispatch is a supervised, outward-facing side effect
      // - off unless explicitly turned on.
      id: "audit-visualizer-coverage",
      type: "audit-visualizer-coverage",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepId: "course-schedule-from-source", outputKey: "schedule" },
        minutes: { source: "literal", value: "50" },
        maxGaps: { source: "literal", value: "20" },
        dispatch: { source: "runtime", fieldKey: "dispatchVisualizerGaps" },
      },
    },
  ],
};
