// Renders one course row into the plain-text fact block handed to the model by
// the "Ask AI" button (askAboutCourseAction).
//
// Pure and DETERMINISTIC: no I/O, no Date.now()/current-time read, no
// randomness, so it is unit-testable on its own. describeGradesDue below does
// construct a Date, but only from the caller-supplied date string - never
// from ambient time - so the same Course value still produces the same
// string on every call, forever.
//
// Only fields the instructor actually set are emitted. An empty field is
// OMITTED rather than sent as "Textbook: (none)", because a wall of "(none)"
// lines reads to the model as recorded fact - "this course has no textbook" -
// when it usually just means nobody filled the column in.
//
// renderCourseFacts is a SHARED LEAF: at least 8 non-test call sites read it
// (live-class.ts, media-likeness.ts, AskAiModal.tsx, ProjectCell.tsx,
// steps.course-guides.ts, steps.course-project.ts), and several of those
// feed student-facing or in-class surfaces (a Canvas FAQ page written into
// the course's own modules, an avatar script shown to the class, a spoken
// in-class answer). Roster, weekly-checklist, and grades-due content are
// therefore gated behind an explicit `includeStudentData` opt-in, default
// off, so every one of those other call sites keeps receiving exactly what
// it receives today without being touched. Only AskAiModal.tsx passes the
// opt-in. See docs/BACKLOG.md row A1 for the reasoning.

import { hasProject } from "@/lib/course-project";
import { describeGradesDue } from "@/lib/grades-due";
import type { Course } from "@/lib/supabase/courses";

function line(label: string, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : `${label}: ${text}`;
}

/** Options for renderCourseFacts. `includeStudentData` gates the roster and
 * weekly-checklist blocks - both can contain student names or other
 * student-identifying free text - and also the grades-due date, which names
 * the INSTRUCTOR's own submission deadline but is unconditional here too so
 * that the same opt-in protects every other consumer's output by one
 * mechanism rather than two. Default false/omitted keeps every existing
 * call site's output unchanged. */
export interface RenderCourseFactsOptions {
  includeStudentData?: boolean;
}

/** The course's facts as a plain-text block, one "Label: value" per line. */
export function renderCourseFacts(course: Course, options: RenderCourseFactsOptions = {}): string {
  const includeStudentData = options.includeStudentData === true;
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

  // Roster, weekly checklist, and grades-due: gated behind includeStudentData
  // (see the module header) and, per AC-ORDER-1, appended AFTER the schedule
  // above rather than before it. Reason: live-class.ts's truncateHead keeps
  // the head of the text and drops the tail despite its name, so whatever
  // this function emits last is what a future character cap would lose
  // first - putting the newest, most student-count-scaled content last
  // protects the schedule that cap exists to protect.
  if (includeStudentData) {
    if (course.roster && course.roster.trim()) {
      lines.push(`Roster:\n${course.roster.trim()}`);
    }

    if (course.weeklyChecklist && course.weeklyChecklist.length > 0) {
      // Labels only - no done/undone state. weekly-checklist.ts:280-288
      // documents that a daily/monthly item's checked state EXPIRES with the
      // calendar (read-time only, no write path), so raw item.checked read
      // here with no clock would go stale and this function has no clock to
      // give it: isChecklistItemCheckedNow requires a nowMs, and threading
      // one through every one of this module's call sites just to gate a
      // single line of output isn't worth it when the labels - what is on
      // the course's checklist - carry the real value and cannot go stale.
      // A stale "done" asserted to the instructor as fact is worse than no
      // done-state at all.
      const checklist = course.weeklyChecklist.map((item) => `  ${item.label}`).join("\n");
      lines.push(`Weekly checklist:\n${checklist}`);
    }

    const gradesDue = describeGradesDue(course.gradesDueDate, course.gradesDueTime);
    if (gradesDue) {
      lines.push(`Grades due: ${gradesDue}`);
    }
  }

  return lines.filter((l): l is string => l !== null).join("\n");
}
