// Discussion reply capture - the React-free, DOM-free pure module.
//
// This file contains NO React, no hooks, no `document`, no `navigator`. It is
// the reason the feature (docs/discussion-reply-capture-acceptance-criteria.md)
// is testable at all: vitest in this repo is node-env and renders nothing, so
// every behaviour that needs a unit test lives here, and every DOM/React
// concern lives in the sibling hooks (useDiscussionCapture.ts,
// useReplyRows.ts, useDiscussionReplies.ts) that call into it.
//
// AC35: dependency-free of anything server-only, so this file is safe to pull
// into a "use client" component's bundle. `@/lib/upload-budget` is itself
// dependency-free (see its own header) and is imported below only for the
// wire-byte unit the server enforces (AC10a), so that unit is never restated.

import { sumBase64WireBytes } from "@/lib/upload-budget";

// The three constants the SERVER also enforces live in set B's
// src/lib/discussion-reply-prompt.ts and are re-exported from there, never
// restated here - see AC8's "split constants into the leaf" rule. This import
// fails `tsc` until that file lands; that is expected for this wave (see
// docs/discussion-reply-capture-acceptance-criteria.md section 12).
export { EXTRACT_BATCH_SIZE, DRAFT_BATCH_SIZE, MAX_POST_CHARS } from "@/lib/discussion-reply-prompt";

// ---------------------------------------------------------------------------
// AC8: capture-only constants. These never leave the client, so they are NOT
// shared with set B's file.
// ---------------------------------------------------------------------------

export const FRAME_SAMPLE_INTERVAL_MS = 500; // detection rate
export const FRAME_MIN_KEEP_INTERVAL_MS = 1200; // keep rate - decoupled from the above, see AC8d
export const FRAME_TARGET_WIDTH = 1920;
export const FRAME_MIN_SCALE = 0.5; // never downscale past half, see AC8a
export const FRAME_JPEG_QUALITY = 0.55;
export const SIGNATURE_GRID = 32; // 32x32 grayscale signature
export const FRAME_CHANGE_THRESHOLD = 6; // mean abs diff, 0-255
export const MAX_PENDING_FRAMES = 16;
export const EXTRACT_BATCH_WIRE_BUDGET = 3_000_000; // the REAL batch ceiling, see AC10a
export const STALL_NOTICE_TICKS = 60; // 60 x 500ms = 30s
export const MAX_TABLE_ROWS = 500;

// ---------------------------------------------------------------------------
// AC8a: the target-width rule, pulled out as a pure function so it is
// testable without a canvas. `getDisplayMedia` hands back the device
// framebuffer, not CSS pixels, so a plain `min(WIDTH, trackWidth)` makes text
// arrive SMALLER the higher the user's resolution is - backwards from the
// intuition the constant was picked under. The floor below fixes that: see
// the measured table in the AC for why 0.5 was chosen.
// ---------------------------------------------------------------------------

export function resolveTargetWidth(trackWidth: number): number {
  return Math.min(trackWidth, Math.max(FRAME_TARGET_WIDTH, Math.round(trackWidth * FRAME_MIN_SCALE)));
}

// ---------------------------------------------------------------------------
// AC9 / AC9a: change detection. Pure, and deliberately ignorant of canvases -
// the caller is expected to draw a SIGNATURE_GRID x SIGNATURE_GRID sample
// (AC9a: never the full frame, to avoid an 8MB GPU readback twice a second)
// and hand this module the resulting pixel buffer.
// ---------------------------------------------------------------------------

/** Length is expected to be SIGNATURE_GRID * SIGNATURE_GRID (one byte per pixel, grayscale). */
export type FrameSignature = Uint8Array;

/** Grayscale-luma signature of an RGBA pixel buffer. Works for any width x
 * height buffer, but AC9a's contract is that the caller always passes a
 * SIGNATURE_GRID x SIGNATURE_GRID sample. */
export function computeFrameSignature(pixels: Uint8ClampedArray, width: number, height: number): FrameSignature {
  const count = width * height;
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const r = pixels[o] ?? 0;
    const g = pixels[o + 1] ?? 0;
    const b = pixels[o + 2] ?? 0;
    // Standard luma weights (ITU-R BT.601), matching the JPEG encoder's own
    // luma channel closely enough that the signature tracks what actually
    // changed in the encoded frame.
    out[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return out;
}

/** `framesDifferEnough(null, b)` is always true - the first frame of a
 * session is always kept. Otherwise: mean absolute difference across the
 * signature, compared against `threshold`. */
export function framesDifferEnough(a: FrameSignature | null, b: FrameSignature, threshold: number = FRAME_CHANGE_THRESHOLD): boolean {
  if (a === null) return true;
  const len = Math.min(a.length, b.length);
  if (len === 0) return true;
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / len > threshold;
}

// ---------------------------------------------------------------------------
// AC10a: the pure batch packer. Bytes are the real ceiling, count is a cap on
// top of it - see the AC for the measured 1920-wide-window numbers that make
// a count-only cap a latent outage for tall-window users.
// ---------------------------------------------------------------------------

/** Takes frames oldest-first (index 0 is assumed oldest) while
 * `count < maxCount` AND the running wire-byte total stays within
 * `maxWireBytes`. Always returns at least one frame when `frames` is
 * non-empty, even if that frame alone exceeds `maxWireBytes` - the caller
 * (the server action, via `checkWireBudget`) is expected to produce a
 * user-facing refusal for that case rather than the client silently
 * stalling with an unsendable frame wedged at the head of the queue. */
export function packFrameBatch(frames: ReadonlyArray<{ base64: string }>, maxCount: number, maxWireBytes: number): Array<{ base64: string }> {
  if (frames.length === 0) return [];
  const packed: Array<{ base64: string }> = [frames[0]];
  for (let i = 1; i < frames.length && packed.length < maxCount; i++) {
    const candidate = [...packed, frames[i]];
    if (sumBase64WireBytes(candidate.map((f) => f.base64)) > maxWireBytes) break;
    packed.push(frames[i]);
  }
  return packed;
}

// ---------------------------------------------------------------------------
// AC11 / AC11a / AC11b: identity by comparison, not by a derived key.
// `postKey` is deleted, not kept alongside - see the AC's measured 10/16
// false-split table for why a derived key over a 120-character prefix is
// structurally wrong for vision-transcribed text.
// ---------------------------------------------------------------------------

export const PREFIX_TOKENS = 40;
export const SIMILARITY_THRESHOLD = 0.25;
export const MIN_TOKENS_FOR_SIMILARITY = 4;

/** lowercase; delete intra-word marks FIRST (straight `'` and curly
 * `’`, which is what a real LMS renders), so "don't" collapses to the
 * one token "dont" instead of splitting into "don" and "t"; THEN strip
 * everything else outside [a-z0-9 ] to a space, so "user,name" still becomes
 * two tokens "user name" rather than gluing into "username"; collapse
 * whitespace; trim. Order matters - space-replacing the apostrophe first
 * would produce the same wrong two-token split a comma is deliberately given.
 */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(s: string): string[] {
  const n = normalizeForMatch(s);
  return n.length ? n.split(" ") : [];
}

/** Surname-anchored: normalized equality, else the last token must agree AND
 * (the first tokens agree OR either side is a single token). Tolerates a
 * middle initial appearing in one read and a surname-only read when the
 * avatar clipped the given name. */
export function authorsMatch(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na === nb) return true;

  const ta = tokensOf(a);
  const tb = tokensOf(b);
  if (ta.length === 0 || tb.length === 0) return false;

  const lastA = ta[ta.length - 1];
  const lastB = tb[tb.length - 1];
  if (lastA !== lastB) return false;

  return ta[0] === tb[0] || ta.length === 1 || tb.length === 1;
}

/** Token-level Levenshtein distance. */
function tokenLevenshtein(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Levenshtein over tokens, both lists truncated to the first `PREFIX_TOKENS`
 * and then to the SHORTER of the two, normalized by that length. Truncating
 * to the shorter list is the whole trick: a partially-read post matches its
 * fully-read self, because the longer read's extra tail is free. */
export function postSimilarityDistance(aText: string, bText: string): number {
  const tokensA = tokensOf(aText).slice(0, PREFIX_TOKENS);
  const tokensB = tokensOf(bText).slice(0, PREFIX_TOKENS);
  const minLen = Math.min(tokensA.length, tokensB.length);
  if (minLen === 0) return tokensA.length === tokensB.length ? 0 : 1;
  const trimmedA = tokensA.slice(0, minLen);
  const trimmedB = tokensB.slice(0, minLen);
  return tokenLevenshtein(trimmedA, trimmedB) / minLen;
}

/** AC11a: `postedAt` is the primary identity signal when both sides have it.
 * If both carry a non-empty `postedAt` and the normalized strings differ,
 * they are different posts - short-circuit, skip the similarity test. If
 * both carry the same `postedAt`, they are the same post as long as the
 * authors also match. Falls back to the similarity rule whenever either side
 * lacks a timestamp. */
export function isSamePost(a: { author: string; text: string; postedAt?: string }, b: { author: string; text: string; postedAt?: string }): boolean {
  const aTime = a.postedAt?.trim();
  const bTime = b.postedAt?.trim();
  if (aTime && bTime) {
    if (normalizeForMatch(aTime) !== normalizeForMatch(bTime)) return false;
    return authorsMatch(a.author, b.author);
  }

  if (!authorsMatch(a.author, b.author)) return false;

  const tokenCount = Math.min(tokensOf(a.text).length, tokensOf(b.text).length);
  if (tokenCount < MIN_TOKENS_FOR_SIMILARITY) {
    return normalizeForMatch(a.text) === normalizeForMatch(b.text);
  }
  return postSimilarityDistance(a.text, b.text) <= SIMILARITY_THRESHOLD;
}

// ---------------------------------------------------------------------------
// F10: pure classification helper for the drafting queue's response
// handling (useDiscussionReplies.ts). A row edited WHILE it is "drafting"
// (after dispatch, before the response lands) must never be marked "failed"
// and must never receive the model's stale text - AC26 says such a row "is
// left as the user typed it", and AC17's badge table has no "edited while
// drafting" state to leave it in, so the only correct outcome is "ready" on
// the row's OWN current text. Pulled out as a pure function (rather than
// inlined three times in the hook, for the batch-error path, the missing-id
// path and the per-reply response loop) so this branching is unit-testable
// at all in a repo where no hook is ever rendered by a test.
// ---------------------------------------------------------------------------

export interface DraftOutcomePartition {
  /** Ids whose edit generation has not advanced since dispatch - a real
   *  outcome (failed, or the model's own text) applies to these. */
  unchanged: string[];
  /** Ids the user edited after dispatch but before the response landed -
   *  must resolve to "ready" on the row's own current text, never "failed"
   *  and never the model's text. */
  editedDuringDispatch: string[];
}

/** Partitions `ids` by whether each is still unchanged since dispatch,
 * using the caller-supplied `isUnchangedSince` predicate (C2's
 * `editSeqRef`-backed check). Pure: takes the predicate as a parameter
 * rather than reaching into any ref itself. */
export function partitionDraftOutcome(ids: ReadonlyArray<string>, isUnchangedSince: (id: string) => boolean): DraftOutcomePartition {
  const unchanged: string[] = [];
  const editedDuringDispatch: string[] = [];
  for (const id of ids) {
    if (isUnchangedSince(id)) unchanged.push(id);
    else editedDuringDispatch.push(id);
  }
  return { unchanged, editedDuringDispatch };
}

// ---------------------------------------------------------------------------
// AC52 / S1: the drafting queue's dispatch-time skip guard, pulled out as a
// pure predicate for the same reason partitionDraftOutcome above is - so it
// is unit-testable at all. AC52 exists to protect a reply the USER typed from
// being silently overwritten by a queued draft. "`reply` is non-empty" is NOT
// the same fact as "the user wrote this": a row left `failed` by a redraft
// that itself failed keeps its OLD machine-drafted text sitting in `reply`
// with `userEdited` still false, and that text must stay dispatchable so
// Retry / "Draft the missing replies" can still reach it. `userEdited` is the
// fact that actually distinguishes "protect this" from "this is safe to
// overwrite".
// ---------------------------------------------------------------------------

export function isDispatchableDraftItem(item: { force: boolean }, row: { userEdited: boolean }): boolean {
  return item.force || !row.userEdited;
}

// ---------------------------------------------------------------------------
// S1: which of the drafting queue's four dispatch sites forces past
// isDispatchableDraftItem's userEdited guard. Pulled out as a pure, named
// mapping - the same "make it a testable function, not four hand-written
// booleans at four call sites" reasoning as isDispatchableDraftItem and
// partitionDraftOutcome above - so the POLICY itself is unit-testable, and a
// future edit to useDiscussionReplies.ts cannot silently drift one of these
// call sites back to the wrong value without a test catching it.
//
// "retry" forces: it is a targeted, single-row explicit user action on a row
// already showing "Failed" - the row's own dedicated affordance for exactly
// this row. AC52's userEdited guard exists to stop an AUTOMATIC dispatch
// from clobbering hand-typed text, not to make this button a permanent dead
// end. This is what closes S1: after S7's fix (markDrafting no longer clears
// userEdited), a row hand-edited and then sent through a "Redraft every
// reply" that itself fails is left `failed` + `userEdited: true`, the
// instructor's own text still sitting in `reply` (neither markDrafting nor
// markFailed writes to it) - unforced, no explicit action could ever reach
// it again.
//
// "redraftAll" forces (AC29: a redraft is explicitly armed and allowed to
// overwrite edited work, because the user asked for it).
//
// "auto" (the extraction loop's own post-merge enqueue) and "draftMissing"
// ("Draft the missing replies", a BULK action covering every pending/failed
// row at once) do NOT force - overwriting one instructor's hand-typed text
// as a side effect of a click aimed at OTHER rows is exactly what AC52
// exists to prevent. Retry remains the specific escape hatch for the one row
// that needs it.
// ---------------------------------------------------------------------------

export type DraftDispatchSource = "auto" | "retry" | "draftMissing" | "redraftAll";

export function draftDispatchForce(source: DraftDispatchSource): boolean {
  return source === "retry" || source === "redraftAll";
}

// ---------------------------------------------------------------------------
// NEW-1: the consumer loops' own continuation predicate, pulled out as a
// pure function for the same reason as the two functions just above - so the
// LOGIC is unit-testable at all, since vitest in this repo is node-env and
// never renders a hook, and the React StrictMode timing this predicate
// actually guards against cannot itself be reproduced in a unit test (see
// useDiscussionReplies.ts's wake-ticker cleanup effect for that full
// account).
//
// `loopsActive` is the real-unmount signal (false once, and only once, the
// component has actually gone away for good). `currentEpoch !== capturedEpoch`
// is what catches a React StrictMode-orphaned loop instance that
// `loopsActive` alone cannot distinguish from the current one: `loopsActive`
// flips false-then-true-again fully SYNCHRONOUSLY across StrictMode's
// simulated unmount/remount cycle (no microtask yields occur in between), so
// a loop instance suspended in `await waitForWake()` during that cycle only
// ever observes `loopsActive` back at `true` by the time it resumes - never
// the `false` that briefly appeared while it was still asleep. The epoch
// cannot un-toggle the same way: it is bumped exactly once per real loop
// start, so an orphaned instance's captured value permanently stops matching
// the moment a fresh pair of loops is started.
// ---------------------------------------------------------------------------

export function shouldLoopContinue(loopsActive: boolean, currentEpoch: number, capturedEpoch: number): boolean {
  return loopsActive && currentEpoch === capturedEpoch;
}

// ---------------------------------------------------------------------------
// NEW-2: whether the shared wake ticker has anything to wake either consumer
// loop FOR, right now. Pulled out as a pure function for the same
// not-otherwise-testable reason as the functions above. See
// useDiscussionReplies.ts's `hasWork` for why `rowsApi.rows.length > 0` is
// deliberately excluded - a persisted table sitting there is why the loops
// were STARTED at all, but says nothing about whether either one has
// anything to do this instant.
// ---------------------------------------------------------------------------

export function shouldTickerRun(args: {
  capturing: boolean;
  pendingFrames: number;
  extracting: boolean;
  drafting: boolean;
  draftQueueSize: number;
}): boolean {
  return args.capturing || args.pendingFrames > 0 || args.extracting || args.drafting || args.draftQueueSize > 0;
}

// ---------------------------------------------------------------------------
// AC4c: domain types.
// ---------------------------------------------------------------------------

export type ReplyRowState = "pending" | "drafting" | "ready" | "failed";

export interface ReplyRow {
  id: string; // opaque, minted once: `disc-${now}-${counter}`. See AC11b.
  author: string;
  post: string;
  postedAt?: string; // the LMS's own timestamp, as displayed. See AC11a.
  reply: string; // "" until drafted; user edits overwrite it
  userEdited: boolean; // a human wrote this reply. PERSISTED - see AC22.
  state: ReplyRowState;
  error: string | null; // set only when state === "failed"
  firstSeenAt: number; // ms epoch; the "Captured" column and sort key
  order: number; // manual position; see AC14
}

export type ReplySort = "captured-asc" | "captured-desc" | "name-asc" | "name-desc" | "custom";

// ---------------------------------------------------------------------------
// AC12 / AC13 / AC54: merging captured posts into the table.
// ---------------------------------------------------------------------------

// BL5/N2: minted-id counter, hoisted to MODULE scope rather than local to
// each call. Two calls to `mergeCapturedPosts` sharing the same `now` (the
// caller passes `Date.now()`, and two extraction batches can resolve in the
// same millisecond) would otherwise both start counting from 0 and mint the
// identical id `disc-<t>-0` - and `id` is a row's whole identity (removeRow,
// editSeqRef, the drafting queue). A module-scope counter that only ever
// increases removes the collision class entirely, at the cost of the ids no
// longer being predictable from a single call's inputs alone - nothing reads
// them for anything but equality, so that cost is free.
let mergeIdCounter = 0;

/** Pure; takes `now` as a parameter rather than calling `Date.now()`, and
 * never mutates its inputs. A linear scan with `isSamePost`, so an incoming
 * post is matched against existing rows AND against rows already added
 * earlier in this same call (which covers "the same post appears twice in
 * one batch" collapsing to one row, and AC54's "equal-length text, the first
 * wins" tie-break, with no special-casing: the second entry compares against
 * the row the first entry just created, finds a match, and since its text is
 * not LONGER it is not applied).
 *
 * BL5: `capped` reports whether at least one incoming post that would have
 * become a NEW row was refused because the table was already at
 * MAX_TABLE_ROWS. This can only be answered from INSIDE this function -
 * comparing `rows.length` before and after the call can never detect it,
 * because the ceiling check below is exactly what keeps the returned
 * `rows.length` at or under MAX_TABLE_ROWS in the first place. A caller that
 * tries to infer fullness from the output length alone is comparing a
 * capped value against its own cap and will never see it exceeded. */
export function mergeCapturedPosts(
  rows: ReadonlyArray<ReplyRow>,
  incoming: ReadonlyArray<{ author: string; text: string; postedAt?: string }>,
  now: number
): { rows: ReplyRow[]; addedIds: string[]; capped: boolean } {
  let nextRows = rows.slice();
  const addedIds: string[] = [];
  let capped = false;

  for (const post of incoming) {
    const matchIndex = nextRows.findIndex((r) => isSamePost({ author: r.author, text: r.post, postedAt: r.postedAt }, post));

    if (matchIndex === -1) {
      // AC23b: refuse to grow the table past MAX_TABLE_ROWS. A merge into an
      // existing row (the branch below) does not grow the table, so it is
      // never subject to this check.
      if (nextRows.length >= MAX_TABLE_ROWS) {
        capped = true;
        continue;
      }

      const maxOrder = nextRows.reduce((m, r) => Math.max(m, r.order), -1);
      const id = `disc-${now}-${mergeIdCounter++}`;
      const newRow: ReplyRow = {
        id,
        author: post.author,
        post: post.text,
        postedAt: post.postedAt,
        reply: "",
        userEdited: false,
        state: "pending",
        error: null,
        firstSeenAt: now,
        order: maxOrder + 1,
      };
      nextRows = [...nextRows, newRow];
      addedIds.push(id);
      continue;
    }

    const existing = nextRows[matchIndex];
    if (post.text.length > existing.post.length) {
      const updated: ReplyRow = {
        ...existing,
        post: post.text,
        postedAt: existing.postedAt && existing.postedAt.trim() ? existing.postedAt : post.postedAt,
      };
      nextRows = nextRows.map((r, i) => (i === matchIndex ? updated : r));
    }
    // else: equal-or-shorter text - no change. This is AC54's tie-break: the
    // first (already-stored) version wins.
  }

  return { rows: nextRows, addedIds, capped };
}

// ---------------------------------------------------------------------------
// AC14: sorting.
// ---------------------------------------------------------------------------

export function sortReplyRows(rows: ReadonlyArray<ReplyRow>, sort: ReplySort): ReplyRow[] {
  const copy = rows.slice();
  switch (sort) {
    case "captured-asc":
      return copy.sort((a, b) => a.firstSeenAt - b.firstSeenAt);
    case "captured-desc":
      return copy.sort((a, b) => b.firstSeenAt - a.firstSeenAt);
    case "name-asc":
      return copy.sort((a, b) => a.author.localeCompare(b.author, undefined, { sensitivity: "base" }));
    case "name-desc":
      return copy.sort((a, b) => b.author.localeCompare(a.author, undefined, { sensitivity: "base" }));
    case "custom":
    default:
      return copy.sort((a, b) => a.order - b.order);
  }
}

// ---------------------------------------------------------------------------
// AC53: the moveRow pure helper.
// ---------------------------------------------------------------------------

export interface MoveRowResult {
  rows: ReplyRow[];
  sort: ReplySort;
  /** True when the move was a no-op because the row was already at the
   * boundary - the caller announces "Already first."/"Already last." and
   * leaves everything else unchanged. */
  atBoundary: boolean;
}

/** `displayedRows` must already be sorted for display (every consumer of
 * this module keeps `rows` in exactly that shape). Sets `sort` to `"custom"`
 * in the same result as the swap, and - when the previous sort was not
 * already `"custom"` - first rewrites every row's `order` to its current
 * displayed index, so the first `Move up` after a `Name` sort reorders
 * against what is actually on screen instead of stale capture-time order
 * values. */
export function moveRow(displayedRows: ReadonlyArray<ReplyRow>, currentSort: ReplySort, id: string, direction: "up" | "down"): MoveRowResult {
  const index = displayedRows.findIndex((r) => r.id === id);
  if (index === -1) {
    return { rows: displayedRows.slice(), sort: currentSort, atBoundary: false };
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= displayedRows.length) {
    return { rows: displayedRows.slice(), sort: currentSort, atBoundary: true };
  }

  const base: ReplyRow[] =
    currentSort === "custom" ? displayedRows.slice() : displayedRows.map((row, i) => (row.order === i ? row : { ...row, order: i }));

  const nextRows = base.slice();
  const rowAtIndex = nextRows[index];
  const rowAtTarget = nextRows[targetIndex];
  nextRows[index] = { ...rowAtTarget, order: rowAtIndex.order };
  nextRows[targetIndex] = { ...rowAtIndex, order: rowAtTarget.order };

  return { rows: nextRows, sort: "custom", atBoundary: false };
}

// ---------------------------------------------------------------------------
// AC22: serialization. `deserializeReplyTable` must NEVER throw, following
// `coerceMessageDraftPayload`'s discipline (src/lib/message-drafts.ts:54):
// drop what is malformed rather than fail the whole load.
// ---------------------------------------------------------------------------

export const DISCUSSION_TABLE_VERSION = 1;

const VALID_STATES = new Set<string>(["pending", "drafting", "ready", "failed"]);

export function serializeReplyTable(rows: ReadonlyArray<ReplyRow>): string {
  const normalized = rows.map((r) => {
    // Nothing is in flight after a reload, so a `drafting` row is written as
    // `pending`. `error` is preserved only for `failed` rows - BL4: this must
    // actually enforce the `ReplyRow` invariant ("error is set only when
    // state === 'failed'") rather than merely documenting it, so a stale
    // `error` string left on a row that was later re-drafted successfully
    // does not resurrect itself as a mystery message after a reload.
    const state: ReplyRowState = r.state === "drafting" ? "pending" : r.state;
    return { ...r, state, error: state === "failed" ? r.error : null };
  });
  return JSON.stringify({ v: DISCUSSION_TABLE_VERSION, rows: normalized });
}

export function deserializeReplyTable(raw: string | null): ReplyRow[] {
  try {
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const obj = parsed as Record<string, unknown>;
    if (obj.v !== DISCUSSION_TABLE_VERSION) return [];
    if (!Array.isArray(obj.rows)) return [];

    const rows: ReplyRow[] = [];
    obj.rows.forEach((rawRow: unknown, index: number) => {
      if (!rawRow || typeof rawRow !== "object") return;
      const r = rawRow as Record<string, unknown>;

      const id = typeof r.id === "string" ? r.id.trim() : "";
      if (!id) return; // no usable primary key - this row is unrecoverable

      const author = typeof r.author === "string" ? r.author : "";
      const post = typeof r.post === "string" ? r.post : "";
      const postedAt = typeof r.postedAt === "string" && r.postedAt ? r.postedAt : undefined;
      const reply = typeof r.reply === "string" ? r.reply : "";
      const userEdited = typeof r.userEdited === "boolean" ? r.userEdited : false;

      const stateRaw = typeof r.state === "string" ? r.state : "";
      let state: ReplyRowState = VALID_STATES.has(stateRaw) ? (stateRaw as ReplyRowState) : "pending";
      if (state === "drafting") state = "pending"; // defensive: nothing is ever in flight on load

      const error = state === "failed" && typeof r.error === "string" ? r.error : null;
      const firstSeenAt = typeof r.firstSeenAt === "number" && Number.isFinite(r.firstSeenAt) ? r.firstSeenAt : 0;
      const order = typeof r.order === "number" && Number.isFinite(r.order) ? r.order : index;

      rows.push({ id, author, post, postedAt, reply, userEdited, state, error, firstSeenAt, order });
    });

    return rows;
  } catch {
    return [];
  }
}
