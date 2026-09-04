// Message replies (Manual > Recording > Message replies) - this feature's own
// leaf: the copies docs/message-replies-acceptance-criteria.md section 0
// orders that have no other home. Pure, React-free, DOM-free - the same
// discipline discussion-capture.ts and message-thread.ts document on their
// own headers: vitest in this repo is node-env and renders nothing, so every
// behaviour that needs a unit test lives in a leaf like this one, never in a
// hook.
//
// Section 9 fixes this file's export surface: MessageSort, sortMessageRows,
// swapAdjacentThreads, messageClipboardText, draftingArmSignature,
// readLocalStorage, writeLocalStorage, coerceMessageComposition
// (`tableClipboardText`/`LOOP_IDLE_POLL_MS`, also named there, turned out to
// have no consumer anywhere in this feature - the table has no "copy all"
// control and the wake-ticker cadence is read straight off
// useDiscussionLoopWake's own import chain, never this file's copy - so
// both were deleted rather than ship dead exports with their own dead
// test coverage). Every one of these is a COPY,
// re-typed for MessageThreadRow/MessageCompositionSettings, of a discussion
// sibling named in section 0 - never a back-import of the discussion
// original, which would tie this feature's own row shape to a union
// (ReplyIngredient, discussion's five-member ReplyStatusFilter) this feature
// deliberately does not share (section 0's own words: "the discussion
// status-filter family is neither imported nor copied").
//
// Import direction: this file imports the row-FREE discussion helpers it
// reuses (compareNameKey) and the message-typed row shape
// from the sibling leaves message-thread.ts/message-serialization.ts owns -
// never the reverse. `MessageThreadRow` is imported as a TYPE ONLY: those
// sibling leaves are separate modules, and this file's own tests must not
// depend on them (they must not depend on landing
// order) and a type-only import is erased by esbuild before vitest tries to
// resolve the module.

import { compareNameKey } from "../recording/discussion-table-view";
import { deriveReplyAuthorName } from "@/lib/person-name";
import type { MessageThreadRow } from "./message-serialization";
import { sortThreads } from "./message-thread";
import type {
  MessageCompositionSettings,
  MessageIngredient,
} from "@/lib/message-reply-prompt";
import { MESSAGE_INGREDIENTS, DEFAULT_MESSAGE_INGREDIENTS } from "@/lib/message-reply-prompt";
import { REPLY_FORMALITY_STOPS, type ReplyFormality } from "@/lib/discussion-reply-prompt";

// ---------------------------------------------------------------------------
// M18: sorting. "Sort by clickable column headers with aria-sort (First,
// Last, Subject), no sort select." "captured" is the table's initial/default
// state before any header is ever clicked - it delegates to message-thread.ts's
// own `sortThreads` (M9's natural order: descending latest-incoming time),
// the same "do nothing surprising" judgment call discussion's own
// DEFAULT_SORT comment records for its "captured-asc". "custom" is what the
// hover-reveal reorder pair (M14) produces, sorting by the row's own `order`
// field - mirrors discussion's "custom" exactly.
// ---------------------------------------------------------------------------

export type MessageSort =
  | "captured"
  | "first-asc"
  | "first-desc"
  | "last-asc"
  | "last-desc"
  | "subject-asc"
  | "subject-desc"
  | "custom";

const FIRST_LAST_SORTS = new Set<MessageSort>(["first-asc", "first-desc", "last-asc", "last-desc"]);
const SUBJECT_SORTS = new Set<MessageSort>(["subject-asc", "subject-desc"]);

type NamePart = "first" | "last";

/** F3's own rule, retyped: the sort key reads straight off
 * `deriveReplyAuthorName(row.student)`, never through a display convention -
 * an unknown surname ("" from deriveReplyAuthorName) is what `compareNameKey`
 * treats as blank-last. */
function studentNameSortKey(row: MessageThreadRow, part: NamePart): string {
  const name = deriveReplyAuthorName(row.student);
  return part === "first" ? name.firstName : name.lastName;
}

/**
 * The single entry point a consumer should call for any `MessageSort` value.
 * Delegates to `sortThreads` (message-thread.ts) for "captured" and to plain
 * `order` ascending for "custom" - never reimplementing either. For the four
 * name sorts and the two subject sorts, derives the key and applies
 * `compareNameKey` (discussion-table-view.ts, reused as-is - both a blank
 * surname and a blank/`"(no subject)"` subject sort last in either
 * direction), tie-breaking equal keys on `firstSeenAt` ascending so a
 * re-render never reshuffles rows that compare equal (mirrors F5).
 *
 * Preserves row object identity: `Array.prototype.sort` reorders references
 * in place and this function never spreads or rebuilds a `MessageThreadRow`.
 */
export function sortMessageRows(rows: ReadonlyArray<MessageThreadRow>, sort: MessageSort): MessageThreadRow[] {
  if (sort === "captured") return sortThreads(rows);
  if (sort === "custom") return rows.slice().sort((a, b) => a.order - b.order);

  if (SUBJECT_SORTS.has(sort)) {
    const direction: "asc" | "desc" = sort === "subject-asc" ? "asc" : "desc";
    return rows.slice().sort((a, b) => {
      const primary = compareNameKey(a.subject, b.subject, direction);
      if (primary !== 0) return primary;
      return a.firstSeenAt - b.firstSeenAt;
    });
  }

  if (FIRST_LAST_SORTS.has(sort)) {
    const part: NamePart = sort === "first-asc" || sort === "first-desc" ? "first" : "last";
    const direction: "asc" | "desc" = sort.endsWith("asc") ? "asc" : "desc";
    return rows.slice().sort((a, b) => {
      const primary = compareNameKey(studentNameSortKey(a, part), studentNameSortKey(b, part), direction);
      if (primary !== 0) return primary;
      return a.firstSeenAt - b.firstSeenAt;
    });
  }

  // Exhaustiveness is enforced by the union above; an unrecognised value
  // (should be unreachable given MessageSort's closed type) falls back to
  // the natural order rather than throwing.
  return sortThreads(rows);
}

// ---------------------------------------------------------------------------
// M14: the hover-reveal reorder pair - the shared adjacent-thread-swap
// helper, retyped from discussion-capture.ts's `swapAdjacentRows`/
// `MoveRowResult`.
// ---------------------------------------------------------------------------

export interface MoveThreadResult {
  rows: MessageThreadRow[];
  sort: MessageSort;
  /** True when the move was a no-op because the row was already at the
   * boundary - the caller announces "Already first."/"Already last." and
   * leaves everything else unchanged. */
  atBoundary: boolean;
}

/** Rewrites every row's `order` to its current displayed index FIRST when
 * leaving a non-custom sort - a row whose order already equals its index
 * keeps its object identity - then exchanges `idA`'s and `idB`'s `order`
 * values and reports `sort: "custom"`. Mirrors `swapAdjacentRows`
 * (discussion-capture.ts) exactly, retyped for `MessageThreadRow`/
 * `MessageSort`. */
export function swapAdjacentThreads(
  displayedRows: ReadonlyArray<MessageThreadRow>,
  currentSort: MessageSort,
  idA: string,
  idB: string
): MoveThreadResult {
  const base: MessageThreadRow[] =
    currentSort === "custom" ? displayedRows.slice() : displayedRows.map((row, i) => (row.order === i ? row : { ...row, order: i }));

  const indexA = base.findIndex((r) => r.id === idA);
  const indexB = base.findIndex((r) => r.id === idB);
  if (indexA === -1 || indexB === -1) {
    // Defensive: an id not present in displayedRows would be a caller bug,
    // not a real boundary - no-op rather than corrupt the table.
    return { rows: displayedRows.slice(), sort: currentSort, atBoundary: false };
  }

  const nextRows = base.slice();
  const rowA = nextRows[indexA];
  const rowB = nextRows[indexB];
  nextRows[indexA] = { ...rowB, order: rowA.order };
  nextRows[indexB] = { ...rowA, order: rowB.order };

  return { rows: nextRows, sort: "custom", atBoundary: false };
}

// ---------------------------------------------------------------------------
// M14: "Copy reply" (per-row) / a table-level copy - retyped from
// `replyClipboardText`/`tableClipboardText` (discussion-capture.ts). Message
// rows have no resource lane (section 0: "drop the resource lane ... while
// copying"), so the per-row text is simply the reply body - already carrying
// its applied sign-off (M11's own "Copy, Save as draft and Send are
// byte-identical" rule), never re-derived here.
// ---------------------------------------------------------------------------

export function messageClipboardText(row: { reply: string }): string {
  return row.reply;
}

// ---------------------------------------------------------------------------
// REGRESSION 258's class, retyped for this feature's own drafting inputs -
// see `draftingArmSignature` (discussion-capture.ts) for the full account of
// why every drafting input an armed bulk action actually dispatches with must
// join this signature, or changing one after arming silently redispatches
// under settings the instructor never re-confirmed. This feature has no
// `audience` (M10: message replies are always the same private, one-to-one
// register) and adds `skipAnswered` (M12's own drafting input, with no
// discussion analogue).
// ---------------------------------------------------------------------------

export interface MessageDraftingArmSignatureArgs {
  rowCount: number;
  courseId: string;
  ingredients: readonly string[];
  addressByName: boolean;
  formality: string;
  skipAnswered: boolean;
}

/** Every field is a drafting input a bulk-dispatch action actually reads.
 * Varying any one field in isolation changes the output - the property that
 * would have caught REGRESSION 258's shipped defect (an omitted field), not
 * just a wrong separator. */
export function draftingArmSignature(args: MessageDraftingArmSignatureArgs): string {
  return `${args.rowCount}|${args.courseId}|${args.ingredients.join(",")}|${args.addressByName}|${args.formality}|${args.skipAnswered}`;
}

// ---------------------------------------------------------------------------
// The two localStorage helpers, retyped (in name only - the implementations
// are generic) from discussion-draft-loop.ts. Copied rather than imported so
// this feature's own leaf never reaches back into a sibling feature's file
// for machinery that carries no discussion-specific type. (The wake-ticker
// cadence itself, LOOP_IDLE_POLL_MS, is not copied here - useDiscussionLoopWake
// is imported as-is per section 0 and carries its own, so a second constant
// here would be dead weight.)
// ---------------------------------------------------------------------------

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
    // Non-fatal here, mirrors discussion-draft-loop.ts's own three small
    // controls - a quota failure on one of these only means "the control
    // doesn't survive a reload," not data loss (the table's own persistence,
    // in useMessageRows.ts, has its own dedicated persistError surface).
  }
}

// ---------------------------------------------------------------------------
// M10/C5a's own coercion, retyped for MESSAGE_INGREDIENTS/
// MessageCompositionSettings. Never throws: a malformed JSON blob, a
// non-array value, an ingredient outside the enum, a duplicate ingredient and
// an unrecognised formality/address-by-name value each fall back to a sane
// value rather than reaching the prompt builder. Zero ingredients selected is
// legal (M10: "Zero selected is legal") and is NOT replaced with the default
// - only a genuinely unparseable or non-array blob falls back to
// `DEFAULT_MESSAGE_INGREDIENTS`.
// ---------------------------------------------------------------------------

export function coerceMessageComposition(
  rawIngredients: string | null,
  rawAddressByName: string | null,
  rawFormality: string | null
): MessageCompositionSettings {
  let ingredients: readonly MessageIngredient[] = DEFAULT_MESSAGE_INGREDIENTS;
  if (rawIngredients !== null) {
    try {
      const parsed: unknown = JSON.parse(rawIngredients);
      if (Array.isArray(parsed)) {
        const seen = new Set<MessageIngredient>();
        for (const v of parsed) {
          if (typeof v === "string" && (MESSAGE_INGREDIENTS as readonly string[]).includes(v)) {
            seen.add(v as MessageIngredient);
          }
        }
        ingredients = Array.from(seen);
      }
      // Array.isArray(parsed) false - a non-array blob - falls through with
      // `ingredients` left at the default set above.
    } catch {
      // Malformed JSON - fall back to the default, never throw.
    }
  }

  // Default ON - only an explicit "0" turns it off; every other value
  // (null, garbage, "false") falls back to the default rather than silently
  // becoming OFF.
  const addressByName = rawAddressByName === "0" ? false : true;

  const formality: ReplyFormality =
    rawFormality !== null && (REPLY_FORMALITY_STOPS as readonly string[]).includes(rawFormality)
      ? (rawFormality as ReplyFormality)
      : "balanced";

  return { ingredients, addressByName, formality };
}
