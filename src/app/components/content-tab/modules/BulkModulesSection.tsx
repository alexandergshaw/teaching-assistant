"use client";

import { Button, MenuItem, TextField } from "@mui/material";
import type { CanvasAddableContent, CanvasRubric } from "@/lib/canvas-modules";
import styles from "../../../page.module.css";
import type { EditableQuestion } from "../types";
import { LIVE_CONTENT_SOURCE, gateOperation, type ContentSourceContext } from "../contentSourceGating";
import { BulkBarGroup } from "./BulkBarGroup";
import { groupById, type BulkBarFacts, type BulkBarGroupRuntime } from "./bulkBarGroups";
import type { BulkBarGroupsApi } from "./useBulkBarGroups";

// This section owns exactly three of the bulk bar's fourteen top-level
// groups (docs/bulk-bar-reorganization-acceptance-criteria.md section
// 3b/D1/D5, and docs/current-events-assignment-from-modules-acceptance-
// criteria.md section 3b/D5 for the third): "modules" (Publish/Unpublish/
// Delete on whole modules), "addToEach" (the "Add to each" flow), and
// "currentEvents" (the one-click per-module current-events-assignment
// fan-out). The wrappers live HERE, never in ModulesView.tsx - that keeps
// ModulesView's six section render tags byte-identical, which is what saves
// visualizerCoverage.wiring.test.ts and askAiSelection.wiring.test.ts (D5's
// own reasoning).
//
// Step-10 finding (review round): the six section files each carried their
// own near-identical `findGroup` copy - three different error message
// strings, and this file's own copy was the one called at MODULE SCOPE,
// which throws at import time (taking down the whole ModulesView import
// chain) rather than at render like every sibling's copy claimed to.
// `groupById` (./bulkBarGroups.ts) replaces all six with one lookup and one
// error message - but adopting the new function name here did not, by
// itself, fix the timing: step-10 finding 13 (confirmation review) found
// this file still called `groupById("modules")`/`groupById("addToEach")` at
// MODULE SCOPE, reproducing the exact failure mode the paragraph above
// describes. Both calls now live inside the component body below (see
// `BulkModulesSection`'s own first two statements), so a missing catalog id
// throws at render, scoped to this section's own error boundary, exactly
// like every sibling section's `groupById` call already does.

// "addToEach" merges what used to be six separately-gated `bulkRow`s into
// ONE BulkBarGroup (per ./bulkBarGroupCatalog.ts's own comment on
// addToEachGroup - they are one coherent "compose, then Add" flow, never
// usable independently of each other). Five of those six sub-flows (every
// one except the base type/pattern/Add row, which stays as this group's
// always-rendered head content) are still individually conditional on
// `bulkAddType`, so each renders as a NESTED child: a real `role="group"`
// container with its own `aria-labelledby` heading, but never its own
// `<details>` - it is not independently collapsible, and opens/closes only
// because its parent group's `<details>` (rendered by BulkBarGroup) does.
// One level of nesting only, per this file's own brief.
//
// These five ids are NOT BulkBarControlDef ids from the catalog (the
// catalog only models individual CONTROLS - moduleAddDiscardFile,
// moduleAddQuestionsEdit, etc). They name the five wrapper SECTIONS this
// file introduces purely for AC2's "a real group, not a flat run of
// labels" requirement, one level below the top-level "addToEach" group.
const NESTED_HEADING_IDS = {
  file: "bulkModulesNested-moduleAddFile",
  details: "bulkModulesNested-moduleAddDetails",
  body: "bulkModulesNested-moduleAddBody",
  questions: "bulkModulesNested-moduleAddQuestions",
  ai: "bulkModulesNested-moduleAddAi",
} as const;

const REFUSAL_HEADING_ID = "bulkModulesSection-refusal-heading";

export interface BulkModulesSectionProps {
  opBusy: boolean;
  /** Which Course Content source is active - see contentSourceGating.ts.
   * Optional, defaulted to LIVE_CONTENT_SOURCE so every existing call site
   * (none of which pass this yet) is unaffected. */
  sourceContext?: ContentSourceContext;
  /** The bar-wide facts object (section 3b/D1's BulkBarFacts) driving every
   * group's derived tier/collapsibility/open state. Constructed ONCE by
   * ModulesView (several fields - moduleCount, itemCount, ... - feed groups
   * that live in other section files too) and threaded down unchanged; this
   * file never builds one of its own. */
  facts: BulkBarFacts;
  /** The bulk bar's group open/closed persistence API (useBulkBarGroups.ts),
   * called EXACTLY ONCE by ModulesView per section 3b/D3 and threaded down
   * as a prop. This file must never call useBulkBarGroups itself - doing so
   * would give "modules"/"addToEach" their own independent read of the same
   * localStorage key, each clobbering the other groups' persisted state. */
  groupsState: BulkBarGroupsApi;
  bulkPublishModules: (published: boolean) => void;
  bulkDeleteModules: () => void;
  confirmDeleteModules: boolean;
  bulkAddType: string;
  setBulkAddType: (v: string) => void;
  bulkAddPattern: string;
  setBulkAddPattern: (v: string) => void;
  bulkAddSubType: string;
  setBulkAddSubType: (v: string) => void;
  bulkAiBusy: boolean;
  bulkAddFileContent: string;
  setBulkAddFileContent: (v: string) => void;
  bulkAddFileId: number | "";
  setBulkAddFileId: (v: number | "") => void;
  bulkAddToModules: () => void;
  targets: CanvasAddableContent | null;
  ensureTargets: () => void;
  bulkAddFileFormat: "docx" | "pptx";
  setBulkAddFileFormat: (v: "docx" | "pptx") => void;
  bulkFileOptions: () => Array<{ value: string; label: string }>;
  bulkAddDue: string;
  setBulkAddDue: (v: string) => void;
  bulkAddStaggerOffset: number;
  setBulkAddStaggerOffset: (v: number) => void;
  bulkAddStaggerUnit: "weeks" | "days";
  setBulkAddStaggerUnit: (v: "weeks" | "days") => void;
  bulkAddPoints: string;
  setBulkAddPoints: (v: string) => void;
  bulkAddRubricId: number | "";
  setBulkAddRubricId: (v: number | "") => void;
  rubrics: CanvasRubric[];
  bulkAddDescription: string;
  setBulkAddDescription: (v: string) => void;
  bulkAddQuestions: EditableQuestion[];
  setBulkAddQuestions: (v: EditableQuestion[]) => void;
  setBulkQuestionsOpen: (v: boolean) => void;
  /** Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md,
   * wave R2): captures `event.currentTarget` synchronously, alongside (never
   * instead of) `setBulkQuestionsOpen` above. This bar's own BulkQuestionsModal
   * instance is driven by an independent state variable from BulkItemsSection's
   * (useBulkModuleActions.ts's bulkQuestionsOpen vs useBulkItemActions.ts's
   * bulkItemsQuestionsOpen), so it is its own single-opener dialog. */
  onModuleQuestionsTrigger: (trigger: HTMLElement) => void;
  bulkAiPrompt: string;
  setBulkAiPrompt: (v: string) => void;
  bulkAiGenerate: () => void;
  /** Current-events research assignment, one per selected module
   * (docs/current-events-assignment-from-modules-acceptance-criteria.md,
   * section 3b/D5-D8). All three come from useCurrentEventsAssignments,
   * called ONCE by ModulesView (never from this section, which can be
   * conditionally unmounted) and threaded down here as bare identifiers.
   * REQUIRED, not optional (entry 328's "the hop that has shipped dead in
   * this repo before"): omitting any of the three fails tsc rather than
   * silently rendering a control whose click does nothing. */
  confirmCurrentEvents: boolean;
  currentEventsLabel: string;
  runCurrentEventsAssignments: () => void;
}

// Bulk bar section shown when one or more modules are selected: whole-module
// publish/unpublish/delete, and "Add to each" — one new (optionally AI
// generated) item per selected module.
export function BulkModulesSection({
  opBusy,
  sourceContext,
  facts,
  groupsState,
  bulkPublishModules,
  bulkDeleteModules,
  confirmDeleteModules,
  bulkAddType,
  setBulkAddType,
  bulkAddPattern,
  setBulkAddPattern,
  bulkAddSubType,
  setBulkAddSubType,
  bulkAiBusy,
  bulkAddFileContent,
  setBulkAddFileContent,
  bulkAddFileId,
  setBulkAddFileId,
  bulkAddToModules,
  targets,
  ensureTargets,
  bulkAddFileFormat,
  setBulkAddFileFormat,
  bulkFileOptions,
  bulkAddDue,
  setBulkAddDue,
  bulkAddStaggerOffset,
  setBulkAddStaggerOffset,
  bulkAddStaggerUnit,
  setBulkAddStaggerUnit,
  bulkAddPoints,
  setBulkAddPoints,
  bulkAddRubricId,
  setBulkAddRubricId,
  rubrics,
  bulkAddDescription,
  setBulkAddDescription,
  bulkAddQuestions,
  setBulkAddQuestions,
  setBulkQuestionsOpen,
  onModuleQuestionsTrigger,
  bulkAiPrompt,
  setBulkAiPrompt,
  bulkAiGenerate,
  confirmCurrentEvents,
  currentEventsLabel,
  runCurrentEventsAssignments,
}: BulkModulesSectionProps) {
  // Called here, inside the component body, not at module scope (step-10
  // finding 13, confirmation review) - see this file's own header comment
  // for the failure mode that placement used to reproduce.
  const MODULES_GROUP = groupById("modules");
  const ADD_TO_EACH_GROUP = groupById("addToEach");
  // D5: a NEW sibling group, not folded into "addToEach" - see
  // bulkBarGroupCatalog.ts's own currentEventsGroup comment for why (a
  // differently-shaped fan-out write needs its own consequenceTag, and
  // addToEach's own controls are "one coherent flow, never usable
  // independently", which this zero-input one-click generator is not part
  // of). Looked up here for the same module-scope-vs-render-time reason as
  // the two groups above.
  const CURRENT_EVENTS_GROUP = groupById("currentEvents");
  const ctx = sourceContext ?? LIVE_CONTENT_SOURCE;
  // GATED AS ONE UNIT - same reasoning as BulkItemsSection: publish/delete
  // write to the selected modules directly, and "Add to each" (including its
  // AI-drafting sub-step) ends the same way AddItemRow's does, by creating a
  // Canvas item in each selected module. Unreachable today for the same
  // reason BulkItemsSection is (entry 263's Limits) - `selectedModules` is a
  // bare `Set<number>` with no source discrimination at all yet.
  const sectionGate = gateOperation(ctx, "modules");

  // Per-group runtime signals (section 3b/D1's BulkBarGroupRuntime) computed
  // locally from props this component already receives - no new prop surface
  // needed for these. `armed` mirrors confirmArming.ts's idiom: the modules
  // Delete button is already two-click confirmed via `confirmDeleteModules`,
  // which is exactly the "armed" force-open trigger `groupOpen` (in
  // ./bulkBarGroups) checks for.
  const modulesRuntime: BulkBarGroupRuntime = {
    busy: opBusy,
    armed: confirmDeleteModules,
    hasUnavailableReason: false,
  };
  const addToEachRuntime: BulkBarGroupRuntime = {
    busy: bulkAiBusy,
    armed: false,
    hasUnavailableReason: false,
  };
  // This group's own busy state is the shared opBusy (bare, never OR-ed with
  // anything else - useCurrentEventsAssignments.ts's own header comment
  // states it holds no busy flag of its own for exactly this reason), the
  // same choice "modules" above makes and for the same reason: two rounds of
  // the previous chunk were spent fixing multiple live regions announcing
  // one shared fact, and announceBusy={false} below keeps the bar-level
  // region the single announcer.
  const currentEventsRuntime: BulkBarGroupRuntime = {
    busy: opBusy,
    armed: confirmCurrentEvents,
    hasUnavailableReason: false,
  };
  // This group keeps <BulkBarGroup>'s default announceBusy (unlike
  // "modules" above): `bulkAiBusy` is a signal only THIS group owns (the
  // "Add to each" AI-drafting sub-step), not shared with any other group in
  // the bar, so its own live announcement is not a duplicate of the
  // bar-level opBusy region - it is the only place that fact gets spoken.
  // Step-10 finding 4 (SECOND fixer round): `busy` here used to be OR-ed
  // with the section-wide `opBusy` too, which made this heading re-announce
  // the same fact ModulesView's bar-level region already speaks whenever an
  // unrelated bulk write was in flight - up to three live regions firing for
  // one write. `busy` now carries ONLY `bulkAiBusy`; `opBusy` alone no
  // longer makes this heading say "Working..." at all, since that fact is
  // already announced once, at the bar level.

  if (!sectionGate.allowed) {
    // D6: the sectionGate refusal branch MUST render as a static,
    // non-collapsible group, never a <details> - collapsing it would hide
    // the only explanation of why the section is empty. Built directly with
    // 1C's static-group classes rather than through <BulkBarGroup> (which
    // needs a real BulkBarGroupDef and a full BulkBarFacts to reduce over,
    // neither of which describes "operation refused" - that is orthogonal to
    // any control's consequence tier).
    return (
      <section role="group" aria-labelledby={REFUSAL_HEADING_ID} className={styles.bulkGroupStatic}>
        <span id={REFUSAL_HEADING_ID} className={styles.bulkGroupHeading}>
          Modules
        </span>
        <div className={styles.bulkGroupBody}>
          <span className={styles.bulkHint}>{sectionGate.reason}</span>
        </div>
      </section>
    );
  }

  const bodyLabel =
    bulkAddType === "Page"
      ? "Body"
      : bulkAddType === "File"
        ? bulkAddFileFormat === "pptx"
          ? "Slides"
          : "File content"
        : "Description";

  return (
    <>
      {/* Step-10 finding 4 (fixer round): `modulesRuntime.busy` is this
          section's slice of ModulesView's single, bar-wide `opBusy` flag -
          also fed to five of BulkItemsSection's six groups. ModulesView.tsx
          now renders ONE bar-level role="status" aria-live="polite" region
          for that shared flag, so this group's own heading stops duplicating
          it (see BulkBarGroup.tsx's announceBusy prop for the full decision).
          The heading still shows the plain "Working..." text, unannounced. */}
      <BulkBarGroup group={MODULES_GROUP} facts={facts} runtime={modulesRuntime} state={groupsState} announceBusy={false}>
        <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkPublishModules(true)}>
          Publish
        </Button>
        <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkPublishModules(false)}>
          Unpublish
        </Button>
        {/* NON-NEGOTIABLE: Delete is destructive and two-click armed
            (confirmDeleteModules). groupTier (./bulkBarGroups) derives this
            whole group's tier as "destructive" the instant this control is
            visible, which makes mayCollapse false unconditionally - so
            BulkBarGroup renders this as the static, always-open
            .bulkGroupStatic card. Per step-10 finding 5, that card IS a
            <details> under the hood (every group is, collapsible or not -
            a fixed host element avoids the unmount/remount, and the focus
            loss, a collapsible<->static element-type switch would cause);
            its <summary> is simply pulled out of the tab order and its
            native toggle suppressed, so it never actually collapses. The
            former `title="Delete the selected modules"` tooltip is dropped:
            the group's own consequenceTag now says the same thing as
            ALWAYS-VISIBLE text on the heading (E3 - a hint must be
            relocated, never left as a keyboard-unreachable tooltip). */}
        <Button variant="outlined" size="small" color="error" disabled={opBusy} onClick={bulkDeleteModules}>
          {confirmDeleteModules ? "Confirm delete" : "Delete"}
        </Button>
        {/* Step-10 finding 1 (AC10): the two armed Delete buttons used to
            swap only their label, while the two armed visualizer writes
            (VisualizerCoverageSection.tsx's linkArmed/createArmed) also got a
            colocated, aria-live banner - exactly backwards, since Delete is
            the higher-consequence pair. Same three-signal treatment that
            file's own header comment documents: label swap (above), this
            colocated `role="status" aria-live="polite"` banner, and the
            hook's own `setNote` (bulkDeleteModules, unchanged). */}
        {confirmDeleteModules && (
          <span role="status" aria-live="polite" className={styles.bulkHint}>
            Click &quot;Confirm delete&quot; again to permanently delete the selected module
            {facts.moduleCount === 1 ? "" : "s"} from Canvas. This cannot be undone.
          </span>
        )}
      </BulkBarGroup>

      <BulkBarGroup group={ADD_TO_EACH_GROUP} facts={facts} runtime={addToEachRuntime} state={groupsState}>
        <div className={styles.bulkRow}>
          <TextField
            select
            size="small"
            value={bulkAddType}
            onChange={(e) => {
              const t = e.target.value;
              setBulkAddType(t);
            }}
            aria-label="Type of item to add to each selected module"
          >
            <MenuItem value="Assignment">Assignment</MenuItem>
            <MenuItem value="Quiz">Quiz</MenuItem>
            <MenuItem value="Discussion">Discussion</MenuItem>
            <MenuItem value="Page">Page</MenuItem>
            <MenuItem value="File">File</MenuItem>
            <MenuItem value="SubHeader">Text header</MenuItem>
          </TextField>
          <TextField
            size="small"
            sx={{ flex: "1 1 200px", minWidth: 170 }}
            placeholder={
              bulkAddType === "File"
                ? "File name pattern (for an AI-generated file)"
                : "Name pattern, e.g. {module} - Homework"
            }
            value={bulkAddPattern}
            onChange={(e) => setBulkAddPattern(e.target.value)}
            aria-label="Name pattern for the new items"
          />
          {bulkAddType === "Assignment" && (
            <TextField
              select
              size="small"
              sx={{ minWidth: 170 }}
              value={bulkAddSubType}
              onChange={(e) => setBulkAddSubType(e.target.value)}
              aria-label="Submission type for the new assignments"
            >
              <MenuItem value="online_text_entry">Text entry</MenuItem>
              <MenuItem value="online_upload">File upload</MenuItem>
              <MenuItem value="online_url">Website URL</MenuItem>
              <MenuItem value="on_paper">On paper</MenuItem>
              <MenuItem value="none">No submission</MenuItem>
            </TextField>
          )}
          {/* NON-NEGOTIABLE: Add is one of the three worst controls in the
              whole bar - one click creates a Canvas item in EVERY selected
              module, with no confirm. Its group can never collapse (its own
              moduleAddButton entry in ./bulkBarGroupCatalog.ts is
              fan-out-write, which pins groupTier(addToEach) at fan-out-write
              or above the instant this button is visible), so it always
              renders at full weight inside the static .bulkGroupStatic card
              BulkBarGroup produces for a non-collapsible group. The former
              `title="Add one new item to each selected module"` tooltip is
              dropped for the same E3 reason as Delete's above - the group's
              own consequenceTag already says this, as always-visible text. */}
          <Button
            variant="contained"
            size="small"
            disabled={
              opBusy ||
              bulkAiBusy ||
              (bulkAddType === "File"
                ? (bulkAddFileContent.trim() === "" && bulkAddFileId === "") ||
                  (bulkAddFileContent.trim() !== "" && !bulkAddPattern.trim())
                : !bulkAddPattern.trim())
            }
            onClick={bulkAddToModules}
          >
            Add
          </Button>
          <span className={styles.bulkHint}>
            {"{module}"} = module name, {"{n}"} = week/module number from the title (e.g. &quot;Week 5&quot; -&gt; 5). New items are unpublished.
          </span>
        </div>

        {bulkAddType === "File" && (
          <section role="group" aria-labelledby={NESTED_HEADING_IDS.file} className={styles.bulkRow}>
            <span id={NESTED_HEADING_IDS.file} className={styles.bulkLabel}>
              File
            </span>
            <span className={styles.bulkField}>
              <span className={styles.bulkFieldLabel}>New file</span>
              <TextField
                select
                size="small"
                value={bulkAddFileFormat}
                onChange={(e) => setBulkAddFileFormat(e.target.value === "pptx" ? "pptx" : "docx")}
                aria-label="Format of the generated file"
              >
                <MenuItem value="docx">Word (.docx)</MenuItem>
                <MenuItem value="pptx">PowerPoint (.pptx)</MenuItem>
              </TextField>
            </span>
            <TextField
              select
              size="small"
              sx={{ flex: "1 1 200px", maxWidth: 300 }}
              value={bulkAddFileId}
              disabled={opBusy || bulkAddFileContent.trim() !== ""}
              onChange={(e) => setBulkAddFileId(e.target.value === "" ? "" : Number(e.target.value))}
              aria-label="Existing file to add to each module"
              slotProps={{ select: { onOpen: () => ensureTargets() } }}
            >
              <MenuItem value="">{bulkFileOptions().length === 0 ? (targets ? "No files available" : "Loading files…") : "or pick existing file…"}</MenuItem>
              {bulkFileOptions().map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            {bulkAddFileContent.trim() !== "" && (
              <Button variant="outlined" size="small" onClick={() => setBulkAddFileContent("")}>
                Discard AI file
              </Button>
            )}
            <span className={styles.bulkHint}>
              Add an existing course file to every selected module, or generate a new{" "}
              {bulkAddFileFormat === "pptx" ? "PowerPoint deck" : "Word document"} with AI below
              (built into a branded {bulkAddFileFormat === "pptx" ? ".pptx" : ".docx"} named with the pattern).
            </span>
          </section>
        )}

        {["Assignment", "Quiz", "Discussion"].includes(bulkAddType) && (
          <section role="group" aria-labelledby={NESTED_HEADING_IDS.details} className={styles.bulkRow}>
            <span id={NESTED_HEADING_IDS.details} className={styles.bulkLabel}>
              Details
            </span>
            <span className={styles.bulkField}>
              <span className={styles.bulkFieldLabel}>Due</span>
              <TextField
                type="datetime-local"
                size="small"
                sx={{ width: 188 }}
                value={bulkAddDue}
                onChange={(e) => setBulkAddDue(e.target.value)}
                aria-label="First due date for the new items"
                slotProps={{ htmlInput: { } }}
              />
            </span>
            <span className={styles.bulkField}>
              <span className={styles.bulkFieldLabel}>then every</span>
              <TextField
                type="number"
                size="small"
                slotProps={{ htmlInput: { min: 0 } }}
                sx={{ width: 52 }}
                value={bulkAddStaggerOffset}
                onChange={(e) => setBulkAddStaggerOffset(Number(e.target.value))}
                aria-label="Stagger interval between modules"
              />
              <TextField
                select
                size="small"
                value={bulkAddStaggerUnit}
                onChange={(e) => setBulkAddStaggerUnit(e.target.value === "days" ? "days" : "weeks")}
                aria-label="Stagger interval unit"
              >
                <MenuItem value="weeks">weeks</MenuItem>
                <MenuItem value="days">days</MenuItem>
              </TextField>
            </span>
            {["Assignment", "Quiz"].includes(bulkAddType) && (
              <span className={styles.bulkField}>
                <TextField
                  type="number"
                  size="small"
                  sx={{ width: 74 }}
                  placeholder="points"
                  value={bulkAddPoints}
                  onChange={(e) => setBulkAddPoints(e.target.value)}
                  aria-label="Points for the new items"
                />
              </span>
            )}
            {bulkAddType === "Assignment" && (
              <span className={styles.bulkField}>
                {/* AC11 near-dead, reported not removed (also flagged by
                    the catalog's own RUBRIC_NEAR_DEAD entry for
                    moduleAddRubricSelect): with no rubrics on the course
                    this renders as a full-width, disabled "No rubrics"
                    select rather than a short sentence or being omitted. */}
                <TextField
                  select
                  size="small"
                  sx={{ maxWidth: 170 }}
                  value={bulkAddRubricId}
                  disabled={rubrics.length === 0}
                  onChange={(e) => setBulkAddRubricId(e.target.value === "" ? "" : Number(e.target.value))}
                  aria-label="Rubric for the new items"
                >
                  <MenuItem value="">{rubrics.length === 0 ? "No rubrics" : "Rubric…"}</MenuItem>
                  {rubrics.map((r) => (
                    <MenuItem key={r.id} value={r.id}>
                      {r.title}
                    </MenuItem>
                  ))}
                </TextField>
              </span>
            )}
            <span className={styles.bulkHint}>
              Optional. Due date, points, and rubric are written to every item created above; the
              stagger pushes each later module&apos;s due date out by the interval (0 = same date).
            </span>
          </section>
        )}

        {["Assignment", "Quiz", "Discussion", "Page", "File"].includes(bulkAddType) && (
          <section role="group" aria-labelledby={NESTED_HEADING_IDS.body} className={styles.bulkRow}>
            <span id={NESTED_HEADING_IDS.body} className={styles.bulkLabel}>
              {bodyLabel}
            </span>
            <TextField
              multiline
              minRows={4}
              fullWidth
              value={bulkAddType === "File" ? bulkAddFileContent : bulkAddDescription}
              onChange={(e) =>
                bulkAddType === "File"
                  ? setBulkAddFileContent(e.target.value)
                  : setBulkAddDescription(e.target.value)
              }
              placeholder={
                bulkAddType === "Page"
                  ? "Page body (HTML allowed) — written to every new page"
                  : bulkAddType === "File"
                    ? bulkAddFileFormat === "pptx"
                      ? "Slides — # Presentation title, then ## Slide title with - bullets. Generate with AI below or write them here; built into a .pptx. Leave empty to use the picked file"
                      : "Document text (use # Title, ## Section, - bullets) — generate with AI below or write it here; built into a .docx. Leave empty to use the picked file"
                    : "Description (HTML allowed) — written to every new item"
              }
              slotProps={{ htmlInput: { spellCheck: true } }}
              aria-label={bulkAddType === "File" ? "File content for the new files" : "Description for the new items"}
              size="small"
            />
          </section>
        )}

        {bulkAddType === "Quiz" && (
          <section role="group" aria-labelledby={NESTED_HEADING_IDS.questions} className={styles.bulkRow}>
            <span id={NESTED_HEADING_IDS.questions} className={styles.bulkLabel}>
              Questions
            </span>
            <Button
              variant="outlined"
              size="small"
              onClick={(e) => {
                onModuleQuestionsTrigger(e.currentTarget);
                setBulkQuestionsOpen(true);
              }}
            >
              Edit questions{bulkAddQuestions.length > 0 ? ` (${bulkAddQuestions.length})` : ""}
            </Button>
            {bulkAddQuestions.length > 0 && (
              <Button variant="outlined" size="small" onClick={() => setBulkAddQuestions([])}>
                Clear
              </Button>
            )}
            <span className={styles.bulkHint}>
              Composed once here and created in every new quiz.
            </span>
          </section>
        )}

        {bulkAddType !== "SubHeader" && (
          <section role="group" aria-labelledby={NESTED_HEADING_IDS.ai} className={styles.bulkRow}>
            <span id={NESTED_HEADING_IDS.ai} className={styles.bulkLabel}>
              AI
            </span>
            <TextField
              size="small"
              sx={{ flex: "1 1 260px", minWidth: 200 }}
              placeholder={
                bulkAddType === "File"
                  ? bulkAddFileFormat === "pptx"
                    ? "Describe the deck to generate, e.g. an intro to photosynthesis"
                    : "Describe the document to generate, e.g. a one-page study guide on photosynthesis"
                  : `Describe the ${bulkAddType.toLowerCase()} content to generate`
              }
              value={bulkAiPrompt}
              onChange={(e) => setBulkAiPrompt(e.target.value)}
              aria-label="AI prompt for the new content"
            />
            <Button
              variant="outlined"
              size="small"
              disabled={bulkAiBusy || opBusy || !bulkAiPrompt.trim()}
              onClick={() => bulkAiGenerate()}
            >
              {bulkAiBusy ? "Generating…" : "Generate with AI"}
            </Button>
            <span className={styles.bulkHint}>
              {bulkAddType === "File"
                ? bulkAddFileFormat === "pptx"
                  ? "Generates the slides above; review them, then Add to build a branded .pptx for every module."
                  : "Generates the document text above; review it, then Add to build a branded .docx for every module."
                : "Fills the description/body above with generated HTML; review it, then Add."}
            </span>
          </section>
        )}
      </BulkBarGroup>

      {/* D8's second trap: this group renders strictly AFTER addToEach's own
          closing tag above, never between "modules" and "addToEach" - two
          tests above slice from a group's own open tag to the first
          </BulkBarGroup> that follows it, so a group inserted between them
          would land inside those slices and fail assertions unrelated to
          this feature. announceBusy={false}: see currentEventsRuntime's own
          comment above for why this group never opens a second live region. */}
      <BulkBarGroup group={CURRENT_EVENTS_GROUP} facts={facts} runtime={currentEventsRuntime} state={groupsState} announceBusy={false}>
        <Button variant="contained" size="small" disabled={opBusy} onClick={runCurrentEventsAssignments}>
          {currentEventsLabel}
        </Button>
        {confirmCurrentEvents && (
          <span role="status" aria-live="polite" className={styles.bulkHint}>
            Click again to create these assignments in Canvas, one per selected module.
          </span>
        )}
      </BulkBarGroup>
    </>
  );
}
