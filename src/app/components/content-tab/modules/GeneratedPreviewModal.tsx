"use client";

// The generated-content preview modal for the LMS "Generate" bulk action.
// This renders at ModulesView's root (a sibling of the other root-level
// modals), NOT inside the bulk bar that opens it (GenerateFromSelectionSection,
// which stays inside ModulesView's `<div className={styles.ccStickyHeader}>`).
// That header is `position: sticky; z-index: 30; backdrop-filter: blur(10px)`,
// and each of those two properties independently makes it a stacking context
// AND the containing block for `position: fixed` descendants. A descendant is
// therefore capped at the header's own z-index no matter what it declares
// itself, and a `position: fixed; inset: 0` descendant sizes to the header's
// box instead of the viewport. Rendering this component at a view root, clear
// of that trap, is what lets `.previewBackdrop`'s `z-index: 10000` and
// `inset: 0` mean what they say - see
// docs/lms-preview-modal-stacking-acceptance-criteria.md.
//
// CHUNK 3b ADDS POSTING (docs/lms-module-content-generation-acceptance-
// criteria.md, P1/P5/P6/X2) - a "Post to Canvas" control at the bottom of
// this modal, gated on `offersPost` (true only for the four "save-and-post"
// kinds: objectives, assignments, knowledgeChecks, announcements - kinds.ts).
// No new modal (P1: "the review surface built in chunk 3c is the review
// step"), no new CSS (X2): the module-target select, its "new module" name
// field, and the Post button all reuse the same TextField/Button/MenuItem MUI
// idiom and inline-styled footer-row layout the "Ask for changes" block just
// above it already uses.
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
// docs/REGRESSION.md #257 check 4), nothing here needs a focus-ring override
// of its own.
//
// `preview.versions` is the REAL stored history for this course+kind
// (useLmsGeneration.ts's generate()/refine() both re-fetch it via
// listGeneratedArtifactVersionsAction right after a successful save - see
// that hook's own header comment), so the version picker below can show a
// version from an earlier session, not only what this hook produced since
// the page loaded.
//
// CHUNK 3c ADDS A DOWNLOAD CONTROL to this modal - see
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
// progress word" idiom the kind buttons in GenerateFromSelectionSection
// already use, rather than costing an extra click through a TextField select
// for a two-or-three-way choice. Always operates on `preview.selectedVersion`
// (AC 1) - whichever version the instructor currently has on screen, via
// useLmsGeneration's own `downloadFormats`/`download`, which look that
// version up the same way `currentText` below does.
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
import type { ArtifactDownloadFormat, GenerationBusy, GenerationPreviewState, PostModuleOption } from "./useLmsGeneration";
import { NEW_MODULE_TARGET_VALUE, previewMetaText, resolvePostModuleTarget, versionOptionLabel } from "./useLmsGeneration";
import { artifactDownloadFormatLabel } from "@/lib/lms-generation/artifact-download";

export interface GeneratedPreviewModalProps {
  busy: GenerationBusy;
  preview: GenerationPreviewState;
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

export function GeneratedPreviewModal({
  busy,
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
}: GeneratedPreviewModalProps) {
  const currentText = preview.versions.find((v) => v.version === preview.selectedVersion)?.text ?? "";
  // Disabled the same way the download buttons already are (busy or a
  // download in flight), PLUS this control's own validation - a blank/
  // unresolved module target (resolvePostModuleTarget, useLmsGeneration.ts)
  // disables the button rather than letting a click surface an error note
  // for something the instructor could see was incomplete right on screen.
  // A "course-level" kind (postNeedsModuleTarget false - announcements
  // today) needs no target at all, so it is always considered resolved.
  const postControlsDisabled = busy !== "" || downloading !== null;
  const postTargetResolved = !postNeedsModuleTarget || resolvePostModuleTarget(postModuleChoice, postNewModuleName).ok;

  return (
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
  );
}
