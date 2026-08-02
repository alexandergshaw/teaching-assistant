// Bloom's Taxonomy contract for every objectives-writing prompt in this app.
//
// docs/REGRESSION.md 145/146: an instructor asked that objectives pages ("at
// least the obj pages") adhere to Bloom's Taxonomy. Naming the taxonomy alone
// does not fix this - a model told only "use Bloom's Taxonomy" still writes
// "students will understand stakeholder management", which READS as
// compliant (it even sounds like a level name) but names no verb, states no
// observable behavior, and cannot be graded. This constant is the actual
// rule, not just the label: it BANS the unmeasurable verbs by name (with a
// substitution), and - the rule that keeps the whole thing honest - makes
// alignment with the week's real assignment outrank progression, so a model
// does not inflate verbs to look rigorous against an assignment that does
// not support them. The taxonomy shapes each objective's verb and level
// internally; it is no longer printed as a visible "(Bloom: Level)" tag on
// the student-facing document (reversed 2026-08-02 - the user asked for the
// label gone, not for the taxonomy to stop shaping the objectives).
//
// ONE exported constant, pushed VERBATIM into every prompt that writes
// learning objectives - today that is generateModuleObjectivesForAssignment
// (src/app/actions/shared.ts), the single builder both buildScheduleWeekPlan
// (schedule-driven kickoffs/refresh) and buildAssignmentPlan (repo-driven
// coding kickoff) call. Same lesson as APPLIED_REAL_TOOL_RULE
// (src/lib/course-kind.ts): a pedagogy rule stated in two prompts eventually
// drifts into two different rules, so there is exactly one place to tune it.
//
// Pure: no I/O, no Date, no randomness.

/** The six levels of the revised Bloom's Taxonomy, lowest to highest. */
export const BLOOM_LEVELS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"] as const;

export type BloomLevel = (typeof BLOOM_LEVELS)[number];

/**
 * Pushed verbatim into the objectives prompt. Covers, in order: what makes an
 * objective measurable (AC1), the banned-verb list with a substitution
 * pattern (AC2 - this matters more than naming the taxonomy, since an
 * unmeasurable objective can still look compliant to a model only told to
 * "use Bloom's Taxonomy"), the assignment-alignment rule that outranks
 * everything else here (AC4), and term progression, explicitly subordinate
 * to alignment (AC5). AC3's visible per-objective "(Bloom: Level)" tag was
 * removed from this contract - the taxonomy still picks the verb and level
 * behind each objective, it is just never printed as a label anymore.
 */
export const BLOOM_OBJECTIVES_CONTRACT = `Every objective must be a MEASURABLE Bloom's Taxonomy objective: an action verb drawn from a named level (${BLOOM_LEVELS.join(", ")}), the specific observable behavior the student performs, and the condition or criterion that makes it assessable (what artifact, tool, or standard proves it) - never a restated topic.

BANNED VERBS: never write "know", "understand", "be familiar with", "learn about", "appreciate", or "be aware of" as an objective's verb - each describes an internal state nobody can grade. Substitute a measurable verb for the level actually intended: at Understand, use "explain", "describe", or "summarize" (never the bare word "understand"); at Apply, use "apply", "use", "demonstrate", or "solve"; at Analyze, use "analyze", "differentiate", or "compare"; at Evaluate, use "evaluate", "justify", or "critique"; at Create, use "design", "build", or "develop".

ALIGNMENT - THIS RULE OUTRANKS EVERY OTHER RULE HERE: the level you tag on an objective must match what the assignment ACTUALLY requires the student to do. Read the assignment's real tasks before choosing a verb - tagging "Evaluate" or "Analyze" on an objective whose assignment only asks students to list, describe, or fill in a template is the mismatch that makes objectives decorative. When the assignment's demand is unclear, tag the LOWER level it plainly supports.

PROGRESSION: across a term, objectives should climb toward Apply, Analyze, Evaluate, and Create as later modules build on earlier ones - a course whose objectives sit at Remember/Understand from week 1 through the final week was not written for what students actually do by then. Progression never overrides ALIGNMENT above: if this module's assignment genuinely only supports a lower level, tag that lower level rather than inflating the verb to look more advanced.`;
