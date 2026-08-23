"use client";

// Bulk bar section shown when a selection exists: "Generate from selection"
// (chunk 1 shipped anticipated Q&A and current events, both pure text;
// chunk 3a adds a third kind, "decks" - still neither kind writes to
// Canvas). Its own clearly-labelled group, matching the
// bulkRow/bulkField/bulkHint visual language BulkItemsSection/
// BulkModulesSection already use, rather than folding into any of
// ModulesHeaderBar's existing groups (that bar already has five).
//
// This section renders ONLY the controls that open a generation (the label,
// the deck template picker and the per-kind buttons). The preview it opens
// renders separately, at ModulesView's root - see GeneratedPreviewModal.tsx's
// own header comment for why (the sticky header this section lives inside is
// a stacking context and a fixed-position containing block, which traps a
// modal rendered inside it).
//
// Kind choice is one button per kind (not a button + select): there are only
// three kinds, so a select would cost a click without saving space, and this
// exactly matches the proven one-click precedent already on this bar -
// useLmsSyllabusButtons.ts's "Syllabus quiz" / "Generate syllabus" pair in
// ModulesHeaderBar - down to each button's own label doubling as its
// progress word while it runs.
//
// THE DECK TEMPLATE PICKER AND THE VIDEO LENGTH PICKER ARE THE TWO
// EXCEPTIONS - each a plain inline select next to the kind buttons, not a
// dialog (SCOPE: "surface it in the Generate group without adding a dialog,
// the same way the existing kinds avoid one"). "Specified template" means
// the EXISTING deck_templates (a JSON slide-role recipe plus five theme
// colours) - that decision is already settled with the instructor; see
// useLmsGeneration.ts's own header comment. The length picker offers
// SCRIPT_LENGTH_OPTIONS minutes for the module intro video script (docs/
// module-intro-video-script-acceptance-criteria.md, M15/M16) - see
// script-length.ts's own header comment for why a fixed option list and not
// a free-text number field. Each is shown only once its own kind ("decks" /
// "scripts") is among the offerable kinds, which today is exactly whenever
// the row itself renders at all (offerableGenerationKinds does not vary per
// kind) - gated on that explicitly anyway so this stays correct if that ever
// changes.
//
// THE CHECKPOINTS CHECKBOX (step-10 fixer round, frozen contract) follows the
// exact same per-kind-picker precedent as the two controls above: a plain
// inline checkbox, shown only when "introDiscussion" is among the offerable
// kinds, no new dialog. Canvas's createDiscussionTopic mutation is NOT
// transactional on a flag-off account (it persists the orphan parent
// assignment, THEN raises), so this defaults to OFF and is explicit opt-in -
// its tooltip says plainly what enabling it requires and what leaving it off
// does.
//
// WAVE 2 (docs/bulk-bar-reorganization-acceptance-criteria.md, section 3b/D1,
// D5): this section now owns exactly one of the bar's thirteen catalog
// groups, "generate", and wraps its own content in <BulkBarGroup> rather than
// the old bare `.bulkRow` + `.bulkLabel` pair - BulkBarGroup's own heading
// renders `group.label` ("Generate"), so the `.bulkLabel` span is removed
// (AC2/D0: keeping both would be redundant chrome). "generate" is
// "reversible-write" tier (every kind button calls a model, spends quota, and
// writes a new generated_artifacts version - see ./bulkBarGroupCatalog.ts's
// own header for why that is a real write, distinct from "read-only") and is
// therefore one of only four groups in the whole bar that may collapse, but
// is STRUCTURALLY BARRED from defaulting closed - `auditGroupModel`'s I3
// invariant (./bulkBarGroups.ts) enforces `defaultOpen: true` on the shipped
// "generate" group precisely so nobody "tidies" it closed later; this file
// has no opinion of its own to reassert.
//
// HARD RULE (D3): the body below is NEVER gated on `open`. A native
// `<details>` hides its content without unmounting it, so `<BulkBarGroup>`
// always renders `children` - only the native `open` attribute (mirrored from
// `groupOpen`'s result) controls visibility. This section owns THREE
// persisted controls (the deck template select, the video length select, the
// checkpoints checkbox), so a `{open && ...}` guard here would be the exact
// regression D3 warns about: a control that never mounts never writes its
// persisted default.
import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import styles from "../../../page.module.css";
import { BulkBarGroup } from "./BulkBarGroup";
import { groupById, type BulkBarFacts, type BulkBarGroupRuntime } from "./bulkBarGroups";
import type { BulkBarGroupsApi } from "./useBulkBarGroups";
import type { DeckTemplateOption, GenerationBusy, GenerationKindDef, GenerationKindId } from "./useLmsGeneration";

export interface GenerateFromSelectionSectionProps {
  /** The bar's shared fact bag (./bulkBarGroups.ts) - ONE object, built once
   * by ModulesView and threaded to every section unchanged, so this group's
   * collapse/tier decision can never drift from what the rest of the bar
   * sees for the same selection. Only ever read through the pure functions
   * `<BulkBarGroup>` itself calls - this file does not branch on any field
   * directly. */
  facts: BulkBarFacts;
  /** The bar's one shared open/closed persistence API (useBulkBarGroups.ts),
   * owned by ModulesView (called exactly once there) and passed down
   * unchanged - never constructed here (D3: a second instance would corrupt
   * the persisted map). */
  groupsState: BulkBarGroupsApi;
  busy: GenerationBusy;
  /** Job 3 (visible-in-the-row error, docs/REGRESSION.md - the intro-video-
   * script bug report fix): useLmsGeneration's own `generationError` -
   * rendered ALWAYS VISIBLE (never a `title`) in a `role="status"
   * aria-live="polite"` region below the kind buttons, mirroring
   * VisualizerCoverageSection.tsx's own three-signal precedent for a control
   * inside this same sticky header. */
  generationError: string | null;
  /** Job 4 (downloadable diagnostic log) - useLmsGeneration's own
   * `hasDiagLog`/`downloadDiagLog`. */
  hasDiagLog: boolean;
  onDownloadDiagLog: () => void;
  kinds: readonly GenerationKindDef[];
  /** Opens GeneratedPreviewModal. Takes the triggering button so ModulesView
   * can capture it synchronously for focus restoration
   * (docs/modal-focus-restoration-acceptance-criteria.md, wave R2) - the
   * actual `setPreview` call happens inside useLmsGeneration's `generate`,
   * asynchronously, so the capture has to happen here, before that call,
   * never after (decision 3). Every kind button below funnels into the same
   * dialog, so they all share one ref (decision 4). */
  onGenerate: (kindId: GenerationKindId, trigger: HTMLElement) => void;
  /** Decks only - the template picker's options and selection. Every other
   * kind ignores these (see this file's own header comment). */
  templates: readonly DeckTemplateOption[];
  templateId: string;
  onTemplateChange: (id: string) => void;
  /** Scripts only - the intro video length picker's offered options, in
   * minutes. Every other kind ignores this (see this file's own header
   * comment). */
  scriptLengthOptions: readonly number[];
  /** Scripts only - the intro video length picker's current selection, in
   * minutes. Every other kind ignores this. */
  scriptMinutes: number;
  /** Scripts only - fires when the intro video length picker's selection
   * changes. Every other kind ignores this. */
  onScriptMinutesChange: (minutes: number) => void;
  /** introDiscussion only - the "Use Canvas discussion checkpoints"
   * checkbox's current value. Every other kind ignores this. */
  useDiscussionCheckpoints: boolean;
  /** introDiscussion only - fires when the checkpoints checkbox changes.
   * Every other kind ignores this. */
  onUseDiscussionCheckpointsChange: (checked: boolean) => void;
}

export function GenerateFromSelectionSection({
  facts,
  groupsState,
  busy,
  generationError,
  hasDiagLog,
  onDownloadDiagLog,
  kinds,
  onGenerate,
  templates,
  templateId,
  onTemplateChange,
  scriptLengthOptions,
  scriptMinutes,
  onScriptMinutesChange,
  useDiscussionCheckpoints,
  onUseDiscussionCheckpointsChange,
}: GenerateFromSelectionSectionProps) {
  const offersDeck = kinds.some((k) => k.id === "decks");
  const offersScript = kinds.some((k) => k.id === "scripts");
  const offersIntroDiscussion = kinds.some((k) => k.id === "introDiscussion");
  const selectedTemplateName = templates.find((t) => t.id === templateId)?.name ?? "the selected";

  // `kinds` is empty only when NEITHER an item nor a whole module is
  // selected (offerableGenerationKinds, useLmsGeneration.ts - a module-only
  // selection DOES offer every kind, expanded server-side into their items),
  // so the row is hidden rather than shown with every button disabled. The
  // preview modal this row opens is a separate component rendered at
  // ModulesView's root (GeneratedPreviewModal.tsx), gated only on `preview`,
  // so it is unaffected by this guard and stays open across a selection
  // change.
  if (kinds.length === 0) return null;

  // No confirm-arm concept exists for this group (its tier never reaches
  // destructive), but a live `generationError` IS this group's own
  // unavailable-reason equivalent, mirroring DownloadSelectionSection.tsx's
  // own imsccUnavailableReason/zipUnavailableReason precedent
  // (hasUnavailableReason: imsccUnavailableReason !== null || ...). Step-10
  // finding 3 (fixer round): this used to hardcode `hasUnavailableReason:
  // false`, which left `busy` as the ONLY force-open signal - and `busy`
  // returns to "" in the SAME update that sets `generationError` (see
  // useLmsGeneration's `generate`), so a failed generation behind a
  // previously-collapsed group was hidden the instant the request finished.
  // Commit f20f470 exists specifically because a failing generation showed
  // the user nothing; wiring `hasUnavailableReason` to `generationError`
  // keeps the group forced open for as long as the error banner below is
  // visible, regardless of `busy`.
  const runtime: BulkBarGroupRuntime = {
    busy: busy !== "",
    armed: false,
    hasUnavailableReason: generationError !== null,
  };

  return (
    <BulkBarGroup group={groupById("generate")} facts={facts} runtime={runtime} state={groupsState}>
      <div className={styles.bulkRow}>
        {offersDeck && (
          <TextField
            select
            size="small"
            label="Deck template"
            value={templateId}
            onChange={(e) => onTemplateChange(e.target.value)}
            disabled={busy !== ""}
            sx={{ minWidth: 200 }}
          >
            {templates.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        {offersScript && (
          <TextField
            select
            size="small"
            label="Video length"
            value={scriptMinutes}
            onChange={(e) => onScriptMinutesChange(Number(e.target.value))}
            disabled={busy !== ""}
            sx={{ minWidth: 160 }}
          >
            {scriptLengthOptions.map((minutes) => (
              <MenuItem key={minutes} value={minutes}>
                {minutes} {minutes === 1 ? "minute" : "minutes"}
              </MenuItem>
            ))}
          </TextField>
        )}
        {offersIntroDiscussion && (
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={useDiscussionCheckpoints}
                onChange={(e) => onUseDiscussionCheckpointsChange(e.target.checked)}
                disabled={busy !== ""}
              />
            }
            label="Use Canvas discussion checkpoints"
            title="Requires a Canvas admin to have enabled the Discussion Checkpoints feature for this account. Leaving this off creates a normal graded discussion with one due date."
          />
        )}
        {kinds.map((k) => (
          <Button
            key={k.id}
            variant="outlined"
            size="small"
            disabled={busy !== ""}
            onClick={(e) => onGenerate(k.id, e.currentTarget)}
            title={
              k.id === "decks"
                ? `Generate a slide deck from the selected content using the "${selectedTemplateName}" template - saved to this course's generated content, never written to Canvas`
                : `Generate ${k.label.toLowerCase()} from the selected content - saved to this course's generated content, never written to Canvas`
            }
          >
            {busy === k.id ? "Generating…" : k.label}
          </Button>
        ))}
        {hasDiagLog && (
          <Button
            variant="text"
            size="small"
            onClick={onDownloadDiagLog}
            disabled={busy !== ""}
            title="Download a diagnostic log of the most recent generation attempt - course/selection facts, the computed token budget, and the model's outcome. Contains no API keys, tokens, or the generated text itself."
          >
            Download diagnostic log
          </Button>
        )}
        {/* Job 3: colocated with the buttons above, inside this row (which
            itself lives in ModulesView's sticky header) - ALWAYS VISIBLE text,
            never only a `title`, and aria-live so a screen-reader user hears a
            failure too, not only a sighted user scrolled to this exact row.
            Mirrors VisualizerCoverageSection.tsx's own identical banner and its
            header comment's reasoning for why `setNote` alone (ContentTab.tsx,
            outside this sticky header) is not enough. */}
        {generationError && (
          <span role="status" aria-live="polite" className={styles.bulkError}>
            {generationError}
          </span>
        )}
        <span className={styles.bulkHint}>
          Creates a new text version from the selected items and/or modules and saves it to this course&apos;s
          generated content. Generating never writes to Canvas by itself - some kinds can be posted afterward as a
          separate, explicit step.
        </span>
      </div>
    </BulkBarGroup>
  );
}
