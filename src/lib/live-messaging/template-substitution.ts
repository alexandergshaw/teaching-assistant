/**
 * L6 - pure per-student template substitution (LIVE-LMS-STUDENT-MESSAGING W1).
 *
 * THE ATTRIBUTION GUARANTEE LIVES HERE. renderForStudents resolves the tokens
 * once PER STUDENT from that student's OWN values; there is no shared snapshot
 * a student's grade could leak out of into another student's message. The
 * removal test is in template-substitution.test.ts.
 *
 * Tokens (whitespace inside the braces is tolerated):
 *   {{first_name}} {{last_name}} {{course}} {{section}}
 *   {{#_missing_assignments}} {{grade}}
 *
 * Output is PLAIN TEXT (a Canvas conversation body), so values are neutralised
 * against template syntax and control characters, not HTML-escaped.
 *
 * Missing-value behaviour (explicit, never a literal "undefined" or a leftover
 * "{{x}}" for a known token):
 *   - a KNOWN token whose value is absent renders as the empty string and is
 *     listed in `unresolved`;
 *   - an UNKNOWN token (a typo such as {{frist_name}}) is left literally in the
 *     text so the author can see it, and is listed in `unknown`.
 * A caller must treat `unresolved.length + unknown.length > 0` as "do not send"
 * (see isSendable).
 */

export const TEMPLATE_TOKENS = [
  "first_name",
  "last_name",
  "course",
  "section",
  "#_missing_assignments",
  "grade",
] as const;

export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];

/** One student's OWN live values for the tokens. null/"" means "no value". */
export interface StudentTokenValues {
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly course: string | null;
  readonly section: string | null;
  /** Count of Canvas-reported missing assignments. */
  readonly missingCount: number | null;
  /** Canvas current_score (a percentage). */
  readonly grade: number | null;
}

export interface RenderResult {
  readonly text: string;
  /** Known tokens used in the template that had no value for this student. */
  readonly unresolved: readonly TemplateToken[];
  /** Tokens in the template that are not part of the vocabulary. */
  readonly unknown: readonly string[];
}

const TOKEN_PATTERN = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;
const KNOWN = new Set<string>(TEMPLATE_TOKENS);
const MAX_VALUE_LENGTH = 200;

/**
 * Splits a Canvas user into first and last name.
 *
 * Rule: Canvas's sortable_name is "Last, First". Last = the text before the
 * FIRST comma; first = the text after it up to any further comma (so a
 * trailing ", Jr." is not swallowed), trimmed, with multi-part given names kept
 * whole ("Smith, Mary Ann" -> first "Mary Ann"). With no usable sortable_name,
 * fall back to the display name: last = its final whitespace token, first = the
 * rest. A single-token name yields first = the token and last = "".
 */
export function parseCanvasName(
  sortableName: string | null | undefined,
  name: string | null | undefined
): { firstName: string; lastName: string } {
  const sortable = (sortableName ?? "").trim();
  if (sortable.includes(",")) {
    const parts = sortable.split(",");
    const last = parts[0].trim();
    const first = (parts[1] ?? "").trim();
    if (first || last) return { firstName: first, lastName: last };
  }
  const display = (name ?? "").trim() || sortable;
  if (!display) return { firstName: "", lastName: "" };
  const tokens = display.split(/\s+/);
  if (tokens.length === 1) return { firstName: tokens[0], lastName: "" };
  return { firstName: tokens.slice(0, -1).join(" "), lastName: tokens[tokens.length - 1] };
}

/** Makes a value safe to splice into a plain-text message: no template syntax,
 * no control characters, bounded length. */
export function neutraliseValue(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (ch === "{" || ch === "}") continue;
    out += code < 32 || code === 127 ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, MAX_VALUE_LENGTH);
}

function formatGrade(grade: number | null): string | null {
  if (grade === null || !Number.isFinite(grade)) return null;
  return `${Math.round(grade * 100) / 100}%`;
}

function valueFor(token: TemplateToken, v: StudentTokenValues): string | null {
  switch (token) {
    case "first_name":
      return v.firstName;
    case "last_name":
      return v.lastName;
    case "course":
      return v.course;
    case "section":
      return v.section;
    case "#_missing_assignments":
      return v.missingCount !== null && Number.isFinite(v.missingCount) ? String(Math.trunc(v.missingCount)) : null;
    case "grade":
      return formatGrade(v.grade);
  }
}

/** Renders one template for one student from that student's own values. */
export function renderTemplate(template: string, values: StudentTokenValues): RenderResult {
  const unresolved: TemplateToken[] = [];
  const unknown: string[] = [];
  // A single replace pass with a callback: substituted values are never
  // re-scanned (so a value cannot expand a token) and "$&"-style replacement
  // patterns in a value are inert.
  const text = template.replace(TOKEN_PATTERN, (match, rawName: string) => {
    const name = rawName.trim();
    if (!KNOWN.has(name)) {
      if (!unknown.includes(name)) unknown.push(name);
      return match;
    }
    const token = name as TemplateToken;
    const raw = valueFor(token, values);
    const safe = raw === null ? "" : neutraliseValue(raw);
    if (!safe) {
      if (!unresolved.includes(token)) unresolved.push(token);
      return "";
    }
    return safe;
  });
  return { text, unresolved, unknown };
}

/** True when the render has nothing missing and nothing unrecognised. */
export function isSendable(result: RenderResult): boolean {
  return result.unresolved.length === 0 && result.unknown.length === 0;
}

export interface RenderedForStudent {
  readonly key: string;
  readonly subject: RenderResult;
  readonly body: RenderResult;
}

/**
 * Renders subject and body for each student from THAT student's own values.
 * This is the per-student binding the attribution claim rests on: each element
 * of `students` is resolved independently; nothing is hoisted out of the loop.
 */
export function renderForStudents(
  subjectTemplate: string,
  bodyTemplate: string,
  students: ReadonlyArray<{ readonly key: string; readonly values: StudentTokenValues }>
): RenderedForStudent[] {
  return students.map((student) => ({
    key: student.key,
    subject: renderTemplate(subjectTemplate, student.values),
    body: renderTemplate(bodyTemplate, student.values),
  }));
}
