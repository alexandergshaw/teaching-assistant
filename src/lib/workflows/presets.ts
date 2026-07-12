// Built-in workflow presets.
//
// Presets are composite workflows that orchestrate multiple steps to complete
// common teaching tasks. Custom workflows are merged with presets when displayed.

import type { WorkflowDef } from "@/lib/workflows/types";

export const COURSE_KICKOFF: WorkflowDef = {
  id: "course-kickoff",
  preset: true,
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

export const COURSE_REFRESH: WorkflowDef = {
  id: "course-refresh",
  preset: true,
  name: "Course Refresh",
  description:
    "Pick a course tile and everything else comes from it - the linked repository, LMS course, start date, and LMS - with warnings in the first step's results when a piece is missing. A tile without a linked repository pauses with an alert and, on continue, the schedule falls back to the tile's saved Schedule of Topics (CSV) or its topics; repo-driven materials steps are skipped in that case. The LMS course's existing modules are deleted first, then a grading rubric is generated and saved. Weekly deliverable assignments are created with text-entry submission and end-of-week deadlines. A tile without an LMS course stops after the zip is saved to the tile. An LMS-ready Common Cartridge export downloads at the end when the tile's LMS is set. Finally the Starter Materials workflow runs against the tile's LMS course (dynamic - edits to it apply here).",
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
        includeInstructions: { source: "literal", value: "" },
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
        title: { source: "step", stepIndex: 1, outputKey: "courseTitle" },
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
      },
    },
    {
      type: "blackboard-export",
      bindings: {
        files: { source: "step", stepIndex: 3, outputKey: "files" },
        schedule: { source: "step", stepIndex: 1, outputKey: "schedule" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        startDate: { source: "step", stepIndex: 0, outputKey: "startDate" },
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

export const PREPARE_LECTURE: WorkflowDef = {
  id: "prepare-lecture",
  preset: true,
  name: "Prepare Lecture",
  description:
    "Pick a course and module: builds a lecture deck in the app's slide style from the module's materials, saves it to the course tile, and schedules an LMS announcement summarizing the lecture for two hours after the next class meeting.",
  steps: [
    {
      type: "prepare-lecture",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        moduleId: { source: "runtime", fieldKey: "lmsModule" },
      },
    },
  ],
};

export const UPDATE_COURSE_TECH: WorkflowDef = {
  id: "update-course-tech",
  preset: true,
  name: "Update Course with New Tech",
  description:
    "Scan the selected courses' topics, syllabus, textbook, repos, modules, and assignments, and produce a report of emerging-technology opportunities with concrete integration recommendations.",
  steps: [
    {
      type: "tech-report",
      bindings: {
        courses: { source: "runtime", fieldKey: "courses" },
      },
    },
  ],
};

export const STUDENT_REPOS: WorkflowDef = {
  id: "student-repo-assignment",
  preset: true,
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

/**
 * Merge built-in presets with custom workflows.
 * Returns presets first, then custom workflows.
 */
export function allWorkflows(custom: WorkflowDef[]): WorkflowDef[] {
  return [
    COURSE_KICKOFF,
    COURSE_REFRESH,
    STARTER_MATERIALS,
    IMPORT_COURSES,
    ASSIGN_DUE_DATES,
    PREPARE_LECTURE,
    UPDATE_COURSE_TECH,
    REPO_AGENT_UPDATE,
    STUDENT_REPOS,
    ...custom,
  ];
}
