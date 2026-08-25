"use client";

// The "Scheduled release" review modal -
// docs/scheduled-publishing-from-modules-acceptance-criteria.md, F6/F7/F10
// (the "Post-design corrections" section is THE FINAL CONTRACT). Renders at
// ModulesView root via ModulesViewSecondaryModals.tsx, never inside the bulk
// bar that opens it - the same reason CarryModulePatternReviewModal.tsx and
// CommandProposalModal.tsx both give in their own header comments:
// `.bulkBarBody`'s height ceiling and the sticky header's stacking-context
// trap forbid a modal rendering from inside it. Reuses ModalShell and the
// same previewHeader/previewMeta/previewContent/previewFooter grammar, and
// the same bulkRow/bulkField/bulkHint row language, every other Tier-1 modal
// in this tab already uses.
//
// THIS COMPONENT IS A THIN RENDERER. Every decision - which targets exist at
// all (F10's module+item expansion), each target's hide state
// (hideable/already-hidden/refused/unknown, F4), which rows dropped out of
// the current selection (staleness), and the header's own counts - was
// already computed by src/lib/release-plan.ts's pure functions and
// useScheduledRelease.ts's own `buildReleaseReviewRows`. Nothing here
// recomputes any of that; it only reads the hook's return value and renders
// it. Only ever mounted while `reviewVisible` is true (the same
// `isReleaseReviewVisible` predicate that gates ModulesView.tsx's
// `releaseReviewOpen` bulk-bar fact).
//
// F4/F10 - THE REFUSAL IS SURFACED HERE, BEFORE COMMIT, NEVER HIDDEN. Each
// row's hide state renders as an always-visible tag (never a title tooltip,
// matching this tab's own E3 constraint every other Tier-1 modal already
// follows) plus, for anything other than "hideable", the exact reason
// `describeReleaseHideState` (release-plan.ts) already wrote - a "refused"
// row still shows the target as scheduled (F10: the release itself is not
// cancelled for it), it simply states plainly that Canvas will not hide it
// at commit time.
//
// F6 - THE COMMIT BUTTON LIVES HERE, NOT IN THE BULK BAR. `releaseCommit`'s
// catalog entry (bulkBarGroupCatalog.ts) exists only so `groupTier`'s
// reduction can see it via `releaseReviewOpen` - the actual button, and its
// two-click "Confirm commit" arming (confirmArming.ts, surfaced here as
// `commitArmed`), render inside this modal's footer, the same split
// `commandApply`/CommandProposalModal.tsx and `carryApplyButton`/
// CarryModulePatternReviewModal.tsx already use for their own real writes.
import { Button } from "@mui/material";
import styles from "../../../page.module.css";
import { ModalShell } from "../../ui/ModalShell";
import type { RefObject } from "react";
import type { ReleaseHideState } from "@/lib/release-plan";
import type { ReleaseReviewRow, UseScheduledReleaseReturn } from "./useScheduledRelease";

export interface ReleaseReviewModalProps {
  scheduledRelease: UseScheduledReleaseReturn;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
}

const HIDE_STATE_LABEL: Record<ReleaseHideState, string> = {
  hideable: "Will be hidden now",
  "already-hidden": "Already hidden",
  refused: "Canvas refuses to hide this",
  unknown: "Unknown - verify manually",
};

function HideStateTag({ state }: { state: ReleaseHideState }) {
  if (state === "hideable") return <span className={styles.bulkGroupTag}>{HIDE_STATE_LABEL[state]}</span>;
  if (state === "already-hidden") return <span className={styles.bulkGroupTag}>{HIDE_STATE_LABEL[state]}</span>;
  return <span className={styles.bulkGroupTagDanger}>{HIDE_STATE_LABEL[state]}</span>;
}

function ReviewRow({ entry }: { entry: ReleaseReviewRow }) {
  const { row, dropped } = entry;
  return (
    <li className={`${styles.bulkRow} ${styles.bulkRowStacked}`}>
      <div className={styles.bulkField}>
        <strong>{row.target.displayName}</strong>
        <span className={styles.bulkHint}>{row.target.kind === "module" ? "module" : "item"}</span>
        {!dropped && <HideStateTag state={row.hideState} />}
        {dropped && <span className={styles.bulkGroupTagDanger}>Dropped - selection changed</span>}
      </div>
      {!dropped && row.reason && (
        <div className={styles.carryReviewDetail}>
          <span className={styles.bulkHint}>{row.reason}</span>
        </div>
      )}
    </li>
  );
}

export function ReleaseReviewModal({ scheduledRelease, restoreFocusRef, fallbackFocusRefs }: ReleaseReviewModalProps) {
  const { plan, reconciliation, summary, reviewRows, releaseAtIso, commitArmed, commitBusy, onCommitRelease, closeReview } =
    scheduledRelease;

  if (!plan || !reconciliation || !summary) return null;

  const droppedCount = reconciliation.droppedRows.length;
  const nothingToCommit = reconciliation.applicableRows.length === 0;

  return (
    <ModalShell label="Scheduled release review" onDismiss={closeReview} restoreFocusRef={restoreFocusRef} fallbackFocusRefs={fallbackFocusRefs}>
      <div className={styles.previewHeader}>
        <div>
          <h3>Scheduled release review</h3>
          <p className={styles.previewMeta}>
            {summary.total} target{summary.total === 1 ? "" : "s"} - {summary.hideable} will be hidden now, {summary.alreadyHidden} already
            hidden
            {summary.refused > 0 ? `, ${summary.refused} Canvas refuses to hide` : ""}
            {summary.unknown > 0 ? `, ${summary.unknown} unknown` : ""}
            {droppedCount > 0 ? `, ${droppedCount} dropped (selection changed since this plan was built)` : ""}.
          </p>
          <p className={styles.previewMeta}>
            Committing unpublishes every target above from Canvas immediately - students lose access right away, not at the release instant -
            and they regain visibility only when the release fires
            {releaseAtIso ? `, targeted for ${new Date(releaseAtIso).toLocaleString()} local time (within roughly 15 minutes of that time)` : ""}.
            A target Canvas refuses to hide stays scheduled anyway; it will simply remain visible in the meantime.
          </p>
        </div>
        <Button size="small" onClick={closeReview} className={styles.previewCloseButton}>
          Close
        </Button>
      </div>

      <div className={styles.previewContent}>
        <ul className={styles.carryReviewList}>
          {reviewRows.map((entry) => (
            <ReviewRow key={`${entry.row.target.kind}:${entry.row.target.id}`} entry={entry} />
          ))}
        </ul>
        {reviewRows.length === 0 && <p className={styles.bulkHint}>Nothing to release.</p>}
      </div>

      <div className={styles.previewFooter}>
        {commitArmed && (
          <span role="status" aria-live="polite" className={styles.bulkHint}>
            Click &quot;Confirm commit&quot; again to unpublish the targets above from Canvas immediately. This cannot be undone from
            here - to cancel a committed release later and restore its visibility, use the Scheduled releases panel in the
            Automations hub.
          </span>
        )}
        <Button variant="outlined" size="small" onClick={closeReview} disabled={commitBusy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          size="small"
          color={commitArmed ? "error" : "primary"}
          onClick={onCommitRelease}
          disabled={commitBusy || nothingToCommit}
        >
          {commitBusy ? "Committing..." : commitArmed ? "Confirm commit" : "Commit"}
        </Button>
      </div>
    </ModalShell>
  );
}
