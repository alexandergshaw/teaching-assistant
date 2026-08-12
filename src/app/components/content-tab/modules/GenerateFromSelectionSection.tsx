"use client";

// Bulk bar section shown when a selection exists: "Generate from selection"
// (chunk 1 shipped anticipated Q&A and current events, both pure text;
// chunk 3a adds a third kind, "decks" - still neither kind writes to
// Canvas). Its own clearly-labelled group, matching the
// bulkRow/bulkField/bulkHint visual language BulkItemsSection/
// BulkModulesSection already use, rather than folding into any of
// ModulesHeaderBar's existing groups (that bar already has five).
//
// CHUNK 3b ADDS POSTING (docs/lms-module-content-generation-acceptance-
// criteria.md, P1/P5/P6/X2) - a "Post to Canvas" control at the bottom of
// THIS SAME preview modal, gated on `offersPost` (true only for the four
// "save-and-post" kinds: objectives, assignments, knowledgeChecks,
// announcements - kinds.ts). No new modal (P1: "the review surface built in
// chunk 3c is the review step"), no new CSS (X2): the module-target select,
// its "new module" name field, and the Post button all reuse the same
// TextField/Button/MenuItem MUI idiom and inline-styled footer-row layout
// the "Ask for changes" block just above it already uses.
//
// Kind choice is one button per kind (not a button + select): there are only
// three kinds, so a select would cost a click without saving space, and this
// exactly matches the proven one-click precedent already on this bar -
// useLmsSyllabusButtons.ts's "Syllabus quiz" / "Generate syllabus" pair in
// ModulesHeaderBar - down to each button's own label doubling as its
// progress word while it runs.
//
// THE DECK TEMPLATE PICKER IS THE ONE EXCEPTION - a plain inline select next
// to the kind buttons, not a dialog (SCOPE: "surface it in the Generate
// group without adding a dialog, the same way the existing kinds avoid
// one"). "Specified template" means the EXISTING deck_templates (a JSON
// slide-role recipe plus five theme colours) - that decision is already
// settled with the instructor; see useLmsGeneration.ts's own header comment.
// Shown only once "decks" is among the offerable kinds, which today is
// exactly whenever the row itself renders at all (offerableGenerationKinds
// does not vary per kind) - gated on that explicitly anyway so this stays
// correct if that ever changes.
//
// Preview + refine deliberately does NOT reuse DocumentPreviewModal
// (src/app/components/DocumentPreviewModal.tsx, read in full before this was
// written): its "regenerate" step is hard-wired to reviseDocumentAction, a
// generic, ungrounded text revision with no prop to substitute the
// selection-grounded refine action this feature needs, and it has no slot
// for a version history list - it tracks exactly one draft vs. one original,
// never N reachable versions. The AC's "earlier versions still reachable"
// requirement needs both. Visual consistency is kept anyway by reusing
// DocumentPreviewModal's OWN CSS classes (previewBackdrop/previewModal/
// previewHeader/previewMeta/previewCloseButton/previewContent from
// page.module.css) rather than inventing new ones, so this reads as the same
// document-preview surface as every other generated document in the app,
// with zero new CSS. Because previewModal already resets
// `--focus-ring-color` back to the theme-aware default (see
// docs/REGRESSION.md #257 check 4), and this section's own bulkRow sits
// outside .bulkBarHead's navy scope, nothing here needs a focus-ring
// override of its own.
//
// `preview.versions` is the REAL stored history for this course+kind
// (useLmsGeneration.ts's generate()/refine() both re-fetch it via
// listGeneratedArtifactVersionsAction right after a successful save - see
// that hook's own header comment), so the version picker below can show a
// version from an earlier session, not only what this hook produced since
// the page loaded.
//
// CHUNK 3c ADDS A DOWNLOAD CONTROL to this same modal - see
// docs/generated-artifact-download-acceptance-criteria.md. It lives in the
// HEADER ROW, in a small wrapper next to the existing "Close" button (not in
// the footer next to "Regenerate"): the footer's row is specifically about
// asking for changes to produce a NEW version, and mixing an unrelated
// download affordance into it would blur that; the header is already "here
// is the version on screen, here is what you can do with it, here is how to
// leave", which a download control fits directly. `previewHeader` lays out
// exactly two flex children (space-between) - the title/meta block and,
// previously, the lone Close button - so the download buttons and Close are
// grouped into one small inline-styled wrapper div (no new CSS class, same
// as the already-inline-styled rows in the footer below) to keep that
// two-child layout intact.
//
// One small outlined Button per offered format (never a select): there are
// at most three formats (artifactDownloadFormats, ./artifact-download), so
// this mirrors the same "one button per option, label doubles as its own
// progress word" idiom the kind buttons above already use, rather than
// costing an extra click through a TextField select for a two-or-three-way
// choice. Always operates on `preview.selectedVersion` (AC 1) - whichever
// version the instructor currently has on screen, via useLmsGeneration's own
// `downloadFormats`/`download`, which look that version up the same way
// `currentText` below does.
//
// WHY THE POWERPOINT BUTTON READS `structured`, NOT THE TEXT ON SCREEN: the
// text shown in `.previewContent` (and downloaded as `.md`/`.docx`) is a
// deck's LOSSY `# / ## / -` projection - it drops `notes`, `code`,
// `codeLanguage` and `graphic`. Those four fields survive only in the
// artifact's `structured` column, which is exactly why that column exists -
// see docs/REGRESSION.md entry 266 check 2 ("THIS IS THE KIND `structured`
// EXISTS FOR, AND THE LOSS IS MEASURED"). buildArtifactDownloadBlob
// (./artifact-download) reads `structured` for the `.pptx` path so the
// downloaded deck is never missing what the instructor can already see is
// there (speaker notes, code samples, graphics) just because the on-screen
// preview happens to render the lossy projection. `artifactDownloadFormats`
// gates the button's very existence on `structured` actually parsing into at
// least one usable slide - never on the kind id - so a deck saved before
// `structured` existed cannot offer a button that would build an empty file.

import { Button, MenuItem, TextField } from "@mui/material";
import styles from "../../../page.module.css";
import type {
  ArtifactDownloadFormat,
  DeckTemplateOption,
  GenerationBusy,
  GenerationKindDef,
  GenerationKindId,
  GenerationPreviewState,
  PostModuleOption,
} from "./useLmsGeneration";
import { NEW_MODULE_TARGET_VALUE, previewMetaText, resolvePostModuleTarget, versionOptionLabel } from "./useLmsGeneration";
import { artifactDownloadFormatLabel } from "@/lib/lms-generation/artifact-download";

export interface GenerateFromSelectionSectionProps {
  busy: GenerationBusy;
  kinds: readonly GenerationKindDef[];
  onGenerate: (kindId: GenerationKindId) => void;
  /** Decks only - the template picker's options and selection. Every other
   * kind ignores these (see this file's own header comment). */
  templates: readonly DeckTemplateOption[];
  templateId: string;
  onTemplateChange: (id: string) => void;
  preview: GenerationPreviewState | null;
  onClosePreview: () => void;
  onSelectVersion: (version: number) => void;
  instructions: string;
  onInstructionsChange: (v: string) => void;
  onRefine: () => void;
  refining: boolean;
  /** Download control (chunk 3c) - see this file's own header comment.
   * WIRED: ModulesView.tsx passes these from useLmsGeneration's
   * `downloadFormats`/`downloading`/`download`, so the control is live in
   * the product - it did not ship switched off (the failure mode
   * docs/REGRESSION.md entry 211 records).
   *
   * Still OPTIONAL, defaulted to "nothing offered", because ModulesView.tsx
   * passes every prop by name rather than spreading the hook's return value:
   * a future second call site that forgets these degrades to a modal with no
   * download buttons rather than failing to compile, which is the safer
   * direction for a purely additive, read-only affordance. */
  downloadFormats?: readonly ArtifactDownloadFormat[];
  downloading?: ArtifactDownloadFormat | null;
  onDownload?: (format: ArtifactDownloadFormat) => void;
  /** "Post to Canvas" (chunk 3b, P1/P5) - shown ONLY when `offersPost` is
   * true, i.e. only for the four "save-and-post" kinds (kinds.ts); the three
   * original kinds render nothing new here. Optional/defaulted the same way
   * the download props above are (see their own doc comment) - a future
   * second call site that forgets these degrades to a modal with no posting
   * control rather than failing to compile. */
  offersPost?: boolean;
  /** False for a "course-level" kind (announcements) - no module-target
   * picker is rendered at all for it, since a Canvas announcement has no
   * module to choose (kindNeedsModuleTarget's own doc comment,
   * useLmsGeneration.ts). Meaningless while `offersPost` is false. */
  postNeedsModuleTarget?: boolean;
  postModuleOptions?: readonly PostModuleOption[];
  postModuleChoice?: string;
  onPostModuleChoiceChange?: (v: string) => void;
  postNewModuleName?: string;
  onPostNewModuleNameChange?: (v: string) => void;
  onPost?: () => void;
  posting?: boolean;
}

export function GenerateFromSelectionSection({
  busy,
  kinds,
  onGenerate,
  templates,
  templateId,
  onTemplateChange,
  preview,
  onClosePreview,
  onSelectVersion,
  instructions,
  onInstructionsChange,
  onRefine,
  refining,
  downloadFormats = [],
  downloading = null,
  onDownload,
  offersPost = false,
  postNeedsModuleTarget = false,
  postModuleOptions = [],
  postModuleChoice = "",
  onPostModuleChoiceChange,
  postNewModuleName = "",
  onPostNewModuleNameChange,
  onPost,
  posting = false,
}: GenerateFromSelectionSectionProps) {
  const currentText = preview?.versions.find((v) => v.version === preview.selectedVersion)?.text ?? "";
  const offersDeck = kinds.some((k) => k.id === "decks");
  const selectedTemplateName = templates.find((t) => t.id === templateId)?.name ?? "the selected";
  // Disabled the same way the download buttons already are (busy or a
  // download in flight), PLUS this control's own validation - a blank/
  // unresolved module target (resolvePostModuleTarget, useLmsGeneration.ts)
  // disables the button rather than letting a click surface an error note
  // for something the instructor could see was incomplete right on screen.
  // A "course-level" kind (postNeedsModuleTarget false - announcements
  // today) needs no target at all, so it is always considered resolved.
  const postControlsDisabled = busy !== "" || downloading !== null;
  const postTargetResolved = !postNeedsModuleTarget || resolvePostModuleTarget(postModuleChoice, postNewModuleName).ok;

  // `kinds` is empty only when NEITHER an item nor a whole module is
  // selected (offerableGenerationKinds, useLmsGeneration.ts - a module-only
  // selection DOES offer every kind, expanded server-side into their items),
  // so the row is hidden rather than shown with every button disabled. A
  // modal already open stays open even if the selection changes out from
  // under it, so the instructor's current work is never yanked away.
  if (kinds.length === 0 && !preview) return null;

  return (
    <>
      {kinds.length > 0 && (
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
          {kinds.map((k) => (
            <Button
              key={k.id}
              variant="outlined"
              size="small"
              disabled={busy !== ""}
              onClick={() => onGenerate(k.id)}
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
      )}

      {preview && (
        <div className={styles.previewBackdrop} onClick={onClosePreview}>
          <section
            className={styles.previewModal}
            role="dialog"
            aria-modal="true"
            aria-label={`Preview of ${preview.kindLabel}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.previewHeader}>
              <div>
                <h3>{preview.kindLabel}</h3>
                <p className={styles.previewMeta}>{previewMetaText(preview.kindId, preview.selectedVersion)}</p>
              </div>
              {/* Download control (chunk 3c) grouped with Close so
                  previewHeader's own space-between layout still sees exactly
                  two children - see this file's own header comment for why
                  this lives here rather than in the footer. */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {downloadFormats.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    {downloadFormats.map((format) => {
                      const label = artifactDownloadFormatLabel(format);
                      return (
                        <Button
                          key={format}
                          variant="outlined"
                          size="small"
                          disabled={busy !== "" || downloading !== null}
                          onClick={() => onDownload?.(format)}
                          title={`Download this version as ${label}`}
                          aria-label={`Download this version as ${label}`}
                        >
                          {downloading === format ? "Preparing…" : format.toUpperCase()}
                        </Button>
                      );
                    })}
                  </div>
                )}
                <button type="button" className={styles.previewCloseButton} onClick={onClosePreview}>
                  Close
                </button>
              </div>
            </div>

            {preview.versions.length > 1 && (
              <TextField
                select
                size="small"
                value={preview.selectedVersion}
                onChange={(e) => onSelectVersion(Number(e.target.value))}
                aria-label="Version to view"
                sx={{ maxWidth: 280 }}
              >
                {preview.versions.map((v) => (
                  <MenuItem key={v.version} value={v.version}>
                    {versionOptionLabel(v)}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {preview.notes.length > 0 && (
              <p className={styles.previewNotice}>
                Grounded with {preview.notes.length} note{preview.notes.length === 1 ? "" : "s"}: {preview.notes.join("; ")}
              </p>
            )}

            <div className={styles.previewContent}>
              {currentText.trim() === "" ? (
                <p className={styles.previewMeta}>This version has no text.</p>
              ) : (
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: "0.9rem" }}>
                  {currentText}
                </pre>
              )}
            </div>

            <div style={{ paddingTop: "0.75rem", borderTop: "1px solid var(--field-border)" }}>
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                label="Ask for changes"
                placeholder="e.g. focus more on chapter 3, make the tone more encouraging, add two more questions"
                value={instructions}
                onChange={(e) => onInstructionsChange(e.target.value)}
                disabled={busy !== ""}
              />
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem" }}>
                <Button
                  size="small"
                  variant="contained"
                  disabled={busy !== "" || instructions.trim() === ""}
                  onClick={onRefine}
                >
                  {refining ? "Regenerating…" : "Regenerate with these instructions"}
                </Button>
                <span className={styles.previewMeta}>
                  Creates a new version - every saved version for this course stays reachable above.
                </span>
              </div>
            </div>

            {/* "Post to Canvas" (chunk 3b, P1/P5) - the review-then-commit
                step for the version on screen. Shown ONLY for a
                "save-and-post" kind (offersPost) - every other kind renders
                nothing here, per this file's own header comment on why no
                new modal or CSS was needed for this. Reuses the same footer
                idiom (inline-styled divider + row) the "Ask for changes"
                block just above already uses. */}
            {offersPost && (
              <div style={{ paddingTop: "0.75rem", borderTop: "1px solid var(--field-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  {/* No module picker at all for a "course-level" kind
                      (announcements) - it has no module to choose
                      (postNeedsModuleTarget's own doc comment,
                      useLmsGeneration.ts). */}
                  {postNeedsModuleTarget && (
                    <>
                      <TextField
                        select
                        size="small"
                        label="Post into module"
                        value={postModuleChoice}
                        onChange={(e) => onPostModuleChoiceChange?.(e.target.value)}
                        disabled={postControlsDisabled}
                        sx={{ minWidth: 200 }}
                      >
                        {postModuleOptions.map((m) => (
                          <MenuItem key={m.id} value={String(m.id)}>
                            {m.name}
                          </MenuItem>
                        ))}
                        <MenuItem value={NEW_MODULE_TARGET_VALUE}>New module…</MenuItem>
                      </TextField>
                      {postModuleChoice === NEW_MODULE_TARGET_VALUE && (
                        <TextField
                          size="small"
                          label="New module name"
                          value={postNewModuleName}
                          onChange={(e) => onPostNewModuleNameChange?.(e.target.value)}
                          disabled={postControlsDisabled}
                        />
                      )}
                    </>
                  )}
                  <Button
                    size="small"
                    variant="contained"
                    disabled={postControlsDisabled || !postTargetResolved}
                    onClick={onPost}
                  >
                    {posting ? "Posting…" : "Post to Canvas"}
                  </Button>
                  <span className={styles.previewMeta}>
                    {postNeedsModuleTarget
                      ? "Creates (or reuses) this version in Canvas, in the module you choose above."
                      : "Posts this version to Canvas as a course announcement."}
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
