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
import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveLmsCourseRowAction } from "./lms-syllabus-buttons";
import { generateLectureQaAction } from "./course-planning-lecture";
import { researchCurrentEventsAction } from "./current-events";
import { getPageAction, previewFileAction } from "./canvas-files-bulk";
import { fetchCanvasMetaAction } from "./grading";
import { listCourseContentAction } from "./canvas-modules";
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
import { GENERATION_KIND_CONFIGS, type GenerationKindId } from "@/lib/lms-generation/kinds";
import { callLlm, describeEmptyLlmText, describeLlmFailure, type LlmProvider } from "@/lib/llm";
import { resolveCourseKind } from "@/lib/course-kind";

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

export interface GenerationFailure {
  error: string;
  /** True specifically for resolveLmsCourseRowAction's own "not linked"
   * error (see isCourseNotLinkedMessage) - lets the caller offer "link this
   * course" instead of a generic error banner, rather than treating this the
   * same as any other failure. */
  courseNotLinked?: true;
}

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

    if (input.kind === "qa") {
      const config = GENERATION_KIND_CONFIGS.qa;
      const generated = await generateLectureQaAction(
        course.name,
        moduleLabel,
        materials.materialsText,
        [],
        provider,
        resolveCourseKind(course.courseKind)
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
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate content." };
  }
}

export interface RefineGeneratedArtifactInput {
  courseUrl: string;
  kind: GenerationKindId;
  /** The version being refined, as already-displayed text - mirrors
   * reviseDocumentAction's own `documentText` contract (see this function's
   * body comment for why that action itself is not reused here). */
  currentText: string;
  instructions: string;
  provider?: LlmProvider;
}

export interface RefineGeneratedArtifactSuccess {
  artifact: GeneratedArtifact;
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
    const config = GENERATION_KIND_CONFIGS[input.kind];
    const provider: LlmProvider = input.provider ?? "gemini";

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
