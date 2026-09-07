// course-intel: the context block and the turns for an answer that spans more
// than one course.
//
// TWO THINGS THIS FILE OWNS THAT NOTHING ELSE DOES.
//
// 1. THE ANSWER'S OWN STUDENT NUMBERING (D24g). Every course numbers its own
//    students from 1, so S3 means a different person in each of them. In ONE
//    response that is a collision, and a collision in the one field this whole
//    feature uses instead of a name is the worst kind available: the answer
//    would read normally and be about the wrong person. So every course gets an
//    offset here, once, and the slices keep their course-local indices
//    everywhere else. `students` below carries the global index back to the
//    browser so the marker resolves to the right person in the right course.
//
// 2. THE SUPERLATIVE RULE (D24e), stated to the model AND made unnecessary.
//    A ranking asserts that everything was considered, so where coverage is
//    incomplete the instruction below forbids a bare superlative outright and
//    requires every comparison to name what it ranked over. That instruction is
//    a belt; the braces are that ./cross-course's `describeCourseCoverage`
//    renders the coverage as a fact the VIEW draws itself, so an answer that
//    ignores this instruction is still read beside a list of what was and was
//    not covered.
//
// THE MODEL IS SHOWN MARKERS AND NUMBERS. No course name, no student name, no
// login id. A course name in a prompt is a disclosure (it tells a third party
// what the instructor teaches) and a false precision at once (it invites an
// answer from what the model knows about "Ethical Hacking" rather than from
// the rows it was handed). ./course-scope rewrites the question the same way,
// for the same reason.
//
// THE COVERAGE BLOCK IS RENDERED TWICE, DELIBERATELY, and the two renderings
// are not interchangeable: `renderPromptCoverage` here is marker-only and goes
// to the model, and `describeCourseCoverage` in ./cross-course names the
// courses and goes to the instructor's own browser. Sharing one renderer would
// mean either naming courses to the model or showing the instructor a list of
// markers.
//
// PURE LEAF: no clock, no I/O, no randomness. The nonce arrives as a
// parameter, exactly as ./context-block requires of its callers.

import {
  CITATION_CONTRACT,
  COURSE_INTEL_CONTEXT_ACK_TEXT,
  FORMAT_CONTRACT,
  NO_SPECULATION_CONTRACT,
  courseIntelFramingHeader,
} from "./prompt";
import { renderBlockHeader, SIGNALS_BLOCK_LABEL, type MarkedStudent } from "./context-block";
import { renderCourseMarker, type CourseIndex } from "./course-scope";
import {
  courseReadMode,
  describeCourseCoverage,
  superlativeBasis,
  type CourseReadMode,
  type CourseSignalRollup,
  type CrossCourseSlice,
  type SuperlativeBasis,
} from "./cross-course";
import type { LlmContent } from "@/lib/llm";
import type { CanvasUserId, ConcernRow, LmsConnection, StudentIndex } from "./types";

/**
 * How many concern rows one cross-course answer may carry, across every
 * course.
 *
 * A cap rather than no cap because five courses of thirty students each can
 * produce a list longer than the answer, and the model's own output budget
 * would then truncate the explanation rather than the input - which drops rows
 * silently, in the one place D1's receipt cannot see it. Rows over the cap are
 * COUNTED and stated in the block itself, so a shortened list never reads as a
 * complete one.
 */
export const MAX_CROSS_COURSE_CONCERN_ROWS = 150;

/** One course, as the answer refers to it. */
export interface CrossCourseCourseLabel {
  readonly index: CourseIndex;
  readonly courseId: string;
  /** For the instructor's own browser. Never in the prompt. */
  readonly name: string;
  readonly mode: CourseReadMode;
  /** D24f: the mode belongs per course, so it travels per course. */
  readonly connection: LmsConnection;
  /** What was added to this course's local student indices to make them unique
   *  within the answer. Carried so a reader can check the arithmetic rather
   *  than trust it. */
  readonly studentIndexOffset: number;
}

/** One student, at their ANSWER-WIDE index, for the browser to resolve a
 *  marker with. */
export interface CrossCourseAnswerStudent {
  readonly index: StudentIndex;
  readonly courseIndex: CourseIndex;
  readonly name: string;
  readonly userId: CanvasUserId | null;
}

export interface CrossCourseContext {
  readonly text: string;
  readonly courses: readonly CrossCourseCourseLabel[];
  readonly students: readonly CrossCourseAnswerStudent[];
  readonly markedStudents: readonly MarkedStudent[];
  /** GLOBAL indices. The receipt check and the rendered signal strip both read
   *  these, so they must be the same numbers the prompt carried. */
  readonly concernRows: readonly ConcernRow[];
  /** Named, browser-bound coverage sentences - rendered by the view whether or
   *  not anything failed. */
  readonly coverageLines: readonly string[];
  readonly superlative: SuperlativeBasis;
  /** Concern rows the cap left out. Stated, never silently dropped. */
  readonly omittedConcernRows: number;
  /** Students examined across every course and found to have no concern
   *  signal. A count rather than a list, because naming them serves nobody. */
  readonly clearCount: number;
}

function count(value: number | null, unit: string, unavailable: string): string {
  return value === null ? unavailable : `${value} ${unit}`;
}

/**
 * One course's totals, from typed numbers only.
 *
 * `null` IS RENDERED AS A SENTENCE, never as a zero. "missing work could not be
 * computed for this course" and "0 missing" are opposite claims, and a ranking
 * built on the second when the first is true puts the least-measurable course
 * at the top of a "least missing work" list. Every branch here exists to stop
 * that one sentence.
 */
export function renderRollupLine(marker: string, rollup: CourseSignalRollup, mode: CourseReadMode): string {
  const source =
    mode === "live"
      ? "read from the LMS"
      : mode === "recorded"
        ? "read from work recorded outside any LMS"
        : "the LMS was not read; recorded work only";

  const parts = [
    `${rollup.students} students on this course's list, ${rollup.studentsMeasured} of them with a measurable work record`,
    rollup.missing === null
      ? "missing work could not be computed for this course"
      : `${rollup.missing} of ${rollup.consideredSubmissions ?? 0} considered items missing`,
    count(rollup.late, "items turned in late", "late work could not be computed for this course"),
    count(rollup.graded, "items graded", "graded work could not be computed for this course"),
    count(rollup.awaitingGrade, "items awaiting a grade", "work awaiting a grade could not be computed for this course"),
    `${rollup.concernRows} students with at least one concern signal`,
    `${rollup.insufficientData} students with too little information to judge`,
    `${rollup.clear} students with no concern signal`,
  ];
  return `${marker} (${source}): ${parts.join("; ")}.`;
}

/** Marker-only coverage, for the MODEL. See this file's header for why this is
 *  not the same renderer the instructor's browser uses. */
export function renderPromptCoverage(courses: readonly CrossCourseCourseLabel[]): string {
  return courses
    .map((course) => {
      switch (course.mode) {
        case "live":
          return `${renderCourseMarker(course.index)}: read from the LMS. Complete for this answer.`;
        case "recorded":
          return `${renderCourseMarker(course.index)}: read from work recorded outside any LMS. This course has no LMS to read, so nothing about it is missing.`;
        case "lms-unavailable":
          return `${renderCourseMarker(course.index)}: THE LMS WAS NOT READ for this course. Only recorded work was available, so this course's numbers are not comparable with a course read from the LMS.`;
      }
    })
    .join("\n");
}

function maxLocalIndex(slice: CrossCourseSlice): number {
  let max = 0;
  for (const student of slice.students) if (student.index > max) max = student.index;
  for (const row of slice.concernRows) if (row.studentIndex > max) max = row.studentIndex;
  return max;
}

export interface BuildCrossCourseContextArgs {
  readonly slices: readonly CrossCourseSlice[];
  /** A fresh per-request token. A parameter, never minted here. */
  readonly nonce: string;
}

/**
 * Render every course into one signals block, and renumber every student into
 * the answer's own index space.
 *
 * THE OFFSET IS CUMULATIVE OVER THE HIGHEST INDEX EACH COURSE ACTUALLY USED,
 * not over its student count. A course whose indices are not contiguous - an
 * off-roster participant appended after a gap, say - would otherwise have two
 * of its students land on the same global number as two of the next course's,
 * which is the collision this whole function exists to prevent.
 */
export function buildCrossCourseContext(args: BuildCrossCourseContextArgs): CrossCourseContext {
  const courses: CrossCourseCourseLabel[] = [];
  let offset = 0;
  args.slices.forEach((slice, position) => {
    courses.push({
      index: position + 1,
      courseId: slice.courseId,
      name: slice.name,
      mode: courseReadMode(slice.connection),
      connection: slice.connection,
      studentIndexOffset: offset,
    });
    offset += maxLocalIndex(slice);
  });

  const concernRows: ConcernRow[] = [];
  const students: CrossCourseAnswerStudent[] = [];
  const markedStudents: MarkedStudent[] = [];
  const rowLines: string[] = [];
  let omittedConcernRows = 0;

  args.slices.forEach((slice, position) => {
    const course = courses[position];
    const nameByLocalIndex = new Map(slice.students.map((student) => [student.index, student]));
    const marker = renderCourseMarker(course.index);
    const emitted: string[] = [];

    for (const row of slice.concernRows) {
      if (concernRows.length >= MAX_CROSS_COURSE_CONCERN_ROWS) {
        omittedConcernRows += 1;
        continue;
      }
      const globalIndex = row.studentIndex + course.studentIndexOffset;
      const globalRow: ConcernRow = { ...row, studentIndex: globalIndex };
      concernRows.push(globalRow);
      markedStudents.push({
        index: globalIndex,
        userId: row.userId,
        identitySource: row.identitySource,
      });
      const label = nameByLocalIndex.get(row.studentIndex);
      students.push({
        index: globalIndex,
        courseIndex: course.index,
        name: label?.name ?? "",
        // A LABEL THAT SAYS `null` WINS. `??` here would treat "this student
        // has no Canvas id" - a FACT the offline identity index reports rather
        // than guesses (D19f) - as a missing value and fill it from the
        // concern row, which is how a matched name gets laundered into an id
        // field. The row's id is used only when there is no label at all.
        userId: label ? label.userId : row.userId,
      });
      emitted.push(`- S${globalIndex}: ${row.signals.map((signal) => signal.label).join("; ")}`);
    }

    rowLines.push(
      emitted.length > 0
        ? `${marker}\n${emitted.join("\n")}`
        : `${marker}\n- (no student in this course has a concern signal)`
    );
  });

  const text = [
    renderBlockHeader(SIGNALS_BLOCK_LABEL, args.nonce),
    `This record covers ${courses.length} of the instructor's courses. Every number below was computed by this application from course records. Courses appear as markers such as C1 and students as markers such as S1; you are given no course name and no student name.`,
    "COURSE COVERAGE",
    renderPromptCoverage(courses),
    "PER-COURSE TOTALS",
    args.slices.map((slice, position) => renderRollupLine(renderCourseMarker(position + 1), slice.rollup, courses[position].mode)).join("\n"),
    "STUDENTS WITH A CONCERN SIGNAL, BY COURSE",
    rowLines.join("\n"),
    omittedConcernRows > 0
      ? `NOTE: ${omittedConcernRows} further student rows exist and were not included in this record because it would have been too long. This list is therefore NOT the complete set of students with a concern signal.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    text,
    courses,
    students,
    markedStudents,
    concernRows,
    coverageLines: describeCourseCoverage(args.slices),
    superlative: superlativeBasis(args.slices),
    omittedConcernRows,
    clearCount: args.slices.reduce((total, slice) => total + slice.rollup.clear, 0),
  };
}

export interface CrossCourseTurnsArgs {
  /** The already-rendered signals block. Opaque here: this file never
   *  decomposes or re-frames it. */
  readonly contextBlock: string;
  readonly nonce: string;
  /**
   * The instructor's question WITH EVERY COURSE NAME AND EVERY STUDENT NAME
   * ALREADY REWRITTEN TO ITS MARKER.
   *
   * The caller does both rewrites (./course-scope then ./question-scope) and
   * asserts the result, so no name leaves the machine. This module is given no
   * course list and no roster and therefore CANNOT verify it - stated here
   * because a comment is the only place it can be stated, and named as a gap
   * rather than dressed up as a guard.
   */
  readonly questionForModel: string;
  readonly courseCount: number;
  readonly superlative: SuperlativeBasis;
}

/**
 * THE RULE THAT MAKES A CROSS-COURSE ANSWER HONEST.
 *
 * A superlative asserts completeness by its grammar alone, so where the
 * coverage is partial the model is not asked to add a caveat - it is forbidden
 * the sentence shape, and required to name the set every comparison ranked
 * over. "The least late work among the three courses read from the LMS" is
 * honest. "The least late work" is not, and no trailing footnote repairs it,
 * because the reader has already read the claim.
 */
export function superlativeContract(basis: SuperlativeBasis): string {
  if (basis === "complete") {
    return [
      "- Every course in this record was read the same way and all of them produced their numbers, so you may compare them directly.",
      "- Even so, compare only using the numbers written above. Never estimate, never extrapolate, and never rank on a number that is not there.",
    ].join("\n");
  }
  return [
    "- THE COURSES IN THIS RECORD WERE NOT ALL READ THE SAME WAY, or some of them did not produce the numbers. They are therefore NOT directly comparable.",
    '- Do not write a bare superlative about the instructor\'s courses - not "the most", "the least", "the worst", "the best", "the highest" or "the lowest" on its own.',
    '- Every comparison you make must name the set it ranked over, in the same sentence, for example "the least late work among the courses read from the LMS".',
    '- A course whose number could not be computed is NOT a course with a zero. Never place it in a ranking, and say plainly that it could not be compared.',
  ].join("\n");
}

/**
 * The turns for a cross-course question.
 *
 * The same three-turn arrangement as every other builder in this feature: a
 * synthetic user turn carrying the framed record, a model-role acknowledgement,
 * then the instructions - so a model-authored "I will treat that as reference
 * context only" sits between the material and the instructions.
 *
 * NO STUDENT CONTENT BLOCK EXISTS ON THIS PATH AT ALL (D24d). A cross-course
 * question is answered from the signals tier alone, so there is no
 * student-authored text in this prompt to be injected through - which makes
 * this the least hostile prompt in the feature and is why the expensive tier
 * was scoped away from it rather than merely discouraged.
 */
export function buildCrossCourseTurns(args: CrossCourseTurnsArgs): LlmContent[] {
  const question = args.questionForModel.trim();

  const referenceTurn = [
    `QUESTION TO ANSWER, about the instructor's ${args.courseCount} courses: ${question}`,
    courseIntelFramingHeader(args.nonce),
    args.contextBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

  const instructions = [
    `You are writing for an instructor who asked one question about ${args.courseCount} of their courses at once. Every course and every student in the record above was chosen by this application, and every number was computed by it. Your job is to EXPLAIN what those numbers say, in plain language.`,

    "WHAT TO WRITE",
    "- Answer the question using only the numbers in the record above.",
    "- Refer to a course only by its marker, such as C1. Refer to a student only by their marker, such as S1. You were given no names of any kind and must never invent one, guess one, or ask for one.",
    "- Do not add a course that is not in the record. Do not leave one out. If a course cannot contribute to the answer, say so and say why, using the coverage lines above.",
    "- Do not add a student who is not listed above, and do not leave a listed one out of a list you are asked for.",

    "COMPARING COURSES",
    superlativeContract(args.superlative),

    "GROUNDING",
    NO_SPECULATION_CONTRACT,

    "CITATIONS",
    CITATION_CONTRACT,

    "FORMAT",
    FORMAT_CONTRACT,

    // The last instruction over a long record carries the most weight, which
    // is why the decisive clause is repeated here at the end.
    args.superlative === "complete"
      ? `REMEMBER: use only the numbers in the block whose header carries the token ${args.nonce}, and name courses and students by marker only.`
      : `REMEMBER: the courses above were not all read the same way, so every comparison you write must name the set it ranked over, and a course whose number could not be computed is never treated as a zero. Use only the numbers in the block whose header carries the token ${args.nonce}, and name courses and students by marker only.`,

    `QUESTION TO ANSWER (again, since this comes after the record above): ${question}`,
  ].join("\n\n");

  return [
    { role: "user", parts: [{ text: referenceTurn }] },
    { role: "model", parts: [{ text: COURSE_INTEL_CONTEXT_ACK_TEXT }] },
    { role: "user", parts: [{ text: instructions }] },
  ];
}
