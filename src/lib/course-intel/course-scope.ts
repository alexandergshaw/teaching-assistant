// course-intel: WHICH COURSE A QUESTION IS ABOUT, resolved against the
// instructor's own course list - and the rewrite that keeps every course name
// out of the prompt.
//
// D24b of docs/course-student-intelligence-acceptance-criteria.md removed the
// course picker, so the question itself now carries the scope: "what students
// are struggling in Ethical Hacking?" names its course, and "what courses have
// had the least amount of items turned in late" names none and is about all of
// them.
//
// THIS IS ./question-scope's DISCIPLINE APPLIED TO COURSES, deliberately: the
// same longest-first alternation, the same `\p{L}\p{N}` lookaround boundaries,
// the same refusal to guess, and the same rewrite-then-assert contract. Read
// that module first; this one is the sibling, not a second design.
//
// BUT COURSE NAMES COLLIDE HARDER THAN STUDENT NAMES, and that inverts which
// case is the exception. Two students sharing a name is uncommon. The SAME
// COURSE RUNS EVERY TERM, so two "Ethical Hacking" rows differing only by term
// is the normal case. A scoper that merely refused on collision would refuse
// on most real questions, so this one resolves well before it refuses:
//
//   1. If exactly one of the colliding rows is CURRENTLY IN SESSION according
//      to the instructor's own course list, that one wins. The caller computes
//      that flag (coursesInSession, src/lib/courses-in-session.ts) because it
//      needs a clock and this module has none.
//   2. Otherwise it refuses AND SHOWS THE TERMS, since the term is the only
//      thing distinguishing the rows. A refusal that listed two identical
//      names would be unanswerable.
//
// WHOLE FORMS ONLY - NO SINGLE-TOKEN FALLBACK, and this is the one place this
// module deliberately does LESS than ./question-scope. There, a lone token is
// a student's first or last name and resolving it is the common case. Here a
// lone token of a course name is an ordinary English word - "Introduction",
// "Security", "Programming", "Networks" - and matching on it would turn half
// the vocabulary of this feature's own questions into course references. So a
// course is recognised by a COMPLETE form (its name, its code, or either of
// those followed by its term) and nothing shorter. A one-word course name is
// still its own complete form, and it is still protected by the stopword set
// this module borrows rather than re-spells.
//
// THE REWRITE IS NOT OPTIONAL AND IS NOT COSMETIC. A course name in a prompt
// is a disclosure and a false precision at once: it tells a third-party model
// what the instructor teaches, and it invites the model to answer from what it
// knows about "Ethical Hacking" rather than from the rows it was given. The
// prompt builders embed `questionForModel` verbatim, so this module rewrites
// every course name to its marker (C1, C2, ...) and `assertNoCourseNameRemains`
// throws rather than returning if one survives.
//
// COMPOSES WITH ./question-scope, IN THIS ORDER: courses first, students
// second. The course rewrite only ever REMOVES text, so a student name that
// survives it is still there for the student scoper to find; doing it the
// other way round would let a student marker land inside a course name and
// break the course match. The caller feeds this module's `questionForModel`
// into `scopeCourseIntelQuestion` as its `question`.
//
// PURE LEAF: no clock, no I/O, no randomness. Everything about the courses -
// including whether one is running right now - arrives as a parameter.

import { SINGLE_TOKEN_STOPWORDS } from "./question-scope";

/** A course's position in THIS answer, 1-based. `C1`, `C2`, and so on - the
 *  course-level twin of StudentIndex, and it exists for the same reason: the
 *  model is shown a marker, and the instructor's own browser resolves it back
 *  to a name locally. */
export type CourseIndex = number;

/** Render one course marker. One literal, one renderer, so the prompt and any
 *  consumer resolving a marker can never drift apart. */
export function renderCourseMarker(index: CourseIndex): string {
  return `C${index}`;
}

/**
 * One course as this module needs to see it.
 *
 * Structurally a subset of `Course` (src/lib/supabase/courses.types.ts) apart
 * from `active`, so a caller passes course rows straight in once it has
 * computed that flag.
 */
export interface ScopeCourseEntry {
  /** The course_hub row id. Never a Canvas numeric id, never a Canvas URL. */
  readonly courseId: string;
  readonly name: string;
  readonly courseCode: string | null;
  readonly term: string | null;
  /**
   * Whether the instructor's own course list says this course is running right
   * now.
   *
   * A PARAMETER, not a computation. `coursesInSession` already owns this
   * decision (start and end dates inclusive, structured breaks removed), it is
   * a frozen file with its own tests, and it needs a reference date - so the
   * caller runs it and this module is handed the answer.
   */
  readonly active: boolean;
}

/** One course the question could have meant, as reported back to the browser
 *  that typed it. The TERM is carried because on the common collision it is
 *  the only thing telling the two rows apart. */
export interface CourseScopeCandidate {
  readonly courseId: string;
  /** "" when the course list records no term for this row. */
  readonly term: string;
}

/** One collision this module resolved rather than refused, so the caller can
 *  say so. An instructor who typed "Ethical Hacking" and got the Fall row
 *  should be told the Spring row exists and was set aside. */
export interface ActiveTermPick {
  /** The exact run of characters from the instructor's OWN question. */
  readonly matchedText: string;
  readonly courseId: string;
  readonly setAside: readonly CourseScopeCandidate[];
}

/** Which of D24c's three scopes this question is. */
export type CourseScopeKind = "one-course" | "some-courses" | "all-courses";

export type CourseScopeResult =
  | {
      readonly status: "scoped";
      readonly kind: CourseScopeKind;
      /**
       * The courses to answer over, ALWAYS concrete and ALWAYS in the
       * instructor's own list order.
       *
       * `all-courses` returns every id rather than an empty list on purpose:
       * the caller then has no branch, and the C-marker for a course is simply
       * its position in this array in every scope.
       */
      readonly courseIds: readonly string[];
      /**
       * The instructor's question with every course name replaced by that
       * course's marker. THE ONLY string this module produces that may be
       * composed into a prompt.
       */
      readonly questionForModel: string;
      readonly activeTermPicks: readonly ActiveTermPick[];
    }
  | {
      /**
       * One name in the question matches more than one course and no single
       * one of them is in session. Nothing is fetched and nothing is sent.
       */
      readonly status: "ambiguous";
      readonly matchedText: string;
      readonly candidates: readonly CourseScopeCandidate[];
    };

/**
 * A form shorter than this is never used to recognise a course.
 *
 * Three characters, matching the existing chat entity grounder's own
 * MIN_COURSE_NAME_LENGTH. A two-character course name would match inside far
 * too much ordinary text even with word boundaries, and the cost of missing it
 * is a whole-courses answer the instructor can immediately see is wider than
 * they asked for.
 */
export const MIN_COURSE_FORM_CHARS = 3;

/**
 * Canonical form of a course name, code, or a run of text that might be one.
 *
 * Lowercased, with every run of whitespace, comma, slash, underscore, hyphen
 * and parenthesis collapsed to a single space. Collapsing the hyphen and the
 * slash is what makes "CIS-4200" and "CIS 4200" the same key - course codes
 * are written both ways by the same person on the same day - and collapsing
 * the parenthesis is what makes "Ethical Hacking (Fall 2025)" resolve when the
 * instructor types it without the brackets.
 */
function canonicalize(value: string): string {
  return value.toLowerCase().replace(/[\s,()/_-]+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every form of one course this module will recognise in a question.
 *
 * Four complete forms and no fragments: the name, the code, and each of those
 * followed by the term. The term-qualified forms are what make a refusal
 * ANSWERABLE - an instructor told "two courses match Ethical Hacking (Fall
 * 2025, Spring 2025)" can retype one of those and be understood, and longest-
 * first alternation guarantees the qualified form wins over the bare one.
 *
 * Exported because it is the whole vocabulary the rewrite is checked against,
 * and a test that cannot see it can only assert on examples.
 */
export function courseNameVariants(entry: ScopeCourseEntry): string[] {
  const name = canonicalize(entry.name);
  const code = canonicalize(entry.courseCode ?? "");
  const term = canonicalize(entry.term ?? "");

  const forms = new Set<string>();
  const add = (form: string): void => {
    if (form.length < MIN_COURSE_FORM_CHARS) return;
    // A course genuinely called "Late" or "Work" would otherwise consume the
    // word in "what courses have had the least amount of items turned in
    // late". The two failure directions are not symmetric and this picks the
    // safe one: a course that fails to resolve produces an all-courses answer
    // the instructor can see is wider than they asked, while a false positive
    // narrows the answer to one course and looks entirely normal.
    if (!form.includes(" ") && SINGLE_TOKEN_STOPWORDS.has(form)) return;
    forms.add(form);
  };

  add(name);
  add(code);
  if (term) {
    if (name) add(`${name} ${term}`);
    if (code) add(`${code} ${term}`);
  }
  return [...forms];
}

interface CourseMatcher {
  readonly byVariant: ReadonlyMap<string, readonly ScopeCourseEntry[]>;
  readonly pattern: string;
}

/**
 * One alternation over every variant of every course, longest first.
 *
 * LONGEST FIRST IS THE WHOLE TRICK, exactly as in ./question-scope: JavaScript
 * alternation is leftmost-first, so ordering by descending length makes
 * "ethical hacking fall 2025" win over "ethical hacking" at the same position.
 * Without it the term-qualified form could never be reached and the collision
 * this module exists to resolve would be unanswerable even when the instructor
 * spelled it out.
 *
 * Returns null when the course list yields no usable variant at all - a real
 * case (no courses, or every name too short) that a caller must not build a
 * regex from, since `(?:)` matches the empty string everywhere.
 */
function buildCourseMatcher(courses: readonly ScopeCourseEntry[]): CourseMatcher | null {
  const byVariant = new Map<string, ScopeCourseEntry[]>();
  for (const entry of courses) {
    for (const variant of courseNameVariants(entry)) {
      const list = byVariant.get(variant);
      if (list) {
        // The same canonical form, two different courses. Kept as a list
        // rather than overwritten: this IS the every-term collision, and
        // last-write-wins here would make it silently disappear.
        if (!list.some((c) => c.courseId === entry.courseId)) list.push(entry);
      } else {
        byVariant.set(variant, [entry]);
      }
    }
  }

  const keys = [...byVariant.keys()].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  if (keys.length === 0) return null;

  const alternation = keys
    .map((key) => key.split(" ").map(escapeRegExp).join("[\\s,()/_-]+"))
    .join("|");
  return {
    byVariant,
    pattern: `(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`,
  };
}

/** A fresh regex per use. A `g`-flagged RegExp carries `lastIndex` across
 *  calls, and reusing one instance for the scan, the rewrite and the final
 *  check would make the check silently start partway through the string. */
function matcherRegExp(pattern: string): RegExp {
  return new RegExp(pattern, "giu");
}

/**
 * Throw if any course's name is still present in `text`.
 *
 * The last line of defence before a string becomes a prompt, and a THROW for
 * the same reason `assertNoStudentNameRemains` is one: a question that still
 * carries a course name is not a degraded request, it is one that must not be
 * sent, and handing it back would put the failure somewhere nobody is looking.
 *
 * UNREACHABLE ON CORRECT CODE, which is exactly why it is its own exported
 * function rather than an inline `if` - an inline assertion would be a line no
 * test could ever drive, and an untested guard is a guard nobody knows still
 * works.
 */
export function assertNoCourseNameRemains(text: string, courses: readonly ScopeCourseEntry[]): void {
  const matcher = buildCourseMatcher(courses);
  if (!matcher) return;
  if (matcherRegExp(matcher.pattern).test(text)) {
    throw new Error(
      "course-intel: a course name survived the question rewrite - refusing to build a prompt from it."
    );
  }
}

interface CourseOccurrence {
  /** Exactly as it appeared in the instructor's question. */
  readonly text: string;
  readonly courses: readonly ScopeCourseEntry[];
}

function findOccurrences(question: string, matcher: CourseMatcher): CourseOccurrence[] {
  const found: CourseOccurrence[] = [];
  for (const match of question.matchAll(matcherRegExp(matcher.pattern))) {
    const text = match[0];
    const courses = matcher.byVariant.get(canonicalize(text));
    // Unreachable in practice: every alternative was built from a key of this
    // same map. Skipped rather than thrown so a future change to the pattern
    // degrades to "named no course" - an all-courses answer the instructor can
    // see - rather than a 500 on a question that looks fine to them.
    if (!courses || courses.length === 0) continue;
    found.push({ text, courses });
  }
  return found;
}

function toCandidate(entry: ScopeCourseEntry): CourseScopeCandidate {
  return { courseId: entry.courseId, term: (entry.term ?? "").trim() };
}

export interface ScopeCoursesArgs {
  readonly question: string;
  /** The instructor's OWN courses, in their own list order. That order becomes
   *  the C-marker order for an all-courses answer, so it must be stable. */
  readonly courses: readonly ScopeCourseEntry[];
}

/**
 * Decide which of the instructor's courses a question is about, and rewrite it
 * so no course name goes with it.
 *
 * The order of the checks is load-bearing and mirrors ./question-scope's:
 *
 *  1. AMBIGUITY FIRST, after the in-session tiebreak has had its chance. If an
 *     occurrence still matches more than one course, the answer is a refusal -
 *     before anything is fetched and before any prompt exists to leak into.
 *  2. NOBODY NAMED is not an error, it is the THIRD SCOPE. "What courses have
 *     had the least amount of items turned in late" names no course and is
 *     about all of them, which is the one question the old picker made
 *     impossible to ask.
 *  3. MORE THAN ONE COURSE NAMED is answered rather than refused, over exactly
 *     the named courses. Unlike the student case - where the shape type holds
 *     one index and answering about the first would silently narrow the
 *     question - a cross-course answer already handles N courses, so a
 *     two-course question is the same machinery with a smaller N. Nothing is
 *     dropped and the coverage statement names both.
 */
export function scopeCourseIntelCourses(args: ScopeCoursesArgs): CourseScopeResult {
  const question = args.question.trim();
  const allIds = args.courses.map((course) => course.courseId);
  const matcher = buildCourseMatcher(args.courses);
  const occurrences = matcher ? findOccurrences(question, matcher) : [];

  const picks = new Map<string, ScopeCourseEntry>();
  const activeTermPicks: ActiveTermPick[] = [];

  for (const occurrence of occurrences) {
    if (occurrence.courses.length === 1) {
      const only = occurrence.courses[0];
      picks.set(only.courseId, only);
      continue;
    }
    // THE EVERY-TERM COLLISION, and the reason this module resolves before it
    // refuses. Exactly one row in session is the common shape and it is not a
    // guess - it is the instructor's own start and end dates saying which
    // course they are teaching right now.
    const inSession = occurrence.courses.filter((course) => course.active);
    if (inSession.length !== 1) {
      return {
        status: "ambiguous",
        matchedText: occurrence.text,
        candidates: occurrence.courses.map(toCandidate),
      };
    }
    const picked = inSession[0];
    picks.set(picked.courseId, picked);
    activeTermPicks.push({
      matchedText: occurrence.text,
      courseId: picked.courseId,
      setAside: occurrence.courses.filter((c) => c.courseId !== picked.courseId).map(toCandidate),
    });
  }

  // List order, never first-mention order: the C-marker for a course is its
  // position in `courseIds`, and an answer whose markers depended on the order
  // two names happened to appear in a sentence would number the same courses
  // differently for two phrasings of the same question.
  const namedIds = allIds.filter((id) => picks.has(id));
  const kind: CourseScopeKind =
    namedIds.length === 0 ? "all-courses" : namedIds.length === 1 ? "one-course" : "some-courses";
  const courseIds = kind === "all-courses" ? allIds : namedIds;

  const markerByCourseId = new Map<string, string>();
  courseIds.forEach((id, position) => markerByCourseId.set(id, renderCourseMarker(position + 1)));

  // Every occurrence, not only the first: "how is Ethical Hacking doing - are
  // the Ethical Hacking students behind?" is ordinary phrasing, and a rewrite
  // that stopped at the first one would send the second.
  const questionForModel = matcher
    ? question.replace(matcherRegExp(matcher.pattern), (whole) => {
        const candidates = matcher.byVariant.get(canonicalize(whole)) ?? [];
        const resolved = candidates.find((course) => picks.has(course.courseId));
        // A matched course that is not in scope still has its name removed -
        // it is replaced with the neutral word rather than a marker it has no
        // entry for. Leaving the name in place would defeat the whole rewrite
        // for the one phrasing that mentions a course it does not ask about.
        return (resolved && markerByCourseId.get(resolved.courseId)) || "that course";
      })
    : question;

  // The guarantee, asserted rather than assumed - see the function's own doc
  // for why it is a throw and why it lives outside this one.
  assertNoCourseNameRemains(questionForModel, args.courses);

  return { status: "scoped", kind, courseIds, questionForModel, activeTermPicks };
}
