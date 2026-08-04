import type { WorkflowDef } from "@/lib/workflows/types";
import { BLANK_TEMPLATE_AND_CASTLETOP_OVERRIDES } from "@/lib/workflows/presets/course-setup-shared";

export const COURSE_KICKOFF: WorkflowDef = {
  id: "course-kickoff",
  preset: true,
  category: "course-setup",
  name: "Course Kickoff",
  description:
    "Pick a course tile - its description, weeks, tests, LMS course, and start date drive everything; the form asks only for the tile, the template repository, and the new repository's name. Generates the schedule, creates the class repo from the template, writes assignment READMEs - then runs everything Course Refresh does (dynamically: changes to Course Refresh apply here automatically), including (re)generating the course's syllabus from its Syllabus template column, generating the Castletop credit-hour workload workbook onto the course tile's Castletop column and the Files tab, and bundling everything the run produced into one zip that downloads and saves to the course tile.",
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
      id: "generate-schedule",
      type: "generate-schedule",
      bindings: {
        description: { source: "step", stepId: "load-course-tile", outputKey: "description" },
        weeks: { source: "step", stepId: "load-course-tile", outputKey: "weeks" },
        tests: { source: "step", stepId: "load-course-tile", outputKey: "tests" },
        context: { source: "runtime", fieldKey: "context" },
        sources: { source: "runtime", fieldKey: "sources" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
      },
    },
    {
      id: "repo-from-template",
      type: "repo-from-template",
      bindings: {
        templateRepo: { source: "runtime", fieldKey: "templateRepo" },
        newRepoName: { source: "runtime", fieldKey: "newRepoName" },
      },
    },
    {
      id: "fill-readmes",
      type: "fill-readmes",
      bindings: {
        repo: { source: "step", stepId: "repo-from-template", outputKey: "repo" },
        schedule: { source: "step", stepId: "generate-schedule", outputKey: "schedule" },
        description: { source: "step", stepId: "load-course-tile", outputKey: "description" },
        context: { source: "runtime", fieldKey: "context" },
      },
    },
    {
      // The SPINE of a project-based course, and the reason it runs this
      // early: every generator downstream reads the project off the tile and
      // asks for THAT WEEK'S milestone. Blank leaves an existing project
      // alone and a course with none simply is not project-based.
      id: "define-course-project",
      type: "define-course-project",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        courseKind: { source: "literal", value: "coding" },
        definition: { source: "runtime", fieldKey: "courseProject" },
        regenerate: { source: "literal", value: "" },
      },
    },
    {
      id: "include-course-refresh",
      type: "include-workflow",
      bindings: {},
      include: {
        workflowId: "course-refresh",
        skipSteps: ["load-course-tile", "schedule-from-repo"],
        bindOverrides: {
          // This kickoff's repo is always "coding" (the whole point of a
          // codebase kickoff), so every courseKind-consuming step below is
          // pinned to the literal instead of left as a runtime field - the
          // run form never asks a "Course type" question it already knows
          // the answer to. lecture-zip's own courseKind only matters on its
          // repoless branch (a repo-driven deck is always coding by
          // construction), but pinning it here keeps that branch consistent
          // too.
          "lecture-zip.courseKind": { source: "literal", value: "coding" },
          "generate-assignment-from-template.courseKind": { source: "literal", value: "coding" },
          "generate-test-from-template.courseKind": { source: "literal", value: "coding" },
          "generate-course-guides.courseKind": { source: "literal", value: "coding" },
          "lms-rubric.courseKind": { source: "literal", value: "coding" },
          "generate-knowledge-checks.courseKind": { source: "literal", value: "coding" },
          "generate-weekly-significance.courseKind": { source: "literal", value: "coding" },
          "generate-instructor-notes.courseKind": { source: "literal", value: "coding" },
          // The repo-driven opener now lives inside lecture-zip for this
          // preset, so there is no separate opener field left to hide here.
          // The template-test grounding flag still surfaces on a standalone
          // Course Refresh, so this kickoff keeps it blank explicitly.
          "generate-test-from-template.groundInAssignment": { source: "literal", value: "" },
          // starter-materials already generated the syllabus one step
          // earlier, and a GitHub sign-up assignment has no place in a
          // kickoff.
          "include-starter-materials.includeGithub": { source: "literal", value: "" },
          // Shared with NO_CODE_KICKOFF and COURSE_BUILD's own copies of this
          // include - see course-setup-shared.ts for what these 15 blank and
          // why.
          ...BLANK_TEMPLATE_AND_CASTLETOP_OVERRIDES,
        },
        remap: {
          "load-course-tile.repo": { source: "step", stepId: "repo-from-template", outputKey: "repo" },
          "load-course-tile.course": { source: "step", stepId: "load-course-tile", outputKey: "course" },
          "load-course-tile.startDate": { source: "step", stepId: "load-course-tile", outputKey: "startDate" },
          "load-course-tile.description": { source: "step", stepId: "load-course-tile", outputKey: "description" },
          "schedule-from-repo.schedule": { source: "step", stepId: "generate-schedule", outputKey: "schedule" },
          "schedule-from-repo.courseTitle": { source: "step", stepId: "generate-schedule", outputKey: "courseTitle" },
          "schedule-from-repo.weeks": { source: "step", stepId: "generate-schedule", outputKey: "weeks" },
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
      id: "populate-lms-from-class-template",
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
      id: "load-course-tile",
      type: "load-course-tile",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        allowMissingRepo: { source: "literal", value: "1" },
      },
    },
    {
      id: "generate-schedule",
      type: "generate-schedule",
      bindings: {
        description: { source: "step", stepId: "load-course-tile", outputKey: "description" },
        weeks: { source: "step", stepId: "load-course-tile", outputKey: "weeks" },
        tests: { source: "step", stepId: "load-course-tile", outputKey: "tests" },
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
      id: "define-course-project",
      type: "define-course-project",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        courseKind: { source: "literal", value: "applied" },
        definition: { source: "runtime", fieldKey: "courseProject" },
        regenerate: { source: "literal", value: "" },
        schedule: { source: "step", stepId: "generate-schedule", outputKey: "schedule" },
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
      id: "lecture-materials-from-schedule",
      type: "lecture-materials-from-schedule",
      bindings: {
        schedule: { source: "step", stepId: "generate-schedule", outputKey: "schedule" },
        minutes: { source: "literal", value: "50" },
        description: { source: "step", stepId: "load-course-tile", outputKey: "description" },
        context: { source: "runtime", fieldKey: "context" },
        // Bound to generate-schedule's resolvedSourceMaterial output (not the
        // raw runtime field) so a derived TOC (see shouldDeriveToc /
        // deriveTocFromSource) grounds this step's aligned prompt branch too,
        // with no second search call: that output already falls back to the
        // original sourceMaterial text unchanged for the pasted-TOC and
        // name-only tiers, so this step's own aligned/name-only branch (the
        // same parseTocChapters test) behaves exactly as it did before.
        sourceMaterial: { source: "step", stepId: "generate-schedule", outputKey: "resolvedSourceMaterial" },
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
      id: "include-course-refresh",
      type: "include-workflow",
      bindings: {},
      include: {
        workflowId: "course-refresh",
        // The shared refresh no longer has a standalone opener step - its
        // repo-driven opener now lives inside lecture-zip - so this kickoff
        // skips only the source steps it already owns itself.
        skipSteps: ["load-course-tile", "schedule-from-repo", "lecture-zip"],
        bindOverrides: {
          // Nothing this run generates may involve code, so every
          // courseKind-consuming step below is pinned to the literal instead
          // of left as a runtime field - matching COURSE_KICKOFF's own
          // pinned-"coding" block above, mirrored to "applied" - so this
          // kickoff's run form never asks a "Course type" question it
          // already knows the answer to.
          "generate-assignment-from-template.courseKind": { source: "literal", value: "applied" },
          "generate-test-from-template.courseKind": { source: "literal", value: "applied" },
          "generate-course-guides.courseKind": { source: "literal", value: "applied" },
          "lms-rubric.courseKind": { source: "literal", value: "applied" },
          "generate-knowledge-checks.courseKind": { source: "literal", value: "applied" },
          "generate-weekly-significance.courseKind": { source: "literal", value: "applied" },
          "generate-instructor-notes.courseKind": { source: "literal", value: "applied" },
          // The assignment is this module's spine (lecture-materials-from-
          // schedule above generates it FIRST). This grounds the ONE
          // downstream generic step course-refresh still owns for this path -
          // generate-test-from-template - in that week's already-generated
          // assignment. Opt-in, bound HERE only: COURSE_KICKOFF never sets
          // this (its assignment step is repo-grounded, not project-week-
          // grounded, so there is nothing week-specific to ground the test
          // in the same way).
          "generate-test-from-template.groundInAssignment": { source: "literal", value: "1" },
          // starter-materials already generated the syllabus one step
          // earlier, and a GitHub sign-up assignment has no place in a
          // kickoff.
          "include-starter-materials.includeGithub": { source: "literal", value: "" },
          // Shared with COURSE_KICKOFF above and COURSE_BUILD's own copy of
          // this include - see course-setup-shared.ts for what these 15
          // blank and why.
          ...BLANK_TEMPLATE_AND_CASTLETOP_OVERRIDES,
        },
        remap: {
          "load-course-tile.repo": { source: "literal", value: "" },
          "load-course-tile.course": { source: "step", stepId: "load-course-tile", outputKey: "course" },
          "load-course-tile.startDate": { source: "step", stepId: "load-course-tile", outputKey: "startDate" },
          "load-course-tile.description": { source: "step", stepId: "load-course-tile", outputKey: "description" },
          "schedule-from-repo.schedule": { source: "step", stepId: "generate-schedule", outputKey: "schedule" },
          "schedule-from-repo.courseTitle": { source: "step", stepId: "generate-schedule", outputKey: "courseTitle" },
          "schedule-from-repo.weeks": { source: "step", stepId: "generate-schedule", outputKey: "weeks" },
          // lecture-materials-from-schedule already carries the opener
          // in-plan too, so the shared refresh's assignment step reads that
          // same accumulated files output.
          "lecture-zip.files": { source: "step", stepId: "lecture-materials-from-schedule", outputKey: "files" },
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
      // zip was built, so they are reflected in neither.
      id: "integrate-source-into-lms",
      type: "integrate-source-into-lms",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepId: "generate-schedule", outputKey: "schedule" },
        sourceMaterial: { source: "runtime", fieldKey: "sourceMaterial" },
        sourceUrl: { source: "runtime", fieldKey: "sourceUrl" },
      },
    },
    {
      // Same reasoning as COURSE_KICKOFF's own copy of this step above (the
      // two kickoffs need different class templates, so this cannot live in
      // the shared course-refresh include).
      id: "populate-lms-from-class-template",
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
      id: "load-course-tile",
      type: "load-course-tile",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        confirmMissingRepo: { source: "literal", value: "1" },
      },
    },
    {
      id: "schedule-from-repo",
      type: "schedule-from-repo",
      bindings: {
        repo: { source: "step", stepId: "load-course-tile", outputKey: "repo" },
        description: { source: "step", stepId: "load-course-tile", outputKey: "description" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
      },
    },
    {
      id: "save-csv-to-course",
      type: "save-csv-to-course",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepId: "schedule-from-repo", outputKey: "schedule" },
        courseTitle: { source: "step", stepId: "schedule-from-repo", outputKey: "courseTitle" },
      },
    },
    {
      id: "lecture-zip",
      type: "lecture-zip",
      bindings: {
        repo: { source: "step", stepId: "load-course-tile", outputKey: "repo" },
        minutes: { source: "literal", value: "50" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        includeInstructions: { source: "literal", value: "1" },
        schedule: { source: "step", stepId: "schedule-from-repo", outputKey: "schedule" },
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
      id: "generate-assignment-from-template",
      type: "generate-assignment-from-template",
      bindings: {
        template: { source: "runtime", fieldKey: "assignmentTemplate" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        // Asked once on a standalone Course Refresh; both kickoffs
        // override it, so neither of them asks.
        courseKind: { source: "runtime", fieldKey: "courseKind" },
        files: { source: "step", stepId: "lecture-zip", outputKey: "files" },
        topic: { source: "runtime", fieldKey: "assignmentTopic" },
        week: { source: "runtime", fieldKey: "assignmentWeek" },
        postToCanvas: { source: "runtime", fieldKey: "assignmentPostToCanvas" },
        pointsPossible: { source: "runtime", fieldKey: "assignmentPoints" },
      },
    },
    {
      // Same placement rationale as the assignment step above.
      id: "generate-test-from-template",
      type: "generate-test-from-template",
      bindings: {
        template: { source: "runtime", fieldKey: "testTemplate" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        // Asked once on a standalone Course Refresh; both kickoffs
        // override it, so neither of them asks.
        courseKind: { source: "runtime", fieldKey: "courseKind" },
        files: { source: "step", stepId: "generate-assignment-from-template", outputKey: "files" },
        topic: { source: "runtime", fieldKey: "testTopic" },
        week: { source: "runtime", fieldKey: "testWeek" },
        // Asked once on a standalone Course Refresh (matching the topic/week
        // fields above); NO_CODE_KICKOFF's own bindOverride for this step
        // (course-setup.ts) forces it to "1" so it never asks - the codebase
        // kickoff leaves it unbound, which the step treats as off, so its
        // tests are unaffected.
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
      id: "generate-course-guides",
      type: "generate-course-guides",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepId: "schedule-from-repo", outputKey: "schedule" },
        // Asked once on a standalone Course Refresh (matching the
        // generate-assignment-from-template / generate-test-from-template
        // fields above); both kickoffs override this step's own courseKind,
        // so neither of them asks.
        courseKind: { source: "runtime", fieldKey: "courseKind" },
        context: { source: "runtime", fieldKey: "context" },
        // Q4: shares the SAME "instructor" runtime field castletop-workbook
        // already surfaces below - a standalone Course Refresh asks once;
        // both kickoffs force castletop-workbook's OWN instructor fields
        // blank (BLANK_TEMPLATE_AND_CASTLETOP_OVERRIDES, course-setup-
        // shared.ts) but do NOT blank this step's, so the field still
        // surfaces in all three, feeding only the Instructor Contact
        // document in a kickoff run.
        instructor: { source: "runtime", fieldKey: "instructor" },
        files: { source: "step", stepId: "generate-test-from-template", outputKey: "files" },
        postToLms: { source: "runtime", fieldKey: "guidesPostToLms" },
      },
    },
    {
      id: "lms-wipe",
      type: "lms-wipe",
      bindings: {
        course: { source: "step", stepId: "load-course-tile", outputKey: "course" },
      },
    },
    {
      id: "lms-rubric",
      type: "lms-rubric",
      bindings: {
        course: { source: "step", stepId: "load-course-tile", outputKey: "course" },
        repo: { source: "step", stepId: "load-course-tile", outputKey: "repo" },
        description: { source: "step", stepId: "load-course-tile", outputKey: "description" },
        schedule: { source: "step", stepId: "schedule-from-repo", outputKey: "schedule" },
        title: { source: "step", stepId: "schedule-from-repo", outputKey: "courseTitle" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        // F2 fix (this input was previously left completely unbound, so
        // resolveCourseKind(undefined) silently defaulted every rubric to
        // "coding" - the documented "unbound inputs are silently skipped"
        // trap): the SAME "courseKind" runtime field the assignment/test
        // template steps and generate-course-guides above already surface -
        // a standalone Course Refresh asks once; both kickoffs override this
        // step's own courseKind, so neither of them asks, and course-build.ts's
        // own bindOverride for this step derives it from that run's own
        // source/tile instead.
        courseKind: { source: "runtime", fieldKey: "courseKind" },
      },
    },
    {
      id: "lms-modules",
      type: "lms-modules",
      bindings: {
        course: { source: "step", stepId: "load-course-tile", outputKey: "course" },
        weeks: { source: "step", stepId: "schedule-from-repo", outputKey: "weeks" },
      },
    },
    {
      id: "lms-populate",
      type: "lms-populate",
      bindings: {
        course: { source: "step", stepId: "load-course-tile", outputKey: "course" },
        // Deliberately still reads generate-test-from-template's files, NOT
        // generate-course-guides' - lms-populate clamps weekNumber to at
        // least 1, so a course-wide (weekNumber 0) guide reaching it would be
        // clamped into Module 01 instead of publishing its own page (see
        // generate-course-guides' own AC6 rationale).
        modules: { source: "step", stepId: "lms-modules", outputKey: "modules" },
        files: { source: "step", stepId: "generate-test-from-template", outputKey: "files" },
      },
    },
    {
      id: "lms-assignments",
      type: "lms-assignments",
      bindings: {
        course: { source: "step", stepId: "load-course-tile", outputKey: "course" },
        modules: { source: "step", stepId: "lms-modules", outputKey: "modules" },
        schedule: { source: "step", stepId: "schedule-from-repo", outputKey: "schedule" },
        repo: { source: "step", stepId: "load-course-tile", outputKey: "repo" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        startDate: { source: "step", stepId: "load-course-tile", outputKey: "startDate" },
        files: { source: "step", stepId: "generate-test-from-template", outputKey: "files" },
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
      id: "generate-weekly-announcements",
      type: "generate-weekly-announcements",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepId: "schedule-from-repo", outputKey: "schedule" },
        // Reads generate-course-guides' accumulated output, not
        // generate-test-from-template's directly - so the guide documents
        // AND every week's real materials are both in hand for gathering
        // this week's grounding, and so this step's own output extends the
        // SAME chain the guides step started.
        files: { source: "step", stepId: "generate-course-guides", outputKey: "files" },
        startDate: { source: "step", stepId: "load-course-tile", outputKey: "startDate" },
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
      id: "generate-knowledge-checks",
      type: "generate-knowledge-checks",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepId: "schedule-from-repo", outputKey: "schedule" },
        // Reads generate-weekly-announcements' accumulated output, so the
        // guide documents, every week's announcement, AND every week's real
        // materials are all in hand for grounding this week's knowledge
        // check, and this step's own output extends the SAME chain the
        // announcements step continued.
        files: { source: "step", stepId: "generate-weekly-announcements", outputKey: "files" },
        // "modules" (lms-modules' per-week Canvas module ids) is deliberately
        // NOT bound here: this step used to depend on lms-modules for it, so
        // an lms-modules failure (Canvas API/auth/rate-limit) cascaded and
        // skipped this step's entire week-by-week generation for the whole
        // course, even though postToLms defaults OFF - an LMS outage cost the
        // LOCAL deliverables too (see presets.course-build.resilience.test.ts).
        // This step now depends only on schedule-from-repo above. Cost: with
        // "modules" unbound, values.modules resolves to undefined, so the
        // Array.isArray(values.modules) check in this step's own run()
        // degrades to [] - when postToLms is on, the generated quiz is
        // still created and published, but is NEVER placed into that
        // week's Canvas module (reported "not placed in a module"), even
        // on a fully successful lms-modules run. Accepted trade-off - see
        // this step's own "modules" input help text (steps.knowledge-
        // checks.ts). generate-weekly-significance and generate-instructor-
        // notes below make the identical trade-off for the identical reason -
        // see this comment, not each of theirs, for the full accounting.
        // Asked once on a standalone Course Refresh (matching the
        // generate-assignment-from-template / generate-test-from-template /
        // generate-course-guides fields above); both kickoffs override this
        // step's own courseKind, so neither of them asks.
        courseKind: { source: "runtime", fieldKey: "courseKind" },
        postToLms: { source: "runtime", fieldKey: "knowledgeChecksPostToLms" },
      },
    },
    {
      // Weekly "Significance of the Material" (new output family): placed
      // AFTER generate-knowledge-checks so it extends the SAME accumulated
      // "files" chain (same reasoning as the knowledge-checks comment above)
      // - and BEFORE blackboard-export/save-zip-to-course so the documents
      // reach both. This week's case study is read off the files this SAME
      // run already produced for it (lecture-zip/lecture-materials-from-
      // schedule, whose plans now carry `caseStudy` - see registry-
      // helpers.ts's assembleLectureFiles) - never re-derived here.
      id: "generate-weekly-significance",
      type: "generate-weekly-significance",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepId: "schedule-from-repo", outputKey: "schedule" },
        // Reads generate-knowledge-checks' accumulated output - the case
        // study attached to each week's files is carried forward from
        // wherever it was first produced (lecture-zip/lecture-materials-
        // from-schedule), so reading any later step's "files" output still
        // finds it.
        files: { source: "step", stepId: "generate-knowledge-checks", outputKey: "files" },
        // "modules" deliberately NOT bound here, same trade-off (and same
        // reason) as generate-knowledge-checks' own "modules" comment above -
        // see that comment for the full accounting; steps.weekly-
        // significance.ts's own "modules" input help text covers this step's
        // specific wording.
        // Asked once on a standalone Course Refresh (matching the
        // generate-course-guides / generate-knowledge-checks fields above);
        // both kickoffs override this step's own courseKind, so neither of
        // them asks.
        courseKind: { source: "runtime", fieldKey: "courseKind" },
        postToLms: { source: "runtime", fieldKey: "significancePostToLms" },
      },
    },
    {
      // Per-module instructor notes (new output family): placed right after
      // generate-weekly-significance so it extends the SAME accumulated
      // "files" chain - and BEFORE blackboard-export/save-zip-to-course so
      // the (always-unpublished) pages reach both. This module's tools are
      // read off the course's committed toolset (the loaded tile) narrowed
      // to whichever of them this week's own already-generated text actually
      // names - never invented, never a fresh LLM choice of which tools to
      // discuss (see steps.instructor-notes.ts's own header comment).
      id: "generate-instructor-notes",
      type: "generate-instructor-notes",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepId: "schedule-from-repo", outputKey: "schedule" },
        // Reads generate-weekly-significance's accumulated output,
        // continuing the SAME chain.
        files: { source: "step", stepId: "generate-weekly-significance", outputKey: "files" },
        // "modules" deliberately NOT bound here, same trade-off (and same
        // reason) as generate-knowledge-checks' own "modules" comment above -
        // see that comment for the full accounting; steps.instructor-
        // notes.ts's own "modules" input help text covers this step's
        // specific wording (its LMS page is always unpublished regardless).
        // Asked once on a standalone Course Refresh; both kickoffs override
        // this step's own courseKind, so neither of them asks.
        courseKind: { source: "runtime", fieldKey: "courseKind" },
        postToLms: { source: "runtime", fieldKey: "instructorNotesPostToLms" },
      },
    },
    {
      // Unsplash deliverable images: placed AFTER generate-instructor-notes
      // so it extends the SAME accumulated "files" chain (same reasoning as
      // the knowledge-checks comment above) - and BEFORE blackboard-export/
      // save-zip-to-course so the images reach both.
      id: "fetch-deliverable-images",
      type: "fetch-deliverable-images",
      bindings: {
        schedule: { source: "step", stepId: "schedule-from-repo", outputKey: "schedule" },
        // Reads generate-instructor-notes' accumulated output, so
        // every deliverable this run produced (materials, assignments,
        // announcements, knowledge checks, significance documents,
        // instructor notes) is in hand both for deriving each week's query
        // and for this step's own output to extend the SAME chain.
        files: { source: "step", stepId: "generate-instructor-notes", outputKey: "files" },
      },
    },
    {
      id: "blackboard-export",
      type: "blackboard-export",
      bindings: {
        // Bound to the LATEST files-producing step (fetch-deliverable-images)
        // rather than generate-instructor-notes directly, so the guide
        // documents, the weekly announcements, the weekly knowledge checks,
        // the significance documents, the instructor notes, AND each week's
        // Unsplash image all reach the cartridge's Start Here bucket / their
        // own week's module (see steps.lms-export.ts's Start Here handling
        // for the weekNumber:0 guides, and its per-week bucketing for
        // everything else).
        files: { source: "step", stepId: "fetch-deliverable-images", outputKey: "files" },
        schedule: { source: "step", stepId: "schedule-from-repo", outputKey: "schedule" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        startDate: { source: "step", stepId: "load-course-tile", outputKey: "startDate" },
        rubricFiles: { source: "step", stepId: "lms-rubric", outputKey: "rubricFiles" },
      },
    },
    {
      // Starter Materials runs last against the tile's LMS course. The
      // absorbed step's courses input expects a newline-joined
      // lmsCourseList; load-course-tile's "course" output is a single URL,
      // which is a valid one-item list as-is. Its includeGithub runtime binding
      // passes through untouched, surfacing the "Include GitHub Starter?"
      // checkbox on the Refresh run form.
      id: "include-starter-materials",
      type: "include-workflow",
      bindings: {},
      include: {
        workflowId: "starter-materials",
        skipSteps: [],
        remap: {},
        bindOverrides: {
          "starter-materials.courses": { source: "step", stepId: "load-course-tile", outputKey: "course" },
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
      id: "generate-syllabus",
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
      id: "castletop-workbook",
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
      // Terminal step: a binding can only reach an EARLIER step's output, so
      // this must run last to bundle everything the run produced. `files`
      // reads fetch-deliverable-images' accumulated output - the tail of the
      // SAME chain blackboard-export's own `files` binding above reads,
      // carrying every generator's output forward (materials, assignments,
      // guides, announcements, knowledge checks, significance documents,
      // instructor notes, and the Unsplash images) - see docs/REGRESSION.md
      // 155 for the full inventory this satisfies.
      //
      // castletop-workbook's workbook and generate-syllabus's document are
      // DELIBERATELY NOT chained in: both CAN throw on real, plausible
      // configuration gaps (no syllabus template set; a Castletop data
      // issue), and any step-to-step binding here would cascade that single
      // failure into losing the ENTIRE zip - a far worse outcome than the
      // instructor fetching those two files from their own already-dedicated
      // locations (the Castletop column/Files tab, and the syllabus
      // library). Full rationale: docs/WORKFLOW-ARCHITECTURE.md.
      id: "save-zip-to-course",
      type: "save-zip-to-course",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        files: { source: "step", stepId: "fetch-deliverable-images", outputKey: "files" },
        rubricFiles: { source: "step", stepId: "lms-rubric", outputKey: "rubricFiles" },
        schedule: { source: "step", stepId: "schedule-from-repo", outputKey: "schedule" },
      },
    },
  ],
};
