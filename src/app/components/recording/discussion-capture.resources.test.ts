// Unit tests for discussion-capture.ts's resources-feature additions -
// docs/discussion-reply-resources-acceptance-criteria.md sections 1, 2, 5
// and 7 (set R-B): conceptFromPost (R4c), replyClipboardText (R9b), and the
// resources/resourceState/resourceError additions to
// serializeReplyTable / deserializeReplyTable (R3c).
//
// This file is NEW, split out from the start rather than folded into
// discussion-capture.rows.test.ts, discussion-capture.test.ts or
// discussion-capture.dedupe.test.ts - all three are owned by other work and
// this feature's own file-ownership table (AC section 7) assigns this set
// only discussion-capture.ts and this test file.
//
// Fixtures below are duplicated from the sibling *.test.ts files rather than
// imported - importing a helper from another *.test.ts file re-runs that
// file's own describe blocks, a failure this repo has already had.
//
// Every test here is sabotage-checked - see the report handed back to the
// dispatcher for the exact sabotages run.

import { describe, it, expect } from "vitest";
import {
  RESOURCE_CONCEPT_CHARS,
  RESOURCE_BATCH_SIZE,
  DISCUSSION_TABLE_VERSION,
  replyClipboardText,
  tableClipboardText,
  draftingArmSignature,
  serializeReplyTable,
  deserializeReplyTable,
  type ReplyRow,
  type ReplyResource,
} from "./discussion-capture";

function makeRow(overrides: Partial<ReplyRow>): ReplyRow {
  return {
    id: "disc-1-0",
    author: "Maria Alvarez",
    post: "Some post text",
    reply: "",
    userEdited: false,
    state: "pending",
    error: null,
    firstSeenAt: 1000,
    order: 0,
    ...overrides,
  };
}

function makeResource(overrides: Partial<ReplyResource>): ReplyResource {
  return {
    title: "Intro to Utilitarianism",
    url: "https://example.com/utilitarianism",
    kind: "doc",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// R4a: RESOURCE_BATCH_SIZE is re-exported from @/lib/discussion-reply-prompt
// (R-C's file, landing concurrently in this same wave) the same way the
// other three shared constants already are - never restated here.
// ---------------------------------------------------------------------------

describe("RESOURCE_BATCH_SIZE re-export (R4a)", () => {
  it("is re-exported from discussion-capture.ts and equals 5", () => {
    expect(RESOURCE_BATCH_SIZE).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// R4c: RESOURCE_CONCEPT_CHARS re-export. The truncation RULE itself
// (word-boundary truncation, the author-name exclusion) is owned, implemented
// and tested exactly once, as `deriveResourceConcept` in
// @/lib/discussion-reply-prompt (R-C's file) - see that file's own test
// suite for the truncation coverage, and discussion-replies.test.ts for the
// author-exclusion guarantee pinned against the LIVE boundary
// (gatherReplyResourcesAction's own `posts` parameter, which
// deriveResourceConcept is called from directly).
//
// F2 fix (fixer pass): this file previously also defined `conceptFromPost`,
// a thin wrapper around deriveResourceConcept whose only caller was its own
// test below - production (gatherReplyResourcesAction) always called
// deriveResourceConcept directly, so that test's author-exclusion assertion
// guarded a function nothing ran. The wrapper is deleted rather than kept as
// a second, unreachable implementation of the same guarantee.
// ---------------------------------------------------------------------------

describe("RESOURCE_CONCEPT_CHARS re-export (R4c)", () => {
  it("is re-exported from discussion-capture.ts and equals 400", () => {
    expect(RESOURCE_CONCEPT_CHARS).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// R9b: replyClipboardText - frozen literal oracle, all three shapes.
// ---------------------------------------------------------------------------

describe("replyClipboardText (R9b)", () => {
  it("reply only -> the reply text alone, no trailing newline", () => {
    const row = { reply: "Thanks for sharing this - it really made me think.", resources: [] as ReplyResource[] };
    expect(replyClipboardText(row)).toBe("Thanks for sharing this - it really made me think.");
  });

  it("reply + 2 resources -> reply, blank line, then one bare 'title - url' per line", () => {
    const row = {
      reply: "Thanks for sharing this - it really made me think.",
      resources: [
        makeResource({ title: "Trolley Problem Explainer", url: "https://a.example/1" }),
        makeResource({ title: "Utilitarianism 101", url: "https://b.example/2", kind: "video" }),
      ],
    };
    expect(replyClipboardText(row)).toBe(
      "Thanks for sharing this - it really made me think.\n\nTrolley Problem Explainer - https://a.example/1\nUtilitarianism 101 - https://b.example/2"
    );
  });

  it("resources only (empty reply) -> just the resource line(s)", () => {
    const row = { reply: "", resources: [makeResource({ title: "Trolley Problem Explainer", url: "https://a.example/1" })] };
    expect(replyClipboardText(row)).toBe("Trolley Problem Explainer - https://a.example/1");
  });

  it("row.resources undefined behaves like an empty array (reply only)", () => {
    const row = { reply: "Thanks!" };
    expect(replyClipboardText(row)).toBe("Thanks!");
  });

  it("never emits markdown - no brackets or parens around the url", () => {
    const row = { reply: "", resources: [makeResource({ title: "Trolley Problem Explainer", url: "https://a.example/1" })] };
    const text = replyClipboardText(row);
    expect(text).not.toContain("[");
    expect(text).not.toContain("](");
  });

  it("never copies a resource's note", () => {
    const row = {
      reply: "Thanks!",
      resources: [makeResource({ title: "Trolley Problem Explainer", url: "https://a.example/1", note: "Directly addresses their confusion." })],
    };
    expect(replyClipboardText(row)).not.toContain("Directly addresses their confusion.");
  });

  it("SABOTAGE CHECK (b): the frozen oracle catches a markdown-link regression", () => {
    // If replyClipboardText were changed to emit `[title](url)` instead of
    // `title - url`, this exact assertion (from the frozen oracle above)
    // would fail. Verified by sabotage - see report.
    const row = { reply: "", resources: [makeResource({ title: "Trolley Problem Explainer", url: "https://a.example/1" })] };
    expect(replyClipboardText(row)).toBe("Trolley Problem Explainer - https://a.example/1");
  });
});

// ---------------------------------------------------------------------------
// Reply width UX pass, section 5d target #2: tableClipboardText - the
// table-level "Copy every reply (N)" export. Frozen literal oracle, written
// independently of replyClipboardText's own (no assertion here is derived by
// calling replyClipboardText and comparing) - the point is to prove the
// CALLER's join/skip/author-prefix behaviour, not to re-prove the row-level
// function again.
// ---------------------------------------------------------------------------

describe("tableClipboardText (reply width UX pass, section 5d #2)", () => {
  it("one row, reply only -> 'Author\\nreply', no trailing newline", () => {
    const rows = [{ author: "Maria Alvarez", reply: "Thanks for sharing this - it really made me think." }];
    expect(tableClipboardText(rows)).toBe("Maria Alvarez\nThanks for sharing this - it really made me think.");
  });

  it("two rows, both with replies -> joined by a blank line between blocks", () => {
    const rows = [
      { author: "Maria Alvarez", reply: "Great point about the trolley problem." },
      { author: "Jordan Lee", reply: "I see it differently, and here is why." },
    ];
    expect(tableClipboardText(rows)).toBe(
      "Maria Alvarez\nGreat point about the trolley problem.\n\nJordan Lee\nI see it differently, and here is why."
    );
  });

  it("a row with resources but no reply still contributes its block (author + resource lines)", () => {
    const rows = [
      {
        author: "Priya Shah",
        reply: "",
        resources: [makeResource({ title: "Trolley Problem Explainer", url: "https://a.example/1" })],
      },
    ];
    expect(tableClipboardText(rows)).toBe("Priya Shah\nTrolley Problem Explainer - https://a.example/1");
  });

  it("SKIPS a row with neither a reply nor resources - mirrors the per-row copy button's own disabled condition (R9a)", () => {
    const rows = [
      { author: "Never Drafted", reply: "" },
      { author: "Maria Alvarez", reply: "Thanks for sharing this." },
    ];
    expect(tableClipboardText(rows)).toBe("Maria Alvarez\nThanks for sharing this.");
  });

  it("all rows empty -> empty string", () => {
    const rows = [{ author: "Never Drafted", reply: "" }];
    expect(tableClipboardText(rows)).toBe("");
  });

  it("SABOTAGE CHECK (e): the frozen oracle catches a separator regression (single newline instead of a blank line between blocks)", () => {
    const rows = [
      { author: "Maria Alvarez", reply: "First reply." },
      { author: "Jordan Lee", reply: "Second reply." },
    ];
    const text = tableClipboardText(rows);
    expect(text).toBe("Maria Alvarez\nFirst reply.\n\nJordan Lee\nSecond reply.");
    expect(text).not.toContain("First reply.\nJordan Lee");
  });
});

// ---------------------------------------------------------------------------
// draftingArmSignature - the redraft-signature live-bug fix (REGRESSION
// entry 258's class). Frozen literal oracle. The property that matters is
// NOT the separator's spelling - it is that varying ANY input `redraftAll`
// actually consumes produces a DIFFERENT signature, so the shipped bug (a
// silently OMITTED field, not a wrong separator) cannot recur unnoticed.
// Each "varying X alone" test below is written by comparing two computed
// calls, never by re-deriving the expected string from the implementation.
// ---------------------------------------------------------------------------

describe("draftingArmSignature (redraft-signature live-bug fix)", () => {
  // docs/reply-composition-controls-acceptance-criteria.md C6: the three
  // reply-composition fields (ingredients, addressByName, formality) join
  // this signature the same way courseId's own addition once fixed this
  // exact class of bug for THAT field - see the three "varying X alone"
  // tests below for each of the three new controls.
  const base = {
    rowCount: 3,
    audience: "students",
    courseId: "course-1",
    ingredients: ["compliment"],
    addressByName: true,
    formality: "balanced",
  };

  it("frozen literal: base case", () => {
    expect(draftingArmSignature(base)).toBe("3|students|course-1|compliment|true|balanced");
  });

  it("frozen literal: no course selected (courseId is an empty string)", () => {
    expect(draftingArmSignature({ ...base, courseId: "" })).toBe("3|students||compliment|true|balanced");
  });

  it("frozen literal: zero ingredients selected (C2c - legal, not the default)", () => {
    expect(draftingArmSignature({ ...base, ingredients: [] })).toBe("3|students|course-1||true|balanced");
  });

  it("is deterministic - the same inputs produce the identical signature every call", () => {
    expect(draftingArmSignature(base)).toBe(draftingArmSignature({ ...base }));
  });

  it("varying rowCount alone changes the signature", () => {
    const a = draftingArmSignature(base);
    const b = draftingArmSignature({ ...base, rowCount: 4 });
    expect(a).not.toBe(b);
  });

  it("varying audience alone changes the signature - this is the case the owner's own repro (arm, change audience, confirm) exercises", () => {
    const a = draftingArmSignature(base);
    const b = draftingArmSignature({ ...base, audience: "peers" });
    expect(a).not.toBe(b);
  });

  it("varying courseId alone changes the signature - this is the field that was OMITTED in the shipped bug", () => {
    const a = draftingArmSignature(base);
    const b = draftingArmSignature({ ...base, courseId: "course-2" });
    expect(a).not.toBe(b);
  });

  // C6a: each of the three new reply-composition controls is tested
  // INDEPENDENTLY - three separate assertions below, not one combined test,
  // which would pass even if only one of the three were actually wired.

  it("C6a: varying ingredients alone changes the signature", () => {
    const a = draftingArmSignature(base);
    const b = draftingArmSignature({ ...base, ingredients: ["compliment", "insight"] });
    expect(a).not.toBe(b);
  });

  it("C6a: varying addressByName alone changes the signature", () => {
    const a = draftingArmSignature(base);
    const b = draftingArmSignature({ ...base, addressByName: false });
    expect(a).not.toBe(b);
  });

  it("C6a: varying formality alone changes the signature", () => {
    const a = draftingArmSignature(base);
    const b = draftingArmSignature({ ...base, formality: "formal" });
    expect(a).not.toBe(b);
  });

  it("SABOTAGE CHECK (f): the frozen base-case literal alone already pins all six fields being present, in order", () => {
    // If draftingArmSignature dropped ANY one of the six fields, this exact
    // literal would fail - verified by sabotage (dropping courseId, then
    // dropping audience, then each of the three new fields) in the report
    // handed back to the dispatcher.
    expect(
      draftingArmSignature({
        rowCount: 7,
        audience: "peers",
        courseId: "abc",
        ingredients: ["resources", "correction"],
        addressByName: false,
        formality: "casual",
      })
    ).toBe("7|peers|abc|resources,correction|false|casual");
  });
});

// ---------------------------------------------------------------------------
// R3b: DISCUSSION_TABLE_VERSION stays at 1.
// ---------------------------------------------------------------------------

describe("DISCUSSION_TABLE_VERSION (R3b)", () => {
  it("is still 1 - bumping it would silently wipe every saved table on load", () => {
    expect(DISCUSSION_TABLE_VERSION).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// R3c: serializeReplyTable / deserializeReplyTable - the resources fields.
// ---------------------------------------------------------------------------

describe("serializeReplyTable / deserializeReplyTable - resources (R3c)", () => {
  it("round-trips a row with resources, a resourceState and no resourceError", () => {
    const rows = [
      makeRow({
        id: "a",
        state: "ready",
        reply: "Great point!",
        resources: [makeResource({}), makeResource({ title: "Video walkthrough", url: "https://b.example/2", kind: "video" })],
        resourceState: "done",
        resourceError: null,
      }),
    ];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored).toEqual(rows);
  });

  it("a row that never touched the resource feature round-trips with no resource fields introduced", () => {
    const rows = [makeRow({ id: "a" })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].resources).toBeUndefined();
    expect(restored[0].resourceState).toBeUndefined();
    expect(restored[0].resourceError).toBeUndefined();
    expect(restored).toEqual(rows);
  });

  it("writes 'resources' only when non-empty - an empty array is omitted from the raw JSON, not written as []", () => {
    const rows = [makeRow({ id: "a", resources: [], resourceState: "done" })];
    const raw = JSON.parse(serializeReplyTable(rows)) as { rows: Array<Record<string, unknown>> };
    expect("resources" in raw.rows[0]).toBe(false);
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].resources).toBeUndefined();
  });

  it("normalizes resourceState 'searching' to 'idle' on write - nothing is in flight after a reload", () => {
    const rows = [makeRow({ id: "a", resourceState: "searching", resources: [makeResource({})] })];
    const raw = JSON.parse(serializeReplyTable(rows)) as { rows: Array<{ resourceState: string }> };
    expect(raw.rows[0].resourceState).toBe("idle");
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].resourceState).toBe("idle");
  });

  it("preserves resourceError on a failed row", () => {
    const rows = [makeRow({ id: "a", resourceState: "failed", resourceError: "The search timed out." })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].resourceState).toBe("failed");
    expect(restored[0].resourceError).toBe("The search timed out.");
  });

  it("SABOTAGE CHECK (c): nulls a stale resourceError on a non-failed row, checking serializeReplyTable's OWN raw output", () => {
    // Checks the raw write side directly (not the round trip through
    // deserializeReplyTable, which enforces the same invariant again on
    // read and would mask a regression here) - mirrors the sibling
    // discussion-capture.rows.test.ts's BL4 test for the `error` field.
    const rows = [makeRow({ id: "a", resourceState: "done", resourceError: "stale error from a previous failed search" })];
    const raw = JSON.parse(serializeReplyTable(rows)) as { rows: Array<{ resourceError: string | null }> };
    expect(raw.rows[0].resourceError).toBeNull();
  });

  it("deserialize: a non-array 'resources' value yields undefined, not a throw", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", resources: "not-an-array" }],
    });
    expect(() => deserializeReplyTable(raw)).not.toThrow();
    expect(deserializeReplyTable(raw)[0].resources).toBeUndefined();
  });

  it("deserialize: drops a resource entry whose title is missing, and one whose url is missing", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [
        {
          id: "a",
          author: "Maria",
          post: "hello",
          resources: [
            { title: "Keep me", url: "https://example.com/keep", kind: "doc" },
            { url: "https://example.com/no-title", kind: "doc" },
            { title: "No url here", kind: "doc" },
          ],
        },
      ],
    });
    const restored = deserializeReplyTable(raw);
    expect(restored[0].resources).toEqual([{ title: "Keep me", url: "https://example.com/keep", kind: "doc" }]);
  });

  it("SABOTAGE CHECK (d): drops a resource entry whose url is an empty string", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [
        {
          id: "a",
          author: "Maria",
          post: "hello",
          resources: [
            { title: "Keep me", url: "https://example.com/keep", kind: "doc" },
            { title: "Empty url", url: "", kind: "doc" },
          ],
        },
      ],
    });
    const restored = deserializeReplyTable(raw);
    expect(restored[0].resources).toEqual([{ title: "Keep me", url: "https://example.com/keep", kind: "doc" }]);
  });

  it("deserialize: url is NOT re-sanitized - passed through exactly as stored", () => {
    const dirtyUrl = "https://example.com/path?utm_source=x&ref=y#section-2";
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", resources: [{ title: "Keep me", url: dirtyUrl, kind: "doc" }] }],
    });
    const restored = deserializeReplyTable(raw);
    expect(restored[0].resources?.[0].url).toBe(dirtyUrl);
  });

  it("deserialize: 'kind' is coerced via coerceResourceKind - an unknown kind defaults to 'doc', a known kind is preserved", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [
        {
          id: "a",
          author: "Maria",
          post: "hello",
          resources: [
            { title: "Unknown kind", url: "https://example.com/1", kind: "not-a-real-kind" },
            { title: "News item", url: "https://example.com/2", kind: "news" },
          ],
        },
      ],
    });
    const restored = deserializeReplyTable(raw);
    expect(restored[0].resources?.[0].kind).toBe("doc");
    expect(restored[0].resources?.[1].kind).toBe("news");
  });

  it("deserialize: 'note' survives only as a non-empty string - empty string and non-string notes are dropped", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [
        {
          id: "a",
          author: "Maria",
          post: "hello",
          resources: [
            { title: "Has a note", url: "https://example.com/1", kind: "doc", note: "Fits this post well." },
            { title: "Empty note", url: "https://example.com/2", kind: "doc", note: "" },
            { title: "Non-string note", url: "https://example.com/3", kind: "doc", note: 42 },
          ],
        },
      ],
    });
    const restored = deserializeReplyTable(raw);
    expect(restored[0].resources?.[0].note).toBe("Fits this post well.");
    expect(restored[0].resources?.[1].note).toBeUndefined();
    expect(restored[0].resources?.[2].note).toBeUndefined();
  });

  it("deserialize: an unrecognized resourceState value falls back to 'idle'", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", resourceState: "bogus-state" }],
    });
    expect(deserializeReplyTable(raw)[0].resourceState).toBe("idle");
  });

  it("deserialize: a legitimate resourceState value ('failed') is preserved as-is", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", resourceState: "failed", resourceError: "network error" }],
    });
    const restored = deserializeReplyTable(raw);
    expect(restored[0].resourceState).toBe("failed");
    expect(restored[0].resourceError).toBe("network error");
  });

  it("deserialize: resourceError is dropped (null) on a non-failed row even if present in the raw JSON", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", resourceState: "done", resourceError: "should not survive" }],
    });
    expect(deserializeReplyTable(raw)[0].resourceError).toBeNull();
  });

  it("never throws on a garbage 'resources' array entry (null, a string, a number)", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", resources: [null, "a string", 42, { title: "Keep me", url: "https://example.com/1", kind: "doc" }] }],
    });
    expect(() => deserializeReplyTable(raw)).not.toThrow();
    expect(deserializeReplyTable(raw)[0].resources).toEqual([{ title: "Keep me", url: "https://example.com/1", kind: "doc" }]);
  });
});
