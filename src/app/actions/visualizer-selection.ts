"use server";

// Visualizer coverage for a Modules selection (Contract 3,
// docs/visualizer-coverage-from-selection-acceptance-criteria.md - file set
// B). Three actions share one pipeline up to a decision point (see that
// doc's "Why these are one feature, not two"):
//   1. scanSelectionForVisualizerCoverageAction - gather the selection's
//      materials, extract visualization-worthy concepts, resolve each
//      against the visualizer index. WRITES NOTHING (A5).
//   2. linkVisualizerPagesIntoModuleAction - insert ALREADY-COVERED concepts
//      into a Canvas module as external-URL items. Writes to Canvas ONLY.
//   3. createVisualizerPagesForGapsAction - author new visualizer pages for
//      GAP concepts. Writes to the visualizer repo ONLY.
//
// Read in full before writing this file, and reused rather than
// reimplemented below:
//   - src/app/actions/selection-chat-context.ts - the closest precedent.
//     scanSelectionForVisualizerCoverageAction's gathering half (owner gate,
//     source-aware course resolution, fresh whole-module expansion,
//     gatherSelectionMaterials + a locally-copied LIVE_FETCHERS) is that
//     file's identical shape, adapted to add extraction + index resolution
//     afterward instead of returning materialsText directly.
//   - src/app/actions/visualizer.ts - findVisualizerConceptAction/
//     createVisualizerConceptAction (createVisualizerPagesForGapsAction
//     calls the latter per gap, never reimplements the repo-commit logic).
//   - src/app/actions/live-class.ts - loadVisualizerIndexAction (the
//     visualizer nav index reader; called fresh by BOTH the scan and the
//     create action - never cached across a request).
//   - src/lib/live-class/links.ts - resolveVisualizerLinks, the one true
//     concept-to-index matcher (never hand-rolled).
//   - src/lib/visualizer.ts - matchConcept/VISUALIZER_TOPICS/topicByKey/
//     creatableTopics. TOPIC_TO_DIR_MAP/TOPIC_TO_EXPORT_MAP are documented
//     stale there and are not used here.
//   - src/app/actions/canvas-modules.ts - listCourseContentAction (fresh
//     reads, both for scan's module expansion and link's C5 recheck) and
//     createModuleItemAction (the ONLY Canvas write in this file).
//
// "use server" RULE (src/lib/use-server-exports.test.ts): a module marked
// "use server" may export only async functions - every interface below is
// DECLARED locally, never re-exported from elsewhere, the same pattern
// selection-chat-context.ts's own header comment records.
//
// SIBLING IMPORTS (set A, built concurrently against Contract 1/2 of the
// acceptance doc - NOT stubbed here per this chunk's own instructions):
//   - @/lib/visualizer/selection-coverage: the pure classification leaf.
//   - @/app/actions/visualization-concepts-generator: the concept extractor.
import { requireOwner } from "@/lib/supabase/auth";
import { resolveLmsCourseRowAction, resolveLmsCourseRowByIdAction } from "@/app/actions/lms-syllabus-buttons";
import { listCourseContentAction, createModuleItemAction } from "@/app/actions/canvas-modules";
import { getPageAction, previewFileAction } from "@/app/actions/canvas-files-bulk";
import { fetchCanvasMetaAction } from "@/app/actions/grading";
import {
  gatherSelectionMaterials,
  expandModuleSelection,
  type SelectedMaterialItem,
  type MaterialsFetchers,
} from "@/lib/lms-generation/materials";
import { normalizeCanvasAcronymInput } from "@/lib/course-canvas-url-match";
import { loadVisualizerIndexAction } from "@/app/actions/live-class";
import { resolveVisualizerLinks, type VisualizerIndexEntry } from "@/lib/live-class/links";
import { createVisualizerConceptAction } from "@/app/actions/visualizer";
import { matchConcept, VISUALIZER_TOPICS, topicByKey, creatableTopics } from "@/lib/visualizer";
import type { LlmProvider } from "@/lib/llm";
import {
  VISUALIZER_LINK_MAX_ITEMS,
  VISUALIZER_SCAN_MAX_CONCEPTS,
  VISUALIZER_CREATE_MAX_PAGES,
  classifySelectionCoverage,
  visualizerLinkTitle,
  unlinkedConcepts,
  dedupeConceptsByUrl,
  type ScannedConcept,
  type ConceptResolution,
  type CoveredConcept,
  type GapConcept,
} from "@/lib/visualizer/selection-coverage";
import { extractVisualizationConceptsAction } from "@/app/actions/visualization-concepts-generator";

// The live-Canvas reads gatherSelectionMaterials needs. Copied literally
// from selection-chat-context.ts's own LIVE_FETCHERS (itself the third copy
// of the original in src/app/actions/lms-generation.ts - see that file's own
// header comment): a "use server" module cannot export this plain object
// literal (only async functions may be exported), so every independent
// caller carries its own copy rather than importing one.
const LIVE_FETCHERS: MaterialsFetchers = {
  getPage: (courseUrl, pageUrl, institution) => getPageAction(courseUrl, pageUrl, institution),
  previewFile: (courseUrl, contentId, institution) => previewFileAction(courseUrl, contentId, institution),
  fetchMeta: (contentUrl) => fetchCanvasMetaAction(contentUrl),
};

// ─────────────────────────────────────────────────────────────────────────
// 1. scanSelectionForVisualizerCoverageAction
// ─────────────────────────────────────────────────────────────────────────

export interface VisualizerScanInput {
  courseUrl: string;
  courseId?: string;
  acronym?: string;
  items: SelectedMaterialItem[];
  moduleIds?: number[];
  provider?: LlmProvider;
}

export interface VisualizerScanSuccess {
  covered: CoveredConcept[];
  gaps: GapConcept[];
  /** Gather/extract notes, surfaced verbatim - never dropped. */
  notes: string[];
}

/**
 * Resolve one extracted concept against an already-loaded visualizer index.
 * `resolveVisualizerLinks` (src/lib/live-class/links.ts) is the ONE true
 * concept-to-index matcher and is called here to produce the authoritative
 * `url`/`label` - it independently re-derives the match and only ever
 * returns a link when the matched topic is creatable, so its presence is
 * never reconstructed by hand. `matchConcept` (the same primitive
 * resolveVisualizerLinks itself calls internally) is consulted separately
 * to recover the matched topic's key even when NOT creatable - information
 * resolveVisualizerLinks intentionally discards (it returns nothing at all
 * for a matched-but-not-creatable topic) but which A4/classifySelectionCoverage
 * need in order to distinguish "no-match" from "topic-not-creatable" gaps.
 * `creatable` is set from topicByKey/creatableTopics, never from trusting
 * VISUALIZER_TOPICS' own `.creatable` field directly, so this stays correct
 * even if that table's shape changes (mirrors createVisualizerConceptAction's
 * own "only from creatableTopics()" rule, src/app/actions/visualizer.ts).
 */
function resolveConceptAgainstIndex(
  scanned: ScannedConcept,
  entries: VisualizerIndexEntry[]
): ConceptResolution {
  const match = matchConcept(entries, scanned.concept);
  if (!match) {
    return { concept: scanned.concept, evidence: scanned.evidence, url: null, topicKey: null, label: null, creatable: false };
  }

  const matchedTopic = VISUALIZER_TOPICS.find((t) => t.navExport === match.topicExport);
  const topicKey = matchedTopic?.key ?? null;
  const topic = topicKey ? topicByKey(topicKey) : undefined;
  const creatable = topic ? creatableTopics().some((t) => t.key === topic.key) : false;

  const [link] = resolveVisualizerLinks([scanned.concept], entries);

  return {
    concept: scanned.concept,
    evidence: scanned.evidence,
    url: link?.url ?? null,
    topicKey,
    label: link?.label ?? match.label,
    creatable,
  };
}

/**
 * Scan a Modules selection for visualizer coverage (A1-A6). READ-ONLY: calls
 * only course resolution, listCourseContentAction, gatherSelectionMaterials,
 * extractVisualizationConceptsAction and loadVisualizerIndexAction - never a
 * Canvas write, a visualizer-repo write, or a Supabase write (A5).
 *
 * Refusals (A6), in the order checked - each a specific, distinguishable
 * message so "found nothing" is never rendered as success:
 *   1. no items and no moduleIds - refused before any network call, mirroring
 *      buildSelectionChatContextAction's identical early refusal.
 *   2. an unresolvable course (course-not-linked wording preserved).
 *   3. a gather that produced no usable text.
 *   4. an extraction that found no visualization-worthy concepts.
 *   5. an unreachable visualizer index.
 */
export async function scanSelectionForVisualizerCoverageAction(
  input: VisualizerScanInput
): Promise<VisualizerScanSuccess | { error: string }> {
  try {
    await requireOwner();

    const moduleIds = input.moduleIds ?? [];
    if ((!input.items || input.items.length === 0) && moduleIds.length === 0) {
      return { error: "Select at least one item to scan for visualizer coverage." };
    }

    // Source-aware resolution - byte-identical branch to
    // selection-chat-context.ts's own (itself mirroring the deck route's):
    // `courseId` present means an export-sourced selection, resolved by its
    // course_hub row id; absent means a live selection, resolved by
    // `courseUrl` (with `acronym` threaded through when present).
    const acronym = normalizeCanvasAcronymInput(input.acronym);
    const resolved = input.courseId
      ? await resolveLmsCourseRowByIdAction(input.courseId)
      : acronym
        ? await resolveLmsCourseRowAction(input.courseUrl, acronym)
        : await resolveLmsCourseRowAction(input.courseUrl);
    // Contract 3 fixes the error arm as `{ error: string }` (no widening) -
    // unlike buildSelectionChatContextAction, the course-not-linked message
    // is surfaced verbatim with no extra `courseNotLinked` flag.
    if ("error" in resolved) {
      return { error: resolved.error };
    }
    const course = resolved.course;

    // Whole-module expansion, live-only, against a FRESH read (A2) - never a
    // client-supplied tree - skipped entirely when no whole module was
    // selected, exactly as selection-chat-context.ts's identical step.
    let resolvedItems = input.items ?? [];
    if (moduleIds.length > 0) {
      const content = await listCourseContentAction(course.canvasUrl ?? "", course.institution ?? undefined);
      if ("error" in content) return { error: content.error };
      resolvedItems = expandModuleSelection(
        resolvedItems,
        moduleIds.map((id) => `live:${id}`),
        content.modules
      );
    }

    const materials = await gatherSelectionMaterials(resolvedItems, {
      canvasUrl: course.canvasUrl ?? "",
      institution: course.institution ?? undefined,
      fetchers: LIVE_FETCHERS,
    });
    if (!materials.materialsText.trim()) {
      return { error: "The selected item(s) had no usable material to scan for visualizer coverage." };
    }

    // D2/D3: a NEW extraction (never extractDeckConceptsAction) asking
    // specifically for visualization-worthy concepts - see that action's own
    // doc comment (set A, Contract 2) for why the deck-framed prompt/fallback
    // is not reused verbatim.
    //
    // SHOULD-FIX 6 fix: VISUALIZER_SCAN_MAX_CONCEPTS (20, the pure leaf's own
    // documented ceiling - "matches clampDeckConcepts' own ceiling") is passed
    // explicitly here rather than leaving maxConcepts undefined, which used to
    // silently fall back to clampDeckConcepts' DEFAULT of 8 - a scan over a
    // large selection was capped at 8 concepts with no note anywhere that it
    // had been truncated. Passing the real ceiling here means a scan actually
    // surfaces up to 20 concepts, and a scan that still hits that ceiling
    // (concepts.length === cap - extraction genuinely cannot return more) says
    // so below rather than silently under-reporting.
    const extracted = await extractVisualizationConceptsAction(
      materials.materialsText,
      VISUALIZER_SCAN_MAX_CONCEPTS,
      input.provider
    );
    if ("error" in extracted) return { error: extracted.error };
    if (extracted.concepts.length === 0) {
      return { error: "No visualization-worthy concepts were found in the selected material." };
    }

    // A4: resolved via loadVisualizerIndexAction + resolveVisualizerLinks -
    // never a hand-rolled match. A failed index load is its own
    // distinguishable refusal (A6) rather than silently degrading to "every
    // concept is a gap".
    const index = await loadVisualizerIndexAction();
    if ("error" in index) return { error: index.error };

    const resolutions = extracted.concepts.map((c) => resolveConceptAgainstIndex(c, index.entries));
    const coverage = classifySelectionCoverage(resolutions);

    const notes = [...materials.notes];
    if (extracted.concepts.length >= VISUALIZER_SCAN_MAX_CONCEPTS) {
      notes.push(
        `Concept extraction stopped at ${VISUALIZER_SCAN_MAX_CONCEPTS} concepts - the selection may contain more than this scan surfaced. Scan a smaller selection to see the rest.`
      );
    }

    return { covered: coverage.covered, gaps: coverage.gaps, notes };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not scan the selection for visualizer coverage." };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 2. linkVisualizerPagesIntoModuleAction
// ─────────────────────────────────────────────────────────────────────────

export interface VisualizerLinkInput {
  courseUrl: string;
  acronym?: string;
  moduleId: number;
  concepts: CoveredConcept[];
}

export interface VisualizerLinkSuccess {
  linked: string[];
  skipped: string[];
  failed: Array<{ concept: string; error: string }>;
}

/**
 * Insert already-covered concepts into a Canvas module as external-URL
 * items (C1-C8). Writes to Canvas ONLY - never to the visualizer repo (this
 * file never imports createVisualizerConceptAction/putFile/getFileText into
 * this function's body).
 *
 * C5: the target module's items are re-read FRESH (never trusted from the
 * scan) and unlinkedConcepts (the pure leaf's own comparator, compared on
 * normalized url) drops what is already linked - reported as `skipped`,
 * mirroring planPostSteps' own linkedPageUrls check
 * (src/lib/lms-generation/commit-plan.ts).
 * C6: a per-concept insertion failure is isolated and recorded in `failed`,
 * never fatal to the run.
 */
export async function linkVisualizerPagesIntoModuleAction(
  input: VisualizerLinkInput
): Promise<VisualizerLinkSuccess | { error: string }> {
  try {
    await requireOwner();

    const concepts = Array.isArray(input.concepts) ? input.concepts : [];
    if (concepts.length === 0) {
      return { error: "Select at least one covered concept to link." };
    }
    if (!Number.isFinite(input.moduleId)) {
      return { error: "Choose a module to add the links to." };
    }

    const acronym = normalizeCanvasAcronymInput(input.acronym);

    // FRESH read (C5) - never a client-supplied module tree, the same rule
    // A2's scan expansion and buildSelectionChatContextAction's own
    // expansion both follow for the identical reason.
    const content = await listCourseContentAction(input.courseUrl, acronym);
    if ("error" in content) return { error: content.error };

    const targetModule = content.modules.find((m) => m.id === input.moduleId);
    if (!targetModule) {
      return { error: "That module could not be found." };
    }

    const existingExternalUrls = targetModule.items
      .filter((item) => item.type === "ExternalUrl" && Boolean(item.externalUrl))
      .map((item) => item.externalUrl as string);

    // Cap at VISUALIZER_LINK_MAX_ITEMS before any Canvas call.
    const capped = concepts.slice(0, VISUALIZER_LINK_MAX_ITEMS);

    // C5: drop what the module already has (by url, freshly re-read).
    const alreadyLinked = unlinkedConcepts(capped, existingExternalUrls);
    // NIT 13: also drop what THIS RUN's own input would otherwise insert
    // twice - two differently-normalized concepts (e.g. "For Loops" and "for
    // loops") can resolve to the same visualizer url in one scan.
    // unlinkedConcepts only ever compares against the module's EXISTING
    // items, never against its own output, so a second, later duplicate url
    // in `alreadyLinked` would otherwise reach createModuleItemAction twice
    // in this same run.
    const { unique: toLink } = dedupeConceptsByUrl(alreadyLinked);
    // NIT 14: computed by OBJECT IDENTITY, not by concept name - unlinkedConcepts
    // and dedupeConceptsByUrl both filter without cloning, so every entry in
    // `toLink` is the exact same object reference as its source entry in
    // `capped`, and comparing by reference (rather than by name, as before)
    // stays correct even if two different capped concepts happen to share a
    // name but resolve to different urls.
    const toLinkSet = new Set(toLink);
    const skipped = capped.filter((c) => !toLinkSet.has(c)).map((c) => c.concept);

    const linked: string[] = [];
    const failed: Array<{ concept: string; error: string }> = [];

    for (const concept of toLink) {
      try {
        // C3: the SAME call useAddModuleItem already makes for a manually
        // added external URL - no new Canvas helper is written here.
        const result = await createModuleItemAction(
          input.courseUrl,
          input.moduleId,
          { type: "ExternalUrl", externalUrl: concept.url, title: visualizerLinkTitle(concept.concept) },
          acronym
        );
        if ("error" in result) {
          failed.push({ concept: concept.concept, error: result.error });
          continue;
        }
        linked.push(concept.concept);
      } catch (err) {
        failed.push({
          concept: concept.concept,
          error: err instanceof Error ? err.message : "Could not add the link.",
        });
      }
    }

    return { linked, skipped, failed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not link the visualizer pages into the module." };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3. createVisualizerPagesForGapsAction
// ─────────────────────────────────────────────────────────────────────────

export interface VisualizerCreateInput {
  concepts: GapConcept[];
  provider?: LlmProvider;
}

export interface VisualizerCreateSuccess {
  created: Array<{ concept: string; url: string }>;
  skipped: string[];
  failed: Array<{ concept: string; error: string }>;
  /** BLOCKER 2: gap concepts this run did not even attempt - either because
   *  VISUALIZER_CREATE_MAX_PAGES was reached, or (defensively) because the
   *  run stopped before reaching them. NEVER silently dropped: a re-run on
   *  exactly this list is how the instructor gets the rest created, rather
   *  than believing every gap was handled. Optional (rather than required)
   *  so this addition stays backward-compatible with any caller/fixture
   *  built against the pre-existing three-field shape - createVisualizerPagesForGapsAction
   *  itself always populates it (see below), so a real caller never
   *  actually gets `undefined` here; the flexibility is for type
   *  compatibility only. */
  notAttempted?: string[];
}

/**
 * Author new visualizer pages for gap concepts (B1-B5). Writes to the
 * visualizer repo ONLY - never to Canvas (this function never imports/calls
 * createModuleItemAction or any other Canvas write).
 *
 * A gap whose reason is "topic-not-creatable" is filtered out before any
 * creation attempt, regardless of what the caller sent - the same
 * never-trust-the-caller posture the link action's C5 recheck follows, and
 * the reason `createVisualizerConceptAction` itself only ever picks a topic
 * from `creatableTopics()` (src/app/actions/visualizer.ts).
 *
 * BLOCKER 2 fix: creation is capped at VISUALIZER_CREATE_MAX_PAGES BEFORE any
 * work starts, mirroring linkVisualizerPagesIntoModuleAction's own
 * VISUALIZER_LINK_MAX_ITEMS cap - see that constant's doc comment
 * (src/lib/visualizer/selection-coverage.ts) for the time-budget arithmetic
 * behind the number. Unlike the link action, this one is NOT cheap: each
 * concept is createVisualizerConceptAction (src/app/actions/visualizer.ts:95-
 * 255) - 2-3 LLM round trips, 2 GitHub reads, and THREE sequential putFile
 * commits. Left uncapped, a call from this Server Action (reachable from
 * src/app/page.tsx, which sets no maxDuration - see
 * generateFromSelectionAction's identical "decks" refusal,
 * src/app/actions/lms-generation.ts:329-342, for why that matters on Vercel
 * Hobby's hard 60s ceiling) risks the PLATFORM killing the function mid-loop:
 * pages already committed to the external repo, but the client never
 * receives any response and reports a bare fetch failure, with no list of
 * what was actually created. Every gap beyond the cap is named in
 * `notAttempted`, never silently dropped - the instructor re-runs on exactly
 * that list.
 *
 * A SILENT truncation would be worse than the cap: `notAttempted` is
 * computed from the full `creatableGaps` set (not just the excess past the
 * cap) so it also covers the pathological case where this run stops before
 * even reaching every capped concept (see the per-gap try/catch below).
 *
 * B4: the visualizer index is re-read FRESH (loadVisualizerIndexAction) and
 * matched via matchConcept (never trusted from the scan's own snapshot) - a
 * concept that gained a page since the scan is skipped rather than
 * duplicated.
 *
 * B3/partial-progress: EVERY per-gap operation - the fresh-index match AND
 * the creation call - runs inside ONE try/catch per gap, so a failure for
 * one concept (whether a normal `{ error }` return or a genuine thrown
 * exception) can never erase pages already committed for EARLIER concepts in
 * this same run; it only marks that one concept `failed` and moves on. B2:
 * each concept's own scan-time evidence is passed as
 * `createVisualizerConceptAction`'s `context` so the generated component is
 * grounded in the instructor's material.
 *
 * What this CANNOT do: if the platform kills the function outright (a real
 * Vercel Hobby maxDuration timeout, as opposed to an in-process exception),
 * no try/catch runs afterward and no response ever reaches the client either
 * way - that failure mode is not interceptable from inside a Server Action.
 * VISUALIZER_CREATE_MAX_PAGES is the actual defense against ever getting
 * close to that ceiling; the per-gap isolation above only protects against
 * an in-process failure the platform did NOT kill the function for.
 */
export async function createVisualizerPagesForGapsAction(
  input: VisualizerCreateInput
): Promise<VisualizerCreateSuccess | { error: string }> {
  try {
    await requireOwner();

    const concepts = Array.isArray(input.concepts) ? input.concepts : [];
    const creatableGaps = concepts.filter((c) => c.reason !== "topic-not-creatable");
    if (creatableGaps.length === 0) {
      return { error: "No creatable gap concepts were provided." };
    }

    // Cap BEFORE any work starts - see this function's own doc comment and
    // VISUALIZER_CREATE_MAX_PAGES' doc comment for the time-budget math.
    const toAttempt = creatableGaps.slice(0, VISUALIZER_CREATE_MAX_PAGES);

    const index = await loadVisualizerIndexAction();
    if ("error" in index) return { error: index.error };

    const provider = input.provider ?? "gemini";
    const created: Array<{ concept: string; url: string }> = [];
    const skipped: string[] = [];
    const failed: Array<{ concept: string; error: string }> = [];

    for (const gap of toAttempt) {
      try {
        if (matchConcept(index.entries, gap.concept)) {
          skipped.push(gap.concept);
          continue;
        }

        const result = await createVisualizerConceptAction(gap.concept, gap.evidence, provider);
        if ("error" in result) {
          failed.push({ concept: gap.concept, error: result.error });
          continue;
        }
        created.push({ concept: gap.concept, url: result.url });
      } catch (err) {
        // Isolated to THIS gap only - matchConcept and createVisualizerConceptAction
        // share one try/catch so neither can abort the loop and erase
        // earlier gaps' already-committed pages.
        failed.push({
          concept: gap.concept,
          error: err instanceof Error ? err.message : "Could not create the visualizer page.",
        });
      }
    }

    const reached = new Set([...created.map((c) => c.concept), ...skipped, ...failed.map((f) => f.concept)]);
    const notAttempted = creatableGaps.filter((c) => !reached.has(c.concept)).map((c) => c.concept);

    return { created, skipped, failed, notAttempted };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the visualizer pages." };
  }
}
