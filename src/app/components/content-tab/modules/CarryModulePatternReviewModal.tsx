"use client";

// The "Carry pattern forward" review modal (docs/carry-module-pattern-
// forward-acceptance-criteria.md, chunk D, D18/D19). Renders at ModulesView
// root via ModulesViewSecondaryModals.tsx (D19) - never inside the bulk bar,
// which cannot host it: `.bulkBarBody` is capped at `min(60vh, 640px)`
// (entry 329's own space fix), a panel here would be a third nested
// scroller, and the sticky header's z-index/backdrop-filter stacking trap
// (see GeneratedPreviewModal.tsx's own header comment) forbids rendering a
// modal from inside it at all. Reuses ModalShell and the same previewHeader/
// previewMeta/previewContent CSS every other Tier-1 modal in this tab
// already does (page.module.css), so this reads as the same modal surface.
//
// This component is deliberately a thin renderer: every real decision - which
// row is blocked and why, whether an item's block is fixable with a `{n}`
// override, the create/skip/blocked counts - was already computed by
// useCarryModulePattern.ts's pure `buildCarryReviewRows` (D18) from wave 1's
// ModulePatternPlan. Nothing here recomputes any of that; it only reads the
// hook's return value and renders it. Only ever mounted while
// `reviewOpen && template && plan` are all true (the same "mounted only
// while open" convention every other modal in this file's siblings follows -
// see ModalShell's own header comment).
//
// VISUAL PASS (post-design correction): the `{n}` unblock affordance and the
// per-item exclusion checkboxes used to render in a plain <ul> with inline
// `style={{...}}` rather than this tab's own components. That mattered here
// more than in an ordinary list, because D3b's false positives are load-
// bearing: "Chapter 12 Discussion" in Module 12 tokenises to "Chapter 03
// Discussion" in Module 3, and the ONLY mitigation is that the proposal makes
// a wrong row noticeable before it is applied. So every row now follows the
// bulkRow/bulkField/bulkHint grammar BulkItemsSection/GenerateFromSelection
// Section already use for a checkbox-plus-detail row (see those files' own
// header comments), the exclusion checkbox is the same bare MUI `Checkbox`
// (aria-labelled, no FormControlLabel wrapper) ModuleItemRow.tsx uses when
// the visible label is rendered as a sibling rather than as the checkbox's
// own label, and a BLOCKED or REFUSED row now carries the same small-caps
// pill `.bulkGroupTag` the bulk bar's own consequence-tiered groups use for
// "an always-visible label a row cannot be skimmed past" (page.module.css) -
// amber for BLOCKED (fixable via the `{n}` field below it), the danger tone
// for REFUSED (not fixable; the checkpoint split cannot be read back at
// all). A row with neither badge is a plain CREATE/SKIP row, so the three
// states are never one shade apart from each other.
//
// COORDINATOR ADDITION: the REFUSED reason text is
// `DISCUSSION_CHECKPOINTS_UNREADABLE_REASON` (src/lib/module-template-
// shape.ts), never re-spelled here. It states that THIS APP cannot read a
// discussion's checkpoint structure back from Canvas at all, not that "this
// discussion may carry" one - the old wording read as our bug or our
// timidity to an instructor whose discussion plainly has no such split, when
// the actual limitation is ours and unconditional. Shared with module-
// template.ts's own refusal path so the two cannot drift.
import { useState } from "react";
import type { RefObject } from "react";
import { Button, Checkbox, TextField } from "@mui/material";
import styles from "../../../page.module.css";
import { ModalShell } from "../../ui/ModalShell";
import type { ModuleTemplate, TemplateItem } from "@/app/actions/module-template";
import { DISCUSSION_CHECKPOINTS_UNREADABLE_REASON } from "@/lib/module-template-shape";
import type { ModulePatternPlan } from "@/lib/module-pattern-plan";
import { draftContainsPatternToken, initialCarryDraftText, isUniformlyBlockedRow, type CarryReviewItemRow } from "./useCarryModulePattern";

export interface CarryModulePatternReviewModalProps {
  template: ModuleTemplate;
  plan: ModulePatternPlan;
  reviewRows: CarryReviewItemRow[];
  checkpointRefusedItems: TemplateItem[];
  excludedItemIds: Set<number>;
  onToggleExcludedItem: (itemId: number) => void;
  authoredPatterns: Record<number, string>;
  onAuthoredPatternChange: (itemId: number, text: string) => void;
  applyBusy: boolean;
  onApply: () => void;
  onClose: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
}

// One item's own manual-exclude checkbox plus, for a fixable per-item block
// (D4/D3b), the inline `{n}` override field. A blocked row carries the
// amber `.bulkGroupTag` pill next to its title so it reads as distinct from
// a plain create/skip row at a skim, not only on close reading of the hint
// text below it.
//
// C1: `row` now exists for EVERY source item, excluded ones included
// (module-pattern-plan.ts's `excludedItems` / useCarryModulePattern.ts's
// `buildCarryReviewRows`) - `excluded` finally has a real row to attach to,
// so the checkbox round-trips instead of vanishing along with its own row
// the moment it is unchecked.
//
// C2: a "create" decision whose kind this app cannot actually write
// (`row.writeSupported === false`, `row.unsupportedCount > 0`) gets its own
// danger-tone tag and explanation, distinct from Blocked - unlike a blocked
// row, no `{n}` override or any other instructor action can fix this; it is
// a hard limit of the write path, not a naming problem.
function ReviewRow({
  row,
  excluded,
  authoredText,
  onToggleExcluded,
  onAuthoredPatternChange,
}: {
  row: CarryReviewItemRow;
  excluded: boolean;
  authoredText: string | undefined;
  onToggleExcluded: (itemId: number) => void;
  onAuthoredPatternChange: (itemId: number, text: string) => void;
}) {
  // Pre-filled with the source title (D4's own wording), never with an empty
  // string - the instructor edits it into a pattern rather than starting
  // from nothing. See useCarryModulePattern.ts's `initialCarryDraftText` for
  // why this is a named predicate rather than an inline `??` (C9).
  const [draft, setDraft] = useState(initialCarryDraftText(authoredText, row.sourceTitle));
  const blocked = isUniformlyBlockedRow(row);
  const unsupported = !excluded && !blocked && row.unsupportedCount > 0;
  // C12: "source-module-unnumbered" is the one uniform-block reason whose
  // message is IDENTICAL for every item in the plan (module-pattern-
  // inference.ts's text names only the source module, never the item) -
  // exactly the case the top-level `plan.sourceWeek === null` hint below
  // already states in full. Every other reason (no-token-match, an invalid
  // authored pattern) names THIS item's own title/pattern, so it is never
  // suppressed - D4b's "one message, not twelve" applies only to the
  // reason that is genuinely identical across every row.
  const suppressBlockedMessage = row.uniformBlockedReasonCode === "source-module-unnumbered";

  return (
    <li className={`${styles.bulkRow} ${styles.bulkRowStacked}`}>
      <div className={styles.bulkField}>
        <Checkbox
          size="small"
          checked={!excluded}
          onChange={() => onToggleExcluded(row.itemId)}
          aria-label={`Include "${row.sourceTitle}" in this carry-forward`}
        />
        <strong>{row.sourceTitle}</strong>
        <span className={styles.bulkHint}>({row.itemType})</span>
        {!excluded && blocked ? <span className={styles.bulkGroupTag}>Blocked</span> : null}
        {unsupported ? <span className={styles.bulkGroupTagDanger}>Not created</span> : null}
      </div>

      {excluded ? (
        <div className={styles.carryReviewDetail}>
          <span className={styles.bulkHint}>Excluded from this carry-forward. Check the box above to include it again.</span>
        </div>
      ) : blocked ? (
        <div className={styles.carryReviewDetail}>
          {!suppressBlockedMessage && <span className={styles.bulkHint}>{row.uniformBlockedMessage}</span>}
          <div className={styles.bulkField}>
            <TextField
              size="small"
              sx={{ flex: "1 1 260px" }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`Name pattern override for "${row.sourceTitle}"`}
              placeholder="e.g. Week {n} Reflection"
            />
            <Button variant="outlined" size="small" onClick={() => onAuthoredPatternChange(row.itemId, draft)} disabled={!draftContainsPatternToken(draft)}>
              Unblock
            </Button>
          </div>
          <span className={styles.bulkHint}>Must contain {"{n}"} - the target module&apos;s own number is substituted in.</span>
        </div>
      ) : (
        <div className={styles.carryReviewDetail}>
          <span className={styles.bulkHint}>
            Pattern: <code>{row.patternTemplate}</code>
            {row.exampleResolvedTitle ? <> - e.g. &quot;{row.exampleResolvedTitle}&quot;</> : null}
          </span>
          <span className={styles.bulkHint}>
            {row.createCount} to create, {row.skipCount} already present
            {row.unsupportedCount > 0 ? `, ${row.unsupportedCount} unsupported (will not be created)` : ""}
            {row.blockedCount > 0 ? `, ${row.blockedCount} blocked in a target with no recognizable number` : ""} (of {row.targetCount} target
            {row.targetCount === 1 ? "" : "s"}).
          </span>
          {unsupported && (
            <span className={styles.bulkHint}>
              &quot;{row.itemType}&quot; items have no write path wired for this feature yet, so this item will be reported as unsupported rather
              than created.
            </span>
          )}
          {row.notCarried.length > 0 && (
            <span className={styles.bulkHint}>Not carried for this item type: {row.notCarried.map((f) => f.field).join(", ")}.</span>
          )}
        </div>
      )}
    </li>
  );
}

export function CarryModulePatternReviewModal({
  template,
  plan,
  reviewRows,
  checkpointRefusedItems,
  excludedItemIds,
  onToggleExcludedItem,
  authoredPatterns,
  onAuthoredPatternChange,
  applyBusy,
  onApply,
  onClose,
  restoreFocusRef,
  fallbackFocusRefs,
}: CarryModulePatternReviewModalProps) {
  const targetCount = plan.targets.length;

  return (
    <ModalShell
      label={`Carry pattern forward from ${template.moduleName}`}
      onDismiss={onClose}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRefs={fallbackFocusRefs}
    >
      <div className={styles.previewHeader}>
        <div>
          <h3>Carry pattern forward: {template.moduleName}</h3>
          <p className={styles.previewMeta}>
            {targetCount} target module{targetCount === 1 ? "" : "s"} - {plan.totals.create} to create, {plan.totals.skip} already present,{" "}
            {plan.totals.blocked} blocked{plan.totals.unsupported > 0 ? `, ${plan.totals.unsupported} unsupported` : ""}.
          </p>
        </div>
        <Button size="small" onClick={onClose} className={styles.previewCloseButton}>
          Close
        </Button>
      </div>

      <div className={styles.previewContent}>
        {plan.sourceWeek === null && (
          <p className={styles.bulkHint}>
            &quot;{template.moduleName}&quot; carries no recognizable module or week number in its own name, so most items below will need an
            authored {"{n}"} pattern to carry forward.
          </p>
        )}

        {plan.excludedSourceTargetId != null && (
          <p className={styles.bulkHint}>The template module was also selected as a target and has been excluded from the target list automatically.</p>
        )}

        {plan.sourceReadFailures.length > 0 && (
          <p className={styles.bulkHint}>
            {plan.sourceReadFailures.length} item{plan.sourceReadFailures.length === 1 ? "" : "s"} in the template could not be read and are not
            included: {plan.sourceReadFailures.map((f) => f.title).join(", ")}.
          </p>
        )}

        {plan.targets
          .filter((t) => t.targetWeek === null)
          .map((t) => (
            <p key={t.targetModuleId} className={styles.bulkHint}>
              Target module &quot;{t.targetModuleName}&quot; carries no recognizable number, so every item is blocked for it.
            </p>
          ))}

        {checkpointRefusedItems.length > 0 && (
          <div className={styles.carrySection}>
            <span className={styles.bulkLabel}>Refused (not included)</span>
            <ul className={styles.carryReviewList}>
              {checkpointRefusedItems.map((item) => (
                <li key={item.id} className={`${styles.bulkRow} ${styles.bulkRowStacked}`}>
                  <div className={styles.bulkField}>
                    <strong>{item.title}</strong>
                    <span className={`${styles.bulkGroupTag} ${styles.bulkGroupTagDanger}`}>Refused</span>
                  </div>
                  <div className={styles.carryReviewDetail}>
                    <span className={styles.bulkHint}>{DISCUSSION_CHECKPOINTS_UNREADABLE_REASON}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className={styles.carryReviewList}>
          {reviewRows.map((row) => (
            <ReviewRow
              key={row.itemId}
              row={row}
              excluded={excludedItemIds.has(row.itemId)}
              authoredText={authoredPatterns[row.itemId]}
              onToggleExcluded={onToggleExcludedItem}
              onAuthoredPatternChange={onAuthoredPatternChange}
            />
          ))}
        </ul>
      </div>

      <div className={styles.previewFooter}>
        <Button variant="outlined" size="small" onClick={onClose} disabled={applyBusy}>
          Cancel
        </Button>
        <Button variant="contained" size="small" onClick={onApply} disabled={applyBusy}>
          {applyBusy ? "Applying…" : "Apply"}
        </Button>
      </div>
    </ModalShell>
  );
}
