"use client";

// The send half of the messaging modal (LIVE-LMS-STUDENT-MESSAGING W4): the
// MANDATORY count-labelled confirm, the progress line, and the per-student
// outcome list. It renders state owned by useLiveSend; it starts nothing by
// itself. The only control that starts an outward send is the confirm button,
// and it is rendered only in the "confirm" phase.

import type { EnrollmentRow } from "@/lib/live-messaging/enrollment-aggregator";
import { OUTCOME_LABELS, PAUSED_COPY, describeDuplicate } from "@/lib/live-messaging/send-copy";
import { confirmLabel, sendKey } from "@/lib/live-messaging/send-job";
import type { useLiveSend } from "./useLiveSend";
import styles from "./SuccessTracking.module.css";

type LiveSend = ReturnType<typeof useLiveSend>;

export interface SendPanelProps {
  send: LiveSend;
  institution: string;
  students: readonly EnrollmentRow[];
}

export default function SendPanel({ send, institution, students }: SendPanelProps) {
  const { state } = send;
  const byKey = new Map(students.map((s) => [sendKey(s.courseId, s.userId), s]));
  const label = (key: string) => {
    const row = byKey.get(key);
    return row ? `${row.name} - ${row.course}` : "Student";
  };

  if (state.phase === "idle") return null;

  if (state.phase === "preparing") {
    return (
      <p className={styles.hintMuted} role="status">
        Checking the messages...
      </p>
    );
  }

  if (state.phase === "error") {
    return (
      <div className={styles.errorBanner} role="alert">
        {state.error ?? "Something went wrong. Nothing was sent."}
        <div className={styles.modalActions}>
          <button type="button" className={styles.button} onClick={send.reset}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "confirm" && state.prepared) {
    const { plan, excluded } = state.prepared;
    return (
      <div className={styles.noticeBanner} role="group" aria-label="Confirm send">
        <p className={styles.hint}>
          {`${plan.targets.length - excluded.length} messages are ready for ${state.prepared.institution}.`}
          {plan.unsendable > 0 ? ` ${plan.unsendable} skipped for a missing variable.` : ""}
          {plan.duplicateRows > 0 ? ` ${plan.duplicateRows} duplicate rows merged.` : ""}
        </p>
        {excluded.length > 0 ? (
          <ul className={styles.previewList} aria-label="Already on record">
            {excluded.map((e) => (
              <li key={e.key} className={styles.previewItem}>
                <label className={styles.field}>
                  <span className={styles.previewTo}>{label(e.key)}</span>
                  <span className={styles.hintMuted}>{describeDuplicate(e.dupStatus)}</span>
                  <span>
                    <input
                      type="checkbox"
                      checked={state.overrides.has(e.key)}
                      onChange={() => send.toggleOverride(e.key)}
                    />{" "}
                    Send anyway
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
        {!send.gateOpen ? (
          <p className={styles.previewWarn} role="status">
            The messages changed after they were checked. Press Send again.
          </p>
        ) : null}
        <div className={styles.modalActions}>
          <button type="button" className={styles.button} onClick={send.reset}>
            Go back
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            disabled={!send.gateOpen}
            onClick={() => void send.confirmAndSend()}
          >
            {confirmLabel(send.confirmCount, state.prepared.institution)}
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "retry-confirm") {
    return (
      <div className={styles.noticeBanner} role="group" aria-label="Confirm retry">
        <p className={styles.hint}>Canvas refused these messages. Retrying sends them again.</p>
        <div className={styles.modalActions}>
          <button type="button" className={styles.button} onClick={send.cancelRetry}>
            Go back
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={() => void send.confirmRetry()}
          >
            {`${confirmLabel(send.refusedCount, institution)} (retry)`}
          </button>
        </div>
      </div>
    );
  }

  // starting, sending, done
  const finished = state.phase === "done";
  const processed = send.counts.accepted + send.counts.refused + send.counts.unknown;
  return (
    <div className={styles.noticeBanner} role="group" aria-label="Send progress">
      <p className={styles.hint} role="status" aria-live="polite">
        {finished
          ? `Finished. ${send.counts.accepted} accepted, ${send.counts.refused} refused, ${send.counts.unknown} unconfirmed, ${send.counts.notAttempted} not attempted.`
          : `Working: ${processed} of ${state.total} processed.`}
      </p>
      {state.halted && finished ? <p className={styles.previewWarn}>{PAUSED_COPY}</p> : null}
      {!finished ? (
        <div className={styles.modalActions}>
          <button type="button" className={styles.button} onClick={send.stop} disabled={state.phase === "starting"}>
            Stop
          </button>
        </div>
      ) : null}
      {Object.keys(state.results).length > 0 ? (
        <ul className={styles.previewList} aria-label="Send results">
          {Object.values(state.results).map((r) => (
            <li key={r.key} className={styles.previewItem}>
              <span className={styles.previewTo}>{label(r.key)}</span>
              <div className={styles.previewSubject}>{OUTCOME_LABELS[r.outcome]}</div>
            </li>
          ))}
        </ul>
      ) : null}
      {finished ? (
        <div className={styles.modalActions}>
          {send.refusedCount > 0 ? (
            <button type="button" className={styles.button} onClick={send.askRetry}>
              {`Retry ${send.refusedCount} refused`}
            </button>
          ) : null}
          <button type="button" className={styles.button} onClick={send.reset}>
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}
