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
import { previewMetaText, versionOptionLabel } from "./useLmsGeneration";
import { artifactDownloadFormatLabel } from "@/lib/lms-generation/artifact-download";
// previewHeaderTitle is pulled directly from its own module rather than
// through the useLmsGeneration barrel - it is a defect-fix addition scoped
// to this file's own header rendering (see this file's DEFECT FIX comment
// below), and useLmsGeneration.ts's re-export list is out of this fix's
// file set. artifactDownloadFormatLabel and kindDeliveredAloud above are
// already reached the same direct way, so this is not a new import shape.
import { previewHeaderTitle } from "./lmsGenerationNotes";
import { ModalShell } from "../../ui/ModalShell";
// The "Post to Canvas" footer - pure structural extraction, see
// GeneratedPostSection.tsx's own header comment. GeneratedPreviewModalProps
// below is unchanged by the split: every post-related prop it declared
// still lives here and is still bound by ModulesView.tsx exactly as before,
// just forwarded one level down into the extracted component instead of
// read directly in this file's own JSX.
import { GeneratedPostSection } from "./GeneratedPostSection";
// T1 (docs/teleprompter-mode-acceptance-criteria.md): the teleprompter entry
// point is gated on `kindDeliveredAloud`, the same declarative-flag pattern
// `kindOffersPost` already reads `commitMode` through - NEVER a hardcoded
// `preview.kindId === "scripts"` comparison at this call site, so a future
// spoken kind opts in purely by declaring `deliveredAloud: true` on its own
// kinds.ts config, with no edit here.
import { kindDeliveredAloud } from "@/lib/lms-generation/kinds";
import { TeleprompterPanel } from "./TeleprompterPanel";
// `kindTitleIsContent` and `kindPostsImmediately` (docs/announcement-
// preview-edit-before-post-acceptance-criteria.md, AC A2/C9) gate the new
// Subject field and the post confirm step the same declarative way - NEVER
// a hardcoded `preview.kindId === "announcements"` comparison at this call
// site, so a future kind opts in purely by declaring `titleIsContent`/
// `commitMeta.publishedOnCreation` on its own kinds.ts config. Kept as a
// SEPARATE import statement from `kindDeliveredAloud` above (rather than one
// combined `{ kindDeliveredAloud, kindPostsImmediately, kindTitleIsContent }`
// braced group): teleprompter.wiring.test.ts pins that import as source
// text, `{ kindDeliveredAloud }` alone, so combining the braces would break
// an existing, unrelated test for a purely cosmetic import merge.
import { kindPostsImmediately, kindTitleIsContent } from "@/lib/lms-generation/kinds";
// F21: the reseed/dirty predicates and the post-confirm arm signature are
// pure, dependency-free modules beside this component - see their own
// header comments for why (the same reason confirmArming.ts already is
// one). `isConfirmArmed` is reused from confirmArming.ts VERBATIM, via
// postConfirmArming.ts's re-export - see that module's own header comment
// for why its OWN `selectionSignature` is not reused instead.
import { draftsDirty, draftsNeedReseed } from "./generatedPreviewDrafts";
import { isConfirmArmed, mayPostCommit, postArmSignature } from "./postConfirmArming";

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
  /** True when postModuleChoice was seeded from the instructor's selection
   * (AC8) rather than picked by hand. Purely presentational. */
  postTargetFromSelection?: boolean;
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
  /** Persist the modal's OWN local drafts as a new version (E2/E3, widened
   * by AC B6 to carry the subject too) - wired to useLmsGeneration's
   * `saveEdit`. Called with the draft text and, ONLY when this kind offers
   * the subject field (`kindTitleIsContent`), the draft title too - never
   * read back from `preview` here, because the whole point of an edit is
   * that the caller's values may already differ from what is stored. The
   * title argument is `undefined`, not the (possibly unchanged) draft
   * value, whenever the subject field is not offered: `saveEdit`'s "no
   * edited title supplied" branch keeps carrying `currentTitle` forward
   * byte-identical (AC B4), including a legitimate `null`, and an
   * always-supplied empty string would instead risk tripping AC B5's blank-
   * title refusal for a kind that never offered subject editing in the
   * first place. Absent or a no-op whenever `canEditText` is false. */
  onSaveEdit?: (text: string, title?: string) => void;
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
  postTargetFromSelection = false,
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
  // AC A1/A2 (docs/announcement-preview-edit-before-post-acceptance-
  // criteria.md): whether this kind's `title` is real content the
  // instructor owns, rather than a label derived at generate time from a
  // module name - see kindTitleIsContent's own doc comment (kinds.ts) for
  // the invariant this implies (`offersSubject` implies `canEditText`,
  // asserted below near `saveEditDisabled`).
  const offersSubject = kindTitleIsContent(preview.kindId);
  const currentTitle = selectedArtifact?.title ?? "";
  // AC 1b: THE `<h3>` MUST STOP SHOWING THE SAME STRING TWICE. Before this
  // feature, `previewHeaderTitle` preferred `artifact.title` unconditionally
  // (see its own doc comment, ./lmsGenerationNotes, for why - a
  // since-re-geared kind keeping old versions' names honest), so for
  // announcements the heading already WAS the subject. Shipping the Subject
  // field without touching this would
  // render the same sentence twice, six lines apart - once unlabelled as a
  // window title, once labelled as content. When a kind offers the subject
  // field, the heading falls back to the stable `preview.kindLabel` instead,
  // which also makes `ModalShell`'s accessible name ("Preview of
  // Announcements") stop silently changing on every keystroke - a
  // deliberate, accepted trade named in the AC doc's own "Settled UX
  // decisions" section.
  const headerTitle = offersSubject
    ? preview.kindLabel
    : selectedArtifact
      ? previewHeaderTitle(selectedArtifact, preview.kindLabel)
      : preview.kindLabel;

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
  // AC B8/B8a: the subject gets the SAME local-draft treatment as the body,
  // seeded from and reseeded alongside it - see the reseed block below for
  // why the two fields must be tested and reset TOGETHER rather than each
  // getting its own independent `useState`/reseed pair.
  const [subjectDraft, setSubjectDraft] = useState(currentTitle);
  const [seededTitle, setSeededTitle] = useState(currentTitle);
  const [editing, setEditing] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  // Which version the armed discard panel would switch to on confirmation;
  // null means the deferred action is closing the modal, and "regenerate"
  // means the deferred action is a Regenerate click - see handleSelectVersion
  // below for why version-switching needs the guard too, and
  // handleRegenerateClick below (defect fix) for why Regenerate does too.
  const [pendingVersion, setPendingVersion] = useState<number | "regenerate" | null>(null);

  // T1/T3 (docs/teleprompter-mode-acceptance-criteria.md): teleprompter mode
  // is offered only for a kind meant to be spoken aloud, and entering/leaving
  // it is explicit and always reversible - this is the ONE new piece of
  // local state that decision needs. Never reset by the E9 reseed above: a
  // version switch or a refine landing while rehearsing should not silently
  // kick the instructor out of teleprompter mode.
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const offersTeleprompter = kindDeliveredAloud(preview.kindId);

  // AC 9-14 (docs/announcement-preview-edit-before-post-acceptance-
  // criteria.md): the two-step "Post to Canvas" confirm, required only for a
  // kind that posts immediately and irreversibly (kindPostsImmediately,
  // reads commitMeta.publishedOnCreation - never a hardcoded id check; today
  // that is announcements alone). `postArmedFor` records the SIGNATURE the
  // confirm was armed for (postConfirmArming.ts's model, reused from
  // confirmArming.ts) rather than a boolean reset by an effect - see that
  // module's own header comment for why. Lives here, not inside
  // GeneratedPostSection, specifically so `handleDismiss` below (Escape /
  // backdrop / header Close) can disarm it directly - AC 13.
  const [postArmedFor, setPostArmedFor] = useState<string | null>(null);
  const offersPostConfirm = kindPostsImmediately(preview.kindId);
  // AC 12a-sig: deliberately excludes the subject/body text - see
  // postConfirmArming.ts's own header comment for why. `artifactId` falls
  // back to "" only for the render before any version has loaded; a real
  // arm can never happen against that placeholder, since the button (and
  // therefore the very first click that could arm) is not reachable until
  // `preview.versions` has a selected artifact to post.
  const currentPostSignature = postArmSignature({
    kindId: preview.kindId,
    artifactId: selectedArtifact?.id ?? "",
    moduleChoice: postModuleChoice,
    newModuleName: postNewModuleName,
  });
  const postConfirmArmed = isConfirmArmed(postArmedFor, currentPostSignature);

  // AC 8a - THE RESEED GUARD MUST TEST BOTH FIELDS IN ONE `if`. AC B7 allows
  // saving with ONLY the subject changed, which produces two versions with
  // IDENTICAL text and DIFFERENT titles - so a reseed trigger that compared
  // `currentText` alone would not fire when switching between them, and the
  // subject field would keep showing the OTHER version's title (REGRESSION
  // entry 312 check 7's failure, reached through the picker instead of
  // Save). `draftsNeedReseed` (generatedPreviewDrafts.ts) is the OR of both
  // fields; this stays the ONE block that resets both drafts plus
  // `discardConfirm`/`pendingVersion` together - never two independent
  // `if`s, which would leave a frame where the subject and the body came
  // from different versions (AC 6's failure mode, reached through the
  // picker instead of through Save).
  if (draftsNeedReseed({ text: currentText, title: currentTitle }, { text: seededText, title: seededTitle })) {
    setSeededText(currentText);
    setSeededTitle(currentTitle);
    setDraft(currentText);
    setSubjectDraft(currentTitle);
    setDiscardConfirm(false);
    setPendingVersion(null);
  }

  // AC B7: dirty means EITHER field changed - widened from body-only, and
  // MUST KEEP THIS IDENTIFIER NAME (generatedPreviewModal.wiring.test.ts
  // slices the version-switch handler and asserts it consults `dirty` by
  // this exact spelling). Gated on `canEditText` first, same as before:
  // a kind with no editing offered at all (decks, knowledgeChecks) is never
  // dirty, full stop. `draftsDirty`'s own `offersSubject` gate is what keeps
  // a title-only difference from reading as dirty for a kind that does not
  // render an editable subject field (see that function's own doc comment).
  const dirty = canEditText && draftsDirty({ text: draft, title: subjectDraft }, { text: currentText, title: currentTitle }, offersSubject);
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
    // AC 13: Cancel, Escape and backdrop all disarm the post confirmation
    // and write nothing. Placed here - after the teleprompter rung, before
    // every other branch below - so EVERY real dismiss attempt disarms,
    // including the one that only arms the discard-changes panel below (the
    // first attempt while dirty) rather than closing the modal outright:
    // that panel and the post confirmation are two independent armed
    // states, and a dirty-edit Escape must not leave a stale post arm
    // sitting behind it once the modal is dismissed. Unconditional and
    // idempotent - clearing an already-null arm costs nothing.
    setPostArmedFor(null);
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
    // Defect fix: the third pending-action variant (see handleRegenerateClick
    // below) resolves the same panel to a refine instead of a version switch.
    if (pendingVersion === "regenerate") {
      setPendingVersion(null);
      setDiscardConfirm(false);
      onRefine();
      return;
    }
    const version = pendingVersion;
    setPendingVersion(null);
    setDiscardConfirm(false);
    onSelectVersion(version);
  };

  // Defect fix: Regenerate used to bypass the unsaved-work guard outright -
  // a click replaced `preview` (via `onRefine`'s reseed) and silently
  // discarded whatever sat unsaved in `draft`/`subjectDraft`, the same
  // work-loss class E10/AC6 already close for Close and a version switch.
  // Routes through the SAME `discardConfirm`/`pendingVersion` panel as
  // those two, rather than a fourth confirm idiom, using the third
  // `pendingVersion` variant ("regenerate") above so the one panel can still
  // resolve to any of the three deferred actions.
  const handleRegenerateClick = () => {
    if (savingEdit) return;
    if (dirty && !discardConfirm) {
      setPendingVersion("regenerate");
      setDiscardConfirm(true);
      return;
    }
    setDiscardConfirm(false);
    setPendingVersion(null);
    onRefine();
  };

  const handleSaveEdit = () => {
    // AC B6/B4: the title argument is `undefined` - not the (possibly
    // unchanged) draft value - whenever this kind does not offer the
    // subject field. `saveEdit`'s "no edited title supplied" branch keeps
    // carrying `currentTitle` forward byte-identical, including a
    // legitimate `null`; always supplying a defined string here would risk
    // tripping AC B5's blank-title refusal for a kind that never offered
    // subject editing (and whose `currentTitle` can legitimately be `null`,
    // which `currentTitle` above coerces to `""` for display purposes only).
    onSaveEdit?.(draft, offersSubject ? subjectDraft : undefined);
  };

  const handleRevertEdit = () => {
    setDraft(currentText);
    setSubjectDraft(currentTitle);
    setDiscardConfirm(false);
    setPendingVersion(null);
  };

  // E11: disabled whenever there is nothing TO save (not dirty, or a blank
  // draft) or while any generation, refine, download, post or save is
  // already in flight - reusing the same `busy`/`downloading` gates every
  // other control on this modal already uses, rather than inventing a
  // parallel one. AC B5's own refusal lives at the action; this is the
  // UI-side mirror of it (same posture as the blank-body guard immediately
  // before it) so a doomed round-trip to the server is not the first place
  // a blank subject is caught.
  const saveEditDisabled =
    busy !== "" ||
    downloading !== null ||
    !dirty ||
    draft.trim() === "" ||
    (offersSubject && subjectDraft.trim() === "");

  // AC 9/12d: the single click handler bound to GeneratedPostSection's post
  // button, for a kind requiring the confirm step. A kind that does NOT
  // require it (offersPostConfirm false) is unaffected - GeneratedPostSection
  // calls `onPost` directly for those, exactly as before this feature.
  //
  // First click ARMS (records the current signature); a second, distinct
  // click - reachable only once `postConfirmArmed` is already true, which by
  // construction means nothing about the target has changed since arming -
  // COMMITS. AC 12d: a successful post is explicitly disarmed HERE, before
  // calling through, because the signature model does not cover this case by
  // construction: `post()` does not close the modal, and the posted version
  // is unchanged by posting it, so the signature does not invalidate itself
  // on a successful write. Without this explicit disarm, one further click
  // would post the SAME announcement a second time.
  const handlePostAction = () => {
    if (!offersPostConfirm) {
      onPost?.();
      return;
    }
    if (!postConfirmArmed) {
      setPostArmedFor(currentPostSignature);
      return;
    }
    // Defect fix: `mayPostCommit` (postConfirmArming.ts) used to be exported
    // and unit-tested with nothing ever calling it - a second, non-render-
    // level guard is consulted here now, the same defense-in-depth posture
    // useLmsGeneration's own post() already takes even though the module-
    // target picker and Post button are expected to be hidden/disabled for
    // every reason it checks. `postDirty` (GeneratedPostSection's render-
    // level block) is the reason a click here is not reachable while dirty
    // in practice; this is the second, independent check that refuses the
    // write even if that render-level guard is ever wrong.
    if (!mayPostCommit(postUnavailableReason, dirty, postConfirmArmed)) return;
    setPostArmedFor(null);
    onPost?.();
  };

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
                : pendingVersion === "regenerate"
                  ? "Discard your unsaved changes and regenerate?"
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

        {/* AC A1/A1a: the Subject field, offered only when this kind's
            title is real content the instructor owns (offersSubject,
            derived from kindTitleIsContent - never a hardcoded id check).
            Placement is deliberate: full width, immediately ABOVE
            `.previewContent` and BELOW the Edit/Save-edit row above - not
            below the body, whose `max-height: min(66vh, 620px)` scrolls, so
            a subject placed after it could be pushed off screen and posted
            unread; not in the header, which is "what this is / what you can
            do with it / how to leave". ALWAYS LIVE, never gated behind the
            Edit/Preview toggle: Save edit already renders regardless of
            `editing`, and a one-line field has no distinct preview
            rendering worth the two extra clicks per subject change gating
            would cost.

            INVARIANT: `offersSubject` implies `canEditText`. A kind offering
            a live subject field but no text editing would render a field
            with no way to save it, directly above a hint saying editing is
            unavailable - visibly broken. True today by construction: the
            only kind setting `titleIsContent` (announcements) also has no
            `renderStructured`, so `kindSupportsTextEdit` - and therefore
            `canEditText` - is true for it (kinds.ts). This branch does not
            special-case `!canEditText` because of that invariant, not
            because the case cannot be represented in the props. */}
        {offersSubject && (
          <TextField
            fullWidth
            size="small"
            label="Subject"
            value={subjectDraft}
            // Defect fix: was `savingEdit` alone - a refine in flight
            // (`busy`) left this field typeable while `onRefine`'s reseed
            // was about to replace `subjectDraft` out from under whatever
            // was typed, the same class of loss handleRegenerateClick above
            // now guards on the Regenerate click itself.
            disabled={savingEdit || busy !== ""}
            onChange={(e) => {
              setSubjectDraft(e.target.value);
              setDiscardConfirm(false);
              setPendingVersion(null);
            }}
            error={subjectDraft.trim() === ""}
            helperText={
              subjectDraft.trim() === ""
                ? "Enter a subject - an announcement cannot be posted without one."
                : "Students see this as the announcement's subject line in Canvas."
            }
            sx={{ mb: "0.5rem" }}
          />
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
              // Defect fix: was `onRefine` directly - unguarded, unlike Close
              // and a version switch, both of which already route through
              // the discard panel. See handleRegenerateClick's own comment.
              onClick={handleRegenerateClick}
            >
              {refining ? "Regenerating…" : "Regenerate with these instructions"}
            </Button>
            <span className={styles.previewMeta}>
              Creates a new version - every saved version for this course stays reachable above.
            </span>
          </div>
        </div>

        {/* "Post to Canvas" footer - extracted into its own component; see
            GeneratedPostSection.tsx's own header comment for why (the
            offersPost gate now lives inside it), and this file's own
            header comment for why no new modal or CSS was needed for this
            capability in the first place.

            AC 9-14: the confirm step's arm/commit decision (handlePostAction)
            and its arm state (postArmedFor/postConfirmArmed) live in THIS
            file, not in GeneratedPostSection - see postArmedFor's own doc
            comment above for why (handleDismiss needs to reach it directly
            for AC 13). GeneratedPostSection stays a renderer: it is handed
            the already-resolved facts (whether this kind requires the
            confirm at all, whether it is currently armed, and the exact
            subject/body the confirm must quote per AC 11) plus one click
            handler, rather than re-deriving any of them itself. */}
        <GeneratedPostSection
          busy={busy}
          downloading={downloading}
          offersPost={offersPost}
          postNeedsModuleTarget={postNeedsModuleTarget}
          postModuleOptions={postModuleOptions}
          postModuleChoice={postModuleChoice}
          postTargetFromSelection={postTargetFromSelection}
          onPostModuleChoiceChange={onPostModuleChoiceChange}
          postNewModuleName={postNewModuleName}
          onPostNewModuleNameChange={onPostNewModuleNameChange}
          posting={posting}
          postUnavailableReason={postUnavailableReason}
          postConfirmRequired={offersPostConfirm}
          postConfirmArmed={postConfirmArmed}
          postDirty={dirty}
          onPostButtonClick={handlePostAction}
          onCancelPostConfirm={() => setPostArmedFor(null)}
          // Defect fix: for a legacy row with a null/blank title, `currentTitle`
          // is "" and the confirm panel used to render an EMPTY code block
          // under "Subject that will be sent:" - but Canvas never receives an
          // empty subject. `post()`'s server action falls back to the kind's
          // own label instead (src/app/actions/lms-generation.ts:846 -
          // `(artifact.title ?? "").trim() || config.label`), so the panel
          // has to fall back the same way to keep showing what will actually
          // be sent (AC 11). `preview.kindLabel` is this modal's own copy of
          // that same `config.label` value.
          confirmSubjectText={currentTitle.trim() || preview.kindLabel}
          confirmBodyText={currentText}
        />
          </>
        )}
    </ModalShell>
  );
}
