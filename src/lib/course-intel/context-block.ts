// course-intel: rendering the assembly into a prompt-ready context block.
//
// TWO SEPARATELY LABELLED BLOCKS, AND THE SEPARATION IS THE POINT.
//
//   COURSE SIGNALS  - written by this code from typed values. Numbers, dates,
//                     Presence states, student INDICES. It is never built by
//                     interpolating a student-authored string, and that is
//                     what makes the precedence clause in ./prompt mean
//                     something: a clause naming which block wins is worthless
//                     if a student can get their own sentence into the
//                     winning block.
//   STUDENT CONTENT - writing by third parties. Framed as data, budgeted per
//                     student, and never trusted for a fact about anybody.
//
// EVERY BLOCK HEADER CARRIES A PER-REQUEST NONCE, which arrives as a
// parameter. A student can type "=== COURSE SIGNALS ===" into a discussion
// post and forge a section otherwise, and nothing in this repo does this
// today. The nonce is NOT generated here: this module is a pure leaf (no
// clock, no crypto, no randomness), so the caller mints one per request and
// hands it to both this file and ./prompt, which states it once in the
// instructions.
//
// Delimiter neutralisation below is defence in depth, not the control. The
// nonce is the control.

import { redactAuthorNameFromText } from "../discussion-reply-redact";
import { isSyntheticStudentName } from "./join";
import type {
  AssemblyOmission,
  CanvasUserId,
  CourseIntelAssembly,
  CourseStudentRecord,
  Presence,
  StudentIndex,
  StudentTextRef,
} from "./types";

/** A student as the prompt layer knows them: an index and the id needed to
 * resolve that index back to a person LOCALLY, in the instructor's browser.
 * No name, no sortable name, and above all no login id - see D13. */
export interface MarkedStudent {
  readonly index: StudentIndex;
  readonly userId: CanvasUserId;
}

/** One citable piece of student writing, addressed by marker. The model sees
 * `[T3]`; the id stays here for the UI to resolve. */
export interface MarkedText {
  readonly marker: string;
  readonly id: string;
  readonly studentIndex: StudentIndex;
}

export interface CourseIntelContextBlock {
  readonly text: string;
  readonly markedStudents: readonly MarkedStudent[];
  readonly markedTexts: readonly MarkedText[];
  /** The assembly's own omissions plus every per-student budget omission this
   * render produced. AC6: what was left out is stated, never silently
   * dropped. */
  readonly omissions: readonly AssemblyOmission[];
}

export const SIGNALS_BLOCK_LABEL = "COURSE SIGNALS";
export const STUDENT_CONTENT_BLOCK_LABEL = "STUDENT CONTENT";

/**
 * Total characters of student writing one request may carry, across all
 * students. Divided equally per student in scope - see buildCourseIntelContext
 * for why it is never pooled.
 *
 * Larger than DEFAULT_KNOWLEDGE_CONTEXT_MAX_CHARS (10000, for a handful of
 * instructor-selected policy pages) because a per-student question is answered
 * from many short items rather than a few long ones, and smaller than it would
 * be if this were a whole-course dump, because the design never sends the
 * whole course: the concern question sends no prose at all, and a per-student
 * question sends one student's writing.
 */
export const DEFAULT_STUDENT_TEXT_MAX_CHARS = 16000;

/** Per announcement, in the signals block. Announcements are class context,
 * not evidence, so a long one is truncated hard rather than allowed to crowd
 * out the signals it sits beside. */
export const DEFAULT_ANNOUNCEMENT_MAX_CHARS = 600;

const SEP = "\n\n";

/**
 * Render a block header. The nonce sits INSIDE the delimiter, so a forged
 * header is missing the one token the instructions name.
 */
export function renderBlockHeader(label: string, nonce: string): string {
  return `=== ${label} ${nonce} ===`;
}

/**
 * A nonce that is empty, or that contains whitespace or an equals sign, cannot
 * do its job: the instructions describe it as a single token appearing in
 * every real header, and a caller that passes "" would render a header a
 * student can reproduce exactly. Throwing is correct here - a context block
 * without a working delimiter is not a degraded block, it is an unsafe one,
 * and returning it would put the failure somewhere nobody is looking.
 */
function assertUsableNonce(nonce: string): void {
  if (!nonce || /[\s=]/.test(nonce)) {
    throw new Error("course-intel: the context block nonce must be a non-empty token with no whitespace or '='");
  }
}

/**
 * Defence in depth over the nonce, applied to every string this module
 * interpolates from anywhere: the nonce itself is removed (so a student who
 * somehow learned this request's token cannot reuse it), and any run of three
 * or more equals signs is spaced out so it can no longer read as a delimiter.
 *
 * Spaced rather than deleted because this text is EVIDENCE. Removing
 * characters from a student's own writing changes what an instructor is shown
 * about them; "= = =" preserves that something was there while being unable to
 * open a section.
 */
export function neutralizeDelimiters(text: string, nonce: string): string {
  const withoutNonce = nonce ? text.split(nonce).join("[token removed]") : text;
  return withoutNonce.replace(/={3,}/g, (run) => run.split("").join(" "));
}

function presenceNote(presence: Presence<unknown>, loadedLabel: string): string {
  switch (presence.state) {
    case "loaded":
      return loadedLabel;
    case "none":
      return "none found";
    case "not-fetched":
      return `not fetched (${presence.reason})`;
    case "failed":
      return `could not be read (${presence.reason})`;
  }
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

/**
 * One student's line in the signals block.
 *
 * Every field here is a number, a date, an enum or an index. There is no
 * branch on this path that can emit a character a student typed - which is the
 * property the precedence clause depends on, and the reason a test asserts no
 * roster name appears anywhere in the rendered block.
 */
function renderSignalsLine(student: CourseStudentRecord): string {
  const parts: string[] = [`S${student.index}`];
  if (!student.onRoster) parts.push("not on the student roster (dropped student, TA, or observer)");

  if (student.grades.state === "loaded") {
    const { currentScore, finalScore } = student.grades.value;
    parts.push(currentScore === null ? "course score not recorded" : `course score ${formatPercent(currentScore)}`);
    if (finalScore !== null) parts.push(`final score ${formatPercent(finalScore)}`);
  } else {
    parts.push(`course score ${presenceNote(student.grades, "")}`.trim());
  }

  if (student.submissions.state === "loaded") {
    const r = student.submissions.value.rollup;
    parts.push(`${r.missingCount} of ${r.consideredCount} assignments missing`);
    parts.push(`${r.lateCount} late`);
    parts.push(`${r.gradedCount} graded`);
    parts.push(`${r.ungradedSubmittedCount} awaiting grade`);
    if (r.excusedCount > 0) parts.push(`${r.excusedCount} excused`);
  } else {
    // NEVER "0 of 0 missing". A student whose submissions were not loaded is
    // not a student with no missing work, and rendering the two the same way
    // is the confusion the Presence type exists to prevent.
    parts.push(`submissions ${presenceNote(student.submissions, "")}`.trim());
  }

  if (student.discussion.state === "loaded") {
    const d = student.discussion.value;
    parts.push(`${d.posts.length} discussion posts, ${d.replies.length} replies`);
    if (d.repliedToBy.length === 0) parts.push("nobody has replied to them");
  } else {
    parts.push(`discussion ${presenceNote(student.discussion, "")}`.trim());
  }

  if (student.messages.state === "loaded") {
    parts.push(`${student.messages.value.threads.length} message threads`);
  } else {
    parts.push(`messages ${presenceNote(student.messages, "")}`.trim());
  }

  parts.push(
    student.lastActivityAt
      ? `last activity ${student.lastActivityAt}`
      : "last activity unknown (nothing loaded for them carried a timestamp)"
  );

  return parts.join(" | ");
}

function renderSignalsBlock(assembly: CourseIntelAssembly, nonce: string): string {
  const clean = (value: string) => neutralizeDelimiters(value, nonce);
  const lines: string[] = [
    renderBlockHeader(SIGNALS_BLOCK_LABEL, nonce),
    `Course: ${clean(assembly.courseName)}`,
    `Assembled at: ${assembly.assembledAt}`,
    `Data tier: ${assembly.tier}`,
    "",
    "STUDENTS (one line each, from Canvas grades and submission records):",
    ...assembly.students.map(renderSignalsLine),
  ];

  if (assembly.assignments.length > 0) {
    lines.push("", "ASSIGNMENTS IN THIS COURSE:");
    for (const a of assembly.assignments) {
      const bits = [`${clean(a.name)}`];
      bits.push(a.dueAt ? `due ${a.dueAt}` : "no due date");
      if (a.pointsPossible !== null) bits.push(`${a.pointsPossible} points`);
      if (a.published === false) bits.push("unpublished");
      if (a.omitFromFinalGrade === true) bits.push("omitted from the final grade");
      lines.push(`- ${bits.join(", ")}`);
    }
  }

  if (assembly.announcements.length > 0) {
    // The one non-numeric text in this block, and it is INSTRUCTOR-authored:
    // announcements are broadcast by the teacher, carry no student, and are
    // here so an answer can say "this was already announced twice". They are
    // never evidence about a person. Neutralised like everything else, and
    // truncated so class context cannot crowd out the signals it sits beside.
    lines.push("", "CLASS ANNOUNCEMENTS (instructor-authored, attributable to no student):");
    for (const announcement of assembly.announcements) {
      const body = clean(announcement.text).trim();
      const truncated =
        body.length > DEFAULT_ANNOUNCEMENT_MAX_CHARS
          ? `${body.slice(0, DEFAULT_ANNOUNCEMENT_MAX_CHARS)} [announcement truncated]`
          : body;
      lines.push(
        `- ${clean(announcement.title)}${announcement.postedAt ? ` (posted ${announcement.postedAt})` : ""}${
          truncated ? `: ${truncated}` : ""
        }`
      );
    }
  }

  return lines.join("\n");
}

/** Every piece of one student's writing, in a stable order, with the message
 * bodies only when they were actually loaded. */
function textRefsFor(student: CourseStudentRecord): StudentTextRef[] {
  const refs: StudentTextRef[] = [];
  if (student.discussion.state === "loaded") {
    refs.push(...student.discussion.value.posts, ...student.discussion.value.replies);
  }
  if (student.messages.state === "loaded" && student.messages.value.bodies.state === "loaded") {
    refs.push(...student.messages.value.bodies.value);
  }
  return refs;
}

function renderTextChunk(args: {
  marker: string;
  ref: StudentTextRef;
  student: CourseStudentRecord;
  indexByUserId: ReadonlyMap<CanvasUserId, StudentIndex>;
  nonce: string;
}): string {
  const { marker, ref, student, indexByUserId, nonce } = args;
  const clean = (value: string) => neutralizeDelimiters(value, nonce);
  const parentIndex = ref.parentUserId === null ? undefined : indexByUserId.get(ref.parentUserId);
  const header = [
    `[${marker}] S${student.index}`,
    ref.kind,
    ref.container ? `in "${clean(ref.container)}"` : "",
    ref.createdAt ? `on ${ref.createdAt}` : "",
    parentIndex !== undefined ? `replying to S${parentIndex}` : ref.parentUserId !== null ? "replying to someone off-roster" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // D7's cheap partial pseudonymisation: strip the AUTHOR'S OWN name out of
  // their own body, using the shipped, tested function rather than a second
  // implementation of the same rule. Full-body pseudonymisation is not viable
  // and this does not claim to be it - CLASSMATE NAMES STILL LEAK. Students
  // sign posts and greet each other, and stripping every roster name from
  // every body would destroy meaning for students named May, Grace or Mark.
  // Say that here rather than claim coverage this does not have.
  //
  // A SYNTHESISED name is never passed to the redactor. It strips every TOKEN
  // of the author string, so "Canvas user 4021" would delete the ordinary
  // words "canvas" and "user" out of that person's own writing - damage to the
  // evidence, for no privacy gain, since a label built from a user id is not a
  // name to protect in the first place.
  const authorName = isSyntheticStudentName(student.name) ? "" : student.name;
  const body = clean(redactAuthorNameFromText(ref.text, authorName)).trim();
  return body ? `${header}\n${body}` : header;
}

/** The per-student omission note, rendered INSIDE that student's section so
 * the instructor can tell WHOSE evidence is missing, not only how much. A
 * global count cannot answer that question, which is the whole of D6. */
function renderStudentOmissionNote(omitted: number, total: number, index: StudentIndex): string {
  return `[${omitted} of ${total} items from S${index} omitted to stay within this student's share of the context budget]`;
}

export interface BuildCourseIntelContextArgs {
  readonly assembly: CourseIntelAssembly;
  /** Per-request token, minted by the caller. Never generated here. */
  readonly nonce: string;
  /**
   * Whose writing may be included. An empty list (the default) renders NO
   * student content block at all, which is what the concern question uses:
   * it is answerable from the signals alone, and shipping every student's
   * prose to a model for it would be the design AC3 was written to prevent -
   * it invites the model to read tone and call it concern.
   */
  readonly textStudentIndices?: readonly StudentIndex[];
  readonly maxTextChars?: number;
}

/**
 * Build the context block.
 *
 * THE TEXT BUDGET IS PER STUDENT, NOT GLOBAL (D6), and this is a correctness
 * bug as much as a security one. Under a global cap a verbose student
 * displaces a quiet student's evidence, and the quiet student is then assessed
 * on nothing - which is precisely the student an instructor is asking about.
 * It arrives by accident far more often than by attack.
 *
 * So each student in scope gets an equal share of `maxTextChars`, truncation
 * happens WITHIN a student, and UNUSED SHARE IS NOT REDISTRIBUTED. Handing a
 * quiet student's leftovers to whoever comes next is first-come-first-served
 * displacement wearing a different hat, and it favours exactly the student the
 * per-student split exists to contain.
 *
 * Within one student the budgeting discipline is copied from
 * buildKnowledgeContextBlock: reserve the omission note's WORST CASE up front
 * (the note's length only grows as the count it reports grows, so the real
 * note always fits the space reserved for the maximal one), truncate on chunk
 * boundaries so a half-quoted post never reaches the model, and `continue`
 * rather than `break` so a short item after an oversized one still survives.
 */
export function buildCourseIntelContext(args: BuildCourseIntelContextArgs): CourseIntelContextBlock {
  const { assembly, nonce } = args;
  assertUsableNonce(nonce);

  const maxTextChars = args.maxTextChars ?? DEFAULT_STUDENT_TEXT_MAX_CHARS;
  const wanted = new Set(args.textStudentIndices ?? []);
  const markedStudents: MarkedStudent[] = assembly.students.map((s) => ({ index: s.index, userId: s.userId }));
  const indexByUserId = new Map<CanvasUserId, StudentIndex>(assembly.students.map((s) => [s.userId, s.index]));

  const blocks: string[] = [renderSignalsBlock(assembly, nonce)];
  const markedTexts: MarkedText[] = [];
  const omissions: AssemblyOmission[] = [...assembly.omissions];

  const inScope = assembly.students.filter((s) => wanted.has(s.index));
  if (inScope.length > 0) {
    const share = Math.floor(maxTextChars / inScope.length);
    const sections: string[] = [renderBlockHeader(STUDENT_CONTENT_BLOCK_LABEL, nonce)];
    let markerCounter = 0;

    for (const student of inScope) {
      const refs = textRefsFor(student);
      if (refs.length === 0) {
        sections.push(`S${student.index}: no discussion posts, replies or message bodies were loaded for this student.`);
        continue;
      }

      const chunks = refs.map((ref) => {
        markerCounter += 1;
        const marker = `T${markerCounter}`;
        return {
          marker,
          id: ref.id,
          text: renderTextChunk({ marker, ref, student, indexByUserId, nonce }),
        };
      });

      // Worst case: every one of this student's items omitted. See this
      // function's doc for why that is always at least as long as the note
      // actually rendered afterwards.
      const worstCaseNote = renderStudentOmissionNote(chunks.length, chunks.length, student.index);
      const budget = Math.max(0, share - worstCaseNote.length);

      const kept: string[] = [];
      let used = 0;
      let omitted = 0;
      for (const chunk of chunks) {
        const cost = chunk.text.length + SEP.length;
        if (used + cost > budget) {
          // `continue`, not `break`: a short item after an oversized one is
          // still worth keeping rather than discarding the rest of the share.
          omitted += 1;
          continue;
        }
        kept.push(chunk.text);
        used += cost;
        markedTexts.push({ marker: chunk.marker, id: chunk.id, studentIndex: student.index });
      }

      if (kept.length > 0) sections.push(kept.join(SEP));
      if (omitted > 0) {
        const note = renderStudentOmissionNote(omitted, chunks.length, student.index);
        sections.push(note);
        omissions.push({
          kind: "student-text-budget",
          detail: note,
          count: omitted,
          studentIndex: student.index,
        });
      }
    }

    blocks.push(sections.join(SEP));
  }

  return { text: blocks.join(SEP), markedStudents, markedTexts, omissions };
}
