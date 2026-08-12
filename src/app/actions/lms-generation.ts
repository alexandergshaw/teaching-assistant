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
import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveLmsCourseRowAction } from "./lms-syllabus-buttons";
import { generateLectureQaAction } from "./course-planning-lecture";
import { researchCurrentEventsAction } from "./current-events";
import { reviseLectureSlidesAction } from "./lecture-plans";
import { generateModuleObjectivesForAssignment } from "./module-objectives-generator";
import { generateAssignmentAction } from "./llm-content";
import { generateKnowledgeCheckAction } from "./knowledge-check";
import { draftAnnouncementAction } from "./messaging";
import {
  getPageAction,
  previewFileAction,
  createPageAction,
  updatePageAction,
  createGradableAction,
  createQuizQuestionAction,
  bulkUpdateAction,
} from "./canvas-files-bulk";
import { fetchCanvasMetaAction } from "./grading";
import {
  listCourseContentAction,
  createModuleAction,
  createModuleItemAction,
  createCourseAssignmentAction,
} from "./canvas-modules";
import { createAnnouncementAction } from "./canvas-inbox";
import {
  saveGeneratedArtifactVersion,
  listGeneratedArtifactVersions,
  type GeneratedArtifact,
} from "@/lib/supabase/generated-artifacts";
import {
  gatherSelectionMaterials,
  expandModuleSelection,
  type SelectedMaterialItem,
  type MaterialsFetchers,
} from "@/lib/lms-generation/materials";
import { parseDeckSlidesFromStructured, mergeRefinedDeckSlides } from "@/lib/lms-generation/deck";
import {
  GENERATION_KIND_CONFIGS,
  type GenerationKindId,
  type DeckGeneratedContent,
  type KnowledgeCheckGeneratedContent,
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
import { executePostPlanSteps, type CanvasWriters } from "@/lib/lms-generation/commit-execute";
import { buildPostContentForKind, parseKnowledgeCheckStructured } from "@/lib/lms-generation/post-content";
import { callLlm, describeEmptyLlmText, describeLlmFailure, type LlmProvider } from "@/lib/llm";
import { resolveCourseKind } from "@/lib/course-kind";
import { extractJsonObject } from "./shared";
import type { Json } from "@/lib/supabase/types";

// The real Canvas reads gatherSelectionMaterials needs for live-sourced
// items, wired to the app's own existing actions - see materials.ts's own
// header comment for why those reads are injected there rather than
// imported directly. Not exported: a "use server" module may export only
// async functions (src/lib/use-server-exports.test.ts).
const LIVE_FETCHERS: MaterialsFetchers = {
  getPage: (courseUrl, pageUrl, institution) => getPageAction(courseUrl, pageUrl, institution),
  previewFile: (courseUrl, contentId, institution) => previewFileAction(courseUrl, contentId, institution),
  fetchMeta: (contentUrl) => fetchCanvasMetaAction(contentUrl),
};

/**
 * The real Canvas writes postGeneratedArtifactAction's executePostPlanSteps
 * needs, wired to this app's own existing actions - same injection pattern
 * as LIVE_FETCHERS above (see that constant's own comment). Every method
 * here is a direct pass-through except `publishQuiz`: bulkUpdateAction
 * returns `{updated, failures}` rather than a plain `{ok:true}` success
 * marker (it is a BATCH endpoint that can partially fail even for a single
 * id), so this is the one place that result gets translated into
 * CanvasWriters' plain ok/error contract - a per-id failure is surfaced as
 * this writer's own `{error}` rather than silently reported as `{ok:true}`.
 * Not exported: a "use server" module may export only async functions
 * (src/lib/use-server-exports.test.ts) - see LIVE_FETCHERS's own comment.
 */
const LIVE_CANVAS_WRITERS: CanvasWriters = {
  createPage: (courseUrl, fields, acronym) => createPageAction(courseUrl, fields, acronym),
  updatePage: (courseUrl, pageUrl, fields, acronym) => updatePageAction(courseUrl, pageUrl, fields, acronym),
  createModuleItem: (courseUrl, moduleId, item, acronym) => createModuleItemAction(courseUrl, moduleId, item, acronym),
  createAssignment: (courseUrl, fields, moduleId, acronym) =>
    createCourseAssignmentAction(courseUrl, fields, moduleId, acronym),
  createQuiz: (courseUrl, fields, acronym) => createGradableAction(courseUrl, "Quiz", fields, acronym),
  createQuizQuestion: (courseUrl, quizId, question, acronym) =>
    createQuizQuestionAction(courseUrl, quizId, question, acronym),
  publishQuiz: async (courseUrl, quizId, acronym) => {
    const result = await bulkUpdateAction(courseUrl, "Quiz", [String(quizId)], { published: true }, acronym);
    if ("error" in result) return { error: result.error };
    if (result.failures.length > 0) {
      return { error: result.failures[0]?.error ?? "Could not publish the quiz." };
    }
    return { ok: true };
  },
  createAnnouncement: (courseUrl, title, message, acronym) => createAnnouncementAction(courseUrl, title, message, acronym),
};

const COURSE_NOT_LINKED_PREFIX = "No saved course is linked to";

/**
 * True when `message` is resolveLmsCourseRowAction's own NAMED "not linked"
 * error (lms-syllabus-buttons.ts's courseNotLinkedError - "No saved course is
 * linked to <url>..."). That helper is private to a "use server" module (only
 * async functions may be exported from one, so it cannot be imported and
 * compared by reference) and this repo has no shared error-code convention
 * for it yet, so this matches on the message's stable prefix instead. A
 * wording change there would make this silently stop firing - falling back to
 * a generic (still correct) error - rather than throw; the safe direction for
 * a match that can go stale. Not exported (see LIVE_FETCHERS's own comment).
 */
function isCourseNotLinkedMessage(message: string): boolean {
  return message.startsWith(COURSE_NOT_LINKED_PREFIX);
}

// GenerationFailure itself is now declared in kinds.ts (imported above), not
// here - src/lib/lms-generation/post-content.ts (a leaf, split out of this
// file for the line-count ceiling) needs the type too, and cannot import it
// from "@/app/actions" even type-only. Re-exported here so every existing
// caller of THIS file (e.g. useLmsGeneration.ts) sees no change - see
// GenerationFailure's own doc comment (kinds.ts) for the full reasoning.
export type { GenerationFailure };

export interface GenerateFromSelectionInput {
  courseUrl: string;
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
}

export interface GenerateFromSelectionSuccess {
  artifact: GeneratedArtifact;
  /** Materials-gathering notes (omitted descriptions, truncation, export-item
   * limitations, per-item fetch failures) - surfaced so the instructor can
   * see what the generation was actually grounded on. */
  notes: string[];
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

    const resolved = await resolveLmsCourseRowAction(input.courseUrl);
    if ("error" in resolved) {
      return isCourseNotLinkedMessage(resolved.error)
        ? { error: resolved.error, courseNotLinked: true }
        : { error: resolved.error };
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
    let items = input.items ?? [];
    if (moduleIds.length > 0) {
      const content = await listCourseContentAction(course.canvasUrl ?? "", course.institution ?? undefined);
      if ("error" in content) return { error: content.error };
      items = expandModuleSelection(
        items,
        moduleIds.map((id) => `live:${id}`),
        content.modules
      );
    }

    // A selected module that turns out to have zero items (rare) falls
    // through to gatherSelectionMaterials with an empty `items` array, which
    // trivially produces empty materialsText - the SAME "no usable material"
    // check below already covers it, so there is no separate empty-items
    // branch here.
    const materials = await gatherSelectionMaterials(items, {
      canvasUrl: course.canvasUrl ?? "",
      institution: course.institution ?? undefined,
      fetchers: LIVE_FETCHERS,
    });

    if (!materials.materialsText.trim()) {
      return { error: "The selected item(s) had no usable material to ground generation on." };
    }

    const provider: LlmProvider = input.provider ?? "gemini";
    const moduleLabel = (input.moduleLabel ?? "").trim() || "the selected material";
    const promptMeta = { courseName: course.name, moduleLabel };
    const supabase = createServiceClient();
    const courseKind = resolveCourseKind(course.courseKind);

    // R3: every kind resolves to its own generator explicitly, via a
    // `switch` rather than the old `if (kind === "qa") {...} else {...}`
    // chain this file's ORIGINAL header comment (and the decks guard above)
    // documents the hazard of. `input.kind` is narrowed to exclude "decks"
    // here (the guard above already returned for that case), so this switch
    // covers exactly the six remaining GenerationKindId members - TypeScript
    // enforces that exhaustively: the `default` branch below assigns
    // `input.kind` to a `never`-typed local, which is a COMPILE ERROR the
    // moment a future eighth kind is added to GenerationKindId without a
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
}

export interface PostGeneratedArtifactSuccess {
  summary: PostSummary;
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

    const resolved = await resolveLmsCourseRowAction(input.courseUrl);
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
    const contentResult = buildPostContentForKind(meta.canvasObjectKind, title, artifact, meta.publishedOnCreation);
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
      return { summary: summarizePostOutcome(outcomes) };
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
    return { summary: summarizePostOutcome(outcomes) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post the generated content to Canvas." };
  }
}

export interface RefineGeneratedArtifactInput {
  courseUrl: string;
  kind: GenerationKindId;
  /** The version being refined, as already-displayed text - mirrors
   * reviseDocumentAction's own `documentText` contract (see this function's
   * body comment for why that action itself is not reused here). */
  currentText: string;
  /** The version being refined's `title`/`structured` columns (GeneratedArtifact,
   * src/lib/supabase/generated-artifacts.ts) - trusted client-supplied values,
   * not re-read from the database here. Verified deliberate, not an oversight:
   * useLmsGeneration.ts's refine() already sends BOTH fields unconditionally on
   * every refine call, for every kind (its own inline comment saying "Decks
   * only... ignored server-side for every other kind" describes only what THIS
   * action used to DO with them, not what it sends), so no caller change is
   * needed to fix this. Re-reading server-side instead, the way
   * postGeneratedArtifactAction re-reads by id (P2's "never trust client-
   * supplied content"), was rejected here: it would need a new `artifactId`
   * field wired through the caller (outside this fix's file set) to guard
   * against a staleness gap refine does not actually have - instructions and
   * the version being refined are submitted in the same request, unlike a
   * preview modal left open before posting.
   *
   * `currentTitle` is read by every kind whose title is NOT re-derivable from
   * revised text: "decks" and "knowledgeChecks" (their own branches below),
   * and "objectives"/"assignments"/"announcements" (the generic text-refine
   * path's carry-forward). Ignored by "qa"/"currentEvents", which legitimately
   * have no title (see generated-artifacts.ts's own column comment).
   *
   * `currentStructured` was decks-only until this fix; "knowledgeChecks" now
   * reads it too (its own branch below), for the same reason decks does - its
   * refine must revise the STRUCTURED questions, never `currentText`'s lossy
   * rendered checklist. Ignored by every other kind. */
  currentTitle?: string | null;
  currentStructured?: unknown;
  instructions: string;
  provider?: LlmProvider;
}

export interface RefineGeneratedArtifactSuccess {
  artifact: GeneratedArtifact;
  /** Decks only - one line per slide whose speaker notes and/or graphic
   * could not be confidently carried over from the version being refined
   * (mergeRefinedDeckSlides, src/lib/lms-generation/deck.ts). Undefined for
   * every other kind, and an empty array for a deck refine that lost
   * nothing - see that function's own doc comment for what "confidently"
   * means. */
  notes?: string[];
}

/**
 * Revise an existing generated version per free-text instructions, and save
 * the result as a NEW version - never an overwrite of the version being
 * refined (saveGeneratedArtifactVersion always inserts; see that function's
 * own doc comment).
 */
export async function refineGeneratedArtifactAction(
  input: RefineGeneratedArtifactInput
): Promise<RefineGeneratedArtifactSuccess | GenerationFailure> {
  try {
    const user = await requireOwner();

    const currentText = input.currentText.trim();
    if (!currentText) return { error: "There is no generated document to refine." };
    const instructions = input.instructions.trim();
    if (!instructions) return { error: "Say what you would like changed." };

    const resolved = await resolveLmsCourseRowAction(input.courseUrl);
    if ("error" in resolved) {
      return isCourseNotLinkedMessage(resolved.error)
        ? { error: resolved.error, courseNotLinked: true }
        : { error: resolved.error };
    }
    const course = resolved.course;
    const provider: LlmProvider = input.provider ?? "gemini";

    // DECKS: reviseLectureSlidesAction (src/app/actions/lecture-plans.ts) IS
    // the natural per-kind refine here - unlike the generic text path below,
    // it operates on the STRUCTURED slide array recovered from the version
    // being refined, so this branch can save a NEW `structured` payload too,
    // never just text (kinds.ts's own header comment on why `structured`
    // exists for decks). reviseLectureSlidesAction's own LLM response
    // contract only requests
    // { "slides": [ { "title": "...", "bullets": [...], "code": "...", "codeLanguage": "python" } ] }
    // (lecture-plans.ts's own prompt, verbatim) - `notes` and `graphic` are
    // never asked for, so every slide it returns lacks them regardless of
    // whether the version being refined carried them. Rather than accept
    // that loss (or widen reviseLectureSlidesAction's own contract, which
    // has other callers and is outside this chunk's ownership),
    // mergeRefinedDeckSlides (src/lib/lms-generation/deck.ts) merges the
    // revision back over `slides` - the version being refined - so a
    // confidently-matched slide keeps the notes/graphic the model was never
    // asked about, while `title`/`bullets`/`code`/`codeLanguage` (fields the
    // model WAS asked about) always come from the revision, never the old
    // version. See that function's own doc comment for the full matching
    // rule and why index alone is not used.
    if (input.kind === "decks") {
      const deckConfig = GENERATION_KIND_CONFIGS.decks;
      const slides = parseDeckSlidesFromStructured(input.currentStructured);
      if (slides.length === 0) return { error: "There is no generated deck to refine." };
      const presentationTitle = (input.currentTitle ?? "").trim() || "Presentation";

      const revised = await reviseLectureSlidesAction(presentationTitle, slides, instructions, provider);
      if ("error" in revised) return { error: revised.error };

      const merged = mergeRefinedDeckSlides(slides, revised.slides);
      const generated: DeckGeneratedContent = { presentationTitle, slides: merged.slides };
      if (deckConfig.isEmpty(generated)) return { error: deckConfig.emptyMessage };

      const supabase = createServiceClient();
      const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
        courseId: course.id,
        kind: deckConfig.artifactKind,
        title: presentationTitle,
        text: deckConfig.render(generated),
        structured: deckConfig.renderStructured!(generated) as Json,
        prompt: `Revise the deck "${presentationTitle}" for ${course.name || "this course"}, per: ${instructions}`,
      });
      return { artifact, notes: merged.droppedFields };
    }

    // KNOWLEDGE CHECKS: the same "structured, not text" problem decks has
    // (kinds.ts: `text` is knowledgeCheckTextFromQuestions' LOSSY "[x]"/"[ ]"
    // checklist rendering, unsafe to re-parse back into prompt/choices/
    // correct/explanation - the same round-trip kinds.ts already rejects for
    // decks). Before this branch existed, a knowledgeChecks refine fell into
    // the generic text path below, which saves ONLY `{text, prompt}` - no
    // `structured` - so buildPostContentForKind's "quiz" branch refused to
    // ever post the refined version. THE bug this fix exists for; see this
    // file's header comment and docs/REGRESSION.md entry 266 checks 6-8 for
    // the identical class of bug already caught for decks.
    //
    // Unlike decks, there is no existing "revise the questions" action to
    // delegate to (generateKnowledgeCheckAction only ever generates from
    // fresh materials; widening its contract is outside this fix's file
    // set), so this branch makes its own callLlm call, using the same JSON
    // response shape generateKnowledgeCheckAction's own prompt
    // (src/app/actions/knowledge-check.ts) already asks the model for.
    if (input.kind === "knowledgeChecks") {
      const kcConfig = GENERATION_KIND_CONFIGS.knowledgeChecks;
      const questions = parseKnowledgeCheckStructured(input.currentStructured);
      if (questions.length === 0) return { error: "There is no generated knowledge check to refine." };

      const kcPrompt = `You are revising an already-generated knowledge-check quiz for its instructor.

CURRENT QUESTIONS (JSON):
${JSON.stringify(questions, null, 2)}

REQUESTED CHANGES:
${instructions}

Revise the quiz so it satisfies the requested changes. Return ONLY valid JSON:
{
  "questions": [
    {
      "prompt": "...",
      "choices": [
        { "text": "...", "correct": true },
        { "text": "...", "correct": false, "explanation": "..." }
      ]
    }
  ]
}

Requirements:
- Return the COMPLETE revised set of questions, not only the ones that changed.
- Preserve every question the request did not ask you to change, including its exact wording.
- Exactly one choice per question is "correct": true; every other choice has "correct": false and a non-empty "explanation".
- Do not include any text outside the JSON object.`;

      const kcResult = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: kcPrompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
        },
        provider
      );

      if (!kcResult.ok) return { error: describeLlmFailure(kcResult, `Refine ${kcConfig.label}`) };
      if (!kcResult.text.trim()) return { error: describeEmptyLlmText(kcResult, `Refine ${kcConfig.label}`) };

      // Structurally validated the same way a saved version's own
      // `structured` column already is (parseKnowledgeCheckStructured) -
      // this response is genuinely untrusted model output, so a malformed or
      // empty result is dropped/refused rather than saved as a version with
      // no usable questions (this is exactly the dead-end this fix exists to
      // close, so it must not reopen a narrower version of the same hole by
      // saving zero questions here).
      const parsedResponse = extractJsonObject(kcResult.text);
      const revisedQuestions = parsedResponse ? parseKnowledgeCheckStructured(parsedResponse.questions) : [];
      if (revisedQuestions.length === 0) {
        return { error: "The revised knowledge check has no usable questions - nothing was saved." };
      }

      const generated: KnowledgeCheckGeneratedContent = { questions: revisedQuestions };
      const supabase = createServiceClient();
      const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
        courseId: course.id,
        kind: kcConfig.artifactKind,
        // Preserved from the version being refined, exactly like decks'
        // `presentationTitle` above - a knowledge check's title
        // (`${moduleLabel} Knowledge Check`) is set once at generate time
        // from the module label, not re-derivable from the revised
        // questions.
        title: input.currentTitle ?? null,
        text: kcConfig.render(generated),
        structured: kcConfig.renderStructured!(generated) as Json,
        prompt: kcPrompt,
      });
      return { artifact };
    }

    const config = GENERATION_KIND_CONFIGS[input.kind];

    // Which of the remaining generic-path kinds carry a title that this
    // path's revised TEXT alone cannot reconstruct. "objectives"'s title and
    // "assignments"'s are both set once at GENERATE time
    // (generateFromSelectionAction above) from data - a module label, a
    // separate generator field - not present here; "announcements"'s title
    // is a distinct field (`{title, message}`) this path never revises (its
    // instruction below only revises `currentText`, which
    // announcementsKindConfig.render maps to `generated.message`, never
    // `generated.title`). For all three, the only correct post-refine title
    // is the version being refined's own - `input.currentTitle` - carried
    // forward so it never silently degrades to `config.label` at post time
    // (postGeneratedArtifactAction's `title = artifact.title ?? "" ||
    // config.label`). "qa"/"currentEvents" are deliberately excluded: they
    // legitimately have no title (generated-artifacts.ts's own column
    // comment), and their existing tests assert it stays that way.
    // ("decks"/"knowledgeChecks" carry their own title above and never reach
    // this generic path.)
    const TITLED_GENERIC_KINDS: readonly GenerationKindId[] = ["objectives", "assignments", "announcements"];
    const carriedTitle = TITLED_GENERIC_KINDS.includes(input.kind) ? { title: input.currentTitle ?? null } : {};

    // A dedicated callLlm call here rather than reusing reviseDocumentAction
    // (src/app/actions/llm-content.ts), even though that action's own
    // contract - document text + instructions -> the complete revised
    // document - matches this one exactly. reviseDocumentAction's own empty-
    // response branch hardcodes "The model returned an empty document."
    // rather than calling describeEmptyLlmText, which would lose the
    // finishReason diagnostic describeEmptyLlmText surfaces (callLlm returns
    // { ok: true, text: "" } on MAX_TOKENS or a safety block - Gemini answers
    // HTTP 200 with no text). Calling callLlm directly here keeps that
    // diagnostic intact without editing a file outside this task's ownership.
    const prompt = `You are revising an already-generated "${config.label}" document for its instructor.

CURRENT DOCUMENT:
${currentText}

REQUESTED CHANGES:
${instructions}

Rewrite the document so it satisfies the requested changes.

Requirements:
- Return the COMPLETE revised document, ready to use as-is.
- Preserve everything the request did not ask you to change, including the existing heading structure and wording.
- Keep the same plain-text/markdown-ish formatting conventions the document already uses.
- Do not add commentary, preamble, or an explanation of what you changed. Return only the document text.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) return { error: describeLlmFailure(result, `Refine ${config.label}`) };
    const revised = result.text.trim();
    if (!revised) return { error: describeEmptyLlmText(result, `Refine ${config.label}`) };

    const supabase = createServiceClient();
    const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
      courseId: course.id,
      kind: config.artifactKind,
      ...carriedTitle,
      text: revised,
      prompt,
    });
    return { artifact };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not refine the generated content." };
  }
}

export interface ListGeneratedArtifactVersionsInput {
  courseUrl: string;
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

    const resolved = await resolveLmsCourseRowAction(input.courseUrl);
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
