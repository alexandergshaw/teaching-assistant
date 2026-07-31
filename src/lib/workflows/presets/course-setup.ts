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
          "5.courseKind": { source: "literal", value: "coding" },
          "6.courseKind": { source: "literal", value: "coding" },
          // generate-course-guides (Group Q, added at source index 7): a
          // codebase course is always "coding" - matches how 5/6 above are
          // pinned - so its own run form never asks (course-refresh's OWN
          // binding surfaces "courseKind" as a runtime field, matching 5/6).
          "7.courseKind": { source: "literal", value: "coding" },
          // A codebase course always wants the coding warm-up, so neither
          // kickoff asks - the no-code one pins "applied" instead.
          "4.exerciseKind": { source: "literal", value: "coding" },
          // Both steps' groundInAssignment defaults to off when unbound (see
          // steps.content-lectures.ts / steps.assignments-test-template.ts) -
          // this override changes NOTHING about that behavior. It exists
          // only because course-refresh's OWN binding surfaces the field on
          // its run form (matching the exerciseKind field just above, and
          // testTopic/testWeek below); left unbound HERE, that runtime field
          // would leak onto the codebase kickoff's form even though this
          // request was specifically about the no-code kickoff, which is the
          // only workflow that turns this feature on ("4.groundInAssignment"
          // / "6.groundInAssignment" in NO_CODE_KICKOFF below).
          "4.groundInAssignment": { source: "literal", value: "" },
          "6.groundInAssignment": { source: "literal", value: "" },
          // Topic, week and points all derive from the tile and the template;
          // asking for them twice (once per template step, undifferentiated
          // on the form) was the single worst thing about this run form.
          "5.topic": { source: "literal", value: "" },
          "5.week": { source: "literal", value: "" },
          "5.pointsPossible": { source: "literal", value: "" },
          "5.postToCanvas": { source: "literal", value: "" },
          "6.topic": { source: "literal", value: "" },
          "6.week": { source: "literal", value: "" },
          "6.pointsPossible": { source: "literal", value: "" },
          "6.postToCanvas": { source: "literal", value: "" },
          // starter-materials already generated the syllabus one step earlier,
          // and a GitHub sign-up assignment has no place in a kickoff.
          // Indices 15/16/17 (were 13/14/15 before Group Q inserted two new
          // steps at source indices 7 and 13, shifting everything from 7
          // onward down by one and everything from the original 12 onward
          // down by one more; before Group Q they were 14/15/16 per
          // docs/REGRESSION.md 155 - save-zip-to-course has no bindOverride
          // here, unaffected either way).
          "15.includeGithub": { source: "literal", value: "" },
          "16.regenerate": { source: "literal", value: "" },
          // Castletop defaults are applied by castletop-plan.ts already; the
          // instructor name is constant per user and the step reads none of it.
          "17.instructor": { source: "literal", value: "" },
          "17.instructorFileAs": { source: "literal", value: "" },
          "17.contactMinutes": { source: "literal", value: "" },
          "17.readingRate": { source: "literal", value: "" },
          "17.pagesPerChapter": { source: "literal", value: "" },
          "17.classSessionMinutes": { source: "literal", value: "" },
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
    "For courses without a code base (ethical hacking, project management, business, etc.). Pick a course tile - its description, weeks, tests, LMS course, and start date drive everything; the form asks only for the tile and the deck template. Generates the schedule, then - per module - that module's assignment first, and grounds the module intro, deck, class opener, and any test in it, so every artifact serves the assignment instead of being generated independently - then runs everything Course Refresh does (dynamically: changes to Course Refresh apply here automatically), skipping only the repository-dependent steps, (re)generating the course's syllabus from its Syllabus template column, generating the Castletop credit-hour workload workbook onto the course tile's Castletop column and the Files tab, and bundling everything the run produced into one zip that downloads and saves to the course tile, before the final two steps integrate the source material into the LMS and populate it from the class session template - so any pages or assignments those final steps create are not reflected in the workbook or the zip.",
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
      // Per module, this single step now generates the assignment FIRST -
      // it is the spine of a module, and every other artifact this step (and
      // the two steps this include's bindOverrides ground below) produces
      // exists to prepare students for it - then grounds the module intro and
      // the deck in that assignment's text (buildScheduleWeekPlan,
      // course-planning-grounding.ts; the ordering used to be slides, then
      // intro, then instructions). For an applied course the real
      // professional tool for the week is also decided once here
      // (selectRequiredTools) and shared by the assignment and the deck,
      // rather than the deck choosing it and the assignment following
      // (3f284a9's original direction) - this change is internal to this
      // step; no step-order or binding change was needed for it.
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
      // The SPINE of a project-based course, and the reason it runs this
      // early: every generator downstream reads the project off the tile and
      // asks for THAT WEEK'S milestone. Blank never touches an EXISTING
      // project (routine re-runs must not silently replace one mid-term),
      // but with no-code kickoffs this course starts with no project at all,
      // autoDefine designs one from the generated schedule instead of
      // leaving the course non-project-based - and a typed description
      // always takes precedence over that, even over an existing project,
      // without needing Rebuild.
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
      type: "include-workflow",
      bindings: {},
      include: {
        workflowId: "course-refresh",
        skipSteps: [0, 1, 3],
        bindOverrides: {
          // Nothing this run generates may involve code.
                    "5.courseKind": { source: "literal", value: "applied" },
          "6.courseKind": { source: "literal", value: "applied" },
          // generate-course-guides (Group Q, added at source index 7): this
          // kickoff never involves code, matching how 5/6 above are pinned -
          // so its own run form never asks (course-refresh's OWN binding
          // surfaces "courseKind" as a runtime field, matching 5/6).
          "7.courseKind": { source: "literal", value: "applied" },
          // This kickoff is explicitly for courses with NO codebase, so the
          // class opener's warm-up must be a practical exercise producing a
          // written artifact - never a programming task. A Project Management
          // course shipped 16 openers that were bare Python snippets.
          "4.exerciseKind": { source: "literal", value: "applied" },
          // The assignment is this module's spine (buildScheduleWeekPlan,
          // step 2's lecture-materials-from-schedule, generates it FIRST and
          // grounds the intro/deck in it - see the comment on step 2 above).
          // This turns the SAME grounding on for the two downstream generic
          // steps course-refresh still owns: the opener (index 4) and the
          // optional test template (index 6) each look up that week's
          // already-generated assignment (by week number, in the "files"
          // this include's remap already threads through - see "3.files"
          // below) and prepare students for it instead of only the topic.
          // Opt-in only, and bound HERE only: the codebase kickoff
          // (COURSE_KICKOFF) never sets this, so its openers/tests are
          // unaffected - see the comment on that workflow for why it is left
          // alone entirely.
          "4.groundInAssignment": { source: "literal", value: "1" },
          // Topic, week and points all derive from the tile and the template;
          // asking for them twice (once per template step, undifferentiated
          // on the form) was the single worst thing about this run form.
          "5.topic": { source: "literal", value: "" },
          "5.week": { source: "literal", value: "" },
          "5.pointsPossible": { source: "literal", value: "" },
          "5.postToCanvas": { source: "literal", value: "" },
          "6.topic": { source: "literal", value: "" },
          "6.week": { source: "literal", value: "" },
          "6.pointsPossible": { source: "literal", value: "" },
          "6.postToCanvas": { source: "literal", value: "" },
          "6.groundInAssignment": { source: "literal", value: "1" },
          // starter-materials already generated the syllabus one step earlier,
          // and a GitHub sign-up assignment has no place in a kickoff.
          // Indices 15/16/17 (were 13/14/15 before Group Q inserted two new
          // steps at source indices 7 and 13, shifting everything from 7
          // onward down by one and everything from the original 12 onward
          // down by one more; before Group Q they were 14/15/16 per
          // docs/REGRESSION.md 155 - save-zip-to-course has no bindOverride
          // here, unaffected either way).
          "15.includeGithub": { source: "literal", value: "" },
          "16.regenerate": { source: "literal", value: "" },
          // Castletop defaults are applied by castletop-plan.ts already; the
          // instructor name is constant per user and the step reads none of it.
          "17.instructor": { source: "literal", value: "" },
          "17.instructorFileAs": { source: "literal", value: "" },
          "17.contactMinutes": { source: "literal", value: "" },
          "17.readingRate": { source: "literal", value: "" },
          "17.pagesPerChapter": { source: "literal", value: "" },
          "17.classSessionMinutes": { source: "literal", value: "" },
        },
        remap: {
          "0.repo": { source: "literal", value: "" },
          "0.course": { source: "step", stepIndex: 0, outputKey: "course" },
          "0.startDate": { source: "step", stepIndex: 0, outputKey: "startDate" },
          "0.description": { source: "step", stepIndex: 0, outputKey: "description" },
          "1.schedule": { source: "step", stepIndex: 1, outputKey: "schedule" },
          "1.courseTitle": { source: "step", stepIndex: 1, outputKey: "courseTitle" },
          "1.weeks": { source: "step", stepIndex: 1, outputKey: "weeks" },
          "3.files": { source: "step", stepIndex: 2, outputKey: "files" },
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
      },
    },
    {
      type: "generate-class-openers",
      bindings: {
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        minutes: { source: "literal", value: "30" },
        exerciseKind: { source: "runtime", fieldKey: "openerExerciseKind" },
        files: { source: "step", stepIndex: 3, outputKey: "files" },
        // Asked once on a standalone Course Refresh (matching the exerciseKind
        // field just above); the no-code kickoff overrides it to forced "1"
        // so it never asks (course-setup.ts's NO_CODE_KICKOFF bindOverrides
        // "4.groundInAssignment") - the codebase kickoff leaves it unbound,
        // which the step treats as off, so its openers are unaffected.
        groundInAssignment: { source: "runtime", fieldKey: "openerGroundInAssignment" },
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
        files: { source: "step", stepIndex: 4, outputKey: "files" },
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
        files: { source: "step", stepIndex: 5, outputKey: "files" },
        topic: { source: "runtime", fieldKey: "testTopic" },
        week: { source: "runtime", fieldKey: "testWeek" },
        // Asked once on a standalone Course Refresh (matching the topic/week
        // fields above); the no-code kickoff overrides it to forced "1" so it
        // never asks (course-setup.ts's NO_CODE_KICKOFF bindOverrides
        // "6.groundInAssignment") - the codebase kickoff leaves it unbound,
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
        // "7.courseKind", so neither of them asks.
        courseKind: { source: "runtime", fieldKey: "courseKind" },
        context: { source: "runtime", fieldKey: "context" },
        // Q4: shares the SAME "instructor" runtime field castletop-workbook
        // already surfaces below - a standalone Course Refresh asks once;
        // both kickoffs force castletop's OWN reference blank via their
        // existing bindOverrides ("17.instructor" etc.) but do NOT blank
        // this step's, so the field still surfaces in all three, feeding
        // only the Instructor Contact document in a kickoff run.
        instructor: { source: "runtime", fieldKey: "instructor" },
        files: { source: "step", stepIndex: 6, outputKey: "files" },
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
        // Bumped 9 -> 10: generate-course-guides was inserted above at index
        // 7, shifting lms-modules from source index 9 to 10. Deliberately
        // still reads generate-test-from-template's (index 6) files, NOT
        // generate-course-guides' (index 7) - lms-populate clamps
        // weekNumber to at least 1, so a course-wide (weekNumber 0) guide
        // reaching it would be clamped into Module 01 instead of publishing
        // its own page (see generate-course-guides' own AC6 rationale).
        modules: { source: "step", stepIndex: 10, outputKey: "modules" },
        files: { source: "step", stepIndex: 6, outputKey: "files" },
      },
    },
    {
      type: "lms-assignments",
      bindings: {
        course: { source: "step", stepIndex: 0, outputKey: "course" },
        // Bumped 9 -> 10, same reason as lms-populate's modules binding above.
        modules: { source: "step", stepIndex: 10, outputKey: "modules" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        repo: { source: "step", stepIndex: 0, outputKey: "repo" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        startDate: { source: "step", stepIndex: 0, outputKey: "startDate" },
        files: { source: "step", stepIndex: 6, outputKey: "files" },
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
        // Reads generate-course-guides' (index 7) accumulated output, not
        // generate-test-from-template's (index 6) directly - so the guide
        // documents AND every week's real materials are both in hand for
        // gathering this week's grounding, and so this step's own output
        // extends the SAME chain the guides step started.
        files: { source: "step", stepIndex: 7, outputKey: "files" },
        startDate: { source: "step", stepIndex: 0, outputKey: "startDate" },
        // Shares the same "Context" field generate-course-guides and (in
        // both kickoffs) generate-schedule already surface, so the run form
        // gains no new free-text box for this.
        extraNotes: { source: "runtime", fieldKey: "context" },
        postToLms: { source: "runtime", fieldKey: "announcementsPostToLms" },
      },
    },
    {
      type: "blackboard-export",
      bindings: {
        // Bound to the LATEST files-producing step (generate-weekly-
        // announcements, index 13) rather than generate-test-from-template
        // (index 6) directly, so the guide documents AND the weekly
        // announcements both reach the cartridge's Start Here bucket /
        // their own week's module (see steps.lms-export.ts's Start Here
        // handling for the weekNumber:0 guides, and its per-week bucketing
        // for the announcements).
        files: { source: "step", stepIndex: 13, outputKey: "files" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        startDate: { source: "step", stepIndex: 0, outputKey: "startDate" },
        // Bumped 8 -> 9: generate-course-guides was inserted at index 7,
        // shifting lms-rubric from source index 8 to 9.
        rubricFiles: { source: "step", stepIndex: 9, outputKey: "rubricFiles" },
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
      // 6, generate-test-from-template's output - lecture-zip's own
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
      // generate-weekly-announcements' (index 13) accumulated output rather
      // than generate-test-from-template's (index 6) directly, so the four
      // guide documents and every week's announcement both reach the zip's
      // Course-Wide / Week NN folders - the SAME reasoning that already
      // applies to blackboard-export's binding above.
      type: "save-zip-to-course",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        files: { source: "step", stepIndex: 13, outputKey: "files" },
        // Bumped 8 -> 9: generate-course-guides was inserted at index 7,
        // shifting lms-rubric from source index 8 to 9.
        rubricFiles: { source: "step", stepIndex: 9, outputKey: "rubricFiles" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
      },
    },
  ],
};

export const REPO_AGENT_UPDATE: WorkflowDef = {
  id: "repo-agent-update",
  preset: true,
  category: "course-setup",
  name: "Repo Agent Update",
  description:
    "Send a GitHub Copilot agent task to update a course repository. Review and merge its pull request, then run Course Refresh.",
  steps: [
    {
      type: "agent-edit-repo",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
        title: { source: "runtime", fieldKey: "taskTitle" },
        instructions: { source: "runtime", fieldKey: "instructions" },
      },
    },
  ],
};

export const STARTER_MATERIALS: WorkflowDef = {
  id: "starter-materials",
  preset: true,
  category: "course-setup",
  name: "Starter Materials",
  description:
    "Seed each selected LMS course with a Start Here module: the course tile's syllabus (generated from the institution's syllabus template when the tile has none), a syllabus-acknowledgement quiz due three days after the tile's start date, and optionally a GitHub sign-up assignment.",
  steps: [
    {
      type: "starter-materials",
      bindings: {
        courses: { source: "runtime", fieldKey: "lmsCourses" },
        includeGithub: { source: "runtime", fieldKey: "includeGithub" },
      },
    },
  ],
};

export const IMPORT_COURSES: WorkflowDef = {
  id: "import-courses",
  preset: true,
  category: "course-setup",
  name: "Import Courses",
  description:
    "Fetch all of a term's courses from the institution's LMS (optionally enriched by uploaded exports), preview them, then create a course card for each - existing cards are skipped.",
  steps: [
    {
      type: "fetch-term-courses",
      bindings: {
        institution: { source: "runtime", fieldKey: "institution" },
        term: { source: "runtime", fieldKey: "term" },
        exports: { source: "runtime", fieldKey: "lmsExports" },
      },
    },
    {
      type: "create-course-cards",
      bindings: {
        courses: { source: "step", stepIndex: 0, outputKey: "courses" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
  ],
};

export const ASSIGN_DUE_DATES: WorkflowDef = {
  id: "assign-due-dates",
  preset: true,
  category: "course-setup",
  name: "Assign Due Dates",
  description:
    "Set the start date on the selected course tiles, then give every module's assignments, quizzes, and discussions a deadline at the Sunday ending its week (Start Here and Module 1 end week one).",
  steps: [
    {
      type: "set-course-start-dates",
      bindings: {
        startDate: { source: "runtime", fieldKey: "startDate" },
        courses: { source: "runtime", fieldKey: "courses" },
      },
    },
    {
      type: "assign-week-deadlines",
      bindings: {
        courses: { source: "step", stepIndex: 0, outputKey: "courses" },
        startDate: { source: "runtime", fieldKey: "startDate" },
      },
    },
  ],
};

export const UPDATE_COURSE_TECH: WorkflowDef = {
  id: "update-course-tech",
  preset: true,
  category: "course-setup",
  name: "Update Course with New Tech",
  description:
    "Scan the selected courses' topics, syllabus, textbook, repos, modules, and assignments, and produce a report of emerging-technology opportunities with concrete integration recommendations; after the report, the user lists improvements and a Copilot agent is fired on each course repository; courses without a repository offer a workflow handoff.",
  steps: [
    {
      type: "tech-report",
      bindings: {
        courses: { source: "runtime", fieldKey: "courses" },
        collectImprovements: { source: "literal", value: "1" },
      },
    },
    {
      type: "agent-improve-repos",
      bindings: {
        courses: { source: "runtime", fieldKey: "courses" },
        improvements: { source: "step", stepIndex: 0, outputKey: "improvements" },
        report: { source: "step", stepIndex: 0, outputKey: "report" },
      },
    },
  ],
};

export const STUDENT_REPOS: WorkflowDef = {
  id: "student-repo-assignment",
  preset: true,
  category: "course-setup",
  name: "Student Repo Assignment",
  description:
    "Create one repository per student from a template and invite each student to theirs. Fill the roster by hand or from a course tile.",
  steps: [
    {
      type: "assign-student-repos",
      bindings: {
        org: { source: "runtime", fieldKey: "org" },
        templateRepo: { source: "runtime", fieldKey: "templateRepo" },
        roster: { source: "runtime", fieldKey: "roster" },
        rosterCourse: { source: "runtime", fieldKey: "rosterCourse" },
        prefix: { source: "runtime", fieldKey: "prefix" },
        permission: { source: "runtime", fieldKey: "permission" },
        visibility: { source: "runtime", fieldKey: "visibility" },
      },
    },
  ],
};

export const CLASS_ROSTER_AND_REPOS: WorkflowDef = {
  id: "class-roster-and-repos",
  preset: true,
  category: "course-setup",
  name: "Roster and student repos from GitHub usernames",
  description:
    "Read a Canvas assignment where students submitted their GitHub username, write the class roster and link each username to a student on the course tile, then create one template repo per student in a GitHub org and add each student as an outside collaborator.",
  steps: [
    {
      type: "link-github-usernames",
      bindings: {
        course: { source: "runtime", fieldKey: "course" },
        assignment: { source: "runtime", fieldKey: "assignment" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
    {
      type: "assign-student-repos",
      bindings: {
        org: { source: "runtime", fieldKey: "org" },
        templateRepo: { source: "runtime", fieldKey: "templateRepo" },
        rosterCourse: { source: "runtime", fieldKey: "hubCourse" },
        prefix: { source: "runtime", fieldKey: "prefix" },
        permission: { source: "runtime", fieldKey: "permission" },
        visibility: { source: "runtime", fieldKey: "visibility" },
      },
    },
  ],
};

export const TERM_KICKOFF_IMPORT: WorkflowDef = {
  id: "term-kickoff-import",
  preset: true,
  category: "course-setup",
  name: "Term Kickoff Import",
  description:
    "Run once at the start of each term: scans every configured institution's LMS for the term's courses, shows which are already on the hub and which are new, pauses for your approval, creates a card for each new course, then fills every tile with what the LMS knows - Canvas link, course code, term, start date, and student roster. Already-imported courses are never duplicated and existing tile values are never overwritten.",
  steps: [
    {
      type: "scan-term-courses",
      bindings: {
        institutions: { source: "runtime", fieldKey: "institutions" },
        term: { source: "runtime", fieldKey: "term" },
        confirm: { source: "literal", value: "1" },
      },
    },
    {
      type: "create-course-cards",
      bindings: {
        courses: { source: "step", stepIndex: 0, outputKey: "newCourses" },
      },
      runIf: {
        binding: { source: "step", stepIndex: 0, outputKey: "hasNew" },
        expected: true,
      },
    },
    {
      type: "sync-course-tiles-from-lms",
      bindings: {
        courses: { source: "literal", value: "*" },
        includeRoster: { source: "literal", value: "1" },
      },
    },
  ],
};

export const CLOSED_INSTITUTION_ONBOARDING: WorkflowDef = {
  id: "closed-institution-onboarding",
  preset: true,
  category: "course-setup",
  name: "Closed Institution Onboarding",
  description:
    "One guided run to wire up an institution whose LMS has no API access: save its calendar feed and verify upcoming deadlines, create the course tile, import the roster (with emails) from a gradebook CSV, and check the Outlook connection for notification triggers and email sending - ending with a report that includes the remaining manual checklist (set LMS notifications to right away, weekly gradebook download, term cartridge import).",
  steps: [
    {
      type: "configure-institution-feeds",
      bindings: {
        institution: { source: "runtime", fieldKey: "institution" },
        calendarFeedUrl: { source: "runtime", fieldKey: "calendarFeedUrl" },
      },
    },
    {
      type: "list-deadlines-from-feed",
      bindings: {
        institution: { source: "runtime", fieldKey: "institution" },
        daysAhead: { source: "literal", value: "7" },
      },
    },
    {
      type: "create-course-tile",
      bindings: {
        name: { source: "runtime", fieldKey: "courseName" },
        institution: { source: "runtime", fieldKey: "institution" },
        startDate: { source: "runtime", fieldKey: "startDate" },
        weeks: { source: "runtime", fieldKey: "weeks" },
        lms: { source: "runtime", fieldKey: "lms" },
      },
    },
    {
      type: "import-roster-from-csv",
      bindings: {
        roster: { source: "runtime", fieldKey: "rosterCsv" },
        hubCourse: { source: "step", stepIndex: 2, outputKey: "courseId" },
      },
    },
    {
      type: "check-mailbox-connection",
      bindings: {
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
    {
      type: "compose-briefing",
      bindings: {
        title: { source: "literal", value: "Closed institution onboarding report" },
        section1: { source: "step", stepIndex: 1, outputKey: "deadlines" },
        section2: { source: "step", stepIndex: 3, outputKey: "report" },
        section3: { source: "step", stepIndex: 4, outputKey: "report" },
        section4: {
          source: "literal",
          value:
            "Manual checklist:\n- In the LMS notification settings, set Messages and Submissions to notify right away.\n- Calendar feed URL locations - Canvas: Calendar > Calendar Feed. Blackboard: Calendar > gear icon. Brightspace: Calendar > Settings > Enable Calendar Feeds > Subscribe. Moodle: Calendar > Export calendar (get URL).\n- Weekly: download the gradebook CSV and run Nudge Missing (from gradebook CSV) or Review Grades and Export for a Closed LMS.\n- Each term: import the generated course cartridge (LMS export step) into the LMS, and re-run this onboarding if feeds change.\n- Optional: point an institutional Power Automate flow at a webhook trigger URL for instant events.",
        },
      },
    },
  ],
};

export const COURSE_HEALTH_CHECK: WorkflowDef = {
  id: "course-health-check",
  preset: true,
  category: "course-setup",
  name: "Course Health Check",
  description:
    "One report card per course: broken links in the LMS, gradebook averages with at-risk students, and stale student repos - composed into a single briefing (saved to Files on unattended runs).",
  steps: [
    {
      type: "check-broken-links",
      bindings: {
        course: { source: "runtime", fieldKey: "courses" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
    {
      type: "gradebook-health-report",
      bindings: {
        courses: { source: "runtime", fieldKey: "courses" },
        threshold: { source: "runtime", fieldKey: "threshold" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
    {
      type: "check-student-activity",
      bindings: {
        org: { source: "runtime", fieldKey: "org" },
        prefix: { source: "runtime", fieldKey: "prefix" },
      },
    },
    {
      type: "compose-briefing",
      bindings: {
        title: { source: "literal", value: "Course Health Check" },
        section1: { source: "step", stepIndex: 0, outputKey: "brokenLinks" },
        section2: { source: "step", stepIndex: 1, outputKey: "report" },
        section3: { source: "step", stepIndex: 2, outputKey: "activity" },
      },
    },
  ],
};
