import type { ContinuousRepositoryAdapter, RepositorySessionStudent } from "./continuousRepositoryAdapter";
import type { SubmitOutcome } from "./continuousSessionView";
import type { ChatSubmissionInput } from "./chatSubmissionIntake";
import type { GradeHarshness, GradeResult, GradingRun } from "@/lib/grade/types";
import type { ItemDiagnostic } from "./chatGradeDetail";
import type { PendingSplit } from "./recordingSplitDriver";
import type { IngestLedger } from "@/lib/grade/ndjson-ingest-parser";
import type { VersionedResultRow } from "./versionedResultProjection";
import type { GradeRunItemRequestBody } from "@/app/components/grading/incrementalRunPlan";

export type HeaderState = "unset" | "resolving" | "ready" | "refused";

export interface UseContinuousGradingRunResult {
  readonly repositoryAdapter: ContinuousRepositoryAdapter;
  readonly repositoryStudents: readonly RepositorySessionStudent[];
  readonly beginSession: (params: {
    readonly assignmentInstructions: string;
    readonly rubric: string;
    readonly isCurrent?: () => boolean;
    /** Captured once at session start and frozen for the session; absent = balanced. */
    readonly harshness?: GradeHarshness;
    /** Captured once and frozen for the session; absent = no length directive. */
    readonly feedbackWordTarget?: number;
    /** Captured once and frozen for the session; absent = deduct (default on). */
    readonly applyNamingDeduction?: boolean;
    /** Captured once and frozen for the session; absent = no length deduction (default off). */
    readonly applyLengthDeduction?: boolean;
    readonly lengthDeductionThresholdWords?: number;
  }) => Promise<{ kind: "ready" } | { kind: "refused"; reason: string }>;
  readonly correctSetup: UseContinuousGradingRunResult["beginSession"];
  readonly submit: (input: ChatSubmissionInput) => Promise<SubmitOutcome>;
  readonly reset: () => void;
  readonly recoverNotebook: (request: GradeRunItemRequestBody, current: () => boolean, commit?: () => boolean) => Promise<boolean>;
  /** Re-dispatches the ORIGINAL request body of a failed row in place (same
   * sourceIndex, no new row). A no-op on a graded or still-pending row. */
  readonly retry: (sourceIndex: number) => void;
  /** Re-dispatches the retained body of an already-arrived row (graded or
   * failed) so it is re-graded and REPLACED in place. Keyed by the row's
   * student label. A no-op for an unknown student or a row already in flight. */
  readonly regrade: (student: string, useCurrentSetup?: boolean) => void;
  readonly regradeCandidates: ReadonlyMap<string, GradeResult>;
  readonly regradeFailures: ReadonlySet<string>;
  readonly acceptRegrade: (student: string, candidate: GradeResult) => boolean;
  readonly discardRegrade: (student: string) => void;
  /** The one Canvas URL pinned for this session (F3=A); "" until a Canvas URL
   * submission is accepted. */
  readonly canvasUrl: string;
  /** Loose videos submitted and not yet graded or failed (the pending-staged
   * cap input, ops 5.3). */
  readonly pendingVideoCount: () => number;
  /** Stable for a session, changes only across reset(): "grading-chat-" + sessionId. */
  readonly runKey: string;
  readonly sessionId: number;
  /** The resolved header's rubric fields, exposed at the top level. */
  readonly effectiveRubric: string;
  readonly rubricFingerprint: string;
  readonly generatedRubric: string | undefined;
  readonly headerState: HeaderState;
  readonly results: readonly GradeResult[];
  /** Unreconciled row criteria with session-local setup attribution. */
  readonly getVersionedResults: () => readonly VersionedResultRow[];
  readonly getVersionedResult: (result: GradeResult) => VersionedResultRow | undefined;
  readonly run: GradingRun | null;
  readonly dispatchedCount: number;
  readonly completedCount: number;
  readonly inFlight: number;
  readonly sessionError: string | null;
  /** Students (row keys) whose single-file name was neither in the file name nor
   * inferable from content and who carry no typed label. A labelled row is never
   * in it. Consumed only by the chat grading mount. */
  readonly unresolvedStudents: ReadonlySet<string>;
  /** BULK-ZIP BW4: the retained ingest ledger (skipped students, unreadable
   * files, student counts) accumulated across every storaged-zip submit in this
   * session; null until one completes, cleared by reset(). */
  readonly ingestLedger: IngestLedger | null;
  /** Read-only presentation signal: student labels of rows queued or in flight
   * (first-time grades, retries and regrades alike). Derived from pendingRef. */
  readonly pendingStudents: ReadonlySet<string>;
  /** Read-only presentation signal: student labels being graded right now (the
   * active concurrency slots), in dispatch order. */
  readonly inFlightStudents: readonly string[];
  /** RECORDING ONE-VS-MANY: the oldest multi-submission recording awaiting the
   * instructor's confirm; null when none. Nothing is graded until it resolves. */
  readonly pendingSplit: PendingSplit | null;
  /** True while a prepared video is being classified (the "Analyzing" phase). */
  readonly classifyingRecording: boolean;
  /** Grades the held recording as one distinct row per detected segment. */
  readonly confirmRecordingSplit: () => SubmitOutcome;
  /** Grades the held recording as ONE submission (today's path). */
  readonly rejectRecordingSplit: () => SubmitOutcome;
  /** One entry per dispatch attempt (newest last), bounded; cleared by reset().
   * Hook-local, not read from the session log, so it is not subject to the
   * log's entry cap. */
  readonly diagnostics: readonly ItemDiagnostic[];
}
