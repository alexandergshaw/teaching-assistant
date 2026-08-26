"use client";

// Repo Grades view - AC2 (docs/repo-grades-view-acceptance-criteria.md, items
// 5, 6, 10). One row's binding display + the explicit per-row action that
// moves a "suggested"/"ambiguous"/"unbound" row toward "confirmed". Split out
// of RepoGradesGrid.tsx so that file stays focused on table layout, and so
// this file's wiring (every acceptBinding call gated behind a real button
// click, never automatic) is easy to read and easy to guard - see
// repoGrades.wiring.test.ts, which reads this file as text.
//
// NOTHING here auto-applies (AC2 item 6): suggestRepoStudentBindings
// (src/lib/repo-student-bindings.ts) only classifies; every branch below
// requires the user to press a button naming exactly which student it will
// bind before onAcceptBinding is ever called.
import { useState } from "react";
import type { RepoBindingRosterEntry } from "@/lib/repo-student-bindings";
import type { RepoGradeRow } from "./repoGradesRows";
import { isConfirmableCandidate } from "./repoGradesBindingConfirm";
import styles from "./repo-grades.module.css";
import pageStyles from "../../page.module.css";

export interface RepoBindingControlProps {
  row: RepoGradeRow;
  roster: RepoBindingRosterEntry[];
  onAcceptBinding: (
    repo: string,
    canvasUserId: string,
    student: string,
    username: string | null
  ) => Promise<{ ok: true } | { error: string }>;
}

export default function RepoBindingControl({ row, roster, onAcceptBinding }: RepoBindingControlProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedRosterId, setPickedRosterId] = useState("");

  const accept = async (canvasUserId: string, student: string) => {
    setBusy(true);
    setError(null);
    const result = await onAcceptBinding(row.repo, canvasUserId, student, null);
    setBusy(false);
    if ("error" in result) setError(result.error);
  };

  if (row.binding.state === "confirmed") {
    return (
      <div className={styles.bindingCell}>
        <span className={styles.bindingBadgeConfirmed}>Confirmed</span>
        <span className={styles.bindingDetail}>
          {row.binding.student ?? "Unnamed student"} - Canvas id {row.binding.canvasUserId}
        </span>
      </div>
    );
  }

  // U9.36: see the isConfirmableCandidate import above and
  // repoGradesBindingConfirm.ts's header comment for why a candidate with no
  // confirmable Canvas user id must not get a "Confirm binding" button.
  if (row.binding.state === "suggested") {
    const candidate = row.binding.candidates[0];
    const candidateConfirmable = isConfirmableCandidate(candidate);
    return (
      <div className={styles.bindingCell}>
        <span className={styles.bindingBadgeSuggested}>Suggested</span>
        <span className={styles.bindingDetail}>{row.binding.student ?? "Unknown"}</span>
        {candidate && candidateConfirmable && (
          <button
            type="button"
            className={pageStyles.linkButton}
            disabled={busy}
            onClick={() => {
              void accept(candidate.canvasUserId, candidate.name);
            }}
          >
            {busy ? "Confirming..." : "Confirm binding"}
          </button>
        )}
        {candidate && !candidateConfirmable && (
          <>
            <span className={styles.postReason}>
              This match has no Canvas user id yet, so it cannot be confirmed directly - run
              &quot;Read a Canvas assignment&apos;s submissions&quot; in the panel above to get one, or bind this repo
              to a roster student by hand below.
            </span>
            <div className={styles.unboundPicker}>
              <select
                aria-label={`Bind ${row.repo} to a roster student`}
                value={pickedRosterId}
                onChange={(e) => setPickedRosterId(e.target.value)}
                disabled={busy || roster.length === 0}
              >
                <option value="">{roster.length === 0 ? "No roster loaded" : "Choose a student..."}</option>
                {roster.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={pageStyles.linkButton}
                disabled={busy || !pickedRosterId}
                onClick={() => {
                  const picked = roster.find((student) => student.id === pickedRosterId);
                  if (!picked) return;
                  void accept(picked.id, picked.name);
                }}
              >
                {busy ? "Binding..." : "Bind"}
              </button>
            </div>
          </>
        )}
        {error && <span className={pageStyles.error}>{error}</span>}
      </div>
    );
  }

  if (row.binding.state === "ambiguous") {
    return (
      <div className={styles.bindingCell}>
        <span className={styles.bindingBadgeAmbiguous}>Ambiguous - {row.binding.candidates.length} matches</span>
        <ul className={styles.candidateList}>
          {row.binding.candidates.map((candidate) => (
            <li key={candidate.canvasUserId} className={styles.candidateItem}>
              <span className={styles.bindingDetail}>{candidate.name}</span>
              <button
                type="button"
                className={pageStyles.linkButton}
                disabled={busy}
                onClick={() => {
                  void accept(candidate.canvasUserId, candidate.name);
                }}
              >
                Bind to this student
              </button>
            </li>
          ))}
        </ul>
        {error && <span className={pageStyles.error}>{error}</span>}
      </div>
    );
  }

  // "unbound" - a manual picker over the full roster (AC2 item 5).
  return (
    <div className={styles.bindingCell}>
      <span className={styles.bindingBadgeUnbound}>Unbound</span>
      {row.binding.student && <span className={styles.bindingDetail}>Stored name: {row.binding.student}</span>}
      <div className={styles.unboundPicker}>
        <select
          aria-label={`Bind ${row.repo} to a roster student`}
          value={pickedRosterId}
          onChange={(e) => setPickedRosterId(e.target.value)}
          disabled={busy || roster.length === 0}
        >
          <option value="">{roster.length === 0 ? "No roster loaded" : "Choose a student..."}</option>
          {roster.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={pageStyles.linkButton}
          disabled={busy || !pickedRosterId}
          onClick={() => {
            const picked = roster.find((student) => student.id === pickedRosterId);
            if (!picked) return;
            void accept(picked.id, picked.name);
          }}
        >
          {busy ? "Binding..." : "Bind"}
        </button>
      </div>
      {error && <span className={pageStyles.error}>{error}</span>}
    </div>
  );
}
