"use server";

// Read-only gathering of a Modules-view bulk selection into flat text for the
// AI Chatbot session (Contract 3, docs/modules-selection-ask-ai-acceptance-
// criteria.md - file set B). This is a near-sibling of two existing files,
// read in full before writing this one:
//   - src/app/actions/lms-generation.ts's generateFromSelectionAction: same
//     requireOwner gating, same source-aware course resolution
//     (resolveGenerationCourseRow's own two-branch shape), same whole-module
//     expansion pattern.
//   - src/app/api/lms-generation/deck/route.ts: the identical course-
//     resolution branch (courseId -> by id, else courseUrl, with acronym
//     threaded through via normalizeCanvasAcronymInput) and the identical
//     LIVE_FETCHERS wiring, copied below for the same reason that file's own
//     header comment gives (a "use server" module cannot export it).
//
// The ONLY real difference from either precedent: this action never
// generates anything and never persists anything (D3/B5 of the acceptance
// doc). It resolves the course, expands any whole-module selection against a
// FRESH module tree, gathers the selection's materials text via the same
// gatherSelectionMaterials every generation kind already uses, and hands
// that text straight back to the caller so the chat session can hold it for
// the lifetime of the window (D1, docs/modules-selection-ask-ai-acceptance-
// criteria.md). No saveGeneratedArtifactVersion call, no Canvas write
// action, no Supabase write anywhere in this file.
//
// "use server" RULE: a module marked "use server" may export only async
// functions (src/lib/use-server-exports.test.ts) - the two interfaces below
// are DECLARED here, not re-exported from elsewhere, the same pattern
// GenerateFromSelectionInput/GenerateFromSelectionSuccess already use in
// lms-generation.ts (see that file's own header comment on why a re-export
// of a type, as opposed to a declaration, is the one thing that breaks the
// production build without any local gate catching it).
import { requireOwner } from "@/lib/supabase/auth";
import { resolveLmsCourseRowAction, resolveLmsCourseRowByIdAction } from "@/app/actions/lms-syllabus-buttons";
import { listCourseContentAction } from "@/app/actions/canvas-modules";
import { getPageAction, previewFileAction } from "@/app/actions/canvas-files-bulk";
import { fetchCanvasMetaAction } from "@/app/actions/grading";
import {
  gatherSelectionMaterials,
  expandModuleSelection,
  type SelectedMaterialItem,
  type MaterialsFetchers,
} from "@/lib/lms-generation/materials";
import { isCourseNotLinkedMessage } from "@/lib/lms-generation/course-not-linked";
import { normalizeCanvasAcronymInput } from "@/lib/course-canvas-url-match";
import { SELECTION_CHAT_MAX_ITEMS, tooManyItemsForChatNote } from "@/lib/chat/selection-context";

// The live-Canvas reads gatherSelectionMaterials needs, wired to the app's
// own existing actions - copied from LIVE_FETCHERS in
// src/app/api/lms-generation/deck/route.ts (itself already a second copy of
// the ORIGINAL LIVE_FETCHERS in src/app/actions/lms-generation.ts). Not
// imported from either: a "use server" module may export only async
// functions (src/lib/use-server-exports.test.ts), so this plain object
// literal cannot be exported from either of those files - both of their own
// header comments record the identical tradeoff for the identical reason,
// and judge a shared module for three lines of wiring not worth the
// indirection. This is that same tradeoff's third copy, used by a third,
// independent call site.
const LIVE_FETCHERS: MaterialsFetchers = {
  getPage: (courseUrl, pageUrl, institution) => getPageAction(courseUrl, pageUrl, institution),
  previewFile: (courseUrl, contentId, institution) => previewFileAction(courseUrl, contentId, institution),
  fetchMeta: (contentUrl) => fetchCanvasMetaAction(contentUrl),
};

export interface SelectionChatContextInput {
  courseUrl: string;
  /** An export-sourced selection's course_hub row id - same identifier and
   * same resolution rule as GenerateFromSelectionInput.courseId
   * (lms-generation.ts) and the deck route's own `body.courseId`: present
   * means resolve by row id (resolveLmsCourseRowByIdAction), because
   * ContentTab.tsx blanks `courseUrl` to "" for every export-sourced
   * selection, so a courseUrl-only resolution could never match it. */
  courseId?: string;
  /** The LMS tab's active institution acronym - threaded into
   * resolveLmsCourseRowAction exactly as the deck route threads
   * `body.acronym`, so a host-less `courseUrl` (the only shape
   * CoursePicker.tsx/LmsCell.tsx ever emit) still resolves to the right row
   * instead of colliding with another institution's course sharing the same
   * numeric id. Ignored entirely on the courseId branch. */
  acronym?: string;
  /** Already-normalized, already-export-expanded selection items - an
   * export-sourced module selection has no server-side fetch path at all
   * and is expanded client-side before this action is ever called (see
   * expandModuleSelection's own doc comment, materials.ts, for the full
   * live-vs-export rationale). */
  items: SelectedMaterialItem[];
  /** LIVE module ids only - Canvas module ids are always numeric, and an
   * export-sourced module selection is pre-expanded into concrete `items`
   * by the caller, so this field never carries anything but a live id -
   * mirrors generateFromSelectionAction's and the deck route's identical
   * `moduleIds` field exactly. */
  moduleIds?: number[];
}

export interface SelectionChatContextSuccess {
  materialsText: string;
  notes: string[];
  /** Items actually gathered, after server-side module expansion - lets the
   * caller (AiChatFab.tsx, via the bulk bar hook) report an accurate count
   * even when a whole-module selection was involved
   * (selectionContextLabel, src/lib/chat/selection-context.ts). */
  itemCount: number;
}

/**
 * Gather an "Ask AI" selection's materials text for the chat session (D1).
 * READ-ONLY (D3/B5): calls only resolveLmsCourseRowAction/
 * resolveLmsCourseRowByIdAction, listCourseContentAction and
 * gatherSelectionMaterials - three reads, delegated to existing code, never
 * a Canvas write, a Supabase write, or a generated_artifacts write.
 *
 * Refusals (B4), in the order they are checked:
 *   1. no items and no moduleIds - refused before any course resolution or
 *      Canvas call, mirroring generateFromSelectionAction's identical early
 *      refusal for the identical reason (never spend a network call on a
 *      selection that is already known to be empty).
 *   2. an unresolvable course - the course-not-linked wording is preserved
 *      via isCourseNotLinkedMessage/courseNotLinked, exactly as every other
 *      selection-consuming action in this codebase already reports it.
 *   3. the POST-expansion item count exceeds SELECTION_CHAT_MAX_ITEMS - only
 *      knowable once a whole-module selection has actually been expanded, so
 *      this check runs after that expansion rather than before it. The
 *      client (file set C) already pre-checks the same cap before ever
 *      calling this action (A4); this is the independent server-side
 *      re-enforcement B4 requires regardless of whether that pre-flight
 *      check ran, or was bypassed.
 *   4. a gather that produced no usable text.
 */
export async function buildSelectionChatContextAction(
  input: SelectionChatContextInput
// The error arm carries an OPTIONAL `courseNotLinked` flag alongside the
// message, mirroring GenerationFailure (src/lib/lms-generation/kinds.ts) -
// the same shape every other selection-consuming action in this codebase
// already returns for the same refusal. Contract 3 in
// docs/modules-selection-ask-ai-acceptance-criteria.md fixes the error arm as
// `{ error: string }`; widening it with an optional field is compatible with
// that contract (a caller narrowing on `"error" in result` is unaffected, and
// today's only caller - useSelectionChatContext, file set C - reads just
// `.error`), which is why the flag is kept rather than dropped: throwing away
// the one fact that distinguishes "this course was never linked to Canvas"
// from a generic failure would make a future caller re-derive it by matching
// on message text.
): Promise<SelectionChatContextSuccess | { error: string; courseNotLinked?: boolean }> {
  try {
    await requireOwner();

    const moduleIds = input.moduleIds ?? [];
    if ((!input.items || input.items.length === 0) && moduleIds.length === 0) {
      return { error: "Select at least one item to load into the chat." };
    }

    // Source-aware resolution, byte-identical branch to the deck route's own
    // (src/app/api/lms-generation/deck/route.ts): `courseId` present means
    // an export-sourced selection, resolved by its course_hub row id;
    // absent means a live selection, resolved by `courseUrl` (with
    // `acronym` threaded through when present, via the same
    // normalizeCanvasAcronymInput whitespace guard the deck route uses - a
    // literal "   " acronym is truthy JSON input and would otherwise be
    // treated as "present").
    const acronym = normalizeCanvasAcronymInput(input.acronym);
    const resolved = input.courseId
      ? await resolveLmsCourseRowByIdAction(input.courseId)
      : acronym
        ? await resolveLmsCourseRowAction(input.courseUrl, acronym)
        : await resolveLmsCourseRowAction(input.courseUrl);
    if ("error" in resolved) {
      return isCourseNotLinkedMessage(resolved.error)
        ? { error: resolved.error, courseNotLinked: true }
        : { error: resolved.error };
    }
    const course = resolved.course;

    // Whole-module expansion, live-only, against a FRESH read - never a
    // client-supplied tree (B2) - and skipped entirely when no whole module
    // was selected, so the common items-only path costs no extra Canvas
    // call. Mirrors generateFromSelectionAction's and the deck route's
    // identical handling, including reproducing the `live:${id}` template
    // directly rather than importing it - materials.ts's own header comment
    // records why this module stays free of any content-tab/client import.
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

    // B4's cap re-enforcement: on the POST-expansion count, since a
    // whole-module selection's real size is only known once it has actually
    // been expanded above. SELECTION_CHAT_MAX_ITEMS/tooManyItemsForChatNote
    // come from src/lib/chat/selection-context.ts (Contract 1, owned by file
    // set A) - the SAME constant and the SAME wording function the client's
    // own pre-flight check (A4) uses, so a selection that slips past the
    // client check for any reason is refused with the identical message
    // rather than a second, independently-spelled one.
    if (resolvedItems.length > SELECTION_CHAT_MAX_ITEMS) {
      return { error: tooManyItemsForChatNote(resolvedItems.length, SELECTION_CHAT_MAX_ITEMS) };
    }

    const materials = await gatherSelectionMaterials(resolvedItems, {
      canvasUrl: course.canvasUrl ?? "",
      institution: course.institution ?? undefined,
      fetchers: LIVE_FETCHERS,
    });
    if (!materials.materialsText.trim()) {
      return { error: "The selected item(s) had no usable material to load into the chat." };
    }

    return {
      materialsText: materials.materialsText,
      notes: materials.notes,
      itemCount: resolvedItems.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the selection into the chat." };
  }
}
