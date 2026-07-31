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
  selectCourseTools,
} from "@/app/actions";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";
import {
  coerceCourseProject,
  hasProject,
  renderProjectBrief,
  type CourseProject,
} from "@/lib/course-project";
import { renderCourseFacts } from "@/lib/course-facts";
import { resolveCourseKind, type CourseKind } from "@/lib/course-kind";
import { scheduleToCsv } from "@/lib/workflows/types";
import type { Course } from "@/lib/supabase/courses";
import type { LlmProvider } from "@/lib/llm";

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

export interface EnsuredCourseProject {
  project: CourseProject;
  /** True only when THIS call generated and persisted a new project - false
   * whenever the tile already had one (the common case: once any earlier
   * step or run has defined one, every later call is a pure read). */
  created: boolean;
}

/**
 * Ensure a course tile carries a course-long project before a generator
 * reads one for milestone chaining, instead of depending on a separate
 * `define-course-project` step having been bound and run first.
 *
 * docs/REGRESSION.md 152: the no-code kickoff's own chaining (regression 146)
 * only ever reaches a run whose workflow HAS a `define-course-project` step.
 * A user-SAVED COPY of a preset workflow does not inherit later preset
 * changes - the included steps are flattened onto the copy at save time - so
 * a copy saved before that step existed (or one that simply never bound it)
 * carries no project, ever, no matter how many times it is re-run. Every
 * direct consumer of `tile.courseProject` - `generate-assignment-from-
 * template`, `generate-test-from-template`, and `buildScheduleWeekPlan`'s own
 * schedule-driven pipeline via the `lecture-materials-from-schedule` step -
 * calls this FIRST, so chaining works regardless of which steps a particular
 * workflow instance happens to carry.
 *
 * IDEMPOTENT (AC2/AC4): `hasProject()` is checked FIRST, and an existing
 * project - however it got there (this function, the `define-course-project`
 * step, or a manual edit) - is returned completely UNCHANGED. Callers on
 * different steps of the same run, or different runs entirely, all converge
 * on the ONE persisted project rather than racing to generate their own -
 * the same "a blank/absent input never replaces an existing project" rule as
 * `define-course-project`'s own leave-alone branch (docs/REGRESSION.md 106).
 *
 * APPLIED-ONLY BY DESIGN (AC2): auto-generation only fires for
 * `courseKind === "applied"`. This mirrors `NO_CODE_KICKOFF`'s own
 * `autoDefine` default exactly (a no-code course is project-based BY
 * DEFAULT; `COURSE_KICKOFF`, the coding kickoff, never turns `autoDefine` on
 * - a coding course only gets a project when an instructor explicitly types
 * one into `define-course-project`). Without this gate, an ordinary CODING
 * course with no project - which describes most existing courses - would
 * silently become project-based the moment any of these three steps first
 * ran, inventing milestones and threading them into every assignment prompt
 * for a course that never asked for any of it. "applied" is the exact same
 * cheap, already-bound signal a no-code-kickoff-shaped workflow already
 * carries on these steps (their own `courseKind` binding), so this fires
 * precisely for the workflows this feature targets and never for a plain
 * coding course. A coding course with an EXPLICITLY defined project (typed
 * into `define-course-project`, any time) is unaffected either way - the
 * `hasProject()` check above already returns it before this gate is reached.
 *
 * Generation itself is entirely delegated to `generateCourseProjectAction`
 * with a BLANK definition - the same "propose one from the course's own
 * facts and schedule" mode `define-course-project`'s `autoDefine` branch
 * uses - so this is not a second project generator, only a second caller of
 * the one that already exists. The resulting definition is stored as the
 * generated name rather than left blank, for the same reason that branch
 * does it: a blank stored definition reads as "no project" to `hasProject()`,
 * which would defeat this very function's own idempotency check on the next
 * call.
 *
 * Never throws: a missing week count, or any failure from generation or
 * saving, simply returns the tile's existing (possibly still-empty) project
 * unchanged - the caller's milestone lookup then returns `null`, exactly the
 * "no project" behavior every generator already had before this function
 * existed. A project-derivation failure degrades generation; it does not
 * abort it.
 *
 * ORDERING CAVEAT (documented, not fixed here - AC7): a caller that runs
 * BEFORE an explicit `define-course-project` step in the SAME workflow (as
 * `lecture-materials-from-schedule` does in `NO_CODE_KICKOFF` - see that
 * preset's own step-ordering comment) can have its own already-generated
 * output reference an auto-derived project that a later, explicit, non-blank
 * instructor definition then supersedes for the rest of the run (that step's
 * "a typed definition always wins" rule - AC4 - is unchanged). This is a
 * narrow, accepted tradeoff: it only arises when a workflow BOTH runs this
 * pipeline before its own project step AND the instructor types an explicit
 * description on that same run. The common cases - no description typed
 * (`autoDefine` proposes one, same as this function), or no project step at
 * all (this feature's actual target) - converge cleanly on one project.
 */
export async function ensureCourseProject(
  tile: Course,
  provider: LlmProvider,
  courseKind: CourseKind,
  schedule: ScheduleWeekPlan[] = []
): Promise<EnsuredCourseProject> {
  const existing = tile.courseProject;
  if (hasProject(existing)) return { project: existing, created: false };
  if (courseKind !== "applied") return { project: existing, created: false };

  // Same week-count requirement as define-course-project's own generation
  // branch: without one there is no defensible number of milestones to
  // invent, and this is a silent best-effort fallback, not a user-facing
  // form - it degrades to "no project" rather than erroring.
  const weeks = tile.weeks && tile.weeks > 0 ? tile.weeks : schedule.length > 0 ? schedule.length : null;
  if (weeks === null) return { project: existing, created: false };

  const weeklyTopics = schedule.length > 0 ? weeklyTopicsFromSchedule(schedule) : weeklyTopicsFrom(tile);

  const generated = await generateCourseProjectAction(
    "",
    renderCourseFacts(tile),
    weeks,
    weeklyTopics,
    provider,
    courseKind
  );
  if ("error" in generated) return { project: existing, created: false };

  const project: CourseProject = coerceCourseProject({
    mode: "course-long",
    name: generated.name,
    // No instructor description exists on this path - the generated name is
    // the same always-present stand-in define-course-project's own
    // autoDefine branch stores as the definition, so a later run (of THIS
    // function, or that step) sees hasProject() true and leaves this alone
    // instead of reading a blank definition as "no project" and generating a
    // second one.
    definition: generated.name,
    brief: generated.brief || renderProjectBrief({ ...existing, ...generated, definition: generated.name }),
    briefFileName: "",
    milestones: generated.milestones,
    generatedAt: new Date().toISOString(),
  });

  const saved = await setCourseProjectAction(tile.id, project);
  if ("error" in saved) return { project: existing, created: false };

  return { project, created: true };
}

export interface EnsuredCourseTools {
  tools: string[];
  /** True only when THIS call generated and persisted a new toolset - false
   * whenever the tile's project already carried one (the common case: once
   * any earlier week or run has committed a toolset, every later call is a
   * pure read). Mirrors EnsuredCourseProject.created above. */
  created: boolean;
}

/**
 * Ensure an applied course has committed to a small, stable TOOLSET before a
 * generator reads one for this week's hands-on work - the tool-churn fix
 * (docs/REGRESSION.md): a real generated course sent a student to a
 * different SaaS tool almost every week (Trello in week 1, Miro in week 5,
 * Asana plus a spreadsheet in week 8), because the old per-week decision
 * (selectRequiredTools, course-planning-grounding.ts) had no memory of what
 * an earlier week had already chosen. This function is that memory: it
 * follows the EXACT same shape as ensureCourseProject above (same file, same
 * pattern, called from the same three call sites right after it) -
 * idempotency-first, applied-course-only, never throws, degrades to "not
 * committed yet" on any failure - because a toolset is conceptually part of
 * the SAME course-long commitment a project already is: both are decided
 * once, early, and persisted so every week - and every re-run - reads the
 * same answer instead of asking again.
 *
 * STORAGE: the toolset lives on `courseProject.tools` (src/lib/course-project.ts)
 * rather than a new column - it rides in the SAME `course_project` jsonb the
 * project itself already persists in, written through the SAME dedicated
 * writer (`setCourseProjectAction`) the project uses. No new migration, no
 * new writer, no new idempotency mechanism to keep in sync with the
 * project's own - reusing the existing machinery is also why this takes the
 * CALLER's already-resolved `project` (the `EnsuredCourseProject.project`
 * ensureCourseProject just returned) rather than re-reading `tile.courseProject`
 * itself: the tile in memory is stale the instant ensureCourseProject's own
 * `setCourseProjectAction` call persists a freshly-generated project, and
 * re-reading the stale tile here would silently drop that project's
 * name/milestones when this function's own save writes tools on top of it.
 *
 * IDEMPOTENT: `hasCommittedTools(project)` is checked FIRST - a toolset
 * already committed, however it got there, is left completely UNCHANGED, so
 * callers on different steps or different runs converge on the ONE committed
 * toolset rather than racing to choose their own.
 *
 * APPLIED-ONLY BY DESIGN, for the identical reason ensureCourseProject is:
 * "moduleTools" (and therefore a committed toolset) is an applied-only
 * concept, so a coding course is completely unaffected.
 *
 * Grounded in the WHOLE course's weekly topics (selectCourseTools sees every
 * week, not just this one), preferring a bound schedule over the tile's own
 * saved data - the exact same source-of-truth preference ensureCourseProject
 * already applies to its own weeklyTopics lookup, reused here via the same
 * private weeklyTopicsFrom helper.
 *
 * Never throws: a missing weekly-topics source, or any failure from
 * selection or saving, simply returns the tile's existing (possibly still
 * empty) toolset unchanged - the caller's requiredTools then stays [], the
 * exact "no tool commitment yet" state every applied course was already in
 * before this feature existed.
 */
export async function ensureCourseTools(
  tile: Course,
  project: CourseProject,
  provider: LlmProvider,
  courseKind: CourseKind,
  schedule: ScheduleWeekPlan[] = []
): Promise<EnsuredCourseTools> {
  if (project.tools.length > 0) return { tools: project.tools, created: false };
  if (courseKind !== "applied") return { tools: [], created: false };

  const weeklyTopics = schedule.length > 0 ? weeklyTopicsFromSchedule(schedule) : weeklyTopicsFrom(tile);
  if (!weeklyTopics.trim()) return { tools: [], created: false };

  const tools = await selectCourseTools(renderCourseFacts(tile), weeklyTopics, provider);
  if (tools.length === 0) return { tools: [], created: false };

  const updated: CourseProject = coerceCourseProject({ ...project, tools });

  const saved = await setCourseProjectAction(tile.id, updated);
  if ("error" in saved) return { tools: [], created: false };

  return { tools, created: true };
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
