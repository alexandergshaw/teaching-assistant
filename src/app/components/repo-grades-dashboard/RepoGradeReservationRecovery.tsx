"use client";

import { useState, useTransition } from "react";
import {
  readRepoGradeReservationsAction,
  recoverUnstartedRepoGradeReservationsAction,
} from "@/app/actions/repo-grade-recovery";
import { useSupabase } from "@/context/SupabaseProvider";
import { isOwnerDecision } from "@/lib/access";
import styles from "../repo-grades/repo-grades-dashboard.module.css";

type Snapshot = Awaited<ReturnType<typeof readRepoGradeReservationsAction>>;
type Reservation = Extract<Snapshot, { status: "loaded" }>["reservations"][number];

const RESERVATION_STATUS: Record<Reservation["state"], string> = {
  active: "Lease still active",
  "waiting-for-expiry": "Unstarted, waiting for lease expiry",
  "expired-unstarted": "Expired before dispatch",
  "evidence-required": "Outcome uncertain. Independent execution evidence required.",
  "attempt-unavailable": "Attempt details unavailable. Independent execution evidence required.",
};

export function RepoGradeReservationRecovery() {
  const { user, accessDecision } = useSupabase();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  if (!user || !isOwnerDecision(accessDecision)) return null;
  const accountId = user.id;
  const reservations = snapshot?.status === "loaded" ? snapshot.reservations : null;
  const canRecover = reservations?.some((row) => row.state === "expired-unstarted") ?? false;

  function inspect() {
    startTransition(async () => {
      const result = await readRepoGradeReservationsAction(accountId)
        .catch(() => ({ status: "unavailable" } as const));
      setSnapshot(result);
      setNotice(result.status === "loaded" ? "Reservations refreshed." : "Reservations could not be read.");
    });
  }

  function recover() {
    startTransition(async () => {
      const result = await recoverUnstartedRepoGradeReservationsAction(accountId)
        .catch(() => ({ status: "outcome-unconfirmed" } as const));
      setSnapshot(result.status === "checked" ? result.snapshot : null);
      if (result.status === "checked") {
        setNotice(result.snapshot.status === "loaded"
          ? "Recovery check completed. Reservations refreshed."
          : "Recovery check completed. Refresh to read the current reservations.");
      } else {
        setNotice("The recovery outcome could not be confirmed. Refresh reservations to check.");
      }
    });
  }

  return (
    <details className={styles.profileSettings}>
      <summary>Grading reservation recovery</summary>
      <p>Inspect reservations across this account. Recovery releases only expired attempts that the database confirms never dispatched.</p>
      <div>
        <button type="button" onClick={inspect} disabled={pending}>Check reservations</button>{" "}
        <button type="button" onClick={recover} disabled={pending || !canRecover}>Release expired unstarted attempts</button>
      </div>
      <p role="status">{pending ? "Checking repository grading reservations." : notice}</p>
      {reservations?.length === 0 && <p>No grading reservations were found.</p>}
      {!!reservations?.length && (
        <ul>
          {reservations.map(({ generation, repo, folder, state }) => (
            <li key={generation}>
              Attempt {generation}{repo && ` · ${repo}`}{folder && ` / ${folder}`} — {RESERVATION_STATUS[state]}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
