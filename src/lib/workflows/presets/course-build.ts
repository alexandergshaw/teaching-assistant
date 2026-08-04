// COURSE_BUILD, split out of presets/course-setup.ts (matching how course-
// kickoff-no-code's own tests were split out of presets.test.ts, per that
// file's own header comment) once adding the two new scope-selector steps
// pushed course-setup.ts past this repo's 1000-line-per-file cap. Nothing
// else moved - COURSE_KICKOFF, NO_CODE_KICKOFF, and COURSE_REFRESH all still
// live in course-setup.ts, unchanged; this file only ever references
// "course-refresh" by its string id (the include-workflow contract), never
// COURSE_REFRESH's own TS object, so there is no import cycle back to that
// file.
import type { WorkflowDef } from "@/lib/workflows/types";

// COURSE_BUILD is NO_CODE_KICKOFF with one swap, one derivation threaded
// consistently through everything the swap affects, and two scope selectors
// spliced in right after the schedule is built. The swap: its schedule-
// generation step (index 1) is course-schedule-from-source (steps.course-
// schedule-from-source.ts) instead of generate-schedule, so the instructor
// picks WHICH of seven sources builds the schedule - a codebase, a typed
// description, an uploaded course cartridge, an uploaded syllabus, an
// existing LMS course, the repository already linked on the selected course
// tile, or the LMS export already saved on the selected course tile -
// instead of only ever typing a description. The derivation: unlike
// NO_CODE_KICKOFF (course kind always "applied") or COURSE_KICKOFF (always
// "coding"), COURSE_BUILD's course kind is not knowable at authoring time -
// a "codebase" or "tile-repo" source describes a programming course (the
// same kind of input, just obtained differently) and every other source
// describes one that does not require the instructor to write code - so
// course-schedule-from-source itself resolves it (via resolveCourseKind,
// @/lib/course-kind - see that step's own comment) and exposes it as its own
// "courseKind" output (F3: preferring the selected course tile's own stored
// "courseKind" column when set - see that step's own comment - and falling
// back to this source-derived value only when the tile has none). Every step
// below that consumes courseKind (4, 5, and the course-refresh include's own
// 4/5/6/8/13/14/15 bindOverrides) binds to THAT output instead of a literal,
// so a codebase- or tile-repo-sourced run gets
// coding-flavored materials everywhere a codebase kickoff would (real code,
// the coding slide contract, the coding opener, coding practice problems),
// and every other source keeps today's applied behavior byte-for-byte.
//
// The two scope selectors (steps 2 and 3, steps.course-build-scope.ts) are
// what make this preset genuinely general-purpose rather than just "the
// no-code kickoff with a source picker": "select-course-modules" lets an
// instructor narrow a run to one, several, or all of the course's modules
// (blank = every module, reproducing a full build), and "select-course-
// outputs" lets them narrow which KINDS of content this run generates
// (assignments, objectives, openers, decks, guides, announcements,
// knowledge checks, weekly Significance of the Material documents,
// per-module instructor notes, anticipated lecture Q&A, and current events -
// blank = every output). Both are pure narrowing:
// deselecting a module or an output never gates a step off with runIf - a
// gated step's skip cascades transitively to every step bound to its output
// (server-runner.ts, around lines 218-232), which would silently take the
// terminal Common Cartridge export and zip down with it. Instead:
//  - select-course-modules narrows the SCHEDULE lecture-materials-from-
//    schedule (step 5) consumes - never define-course-project (step 4,
//    still reads step 1's own FULL schedule: the course-long project must
//    describe the WHOLE course, not just the selected modules) and never
//    any course-refresh step reached below (the "1.schedule"/"1.weeks"
//    remap entries still point at step 1's own outputs, unnarrowed - the
//    syllabus, the Castletop workload workbook, the course guides, and the
//    LMS module-shell/rubric steps all still see and describe the whole
//    course, exactly like AC3 requires). A selection naming a module absent
//    from the schedule is an ERROR (the step throws, naming it) - never a
//    silent empty success.
//  - select-course-outputs feeds one boolean per output family into the
//    matching generator as an ordinary INPUT (lecture-materials-from-
//    schedule's own selectedAssignments/Objectives/Openers/Decks bindings
//    below, this preset's own generate-weekly-qa/generate-weekly-current-
//    events steps at 6/7, and course-refresh's generate-course-guides/
//    generate-weekly-announcements/generate-knowledge-checks/generate-
//    weekly-significance/generate-instructor-notes via five bindOverrides
//    entries - "6.selected"/"12.selected"/"13.selected"/"14.selected"/
//    "15.selected"). A deselected generator does no work and passes its
//    `files` through unchanged (see each of those steps' own "selected"
//    input) - it never leaves the chain, so blackboard-export and
//    save-zip-to-course (never listed in the selector, never gate-able)
//    always still run and still produce. "Module introductions" have no
//    toggle of their own: they ride as the deck's own opening-slide speaker
//    notes (assembleLectureFiles, registry-helpers.ts), so selectedDecks
//    covers both.
//
// Two more per-week output families - "qa" (steps.course-build-qa.ts) and
// "currentEvents" (steps.course-build-current-events.ts) - were spliced in
// right after lecture-materials-from-schedule (step 5), as steps 6/7: each
// reuses an EXISTING, unchanged action (generateLectureQaAction, the same
// call the standalone "Anticipate lecture Q&A" step already makes; and
// researchCurrentEventsAction, the same call the standalone "Current events
// for a slide deck" step already makes) and only adds the per-week loop that
// grounds each week's document in THAT WEEK'S OWN materials step 5 already
// produced (gatherWeekMaterials, the same "no materials this run, no
// document" honesty rule generate-weekly-announcements/generate-knowledge-
// checks/generate-instructor-notes already use), chained together (step 6
// reads step 5's files, step 7 reads step 6's) so both survive into
// whatever reads step 7's own "files" output next (see the include's own
// "3.files" remap below). Deselected: passes `files` through unchanged, the
// same "selected" idiom as every other per-week generator - never a runIf
// gate.
//
// Two more output families still (steps 8/9, steps.course-build-codebase.ts
// and steps.github.ts's fill-readmes) were spliced in right after that, once
// again pushing the include-workflow/integrate-source-into-lms/populate-lms-
// from-class-template steps - now from 8/9/10 to 10/11/12: "codebase"
// (mimics COURSE_KICKOFF's own repo-from-template/fill-readmes/lms-
// assignments repo-driven grounding, but reuses the repository this run is
// ALREADY anchored to - source "codebase" or "tile-repo" - rather than
// creating a new one; selecting it on any other source fails loudly, see
// step 8's own file) and "startHere" (gates the ALREADY-existing starter-
// materials seeding - syllabus + syllabus-acknowledgement quiz always, a
// GitHub sign-up + username-submission assignment only under the SAME
// codebase condition - on its own selector boolean instead of running
// unconditionally; see the course-refresh include's "18.selected"/
// "18.includeGithub" bindOverrides below). Neither family touches the
// `files` accumulator at all (fill-readmes and starter-materials both
// declare zero outputs), so "deselected passes files through unchanged" is
// trivially true for both - there is nothing in that chain to pass through
// in the first place.
//
// One more step rides along at the very end - index 13, steps.visualizer.ts's
// "audit-visualizer-coverage" (the "Audit visualizer coverage for a course"
// step). After everything else has run, it sweeps the WHOLE course's planned
// concepts (bound to step 1's own unnarrowed schedule, the SAME course-wide
// binding define-course-project and the course-refresh include's own
// "1.schedule" remap above already use - a coverage audit describes the
// whole course, not just what this run happened to (re)generate) against the
// programming concept visualizer's own page index, and reports which
// concepts still have no page there. Appended as the new LAST step
// deliberately, so adding it never shifted any earlier bindOverrides
// stepIndex. It touches no `files` accumulator and is read-only reporting -
// it never edits this run's own zip or Common Cartridge export. Opening a
// batched GitHub Copilot coding-agent task naming the gaps it finds is a
// supervised, outward-facing side effect, so it stays off by default and
// only happens when an instructor explicitly turns on "Dispatch Copilot task
// for gaps" for that run (bound to its own runtime field below, never a
// literal "1") - see steps.visualizer.ts's own header comment for the full
// reuse/scope/dispatch write-up.
//
// Step 0 is carried over from NO_CODE_KICKOFF UNCHANGED, at the same index,
// for the same reasons its own comments give - see that preset (course-
// setup.ts) for the detailed per-binding rationale; it is not repeated here
// except where step 1's different output contract (two more outputs than
// generate-schedule/schedule-from-repo declare - "resolvedSourceMaterial"
// and "courseKind" - see step 5's own binding comment below) forced a real
// change, called out at each binding. The instructor-facing result is
// deliberately identical to NO_CODE_KICKOFF's regardless of which source is
// picked, and to a full (unnarrowed) NO_CODE_KICKOFF run whenever the two
// new selectors are left blank: the same Common Cartridge (.imscc) export
// and the same terminal zip - "identical" describes the ARTIFACT SET (a
// cartridge and a zip with the same roles), never that every source/
// selection is forced through the same pedagogy regardless of what the
// instructor fed in or asked for.
export const COURSE_BUILD: WorkflowDef = {
  id: "course-build",
  preset: true,
  category: "course-setup",
  name: "Course Build",
  description:
    "Pick a course tile and how to build its schedule - a codebase, a typed course description, an uploaded course cartridge (.imscc), an uploaded syllabus document, an existing LMS course, the repository already linked on the selected course tile, or the LMS export already saved on the selected course tile - the run form asks for the tile, which source to use, and the deck template; whichever source is fed in, the tile's description, weeks, tests, LMS course, and start date still drive everything the chosen source itself does not supply. Two more fields make this workflow general-purpose: which modules to (re)generate this run (blank = every module - build the whole course; a number, a list, or a range narrows it to a synchronous course's already-built modules) and which outputs to generate (blank = everything; or pick just assignments, objectives, openers, decks, guides, announcements, knowledge checks, weekly Significance of the Material documents, per-module instructor notes, the codebase and its associated assignments, the Start Here module, anticipated lecture Q&A, and/or current events). Generates the schedule from that source, defines (or, on a re-run, reuses) the course-long project the whole term builds toward, then - per SELECTED module - that module's assignment first, and grounds the module intro, class opener, deck, and any test in it, so every artifact serves the project AND the assignment instead of being generated independently (the class opener generates as part of this same step, sequenced before that module's deck) - then runs everything Course Refresh does (dynamically: changes to Course Refresh apply here automatically), skipping only the repository-dependent steps, (re)generating the course's syllabus from its Syllabus template column (always describing the WHOLE course, regardless of the module selection), generating the Castletop credit-hour workload workbook onto the course tile's Castletop column and the Files tab, and bundling everything the run produced into one zip that downloads and saves to the course tile, before the final two steps integrate the source material into the LMS and populate it from the class session template - so any pages or assignments those final steps create are not reflected in the workbook or the zip. When this run is already anchored to a codebase (source: Codebase or the course tile's repository) and the \"Codebase and associated assignments\" output is selected, assignment READMEs are written/refreshed into that repository and each module's LMS assignment grounds in its own README; selecting that output on any other source fails loudly rather than doing nothing. The \"Start Here module\" output seeds the course's syllabus and a syllabus-acknowledgement quiz (and, only when a codebase is involved, a GitHub sign-up + username-submission assignment). Every run finishes by sweeping the whole course's planned concepts against the programming concept visualizer's own page index and reporting any gaps found in its own step summary - opening a batched GitHub Copilot coding-agent task naming those gaps only when \"Dispatch Copilot task for gaps\" is explicitly turned on for that run (off by default). The terminal Common Cartridge export and zip always run, no matter which modules or outputs were selected.",
  steps: [
    {
      type: "load-course-tile",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        allowMissingRepo: { source: "literal", value: "1" },
      },
    },
    {
      // The swap: course-schedule-from-source replaces generate-schedule.
      // It emits the SAME three schedule-from-repo-shaped outputs
      // (schedule/courseTitle/weeks) generate-schedule also emitted, so
      // every downstream binding to those three - including the entire
      // course-refresh include below - carries over from NO_CODE_KICKOFF
      // unchanged. It ALSO emits two more outputs of its own:
      // "resolvedSourceMaterial" (the same derived-TOC-or-unchanged contract
      // generate-schedule's own output uses - see step 5's binding below)
      // and "courseKind" (the source-derived course kind - see steps 4/5 and
      // the include-workflow block's bindOverrides below). Its own bindings
      // here differ from NO_CODE_KICKOFF's generate-schedule bindings in
      // three ways:
      //  - description/weeks/tests/context/sourceMaterial/hubCourse carry
      //    over unchanged (same runtime fieldKeys / same step-0 outputs);
      //  - source/repo/cartridge/syllabus/lmsCourse are new - one binding
      //    per source this step's own input list declares, each to its own
      //    runtime field (named after the input key, this codebase's usual
      //    convention), so the run form surfaces the picker plus the (up
      //    to five) per-source fields it can apply to, exactly matching the
      //    step's own "fill in only the input below that matches your
      //    choice" description. The sixth and seventh sources (the course
      //    tile's own LMS export, and the repository already linked on the
      //    course tile's own row) need NO binding of their own here at all:
      //    each reads the tile id off the SAME "hubCourse" binding already
      //    present below (each source's own step file explains why - both
      //    ask the instructor for nothing beyond the tile they already
      //    picked), so adding either one did not grow this run form by a
      //    single field;
      //  - "sources" (the sourcePolicy checklist generate-schedule accepted)
      //    is intentionally NOT bound here: course-schedule-from-source
      //    declares no such input at all (wave 1 never carried it over), so
      //    a binding here would target nothing. It stays alive elsewhere in
      //    this preset - see lecture-materials-from-schedule below, whose
      //    OWN "sources" input is untouched by this swap.
      type: "course-schedule-from-source",
      bindings: {
        source: { source: "runtime", fieldKey: "source" },
        repo: { source: "runtime", fieldKey: "repo" },
        description: { source: "step", stepIndex: 0, outputKey: "description" },
        cartridge: { source: "runtime", fieldKey: "cartridge" },
        syllabus: { source: "runtime", fieldKey: "syllabus" },
        lmsCourse: { source: "runtime", fieldKey: "lmsCourse" },
        weeks: { source: "step", stepIndex: 0, outputKey: "weeks" },
        tests: { source: "step", stepIndex: 0, outputKey: "tests" },
        context: { source: "runtime", fieldKey: "context" },
        sourceMaterial: { source: "runtime", fieldKey: "sourceMaterial" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
      },
    },
    {
      // Module selector (AC4): validates/narrows step 1's own FULL schedule
      // against the "modules" runtime field's forgiving spec (blank/a
      // number/a list/a range - src/lib/module-selection.ts). Runs right
      // after the schedule exists so it has something real to validate
      // against - a module number outside the resolved schedule throws,
      // naming it, rather than silently succeeding with nothing. ONLY
      // lecture-materials-from-schedule (step 5) reads this step's narrowed
      // "schedule" output; every course-wide step below (define-course-
      // project, and every course-refresh step reached via the include's
      // "1.schedule"/"1.weeks" remap) still reads step 1's own UNNARROWED
      // schedule - see this preset's own header comment for the full
      // per-artifact accounting.
      type: "select-course-modules",
      bindings: {
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        modules: { source: "runtime", fieldKey: "modules" },
      },
    },
    {
      // Output selector (AC1/AC2): parses the "outputs" multi-select
      // (blank/one/several/all - src/lib/output-selection.ts) into one
      // boolean per output family. Each boolean is consumed as an ordinary
      // INPUT by the generator it matches (lecture-materials-from-schedule
      // below, and three course-refresh steps via bindOverrides) - never a
      // runIf gate, so every generator stays in the chain and the terminal
      // cartridge/zip are never skippable through this selector (they are
      // not even listed among its options).
      type: "select-course-outputs",
      bindings: {
        outputs: { source: "runtime", fieldKey: "outputs" },
        // F1 fix: blank ("all") must not imply the "codebase" family when
        // this run has no repository to anchor it - see steps.course-build-
        // scope.ts's own "isCodebase" input comment for the full rule/
        // rationale. Bound to step 1's own "isCodebase" output (course-
        // schedule-from-source - "1" only on the "codebase"/"tile-repo"
        // sources), the SAME signal step 6 (resolve-codebase-repo) and the
        // Start-Here family's "18.includeGithub" bindOverride below already
        // key off.
        isCodebase: { source: "step", stepIndex: 1, outputKey: "isCodebase" },
      },
    },
    {
      // SPINE of a project-based course, unchanged from NO_CODE_KICKOFF
      // except for courseKind (defect fix: this used to pin "applied"
      // unconditionally, so a codebase-sourced run's auto-designed project
      // was written as if code were off-limits even for a programming
      // course) - runs BEFORE lecture-materials-from-schedule (next step) so
      // a fresh course's very first run already carries a project when that
      // step asks for one via hubCourse - every generator downstream reads
      // the project off the tile for THAT WEEK'S milestone. Blank never
      // touches an EXISTING project; a typed description always wins.
      // `schedule` deliberately still reads step 1 directly (NOT step 2's
      // narrowed output): the course-long project describes the WHOLE
      // course regardless of which modules this run selected to generate.
      type: "define-course-project",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        courseKind: { source: "step", stepIndex: 1, outputKey: "courseKind" },
        definition: { source: "runtime", fieldKey: "courseProject" },
        regenerate: { source: "literal", value: "" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        autoDefine: { source: "literal", value: "1" },
      },
    },
    {
      // Per SELECTED module, this step generates the assignment FIRST - the
      // spine of a module - then grounds the intro, opener, and deck in it
      // (buildScheduleWeekPlan). Runs AFTER define-course-project, so the
      // tile already carries a project when it reads one via hubCourse (no
      // stepIndex binding needed for that). The opener generates INSIDE
      // this step (sequenceOpenerBeforeDeck, always on per Z3), before the
      // deck and grounded in the assignment; the deck is then grounded in
      // the assignment AND the opener.
      type: "lecture-materials-from-schedule",
      bindings: {
        // AC3/AC4: reads step 2's NARROWED schedule (select-course-modules),
        // not step 1's own - this is the ONE binding in this preset the
        // module selector actually narrows. Blank "modules" input makes
        // step 2 pass step 1's schedule through unchanged, so this is
        // byte-identical to NO_CODE_KICKOFF's own binding whenever no
        // narrowing was requested.
        schedule: { source: "step", stepIndex: 2, outputKey: "schedule" },
        minutes: { source: "literal", value: "50" },
        description: { source: "step", stepIndex: 0, outputKey: "description" },
        context: { source: "runtime", fieldKey: "context" },
        // Bound to course-schedule-from-source's own "resolvedSourceMaterial"
        // output - the SAME contract NO_CODE_KICKOFF's binding to generate-
        // schedule's resolvedSourceMaterial output uses (see that preset's
        // own comment on this same binding): a web-search-derived TOC when
        // the picked source's own generation call found one, otherwise the
        // shared Source material field's text unchanged. Defect fix: this
        // used to bind the raw runtime field directly, on the (incorrect)
        // premise that this step declared no such output - so an instructor
        // who fed a bare URL or short citation into that field got a
        // schedule grounded by the derived TOC but lecture materials
        // grounded only in the bare citation. course-schedule-from-source
        // now computes and exposes the same derived value generate-schedule
        // always did (see that step's own file for the per-source contract).
        // Still reads step 1 directly, unaffected by module narrowing - the
        // source material's own alignment describes the whole course.
        sourceMaterial: { source: "step", stepIndex: 1, outputKey: "resolvedSourceMaterial" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        includeInstructions: { source: "literal", value: "1" },
        template: { source: "runtime", fieldKey: "deckTemplate" },
        sources: { source: "runtime", fieldKey: "sources" },
        // Defect fix: this used to pin "applied" unconditionally, on the
        // premise that "the output must stay identical no matter which of
        // the seven sources was picked" - but that describes the ARTIFACT
        // SET (a cartridge and a zip with the same roles), not the pedagogy
        // baked into each artifact. A codebase- or tile-repo-sourced run IS a
        // programming course and must get coding materials here: real code
        // in slides, notes, and assignment instructions, the coding slide
        // contract, and the coding-flavored opener - exactly what a codebase
        // kickoff already produces. course-schedule-from-source resolves the
        // kind from the chosen source (see its own output/comment); every
        // other source still resolves to "applied", so this is byte-identical to
        // NO_CODE_KICKOFF's own behavior whenever a non-codebase source is
        // picked.
        courseKind: { source: "step", stepIndex: 1, outputKey: "courseKind" },
        // AC1: the output selector's four per-role booleans (step 3). Blank
        // "outputs" input makes step 3 emit "1" for all four, so this is
        // byte-identical to NO_CODE_KICKOFF's own (unbound) behavior
        // whenever no output narrowing was requested - see
        // assembleLectureFiles' own isGeneratorSelected usage
        // (registry-helpers.ts).
        selectedObjectives: { source: "step", stepIndex: 3, outputKey: "selectedObjectives" },
        selectedDecks: { source: "step", stepIndex: 3, outputKey: "selectedDecks" },
        selectedAssignments: { source: "step", stepIndex: 3, outputKey: "selectedAssignments" },
        selectedOpeners: { source: "step", stepIndex: 3, outputKey: "selectedOpeners" },
      },
    },
    {
      // "Anticipated lecture Q&A" output family (steps.course-build-qa.ts):
      // per-week questions students are likely to ask, with instructor-ready
      // answers, grounded in that week's own materials step 5 just produced
      // (reads step 5's "files" - the immediately preceding chain link).
      // Reuses generateLectureQaAction (the standalone "Anticipate lecture
      // Q&A" step's own action) unchanged; this step only adds the per-week
      // loop. Deselected (step 3's "selectedQa"): passes files through
      // unchanged, same "selected" idiom as generate-weekly-significance/
      // generate-instructor-notes - never a runIf gate, so this step always
      // stays in the chain.
      type: "generate-weekly-qa",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        files: { source: "step", stepIndex: 5, outputKey: "files" },
        courseKind: { source: "step", stepIndex: 1, outputKey: "courseKind" },
        selected: { source: "step", stepIndex: 3, outputKey: "selectedQa" },
      },
    },
    {
      // "Current events" output family (steps.course-build-current-
      // events.ts): a per-week research report grounded in that week's own
      // materials - reads THIS preset's own step 6 (generate-weekly-qa)
      // "files" output, extending the same mini-chain rather than
      // re-reading step 5 directly, so both new families' documents survive
      // into whatever reads this step's own "files" output next. Reuses
      // researchCurrentEventsAction (the standalone "Current events for a
      // slide deck" step's own action) unchanged; this step only adds the
      // per-week loop. Deselected (step 3's "selectedCurrentEvents"): passes
      // files through unchanged, same "selected" idiom as above - never a
      // runIf gate.
      type: "generate-weekly-current-events",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        files: { source: "step", stepIndex: 6, outputKey: "files" },
        recentWindow: { source: "runtime", fieldKey: "recentWindow" },
        selected: { source: "step", stepIndex: 3, outputKey: "selectedCurrentEvents" },
      },
    },
    {
      // "Codebase and associated assignments" output family (steps.course-
      // build-codebase.ts): resolves which repository (if any) this run
      // should use, from course-schedule-from-source's own "repo" output
      // (step 1 - non-blank only when this run's source is "codebase" or
      // "tile-repo") and step 3's (select-course-outputs) "selectedCodebase"
      // boolean. Deselected: passes "" through, byte-identical to today's
      // hard-coded blank (see the course-refresh include's own "0.repo"
      // remap below, unchanged). Selected without a codebase-anchored
      // source: throws a clear, actionable error rather than silently doing
      // nothing - see steps.course-build-codebase.ts's own header comment
      // for the full condition/scope write-up, including what this pass
      // deliberately did NOT build (auto-creating a brand-new repository via
      // repo-from-template when no codebase is already in play).
      type: "resolve-codebase-repo",
      bindings: {
        repo: { source: "step", stepIndex: 1, outputKey: "repo" },
        selected: { source: "step", stepIndex: 3, outputKey: "selectedCodebase" },
      },
    },
    {
      // Reuses fill-readmes (steps.github.ts) UNCHANGED - the exact step
      // COURSE_KICKOFF's own codebase steps use (course-setup.ts) - to
      // write/refresh this run's assignment READMEs into whichever
      // repository step 8 (resolve-codebase-repo) just resolved. runIf-gated
      // (never a "selected" input on fill-readmes itself, unlike the pattern
      // elsewhere in this preset) because this is SAFE here specifically:
      // fill-readmes declares NO outputs at all, so nothing downstream could
      // ever be skip-cascaded through gating it off (server-runner.ts,
      // around lines 218-232 - the cascade only reaches steps bound to a
      // GATED step's OWN output, and this step has none to bind to). Runs
      // only when step 8 actually resolved a repository (deselected, or
      // selected without a codebase source - which step 8 already turned
      // into a thrown error before this step could even be reached - both
      // leave step 8's "repo" output blank).
      type: "fill-readmes",
      bindings: {
        repo: { source: "step", stepIndex: 8, outputKey: "repo" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        description: { source: "step", stepIndex: 0, outputKey: "description" },
        context: { source: "runtime", fieldKey: "context" },
      },
      runIf: {
        binding: { source: "step", stepIndex: 8, outputKey: "repo" },
        expected: true,
      },
    },
    {
      // skipSteps/remap, and every bindOverride EXCEPT the four courseKind
      // entries and the five "selected"/repo/GitHub entries below, are
      // byte-for-byte the same as NO_CODE_KICKOFF's own course-refresh
      // include - see that block's comments (course-setup.ts) for the
      // reasoning behind each entry. The four courseKind entries (4/5/6/13)
      // are a defect fix: they used to pin NO_CODE_KICKOFF's literal
      // "applied", which forced a codebase-sourced run's optional
      // assignment/test templates, course guides, and knowledge checks
      // through the no-code contract too. They now derive from step 1's own
      // "courseKind" output instead - see step 5's binding comment above for
      // the full reasoning, which applies identically here. The three
      // significance/announcements/knowledge-checks/guides "selected"
      // entries (AC1) feed step 3's (select-course-outputs) matching boolean
      // output into generate-course-guides (course-refresh's own index 6),
      // generate-weekly-announcements (index 12), and
      // generate-knowledge-checks (index 13) - each treats deselected as "do
      // no work, pass files through unchanged" (see each step's own file),
      // so none of them, nor the cartridge/zip that read past them, are ever
      // gated off. "11.repo" (Codebase-and-associated-assignments family) and
      // "18.selected"/"18.includeGithub" (Start-Here family) are new for
      // those two families - see each entry's own comment below.
      type: "include-workflow",
      bindings: {},
      include: {
        workflowId: "course-refresh",
        skipSteps: [0, 1, 3],
        bindOverrides: {
          "4.courseKind": { source: "step", stepIndex: 1, outputKey: "courseKind" },
          "5.courseKind": { source: "step", stepIndex: 1, outputKey: "courseKind" },
          "6.courseKind": { source: "step", stepIndex: 1, outputKey: "courseKind" },
          // F2 fix: lms-rubric (source index 8) gained its own "courseKind"
          // binding (course-setup.ts's COURSE_REFRESH) - same courseKind-
          // derivation reasoning as 4/5/6 above, so an applied course built
          // through Course Build gets an applied-flavored rubric instead of
          // resolveCourseKind's own "unbound defaults to coding" fallback.
          "8.courseKind": { source: "step", stepIndex: 1, outputKey: "courseKind" },
          "13.courseKind": { source: "step", stepIndex: 1, outputKey: "courseKind" },
          // generate-weekly-significance/generate-instructor-notes (new
          // output families, course-refresh source indices 14/15): same
          // courseKind-derivation reasoning as 4/5/6/13 above.
          "14.courseKind": { source: "step", stepIndex: 1, outputKey: "courseKind" },
          "15.courseKind": { source: "step", stepIndex: 1, outputKey: "courseKind" },
          "6.selected": { source: "step", stepIndex: 3, outputKey: "selectedGuides" },
          "12.selected": { source: "step", stepIndex: 3, outputKey: "selectedAnnouncements" },
          "13.selected": { source: "step", stepIndex: 3, outputKey: "selectedKnowledgeChecks" },
          "14.selected": { source: "step", stepIndex: 3, outputKey: "selectedSignificance" },
          "15.selected": { source: "step", stepIndex: 3, outputKey: "selectedInstructorNotes" },
          // "Codebase and associated assignments" family: lms-assignments
          // (course-refresh's own source index 11) reads its "repo" input
          // from step 0 by default (remapped to literal "" below via
          // "0.repo", since this preset skips step 0) - this OVERRIDE feeds
          // it COURSE_BUILD's own step 8 (resolve-codebase-repo) instead, so
          // its EXISTING repo-driven grounding ("Before you start, read the
          // README for this module in the course codebase...", steps.
          // assignments-creation.ts) actually fires whenever this family
          // resolved a repository. Blank ("" - deselected, or no codebase
          // source) is byte-identical to today's hard-coded "0.repo" remap.
          "11.repo": { source: "step", stepIndex: 8, outputKey: "repo" },
          "4.topic": { source: "literal", value: "" },
          "4.week": { source: "literal", value: "" },
          "4.pointsPossible": { source: "literal", value: "" },
          "4.postToCanvas": { source: "literal", value: "" },
          "5.topic": { source: "literal", value: "" },
          "5.week": { source: "literal", value: "" },
          "5.pointsPossible": { source: "literal", value: "" },
          "5.postToCanvas": { source: "literal", value: "" },
          "5.groundInAssignment": { source: "literal", value: "1" },
          // Indices 18/19/20 (were 16/17/18): the two new per-week output-
          // family steps (generate-weekly-significance, generate-instructor-
          // notes) were spliced into course-refresh right after generate-
          // knowledge-checks (index 13), shifting fetch-deliverable-images
          // and everything after it right by two - see that preset's own
          // comment at the fetch-deliverable-images entry.
          //
          // Start-Here family: "18.selected" gates the WHOLE starter-
          // materials seeding (course-refresh's nested include, absorbing
          // starter-materials' own single "starter-materials" step) on step
          // 3's "selectedStartHere" boolean - unlike the OTHER "selected"
          // overrides above, this targets an input steps.course-setup.
          // materials.ts's "starter-materials" step gained specifically for
          // this feature (previously this step ran unconditionally in every
          // course-setup preset). "18.includeGithub" now derives the GitHub
          // sign-up + username-submission assignment from step 1's own
          // "isCodebase" output (SAME condition as the codebase family
          // above, but NOT gated on that family's own selection - an
          // instructor can want the Start Here module without also wanting
          // the codebase family, or vice versa) instead of the hard-coded
          // "" every OTHER course-setup preset still pins (GitHub sign-up
          // stays off there, unaffected).
          "18.selected": { source: "step", stepIndex: 3, outputKey: "selectedStartHere" },
          "18.includeGithub": { source: "step", stepIndex: 1, outputKey: "isCodebase" },
          "19.regenerate": { source: "literal", value: "" },
          "20.instructor": { source: "literal", value: "" },
          "20.instructorFileAs": { source: "literal", value: "" },
          "20.contactMinutes": { source: "literal", value: "" },
          "20.readingRate": { source: "literal", value: "" },
          "20.pagesPerChapter": { source: "literal", value: "" },
          "20.classSessionMinutes": { source: "literal", value: "" },
        },
        remap: {
          "0.repo": { source: "literal", value: "" },
          "0.course": { source: "step", stepIndex: 0, outputKey: "course" },
          "0.startDate": { source: "step", stepIndex: 0, outputKey: "startDate" },
          "0.description": { source: "step", stepIndex: 0, outputKey: "description" },
          // Deliberately step 1 (course-schedule-from-source's own FULL
          // schedule/weeks), NOT step 2's narrowed output - every course-
          // refresh step reached through this remap (the schedule CSV, the
          // grading rubric, the LMS module count, the course guides) is
          // course-wide and must see the whole course regardless of this
          // run's module selection (AC3).
          "1.schedule": { source: "step", stepIndex: 1, outputKey: "schedule" },
          "1.courseTitle": { source: "step", stepIndex: 1, outputKey: "courseTitle" },
          "1.weeks": { source: "step", stepIndex: 1, outputKey: "weeks" },
          // Reads this preset's own step 7 (generate-weekly-current-events),
          // the tail of the local files mini-chain that starts at step 5
          // (lecture-materials-from-schedule, was course-refresh's own step
          // 3 before the two scope-selector steps were inserted) and runs
          // through step 6 (generate-weekly-qa) and step 7 in turn - so
          // course-refresh's own internal chain (guides, announcements,
          // knowledge checks, significance, instructor notes, ...), and
          // ultimately the Common Cartridge export and the zip, all see the
          // anticipated Q&A and current-events documents too, not just
          // step 5's own lecture materials.
          "3.files": { source: "step", stepIndex: 7, outputKey: "files" },
        },
      },
    },
    {
      type: "integrate-source-into-lms",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        sourceMaterial: { source: "runtime", fieldKey: "sourceMaterial" },
        sourceUrl: { source: "runtime", fieldKey: "sourceUrl" },
      },
    },
    {
      // Appended here rather than to course-refresh, matching
      // NO_CODE_KICKOFF: it runs after the course-refresh include so the
      // LMS course and its modules already exist. Blank template is a
      // no-op, so a run that does not want a populated course simply leaves
      // the picker empty.
      //
      // Defect fix: projectMode/projectDescription used to be pinned to
      // literal "" here with no comment explaining why (unlike
      // COURSE_KICKOFF's and NO_CODE_KICKOFF's own copies of this step in
      // course-setup.ts, which pin the same literal "" WITH a comment: "the
      // step resolves the project from the tile, which define-course-project
      // has already written by this point" - a deliberate choice for those
      // two presets, since they never let the instructor skip that
      // resolution). That deliberate-elsewhere reasoning does not make the
      // blank binding here deliberate too - nothing in COURSE_BUILD ever
      // bound these two inputs to anything, so the run form could never ask
      // for them and the step's own explicit-override branch (see
      // steps.class-session-populate.ts's own precedence comment: "the
      // template's own setting < the course's persisted project < an
      // explicit run override") was unreachable through this preset. Now
      // bound to their own runtime fields - "classSessionProjectMode"/
      // "classSessionProjectDescription", not reusing "courseProject" (the
      // define-course-project seed above), because they are a genuinely
      // different value: courseProject seeds/reuses the PERSISTED,
      // course-long project (step 4), while these two are a PER-RUN
      // override of what THIS populate run does with whatever project
      // (course-long or none) is in play - most concretely, they are the
      // only way to turn the project OFF for one run ("none") or force it
      // on with a different description ("course-long" + a typed
      // description) even when the tile already has a persisted project,
      // which the auto-promotion in steps.class-session-populate.ts would
      // otherwise apply unconditionally. Neither input's type ("text")
      // participates in the workflow-scope family system (scopeFamilyForType,
      // types.ts, returns null for "text"/"longtext"), so scopeCoversType can
      // never swallow them - no scope-inheritance handling is needed here,
      // and collectRuntimeFields will surface both on the run form exactly
      // like any other runtime-bound optional field.
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
      // Appended as the new LAST step (index 13), deliberately - the highest-
      // risk part of inserting a step into COURSE_BUILD is that every LATER
      // bindOverrides stepIndex shifts, so adding this one strictly after
      // everything else (nothing in this preset reads past index 12 today)
      // means NO existing index anywhere in this file needed to change.
      // Independent of the rest of the chain: it touches no `files`
      // accumulator (no output here feeds anything downstream) and reads
      // step 1's schedule directly.
      //
      // SCOPE (decision already made, HANDOFF.md Q2): sweeps EVERY week of
      // the course, not just the modules select-course-modules (step 2)
      // narrowed this run to - bound to step 1's own FULL, unnarrowed
      // schedule output, the SAME course-wide binding define-course-project
      // (step 4) and the course-refresh include's "1.schedule" remap already
      // use, for the identical reason: a visualizer coverage audit describes
      // the WHOLE course, not just what this run happened to (re)generate.
      //
      // Dispatch (opening a Copilot task for the gaps found) is a supervised,
      // outward-facing side effect - bound to its own runtime field, off
      // unless an instructor explicitly turns it on for a given run (never a
      // literal "1" here), matching steps.visualizer.ts's own default-off
      // input and headless.ts's CONDITIONALLY_HEADLESS_SAFE entry for this
      // step type.
      type: "audit-visualizer-coverage",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        minutes: { source: "literal", value: "50" },
        maxGaps: { source: "literal", value: "20" },
        dispatch: { source: "runtime", fieldKey: "dispatchVisualizerGaps" },
      },
    },
  ],
};
