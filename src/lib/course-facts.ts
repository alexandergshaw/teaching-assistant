// Renders one course row into the plain-text fact block handed to the model by
// the "Ask AI" button (askAboutCourseAction).
//
// Pure: no I/O, no Date, no randomness, so it is unit-testable on its own.
//
// Only fields the instructor actually set are emitted. An empty field is
// OMITTED rather than sent as "Textbook: (none)", because a wall of "(none)"
// lines reads to the model as recorded fact - "this course has no textbook" -
// when it usually just means nobody filled the column in.

import { hasProject } from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";

function line(label: string, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : `${label}: ${text}`;
}

/** The course's facts as a plain-text block, one "Label: value" per line. */
export function renderCourseFacts(course: Course): string {
  const lines: Array<string | null> = [
    line("Name", course.name),
    line("Course code", course.courseCode),
    line("Institution", course.institution),
    line("Term", course.term),
    line("Modality", course.modality),
    line("Start date", course.startDate),
    line("End date", course.endDate),
    line("Meets", course.dayTime),
    line("Class length (minutes)", course.classLengthMinutes),
    line("Weeks", course.weeks),
    line("Tests", course.tests),
    line("Breaks", course.breaks),
    line("Assignment due rule", course.assignmentDueRule),
    line("Textbook", course.textbook),
    line("Description", course.description),
    line("Topic outline", course.topicOutline),
    line("LMS", course.lms),
    line("GitHub organization", course.githubOrg),
    line("Contact email", course.email),
  ];

  if (course.repos.length > 0) {
    // repos are { repo, branch } objects - joining them directly would send
    // the model a line of "[object Object]".
    lines.push(`Codebases: ${course.repos.map((r) => r.repo).join(", ")}`);
  }
  if (course.integrations.length > 0) {
    lines.push(`Integrations: ${course.integrations.length} configured`);
  }
  // The course-long project, when there is one. Like every other field it is
  // OMITTED entirely when unset - saying "Course project: (none)" would read
  // to the model as a recorded decision that this course has no project.
  if (hasProject(course.courseProject)) {
    const p = course.courseProject;
    lines.push(`Course project: ${p.name.trim() || "(unnamed)"}`);
    lines.push(`Course project definition: ${p.definition.trim()}`);
    if (p.milestones.length > 0) {
      const milestones = p.milestones
        .map((m) => `  Week ${m.week}: ${m.title}${m.deliverable.trim() ? ` - hand in ${m.deliverable.trim()}` : ""}`)
        .join("\n");
      lines.push(`Course project milestones:\n${milestones}`);
    }
  }

  // The schedule is the single most useful thing to ground an answer in, so it
  // is included in full rather than summarized as a row count.
  if (course.csvData && course.csvData.trim()) {
    lines.push(`Schedule of topics:\n${course.csvData.trim()}`);
  }

  return lines.filter((l): l is string => l !== null).join("\n");
}
