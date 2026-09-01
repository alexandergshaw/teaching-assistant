"use client";

import type React from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import type { CanvasModule, CanvasModuleItem, CanvasRubric } from "@/lib/canvas-modules";
import styles from "../../../page.module.css";
import type { RubricBuilderTarget } from "./useRubrics";
import type { BulkRubricGenerateReport } from "./useBulkItemActions";
import { describeRubricGenerateNote } from "./bulkRubricGenerateSummary";
import { EMPTY_RUBRIC_RUN_LOG, type RubricRunLogEntry } from "@/lib/rubric-run-log";
import RubricRunLogPanel from "./RubricRunLogPanel";
import { LIVE_CONTENT_SOURCE, gateOperation, type ContentSourceContext } from "../contentSourceGating";
import { BulkBarGroup } from "./BulkBarGroup";
import { groupById, type BulkBarFacts, type BulkBarGroupRuntime } from "./bulkBarGroups";
import type { BulkBarGroupsApi } from "./useBulkBarGroups";
import { bulkRemoveFromModuleBannerText, bulkRemoveFromModuleButtonLabel } from "./bulkRemoveFromModuleCopy";

// Module-level, not recreated per render: the default for `clearRubricRunLog`
// when a caller (today, only ModulesView.tsx) does not yet pass one - see
// that prop's own doc comment on BulkItemsSectionProps.
function NOOP_CLEAR_RUBRIC_RUN_LOG(): void {}

// This section owns six of the bar's thirteen groups (docs/bulk-bar-
// reorganization-acceptance-criteria.md, section 3b/D5): "items", "content",
// "dueDates", "grading", "submissionType", "move". The catalog in
// ./bulkBarGroupCatalog.ts (re-exported from ./bulkBarGroups as
// BULK_BAR_GROUPS) is the CONTRACT - this file's JSX conforms to which
// controls each group declares, not the other way round. `groupById`
// (./bulkBarGroups.ts) looks the six defs up by id - the shared replacement
// for what used to be six near-identical local `findGroup` copies, one per
// section file (step-10 review finding) - so a catalog id typo throws
// immediately at render instead of silently rendering an untitled/unstyled
// group.
//
// Every one of these six groups contains at least one always-visible
// fan-out-write control whenever it is visible at all (Publish/Unpublish in
// "items"; Set description in "content"; Set/Shift/Stagger in "dueDates";
// Set points/Associate in "grading"; Apply in "submissionType"; Move/Remove/
// Delete in "move") - so `mayCollapse` (./bulkBarGroups.ts) is false for all
// six under any facts where they render, and `<BulkBarGroup>` renders them
// with the static, non-collapsible styling (`.bulkGroupStatic`, forced open
// via `groupOpen`). Per step-10 finding 5, `<BulkBarGroup>` renders a real
// `<details>` for EVERY group regardless of collapsibility (a fixed host
// element avoids an unmount/remount - and the focus loss that comes with
// it - when a group's tier changes at runtime); a non-collapsible group's
// `<summary>` is simply pulled out of the tab order and its native toggle
// is suppressed, so it reads and behaves as static even though the element
// underneath is the same `<details>` every group uses. That is AC1's "full
// weight, outside any collapsed container" requirement, mechanised by the
// shared group model rather than decided here.
//
// The per-row `.bulkLabel` spans ("Items", "Content", "Due dates", ...) are
// REMOVED - `<BulkBarGroup>`'s own heading now renders `group.label`, and
// AC2/D0 are explicit that keeping both would be redundant chrome, not an
// accessibility improvement.
//
// The `sectionGate.allowed === false` refusal below is NOT one of the six
// catalog groups (it stands in for the whole section, gated as one unit) and
// is therefore built by hand rather than through `<BulkBarGroup>` - but it
// uses the exact same static markup (`role="group"`, `aria-labelledby`,
// `.bulkGroupStatic`/`.bulkGroupHeading`/`.bulkGroupBody`) so it reads as one
// consistent language with the six real groups, and per D6 it must NEVER
// become a `<details>`: collapsing it would hide the only explanation of why
// the section is empty.
export interface BulkItemsSectionProps {
  opBusy: boolean;
  /** Which Course Content source is active - see contentSourceGating.ts.
   * Optional, defaulted to LIVE_CONTENT_SOURCE so every existing call site
   * (none of which pass this yet) is unaffected. */
  sourceContext?: ContentSourceContext;
  /** The bar's shared fact bag (./bulkBarGroups.ts) - ONE object, built once
   * by ModulesView and threaded to every section unchanged, so a group's
   * visibility/tier decision here can never drift from what the rest of the
   * bar sees for the same selection. This section only ever reads it
   * through the four pure functions `<BulkBarGroup>` itself calls; it does
   * not branch on any field directly. */
  facts: BulkBarFacts;
  /** The bar's one shared open/closed persistence API (useBulkBarGroups.ts),
   * owned by ModulesView (called exactly once there) and passed down
   * unchanged - never constructed here. See that hook's own header for why
   * more than one instance would corrupt the persisted map. */
  groupsState: BulkBarGroupsApi;
  selectedItems: () => Array<{ item: CanvasModuleItem; moduleId: number }>;
  setEditingItem: (item: CanvasModuleItem) => void;
  /** Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md,
   * wave R2): captures `event.currentTarget` synchronously, alongside (never
   * instead of) `setEditingItem` above - GradableEditorModal has two openers
   * (this one and ModuleItemRow's row "Edit"), both writing the SAME ref
   * ModulesView owns (decision 4: one ref per dialog). */
  onGradableEditorTrigger: (trigger: HTMLElement) => void;
  onEditPage: (pageUrl: string) => void;
  /** Same capture-alongside-the-existing-setter shape as
   * onGradableEditorTrigger above - PageEditorModal's state lives in
   * ContentTab.tsx, two boundaries up from this section; this bar's single-
   * item "Edit page" is one of PageEditorModal's four openers, all writing
   * the SAME ref (decision 4). */
  onPageEditorTrigger: (trigger: HTMLElement) => void;
  bulkPublish: (published: boolean) => void;
  descSharedState: "idle" | "loading" | "same" | "mixed" | "partial";
  /** S2: populated only while descSharedState === "partial" - how many of
   * the selected gradables' current descriptions could not be read, out of
   * how many were considered. */
  descPartialCounts: { uncheckedCount: number; totalCount: number } | null;
  bulkItemsDescription: string;
  setBulkItemsDescription: (v: string) => void;
  bulkSetDescription: () => void;
  bulkItemsQuestions: unknown[];
  setBulkItemsQuestionsOpen: (v: boolean) => void;
  /** Same capture-alongside-the-existing-setter shape as
   * onGradableEditorTrigger above - this bulk bar's own BulkQuestionsModal
   * instance is driven by an independent state variable from the one
   * BulkModulesSection opens (see useBulkItemActions.ts's
   * bulkItemsQuestionsOpen vs useBulkModuleActions.ts's bulkQuestionsOpen),
   * so it is its own dialog with a single opener, not a shared one. */
  onItemQuestionsTrigger: (trigger: HTMLElement) => void;
  bulkAddQuestionsToQuizzes: () => void;
  bulkDue: string;
  setBulkDue: (v: string) => void;
  bulkSetDue: () => void;
  bulkShift: number;
  setBulkShift: (v: number) => void;
  bulkShiftDue: () => void;
  bulkStaggerOffset: number;
  setBulkStaggerOffset: (v: number) => void;
  bulkStaggerUnit: "weeks" | "days";
  setBulkStaggerUnit: (v: "weeks" | "days") => void;
  bulkStaggerDue: () => void;
  bulkPoints: string;
  setBulkPoints: (v: string) => void;
  bulkSetPoints: () => void;
  bulkRubricId: number | "";
  setBulkRubricId: (v: number | "") => void;
  rubrics: CanvasRubric[];
  bulkRubric: () => void;
  /** docs/rubric-bulk-action-acceptance-criteria.md AC4/AC5 - "Generate &
   * associate rubric". Deliberately REQUIRED (no `?`): a caller that omits
   * either of these two fails `tsc`, rather than this section silently
   * rendering a button whose click does nothing - the reachability failure
   * mode this repo has recorded most often (see this file's own header for
   * the "never becomes dead" discipline every other handler prop here
   * already follows). */
  bulkGenerateAndAssociateRubric: () => void;
  bulkRubricGenerateReport: BulkRubricGenerateReport | null;
  /** docs/rubric-bulk-log-acceptance-criteria.md - the downloadable,
   * per-course record of every run's per-target outcomes and orphan
   * rubrics. Rendered by RubricRunLogPanel.tsx, inline with the control
   * that produces it (B4 item 9). Optional (unlike
   * bulkGenerateAndAssociateRubric/bulkRubricGenerateReport above),
   * defaulted below - same "existing call sites are unaffected" shape as
   * `sourceContext` at the top of this interface, since this file's own
   * caller (ModulesView.tsx) is outside this chunk's file set.
   *
   * BOTH ARE NOW PASSED by that caller. Being optional is what made this
   * dangerous: unwired, the panel compiles, passes tsc, eslint, the full
   * suite and `next build`, and renders NOTHING forever, because it returns
   * null on an empty log. That is this repo's recurring "ships dead with
   * every gate green" failure, and no gate here can catch it - vitest is
   * node-env and renders no component. If a second caller of this section
   * ever appears, it must pass these too. */
  rubricRunLog?: readonly RubricRunLogEntry[];
  clearRubricRunLog?: () => void;
  setRubricBuilder: React.Dispatch<React.SetStateAction<RubricBuilderTarget | null>>;
  /** Same capture-alongside-the-existing-setter shape as
   * onGradableEditorTrigger above - RubricBuilderModal's four openers (this
   * section's "Edit" and "New rubric" buttons, plus ModulesHeaderBar's "New"
   * and "Edit") all write the SAME ref (decision 4). */
  onRubricBuilderTrigger: (trigger: HTMLElement) => void;
  openRubricBuilder: () => void;
  bulkSubType: string;
  setBulkSubType: (v: string) => void;
  bulkUpdateSubmissionType: () => void;
  selectedAssignmentCount: () => number;
  bulkModuleShift: number;
  setBulkModuleShift: (v: number) => void;
  bulkShiftModules: (dir: -1 | 1) => void;
  bulkTargetModule: number | "";
  setBulkTargetModule: (v: number | "") => void;
  modules: CanvasModule[];
  bulkMoveToModule: () => void;
  bulkRemoveFromModule: () => void;
  /** B2: whether the NEXT bulkRemoveFromModule() call actually removes -
   * armed for the current selection, independent of confirmDeleteContent
   * below so arming one never arms the other. */
  confirmRemoveFromModule: boolean;
  bulkDeleteContent: () => void;
  confirmDeleteContent: boolean;
}

/** A group whose own visible controls are always non-collapsible (fan-out-
 * write or destructive) does not need a meaningful `runtime` for
 * `mayCollapse`/`groupOpen` purposes - `<BulkBarGroup>` never reaches the
 * branch that would consult it. `busy` still drives the always-visible
 * "Working..." status text in the group heading, so it is threaded from
 * this section's own `opBusy` (and, for "content", the description-loading
 * state) rather than hard-coded false. */
function staticRuntime(busy: boolean, armed = false): BulkBarGroupRuntime {
  return { busy, armed, hasUnavailableReason: false };
}

// Bulk bar section shown when one or more items are selected: publish, edit
// content/description/questions, due dates, grading, submission type, and
// cross-module move / remove / delete.
export function BulkItemsSection({
  opBusy,
  sourceContext,
  facts,
  groupsState,
  selectedItems,
  setEditingItem,
  onGradableEditorTrigger,
  onEditPage,
  onPageEditorTrigger,
  bulkPublish,
  descSharedState,
  descPartialCounts,
  bulkItemsDescription,
  setBulkItemsDescription,
  bulkSetDescription,
  bulkItemsQuestions,
  setBulkItemsQuestionsOpen,
  onItemQuestionsTrigger,
  bulkAddQuestionsToQuizzes,
  bulkDue,
  setBulkDue,
  bulkSetDue,
  bulkShift,
  setBulkShift,
  bulkShiftDue,
  bulkStaggerOffset,
  setBulkStaggerOffset,
  bulkStaggerUnit,
  setBulkStaggerUnit,
  bulkStaggerDue,
  bulkPoints,
  setBulkPoints,
  bulkSetPoints,
  bulkRubricId,
  setBulkRubricId,
  rubrics,
  bulkRubric,
  bulkGenerateAndAssociateRubric,
  bulkRubricGenerateReport,
  rubricRunLog = EMPTY_RUBRIC_RUN_LOG,
  clearRubricRunLog = NOOP_CLEAR_RUBRIC_RUN_LOG,
  setRubricBuilder,
  onRubricBuilderTrigger,
  openRubricBuilder,
  bulkSubType,
  setBulkSubType,
  bulkUpdateSubmissionType,
  selectedAssignmentCount,
  bulkModuleShift,
  setBulkModuleShift,
  bulkShiftModules,
  bulkTargetModule,
  setBulkTargetModule,
  modules,
  bulkMoveToModule,
  bulkRemoveFromModule,
  confirmRemoveFromModule,
  bulkDeleteContent,
  confirmDeleteContent,
}: BulkItemsSectionProps) {
  const ctx = sourceContext ?? LIVE_CONTENT_SOURCE;
  // Which context the currently-picked rubric was defined in (AC2) - drives
  // both the "(account-level)" label above and disabling "Edit" below, since
  // getRubric/updateRubric only ever address /courses/:id/rubrics/:id and
  // would not resolve an account rubric's id.
  const selectedRubricSource = rubrics.find((r) => r.id === bulkRubricId)?.source;
  // GATED AS ONE UNIT, matching AddItemRow's precedent (see that file for
  // the fuller reasoning). Every row here either writes directly to Canvas
  // (publish, due dates, points, submission type, rubric, move/remove/
  // delete) or composes content whose ONLY consumer is one of those writes
  // ("Edit questions" feeds "Add to selected quizzes"; the description
  // textarea feeds "Set description") - so there is no independently useful
  // sub-step to leave enabled, the same shape AddItemRow's AI-drafting
  // sub-step was in. Selection itself cannot hold an export-sourced item
  // today (docs/REGRESSION.md entry 263's Limits - useModuleSelection scans
  // only a live CanvasModule[] tree), so this is unreachable in the product
  // until that changes; it is wired now so per-operation gating is already
  // correct once it does, rather than retrofitted later.
  const sectionGate = gateOperation(ctx, "items");
  if (!sectionGate.allowed) {
    // D6: this refusal must render as a STATIC, non-collapsible group -
    // never a <details> - or the only explanation of why the section is
    // empty could be collapsed away. Same static markup as
    // `<BulkBarGroup>`'s own non-collapsible branch (role="group",
    // aria-labelledby, .bulkGroupStatic/.bulkGroupHeading/.bulkGroupBody),
    // built by hand because this refusal stands in for the WHOLE section,
    // not any one catalog group.
    return (
      <section role="group" aria-labelledby="bulkItemsSection-gate-heading" className={styles.bulkGroupStatic}>
        <span id="bulkItemsSection-gate-heading" className={styles.bulkGroupHeading}>
          Items
        </span>
        <div className={styles.bulkGroupBody}>
          <span className={styles.bulkHint}>{sectionGate.reason}</span>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* Step-10 finding 4 (fixer round): "items", "dueDates", "grading",
          "submissionType" and "move" all pass `announceBusy={false}` below -
          their `busy` is this section's OWN slice of the single, bar-wide
          `opBusy` flag ModulesView owns (shared with BulkModulesSection's
          "modules" group too), so one publish/delete/move used to make SIX
          group headings announce "Working..." via SIX separate live regions
          simultaneously. ModulesView.tsx now renders ONE bar-level
          role="status" aria-live="polite" region for that shared flag; every
          suppressed group here still shows the plain "Working..." text in
          its own heading (context: which controls are currently disabled),
          it just stops re-announcing what the bar-level region already said.
          "content" just below is the one exception in this file - its own
          `descSharedState` loading signal is not shared with any other
          group, so it keeps its own live region (see the comment there). */}
      <BulkBarGroup group={groupById("items")} facts={facts} runtime={staticRuntime(opBusy)} state={groupsState} announceBusy={false}>
        <div className={styles.bulkRow}>
          <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkPublish(true)}>
            Publish
          </Button>
          <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkPublish(false)}>
            Unpublish
          </Button>
          {selectedItems().length === 1 &&
            (() => {
              const one = selectedItems()[0];
              if (!one) return null;
              const it = one.item;
              if (["Assignment", "Quiz", "Discussion"].includes(it.type) && it.contentId != null) {
                return (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(e) => {
                      onGradableEditorTrigger(e.currentTarget);
                      setEditingItem(it);
                    }}
                    title="Edit every attribute of this item"
                  >
                    Edit in detail
                  </Button>
                );
              }
              if (it.type === "Page" && it.pageUrl) {
                return (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(e) => {
                      onPageEditorTrigger(e.currentTarget);
                      onEditPage(it.pageUrl!);
                    }}
                    title="Edit this page"
                  >
                    Edit page
                  </Button>
                );
              }
              return null;
            })()}
        </div>
      </BulkBarGroup>
      {/* Kept at <BulkBarGroup>'s default announceBusy (true), unlike its
          five siblings above: this group's own `descSharedState ===
          "loading"` fires on SELECTION CHANGE (D6), not user action, and no
          other group in the bar carries that signal - suppressing this
          region would silence the only announcement of it. Step-10 finding 4
          (SECOND fixer round): `runtime.busy` here used to be OR-ed with the
          section-wide `opBusy` too, which made this heading re-announce the
          same fact ModulesView's bar-level region already speaks whenever an
          unrelated bulk write was in flight - up to three live regions
          firing for one write. `runtime.busy` now carries ONLY
          `descSharedState === "loading"`, the one fact this group actually
          owns; `opBusy` alone no longer makes this heading say
          "Working..." at all, since that fact is already announced once, at
          the bar level. */}
      <BulkBarGroup
        group={groupById("content")}
        facts={facts}
        runtime={staticRuntime(descSharedState === "loading")}
        state={groupsState}
      >
        <div className={styles.bulkRow}>
          {descSharedState === "loading" && (
            <span className={styles.bulkFieldLabel}>Checking descriptions…</span>
          )}
          {descSharedState === "same" && (
            <span className={styles.bulkFieldLabel}>Loaded the shared description — edits apply to all.</span>
          )}
          {descSharedState === "mixed" && (
            <span className={styles.bulkFieldLabel}>Selected items have different descriptions; typing replaces them all.</span>
          )}
          {/* S2: some of the selected gradables' current descriptions could
              not be fetched (rate limit, a deleted item, a network blip).
              The surviving subset might happen to agree, but claiming
              "shared" here would assert the app read every item's current
              text - it did not, and "Set description" below still
              overwrites every selected item, including the unread ones. */}
          {descSharedState === "partial" && descPartialCounts && (
            <span className={styles.bulkFieldLabel} style={{ color: "var(--danger)" }}>
              Could not read {descPartialCounts.uncheckedCount} of {descPartialCounts.totalCount} selected
              items — their current descriptions are unknown and will still be replaced if you set one below.
            </span>
          )}
          <TextField
            multiline
            minRows={4}
            fullWidth
            value={bulkItemsDescription}
            onChange={(e) => setBulkItemsDescription(e.target.value)}
            placeholder="Description (HTML allowed) — replaces the description on selected items / the body of selected pages"
            slotProps={{ htmlInput: { spellCheck: true } }}
            aria-label="Description to set on the selected items"
            size="small"
          />
          <Button variant="contained" size="small" disabled={opBusy} onClick={bulkSetDescription}>
            Set description
          </Button>
          <span className={styles.bulkField}>
            <Button
              variant="outlined"
              size="small"
              onClick={(e) => {
                onItemQuestionsTrigger(e.currentTarget);
                setBulkItemsQuestionsOpen(true);
              }}
            >
              Edit questions{bulkItemsQuestions.length > 0 ? ` (${bulkItemsQuestions.length})` : ""}
            </Button>
            <Button variant="outlined" size="small" disabled={opBusy || bulkItemsQuestions.length === 0} onClick={bulkAddQuestionsToQuizzes}>
              Add to selected quizzes
            </Button>
          </span>
          <span className={styles.bulkHint}>
            Set description overwrites the description on selected assignments, quizzes, and discussions (and
            the body of selected pages). Questions are appended to every selected quiz.
          </span>
        </div>
      </BulkBarGroup>
      <BulkBarGroup group={groupById("dueDates")} facts={facts} runtime={staticRuntime(opBusy)} state={groupsState} announceBusy={false}>
        <div className={styles.bulkRow}>
          <TextField
            type="datetime-local"
            size="small"
            sx={{ width: 188 }}
            value={bulkDue}
            onChange={(e) => setBulkDue(e.target.value)}
            aria-label="Due date"
            slotProps={{ htmlInput: { } }}
          />
          <Button variant="contained" size="small" disabled={opBusy} onClick={bulkSetDue} title="Set this due date on all selected gradables">
            Set
          </Button>
          <span className={styles.bulkField}>
            <TextField
              type="number"
              size="small"
              sx={{ width: 56 }}
              value={bulkShift}
              onChange={(e) => setBulkShift(Number(e.target.value))}
              aria-label="Days to shift"
            />
            <Button variant="outlined" size="small" disabled={opBusy} onClick={bulkShiftDue}>
              Shift days
            </Button>
          </span>
          <span className={styles.bulkField}>
            <TextField
              type="number"
              size="small"
              slotProps={{ htmlInput: { min: 0 } }}
              sx={{ width: 52 }}
              value={bulkStaggerOffset}
              onChange={(e) => setBulkStaggerOffset(Number(e.target.value))}
              aria-label="Stagger interval"
            />
            <TextField
              select
              size="small"
              value={bulkStaggerUnit}
              onChange={(e) => setBulkStaggerUnit(e.target.value === "days" ? "days" : "weeks")}
              aria-label="Stagger interval unit"
            >
              <MenuItem value="weeks">weeks</MenuItem>
              <MenuItem value="days">days</MenuItem>
            </TextField>
            <Button variant="outlined" size="small" disabled={opBusy} onClick={bulkStaggerDue}>
              Stagger
            </Button>
          </span>
          <span className={styles.bulkHint}>
            Stagger gives the earliest selected module the date above, then adds the interval for each later module.
          </span>
        </div>
      </BulkBarGroup>
      <BulkBarGroup group={groupById("grading")} facts={facts} runtime={staticRuntime(opBusy)} state={groupsState} announceBusy={false}>
        <div className={styles.bulkRow}>
          <span className={styles.bulkField}>
            <TextField
              type="number"
              size="small"
              sx={{ width: 74 }}
              placeholder="points"
              value={bulkPoints}
              onChange={(e) => setBulkPoints(e.target.value)}
              aria-label="Points"
            />
            <Button variant="outlined" size="small" disabled={opBusy} onClick={bulkSetPoints}>
              Set points
            </Button>
          </span>
          <span className={styles.bulkField}>
            <TextField
              select
              size="small"
              sx={{ maxWidth: 170 }}
              value={bulkRubricId}
              disabled={rubrics.length === 0}
              onChange={(e) => setBulkRubricId(e.target.value === "" ? "" : Number(e.target.value))}
              aria-label="Rubric"
            >
              <MenuItem value="">{rubrics.length === 0 ? "No rubrics" : "Rubric…"}</MenuItem>
              {rubrics.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {/* Account-level rubrics are shared across every course under
                   * that Canvas account (see CanvasRubric's own doc comment) -
                   * labeled so an instructor does not mistake one for a rubric
                   * that is only theirs to change. */}
                  {r.title}
                  {r.source === "account" ? " (account-level)" : ""}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" size="small" disabled={opBusy || bulkRubricId === ""} onClick={bulkRubric}>
              Associate
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={opBusy || bulkRubricId === "" || selectedRubricSource === "account"}
              onClick={(e) => {
                if (bulkRubricId === "") return;
                onRubricBuilderTrigger(e.currentTarget);
                setRubricBuilder({ assignments: [], editRubricId: Number(bulkRubricId) });
              }}
            >
              Edit
            </Button>
          </span>
          {selectedRubricSource === "account" && (
            <span className={styles.bulkHint}>
              Account-level rubrics are shared across courses and can&apos;t be edited here.
            </span>
          )}
          <Button
            variant="outlined"
            size="small"
            disabled={opBusy}
            onClick={(e) => {
              onRubricBuilderTrigger(e.currentTarget);
              openRubricBuilder();
            }}
          >
            New rubric
          </Button>
          {/* docs/rubric-bulk-action-acceptance-criteria.md AC1/AC4/AC5:
              generates one point-agnostic rubric spec and associates it to
              every ELIGIBLE selected item, creating one Canvas rubric per
              distinct point total. Unlike "Associate" above (which requires
              an existing rubric already picked from the select), this needs
              no prior selection of its own - it both creates and associates. */}
          <Button variant="outlined" size="small" disabled={opBusy} onClick={bulkGenerateAndAssociateRubric}>
            Generate &amp; associate rubric
          </Button>
          {/* AC4: every selected item's outcome is reported here, never
              silently dropped - "already has a rubric" (skipped, unchanged)
              is worded distinctly from "this kind can never have one"
              (ineligible), and an orphan rubric (created but attached to
              nothing, AC3) is named by id and title rather than hidden. */}
          {/* C6: this span used to independently re-compose the same
              sentence set describeRubricGenerateNote (bulkRubricGenerateSummary.ts)
              already builds from the same report, with different wording -
              two sources of truth for one instructor-facing message that
              could silently drift apart while both stayed green. Rendering
              the shared function's own text here leaves this file with
              exactly one extra job: naming the orphan rubrics themselves,
              which the note text only gestures at ("see below") since it has
              no JSX of its own to list them in. */}
          {bulkRubricGenerateReport && (
            <span role="status" aria-live="polite" className={styles.bulkHint}>
              {describeRubricGenerateNote(bulkRubricGenerateReport).text}
              {bulkRubricGenerateReport.orphans.length > 0 && (
                <>
                  {" "}
                  Created but not attached to anything: {bulkRubricGenerateReport.orphans
                    .map((o) => `"${o.rubricTitle}" (id ${o.rubricId})`)
                    .join(", ")}
                  .
                </>
              )}
            </span>
          )}
        </div>
        {/* docs/rubric-bulk-log-acceptance-criteria.md B4 item 9: rendered
            inline with the control that produced it, in this same group -
            the durable counterpart to the ABOVE report, which does not
            survive past the next run or a reload. Recomputes nothing of its
            own; every decision (counts, recent entries, CSV/JSON text, the
            filename) already lives in src/lib/rubric-run-log.ts. */}
        <RubricRunLogPanel log={rubricRunLog} onClear={clearRubricRunLog} />
      </BulkBarGroup>
      <BulkBarGroup group={groupById("submissionType")} facts={facts} runtime={staticRuntime(opBusy)} state={groupsState} announceBusy={false}>
        <div className={styles.bulkRow}>
          <TextField
            select
            size="small"
            sx={{ minWidth: 180 }}
            value={bulkSubType}
            onChange={(e) => setBulkSubType(e.target.value)}
            aria-label="Submission type"
          >
            <MenuItem value="">Change submission type…</MenuItem>
            <MenuItem value="online_text_entry">Text entry</MenuItem>
            <MenuItem value="online_upload">File upload</MenuItem>
            <MenuItem value="online_url">Website URL</MenuItem>
            <MenuItem value="on_paper">On paper</MenuItem>
            <MenuItem value="none">No submission</MenuItem>
          </TextField>
          <Button variant="outlined" size="small" disabled={opBusy || bulkSubType === ""} onClick={bulkUpdateSubmissionType}>
            Apply
          </Button>
          <span className={styles.bulkHint}>
            {selectedAssignmentCount() > 0
              ? `${selectedAssignmentCount()} assignment${selectedAssignmentCount() === 1 ? "" : "s"} selected`
              : "Select assignment items to change their submission type."}
          </span>
        </div>
      </BulkBarGroup>
      {/* Step-10 finding 4 (fixer round): same suppression as "items"/
          "dueDates"/"grading"/"submissionType" above - this group's busy
          signal is the same bar-wide opBusy ModulesView already announces
          once (see BulkBarGroup.tsx's announceBusy prop). */}
      <BulkBarGroup
        group={groupById("move")}
        facts={facts}
        runtime={staticRuntime(opBusy, confirmDeleteContent || confirmRemoveFromModule)}
        state={groupsState}
        announceBusy={false}
      >
        <div className={styles.bulkRow}>
          <span className={styles.bulkField}>
            <TextField
              type="number"
              size="small"
              slotProps={{ htmlInput: { min: 1 } }}
              sx={{ width: 56 }}
              value={bulkModuleShift}
              onChange={(e) => setBulkModuleShift(Number(e.target.value))}
              aria-label="Modules to shift by"
            />
            <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkShiftModules(-1)}>
              Shift up
            </Button>
            <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkShiftModules(1)}>
              Shift down
            </Button>
          </span>
          <span className={styles.bulkField}>
            <TextField
              select
              size="small"
              sx={{ maxWidth: 190 }}
              value={bulkTargetModule}
              disabled={modules.length === 0}
              onChange={(e) => setBulkTargetModule(e.target.value === "" ? "" : Number(e.target.value))}
              aria-label="Module to move items into"
            >
              <MenuItem value="">{modules.length === 0 ? "No modules" : "Move to module…"}</MenuItem>
              {modules.map((mod) => (
                <MenuItem key={mod.id} value={mod.id}>
                  {mod.name}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" size="small" disabled={opBusy || bulkTargetModule === ""} onClick={bulkMoveToModule} title="Move selected items into this module">
              Move
            </Button>
          </span>
          {/* B2: this used to fire bulkRemoveFromModule on the first click
              with no arming at all, immediately to the left of the fully-
              armed "Delete from Canvas" below, inside the same danger-tier
              card - the higher-consequence-looking neighbour was the
              unguarded one. Same two-click arm + label swap + colocated
              banner treatment as Delete now, tracked independently
              (confirmRemoveFromModule) so arming one never arms the other. */}
          <Button
            variant="outlined"
            size="small"
            disabled={opBusy}
            onClick={bulkRemoveFromModule}
            title="Remove selected items from their module"
          >
            {bulkRemoveFromModuleButtonLabel(confirmRemoveFromModule)}
          </Button>
          <Button variant="outlined" size="small" color="error" disabled={opBusy} onClick={bulkDeleteContent}>
            {confirmDeleteContent ? "Confirm delete" : "Delete from Canvas"}
          </Button>
          {/* Step-10 finding 1 (AC10): the two armed Delete buttons used to
              swap only their label, while the two armed visualizer writes
              (VisualizerCoverageSection.tsx's linkArmed/createArmed) also got
              a colocated, aria-live banner - exactly backwards, since Delete
              is the higher-consequence pair. Same three-signal treatment
              that file's own header comment documents: label swap (above),
              this colocated `role="status" aria-live="polite"` banner, and
              the hook's own `setNote` (bulkDeleteContent, unchanged). */}
          {confirmDeleteContent && (
            <span role="status" aria-live="polite" className={styles.bulkHint}>
              Click &quot;Confirm delete&quot; again to permanently delete the selected item
              {facts.itemCount === 1 ? "" : "s"} from Canvas. This cannot be undone.
            </span>
          )}
          {confirmRemoveFromModule && (
            <span role="status" aria-live="polite" className={styles.bulkHint}>
              {bulkRemoveFromModuleBannerText(facts.itemCount)}
            </span>
          )}
        </div>
      </BulkBarGroup>
    </>
  );
}
