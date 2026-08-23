// The two public shape types for useLmsGeneration.ts - GenerationPreviewState
// and UseLmsGenerationReturn - extracted to keep that file under this repo's
// 1000-line ceiling. A STRUCTURAL split only, no behaviour change: this file
// has no React import and declares no runtime value, only the type contract
// the hook already had. Both types are re-exported from useLmsGeneration.ts
// (see the "-- Re-exports --" block there) so every existing import of that
// file - GeneratedPreviewModal.tsx imports GenerationPreviewState from
// "./useLmsGeneration" today, and useLmsGeneration.test.ts's own source-text
// checks read the hook file for its function signature - keeps compiling and
// resolving unchanged. Every doc comment below moved verbatim from where it
// used to live inline in useLmsGeneration.ts; nothing was shortened to fit
// under the ceiling (see this repo's dev loop notes on why that trade is
// never made).
//
// Precedent for this kind of split: lmsGenerationKindHelpers.ts's own header
// comment documents the identical move for the pure logic half of this same
// hook.

import type { GeneratedArtifact } from "@/lib/supabase/generated-artifacts";
import type { GenerationKindId } from "@/lib/lms-generation/kinds";
import type { ArtifactDownloadFormat } from "@/lib/lms-generation/artifact-download";
// GenerationBusy/GenerationBusyEvent live in lmsGenerationKindHelpers.ts (the
// busy-state transition's own home - see that file's header comment), not
// here - UseLmsGenerationReturn below only needs the TYPE, so it is imported
// rather than re-declared, to keep the busy-state machine's shape defined in
// exactly one place. Re-exported at the bottom of this file so a consumer of
// UseLmsGenerationReturn can also reach GenerationBusy through this module
// without a second import.
import type { GenerationBusy } from "./lmsGenerationKindHelpers";
import type { GenerationKindDef } from "./lmsGenerationKindHelpers";
import type { PostModuleOption } from "./lmsGenerationModuleTarget";
import type { DeckTemplateOption } from "./lmsGenerationDeckHelpers";

export interface GenerationPreviewState {
  kindId: GenerationKindId;
  kindLabel: string;
  /** Newest-first. The REAL stored history for this course+kind (via
   * loadVersionsForPreview/listGeneratedArtifactVersionsAction) - not
   * merely what this page load has produced. */
  versions: GeneratedArtifact[];
  selectedVersion: number;
  /** Materials-gathering notes from the generate call that produced the
   * newest version (omitted descriptions, truncation, per-item fetch
   * failures) - empty after a refine, which does not re-gather materials. */
  notes: string[];
  /** D3/AC14i: the course's `startDate`, so `post` can compute
   * introDiscussion's deadlines client-side. Meaningless for other kinds;
   * carried forward (not re-fetched) by refine/saveEdit's setPreview calls. */
  courseStartDate?: string | null;
}

export interface UseLmsGenerationReturn {
  busy: GenerationBusy;
  /** Job 3 (visible-in-the-row error, docs/REGRESSION.md - the intro-video-
   * script bug report fix): the Generate row's OWN error text, or null - set
   * whenever `generate` fails (either branch), cleared at the start of every
   * new attempt. Rendered by GenerateFromSelectionSection.tsx in a
   * `role="status" aria-live="polite"` region next to the button that
   * failed - separate from, and in ADDITION to, the tab-wide `setNote`
   * channel every entry point in this hook also still uses (that note
   * renders in ContentTab.tsx, outside ModulesView's sticky header - see
   * that section's own header comment for why that alone was not enough). */
  generationError: string | null;
  /** Job 4 (downloadable diagnostic log): whether a diagnostic record from
   * the most recent generateFromSelectionAction call is available to
   * download via `downloadDiagLog` below - false before any such call has
   * run in this session. */
  hasDiagLog: boolean;
  /** Job 4: builds and triggers a browser download of the most recent
   * generateFromSelectionAction call's diagnostic record as JSON, via the
   * SAME triggerFileDownload mechanism `download` below already uses for a
   * generated artifact. No-op when `hasDiagLog` is false. */
  downloadDiagLog: () => void;
  /** Offerable kinds for the CURRENT selection - see offerableGenerationKinds. */
  kinds: readonly GenerationKindDef[];
  generate: (kindId: GenerationKindId) => void;
  /** Decks only - the template picker's options (built-in presets first,
   * then this user's saved deck_templates) and the currently-selected id.
   * Every other kind ignores these. */
  templates: readonly DeckTemplateOption[];
  templateId: string;
  setTemplateId: (id: string) => void;
  /** Scripts only - the length select's offered options (in minutes), and
   * the currently-selected value, persisted per course (S13). Every other
   * kind ignores these, the same way every other kind ignores
   * `templates`/`templateId` above. */
  scriptLengthOptions: readonly number[];
  scriptMinutes: number;
  setScriptMinutes: (minutes: number) => void;
  /** introDiscussion only - "Use Canvas discussion checkpoints" checkbox
   * value; every other kind ignores it, same as templateId/scriptMinutes
   * above. Persisted per course under a `ta-` key (REPO INVARIANT). Default
   * FALSE - checkpoints are explicit opt-in, never assumed. */
  useDiscussionCheckpoints: boolean;
  setUseDiscussionCheckpoints: (v: boolean) => void;
  preview: GenerationPreviewState | null;
  closePreview: () => void;
  /** Switch which already-loaded version the modal displays - no network
   * call, every version's text is already in `preview.versions`. */
  selectVersion: (version: number) => void;
  instructions: string;
  setInstructions: (v: string) => void;
  refine: () => void;
  refining: boolean;
  /** Formats downloadable for the version CURRENTLY ON SCREEN (AC 1 of
   * docs/generated-artifact-download-acceptance-criteria.md) -
   * `preview.versions.find(v => v.version === preview.selectedVersion)`, run
   * through artifactDownloadFormats. Empty when there is no preview open. */
  downloadFormats: readonly ArtifactDownloadFormat[];
  /** The format currently being built, or null when no download is in
   * flight - drives the preview modal's "Preparing..." progress label and
   * disables the download control while set (AC 7). */
  downloading: ArtifactDownloadFormat | null;
  /** Build and trigger a browser download of the selected version in
   * `format`. A pure client-side read of already-saved data - never writes
   * anything anywhere (AC 8) and never closes the preview, including on
   * failure (AC 6). No-op while `!preview`, while a generate/refine is
   * running (`busy !== ""`), or while another download is already in flight
   * (AC 7). */
  download: (format: ArtifactDownloadFormat) => void;
  /** Whether the previewed kind can be posted at all (kindOffersPost of
   * `preview.kindId`) - `false` (and every post-related field below
   * meaningless) whenever `preview` is null or the previewed kind is one of
   * the three "save-version" kinds. Drives whether the modal shows "Post to
   * Canvas" at all (P1). */
  offersPost: boolean;
  /** Whether the previewed kind's post even needs a module target
   * (kindNeedsModuleTarget) - false for a "course-level" kind
   * (announcements today), which has no module-target picker to show at
   * all. Meaningless whenever `offersPost` is false. */
  postNeedsModuleTarget: boolean;
  /** id/name pairs for the post-target module select - this tab's own
   * already-loaded live module tree (see postModuleOptionsFrom). */
  postModuleOptions: readonly PostModuleOption[];
  /** The post-target select's own value - either a module id (as a string,
   * matching a TextField select's own value convention) or
   * NEW_MODULE_TARGET_VALUE. */
  postModuleChoice: string;
  setPostModuleChoice: (v: string) => void;
  /** AC8: true only while `postModuleChoice` still holds the value AC4 seeded
   * from the bulk selection (defaultPostModuleChoiceFrom), never derived by
   * comparing values - see `choosePostModule` below for why. Drives the
   * "From your selection." hint in GeneratedPreviewModal.tsx; false the
   * moment the instructor changes the select by hand. */
  postTargetFromSelection: boolean;
  /** The new module's name - relevant, and shown by the caller, only while
   * postModuleChoice === NEW_MODULE_TARGET_VALUE. */
  postNewModuleName: string;
  setPostNewModuleName: (v: string) => void;
  /** Post the version currently on screen (`preview.selectedVersion`) to
   * Canvas, into whatever `postModuleChoice`/`postNewModuleName` currently
   * resolve to (P5) - see this function's own body comment for the full
   * flow, including C1's tab-wide `setBusy`/`reload()` wiring. No-op while
   * `!preview`, the previewed kind does not offer posting, a generate/
   * refine/post is already running, or the module-target selection does not
   * yet resolve (resolvePostModuleTarget's own validation, surfaced through
   * `setNote` instead of silently doing nothing in that one case, since it is
   * the one guard the instructor can fix by typing rather than by waiting). */
  post: () => void;
  /** Whether the post triggered by `post` is in flight - mirrors `refining`,
   * so the post button's own label can read "Posting..." (this file's
   * existing progress-word convention) distinctly from `busy` alone, which a
   * concurrent generate of the same kind would also set. */
  posting: boolean;
  /** AC3/AC4 (defect fix): why posting the previewed kind is unavailable
   * right now, or null when it can be posted - see postUnavailableReasonFor's
   * own doc comment. Null whenever `preview` is null or the previewed kind
   * never offered posting in the first place. */
  postUnavailableReason: string | null;
  /** E1 (chunk 3e): whether the previewed kind's saved text IS the whole
   * artifact, so an edit control can be offered for it at all
   * (kindSupportsTextEdit) - false whenever `preview` is null or the
   * previewed kind is "decks"/"knowledgeChecks", whose `structured` payload
   * is the authoritative half (kinds.ts's own doc comment). */
  canEditText: boolean;
  /** Save the modal's own local draft as a NEW version (E2/E3) - never an
   * overwrite. No-op whenever `!preview`, the previewed kind cannot be
   * edited, another generate/refine/post/save is already running, or `text`
   * is blank (E5) - each guard reported through `setNote`, matching every
   * other entry point in this hook. On success, copies `refine`'s own tail
   * exactly (E12): re-fetch via `loadVersionsForPreview`, then `setPreview`
   * with the new version selected. On failure, `preview` is left untouched -
   * the modal's own draft state survives a failed save unmodified (E13). */
  saveEdit: (text: string) => void;
  /** Whether the save triggered by `saveEdit` is in flight - mirrors
   * `refining`/`posting`, so the Save button's own label can read
   * "Saving..." distinctly from `busy` alone. */
  savingEdit: boolean;
}

export type { GenerationBusy };
