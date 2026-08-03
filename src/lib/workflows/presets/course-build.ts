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
// "courseKind" output. Every step below that consumes courseKind (4, 5, and
// the course-refresh include's own 4/5/6/13 bindOverrides) binds to THAT
// output instead of a literal, so a codebase- or tile-repo-sourced run gets
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
// knowledge checks - blank = every output). Both are pure narrowing:
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
//    below, and course-refresh's generate-course-guides/generate-weekly-
//    announcements/generate-knowledge-checks via three new bindOverrides
//    entries - "6.selected"/"12.selected"/"13.selected"). A deselected
//    generator does no work and passes its `files` through unchanged (see
//    each of those steps' own "selected" input) - it never leaves the
//    chain, so blackboard-export and save-zip-to-course (never listed in
//    the selector, never gate-able) always still run and still produce.
//    "Module introductions" have no toggle of their own: they ride as the
//    deck's own opening-slide speaker notes (assembleLectureFiles,
//    registry-helpers.ts), so selectedDecks covers both.
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
    "Pick a course tile and how to build its schedule - a codebase, a typed course description, an uploaded course cartridge (.imscc), an uploaded syllabus document, an existing LMS course, the repository already linked on the selected course tile, or the LMS export already saved on the selected course tile - the run form asks for the tile, which source to use, and the deck template; whichever source is fed in, the tile's description, weeks, tests, LMS course, and start date still drive everything the chosen source itself does not supply. Two more fields make this workflow general-purpose: which modules to (re)generate this run (blank = every module - build the whole course; a number, a list, or a range narrows it to a synchronous course's already-built modules) and which outputs to generate (blank = everything; or pick just assignments, objectives, openers, decks, guides, announcements, and/or knowledge checks). Generates the schedule from that source, defines (or, on a re-run, reuses) the course-long project the whole term builds toward, then - per SELECTED module - that module's assignment first, and grounds the module intro, class opener, deck, and any test in it, so every artifact serves the project AND the assignment instead of being generated independently (the class opener generates as part of this same step, sequenced before that module's deck) - then runs everything Course Refresh does (dynamically: changes to Course Refresh apply here automatically), skipping only the repository-dependent steps, (re)generating the course's syllabus from its Syllabus template column (always describing the WHOLE course, regardless of the module selection), generating the Castletop credit-hour workload workbook onto the course tile's Castletop column and the Files tab, and bundling everything the run produced into one zip that downloads and saves to the course tile, before the final two steps integrate the source material into the LMS and populate it from the class session template - so any pages or assignments those final steps create are not reflected in the workbook or the zip. The terminal Common Cartridge export and zip always run, no matter which modules or outputs were selected.",
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
      // skipSteps/remap, and every bindOverride EXCEPT the four courseKind
      // entries and the three new "selected" entries below, are byte-for-
      // byte the same as NO_CODE_KICKOFF's own course-refresh include - see
      // that block's comments (course-setup.ts) for the reasoning behind
      // each entry. The four courseKind entries (4/5/6/13) are a defect fix:
      // they used to pin NO_CODE_KICKOFF's literal "applied", which forced a
      // codebase-sourced run's optional assignment/test templates, course
      // guides, and knowledge checks through the no-code contract too. They
      // now derive from step 1's own "courseKind" output instead - see step
      // 5's binding comment above for the full reasoning, which applies
      // identically here. The three "selected" entries (AC1) feed step 3's
      // (select-course-outputs) matching boolean output into
      // generate-course-guides (course-refresh's own index 6),
      // generate-weekly-announcements (index 12), and
      // generate-knowledge-checks (index 13) - each treats deselected as "do
      // no work, pass files through unchanged" (see each step's own file),
      // so none of them, nor the cartridge/zip that read past them, are ever
      // gated off.
      type: "include-workflow",
      bindings: {},
      include: {
        workflowId: "course-refresh",
        skipSteps: [0, 1, 3],
        bindOverrides: {
          "4.courseKind": { source: "step", stepIndex: 1, outputKey: "courseKind" },
          "5.courseKind": { source: "step", stepIndex: 1, outputKey: "courseKind" },
          "6.courseKind": { source: "step", stepIndex: 1, outputKey: "courseKind" },
          "13.courseKind": { source: "step", stepIndex: 1, outputKey: "courseKind" },
          "6.selected": { source: "step", stepIndex: 3, outputKey: "selectedGuides" },
          "12.selected": { source: "step", stepIndex: 3, outputKey: "selectedAnnouncements" },
          "13.selected": { source: "step", stepIndex: 3, outputKey: "selectedKnowledgeChecks" },
          "4.topic": { source: "literal", value: "" },
          "4.week": { source: "literal", value: "" },
          "4.pointsPossible": { source: "literal", value: "" },
          "4.postToCanvas": { source: "literal", value: "" },
          "5.topic": { source: "literal", value: "" },
          "5.week": { source: "literal", value: "" },
          "5.pointsPossible": { source: "literal", value: "" },
          "5.postToCanvas": { source: "literal", value: "" },
          "5.groundInAssignment": { source: "literal", value: "1" },
          // Indices 16/17/18 (not 15/16/17): the Unsplash deliverable-images
          // step (course-setup.ts) was inserted into course-refresh right
          // after generate-knowledge-checks (index 13), shifting
          // blackboard-export and everything after it right by one - see that
          // preset's own comment at the fetch-deliverable-images entry.
          "16.includeGithub": { source: "literal", value: "" },
          "17.regenerate": { source: "literal", value: "" },
          "18.instructor": { source: "literal", value: "" },
          "18.instructorFileAs": { source: "literal", value: "" },
          "18.contactMinutes": { source: "literal", value: "" },
          "18.readingRate": { source: "literal", value: "" },
          "18.pagesPerChapter": { source: "literal", value: "" },
          "18.classSessionMinutes": { source: "literal", value: "" },
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
          // lecture-materials-from-schedule is now this preset's own step 5
          // (was 3, before the two scope-selector steps were inserted).
          "3.files": { source: "step", stepIndex: 5, outputKey: "files" },
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
      type: "populate-lms-from-class-template",
      bindings: {
        template: { source: "runtime", fieldKey: "classSessionTemplate" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        fromWeek: { source: "literal", value: "1" },
        toWeek: { source: "literal", value: "" },
        projectMode: { source: "literal", value: "" },
        projectDescription: { source: "literal", value: "" },
        activitySource: { source: "literal", value: "template" },
        setupBurden: { source: "literal", value: "template" },
        postToCanvas: { source: "runtime", fieldKey: "classSessionPostToCanvas" },
      },
    },
  ],
};
