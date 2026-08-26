"use client";

// Repo Grades view - the stacked loading/error/banner paragraphs that used to
// live inline in index.tsx's returned JSX, between RepoGradesControls and
// LinkUsernamesPanel. Pulled out ONLY because index.tsx hit this codebase's
// 1000-line-per-file cap and had nowhere left to grow - not because these
// paragraphs needed a home of their own. This is the part of that file with
// no decisions in it: every value shown and every gate a block renders
// behind (`course && !missingOrg`, `course && !canvasGateBlockedReason`) all
// come in as props. This component owns no state and no effects - index.tsx
// still owns every underlying value (`course`, `scanLoading`, `scan`, etc.)
// and only passes down what this file needs to render.
//
// U4.19d/19e: `canvasGateBlockedReason` (useRepoGradesData.ts) replaces the
// old `missingInstitution` boolean here. That boolean only ever triggered a
// banner claiming the Canvas ROSTER could not load - but the identical gate
// (institution blank, canvasUrl blank, or canvasUrl with no parseable
// `/courses/<id>`) also silently empties the Canvas assignment picker and
// leaves RepoBindingControl.tsx's student picker reading "No roster loaded"
// with posting unreachable, none of which the old banner ever said. The
// hook now distinguishes all three causes in its own wording and states
// every consequence once; this component only renders whatever string (or
// null) it is handed.
//
// vitest in this codebase is node-env and collects only src/**/*.test.ts, so
// no component is ever rendered by a test - nothing in this file is
// exercised by any test, which is exactly why it must contain no logic worth
// testing.
import styles from "../../page.module.css";
import gridStyles from "./repo-grades.module.css";

export interface RepoGradesStatusBannersProps {
  hasCourse: boolean;
  coursesLoading: boolean;
  courseName: string;
  /** U4.19d/19e - see this file's header comment and
   * useRepoGradesData.ts's own doc comment on `canvasGateBlockedReason`. */
  canvasGateBlockedReason: string | null;
  missingOrg: boolean;
  githubOrg: string;
  scanLoading: boolean;
  scanError: string | null;
  rosterLoading: boolean;
  rosterError: string | null;
  assignmentsLoading: boolean;
  assignmentsError: string | null;
  /** U4.19d state (f): the assignments load finished, found no error, and
   * the gate above is open - but the course genuinely has zero Canvas
   * assignments. Computed by index.tsx from `assignments.length === 0`
   * (the array this component itself never receives) rather than
   * re-derived here. */
  assignmentsEmpty: boolean;
  scanTruncated: boolean;
  rateLimitMessage: string | null;
}

export default function RepoGradesStatusBanners({
  hasCourse,
  coursesLoading,
  courseName,
  canvasGateBlockedReason,
  missingOrg,
  githubOrg,
  scanLoading,
  scanError,
  rosterLoading,
  rosterError,
  assignmentsLoading,
  assignmentsError,
  assignmentsEmpty,
  scanTruncated,
  rateLimitMessage,
}: RepoGradesStatusBannersProps) {
  return (
    <>
      {!hasCourse && !coursesLoading && (
        <p className={styles.emptyState}>Choose a course tile above to list its repos.</p>
      )}

      {hasCourse && canvasGateBlockedReason && (
        <p className={styles.error} role="alert">
          {canvasGateBlockedReason}
        </p>
      )}

      {hasCourse && missingOrg && (
        <p className={styles.error} role="alert">
          &quot;{courseName}&quot; has no GitHub org set, so its repos cannot be listed - set one on the course tile
          first.
        </p>
      )}

      {hasCourse && !missingOrg && scanLoading && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Scanning {githubOrg} for repos...</p>
          </div>
        </div>
      )}

      {hasCourse && !missingOrg && scanError && (
        <p className={styles.error} role="alert">
          {scanError}
        </p>
      )}

      {hasCourse && !canvasGateBlockedReason && rosterLoading && (
        <p className={styles.fieldHint} role="status" aria-live="polite">
          Loading the Canvas roster...
        </p>
      )}

      {hasCourse && !canvasGateBlockedReason && rosterError && (
        <p className={styles.error} role="alert">
          Roster: {rosterError}
        </p>
      )}

      {hasCourse && !canvasGateBlockedReason && assignmentsLoading && (
        <p className={styles.fieldHint} role="status" aria-live="polite">
          Loading the course&apos;s Canvas assignments...
        </p>
      )}

      {hasCourse && !canvasGateBlockedReason && assignmentsError && (
        <p className={styles.error} role="alert">
          Assignments: {assignmentsError}
        </p>
      )}

      {hasCourse && !canvasGateBlockedReason && !assignmentsLoading && !assignmentsError && assignmentsEmpty && (
        <p className={styles.fieldHint} role="status">
          &quot;{courseName}&quot; has no Canvas assignments yet, so the assignment picker has nothing to offer -
          add one in Canvas, then reload.
        </p>
      )}

      {scanTruncated && (
        <p className={gridStyles.banner} role="status">
          This org has at least as many repos as this scan&apos;s listing limit - the repos below may be an incomplete
          list, not the full org.
        </p>
      )}

      {rateLimitMessage && (
        <p className={gridStyles.banner} role="status">
          {rateLimitMessage}
        </p>
      )}
    </>
  );
}
