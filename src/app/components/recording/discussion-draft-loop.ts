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
  type ReplyResource,
  type ReplySort,
} from "./discussion-capture";
// Resource-controls feature: the eligible-kinds setting's own type, threaded
// through UseDiscussionRepliesReturn below the same way DiscussionAudience/
// ReplyCompositionSettings already are.
import type { ResourceKind } from "@/lib/resource-kind";
import { getStoredProvider } from "@/lib/llm-provider";
import {
  DRAFT_BATCH_SIZE,
  REPLY_INGREDIENTS,
  REPLY_FORMALITY_STOPS,
  DEFAULT_REPLY_COMPOSITION,
  type DiscussionAudience,
  type ReplyIngredient,
  type ReplyFormality,
  type ReplyCompositionSettings,
} from "@/lib/discussion-reply-prompt";
// docs/reply-composition-controls-acceptance-criteria.md C1b-ii: the
// greeting name is derived HERE, per dispatched post, and threaded into the
// request exactly the way FIX 1 threads `parent` below - never inside
// discussion-reply-prompt.ts, which must not import person-name.ts. Deriving
// it per-post (rather than once for the whole batch) is what structurally
// keeps a CONTEXT ONLY parent block from ever receiving a greeting: `parent`
// is built from a disjoint object literal ({ author, text }) that has no
// `greetingName` field to begin with.
import { greetingNameFromAuthor } from "@/lib/person-name";
// "Activate this recording from the Knowledge base": the one-shot, per-RUN
// context taken (once, at Start) from recording-launch.ts and held here for
// the life of the table - see RunDraftLoopDeps's own `knowledgeContextRef`
// doc comment below for the full account. Type-only import: this file
// already reaches across module boundaries freely (unlike
// discussion-reply-prompt.ts's own dependency-free leaf contract), so this
// adds no new coupling concern.
import type { RecordingKnowledgeContext } from "@/lib/recording-launch";
import type { LlmProvider, LlmUsage } from "@/lib/llm";
import type { UseReplyRowsReturn } from "./useReplyRows";
import type { UseReplyResourcesReturn } from "./useReplyResources";
// docs/DEV_LOOP.md's "every feature needs a downloadable log" rule
// (REGRESSION entries 369/372/373/374 record this surface's unpaid debt):
// the sealed return widens by exactly one field, `runLog`, below - see that
// field's own doc comment for what builds it and where.
import type { DiscussionRepliesRunLog, DiscussionRepliesLogDraft } from "./discussion-replies-log";
// docs/post-questions-acceptance-criteria.md Q1: type-only, imported ONLY
// from the leaf - never re-exported from discussion-serialization.ts or
// discussion-capture.ts.
import type { PostQuestion } from "@/lib/discussion-reply-prompt";
// docs/answers-in-the-reply-acceptance-criteria.md A7: the SAME predicate
// the block (DiscussionReplyQuestions.tsx) uses to derive its live per-item
// state, called here once per reply at RECEIVE time to build the draft
// event's `questionsAnsweredInReply` count - never a second, hand-rolled
// containment check (D3's "one predicate" rule is repo-wide, not scoped to
// the client component).
import { replyContainsAnswer } from "@/lib/discussion-answer-location";

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

  /** docs/reply-composition-controls-acceptance-criteria.md C5/JOB1: what
   *  every drafted reply must contain (ingredients, address-by-name,
   *  formality) - persisted the same way audience/courseId/saveVideo are
   *  (readLocalStorage/writeLocalStorage + the useState-initializer +
   *  wrapped-setter idiom), and threaded whole into runDraftLoop the same
   *  way `audience` already is, so a new field cannot be added on one side
   *  and silently dropped on the other. */
  composition: ReplyCompositionSettings;
  setComposition: (next: ReplyCompositionSettings) => void;

  /** Resource-controls feature: which resource kinds the resource pass may
   *  search for and return. Fully owned by discussion-persisted-controls.ts
   *  (persistence, coercion) - forwarded straight through, exactly like
   *  `composition` above. See that file's own UseDiscussionPersistedControlsReturn
   *  doc comment for the full contract, including why an empty array is
   *  legal ("search nothing"). */
  resourceKinds: readonly ResourceKind[];
  setResourceKinds: (next: readonly ResourceKind[]) => void;

  /** Resource-controls feature: the "preferred video length" setting - see
   *  discussion-persisted-controls.ts's own doc comment for why this can
   *  only ever be a stated preference, never an enforced filter. */
  videoLengthMinMinutes?: number;
  videoLengthMaxMinutes?: number;
  setVideoLengthPreference: (min: number | undefined, max: number | undefined) => void;

  /** Resource-controls feature: per-row targeted search ("each reply should
   *  also have a button to search for resources specific to that reply and
   *  its original message"). Forwarded straight through from R-D's
   *  `useReplyResources.ts` - see that hook's own `searchRow` doc comment
   *  for why it bypasses the bulk queue entirely. */
  searchRow: (id: string) => void;

  /** Resource-controls feature: one-click insert ("it should be a simple
   *  one click to add in a found resource's link to a reply"). A MOVE, not a
   *  copy - appends the resource's link to the end of the row's reply text
   *  (`appendResourceToReply`, discussion-reply-insert.ts) via C2's
   *  `editReply`, then removes it from the row's resource list via C2's
   *  `removeResource` - the SAME two mutators every other row action in this
   *  file already reaches through `rowsApiRef`. MOVE (not copy) is
   *  deliberate: once inserted, the resource's own Insert control unmounts
   *  with it, so a second click on the SAME resource is structurally
   *  impossible rather than merely discouraged - see this function's own
   *  implementation in useDiscussionReplies.ts. */
  insertResource: (id: string, resource: ReplyResource) => void;

  /** docs/post-questions-acceptance-criteria.md Q7: forwarded straight
   *  through from C2's `useReplyRows`, exactly like `removeResource` above -
   *  no queue involvement. */
  removeQuestion: (id: string, question: string) => void;

  /**
   * "Activate this recording from the Knowledge base": the label of the
   * knowledge context CURRENTLY held for this table's run (e.g. "3 Knowledge
   * Base pages"), or `null` when no context is active - either because the
   * capture was started normally (no launch, or a launch with no usable
   * pages) or because the page was reloaded since the context was taken
   * (see useDiscussionReplies.ts's own header note on why context is
   * deliberately NOT persisted across a reload). This is the one visible
   * signal that a run's drafts are using different context than an ordinary
   * run. `DiscussionRepliesPanel.tsx` renders it as a hint line above the
   * drafting controls whenever it is non-null. It is deliberately null after
   * a reload even when a table is restored - only a short label persists, not
   * the context text - so the panel shows nothing there and the reload notice
   * in useDiscussionReplies.ts is the sole voice for that case. The two must
   * not both speak, or they contradict each other about whether the context
   * is still live.
   */
  knowledgeContextLabel: string | null;

  /** AC3 of docs/knowledge-recording-handoff-acceptance-criteria.md, section
   *  4 ("adjust from the recording side"): the full carried context, not
   *  just its label - null under the same conditions `knowledgeContextLabel`
   *  is null. DiscussionRepliesPanel.tsx threads this into
   *  CarriedKnowledgePages.tsx (a NEW component, shared with
   *  GradingRecordingPanel.tsx) so the pages themselves - not only the
   *  summary sentence - can be shown and individually removed. */
  knowledgeContext: RecordingKnowledgeContext | null;
  /** Replace the carried context wholesale (a client-side removal/undo
   *  recompute - see CarriedKnowledgePages.tsx's recomputeCarriedKnowledgeContext).
   *  Also rewrites the persisted "ta-rec-disc-kb-context-label" key whenever
   *  a label has already been written once this table's life (Start clicked
   *  at least once) - see useDiscussionReplies.ts's own comment on why an
   *  edit before the FIRST Start must not write a label for a session that
   *  has not captured anything yet (the same gate `start()`'s own label
   *  write already follows for the take-vs-write distinction). This is the
   *  fix for THE CORRECTNESS TRAP: the draft loop reads knowledgeContextRef
   *  fresh per batch dispatch, so an edit mid-run takes effect on the very
   *  next batch, but the persisted label was previously only ever written
   *  once, in `start()` - leaving it to lie about what later batches
   *  actually used after any edit. */
  setKnowledgeContext: (next: RecordingKnowledgeContext | null) => void;

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

  /** D1/D9 (aesthetics-pass redesign, docs/aesthetics-pass-acceptance-
   *  criteria.md section 4b): handledAt/skipped are now REAL ReplyRow fields
   *  (discussion-serialization.ts), not the side-channel localStorage map
   *  (discussion-reply-flags.ts, deleted) an earlier wave was forced into by
   *  not owning this file. Forwarded straight from C2's useReplyRows the
   *  same way editReply/removeRow above already are. */
  setHandledAt: (id: string, at: number | null) => void;
  setSkipped: (id: string, skipped: boolean) => void;
  retryRow: (id: string) => void;
  /** CC19: the per-row "Redraft" control's dispatch (group D2's row action,
   *  `discussion-capture.ts`'s `"redraftRow"` `DraftDispatchSource`). Logs a
   *  retry event for this row (the same shape `retryRow` appends, so the
   *  "===Retries===" log section and the per-row "retried" column cover it
   *  with zero log-module change) and forces the row past AC52's userEdited
   *  guard, on the same "targeted, single-row, explicit user action"
   *  rationale as `retryRow` (see `draftDispatchForce`). Deliberately does
   *  NOT bump `tableEpochRef` the way `redraftAll` does - that is a
   *  whole-table structural signal reserved for a bulk rewrite, and bumping
   *  it here would discard any in-flight extraction merge for every other
   *  row in the table over a control that only ever touches one row. */
  redraftRow: (id: string) => void;
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

  /** docs/DEV_LOOP.md's downloadable-log rule. ASSEMBLED by
   *  discussion-replies-log.ts's `buildDiscussionRepliesRunLog` from two
   *  things useDiscussionReplies.ts holds: the event streams it collects as
   *  it runs (batches sent to extraction, notices shown, retries clicked -
   *  each appended the moment it happens, never reconstructed after the
   *  fact) and the current `rawRows` table (read fresh, not itself an event
   *  stream - a row's stored fields already ARE its debugging truth at any
   *  given moment). D (the panel) formats this into CSV/JSON and downloads
   *  it; this hook never formats anything - see discussion-replies-log.ts's
   *  own header for the full collection-vs-assembly split. */
  runLog: DiscussionRepliesRunLog;
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
// docs/reply-composition-controls-acceptance-criteria.md C5a: coercion for
// the three ta-rec-disc-ingredients / ta-rec-disc-address-name /
// ta-rec-disc-formality reads. A PLAIN EXPORTED FUNCTION, not inline inside a
// `useState` initializer - vitest in this repo is node-env and renders no
// hook (see this file's own header), so an inline coercion would have no
// test surface at all. Never throws: a malformed JSON blob, a non-array
// value, a non-array JSON scalar, an ingredient outside the enum, a
// duplicate ingredient and an unrecognised formality/address-by-name value
// each fall back to a sane value rather than reaching the prompt builder.
// ---------------------------------------------------------------------------

/** C2c: zero ingredients selected is legal ("a plain, well-judged reply") and
 * is NOT replaced with the default - only a genuinely unparseable or
 * non-array blob falls back to `DEFAULT_REPLY_COMPOSITION.ingredients`. A
 * valid array survives with invalid members dropped and duplicates
 * collapsed (insertion order preserved via `Set`). */
export function coerceReplyComposition(
  rawIngredients: string | null,
  rawAddressByName: string | null,
  rawFormality: string | null,
  // docs/post-questions-acceptance-criteria.md Q5/Q8: a FOURTH TRAILING
  // parameter, defaulted so every existing three-arg call site keeps
  // compiling unchanged. Mirrors `rawAddressByName`'s own rule exactly: "0"
  // -> false, "1" -> true, anything else (including the default `null`) ->
  // DEFAULT_REPLY_COMPOSITION.answerQuestions (ON).
  rawAnswerQuestions: string | null = null
): ReplyCompositionSettings {
  let ingredients: readonly ReplyIngredient[] = DEFAULT_REPLY_COMPOSITION.ingredients;
  if (rawIngredients !== null) {
    try {
      const parsed: unknown = JSON.parse(rawIngredients);
      if (Array.isArray(parsed)) {
        const seen = new Set<ReplyIngredient>();
        for (const v of parsed) {
          if (typeof v === "string" && (REPLY_INGREDIENTS as readonly string[]).includes(v)) {
            seen.add(v as ReplyIngredient);
          }
        }
        ingredients = Array.from(seen);
      }
      // Array.isArray(parsed) false - a non-array blob (an object, a bare
      // string, a number) - falls through with `ingredients` left at the
      // default set above.
    } catch {
      // Malformed JSON - fall back to the default, never throw.
    }
  }

  // C0's default is ON - only an explicit "0" turns it off; every other
  // value (null, garbage, "false") falls back to the default rather than
  // silently becoming OFF.
  const addressByName =
    rawAddressByName === "0" ? false : rawAddressByName === "1" ? true : DEFAULT_REPLY_COMPOSITION.addressByName;

  const formality: ReplyFormality =
    rawFormality !== null && (REPLY_FORMALITY_STOPS as readonly string[]).includes(rawFormality)
      ? (rawFormality as ReplyFormality)
      : DEFAULT_REPLY_COMPOSITION.formality;

  // Q8: same rule as addressByName above - default is ON.
  const answerQuestions =
    rawAnswerQuestions === "0" ? false : rawAnswerQuestions === "1" ? true : DEFAULT_REPLY_COMPOSITION.answerQuestions;

  return { ingredients, addressByName, formality, answerQuestions };
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
// prompt needs to render the CONTEXT ONLY block - never the full row.
// `greetingName` (docs/reply-composition-controls-acceptance-criteria.md
// C1b-ii) is optional for the same reason: derived per-post below and
// omitted entirely (never set to `undefined`) when there is nothing to
// greet with. `composition` (C5/JOB1) is the whole ReplyCompositionSettings
// object, threaded through unchanged. This widens the type to match the
// real server action's own declared parameter
// (src/app/actions/discussion-replies.ts) exactly, so the fake injected in
// tests and the real action stay assignment-compatible - the
// `draftAction: draftDiscussionRepliesAction` assignment in
// useDiscussionReplies.ts is itself the proof the two have not drifted.
// "Activate this recording from the Knowledge base": `knowledgeContext` is a
// NEW TRAILING parameter, after `provider` - deliberately, not inserted
// earlier in this list. Entry 372 shipped a feature dead by widening only
// this injected type and never the real server action; the fix here is the
// opposite mistake to avoid - widening BOTH this type and the real
// draftDiscussionRepliesAction (src/app/actions/discussion-replies.ts)
// identically, in the SAME trailing position, so the
// `draftAction: draftDiscussionRepliesAction` assignment in
// useDiscussionReplies.ts stays the proof the two have not drifted (see this
// file's own header for why that assignment is load-bearing). Trailing,
// specifically, because inserting anywhere earlier would have silently
// shifted every existing 5-argument call site in discussion-replies.test.ts
// (over two dozen of them) onto the wrong parameter.
export type DraftDiscussionRepliesAction = (
  posts: Array<{
    id: string;
    author: string;
    text: string;
    parent?: { author: string; text: string };
    greetingName?: string;
  }>,
  audience: DiscussionAudience,
  courseName: string,
  composition: ReplyCompositionSettings,
  provider: LlmProvider,
  knowledgeContext?: string
) => Promise<
  | {
      replies: Array<{
        id: string;
        reply: string;
        concepts?: string[];
        // docs/post-questions-acceptance-criteria.md Q4/Q5: the third
        // per-row output, present only when `answerQuestions` was on for
        // this dispatch AND the model returned at least one kept question.
        // `questionsDropped` is a server-side-only fact (the count of raw
        // array elements minus kept items) - present only when > 0.
        questions?: PostQuestion[];
        questionsDropped?: number;
      }>;
      // Q4: copied verbatim from the LlmResult the server action already
      // holds and discards - src/lib/llm.ts's `LlmResult` success branch.
      finishReason?: string;
      usage?: LlmUsage;
      elapsedMs?: number;
    }
  // The failure branch carries the same three fields - see the server
  // action's own comment on why (a truncated response fails the PARSE more
  // often than it fails a row, and the reason must survive either way).
  | { error: string; finishReason?: string; usage?: LlmUsage; elapsedMs?: number }
>;

// T6a's budget figure (docs/discussion-thread-structure-acceptance-criteria.md
// section 6): "worst case is 5 x 600 characters, about 3.5% input growth."
// MAX_POST_CHARS (re-exported from discussion-capture.ts, itself re-exported
// from src/lib/discussion-reply-prompt.ts) is 4000 - a different budget, for
// a full post, not a CONTEXT ONLY parent excerpt - so this is its own named
// constant rather than a reuse of that one. Truncates, never drops: a parent
// over budget still gives the model SOME context rather than none.
// docs/post-questions-acceptance-criteria.md Q5, and VERIFIER FINDING 1:
// the one owner of the "this row got no reply" text. A length-limited
// response (the questions output can push a batch's JSON past
// maxOutputTokens - see the AC's Limits) gets a message that names the real
// cause and the real fix, rather than the generic string, which reads as a
// transient failure. Exported so a test can pin both branches without
// re-spelling either sentence.
export function missingRowMessage(finishReason?: string): string {
  return finishReason === "MAX_TOKENS"
    ? "No reply came back for this post - the model's output hit its length limit. Retry usually lands."
    : "No reply came back for this post.";
}

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
  /** docs/reply-composition-controls-acceptance-criteria.md C5/JOB1: mirrors
   *  `audienceRef` exactly - the drafting queue reads the CURRENT composition
   *  at dispatch time, never a stale closure value. */
  compositionRef: MutableRefObject<ReplyCompositionSettings>;
  /**
   * "Activate this recording from the Knowledge base" - the owner ask this
   * closes: replies drafted with the instructor's selected standards pages
   * as context. UNLIKE `compositionRef`/`audienceRef` above, this is
   * deliberately NOT re-read as a live "current" control value - it is a
   * PER-RUN value (see this repo's own decision on the point): taken exactly
   * ONCE, by useDiscussionReplies.ts's `start()`, from
   * takeRecordingKnowledgeContext() (src/lib/recording-launch.ts), and held
   * unchanged in this ref for the life of the table. Still a ref, not a
   * plain closed-over value, for the same stale-closure reason every other
   * ref here exists (this loop is await-suspended across renders) - but its
   * value is written ONCE per table, not on every render.
   * takeRecordingKnowledgeContext() is itself a ONE-SHOT that clears on
   * read, which is exactly why this loop must never call it again per batch:
   * a second take anywhere would return null and silently starve every
   * batch after the first of context the first batch got. `null` (no
   * launch, or a launch with no usable pages) leaves every dispatch
   * byte-identical to before this feature - see the `.text` read at the
   * call site below, which passes `undefined` (never `null` or `""`)
   * through in that case, exactly what draftAction/buildReplyDraftingPrompt
   * treat as "omitted".
   */
  knowledgeContextRef: MutableRefObject<RecordingKnowledgeContext | null>;
  pushNotice: (text: string) => void;
  draftAction: DraftDiscussionRepliesAction;
  /** docs/post-questions-acceptance-criteria.md Q5/Q9: called EXACTLY ONCE
   *  per `draftAction` call, after the result (or the catch) resolves and
   *  BEFORE the `loopsActiveRef` guard just below - a dispatch whose loop
   *  was stopped mid-flight still happened and is still worth logging.
   *  Built from the DISPATCH-TIME `compositionNow`/`audienceNow` captured
   *  below, never a fresh read of `compositionRef.current`/`audienceRef.current`,
   *  which could have changed while the request was in flight. */
  pushDraftEvent: (event: DiscussionRepliesLogDraft) => void;
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
    compositionRef,
    knowledgeContextRef,
    pushNotice,
    draftAction,
    pushDraftEvent,
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
    const compositionNow = compositionRef.current;
    // Per-run, not per-batch (this ref's own doc comment above) - read
    // fresh from the ref anyway, since every other dispatch-time value here
    // is, and `undefined` (never `null`/`""`) is what reaches draftAction
    // when there is nothing to carry.
    const knowledgeContextNow = knowledgeContextRef.current?.text || undefined;

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
        //
        // C1b-ii: `greetingName` is derived HERE, per dispatched row, via
        // `greetingNameFromAuthor(x.row.author)` - never inside the prompt
        // builder. Also omitted entirely (never `undefined`) when the
        // derivation returns "" - a blank greeting name must never reach the
        // model as an instruction to open with nothing.
        //
        // BLOCKER 1 fixer pass: `greetingNameFromAuthor` itself now judges
        // whether the first token is safe to address someone by (a
        // handle-shaped single token such as "mchen", punctuation-only
        // input, or a token carrying a digit/underscore/@/slash all degrade
        // to "" INSIDE that function - see person-name.ts's own doc comment
        // for the exact rules). An earlier draft of this comment claimed
        // person-name.ts already handled that degrade while
        // greetingNameFromAuthor's own doc said the opposite - the judgment
        // lived in NEITHER layer, so a handle such as "mchen" reached a
        // reply as a greeting. This `|| undefined` below only needs to
        // convert person-name.ts's "" into an omitted key; it does not, and
        // must not, apply any judgment of its own.
        dispatchable.map((x) => {
          const parentRow = resolveDraftParent(x.row, currentRows);
          const parent = parentRow
            ? { author: parentRow.author, text: truncateDraftParentText(parentRow.post) }
            : undefined;
          const greetingName = greetingNameFromAuthor(x.row.author) || undefined;
          const post: {
            id: string;
            author: string;
            text: string;
            parent?: { author: string; text: string };
            greetingName?: string;
          } = { id: x.row.id, author: x.row.author, text: x.row.post };
          if (parent) post.parent = parent;
          if (greetingName) post.greetingName = greetingName;
          return post;
        }),
        audienceNow,
        courseName,
        compositionNow,
        provider,
        knowledgeContextNow
      );
    } catch (err) {
      result = { error: err instanceof Error ? err.message : "Could not draft replies." };
    }

    // docs/post-questions-acceptance-criteria.md Q5/Q9: exactly once per
    // draftAction call, BEFORE the loopsActiveRef guard below - see
    // RunDraftLoopDeps.pushDraftEvent's own doc comment. `compositionNow`/
    // `audienceNow` are the DISPATCH-TIME values already captured above,
    // never a fresh ref read.
    if ("error" in result) {
      pushDraftEvent({
        at: new Date().toISOString(),
        rowIds: ids,
        audience: audienceNow,
        ingredients: [...compositionNow.ingredients],
        addressByName: compositionNow.addressByName,
        formality: compositionNow.formality,
        answerQuestions: compositionNow.answerQuestions,
        outcome: "error",
        error: result.error,
        repliesReturned: 0,
        rowsMissing: ids.length,
        questionsReturned: 0,
        // A7: no replies landed on the error path, so nothing was there to
        // check an answer against.
        questionsAnsweredInReply: 0,
        questionsNeedingYou: 0,
        questionsDropped: 0,
        // VERIFIER FINDING 1: read from the failure result, not hardcoded -
        // a batch that failed BECAUSE it was length-limited is exactly the
        // call whose finishReason and timing the log most needs.
        finishReason: result.finishReason ?? "",
        candidatesTokenCount: result.usage?.candidatesTokenCount ?? null,
        elapsedMs: result.elapsedMs ?? null,
      });
    } else {
      const returnedIdsForLog = new Set(result.replies.map((r) => r.id));
      let questionsReturned = 0;
      let questionsAnsweredInReplyForLog = 0;
      let questionsNeedingYouForLog = 0;
      let questionsDropped = 0;
      for (const reply of result.replies) {
        const qs = reply.questions ?? [];
        questionsReturned += qs.length;
        // A7: computed HERE, against THIS reply's own text, at the moment it
        // landed - the one point in the loop where "the reply this question
        // was drafted for" and "the reply text" are still the same value.
        questionsAnsweredInReplyForLog += qs.filter(
          (q) => q.answer !== "" && replyContainsAnswer(reply.reply, q.answer)
        ).length;
        questionsNeedingYouForLog += qs.filter((q) => q.needsYou !== undefined && q.needsYou !== "").length;
        questionsDropped += reply.questionsDropped ?? 0;
      }
      pushDraftEvent({
        at: new Date().toISOString(),
        rowIds: ids,
        audience: audienceNow,
        ingredients: [...compositionNow.ingredients],
        addressByName: compositionNow.addressByName,
        formality: compositionNow.formality,
        answerQuestions: compositionNow.answerQuestions,
        outcome: "ok",
        error: "",
        repliesReturned: result.replies.length,
        rowsMissing: ids.filter((id) => !returnedIdsForLog.has(id)).length,
        questionsReturned,
        questionsAnsweredInReply: questionsAnsweredInReplyForLog,
        questionsNeedingYou: questionsNeedingYouForLog,
        questionsDropped,
        finishReason: result.finishReason ?? "",
        candidatesTokenCount: result.usage?.candidatesTokenCount ?? null,
        elapsedMs: result.elapsedMs ?? null,
      });
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
      // VERIFY PASS - this argument was `[]` (clear) for one revision, and
      // that was wrong. The AC's A7 rule is "questions travel with the reply
      // they were drafted for", and this call site REPLACES NOTHING: it
      // writes the row's own current text (`current.reply`, read from
      // `rawRows` just above) back over itself, because the model's reply is
      // being discarded and never reaches the row. The questions sitting on
      // the row at this instant were written by an earlier `applyReply`
      // TOGETHER WITH the text that is still in the box - they belong to it.
      // Clearing them here deleted the row's whole question list, including
      // the only copy of any answer that had not been located in the reply,
      // on a path where the instructor merely typed while a redraft was in
      // flight. Left `undefined` (untouched), which also keeps this call
      // symmetrical with `concepts` (the fourth argument): two outputs of the
      // same draft, treated the same way, on a path where neither input
      // changed.
      if (current) rowsApiRef.current.applyReply(id, current.reply, current.userEdited, undefined, undefined);
    };

    if ("error" in result) {
      const { unchanged, editedDuringDispatch } = partitionDraftOutcome(ids, isUnchanged);
      editedDuringDispatch.forEach(resolveEditedDuringDispatch);
      if (unchanged.length > 0) {
        // VERIFIER FINDING 1: a length-limited batch that failed the PARSE
        // outright (the commonest truncation outcome, ~25% of cut positions
        // by the AC's own measurement) reaches HERE, not the missing-rows
        // branch below - so it needs the same message that names the length
        // limit. The provider's own error text is kept alongside it, never
        // replaced: the real reason must survive.
        rowsApiRef.current.markFailed(
          unchanged,
          result.finishReason === "MAX_TOKENS" ? `${result.error} ${missingRowMessage(result.finishReason)}` : result.error
        );
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
        // RC2b/RC3 (docs/reply-resource-concepts-acceptance-criteria.md):
        // `reply.concepts ?? []` - `[]` when the model returned none this
        // time means "clear", not "leave alone"; the re-apply call on the
        // discard path above (`resolveEditedDuringDispatch`) leaves its own
        // fourth argument `undefined` instead, since it is re-applying the
        // user's OWN text, not a model-authored reply with concepts of its
        // own.
        // docs/answers-in-the-reply-acceptance-criteria.md A7: the FIFTH
        // argument is now `[]` on BOTH branches, never `undefined` - `answer`
        // quotes words from the specific draft that produced it (D4), so any
        // path that replaces `reply` invalidates every question the row was
        // carrying, whether or not this dispatch itself returned new ones.
        // This reverses the old Q5 reasoning ("turning the feature off stops
        // producing, it does not delete what a row has"), which held only
        // while `answer` was independent, appended prose (the now-deleted
        // Insert path, D5) rather than a quotation of THIS reply.
        rowsApiRef.current.applyReply(
          reply.id,
          reply.reply,
          false,
          reply.concepts ?? [],
          compositionNow.answerQuestions ? (reply.questions ?? []) : []
        );
        // R6: the ONE trigger point - enqueue a resource search only
        // after a model-authored reply lands. Never on the discard path
        // above, which re-applies the user's own text and searched
        // nothing new.
        // C2b (docs/reply-composition-controls-acceptance-criteria.md,
        // SHOULD 1 fixer pass): gated on the "resources" ingredient having
        // been selected for THIS dispatch (`compositionNow`, captured above
        // at dispatch time - the same value that reached `draftAction`, not
        // a possibly-changed `compositionRef.current`). Deselecting
        // "resources" is a real token saving, so unchecking it must
        // suppress the resource pass, not merely stop the prompt from
        // mentioning it.
        if (compositionNow.ingredients.includes("resources")) {
          resourcesApiRef.current.enqueueResources([reply.id]);
        }
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
        // docs/post-questions-acceptance-criteria.md Q5: a length-limited
        // response (the questions output can push a batch's JSON past
        // maxOutputTokens - see the AC's own Limits section) gets a message
        // that names the real cause and the real fix, rather than the
        // generic "no reply came back" that reads as a transient failure.
        rowsApiRef.current.markFailed(stillFailed, missingRowMessage(result.finishReason));
      }
    }
  }
}
