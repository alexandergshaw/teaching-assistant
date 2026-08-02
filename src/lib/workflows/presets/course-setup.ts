import type { WorkflowDef } from "@/lib/workflows/types";

export const COURSE_KICKOFF: WorkflowDef = {
  id: "course-kickoff",
  preset: true,
  category: "course-setup",
  name: "Course Kickoff",
  description:
    "Pick a course tile - its description, weeks, tests, LMS course, and start date drive everything; the form asks only for the tile, the template repository, and the new repository's name. Generates the schedule, creates the class repo from the template, writes assignment READMEs - then runs everything Course Refresh does (dynamically: changes to Course Refresh apply here automatically), including (re)generating the course's syllabus from its Syllabus template column, generating the Castletop credit-hour workload workbook onto the course tile's Castletop column and the Files tab, and bundling everything the run produced into one zip that downloads and saves to the course tile.",
  steps: [
    {
      type: "load-course-tile",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        allowMissingRepo: { source: "literal", value: "1" },
      },
    },
    {
      type: "generate-schedule",
      bindings: {
        description: { source: "step", stepIndex: 0, outputKey: "description" },
        weeks: { source: "step", stepIndex: 0, outputKey: "weeks" },
        tests: { source: "step", stepIndex: 0, outputKey: "tests" },
        context: { source: "runtime", fieldKey: "context" },
        sources: { source: "runtime", fieldKey: "sources" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
      },
    },
    {
      type: "repo-from-template",
      bindings: {
        templateRepo: { source: "runtime", fieldKey: "templateRepo" },
        newRepoName: { source: "runtime", fieldKey: "newRepoName" },
      },
    },
    {
      type: "fill-readmes",
      bindings: {
        repo: { source: "step", stepIndex: 2, outputKey: "repo" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        description: { source: "step", stepIndex: 0, outputKey: "description" },
        context: { source: "runtime", fieldKey: "context" },
      },
    },
    {
      // The SPINE of a project-based course, and the reason it runs this
      // early: every generator downstream reads the project off the tile and
      // asks for THAT WEEK'S milestone. Blank leaves an existing project
      // alone and a course with none simply is not project-based.
      type: "define-course-project",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        courseKind: { source: "literal", value: "coding" },
        definition: { source: "runtime", fieldKey: "courseProject" },
        regenerate: { source: "literal", value: "" },
      },
    },
    {
      type: "include-workflow",
      bindings: {},
      include: {
        workflowId: "course-refresh",
        skipSteps: [0, 1],
        bindOverrides: {
          // lecture-zip (source index 3): AC7 fix gave this step its own
          // courseKind input, only consulted on its repoless branch. This
          // kickoff's lecture-zip always has a repo (remapped below), so the
          // value is inert either way - but leaving it bound to the runtime
          // field would reintroduce a "Course type" question this codebase
          // kickoff never asked, undoing why 4/5/6/13 below are pinned too.
          "3.courseKind": { source: "literal", value: "coding" },
          "4.courseKind": { source: "literal", value: "coding" },
          "5.courseKind": { source: "literal", value: "coding" },
          // generate-course-guides (Group Q, now at source index 6): a
          // codebase course is always "coding" - matches how 4/5 above are
          // pinned - so its own run form never asks (course-refresh's OWN
          // binding surfaces "courseKind" as a runtime field, matching 4/5).
          "6.courseKind": { source: "literal", value: "coding" },
          // generate-knowledge-checks (Y2, now at source index 13): same
          // reasoning as generate-course-guides' "6.courseKind" above - a
          // codebase course is always "coding", so its own run form never
          // asks.
          "13.courseKind": { source: "literal", value: "coding" },
          // The repo-driven opener now lives inside lecture-zip for this
          // preset, so there is no separate opener field left to hide here.
          // The template-test grounding flag still surfaces on a standalone
          // Course Refresh, so this kickoff keeps it blank explicitly.
          "5.groundInAssignment": { source: "literal", value: "" },
          // Topic, week and points all derive from the tile and the template;
          // asking for them twice (once per template step, undifferentiated
          // on the form) was the single worst thing about this run form.
          "4.topic": { source: "literal", value: "" },
          "4.week": { source: "literal", value: "" },
          "4.pointsPossible": { source: "literal", value: "" },
          "4.postToCanvas": { source: "literal", value: "" },
          "5.topic": { source: "literal", value: "" },
          "5.week": { source: "literal", value: "" },
          "5.pointsPossible": { source: "literal", value: "" },
          "5.postToCanvas": { source: "literal", value: "" },
          // starter-materials already generated the syllabus one step earlier,
          // and a GitHub sign-up assignment has no place in a kickoff.
          // Indices 16/17/18 after removing Course Refresh's standalone
          // opener step (everything after lecture-zip shifts left by one) and
          // then the Unsplash deliverable-images step shifting everything
          // from (what was) blackboard-export onward right by one again.
          "16.includeGithub": { source: "literal", value: "" },
          "17.regenerate": { source: "literal", value: "" },
          // Castletop defaults are applied by castletop-plan.ts already; the
          // instructor name is constant per user and the step reads none of it.
          "18.instructor": { source: "literal", value: "" },
          "18.instructorFileAs": { source: "literal", value: "" },
          "18.contactMinutes": { source: "literal", value: "" },
          "18.readingRate": { source: "literal", value: "" },
          "18.pagesPerChapter": { source: "literal", value: "" },
          "18.classSessionMinutes": { source: "literal", value: "" },
        },
        remap: {
          "0.repo": { source: "step", stepIndex: 2, outputKey: "repo" },
          "0.course": { source: "step", stepIndex: 0, outputKey: "course" },
          "0.startDate": { source: "step", stepIndex: 0, outputKey: "startDate" },
          "0.description": { source: "step", stepIndex: 0, outputKey: "description" },
          "1.schedule": { source: "step", stepIndex: 1, outputKey: "schedule" },
          "1.courseTitle": { source: "step", stepIndex: 1, outputKey: "courseTitle" },
          "1.weeks": { source: "step", stepIndex: 1, outputKey: "weeks" },
        },
      },
    },
    {
      // Appended to each KICKOFF rather than to course-refresh, because the
      // two kickoffs need DIFFERENT templates: the codebase course's class
      // template asks for a GitHub URL submission and the no-code course's
      // does not. Putting it in the shared refresh would force one variant on
      // both. It runs after the course-refresh include so the LMS course and
      // its modules already exist. Blank template is a no-op, so a kickoff run
      // that does not want a populated course simply leaves the picker empty.
      type: "populate-lms-from-class-template",
      bindings: {
        template: { source: "runtime", fieldKey: "classSessionTemplate" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        // A kickoff always starts at week 1, and the last week falls back to
        // the course's own week count - neither is worth a form field.
        fromWeek: { source: "literal", value: "1" },
        toWeek: { source: "literal", value: "" },
        // Left blank on purpose: the step resolves the project from the tile,
        // which define-course-project has already written by this point.
        projectMode: { source: "literal", value: "" },
        projectDescription: { source: "literal", value: "" },
        activitySource: { source: "literal", value: "template" },
        setupBurden: { source: "literal", value: "template" },
        postToCanvas: { source: "runtime", fieldKey: "classSessionPostToCanvas" },
      },
    },
  ],
};

export const NO_CODE_KICKOFF: WorkflowDef = {
  id: "course-kickoff-no-code",
  preset: true,
  category: "course-setup",
  name: "Course Kickoff (no codebase)",
  description:
    "For courses without a code base (ethical hacking, project management, business, etc.). Pick a course tile - its description, weeks, tests, LMS course, and start date drive everything; the form asks only for the tile and the deck template. Generates the schedule, defines (or, on a re-run, reuses) the course-long project the whole term builds toward, then - per module - that module's assignment first, and grounds the module intro, class opener, deck, and any test in it, so every artifact serves the project AND the assignment instead of being generated independently (the class opener now generates as part of this same step, sequenced before that module's deck) - then runs everything Course Refresh does (dynamically: changes to Course Refresh apply here automatically), skipping only the repository-dependent steps, (re)generating the course's syllabus from its Syllabus template column, generating the Castletop credit-hour workload workbook onto the course tile's Castletop column and the Files tab, and bundling everything the run produced into one zip that downloads and saves to the course tile, before the final two steps integrate the source material into the LMS and populate it from the class session template - so any pages or assignments those final steps create are not reflected in the workbook or the zip.",
  steps: [
    {
      type: "load-course-tile",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        allowMissingRepo: { source: "literal", value: "1" },
      },
    },
    {
      type: "generate-schedule",
      bindings: {
        description: { source: "step", stepIndex: 0, outputKey: "description" },
        weeks: { source: "step", stepIndex: 0, outputKey: "weeks" },
        tests: { source: "step", stepIndex: 0, outputKey: "tests" },
        context: { source: "runtime", fieldKey: "context" },
        sourceMaterial: { source: "runtime", fieldKey: "sourceMaterial" },
        sources: { source: "runtime", fieldKey: "sources" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
      },
    },
    {
      // T1 (real defect, not cosmetic): moved BEFORE lecture-materials-from-
      // schedule (was AFTER it) - that step generates EVERY week's
      // assignment, so a fresh course (autoDefine's own target) used to get
      // every assignment with NO project/milestone. SPINE of a project-based
      // course: downstream generators read the project off the tile for
      // THAT WEEK'S milestone. Blank never touches an EXISTING project; a
      // typed description always wins.
      type: "define-course-project",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        courseKind: { source: "literal", value: "applied" },
        definition: { source: "runtime", fieldKey: "courseProject" },
        regenerate: { source: "literal", value: "" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        autoDefine: { source: "literal", value: "1" },
      },
    },
    {
      // Per module, this step generates the assignment FIRST - the spine of
      // a module - then grounds the intro, opener, and deck in it
      // (buildScheduleWeekPlan). Runs AFTER define-course-project (T1), so
      // the tile already carries a project when it reads one via hubCourse
      // (no stepIndex binding needed for that).
      //
      // T2: the opener now generates INSIDE this step (sequenceOpener-
      // BeforeDeck, on because courseKind is "applied"), before the deck and
      // grounded in the assignment; the deck is then grounded in the
      // assignment AND the opener.
      type: "lecture-materials-from-schedule",
      bindings: {
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        minutes: { source: "literal", value: "50" },
        description: { source: "step", stepIndex: 0, outputKey: "description" },
        context: { source: "runtime", fieldKey: "context" },
        // Bound to generate-schedule's resolvedSourceMaterial output (not the
        // raw runtime field) so a derived TOC (see shouldDeriveToc /
        // deriveTocFromSource) grounds this step's aligned prompt branch too,
        // with no second search call: that output already falls back to the
        // original sourceMaterial text unchanged for the pasted-TOC and
        // name-only tiers, so this step's own aligned/name-only branch (the
        // same parseTocChapters test) behaves exactly as it did before.
        sourceMaterial: { source: "step", stepIndex: 1, outputKey: "resolvedSourceMaterial" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        includeInstructions: { source: "literal", value: "1" },
        template: { source: "runtime", fieldKey: "deckTemplate" },
        sources: { source: "runtime", fieldKey: "sources" },
        // This kickoff is explicitly for courses with NO codebase, so nothing
        // it generates may contain code - slides, speaker notes, or assignment
        // instructions.
        courseKind: { source: "literal", value: "applied" },
      },
    },
    {
      type: "include-workflow",
      bindings: {},
      include: {
        workflowId: "course-refresh",
        // The shared refresh no longer has a standalone opener step - its
        // repo-driven opener now lives inside lecture-zip - so this kickoff
        // skips only the source steps it already owns itself.
        skipSteps: [0, 1, 3],
        bindOverrides: {
          // Nothing this run generates may involve code.
          "4.courseKind": { source: "literal", value: "applied" },
          "5.courseKind": { source: "literal", value: "applied" },
          // generate-course-guides (Group Q, now at source index 6): this
          // kickoff never involves code, matching how 4/5 above are pinned -
          // so its own run form never asks (course-refresh's OWN binding
          // surfaces "courseKind" as a runtime field, matching 4/5).
          "6.courseKind": { source: "literal", value: "applied" },
          // generate-knowledge-checks (Y2, now at source index 13): same
          // reasoning as generate-course-guides' "6.courseKind" above - this
          // kickoff never involves code, so its own run form never asks.
          "13.courseKind": { source: "literal", value: "applied" },
          // Topic, week and points all derive from the tile and the template;
          // asking for them twice (once per template step, undifferentiated
          // on the form) was the single worst thing about this run form.
          "4.topic": { source: "literal", value: "" },
          "4.week": { source: "literal", value: "" },
          "4.pointsPossible": { source: "literal", value: "" },
          "4.postToCanvas": { source: "literal", value: "" },
          "5.topic": { source: "literal", value: "" },
          "5.week": { source: "literal", value: "" },
          "5.pointsPossible": { source: "literal", value: "" },
          "5.postToCanvas": { source: "literal", value: "" },
          // The assignment is this module's spine (lecture-materials-from-
          // schedule above generates it FIRST). This grounds the ONE
          // downstream generic step course-refresh still owns for this path -
          // the optional test template (index 5) - in that week's already-
          // generated assignment (by week number, via "files"/"3.files"
          // below). Opt-in, bound HERE only: COURSE_KICKOFF never sets this.
          "5.groundInAssignment": { source: "literal", value: "1" },
          // starter-materials already generated the syllabus one step earlier,
          // and a GitHub sign-up assignment has no place in a kickoff.
          // Indices 16/17/18 after removing Course Refresh's standalone
          // opener step (everything after lecture-zip shifts left by one) and
          // then the Unsplash deliverable-images step shifting everything
          // from (what was) blackboard-export onward right by one again.
          "16.includeGithub": { source: "literal", value: "" },
          "17.regenerate": { source: "literal", value: "" },
          // Castletop defaults are applied by castletop-plan.ts already; the
          // instructor name is constant per user and the step reads none of it.
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
          "1.schedule": { source: "step", stepIndex: 1, outputKey: "schedule" },
          "1.courseTitle": { source: "step", stepIndex: 1, outputKey: "courseTitle" },
          "1.weeks": { source: "step", stepIndex: 1, outputKey: "weeks" },
          // lecture-materials-from-schedule is this kickoff's own step 3, and
          // it already carries the opener in-plan too, so the shared refresh's
          // assignment step reads that same accumulated files output.
          "3.files": { source: "step", stepIndex: 3, outputKey: "files" },
        },
      },
    },
    {
      // Runs AFTER the course-refresh include above, and that include now
      // ends with save-zip-to-course (docs/REGRESSION.md 155), with
      // castletop-workbook second-to-last inside it - so both the
      // Castletop workbook and the terminal zip are already built by the
      // time this step runs. Consequence: any pages or assignments this
      // step adds to the LMS are not yet present when the workbook or the
      // zip was built, so they are reflected in neither. Not reordered on
      // purpose: moving this step would shift the include's remap
      // stepIndex references above, which is out of scope for this change.
      type: "integrate-source-into-lms",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        sourceMaterial: { source: "runtime", fieldKey: "sourceMaterial" },
        sourceUrl: { source: "runtime", fieldKey: "sourceUrl" },
      },
    },
    {
      // Appended to each KICKOFF rather than to course-refresh, because the
      // two kickoffs need DIFFERENT templates: the codebase course's class
      // template asks for a GitHub URL submission and the no-code course's
      // does not. Putting it in the shared refresh would force one variant on
      // both. It runs after the course-refresh include so the LMS course and
      // its modules already exist. Blank template is a no-op, so a kickoff run
      // that does not want a populated course simply leaves the picker empty.
      type: "populate-lms-from-class-template",
      bindings: {
        template: { source: "runtime", fieldKey: "classSessionTemplate" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        // A kickoff always starts at week 1, and the last week falls back to
        // the course's own week count - neither is worth a form field.
        fromWeek: { source: "literal", value: "1" },
        toWeek: { source: "literal", value: "" },
        // Left blank on purpose: the step resolves the project from the tile,
        // which define-course-project has already written by this point.
        projectMode: { source: "literal", value: "" },
        projectDescription: { source: "literal", value: "" },
        activitySource: { source: "literal", value: "template" },
        setupBurden: { source: "literal", value: "template" },
        postToCanvas: { source: "runtime", fieldKey: "classSessionPostToCanvas" },
      },
    },
  ],
};

export const COURSE_REFRESH: WorkflowDef = {
  id: "course-refresh",
  preset: true,
  category: "course-setup",
  name: "Course Refresh",
  description:
    "Pick a course tile and everything else comes from it - the linked repository, LMS course, start date, and LMS - with warnings in the first step's results when a piece is missing. A tile without a linked repository pauses with an alert and, on continue, the schedule falls back to the tile's saved Schedule of Topics (CSV) or its topics; repo-driven materials steps are skipped in that case. The LMS course's existing modules are deleted first, then a grading rubric is generated and saved to the LMS course, onto the course tile, and as a document in the LMS export's Start Here module. Weekly deliverable assignments are created with text-entry submission and end-of-week deadlines; each module's assignment carries its generated instructions. An LMS-ready Common Cartridge export downloads when the tile's LMS is set (a tile without an LMS course, or without an LMS set, skips every LMS-facing step). The Starter Materials workflow then runs against the tile's LMS course (dynamic - edits to it apply here); the run then (re)generates the course's syllabus from its Syllabus template column. If an assignment template or test template is chosen on the run form, it also generates that assignment (handout, rubric, and an UNPUBLISHED Canvas draft when asked) and that test (test document, answer key, study guide, and an UNPUBLISHED Canvas quiz draft when asked); leaving either picker blank skips it. The run generates the Castletop credit-hour workload workbook for the course, saving it onto the course tile's Castletop column and the Files tab, then finishes by bundling EVERYTHING the run produced - every week's materials, the grading rubric, and the schedule CSV, organized into Week NN / Course-Wide folders - into one zip that downloads and saves to the course tile's materials list.",
  steps: [
    {
      type: "load-course-tile",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        confirmMissingRepo: { source: "literal", value: "1" },
      },
    },
    {
      type: "schedule-from-repo",
      bindings: {
        repo: { source: "step", stepIndex: 0, outputKey: "repo" },
        description: { source: "step", stepIndex: 0, outputKey: "description" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
      },
    },
    {
      type: "save-csv-to-course",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        courseTitle: { source: "step", stepIndex: 1, outputKey: "courseTitle" },
      },
    },
    {
      type: "lecture-zip",
      bindings: {
        repo: { source: "step", stepIndex: 0, outputKey: "repo" },
        minutes: { source: "literal", value: "50" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        includeInstructions: { source: "literal", value: "1" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        template: { source: "runtime", fieldKey: "deckTemplate" },
        sources: { source: "runtime", fieldKey: "sources" },
        moduleId: { source: "runtime", fieldKey: "moduleId" },
        // AC7 fix (docs/REGRESSION.md entry 80): the SAME "courseKind"
        // runtime field the template/guides/knowledge-check steps below
        // already surface - asked once on a standalone Course Refresh, and
        // now also reaches this step's own repoless branch (its REPO branch
        // ignores it; a repo-driven deck is always coding by construction).
        // Without this, a no-code course tile with no linked repository fell
        // straight through to that branch's "coding" default.
        courseKind: { source: "runtime", fieldKey: "courseKind" },
      },
    },
    {
      // Appended to COURSE_REFRESH only - both kickoffs end by including
      // course-refresh, so adding it to all three would run it twice in each
      // kickoff. Its template input is optional and blank is a no-op, so a
      // refresh run that does not want an assignment simply leaves the picker
      // empty rather than being forced to choose one.
      type: "generate-assignment-from-template",
      bindings: {
        template: { source: "runtime", fieldKey: "assignmentTemplate" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        // Asked once on a standalone Course Refresh; both kickoffs
        // override it, so neither of them asks.
        courseKind: { source: "runtime", fieldKey: "courseKind" },
        files: { source: "step", stepIndex: 3, outputKey: "files" },
        topic: { source: "runtime", fieldKey: "assignmentTopic" },
        week: { source: "runtime", fieldKey: "assignmentWeek" },
        postToCanvas: { source: "runtime", fieldKey: "assignmentPostToCanvas" },
        pointsPossible: { source: "runtime", fieldKey: "assignmentPoints" },
      },
    },
    {
      // Same placement rationale as the assignment step above.
      type: "generate-test-from-template",
      bindings: {
        template: { source: "runtime", fieldKey: "testTemplate" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        // Asked once on a standalone Course Refresh; both kickoffs
        // override it, so neither of them asks.
        courseKind: { source: "runtime", fieldKey: "courseKind" },
        files: { source: "step", stepIndex: 4, outputKey: "files" },
        topic: { source: "runtime", fieldKey: "testTopic" },
        week: { source: "runtime", fieldKey: "testWeek" },
        // Asked once on a standalone Course Refresh (matching the topic/week
        // fields above); the no-code kickoff overrides it to forced "1" so it
        // never asks (course-setup.ts's NO_CODE_KICKOFF bindOverrides
        // "5.groundInAssignment") - the codebase kickoff leaves it unbound,
        // which the step treats as off, so its tests are unaffected.
        groundInAssignment: { source: "runtime", fieldKey: "testGroundInAssignment" },
        // Tests generated by a kickoff/refresh run are HANDS-ON by default:
        // the point of a test in this flow is to walk the student back through
        // the motions their own project has already required of them, not to
        // ask them to describe it.
        mode: { source: "literal", value: "project-based" },
        postToCanvas: { source: "runtime", fieldKey: "testPostToCanvas" },
        pointsPossible: { source: "runtime", fieldKey: "testPoints" },
      },
    },
    {
      // Group Q (course-wide guide documents): added ONCE here so all three
      // course-setup workflows get it via include-workflow below. Placed
      // immediately before lms-wipe so the guides reach blackboard-export
      // and save-zip-to-course (their "files" bindings, further down, now
      // read past this step); "files" follows the same in+out convention
      // generate-class-openers uses. lms-wipe (right after) preserves a
      // "Course Information" module by exact name, so what this step just
      // posted survives that same run's wipe - see lms-wipe's own comment.
      type: "generate-course-guides",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        // Asked once on a standalone Course Refresh (matching the
        // generate-assignment-from-template / generate-test-from-template
        // fields above); both kickoffs override it via bindOverrides
        // "6.courseKind", so neither of them asks.
        courseKind: { source: "runtime", fieldKey: "courseKind" },
        context: { source: "runtime", fieldKey: "context" },
        // Q4: shares the SAME "instructor" runtime field castletop-workbook
        // already surfaces below - a standalone Course Refresh asks once;
        // both kickoffs force castletop's OWN reference blank via their
        // existing bindOverrides ("17.instructor" etc.) but do NOT blank
        // this step's, so the field still surfaces in all three, feeding
        // only the Instructor Contact document in a kickoff run.
        instructor: { source: "runtime", fieldKey: "instructor" },
        files: { source: "step", stepIndex: 5, outputKey: "files" },
        postToLms: { source: "runtime", fieldKey: "guidesPostToLms" },
      },
    },
    {
      type: "lms-wipe",
      bindings: {
        course: { source: "step", stepIndex: 0, outputKey: "course" },
      },
    },
    {
      type: "lms-rubric",
      bindings: {
        course: { source: "step", stepIndex: 0, outputKey: "course" },
        repo: { source: "step", stepIndex: 0, outputKey: "repo" },
        description: { source: "step", stepIndex: 0, outputKey: "description" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        title: { source: "step", stepIndex: 1, outputKey: "courseTitle" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
      },
    },
    {
      type: "lms-modules",
      bindings: {
        course: { source: "step", stepIndex: 0, outputKey: "course" },
        weeks: { source: "step", stepIndex: 1, outputKey: "weeks" },
      },
    },
    {
      type: "lms-populate",
      bindings: {
        course: { source: "step", stepIndex: 0, outputKey: "course" },
        // Deliberately still reads generate-test-from-template's (index 5)
        // files, NOT generate-course-guides' (index 6) - lms-populate clamps
        // weekNumber to at least 1, so a course-wide (weekNumber 0) guide
        // reaching it would be clamped into Module 01 instead of publishing
        // its own page (see generate-course-guides' own AC6 rationale).
        modules: { source: "step", stepIndex: 9, outputKey: "modules" },
        files: { source: "step", stepIndex: 5, outputKey: "files" },
      },
    },
    {
      type: "lms-assignments",
      bindings: {
        course: { source: "step", stepIndex: 0, outputKey: "course" },
        modules: { source: "step", stepIndex: 9, outputKey: "modules" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        repo: { source: "step", stepIndex: 0, outputKey: "repo" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        startDate: { source: "step", stepIndex: 0, outputKey: "startDate" },
        files: { source: "step", stepIndex: 5, outputKey: "files" },
      },
    },
    {
      // Group Q3 (weekly announcements): placed AFTER every module-content
      // step (lms-wipe through lms-assignments) so there is real, already-
      // generated material to ground each announcement in (see steps.weekly-
      // announcements.ts) - and BEFORE blackboard-export/save-zip-to-course
      // so they reach both. The steps after it (starter-materials, syllabus,
      // castletop) don't touch module content, so running later would only
      // push announcements past blackboard-export - deliberate, do not move.
      type: "generate-weekly-announcements",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        // Reads generate-course-guides' (index 6) accumulated output, not
        // generate-test-from-template's (index 5) directly - so the guide
        // documents AND every week's real materials are both in hand for
        // gathering this week's grounding, and so this step's own output
        // extends the SAME chain the guides step started.
        files: { source: "step", stepIndex: 6, outputKey: "files" },
        startDate: { source: "step", stepIndex: 0, outputKey: "startDate" },
        // Shares the same "Context" field generate-course-guides and (in
        // both kickoffs) generate-schedule already surface, so the run form
        // gains no new free-text box for this.
        extraNotes: { source: "runtime", fieldKey: "context" },
        postToLms: { source: "runtime", fieldKey: "announcementsPostToLms" },
      },
    },
    {
      // Y2 (knowledge checks): placed AFTER generate-weekly-announcements so
      // it extends the SAME accumulated "files" chain (the announcements'
      // own comment above explains why nothing after lms-assignments should
      // be skipped past) - and BEFORE blackboard-export/save-zip-to-course so
      // both the document and (when postToLms is on) the Canvas quiz reach
      // the same downstream steps the guides/announcements already do.
      // Grounded via gatherWeekMaterials, the SAME helper generate-weekly-
      // announcements uses (steps.knowledge-checks.ts reuses it directly
      // rather than re-deriving the same grounding text a second way).
      type: "generate-knowledge-checks",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        // Reads generate-weekly-announcements' (index 12) accumulated
        // output, so the guide documents, every week's announcement, AND
        // every week's real materials are all in hand for grounding this
        // week's knowledge check, and this step's own output extends the
        // SAME chain the announcements step continued.
        files: { source: "step", stepIndex: 12, outputKey: "files" },
        // lms-modules (index 9) already computed this run's per-week module
        // ids; reused here (the same way lms-populate/lms-assignments reuse
        // it) so the Canvas quiz - when posted - lands in that week's own
        // module instead of refetching the course's modules a second time.
        modules: { source: "step", stepIndex: 9, outputKey: "modules" },
        // Asked once on a standalone Course Refresh (matching the
        // generate-assignment-from-template / generate-test-from-template /
        // generate-course-guides fields above); both kickoffs override it
        // via bindOverrides "13.courseKind", so neither of them asks.
        courseKind: { source: "runtime", fieldKey: "courseKind" },
        postToLms: { source: "runtime", fieldKey: "knowledgeChecksPostToLms" },
      },
    },
    {
      // Unsplash deliverable images: placed AFTER generate-knowledge-checks
      // so it extends the SAME accumulated "files" chain (same reasoning as
      // the knowledge-checks comment above) - and BEFORE blackboard-export/
      // save-zip-to-course so the images reach both. Inserting a step here
      // shifts every source index after it (blackboard-export and
      // everything through save-zip-to-course) down by one from what they
      // were before this feature - COURSE_KICKOFF's, COURSE_KICKOFF_NO_CODE's,
      // and COURSE_BUILD's own include-workflow bindOverrides were updated to
      // match (see each preset's own comment at those entries).
      type: "fetch-deliverable-images",
      bindings: {
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        // Reads generate-knowledge-checks' (index 13) accumulated output, so
        // every deliverable this run produced (materials, assignments,
        // announcements, knowledge checks) is in hand both for deriving each
        // week's query and for this step's own output to extend the SAME
        // chain generate-knowledge-checks continued.
        files: { source: "step", stepIndex: 13, outputKey: "files" },
      },
    },
    {
      type: "blackboard-export",
      bindings: {
        // Bound to the LATEST files-producing step (fetch-deliverable-images,
        // index 14) rather than generate-knowledge-checks (index 13)
        // directly, so the guide documents, the weekly announcements, the
        // weekly knowledge checks, AND each week's Unsplash image all reach
        // the cartridge's Start Here bucket / their own week's module (see
        // steps.lms-export.ts's Start Here handling for the weekNumber:0
        // guides, and its per-week bucketing for everything else).
        files: { source: "step", stepIndex: 14, outputKey: "files" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        startDate: { source: "step", stepIndex: 0, outputKey: "startDate" },
        rubricFiles: { source: "step", stepIndex: 8, outputKey: "rubricFiles" },
      },
    },
    {
      // Starter Materials runs last against the tile's LMS course. The
      // absorbed step's courses input expects a newline-joined
      // lmsCourseList; step 0's "course" output is a single URL, which is
      // a valid one-item list as-is. Its includeGithub runtime binding
      // passes through untouched, surfacing the "Include GitHub Starter?"
      // checkbox on the Refresh run form.
      type: "include-workflow",
      bindings: {},
      include: {
        workflowId: "starter-materials",
        skipSteps: [],
        remap: {},
        bindOverrides: {
          "0.courses": { source: "step", stepIndex: 0, outputKey: "course" },
        },
      },
    },
    {
      // starter-materials (above) already generates a syllabus from the
      // template when the tile has none - so on a first run this step
      // usually finds one already linked and skips, which is correct. Its
      // value is the `regenerate` path (rebuilding an existing syllabus from
      // its template) and being an explicitly bindable, re-runnable step in
      // its own right, independent of starter-materials.
      type: "generate-syllabus",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        regenerate: { source: "runtime", fieldKey: "regenerateSyllabus" },
      },
    },
    {
      // Castletop: it reads the tile's schedule and, when an LMS is
      // connected, the assignments this workflow just created - including any
      // draft the two template steps above just created - so it must run after
      // module/assignment creation, not before.
      type: "castletop-workbook",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        instructor: { source: "runtime", fieldKey: "instructor" },
        instructorFileAs: { source: "runtime", fieldKey: "instructorFileAs" },
        contactMinutes: { source: "runtime", fieldKey: "contactMinutes" },
        readingRate: { source: "runtime", fieldKey: "readingRate" },
        pagesPerChapter: { source: "runtime", fieldKey: "pagesPerChapter" },
        classSessionMinutes: { source: "runtime", fieldKey: "classSessionMinutes" },
      },
    },
    {
      // Terminal step, moved here from right after generate-test-from-
      // template (docs/REGRESSION.md 155): "literally all artifacts" cannot
      // be satisfied while this step sits BEFORE the rubric/LMS/syllabus/
      // Castletop steps - a binding can only reach an EARLIER step's output,
      // so the zip must run last to bundle everything the run produced.
      // Its `files` binding is the fully accumulated chain (originally step
      // 5, generate-test-from-template's output - lecture-zip's own
      // openers/assignment/test were already being silently dropped by the
      // OLD binding to step 3 here; that was the fix for that - since
      // extended further still, see the Group Q comment just below).
      // rubricFiles (lms-rubric - a step that never throws, see its own
      // file) and schedule (step 1, for the CSV) are added the same safe way.
      // castletop-workbook's workbook and generate-syllabus's document are
      // DELIBERATELY NOT chained in: both CAN throw on real, plausible
      // configuration gaps (no syllabus template set; a Castletop data
      // issue), and any step-to-step binding here would cascade that single
      // failure into losing the ENTIRE zip (all 16 weeks of content, the
      // rubric, the schedule) - a far worse outcome than the instructor
      // fetching those two files from their own already-dedicated locations
      // (the Castletop column/Files tab, and the syllabus library). See
      // AC1/AC2 in docs/REGRESSION.md 155 for the full inventory and
      // rationale.
      //
      // Group Q (course guides + weekly announcements): `files` now reads
      // generate-weekly-announcements' accumulated output rather than
      // generate-test-from-template's (index 5) directly, so the four guide
      // documents and every week's announcement both reach the zip's
      // Course-Wide / Week NN folders - the SAME reasoning that already
      // applies to blackboard-export's binding above. Y2 (knowledge checks)
      // extended the chain one step further still (index 12 -> 13), and the
      // Unsplash deliverable-images step extended it once more (index 13 ->
      // 14), so this now points at fetch-deliverable-images, which itself
      // chains off generate-knowledge-checks.
      type: "save-zip-to-course",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        files: { source: "step", stepIndex: 14, outputKey: "files" },
        rubricFiles: { source: "step", stepIndex: 8, outputKey: "rubricFiles" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
      },
    },
  ],
};
