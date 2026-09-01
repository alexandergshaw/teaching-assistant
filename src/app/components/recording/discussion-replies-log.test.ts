import { describe, it, expect } from "vitest";
import {
  buildDiscussionRepliesLogRowEntry,
  buildDiscussionRepliesRunLog,
  makeDiscussionRepliesLogBatch,
  summarizeDiscussionRepliesRunLog,
  discussionRepliesLogSummaryLine,
  formatDiscussionRepliesLogCsv,
  formatDiscussionRepliesLogJson,
  discussionRepliesLogFileName,
  type DiscussionRepliesLogInput,
  type DiscussionRepliesRunLog,
} from "./discussion-replies-log";
import type { ReplyRow } from "./discussion-capture";

const AT = "2026-08-31T09:00:00.000Z";

function row(overrides: Partial<ReplyRow> & { id: string; author: string }): ReplyRow {
  return {
    post: "post text",
    reply: "",
    userEdited: false,
    state: "pending",
    error: null,
    firstSeenAt: 0,
    order: 0,
    ...overrides,
  };
}

function emptyInput(overrides: Partial<DiscussionRepliesLogInput> = {}): DiscussionRepliesLogInput {
  return {
    startedAt: "",
    endedAt: "",
    audience: "students",
    courseName: "",
    ingredients: [],
    addressByName: true,
    formality: "balanced",
    framesCaptured: 0,
    droppedFrames: 0,
    stalled: false,
    batches: [],
    notices: [],
    retries: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildDiscussionRepliesLogRowEntry - per-row mapping, including the
// resolveDraftParent recompute.
// ---------------------------------------------------------------------------

describe("buildDiscussionRepliesLogRowEntry", () => {
  it("maps absent optional fields to their documented empty values, never undefined", () => {
    const r = row({ id: "r1", author: "Diego Chen" });
    const entry = buildDiscussionRepliesLogRowEntry(r, [r], new Set());
    expect(entry).toEqual({
      rowId: "r1",
      author: "Diego Chen",
      threadPosition: "",
      replyingToAuthor: "",
      parentResolved: false,
      draftState: "pending",
      userEdited: false,
      retried: false,
      error: "",
      resourceState: "",
      resourceError: "",
    });
  });

  it("carries a verbatim error message through unchanged", () => {
    const r = row({ id: "r1", author: "A", state: "failed", error: "429 Too Many Requests from the model provider" });
    const entry = buildDiscussionRepliesLogRowEntry(r, [r], new Set());
    expect(entry.error).toBe("429 Too Many Requests from the model provider");
    expect(entry.draftState).toBe("failed");
  });

  it("marks a row retried only when its id is in the retried set", () => {
    const r = row({ id: "r1", author: "A" });
    expect(buildDiscussionRepliesLogRowEntry(r, [r], new Set(["r1"])).retried).toBe(true);
    expect(buildDiscussionRepliesLogRowEntry(r, [r], new Set(["other"])).retried).toBe(false);
  });

  it("resolves a parent exactly when resolveDraftParent's T6 gate does (exactly one author match)", () => {
    const parent = row({ id: "p1", author: "Diego Chen" });
    const child = row({ id: "c1", author: "Ana", threadPosition: "reply", replyingToAuthor: "Diego Chen" });
    const rows = [parent, child];
    const entry = buildDiscussionRepliesLogRowEntry(child, rows, new Set());
    expect(entry.parentResolved).toBe(true);
    expect(entry.threadPosition).toBe("reply");
    expect(entry.replyingToAuthor).toBe("Diego Chen");
  });

  it("does not resolve a parent when two rows share the replied-to author (ambiguous)", () => {
    const parentA = row({ id: "pA", author: "Diego Chen" });
    const parentB = row({ id: "pB", author: "Diego Chen" });
    const child = row({ id: "c1", author: "Ana", threadPosition: "reply", replyingToAuthor: "Diego Chen" });
    const entry = buildDiscussionRepliesLogRowEntry(child, [parentA, parentB, child], new Set());
    expect(entry.parentResolved).toBe(false);
  });

  it("does not resolve a parent for a root or unknown-position row even with a replyingToAuthor-shaped field absent", () => {
    const other = row({ id: "o1", author: "Diego Chen" });
    const r = row({ id: "r1", author: "Ana", threadPosition: "root" });
    const entry = buildDiscussionRepliesLogRowEntry(r, [other, r], new Set());
    expect(entry.parentResolved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildDiscussionRepliesRunLog - row ordering and retry-set derivation.
// ---------------------------------------------------------------------------

describe("buildDiscussionRepliesRunLog", () => {
  it("builds rows in rawRows order, never reordering", () => {
    const r1 = row({ id: "r1", author: "Bob" });
    const r2 = row({ id: "r2", author: "Ana" });
    const log = buildDiscussionRepliesRunLog(emptyInput(), [r1, r2]);
    expect(log.rows.map((r) => r.rowId)).toEqual(["r1", "r2"]);
  });

  it("derives the retried set from input.retries, not from any row field", () => {
    const r1 = row({ id: "r1", author: "Bob", state: "ready" });
    const log = buildDiscussionRepliesRunLog(emptyInput({ retries: [{ at: AT, rowId: "r1" }] }), [r1]);
    expect(log.rows[0].retried).toBe(true);
  });

  it("passes every DiscussionRepliesLogInput field through unchanged onto the run log", () => {
    const input = emptyInput({
      startedAt: AT,
      endedAt: "2026-08-31T09:05:00.000Z",
      audience: "peers",
      courseName: "CS 101",
      ingredients: ["compliment", "resources"],
      addressByName: false,
      formality: "formal",
      framesCaptured: 12,
      droppedFrames: 3,
      stalled: true,
    });
    const log = buildDiscussionRepliesRunLog(input, []);
    expect(log.startedAt).toBe(AT);
    expect(log.endedAt).toBe("2026-08-31T09:05:00.000Z");
    expect(log.audience).toBe("peers");
    expect(log.courseName).toBe("CS 101");
    expect(log.ingredients).toEqual(["compliment", "resources"]);
    expect(log.addressByName).toBe(false);
    expect(log.formality).toBe("formal");
    expect(log.framesCaptured).toBe(12);
    expect(log.droppedFrames).toBe(3);
    expect(log.stalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// makeDiscussionRepliesLogBatch - defaults and the derived postsDuplicate.
// ---------------------------------------------------------------------------

describe("makeDiscussionRepliesLogBatch", () => {
  it("defaults every optional field to its 'nothing happened' value", () => {
    expect(makeDiscussionRepliesLogBatch({ at: AT, framesInBatch: 4 })).toEqual({
      at: AT,
      framesInBatch: 4,
      postsExtracted: 0,
      postsAdded: 0,
      postsDuplicate: 0,
      capped: false,
      discarded: false,
      error: "",
    });
  });

  it("derives postsDuplicate as postsExtracted - postsAdded", () => {
    const b = makeDiscussionRepliesLogBatch({ at: AT, framesInBatch: 2, postsExtracted: 5, postsAdded: 3 });
    expect(b.postsDuplicate).toBe(2);
  });

  it("forces postsDuplicate to 0 for a discarded batch, even though its posts were never merged (postsAdded stays 0)", () => {
    // A discarded batch never reaches mergeIncoming (useDiscussionReplies.ts
    // drops the whole response before calling it once the table's epoch has
    // moved on), so postsAdded is always 0 for this branch. Without the
    // override, postsExtracted - 0 would count every thrown-away post as a
    // duplicate, which is not what happened to them.
    const b = makeDiscussionRepliesLogBatch({ at: AT, framesInBatch: 1, postsExtracted: 4, discarded: true });
    expect(b.postsAdded).toBe(0);
    expect(b.postsDuplicate).toBe(0);
    expect(b.postsExtracted).toBe(4);
    expect(b.discarded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// summarizeDiscussionRepliesRunLog - counts across multiple batches
// (including duplicates) and rows.
// ---------------------------------------------------------------------------

describe("summarizeDiscussionRepliesRunLog", () => {
  it("sums extracted/added/duplicate across multiple batches, and counts capped/discarded batches separately", () => {
    const log: DiscussionRepliesRunLog = buildDiscussionRepliesRunLog(
      emptyInput({
        batches: [
          makeDiscussionRepliesLogBatch({ at: AT, framesInBatch: 2, postsExtracted: 3, postsAdded: 3 }),
          // A batch that found 4 posts but 2 were duplicates of already-captured rows.
          makeDiscussionRepliesLogBatch({ at: AT, framesInBatch: 2, postsExtracted: 4, postsAdded: 2, capped: true }),
          // A batch that found 1 post but never reached the merge step - the
          // table's epoch bumped (Delete table / Redraft every reply) while
          // this batch's response was in flight, so its post was thrown
          // away, not compared against the table. It must land in the
          // discarded tally, never the duplicate tally (that was exactly the
          // bug: an inflated postsDuplicateTotal is the number an instructor
          // would use to judge whether extraction is working).
          makeDiscussionRepliesLogBatch({ at: AT, framesInBatch: 1, postsExtracted: 1, discarded: true }),
        ],
      }),
      []
    );
    const summary = summarizeDiscussionRepliesRunLog(log);
    expect(summary.batchesSent).toBe(3);
    expect(summary.postsExtractedTotal).toBe(8);
    expect(summary.postsAddedTotal).toBe(5);
    // 0 (batch 1: 3-3) + 2 (batch 2: 4-2) + 0 (batch 3: discarded, forced to
    // 0, NOT 1-0=1) = 2, not 3 - the discarded batch's post is excluded.
    expect(summary.postsDuplicateTotal).toBe(2);
    expect(summary.cappedBatches).toBe(1);
    expect(summary.discardedBatches).toBe(1);
    // The discarded batch's 1 extracted post lands here instead.
    expect(summary.postsDiscardedTotal).toBe(1);
  });

  it("counts every row into exactly one of the four draft-state buckets, summing to totalRows", () => {
    const rows: ReplyRow[] = [
      row({ id: "r1", author: "A", state: "pending" }),
      row({ id: "r2", author: "B", state: "drafting" }),
      row({ id: "r3", author: "C", state: "ready" }),
      row({ id: "r4", author: "D", state: "failed", error: "boom" }),
      row({ id: "r5", author: "E", state: "failed", error: "boom again" }),
    ];
    const log = buildDiscussionRepliesRunLog(emptyInput({ retries: [{ at: AT, rowId: "r4" }] }), rows);
    const summary = summarizeDiscussionRepliesRunLog(log);
    expect(summary.totalRows).toBe(5);
    expect(summary.neverDrafted).toBe(1);
    expect(summary.drafting).toBe(1);
    expect(summary.ready).toBe(1);
    expect(summary.failed).toBe(2);
    expect(summary.retriedRows).toBe(1);
    expect(summary.neverDrafted + summary.drafting + summary.ready + summary.failed).toBe(summary.totalRows);
  });

  it("summarizes an empty/never-started run as all zeros, not an error", () => {
    const log = buildDiscussionRepliesRunLog(emptyInput(), []);
    const summary = summarizeDiscussionRepliesRunLog(log);
    expect(summary).toEqual({
      totalRows: 0,
      neverDrafted: 0,
      drafting: 0,
      ready: 0,
      failed: 0,
      retriedRows: 0,
      batchesSent: 0,
      framesCaptured: 0,
      postsExtractedTotal: 0,
      postsAddedTotal: 0,
      postsDuplicateTotal: 0,
      cappedBatches: 0,
      discardedBatches: 0,
      postsDiscardedTotal: 0,
      noticeCount: 0,
      droppedFrames: 0,
    });
  });

  // SABOTAGE CHECK (documented in the implementer's report): the `switch` in
  // summarizeDiscussionRepliesRunLog was manually changed from an
  // exhaustive `never` check to a bare `default: neverDrafted += 1;` -
  // confirmed this test still passed (a "drafting" row silently miscounted
  // as never-drafted, exactly REGRESSION entry 370's S2 undercount class),
  // then reverted. The real guard is TypeScript's compile-time
  // exhaustiveness check on `ReplyRowState`, not this test - so a widened
  // `ReplyRowState` union with no matching branch here is a `tsc` error, not
  // a silent miscount. This test only pins the CURRENT four buckets sum to
  // `totalRows`, which is the property that failed silently during the
  // sabotage.
  it("(sabotage-checked) draft-state buckets are exhaustive over the real ReplyRowState union", () => {
    const rows: ReplyRow[] = [
      row({ id: "r1", author: "A", state: "pending" }),
      row({ id: "r2", author: "B", state: "drafting" }),
      row({ id: "r3", author: "C", state: "ready" }),
      row({ id: "r4", author: "D", state: "failed" }),
    ];
    const log = buildDiscussionRepliesRunLog(emptyInput(), rows);
    const summary = summarizeDiscussionRepliesRunLog(log);
    expect(summary.neverDrafted).toBe(1);
    expect(summary.drafting).toBe(1);
    expect(summary.ready).toBe(1);
    expect(summary.failed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// discussionRepliesLogSummaryLine - frozen literal oracle.
// ---------------------------------------------------------------------------

describe("discussionRepliesLogSummaryLine", () => {
  it("renders the exact frozen sentence, with correct singular/plural on every noun", () => {
    const log = buildDiscussionRepliesRunLog(
      emptyInput({
        batches: [makeDiscussionRepliesLogBatch({ at: AT, framesInBatch: 1, postsExtracted: 1, postsAdded: 1 })],
        notices: [{ at: AT, text: "one notice" }],
        retries: [{ at: AT, rowId: "r1" }],
      }),
      [row({ id: "r1", author: "A", state: "failed", error: "boom" })]
    );
    const summary = summarizeDiscussionRepliesRunLog(log);
    expect(discussionRepliesLogSummaryLine(summary)).toBe(
      "1 reply captured across 1 batch - 0 drafted, 1 failed, 0 never drafted, 1 retried, 1 notice."
    );
  });

  it("never gates on there being any rows - an empty run still gets a true, useful sentence", () => {
    const summary = summarizeDiscussionRepliesRunLog(buildDiscussionRepliesRunLog(emptyInput(), []));
    expect(discussionRepliesLogSummaryLine(summary)).toBe(
      "0 replies captured across 0 batches - 0 drafted, 0 failed, 0 never drafted, 0 retried, 0 notices."
    );
  });

  // A discarded batch is posts that WERE read off the screen and then thrown
  // away when the table was deleted or a redraft bumped the epoch. Nothing
  // else in the UI says that happened, so it is appended to this line - but
  // only when it happened, which is why the two frozen sentences above are
  // unchanged. Both plural forms are pinned: an off-by-one in the noun
  // agreement is the kind of thing that survives a reviewer's eye.
  it("appends the discarded-post clause, singular, when a batch was thrown away", () => {
    const log = buildDiscussionRepliesRunLog(
      emptyInput({
        batches: [makeDiscussionRepliesLogBatch({ at: AT, framesInBatch: 1, postsExtracted: 1, postsAdded: 0, discarded: true })],
      }),
      []
    );
    expect(discussionRepliesLogSummaryLine(summarizeDiscussionRepliesRunLog(log))).toBe(
      "0 replies captured across 1 batch - 0 drafted, 0 failed, 0 never drafted, 0 retried, 0 notices." +
        " 1 extracted post was discarded before reaching the table."
    );
  });

  it("appends the discarded-post clause, plural, and never counts those posts as duplicates", () => {
    const log = buildDiscussionRepliesRunLog(
      emptyInput({
        batches: [makeDiscussionRepliesLogBatch({ at: AT, framesInBatch: 2, postsExtracted: 4, postsAdded: 0, discarded: true })],
      }),
      []
    );
    const summary = summarizeDiscussionRepliesRunLog(log);
    expect(summary.postsDuplicateTotal).toBe(0);
    expect(discussionRepliesLogSummaryLine(summary)).toBe(
      "0 replies captured across 1 batch - 0 drafted, 0 failed, 0 never drafted, 0 retried, 0 notices." +
        " 4 extracted posts were discarded before reaching the table."
    );
  });
});

// ---------------------------------------------------------------------------
// formatDiscussionRepliesLogCsv - frozen literal oracle, including a
// verbatim error message and CSV-escaping of a comma inside a notice.
// ---------------------------------------------------------------------------

describe("formatDiscussionRepliesLogCsv", () => {
  it("renders the exact frozen CSV for a small run with a failure, a notice, a retry and a duplicate batch", () => {
    const rows: ReplyRow[] = [
      row({ id: "r1", author: "Ana", state: "ready", threadPosition: "root" }),
      row({
        id: "r2",
        author: "Bob, Jr.",
        state: "failed",
        error: "429 Too Many Requests, retry later",
        threadPosition: "reply",
        replyingToAuthor: "Ana",
      }),
    ];
    const log = buildDiscussionRepliesRunLog(
      emptyInput({
        startedAt: AT,
        endedAt: "2026-08-31T09:05:00.000Z",
        audience: "students",
        courseName: "CS 101",
        ingredients: ["compliment"],
        addressByName: true,
        formality: "balanced",
        framesCaptured: 6,
        droppedFrames: 1,
        stalled: false,
        batches: [
          makeDiscussionRepliesLogBatch({ at: AT, framesInBatch: 3, postsExtracted: 2, postsAdded: 2 }),
          makeDiscussionRepliesLogBatch({
            at: "2026-08-31T09:02:00.000Z",
            framesInBatch: 3,
            postsExtracted: 1,
            postsAdded: 0,
          }),
        ],
        notices: [{ at: AT, text: "Some of the screen could not be read: rate limited, try again" }],
        retries: [{ at: "2026-08-31T09:03:00.000Z", rowId: "r2" }],
      }),
      rows
    );

    const csv = formatDiscussionRepliesLogCsv(log);
    const expected = [
      "=== Run ===",
      "Field,Value",
      "Started,2026-08-31T09:00:00.000Z",
      "Ended,2026-08-31T09:05:00.000Z",
      "Audience,students",
      "Course,CS 101",
      "Ingredients,compliment",
      "Address by first name,Yes",
      "Formality,balanced",
      "Frames captured,6",
      "Batches sent,2",
      "Dropped frames,1",
      "Stalled at export time,No",
      "",
      "=== Batches ===",
      "At,Frames in batch,Posts extracted,Posts added,Posts duplicate,Capped,Discarded,Error",
      "2026-08-31T09:00:00.000Z,3,2,2,0,No,No,",
      "2026-08-31T09:02:00.000Z,3,1,0,1,No,No,",
      "",
      "=== Notices ===",
      "At,Text",
      '2026-08-31T09:00:00.000Z,"Some of the screen could not be read: rate limited, try again"',
      "",
      "=== Retries ===",
      "At,Row ID",
      "2026-08-31T09:03:00.000Z,r2",
      "",
      "=== Rows ===",
      "Row ID,Author,Thread position,Replying to,Parent resolved,Draft state,User edited,Retried,Error,Resource state,Resource error",
      "r1,Ana,root,,No,ready,No,No,,,",
      'r2,"Bob, Jr.",reply,Ana,Yes,failed,No,Yes,"429 Too Many Requests, retry later",,',
    ].join("\r\n");
    expect(csv).toBe(expected);
  });

  it("carries a verbatim error message through into the CSV text unmodified (never a generic placeholder)", () => {
    const r = row({ id: "r1", author: "A", state: "failed", error: "TypeError: Cannot read properties of null (reading 'foo')" });
    const log = buildDiscussionRepliesRunLog(emptyInput(), [r]);
    const csv = formatDiscussionRepliesLogCsv(log);
    expect(csv).toContain("TypeError: Cannot read properties of null (reading 'foo')");
  });

  it("still produces a full, section-headed CSV for a run that captured nothing", () => {
    const csv = formatDiscussionRepliesLogCsv(buildDiscussionRepliesRunLog(emptyInput(), []));
    expect(csv).toContain("=== Run ===");
    expect(csv).toContain("=== Batches ===");
    expect(csv).toContain("=== Notices ===");
    expect(csv).toContain("=== Retries ===");
    expect(csv).toContain("=== Rows ===");
    expect(csv).toContain("Started,");
  });
});

// ---------------------------------------------------------------------------
// formatDiscussionRepliesLogJson.
// ---------------------------------------------------------------------------

describe("formatDiscussionRepliesLogJson", () => {
  it("is an object (never a bare array) carrying exportedAt plus every run field, including rows", () => {
    const r = row({ id: "r1", author: "A", state: "failed", error: "verbatim failure text" });
    const log = buildDiscussionRepliesRunLog(emptyInput({ courseName: "CS 101" }), [r]);
    const json = formatDiscussionRepliesLogJson(log, { exportedAt: "2026-08-31T10:00:00.000Z" });
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.exportedAt).toBe("2026-08-31T10:00:00.000Z");
    expect(parsed.courseName).toBe("CS 101");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].error).toBe("verbatim failure text");
  });

  it("round-trips an empty run to valid, parseable JSON with an empty rows array", () => {
    const json = formatDiscussionRepliesLogJson(buildDiscussionRepliesRunLog(emptyInput(), []), { exportedAt: AT });
    const parsed = JSON.parse(json);
    expect(parsed.rows).toEqual([]);
    expect(parsed.batches).toEqual([]);
    expect(parsed.notices).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// discussionRepliesLogFileName.
// ---------------------------------------------------------------------------

describe("discussionRepliesLogFileName", () => {
  it("builds <prefix>-<course-slug>-<YYYYMMDD-HHMMSS>.<ext>", () => {
    expect(discussionRepliesLogFileName("CS 101: Intro", "csv", "2026-08-31T09:05:07.123Z")).toBe(
      "discussion-replies-log-cs-101-intro-20260831-090507.csv"
    );
  });

  it("drops the course segment entirely (no dangling dash) when the course name slugs to nothing", () => {
    expect(discussionRepliesLogFileName("", "json", "2026-08-31T09:05:07.123Z")).toBe(
      "discussion-replies-log-20260831-090507.json"
    );
  });
});
