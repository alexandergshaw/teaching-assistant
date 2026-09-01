"use client";

// Bulk bar row for the "Scheduled release" group -
// docs/scheduled-publishing-from-modules-acceptance-criteria.md, F6/F7/F10
// (the "Post-design corrections" section is THE FINAL CONTRACT).
//
// WHY THIS IS A NEW FILE, NOT ADDED TO BulkModulesSection.tsx OR
// BulkItemsSection.tsx (read before moving this group anywhere else): F10's
// own target set is BOTH modules and items, and the group's own
// `visible: (f) => f.moduleCount > 0 || f.itemCount > 0` (bulkBarGroupCatalog.ts)
// requires it to render for a module-only OR item-only selection, exactly
// the reason `download`/`askAi`/`visualizerCoverage`/`commandInterface`
// already live in their OWN section files, rendered unconditionally in
// ModulesView.tsx, rather than inside BulkModulesSection (mounted only while
// `selectedModules.size > 0`) or BulkItemsSection (mounted only while
// `selected.size > 0`) - either of those two would make this control
// unreachable for the other selection type, the exact "capability ships
// dead with every gate green" failure entry 337's own header names by name.
// This file follows CommandInterfaceSection.tsx's structure exactly (single
// group, `groupById`, unconditional mount) for the same reason that file
// gives.
//
// The group's own real write - `releaseCommit`, living inside
// ReleaseReviewModal.tsx, never here - is why this row only ever renders
// `releaseDate` and `releaseReview`: `releaseCommit`'s catalog entry is a
// DATA MODEL placeholder for `groupTier`'s reduction (F6), the same role
// `commandApply`/`carryApplyButton` play for their own groups.
//
// NO PERSISTED CONTROL STATE (F7's override of AC9): `releaseDate` is
// `persistKey: null` in the catalog, citing `itemsDueDate` as the precedent -
// see RELEASE_DATE_UNPERSISTED's own comment in bulkBarGroupCatalog.ts. This
// row therefore has nothing to read from or write to localStorage;
// `releaseDate` is plain hook state.
import { Button, TextField } from "@mui/material";
import styles from "../../../page.module.css";
import { BulkBarGroup } from "./BulkBarGroup";
import { groupById, type BulkBarFacts, type BulkBarGroupRuntime } from "./bulkBarGroups";
import type { BulkBarGroupsApi } from "./useBulkBarGroups";
import type { ReleaseTimeValidation } from "@/lib/release-plan";

export interface ScheduledReleaseSectionProps {
  facts: BulkBarFacts;
  groupsState: BulkBarGroupsApi;
  releaseDate: string;
  setReleaseDate: (v: string) => void;
  dateValidation: ReleaseTimeValidation | null;
  reviewBusy: boolean;
  onReviewRelease: () => void;
  /** Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md):
   * captures `event.currentTarget` synchronously, alongside (never instead
   * of) `onReviewRelease` - the same composition CommandInterfaceSection.tsx's
   * own `onCommandInterfaceTrigger` uses. */
  onScheduledReleaseTrigger: (trigger: HTMLElement) => void;
}

export function ScheduledReleaseSection({
  facts,
  groupsState,
  releaseDate,
  setReleaseDate,
  dateValidation,
  reviewBusy,
  onReviewRelease,
  onScheduledReleaseTrigger,
}: ScheduledReleaseSectionProps) {
  const RELEASE_GROUP = groupById("scheduledRelease");
  const dateInvalid = dateValidation !== null && !dateValidation.valid;
  const runtime: BulkBarGroupRuntime = { busy: reviewBusy, armed: false, hasUnavailableReason: dateInvalid };

  return (
    <BulkBarGroup group={RELEASE_GROUP} facts={facts} runtime={runtime} state={groupsState}>
      <div className={styles.bulkRow}>
        <TextField
          type="datetime-local"
          size="small"
          sx={{ width: 220 }}
          value={releaseDate}
          onChange={(e) => setReleaseDate(e.target.value)}
          aria-label="Release date and time for the selected modules and items"
        />
        <Button
          variant="outlined"
          size="small"
          disabled={reviewBusy || releaseDate.trim() === "" || dateInvalid}
          onClick={(e) => {
            onScheduledReleaseTrigger(e.currentTarget);
            onReviewRelease();
          }}
        >
          {reviewBusy ? "Building plan…" : "Review release plan"}
        </Button>
        {dateInvalid && (
          <span role="status" aria-live="polite" className={styles.bulkHint}>
            {dateValidation?.reason}
          </span>
        )}
        <span className={styles.bulkHint}>
          Applies to every selected module and item. Committing unpublishes them from Canvas immediately - students lose access right away, not
          at the release instant - and they regain visibility only once the release fires, within roughly 15 minutes of the requested time.
        </span>
      </div>
    </BulkBarGroup>
  );
}
