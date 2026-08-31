// Unit tests for discussion-capture.ts's thread-structure additions -
// docs/discussion-thread-structure-acceptance-criteria.md sections 0, 2, 4
// and 6 (set T-A): the two new ReplyRow fields, their serialization (T2b),
// and mergeCapturedPosts' T4a reconciliation.
//
// FIX 2 (line-ceiling pass): the reconciliation LOGIC (reconcileThreadPosition,
// reconcileReplyingToAuthor) and resolveDraftParent's own implementation moved
// to discussion-thread.ts, and their direct unit tests moved with them into
// discussion-thread.test.ts. What stays here are the tests that exercise
// THIS file's own exports - serializeReplyTable/deserializeReplyTable, and
// mergeCapturedPosts (which still lives here and still calls the moved
// helpers internally) - plus a small wrapper-wiring check below proving this
// file's exported resolveDraftParent (a thin wrapper around the leaf's
// version) actually threads this module's own authorsMatch through.
//
// This is a NEW file, split out rather than folded into
// discussion-capture.rows.test.ts, discussion-capture.dedupe.test.ts,
// discussion-capture.resources.test.ts or discussion-capture.test.ts - all
// four are owned by other work, and this feature's own file-ownership table
// (the AC's "YOUR FILES" section) assigns set T-A only discussion-capture.ts
// and this test file.
//
// Fixtures below are duplicated from the sibling *.test.ts files rather than
// imported - importing a helper from another *.test.ts file re-runs that
// file's own describe blocks, a failure this repo has already had (see
// docs/no-cross-test-file-imports lesson).
//
// Not every test in this file is sabotage-checked - only the ones explicitly
// labelled SABOTAGE CHECK (or, for the resolveDraftParent wiring block below,
// called out by name in that block's own comment) have been verified by
// actually making the described regression and confirming the test goes red
// before reverting; see the report handed back to the dispatcher for that
// evidence. The rest are ordinary oracle tests, reasoned by hand against the
// AC rather than individually sabotage-verified. (A prior blanket claim here
// - "every test is sabotage-checked" - was found overstated during review:
// the resolveDraftParent wiring block's original two cases could not
// actually catch the dangerous over-permissive stub; see that block's own
// comment and FIX 3 in the review pass for the fix.)

import { describe, it, expect } from "vitest";
import {
  DISCUSSION_TABLE_VERSION,
  mergeCapturedPosts,
  serializeReplyTable,
  deserializeReplyTable,
  resolveDraftParent,
  isSamePost,
  type ReplyRow,
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

// ---------------------------------------------------------------------------
// T2b: serializeReplyTable / deserializeReplyTable - the two new fields.
// ---------------------------------------------------------------------------

describe("DISCUSSION_TABLE_VERSION stays at 1 (T2b)", () => {
  it("is still 1 - the thread fields must degrade with no migration", () => {
    expect(DISCUSSION_TABLE_VERSION).toBe(1);
  });
});

describe("serializeReplyTable / deserializeReplyTable - thread fields (T2b)", () => {
  it("round-trips a row with threadPosition 'reply' and a replyingToAuthor", () => {
    const rows = [makeRow({ id: "a", threadPosition: "reply", replyingToAuthor: "Diego Chen" })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored).toEqual(rows);
  });

  it("round-trips threadPosition 'root' with no replyingToAuthor", () => {
    const rows = [makeRow({ id: "a", threadPosition: "root" })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].threadPosition).toBe("root");
    expect(restored[0].replyingToAuthor).toBeUndefined();
  });

  it("round-trips threadPosition 'unknown'", () => {
    const rows = [makeRow({ id: "a", threadPosition: "unknown" })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].threadPosition).toBe("unknown");
  });

  it("a row that never touched thread fields round-trips with neither key introduced", () => {
    const rows = [makeRow({ id: "a" })];
    const raw = JSON.parse(serializeReplyTable(rows)) as { rows: Array<Record<string, unknown>> };
    expect("threadPosition" in raw.rows[0]).toBe(false);
    expect("replyingToAuthor" in raw.rows[0]).toBe(false);
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].threadPosition).toBeUndefined();
    expect(restored[0].replyingToAuthor).toBeUndefined();
    expect(restored).toEqual(rows);
  });

  it("deserialize: a threadPosition key that is ABSENT from the raw JSON stays undefined (R3c-i: absent stays absent)", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello" }],
    });
    expect(deserializeReplyTable(raw)[0].threadPosition).toBeUndefined();
  });

  it("deserialize: a threadPosition key that is PRESENT but outside the three-member set falls back to undefined (R3c-i: present + invalid falls back)", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", threadPosition: "top-level" }],
    });
    expect(deserializeReplyTable(raw)[0].threadPosition).toBeUndefined();
  });

  it("deserialize: a non-string threadPosition value falls back to undefined", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", threadPosition: 3 }],
    });
    expect(deserializeReplyTable(raw)[0].threadPosition).toBeUndefined();
  });

  it("deserialize: each of the three legitimate threadPosition values is preserved as-is", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [
        { id: "a", author: "Maria", post: "hello", threadPosition: "root" },
        { id: "b", author: "Diego", post: "hi", threadPosition: "reply" },
        { id: "c", author: "Priya", post: "hey", threadPosition: "unknown" },
      ],
    });
    const restored = deserializeReplyTable(raw);
    expect(restored[0].threadPosition).toBe("root");
    expect(restored[1].threadPosition).toBe("reply");
    expect(restored[2].threadPosition).toBe("unknown");
  });

  it("deserialize: replyingToAuthor survives only as a non-empty string - an empty string is dropped", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", threadPosition: "reply", replyingToAuthor: "" }],
    });
    expect(deserializeReplyTable(raw)[0].replyingToAuthor).toBeUndefined();
  });

  it("deserialize: a non-string replyingToAuthor is dropped", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", threadPosition: "reply", replyingToAuthor: 42 }],
    });
    expect(deserializeReplyTable(raw)[0].replyingToAuthor).toBeUndefined();
  });

  it("never throws on garbage thread-field values", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", threadPosition: { nested: true }, replyingToAuthor: ["array"] }],
    });
    expect(() => deserializeReplyTable(raw)).not.toThrow();
    expect(deserializeReplyTable(raw)[0].threadPosition).toBeUndefined();
    expect(deserializeReplyTable(raw)[0].replyingToAuthor).toBeUndefined();
  });

  it("SABOTAGE CHECK (a): an invalid threadPosition defaulting to 'unknown' instead of undefined would still fail this absent-key assertion", () => {
    // Distinguishes the two possible "wrong" implementations: one where an
    // invalid PRESENT value falls back to the string "unknown" (renders the
    // same as undefined per T1a, but is a DIFFERENT stored value, and this
    // repo's rule is coerce-to-undefined, not coerce-to-a-member) would pass
    // the visual-render tests but fail this literal-value assertion.
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello", threadPosition: "nested-reply" }],
    });
    expect(deserializeReplyTable(raw)[0].threadPosition).toBe(undefined);
  });
});

// ---------------------------------------------------------------------------
// T4. threadPosition does NOT enter isSamePost - two frames of the same post
// differing only on threadPosition must still be judged the same post.
// ---------------------------------------------------------------------------

describe("isSamePost does not consider threadPosition (T4)", () => {
  it("two reads with identical author/text but different threadPosition still match", () => {
    // isSamePost's own type signature does not accept a threadPosition
    // field at all - which is itself the AC's design (T4). To actually
    // exercise that a stray threadPosition on the argument object is
    // ignored (rather than merely untyped), the values below are attached
    // via an `as` cast, the shape a sabotaged isSamePost that reached into
    // `(a as any).threadPosition` would still see.
    const a = { author: "Maria Alvarez", text: "This is a long enough post to pass the token-count floor for real.", threadPosition: "root" as const };
    const b = {
      author: "Maria Alvarez",
      text: "This is a long enough post to pass the token-count floor for real.",
      threadPosition: "reply" as const,
    };
    // One frame shows the "Replied to" line ("reply"), another is scrolled
    // past it and reads "root" - T4 requires these still merge as ONE post.
    expect(isSamePost(a, b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4a: mergeCapturedPosts thread-field reconciliation. Frozen literal oracle
// - every case below is reasoned by hand against T4a's three bullets, not
// derived by calling the implementation first.
// ---------------------------------------------------------------------------

describe("mergeCapturedPosts - thread reconciliation (T4a)", () => {
  it("a brand-new row picks up the incoming thread fields directly", () => {
    const { rows } = mergeCapturedPosts(
      [],
      [{ author: "Maria Alvarez", text: "A fresh post with plenty of words to clear the similarity floor easily.", threadPosition: "reply", replyingToAuthor: "Diego Chen" }],
      5000
    );
    expect(rows[0].threadPosition).toBe("reply");
    expect(rows[0].replyingToAuthor).toBe("Diego Chen");
  });

  it("THE LIVE TRAP (T4a): a SHORTER re-read carrying threadPosition 'reply' still updates a row stuck on 'unknown', even though its text does not grow", () => {
    const longerText =
      "This is the original, fuller transcription of the post with quite a few words in it so the match still succeeds.";
    const shorterRereadSameText = longerText; // same text, so it is NOT the longer-text branch
    const existing = makeRow({ id: "a", post: longerText, threadPosition: "unknown" });
    const { rows } = mergeCapturedPosts(
      [existing],
      [{ author: "Maria Alvarez", text: shorterRereadSameText, threadPosition: "reply", replyingToAuthor: "Diego Chen" }],
      6000
    );
    expect(rows[0].threadPosition).toBe("reply");
    expect(rows[0].replyingToAuthor).toBe("Diego Chen");
  });

  it("a genuinely SHORTER re-read (fewer characters) still carries its thread reading into the row", () => {
    const longerText =
      "This is the original, fuller transcription of the post with quite a few words in it so the match still succeeds.";
    const shorterText = "This is the original, fuller transcription of the post with quite a few words in it";
    const existing = makeRow({ id: "a", post: longerText, threadPosition: "unknown" });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: shorterText, threadPosition: "root" }], 6000);
    // text does not update (shorter loses AC54's tie-break)...
    expect(rows[0].post).toBe(longerText);
    // ...but the thread reading still lands.
    expect(rows[0].threadPosition).toBe("root");
  });

  it("'unknown' loses to a definite incoming value", () => {
    const existing = makeRow({ id: "a", threadPosition: "unknown" });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: "Some post text", threadPosition: "root" }], 6000);
    expect(rows[0].threadPosition).toBe("root");
  });

  it("'unknown' loses to a definite EXISTING value too - an incoming 'unknown' does not overwrite a known reading", () => {
    const existing = makeRow({ id: "a", threadPosition: "root" });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: "Some post text", threadPosition: "unknown" }], 6000);
    expect(rows[0].threadPosition).toBe("root");
  });

  it("a row with no threadPosition yet (undefined) behaves like 'unknown' - a fresh reading fills it", () => {
    const existing = makeRow({ id: "a" }); // threadPosition undefined
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: "Some post text", threadPosition: "reply" }], 6000);
    expect(rows[0].threadPosition).toBe("reply");
  });

  it("a root/reply CONTRADICTION downgrades to 'unknown', not the newer value", () => {
    const existing = makeRow({ id: "a", threadPosition: "root" });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: "Some post text", threadPosition: "reply" }], 6000);
    expect(rows[0].threadPosition).toBe("unknown");
  });

  it("a root/reply contradiction in the OTHER direction also downgrades to 'unknown'", () => {
    const existing = makeRow({ id: "a", threadPosition: "reply" });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: "Some post text", threadPosition: "root" }], 6000);
    expect(rows[0].threadPosition).toBe("unknown");
  });

  it("two agreeing definite readings keep the agreed value", () => {
    const existing = makeRow({ id: "a", threadPosition: "reply" });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: "Some post text", threadPosition: "reply" }], 6000);
    expect(rows[0].threadPosition).toBe("reply");
  });

  it("no incoming threadPosition at all leaves the existing value untouched", () => {
    const existing = makeRow({ id: "a", threadPosition: "reply", replyingToAuthor: "Diego Chen" });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: "Some post text" }], 6000);
    expect(rows[0].threadPosition).toBe("reply");
    expect(rows[0].replyingToAuthor).toBe("Diego Chen");
  });

  it("replyingToAuthor fills when absent on the existing row", () => {
    const existing = makeRow({ id: "a", threadPosition: "reply" });
    const { rows } = mergeCapturedPosts(
      [existing],
      [{ author: "Maria Alvarez", text: "Some post text", threadPosition: "reply", replyingToAuthor: "Diego Chen" }],
      6000
    );
    expect(rows[0].replyingToAuthor).toBe("Diego Chen");
  });

  it("a replyingToAuthor CONFLICT between two genuinely different people clears it (FIX 1, at the live merge boundary)", () => {
    const existing = makeRow({ id: "a", threadPosition: "reply", replyingToAuthor: "Diego Chen" });
    const { rows } = mergeCapturedPosts(
      [existing],
      [{ author: "Maria Alvarez", text: "Some post text", threadPosition: "reply", replyingToAuthor: "Priya Shah" }],
      6000
    );
    expect(rows[0].replyingToAuthor).toBeUndefined();
  });

  it("FIX 1 (at the live merge boundary): a case-only re-read of the SAME name survives instead of clearing - 'Diego Chen' then 'diego chen'", () => {
    // Before FIX 1, reconcileReplyingToAuthor compared with `===`, so this
    // exact pair (two correct readings of the same board, differing only in
    // case) registered as a CONFLICT and cleared the field. authorsMatch
    // treats them as the same person, so the field must survive.
    const existing = makeRow({ id: "a", threadPosition: "reply", replyingToAuthor: "Diego Chen" });
    const { rows } = mergeCapturedPosts(
      [existing],
      [{ author: "Maria Alvarez", text: "Some post text", threadPosition: "reply", replyingToAuthor: "diego chen" }],
      6000
    );
    expect(rows[0].replyingToAuthor).not.toBeUndefined();
    expect(rows[0].replyingToAuthor).toBe("Diego Chen");
  });

  it("SABOTAGE CHECK: an exact-string-equality regression at the merge boundary would clear 'Diego Chen'/'diego chen' instead of keeping it", () => {
    const existing = makeRow({ id: "a", threadPosition: "reply", replyingToAuthor: "Diego Chen" });
    const { rows } = mergeCapturedPosts(
      [existing],
      [{ author: "Maria Alvarez", text: "Some post text", threadPosition: "reply", replyingToAuthor: "diego chen" }],
      6000
    );
    // A regressed `existing === incoming` comparison would report undefined here.
    expect(rows[0].replyingToAuthor).toBe("Diego Chen");
  });

  it("agreeing replyingToAuthor readings keep the value", () => {
    const existing = makeRow({ id: "a", threadPosition: "reply", replyingToAuthor: "Diego Chen" });
    const { rows } = mergeCapturedPosts(
      [existing],
      [{ author: "Maria Alvarez", text: "Some post text", threadPosition: "reply", replyingToAuthor: "Diego Chen" }],
      6000
    );
    expect(rows[0].replyingToAuthor).toBe("Diego Chen");
  });

  it("an untouched row (no match in this batch) keeps its exact object identity - React.memo depends on this", () => {
    const untouched = makeRow({ id: "untouched", author: "Someone Else", post: "Completely unrelated content here." });
    const { rows } = mergeCapturedPosts(
      [untouched],
      [{ author: "Maria Alvarez", text: "A totally different post from a different person entirely, unrelated." }],
      6000
    );
    const stillThere = rows.find((r) => r.id === "untouched");
    expect(stillThere).toBe(untouched); // same reference, not just equal
  });

  it("a matched row where NOTHING changes (equal-length text, same thread fields) keeps its exact object identity", () => {
    const existing = makeRow({ id: "a", post: "Some post text", threadPosition: "root" });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: "Some post text", threadPosition: "root" }], 6000);
    expect(rows[0]).toBe(existing);
  });

  it("mergeCapturedPosts remains pure - the input rows array is not mutated", () => {
    const existing = makeRow({ id: "a", threadPosition: "unknown" });
    const inputRows = [existing];
    mergeCapturedPosts(inputRows, [{ author: "Maria Alvarez", text: "Some post text", threadPosition: "reply" }], 6000);
    expect(inputRows[0].threadPosition).toBe("unknown"); // original object untouched
  });

  it("SABOTAGE CHECK (a): reconciling ONLY inside the longer-text branch would fail the live-trap test above", () => {
    // If mergeCapturedPosts were regressed to only run reconcileThreadPosition
    // inside `if (post.text.length > existing.post.length)`, the same-length
    // re-read in the live-trap test would never touch threadPosition at all,
    // and the row would stay on "unknown" forever. Verified by sabotage - see
    // report.
    const longerText = "This is the original, fuller transcription with quite a few words in it so matching succeeds.";
    const existing = makeRow({ id: "a", post: longerText, threadPosition: "unknown" });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: longerText, threadPosition: "reply" }], 6000);
    expect(rows[0].threadPosition).not.toBe("unknown");
    expect(rows[0].threadPosition).toBe("reply");
  });

  it("SABOTAGE CHECK (b): letting a root/reply contradiction take the newer value instead of downgrading would fail this exact assertion", () => {
    const existing = makeRow({ id: "a", threadPosition: "root" });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: "Some post text", threadPosition: "reply" }], 6000);
    // A "newer value wins" regression would report "reply" here instead.
    expect(rows[0].threadPosition).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// T6c wrapper wiring: resolveDraftParent's own implementation and its full
// three-condition-gate test suite moved to discussion-thread.test.ts (FIX
// 2). What is exported from THIS file is a thin two-argument wrapper (see
// discussion-capture.ts) that supplies this module's own `authorsMatch` to
// the leaf's three-argument version.
//
// FIX 3 (review pass): the first two cases below each supply a row set where
// the child plus EXACTLY ONE candidate parent is present. That shape only
// discriminates a matcher STRICTER than the real `authorsMatch` (e.g. one
// that always returns false) - it does NOT discriminate a matcher LOOSER
// than real, such as `() => true`: substituting `() => true` into
// discussion-capture.ts:595's wrapper still yields `matches.length === 1` in
// both cases below, so both still PASS under that stub. Over-permissive is
// the dangerous direction, because it is what makes the gate resolve the
// WRONG person. The third case adds a row with a genuinely NON-matching
// author alongside the child's `replyingToAuthor` - under the real
// `authorsMatch` that yields zero matches (`undefined`); under `() => true`
// the unrelated row wrongly "matches" too, `matches.length` is still 1, and
// the wrapper returns that wrong row instead of `undefined`. That is what
// actually proves this module's own `authorsMatch` (not a rubber stamp) is
// threaded through. Verified by literally substituting `() => true` for
// `authorsMatch` in discussion-capture.ts:595's wrapper, confirming this
// third case went RED (and the first two stayed green), then reverting - see
// the report handed back to the dispatcher for that diff.
// ---------------------------------------------------------------------------

describe("resolveDraftParent wrapper wiring (T6c)", () => {
  it("the exported two-argument wrapper resolves a single matching parent, same as before the extraction", () => {
    const child = makeRow({ id: "child", author: "Maria Alvarez", threadPosition: "reply", replyingToAuthor: "Diego Chen" });
    const parent = makeRow({ id: "parent", author: "Diego Chen", threadPosition: "root" });
    expect(resolveDraftParent(child, [parent, child])).toBe(parent);
  });

  it("the wrapper threads this module's OWN authorsMatch through - a surname-only replyingToAuthor still resolves", () => {
    const child = makeRow({ id: "child", author: "Maria Alvarez", threadPosition: "reply", replyingToAuthor: "Chen" });
    const parent = makeRow({ id: "parent", author: "Diego Chen", threadPosition: "root" });
    expect(resolveDraftParent(child, [parent, child])).toBe(parent);
  });

  it("FIX 3: a genuinely non-matching author present in the table still resolves to undefined - discriminates an over-permissive authorsMatch stub", () => {
    const child = makeRow({ id: "child", author: "Maria Alvarez", threadPosition: "reply", replyingToAuthor: "Nobody Here" });
    const unrelated = makeRow({ id: "unrelated", author: "Priya Shah", threadPosition: "root" });
    // Under the real authorsMatch, "Priya Shah" does not match "Nobody Here" -
    // zero matches, undefined. Under `() => true` (the dangerous stub this
    // case exists to catch), "unrelated" would wrongly count as the single
    // match and the wrapper would return it instead.
    expect(resolveDraftParent(child, [unrelated, child])).toBeUndefined();
  });
});

describe("mergeCapturedPosts / resolveDraftParent integration (T4 + T4a)", () => {
  it("a post first captured with no thread reading, then recaptured with one, still merges into one row through the live mergeCapturedPosts boundary", () => {
    // NOTE on scope: this exercises mergeCapturedPosts (which calls
    // isSamePost internally) rather than proving the isSamePost sabotage
    // directly - mergeCapturedPosts' own isSamePost call site never forwards
    // threadPosition on the EXISTING-row side (`{ author: r.author, text:
    // r.post, postedAt: r.postedAt }` has no threadPosition key at all), so
    // a threadPosition-added-to-isSamePost regression is caught by the
    // direct "isSamePost does not consider threadPosition (T4)" test above,
    // not by this one. What this test pins instead is the end-to-end shape
    // T4/T4a exist to guarantee: differently-threaded reads of the same post
    // merge, and the merged row picks up the reconciled reading.
    const text = "This is a long enough post to pass the token-count floor easily, with plenty of words in it.";
    const existing = makeRow({ id: "a", author: "Maria Alvarez", post: text }); // threadPosition undefined - nothing read yet
    const { rows, addedIds } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text, threadPosition: "reply" }], 6000);
    expect(rows.length).toBe(1); // still one row, not two
    expect(addedIds.length).toBe(0); // no new row was minted
    expect(rows[0].threadPosition).toBe("reply"); // and the reconciled reading landed on it
  });
});
