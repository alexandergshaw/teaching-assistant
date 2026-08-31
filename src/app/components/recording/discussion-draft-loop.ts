// Discussion reply capture - the drafting-queue leaf, split out of
// useDiscussionReplies.ts (set C3) purely to stay under
// recording-split.structure.test.ts's 1000-line ceiling on
// src/app/components/recording/ (non-recursive). Two things live here:
//
// 1. UseDiscussionRepliesReturn - the orchestrator hook's sealed return
//    contract (docs/discussion-reply-capture-acceptance-criteria.md section
//    12), plus DraftQueueItem, LOOP_IDLE_POLL_MS and the two localStorage
//    helpers that sit next to it in the source. Moved here as a block, not
//    reorganized - useDiscussionReplies.ts still owns and returns this type.
// 2. runDraftLoop - the drafting queue's consumer loop (AC25-AC28, AC52).
//    Extracted as a plain async function that takes its dependencies
//    explicitly (refs, mutators, the drafting action) rather than closing
//    over useDiscussionReplies.ts's hook scope, so it reads in isolation.
//    useDiscussionReplies.ts wraps it in its own `useCallback` and supplies
//    the deps object; behaviour is unchanged from when this was a closure.
//
// B1-B5/S5 fixer pass (discussion-table-view.test.ts's rawRows source
// guard): this file, not just useDiscussionReplies.ts, is now one of the
// places a whole-table dispatch can regress from `.rawRows` back to the
// filtered `.rows` - see that guard's own comment for why it scans by path.

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  isDispatchableDraftItem,
  partitionDraftOutcome,
  resolveDraftParent,
  shouldLoopContinue,
  type ReplyRow,
  type ReplySort,
} from "./discussion-capture";
import { getStoredProvider } from "@/lib/llm-provider";
import { DRAFT_BATCH_SIZE, type DiscussionAudience } from "@/lib/discussion-reply-prompt";
import type { LlmProvider } from "@/lib/llm";
import type { UseReplyRowsReturn } from "./useReplyRows";
import type { UseReplyResourcesReturn } from "./useReplyResources";

// --- S6: both sub-hooks' real return types are used directly - no hand-
// written duplicate interface and no `as` assertion at the call site below.
// A hand-written duplicate is exactly the thing that can drift silently
// (assignable-but-wrong is still a compile error tsc would have caught;
// `as` is what was suppressing that check). C1's `UseDiscussionCaptureReturn`
// and C2's `UseReplyRowsReturn` (imported above) are used as-is. ---

export interface UseDiscussionRepliesReturn {
  audience: DiscussionAudience;
  setAudience: (a: DiscussionAudience) => void;
  courseId: string;
  setCourseId: (id: string) => void;
  courses: Array<{ id: string; name: string }> | null;
  coursesLoading: boolean;
  coursesError: string | null;

  saveVideo: boolean;
  setSaveVideo: (v: boolean) => void;
  recordingUrl: string | null;
  recordingBytes: number;

  capturing: boolean;
  elapsedSec: number;
  pendingFrames: number;
  /** AC10/F4: session-level count of frames dropped to backpressure, passed
   *  straight through from C1 so set D can render AC7b's drop sentence
   *  beneath the post-stop summary when this is non-zero. */
  droppedFrames: number;
  extracting: boolean;
  stalled: boolean;
  notices: Array<{ id: string; text: string }>;
  dismissNotice: (id: string) => void;
  previewRef: React.RefObject<HTMLVideoElement | null>;
  start: () => Promise<void>;
  stop: () => void;

  /** Sorted AND filtered for display. See `totalCount` for the real size. */
  rows: ReplyRow[];
  sort: ReplySort;
  setSort: (s: ReplySort) => void;
  filterText: string;
  setFilterText: (next: string) => void;
  /** The UNFILTERED row count (F0-2/F11). Every count, progress string, empty
   *  state and - critically - both destructive arming signatures read this,
   *  never `rows.length`, which a filter narrows. */
  totalCount: number;
  /** Fixer pass (root cause): forwarded from C2's `useReplyRows` for one
   *  consumer - the panel's post-stop session summary (S2), which cannot
   *  diff the whole table correctly off the filtered `rows`. This file's
   *  own bulk/dispatch code below reaches C2's `rawRows` via `rowsApiRef`
   *  directly, not through this field. */
  rawRows: ReplyRow[];
  moveRow: (id: string, dir: "up" | "down") => void;
  editReply: (id: string, text: string) => void;
  removeRow: (id: string) => void;
  retryRow: (id: string) => void;
  draftAllPending: () => void;
  redraftAll: () => void;
  clearTable: () => void;
  drafting: boolean;

  // docs/discussion-reply-resources-acceptance-criteria.md R12: the three
  // fields useReplyResources.ts (set R-D) seals in its own
  // UseReplyResourcesReturn, forwarded straight through. `removeResource`
  // is a plain row mutator (no queue involvement) forwarded directly from
  // C2's useReplyRows the same way editReply/removeRow above already are.
  resourceQueueSize: number;
  findMissing: () => void;
  retryResources: (id: string) => void;
  removeResource: (id: string, url: string) => void;
}

// A drafting-queue entry. `force` bypasses `isDispatchableDraftItem`'s
// userEdited guard at dispatch time (AC52) - see discussion-capture.ts's
// `draftDispatchForce` for which of the four dispatch sites (the auto-queue
// after extraction, Draft the missing replies, Retry, Redraft every reply)
// force and which respect the guard, and S1 for why Retry forces even
// though it is not a bulk/destructive action the way Redraft every reply is.
export interface DraftQueueItem {
  id: string;
  force: boolean;
}

// BL1: this is now only the wake-ticker's tick cadence (see
// useDiscussionReplies.ts's wake-mechanism block), never a literal
// setTimeout delay - a chained main-thread setTimeout is exactly what BL1
// removes from both loops.
export const LOOP_IDLE_POLL_MS = 300;

export function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Non-fatal here: the in-memory value keeps working. AC23a's dedicated
    // storage-full message is for the table write (persistError, via C2);
    // these three controls are small enough that a quota failure on them
    // would only mean "the toggle doesn't survive a reload," not data loss.
  }
}

// ---------------------------------------------------------------------------
// runDraftLoop (AC25-AC28, AC52).
// ---------------------------------------------------------------------------

// The drafting server action's shape, injected rather than imported - this
// file stays decoupled from "@/app/actions/discussion-replies" the same way
// discussion-capture.ts stays dependency-free of anything server-only (that
// file's own AC35 note). useDiscussionReplies.ts passes the real
// `draftDiscussionRepliesAction` through as `draftAction` below.
// T6/T6c (docs/discussion-thread-structure-acceptance-criteria.md section 6):
// `parent` is optional, resolved per dispatched row via `resolveDraftParent`
// (discussion-capture.ts's two-arg wrapper) below, and carries only what the
// prompt needs to render the CONTEXT ONLY block - never the full row. This
// widens the type to match the real server action's own declared parameter
// (src/app/actions/discussion-replies.ts:154) exactly, so the fake injected
// in tests and the real action stay assignment-compatible.
export type DraftDiscussionRepliesAction = (
  posts: Array<{ id: string; author: string; text: string; parent?: { author: string; text: string } }>,
  audience: DiscussionAudience,
  courseName: string,
  provider: LlmProvider
) => Promise<{ replies: Array<{ id: string; reply: string }> } | { error: string }>;

// T6a's budget figure (docs/discussion-thread-structure-acceptance-criteria.md
// section 6): "worst case is 5 x 600 characters, about 3.5% input growth."
// MAX_POST_CHARS (re-exported from discussion-capture.ts, itself re-exported
// from src/lib/discussion-reply-prompt.ts) is 4000 - a different budget, for
// a full post, not a CONTEXT ONLY parent excerpt - so this is its own named
// constant rather than a reuse of that one. Truncates, never drops: a parent
// over budget still gives the model SOME context rather than none.
const MAX_DRAFT_PARENT_CHARS = 600;

function truncateDraftParentText(text: string): string {
  return text.length > MAX_DRAFT_PARENT_CHARS ? text.slice(0, MAX_DRAFT_PARENT_CHARS) : text;
}

export interface RunDraftLoopDeps {
  /** NEW-1/AC43/AC50: the mounted/loop-running latch - see
   *  shouldLoopContinue's own header (discussion-capture.ts) and
   *  useDiscussionReplies.ts's wake-ticker cleanup effect for the full
   *  account of why a plain boolean latch alone cannot distinguish a
   *  StrictMode-orphaned loop instance from the current one. */
  loopsActiveRef: MutableRefObject<boolean>;
  /** NEW-1: the generation counter this loop's `epoch` argument is checked
   *  against on every wake - see the ref above's own doc comment. */
  loopEpochRef: MutableRefObject<number>;
  draftQueueRef: MutableRefObject<DraftQueueItem[]>;
  /** NEW-2: mirrors `draftQueueRef.current.length` into React state so the
   *  ticker-idle effect can see "there is now something queued to draft". */
  setDraftQueueSize: (size: number) => void;
  setDrafting: Dispatch<SetStateAction<boolean>>;
  /** BL1: resolves once the shared wake ticker next ticks - see
   *  useDiscussionReplies.ts's wake-mechanism block for why this replaces a
   *  chained `setTimeout`. */
  waitForWake: () => Promise<void>;
  /** F0-2/F11 fixer pass (B1-B5): reads `.rawRows`, never the filtered
   *  `.rows` - see discussion-table-view.test.ts's source-scan guard, which
   *  pins this fact by scanning this file's text for the property name. */
  rowsApiRef: MutableRefObject<UseReplyRowsReturn>;
  /** R6: the resource-search queue, kicked exactly once a model-authored
   *  reply lands - never on the discard path where a stale response's text
   *  is thrown away in favour of the user's own edit. */
  resourcesApiRef: MutableRefObject<UseReplyResourcesReturn>;
  audienceRef: MutableRefObject<DiscussionAudience>;
  courseNameRef: MutableRefObject<string>;
  pushNotice: (text: string) => void;
  draftAction: DraftDiscussionRepliesAction;
}

export async function runDraftLoop(epoch: number, deps: RunDraftLoopDeps): Promise<void> {
  const {
    loopsActiveRef,
    loopEpochRef,
    draftQueueRef,
    setDraftQueueSize,
    setDrafting,
    waitForWake,
    rowsApiRef,
    resourcesApiRef,
    audienceRef,
    courseNameRef,
    pushNotice,
    draftAction,
  } = deps;

  // NEW-1: see runExtractionLoop's identical comment in useDiscussionReplies.ts.
  while (shouldLoopContinue(loopsActiveRef.current, loopEpochRef.current, epoch)) {
    if (draftQueueRef.current.length === 0) {
      // S8: a functional update, not a bare `setDrafting(false)` - this
      // branch runs every idle wake (every ~300ms while anything is
      // queued-empty), and React bails out of the re-render when the
      // updater returns the SAME value it already holds. A bare
      // `setDrafting(false)` schedules a state write every single time
      // regardless of the current value.
      setDrafting((prev) => (prev ? false : prev));
      await waitForWake();
      continue;
    }

    const batch = draftQueueRef.current.splice(0, DRAFT_BATCH_SIZE);
    // NEW-2: mirror the post-splice queue length into state right away
    // (not only once the dispatch below resolves) - a batch that turns out
    // to have zero dispatchable items still drained the queue, and the
    // ticker-idle effect needs to see that drain to be able to stop the
    // ticker again.
    setDraftQueueSize(draftQueueRef.current.length);
    // B3 fix: `rawRows`, not `rows`. A batch spliced off the queue above
    // must not vanish because a search-box keystroke hid its ids from the
    // filtered array at this exact instant - never drafted, never failed,
    // never re-enqueued. Nothing on screen was ever a selection here.
    const currentRows = rowsApiRef.current.rawRows;
    // AC52/S1: re-check row state at DISPATCH time, not enqueue time. A
    // non-force entry whose row is USER-EDITED (typed into since it was
    // queued, or already contains hand-written text) is skipped here
    // rather than at enqueue, when it would already be baked into the
    // batch. This is deliberately keyed on `userEdited`, not on `reply`
    // being non-empty: a row left `failed` by a redraft that itself
    // failed keeps its OLD machine-drafted text in `reply` with
    // `userEdited` still false, and that text must stay dispatchable so
    // Retry / "Draft the missing replies" can still reach it - see
    // isDispatchableDraftItem in discussion-capture.ts.
    const dispatchable = batch
      .map((item) => ({ item, row: currentRows.find((r) => r.id === item.id) }))
      .filter(
        (x): x is { item: DraftQueueItem; row: ReplyRow } =>
          !!x.row && isDispatchableDraftItem(x.item, x.row)
      );
    if (dispatchable.length === 0) continue;

    setDrafting(true);
    const ids = dispatchable.map((x) => x.row.id);
    rowsApiRef.current.markDrafting(ids);
    // AC44: snapshot the edit generation for every dispatched row BEFORE
    // the request goes out.
    const editSnap = rowsApiRef.current.snapshotEditSeq(ids);
    const provider = getStoredProvider();
    const audienceNow = audienceRef.current;
    const courseName = courseNameRef.current;

    let result: Awaited<ReturnType<DraftDiscussionRepliesAction>>;
    try {
      result = await draftAction(
        // FIX 1 (thread-structure group blocker): resolve the parent per
        // dispatched row against `currentRows` (the `rawRows` snapshot taken
        // above at dispatch time - see the B3 comment on that assignment),
        // never the filtered `rows`, so a search-box keystroke cannot change
        // which parent a draft sees. The key is OMITTED entirely (not set to
        // `undefined`) when no parent resolves, so a no-parent batch stays
        // byte-identical to the request shape shipped before this fix.
        dispatchable.map((x) => {
          const parentRow = resolveDraftParent(x.row, currentRows);
          const parent = parentRow
            ? { author: parentRow.author, text: truncateDraftParentText(parentRow.post) }
            : undefined;
          return parent
            ? { id: x.row.id, author: x.row.author, text: x.row.post, parent }
            : { id: x.row.id, author: x.row.author, text: x.row.post };
        }),
        audienceNow,
        courseName,
        provider
      );
    } catch (err) {
      result = { error: err instanceof Error ? err.message : "Could not draft replies." };
    }
    if (!loopsActiveRef.current) return;

    // F10: a row edited WHILE it was "drafting" (after dispatch, before
    // this response lands) has no path back out of "drafting" if the
    // model's text is going to be discarded anyway - AC18 only forces
    // pending/failed -> ready on edit, and applying a stale reply over the
    // user's own text is exactly what the edit guard exists to prevent.
    // AC26 says such a row is "left as the user typed it" - resolving it
    // to "ready" on its OWN current reply (never the model's) is what
    // actually leaves it there instead of stuck showing "Drafting"
    // forever. partitionDraftOutcome (set A, pure and unit-tested) is
    // shared by both the batch-error branch and the per-reply response
    // loop below, since the same hole exists on both paths.
    const isUnchanged = (id: string) => rowsApiRef.current.isUnchangedSince(id, editSnap);
    const resolveEditedDuringDispatch = (id: string) => {
      // B4 fix: `rawRows`, not `rows` - a row hidden by the filter at this
      // instant must not stay wedged in "drafting" forever, reopening the
      // exact wedge F10 exists to close (this function's doc comment above).
      const current = rowsApiRef.current.rawRows.find((r) => r.id === id);
      // S7: pass the row's OWN current `userEdited` through explicitly -
      // this re-applies the user's own hand-typed text (never the
      // model's), so it must keep its authorship flag. applyReply's
      // default (userEdited=false) is for the OTHER call site below,
      // where a real model reply is landing.
      if (current) rowsApiRef.current.applyReply(id, current.reply, current.userEdited);
    };

    if ("error" in result) {
      const { unchanged, editedDuringDispatch } = partitionDraftOutcome(ids, isUnchanged);
      editedDuringDispatch.forEach(resolveEditedDuringDispatch);
      if (unchanged.length > 0) {
        rowsApiRef.current.markFailed(unchanged, result.error);
      }
      pushNotice(result.error);
      continue;
    }

    const editedDuringDispatchSet = new Set(partitionDraftOutcome(ids, isUnchanged).editedDuringDispatch);
    const returned = new Set<string>();
    for (const reply of result.replies) {
      returned.add(reply.id);
      // AC26/AC44: apply the drafted reply only if the row is unchanged
      // since dispatch; otherwise discard the model's text but still
      // resolve the row to "ready" on the user's own edit (F10) rather
      // than leaving it stuck on "drafting".
      if (editedDuringDispatchSet.has(reply.id)) {
        resolveEditedDuringDispatch(reply.id);
      } else {
        rowsApiRef.current.applyReply(reply.id, reply.reply);
        // R6: the ONE trigger point - enqueue a resource search only
        // after a model-authored reply lands. Never on the discard path
        // above, which re-applies the user's own text and searched
        // nothing new.
        resourcesApiRef.current.enqueueResources([reply.id]);
      }
    }
    const missing = ids.filter((id) => !returned.has(id));
    if (missing.length > 0) {
      const { unchanged: stillFailed, editedDuringDispatch: missingEdited } = partitionDraftOutcome(missing, isUnchanged);
      // F10: the model omitted this row, but the user had already edited
      // it while it was drafting - that is not a failure, the user has
      // written a reply.
      missingEdited.forEach(resolveEditedDuringDispatch);
      if (stillFailed.length > 0) {
        rowsApiRef.current.markFailed(stillFailed, "No reply came back for this post.");
      }
    }
  }
}
