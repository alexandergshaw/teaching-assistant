// Discussion reply table serialization - the persisted row shape and the
// read/write functions for it. Split out of discussion-capture.ts.
//
// REGRESSION 372's Limits named this extraction explicitly: that group left
// discussion-capture.ts at 926 of its hard 1000-line ceiling, "roughly ONE
// more feature's room, not two", and said to "Extract discussion-capture.ts's
// serialization block (~170 lines, already self-contained with its own test
// file) before the next group, not after one hits the wall." This is that
// extraction, done ahead of the reply-composition-controls group.
//
// This file contains NO React, no hooks, no `document`, no `navigator` -
// the same discipline discussion-capture.ts's own header describes.
//
// Import direction: discussion-capture.ts imports FROM this file, never the
// reverse - the same one-owner, one-direction rule that file's own header
// states for the server-shared prompt constants, and that discussion-thread.ts's
// header states for the thread-structure helpers. `ReplyRowState`,
// `ReplyResource` and `ReplyRow` move here (rather than staying in
// discussion-capture.ts with a back-import) for the same reason
// discussion-thread.ts stayed a true zero-import leaf: this repo has a
// recorded failure (split-constants-into-the-leaf) where back-importing a
// CONSTANT from the parent created a cycle that silently yielded `undefined`
// past `tsc`. This file never imports from discussion-capture.ts - not a
// value, not a type - so that failure mode is foreclosed structurally, not
// merely avoided. discussion-capture.ts re-exports every symbol below so no
// existing importer's path changes.

import { coerceResourceKind, type ResourceKind } from "@/lib/resource-kind";
import { VALID_THREAD_POSITIONS } from "./discussion-thread";
// docs/post-questions-acceptance-criteria.md Q1/Q6: `PostQuestion` is one
// type, one path - imported ONLY from the leaf, never re-exported from this
// file or from discussion-capture.ts (see that leaf's own comment on why a
// type "restated in four modules" is the exact lesson this repo already
// learned once). `postQuestionKey` is the dedupe identity `coercePostQuestions`
// below shares with the model-output parser (Q3, Group A) - one
// implementation of "what makes two questions the same question."
import { postQuestionKey, type PostQuestion } from "@/lib/discussion-reply-prompt";
// docs/reply-resource-search-yield-acceptance-criteria.md Y5/Y8/Y9: the
// outcome kind/counts/shape types are owned by the neutral, dependency-free
// leaf src/lib/resource-search-outcome.ts - imported here and re-exported
// unchanged so every existing importer of
// ResourceSearchOutcomeKind/ResourceSearchCounts/ResourceSearchOutcome from
// this file keeps working.
import type { ResourceSearchOutcomeKind, ResourceSearchCounts, ResourceSearchOutcome } from "@/lib/resource-search-outcome";

export type { ResourceSearchOutcomeKind, ResourceSearchCounts, ResourceSearchOutcome };

// ---------------------------------------------------------------------------
// AC4c: domain types. Moved here with the functions that most rigidly must
// track every field across a save/load round trip - see this file's header
// for why they did not stay in discussion-capture.ts with a back-import
// instead.
// ---------------------------------------------------------------------------

export type ReplyRowState = "pending" | "drafting" | "ready" | "failed";

// ---------------------------------------------------------------------------
// docs/discussion-reply-resources-acceptance-criteria.md R3: resources
// attached to a reply. `resourceState` is a SECOND, ORTHOGONAL state machine
// from `state` above - a row can be `ready` + `searching`, `ready` +
// `failed`, `failed` + `done`. It deliberately never appears in the Status
// badge (R3a); it renders beneath the reply instead. `note` is a UI
// affordance for choosing between candidates and is never copied - see
// discussion-capture.ts's replyClipboardText (R9b).
// ---------------------------------------------------------------------------

export interface ReplyResource {
  title: string;
  url: string;
  kind: ResourceKind;
  note?: string;
}

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
  resources?: ReplyResource[]; // R3
  resourceState?: "idle" | "searching" | "done" | "failed"; // R3, R3a
  resourceError?: string | null; // set only when resourceState === "failed", R3c
  // T2: thread-structure fields. Deliberately NOT referential (no parentId) -
  // see T2a in docs/discussion-thread-structure-acceptance-criteria.md for
  // why a parent pointer is the wrong shape here (parents are frequently
  // captured AFTER their children, and a referential field would have to
  // survive removeRow, clearTable and both serializers - the exact functions
  // REGRESSION 367 defect 4 records as having shipped twice with the tested
  // copy not being the live one). Absence and "unknown" render identically
  // (T1a) - a row that has never been through extraction round-trips with
  // neither field set, same as postedAt's own absent-stays-absent treatment.
  threadPosition?: "root" | "reply" | "unknown";
  replyingToAuthor?: string; // only when the LMS printed a name, exactly as shown
  // D1/D9 (docs/aesthetics-pass-acceptance-criteria.md section 4b): PERSISTED,
  // absent-stays-absent exactly like postedAt/threadPosition above. These used
  // to live in a side-channel localStorage map (discussion-reply-flags.ts,
  // since deleted) because the mutator that would set them here had no path
  // back through useDiscussionReplies.ts's pinned UseDiscussionRepliesReturn
  // at the time that file was written - that blocker is gone, and the fields
  // are promoted here following this file's own five-optional-field idiom
  // (resources/resourceState/resourceError/threadPosition/replyingToAuthor
  // above). See useReplyRows.ts's own migration effect for how a returning
  // user's side-channel marks are folded onto these fields exactly once, and
  // mergeLegacyReplyFlags below for the pure merge rule it uses.
  handledAt?: number; // ms epoch of the last successful "Copy reply" (or a manual mark) - D1
  skipped?: boolean; // "no reply needed" - D9. Reversible; never implies removeRow.
  // docs/reply-resource-concepts-acceptance-criteria.md RC3: PERSISTED,
  // absent-stays-absent like every optional field above. `concepts` are the
  // one-to-three noun phrases the drafting model named for THIS generated
  // reply (set by applyReply, cleared by a hand edit); `resourceQuery` is the
  // exact text the LAST resource search sent and `resourceQuerySource`
  // which base it came from - the row must be able to say whether its
  // links were found with the terms it is showing, and a log built from
  // live rows can only report what the row carries.
  concepts?: string[];
  resourceQuery?: string;
  resourceQuerySource?: "concepts" | "post" | "post-reply";
  // docs/reply-resource-search-yield-acceptance-criteria.md Y9: describes the
  // LAST search, exactly like resourceQuery/resourceQuerySource above - set
  // when that search's result had no resources, cleared the moment a search
  // DOES return resources. PERSISTED, absent-stays-absent. A hand edit that
  // clears `concepts` (editReply, useReplyRows.ts) does NOT touch this field.
  resourceSearchOutcome?: ResourceSearchOutcome;
  // docs/post-questions-acceptance-criteria.md Q6: the questions the post
  // asks or implies, each with an answer (or a "needs you" note) - a THIRD
  // per-row output, set by applyReply exactly like `concepts` above (a
  // three-way switch: undefined leave / [] clear / array replace).
  // PERSISTED, absent-stays-absent like every optional field above.
  // Deliberately NOT cleared by editReply (see that function's own comment)
  // - questions describe the POST, which a reply edit does not change, and
  // Insert IS an editReply call, so clearing here would make inserting one
  // answer delete the row's other questions.
  questions?: PostQuestion[];
}

const VALID_RESOURCE_QUERY_SOURCES: ReadonlySet<string> = new Set(["concepts", "post", "post-reply"]);
const VALID_RESOURCE_SEARCH_OUTCOME_KINDS: ReadonlySet<string> = new Set([
  "failed",
  "no-sources",
  "no-candidates",
  "all-dropped",
  "unknown",
]);
const RESOURCE_SEARCH_COUNT_FIELDS = [
  "sources",
  "resolvedSources",
  "candidates",
  "droppedPlaceholder",
  "droppedUncorroborated",
  "droppedDuplicate",
  "droppedUnreachable",
  "kept",
] as const;

/** Y9: shape-only coercion of a persisted `resourceSearchOutcome.counts`
 *  object - `retried` must be a boolean or the whole counts object (and
 *  therefore the outcome) is dropped. A numeric field that IS present must be
 *  a finite number, or the same drop applies - but a field that is ABSENT
 *  entirely (a row persisted before that field existed - `droppedDuplicate`,
 *  added after `droppedUnreachable` etc. were already shipping) coerces to 0
 *  rather than dropping the outcome, so an old row keeps deserializing after
 *  a new count field is added. Never throws. */
function coerceResourceSearchCounts(raw: unknown): ResourceSearchCounts | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  const counts = {} as Record<(typeof RESOURCE_SEARCH_COUNT_FIELDS)[number], number>;
  for (const field of RESOURCE_SEARCH_COUNT_FIELDS) {
    const v = c[field];
    if (v === undefined) {
      counts[field] = 0;
      continue;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    counts[field] = v;
  }
  if (typeof c.retried !== "boolean") return undefined;
  return { ...counts, retried: c.retried };
}

/** Y9: shape-only coercion of a persisted `resourceSearchOutcome` - a
 *  malformed value (wrong kind, missing/empty text, malformed counts) is
 *  dropped entirely (`undefined`), never thrown on, mirroring every other
 *  optional-field coercion in this file. */
function coerceResourceSearchOutcome(raw: unknown): ResourceSearchOutcome | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.kind !== "string" || !VALID_RESOURCE_SEARCH_OUTCOME_KINDS.has(o.kind)) return undefined;
  if (typeof o.text !== "string" || !o.text) return undefined;
  const counts = coerceResourceSearchCounts(o.counts);
  if (!counts) return undefined;
  return { kind: o.kind as ResourceSearchOutcomeKind, text: o.text, counts };
}

// F7 fix (fixer pass, docs/reply-resource-concepts-acceptance-criteria.md
// RC4/RC7): the "; " joiner used to be a literal repeated in three places -
// useReplyResources.ts's `resourceQueryForRow` (building the search text
// FROM `row.concepts`), discussion-replies-log.ts's CSV row (rendering
// `concepts.join(...)`) and DiscussionReplyResources.tsx's `showStaleQuery`
// predicate (a COMPARISON against `resourceQuery`, not a rendering). Because
// the third use is a comparison, not output, a silent drift between the
// three literals would not fail loudly - it would just make the stale-query
// line permanently true (the joined text would never equal `resourceQuery`
// again) or permanently false. One export, one owner, imported everywhere it
// is used - this file already owns `concepts`' own type and coercion, so it
// owns the one string that joins them too.
export const CONCEPT_JOINER = "; ";

/** RC3: shape-only coercion for a persisted `concepts` value - an array's
 *  non-empty strings are kept; anything else, and an empty result (including
 *  a persisted `[]`), is `undefined`. RC2's length and count rules are
 *  applied when the model's answer is parsed, never re-applied on read. */
export function coerceConcepts(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const kept = raw.filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim());
  return kept.length > 0 ? kept : undefined;
}

// ---------------------------------------------------------------------------
// docs/post-questions-acceptance-criteria.md Q6: `questions` - PERSISTED,
// absent-stays-absent like `concepts` above.
// ---------------------------------------------------------------------------

/** Q6: shape-only coercion for a persisted `questions` value - never
 *  re-applies Q3's `MAX_POST_QUESTIONS`/`MAX_QUESTION_CHARS`/`MAX_ANSWER_CHARS`
 *  caps (those are the MODEL-OUTPUT parser's job, applied once, at parse
 *  time; a value already sitting in localStorage has already been through
 *  that gate once and is re-validated here only for SHAPE). Drops an entry
 *  whose `question` is not a non-empty string, or that violates the Q1
 *  invariant (`answer !== "" || (needsYou !== undefined && needsYou !== "")`)
 *  - an item satisfying neither is not a usable question/answer pair.
 *  `implied` coerces to `=== true` exactly (never Q3's lenient string/kind
 *  aliasing - that leniency belongs to the model-output parser, not a
 *  persisted value this app itself wrote). `needsYou` is kept only as a
 *  non-empty string - an empty string is treated the same as absent, never
 *  round-tripped as `""`. Dedupes on `postQuestionKey` (first kept) so
 *  identity is unique by construction on both entry paths (a freshly
 *  drafted reply via `applyReply`, and a persisted table read back through
 *  `deserializeReplyTable`). An empty result -> `undefined`, never `[]`. */
export function coercePostQuestions(raw: unknown): PostQuestion[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: PostQuestion[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    // VERIFIER FINDING 6: `.trim()` before the non-empty test - "   " is
    // truthy, so a whitespace-only persisted question used to survive and
    // render as a blank item title with an unreadable accessible name
    // ("Remove the question "   " from the reply to X"). Q6 says an entry
    // whose question is not a NON-EMPTY string is dropped; this is what
    // makes that true. The model path was always safe (parsePostQuestions
    // collapses and trims first) - this is the persisted/hand-edited path.
    const question = typeof e.question === "string" ? e.question.trim() : "";
    if (!question) continue;
    const answer = typeof e.answer === "string" ? e.answer : "";
    const needsYou = typeof e.needsYou === "string" && e.needsYou.length > 0 ? e.needsYou : undefined;
    // Q1 invariant: an item with an empty answer AND no needsYou is neither
    // a student-facing answer nor an instructor-facing gap - drop it.
    if (answer === "" && needsYou === undefined) continue;
    const implied = e.implied === true;
    const key = postQuestionKey(question);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(needsYou !== undefined ? { question, implied, answer, needsYou } : { question, implied, answer });
  }
  return out.length > 0 ? out : undefined;
}

/** Q6: the pure row transform `removeQuestion` (useReplyRows.ts) applies -
 *  filters out EVERY item whose `question` equals `question` exactly,
 *  clearing the field to `undefined` when the list empties. Idempotent: a
 *  second call with the same `question` (now absent) returns a row with the
 *  same VALUE (not necessarily the same reference) as the first call's
 *  result - see this function's own test for the idempotence proof.
 *  Extracted here, rather than left inline inside the useCallback body in
 *  useReplyRows.ts, for the same reason the resource mutators' own
 *  `nextRowAfter*` transforms were pulled into
 *  useReplyRowResourceMutators.ts: a comparison/transform buried inside a
 *  useCallback body has no test surface in this repo's node-env vitest (see
 *  useReplyRows.ts's own file header). Never mutates `row`. */
export function nextRowAfterRemoveQuestion(row: ReplyRow, question: string): ReplyRow {
  const remaining = (row.questions ?? []).filter((q) => q.question !== question);
  return { ...row, questions: remaining.length > 0 ? remaining : undefined };
}

// ---------------------------------------------------------------------------
// AC22: serialization. `deserializeReplyTable` must NEVER throw, following
// `coerceMessageDraftPayload`'s discipline (src/lib/message-drafts.ts:54):
// drop what is malformed rather than fail the whole load.
// ---------------------------------------------------------------------------

export const DISCUSSION_TABLE_VERSION = 1;

const VALID_STATES = new Set<string>(["pending", "drafting", "ready", "failed"]);
const VALID_RESOURCE_STATES = new Set<string>(["idle", "searching", "done", "failed"]);
// VALID_THREAD_POSITIONS is imported from ./discussion-thread (FIX 2).

export function serializeReplyTable(rows: ReadonlyArray<ReplyRow>): string {
  const normalized = rows.map((r) => {
    // Nothing is in flight after a reload, so a `drafting` row is written as
    // `pending`. `error` is preserved only for `failed` rows - BL4: this must
    // actually enforce the `ReplyRow` invariant ("error is set only when
    // state === 'failed'") rather than merely documenting it, so a stale
    // `error` string left on a row that was later re-drafted successfully
    // does not resurrect itself as a mystery message after a reload.
    const state: ReplyRowState = r.state === "drafting" ? "pending" : r.state;

    // R3c: the same rule extended to the resource state machine. Nothing is
    // in flight after a reload, so `searching` is written as `idle`.
    // `resourceError` is preserved only for `failed` rows, for the same
    // reason `error` above is - a stale message must not resurrect itself
    // after the row's resources are later replaced successfully. A row that
    // has never touched the resource feature at all (`resourceState` still
    // `undefined`) writes no `resourceState`/`resourceError` keys, mirroring
    // `postedAt`'s existing "absent stays absent" treatment of an optional
    // field elsewhere in this same function - a row's resource fields do not
    // spring into existence just because it went through a save/load cycle.
    const resourceState: ReplyRow["resourceState"] = r.resourceState === "searching" ? "idle" : r.resourceState;
    const hasResources = Array.isArray(r.resources) && r.resources.length > 0;
    // Q6: same "only when non-empty" idiom as `resources` above.
    const hasQuestions = Array.isArray(r.questions) && r.questions.length > 0;

    return {
      ...r,
      state,
      error: state === "failed" ? r.error : null,
      resources: hasResources ? r.resources : undefined, // JSON.stringify drops undefined keys - R3c "only when non-empty"
      resourceState,
      resourceError: resourceState === "failed" ? (r.resourceError ?? null) : resourceState === undefined ? undefined : null,
      questions: hasQuestions ? r.questions : undefined,
    };
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

      const resources = coerceReplyResources(r.resources);

      // R3c/R3d: `resourceState` falls back to "idle" on anything OUTSIDE the
      // four-member set - but a row whose raw JSON never had the key at all
      // (r.resourceState === undefined) is the "never touched the resource
      // feature" case, not "searched and produced an invalid value", and
      // must stay `undefined` so it round-trips identically to a row that
      // predates this feature entirely (mirrors `postedAt`'s own
      // absent-stays-absent treatment above).
      let resourceState: ReplyRow["resourceState"];
      if (r.resourceState === undefined) {
        resourceState = undefined;
      } else {
        const resourceStateRaw = typeof r.resourceState === "string" ? r.resourceState : "";
        resourceState = VALID_RESOURCE_STATES.has(resourceStateRaw) ? (resourceStateRaw as NonNullable<ReplyRow["resourceState"]>) : "idle";
      }
      const resourceError: ReplyRow["resourceError"] =
        resourceState === undefined ? undefined : resourceState === "failed" && typeof r.resourceError === "string" ? r.resourceError : null;

      // T2b: `threadPosition` follows the identical R3c-i discipline as
      // `resourceState` above - a key ABSENT from the raw JSON (a row from
      // before this feature, or a row whose extraction never touched thread
      // fields) stays `undefined`, not coerced to `"unknown"`. Only a key
      // that is PRESENT and outside the three-member set falls back - and
      // the fallback here is `undefined` rather than a default member,
      // because `undefined` and `"unknown"` already render identically
      // (T1a), so there is no meaningful default to fall back TO.
      let threadPosition: ReplyRow["threadPosition"];
      if (r.threadPosition === undefined) {
        threadPosition = undefined;
      } else {
        const threadPositionRaw = typeof r.threadPosition === "string" ? r.threadPosition : "";
        threadPosition = VALID_THREAD_POSITIONS.has(threadPositionRaw) ? (threadPositionRaw as NonNullable<ReplyRow["threadPosition"]>) : undefined;
      }
      const replyingToAuthor = typeof r.replyingToAuthor === "string" && r.replyingToAuthor ? r.replyingToAuthor : undefined;

      // D1/D9: same absent-stays-absent discipline as threadPosition above -
      // a key ABSENT from the raw JSON (a row from before this feature)
      // stays undefined, never coerced to a default. A key PRESENT but
      // invalid (a non-finite handledAt, a skipped value other than the
      // literal `true`) also falls back to undefined rather than a sentinel -
      // there is no meaningful "unset but touched" state for either field,
      // unlike resourceState's "idle" fallback.
      const handledAt = typeof r.handledAt === "number" && Number.isFinite(r.handledAt) ? r.handledAt : undefined;
      const skipped = r.skipped === true ? true : undefined;

      // RC3: the three resource-search provenance fields, same
      // absent-stays-absent discipline; a present-but-invalid value falls
      // back to undefined rather than a sentinel.
      const concepts = coerceConcepts(r.concepts);
      const resourceQuery = typeof r.resourceQuery === "string" && r.resourceQuery ? r.resourceQuery : undefined;
      const resourceQuerySource =
        typeof r.resourceQuerySource === "string" && VALID_RESOURCE_QUERY_SOURCES.has(r.resourceQuerySource)
          ? (r.resourceQuerySource as NonNullable<ReplyRow["resourceQuerySource"]>)
          : undefined;

      // Y9: same absent-stays-absent discipline - a key ABSENT from the raw
      // JSON stays undefined; a key PRESENT but malformed also falls back to
      // undefined (dropped), never a sentinel or a throw.
      const resourceSearchOutcome = coerceResourceSearchOutcome(r.resourceSearchOutcome);

      // Q6: same absent-stays-absent discipline as concepts above - a
      // present-but-invalid value falls back to undefined (dropped), never
      // thrown on.
      const questions = coercePostQuestions(r.questions);

      rows.push({
        id,
        author,
        post,
        postedAt,
        reply,
        userEdited,
        state,
        error,
        firstSeenAt,
        order,
        resources,
        resourceState,
        resourceError,
        threadPosition,
        replyingToAuthor,
        handledAt,
        skipped,
        concepts,
        resourceQuery,
        resourceQuerySource,
        resourceSearchOutcome,
        questions,
      });
    });

    return rows;
  } catch {
    return [];
  }
}

// R3c: defensive coercion of a persisted `resources` array. Never throws -
// follows deserializeReplyTable's own discipline. A non-array yields
// `undefined` (not `[]`) so a row that legitimately has never had resources
// stays distinguishable from a row an instructor emptied out (which
// serializeReplyTable also normalizes to an absent key, not `[]` - see R3d).
// An entry whose `title` or `url` is not a non-empty string is dropped
// entirely; `url` is NOT re-sanitized here - it already cleared
// `sanitizeResourceUrl` before it was written by the gathering pass.
function coerceReplyResources(raw: unknown): ReplyResource[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ReplyResource[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const title = typeof e.title === "string" ? e.title : "";
    const url = typeof e.url === "string" ? e.url : "";
    if (!title || !url) continue;
    const kind = coerceResourceKind(e.kind);
    const note = typeof e.note === "string" && e.note ? e.note : undefined;
    out.push(note !== undefined ? { title, url, kind, note } : { title, url, kind });
  }
  return out;
}

// ---------------------------------------------------------------------------
// D1/D9 migration: fold the retired side-channel (discussion-reply-flags.ts's
// own `ta-rec-disc-flags` localStorage key, deleted) onto the newly-promoted
// ReplyRow fields above. Pure and never throws - the same discipline
// deserializeReplyTable applies to the table's own persisted JSON - so
// useReplyRows.ts's one-time migration effect can call it directly against
// whatever `window.localStorage.getItem("ta-rec-disc-flags")` returns without
// its own try/catch.
// ---------------------------------------------------------------------------

/**
 * Merges a legacy `{ handledAt: Record<id, number>, skipped: Record<id, true> }`
 * blob (the exact shape discussion-reply-flags.ts's own `ReplyFlagsState`
 * used to serialize) onto `rows` by id. A legacy entry whose id has no
 * matching row is silently dropped - the side channel's own pruning already
 * discarded those on read, so this preserves that behaviour rather than
 * resurrecting a flag for a row that no longer exists. A row that ALREADY
 * carries `handledAt`/`skipped` (should never happen in practice - this
 * migration is meant to run exactly once, before either field could have
 * been set any other way - but defended against anyway) is left alone rather
 * than overwritten, so a second, stray invocation can never clobber a value
 * the user set through the real UI in between.
 *
 * Returns the SAME array reference when nothing was actually merged (`raw`
 * is null, unparsable, structurally empty, or every id it names is already
 * either absent from `rows` or already set) - useReplyRows.ts's migration
 * effect uses that to decide whether the table even needs re-persisting.
 */
export function mergeLegacyReplyFlags(rows: ReadonlyArray<ReplyRow>, raw: string | null): ReplyRow[] {
  if (!raw) return rows as ReplyRow[];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return rows as ReplyRow[];
  }
  if (!parsed || typeof parsed !== "object") return rows as ReplyRow[];
  const obj = parsed as Record<string, unknown>;
  const legacyHandledAt = obj.handledAt && typeof obj.handledAt === "object" ? (obj.handledAt as Record<string, unknown>) : {};
  const legacySkipped = obj.skipped && typeof obj.skipped === "object" ? (obj.skipped as Record<string, unknown>) : {};

  let changed = false;
  const next = rows.map((r) => {
    let row = r;
    if (row.handledAt === undefined) {
      const v = legacyHandledAt[r.id];
      if (typeof v === "number" && Number.isFinite(v)) {
        row = { ...row, handledAt: v };
        changed = true;
      }
    }
    if (row.skipped === undefined) {
      const v = legacySkipped[r.id];
      if (v === true) {
        row = { ...row, skipped: true };
        changed = true;
      }
    }
    return row;
  });

  return changed ? next : (rows as ReplyRow[]);
}
