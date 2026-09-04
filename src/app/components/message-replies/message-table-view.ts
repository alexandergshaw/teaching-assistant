// Message replies (Manual > Recording > Message replies) - the status-chip
// filter family. docs/message-replies-acceptance-criteria.md M18 (section 7),
// section 9.
//
// A DELIBERATE, SEPARATE six-member union from the discussion tool's own
// five-member `ReplyStatusFilter` (src/app/components/recording/
// discussion-table-view.ts) - section 0 of the acceptance criteria is
// explicit that the discussion status-filter family is "neither imported nor
// copied - M18 defines its own" (the vocabulary genuinely differs: this
// table has no "uncopied" concept, and gains "Not sent yet" and "Answered",
// neither of which the discussion tool has any notion of).
//
// Pure, React-free, DOM-free, same discipline as discussion-table-view.ts
// (see that file's own header, and discussion-capture.ts's): vitest here is
// node-env and renders nothing.
//
// `MessageThreadRow` is imported as a TYPE ONLY (`import type`):
// message-serialization.ts is a sibling leaf owned by a concurrent
// implementer and may not exist yet when this file's own tests run - a
// type-only import is erased by esbuild before vitest tries to resolve the
// module.

import type { MessageThreadRow } from "./message-serialization";

/** M18's closed six-member union, replacing the discussion tool's own
 * five-member `ReplyStatusFilter` on this table. */
export type MessageStatusFilter = "all" | "needs-draft" | "failed" | "edited" | "not-sent" | "answered";

export const MESSAGE_STATUS_FILTERS: ReadonlyArray<MessageStatusFilter> = ["all", "needs-draft", "failed", "edited", "not-sent", "answered"];

export const MESSAGE_STATUS_FILTER_LABELS: Record<MessageStatusFilter, string> = {
  all: "All",
  "needs-draft": "Needs a draft",
  failed: "Failed",
  edited: "Edited by you",
  "not-sent": "Not sent yet",
  answered: "Answered",
};

export function isMessageStatusFilter(value: unknown): value is MessageStatusFilter {
  return typeof value === "string" && (MESSAGE_STATUS_FILTERS as readonly string[]).includes(value);
}

/**
 * M18's five real predicates plus "all". Each reads a field the row already
 * carries (M6) - unlike the discussion table's `ReplyStatusFilterRow`, this
 * table has no side-channel `handledAt`/`skipped` maps to thread through,
 * since `MessageThreadRow` carries `skipped` on the row itself and this
 * feature has no "uncopied" chip that would need a copy-time map at all.
 *
 * "Not sent yet" is M18's own explicit formula, verbatim:
 * `!!row.reply && !row.sent`. The other four read the literal field their
 * name names - `needs-draft` off `state === "pending"`, `failed` off
 * `state === "failed"`, `edited` off `userEdited`, `answered` off
 * `row.answered` - M18 gives no further exclusion (e.g. no "a skipped row
 * never matches a specific chip" carry-over from the discussion tool's own
 * D9 rule): these are independent tallies about a fact of the row, not
 * mutually-exclusive triage buckets, and a `skipped` row keeps whatever
 * facts are still true of it (its state, whether it was edited, whether it
 * was ever sent) rather than being hidden from every specific chip the way
 * the discussion tool's own "opted out of the workflow" rule hides it.
 */
export function threadMatchesStatusFilter(row: MessageThreadRow, filter: MessageStatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "needs-draft":
      return row.state === "pending";
    case "failed":
      return row.state === "failed";
    case "edited":
      return row.userEdited;
    case "not-sent":
      return !!row.reply && !row.sent;
    case "answered":
      return row.answered;
    default: {
      const exhaustive: never = filter;
      throw new Error(`Unhandled message status filter: ${String(exhaustive)}`);
    }
  }
}

/** By-reference discipline for "all", matching `filterRowsByStatus`'s own
 * F9-derived rule (discussion-table-view.ts): no allocation, and a
 * downstream memoized row list sees the identical array reference when
 * nothing is being narrowed. */
export function filterThreadsByStatus(rows: ReadonlyArray<MessageThreadRow>, filter: MessageStatusFilter): MessageThreadRow[] {
  if (filter === "all") return rows as MessageThreadRow[];
  return rows.filter((row) => threadMatchesStatusFilter(row, filter));
}

/** Chip counts, computed over the caller's array as given - the panel is
 * expected to pass the UNFILTERED table (`rawRows`), the same whole-table
 * discipline `computeReplyStatusCounts` documents on its own (F0-2/F11 in
 * docs/discussion-reply-sort-filter-acceptance-criteria.md): a chip count
 * must not silently shrink because the search box also happens to be
 * narrowing the table at the same moment. */
export function computeMessageStatusCounts(rows: ReadonlyArray<MessageThreadRow>): Record<MessageStatusFilter, number> {
  const counts = {} as Record<MessageStatusFilter, number>;
  for (const filter of MESSAGE_STATUS_FILTERS) {
    let count = 0;
    for (const row of rows) {
      if (threadMatchesStatusFilter(row, filter)) count += 1;
    }
    counts[filter] = count;
  }
  return counts;
}
