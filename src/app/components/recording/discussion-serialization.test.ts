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
import {
  DISCUSSION_TABLE_VERSION,
  serializeReplyTable,
  deserializeReplyTable,
  mergeLegacyReplyFlags,
  coercePostQuestions,
  nextRowAfterRemoveQuestion,
  type ReplyRow,
} from "./discussion-serialization";
import type { PostQuestion } from "@/lib/discussion-reply-prompt";

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
// D1/D9: handledAt/skipped - promoted from a side-channel localStorage map
// (discussion-reply-flags.ts, deleted) onto real ReplyRow fields.
// ---------------------------------------------------------------------------

describe("handledAt/skipped (D1/D9)", () => {
  it("round-trips handledAt and skipped when present", () => {
    const rows = [makeRow({ id: "a", handledAt: 5000, skipped: true })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].handledAt).toBe(5000);
    expect(restored[0].skipped).toBe(true);
  });

  it("a row that never had handledAt/skipped round-trips with both still absent (absent-stays-absent)", () => {
    const rows = [makeRow({ id: "a" })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].handledAt).toBeUndefined();
    expect(restored[0].skipped).toBeUndefined();
    // JSON.stringify drops the undefined-valued keys entirely, mirroring
    // resources/resourceState's own "absent stays absent" treatment.
    expect(JSON.parse(serializeReplyTable(rows)).rows[0]).not.toHaveProperty("handledAt");
    expect(JSON.parse(serializeReplyTable(rows)).rows[0]).not.toHaveProperty("skipped");
  });

  it("drops a non-finite persisted handledAt and a non-true persisted skipped, falling back to absent rather than a default", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", handledAt: "not a number", skipped: "yes" }],
    });
    const restored = deserializeReplyTable(raw);
    expect(restored[0].handledAt).toBeUndefined();
    expect(restored[0].skipped).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// docs/reply-resource-concepts-acceptance-criteria.md RC3: concepts /
// resourceQuery / resourceQuerySource - the same absent-stays-absent
// discipline as handledAt/skipped above.
// ---------------------------------------------------------------------------

describe("concepts / resourceQuery / resourceQuerySource (RC3)", () => {
  it("round-trips all three fields when present", () => {
    const rows = [
      makeRow({
        id: "a",
        concepts: ["utilitarianism", "moral luck"],
        resourceQuery: "utilitarianism; moral luck",
        resourceQuerySource: "concepts",
      }),
    ];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].concepts).toEqual(["utilitarianism", "moral luck"]);
    expect(restored[0].resourceQuery).toBe("utilitarianism; moral luck");
    expect(restored[0].resourceQuerySource).toBe("concepts");
  });

  it("a row that never had any of the three round-trips with all three still absent (absent-stays-absent)", () => {
    const rows = [makeRow({ id: "a" })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].concepts).toBeUndefined();
    expect(restored[0].resourceQuery).toBeUndefined();
    expect(restored[0].resourceQuerySource).toBeUndefined();
    // JSON.stringify drops the undefined-valued keys entirely, mirroring
    // handledAt/skipped's own "absent stays absent" treatment.
    const written = JSON.parse(serializeReplyTable(rows)).rows[0];
    expect(written).not.toHaveProperty("concepts");
    expect(written).not.toHaveProperty("resourceQuery");
    expect(written).not.toHaveProperty("resourceQuerySource");
  });

  it("a persisted empty concepts array, and an invalid resourceQuerySource, both coerce to absent rather than a default", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [
        {
          id: "a",
          author: "Maria",
          post: "hello",
          concepts: [],
          resourceQuery: "some query",
          resourceQuerySource: "not-a-real-source",
        },
      ],
    });
    const restored = deserializeReplyTable(raw);
    expect(restored[0].concepts).toBeUndefined();
    expect(restored[0].resourceQuerySource).toBeUndefined();
    // resourceQuery itself is a plain non-empty string, unaffected by the
    // other two fields' validity - it stays.
    expect(restored[0].resourceQuery).toBe("some query");
  });
});

// ---------------------------------------------------------------------------
// docs/reply-resource-search-yield-acceptance-criteria.md Y9:
// resourceSearchOutcome - same absent-stays-absent discipline as
// concepts/resourceQuery/resourceQuerySource above.
// ---------------------------------------------------------------------------

describe("resourceSearchOutcome (Y9)", () => {
  const OUTCOME: NonNullable<ReplyRow["resourceSearchOutcome"]> = {
    kind: "no-sources",
    text: "No web pages were searched this time. Search for resources again - it usually works.",
    counts: {
      sources: 0,
      resolvedSources: 0,
      candidates: 0,
      droppedPlaceholder: 0,
      droppedUncorroborated: 0,
      droppedDuplicate: 0,
      droppedUnreachable: 0,
      kept: 0,
      retried: false,
    },
  };

  it("round-trips when present", () => {
    const rows = [makeRow({ id: "a", resourceState: "done", resourceSearchOutcome: OUTCOME })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].resourceSearchOutcome).toEqual(OUTCOME);
  });

  it("a row that never had it round-trips with it still absent (absent-stays-absent)", () => {
    const rows = [makeRow({ id: "a" })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].resourceSearchOutcome).toBeUndefined();
    const written = JSON.parse(serializeReplyTable(rows)).rows[0];
    expect(written).not.toHaveProperty("resourceSearchOutcome");
  });

  it("a malformed value (unrecognized kind) is dropped, never thrown on", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [
        {
          id: "a",
          author: "Maria",
          post: "hello",
          resourceSearchOutcome: { kind: "not-a-real-kind", text: "some text", counts: OUTCOME.counts },
        },
      ],
    });
    expect(() => deserializeReplyTable(raw)).not.toThrow();
    expect(deserializeReplyTable(raw)[0].resourceSearchOutcome).toBeUndefined();
  });

  it("a malformed value (empty text) is dropped", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", resourceSearchOutcome: { kind: "unknown", text: "", counts: OUTCOME.counts } }],
    });
    expect(deserializeReplyTable(raw)[0].resourceSearchOutcome).toBeUndefined();
  });

  it("a malformed value (a counts field missing/non-finite, or retried not a boolean) is dropped", () => {
    const badCounts = { ...OUTCOME.counts, kept: "not-a-number" };
    const raw1 = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", resourceSearchOutcome: { kind: "unknown", text: "x", counts: badCounts } }],
    });
    expect(deserializeReplyTable(raw1)[0].resourceSearchOutcome).toBeUndefined();

    const missingRetried = { ...OUTCOME.counts } as Record<string, unknown>;
    delete missingRetried.retried;
    const raw2 = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", resourceSearchOutcome: { kind: "unknown", text: "x", counts: missingRetried } }],
    });
    expect(deserializeReplyTable(raw2)[0].resourceSearchOutcome).toBeUndefined();
  });

  it("a non-object value is dropped, never thrown on", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", resourceSearchOutcome: "not an object" }],
    });
    expect(() => deserializeReplyTable(raw)).not.toThrow();
    expect(deserializeReplyTable(raw)[0].resourceSearchOutcome).toBeUndefined();
  });

  it("regression fix: a row persisted before droppedDuplicate existed (the key is entirely absent from counts) still deserializes, with droppedDuplicate coerced to 0 rather than the whole outcome dropped", () => {
    const preDroppedDuplicateCounts = { ...OUTCOME.counts } as Record<string, unknown>;
    delete preDroppedDuplicateCounts.droppedDuplicate;
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [
        {
          id: "a",
          author: "Maria",
          post: "hello",
          resourceSearchOutcome: { kind: "no-sources", text: OUTCOME.text, counts: preDroppedDuplicateCounts },
        },
      ],
    });
    const restored = deserializeReplyTable(raw);
    expect(restored[0].resourceSearchOutcome).toEqual(OUTCOME);
    expect(restored[0].resourceSearchOutcome?.counts.droppedDuplicate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// docs/post-questions-acceptance-criteria.md Q6: questions - PERSISTED,
// absent-stays-absent like concepts/resources above. coercePostQuestions is
// shape-only (never re-applies Q3's caps) and dedupes on postQuestionKey.
// ---------------------------------------------------------------------------

describe("questions (Q6)", () => {
  const QA: PostQuestion = {
    question: "Why does the loop run twice?",
    implied: false,
    answer: "Because the outer loop iterates twice before the inner loop finishes.",
  };
  const QB: PostQuestion = {
    question: "What is the due date?",
    implied: true,
    answer: "",
    needsYou: "The actual due date for this assignment.",
  };

  it("round-trips a non-empty questions array", () => {
    const rows = [makeRow({ id: "a", questions: [QA, QB] })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].questions).toEqual([QA, QB]);
  });

  it("a row that never had questions round-trips with the field still absent (absent-stays-absent)", () => {
    const rows = [makeRow({ id: "a" })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].questions).toBeUndefined();
    expect(JSON.parse(serializeReplyTable(rows)).rows[0]).not.toHaveProperty("questions");
  });

  it("serializes an emptied questions array as an absent key, mirroring resources' own R3d rule", () => {
    const rows = [makeRow({ id: "a", questions: [] })];
    const written = JSON.parse(serializeReplyTable(rows)).rows[0];
    expect(written).not.toHaveProperty("questions");
  });

  describe("coercePostQuestions", () => {
    // VERIFIER FINDING 6: "   " is truthy, so a whitespace-only question used
    // to survive this coercer and render as a blank item title with an
    // unreadable accessible name. Q6 drops an entry whose question is not a
    // NON-EMPTY string; this is the pin for that.
    it("drops an entry whose question is whitespace only, not merely empty", () => {
      const raw: unknown = [
        { question: "   ", implied: false, answer: "An answer that would otherwise render under a blank title." },
        { question: "\n\t ", implied: false, answer: "Same." },
      ];
      expect(coercePostQuestions(raw)).toBeUndefined();
    });

    it("trims a padded question rather than storing the padding", () => {
      const raw: unknown = [{ question: "  Why does it run twice?  ", implied: false, answer: "Because." }];
      expect(coercePostQuestions(raw)).toEqual([
        { question: "Why does it run twice?", implied: false, answer: "Because." },
      ]);
    });

    it("keeps a well-formed entry, coercing a non-boolean-true implied value to false", () => {
      // A persisted string "true" is not the boolean `true` - Q3's lenient
      // string/kind aliasing ("implicit", a `kind`/`type` key, etc.) is the
      // MODEL-OUTPUT PARSER's job (Group A, leaf), never re-applied here:
      // this coercer only re-validates the SHAPE of a value this app itself
      // already wrote.
      const raw: unknown = [{ question: "Why?", implied: "true", answer: "Because." }];
      expect(coercePostQuestions(raw)).toEqual([{ question: "Why?", implied: false, answer: "Because." }]);
    });

    it("implied: false round-trips exactly", () => {
      const raw: unknown = [{ question: "Why?", implied: false, answer: "Because." }];
      expect(coercePostQuestions(raw)).toEqual([{ question: "Why?", implied: false, answer: "Because." }]);
    });

    it("needsYou absent stays absent (key omitted, never an empty string)", () => {
      const raw: unknown = [{ question: "Why?", implied: false, answer: "Because." }];
      const result = coercePostQuestions(raw);
      expect(result).toHaveLength(1);
      expect(result![0]).not.toHaveProperty("needsYou");
    });

    it("needsYou: '' is treated the same as absent - dropped, never kept as an empty string", () => {
      const raw: unknown = [{ question: "Why?", implied: false, answer: "Because.", needsYou: "" }];
      const result = coercePostQuestions(raw);
      expect(result).toHaveLength(1);
      expect(result![0]).not.toHaveProperty("needsYou");
    });

    it("dedupes on postQuestionKey, keeping the first - SABOTAGE CHECK: a quoted/punctuated variant of an already-kept question is still dropped, not just an exact string repeat", () => {
      const raw: unknown = [
        { question: "Why does the loop run twice?", implied: false, answer: "First answer." },
        { question: '"Why does the loop run twice?"', implied: true, answer: "Second answer, dropped." },
      ];
      const result = coercePostQuestions(raw);
      expect(result).toHaveLength(1);
      expect(result![0].answer).toBe("First answer.");
      expect(result![0].implied).toBe(false);
    });

    it("drops an item violating the Q1 invariant (answer === '' and no needsYou) - SABOTAGE CHECK", () => {
      const raw: unknown = [{ question: "Why?", implied: false, answer: "" }];
      expect(coercePostQuestions(raw)).toBeUndefined();
    });

    it("keeps an item with an empty answer as long as needsYou is set", () => {
      const raw: unknown = [{ question: "What is the policy?", implied: false, answer: "", needsYou: "The late policy." }];
      expect(coercePostQuestions(raw)).toEqual([
        { question: "What is the policy?", implied: false, answer: "", needsYou: "The late policy." },
      ]);
    });

    it("drops an entry whose question is not a non-empty string, keeping the rest", () => {
      const raw: unknown = [
        { question: "", implied: false, answer: "x" },
        { question: 5, implied: false, answer: "x" },
        { question: "Kept?", implied: false, answer: "Kept answer." },
      ];
      expect(coercePostQuestions(raw)).toEqual([{ question: "Kept?", implied: false, answer: "Kept answer." }]);
    });

    it("a non-array input yields undefined, never throws", () => {
      expect(coercePostQuestions("not an array")).toBeUndefined();
      expect(coercePostQuestions(null)).toBeUndefined();
      expect(coercePostQuestions(undefined)).toBeUndefined();
      expect(coercePostQuestions({})).toBeUndefined();
    });

    it("an empty result (every entry dropped) yields undefined, never []", () => {
      expect(coercePostQuestions([{ question: "", implied: false, answer: "" }])).toBeUndefined();
      expect(coercePostQuestions([])).toBeUndefined();
    });

    it("never re-applies Q3's caps - a long question/answer survives uncapped", () => {
      const longQuestion = "x".repeat(500);
      const longAnswer = "y".repeat(2000);
      const result = coercePostQuestions([{ question: longQuestion, implied: false, answer: longAnswer }]);
      expect(result![0].question).toHaveLength(500);
      expect(result![0].answer).toHaveLength(2000);
    });

    it("a non-object entry (a string, a number, an array) is dropped, never thrown on", () => {
      const raw: unknown = ["a string", 5, ["nested", "array"], { question: "Real one", implied: false, answer: "x" }];
      expect(coercePostQuestions(raw)).toEqual([{ question: "Real one", implied: false, answer: "x" }]);
    });
  });

  describe("nextRowAfterRemoveQuestion", () => {
    it("removes every item whose question equals the argument exactly", () => {
      const row = makeRow({ id: "a", questions: [QA, QB] });
      const next = nextRowAfterRemoveQuestion(row, QA.question);
      expect(next.questions).toEqual([QB]);
    });

    it("clears the field to undefined when the list empties", () => {
      const row = makeRow({ id: "a", questions: [QA] });
      const next = nextRowAfterRemoveQuestion(row, QA.question);
      expect(next.questions).toBeUndefined();
    });

    it("IDEMPOTENCE: a second call with the same question (now absent) yields the same value as calling it once more never changes anything further", () => {
      const row = makeRow({ id: "a", questions: [QA, QB] });
      const once = nextRowAfterRemoveQuestion(row, QA.question);
      const twice = nextRowAfterRemoveQuestion(once, QA.question);
      expect(twice.questions).toEqual([QB]);
      expect(twice).toEqual(once);
    });

    it("a no-op removal (question not present) leaves the row's questions unchanged in VALUE", () => {
      const row = makeRow({ id: "a", questions: [QA] });
      const next = nextRowAfterRemoveQuestion(row, "Not a real question in this row.");
      expect(next.questions).toEqual([QA]);
    });

    it("does not mutate the input row (returns a new object)", () => {
      const row = makeRow({ id: "a", questions: [QA, QB] });
      const frozenQuestions = row.questions;
      nextRowAfterRemoveQuestion(row, QA.question);
      expect(row.questions).toBe(frozenQuestions);
      expect(row.questions).toEqual([QA, QB]);
    });

    // VERIFIER FINDING 7: this was titled "is scoped by row only", which it
    // could never have proven - `nextRowAfterRemoveQuestion` takes exactly
    // ONE row and cannot reach a second by construction, so it passed no
    // matter what the real id-scoped mutator did. Retitled to the property
    // it actually establishes. The real row scoping lives in
    // useReplyRows.ts's `removeQuestion` (`raw.findIndex(r => r.id === id)`)
    // and is covered there, against the mutator that actually does it.
    it("returns a NEW row and never mutates the one it was given - two rows built from the same question object stay independent", () => {
      const rowA = makeRow({ id: "a", questions: [QA] });
      const rowB = makeRow({ id: "b", questions: [QA] });
      const nextA = nextRowAfterRemoveQuestion(rowA, QA.question);
      expect(nextA).not.toBe(rowA);
      expect(nextA.questions).toBeUndefined();
      expect(rowA.questions).toEqual([QA]);
      expect(rowB.questions).toEqual([QA]);
    });
  });
});

// ---------------------------------------------------------------------------
// mergeLegacyReplyFlags (D1/D9 migration): folding the retired side-channel
// onto the promoted fields, once, on load.
// ---------------------------------------------------------------------------

describe("mergeLegacyReplyFlags (D1/D9 migration)", () => {
  it("merges matching legacy handledAt/skipped entries onto rows by id - sabotage target", () => {
    const rows = [makeRow({ id: "a" }), makeRow({ id: "b" })];
    const legacy = JSON.stringify({ handledAt: { a: 1234 }, skipped: { b: true } });
    const merged = mergeLegacyReplyFlags(rows, legacy);
    expect(merged.find((r) => r.id === "a")?.handledAt).toBe(1234);
    expect(merged.find((r) => r.id === "b")?.skipped).toBe(true);
  });

  it("drops a legacy flag whose row no longer exists", () => {
    const rows = [makeRow({ id: "a" })];
    const legacy = JSON.stringify({ handledAt: { "gone-row": 999 }, skipped: { "another-gone-row": true } });
    const merged = mergeLegacyReplyFlags(rows, legacy);
    expect(merged).toEqual(rows);
  });

  it("returns the SAME array reference when there is nothing to merge", () => {
    const rows = [makeRow({ id: "a" })];
    expect(mergeLegacyReplyFlags(rows, null)).toBe(rows);
    expect(mergeLegacyReplyFlags(rows, "{}")).toBe(rows);
    expect(mergeLegacyReplyFlags(rows, JSON.stringify({ handledAt: {}, skipped: {} }))).toBe(rows);
  });

  it("never throws on malformed legacy JSON, and returns the input unchanged", () => {
    const rows = [makeRow({ id: "a" })];
    expect(() => mergeLegacyReplyFlags(rows, "{not json")).not.toThrow();
    expect(mergeLegacyReplyFlags(rows, "{not json")).toBe(rows);
    expect(mergeLegacyReplyFlags(rows, '"a string"')).toBe(rows);
    expect(mergeLegacyReplyFlags(rows, "42")).toBe(rows);
  });

  it("does not overwrite a row that already has handledAt/skipped set", () => {
    const rows = [makeRow({ id: "a", handledAt: 1, skipped: true })];
    const legacy = JSON.stringify({ handledAt: { a: 999 }, skipped: { a: false } });
    const merged = mergeLegacyReplyFlags(rows, legacy);
    expect(merged[0].handledAt).toBe(1);
    expect(merged[0].skipped).toBe(true);
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
