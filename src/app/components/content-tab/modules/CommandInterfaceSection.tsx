"use client";

// Bulk bar row for the "Command" group - docs/llm-command-interface-
// acceptance-criteria.md, section 10 (THE FINAL CONTRACT), AC2/G15.
//
// WHY THIS IS A NEW FILE, NOT ADDED TO BulkModulesSection.tsx OR
// BulkItemsSection.tsx (read before moving this group anywhere else):
// AC2/G15 require the command box to render "whenever ANYTHING is selected -
// a module alone, an item alone, or any mix", the exact visibility the
// catalog's own `commandInterfaceGroup.visible` declares
// (`f.moduleCount > 0 || f.itemCount > 0`, bulkBarGroupCatalog.ts) and the
// exact reason `download`/`askAi`/`visualizerCoverage` each already live in
// their OWN section file (DownloadSelectionSection.tsx,
// AskAiSelectionSection.tsx, VisualizerCoverageSection.tsx) rendered
// unconditionally in ModulesView.tsx, rather than inside BulkModulesSection
// (mounted only while `selectedModules.size > 0`) or BulkItemsSection
// (mounted only while `selected.size > 0`) - either of those two would make
// this group unreachable for a pure item-only or pure module-only selection,
// respectively, the exact "capability ships dead" failure this repo's own
// working notes name by name. Confirmed both candidate files are the wrong
// home a second way: bulkModulesSection.wiring.test.ts and
// bulkItemsSection.groups.test.ts each pin an EXACT `<BulkBarGroup>` count
// (four and six) that this chunk's own brief says not to touch beyond adding
// one missing fact field - adding a seventh/fifth tag to either file would
// fail an existing, unrelated assertion. This file follows
// AskAiSelectionSection.tsx's structure exactly (single group, `groupById`,
// unconditional mount) rather than BulkModulesSection.tsx's/
// BulkItemsSection.tsx's (multiple groups gated by the mount condition
// itself) for the same reason those three sections already do.
//
// The group's own real write - `commandApply`, living inside
// CommandProposalModal.tsx, never here - is why this row only ever renders
// `commandBox` and `commandReview`: `commandApply`'s catalog entry is a DATA
// MODEL placeholder for `groupTier`'s reduction (G7), the same role
// `carryApplyButton` plays for BulkModulesSection's own "carryPattern" group.
//
// NO PERSISTED CONTROL STATE (section 10, G15's override of section 8's
// AC8): `commandBox` is `persistKey: null` in the catalog - reapplying stale
// text to a different selection would misdirect a live Canvas rewrite, not
// merely a draft - so this row has nothing to read from or write to
// localStorage; `commandText` is plain hook state.
import { Button, TextField } from "@mui/material";
import styles from "../../../page.module.css";
import { BulkBarGroup } from "./BulkBarGroup";
import { groupById, type BulkBarFacts, type BulkBarGroupRuntime } from "./bulkBarGroups";
import type { BulkBarGroupsApi } from "./useBulkBarGroups";

export interface CommandInterfaceSectionProps {
  facts: BulkBarFacts;
  groupsState: BulkBarGroupsApi;
  commandText: string;
  setCommandText: (v: string) => void;
  generateBusy: boolean;
  onReviewCommand: () => void;
  /** Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md):
   * captures `event.currentTarget` synchronously, alongside (never instead
   * of) `onReviewCommand` - the same composition BulkModulesSection.tsx's own
   * carryReviewButton click handler uses for onCarryReviewTrigger. */
  onCommandInterfaceTrigger: (trigger: HTMLElement) => void;
}

export function CommandInterfaceSection({
  facts,
  groupsState,
  commandText,
  setCommandText,
  generateBusy,
  onReviewCommand,
  onCommandInterfaceTrigger,
}: CommandInterfaceSectionProps) {
  const COMMAND_GROUP = groupById("commandInterface");
  const runtime: BulkBarGroupRuntime = { busy: generateBusy, armed: false, hasUnavailableReason: false };

  return (
    <BulkBarGroup group={COMMAND_GROUP} facts={facts} runtime={runtime} state={groupsState}>
      <div className={styles.bulkRow}>
        <TextField
          multiline
          minRows={2}
          fullWidth
          value={commandText}
          onChange={(e) => setCommandText(e.target.value)}
          placeholder='Tell the model what to change on the current selection, e.g. "Make the tone friendlier" or "Create a module called Final Project"'
          aria-label="Command for the selected modules/items"
          size="small"
        />
        <Button
          variant="outlined"
          size="small"
          disabled={generateBusy || !commandText.trim()}
          onClick={(e) => {
            onCommandInterfaceTrigger(e.currentTarget);
            onReviewCommand();
          }}
        >
          {generateBusy ? "Generating..." : "Review proposal"}
        </Button>
        <span className={styles.bulkHint}>
          Proposes rewriting the title/description of selected items, renaming selected modules, or creating new modules - reviewed here before
          anything is written to Canvas. Points, due dates, submission type, rubric association and publish state are never changed by a command;
          use this bar&apos;s other controls for those.
        </span>
      </div>
    </BulkBarGroup>
  );
}
