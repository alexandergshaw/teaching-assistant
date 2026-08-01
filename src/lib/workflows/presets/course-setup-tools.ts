// Standalone course-setup preset workflows split out of course-setup.ts to
// keep both files under the repo's 1000-line cap: COURSE_KICKOFF/
// NO_CODE_KICKOFF/COURSE_REFRESH are tightly coupled (include-workflow,
// shared index-shift bookkeeping in their comments) and stay together in
// course-setup.ts; every workflow below is independent of that trio and of
// each other, so moving them here changes nothing about how they run.
import type { WorkflowDef } from "@/lib/workflows/types";

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
