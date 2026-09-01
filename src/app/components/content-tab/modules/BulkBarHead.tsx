"use client";

// The bulk bar's own count-and-Clear line (docs/bulk-bar-reorganization-
// acceptance-criteria.md, section 3b/D1's "head" group - not one of the
// thirteen catalog entries a <BulkBarGroup> wraps, per that file's own
// header comment: it is never a `<details>`, so it is built directly here
// rather than through the shared component).
//
// EXTRACTED FROM ModulesView.tsx (step-10 fixer round, findings 2 and 4):
// pure structural split, no behaviour change - same discipline
// useLmsGeneration.ts's own lmsGenerationTypes.ts extraction describes
// ("each piece re-exported/relocated so every existing call site keeps
// compiling unchanged"). ModulesView.tsx crossed the repo's 1000-line
// ceiling once finding 2's AC8 disclosure and finding 4's bar-level live
// region both landed in its own JSX; this component is exactly the
// self-contained, presentational slice that was safe to lift out - it reads
// only the counts/busy flags it is handed and owns no state of its own.
//
// Anchors bulkBar.wiring.test.ts already relies on (`styles.bulkBar}`,
// `styles.bulkBarBody}`) are UNCHANGED by this extraction - both wrapper
// `<div>`s stay in ModulesView.tsx; only the inner `.bulkBarHead` content
// moved. `styles.bulkBarHead` itself is not one of that test's anchors, so
// there was nothing to keep in sync there.
import { Button } from "@mui/material";
import styles from "../../../page.module.css";
import { selectItemsButtonLabel } from "./moduleItemSelection";

export interface BulkBarHeadProps {
  /** `selection.selectedModules.size` (ModulesView.tsx). */
  moduleCount: number;
  /** `selection.selected.size` (ModulesView.tsx) - the ITEM selection. */
  itemCount: number;
  /**
   * Step-10 finding 4's bar-level aggregate: ONLY `opBusy` (the single flag
   * shared by BulkItemsSection's five suppressed groups and
   * BulkModulesSection's "modules" group) - computed by ModulesView, not
   * here, since this component has no access to either hook. The SECOND
   * fixer round removed the two group-owned signals (BulkModulesSection's
   * `bulkAiBusy`, BulkItemsSection's `descSharedState === "loading"`) that
   * used to be OR-ed in here: each is a fact only ONE group owns, so OR-ing
   * it into this bar-level flag made that group's own heading announce it a
   * second time whenever this region also fired. Each of those two signals
   * now announces exclusively from its own group's heading instead. See
   * BulkBarGroup.tsx's `announceBusy` prop for the full decision this
   * region is one half of.
   */
  busy: boolean;
  onClear: () => void;
}

export function BulkBarHead({ moduleCount, itemCount, busy, onClear }: BulkBarHeadProps) {
  return (
    <div className={styles.bulkBarHead}>
      <span className={styles.bulkCount}>
        {[
          moduleCount > 0 ? `${moduleCount} module${moduleCount === 1 ? "" : "s"}` : "",
          itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "",
        ]
          .filter(Boolean)
          .join(", ")}{" "}
        selected
      </span>
      {/* Step-10 finding 2 (AC8): thirteen item-level bulk actions below
          silently ignore a module-only selection - this does not rewire
          them (that is its own chunk, per the AC's own non-goal), it only
          DISCLOSES the mismatch, naming the control that fixes it. The name
          comes from `selectItemsButtonLabel` (moduleItemSelection.ts, the
          same function ModuleCard's own "Select items" button calls for its
          label) rather than a re-spelled literal, so the two strings can
          never drift apart (D2's "AC8 vs AC7" row). */}
      {moduleCount > 0 && itemCount === 0 && (
        <span className={styles.bulkFieldLabel}>
          Item actions below need items selected - use &quot;{selectItemsButtonLabel("none")}&quot; on a module to
          select its items.
        </span>
      )}
      {/* Step-10 finding 4: ONE bar-level live region replacing up to eight
          duplicate per-group "Working..." announcements for the same shared
          `opBusy` flag - full decision and rationale on BulkBarGroup.tsx's
          `announceBusy` prop. */}
      {busy && (
        <span role="status" aria-live="polite" className={styles.bulkFieldLabel}>
          Working…
        </span>
      )}
      <Button variant="outlined" size="small" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
