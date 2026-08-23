"use client";

// Local UI state + handlers for the LMS Modules bulk bar's "Generate from
// selection" control. Chunk 1 shipped two pure-text kinds - anticipated Q&A
// and current events - generated from the current selection and saved as a
// new version in the generated_artifacts store, src/lib/supabase/generated-artifacts.ts
// and its migration supabase/migrations/20261004000000_generated_artifacts.sql.
// Chunk 3a adds a THIRD kind, "decks" - still no Canvas write (the Canvas
// commit is a separate, later chunk) but the first kind that is NOT
// pure-text-only-and-fast: see generateDeckApi's own comment below for why
// it is the one kind that does NOT call generateFromSelectionAction. Calls
// the sibling-built src/app/actions/lms-generation.ts
// (generateFromSelectionAction, refineGeneratedArtifactAction,
// listGeneratedArtifactVersionsAction) and, for decks only,
// src/app/api/lms-generation/deck/route.ts - both read in full before this
// hook was finalized/extended.
//
// CHUNK 3b (docs/lms-module-content-generation-acceptance-criteria.md) adds
// FOUR MORE kinds - objectives, assignments, knowledgeChecks, announcements -
// that also POST to Canvas (kinds.ts's `commitMode: "save-and-post"`), on top
// of the save-a-version behaviour every kind already has. Posting is a
// SEPARATE, explicitly pressed action from the preview modal (P1), never a
// side effect of generating - see `post` below, and GENERATION_KIND_CONFIGS'
// `commitMode` (via `kindOffersPost`), which is what decides whether the
// modal even offers the "Post to Canvas" control for the kind on screen.
//
// Mirrors useLmsSyllabusButtons.ts's shape: one `busy` string so the kind
// buttons (and the preview modal's own refine/post buttons) cannot
// double-fire and all disable while any one of them runs, and reports
// success/failure through the same `setNote` channel this whole tab already
// uses.
//
// TWO departures from useLmsSyllabusButtons, both scoped to
// GENERATION-and-REFINE only - `generate`/`refine` never write to Canvas, for
// any kind, so both departures still hold for them exactly as chunk 1 left
// them:
//   - Neither calls the outer ModulesView `setBusy` - that flag gates
//     Canvas-writing controls across the whole tab, and holding it for a
//     30+ second grounded current-events search would block unrelated work
//     for no correctness reason (no Canvas state is shared). This matches
//     how useBulkItemActions/useBulkModuleActions already keep their own
//     bulk-bar-local `opBusy` separate from it.
//   - Neither calls `reload()` - reload() re-fetches the Canvas module tree,
//     which generating/refining a version never changes.
// `post` (chunk 3b, posting kinds only) is NOT covered by either departure -
// see its own comment below: it DOES hold the outer `setBusy` for its
// duration (a real Canvas write, gating the rest of the tab's Canvas-writing
// controls the same way every other write already does) and DOES call
// `reload()` on completion, so the newly created/updated page, assignment,
// quiz or announcement is reflected in the module tree - precisely what lets
// the instructor's very next step ("select that new module, generate the
// rest") work at all.
//
// VERSION HISTORY IS THE REAL STORED HISTORY, NOT A SESSION ACCUMULATOR.
// Earlier, this hook could only reach listGeneratedArtifactVersions'
// SERVER-side accessor indirectly, so it kept its own `sessionVersions`
// state and every version the hook itself created (this page load, this
// browser tab) accumulated there - a version from an earlier session was
// unreachable. lms-generation.ts now exports
// listGeneratedArtifactVersionsAction (a real Server Action, safe to call
// from a client hook), so `generate`/`refine` below call it right after a
// successful save and use ITS result as `preview.versions` - the loader is
// what populates the preview, never a locally-accumulated array. A page
// reload therefore does not lose the trail: the next generate/refine on
// this course+kind re-fetches the full stored history, which includes every
// version ever saved, not merely what this page load produced.
//
// Pure logic (offerability, the busy-state transition, the selection
// payload, the module label, the version loader, and the note text) is
// split across sibling modules under this same directory (kept out of this
// file to stay under this repo's 1000-line ceiling - a STRUCTURAL split,
// each piece re-exported here so every existing import of this file keeps
// compiling unchanged) rather than folded into a shared lib, matching
// useBulkModuleActions.ts's own OrphanNote/describeOrphans precedent for
// keeping this kind of logic close to its one hook rather than genericized
// early - see useLmsGeneration.test.ts for the executable half of this file
// (vitest here is node-env and renders no component, so the hook's React
// wiring itself is verified by reading only).

import { useEffect, useRef, useState } from "react";
import type { LlmProvider } from "@/lib/llm";
import type { CanvasModule } from "@/lib/canvas-modules";
import type { CartridgeModule } from "@/lib/cartridge-import";
import type { GeneratedArtifact } from "@/lib/supabase/generated-artifacts";
// The kind registry: a dependency-free leaf (no "@/app/actions" or Supabase
// import - see its own header comment), so a client hook can safely import
// it directly rather than duplicating its ids/labels and risking drift.
// GenerationKindId is "qa" | "currentEvents" | "decks" here - NOT the
// "anticipated-qa" / "current-events" / "deck" strings, which are the DB
// generated_artifacts.kind values (GENERATION_KIND_CONFIGS[id].artifactKind),
// a different vocabulary this hook never needs to spell itself.
import { kindSupportsTextEdit, type GenerationKindId } from "@/lib/lms-generation/kinds";
// Chunk 3d (docs/lms-script-generation-acceptance-criteria.md, S13): the one
// source of truth for the lecture-script length select's offered options,
// default, and coercion - shared with the server so a stale/hand-edited
// stored value (or an out-of-range wire value) resolves the same way on
// both sides. See that file's own header comment.
import { SCRIPT_LENGTH_OPTIONS, resolveScriptMinutes } from "@/lib/lms-generation/script-length";
import { expandModuleSelection, type SelectedMaterialItem } from "@/lib/lms-generation/materials";
// The commit PLANNER (chunk 3b) - a dependency-free leaf like kinds.ts (see
// that file's own header comment on why the executor cannot live there
// either). `target` (in `post` below) turns this section's own
// module-target UI state into the shape planModuleTarget (that file, not
// called from here - the sibling-built commit executor, commit-execute.ts,
// calls it) expects.
import type { ModuleTarget } from "@/lib/lms-generation/commit-plan";
// See lmsGenerationDiscussion.ts's own header comment (Findings 1/2/4).
import { discussionCheckpointsKey, resolveDiscussionDeadlinesForClientPost } from "./lmsGenerationDiscussion";
import { resolveDeckTemplateId, resolveDeckTemplateSelection } from "@/lib/lms-generation/deck";
import {
  artifactDownloadFormats,
  artifactDownloadFilename,
  artifactDownloadFormatLabel,
  buildArtifactDownloadBlob,
} from "@/lib/lms-generation/artifact-download";
import type { ArtifactDownloadFormat } from "@/lib/lms-generation/artifact-download";
import { DECK_PRESETS } from "@/lib/decks/presets";
import type { DeckTemplate } from "@/lib/decks/types";
import { listDeckTemplatesAction } from "@/app/actions";
import {
  generateFromSelectionAction,
  listGeneratedArtifactVersionsAction,
  postGeneratedArtifactAction,
} from "../../../actions/lms-generation";
import {
  refineGeneratedArtifactAction,
  saveEditedGeneratedArtifactAction,
} from "../../../actions/lms-generation-refine";
import { liveModuleIdsFromKeys } from "../utils";
import { triggerFileDownload } from "../../course-planning/utils";
import { LIVE_CONTENT_SOURCE, type ContentSourceContext } from "../contentSourceGating";
// Job 2 (intro-video-script bug report fix): wraps a generation call that
// may REJECT rather than only ever resolving to {error} - see that file's
// own header comment for the defect this closes.
import { runGenerationCall } from "./lmsGenerationSafeCall";
// Job 4 (downloadable diagnostic log): the client-side diagnostic record
// `generate()` builds on every generateFromSelectionAction call - see that
// file's own header comment for the full client/server split.
import { createDiagRecorder, generationDiagRecordFilename, type GenerationDiagRecord } from "./lmsGenerationDiagRecord";
// Pure logic split across sibling modules to keep this file under this
// repo's 1000-line ceiling (a STRUCTURAL split - see each module's own
// header comment for its own cohesion rationale; every doc comment moved
// verbatim with its function). Every name imported below is re-exported
// from this file (the block just after these imports) so
// GeneratedPreviewModal.tsx, GenerateFromSelectionSection.tsx and
// useLmsGeneration.test.ts keep importing everything from
// "./useLmsGeneration" with no change of their own.
import {
  GENERATION_KINDS,
  kindLabelFor,
  kindOffersPost,
  kindNeedsModuleTarget,
  postUnavailableReasonFor,
  offerableGenerationKinds,
  nextGenerationBusy,
  canStartGeneration,
  scriptMinutesKey,
  deckTemplateKey,
  readStored,
  type GenerationKindDef,
  type GenerationBusy,
  type GenerationBusyEvent,
} from "./lmsGenerationKindHelpers";
import {
  buildSelectedMaterialItems,
  buildModuleLabel,
  selectionSummaryLabel,
} from "./lmsGenerationSelection";
import {
  generationSuccessNote,
  refineSuccessNote,
  editSuccessNote,
  previewMetaText,
  postResultNote,
  versionOptionLabel,
} from "./lmsGenerationNotes";
import {
  resolvePostModuleTarget,
  postModuleOptionsFrom,
  defaultPostModuleChoiceFrom,
  type PostModuleOption,
} from "./lmsGenerationModuleTarget";
import { loadVersionsForPreview, type ListVersionsCall } from "./lmsGenerationVersions";
import {
  generateDeckApi,
  deckTemplateOptionsFrom,
  type DeckTemplateOption,
} from "./lmsGenerationDeckHelpers";
// GenerationPreviewState and UseLmsGenerationReturn - this hook's two public
// shape types - live in lmsGenerationTypes.ts (a STRUCTURAL split, same
// reasoning as every other sibling import above: keep this file under the
// repo's 1000-line ceiling with no behaviour change). Re-exported just below
// so GeneratedPreviewModal.tsx's existing
// `import type { ... GenerationPreviewState ... } from "./useLmsGeneration"`
// keeps resolving unchanged, and so useLmsGeneration.test.ts's own
// source-text checks against this file's function signature
// (`): UseLmsGenerationReturn {`) still find it here, since the function
// itself did not move.
import type { GenerationPreviewState, UseLmsGenerationReturn } from "./lmsGenerationTypes";

// -- Re-exports (implementations moved to the sibling modules imported
// above - see each one's own header comment and doc comments for the full
// design rationale, preserved verbatim from where it used to live in this
// file) --

export type { GenerationKindId };
// Re-exported so GeneratedPreviewModal.tsx can pull every hook-facing
// type through this one module, matching how it already gets
// GenerationBusy/GenerationPreviewState/etc. rather than reaching into
// lib/lms-generation/* directly (see that file's own import block).
export type { ArtifactDownloadFormat };

export type {
  GenerationKindDef,
  GenerationBusy,
  GenerationBusyEvent,
  ListVersionsCall,
  PostModuleOption,
  DeckTemplateOption,
  GenerationPreviewState,
  UseLmsGenerationReturn,
};

export {
  GENERATION_KINDS,
  kindLabelFor,
  kindOffersPost,
  kindNeedsModuleTarget,
  postUnavailableReasonFor,
  offerableGenerationKinds,
  nextGenerationBusy,
  canStartGeneration,
  scriptMinutesKey,
  buildSelectedMaterialItems,
  buildModuleLabel,
  selectionSummaryLabel,
  generationSuccessNote,
  refineSuccessNote,
  editSuccessNote,
  previewMetaText,
  postResultNote,
  versionOptionLabel,
  resolvePostModuleTarget,
  postModuleOptionsFrom,
  defaultPostModuleChoiceFrom,
  loadVersionsForPreview,
  deckTemplateOptionsFrom,
};

/** P5: the sentinel TextField option value for "create a new module by name"
 * in the post-target select, distinct from every real Canvas module id
 * (always a positive number, so a non-numeric sentinel can never collide).
 *
 * Owned by src/lib/syllabus-ack-quiz-target.ts (docs/syllabus-ack-quiz-
 * module-target-acceptance-criteria.md, AC4) - a dependency-free lib must
 * not reach into a "use client" hook, so the constant moved there.
 * Re-exported here (a plain `export ... from`, no local binding needed now
 * that resolvePostModuleTarget itself lives in lmsGenerationModuleTarget.ts)
 * so every existing consumer of THIS module (GeneratedPreviewModal.tsx,
 * useLmsGeneration.test.ts) keeps compiling with no import change of its
 * own. */
export { NEW_MODULE_TARGET_VALUE } from "@/lib/syllabus-ack-quiz-target";

// -- Hook --
//
// GenerationPreviewState and UseLmsGenerationReturn - the return-shape
// contract for the hook below - moved to lmsGenerationTypes.ts (imported
// above, re-exported in the block just above this one) to keep this file
// under the repo's 1000-line ceiling. See that file's own header comment for
// the full rationale; every doc comment on every field moved there verbatim.

export function useLmsGeneration(
  courseUrl: string,
  provider: LlmProvider,
  selectedMaterialItems: () => SelectedMaterialItem[],
  selectedModules: Set<string>,
  modules: CanvasModule[],
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  /** The tab-wide Canvas-writing busy flag (ModulesView.tsx's own `busy`
   * state) - C1: held ONLY while `post` is in flight, never while
   * generate/refine run (see this file's own header comment for why those
   * two departures still stand). Named `setBusy` to match
   * useLmsSyllabusButtons.ts's own outer-flag parameter exactly; this hook's
   * OWN internal busy state is `setLocalBusy` below, the same split that
   * file already uses, for the same reason - a hook-local `busy` and the
   * tab-wide flag are two different things that happen to share a shape. */
  setBusy: (b: boolean) => void,
  /** Re-fetch the Canvas module tree - C1: called once `post` completes (any
   * outcome that reached a real PostSummary, not only "success" - see
   * `post`'s own comment for why), never after a plain generate/refine. */
  reload: () => void,
  /** A parsed course-export tree, when one is available - optional and
   * trailing so every existing caller (ModulesView.tsx does not thread
   * ContentTab's exportContentRef this far down yet - see
   * docs/REGRESSION.md entry 263's own "Limits" section) compiles unchanged.
   * Needed for the CLIENT-side half of expandModuleSelection's live/export
   * split - see that function's own header comment (materials.ts) for why
   * export module expansion cannot happen server-side at all. */
  exportModules?: CartridgeModule[] | null,
  /** An export selection's course_hub row id - the generation counterpart of
   * useSelectionDownload.ts's own `courseId` param (see ModulesView.tsx's
   * `exportCourseId` prop doc comment for the full threading story from
   * ContentTab). Undefined for a live selection. AC1/AC2 defect fix: this is
   * what lets generation identify an export-sourced course at all -
   * previously `courseUrl` alone (always "" for an export selection) was the
   * ONLY identifier sent, so `resolveLmsCourseRowAction("")` could never
   * match and every generation kind failed with "No saved course is linked
   * to ." */
  exportCourseId?: string,
  /** Which Course Content source is active, and whether a live Canvas course
   * is linked - see contentSourceGating.ts. Defaults to LIVE_CONTENT_SOURCE
   * so every existing caller compiles and behaves unchanged; only `post`'s
   * own courseWrite gate (AC3) reads this - see postUnavailableReasonFor. */
  sourceContext: ContentSourceContext = LIVE_CONTENT_SOURCE,
  /**
   * M12 (docs/module-intro-video-script-acceptance-criteria.md, finding
   * 15): ModulesView's own `acronym` prop (ContentTab's `activeInstitution`,
   * threaded through unchanged - see ContentTab.tsx's `<ModulesView
   * acronym={activeInstitution || undefined} ...>`) - the SAME value
   * course-canvas-url-match.ts's `findCourseForCanvasUrl` reads whenever a
   * Canvas-URL match lacks a host. See that file for the current matching
   * rule rather than restating it here - it is owned there, not here, and
   * this comment deliberately does not duplicate its details. Threaded to
   * every by-URL resolve call
   * this hook makes: generateFromSelectionAction, the deck Route Handler
   * (generateDeckApi), listGeneratedArtifactVersionsAction (via
   * loadVersionsForPreview), postGeneratedArtifactAction,
   * refineGeneratedArtifactAction and saveEditedGeneratedArtifactAction
   * (src/app/actions/lms-generation-refine.ts - both now accept the same
   * `acronym` field and thread it into their own `resolveGenerationCourseRow`
   * call, closing the gap where a host-less refine/save-edit write could not
   * resolve its course row even though generation itself could). Optional
   * and trailing so every existing caller still compiles unchanged - but no
   * longer merely a nice-to-have: without it threaded, a host-less selection
   * (the ONLY shape CoursePicker.tsx/LmsCell.tsx ever emit) may fail to
   * resolve - see course-canvas-url-match.ts for exactly when, since that
   * rule belongs to and is maintained in that file, not restated here.
   */
  acronym?: string
): UseLmsGenerationReturn {
  // `setLocalBusy` - see this hook's own `setBusy` PARAMETER doc comment
  // above for why the outer tab-wide flag and this hook-local one need
  // distinct names now that both exist in the same scope.
  const [busy, setLocalBusy] = useState<GenerationBusy>("");
  // Job 3 (visible-in-the-row error): the Generate row's OWN error signal,
  // colocated with the button that failed - separate from `setNote` (which
  // renders in ContentTab.tsx, outside ModulesView's sticky header - see
  // GenerateFromSelectionSection.tsx's own header comment for why that is
  // not enough on its own, mirroring VisualizerCoverageSection.tsx's
  // identical reasoning). Cleared at the start of every new attempt, set on
  // a failure from either branch of `generate` below.
  const [generationError, setGenerationError] = useState<string | null>(null);
  // Job 4 (downloadable diagnostic log): the heavy payload lives in a REF
  // (read only inside downloadDiagLog, an event handler, never during
  // render - this repo's react-hooks/refs lint rule forbids the latter).
  // `hasDiagLog` is a small, separate boolean piece of STATE, set alongside
  // the ref at each of `generate`'s two outcomes below, purely so the
  // download control's visibility can react to a new record the normal way.
  const lastDiagRef = useRef<GenerationDiagRecord | null>(null);
  const [hasDiagLog, setHasDiagLog] = useState(false);
  const [preview, setPreview] = useState<GenerationPreviewState | null>(null);
  const [instructions, setInstructions] = useState("");
  const [refining, setRefining] = useState(false);
  const [downloading, setDownloading] = useState<ArtifactDownloadFormat | null>(null);
  const [posting, setPosting] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  // AC10: deliberately no `ta-` localStorage key here - see
  // lmsGenerationModuleTarget.ts's own comment for why this control's value
  // is a function of the CURRENT selection, not something to persist.
  const [postModuleChoice, setPostModuleChoice] = useState("");
  const [postNewModuleName, setPostNewModuleName] = useState("");
  // AC8.5: provenance is STATE, not derived by comparing postModuleChoice to
  // the seeded value - an instructor who changes the select away and back
  // would otherwise resurrect the hint. Set true only by finishGenerateSuccess's
  // own seed write (AC4); cleared by choosePostModule below the moment the
  // select's own onChange fires.
  const [postTargetFromSelection, setPostTargetFromSelection] = useState(false);
  // Seeded synchronously with the built-in presets (DECK_PRESETS is a pure,
  // zero-network const), so the deck template picker is never empty even
  // before the effect below finishes loading this user's own saved
  // deck_templates rows - see resolveDeckTemplateSelection's own doc comment
  // (deck.ts) for the refusal path this feeds when nothing is selected.
  const [templates, setTemplates] = useState<DeckTemplate[]>(DECK_PRESETS);
  // Persisted per course, like scriptMinutes and useDiscussionCheckpoints
  // below (AC9 gap closed 2026-08-23 - this select previously persisted
  // nothing and recorded no reason). Seeded from the stored value WITHOUT
  // validating it here on purpose: at this point only DECK_PRESETS are known,
  // and a remembered id naming one of the instructor's own deck_templates
  // rows would be wrongly discarded. Reconciliation against the real list
  // happens once the templates load - see resolveDeckTemplateId in the effect
  // below, and that function's own doc comment for the staleness it handles.
  const [templateId, setTemplateId] = useState<string>(
    () => (readStored(deckTemplateKey(courseUrl)) ?? "").trim() || (DECK_PRESETS[0]?.id ?? "")
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(deckTemplateKey(courseUrl), templateId);
  }, [courseUrl, templateId]);
  // S13: scripts-only length select, persisted per course. Read through
  // resolveScriptMinutes so a stale/hand-edited/unoffered stored value falls
  // back to DEFAULT_SCRIPT_MINUTES instead of rendering an unselectable
  // option - same reasoning as scriptMinutesKey's own doc comment above.
  const [scriptMinutes, setScriptMinutes] = useState<number>(() =>
    resolveScriptMinutes(readStored(scriptMinutesKey(courseUrl)))
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(scriptMinutesKey(courseUrl), String(scriptMinutes));
  }, [courseUrl, scriptMinutes]);

  // Checkpoints are explicit opt-in, off by default - persisted per course
  // exactly like scriptMinutes above.
  const [useDiscussionCheckpoints, setUseDiscussionCheckpoints] = useState<boolean>(
    () => readStored(discussionCheckpointsKey(courseUrl)) === "true"
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(discussionCheckpointsKey(courseUrl), String(useDiscussionCheckpoints));
  }, [courseUrl, useDiscussionCheckpoints]);

  // setState-in-effect idiom (this repo's own convention): an inline async
  // IIFE with a `cancelled` flag, setState only after the await - never a
  // synchronous setState reached directly from the effect body.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listDeckTemplatesAction();
      if (cancelled || "error" in result) return;
      const loaded = [...DECK_PRESETS, ...result.templates];
      setTemplates(loaded);
      // Now - and only now - is the real offer list known, so a remembered
      // template id can finally be checked against it. An updater keeps
      // templateId out of this effect's deps, so persisting a new selection
      // does not re-run the fetch.
      setTemplateId((prev) => resolveDeckTemplateId(prev, loaded));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const kinds = offerableGenerationKinds(selectedMaterialItems().length, selectedModules.size);

  const finishGenerateError = (message: string) => {
    setLocalBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
    setNote({ kind: "error", text: message });
  };

  const finishGenerateSuccess = async (
    kindId: GenerationKindId,
    artifact: GeneratedArtifact,
    notes: string[],
    selectionLabel: string,
    // AC4: the post-target default (defaultPostModuleChoiceFrom's own
    // return - "" for "no defensible default"), computed once by `generate`
    // right after `moduleIds` and threaded in here from BOTH its call sites
    // (the decks branch and the generateFromSelectionAction branch) - this is
    // the ONLY place it is applied. `finishGenerateSuccess` is the one opener
    // of the preview that both routes converge on, so seeding here (and not
    // in `generate`'s body, which also runs on the refusal/error paths) is
    // what makes "written on every successful generation, never on a
    // refusal or error" structurally true rather than true by vigilance.
    defaultModuleChoice: string,
    // D3/AC14i: see GenerationPreviewState's own doc comment.
    courseStartDate?: string | null
  ) => {
    const kindLabel = kindLabelFor(kindId);
    const versions = await loadVersionsForPreview(
      listGeneratedArtifactVersionsAction,
      courseUrl,
      kindId,
      artifact,
      exportCourseId,
      acronym
    );
    // AC6/AC7: unconditional - a blank default CLEARS the target rather than
    // preserving a stale one from a previous, different selection, and the
    // "New module..." name field is always cleared alongside, blank seeds
    // included. AC8.5: the raw useState setter, not `choosePostModule` -
    // this IS the seed the flag should reflect, not a change that should
    // clear it.
    setPostTargetFromSelection(defaultModuleChoice !== "");
    setPostModuleChoice(defaultModuleChoice);
    setPostNewModuleName("");
    setPreview({ kindId, kindLabel, versions, selectedVersion: artifact.version, notes, courseStartDate });
    setInstructions("");
    setLocalBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
    setNote({ kind: "success", text: generationSuccessNote(kindId, artifact.version, selectionLabel) });
  };

  const generate = (kindId: GenerationKindId) => {
    if (!canStartGeneration(busy)) return;
    const materialItems = buildSelectedMaterialItems(selectedMaterialItems());
    const moduleKeys = Array.from(selectedModules);
    if (materialItems.length === 0 && moduleKeys.length === 0) return;

    // LIVE and EXPORT module selections are expanded differently - see
    // expandModuleSelection's own header comment (materials.ts) for the full
    // rationale. Two calls to that SAME pure function, each isolating one
    // half of the work:
    //   - `expandedForLabel` passes this hook's own (possibly stale) client
    //     `modules` tree AND `exportModules`, to build ONLY the
    //     display-facing moduleLabel/selectionLabel below - never sent
    //     anywhere, so staleness here cannot change what gets generated
    //     (docs/REGRESSION.md entry 262 check 5).
    //   - `itemsForServer` passes an EMPTY live tree, so it expands ONLY the
    //     export half of the selection into real items right now - there is
    //     no server-side fetch path for a course export (entry 263 check 7).
    //     Any live module key contributes nothing to this call; it is sent
    //     instead as `moduleIds` below, which generateFromSelectionAction
    //     (or, for decks, the deck Route Handler) expands itself server-side
    //     from a FRESH read, never this stale client tree.
    const expandedForLabel = expandModuleSelection(materialItems, moduleKeys, modules, exportModules ?? undefined);
    const moduleLabel = buildModuleLabel(expandedForLabel, modules);
    const selectionLabel = selectionSummaryLabel(expandedForLabel.length, moduleKeys.length);

    const itemsForServer = expandModuleSelection(materialItems, moduleKeys, [], exportModules ?? undefined);
    const moduleIds = Array.from(liveModuleIdsFromKeys(moduleKeys));
    // AC4: computed once per generation, here (not inside either async IIFE
    // below, so it exists identically for both routes). Threaded as
    // finishGenerateSuccess's new final parameter from both call sites below;
    // never applied here directly (see that function's own comment for why).
    // Why `materialItems` and NOT `expandedForLabel`: the equivalence proof
    // lives with the function it argues about - see the "MATERIALITEMS VS
    // EXPANDEDFORLABEL" note in lmsGenerationModuleTarget.ts.
    const defaultModuleChoice = defaultPostModuleChoiceFrom(materialItems, moduleKeys);

    // DECKS run through the Route Handler, not generateFromSelectionAction -
    // see generateDeckApi's own comment for why. Refused client-side first
    // (no network call) when no template is picked, mirroring the
    // zero-selection check just above; the route enforces the identical
    // rule server-side too (defense in depth, same named reason either way -
    // see resolveDeckTemplateSelection, deck.ts).
    if (kindId === "decks") {
      const templateResolution = resolveDeckTemplateSelection(templateId);
      if (!templateResolution.ok) {
        setNote({ kind: "error", text: templateResolution.reason });
        return;
      }
      void (async () => {
        setLocalBusy((prev) => nextGenerationBusy(prev, { type: "start", kind: kindId }));
        setNote(null);
        // Job 3: cleared at the start of every attempt, same as `setNote`.
        setGenerationError(null);
        // Not wrapped in runGenerationCall (Job 2): generateDeckApi
        // (lmsGenerationDeckHelpers.ts) already has its OWN internal
        // try/catch around its fetch call and never rejects - see that
        // function's own doc comment. Job 4's diag log is also scoped to the
        // generateFromSelectionAction path below, not decks - see
        // lmsGenerationDiagRecord.ts's own header comment.
        const result = await generateDeckApi({
          courseUrl,
          courseId: exportCourseId,
          items: itemsForServer,
          moduleIds,
          moduleLabel,
          templateId: templateResolution.templateId,
          provider,
          // M12: see generateDeckApi's own doc comment for why this field is
          // not part of DeckGenerationRequest's declared shape yet.
          acronym,
        });
        if ("error" in result) {
          finishGenerateError(result.error);
          setGenerationError(result.error);
          return;
        }
        await finishGenerateSuccess(kindId, result.artifact, result.notes, selectionLabel, defaultModuleChoice);
      })();
      return;
    }

    // Job 4: timing starts here ("timings including whether the promise
    // RETURNED or REJECTED"), around exactly the call this feature
    // diagnoses. `recordDiag` (createDiagRecorder, lmsGenerationDiagRecord.ts)
    // closes over every fact common to both outcomes below, so each branch
    // only states what differs.
    const startedAt = Date.now();
    const recordDiag = createDiagRecorder(lastDiagRef, setHasDiagLog, {
      kindId,
      itemCount: materialItems.length,
      moduleKeys,
      expandedItemCount: itemsForServer.length,
      moduleLabel,
      scriptMinutesRequested: scriptMinutes,
      startedAt,
    });

    void (async () => {
      setLocalBusy((prev) => nextGenerationBusy(prev, { type: "start", kind: kindId }));
      setNote(null);
      setGenerationError(null);
      // Job 2 FIX: a Server Action call CAN reject on its own (offline
      // browser, a dropped connection, an RPC-layer failure) even though
      // generateFromSelectionAction's own body always catches its internal
      // errors and returns {error} - see lmsGenerationSafeCall.ts's header.
      const result = await runGenerationCall(() =>
        generateFromSelectionAction({
          courseUrl,
          courseId: exportCourseId,
          kind: kindId,
          items: itemsForServer,
          moduleIds,
          moduleLabel,
          provider,
          // S7/S12: sent unconditionally, not only for kindId === "scripts" -
          // the server ignores it for every other kind (GenerateFromSelectionInput's
          // own doc comment, src/app/actions/lms-generation.ts), and sending it
          // unconditionally keeps this call site a flat object literal rather
          // than a per-kind conditional spread for a field only one branch
          // reads server-side.
          targetMinutes: scriptMinutes,
          // M12: see this hook's own `acronym` parameter doc comment.
          acronym,
        })
      );
      const endedAt = Date.now();
      if ("error" in result) {
        finishGenerateError(result.error);
        setGenerationError(result.error);
        recordDiag({
          endedAt,
          rejected: "rejected" in result,
          ok: false,
          errorText: result.error,
          courseNotLinked: "courseNotLinked" in result ? result.courseNotLinked : undefined,
          setPreviewReached: false,
          serverDiag: "diag" in result ? result.diag : undefined,
        });
        return;
      }
      await finishGenerateSuccess(kindId, result.artifact, result.notes, selectionLabel, defaultModuleChoice, result.startDate); // D3
      // finishGenerateSuccess reaches setPreview unconditionally (no early
      // return before it) - see lmsGenerationDiagRecord.ts's own
      // `setPreviewReached` doc comment for why this is stated explicitly.
      recordDiag({ endedAt, rejected: false, ok: true, setPreviewReached: true, serverDiag: result.diag });
    })();
  };

  /** Job 4: builds and triggers the actual download, reusing
   * triggerFileDownload (course-planning/utils.ts) - the SAME mechanism
   * `download` above already uses for a generated artifact, per the
   * coordinator's brief ("reuse the existing mechanism; do not invent
   * one"). No-op when there is nothing captured yet. */
  const downloadDiagLog = () => {
    const record = lastDiagRef.current;
    if (!record) return;
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    triggerFileDownload(blob, generationDiagRecordFilename(record));
  };

  const closePreview = () => {
    setPreview(null);
    setInstructions("");
  };

  const selectVersion = (version: number) => {
    setPreview((prev) => (prev ? { ...prev, selectedVersion: version } : prev));
  };

  const refine = () => {
    if (!preview || !canStartGeneration(busy) || !instructions.trim()) return;
    const { kindId, kindLabel, courseStartDate } = preview;
    const currentVersion = preview.versions.find((v) => v.version === preview.selectedVersion);
    const currentText = currentVersion?.text ?? "";

    void (async () => {
      setLocalBusy((prev) => nextGenerationBusy(prev, { type: "start", kind: kindId }));
      setRefining(true);
      setNote(null);
      // D1 FIX: see lmsGenerationSafeCall.ts's own header for why this needs
      // the same runGenerationCall wrapper generate() already has.
      const result = await runGenerationCall(() =>
        refineGeneratedArtifactAction({
          courseUrl,
          courseId: exportCourseId,
          // M12: see this hook's own `acronym` parameter doc comment.
          acronym,
          kind: kindId,
          currentText,
          // Sent unconditionally for EVERY kind, and no longer decks-only on
          // the server either. `currentStructured` is what the decks AND
          // knowledgeChecks refine branches revise instead of `currentText`
          // (re-parsing rendered text back into slides/questions is the lossy
          // round-trip kinds.ts rejects); `currentTitle` is what objectives,
          // assignments and announcements carry forward, because their titles
          // are not derivable from the revised text and postGeneratedArtifactAction
          // falls back to the generic kind label without one. Dropping either
          // here silently degrades a posted page/assignment/announcement's title
          // and makes a refined knowledge check unpostable - see
          // refineGeneratedArtifactAction's own branches.
          currentTitle: currentVersion?.title,
          currentStructured: currentVersion?.structured,
          instructions: instructions.trim(),
          provider,
        })
      );
      if ("error" in result) {
        setLocalBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
        setRefining(false);
        setNote({ kind: "error", text: result.error });
        return;
      }

      const versions = await loadVersionsForPreview(
        listGeneratedArtifactVersionsAction,
        courseUrl,
        kindId,
        result.artifact,
        exportCourseId,
        acronym
      );
      setPreview({ kindId, kindLabel, versions, selectedVersion: result.artifact.version, notes: [], courseStartDate });
      setInstructions("");
      setLocalBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
      setRefining(false);
      setNote({ kind: "success", text: refineSuccessNote(kindId, result.artifact.version) });
    })();
  };

  /**
   * E1-E13 (chunk 3e, docs/generated-artifact-editing-acceptance-criteria.md):
   * save hand-edited text as a NEW version - never an overwrite (E2), and
   * refused here too (E4, defense in depth) for a kind whose `structured`
   * payload is the authoritative half, even though the modal never offers
   * the control for one (kindSupportsTextEdit - "decks"/"knowledgeChecks").
   *
   * `text` comes from the CALLER (the modal's own local `draft` state - see
   * GeneratedPreviewModal.tsx's own E9 comment for how it stays seeded to
   * the right version) - this trusts it as-is rather than re-deriving it
   * from `preview`, unlike `refine`'s own `currentText` lookup, because the
   * whole point of an edit is that the caller's text may already differ
   * from what is stored.
   *
   * Copies `refine`'s own success tail EXACTLY (E12): re-fetch through
   * `loadVersionsForPreview`, then `setPreview` with the new version
   * selected - `currentText` in the modal (and `selectedPreviewVersion`
   * below) are both derived from `preview` on every render, so replacing it
   * is what makes the modal show the new version with no second reload
   * anywhere in this file.
   */
  const saveEdit = (text: string) => {
    if (!preview || !canStartGeneration(busy) || !kindSupportsTextEdit(preview.kindId)) return;
    // E5: refused here too, not only via the Save button's own disabled
    // state - the same defense-in-depth posture generate/refine already
    // apply to their own upfront guards.
    if (!text.trim()) {
      setNote({ kind: "error", text: "Cannot save an empty edit." });
      return;
    }
    const { kindId, kindLabel, courseStartDate } = preview;
    const currentVersion = preview.versions.find((v) => v.version === preview.selectedVersion);

    void (async () => {
      setLocalBusy((prev) => nextGenerationBusy(prev, { type: "start", kind: kindId }));
      setSavingEdit(true);
      setNote(null);
      // D1 FIX: see lmsGenerationSafeCall.ts's own header.
      const result = await runGenerationCall(() =>
        saveEditedGeneratedArtifactAction({
          courseUrl,
          courseId: exportCourseId,
          // M12: see this hook's own `acronym` parameter doc comment.
          acronym,
          kind: kindId,
          text,
          currentTitle: currentVersion?.title,
        })
      );
      if ("error" in result) {
        // E13: `preview` is left untouched on a failed save - the modal's
        // own draft state is never cleared by this hook, so the instructor's
        // typing survives a network error intact.
        setLocalBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
        setSavingEdit(false);
        setNote({ kind: "error", text: result.error });
        return;
      }

      const versions = await loadVersionsForPreview(
        listGeneratedArtifactVersionsAction,
        courseUrl,
        kindId,
        result.artifact,
        exportCourseId,
        acronym
      );
      setPreview({ kindId, kindLabel, versions, selectedVersion: result.artifact.version, notes: [], courseStartDate });
      setLocalBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
      setSavingEdit(false);
      setNote({ kind: "success", text: editSuccessNote(kindId, result.artifact.version) });
    })();
  };

  /**
   * P1/P2/P5 (chunk 3b): post the version currently on screen to Canvas.
   * NOT reachable unless the previewed kind offers it (kindOffersPost) - the
   * modal only renders the "Post to Canvas" control in that case (P1: "shown
   * ONLY when the previewed kind's commitMode is save-and-post"), but this
   * still guards the same way generate/refine do, defensively.
   *
   * P2 ("the artifact is saved before anything is posted") is already true
   * by construction here: `post` only ever operates on an ALREADY-SAVED
   * `preview.versions` entry (found by `preview.selectedVersion`, the exact
   * version `download` above already targets) - there is no path from this
   * hook that posts freshly-generated, not-yet-saved content.
   *
   * C1: unlike generate/refine, this DOES hold the outer tab-wide `setBusy`
   * for its duration (a real Canvas write) and DOES call `reload()` once the
   * server call returns a real PostSummary - on "success" AND "partial" AND
   * "failed" alike, not only "success": even a "failed" summary can follow a
   * step that changed nothing, but reloading unconditionally here costs one
   * harmless extra fetch and removes any need for this hook to duplicate
   * summarizePostOutcome's own classification of which failures created
   * something and which did not. `reload()` is skipped only on a genuine
   * top-level `error` (course not linked, a thrown exception before any
   * Canvas call was attempted) - see postGeneratedArtifactAction's own
   * GenerationFailure return, reused here as-is.
   */
  const post = () => {
    if (!preview || !canStartGeneration(busy) || !kindOffersPost(preview.kindId)) return;

    // AC3/AC4 (defect fix): posting writes to Canvas, so it stays refused
    // for an export selection - reusing gateOperation's own "courseWrite"
    // wording (postUnavailableReasonFor above), never a new message. Checked
    // here, defensively, the same way the module-target validation just
    // below is - even though the modal is expected to show this reason
    // instead of a working control (GeneratedPreviewModal's own
    // `postUnavailableReason` prop), a click must never reach
    // postGeneratedArtifactAction and fail with a raw Canvas error.
    const postGateReason = postUnavailableReasonFor(preview.kindId, sourceContext);
    if (postGateReason) {
      setNote({ kind: "error", text: postGateReason });
      return;
    }

    // "course-level" kinds (announcements) need no module target at all - a
    // Canvas announcement has no module to choose (kindNeedsModuleTarget's
    // own doc comment) - so the picker's own UI state is neither read nor
    // required for them, and `target` is left `undefined`, matching
    // postGeneratedArtifactAction's own optional `target` field
    // (lms-generation.ts).
    let target: ModuleTarget | undefined;
    if (kindNeedsModuleTarget(preview.kindId)) {
      const targetResolution = resolvePostModuleTarget(postModuleChoice, postNewModuleName);
      if (!targetResolution.ok) {
        setNote({ kind: "error", text: targetResolution.reason });
        return;
      }
      target = targetResolution.target;
    }

    const artifact = preview.versions.find((v) => v.version === preview.selectedVersion);
    if (!artifact) return;
    const { kindId, courseStartDate } = preview;

    // D3/AC14i (THE TIMEZONE FIX): computed HERE in the browser - see
    // lmsGenerationDiscussion.ts's own doc comment for Findings 1/2/4.
    const discussionDeadlines = resolveDiscussionDeadlinesForClientPost(kindId, target, modules, courseStartDate);

    void (async () => {
      setLocalBusy((prev) => nextGenerationBusy(prev, { type: "start", kind: kindId }));
      setPosting(true);
      setBusy(true);
      setNote(null);
      // D1 FIX - see lmsGenerationSafeCall.ts's own header.
      const result = await runGenerationCall(() =>
        postGeneratedArtifactAction({
          courseUrl,
          courseId: exportCourseId,
          kind: kindId,
          artifactId: artifact.id,
          target,
          discussionDeadlines, // D3: undefined for every kind but "introDiscussion".
          useDiscussionCheckpoints, // Sent unconditionally, like targetMinutes; ignored server-side elsewhere.
          // M12: see this hook's own `acronym` parameter doc comment.
          acronym,
        })
      );
      setLocalBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
      setPosting(false);
      setBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      // W6: result.notes carries what summary.text has no channel for
      // (AC14c/AC21/AC14g) - undefined, so unchanged, for every other kind.
      setNote(postResultNote(result.summary, result.notes));
      reload();
    })();
  };

  // AC8.6: wraps the raw useState setter and is returned under the EXISTING
  // key name `setPostModuleChoice` - see the return object below. The key is
  // load-bearing (ModulesView.tsx binds it by name, and
  // generatedPreviewModal.wiring.test.ts reads that binding by name), so the
  // wrapper is a drop-in, not a rename. AC8.7 (FORBIDDEN elsewhere in this
  // file): clearing the flag here, on the select's own onChange, is the only
  // correct place - a useEffect keyed on postModuleChoice would also fire on
  // finishGenerateSuccess's own seed write and clear the flag it just set.
  const choosePostModule = (v: string) => {
    setPostTargetFromSelection(false);
    setPostModuleChoice(v);
  };

  // The version the preview modal currently has ON SCREEN - AC 1 of
  // docs/generated-artifact-download-acceptance-criteria.md: "not the newest
  // version, not the current-marked one", whatever `selectedVersion` points
  // at. Shared by `downloadFormats` (below) and `download` so both always
  // agree on which row is being offered/built - mirrors `refine`'s own
  // `currentVersion` lookup a few lines up.
  const selectedPreviewVersion = preview?.versions.find((v) => v.version === preview.selectedVersion);

  const downloadFormats = selectedPreviewVersion ? artifactDownloadFormats(selectedPreviewVersion) : [];

  const download = (format: ArtifactDownloadFormat) => {
    // Three independent no-op guards (AC 7): no preview to download from, a
    // generate/refine already running, or a download already in flight -
    // matches this hook's other entry points' own upfront-guard style
    // (generate/refine above).
    if (!preview || busy !== "" || downloading !== null) return;
    const artifact = selectedPreviewVersion;
    // Defensive only: downloadFormats/artifactDownloadFormats would already
    // have excluded `format` from what the UI offers if this were false, so
    // this branch should be unreachable in practice.
    if (!artifact) return;
    const { kindLabel } = preview;

    void (async () => {
      setDownloading(format);
      try {
        const blob = await buildArtifactDownloadBlob(artifact, kindLabel, format);
        const filename = artifactDownloadFilename(artifact, kindLabel, format);
        triggerFileDownload(blob, filename);
      } catch (e) {
        // Surfaces through the SAME setNote channel generate/refine already
        // use (AC 6) - never an unhandled rejection, and the preview modal
        // is never closed here, so the instructor's place in the version
        // history is not lost just because a download failed.
        const message = e instanceof Error ? e.message : String(e);
        setNote({
          kind: "error",
          text: `Could not build the ${artifactDownloadFormatLabel(format)} download: ${message}`,
        });
      } finally {
        setDownloading(null);
      }
    })();
  };

  return {
    busy,
    // Job 3: the Generate row's own always-visible error, separate from
    // `setNote`'s tab-wide banner.
    generationError,
    // Job 4: the downloadable diagnostic log control.
    hasDiagLog,
    downloadDiagLog,
    kinds,
    generate,
    templates: deckTemplateOptionsFrom(templates),
    templateId,
    setTemplateId,
    scriptLengthOptions: SCRIPT_LENGTH_OPTIONS,
    scriptMinutes,
    setScriptMinutes,
    useDiscussionCheckpoints,
    setUseDiscussionCheckpoints,
    preview,
    closePreview,
    selectVersion,
    instructions,
    setInstructions,
    refine,
    refining,
    downloadFormats,
    downloading,
    download,
    offersPost: preview ? kindOffersPost(preview.kindId) : false,
    postNeedsModuleTarget: preview ? kindNeedsModuleTarget(preview.kindId) : false,
    postModuleOptions: postModuleOptionsFrom(modules),
    postModuleChoice,
    setPostModuleChoice: choosePostModule,
    postTargetFromSelection,
    postNewModuleName,
    setPostNewModuleName,
    post,
    posting,
    postUnavailableReason: preview ? postUnavailableReasonFor(preview.kindId, sourceContext) : null,
    canEditText: preview ? kindSupportsTextEdit(preview.kindId) : false,
    saveEdit,
    savingEdit,
  };
}
