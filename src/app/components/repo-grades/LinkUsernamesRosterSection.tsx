"use client";

// Repo Grades view - the "course table roster" half of LinkUsernamesPanel's
// two link sources. Pulled out ONLY because LinkUsernamesPanel.tsx (already
// pulled out of index.tsx for the same reason) grew to 500 lines carrying two
// independent feature halves, and index.tsx itself hit this codebase's
// 1000-line-per-file cap and had nowhere left to grow. This is the part of
// that panel with no decisions in it: every value shown (the matched/added/
// withoutCanvasId counts, the conflicts list) and the apply action all come
// in as props. This component owns only its own transient busy/error/result
// state, the same shape LinkUsernamesPanel.tsx's live-submissions section
// still owns for itself.
//
// This is a MOVE, not a redesign - every user-visible string, every disabled
// condition, and the onAnnounce routing are preserved exactly from
// LinkUsernamesPanel.tsx's original roster branch.
//
// CRITICAL HONESTY REQUIREMENT (kept verbatim from the original wave brief):
// a roster row with no numeric Canvas user id can tell the instructor WHICH
// student owns a repo, but postCanvasGrades requires a numeric id and
// src/lib/repo-student-bindings.ts:151-179 treats a present-but-non-numeric
// id as unbound, not confirmed - so a binding like this can never be posted.
// This must keep saying so plainly whenever the count is non-zero, not leave
// it sitting unexplained next to a bare number.
//
// No useEffect - nothing here needs one, and react-hooks/set-state-in-effect
// is strict in this repo. The one async call site sits behind a real onClick.
import { useState } from "react";
import type { RosterUsernameOverlayResult } from "./rosterUsernameOverlay";
import styles from "./repo-grades.module.css";
import pageStyles from "../../page.module.css";

export interface LinkUsernamesRosterSectionProps {
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
  /** Routes a one-line outcome into the view's EXISTING role="status" region
   * (index.tsx's postSummary). Do NOT add a second aria-live region to this
   * page - two live regions on one view compete and a screen reader user gets
   * whichever won. */
  onAnnounce: (message: string) => void;
}

export default function LinkUsernamesRosterSection({
  rosterOverlay,
  onLinkFromCourseRoster,
  onAnnounce,
}: LinkUsernamesRosterSectionProps) {
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterResult, setRosterResult] = useState<{ matched: number; added: number; withoutCanvasId: number } | null>(
    null
  );

  // Nothing at all for the course table source to act on - true both when the
  // Roster tile has never had a username typed into it, and when every
  // roster-sourced username is already reflected on the tile (the common
  // "already synced" steady state). Either way, offering the apply button
  // here would only ever be a no-op, so this says so and points at where
  // usernames actually get added instead.
  const rosterHasNothing =
    rosterOverlay.matched === 0 &&
    rosterOverlay.added === 0 &&
    rosterOverlay.withoutCanvasId === 0 &&
    rosterOverlay.conflicts.length === 0;

  const handleLinkFromRoster = async () => {
    setRosterBusy(true);
    setRosterError(null);
    setRosterResult(null);
    const result = await onLinkFromCourseRoster();
    setRosterBusy(false);
    if ("error" in result) {
      setRosterError(result.error);
      onAnnounce(result.error);
      return;
    }
    setRosterResult(result);
    const message =
      `Applied usernames from the course table - matched ${result.matched}, added ${result.added}` +
      (result.withoutCanvasId > 0 ? `, ${result.withoutCanvasId} without a Canvas user id` : "") +
      ".";
    onAnnounce(message);
  };

  return (
    <div className={styles.linkSourceSection}>
      <p className={pageStyles.fieldHint}>
        Applies the GitHub usernames already saved in this course&apos;s Roster tile (Courses tab) - no Canvas
        connection needed, and this works even when the reason shown under the other source below applies.
      </p>

      {rosterHasNothing ? (
        <p className={pageStyles.fieldHint}>
          No GitHub usernames from the course table roster are available to link right now. Add them in the
          Courses tab&apos;s Roster tile (one &quot;Student Name | username&quot; line per student).
        </p>
      ) : (
        <>
          <p className={styles.linkResultLine}>
            {rosterOverlay.matched} student{rosterOverlay.matched === 1 ? "" : "s"} would fill in a blank binding,{" "}
            {rosterOverlay.added} would be added
            {rosterOverlay.withoutCanvasId > 0
              ? `, ${rosterOverlay.withoutCanvasId} with no Canvas user id`
              : ""}
            .
          </p>

          {/* CRITICAL HONESTY REQUIREMENT (wave brief): a roster row with no
              numeric Canvas user id can tell the instructor WHICH student
              owns a repo, but postCanvasGrades requires a numeric id and
              repo-student-bindings.ts:151-179 treats a present-but-non-
              numeric id as unbound, not confirmed - so a binding like this
              can never be posted. This must say so plainly whenever the
              count is non-zero, not leave it sitting unexplained next to a
              bare number. */}
          {rosterOverlay.withoutCanvasId > 0 && (
            <p className={pageStyles.fieldHint}>
              {rosterOverlay.withoutCanvasId} of those student{rosterOverlay.withoutCanvasId === 1 ? "" : "s"}{" "}
              have no Canvas user id on file. Their repos will be identifiable in the grid by name, but cannot be
              posted to Canvas until the course tile learns their Canvas user ids - reading a live Canvas
              assignment&apos;s submissions (the other source below), or a Canvas roster sync, supplies that.
            </p>
          )}

          {rosterOverlay.conflicts.length > 0 && (
            <div>
              <p className={styles.linkNoteLabel}>Needs review - duplicate username or duplicate student name:</p>
              <ul className={styles.linkNoteList}>
                {rosterOverlay.conflicts.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.linkPanelRow}>
            <button
              type="button"
              className={pageStyles.linkButton}
              disabled={rosterBusy}
              onClick={() => {
                void handleLinkFromRoster();
              }}
            >
              {rosterBusy ? "Applying…" : "Apply usernames from the course table"}
            </button>
          </div>
        </>
      )}

      {rosterError && <p className={pageStyles.error}>{rosterError}</p>}
      {rosterResult && !rosterError && (
        <p className={pageStyles.fieldHint}>
          Applied - matched {rosterResult.matched}, added {rosterResult.added}
          {rosterResult.withoutCanvasId > 0 ? `, ${rosterResult.withoutCanvasId} without a Canvas user id` : ""}.
        </p>
      )}
    </div>
  );
}
