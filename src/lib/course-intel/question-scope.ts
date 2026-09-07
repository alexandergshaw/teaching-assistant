// course-intel: deciding what a question may ask for, and - the part that
// carries a guarantee wave 1 could not - REWRITING THE INSTRUCTOR'S OWN WORDS
// SO NO STUDENT NAME EVER REACHES THE MODEL.
//
// THIS IS WHERE D7 ACTUALLY LIVES. The prompt builder (./prompt) is handed no
// roster by design, so it cannot verify that its `questionForModel` is
// name-free; its own doc comment names that as the caller's contract and
// refuses to dress it up as a guard. This module IS that caller's half of the
// contract. buildStudentQuestionTurns embeds the question twice, verbatim, in
// the material it sends - so "how is Alex Rivera doing" would put a real
// student's name into a third-party model call no matter how carefully every
// other block was pseudonymised. Everything the index markers buy is undone by
// one un-rewritten question.
//
// AN AMBIGUOUS NAME RESOLVES TO NOTHING AND IS REPORTED, NEVER GUESSED. Two
// students called Alex means the instructor is asked which one they meant.
// Picking one silently is the exact failure the whole identity design exists
// to prevent (see CanvasUserId's doc in ./types: this repo already ships a
// feature that matches people by Levenshtein distance because names were all
// its pipeline had). A refusal costs one click; a silent wrong pick reports a
// quiet student as struggling on somebody else's record.
//
// PURE LEAF: no clock, no I/O, no randomness, no imports beyond the shared
// types. Everything it needs about the roster arrives as a parameter.

import type { CanvasUserId, CourseIntelQuestionShape, StudentIndex } from "./types";

/**
 * One student as this module needs to see them.
 *
 * Structurally a subset of CourseStudentRecord, so the caller passes the
 * already-built signals-tier assembly's `students` array straight in. It
 * carries NO login id and no email, and the type cannot express one - see D13:
 * a login id is a client-side disambiguator that may reach a citation chip in
 * the instructor's own browser and may never reach a prompt, and the roster
 * reader an implementer copies hands it over for free.
 */
export interface ScopeRosterEntry {
  readonly index: StudentIndex;
  readonly userId: CanvasUserId;
  readonly name: string;
  readonly sortableName: string;
}

/** A student the question resolved to, by INDEX. Never a name: the caller
 * resolves an index back to a person locally, in the browser. */
export interface ScopeSubject {
  readonly index: StudentIndex;
  readonly userId: CanvasUserId;
}

export interface ScopeQuestionArgs {
  readonly question: string;
  readonly roster: readonly ScopeRosterEntry[];
  /**
   * Whether a "how is Y doing" question may carry that student's own writing.
   *
   * Defaults to FALSE, which is D7's minimisation table: the status question
   * is answerable from five numbers, and prose rides only behind an explicit
   * opt-in the instructor made. A "what areas has Y asked about" question is
   * different in kind - the writing IS the payload there - so that shape
   * always carries text and does not consult this flag.
   */
  readonly includeStudentTextForStatus?: boolean;
}

export type QuestionScopeResult =
  | {
      readonly status: "scoped";
      readonly shape: CourseIntelQuestionShape;
      /**
       * The instructor's question with every student name replaced by that
       * student's index marker. THE ONLY string this module produces that may
       * be composed into a prompt.
       */
      readonly questionForModel: string;
      /** Whom the question is about. `null` for the concern shape, which is
       * about the whole course and names nobody. */
      readonly subject: ScopeSubject | null;
    }
  | {
      /** One name in the question matches more than one student. Nothing is
       * fetched, nothing is sent, and the instructor is asked which. */
      readonly status: "ambiguous";
      /** The exact run of characters from the instructor's OWN question that
       * matched more than one student. It never goes to the model - it goes
       * back to the browser it was typed in, so the instructor can see which
       * word was the problem. */
      readonly matchedText: string;
      readonly candidates: readonly ScopeSubject[];
    }
  | {
      /**
       * The question names two or more different students. Refused rather
       * than narrowed: CourseIntelQuestionShape carries exactly one
       * studentIndex, and "compare A and B" is the cross-student comparison
       * this feature deliberately does not do. Answering about only the first
       * one would silently drop half the question.
       */
      readonly status: "multiple-students";
      readonly subjects: readonly ScopeSubject[];
    };

/**
 * Cues that turn a per-student question into the TOPICS shape - the one whose
 * payload is the student's own writing.
 *
 * Matched as plain lowercase substrings rather than parsed, because the
 * decision they drive is coarse and safe in both directions: a status question
 * misread as a topics question fetches one student's text it did not need
 * (more work, no wider disclosure - it is still only that student's writing),
 * and a topics question misread as a status question answers from the signals
 * and says plainly that it was given no posts or messages, which is the
 * behaviour buildStudentQuestionTurns already spells out for includeText
 * false.
 */
export const QUESTION_TOPIC_CUES: readonly string[] = Object.freeze([
  "ask about",
  "asked about",
  "asking about",
  "asks about",
  "area",
  "topic",
  "question",
  "post",
  "wrote",
  "writing",
  "written",
  "write",
  "said",
  "say",
  "mention",
  "discuss",
  "reply",
  "replies",
  "message",
  "brought up",
  "bring up",
  "raised",
  "talked about",
  "talk about",
  "comment",
]);

/**
 * Words that may never, on their own, resolve to a student.
 *
 * A full name is matched as a whole and needs no protection; a SINGLE token
 * does. A student named May, Will, Mark or Grace - all real names, all
 * ordinary English words - would otherwise turn every question containing that
 * word into a question about them, including "who are the students of
 * concern". The two failure directions are not symmetric and this list picks
 * the safe one deliberately: a name that fails to resolve produces a
 * whole-course answer the instructor can immediately see is not what they
 * asked (and their full name still resolves), while a false positive produces
 * a confident answer about the wrong person, which looks entirely normal.
 *
 * The list is small on purpose. It covers question words, articles, pronouns
 * and the handful of ordinary words this feature's own vocabulary is built
 * from - not an attempt at an English dictionary.
 */
export const SINGLE_TOKEN_STOPWORDS: ReadonlySet<string> = new Set([
  "a", "about", "all", "an", "and", "any", "are", "area", "areas", "as", "ask",
  "asked", "asking", "asks", "assignment", "assignments", "at", "be", "been",
  "but", "by", "can", "class", "concern", "concerned", "concerns", "could",
  "course", "did", "do", "does", "doing", "for", "from", "grade", "graded",
  "grades", "grading", "had", "has", "have", "he", "her", "hers", "him", "his",
  "how", "i", "in", "is", "it", "its", "late", "make", "mark", "marked",
  "marks", "may", "me", "might", "missing", "more", "most", "much", "must",
  "my", "no", "not", "of", "on", "or", "our", "out", "post", "posts", "risk",
  "say", "says", "score", "scores", "she", "should", "so", "student",
  "students", "submission", "submissions", "such", "that", "the", "their",
  "them", "these", "they", "this", "those", "to", "topic", "topics", "up",
  "us", "was", "we", "well", "were", "what", "when", "where", "which", "while",
  "who", "whom", "whose", "why", "will", "with", "work", "would", "you",
  "your",
]);

/**
 * Canonical form of a name or of a run of text that might be one: lowercase,
 * with every run of whitespace AND commas collapsed to a single space.
 *
 * Collapsing the comma is what makes "Rivera, Alex" (the sortable name Canvas
 * returns) and "Rivera Alex" the same key, and it is why the generated pattern
 * below treats a comma as a separator rather than as a character to match.
 */
function canonicalize(value: string): string {
  return value.toLowerCase().replace(/[\s,]+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every form of one student's name this module will recognise in a question.
 *
 * Three multi-token forms - the display name, the sortable name, and the
 * sortable name flipped back into reading order ("Rivera, Alex" -> "alex
 * rivera") - plus each individual token as a single-token fallback. Canonical
 * (see canonicalize), so duplicates between the forms collapse on their own:
 * for most students `name` and the flipped `sortableName` are the same string.
 *
 * Exported because it is the whole vocabulary the rewrite is checked against,
 * and a test that cannot see it can only assert on examples.
 */
export function studentNameVariants(entry: ScopeRosterEntry): string[] {
  const display = canonicalize(entry.name);
  const sortable = canonicalize(entry.sortableName);

  const forms = new Set<string>();
  if (display) forms.add(display);
  if (sortable) forms.add(sortable);

  // "Rivera, Alex" -> "alex rivera". Split on the ORIGINAL comma, before
  // canonicalize erases it - after canonicalization there is nothing left to
  // tell a "Last, First" from a "First Last".
  const commaAt = entry.sortableName.indexOf(",");
  if (commaAt > 0) {
    const last = canonicalize(entry.sortableName.slice(0, commaAt));
    const first = canonicalize(entry.sortableName.slice(commaAt + 1));
    if (last && first) forms.add(`${first} ${last}`);
  }

  const variants = new Set<string>(forms);
  for (const form of forms) {
    for (const token of form.split(" ")) {
      if (token.length < 2) continue;
      if (SINGLE_TOKEN_STOPWORDS.has(token)) continue;
      variants.add(token);
    }
  }
  return [...variants];
}

/**
 * One alternation over every variant of every student, longest first.
 *
 * LONGEST FIRST IS THE WHOLE TRICK. JavaScript alternation is leftmost-first,
 * so ordering the alternatives by descending length makes the longest name
 * that starts at a given position win: "Alex Rivera" is consumed as one
 * occurrence rather than as the token "Alex" followed by the token "Rivera".
 * Without it, every full name in a course with two students sharing a first
 * name would read as ambiguous.
 *
 * The boundaries are `\p{L}\p{N}` lookarounds rather than `\b`, deliberately:
 * `\b` is ASCII-word-based, so it puts a boundary in the middle of an accented
 * name and would match "Jose" inside "Josefina". A possessive still resolves -
 * "Alex's grades" ends the match at the apostrophe, which is neither a letter
 * nor a number.
 *
 * Returns null when the roster yields no usable variant at all, which is a
 * real case (a course whose roster read failed, or one with no students): the
 * caller must not build a regex from an empty alternation, since `(?:)`
 * matches the empty string everywhere.
 */
function buildNameMatcher(roster: readonly ScopeRosterEntry[]): {
  readonly byVariant: ReadonlyMap<string, readonly ScopeRosterEntry[]>;
  readonly pattern: string;
} | null {
  const byVariant = new Map<string, ScopeRosterEntry[]>();
  for (const entry of roster) {
    for (const variant of studentNameVariants(entry)) {
      const list = byVariant.get(variant);
      if (list) {
        // Same canonical name, two different people. Kept as a list rather
        // than overwritten: this IS the ambiguity the caller refuses on, and
        // last-write-wins here would silently make it disappear.
        if (!list.some((s) => s.index === entry.index)) list.push(entry);
      } else {
        byVariant.set(variant, [entry]);
      }
    }
  }

  const keys = [...byVariant.keys()].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  if (keys.length === 0) return null;

  const alternation = keys
    .map((key) => key.split(" ").map(escapeRegExp).join("[\\s,]+"))
    .join("|");
  return {
    byVariant,
    pattern: `(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`,
  };
}

/** A fresh regex per use. A `g`-flagged RegExp carries `lastIndex` across
 * calls, and reusing one instance for the scan, the rewrite and the final
 * check would make the check silently start partway through the string. */
function matcherRegExp(pattern: string): RegExp {
  return new RegExp(pattern, "giu");
}

/**
 * Throw if any student's name is still present in `text`.
 *
 * The last line of defence before a string becomes a prompt, and it is
 * deliberately a THROW rather than a returned flag: a question that still
 * carries a student's name is not a degraded request, it is one that must not
 * be sent, and handing it back would put the failure somewhere nobody is
 * looking. Mirrors assertUsableNonce in ./context-block, which refuses to
 * return a context block whose delimiter cannot do its job.
 *
 * UNREACHABLE ON CORRECT CODE, and that is exactly why it is its own exported
 * function rather than an inline `if`. The rewrite uses the same alternation
 * this check uses, so on a correct rewrite there is nothing left to find - an
 * inline assertion would therefore be a line no test could ever drive, and an
 * untested guard is a guard nobody knows still works. Exported, it is testable
 * on its own terms, and any future caller that composes a question by another
 * route can reuse it.
 */
export function assertNoStudentNameRemains(text: string, roster: readonly ScopeRosterEntry[]): void {
  const matcher = buildNameMatcher(roster);
  if (!matcher) return;
  if (matcherRegExp(matcher.pattern).test(text)) {
    throw new Error(
      "course-intel: a student name survived the question rewrite - refusing to build a prompt from it."
    );
  }
}

interface NameOccurrence {
  /** Exactly as it appeared in the instructor's question. */
  readonly text: string;
  readonly students: readonly ScopeRosterEntry[];
}

function findOccurrences(
  question: string,
  matcher: { readonly byVariant: ReadonlyMap<string, readonly ScopeRosterEntry[]>; readonly pattern: string }
): NameOccurrence[] {
  const found: NameOccurrence[] = [];
  for (const match of question.matchAll(matcherRegExp(matcher.pattern))) {
    const text = match[0];
    const students = matcher.byVariant.get(canonicalize(text));
    // Unreachable in practice: every alternative in the pattern was built from
    // a key of this same map. Skipped rather than thrown so a future change to
    // the pattern degrades to "resolved nobody" (a whole-course answer) rather
    // than to a 500 on a question the instructor can see nothing wrong with.
    if (!students || students.length === 0) continue;
    found.push({ text, students });
  }
  return found;
}

function toSubject(entry: ScopeRosterEntry): ScopeSubject {
  return { index: entry.index, userId: entry.userId };
}

function questionAsksAboutWriting(question: string): boolean {
  const lowered = question.toLowerCase();
  return QUESTION_TOPIC_CUES.some((cue) => lowered.includes(cue));
}

/**
 * Decide the shape of one question, and rewrite it so no name goes with it.
 *
 * The order of the checks is load-bearing:
 *
 *  1. AMBIGUITY FIRST. If any single occurrence matches more than one student,
 *     the answer is a refusal - before any shape is chosen, before anything is
 *     fetched, and before any prompt exists to leak into. Choosing a shape and
 *     then discovering the ambiguity would mean the expensive text tier had
 *     already been fetched for a question that will not be answered.
 *  2. MORE THAN ONE STUDENT NAMED. Also a refusal, and for a different reason:
 *     the shape type holds one index, so answering would silently narrow the
 *     question rather than answer it.
 *  3. NOBODY NAMED - the concern shape. Note what this means in practice: the
 *     owner's hardest question is the one that needs no name resolution at
 *     all, sends no prose, and is answered entirely from the signals tier.
 */
export function scopeCourseIntelQuestion(args: ScopeQuestionArgs): QuestionScopeResult {
  const question = args.question.trim();
  const matcher = buildNameMatcher(args.roster);
  const occurrences = matcher ? findOccurrences(question, matcher) : [];

  const ambiguous = occurrences.find((occurrence) => occurrence.students.length > 1);
  if (ambiguous) {
    return {
      status: "ambiguous",
      matchedText: ambiguous.text,
      candidates: ambiguous.students.map(toSubject),
    };
  }

  const distinct = new Map<StudentIndex, ScopeRosterEntry>();
  for (const occurrence of occurrences) {
    const student = occurrence.students[0];
    if (!distinct.has(student.index)) distinct.set(student.index, student);
  }

  if (distinct.size > 1) {
    return { status: "multiple-students", subjects: [...distinct.values()].map(toSubject) };
  }

  if (distinct.size === 0) {
    return {
      status: "scoped",
      shape: { kind: "concern" },
      // Unchanged, and unused on this path: buildConcernExplanationTurns takes
      // no question at all - it is handed the deterministic rows and told to
      // explain them - so the concern question's text never reaches the model
      // whether it was rewritten or not.
      questionForModel: question,
      subject: null,
    };
  }

  const subject = [...distinct.values()][0];
  const marker = `S${subject.index}`;
  // Every occurrence, not only the first: a name appears more than once far
  // more often than it appears exactly once ("Alex Rivera - how is Alex
  // doing?"), and a rewrite that stopped at the first one would send the
  // second.
  const questionForModel = question.replace(matcherRegExp(matcher!.pattern), marker);

  // The guarantee, asserted rather than assumed - see the function's own doc
  // for why it is a throw and why it lives outside this one.
  assertNoStudentNameRemains(questionForModel, args.roster);

  const shape: CourseIntelQuestionShape = questionAsksAboutWriting(question)
    ? { kind: "student-topics", studentIndex: subject.index }
    : {
        kind: "student-status",
        studentIndex: subject.index,
        includeText: args.includeStudentTextForStatus === true,
      };

  return { status: "scoped", shape, questionForModel, subject: toSubject(subject) };
}

/**
 * Does this shape need the expensive text tier at all?
 *
 * The single place that decision is spelled out, so the fetch orchestrator and
 * the context builder cannot disagree about it. `student-status` is the only
 * shape where it is a choice rather than a property of the question.
 */
export function shapeNeedsStudentText(shape: CourseIntelQuestionShape): boolean {
  switch (shape.kind) {
    case "concern":
      return false;
    case "student-status":
      return shape.includeText;
    case "student-topics":
      return true;
  }
}
