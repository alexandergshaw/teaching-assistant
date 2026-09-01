"use client";

// The "Post to Canvas" footer for GeneratedPreviewModal.tsx - split out as a
// PURE STRUCTURAL EXTRACTION, zero behaviour change, zero prop-contract
// change on GeneratedPreviewModalProps (which keeps every post-related prop
// it declared before this split - ModulesView.tsx still binds them all,
// unedited). It exists only to make room for a following wave that adds a
// confirm step to this footer without GeneratedPreviewModal.tsx growing
// past a reasonable line budget for an unrelated change.
//
// THAT FOLLOWING WAVE IS THIS ONE (docs/announcement-preview-edit-before-
// post-acceptance-criteria.md, AC 9-14): the two-step "Post to Canvas"
// confirm, required for a kind that posts immediately and irreversibly
// (today: announcements alone). This component stays a RENDERER for the
// confirm step, same as it always has been for the rest of the footer: the
// arm/commit decision and the armed-state itself live in
// GeneratedPreviewModal.tsx, not here - see that file's own
// `postArmedFor` doc comment for why (its dismissal guard, AC 13, needs to
// reach the arm directly). This file receives the already-resolved facts
// (`postConfirmRequired`, `postConfirmArmed`, `postDirty`) plus one click
// handler (`onPostButtonClick`) and a cancel handler, and renders
// accordingly - it does not import kinds.ts or postConfirmArming.ts itself.
//
// Renders INSIDE the caller's ModalShell - it is not a dialog of its own and
// must never become one. No `styles.previewBackdrop`, no `role="dialog"`, no
// MUI `Dialog`, no `createPortal`: src/app/components/ui/modalAdoption.wiring
// .test.ts scans every .tsx file under src/app for those markers and treats
// a match as an un-adopted dialog site, and generatedPreviewModal.wiring.
// test.ts separately forbids createPortal on the modal it was extracted from.
// This file carries none of those markers, so it stays invisible to that
// scan entirely, the same way the block it came from always was. The new
// confirm PANEL follows the same rule: a plain `<div>`, styled like the
// modal's existing "Discard changes?" panel (inline `var(--warning-surface)`,
// same padding/borderTop) rather than a second confirm idiom - AC E18, as
// corrected by AC 25 (the discard panel itself carries no `role`/
// `aria-live`, so the live-region behaviour below is copied from
// ReleaseReviewModal.tsx:131 and VisualizerCoverageSection.tsx:249-260
// instead, both of which argue explicitly for a redundant signal before an
// unrecoverable write).
//
// No new CSS either: every className below is one of GeneratedPreviewModal
// .tsx's own page.module.css classes (previewMeta, fieldHint), reused exactly
// as the moved code already used them there, and exactly as the confirm
// step's own new markup below reuses them again.
//
// "Post to Canvas" (chunk 3b, P1/P5) - shown ONLY when `offersPost` is true,
// i.e. only for the four (now five) "save-and-post" kinds (kinds.ts); the
// original kinds render nothing. See GeneratedPreviewModal.tsx's own header
// comment for why posting reuses the same footer idiom as "Ask for changes"
// rather than a new modal or new CSS (P1/X2).

import { Button, MenuItem, TextField } from "@mui/material";
import styles from "../../../page.module.css";
import { NEW_MODULE_TARGET_VALUE, resolvePostModuleTarget } from "./useLmsGeneration";
import type { ArtifactDownloadFormat, GenerationBusy, PostModuleOption } from "./useLmsGeneration";

// Stable id for the confirm panel's consequence paragraph (AC 25) - fixed
// rather than generated, because at most one instance of this component is
// ever mounted at a time (it lives inside the single generated-content
// preview modal), so there is no collision risk a `useId()` would otherwise
// guard against.
const POST_CONFIRM_CONSEQUENCE_ID = "generated-post-confirm-consequence";

export interface GeneratedPostSectionProps {
  /** Reused (not re-derived) from GeneratedPreviewModal's own `busy`/
   * `downloading` state, the same gates every other control on that modal
   * already uses - see `postControlsDisabled` below. */
  busy: GenerationBusy;
  downloading: ArtifactDownloadFormat | null;
  /** True only for a "save-and-post" kind (kinds.ts). This prop is what the
   * moved `{offersPost && ( ... )}` gate itself now reads - GeneratedPreview
   * Modal.tsx renders this component unconditionally and lets it decide. */
  offersPost: boolean;
  /** False for a "course-level" kind (announcements) - no module-target
   * picker is rendered at all for it, since a Canvas announcement has no
   * module to choose (kindNeedsModuleTarget's own doc comment,
   * useLmsGeneration.ts). Meaningless while `offersPost` is false. */
  postNeedsModuleTarget: boolean;
  postModuleOptions: readonly PostModuleOption[];
  postModuleChoice: string;
  /** True when postModuleChoice was seeded from the instructor's selection
   * (AC8) rather than picked by hand. Purely presentational. */
  postTargetFromSelection: boolean;
  onPostModuleChoiceChange?: (v: string) => void;
  postNewModuleName: string;
  onPostNewModuleNameChange?: (v: string) => void;
  posting: boolean;
  /** AC3/AC4 (defect fix, docs/REGRESSION.md - the "generate from an export
   * selection" defect): why posting is unavailable right now, or null/
   * undefined when it can be posted. See GeneratedPreviewModal.tsx's own doc
   * comment on this same value for the full rationale - unchanged by the
   * move. */
  postUnavailableReason?: string | null;
  /** AC 9: true only for a kind that posts immediately and irreversibly
   * (kindPostsImmediately, kinds.ts - today, announcements alone). Every
   * other "save-and-post" kind keeps its existing single-click post: this
   * prop being false reproduces this component's pre-confirm-step
   * behaviour byte-for-byte. */
  postConfirmRequired: boolean;
  /** AC 12: whether the confirm is currently armed FOR THE CURRENT TARGET -
   * `isConfirmArmed(postArmedFor, currentSignature)`, computed by the
   * caller (see GeneratedPreviewModal.tsx's own `postConfirmArmed`).
   * Meaningless while `postConfirmRequired` is false. */
  postConfirmArmed: boolean;
  /** AC 12b: true when the editor has an unsaved change. Blocks posting
   * outright (the button is replaced by a hint) while `postConfirmRequired`
   * is true - see this file's own render logic for why this is scoped to
   * the confirm-requiring kind rather than every "save-and-post" kind (the
   * confirm panel is what would otherwise show a saved version that visibly
   * disagrees with the dirty draft still on screen; a kind with no confirm
   * panel has no such on-screen contradiction to prevent). */
  postDirty: boolean;
  /** The single click handler for the post button, in EITHER of its two
   * states ("Post to Canvas" or "Confirm post") - GeneratedPreviewModal.tsx's
   * `handlePostAction` decides whether a click arms, commits, or (for a kind
   * with no confirm step) posts directly; this component does not
   * distinguish those cases itself. */
  onPostButtonClick?: () => void;
  /** The confirm panel's own "Cancel" (AC 13) - disarms without posting and
   * without closing the modal. Meaningless unless `postConfirmRequired &&
   * postConfirmArmed`. */
  onCancelPostConfirm?: () => void;
  /** AC 11: the EXACT subject and body the confirm panel quotes - read by
   * the caller from `selectedArtifact` (the saved version a post will
   * actually read), never from the live draft, so what is shown here can
   * never disagree with what a commit click would send. */
  confirmSubjectText: string;
  confirmBodyText: string;
}

export function GeneratedPostSection({
  busy,
  downloading,
  offersPost,
  postNeedsModuleTarget,
  postModuleOptions,
  postModuleChoice,
  postTargetFromSelection,
  onPostModuleChoiceChange,
  postNewModuleName,
  onPostNewModuleNameChange,
  posting,
  postUnavailableReason,
  postConfirmRequired,
  postConfirmArmed,
  postDirty,
  onPostButtonClick,
  onCancelPostConfirm,
  confirmSubjectText,
  confirmBodyText,
}: GeneratedPostSectionProps) {
  // Disabled the same way the download buttons already are (busy or a
  // download in flight), PLUS this control's own validation - a blank/
  // unresolved module target (resolvePostModuleTarget, useLmsGeneration.ts)
  // disables the button rather than letting a click surface an error note
  // for something the instructor could see was incomplete right on screen.
  // A "course-level" kind (postNeedsModuleTarget false - announcements
  // today) needs no target at all, so it is always considered resolved.
  const postControlsDisabled = busy !== "" || downloading !== null;
  const postTargetResolved = !postNeedsModuleTarget || resolvePostModuleTarget(postModuleChoice, postNewModuleName).ok;
  // AC 12b - THE DIRTY-BLOCK, SCOPED TO THE KIND THAT HAS A CONFIRM PANEL TO
  // CONTRADICT. Only relevant when `postConfirmRequired` is true: that is
  // the one case where the confirm panel would otherwise show the SAVED
  // subject/body (AC 11) sitting visibly under a draft that already
  // disagrees with it. Blocking here is the Gap 2b fix - `post()` never
  // reads the draft, so without this an unsaved edit was silently NOT
  // posted while still on screen.
  const postBlockedByDirtyEdit = postConfirmRequired && postDirty;
  const showCancelConfirm = postConfirmRequired && postConfirmArmed;

  return (
    <>
      {/* "Post to Canvas" (chunk 3b, P1/P5) - the review-then-commit
          step for the version on screen. Shown ONLY for a
          "save-and-post" kind (offersPost) - every other kind renders
          nothing here, per this file's own header comment on why no
          new modal or CSS was needed for this. Reuses the same footer
          idiom (inline-styled divider + row) the "Ask for changes"
          block just above already uses. */}
      {offersPost && (
        <div style={{ paddingTop: "var(--space-3)", borderTop: "1px solid var(--field-border)" }}>
          {/* AC3/AC4 (defect fix): posting is a real Canvas write, so an
              export selection (no live Canvas connection) shows the SAME
              reason gateOperation(ctx, "courseWrite") already gives every
              other gated write in this tab, instead of a control that
              would just fail on click - never "enabled and broken". */}
          {postUnavailableReason ? (
            <p className={styles.fieldHint}>{postUnavailableReason}</p>
          ) : (
            <>
              {/* AC 9-11 - THE CONFIRM PANEL. Sits directly ABOVE the
                  control row below, styled exactly like the modal's own
                  "Discard changes?" panel (same inline `var(--warning-surface)`
                  background, same padding/borderTop) rather than a second
                  confirm idiom (AC E18). NOT a nested modal: a plain `<div>`,
                  no `role="dialog"`, no portal - see this file's own header
                  comment. Renders regardless of `postDirty`: it quotes the
                  SAVED version (AC 11), which stays true even while the
                  draft above it disagrees, and the button row below is what
                  actually blocks the write while dirty - see
                  `postBlockedByDirtyEdit`. */}
              {showCancelConfirm && (
                <div
                  style={{
                    padding: "var(--space-3) var(--space-4)",
                    borderTop: "1px solid var(--field-border)",
                    backgroundColor: "var(--warning-surface)",
                  }}
                >
                  {/* AC 25: `role="status" aria-live="polite"` on THIS
                      paragraph only - never wrapping the quoted body below,
                      which would read a whole announcement aloud the moment
                      the panel arms. Copied from ReleaseReviewModal.tsx:131
                      and VisualizerCoverageSection.tsx:249-260, not from the
                      discard panel this structurally mirrors (which itself
                      has neither - see this file's own header comment). */}
                  <p
                    id={POST_CONFIRM_CONSEQUENCE_ID}
                    role="status"
                    aria-live="polite"
                    style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--font-size-md)" }}
                  >
                    Posting publishes this announcement to every student in the course immediately - Canvas has no
                    unpublished state for an announcement - and this app cannot recall or delete it afterward.
                  </p>
                  {/* Content labels copy CommandProposalModal's "Will be
                      written to Canvas as:" idiom. Quoted content sits in a
                      <code> block with a scroll cap, never
                      dangerouslySetInnerHTML. */}
                  <p className={styles.previewMeta} style={{ margin: "0 0 var(--space-1)" }}>
                    Subject that will be sent:
                  </p>
                  <code style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "var(--font-size-md)" }}>
                    {confirmSubjectText}
                  </code>
                  <p className={styles.previewMeta} style={{ margin: "var(--space-2) 0 var(--space-1)" }}>
                    Body that will be sent:
                  </p>
                  <code
                    style={{
                      display: "block",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontSize: "var(--font-size-md)",
                      maxHeight: "180px",
                      overflow: "auto",
                    }}
                  >
                    {confirmBodyText}
                  </code>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
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
                    {/* AC8: presentational-only provenance hint - the
                        instructor's own choice (via onPostModuleChoiceChange)
                        is what actually decides the target; this span never
                        drives anything. Plain, unassociated span - matching
                        the sibling previewMeta span below rather than wired
                        via aria-describedby (AC8.9).

                        The third clause is why this is a RENDER-time gate and
                        not just a flag read. `postModuleChoice` is seeded when
                        generation STARTS, while these options come from the
                        LIVE `modules` tree, which keeps mutating underneath an
                        open preview (useInlineModuleEdits removes a module,
                        useDragReorder rewrites the tree). If the seeded module
                        is gone by the time this renders, MUI finds no matching
                        MenuItem and draws the select BLANK - and the hint would
                        then read "From your selection." next to an empty box,
                        which is a lie. This changes NOTHING about what gets
                        posted (the hint is presentational; the value itself is
                        still whatever the hook holds), and it does not defeat
                        AC3: AC3's case is a module with no items, or one the
                        client tree has not expanded - such a module is still
                        PRESENT in `modules` and therefore still an option
                        here, so its hint still renders. */}
                    {postTargetFromSelection &&
                      postModuleChoice !== "" &&
                      postModuleOptions.some((m) => String(m.id) === postModuleChoice) && (
                        <span className={styles.previewMeta}>From your selection.</span>
                      )}
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
                {/* AC 13 / Settled UX decisions: "Cancel" exists ONLY while
                    armed, and disarms without posting or closing the modal.
                    Hoisted OUTSIDE the postBlockedByDirtyEdit ternary below
                    (unlike its "Revert" precedent above, which lives inside a
                    single unconditional branch) - defect fix: the confirm
                    panel above renders whenever `showCancelConfirm` is true,
                    REGARDLESS of `postBlockedByDirtyEdit` (AC 11's saved-
                    version quote stays valid even while the draft disagrees -
                    see the panel's own comment), but the button row used to
                    live entirely inside the ternary's `else` arm. Editing the
                    body/subject after arming does not disarm (AC 12a-sig
                    excludes text from the signature on purpose), so that
                    combination put the panel on screen with no control in
                    either arm that could dismiss it - an armed confirm the
                    instructor could not cancel. Suppressing the panel instead
                    was rejected: it would make the panel's own "renders
                    regardless of postDirty" invariant a lie the moment this
                    branch is also dirty, right when a way out matters most. */}
                {showCancelConfirm && (
                  <Button size="small" variant="text" onClick={onCancelPostConfirm}>
                    Cancel
                  </Button>
                )}
                {/* AC 12b: while blocked by a dirty, unsaved edit, the hint
                    REPLACES the post button outright (rather than merely
                    disabling it) - this is the Gap 2b fix, so the reason
                    posting cannot happen has to be visible, not just
                    inferred from a greyed-out control. Cancel (above) is
                    unaffected by this branch on purpose - see its own
                    comment. */}
                {postBlockedByDirtyEdit ? (
                  <span className={styles.fieldHint}>
                    Save your edit first - Post to Canvas sends the saved version, not your unsaved changes.
                  </span>
                ) : (
                  <>
                    <Button
                      size="small"
                      variant="contained"
                      // Button colour stays "primary" in BOTH states,
                      // deliberately. ReleaseReviewModal turns its own armed
                      // button red, but that is tied to a destructive
                      // (delete) tier; posting an announcement is a
                      // fan-out-write, not a delete, and red here would
                      // overstate exactly what AC C11 warns against. Do not
                      // "fix" this to red - it was considered and rejected.
                      color="primary"
                      disabled={postControlsDisabled || !postTargetResolved}
                      onClick={onPostButtonClick}
                      aria-describedby={showCancelConfirm ? POST_CONFIRM_CONSEQUENCE_ID : undefined}
                    >
                      {posting ? "Posting…" : showCancelConfirm ? "Confirm post" : "Post to Canvas"}
                    </Button>
                    <span className={styles.previewMeta}>
                      {postNeedsModuleTarget
                        ? "Creates (or reuses) this version in Canvas, in the module you choose above."
                        : "Posts this version to Canvas as a course announcement - every student sees it as soon as it is posted."}
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
