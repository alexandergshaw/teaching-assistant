// Client-side step catalog: define the one project the whole course builds
// toward, and break it into per-week milestones.
//
// This step is the SPINE of a project-based course. It runs early in a kickoff
// - before anything that generates coursework - because every later generator
// (assignment, test, class session) reads the project off the course tile and
// asks the model for THAT WEEK'S milestone specifically. Persisting it on the
// tile rather than passing it down the workflow is deliberate: a later Course
// Refresh, or a one-off single-week generation months into the term, gets the
// same project without the user restating it.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  listCourseHubAction,
  generateCourseProjectAction,
  setCourseProjectAction,
} from "@/app/actions";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";
import {
  coerceCourseProject,
  hasProject,
  renderProjectBrief,
  type CourseProject,
} from "@/lib/course-project";
import { renderCourseFacts } from "@/lib/course-facts";
import { resolveCourseKind } from "@/lib/course-kind";
import { scheduleToCsv } from "@/lib/workflows/types";
import type { Course } from "@/lib/supabase/courses";

/** The course's weekly topics as one line per week, for milestone alignment. */
function weeklyTopicsFrom(tile: Course): string {
  const csv = (tile.csvData ?? "").trim();
  if (csv) return csv;
  return (tile.topicOutline ?? "").trim();
}

/**
 * The same weekly-topics text as weeklyTopicsFrom, but read from a schedule
 * bound from an earlier step (generate-schedule's output) instead of the
 * tile's saved data. Reuses scheduleToCsv - the same shape tile.csvData
 * already carries - rather than inventing a second line format, so the
 * generation prompt reads identically whichever source supplied it.
 */
export function weeklyTopicsFromSchedule(schedule: ScheduleWeekPlan[]): string {
  if (schedule.length === 0) return "";
  return scheduleToCsv(schedule);
}

export const courseProjectSteps: StepDefinition[] = [
  {
    type: "define-course-project",
    name: "Define the course project",
    description:
      "Turn a one-line project idea into the course's semester-long project: a named project, a student-facing brief, and one milestone per week. Every assignment, test and class session generated afterwards is built around that week's milestone. Saved onto the course tile, so later runs reuse it.",
    inputs: [
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: true },
      {
        key: "courseKind",
        label: "Course type",
        type: "text",
        required: false,
        options: ["coding", "applied"],
        help: "\"applied\" is a no-code course: the project must not require students to write code.",
      },
      {
        key: "definition",
        label: "Course project",
        type: "longtext",
        required: false,
        help: "Describe in a sentence or two the one project the whole course builds toward. Blank leaves the course's existing project unchanged.",
      },
      {
        key: "regenerate",
        label: "Rebuild an existing project",
        type: "boolean",
        required: false,
        help: "Off by default: a course that already has a project is left alone. Turn on to rebuild it from the description.",
      },
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: false,
        help: "The generated schedule whose weekly topics ground the milestones.",
      },
      {
        key: "autoDefine",
        label: "Design one when none is given",
        type: "boolean",
        required: false,
        help: "With no project description given, design one from the schedule instead of leaving the course non-project-based.",
      },
    ],
    outputs: [
      { key: "projectName", label: "Project name", type: "text" },
      { key: "brief", label: "Project brief", type: "longtext" },
      { key: "milestoneCount", label: "Milestones", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) throw new Error("Choose a course tile.");

      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) throw new Error("Course tile not found.");

      const existing = tile.courseProject;
      const definition = String(values.definition ?? "").trim();
      const regenerate = String(values.regenerate ?? "") === "1";
      // Off by default: every existing preset and saved workflow leaves this
      // input unbound, and an unbound optional input resolves to "" - so
      // every branch below behaves exactly as it did before autoDefine
      // existed unless a workflow explicitly turns it on.
      const autoDefine = String(values.autoDefine ?? "") === "1";
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];

      // A blank definition never CLEARS a project - clearing is done from the
      // Courses table, deliberately, so a kickoff run that simply leaves the
      // box empty cannot wipe a plan the whole term depends on.
      if (!definition && !hasProject(existing)) {
        if (!autoDefine) {
          return {
            outputs: { projectName: "", brief: "", milestoneCount: 0 },
            summary: {
              kind: "text",
              text: "No course project described - this course is not project-based.",
            },
          };
        }
        // autoDefine ON: fall through to generation below, grounded in the
        // schedule (or the tile's own data) instead of an instructor
        // description - a course that has never had a project gets one by
        // default rather than staying non-project-based.
      } else if (!definition && hasProject(existing)) {
        // Left alone regardless of autoDefine: kickoff is re-run routinely,
        // and silently replacing a project mid-term would invalidate every
        // milestone-derived artifact (assignments, tests, class sessions)
        // already produced from it.
        return {
          outputs: {
            projectName: existing.name,
            brief: existing.brief,
            milestoneCount: existing.milestones.length,
          },
          summary: {
            kind: "text",
            text: `Course already has a project (${existing.name}) - left alone.`,
          },
        };
      } else if (hasProject(existing) && !regenerate && !(autoDefine && definition)) {
        // A non-blank definition with autoDefine ON takes precedence over an
        // existing project without needing Rebuild - the instructor typed
        // something, and that always wins. That case skips this branch
        // entirely (via the guard above) and falls through to generation.
        return {
          outputs: {
            projectName: existing.name,
            brief: existing.brief,
            milestoneCount: existing.milestones.length,
          },
          summary: {
            kind: "text",
            text: `Course already has a project (${existing.name}) - left alone (turn on Rebuild to replace it).`,
          },
        };
      }

      // Without a week count there is no defensible number of milestones to
      // invent, and a wrong count misaligns every week of the course. A fresh
      // tile that just generated a schedule has no saved week count yet, so a
      // bound schedule's own length is a valid stand-in.
      const weeks = tile.weeks && tile.weeks > 0 ? tile.weeks : schedule.length > 0 ? schedule.length : null;
      if (weeks === null) {
        return {
          outputs: { projectName: "", brief: "", milestoneCount: 0 },
          summary: {
            kind: "text",
            text: "Set the course's week count before defining a project - there is no way to place milestones without it.",
          },
        };
      }

      const weeklyTopics = schedule.length > 0 ? weeklyTopicsFromSchedule(schedule) : weeklyTopicsFrom(tile);

      onProgress("Designing the course project...");
      const generated = await generateCourseProjectAction(
        definition,
        renderCourseFacts(tile),
        weeks,
        weeklyTopics,
        helpers.provider,
        resolveCourseKind(values.courseKind)
      );
      if ("error" in generated) {
        throw new Error(generated.error);
      }

      // When the instructor gave no description (autoDefine invented the
      // project from the schedule), the stored definition still cannot stay
      // blank: hasProject() treats a blank definition as "no project", and a
      // future routine re-run would then read this as "no existing project"
      // and invent ANOTHER one on top of it - defeating the leave-alone rule
      // above. The generated name is a short, always-present stand-in for
      // what the instructor would have typed.
      const storedDefinition = definition || generated.name;

      const project: CourseProject = coerceCourseProject({
        mode: "course-long",
        name: generated.name,
        definition: storedDefinition,
        brief:
          generated.brief ||
          renderProjectBrief({ ...tile.courseProject, ...generated, definition: storedDefinition }),
        briefFileName: "",
        milestones: generated.milestones,
        // Supplied by the caller: the pure module never reads the clock.
        generatedAt: new Date().toISOString(),
      });

      onProgress("Saving the project to the course...");
      const saved = await setCourseProjectAction(tile.id, project);
      if ("error" in saved) {
        throw new Error(saved.error);
      }

      const notes = [
        `${project.milestones.length} milestone(s) across ${weeks} week(s).`,
        "Every assignment, test and class session generated after this step is built around that week's milestone.",
      ];
      const gaps = Array.from({ length: weeks }, (_, i) => i + 1).filter(
        (w) => !project.milestones.some((m) => m.week === w)
      );
      if (gaps.length > 0) {
        // A gap is not fatal, but it silently means those weeks generate
        // without any project context - so it must be visible.
        notes.push(`No milestone for week(s): ${gaps.join(", ")}.`);
      }

      return {
        outputs: {
          projectName: project.name,
          brief: project.brief,
          milestoneCount: project.milestones.length,
        },
        summary: { kind: "list", label: `Course project: ${project.name}`, items: notes },
      };
    },
  },
];
