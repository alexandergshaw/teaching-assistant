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
  /**
   * The applied (no-code) course's COMMITTED toolset - the small, stable set
   * of real practitioner tools every week's hands-on work defaults to,
   * decided ONCE (ensureCourseTools, steps.course-project.ts) rather than
   * re-picked per week (which is what sent a student to Trello in week 1,
   * Miro in week 5, and Asana in week 8 of the SAME course - see
   * docs/REGRESSION.md). Lives here, alongside the milestones, because the
   * toolset is part of the SAME course-long commitment a project already
   * represents: both are decided once, early, and persisted so every later
   * week - and every re-run - reads the same answer instead of asking again.
   * Each entry is a full "Tool Name (free tier/trial/community edition)"
   * string, the same shape selectRequiredTools already produces. [] means no
   * toolset has been committed yet (a coding course, or an applied course
   * whose first tool-needing generation has not run yet).
   */
  tools: string[];
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
// A "small, stable" toolset (AC1/AC3 of the tool-churn fix) is bounded small
// on purpose - a list long enough to need more than a handful of entries has
// stopped being a stable commitment and started being a catalog.
const MAX_TOOLS = 5;
const MAX_TOOL_TEXT = 200;

export function emptyCourseProject(): CourseProject {
  return {
    mode: "none",
    name: "",
    definition: "",
    brief: "",
    briefFileName: "",
    milestones: [],
    tools: [],
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

  // Same defensive shape as milestones above: a non-string or blank entry is
  // dropped rather than defaulted, and the list is capped small (MAX_TOOLS) -
  // a model or a malformed jsonb value cannot inflate "the committed toolset"
  // into an unbounded list.
  const tools: string[] = Array.isArray(obj.tools)
    ? obj.tools
        .filter((t): t is string => typeof t === "string" && t.trim() !== "")
        .slice(0, MAX_TOOLS)
        .map((t) => t.trim().slice(0, MAX_TOOL_TEXT))
    : defaults.tools;

  return {
    mode,
    name: str(obj.name, MAX_NAME),
    definition: str(obj.definition, MAX_DEFINITION),
    brief: str(obj.brief, MAX_BRIEF),
    briefFileName: str(obj.briefFileName, MAX_NAME),
    milestones,
    tools,
    generatedAt: str(obj.generatedAt, 64),
  };
}

/** Whether this course actually has a project driving it. */
export function hasProject(project: CourseProject): boolean {
  return project.mode === "course-long" && project.definition.trim() !== "";
}

/**
 * Whether this course has already committed to a toolset (AC1 of the
 * tool-churn fix) - the same idempotency check ensureCourseTools
 * (steps.course-project.ts) runs before ever calling the model, so a
 * once-committed toolset is never silently regenerated or replaced.
 */
export function hasCommittedTools(project: CourseProject): boolean {
  return project.tools.length > 0;
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
 * student's own subject choice (see projectChoiceContract below) may have
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
 * `BLOOM_OBJECTIVES_CONTRACT` (src/lib/bloom-taxonomy.ts). A FUNCTION rather
 * than a bare constant (unlike those two) because the rule itself must say a
 * DIFFERENT thing depending on whether this is the project's first milestone
 * or a later one - see the "subject chosen once" fix below.
 *
 * BUG THIS FIXES: the original single, unconditional wording ("give the
 * student an explicit choice point for it") was pushed into EVERY week's
 * prompt, first milestone or fifth. A real generated course confirmed the
 * result: week 1 correctly asked the student to pick a project subject, and
 * week 8 - a LATER milestone of the SAME project, whose own milestone
 * sentence already says "Continue whatever direction ... the student is
 * already pursuing" - asked the student to pick one AGAIN ("Select a
 * specific infrastructure project subject ... Examples include: a community
 * garden ..."), contradicting that same assignment's "Build upon the work you
 * completed in your previous milestone" one paragraph later. The two
 * instructions were never actually in tension in the code - "give a choice
 * point" and "continue what you already chose" were simply both stated,
 * unconditionally, in the same sentence, leaving the model to guess which one
 * governed a given week.
 *
 * FIX: branch on `isFirstMilestone` (the caller already knows this - it is
 * exactly `MilestoneBrief.priorTitles.length === 0`, the same signal
 * `renderMilestoneContract` above branches on). The FIRST milestone keeps the
 * original "give an explicit choice point" wording (still referencing the
 * concrete-direction rule rather than restating its "2-4 examples" clause -
 * AC7's no-second-paraphrase rule, unchanged). Every LATER milestone instead
 * states plainly that the subject was already chosen, forbids re-offering
 * subject examples, and redirects the SAME concrete-direction requirement at
 * what actually varies this week: HOW to approach this week's task within
 * the subject already chosen, not WHICH subject to use. The AC5/regression-
 * 146 pivot allowance ("follow their CURRENT direction ... never penalize a
 * change") only makes sense once something could have been chosen already,
 * so it lives in the later-milestone branch alone - week 1 has nothing yet
 * to pivot from.
 *
 * RIGOR IS NOT NEGOTIABLE is common to both branches, unchanged in meaning:
 * whichever subject is in play (freshly chosen, or already committed),
 * this week's deliverable must still exercise the module objectives at full
 * rigor.
 *
 * Course-kind neutral by construction, matching BLOOM_OBJECTIVES_CONTRACT's
 * own pattern: nothing here is coding- or applied-specific, so a course of
 * either kind gets the identical choice/rigor rule.
 */
export function projectChoiceContract(isFirstMilestone: boolean): string {
  const rigor =
    "RIGOR IS NOT NEGOTIABLE: whatever subject is in play, the deliverable must still exercise this week's module objectives at the same level of rigor - the subject is open, the competency demonstrated is not.";

  if (isFirstMilestone) {
    return `STUDENT CHOICE WITHIN THE PROJECT: the project's SUBJECT (which company, dataset, system, or scenario the student applies it to) is the STUDENT's choice, not one this prompt fixes for them - do not invent or assume a particular company, dataset, or scenario yourself. This is the FIRST milestone, so give the student an explicit choice point for it now, using the concrete-direction rule already required elsewhere in this prompt (real, recognizable example options plus a worked mini-example) applied to this choice specifically. ${rigor}`;
  }

  return `STUDENT CHOICE WITHIN THE PROJECT: the project's SUBJECT was already chosen by the student at an earlier milestone - do NOT ask the student to select, choose, or pick a project subject again, and do NOT re-offer subject examples (a company, dataset, system, or scenario) the way the first milestone did; that choice is settled. Continue that SAME subject by default. Only if the student's own work shows they changed subject or direction since then should you follow their CURRENT direction instead of the original one - never penalize a change of direction or assume it did not happen. The concrete-direction rule already required elsewhere in this prompt still applies THIS week - not to re-picking the subject, but to HOW the student approaches this week's specific task within the subject they already have (concrete example approaches, explicit scope, a worked mini-example of this week's deliverable). ${rigor}`;
}

/**
 * The contract that makes a course-long project genuinely hands-on, and
 * keeps that hands-on push inside a legal/safety boundary wherever the
 * field's real work could touch a system the student does not own. Composed
 * VERBATIM, UNCONDITIONALLY, at the point the project is DESIGNED
 * (generateCourseProjectAction, src/app/actions/course-project.ts) - a
 * one-time, whole-course decision where the field is genuinely unknown ahead
 * of time, so the full contract (hands-on push AND authorization boundary
 * together) is the safe default. See composeProjectHandsOnContract below for
 * the OTHER, per-week composition point
 * (generateAssignmentInstructionsForAssignment, src/app/actions/shared.ts),
 * which composes this SAME text CONDITIONALLY instead (D6, docs/HANDOFF.md).
 *
 * BUG THIS FIXES: a real generated ethical hacking course's own weekly
 * project deliverables were things like "a visual network diagram exported
 * as PNG or PDF" and "a link to your updated Airtable base" - documentation
 * ABOUT security work, never evidence of having DONE any.
 *
 * GENERALIZED ON PURPOSE, NOT SECURITY-SPECIFIC: the field's real work
 * varies by course, so this states the PRINCIPLE - the deliverable is the
 * artifact a working practitioner would actually produce, not a report about
 * producing it - and leaves the model to apply it to whatever field the
 * course description and weekly topics describe (the examples below name a
 * few fields only to show the shape of the reasoning, not to special-case
 * any one of them).
 *
 * AC7 (no regression of the applied/no-code contract): "hands-on" for an
 * applied course still means the field's real tools and deliverables, never
 * a program to write or run - stated explicitly in the first paragraph so
 * "hands-on" is never misread, alongside courseKindContract, as license to
 * ask a no-code course for code.
 *
 * D6 (deck-audit entry, docs/HANDOFF.md): kept as ONE exported constant
 * (PROJECT_HANDS_ON_BASE_CLAUSE + "\n\n" + PROJECT_AUTHORIZED_TARGETS_CLAUSE,
 * below - the identical concatenation this constant has always been) so this
 * value, and every existing verbatim consumer of it
 * (generateCourseProjectAction above; assignment-brief.ts, class-session-
 * brief.ts, and test-brief.ts, none of which compose it conditionally),
 * is completely unaffected by the split. Only shared.ts's per-week call
 * switches to composeProjectHandsOnContract below.
 */
const PROJECT_HANDS_ON_BASE_CLAUSE = `HANDS-ON, NOT ABOUT THE FIELD: this project must push students toward actually DOING this field's real work and producing evidence of having done it - never toward describing, summarizing, or diagramming that work from the outside. Every milestone's deliverable should be an artifact a working practitioner in this field would actually produce while doing the job - a completed analysis, a working configuration, a built and tested design, a real finding - never just a plan, summary, report, or diagram ABOUT the work when the real work itself can be done and evidenced instead. Reason from the course's own description and weekly topics for what this field's real work is: for example, a statistics course analyzes real data and reports real findings; a design course produces real designs; a network course configures and tests real networks; a security course finds and reports real vulnerabilities. For an APPLIED (no-code) course, hands-on still means doing this work with the field's own real, professional tools - it never means writing or running a program.`;

/**
 * The AUTHORIZED TARGETS half of PROJECT_HANDS_ON_CONTRACT, on its own - see
 * composeProjectHandsOnContract below for why this is ever separated from
 * PROJECT_HANDS_ON_BASE_CLAUSE above. Text is UNCHANGED from the original,
 * single-constant version - this is a split, not a rewrite.
 */
const PROJECT_AUTHORIZED_TARGETS_CLAUSE = `AUTHORIZED TARGETS ONLY - NOT OPTIONAL: whenever this field's real work involves testing, scanning, probing, configuring, or altering a system, network, account, or dataset, every milestone must direct the student at something they are explicitly authorized to work on, and must say so plainly in the deliverable: an intentionally vulnerable practice target or lab built for exactly this purpose (for example a dedicated training platform, or a deliberately vulnerable virtual machine), the student's own isolated environment, or a scoped environment the instructor provides. Never direct a student at a real system, network, account, or organization they do not own or do not have explicit written permission to test.`;

export const PROJECT_HANDS_ON_CONTRACT = `${PROJECT_HANDS_ON_BASE_CLAUSE}\n\n${PROJECT_AUTHORIZED_TARGETS_CLAUSE}`;

// D6 (deck-audit entry, docs/HANDOFF.md): a real generated assignment about
// writing three plain Python classes (no course-long project touching any
// real system at all) carried the line "Ensure all object definitions are
// contained within your authorized project environment" - the AUTHORIZED
// TARGETS clause above, written for courses whose real work involves
// testing, scanning, probing, configuring, or altering a system, network,
// account, or dataset the student does not own. That reasoning is simply
// inapplicable to an assignment that defines a few in-memory classes, and
// carrying it there anyway reads as meaningless, faintly alarming boilerplate
// - exactly the leak this list exists to stop.
//
// DELIBERATELY NARROW, mirroring GENERAL_PROGRAMMING_SUBJECT_KEYWORDS's own
// "never a bare ambiguous word" discipline (resource-links/field-resources.ts)
// but tuned for a DIFFERENT purpose (a safety-boundary decision, not a
// citation match) - so this is its OWN list rather than an import of that
// one: sharing keywords across two independent decisions would mean tuning
// one for false-positive citations could silently loosen this safety
// boundary too. Bare "security" and bare "network" are deliberately excluded
// (too common in non-technical prose - "job security", "a network of
// contacts") in favor of multi-word phrases and terms that are unambiguously
// security/networking/system-administration in register.
const AUTHORIZED_TARGETS_FIELD_SIGNALS: RegExp[] = [
  /\bcybersecurity\b/i,
  /\bcyber security\b/i,
  /\binformation security\b/i,
  /\bethical hacking\b/i,
  /\bpenetration testing\b/i,
  /\bpen testing\b/i,
  /\bvulnerabilit(?:y|ies)\b/i,
  /\bmalware\b/i,
  /\bcryptography\b/i,
  /\bincident response\b/i,
  /\bintrusion detection\b/i,
  /\bdigital forensics\b/i,
  /\bthreat model(?:l?ing)?\b/i,
  /\bharden(?:ing|ed)?\b/i,
  /\bnetwork security\b/i,
  /\bcomputer networking\b/i,
  /\bnetwork administration\b/i,
  /\bnetwork engineering\b/i,
  /\bsystems? administration\b/i,
  /\bsysadmin\b/i,
  /\bserver administration\b/i,
  /\bactive directory\b/i,
  /\bfirewall\b/i,
];

/**
 * Whether `fieldText` (a course description, milestone/project text, and/or
 * assignment title and body - whatever the caller has in hand) names a field
 * whose real work plausibly touches a system, network, account, or dataset -
 * see AUTHORIZED_TARGETS_FIELD_SIGNALS above for exactly what counts. Never
 * throws on a non-string input.
 */
export function fieldWarrantsAuthorizedTargetsClause(fieldText: string): boolean {
  const normalized = typeof fieldText === "string" ? fieldText : "";
  if (!normalized.trim()) return false;
  return AUTHORIZED_TARGETS_FIELD_SIGNALS.some((pattern) => pattern.test(normalized));
}

/**
 * The per-week composition point (D6, docs/HANDOFF.md): PROJECT_HANDS_ON_
 * BASE_CLAUSE always applies - the "actually DO this field's real work"
 * push is never field-specific, so it is never gated - but the AUTHORIZED
 * TARGETS clause only composes when `fieldText` itself warrants it
 * (fieldWarrantsAuthorizedTargetsClause above). When it does, the result is
 * byte-for-byte identical to PROJECT_HANDS_ON_CONTRACT (same two clauses,
 * same join) - this never WEAKENS the boundary for a course it actually
 * applies to, it only stops composing a clause that was never relevant in
 * the first place. Used by generateAssignmentInstructionsForAssignment
 * (src/app/actions/shared.ts) ONLY - every other verbatim consumer of
 * PROJECT_HANDS_ON_CONTRACT (generateCourseProjectAction, assignment-
 * brief.ts, class-session-brief.ts, test-brief.ts) is untouched by this
 * function's existence.
 */
export function composeProjectHandsOnContract(fieldText: string): string {
  return fieldWarrantsAuthorizedTargetsClause(fieldText)
    ? PROJECT_HANDS_ON_CONTRACT
    : PROJECT_HANDS_ON_BASE_CLAUSE;
}

/**
 * Steers the SUBJECT of a project the app invents FOR ITSELF toward
 * something an ordinary person already understands without being taught it
 * first - never toward making the work easier. Composed VERBATIM, and ONLY
 * in the PROPOSE branch of generateCourseProjectAction
 * (src/app/actions/course-project.ts, the blank-`definition` path where the
 * model designs the project from scratch) - never when the instructor
 * supplied their own idea, because a stated instruction must govern over the
 * app's own subject preference.
 *
 * BUG THIS FIXES: an instructor asked for default projects that are
 * "approachable, simple, things that people would encounter everyday." Left
 * unconstrained, a proposed project instead defaults to an enterprise or
 * institutional register - literally "a complete end-to-end analysis and
 * recommendation for one organization" was the shipped canned default this
 * same fix also rewrites (artifact-templates/presets.ts) - even though
 * nothing about the field itself requires that register.
 *
 * EVERYDAY-NESS AND HANDS-ON-NESS ARE ORTHOGONAL AXES, NOT THE SAME KNOB:
 * this constant constrains WHICH context the subject is drawn from and never
 * how rigorous, real, or hands-on the resulting work is - PROJECT_HANDS_ON_
 * CONTRACT above already owns that axis, is composed alongside this one
 * unedited, and is not loosened by a word here. A household budget tracker
 * and a penetration test are both real artifacts a working practitioner
 * would actually produce; widening WHERE the subject comes from does not
 * widen what counts as finished, real work.
 *
 * DELIBERATELY NOT A REWRITE OF PROJECT_HANDS_ON_CONTRACT: that constant is
 * domain-neutral by design and its field examples (including the security
 * one) are pinned by exact-substring tests - this is a SEPARATE, ADDITIVE
 * constant so neither its wording nor its tests need to change.
 *
 * DOES NOT CONTRADICT courseKindContract's applied text ("Ground every
 * example in the practice of this field: real organizations, decisions,
 * documents, processes..." - src/lib/course-kind.ts): an everyday context IS
 * a real practice setting, not an exception carved out of that rule - a
 * household runs a budget, a club runs an event, a small shop runs a point
 * of sale, each with its own real decisions, documents, and processes. This
 * constant says so explicitly so the two compose rather than fight.
 *
 * MUST SURVIVE A SERIOUS FIELD: for a field that is inherently professional
 * or high-stakes (for example security), this never asks the model to
 * pretend the course teaches something softer - it asks the model to reach
 * for THAT field's own everyday face (a home network, a family's password
 * hygiene, a small shop's point-of-sale system), the same way
 * PROJECT_HANDS_ON_CONTRACT already asks the model to reason from the
 * course's own description and weekly topics for what the field's real work
 * is.
 */
export const PROJECT_EVERYDAY_CONTRACT = `EVERYDAY SUBJECT, NOT ENTERPRISE BY DEFAULT: ground this project's subject in a context an ordinary person already understands without being taught it first - a household, a personal habit or hobby, a club or community group, or a small local business - rather than defaulting to an enterprise, institutional, or unnamed "organization" as the subject. This constrains SUBJECT ONLY: it never means easier, smaller, or less rigorous work, and it never relaxes the HANDS-ON, NOT ABOUT THE FIELD or AUTHORIZED TARGETS ONLY rules above by one inch - a household budget tracker and a penetration test are both real artifacts a working practitioner would actually produce, and everyday-ness and hands-on-ness are orthogonal: widening WHERE the subject comes from does not widen what counts as finished, real work.

AN EVERYDAY CONTEXT IS A REAL PRACTICE SETTING, NOT AN EXCEPTION TO ONE: a household running a budget, a club running an event, or a small shop running its point of sale has its own real decisions, documents, processes, and tools, exactly as any other organization does - treat it as such, never as a simplified stand-in for a "real" one.

REACH FOR THE EVERYDAY FACE OF THIS FIELD, NEVER A DIFFERENT FIELD: when this field's real work is inherently serious or professional (for example security, medicine, or law), do not soften or reframe the field itself - instead choose the everyday SETTING where that field's real work already shows up: a security course can harden a home network, audit a family's password hygiene, or secure a small shop's point-of-sale system; it does not become a course about something else. Reason from the course's own description and weekly topics for what an everyday setting of THIS field's real work looks like.

RIGOR IS NOT NEGOTIABLE: whatever everyday setting is in play, the deliverable must still exercise the course's full rigor and still be the real artifact a working practitioner would produce - the setting is everyday, the competency demonstrated and the work produced are not.`;

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
