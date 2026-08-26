"use client";

// Repo Grades view - the "Link GitHub usernames to roster" panel. This
// replaces the old dead end where the grid told the instructor to go run a
// WORKFLOW step elsewhere in the app; the mechanism now lives on this view
// instead, reading the same Canvas assignment list index.tsx already loaded
// (an assignment <select> here, not the workflow step's "paste the
// assignment URL" text box - picking beats pasting when the list is already
// in hand) and writing through the same repo-student-bindings pipeline
// RepoBindingControl.tsx renders.
//
// THE HONEST TWO-STEP - the reason most of this file exists. Linking usernames
// does not confirm any binding. buildRosterUpdate writes tile rows with an
// empty `repo` field, so the binder's full-repo-name rule (tier 0 in
// src/lib/repo-student-bindings.ts) never fires for a username-linked row;
// the username only ever feeds tier 1, which yields `state: "suggested"` -
// the same state RepoBindingControl.tsx already renders with its own
// per-row "Confirm binding" button. A row a human still has to look at once
// is correct and intentional (a submitted username could still be a typo or
// belong to the wrong student), but confirming thirty rows one button at a
// time is the whole reason the workflow-step version of this feature felt
// broken. So this panel says the two things out loud, right next to each
// other: linking makes matching repos show as SUGGESTED, and the "Confirm
// all" button directly below is how you clear that queue in one write. It
// never lets the link button's own copy imply the grid is postable right
// after linking.
//
// Ambiguous usernames (matches more than one roster student) and conflicts
// (a username already bound to a different student) are NOT silently
// dropped - they are rows a human has to resolve by hand, so they render
// here as their own labelled lists rather than only living in a result an
// instructor would have to think to download.
//
// Busy/error/result state is local useState, same as RepoGradesLogPanel.tsx
// and RepoBindingControl.tsx; every persistent value (the assignment choice)
// is a prop the parent owns. No useEffect - nothing here needs one, and
// react-hooks/set-state-in-effect is strict in this repo. Every async call
// site sits behind a real onClick, matching the shape
// repoGrades.wiring.test.ts reads this folder's other files for.
import { useState } from "react";
import type { CanvasAssignmentBrief } from "@/lib/canvas";
import { linkUsernamesSummaryLine, type LinkUsernamesOutcome } from "./linkRepoUsernames";
import styles from "./repo-grades.module.css";
import pageStyles from "../../page.module.css";

export interface LinkUsernamesPanelProps {
  /** The course's Canvas assignments, already loaded by the view. */
  assignments: CanvasAssignmentBrief[];
  assignmentsLoading: boolean;
  assignmentsError: string | null;
  /** The persisted assignment choice, owned by the parent. */
  assignmentId: string;
  onAssignmentIdChange: (assignmentId: string) => void;
  /** Non-null when linking cannot run at all (no course chosen, no institution
   * on the tile, no Canvas course URL) - render the reason and disable the
   * controls rather than offering a button that can only fail. */
  blockedReason: string | null;
  /** True when the grid has rows but none is confirmed-bound - the panel leads
   * with the "nothing is bound yet" framing in that case. */
  noConfirmedRows: boolean;
  /** How many rows are currently `suggested` and could be confirmed in bulk. */
  suggestedCount: number;
  /** Runs the link. Resolves to the outcome, or an error to display. */
  onLink: (assignmentId: string, assignmentName: string) => Promise<LinkUsernamesOutcome | { error: string }>;
  /** Confirms every currently-suggested binding in one write. Resolves to the
   * number confirmed, or an error to display. */
  onConfirmAllSuggested: () => Promise<{ confirmed: number } | { error: string }>;
  /** Routes a one-line outcome into the view's EXISTING role="status" region
   * (index.tsx's postSummary). Do NOT add a second aria-live region to this
   * page - two live regions on one view compete and a screen reader user gets
   * whichever won. */
  onAnnounce: (message: string) => void;
}

export default function LinkUsernamesPanel({
  assignments,
  assignmentsLoading,
  assignmentsError,
  assignmentId,
  onAssignmentIdChange,
  blockedReason,
  noConfirmedRows,
  suggestedCount,
  onLink,
  onConfirmAllSuggested,
  onAnnounce,
}: LinkUsernamesPanelProps) {
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<LinkUsernamesOutcome | null>(null);

  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<number | null>(null);

  const chosenAssignment = assignments.find((assignment) => assignment.id === assignmentId) ?? null;
  const linkDisabled = linkBusy || assignmentsLoading || blockedReason !== null || !chosenAssignment;

  const handleLink = async () => {
    if (!chosenAssignment) return;
    setLinkBusy(true);
    setLinkError(null);
    setOutcome(null);
    const result = await onLink(chosenAssignment.id, chosenAssignment.name);
    setLinkBusy(false);
    if ("error" in result) {
      setLinkError(result.error);
      onAnnounce(result.error);
      return;
    }
    setOutcome(result);
    onAnnounce(linkUsernamesSummaryLine(result));
  };

  const handleConfirmAll = async () => {
    // A binding decides which student a later grade post lands on, and grade
    // posting in this app has no undo - the same stakes RepoGradesLogPanel's
    // own clear-log confirm names for its own (much smaller) risk.
    const proceed = window.confirm(
      `Confirm all ${suggestedCount} suggested binding${suggestedCount === 1 ? "" : "s"}? Each binding decides which ` +
        `student a later grade post lands on, and posting a grade in this app cannot be undone.`
    );
    if (!proceed) return;
    setConfirmBusy(true);
    setConfirmError(null);
    setConfirmResult(null);
    const result = await onConfirmAllSuggested();
    setConfirmBusy(false);
    if ("error" in result) {
      setConfirmError(result.error);
      onAnnounce(result.error);
      return;
    }
    setConfirmResult(result.confirmed);
    const message = `Confirmed ${result.confirmed} binding${result.confirmed === 1 ? "" : "s"}.`;
    onAnnounce(message);
  };

  return (
    <section className={styles.linkPanel} aria-labelledby="repo-grades-link-heading">
      <h3 id="repo-grades-link-heading" className={styles.logTitle}>
        Link GitHub usernames to roster
      </h3>

      {noConfirmedRows && <p className={styles.linkLeadLine}>No repos are confirmed-bound to a roster student yet.</p>}

      <p className={pageStyles.fieldHint}>
        Students submit their own GitHub username to a Canvas assignment. Linking reads that assignment and matches each
        username to the roster student who submitted it - more reliable than the name-based guess the grid otherwise
        makes on its own, because it uses each student&apos;s own submission rather than an inferred match.
      </p>

      <p className={pageStyles.fieldHint}>
        Linking does not confirm anything by itself: a matched repo shows up as a SUGGESTED binding, the same state a
        row gets from a name-based guess. Use &quot;Confirm all suggested bindings&quot; below to confirm every match
        from this link in one write, instead of confirming rows one at a time.
      </p>

      {blockedReason && <p className={pageStyles.error}>{blockedReason}</p>}

      <div className={styles.linkPanelRow}>
        <label htmlFor="repo-grades-link-assignment" className={styles.linkPanelLabel}>
          Canvas assignment
        </label>
        <select
          id="repo-grades-link-assignment"
          value={assignmentId}
          onChange={(e) => onAssignmentIdChange(e.target.value)}
          disabled={assignmentsLoading || blockedReason !== null}
        >
          <option value="">{assignmentsLoading ? "Loading..." : "Choose an assignment..."}</option>
          {assignments.map((assignment) => (
            <option key={assignment.id} value={assignment.id}>
              {assignment.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={pageStyles.linkButton}
          disabled={linkDisabled}
          onClick={() => {
            void handleLink();
          }}
        >
          {linkBusy ? "Linking..." : "Link GitHub usernames"}
        </button>
      </div>

      {assignmentsLoading && <p className={pageStyles.fieldHint}>Loading the course&apos;s Canvas assignments...</p>}
      {assignmentsError && <p className={pageStyles.error}>{assignmentsError}</p>}
      {linkError && <p className={pageStyles.error}>{linkError}</p>}

      {/* The two lists below name what each bucket ACTUALLY is. An earlier
          draft labelled them "matched more than one roster student" and
          "already bound to a different student", and both were wrong:
          `ambiguous` comes from partitionGithubUsernameSubmissions and means
          the submitted TEXT did not parse as a GitHub username (a sentence, a
          typo'd URL) - no roster matching has happened at that point at all -
          while `conflicts` comes from buildRosterUpdate and means two students
          submitted the SAME username (that pair is skipped entirely) or two
          students share a display name (their repos get named with the
          username instead). Mislabelling these sends the instructor looking
          for the wrong problem in Canvas. */}
      {outcome && (
        <div className={styles.linkResult}>
          <p className={styles.linkResultLine}>{linkUsernamesSummaryLine(outcome)}</p>
          {outcome.ambiguous.length > 0 && (
            <div>
              <p className={styles.linkNoteLabel}>
                Could not read a GitHub username from these submissions - fix them in Canvas, or bind those repos by
                hand in the grid:
              </p>
              <ul className={styles.linkNoteList}>
                {outcome.ambiguous.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {outcome.conflicts.length > 0 && (
            <div>
              <p className={styles.linkNoteLabel}>Needs review - duplicate username or duplicate student name:</p>
              <ul className={styles.linkNoteList}>
                {outcome.conflicts.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {suggestedCount > 0 && (
        <div className={styles.linkPanelRow}>
          <button
            type="button"
            className={pageStyles.linkButton}
            disabled={confirmBusy}
            onClick={() => {
              void handleConfirmAll();
            }}
          >
            {confirmBusy ? "Confirming..." : `Confirm all ${suggestedCount} suggested binding${suggestedCount === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {/* Deliberately OUTSIDE the suggestedCount gate above. A successful
          confirm-all is exactly the thing that drives suggestedCount to 0, so
          rendering its own result inside that block would unmount the result
          in the same commit that produced it - the instructor would press the
          button and see the row simply vanish with no confirmation of what
          happened. */}
      {confirmError && <p className={pageStyles.error}>{confirmError}</p>}
      {confirmResult !== null && !confirmError && (
        <p className={pageStyles.fieldHint}>
          Confirmed {confirmResult} binding{confirmResult === 1 ? "" : "s"}.
        </p>
      )}
    </section>
  );
}
