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
// SOURCE CONTROL (this wave). Two mutually exclusive ways to populate
// suggested bindings, chosen with a radiogroup, course table first and
// default:
//   1. "Usernames already in the course table" - the SAVED link the
//      instructor maintains by hand in the Courses tab's Roster tile
//      (course.roster, `Student Name | username` per line). No Canvas
//      connection needed at all - this is the one `liveLinkBlockedReason`
//      must NOT disable, because it is the entire fix for the instructor
//      who has no live Canvas link but does have thirty usernames typed into
//      that table. Shows the hook's `rosterOverlay` facts BEFORE the
//      instructor commits, so nothing here is a surprise once they press the
//      button.
//   2. "Read a Canvas assignment's submissions" - the original live path
//      below, unchanged in behaviour. This is the ONE `liveLinkBlockedReason`
//      disables (renamed from `blockedReason` - it only ever blocked THIS
//      path, never the course-table one, so the rename makes that scope
//      explicit rather than implied).
//
// Busy/error/result state is local useState, same as RepoGradesLogPanel.tsx
// and RepoBindingControl.tsx; every persistent value (the assignment choice,
// and now `linkSource`) is a prop the parent owns. `linkSource` (which of the
// two source choices is showing) used to be local useState with a comment
// here explaining repoGradesUiState.ts was outside that implementer's file
// set - that follow-up is done: it is now a controlled prop persisted under
// `ta-repo-grades-link-source` (repoGradesUiState.ts), the same shape
// `assignmentId`/`onAssignmentIdChange` already use.
//
// This file's own roster-source section moved out to
// LinkUsernamesRosterSection.tsx (this file had grown to 500 lines carrying
// two independent feature halves) - this file now only renders it for the
// roster branch and keeps the radiogroup, the live-submissions section, and
// the shared "Confirm all suggested bindings" section.
//
// No useEffect - nothing here needs one, and react-hooks/set-state-in-effect
// is strict in this repo. Every async call site sits behind a real onClick,
// matching the shape repoGrades.wiring.test.ts reads this folder's other
// files for.
import { useState } from "react";
import { isPostableAssignmentOption, type RepoGradeAssignmentOption } from "./repoGradesAssignmentSources";
import type { RosterUsernameOverlayResult } from "./rosterUsernameOverlay";
import { linkUsernamesSummaryLine, type LinkUsernamesOutcome } from "./linkRepoUsernames";
import type { ConfirmableBindingSummary } from "./repoGradesBindingConfirm";
import LinkUsernamesRosterSection from "./LinkUsernamesRosterSection";
import styles from "./repo-grades.module.css";
import pageStyles from "../../page.module.css";

type LinkSource = "roster" | "live";

export interface LinkUsernamesPanelProps {
  /** The merged Canvas-assignment picker options for the live-submissions
   * source below: the live course assignment list plus the course tile's own
   * saved export, so the picker still has something to offer when no live
   * Canvas connection exists. Each option carries which list it came from and
   * the real Canvas assignment id (null for an export option - see
   * isPostableAssignmentOption). Replaces the old raw `assignments` prop. */
  assignmentOptions: RepoGradeAssignmentOption[];
  /** The LIVE Canvas assignment list's own loading/error state. */
  assignmentsLoading: boolean;
  assignmentsError: string | null;
  /** The saved EXPORT's own assignment list loading/error state - independent
   * of the live list above, since an export can be read with no Canvas
   * connection at all and can fail (or still be loading) on its own. */
  exportAssignmentsLoading: boolean;
  exportAssignmentsError: string | null;
  /** The persisted assignment choice, owned by the parent. */
  assignmentId: string;
  onAssignmentIdChange: (assignmentId: string) => void;
  /** Which of the two source choices is showing - persisted, owned by the
   * parent (repoGradesUiState.ts's `ta-repo-grades-link-source`). Defaults to
   * "roster": it needs no Canvas connection, so it is the choice most likely
   * to actually work the first time an instructor opens this panel. */
  linkSource: LinkSource;
  onLinkSourceChange: (linkSource: LinkSource) => void;
  /** Non-null when the LIVE-SUBMISSIONS source cannot run at all (no course
   * chosen, no institution on the tile, no Canvas course URL) - render the
   * reason and disable ONLY that source's controls. Renamed from
   * `blockedReason`: the course-table source below never needed a live Canvas
   * link, and this rename makes that scope explicit instead of leaving it to
   * be re-discovered by reading the whole file. */
  liveLinkBlockedReason: string | null;
  /** The course table roster's own overlay preview - what applying it right
   * now would do, computed live so the instructor sees the effect before
   * committing to it. */
  rosterOverlay: RosterUsernameOverlayResult;
  /** Applies the course table roster's GitHub usernames (course.roster) as
   * suggested bindings, in one write, with no Canvas read at all. Resolves to
   * the outcome, or an error to display. */
  onLinkFromCourseRoster: () => Promise<
    { matched: number; added: number; withoutCanvasId: number; conflicts: string[] } | { error: string }
  >;
  /** True when the grid has rows but none is confirmed-bound - the panel leads
   * with the "nothing is bound yet" framing in that case. */
  noConfirmedRows: boolean;
  /** The currently-suggested rows, split into what a batch confirm may
   * actually send (`confirmable`) and what it must exclude (`blocked`), with
   * `blockedDetail` naming how many and why (U9.37). THE CRITICAL RULE this
   * exists for: the button's label and the click handler's payload must both
   * be built from `confirmable` - never from the raw suggested-row count -
   * or an instructor can see "Confirm all 11 suggested bindings", click it,
   * and land on "No bindings to confirm." with nothing explained. */
  confirmableSummary: ConfirmableBindingSummary;
  /** Runs the live-submissions link. Resolves to the outcome, or an error to
   * display. */
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
  assignmentOptions,
  assignmentsLoading,
  assignmentsError,
  exportAssignmentsLoading,
  exportAssignmentsError,
  assignmentId,
  onAssignmentIdChange,
  linkSource,
  onLinkSourceChange,
  liveLinkBlockedReason,
  rosterOverlay,
  onLinkFromCourseRoster,
  noConfirmedRows,
  confirmableSummary,
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

  const chosenAssignmentOption = assignmentOptions.find((option) => option.value === assignmentId) ?? null;
  // The live-submissions read needs a REAL Canvas assignment id to fetch
  // submissions for - an export option's `canvasAssignmentId` is always null
  // (it is not postable either, for the exact same reason: nothing behind it
  // is a live Canvas assignment). isPostableAssignmentOption is the one place
  // that decision is made (repoGradesAssignmentSources.ts), reused here
  // rather than re-testing `canvasAssignmentId !== null` by hand so this
  // gate can never drift from the posting gate it is really the same check
  // as.
  const chosenOptionUsableForLiveRead = isPostableAssignmentOption(chosenAssignmentOption);
  const anyAssignmentListLoading = assignmentsLoading || exportAssignmentsLoading;
  const linkDisabled =
    linkBusy ||
    anyAssignmentListLoading ||
    liveLinkBlockedReason !== null ||
    !chosenAssignmentOption ||
    !chosenOptionUsableForLiveRead;

  const handleLink = async () => {
    if (!chosenAssignmentOption || !chosenOptionUsableForLiveRead || chosenAssignmentOption.canvasAssignmentId === null) return;
    setLinkBusy(true);
    setLinkError(null);
    setOutcome(null);
    const result = await onLink(chosenAssignmentOption.canvasAssignmentId, chosenAssignmentOption.label);
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
    // own clear-log confirm names for its own (much smaller) risk. The count
    // named here is `confirmableSummary.confirmable` - the SAME number the
    // button below is labelled from and the SAME number onConfirmAllSuggested
    // actually sends - never the raw suggested-row count, which can be higher
    // than what this click can safely do.
    const confirmableCount = confirmableSummary.confirmable;
    const proceed = window.confirm(
      `Confirm all ${confirmableCount} suggested binding${confirmableCount === 1 ? "" : "s"}? Each binding decides ` +
        `which student a later grade post lands on, and posting a grade in this app cannot be undone.`
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
    const blockedNote =
      confirmableSummary.blocked > 0
        ? ` ${confirmableSummary.blockedDetail}`
        : "";
    setConfirmResult(result.confirmed);
    const message = `Confirmed ${result.confirmed} binding${result.confirmed === 1 ? "" : "s"}.${blockedNote}`;
    onAnnounce(message);
  };

  return (
    <section className={styles.linkPanel} aria-labelledby="repo-grades-link-heading">
      <h3 id="repo-grades-link-heading" className={styles.logTitle}>
        Link GitHub usernames to roster
      </h3>

      {noConfirmedRows && <p className={styles.linkLeadLine}>No repos are confirmed-bound to a roster student yet.</p>}

      <p className={pageStyles.fieldHint}>
        A repo binds to the roster student whose GitHub username matches it. Pick where those usernames come from
        below.
      </p>

      {/* Repo Grades UI consistency audit item #3 - DELIBERATELY LEFT
          hand-rolled, not converted to a MUI Button pair or ToggleButtonGroup.
          This pair already implements the WAI-ARIA "radio group" pattern
          exactly (role="radiogroup" here, role="radio" + aria-checked below)
          - the canonical pattern for a segmented control where exactly one of
          two options is always selected. A `Button` pair with
          `variant={active?"contained":"outlined"}` (this app's usual toggle
          idiom) would carry no ARIA relationship between the two buttons at
          all. MUI `ToggleButtonGroup` is closer but uses `aria-pressed` (the
          "toggle button" pattern), which the ARIA Authoring Practices reserve
          for independent on/off buttons, not a mutually-exclusive segmented
          choice - swapping in either replacement would be an accessibility
          DOWNGRADE from what already renders here, so it stays native. */}
      <div className={styles.linkSourceToggle} role="radiogroup" aria-label="Where to read GitHub usernames from">
        <button
          type="button"
          role="radio"
          aria-checked={linkSource === "roster"}
          className={linkSource === "roster" ? styles.linkSourceButtonActive : styles.linkSourceButton}
          onClick={() => onLinkSourceChange("roster")}
        >
          Usernames already in the course table
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={linkSource === "live"}
          className={linkSource === "live" ? styles.linkSourceButtonActive : styles.linkSourceButton}
          onClick={() => onLinkSourceChange("live")}
        >
          Read a Canvas assignment&apos;s submissions
        </button>
      </div>

      {linkSource === "roster" && (
        <LinkUsernamesRosterSection
          rosterOverlay={rosterOverlay}
          onLinkFromCourseRoster={onLinkFromCourseRoster}
          onAnnounce={onAnnounce}
        />
      )}

      {linkSource === "live" && (
        <div className={styles.linkSourceSection}>
          <p className={pageStyles.fieldHint}>
            Students submit their own GitHub username to a Canvas assignment. Reading that assignment matches each
            username to the roster student who submitted it - more reliable than the name-based guess the grid
            otherwise makes on its own, because it uses each student&apos;s own submission rather than an inferred
            match.
          </p>

          <p className={pageStyles.fieldHint}>
            Linking does not confirm anything by itself: a matched repo shows up as a SUGGESTED binding, the same
            state a row gets from a name-based guess. Use &quot;Confirm all suggested bindings&quot; below to confirm
            every match from this link in one write, instead of confirming rows one at a time.
          </p>

          {liveLinkBlockedReason && <p className={pageStyles.error}>{liveLinkBlockedReason}</p>}

          <div className={styles.linkPanelRow}>
            <label htmlFor="repo-grades-link-assignment" className={styles.linkPanelLabel}>
              Canvas assignment
            </label>
            <select
              id="repo-grades-link-assignment"
              value={assignmentId}
              onChange={(e) => onAssignmentIdChange(e.target.value)}
              disabled={anyAssignmentListLoading || liveLinkBlockedReason !== null}
            >
              <option value="">{anyAssignmentListLoading ? "Loading…" : "Choose an assignment…"}</option>
              {assignmentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
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
              {linkBusy ? "Linking…" : "Link GitHub usernames"}
            </button>
          </div>

          {/* An export option is a perfectly fine thing to have selected in
              this picker (it is still a real assignment name to recognize),
              but Canvas has no live submissions to read for it - only a real
              Canvas assignment id supports that. Say so instead of leaving the
              disabled button unexplained. */}
          {chosenAssignmentOption && !chosenOptionUsableForLiveRead && !liveLinkBlockedReason && (
            <p className={pageStyles.fieldHint}>
              &quot;{chosenAssignmentOption.label}&quot; is from the saved course export, not a live Canvas
              assignment, so there are no submissions to read for it here. Choose a live Canvas assignment instead,
              or use the course table source above.
            </p>
          )}

          {assignmentsLoading && <p className={pageStyles.fieldHint} role="status" aria-live="polite">Loading the course&apos;s Canvas assignments…</p>}
          {assignmentsError && <p className={pageStyles.error}>{assignmentsError}</p>}
          {exportAssignmentsLoading && (
            <p className={pageStyles.fieldHint} role="status" aria-live="polite">Loading the saved export&apos;s assignments…</p>
          )}
          {exportAssignmentsError && <p className={pageStyles.error}>{exportAssignmentsError}</p>}
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
                    Could not read a GitHub username from these submissions - fix them in Canvas, or bind those repos
                    by hand in the grid:
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
        </div>
      )}

      {confirmableSummary.confirmable + confirmableSummary.blocked > 0 && (
        <div className={styles.linkPanelRow}>
          {/* U9.37 / the label-vs-payload defect: labelled from
              confirmableSummary.confirmable, the exact number
              onConfirmAllSuggested sends - never the raw suggested-row
              count, which includes rows this click cannot safely confirm.
              Promoted from .linkButton to .submitButton (section 6/7 of the
              acceptance criteria: one of the four consequential actions),
              since it writes a binding a later grade post relies on. */}
          <button
            type="button"
            className={pageStyles.submitButton}
            disabled={confirmBusy || confirmableSummary.confirmable === 0}
            onClick={() => {
              void handleConfirmAll();
            }}
          >
            {confirmBusy
              ? "Confirming…"
              : `Confirm all ${confirmableSummary.confirmable} suggested binding${
                  confirmableSummary.confirmable === 1 ? "" : "s"
                }`}
          </button>
          {/* Stated up front, not only after a failed click: how many
              suggested rows this action cannot touch, and why - so an
              instructor never sees a confident "Confirm all N" that turns
              out to send fewer than N. */}
          {confirmableSummary.blocked > 0 && (
            <span className={pageStyles.fieldHint}>{confirmableSummary.blockedDetail}</span>
          )}
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
