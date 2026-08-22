"use client";

// Local UI state + handler for the LMS Modules bulk bar's "Ask AI" row
// (docs/modules-selection-ask-ai-acceptance-criteria.md, section A) - one
// click gathers the current module/item selection's actual text and opens
// the app-wide AI Chatbot with it loaded as context. Structural sibling of
// useSelectionDownload.ts (read in full before this was written): same
// argument style/ordering (courseUrl, courseId, acronym, selectedMaterialItems,
// selectedModules, modules, exportModules, setNote), same own-busy-state
// shape, same setNote-only reporting channel - this row is a READ (D3), so it
// never touches `opBusy`/the tab-wide `busy` flag/`reload()` either, for
// exactly the reason that file's own header comment gives for the download
// row.
//
// THE LIVE/EXPORT EXPANSION SPLIT (step 3/4 below) IS COPIED FROM
// useLmsGeneration.ts's OWN `generate()`, NOT REINVENTED: a whole-module
// selection is expanded two different ways depending on what the expansion
// is FOR.
//   - `expandedForLabel` passes this hook's own (possibly stale) client
//     `modules` tree AND `exportModules`, to compute ONLY the pre-flight
//     item-count cap (A4) - never sent anywhere, so staleness here cannot
//     change what the server actually gathers (see materials.ts's own
//     header comment on expandModuleSelection for why this split exists at
//     all, and useLmsGeneration.ts's `generate()` for the identical
//     reasoning restated for generation instead of chat context).
//   - `itemsForServer` passes an EMPTY live tree, so it expands ONLY the
//     export half of the selection into real items right now - there is no
//     server-side fetch path for a course export. Any live module key
//     contributes nothing to this call; it is sent instead as `moduleIds`,
//     which buildSelectionChatContextAction expands itself server-side from
//     a FRESH read (Contract 3/B2), never this stale client tree.
//
// D1 (the AC doc's own decision record): the selection is gathered ONCE, at
// click time, and the resulting TEXT is held for the chat session by
// AiChatFab (Contract 2/C2) - this hook's job ends the moment `openChat` is
// dispatched; it holds no session state of its own.
//
// A2/A7: one gather in flight at a time (own `busy` boolean, mirroring
// useSelectionDownload's own `busy !== ""` guard on its `download()`), and
// this row has no PERMANENT "cannot do this right now" state to model (unlike
// useSelectionDownload's imsccUnavailableReason/zipUnavailableReason, which
// exist because a stored export cannot always resolve an identifier or
// support every format) - the server resolves the course row itself (B1) and
// reports a specific `{ error }` string if that fails, surfaced through
// `setNote` exactly like every other refusal below. There is therefore
// nothing for AskAiSelectionSection.tsx to render `aria-disabled` for beyond
// the transient busy state, which native `disabled` already covers - see
// that file's own header comment.
import { useState } from "react";
import type { CanvasModule } from "@/lib/canvas-modules";
import type { CartridgeModule } from "@/lib/cartridge-import";
import { expandModuleSelection, type SelectedMaterialItem } from "@/lib/lms-generation/materials";
import {
  SELECTION_CHAT_MAX_ITEMS,
  tooManyItemsForChatNote,
  selectionContextLabel,
  buildSelectionContextBlock,
} from "@/lib/chat/selection-context";
import { buildSelectionChatContextAction } from "@/app/actions/selection-chat-context";
import { openChat } from "@/lib/chat/open-chat";
import { buildSelectedMaterialItems } from "./lmsGenerationSelection";
import { liveModuleIdsFromKeys } from "../utils";

/** The error note when a gather succeeds (no `{ error }`) but the resulting
 * `materialsText` is blank - A5: this must surface as a refusal and must NOT
 * open the chat, the same way a real `{ error }` does not. A blank result is
 * distinct from a genuine server error (nothing thrown, nothing refused by
 * name), so it gets its own wording rather than reusing a course-resolution
 * or cap message that would not describe what actually happened. */
export const BLANK_SELECTION_CONTEXT_ERROR =
  "Could not load the selection into the AI Chatbot: none of the selected items had any usable text to load.";

/** A6: the success note names what was loaded (selectionContextLabel's own
 * count) and states nothing was written to Canvas - mirroring
 * downloadSuccessNote's own "nothing was written..." sentence
 * (useSelectionDownload.ts) so this row's read-only posture is stated in the
 * same words the sibling read-only row already uses. Any `notes` the gather
 * returned (skipped items, truncation - Contract 3's own `notes` field) are
 * appended, never dropped, matching this hook's own `setNote` being the one
 * channel this whole tab already reports both successes and caveats through. */
export function askAiSuccessNote(label: string, notes: readonly string[]): string {
  const base = `Loaded ${label} into the AI Chatbot. Nothing was written to Canvas.`;
  return notes.length > 0 ? `${base} ${notes.join(" ")}` : base;
}

export interface UseSelectionChatContextReturn {
  busy: boolean;
  askAi: () => void;
}

export function useSelectionChatContext(
  courseUrl: string,
  /** An export selection's course_hub row id - the chat-context counterpart
   * of useSelectionDownload.ts's own `courseId` (see that file's own doc
   * comment on the FINDING 1 fix this threading closes). Undefined for a
   * live selection. */
  courseId: string | undefined,
  acronym: string | undefined,
  selectedMaterialItems: () => SelectedMaterialItem[],
  selectedModules: Set<string>,
  modules: CanvasModule[],
  exportModules: CartridgeModule[] | null | undefined,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void
): UseSelectionChatContextReturn {
  const [busy, setBusy] = useState(false);

  const askAi = () => {
    // A2: one gather at a time - a second activation while one is already in
    // flight is a no-op, kept in a hook-local flag rather than folded into
    // `opBusy` (this row is not a bulk write, so it does not share that
    // coordination scheme - see useSelectionDownload.ts's own header comment
    // for the precedent this follows).
    if (busy) return;

    // Reuses buildSelectedMaterialItems exactly as useLmsGeneration.ts's own
    // `generate()` does (not useSelectionDownload.ts's plain
    // `selectedMaterialItems()` call) - both are today just `[...items]`, but
    // calling through the same normalizer generation already trusts keeps
    // this hook aligned with the OTHER selection-gathering entry point in
    // this file's own family, not merely the download one.
    const materialItems = buildSelectedMaterialItems(selectedMaterialItems());
    const moduleKeys = Array.from(selectedModules);
    if (materialItems.length === 0 && moduleKeys.length === 0) return;

    // A4: the pre-flight cap is a UX pre-check only, computed from this
    // hook's own (possibly slightly stale) client `modules`/`exportModules` -
    // see this file's header comment for why that staleness cannot affect
    // correctness. The server re-enforces the SAME SELECTION_CHAT_MAX_ITEMS
    // independently against its own fresh read (B4), so this can only ever
    // save a round trip, never be the sole enforcement.
    const expandedForLabel = expandModuleSelection(materialItems, moduleKeys, modules, exportModules ?? undefined);
    if (expandedForLabel.length > SELECTION_CHAT_MAX_ITEMS) {
      setNote({ kind: "error", text: tooManyItemsForChatNote(expandedForLabel.length, SELECTION_CHAT_MAX_ITEMS) });
      return;
    }

    // A3: the export half is expanded client-side right now (empty live tree
    // passed, so only `exportModules` contributes); the live half is sent as
    // raw `moduleIds` for the server to expand itself against a FRESH module
    // tree - there is no server-side fetch path for a course export. See this
    // file's header comment for the full split, copied from
    // useLmsGeneration.ts's `generate()`.
    const itemsForServer = expandModuleSelection(materialItems, moduleKeys, [], exportModules ?? undefined);
    const moduleIds = Array.from(liveModuleIdsFromKeys(moduleKeys));

    void (async () => {
      setBusy(true);
      setNote(null);
      try {
        const result = await buildSelectionChatContextAction({
          courseUrl,
          courseId,
          acronym,
          items: itemsForServer,
          moduleIds,
        });

        // A5: a server error refuses WITHOUT opening the chat - the
        // selection itself is left untouched either way, so the instructor
        // can retry or narrow it, exactly as useSelectionDownload's own
        // failure path leaves the selection alone.
        if ("error" in result) {
          setNote({ kind: "error", text: result.error });
          return;
        }

        // A6: `result.itemCount` (not `expandedForLabel.length`) is what the
        // label counts - it is the server's OWN post-fresh-expansion count
        // (Contract 3's own doc comment: "Items actually gathered, after
        // server-side module expansion"), which can differ from this hook's
        // possibly-stale client guess the same way useSelectionDownload's own
        // client-side count can differ from the archive route's real one.
        // `moduleKeys.length` (not `expandedForLabel`'s distinct-location
        // count) mirrors selectionSummaryLabel's own convention
        // (lmsGenerationSelection.ts) of counting selected module ROWS, not
        // resolved module locations.
        const label = selectionContextLabel(result.itemCount, moduleKeys.length);

        // buildSelectionContextBlock (Contract 1, owned by set A) is what
        // actually assembles the prompt-ready block: it wraps the gathered
        // text in the anti-prompt-injection framing every other context
        // block in this app uses (see that function's own doc comment), and
        // re-applies SELECTION_CONTEXT_MAX_CHARS on top of gatherSelectionMaterials'
        // own MATERIALS_CAP. open-chat.ts's own OpenChatSelectionContext doc
        // comment is explicit that its `text` field is built THIS way, by
        // THIS row, before the event ever fires - so this hook calls it
        // directly rather than dispatching the raw server string. Blank
        // materialsText (A5) collapses to `block.text === ""` here exactly
        // as buildSelectionContextBlock's own doc comment specifies, so the
        // same guard that AC A5 requires ("a success whose materialsText is
        // blank must not open the chat") is this one check.
        const block = buildSelectionContextBlock({ materialsText: result.materialsText, label });
        if (!block.text) {
          setNote({ kind: "error", text: BLANK_SELECTION_CONTEXT_ERROR });
          return;
        }

        // Contract 2: dispatched only once the gather is known-good - never
        // half-loaded (A5).
        openChat({ selectionContext: { text: block.text, label } });
        setNote({ kind: "success", text: askAiSuccessNote(label, result.notes) });
      } catch (e) {
        // Mirrors useSelectionDownload's own catch: a failure to reach or
        // run the server action is the one thing that surfaces as an error
        // here, never a half-loaded chat.
        const message = e instanceof Error ? e.message : String(e);
        setNote({ kind: "error", text: `Could not load the selection into the AI Chatbot: ${message}` });
      } finally {
        setBusy(false);
      }
    })();
  };

  return { busy, askAi };
}
