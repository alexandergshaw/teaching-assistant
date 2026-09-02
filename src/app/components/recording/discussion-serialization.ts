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

    return {
      ...r,
      state,
      error: state === "failed" ? r.error : null,
      resources: hasResources ? r.resources : undefined, // JSON.stringify drops undefined keys - R3c "only when non-empty"
      resourceState,
      resourceError: resourceState === "failed" ? (r.resourceError ?? null) : resourceState === undefined ? undefined : null,
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
