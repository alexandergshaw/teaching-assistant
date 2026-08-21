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

import { Button, MenuItem, TextField } from "@mui/material";
import styles from "../../../page.module.css";
import type { DeckTemplateOption, GenerationBusy, GenerationKindDef, GenerationKindId } from "./useLmsGeneration";

export interface GenerateFromSelectionSectionProps {
  busy: GenerationBusy;
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
}

export function GenerateFromSelectionSection({
  busy,
  kinds,
  onGenerate,
  templates,
  templateId,
  onTemplateChange,
  scriptLengthOptions,
  scriptMinutes,
  onScriptMinutesChange,
}: GenerateFromSelectionSectionProps) {
  const offersDeck = kinds.some((k) => k.id === "decks");
  const offersScript = kinds.some((k) => k.id === "scripts");
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

  return (
    <div className={styles.bulkRow}>
      <span className={styles.bulkLabel}>Generate</span>
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
      <span className={styles.bulkHint}>
        Creates a new text version from the selected items and/or modules and saves it to this course&apos;s
        generated content. Generating never writes to Canvas by itself - some kinds can be posted afterward as a
        separate, explicit step.
      </span>
    </div>
  );
}
