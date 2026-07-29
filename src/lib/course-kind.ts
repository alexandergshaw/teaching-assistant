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
      "This is NOT a programming course - it is an applied course (for example project management, business, or ethics). Do NOT ask students to read, write, or run code, do not include code snippets or syntax, and do not illustrate ideas with software APIs or libraries. Ground every example in the practice of this field: real organizations, decisions, documents, processes, and the tools practitioners actually use. Where a programming course would show code, show an artifact instead - a plan, a matrix, a register, a memo, or a worked calculation.",
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
 */
export const APPLIED_REAL_TOOL_RULE =
  "name a REAL, widely used tool a practitioner in this field actually uses (for project management: things like MS Project, Jira, Asana, Trello, Smartsheet, Monday, or Excel; adapt to whatever tools this field's practitioners actually use - never invent a product), and state the FREE way a student can reach it: a free tier, a free trial, a community edition, or - only when the tool truly has no free option - a spreadsheet equivalent.";

/**
 * The noun a prompt should use for the course, for prompts that name it in
 * running prose rather than pushing the full contract.
 */
export function courseKindNoun(kind: CourseKind): string {
  return kind === "coding" ? "programming course" : "college course";
}
