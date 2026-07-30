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
 *
 * Course-long-project AC1/AC4 (docs/REGRESSION.md 146): the priorTitles
 * branch does not just say earlier milestones are DONE, it explicitly tells
 * the model to EXTEND that prior work rather than restart - and, since the
 * student's own subject choice (see PROJECT_CHOICE_CONTRACT below) may have
 * changed since an earlier week, to follow whatever direction the student is
 * CURRENTLY pursuing rather than assuming the original one. The week-1
 * branch is deliberately the only place that says no prior work exists -
 * inventing one for a student who has not made it yet is worse than a week
 * that simply restarts.
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
    parts.push(
      "This week's work must BUILD ON what the student already produced for those milestones - extend it, do not restart it from scratch. Continue whatever direction or subject the student is already pursuing; if that direction changed since an earlier milestone, follow the student's CURRENT direction instead of the original one, and never assume the specific content of a prior artifact beyond what is stated here."
    );
  } else {
    parts.push(
      "This is the first milestone - do not assume any earlier project work exists, and do not ask the student to build on something they have not made yet."
    );
  }

  return parts.join(" ");
}

/**
 * The choice-and-rigor rule that makes student freedom safe (AC2/AC3): paired
 * with `renderMilestoneContract` wherever an assignment prompt is built for a
 * course-long project, so the two are never scattered as separate paraphrases
 * - the same "one constant, composed verbatim" pattern as
 * `APPLIED_REAL_TOOL_RULE` (src/lib/course-kind.ts) and
 * `BLOOM_OBJECTIVES_CONTRACT` (src/lib/bloom-taxonomy.ts).
 *
 * The instructor's project definition names a PROJECT TYPE, not a specific
 * company, dataset, or scenario - that choice belongs to the student. Freedom
 * of subject is only safe alongside a fixed floor: whatever subject a student
 * picks, the deliverable must still exercise this week's module objectives at
 * the same rigor, so this states both halves together rather than the choice
 * half alone. It deliberately references, rather than restates, the
 * concrete-direction rule (`CONCRETE_DIRECTION_CONTRACT`,
 * src/lib/artifact-voice.ts) that every caller composing this constant must
 * also already be composing - repeating its "2-4 examples, explicit scope, a
 * worked mini-example" requirements here would be exactly the second
 * paraphrase this constant exists to avoid.
 *
 * Course-kind neutral by construction, matching BLOOM_OBJECTIVES_CONTRACT's
 * own pattern: nothing here is coding- or applied-specific, so a course of
 * either kind gets the identical choice/rigor rule.
 */
export const PROJECT_CHOICE_CONTRACT = `STUDENT CHOICE WITHIN THE PROJECT: the project's SUBJECT (which company, dataset, system, or scenario the student applies it to) is the STUDENT's choice, not one this prompt fixes for them - do not invent or assume a particular company, dataset, or scenario yourself. Give the student an explicit choice point for it, using the concrete-direction rule already required elsewhere in this prompt (real, recognizable example options plus a worked mini-example) applied to this choice specifically. Once a student has picked a subject in an earlier week, this week continues that SAME subject; if they changed subject or direction since then, follow their CURRENT direction instead of the original one - never penalize a change of direction or assume it did not happen. RIGOR IS NOT NEGOTIABLE: whatever subject the student picks, the deliverable must still exercise this week's module objectives at the same level of rigor - the subject is open, the competency demonstrated is not.`;

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
