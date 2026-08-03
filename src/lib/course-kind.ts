// Whether a course teaches PROGRAMMING or something practised without code.
//
// Every generation prompt in this app used to assert "for a programming
// course" unconditionally. That is right for a codebase course and wrong for
// project management, business, or ethics - and it shipped: a 16-week MGT 422
// course received Python warm-up exercises and lecture notes promising
// examples of "how the concept powers a well-known app".
//
// This is the single vocabulary for that distinction. It follows the same
// {value, label, hint, promptContract} shape as TECHNICAL_APTITUDES and
// CLASS_SESSION_VARIANTS, and callers push the contract VERBATIM rather than
// re-describing it, so the vocabulary and the prompts cannot drift apart.
//
// Pure: no I/O, no Date, no randomness.

export type CourseKind = "coding" | "applied";

export interface CourseKindDef {
  value: CourseKind;
  label: string;
  hint: string;
  /** Pushed verbatim into a generation prompt. */
  promptContract: string;
}

// AC2 (rubric.ts's generateRubric, docs/REGRESSION.md-pending): the applied
// contract used to also say "do not include code snippets or syntax" - a
// literal-word ban on "syntax"/"code snippets" that the rubric prompt (which
// interpolates this contract verbatim) also has to satisfy for ITSELF, not
// just for the model. Left in, that made the two requirements mutually
// exclusive: the contract cannot both BE included verbatim and ALSO be free
// of the very words it names. "Do NOT ask students to read, write, or run
// code" plus "do not illustrate ideas with software APIs or libraries"
// already cover the same ground without naming those two words, so the
// clause was dropped rather than paraphrased.
export const COURSE_KINDS: CourseKindDef[] = [
  {
    value: "coding",
    label: "Programming course",
    hint: "Students read, write, and run code.",
    promptContract:
      "This is a programming course. Students read, write, and run real code, so worked code examples, syntax, and runnable exercises are exactly what they need.",
  },
  {
    value: "applied",
    label: "Applied / no-code course",
    hint: "Students apply methods and tools without writing code.",
    promptContract:
      "This is NOT a programming course - it is an applied course (for example project management, business, or ethics). Do NOT ask students to read, write, or run code, and do not illustrate ideas with software APIs or libraries. Ground every example in the practice of this field: real organizations, decisions, documents, processes, and the tools practitioners actually use. Where a programming course would show code, show an artifact instead - a plan, a matrix, a register, a memo, or a worked calculation.",
  },
];

/**
 * Resolve an untrusted value to a course kind.
 *
 * Defaults to "coding" so every existing caller and stored workflow behaves
 * exactly as it did before this vocabulary existed - the applied variant is
 * strictly opt-in.
 */
export function resolveCourseKind(raw: unknown): CourseKind {
  const value = String(raw ?? "").trim();
  return COURSE_KINDS.some((k) => k.value === value) ? (value as CourseKind) : "coding";
}

/**
 * Resolve a stored value to a course kind ONLY when it is exactly one of the
 * two known values - unlike resolveCourseKind above (which defaults anything
 * unrecognized to "coding"), this returns null for "unset" so a caller can
 * distinguish "there IS an explicit kind here" from "nothing is set, derive
 * one instead."
 *
 * F3 (course-tile-authoritative-kind fix): this is what lets a course
 * tile's own `courseKind` column (src/lib/supabase/courses.ts's `Course.
 * courseKind` - null until an instructor sets it) be checked for "is there an
 * explicit override" without resolveCourseKind's own "coding" default
 * masking the unset case. See steps.course-schedule-from-source.ts's own
 * precedence comment (Course Build: the tile's value wins when set, the
 * source-derived value applies only when it is not) for the caller.
 */
export function courseKindOrNull(raw: unknown): CourseKind | null {
  const value = String(raw ?? "").trim();
  return COURSE_KINDS.some((k) => k.value === value) ? (value as CourseKind) : null;
}

// Word-boundary, case-insensitive phrases and named languages that
// unambiguously name a programming subject - see courseKindFromCourseName's
// own doc comment for the full reasoning behind exactly this list and
// exactly what it deliberately excludes. "c\+\+" and "c#" need no trailing
// boundary: "+" and "#" are themselves non-word characters, so a leading
// \b already guarantees the match starts a fresh token (it cannot fire
// inside a larger word like "disc#1" or "basic++", since \b requires the
// character immediately before "c" to be a non-word character or the start
// of the string).
const CODING_NAME_PATTERNS: RegExp[] = [
  /\bcomputer science\b/i,
  /\bcomputer programming\b/i,
  /\bprogramming\b/i,
  /\bsoftware engineering\b/i,
  /\bsoftware development\b/i,
  /\bweb development\b/i,
  /\bdata structures\b/i,
  /\bobject[- ]oriented programming\b/i,
  /\bcoding\b/i,
  /\bapp development\b/i,
  /\bgame development\b/i,
  /\bjava\b/i,
  /\bjavascript\b/i,
  /\btypescript\b/i,
  /\bpython\b/i,
  /\bc\+\+/i,
  /\bc#/i,
  /\bsql\b/i,
  /\bhtml\b/i,
  /\bcss\b/i,
  /\bphp\b/i,
  /\bruby\b/i,
  /\brust\b/i,
  /\bkotlin\b/i,
];

/**
 * Derive a course kind from the course's NAME alone, or null when the name
 * carries no clear signal.
 *
 * Deliberately returns ONLY "coding" or null - there is no code path that
 * can produce "applied" here at all, which is a stronger guarantee than
 * merely never returning it in practice. The reason lives in
 * steps.course-schedule-from-source.ts's own sourceDerivedKind: its
 * "coding" for a repository source is REAL evidence (there IS a
 * repository), while its "applied" for every other source is a bare
 * DEFAULT with no evidence behind it. A name signal is fit to upgrade an
 * evidence-free default to "coding"; it is never fit to overturn real
 * evidence by handing back "applied" instead.
 *
 * Deliberately CONSERVATIVE: this whole vocabulary exists because a
 * project-management course received Python exercises (see this file's own
 * header comment) - a false "coding" here recreates that exact defect. Every
 * pattern above is either a multi-word subject phrase or a named
 * programming language, matched word-boundary and case-insensitive so it
 * cannot fire as a substring of an unrelated word. Deliberately excluded:
 * bare "computer" (Computer Applications, Computer Information Systems -
 * plenty of computer-adjacent courses teach no code at all), bare
 * "software" (naming software is not the same as writing it), bare
 * "database" and bare "technology" (Health Information Technology,
 * Educational Technology both name a field that USES technology without
 * teaching students to write code), and bare course-code prefixes ("CS",
 * "INFO", "CIS"...) - those are ambiguous across departments (Communication
 * Studies, Cultural Studies, Information Science all also abbreviate to
 * letters that look like a coding department) and add no signal beyond
 * whatever real subject phrase already follows the code in the title.
 */
export function courseKindFromCourseName(name: string): CourseKind | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return CODING_NAME_PATTERNS.some((pattern) => pattern.test(trimmed)) ? "coding" : null;
}

/** The prompt contract for a kind, pushed verbatim by every caller. */
export function courseKindContract(kind: CourseKind): string {
  return COURSE_KINDS.find((k) => k.value === kind)?.promptContract ?? "";
}

/**
 * The rule for naming a hands-on tool in an applied (no-code) course: a REAL,
 * widely used practitioner tool - never invented - plus the FREE way a
 * student reaches it. Shared verbatim by two independently-written prompts
 * that both need it: the deck's per-concept "moduleTools" field
 * ("REAL PROFESSIONAL TOOLS" in APPLIED_STRUCTURE_REQUIREMENTS,
 * src/lib/slide-prompt.ts) and the assignment generator's "tools" field
 * (generateAssignmentAction, src/app/actions/llm-content.ts). Before this
 * constant existed the assignment side only PARAPHRASED the rule as a
 * negative constraint plus category hints ("boards, planners, SaaS free
 * tiers"), with no requirement to actually name a product - extracted once
 * so the two prompts cannot state what counts as an acceptable tool
 * differently. See docs/REGRESSION.md entry 84.2 for the original asymmetry
 * and entry 137.6/141 for why the deck side reads this way.
 *
 * Y8-AC3/AC4 (tool-variety fix): "GanttProject" joined the example list so a
 * genuinely FREE scheduling tool is in the model's own example vocabulary,
 * not just Jira/Asana/Trello/Smartsheet/Monday/Excel (all task-board or
 * spreadsheet tools, none of them a real scheduler) - MS Project, the one
 * scheduling name already in the list, has no free tier at all, which left
 * "state the FREE way" with nothing to reach for except a spreadsheet
 * equivalent every time a week's work was actually scheduling. GanttProject
 * (help center verified live at help.ganttproject.biz, GPLv3, genuinely free,
 * added to TOOL_TUTORIAL_MAP - see resource-links.ts) closes that gap. Purely
 * additive: every substring this constant's own tests pin ("name a REAL,
 * widely used tool", "never invent a product", "free tier"/"free
 * trial"/"community edition"/"spreadsheet equivalent") is unchanged.
 */
export const APPLIED_REAL_TOOL_RULE =
  "name a REAL, widely used tool a practitioner in this field actually uses (for project management: things like MS Project, Jira, Asana, Trello, Smartsheet, Monday, GanttProject, or Excel; adapt to whatever tools this field's practitioners actually use - never invent a product), and state the FREE way a student can reach it: a free tier, a free trial, a community edition, or - only when the tool truly has no free option - a spreadsheet equivalent.";

/**
 * The adherence policy for a course's COMMITTED toolset (AC1/AC2 of the
 * "tool churn" fix - docs/REGRESSION.md entries 137/141/142): once an applied
 * course has committed to a small, stable CORE toolset (ensureCourseTools,
 * steps.course-project.ts), every week that names a tool must default to
 * using ONLY that committed set rather than making its own independent
 * per-week choice - which is what previously sent a student to Trello in
 * week 1, Miro in week 5, and Asana plus a spreadsheet in week 8 of the SAME
 * course, forcing them to re-enter their project data into a new tool almost
 * every week. Composed verbatim by every prompt that names a committed
 * toolset - the assignment instructions (shared.ts), the deck's REQUIRED
 * TOOL(S) block (course-planning-grounding.ts), and the template-driven
 * assignment generator (llm-content.ts) - so "when is a NEW tool allowed"
 * cannot drift into a different answer in each one.
 *
 * TIERED TOOLSET (Y8-AC1/AC2 - "far more varied free professional tool
 * usage"): the churn fix above, left unqualified, is what produced the
 * OPPOSITE defect - a real generated 16-week course used a spreadsheet in 14
 * of 16 weeks because "default to only these tools" was the ONLY signal a
 * week's generation ever saw, with no vocabulary for a legitimate exception.
 * The committed set is a CORE - it holds the student's PERSISTENT project
 * data (the task list, the register, the charter) and must never change.
 * A SPECIALIST tool may be introduced for a single week's task, but only when
 * BOTH of these hold: (1) this week's task genuinely cannot be done well in
 * any committed CORE tool, and (2) the result is PRODUCED IN the specialist
 * tool and then EXPORTED as a file, screenshot, or link - it is never a new
 * place the student has to keep maintaining their ongoing project data. This
 * is the test that tells "a Gantt tool once in the scheduling week, exported
 * as a PNG" (allowed - a specialist, one-off, exported deliverable) apart
 * from "Trello in week 1, Miro in week 5, Asana in week 8" (forbidden - each
 * one a new, ongoing home for the SAME project data). State plainly which
 * CORE tool(s) could not do the job and why, and give the specialist tool's
 * free access (a free tier, a free trial, a community edition, or a
 * spreadsheet equivalent) exactly as a CORE tool would state it - silently
 * swapping tools with no stated reason, or asking a student to relocate their
 * ongoing project data into something new, is exactly the churn this rule
 * exists to stop; introducing a genuinely one-off, exported specialist tool
 * for the week that needs it is not.
 */
export const COMMITTED_TOOLSET_RULE =
  "Default to using ONLY these committed tool(s) for this week's hands-on work - they are the CORE toolset, holding the student's PERSISTENT project data (the task list, the register, the charter) for the whole term, and must never change. A SPECIALIST tool may be introduced for this week only when this week's task genuinely cannot be done well in any of the committed tools AND the result is PRODUCED IN that tool and then EXPORTED as a file, screenshot, or link - never a new place the student has to keep maintaining their project data going forward. If you introduce one, explicitly state WHY the committed tool(s) could not do the job, and give its free access (a free tier, a free trial, a community edition, or a spreadsheet equivalent) exactly as you would for a committed tool. Silently swapping to a different tool with no stated reason, or turning a specialist tool into a new home for ongoing project data, is exactly the churn this rule exists to stop.";

/**
 * The noun a prompt should use for the course, for prompts that name it in
 * running prose rather than pushing the full contract.
 */
export function courseKindNoun(kind: CourseKind): string {
  return kind === "coding" ? "programming course" : "college course";
}

// RCA10 (RCA round 2): the "free external resources" course-kind rule that
// used to live here as `freeResourceSourceRule` (AC6 of the "off-domain
// resources" fix) was deleted - round 1 made code, not the model, the sole
// author of the "Helpful Free Resources" section (see
// generateAssignmentInstructionsForAssignment, src/app/actions/shared.ts),
// which left this function with no production caller and no test. Its
// reasoning (a real generated applied/project-management course cited
// FreeCodeCamp and W3Schools, which are exactly the wrong citation for a
// field with no code in it, and the reverse is just as wrong - a
// professional body is not a reasonable citation for a coding course) now
// lives in resource-links.ts's FIELD_RESOURCE_MAP header comment, next to the
// `courseKind`-tagged data that enforces it in code instead of in a prompt.
