import type { WorkflowDef } from "@/lib/workflows/types";

export const GRADE_SUBMISSIONS: WorkflowDef = {
  id: "grade-submissions",
  preset: true,
  name: "Grade Submissions",
  description:
    "Pick one or more courses, or just an institution, to grade every course with pending submissions there. Assignments with ungraded submissions are pulled from the LMS and graded against their associated rubrics. Assignments without a rubric pause for approval and get an LLM-generated rubric. Courses without an LMS pause for a zip upload of submissions and are graded offline. Graded results pause in an editable review table and post to the LMS only after approval.",
  steps: [
    {
      type: "grading-preflight",
      bindings: {
        courses: { source: "runtime", fieldKey: "courses" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
    {
      type: "collect-offline-submissions",
      bindings: {
        courses: { source: "runtime", fieldKey: "courses" },
      },
    },
    {
      type: "grade-submissions",
      bindings: {
        plan: { source: "step", stepIndex: 0, outputKey: "plan" },
        submissionsZip: { source: "step", stepIndex: 1, outputKey: "submissionsZip" },
        courses: { source: "runtime", fieldKey: "courses" },
      },
    },
    {
      type: "post-grades",
      bindings: {
        runs: { source: "step", stepIndex: 2, outputKey: "runs" },
        approvedGrades: { source: "step", stepIndex: 2, outputKey: "approvedGrades" },
      },
    },
  ],
};

export const GRADE_TO_DRAFT: WorkflowDef = {
  id: "grade-to-draft-scorer",
  preset: true,
  name: "Grade Submissions (draft, unattended)",
  description:
    "Unattended AI scoring only, safe to run on a schedule with the app closed: grades every LMS assignment with pending submissions for whatever the workflow is scoped to - the selected course tiles, or every course at the scoped institution (scope All institutions to cover every configured school). Offline courses (no LMS) are skipped and noted. This step never posts to Canvas; use Review Graded Drafts to review and post the saved draft.",
  steps: [
    {
      type: "grade-to-draft",
      bindings: {
        courses: { source: "runtime", fieldKey: "courses" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
  ],
};

export const REVIEW_GRADING_DRAFTS: WorkflowDef = {
  id: "review-grading-drafts",
  preset: true,
  name: "Review Graded Drafts",
  description:
    "Load the oldest pending grading draft saved by Grade Submissions (draft, unattended) into an editable review table - open a submission to check the student's work, edit scores or comments, then approve to post to the LMS. Skipping leaves the draft pending for later. Runs app-open only; posts only what you approve.",
  steps: [
    {
      type: "review-grading-draft",
      bindings: {},
    },
    {
      type: "post-grades",
      bindings: {
        runs: { source: "step", stepIndex: 0, outputKey: "runs" },
        approvedGrades: { source: "step", stepIndex: 0, outputKey: "approvedGrades" },
      },
    },
  ],
};

export const CARTRIDGE_GRADING: WorkflowDef = {
  id: "cartridge-grading",
  preset: true,
  name: "Grade Uploaded Submissions",
  description:
    "Grades student-submission zips uploaded in Files > Submissions (or the Grading panel) and produces gradebook CSVs ready to upload back to your LMS, plus a reviewable grading draft. Use the one-click auto-grade toggle in the Submissions panel to run this workflow automatically on new uploads. Pair it with a Submissions uploaded trigger to grade new uploads automatically.",
  steps: [
    {
      type: "grade-cartridge-submissions",
      bindings: {
        maxDrops: { source: "literal", value: "3" },
      },
    },
  ],
};

export const BATCH_GRADE_REPOS: WorkflowDef = {
  id: "batch-grade-student-repos",
  preset: true,
  name: "Batch Grade Student Repos",
  description:
    "At the end of the week, grade every student's repo for the current module against a rubric synthesized from the week's README, and save the results as a reviewable draft (postable to Canvas). Set up the course tile's Student repos first.",
  steps: [
    {
      type: "course-progress",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
      },
    },
    {
      type: "batch-grade-repos-to-draft",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        week: { source: "step", stepIndex: 0, outputKey: "week" },
        instructionsRepo: { source: "runtime", fieldKey: "instructionsRepo" },
        assignmentUrl: { source: "runtime", fieldKey: "assignmentUrl" },
        pointsPossible: { source: "runtime", fieldKey: "pointsPossible" },
      },
    },
  ],
};

export const ZERO_MISSING_SUBMISSIONS: WorkflowDef = {
  id: "zero-missing-submissions",
  preset: true,
  name: "Zero out missing submissions",
  description:
    "Draft a grade of 0 for students who did not submit an assignment by its deadline, ready to review in Drafts > Grades and post to Canvas.",
  steps: [
    {
      type: "draft-missing-zeros",
      bindings: {
        course: { source: "runtime", fieldKey: "course" },
        assignment: { source: "runtime", fieldKey: "assignment" },
      },
    },
  ],
};

export const GRADE_WHEN_NEEDED: WorkflowDef = {
  id: "grade-when-needed",
  preset: true,
  name: "Grade When Needed",
  description:
    "Check whether anything needs grading at the institution; only when there is work, run the unattended draft grader. The cheap check runs every tick, the expensive grading only when needed - ideal on a schedule.",
  steps: [
    {
      type: "check-needs-grading",
      bindings: {
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
    {
      type: "grade-to-draft",
      bindings: {
        institution: { source: "runtime", fieldKey: "institution" },
      },
      runIf: {
        binding: { source: "step", stepIndex: 0, outputKey: "hasWork" },
        expected: true,
      },
    },
  ],
};

export const REVIEW_AND_EXPORT_GRADES_CSV: WorkflowDef = {
  id: "review-and-export-grades-csv",
  preset: true,
  name: "Review Grades and Export for a Closed LMS",
  description:
    "Review the oldest pending grading draft exactly like Review Graded Drafts, then turn the approved scores into an upload-ready gradebook file for Canvas, Brightspace, Blackboard, or Moodle instead of posting to an API. Upload the file in the LMS gradebook to finish.",
  steps: [
    {
      type: "review-grading-draft",
      bindings: {},
    },
    {
      type: "export-grades-for-lms",
      bindings: {
        runs: { source: "step", stepIndex: 0, outputKey: "runs" },
        approvedGrades: { source: "step", stepIndex: 0, outputKey: "approvedGrades" },
        template: { source: "runtime", fieldKey: "template" },
        lms: { source: "runtime", fieldKey: "lms" },
        itemName: { source: "runtime", fieldKey: "itemName" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
      },
    },
  ],
};

export const NUDGE_MISSING_FROM_GRADEBOOK: WorkflowDef = {
  id: "nudge-missing-from-gradebook",
  preset: true,
  name: "Nudge Missing (from gradebook CSV)",
  description:
    "Upload the gradebook CSV exported from any LMS: students with empty grade cells become personalized nudge drafts in Drafts > Messages - with their email attached when the export carries one, so you can send without any LMS API. Nothing sends until you approve.",
  steps: [
    {
      type: "import-gradebook-csv",
      bindings: {
        gradebook: { source: "runtime", fieldKey: "gradebook" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        assignment: { source: "runtime", fieldKey: "assignment" },
      },
    },
    {
      type: "draft-student-nudges",
      bindings: {
        missingJson: { source: "step", stepIndex: 0, outputKey: "missingJson" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        extraNotes: { source: "runtime", fieldKey: "extraNotes" },
      },
      runIf: {
        binding: { source: "step", stepIndex: 0, outputKey: "hasMissing" },
        expected: true,
      },
    },
  ],
};

export const NUDGE_MISSING_SUBMISSIONS: WorkflowDef = {
  id: "nudge-missing-submissions",
  preset: true,
  name: "Nudge Missing Submissions",
  description:
    "List every student missing past-due work in a course, then draft a short personalized reminder to each, saved to Drafts > Messages. Pair it with the 'An assignment deadline passes' trigger to nudge automatically after every deadline - you still approve every message.",
  steps: [
    {
      type: "list-missing-submissions",
      bindings: {
        course: { source: "runtime", fieldKey: "course" },
        assignment: { source: "runtime", fieldKey: "assignment" },
      },
    },
    {
      type: "draft-student-nudges",
      bindings: {
        course: { source: "runtime", fieldKey: "course" },
        missingJson: { source: "step", stepIndex: 0, outputKey: "missingJson" },
        extraNotes: { source: "runtime", fieldKey: "extraNotes" },
      },
      runIf: {
        binding: { source: "step", stepIndex: 0, outputKey: "hasMissing" },
        expected: true,
      },
    },
  ],
};

export const DEADLINE_REMINDER_DRAFTS: WorkflowDef = {
  id: "deadline-reminder-drafts",
  preset: true,
  name: "Upcoming Deadline Reminders",
  description:
    "Find every deadline in the next 3 days across your courses, draft a friendly reminder announcement about them, and save it to Drafts > Messages for review - only when something is actually due.",
  steps: [
    {
      type: "list-upcoming-deadlines",
      bindings: {
        courses: { source: "runtime", fieldKey: "courses" },
        daysAhead: { source: "literal", value: "3" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
    {
      type: "compose-briefing",
      bindings: {
        title: { source: "literal", value: "Draft a friendly reminder announcement for these upcoming deadlines" },
        section1: { source: "step", stepIndex: 0, outputKey: "deadlines" },
      },
      runIf: {
        binding: { source: "step", stepIndex: 0, outputKey: "hasUpcoming" },
        expected: true,
      },
    },
    {
      type: "draft-announcement",
      bindings: {
        instruction: { source: "step", stepIndex: 1, outputKey: "briefing" },
      },
    },
    {
      type: "save-message-draft",
      bindings: {
        kind: { source: "literal", value: "announcement" },
        body: { source: "step", stepIndex: 2, outputKey: "announcement" },
        title: { source: "step", stepIndex: 2, outputKey: "announcementTitle" },
        courseUrl: { source: "runtime", fieldKey: "courseUrl" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
  ],
};
