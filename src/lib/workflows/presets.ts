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
    "After the course repo changes (manually or via an agent task), regenerate the schedule CSV and contents zip onto the course tile and rebuild the LMS course from the new contents. The LMS course's existing modules are deleted first. Leave the LMS course blank to stop after the zip is saved to the course tile.",
  steps: [
    {
      type: "schedule-from-repo",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
      },
    },
    {
      type: "save-csv-to-course",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        schedule: { source: "step", stepIndex: 0, outputKey: "schedule" },
        courseTitle: { source: "step", stepIndex: 0, outputKey: "courseTitle" },
      },
    },
    {
      type: "lecture-zip",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
        minutes: { source: "literal", value: "50" },
      },
    },
    {
      type: "save-zip-to-course",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        files: { source: "step", stepIndex: 2, outputKey: "files" },
        name: { source: "step", stepIndex: 0, outputKey: "courseTitle" },
      },
    },
    {
      type: "lms-wipe",
      bindings: {
        course: { source: "runtime", fieldKey: "lmsCourse" },
      },
    },
    {
      type: "lms-modules",
      bindings: {
        course: { source: "runtime", fieldKey: "lmsCourse" },
        weeks: { source: "step", stepIndex: 0, outputKey: "weeks" },
      },
    },
    {
      type: "lms-populate",
      bindings: {
        course: { source: "runtime", fieldKey: "lmsCourse" },
        modules: { source: "step", stepIndex: 5, outputKey: "modules" },
        files: { source: "step", stepIndex: 2, outputKey: "files" },
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

/**
 * Merge built-in presets with custom workflows.
 * Returns presets first, then custom workflows.
 */
export function allWorkflows(custom: WorkflowDef[]): WorkflowDef[] {
  return [COURSE_KICKOFF, COURSE_REFRESH, REPO_AGENT_UPDATE, ...custom];
}
