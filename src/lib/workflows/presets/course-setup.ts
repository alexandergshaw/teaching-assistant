import type { WorkflowDef } from "@/lib/workflows/types";

export const COURSE_KICKOFF: WorkflowDef = {
  id: "course-kickoff",
  preset: true,
  category: "course-setup",
  name: "Course Kickoff",
  description:
    "Pick a course tile - its description, weeks, tests, LMS course, and start date drive everything; the form asks only for the tile, the template repository, and the new repository's name. Generates the schedule, creates the class repo from the template, writes assignment READMEs - then runs everything Course Refresh does (dynamically: changes to Course Refresh apply here automatically).",
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
      type: "include-workflow",
      bindings: {},
      include: {
        workflowId: "course-refresh",
        skipSteps: [0, 1],
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
  ],
};

export const NO_CODE_KICKOFF: WorkflowDef = {
  id: "course-kickoff-no-code",
  preset: true,
  category: "course-setup",
  name: "Course Kickoff (no codebase)",
  description:
    "For courses without a code base (ethical hacking, project management, business, etc.). Pick a course tile - its description, weeks, tests, LMS course, and start date drive everything; the form asks only for the tile and the deck template. Generates the schedule and lecture materials from the schedule topics - then runs everything Course Refresh does (dynamically: changes to Course Refresh apply here automatically), skipping only the repository-dependent steps.",
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
      },
    },
    {
      type: "include-workflow",
      bindings: {},
      include: {
        workflowId: "course-refresh",
        skipSteps: [0, 1, 3],
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
      type: "integrate-source-into-lms",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        sourceMaterial: { source: "runtime", fieldKey: "sourceMaterial" },
        sourceUrl: { source: "runtime", fieldKey: "sourceUrl" },
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
    "Pick a course tile and everything else comes from it - the linked repository, LMS course, start date, and LMS - with warnings in the first step's results when a piece is missing. A tile without a linked repository pauses with an alert and, on continue, the schedule falls back to the tile's saved Schedule of Topics (CSV) or its topics; repo-driven materials steps are skipped in that case. The LMS course's existing modules are deleted first, then a grading rubric is generated and saved to the LMS course, onto the course tile, and as a document in the LMS export's Start Here module. Weekly deliverable assignments are created with text-entry submission and end-of-week deadlines; each module's assignment carries its generated instructions. A tile without an LMS course stops after the zip is saved to the tile. An LMS-ready Common Cartridge export downloads at the end when the tile's LMS is set. Finally the Starter Materials workflow runs against the tile's LMS course (dynamic - edits to it apply here).",
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
      type: "save-zip-to-course",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        files: { source: "step", stepIndex: 3, outputKey: "files" },
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
        modules: { source: "step", stepIndex: 7, outputKey: "modules" },
        files: { source: "step", stepIndex: 3, outputKey: "files" },
      },
    },
    {
      type: "lms-assignments",
      bindings: {
        course: { source: "step", stepIndex: 0, outputKey: "course" },
        modules: { source: "step", stepIndex: 7, outputKey: "modules" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        repo: { source: "step", stepIndex: 0, outputKey: "repo" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        startDate: { source: "step", stepIndex: 0, outputKey: "startDate" },
        files: { source: "step", stepIndex: 3, outputKey: "files" },
      },
    },
    {
      type: "blackboard-export",
      bindings: {
        files: { source: "step", stepIndex: 3, outputKey: "files" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        startDate: { source: "step", stepIndex: 0, outputKey: "startDate" },
        rubricFiles: { source: "step", stepIndex: 6, outputKey: "rubricFiles" },
      },
    },
    {
      type: "generate-class-openers",
      bindings: {
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        minutes: { source: "literal", value: "30" },
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
