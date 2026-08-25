"use client";

// The "Scheduled releases" panel - the Automations hub view F11.4/F11.5
// (docs/scheduled-publishing-from-modules-acceptance-criteria.md) give this
// feature. Releases are created in the Modules view's bulk bar (entry 340),
// but a committed release is not a Modules concern once made - and nothing
// before this panel could see or call one off (entry 340's own "Limits"
// section named that gap explicitly). This is that gap closed.
//
// F11.1 IS THE REASON THIS PANEL EXISTS. Committing a release unpublished its
// targets immediately, so "Cancel" here means "call it off AND put the
// content back", never "forget this row" - every string this panel shows for
// a cancel action comes from scheduledReleasesPanelLogic.ts, which states
// that in restore terms throughout: in the button label, the confirm dialog,
// and the outcome note alike.
//
// STRUCTURE MIRRORS CronHeartbeatStatus.tsx / RepoGradesLogPanel.tsx: this
// component owns NO decisions of its own. Every fact a row shows - the
// target label, the course label, the locale-formatted release instant, the
// status text and tone, whether cancelling would restore visibility, the
// button's own label, the confirm text, and the post-cancel outcome note -
// is computed by an exported pure function in scheduledReleasesPanelLogic.ts
// and merely rendered here, because vitest is node-env and renders no
// component: anything decided inside this file's JSX would be untestable
// forever.
//
// Effect idiom matches CronHeartbeatStatus.tsx exactly: async IIFE inside
// useEffect with a `cancelled` flag, setState only after the await (eslint
// errors on setState reached synchronously from an effect). Loads once on
// mount; refreshes only after a cancel actually resolves, so a row's status
// is real rather than optimistic - never a timer, matching every other panel
// in this hub.
//
// listScheduledReleasesAction/cancelScheduledReleaseAction (sibling file:
// src/app/actions/scheduled-releases.ts) are only called here, never
// re-implemented. Per that action's own header, cancelScheduledReleaseAction
// returns CancelReleaseResult DIRECTLY (never a `{ error: string }`
// alternative) - every failure mode it can hit is already modeled as the
// "could-not-cancel" case with its own honest reason, so handleCancel below
// has no separate error branch to worry about.

import { useEffect, useState } from "react";
import { listScheduledReleasesAction, cancelScheduledReleaseAction } from "@/app/actions/scheduled-releases";
import type { ScheduledRelease } from "@/lib/scheduled-releases";
import {
  formatReleaseTargetLabel,
  formatReleaseCourseLabel,
  formatReleaseInstant,
  describeReleaseRowStatus,
  releaseStatusBadgeClassName,
  canCancelRelease,
  describeCancelRestorePreview,
  cancelButtonLabel,
  buildCancelConfirmMessage,
  describeCancelOutcome,
  sortScheduledReleasesForDisplay,
} from "./scheduledReleasesPanelLogic";
import styles from "../../page.module.css";
import tableStyles from "./AutomationsTable.module.css";

type OutcomeNote = { kind: "success" | "warning" | "error"; text: string };

export function ScheduledReleasesPanel() {
  // null = "the mount fetch has not resolved yet" - same no-argument,
  // fetch-once idiom as CronHeartbeatStatus's own `status` state.
  const [releases, setReleases] = useState<ScheduledRelease[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [note, setNote] = useState<OutcomeNote | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listScheduledReleasesAction();
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
        return;
      }
      setReleases(result.releases);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh after a cancel - never optimistic. A separate function (rather
  // than reusing the mount effect) because this one is called imperatively
  // from handleCancel's own async flow, after that request has already
  // resolved.
  const reload = () => {
    void (async () => {
      const result = await listScheduledReleasesAction();
      if ("error" in result) {
        setLoadError(result.error);
        return;
      }
      setLoadError(null);
      setReleases(result.releases);
    })();
  };

  const handleCancel = (release: ScheduledRelease) => {
    const targetLabel = formatReleaseTargetLabel(release.target);
    // F11.1: the confirm names the target and states plainly what happens to
    // its visibility - never a bare "are you sure?".
    if (!window.confirm(buildCancelConfirmMessage(targetLabel, release.wasPublished))) return;

    void (async () => {
      setCancellingId(release.id);
      setNote(null);
      const result = await cancelScheduledReleaseAction({ id: release.id });
      setCancellingId(null);
      setNote(describeCancelOutcome(result, targetLabel));
      reload();
    })();
  };

  // Fetch still in flight on first paint - nothing to say yet, matching
  // CronHeartbeatStatus's own "render nothing" choice for the same case.
  if (releases === null && loadError === null) return null;

  const sorted = releases ? sortScheduledReleasesForDisplay(releases) : [];

  return (
    <section>
      <h3 style={{ margin: "0 0 10px", fontSize: "0.95rem" }}>Scheduled releases{releases ? ` (${releases.length})` : ""}</h3>

      {loadError && (
        <p role="alert" className={styles.error}>
          {loadError}
        </p>
      )}

      {note && (
        <p
          role="status"
          aria-live="polite"
          className={note.kind === "error" ? styles.error : styles.fieldHint}
          style={note.kind === "warning" ? { color: "var(--warning-ink)" } : undefined}
        >
          {note.text}
        </p>
      )}

      {releases && releases.length === 0 && (
        <>
          <p className={styles.fieldHint}>Nothing is scheduled right now.</p>
          <p className={styles.fieldHint} style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Releases are created from the Modules view&apos;s bulk bar - select modules or items, choose a release time, and commit.
          </p>
        </>
      )}

      {releases && releases.length > 0 && (
        <div className={tableStyles.scroller}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th scope="col">Target</th>
                <th scope="col">Course</th>
                <th scope="col">Release time</th>
                <th scope="col">Status</th>
                <th scope="col">If cancelled</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((release) => {
                const status = describeReleaseRowStatus(release, new Date());
                const cancellable = canCancelRelease(release.status);
                const restorePreview = describeCancelRestorePreview(release.wasPublished);
                const badgeClass = styles[releaseStatusBadgeClassName(status.tone)];
                return (
                  <tr key={release.id}>
                    <td>{formatReleaseTargetLabel(release.target)}</td>
                    <td>{formatReleaseCourseLabel(release)}</td>
                    <td>{formatReleaseInstant(release.releaseAt)}</td>
                    <td>
                      <span className={`${styles.ghBadge} ${badgeClass}`}>{status.label}</span>
                      <div className={styles.fieldHint} style={{ marginTop: 4 }}>
                        {status.hint}
                      </div>
                    </td>
                    <td>{cancellable ? restorePreview.text : "-"}</td>
                    <td>
                      {cancellable ? (
                        <button
                          type="button"
                          className={styles.linkButton}
                          disabled={cancellingId === release.id}
                          onClick={() => handleCancel(release)}
                        >
                          {cancellingId === release.id ? "Cancelling..." : cancelButtonLabel(release.wasPublished)}
                        </button>
                      ) : (
                        <span className={styles.fieldHint}>-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
