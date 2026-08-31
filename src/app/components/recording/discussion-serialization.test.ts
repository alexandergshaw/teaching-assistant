// Unit tests for discussion-serialization.ts - the persisted row shape and
// serializeReplyTable / deserializeReplyTable (AC22).
//
// The "AC22: serializeReplyTable / deserializeReplyTable" describe block
// below was moved here, unchanged, from discussion-capture.rows.test.ts's
// own AC22 block (that file now covers only mergeCapturedPosts,
// sortReplyRows and swapAdjacentRows, which stayed in discussion-capture.ts)
// as part of the serialization-block extraction REGRESSION 372's Limits
// prescribed. `makeRow` is duplicated from that file's own helper rather
// than imported, per this repo's rule against importing from another
// *.test.ts file (that re-runs its describe blocks in the importing file).
//
// The "frozen serialization oracle" block below is new: a hand-written
// literal of the exact string serializeReplyTable produces for a
// representative table, captured from the UNMOVED discussion-capture.ts
// before this extraction touched anything, and asserted identical after the
// move. Round-trip tests alone (serialize then deserialize back to the
// input) cannot prove the move was behaviour-preserving, because a
// round-trip through two consistently-wrong functions still round-trips -
// only a literal captured from the pre-move implementation can.
//
// Imports come directly from ./discussion-serialization, not the
// discussion-capture.ts re-export, so this file exercises the new leaf
// itself rather than only its re-exported surface.

import { describe, it, expect } from "vitest";
import { DISCUSSION_TABLE_VERSION, serializeReplyTable, deserializeReplyTable, type ReplyRow } from "./discussion-serialization";

function makeRow(overrides: Partial<ReplyRow>): ReplyRow {
  return {
    id: "disc-1-0",
    author: "Maria Alvarez",
    post:
      "I really appreciated how the reading connected utilitarian calculus to the trolley problem, but I " +
      "think it glosses over how hard it is to actually quantify happiness across different people in " +
      "practice, which feels like the weakest link in the argument.",
    reply: "",
    userEdited: false,
    state: "pending",
    error: null,
    firstSeenAt: 1000,
    order: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AC22: serializeReplyTable / deserializeReplyTable
// ---------------------------------------------------------------------------

describe("serializeReplyTable / deserializeReplyTable (AC22)", () => {
  it("round-trips a well-formed table", () => {
    const rows = [makeRow({ id: "a", postedAt: "Mar 12 at 9:04 PM" }), makeRow({ id: "b", state: "ready", reply: "Great point!" })];
    const raw = serializeReplyTable(rows);
    const restored = deserializeReplyTable(raw);
    expect(restored).toEqual(rows);
  });

  it("normalizes a drafting row to pending on write, since nothing is in flight after a reload", () => {
    const rows = [makeRow({ id: "a", state: "drafting" })];
    const raw = serializeReplyTable(rows);
    const restored = deserializeReplyTable(raw);
    expect(restored[0].state).toBe("pending");
  });

  it("preserves the error reason for a failed row", () => {
    const rows = [makeRow({ id: "a", state: "failed", error: "Reading the screen failed: 429" })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].state).toBe("failed");
    expect(restored[0].error).toBe("Reading the screen failed: 429");
  });

  it("preserves userEdited across the round trip", () => {
    const rows = [makeRow({ id: "a", userEdited: true })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].userEdited).toBe(true);
  });

  it("BL4: nulls a stale `error` on a non-failed row, enforcing the ReplyRow invariant (error set only when state === 'failed') even against a row that should never occur but is defended against anyway", () => {
    // Checks serializeReplyTable's OWN raw output, not the round trip
    // through deserializeReplyTable - deserializeReplyTable enforces this
    // same invariant independently on read, which would mask a regression
    // in serializeReplyTable's write-side enforcement if this test only
    // checked the round trip.
    const rows = [makeRow({ id: "a", state: "ready", error: "stale error from a previous failure" })];
    const raw = JSON.parse(serializeReplyTable(rows)) as { rows: Array<{ error: string | null }> };
    expect(raw.rows[0].error).toBeNull();
  });

  it.each([null, "", "not json at all {{{", "[]", '{"v":1}', '{"v":1,"rows":"not-an-array"}', '{"v":99,"rows":[]}'])(
    "never throws on garbage input %j, and returns an empty array",
    (garbage) => {
      expect(() => deserializeReplyTable(garbage)).not.toThrow();
      expect(deserializeReplyTable(garbage)).toEqual([]);
    }
  );

  it("drops an individual malformed row (no usable id) but keeps the rest", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "keep-me", author: "Maria", post: "hello" }, { author: "No Id Here", post: "dropped" }, null, "not an object"],
    });
    const restored = deserializeReplyTable(raw);
    expect(restored.map((r) => r.id)).toEqual(["keep-me"]);
  });

  it("defaults missing order to the array index, missing firstSeenAt to 0, missing userEdited to false, and an unknown state to pending", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello" }, { id: "b", author: "Diego", post: "world", state: "not-a-real-state" }],
    });
    const restored = deserializeReplyTable(raw);
    expect(restored[0]).toMatchObject({ order: 0, firstSeenAt: 0, userEdited: false, state: "pending" });
    expect(restored[1]).toMatchObject({ order: 1, state: "pending" });
  });

  it("SABOTAGE CHECK (d): documents that a throwing deserializeReplyTable would fail the garbage-input tests above", () => {
    // Every garbage fixture in the it.each block above is exactly what a
    // deserializeReplyTable that does `JSON.parse(raw)` with no try/catch
    // (or that skips the typeof/Array.isArray guards) would throw on.
    // Verified by sabotage - see the extraction report.
    expect(deserializeReplyTable("{ this is not valid json")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Frozen serialization oracle - proves the discussion-capture.ts ->
// discussion-serialization.ts move was behaviour-preserving. The expected
// string was captured by running serializeReplyTable against these exact
// four rows BEFORE the move (against the original, unmoved
// discussion-capture.ts), then pasted here as a hand-written literal. It
// covers: a two-paragraph reply containing "\n\n"; a row with
// threadPosition/replyingToAuthor set; a row with resources; and a row with
// none of the above (the plain default shape).
// ---------------------------------------------------------------------------

describe("frozen serialization oracle (extraction proof)", () => {
  const oracleRows: ReplyRow[] = [
    {
      id: "disc-1-0",
      author: "Maria Alvarez",
      post: "Do you think the trolley problem framing oversimplifies real ethical dilemmas?",
      postedAt: "Mar 12 at 9:04 PM",
      reply:
        "Great question. I think the framing is useful as a starting point.\n\nThat said, real dilemmas rarely offer such clean binary choices, so I'd treat it as a teaching tool rather than a literal model.",
      userEdited: true,
      state: "ready",
      error: null,
      firstSeenAt: 1000,
      order: 0,
    },
    {
      id: "disc-1-1",
      author: "Diego Chen",
      post: "I agree with Maria's point about complexity.",
      reply: "",
      userEdited: false,
      state: "pending",
      error: null,
      firstSeenAt: 2000,
      order: 1,
      threadPosition: "reply",
      replyingToAuthor: "Maria Alvarez",
    },
    {
      id: "disc-1-2",
      author: "Priya Nair",
      post: "Here's a helpful article about consequentialism.",
      reply: "Thanks for sharing this.",
      userEdited: false,
      state: "ready",
      error: null,
      firstSeenAt: 3000,
      order: 2,
      resources: [{ title: "Consequentialism Overview", url: "https://example.com/consequentialism", kind: "doc" }],
      resourceState: "done",
      resourceError: null,
    },
    {
      id: "disc-1-3",
      author: "Sam Lee",
      post: "No strong opinion either way.",
      reply: "",
      userEdited: false,
      state: "pending",
      error: null,
      firstSeenAt: 4000,
      order: 3,
    },
  ];

  // Captured verbatim, before the move, from the ORIGINAL discussion-capture.ts.
  const FROZEN_OUTPUT =
    '{"v":1,"rows":[{"id":"disc-1-0","author":"Maria Alvarez","post":"Do you think the trolley problem framing oversimplifies real ethical dilemmas?","postedAt":"Mar 12 at 9:04 PM","reply":"Great question. I think the framing is useful as a starting point.\\n\\nThat said, real dilemmas rarely offer such clean binary choices, so I\'d treat it as a teaching tool rather than a literal model.","userEdited":true,"state":"ready","error":null,"firstSeenAt":1000,"order":0},{"id":"disc-1-1","author":"Diego Chen","post":"I agree with Maria\'s point about complexity.","reply":"","userEdited":false,"state":"pending","error":null,"firstSeenAt":2000,"order":1,"threadPosition":"reply","replyingToAuthor":"Maria Alvarez"},{"id":"disc-1-2","author":"Priya Nair","post":"Here\'s a helpful article about consequentialism.","reply":"Thanks for sharing this.","userEdited":false,"state":"ready","error":null,"firstSeenAt":3000,"order":2,"resources":[{"title":"Consequentialism Overview","url":"https://example.com/consequentialism","kind":"doc"}],"resourceState":"done","resourceError":null},{"id":"disc-1-3","author":"Sam Lee","post":"No strong opinion either way.","reply":"","userEdited":false,"state":"pending","error":null,"firstSeenAt":4000,"order":3}]}';

  it("matches the frozen pre-move literal byte-for-byte", () => {
    expect(serializeReplyTable(oracleRows)).toBe(FROZEN_OUTPUT);
  });

  it("still round-trips the same representative table through deserializeReplyTable", () => {
    expect(deserializeReplyTable(serializeReplyTable(oracleRows))).toEqual(oracleRows);
  });
});
