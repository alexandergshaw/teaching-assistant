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

import { useState, type RefObject } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import styles from "../../../page.module.css";
import type { ArtifactDownloadFormat, GenerationBusy, GenerationPreviewState, PostModuleOption } from "./useLmsGeneration";
import { NEW_MODULE_TARGET_VALUE, previewMetaText, resolvePostModuleTarget, versionOptionLabel } from "./useLmsGeneration";
import { artifactDownloadFormatLabel } from "@/lib/lms-generation/artifact-download";
// previewHeaderTitle is pulled directly from its own module rather than
// through the useLmsGeneration barrel - it is a defect-fix addition scoped
// to this file's own header rendering (see this file's DEFECT FIX comment
// below), and useLmsGeneration.ts's re-export list is out of this fix's
// file set. artifactDownloadFormatLabel and kindDeliveredAloud above are
// already reached the same direct way, so this is not a new import shape.
import { previewHeaderTitle } from "./lmsGenerationNotes";
import { ModalShell } from "../../ui/ModalShell";
// T1 (docs/teleprompter-mode-acceptance-criteria.md): the teleprompter entry
// point is gated on `kindDeliveredAloud`, the same declarative-flag pattern
// `kindOffersPost` already reads `commitMode` through - NEVER a hardcoded
// `preview.kindId === "scripts"` comparison at this call site, so a future
// spoken kind opts in purely by declaring `deliveredAloud: true` on its own
// kinds.ts config, with no edit here.
import { kindDeliveredAloud } from "@/lib/lms-generation/kinds";
import { TeleprompterPanel } from "./TeleprompterPanel";

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
  /** AC3/AC4 (defect fix, docs/REGRESSION.md - the "generate from an export
   * selection" defect): why posting is unavailable right now, or null/
   * undefined when it can be posted - useLmsGeneration.ts's own
   * `postUnavailableReasonFor` (contentSourceGating.ts's "courseWrite"
   * wording, reused verbatim). When `offersPost` is true AND this is set,
   * the module-target picker and Post button are replaced with this reason
   * rather than left clickable-and-failing - the same "visibly unavailable,
   * never enabled and broken" posture every other gated control in this tab
   * already uses (contentSourceGating.ts's own header comment). */
  postUnavailableReason?: string | null;
  /** E1/E8 (chunk 3e, docs/generated-artifact-editing-acceptance-criteria.md):
   * whether the previewed kind's saved text IS the whole artifact, so
   * hand-editing it produces a complete, self-consistent version
   * (kindSupportsTextEdit, kinds.ts's own gate - "no `renderStructured`").
   * False for "decks" and "knowledgeChecks", whose `structured` payload is
   * what a download or a Canvas post actually reads (see this file's own
   * header comment on why the PowerPoint button reads `structured` rather
   * than the on-screen text) - hand-edited text for those kinds would
   * produce a version whose two halves disagree. Optional/defaulted to
   * `false` the same way every other add-on capability in this file already
   * is (see `offersPost`'s own doc comment) - a future second call site that
   * forgets it degrades to "no edit control shown" rather than failing to
   * compile. */
  canEditText?: boolean;
  /** Persist the modal's OWN local draft as a new version (E2/E3) - wired to
   * useLmsGeneration's `saveEdit`. Called with the draft text only; never
   * read back from `preview` here, because the whole point of an edit is
   * that the caller's text may already differ from what is stored. Absent
   * or a no-op whenever `canEditText` is false. */
  onSaveEdit?: (text: string) => void;
  /** Whether a save triggered by `onSaveEdit` is in flight - drives the Save
   * button's own progress label ("Saving...") distinctly from `busy` alone,
   * the same split `refining`/`posting` already use for their own buttons. */
  savingEdit?: boolean;
  /** Opener to restore focus to on close, captured by the caller at click
   * time - forwarded to ModalShell (see its own props for the full rules). */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Fallback candidates tried after restoreFocusRef - see ModalShell. */
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
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
  postUnavailableReason = null,
  canEditText = false,
  onSaveEdit,
  savingEdit = false,
  restoreFocusRef,
  fallbackFocusRefs,
}: GeneratedPreviewModalProps) {
  // Single lookup for both the on-screen text AND the header title below -
  // `currentText` already needed this find; DEFECT FIX reuses the same
  // result rather than a second `.find` for the title.
  const selectedArtifact = preview.versions.find((v) => v.version === preview.selectedVersion);
  const currentText = selectedArtifact?.text ?? "";
  // DEFECT FIX: prefer the SAVED artifact's own title over the live kind
  // label (previewHeaderTitle, ./lmsGenerationNotes - mirrors
  // artifactDownloadFilename's precedent) so a version saved under a
  // since-re-geared kind meaning (e.g. "scripts": "Lecture script" ->
  // "Intro video script", artifactKind deliberately left as
  // "lecture-script" so old versions stay reachable) keeps showing the name
  // it was actually generated under. Falls back to `preview.kindLabel` -
  // the ONLY thing on hand before the versions list has loaded a match, and
  // still correct for kinds that never save a title at all.
  const headerTitle = selectedArtifact ? previewHeaderTitle(selectedArtifact, preview.kindLabel) : preview.kindLabel;

  // E9 - THE EDIT BASELINE MOVES UNDER THIS MODAL: `currentText` above is
  // derived fresh every render from `preview`, and it moves both when the
  // version picker calls `onSelectVersion` and when a refine/save replaces
  // the whole `preview` object. `draft` is this component's first-ever local
  // state (it used to be a pure prop-driven function - see this file's
  // header comment); it starts seeded to `currentText`, and needs reseeding -
  // clearing any armed discard panel along with it - on every LATER change
  // too. A naive `useState(currentText)` initializer alone would go stale
  // the moment `currentText` moved out from under it: DocumentPreviewModal
  // gets away with a plain initializer only because its source text never
  // changes under it (its own header comment) - this modal's does, twice
  // over. A stale draft saved as a "new version" would silently attach the
  // PREVIOUS version's edit to whatever the instructor had just switched to
  // look at - the worst failure available here, and the one a naive
  // initializer produces.
  //
  // Reseeded during RENDER, not from a `useEffect` keyed on `currentText`:
  // this repo's own lint rule (react-hooks/set-state-in-effect) refuses a
  // setState called synchronously from an effect body, and - independent of
  // the lint rule - an effect-based reseed would still leave one render
  // where `draft` is stale against the NEW `currentText` before the effect
  // fires. Comparing `currentText` to `seededText` (React's own documented
  // "adjust state when a prop changes" pattern - a setState call during
  // render is re-rendered immediately, before anything commits or paints,
  // so there is no stale frame at all) makes the reseed atomic with the
  // change that caused it.
  const [draft, setDraft] = useState(currentText);
  const [seededText, setSeededText] = useState(currentText);
  const [editing, setEditing] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  // Which version the armed discard panel would switch to on confirmation;
  // null means the deferred action is closing the modal. See
  // handleSelectVersion below for why version-switching needs the guard too.
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);

  // T1/T3 (docs/teleprompter-mode-acceptance-criteria.md): teleprompter mode
  // is offered only for a kind meant to be spoken aloud, and entering/leaving
  // it is explicit and always reversible - this is the ONE new piece of
  // local state that decision needs. Never reset by the E9 reseed above: a
  // version switch or a refine landing while rehearsing should not silently
  // kick the instructor out of teleprompter mode.
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const offersTeleprompter = kindDeliveredAloud(preview.kindId);

  if (currentText !== seededText) {
    setSeededText(currentText);
    setDraft(currentText);
    setDiscardConfirm(false);
    setPendingVersion(null);
  }

  const dirty = canEditText && draft !== currentText;
  // E8: both the editor and the read-only view render the DRAFT (never
  // `currentText` directly) once editing is offered, so toggling the
  // Edit/Preview control never appears to discard an unsaved edit. A kind
  // that cannot be edited (`canEditText` false) keeps showing `currentText`
  // exactly as before (X3) - `draft` stays seeded to it by the effect above
  // and is never diverged, since no editor is ever rendered to change it.
  const displayText = canEditText ? draft : currentText;

  // E10 - A DIRTY EDITOR CANNOT BE DISMISSED BY ACCIDENT: every dismissal
  // route - Escape and a backdrop click, both wired through ModalShell's own
  // `onDismiss` (its own doc comment: "NEVER the modal's actual close
  // handler... the caller's own policy runs first"), plus the header Close
  // button below - funnels through here, following CommentEditModal.tsx's
  // own `handleClose` shape exactly: ignore outright while a save is in
  // flight, arm an in-modal "Discard changes?" panel on the FIRST dismissal
  // while dirty, and close only on an explicit second confirmation. No
  // `window.confirm`.
  const handleDismiss = () => {
    // T3: while teleprompter mode is open, EVERY dismissal route this
    // handler serves - Escape (wired through ModalShell's onDismiss) and the
    // header Close button below - exits teleprompter mode instead of closing
    // the whole modal. Escape must never skip straight past teleprompter
    // mode to the modal's own dismissal guard; leaving teleprompter is
    // always the FIRST thing either route does, and closing the modal itself
    // is reachable again immediately afterward, on a second Escape/Close.
    if (teleprompterOpen) {
      setTeleprompterOpen(false);
      return;
    }
    if (savingEdit) return;
    if (dirty && !discardConfirm) {
      setPendingVersion(null);
      setDiscardConfirm(true);
      return;
    }
    setDiscardConfirm(false);
    onClosePreview();
  };

  // SWITCHING VERSION DISCARDS AN UNSAVED EDIT JUST AS SURELY AS CLOSING
  // DOES, so it funnels through the SAME guard rather than only the
  // dismissal routes. `currentText` is derived from
  // `preview.selectedVersion`, so the moment `onSelectVersion` lands, the
  // reseed above (E9) replaces `draft` - silently, with no dismissal
  // involved and therefore nothing for handleDismiss to catch. That is a
  // second work-loss path of exactly the class E10 exists to close, and it
  // is not hypothetical: an instructor comparing v2 against v1 mid-edit is
  // the ordinary way to reach it. `pendingVersion` records which version the
  // confirmation is FOR, so the one panel can resolve to either outcome -
  // null means the pending action is closing the modal.
  const handleSelectVersion = (version: number) => {
    if (savingEdit) return;
    if (version === preview.selectedVersion) return;
    if (dirty && !discardConfirm) {
      setPendingVersion(version);
      setDiscardConfirm(true);
      return;
    }
    setDiscardConfirm(false);
    setPendingVersion(null);
    onSelectVersion(version);
  };

  // The armed panel's "Discard": carry out whichever action was deferred.
  const handleConfirmDiscard = () => {
    if (pendingVersion === null) {
      onClosePreview();
      return;
    }
    const version = pendingVersion;
    setPendingVersion(null);
    setDiscardConfirm(false);
    onSelectVersion(version);
  };

  const handleSaveEdit = () => {
    onSaveEdit?.(draft);
  };

  const handleRevertEdit = () => {
    setDraft(currentText);
    setDiscardConfirm(false);
    setPendingVersion(null);
  };

  // E11: disabled whenever there is nothing TO save (not dirty, or a blank
  // draft) or while any generation, refine, download, post or save is
  // already in flight - reusing the same `busy`/`downloading` gates every
  // other control on this modal already uses, rather than inventing a
  // parallel one.
  const saveEditDisabled = busy !== "" || downloading !== null || !dirty || draft.trim() === "";

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
    <ModalShell
      label={`Preview of ${headerTitle}`}
      onDismiss={handleDismiss}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRefs={fallbackFocusRefs}
    >
        <div className={styles.previewHeader}>
          <div>
            <h3>{headerTitle}</h3>
            <p className={styles.previewMeta}>{previewMetaText(preview.kindId, preview.selectedVersion)}</p>
          </div>
          {/* Download control (chunk 3c) grouped with Close so
              previewHeader's own space-between layout still sees exactly
              two children - see this file's own header comment for why
              this lives here rather than in the footer. */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {/* T1: offered only for a kind meant to be spoken aloud, gated
                through kindDeliveredAloud - see this file's own import
                comment. Hidden once teleprompter mode is open (the header
                Close button above already exits it first, via
                handleDismiss). */}
            {offersTeleprompter && !teleprompterOpen && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => setTeleprompterOpen(true)}
                title="Rehearse this script in teleprompter mode - a preview only, nothing is recorded"
              >
                Teleprompter
              </Button>
            )}
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
            <button
              type="button"
              className={styles.previewCloseButton}
              onClick={handleDismiss}
              disabled={savingEdit}
            >
              Close
            </button>
          </div>
        </div>

        {/* E10: the in-modal discard guard, armed by handleDismiss on the
            FIRST dismissal attempt while the editor is dirty - never a
            window.confirm. "Discard" closes the modal outright (mirrors
            CommentEditModal's own discard panel, which calls `onClose`
            directly rather than routing back through its own guarded
            handler); "Keep editing" only disarms the panel. */}
        {discardConfirm && (
          <div
            style={{
              padding: "0.75rem 1rem",
              borderTop: "1px solid var(--field-border)",
              backgroundColor: "var(--warning-bg)",
            }}
          >
            <p style={{ margin: "0 0 8px 0", fontSize: "14px" }}>
              {pendingVersion === null
                ? "Discard your unsaved changes and close?"
                : `Discard your unsaved changes and switch to v${pendingVersion}?`}
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setDiscardConfirm(false);
                  setPendingVersion(null);
                }}
              >
                Keep editing
              </Button>
              <Button size="small" variant="text" onClick={handleConfirmDiscard}>
                Discard
              </Button>
            </div>
          </div>
        )}

        {/* T3: teleprompter mode REPLACES the rest of this modal's body
            (version picker, editing, refine, post-to-canvas) while it is
            open, rather than overlaying it - re-entering the normal preview
            is one click (or one Escape) away via handleDismiss above, and
            `preview`/`draft` are untouched underneath, so nothing here is
            lost by entering or leaving. */}
        {teleprompterOpen && <TeleprompterPanel script={displayText} onExit={() => setTeleprompterOpen(false)} />}

        {!teleprompterOpen && (
          <>
        {preview.versions.length > 1 && (
          <TextField
            select
            size="small"
            value={preview.selectedVersion}
            onChange={(e) => handleSelectVersion(Number(e.target.value))}
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

        {/* E1/E8: the edit control is offered only for a kind whose saved
            text IS the whole artifact (canEditText, derived from
            kindSupportsTextEdit - never a hardcoded id list). "decks" and
            "knowledgeChecks" get a short on-screen reason instead of a
            second, disagreeing editing surface. */}
        {canEditText ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0 0 0.5rem", flexWrap: "wrap" }}>
            <Button size="small" variant="text" onClick={() => setEditing((v) => !v)} sx={{ textTransform: "none" }}>
              {editing ? "Preview" : "Edit"}
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={saveEditDisabled}
              onClick={handleSaveEdit}
              sx={{ textTransform: "none" }}
            >
              {savingEdit ? "Saving…" : "Save edit"}
            </Button>
            {dirty && (
              <Button
                size="small"
                variant="text"
                disabled={savingEdit}
                onClick={handleRevertEdit}
                sx={{ textTransform: "none" }}
              >
                Revert
              </Button>
            )}
          </div>
        ) : (
          <p className={styles.previewMeta} style={{ padding: "0 0 0.5rem" }}>
            Editing text isn&apos;t available for this kind - its saved content depends on structured data (slides or
            quiz questions) that hand-edited text can&apos;t update. Use &quot;Ask for changes&quot; below instead.
          </p>
        )}

        <div className={styles.previewContent}>
          {canEditText && editing ? (
            <TextField
              multiline
              fullWidth
              minRows={12}
              value={draft}
              disabled={savingEdit}
              onChange={(e) => {
                setDraft(e.target.value);
                setDiscardConfirm(false);
                setPendingVersion(null);
              }}
              slotProps={{ input: { style: { fontFamily: "var(--font-mono, monospace)", fontSize: "0.85rem" } } }}
            />
          ) : displayText.trim() === "" ? (
            <p className={styles.previewMeta}>This version has no text.</p>
          ) : (
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: "0.9rem" }}>
              {displayText}
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
            {/* AC3/AC4 (defect fix): posting is a real Canvas write, so an
                export selection (no live Canvas connection) shows the SAME
                reason gateOperation(ctx, "courseWrite") already gives every
                other gated write in this tab, instead of a control that
                would just fail on click - never "enabled and broken". */}
            {postUnavailableReason ? (
              <p className={styles.fieldHint}>{postUnavailableReason}</p>
            ) : (
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
            )}
          </div>
        )}
          </>
        )}
    </ModalShell>
  );
}
