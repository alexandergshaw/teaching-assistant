// The course-long project: one project per course that the whole term builds
// toward, broken into per-week milestones, so every assignment, test and class
// session can reference the specific increment the student owes THIS week.
//
// Pure: no I/O, no Date, no randomness - every function here is a
// deterministic function of its inputs, so it is unit-testable without
// mocking a server action. Mirrors assignment-brief.ts / test-brief.ts.

export interface ProjectMilestone {
  /** 1-based RAW course week, the same numbering weekDeadline and
   * resolveTileCurrentWeek use. Breaks never shift it. */
  week: number;
  title: string;
  /** What the student hands in that week. */
  deliverable: string;
}

export interface CourseProject {
  /** "none" means this course has no course-long project. */
  mode: "none" | "course-long";
  name: string;
  /** The instructor's own statement of the project - the INPUT. */
  definition: string;
  /** The generated student-facing brief - the ARTIFACT. */
  brief: string;
  briefFileName: string;
  milestones: ProjectMilestone[];
  /** Informational only; supplied by the caller, never computed here. */
  generatedAt: string;
}

// Bounds. The whole column is selected on every tile read, so an unbounded
// brief or milestone list would make listing courses progressively slower for
// everyone.
const MAX_NAME = 200;
const MAX_DEFINITION = 4000;
const MAX_BRIEF = 20000;
const MAX_MILESTONES = 60;
const MAX_MILESTONE_TEXT = 500;

export function emptyCourseProject(): CourseProject {
  return {
    mode: "none",
    name: "",
    definition: "",
    brief: "",
    briefFileName: "",
    milestones: [],
    generatedAt: "",
  };
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * Defensive coercion for the `course_project` jsonb: never throws, and any
 * unknown/missing/malformed field falls back to the empty default rather than
 * propagating garbage to callers.
 *
 * A malformed MILESTONE is dropped rather than defaulted - inventing a week
 * number or a title would silently mis-order the semester, which is worse than
 * the milestone simply being absent.
 */
export function coerceCourseProject(raw: unknown): CourseProject {
  const defaults = emptyCourseProject();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;

  const obj = raw as Record<string, unknown>;

  const mode: CourseProject["mode"] =
    obj.mode === "course-long" || obj.mode === "none" ? obj.mode : defaults.mode;

  const seenWeeks = new Set<number>();
  const milestones: ProjectMilestone[] = Array.isArray(obj.milestones)
    ? obj.milestones.reduce<ProjectMilestone[]>((kept, entry) => {
        if (kept.length >= MAX_MILESTONES) return kept;
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return kept;
        const m = entry as Record<string, unknown>;
        const week = m.week;
        if (typeof week !== "number" || !Number.isInteger(week) || week < 1) return kept;
        // First one wins: a duplicate week is a model slip, and keeping both
        // would put two milestones in the same week.
        if (seenWeeks.has(week)) return kept;
        const title = str(m.title, MAX_MILESTONE_TEXT).trim();
        if (!title) return kept;
        seenWeeks.add(week);
        kept.push({
          week,
          title,
          deliverable: str(m.deliverable, MAX_MILESTONE_TEXT).trim(),
        });
        return kept;
      }, [])
    : defaults.milestones;

  milestones.sort((a, b) => a.week - b.week);

  return {
    mode,
    name: str(obj.name, MAX_NAME),
    definition: str(obj.definition, MAX_DEFINITION),
    brief: str(obj.brief, MAX_BRIEF),
    briefFileName: str(obj.briefFileName, MAX_NAME),
    milestones,
    generatedAt: str(obj.generatedAt, 64),
  };
}

/** Whether this course actually has a project driving it. */
export function hasProject(project: CourseProject): boolean {
  return project.mode === "course-long" && project.definition.trim() !== "";
}

/**
 * The milestone for exactly this week, or null.
 *
 * Deliberately an EXACT match with no nearest-neighbour fallback: handing week
 * 7's work to week 9 because week 9 has no milestone would silently duplicate
 * an assignment the student already did.
 */
export function milestoneForWeek(project: CourseProject, week: number): ProjectMilestone | null {
  return project.milestones.find((m) => m.week === week) ?? null;
}

/** Everything a prompt needs to speak about one week's milestone. */
export interface MilestoneBrief {
  projectName: string;
  projectDefinition: string;
  week: number;
  title: string;
  deliverable: string;
  /** Up to the 3 most recent EARLIER milestone titles, oldest-first. */
  priorTitles: string[];
}

const PRIOR_TITLES = 3;

/**
 * The milestone brief for a week, or null when there is no project or no
 * milestone for that week. Turning the project off (`mode: "none"`) silences
 * every downstream prompt even if milestones are still stored, so a course can
 * be switched back on without losing its plan.
 */
export function milestoneBriefFor(project: CourseProject, week: number): MilestoneBrief | null {
  if (!hasProject(project)) return null;
  const milestone = milestoneForWeek(project, week);
  if (!milestone) return null;

  const priorTitles = project.milestones
    .filter((m) => m.week < week)
    .slice(-PRIOR_TITLES)
    .map((m) => m.title);

  return {
    projectName: project.name,
    projectDefinition: project.definition,
    week: milestone.week,
    title: milestone.title,
    deliverable: milestone.deliverable,
    priorTitles,
  };
}

/**
 * THE prompt sentence for a milestone - the single source of truth every
 * generator pushes VERBATIM, exactly the way the `promptContract` strings in
 * artifact-templates/types.ts are used. Re-describing it in a caller is how
 * the milestone quietly stops matching what the student was told.
 */
export function renderMilestoneContract(brief: MilestoneBrief): string {
  const parts: string[] = [];

  const named = brief.projectName.trim()
    ? `the course project "${brief.projectName.trim()}"`
    : "the course project";
  parts.push(`This week's work is milestone ${brief.week} of ${named}: ${brief.title}.`);

  if (brief.projectDefinition.trim()) {
    parts.push(`The project as a whole: ${brief.projectDefinition.trim()}`);
  }
  if (brief.deliverable.trim()) {
    parts.push(`The student must finish and hand in: ${brief.deliverable.trim()}`);
  }
  if (brief.priorTitles.length > 0) {
    parts.push(
      `Earlier milestones are already done (${brief.priorTitles.join("; ")}) - do not re-specify them, and do not reach ahead into later ones.`
    );
  } else {
    parts.push("This is the first milestone - do not assume any earlier project work exists.");
  }

  return parts.join(" ");
}

/**
 * The student-facing project brief, rendered deterministically from the
 * record. Used when the generator returns milestones without prose, and as the
 * preview shown from the Courses table.
 */
export function renderProjectBrief(project: CourseProject): string {
  const lines: string[] = [`# ${project.name.trim() || "Course project"}`, ""];

  if (project.definition.trim()) {
    lines.push(project.definition.trim());
    lines.push("");
  }

  if (project.milestones.length > 0) {
    lines.push("## Milestones");
    lines.push("");
    for (const m of project.milestones) {
      lines.push(`- Week ${m.week} - ${m.title}`);
      if (m.deliverable.trim()) {
        lines.push(`  Hand in: ${m.deliverable.trim()}`);
      }
    }
  }

  return lines.join("\n").trim();
}

/** One-line label for the Courses-table cell. */
export function describeProject(project: CourseProject): string {
  if (!hasProject(project)) return "Not set";
  const name = project.name.trim() || "Course project";
  const count = project.milestones.length;
  return count === 0
    ? `${name} - no milestones yet`
    : `${name} - ${count} milestone${count === 1 ? "" : "s"}`;
}
