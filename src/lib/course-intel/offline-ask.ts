// course-intel: THE LAST LINK. `assembleOfflineCourseIntel` and everything
// below it were built, tested and sabotage-checked with ZERO non-test
// importers - they computed correctly over nothing. This module is what an ask
// request calls, and it is deliberately PURE so the route above it is a thin
// wrapper around one function rather than the place the whole offline design
// lives.
//
// WHAT IT DOES, IN ORDER:
//   1. assemble    - ./offline-assembly, over this course's roster, its cached
//                    repo bindings, and the recorded rows the browser posted.
//   2. scope       - the question resolves to the whole class or to ONE
//                    student, with a name that matches two students refused
//                    rather than guessed.
//   3. render      - ./offline-prompt turns the computed sets into a context
//                    block and the turns.
// The model call and the persistence stay in the route, because they are I/O.
//
// THE ORDER MATTERS AND IS NOT COSMETIC. The assembly runs FIRST because the
// scope needs this course's student list, and offline that list is built from
// the roster text plus the cached repo bindings rather than fetched. So there
// is no cheap "resolve the name, then decide what to fetch" phase here the way
// there is live - assembling costs nothing, because the data is already local
// (D24d's own observation: offline courses cost zero Canvas calls).
//
// THE NAME NEVER REACHES THE PROMPT, AND THIS IS THE MODULE THAT OWES IT.
// `scopeCourseIntelQuestion` rewrites every student name in the question to
// its index marker and `assertNoStudentNameRemains` throws rather than
// returning if one survives. Only `questionForModel` is passed on; the
// instructor's raw question is never composed into a turn. Offline this
// matters MORE than live: the identity is a NAME MATCHED against a roster
// (D21b), so a name in the prompt would be both a disclosure and a false
// precision - it would present a match as a verified identity.
//
// THE ONE PLACE THIS MODULE ADAPTS A SHIPPED TYPE, stated rather than hidden.
// `ScopeRosterEntry.userId` is a non-optional `CanvasUserId` and offline most
// students have no Canvas id at all. The adapter below passes 0 for EVERY
// student, uniformly:
//   - 0 is a value `parseCachedCanvasUserId` explicitly REFUSES as a cached
//     id, so it can never be mistaken for a real one;
//   - uniform, so there is no branch where a real id might reach the scope
//     result and be carried onward as though the scope had verified it;
//   - and NOTHING reads it back. Every result of the scope is resolved by
//     INDEX against the identity index, which carries the real
//     `CanvasUserId | null`. `offlineAskUserIdForIndex` below is the only way
//     an id is obtained on this path, and there is a test asserting 0 appears
//     in no response.
// The alternative - a parallel offline scoper - would mean two
// implementations of `matchNameAgainstRoster`'s ambiguity discipline, which is
// exactly the drift D21c reuses that function to avoid.
//
// PURE LEAF: no clock (`now` is a parameter), no randomness (the nonce is a
// parameter), no I/O.

import { assembleOfflineCourseIntel, type OfflineCourseIntel } from "./offline-assembly";
import type { OfflineStudentRepoRef } from "./offline-identity";
import { buildOfflineConcernTurns, buildOfflineContextBlock, buildOfflineStudentTurns } from "./offline-prompt";
import type { OfflinePayloadIntake, ParsedOfflinePayload } from "./offline-payload";
import { scopeCourseIntelQuestion, type ScopeRosterEntry } from "./question-scope";
import type { EngagementThresholds } from "./engagement";
import type { MarkedStudent } from "./context-block";
import type { LlmContent } from "@/lib/llm";
import type { CanvasUserId, ConcernThresholds, LmsConnection, StudentIndex } from "./types";

/** The sentinel this module passes for `ScopeRosterEntry.userId`. See the
 *  header: refused by `parseCachedCanvasUserId`, uniform, and never read back.
 *  Exported so a test can assert it appears in nothing this module returns. */
export const OFFLINE_SCOPE_USER_ID_SENTINEL = 0;

/**
 * One student, resolved back to a name FOR THE INSTRUCTOR'S OWN BROWSER.
 *
 * The model gets `index`. The browser gets this, because offline it has no
 * Canvas roster to look an index up in - the roster is free text on the course
 * row, and the index assignment merges it with the cached repo bindings, so a
 * browser re-deriving the mapping itself would be a second implementation that
 * could drift by one and put an answer about S4 next to S5's name.
 *
 * SENDING A NAME BACK TO THE BROWSER THAT TYPED IT IS NOT A DISCLOSURE. The
 * boundary this feature protects is the MODEL, and the roster came from the
 * instructor in the first place.
 */
export interface OfflineStudentLabel {
  readonly index: StudentIndex;
  readonly name: string;
  /** Null unless a cached `student_repos[].canvasUserId` parsed. Never
   *  synthesised - travels beside `identitySource` so a reader can tell a
   *  verified identity from a matched one (D19f). */
  readonly userId: CanvasUserId | null;
}

export interface PrepareOfflineAskArgs {
  readonly courseHubId: string;
  readonly courseName: string;
  /** From `parseRosterNames(course.roster)` - already de-duplicated. Two
   *  IDENTICAL entries here mean two students who share a name, and are
   *  reported ambiguous on purpose. */
  readonly rosterNames: readonly string[];
  readonly studentRepos: readonly OfflineStudentRepoRef[];
  readonly payload: ParsedOfflinePayload;
  readonly question: string;
  readonly concernThresholds: ConcernThresholds;
  readonly engagementThresholds: EngagementThresholds;
  readonly connection: LmsConnection;
  /** ISO. A parameter, never a clock read here. */
  readonly now: string;
  /** A fresh per-request token. A parameter, never minted here - this leaf has
   *  no randomness, exactly as ./context-block requires of its callers. */
  readonly nonce: string;
}

export type PrepareOfflineAskResult =
  | {
      readonly status: "prepared";
      readonly turns: readonly LlmContent[];
      readonly intel: OfflineCourseIntel;
      readonly markedStudents: readonly MarkedStudent[];
      readonly students: readonly OfflineStudentLabel[];
      /** Code-authored sentences about what this answer could not see. */
      readonly coverageNotes: readonly string[];
      /** Null for the whole-class question. */
      readonly subjectIndex: StudentIndex | null;
      /**
       * The question asked what the student has WRITTEN, and offline there is
       * no corpus to answer it from.
       *
       * Carried out of here rather than re-derived by the caller for D7's
       * reason: that shape's payload is the student's own writing and it has
       * no per-student signal check behind it, so the code-authored signal
       * strip does not apply to it. A caller re-reading the question text to
       * decide that would be a second classifier that could disagree with
       * this one about the same sentence.
       */
      readonly asksAboutWriting: boolean;
      readonly intake: OfflinePayloadIntake;
    }
  | {
      /** One name in the question matches more than one student. Nothing is
       *  sent. Candidates are INDICES; the browser resolves them from
       *  `students` below. */
      readonly status: "ambiguous";
      readonly matchedText: string;
      readonly candidates: readonly StudentIndex[];
      readonly students: readonly OfflineStudentLabel[];
    }
  | {
      readonly status: "multiple-students";
      readonly subjects: readonly StudentIndex[];
      readonly students: readonly OfflineStudentLabel[];
    };

/**
 * Does the question ask what the student WROTE?
 *
 * Deliberately re-derived from the scope's own shape rather than re-reading
 * the question text: `scopeCourseIntelQuestion` already classified it, and a
 * second classifier here could disagree with the first about the same
 * sentence.
 */
function asksAboutWriting(kind: string): boolean {
  return kind === "student-topics";
}

/** Resolve an index to the real cached id, or null. THE ONLY way an id is
 *  obtained on this path - never from the scope result, whose userId is the
 *  sentinel. */
export function offlineAskUserIdForIndex(intel: OfflineCourseIntel, index: StudentIndex): CanvasUserId | null {
  return intel.identity.students.find((student) => student.index === index)?.userId ?? null;
}

function studentLabels(intel: OfflineCourseIntel): OfflineStudentLabel[] {
  return intel.identity.students.map((student) => ({
    index: student.index,
    name: student.name,
    userId: student.userId,
  }));
}

/**
 * Build everything an offline ask needs, up to but not including the model
 * call.
 *
 * THE CONCERN SET IS COMPUTED HERE, IN TYPESCRIPT, exactly as it is on the
 * live path (D1/D21f). The source of the numbers changed; nothing about who
 * decides membership did. That matters more offline than live rather than
 * less: thinner data gives a model more room to invent, so handing it a
 * question instead of rows would be the worst version of this feature.
 */
export function prepareOfflineAsk(args: PrepareOfflineAskArgs): PrepareOfflineAskResult {
  const intel = assembleOfflineCourseIntel({
    courseHubId: args.courseHubId,
    rosterNames: args.rosterNames,
    studentRepos: args.studentRepos,
    gradingRows: args.payload.gradingRows,
    replyRows: args.payload.replyRows,
    assessmentDeclarations: args.payload.assessmentDeclarations,
    toolDeclarations: args.payload.toolDeclarations,
    recordingTool: args.payload.recordingTool,
    concernThresholds: args.concernThresholds,
    engagementThresholds: args.engagementThresholds,
    now: args.now,
  });

  const students = studentLabels(intel);

  const scopeRoster: readonly ScopeRosterEntry[] = intel.identity.students.map((student) => ({
    index: student.index,
    // See this file's header. Uniform, refused by parseCachedCanvasUserId, and
    // never read back out of the scope result.
    userId: OFFLINE_SCOPE_USER_ID_SENTINEL,
    name: student.name,
    // The roster field is free text, one student per line, with no separate
    // sortable spelling - so the display name IS the sortable name here.
    // `studentNameVariants` canonicalises both and collapses duplicates, so
    // passing the same string twice adds no variant and changes no outcome.
    sortableName: student.name,
  }));

  const scope = scopeCourseIntelQuestion({
    question: args.question,
    roster: scopeRoster,
    // Offline there is no student writing to include at all - see
    // ./offline-payload, which has no field a post or a submission body could
    // arrive in. Passing true would ask for a text tier that cannot exist.
    includeStudentTextForStatus: false,
  });

  if (scope.status === "ambiguous") {
    return {
      status: "ambiguous",
      matchedText: scope.matchedText,
      candidates: scope.candidates.map((candidate) => candidate.index),
      students,
    };
  }
  if (scope.status === "multiple-students") {
    return { status: "multiple-students", subjects: scope.subjects.map((s) => s.index), students };
  }

  const context = buildOfflineContextBlock({
    courseName: args.courseName,
    assembledAt: args.now,
    connection: args.connection,
    nonce: args.nonce,
    concerns: intel.concerns,
    engagement: intel.engagement,
    report: intel.report,
    intake: args.payload.intake,
  });

  const subjectIndex = scope.shape.kind === "concern" ? null : scope.shape.studentIndex;

  const turns =
    scope.shape.kind === "concern"
      ? buildOfflineConcernTurns({
          contextBlock: context.text,
          nonce: args.nonce,
          courseLabel: args.courseName,
          concerns: intel.concerns,
          engagement: intel.engagement,
        })
      : buildOfflineStudentTurns({
          contextBlock: context.text,
          nonce: args.nonce,
          subjectIndex: scope.shape.studentIndex,
          questionForModel: scope.questionForModel,
          asksAboutWriting: asksAboutWriting(scope.shape.kind),
        });

  return {
    status: "prepared",
    turns,
    intel,
    markedStudents: context.markedStudents,
    students,
    coverageNotes: context.coverageNotes,
    subjectIndex,
    asksAboutWriting: asksAboutWriting(scope.shape.kind),
    intake: args.payload.intake,
  };
}
