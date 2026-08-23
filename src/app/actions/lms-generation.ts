"use server";

// Server actions for "generate content from the instructor's LMS selection"
// (chunk 1): resolve the LMS tab's Canvas URL to a saved course_hub row,
// gather materials from the caller's already-resolved selection, delegate to
// an EXISTING generator, then persist a new generated_artifacts version. A
// sibling agent builds the UI (src/app/components/content-tab/**) that calls
// these actions - not touched here.
//
// DELEGATE, DO NOT REINVENT: both of chunk 1's kinds already have working
// generators - generateLectureQaAction (anticipated Q&A,
// src/app/actions/course-planning-lecture.ts) and researchCurrentEventsAction
// (current events, src/app/actions/current-events.ts) - called here
// UNCHANGED, the same functions COURSE_BUILD's own six-generator consolidation
// (src/lib/workflows/registry/weekly-generator.ts) delegates to. That
// consolidation's own header comment records the scar from the alternative:
// one of six duplicated per-week loops had silently lost a quota
// short-circuit, so a 429 on week one burned every remaining week. Calling
// the existing actions directly means this file cannot repeat that mistake -
// there is no new LLM orchestration loop here to have a bug in.
//
// docs/REGRESSION.md entries 260 (the selection-layer baseline) and 261
// (the identity + storage infrastructure this sits on) were read before
// writing this file.
//
// listGeneratedArtifactVersionsAction was added after the sibling UI hook
// (useLmsGeneration.ts) landed its own first version and explicitly flagged,
// in its own header comment, that its AC expected "a generate action per
// kind, a refine action, and version listing" - this file originally shipped
// only the first two. That hook worked around the gap with session-scoped
// history rather than silently guessing at a shape; this wraps the
// already-existing listGeneratedArtifactVersions accessor
// (src/lib/supabase/generated-artifacts.ts) the same way the other two
// actions wrap their own persistence/generation calls. useLmsGeneration.ts
// now calls this action after every generate/refine so its preview always
// shows the real stored history rather than a session accumulator.
//
// WHOLE-MODULE SELECTIONS: generateFromSelectionAction also accepts
// `moduleIds` (Canvas module ids selected as WHOLE modules, not individual
// items - docs/REGRESSION.md entry 260 check 1's second, orthogonal
// selection Set). When present, this file fetches the live module tree
// itself via listCourseContentAction - a FRESH read, never the caller's
// (browser's) possibly-stale one - and expands each module to its items via
// materials.ts's expandModuleSelection (pure, deduped against any
// individually-selected `items` so a mixed selection never double-counts).
//
// CHUNK 3b (docs/lms-module-content-generation-acceptance-criteria.md) adds
// two things to this file:
//   - R3: generateFromSelectionAction's dispatch is now a `switch` over
//     `input.kind` with a `never`-checked default, covering all six
//     generatable kinds explicitly (decks is refused earlier and excluded by
//     narrowing - see that guard's own comment). A stray/unhandled kind
//     throws a NAMED error instead of silently falling into a neighbour's
//     branch, which is exactly the hazard the old `if (kind === "qa")
//     {...} else {...}` chain risked (see this file's ORIGINAL header
//     comment, preserved above, and the guard at the top of
//     generateFromSelectionAction).
//   - P1-P5: a new, separate `postGeneratedArtifactAction` posts an
//     already-saved version to Canvas. Generation never posts - it only
//     ever calls saveGeneratedArtifactVersion, exactly as before. Posting
//     re-reads the version fresh from the database (never trusts client-
//     supplied content - the preview modal can have been open a while),
//     refuses a "save-version" kind by name, and uses commit-plan.ts's pure
//     planModuleTarget/planPostSteps/summarizePostOutcome plus commit-
//     execute.ts's executePostPlanSteps to decide-then-do the actual Canvas
//     writes, via a real CanvasWriters (LIVE_CANVAS_WRITERS below) built the
//     same way LIVE_FETCHERS already wires materials.ts's MaterialsFetchers
//     to this app's own actions.
//
// docs/learning-resources-page-acceptance-criteria.md (A11) adds one more
// `case "resources":` to the switch below, delegating to a new, separate
// generator - generateLearningResourcesForSelection
// (src/app/actions/learning-resources-generator.ts) - the same
// delegate-do-not-reinvent pattern every other case already follows. It is
// "save-and-post" like "objectives" (its commitMeta is byte-identical in
// shape - kinds.ts's resourcesKindConfig comment), so nothing in
// postGeneratedArtifactAction, commit-plan.ts, commit-execute.ts or
// post-content.ts changes for it (A12).
import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { generateLectureQaAction } from "./course-planning-lecture";
import { researchCurrentEventsAction } from "./current-events";
import { generateModuleObjectivesForAssignment } from "./module-objectives-generator";
import { generateAssignmentAction } from "./llm-content";
import { generateKnowledgeCheckAction } from "./knowledge-check";
import { draftAnnouncementAction } from "./messaging";
import { generateModuleIntroScriptAction } from "./media";
import { generateLearningResourcesForSelection } from "./learning-resources-generator";
import { generateIntroDiscussionForSelection } from "./intro-discussion-generator";
import { listCourseContentAction, createModuleAction } from "./canvas-modules";
// LIVE_FETCHERS/LIVE_CANVAS_WRITERS (and every action import only THEY
// needed - getPageAction, previewFileAction, fetchCanvasMetaAction,
// createPageAction, updatePageAction, createModuleItemAction,
// createCourseAssignmentAction, createGradableAction, createQuizQuestionAction,
// bulkUpdateAction, createAnnouncementAction, createGradedDiscussionAction)
// moved to ./lms-generation-writers.ts (step-10 fixer round) for this file's
// 1000-line ceiling - see that file's own header comment.
import { LIVE_FETCHERS, LIVE_CANVAS_WRITERS } from "./lms-generation-writers";
import {
  saveGeneratedArtifactVersion,
  listGeneratedArtifactVersions,
  type GeneratedArtifact,
} from "@/lib/supabase/generated-artifacts";
import {
  gatherSelectionMaterials,
  expandModuleSelection,
  type SelectedMaterialItem,
} from "@/lib/lms-generation/materials";
import {
  GENERATION_KIND_CONFIGS,
  type GenerationKindId,
  type GenerationFailure,
} from "@/lib/lms-generation/kinds";
import {
  planModuleTarget,
  planPostSteps,
  summarizePostOutcome,
  type ModuleTarget,
  type ExistingModuleContent,
  type PostSummary,
} from "@/lib/lms-generation/commit-plan";
import { executePostPlanSteps } from "@/lib/lms-generation/commit-execute";
import { buildPostContentForKind } from "@/lib/lms-generation/post-content";
import {
  planIntroDiscussionDeadlines,
  formatDeadlineForPrompt,
  NO_DATE_INITIAL_POST_TEXT,
  NO_DATE_REPLIES_TEXT,
  REQUIRED_REPLY_COUNT,
  INTRO_DISCUSSION_POINTS,
} from "@/lib/lms-generation/intro-discussion-deadlines";
// planIntroDiscussionPost (intro-discussion-post.ts) is deliberately NOT
// imported here (Finding 1 of the step-10 fixer round): its .toISOString()
// call must run in the browser, not on this UTC server - see that leaf's own
// header comment. harvestPostOutcomeNotes/resolveDiscussionDeadlinesForPost/
// otherModuleNamesFor used to be inlined here - moved to
// src/lib/lms-generation/post-outcome-notes.ts (a leaf) for the 1000-line
// ceiling, same split rationale as post-content.ts's own header comment.
import {
  harvestPostOutcomeNotes,
  resolveDiscussionDeadlinesForPost,
  otherModuleNamesFor,
} from "@/lib/lms-generation/post-outcome-notes";
import { resolveScriptMinutes } from "@/lib/lms-generation/script-length";
import { buildScriptGenerationDiag, type ScriptGenerationServerDiag } from "@/lib/lms-generation/generation-diag";
import { isCourseNotLinkedMessage } from "@/lib/lms-generation/course-not-linked";
import { DEFAULT_MODULE_LABEL } from "@/lib/lms-generation/default-module-label";
import type { LlmProvider } from "@/lib/llm";
import { resolveCourseKind } from "@/lib/course-kind";
import type { Json } from "@/lib/supabase/types";

// resolveGenerationCourseRow moved to ./lms-generation-course-row.ts (a
// STRUCTURAL split, no behaviour change) once Job 4's diag-log plumbing
// pushed this file past the project's 1000-line ceiling - imported below
// (NOT re-exported from here: this file's own header comment already
// records why a "use server" module re-exporting something it did not
// declare itself can be silently erased by the production build in a way no
// local gate catches, for a type re-export - the same caution applies here,
// so src/app/actions/lms-generation-refine.ts imports it directly from the
// new leaf instead of through this file). See that new file's own doc
// comment for the full rationale, preserved verbatim there.
import { resolveGenerationCourseRow } from "./lms-generation-course-row";

// TITLED_GENERIC_KINDS moved to src/app/actions/lms-generation-refine.ts - it
// is read only by refineGeneratedArtifactAction's generic path and
// saveEditedGeneratedArtifactAction, both of which live there now (see that
// file's own doc comment on the constant for the preserved rationale).

// GenerationFailure is declared in kinds.ts (imported above), not here -
// src/lib/lms-generation/post-content.ts (a leaf, split out of this file for
// the line-count ceiling) needs the type too and cannot import it from
// "@/app/actions" even type-only.
//
// DO NOT ADD `export type { GenerationFailure }` BACK. A "use server" module
// may not RE-EXPORT a type, even though it may DECLARE an exported one: Next
// erases the re-export and then fails the production build with "The export
// GenerationFailure was not found in module ... lms-generation.ts". That broke
// a deploy. Neither `tsc --noEmit`, `eslint`, nor use-server-exports.test.ts
// catches it (that test allows the `export type` form, and cannot tell a
// declaration from a re-export by shape alone) - `next build` is the only
// local gate, which is exactly why the guard in use-server-exports.test.ts was
// widened to reject this form specifically. Consumers import the type straight
// from "@/lib/lms-generation/kinds" instead; nothing outside this file ever
// imported it from here.

export interface GenerateFromSelectionInput {
  courseUrl: string;
  /** An export-sourced selection's course_hub row id - the generation
   * counterpart of useSelectionDownload.ts's own `courseId` param, threaded
   * through from ContentTab/ModulesView (`exportCourseId`) the same way.
   * Undefined for a live selection, which still resolves by `courseUrl`
   * alone - see resolveGenerationCourseRow's own doc comment above. */
  courseId?: string;
  /** M12: the LMS tab's active institution acronym (ContentTab's
   * `activeInstitution` / ModulesView's `acronym` prop) - threaded through to
   * resolveGenerationCourseRow so a host-less `courseUrl` (the shape
   * CoursePicker.tsx/LmsCell.tsx actually emit) still resolves to the right
   * row. Ignored when `courseId` is present. Optional and safe to omit -
   * resolveGenerationCourseRow's own doc comment covers the fallback. */
  acronym?: string;
  kind: GenerationKindId;
  /** Already-resolved selection entries - see SelectedMaterialItem's own doc
   * comment (materials.ts). Resolving a raw selection key against a loaded
   * module tree / course export is the caller's job. */
  items: SelectedMaterialItem[];
  /** Whole-module selections - Canvas module ids ONLY, expanded server-side
   * into their live items via expandModuleSelection - see this file's header
   * comment. Deliberately NOT the discriminated "live:<id>"/"export:<ref>"
   * module-key scheme useModuleSelection.ts's `selectedModules` now uses:
   * an export-sourced module selection has no server-side fetch path at all,
   * so the CALLER (useLmsGeneration.ts) already expands it into concrete
   * `items` entries before this action is ever called, and only the live
   * remainder is sent here as a plain numeric id. Optional/defaults to none,
   * so every existing caller sending only `items` is unaffected. A mixed
   * selection (some modules AND some loose items) is deduped, never
   * double-counted. */
  moduleIds?: number[];
  /** Human label for what was selected (e.g. a module name, or "3 items
   * across 2 modules") - folded into the saved prompt text and, for "qa",
   * into generateLectureQaAction's moduleName argument. Defaults to "the
   * selected material". */
  moduleLabel?: string;
  provider?: LlmProvider;
  /** "currentEvents" only - ignored for "qa". Blank/omitted defaults to
   * researchCurrentEventsAction's own default ("the past 30 days"). */
  recentWindow?: string;
  /** "scripts" only - ignored by every other kind. The requested intro video
   * script length in minutes (re-geared from a lecture length by
   * docs/module-intro-video-script-acceptance-criteria.md, M15). Absent or
   * unrecognised resolves to DEFAULT_SCRIPT_MINUTES via resolveScriptMinutes
   * (script-length.ts), so a stale or hand-edited value produces the
   * documented default rather than a failed generation
   * (docs/lms-script-generation-acceptance-criteria.md, S7/finding 7).
   * generateModuleIntroScriptAction itself REFUSES an out-of-range length
   * outright (src/lib/lecture-script-bounds.ts), so this resolution is what
   * keeps this UI's own values inside the range it accepts. */
  targetMinutes?: number;
}

export interface GenerateFromSelectionSuccess {
  artifact: GeneratedArtifact;
  /** Materials-gathering notes (omitted descriptions, truncation, export-item
   * limitations, per-item fetch failures) - surfaced so the instructor can
   * see what the generation was actually grounded on. */
  notes: string[];
  /** D3/AC14i: the course's own `startDate`, so the CLIENT can compute a
   * discussion's deadlines in ITS OWN timezone (see useLmsGeneration.ts's
   * `post()`). Populated only by "introDiscussion"; every other kind omits it. */
  startDate?: string | null;
  /** Job 4 diag log - see GenerationFailure's own `diag` field doc comment
   * (kinds.ts) for the full rationale. Populated only by the "scripts" case
   * below. */
  diag?: ScriptGenerationServerDiag;
}

/**
 * Generate a new version of `kind` from `items` and/or `moduleIds`, and save
 * it. Resolves the course row first (AC: the "not linked" path is handled
 * explicitly and calls no generator), expands any whole-module selection
 * into its items (see this file's header comment), gathers materials, then
 * delegates to the existing generator for `kind`, then persists exactly one
 * new generated_artifacts version via saveGeneratedArtifactVersion - never
 * more than one, and never on an empty/failed generation.
 */
export async function generateFromSelectionAction(
  input: GenerateFromSelectionInput
): Promise<GenerateFromSelectionSuccess | GenerationFailure> {
  try {
    const user = await requireOwner();

    // "decks" is a long-running generation (generateDeckFromTemplate can run
    // several sequential LLM calls - see src/app/api/lms-generation/deck/
    // route.ts's own header comment) and runs through THAT Route Handler
    // instead, never this Server Action - Next only honours `maxDuration` at
    // the page level and src/app/page.tsx (a client component) sets none, so
    // a Server Action reachable from it is capped by the platform default.
    // Refused explicitly, this early, rather than falling through: the
    // branch below is a plain `if (input.kind === "qa") {...} else {...}`,
    // and without this guard a stray "decks" call would silently execute the
    // ELSE branch - researchCurrentEventsAction - which is wrong, not merely
    // slow.
    if (input.kind === "decks") {
      return { error: "Deck generation runs through a separate endpoint - see the deck Route Handler." };
    }

    const moduleIds = input.moduleIds ?? [];
    if ((!input.items || input.items.length === 0) && moduleIds.length === 0) {
      return { error: "Select at least one item to generate from." };
    }

    const resolved = await resolveGenerationCourseRow(input.courseUrl, input.courseId, input.acronym);
    if ("error" in resolved) {
      const failure: GenerationFailure = isCourseNotLinkedMessage(resolved.error)
        ? { error: resolved.error, courseNotLinked: true }
        : { error: resolved.error };
      // Job 4 (diag log): a "scripts" course-resolution failure still gets a
      // diag record (course: null - see buildScriptGenerationDiag's own doc
      // comment) so `resolvedBy`/`courseNotLinked` reach the download even
      // when generation itself never started. Every other kind: unchanged.
      if (input.kind === "scripts") {
        failure.diag = buildScriptGenerationDiag({
          courseId: input.courseId,
          course: null,
          kindId: GENERATION_KIND_CONFIGS.scripts.id,
          artifactKind: GENERATION_KIND_CONFIGS.scripts.artifactKind,
          actionName: "generateModuleIntroScriptAction",
          targetMinutesRaw: input.targetMinutes,
        });
      }
      return failure;
    }
    const course = resolved.course;

    // A whole-module selection is expanded against a FRESH module tree
    // (never the caller's, since a browser-cached tree can be stale) -
    // see this file's header comment. Skipped entirely when no whole module
    // was selected, so the common individually-selected-items path costs no
    // extra Canvas call.
    //
    // `moduleIds` stays LIVE-ONLY (Canvas module ids are always numeric) -
    // this is the ONE side of expandModuleSelection's discriminated
    // "live:<id>"/"export:<ref>" module-key scheme (materials.ts,
    // content-tab/utils.ts) this action ever needs to speak, because an
    // export-sourced module selection has NO server-side fetch path at all
    // (a course export is downloaded and parsed entirely client-side -
    // docs/REGRESSION.md entry 263 check 7) and is therefore already
    // expanded into concrete `items` by the CALLER (useLmsGeneration.ts)
    // before this action is ever invoked - see expandModuleSelection's own
    // header comment for the full live-vs-export rationale. `live:${id}` is
    // reproduced directly rather than importing liveModuleKey
    // (content-tab/utils.ts) - this module must stay free of any
    // content-tab/client import, matching materials.ts's own established
    // precedent for the same reason.
    // W5: hoisted so "introDiscussion" can read every module's NAME (AC18)
    // even for an items-only selection, where the block below never runs.
    let courseModules: Array<{ id: number; name: string }> = [];
    // Non-null only on the items-only "introDiscussion" path below, where the
    // module-name read runs CONCURRENTLY with gatherSelectionMaterials - see
    // M2 on that branch for why, and why the other branch must not do this.
    let courseModulesRead: Promise<void> | null = null;
    let items = input.items ?? [];
    if (moduleIds.length > 0) {
      const content = await listCourseContentAction(course.canvasUrl ?? "", course.institution ?? undefined);
      if ("error" in content) return { error: content.error };
      courseModules = content.modules;
      items = expandModuleSelection(
        items,
        moduleIds.map((id) => `live:${id}`),
        content.modules
      );
    } else if (input.kind === "introDiscussion") {
      // W5: module names are context only, never a reason to fail generation
      // - degrades to [] on ANY failure ({error} or a thrown exception).
      //
      // M2 (step-10b researcher): NOT awaited here. `items` does not depend on
      // this read, so awaiting it ahead of gatherSelectionMaterials below
      // serialised two independent multi-request Canvas reads for no reason -
      // listCourseContentAction alone is ~19 requests on a 16-module course
      // (listModules fetches items per module). The promise is started here
      // and joined at the Promise.all below.
      //
      // The `moduleIds.length > 0` branch above MUST stay serial: `items` is
      // rebuilt from that fetch's result by expandModuleSelection.
      courseModulesRead = (async () => {
        try {
          const content = await listCourseContentAction(course.canvasUrl ?? "", course.institution ?? undefined);
          if (!("error" in content)) courseModules = content.modules;
        } catch {
          /* degrade to [] */
        }
      })();
    }

    // A selected module that turns out to have zero items (rare) falls
    // through to gatherSelectionMaterials with an empty `items` array, which
    // trivially produces empty materialsText - the SAME "no usable material"
    // check below already covers it, so there is no separate empty-items
    // branch here.
    // M2: the two reads are independent, so they overlap rather than queue.
    // `courseModulesRead` is null on every path but the items-only
    // "introDiscussion" one, where awaiting a resolved null is a no-op.
    const [materials] = await Promise.all([
      gatherSelectionMaterials(items, {
        canvasUrl: course.canvasUrl ?? "",
        institution: course.institution ?? undefined,
        fetchers: LIVE_FETCHERS,
      }),
      courseModulesRead,
    ]);

    if (!materials.materialsText.trim()) {
      return { error: "The selected item(s) had no usable material to ground generation on." };
    }

    const provider: LlmProvider = input.provider ?? "gemini";
    // DEFAULT_MODULE_LABEL (src/lib/lms-generation/default-module-label.ts):
    // this used to be an inline literal here, spelled a SECOND time inside
    // intro-script-prompt.ts's own GENERIC_MODULE_LABELS set so that file
    // could recognise it as a placeholder rather than announce it out loud -
    // see that constant's own header comment for the full duplication
    // rationale and what pulling it out here does and does not fix.
    const moduleLabel = (input.moduleLabel ?? "").trim() || DEFAULT_MODULE_LABEL;
    const promptMeta = { courseName: course.name, moduleLabel };
    const supabase = createServiceClient();
    const courseKind = resolveCourseKind(course.courseKind);

    // R3: every kind resolves to its own generator explicitly, via a
    // `switch` rather than the old `if (kind === "qa") {...} else {...}`
    // chain this file's ORIGINAL header comment (and the decks guard above)
    // documents the hazard of. `input.kind` is narrowed to exclude "decks"
    // here (the guard above already returned for that case), so this switch
    // covers exactly the eight remaining GenerationKindId members - TypeScript
    // enforces that exhaustively: the `default` branch below assigns
    // `input.kind` to a `never`-typed local, which is a COMPILE ERROR the
    // moment a future kind is added to GenerationKindId without a
    // case here, so a stray kind can never again silently fall into a
    // neighbour's branch. Any kind that somehow still reaches `default` at
    // RUNTIME (e.g. a caller bypassing the type system) throws a named error
    // instead of running any generator.
    switch (input.kind) {
      case "qa": {
        const config = GENERATION_KIND_CONFIGS.qa;
        const generated = await generateLectureQaAction(
          course.name,
          moduleLabel,
          materials.materialsText,
          [],
          provider,
          courseKind
        );
        if ("error" in generated) return { error: generated.error };
        if (config.isEmpty(generated)) return { error: config.emptyMessage };

        const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
          courseId: course.id,
          kind: config.artifactKind,
          text: config.render(generated),
          prompt: config.buildPrompt(materials.materialsText, promptMeta),
        });
        return { artifact, notes: materials.notes };
      }

      case "currentEvents": {
        const config = GENERATION_KIND_CONFIGS.currentEvents;
        const recentWindow = (input.recentWindow ?? "").trim() || "the past 30 days";
        const generated = await researchCurrentEventsAction(materials.materialsText, recentWindow, provider);
        if ("error" in generated) return { error: generated.error };
        if (config.isEmpty(generated)) return { error: config.emptyMessage };

        const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
          courseId: course.id,
          kind: config.artifactKind,
          text: config.render(generated),
          prompt: config.buildPrompt(materials.materialsText, promptMeta),
        });
        return { artifact, notes: materials.notes };
      }

      // The four kinds below are new in chunk 3b (R2) - each "save-and-post"
      // (commitMode), though generation itself still only ever SAVES (P2):
      // posting is postGeneratedArtifactAction's own, separate job, never
      // triggered from here.
      case "objectives": {
        const config = GENERATION_KIND_CONFIGS.objectives;
        // Grounded on the selection's materials text the same way qa/
        // currentEvents are - this flow has no separately-generated
        // "assignment text" to hand generateModuleObjectivesForAssignment as
        // `assignmentText`, so that argument is "" and `materials.materialsText`
        // is passed as `fallbackContent` instead, which is exactly what that
        // function's own grounding fallback (`assignmentText.trim() ||
        // fallbackContent`) is for. `weekNumber`/`totalWeeks` are left at
        // their defaults (0) - an arbitrary LMS selection has no reliable
        // notion of "week N of M" the way a schedule-driven caller does.
        const generated = await generateModuleObjectivesForAssignment(
          moduleLabel,
          moduleLabel,
          "",
          materials.materialsText,
          provider,
          courseKind
        );
        if ("error" in generated) return { error: generated.error };
        if (config.isEmpty(generated)) return { error: config.emptyMessage };

        const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
          courseId: course.id,
          kind: config.artifactKind,
          // Objectives carries no title in its own generated shape (unlike
          // decks/announcements/assignments) - this is where posting later
          // gets the Canvas page's title from (see postGeneratedArtifactAction),
          // so it is set here at generate time rather than invented at post
          // time from data that would no longer be around by then.
          title: `${moduleLabel} Objectives`,
          text: config.render(generated),
          prompt: config.buildPrompt(materials.materialsText, promptMeta),
        });
        return { artifact, notes: materials.notes };
      }

      case "assignments": {
        const config = GENERATION_KIND_CONFIGS.assignments;
        // moduleObjectives (generateAssignmentAction's first argument) is
        // the selection's materials text - the instructor's own described
        // workflow (docs/lms-module-content-generation-acceptance-
        // criteria.md's opening paragraph) is to select a module's
        // already-generated/posted objectives page before generating its
        // assignment, so in practice this parameter IS the module's
        // objectives; `contextText` is left "" rather than repeating the
        // same text a second time in the prompt. No files are attached -
        // this flow grounds on already-gathered text, not raw uploads.
        const generated = await generateAssignmentAction(materials.materialsText, "", [], provider, courseKind);
        if ("error" in generated) return { error: generated.error };
        if (config.isEmpty(generated)) return { error: config.emptyMessage };

        const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
          courseId: course.id,
          kind: config.artifactKind,
          title: generated.title,
          text: config.render(generated),
          prompt: config.buildPrompt(materials.materialsText, promptMeta),
        });
        return { artifact, notes: materials.notes };
      }

      case "knowledgeChecks": {
        const config = GENERATION_KIND_CONFIGS.knowledgeChecks;
        const generated = await generateKnowledgeCheckAction(moduleLabel, "", materials.materialsText, provider, courseKind);
        if ("error" in generated) return { error: generated.error };
        if (config.isEmpty(generated)) return { error: config.emptyMessage };

        const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
          courseId: course.id,
          kind: config.artifactKind,
          title: `${moduleLabel} Knowledge Check`,
          text: config.render(generated),
          // The LOSSLESS half (kinds.ts's own comment on renderStructured):
          // posting later re-reads this, not `text`, to build the actual
          // quiz questions - re-parsing the rendered checklist text would be
          // exactly the lossy/fragile round-trip kinds.ts already rejects
          // for decks.
          structured: config.renderStructured!(generated) as Json,
          prompt: config.buildPrompt(materials.materialsText, promptMeta),
        });
        return { artifact, notes: materials.notes };
      }

      case "announcements": {
        const config = GENERATION_KIND_CONFIGS.announcements;
        // draftAnnouncementAction takes a short instruction, not a materials
        // blob directly - this wraps the selection's materials text in one
        // so the announcement is still grounded on exactly what was
        // selected, the same as every other kind here.
        const instruction = `Write a course announcement for ${moduleLabel}, grounded in the following material:\n\n${materials.materialsText}`;
        const generated = await draftAnnouncementAction(instruction, provider);
        if ("error" in generated) return { error: generated.error };
        if (config.isEmpty(generated)) return { error: config.emptyMessage };

        const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
          courseId: course.id,
          kind: config.artifactKind,
          // Announcements DO need a title distinct from their body (see
          // generated-artifacts.ts's own column comment) - set directly from
          // the generator's own `title`, mirroring how the deck refine branch
          // already extracts `presentationTitle` directly rather than through
          // a config-level extractor (kinds.ts's own header comment).
          title: generated.title,
          text: config.render(generated),
          prompt: config.buildPrompt(materials.materialsText, promptMeta),
        });
        return { artifact, notes: materials.notes };
      }

      case "scripts": {
        const config = GENERATION_KIND_CONFIGS.scripts;
        // M8 (docs/module-intro-video-script-acceptance-criteria.md): the
        // requested length is resolved through the ONE shared function both
        // sides use (script-length.ts's own header comment) - absent or
        // unrecognised (e.g. a stale value left over from the
        // lecture-length era) becomes DEFAULT_SCRIPT_MINUTES here.
        // generateModuleIntroScriptAction REFUSES an out-of-range length
        // (src/lib/lecture-script-bounds.ts), so resolving here is what
        // keeps a stale stored value from turning into a failed generation
        // the instructor did not cause.
        const minutes = resolveScriptMinutes(input.targetMinutes);
        // M9: course name and module label are passed SEPARATELY, not
        // composed into one "topic" string the way the retired lecture-script
        // call site above used to - generateModuleIntroScriptAction's own
        // signature keeps them apart because they play different grammatical
        // roles inside composeModuleIntroScriptPrompt
        // (src/lib/lms-generation/intro-script-prompt.ts's own doc comment).
        // `moduleLabel` above already falls back to "the selected material"
        // when unset/blank, and generateModuleIntroScriptAction itself
        // refuses an empty module label outright (media.ts).
        const generated = await generateModuleIntroScriptAction(
          course.name,
          moduleLabel,
          materials.materialsText,
          minutes,
          provider
        );
        // Job 4 (diag log): merges this action's own course/selection facts
        // with generated.diag's LLM facts (media.ts) - built once and
        // attached to EVERY return below (error, isEmpty, and success),
        // since a "successful" call with empty text (what isEmpty catches)
        // is the actual bug this feature diagnoses.
        const diag = buildScriptGenerationDiag({
          courseId: input.courseId,
          course: { id: course.id, name: course.name, canvasUrl: course.canvasUrl ?? null, institution: course.institution ?? null },
          moduleLabelRaw: input.moduleLabel,
          moduleLabelFinal: moduleLabel,
          kindId: config.id,
          artifactKind: config.artifactKind,
          actionName: "generateModuleIntroScriptAction",
          targetMinutesRaw: input.targetMinutes,
          targetMinutesResolved: minutes,
          llm: generated.diag,
        });
        if ("error" in generated) return { error: generated.error, diag };
        if (config.isEmpty(generated)) return { error: config.emptyMessage, diag };

        const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
          courseId: course.id,
          kind: config.artifactKind,
          // Derived at generate time from the module label, same precedent
          // as "objectives" above (:453) - an intro video script has no
          // title of its own in generateModuleIntroScriptAction's return
          // shape.
          title: `${moduleLabel} Intro Video Script`,
          text: config.render(generated),
          // M9's audit-trail half: the minutes actually used (post-
          // resolveScriptMinutes, not the raw request) reach the saved
          // prompt via GenerationPromptMeta.targetMinutes.
          prompt: config.buildPrompt(materials.materialsText, { ...promptMeta, targetMinutes: minutes }),
        });
        return { artifact, notes: materials.notes, diag };
      }

      // A11 (docs/learning-resources-page-acceptance-criteria.md): the ninth
      // kind, "resources" - a student-facing Learning Resources page. Like
      // "objectives" above, it is "save-and-post": generation here only ever
      // saves a version (P2/A12) - posting is postGeneratedArtifactAction's
      // own, separate job, unlocked for free by commitMeta being
      // byte-identical in shape to objectives' (kinds.ts's resourcesKindConfig
      // comment).
      case "resources": {
        const config = GENERATION_KIND_CONFIGS.resources;
        // Grounded on the selection's materials text the same way every other
        // kind here is - generateLearningResourcesForSelection (the sibling
        // generator, src/app/actions/learning-resources-generator.ts) owns
        // turning that text into a student-facing page that never invents a
        // link, citation or media title (D1/A7-A8 of the AC doc).
        const generated = await generateLearningResourcesForSelection(
          moduleLabel,
          materials.materialsText,
          provider,
          courseKind
        );
        if ("error" in generated) return { error: generated.error };
        if (config.isEmpty(generated)) return { error: config.emptyMessage };

        const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
          courseId: course.id,
          kind: config.artifactKind,
          // Resources carries no title of its own in its generated shape
          // (same precedent as "objectives" above, :490) - set here at
          // generate time, mirroring objectives' own literal
          // `${moduleLabel} Objectives` (A11).
          title: `${moduleLabel} Learning Resources`,
          text: config.render(generated),
          prompt: config.buildPrompt(materials.materialsText, promptMeta),
        });
        return { artifact, notes: materials.notes };
      }

      // The tenth kind, "introDiscussion" - "save-and-post", generation only
      // ever saves a version (P2); posting is a separate job, below.
      case "introDiscussion": {
        const config = GENERATION_KIND_CONFIGS.introDiscussion;
        // AC20/AC21: dates computed by code (A1), never the model; null means
        // no start date or no derivable week number, so the AC21 fallback
        // phrases stand in and the Canvas post carries no due/lock date.
        const deadlines = planIntroDiscussionDeadlines({ startDate: course.startDate, moduleName: moduleLabel });
        const initialPostDeadlineText = deadlines ? formatDeadlineForPrompt(deadlines.initialPostAt) : NO_DATE_INITIAL_POST_TEXT;
        const repliesDeadlineText = deadlines ? formatDeadlineForPrompt(deadlines.repliesDueAt) : NO_DATE_REPLIES_TEXT;
        // AC18: target module's name plus every OTHER module's name (hoist
        // above) - see otherModuleNamesFor's own doc comment (researcher
        // finding: identity, not a label-string match).
        const otherModuleNames = otherModuleNamesFor(courseModules, moduleIds, moduleLabel);

        const generated = await generateIntroDiscussionForSelection(
          {
            courseName: course.name,
            courseCode: course.courseCode ?? null,
            description: course.description ?? null,
            topicOutline: course.topicOutline ?? null,
            institution: course.institution,
            targetModuleName: moduleLabel,
            otherModuleNames,
            materialsText: materials.materialsText,
            initialPostDeadlineText,
            repliesDeadlineText,
            requiredReplyCount: REQUIRED_REPLY_COUNT,
            pointsPossible: INTRO_DISCUSSION_POINTS,
          },
          provider,
          courseKind
        );
        if ("error" in generated) return { error: generated.error };
        if (config.isEmpty(generated)) return { error: config.emptyMessage };

        const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
          courseId: course.id,
          kind: config.artifactKind,
          title: generated.title, // Model-supplied (AC7) - see TITLED_GENERIC_KINDS.
          text: config.render(generated),
          prompt: config.buildPrompt(materials.materialsText, promptMeta),
        });
        // D3/AC14i: lets the CLIENT compute posting instants in its own timezone.
        return { artifact, notes: materials.notes, startDate: course.startDate };
      }

      default: {
        const unhandledKind: never = input.kind;
        throw new Error(
          `generateFromSelectionAction: no generator is wired for kind "${String(unhandledKind)}" - refusing rather than silently misrouting to a neighbour's generator.`
        );
      }
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate content." };
  }
}

// parseKnowledgeCheckStructured, quizQuestionFromKnowledgeCheck and
// buildPostContentForKind used to live here - pure, I/O-free helpers, moved
// to src/lib/lms-generation/post-content.ts (a leaf, imported below) to keep
// this file under the project's line ceiling. See that file's own header
// comment and each function's own doc comment for the reasoning that moved
// with them.

export interface PostGeneratedArtifactInput {
  courseUrl: string;
  /** See GenerateFromSelectionInput's own doc comment - same identifier,
   * same source-aware resolution. In practice this is never sent for an
   * export selection: useLmsGeneration.ts's own `post()` refuses client-side
   * first (contentSourceGating.ts's gateOperation "courseWrite" - posting
   * writes to Canvas, which an export selection has no connection to) before
   * this action is ever called. Accepted here anyway so this action's own
   * course resolution stays consistent with every other generation action's
   * (AC2), rather than being the one exception. */
  courseId?: string;
  /** M12: see GenerateFromSelectionInput's own doc comment - same identifier,
   * same threading into resolveGenerationCourseRow. */
  acronym?: string;
  kind: GenerationKindId;
  /** The saved version to post - generated_artifacts.id (GeneratedArtifact.id).
   * The row is re-read fresh from the database by this action (P2) - only
   * the identity travels in this input, never the content itself, so a
   * preview modal that has been open a while can never post stale
   * client-side text. */
  artifactId: string;
  /** Where the post lands (P5) - required for every kind whose
   * commitMeta.placement is "module-item"; ignored (may be omitted) for a
   * "course-level" kind such as announcements, which has no module to
   * choose at all. */
  target?: ModuleTarget;
  /** "introDiscussion" only - D3/AC14i: absolute Canvas instants ALREADY
   * computed client-side (instructor's own timezone) plus a `note` describing
   * them. Optional: an omitting caller gets no dates at all, never a
   * server-computed one (Finding 1 - see resolveDiscussionDeadlinesForPost,
   * post-outcome-notes.ts). */
  discussionDeadlines?: { initialPostAt: string; repliesDueAt: string; note: string };
  /** "introDiscussion" only - the client's "Use Canvas discussion
   * checkpoints" checkbox (GenerateFromSelectionSection.tsx). Default FALSE:
   * Canvas's createDiscussionTopic mutation is not transactional on a
   * flag-off account (it persists the orphan assignment, THEN raises), so
   * checkpoints are explicit opt-in. Every other kind ignores this. */
  useDiscussionCheckpoints?: boolean;
}

export interface PostGeneratedArtifactSuccess {
  summary: PostSummary;
  /** W6: extra facts summary.text has no channel for - discussion deadlines
   * (or why none were set) and which Canvas path ran (AC14g: never silent). */
  notes?: string[];
}

/**
 * Post an already-saved generated_artifacts version to Canvas (P1-P5).
 * NEVER performed by generateFromSelectionAction above, which only ever
 * saves a version (P2) - posting is this separate, explicitly invoked
 * action, matching the project's draft/review-then-commit rule for side
 * effects (P1).
 *
 * 1. Refuses a kind whose commitMode is not "save-and-post", by name - a
 *    "save-version" kind (qa/currentEvents/decks) has nothing to post.
 * 2. Resolves the course row the same way generateFromSelectionAction does.
 * 3. Re-reads the requested version from the database (P2) via
 *    listGeneratedArtifactVersions (the same accessor
 *    listGeneratedArtifactVersionsAction already wraps - there is no
 *    separate "get one version by id" query in this codebase, so the
 *    requested row is found within the full per-course/kind list rather than
 *    adding one).
 * 4. Builds this kind's PostContent from the RE-READ row only
 *    (buildPostContentForKind).
 * 5. For a "module-item" placement, resolves `target` via planModuleTarget
 *    (P5 - creating a new module only when its name does not already match
 *    one case-insensitively, P3), then plans the Canvas writes via
 *    planPostSteps and executes them via executePostPlanSteps against the
 *    real Canvas actions (LIVE_CANVAS_WRITERS) - decide, then do, never
 *    merged into one step (commit-plan.ts's own header comment). For a
 *    "course-level" kind (announcements), no module is resolved at all.
 * 6. Summarizes what actually happened via summarizePostOutcome (P4) - never
 *    a bare "failed" when something was in fact created in Canvas, and never
 *    a bare "success" when a link/question/publish step did not land.
 */
export async function postGeneratedArtifactAction(
  input: PostGeneratedArtifactInput
): Promise<PostGeneratedArtifactSuccess | GenerationFailure> {
  try {
    const user = await requireOwner();

    const config = GENERATION_KIND_CONFIGS[input.kind];
    if (config.commitMode !== "save-and-post" || !config.commitMeta) {
      return { error: `"${config.label}" only saves a generated version - it has nothing to post to Canvas.` };
    }
    const meta = config.commitMeta;

    const resolved = await resolveGenerationCourseRow(input.courseUrl, input.courseId, input.acronym);
    if ("error" in resolved) {
      return isCourseNotLinkedMessage(resolved.error)
        ? { error: resolved.error, courseNotLinked: true }
        : { error: resolved.error };
    }
    const course = resolved.course;
    const courseUrl = course.canvasUrl ?? "";
    const acronym = course.institution ?? undefined;

    const supabase = createServiceClient();
    const versions = await listGeneratedArtifactVersions(supabase, user.id, course.id, config.artifactKind);
    const artifact = versions.find((v) => v.id === input.artifactId);
    if (!artifact) {
      return { error: "That generated version could not be found - it may have been superseded. Refresh and try again." };
    }

    const title = (artifact.title ?? "").trim() || config.label;

    // AC14c/D3/W6: the client (useLmsGeneration.ts's post(), in the browser)
    // always computes and sends the discussion's real Canvas instants for
    // this kind, plus a note describing them. Finding 1 (fix): this used to
    // fall back to computing a real instant SERVER-side when the caller sent
    // no `discussionDeadlines` at all - see resolveDiscussionDeadlinesForPost's
    // own doc comment (post-outcome-notes.ts) for why that path is gone.
    const notes: string[] = [];
    let discussionDeadlines: { initialPostAt: string; repliesDueAt: string } | undefined;
    if (meta.canvasObjectKind === "discussion") {
      const resolved = resolveDiscussionDeadlinesForPost(input.discussionDeadlines);
      discussionDeadlines = resolved.deadlines;
      notes.push(resolved.note);
    }

    const contentResult = buildPostContentForKind(
      meta.canvasObjectKind,
      title,
      artifact,
      meta.publishedOnCreation,
      discussionDeadlines,
      input.useDiscussionCheckpoints ?? false
    );
    if ("error" in contentResult) return contentResult;
    const content = contentResult;

    if (meta.placement === "course-level") {
      // Announcements only, today - no module involved, so planPostSteps
      // never reads `existing` for this content kind (see its own doc
      // comment); an empty stand-in costs no extra Canvas call.
      const outcomes = await executePostPlanSteps(
        courseUrl,
        null,
        planPostSteps(content, { pages: [], linkedPageUrls: new Set() }),
        LIVE_CANVAS_WRITERS,
        acronym
      );
      notes.push(...harvestPostOutcomeNotes(outcomes));
      return { summary: summarizePostOutcome(outcomes), notes: notes.length > 0 ? notes : undefined };
    }

    if (!input.target) {
      return { error: "Choose a module to post this into." };
    }

    const courseContent = await listCourseContentAction(courseUrl, acronym);
    if ("error" in courseContent) return { error: courseContent.error };

    const targetPlan = planModuleTarget(
      input.target,
      courseContent.modules.map((m) => ({ id: m.id, name: m.name }))
    );
    if ("error" in targetPlan) return { error: targetPlan.error };

    let moduleId: number;
    let targetModule;
    if (targetPlan.action === "create") {
      // P3/P5: createModuleAction has no Canvas-side idempotency of its own -
      // planModuleTarget already checked for a case-insensitive name
      // collision above, so reaching "create" here means none exists yet.
      // P3/P5: createModuleAction has no Canvas-side idempotency of its own -
      // planModuleTarget already checked for a case-insensitive name
      // collision above, so reaching "create" here means none exists yet.
      const created = await createModuleAction(courseUrl, targetPlan.name, undefined, acronym);
      if ("error" in created) return { error: created.error };
      moduleId = created.module.id;
      targetModule = created.module;
    } else {
      moduleId = targetPlan.moduleId;
      targetModule = courseContent.modules.find((m) => m.id === moduleId);
    }

    const existing: ExistingModuleContent = {
      pages: courseContent.pages.map((p) => ({ title: p.title, url: p.url })),
      linkedPageUrls: new Set(
        (targetModule?.items ?? [])
          .filter((item) => item.type === "Page" && item.pageUrl)
          .map((item) => item.pageUrl as string)
      ),
    };

    const outcomes = await executePostPlanSteps(
      courseUrl,
      moduleId,
      planPostSteps(content, existing),
      LIVE_CANVAS_WRITERS,
      acronym
    );
    notes.push(...harvestPostOutcomeNotes(outcomes));

    return { summary: summarizePostOutcome(outcomes), notes: notes.length > 0 ? notes : undefined };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post the generated content to Canvas." };
  }
}

export interface ListGeneratedArtifactVersionsInput {
  courseUrl: string;
  /** See GenerateFromSelectionInput's own doc comment - same identifier,
   * same source-aware resolution. */
  courseId?: string;
  /** M12: see GenerateFromSelectionInput's own doc comment - same identifier,
   * same threading into resolveGenerationCourseRow. */
  acronym?: string;
  kind: GenerationKindId;
}

export interface ListGeneratedArtifactVersionsSuccess {
  /** Newest-first - see listGeneratedArtifactVersions' own doc comment. */
  versions: GeneratedArtifact[];
}

/**
 * Every saved version of `kind` for this course, newest first - lets a
 * caller show the REAL stored version history rather than only what it has
 * itself accumulated client-side (useLmsGeneration.ts's generate()/refine()
 * both call this right after a successful save; see that hook's own header
 * comment).
 */
export async function listGeneratedArtifactVersionsAction(
  input: ListGeneratedArtifactVersionsInput
): Promise<ListGeneratedArtifactVersionsSuccess | GenerationFailure> {
  try {
    const user = await requireOwner();

    const resolved = await resolveGenerationCourseRow(input.courseUrl, input.courseId, input.acronym);
    if ("error" in resolved) {
      return isCourseNotLinkedMessage(resolved.error)
        ? { error: resolved.error, courseNotLinked: true }
        : { error: resolved.error };
    }
    const course = resolved.course;
    const config = GENERATION_KIND_CONFIGS[input.kind];

    const supabase = createServiceClient();
    const versions = await listGeneratedArtifactVersions(supabase, user.id, course.id, config.artifactKind);
    return { versions };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list the generated versions." };
  }
}
