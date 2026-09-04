// Unit tests for message-table-view.ts (M18, docs/message-replies-
// acceptance-criteria.md section 7 and 9).
//
// This file imports no helper from any sibling *.test.ts - duplicates its
// own fixture, per this repo's own "no cross-test-file imports" rule.

import { describe, it, expect } from "vitest";
import {
  MESSAGE_STATUS_FILTERS,
  MESSAGE_STATUS_FILTER_LABELS,
  isMessageStatusFilter,
  threadMatchesStatusFilter,
  computeMessageStatusCounts,
  filterThreadsByStatus,
  type MessageStatusFilter,
} from "./message-table-view";
import type { MessageThreadRow } from "./message-serialization";

function makeRow(overrides: Partial<MessageThreadRow> & { id: string }): MessageThreadRow {
  return {
    subject: "Question about homework 3",
    student: "Ana Ruiz",
    messages: [],
    omittedMessages: 0,
    answered: false,
    reply: "",
    state: "pending",
    userEdited: false,
    firstSeenAt: 0,
    order: 0,
    ...overrides,
  };
}

describe("MESSAGE_STATUS_FILTERS / MESSAGE_STATUS_FILTER_LABELS (M18)", () => {
  it("is exactly the closed six-member set, in this order", () => {
    expect(MESSAGE_STATUS_FILTERS).toEqual(["all", "needs-draft", "failed", "edited", "not-sent", "answered"]);
  });

  it("carries a label for every member, matching the frozen chip wording", () => {
    expect(MESSAGE_STATUS_FILTER_LABELS).toEqual({
      all: "All",
      "needs-draft": "Needs a draft",
      failed: "Failed",
      edited: "Edited by you",
      "not-sent": "Not sent yet",
      answered: "Answered",
    });
  });

  it("has exactly one label per filter - the two are the same size", () => {
    expect(Object.keys(MESSAGE_STATUS_FILTER_LABELS).sort()).toEqual([...MESSAGE_STATUS_FILTERS].sort());
  });
});

describe("isMessageStatusFilter (M18)", () => {
  it("accepts every member of the six-value set", () => {
    for (const v of MESSAGE_STATUS_FILTERS) {
      expect(isMessageStatusFilter(v)).toBe(true);
    }
  });

  it("rejects the discussion tool's own five-member vocabulary - this is a SEPARATE union, not a superset", () => {
    expect(isMessageStatusFilter("uncopied")).toBe(false);
  });

  it("rejects anything outside the set, including non-strings", () => {
    expect(isMessageStatusFilter("bogus")).toBe(false);
    expect(isMessageStatusFilter(null)).toBe(false);
    expect(isMessageStatusFilter(undefined)).toBe(false);
    expect(isMessageStatusFilter(3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// threadMatchesStatusFilter - every chip.
// ---------------------------------------------------------------------------

describe("threadMatchesStatusFilter (M18) - every chip", () => {
  it("'all' matches every row unconditionally", () => {
    expect(threadMatchesStatusFilter(makeRow({ id: "r1" }), "all")).toBe(true);
    expect(threadMatchesStatusFilter(makeRow({ id: "r2", state: "failed" }), "all")).toBe(true);
    expect(threadMatchesStatusFilter(makeRow({ id: "r3", skipped: true }), "all")).toBe(true);
  });

  it("'needs-draft' matches only a pending row", () => {
    expect(threadMatchesStatusFilter(makeRow({ id: "r1", state: "pending" }), "needs-draft")).toBe(true);
    expect(threadMatchesStatusFilter(makeRow({ id: "r2", state: "drafting" }), "needs-draft")).toBe(false);
    expect(threadMatchesStatusFilter(makeRow({ id: "r3", state: "ready" }), "needs-draft")).toBe(false);
    expect(threadMatchesStatusFilter(makeRow({ id: "r4", state: "failed" }), "needs-draft")).toBe(false);
  });

  it("'failed' matches only a failed row", () => {
    expect(threadMatchesStatusFilter(makeRow({ id: "r1", state: "failed" }), "failed")).toBe(true);
    expect(threadMatchesStatusFilter(makeRow({ id: "r2", state: "ready" }), "failed")).toBe(false);
  });

  it("'edited' matches only a userEdited row", () => {
    expect(threadMatchesStatusFilter(makeRow({ id: "r1", userEdited: true }), "edited")).toBe(true);
    expect(threadMatchesStatusFilter(makeRow({ id: "r2", userEdited: false }), "edited")).toBe(false);
  });

  it("'not-sent' matches M18's own frozen formula: !!row.reply && !row.sent", () => {
    expect(threadMatchesStatusFilter(makeRow({ id: "r1", reply: "Thanks for asking!" }), "not-sent")).toBe(true);
    expect(threadMatchesStatusFilter(makeRow({ id: "r2", reply: "" }), "not-sent")).toBe(false);
    expect(
      threadMatchesStatusFilter(
        makeRow({ id: "r3", reply: "Thanks!", sent: { at: 1000, conversationId: 1, messageCount: 3 } }),
        "not-sent"
      )
    ).toBe(false);
  });

  it("'answered' matches only a row whose answered flag is true", () => {
    expect(threadMatchesStatusFilter(makeRow({ id: "r1", answered: true }), "answered")).toBe(true);
    expect(threadMatchesStatusFilter(makeRow({ id: "r2", answered: false }), "answered")).toBe(false);
  });

  it("a skipped row still matches specific chips on its own facts - unlike the discussion tool's D9 rule, skipping does not blank out every chip but 'all'", () => {
    const row = makeRow({ id: "r1", skipped: true, state: "failed", userEdited: true });
    expect(threadMatchesStatusFilter(row, "failed")).toBe(true);
    expect(threadMatchesStatusFilter(row, "edited")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filterThreadsByStatus - by-reference "all", narrowing otherwise.
// ---------------------------------------------------------------------------

describe("filterThreadsByStatus (M18)", () => {
  it("returns the SAME array reference for 'all'", () => {
    const rows = [makeRow({ id: "a" }), makeRow({ id: "b" })];
    expect(filterThreadsByStatus(rows, "all")).toBe(rows);
  });

  it("narrows to only the matching rows for a specific filter", () => {
    const rows = [
      makeRow({ id: "a", state: "pending" }),
      makeRow({ id: "b", state: "failed" }),
      makeRow({ id: "c", state: "ready" }),
    ];
    expect(filterThreadsByStatus(rows, "failed").map((r) => r.id)).toEqual(["b"]);
  });

  it("narrows to zero rows when nothing matches", () => {
    const rows = [makeRow({ id: "a", state: "ready" })];
    expect(filterThreadsByStatus(rows, "failed")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeMessageStatusCounts - counts over the array as given.
// ---------------------------------------------------------------------------

describe("computeMessageStatusCounts (M18)", () => {
  it("counts every bucket independently over the given array", () => {
    const rows: MessageThreadRow[] = [
      makeRow({ id: "a", state: "pending" }),
      makeRow({ id: "b", state: "failed" }),
      makeRow({ id: "c", state: "ready", userEdited: true, reply: "done", answered: true }),
      makeRow({ id: "d", state: "ready", reply: "not sent yet" }),
      makeRow({ id: "e", state: "ready", reply: "already sent", sent: { at: 1, conversationId: 1, messageCount: 1 } }),
    ];
    const counts = computeMessageStatusCounts(rows);
    expect(counts.all).toBe(5);
    expect(counts["needs-draft"]).toBe(1);
    expect(counts.failed).toBe(1);
    expect(counts.edited).toBe(1);
    expect(counts["not-sent"]).toBe(2); // c and d have a reply and no sent
    expect(counts.answered).toBe(1);
  });

  it("returns all zeros but 'all' over an empty table", () => {
    expect(computeMessageStatusCounts([])).toEqual({
      all: 0,
      "needs-draft": 0,
      failed: 0,
      edited: 0,
      "not-sent": 0,
      answered: 0,
    });
  });

  it("SABOTAGE CHECK: a row can count toward more than one chip at once (independent tallies, not a partition) - fails if counts are made mutually exclusive", () => {
    const row = makeRow({ id: "a", state: "ready", userEdited: true, reply: "hi", answered: true });
    const counts = computeMessageStatusCounts([row]);
    expect(counts.edited).toBe(1);
    expect(counts["not-sent"]).toBe(1);
    expect(counts.answered).toBe(1);
  });
});

describe("MessageStatusFilter exhaustiveness (compile-time guard)", () => {
  it("threadMatchesStatusFilter throws only for a value outside the real union (unreachable at the type level, reachable only via a cast)", () => {
    const bogus = "bogus-filter" as unknown as MessageStatusFilter;
    const row = makeRow({ id: "r1" });
    expect(() => threadMatchesStatusFilter(row, bogus)).toThrow(/Unhandled message status filter/);
  });
});
