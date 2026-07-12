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
    "Paste a course description and get a schedule, a GitHub repo built from your template with assignment directions, a lecture materials zip, and a populated LMS course.",
  steps: [
    {
      type: "generate-schedule",
      bindings: {
        description: { source: "runtime", fieldKey: "courseDescription" },
        weeks: { source: "runtime", fieldKey: "weeks" },
        tests: { source: "runtime", fieldKey: "tests" },
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
        repo: { source: "step", stepIndex: 1, outputKey: "repo" },
        schedule: { source: "step", stepIndex: 0, outputKey: "schedule" },
        description: { source: "runtime", fieldKey: "courseDescription" },
      },
    },
    {
      type: "lecture-zip",
      bindings: {
        repo: { source: "step", stepIndex: 1, outputKey: "repo" },
        minutes: { source: "literal", value: "50" },
      },
    },
    {
      type: "lms-modules",
      bindings: {
        course: { source: "runtime", fieldKey: "lmsCourse" },
        weeks: { source: "runtime", fieldKey: "weeks" },
      },
    },
    {
      type: "lms-populate",
      bindings: {
        course: { source: "runtime", fieldKey: "lmsCourse" },
        modules: { source: "step", stepIndex: 4, outputKey: "modules" },
        files: { source: "step", stepIndex: 3, outputKey: "files" },
      },
    },
  ],
};

export const COURSE_REFRESH: WorkflowDef = {
  id: "course-refresh",
  preset: true,
  name: "Course Refresh",
  description:
    "Pick a course tile and everything else comes from it - the linked repository, LMS course, start date, and LMS - with warnings in the first step's results when a piece is missing. The LMS course's existing modules are deleted first, then a grading rubric is generated and saved. Weekly deliverable assignments are created with text-entry submission and end-of-week deadlines. A tile without an LMS course stops after the zip is saved to the tile. An LMS-ready Common Cartridge export downloads at the end when the tile's LMS is set.",
  steps: [
    {
      type: "load-course-tile",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
      },
    },
    {
      type: "schedule-from-repo",
      bindings: {
        repo: { source: "step", stepIndex: 0, outputKey: "repo" },
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
    "Seed each selected LMS course with a Start Here module: the course tile's syllabus, a syllabus-acknowledgement quiz due three days after the tile's start date, and optionally a GitHub sign-up assignment.",
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
  return [COURSE_KICKOFF, COURSE_REFRESH, STARTER_MATERIALS, REPO_AGENT_UPDATE, STUDENT_REPOS, ...custom];
}
