// Unit tests for discussion-thread.ts - the leaf discussion-capture.ts's
// thread-structure logic was extracted into (FIX 2, this pass's line-ceiling
// fix; see that file's header for the full rationale and the import
// direction, and see discussion-capture.thread.test.ts for the T2b
// serialization tests and the mergeCapturedPosts-level T4/T4a integration
// tests, which stay there because mergeCapturedPosts itself did not move).
//
// docs/discussion-thread-structure-acceptance-criteria.md T2, T4a, T6, T6c.
//
// `authorsMatch` is imported from ./discussion-capture below purely for TEST
// purposes - this is a test file importing a production function, not a
// cross-test-file import (the no-cross-test-file-imports lesson is about one
// *.test.ts importing from another *.test.ts's fixtures/helpers, which would
// re-run that file's own describe blocks; importing a plain function from a
// production module has no such effect). It does not reintroduce the cycle
// this file's own header warns against: discussion-thread.ts (the production
// module under test here) still never imports from discussion-capture.ts -
// only this test file does, and test files are not part of the app's import
// graph.
//
// Fixtures are otherwise self-contained rather than imported from any
// sibling *.test.ts file, per that same lesson.
//
// Not every test in this file is sabotage-checked - only the ones explicitly
// labelled SABOTAGE CHECK have been verified by actually making the
// described regression and confirming the test goes red before reverting;
// see the report handed back to the dispatcher for that evidence. The rest
// are ordinary oracle tests, reasoned by hand against the AC rather than
// individually sabotage-verified. (A blanket "every test is sabotage-checked"
// claim was found overstated for this feature's sibling test file,
// discussion-capture.thread.test.ts, during review - this header is softened
// to match what is actually true here too, rather than repeat that claim.)

import { describe, it, expect } from "vitest";
import { VALID_THREAD_POSITIONS, reconcileThreadPosition, reconcileReplyingToAuthor, resolveDraftParent, type ThreadPosition } from "./discussion-thread";
import { authorsMatch } from "./discussion-capture";

// ---------------------------------------------------------------------------
// T2b: VALID_THREAD_POSITIONS - the three-member set deserializeReplyTable
// validates against. Full round-trip coverage of that validation lives in
// discussion-capture.thread.test.ts (it exercises deserializeReplyTable
// itself, which stays in discussion-capture.ts); this pins the set's own
// membership directly, now that it is an independently importable constant.
// ---------------------------------------------------------------------------

describe("VALID_THREAD_POSITIONS (T2b)", () => {
  it("contains exactly the three thread-position members", () => {
    expect(VALID_THREAD_POSITIONS.size).toBe(3);
    expect(VALID_THREAD_POSITIONS.has("root")).toBe(true);
    expect(VALID_THREAD_POSITIONS.has("reply")).toBe(true);
    expect(VALID_THREAD_POSITIONS.has("unknown")).toBe(true);
  });

  it("does not accept a fourth member such as 'nested'", () => {
    expect(VALID_THREAD_POSITIONS.has("nested")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T4a bullet 1 and 2: reconcileThreadPosition, tested directly now that it
// is an exported pure function rather than only reachable through
// mergeCapturedPosts. Frozen literal oracle over every case named in T4a.
// ---------------------------------------------------------------------------

describe("reconcileThreadPosition (T4a)", () => {
  it("incoming undefined - no new information, existing is kept", () => {
    expect(reconcileThreadPosition("root", undefined)).toBe("root");
  });

  it("both undefined - stays undefined", () => {
    expect(reconcileThreadPosition(undefined, undefined)).toBeUndefined();
  });

  it("existing undefined - a fresh reading fills it", () => {
    expect(reconcileThreadPosition(undefined, "reply")).toBe("reply");
  });

  it("existing 'unknown' loses to a definite incoming value", () => {
    expect(reconcileThreadPosition("unknown", "root")).toBe("root");
  });

  it("incoming 'unknown' does not overwrite a definite existing value", () => {
    expect(reconcileThreadPosition("root", "unknown")).toBe("root");
  });

  it("both 'unknown' - stays 'unknown'", () => {
    expect(reconcileThreadPosition("unknown", "unknown")).toBe("unknown");
  });

  it("agreeing 'root' readings keep 'root'", () => {
    expect(reconcileThreadPosition("root", "root")).toBe("root");
  });

  it("agreeing 'reply' readings keep 'reply'", () => {
    expect(reconcileThreadPosition("reply", "reply")).toBe("reply");
  });

  it("root existing, reply incoming - contradiction downgrades to 'unknown'", () => {
    expect(reconcileThreadPosition("root", "reply")).toBe("unknown");
  });

  it("reply existing, root incoming - contradiction downgrades to 'unknown' in the other direction too", () => {
    expect(reconcileThreadPosition("reply", "root")).toBe("unknown");
  });

  it("SABOTAGE CHECK: a 'newer value wins' regression would return 'reply' for a root/reply contradiction instead of downgrading", () => {
    const result = reconcileThreadPosition("root", "reply");
    expect(result).toBe("unknown");
    expect(result).not.toBe("reply");
  });
});

// ---------------------------------------------------------------------------
// FIX 1 + T4a bullet 3: reconcileReplyingToAuthor. Equivalence is now decided
// by authorsMatch, not `===` - the fix this pass exists to make. Longer
// reading wins on an equivalent-but-differently-spelled pair; ties keep
// `existing`, pinned explicitly since it is otherwise nondeterministic.
// ---------------------------------------------------------------------------

describe("reconcileReplyingToAuthor (FIX 1 / T4a)", () => {
  it("incoming undefined - existing is kept", () => {
    expect(reconcileReplyingToAuthor("Diego Chen", undefined, authorsMatch)).toBe("Diego Chen");
  });

  it("existing undefined - fills from incoming", () => {
    expect(reconcileReplyingToAuthor(undefined, "Diego Chen", authorsMatch)).toBe("Diego Chen");
  });

  it("both undefined - stays undefined", () => {
    expect(reconcileReplyingToAuthor(undefined, undefined, authorsMatch)).toBeUndefined();
  });

  it("FIX 1: 'Diego Chen' then 'diego chen' - a case difference alone survives instead of clearing (equal length, keeps existing)", () => {
    expect(reconcileReplyingToAuthor("Diego Chen", "diego chen", authorsMatch)).toBe("Diego Chen");
  });

  it("FIX 1: 'diego chen' then 'Diego Chen' - same case-only equivalence, reversed order, still survives", () => {
    expect(reconcileReplyingToAuthor("diego chen", "Diego Chen", authorsMatch)).toBe("diego chen");
  });

  it("FIX 1: a trailing-space-only difference survives instead of clearing", () => {
    expect(reconcileReplyingToAuthor("Diego Chen", "Diego Chen ", authorsMatch)).toBeDefined();
  });

  it("tie-break: the LONGER equivalent reading wins when it arrives as `incoming`", () => {
    // "Diego Chen" (10 chars) vs "Diego M. Chen" (13 chars, tolerated middle
    // initial per authorsMatch's own contract) - authorsMatch(a, b) is true,
    // and the longer one is kept because more of the name was visible in
    // that frame.
    expect(reconcileReplyingToAuthor("Diego Chen", "Diego M. Chen", authorsMatch)).toBe("Diego M. Chen");
  });

  it("tie-break: the LONGER equivalent reading wins even when it is `existing` (order does not decide it, length does)", () => {
    expect(reconcileReplyingToAuthor("Diego M. Chen", "Diego Chen", authorsMatch)).toBe("Diego M. Chen");
  });

  it("tie-break: equal-length equivalent readings keep `existing` - pinned because otherwise nondeterministic", () => {
    expect(reconcileReplyingToAuthor("Diego Chen", "diego chen", authorsMatch)).toBe("Diego Chen");
  });

  it("a genuine disagreement between two different people still clears the field", () => {
    expect(reconcileReplyingToAuthor("Diego Chen", "Priya Shah", authorsMatch)).toBeUndefined();
  });

  it("SABOTAGE CHECK: an exact-string-equality regression would treat 'Diego Chen'/'diego chen' as a conflict and clear the field", () => {
    // The pre-fix implementation was `existing === incoming ? existing :
    // undefined` - that would return undefined here. The fixed behaviour
    // must not.
    const result = reconcileReplyingToAuthor("Diego Chen", "diego chen", authorsMatch);
    expect(result).not.toBeUndefined();
    expect(result).toBe("Diego Chen");
  });

  it("SABOTAGE CHECK: a regression that always kept `incoming` regardless of length would fail the existing-is-longer tie-break test", () => {
    const result = reconcileReplyingToAuthor("Diego M. Chen", "Diego Chen", authorsMatch);
    expect(result).toBe("Diego M. Chen");
    expect(result).not.toBe("Diego Chen");
  });
});

// ---------------------------------------------------------------------------
// T6 / T6c: resolveDraftParent - the three-condition gate. Moved here from
// discussion-capture.thread.test.ts (FIX 2). Frozen literal oracle over
// minimal fixtures shaped to `resolveDraftParent`'s generic constraint
// (id/author/threadPosition/replyingToAuthor only - the function no longer
// needs a full ReplyRow, which is the point of the generic redesign that let
// this move without pulling ReplyRow across the import boundary).
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  author: string;
  threadPosition?: ThreadPosition;
  replyingToAuthor?: string;
}

function makeRow(overrides: Partial<Row> & Pick<Row, "id" | "author">): Row {
  return { ...overrides };
}

describe("resolveDraftParent (T6 / T6c)", () => {
  it("returns the single matching row when all three conditions hold", () => {
    const child = makeRow({ id: "child", author: "Maria Alvarez", threadPosition: "reply", replyingToAuthor: "Diego Chen" });
    const parent = makeRow({ id: "parent", author: "Diego Chen", threadPosition: "root" });
    const rows = [parent, child];
    expect(resolveDraftParent(child, rows, authorsMatch)).toBe(parent); // same reference
  });

  it("matches via authorsMatch, not exact string equality (surname-only read)", () => {
    const child = makeRow({ id: "child", author: "Maria Alvarez", threadPosition: "reply", replyingToAuthor: "Chen" });
    const parent = makeRow({ id: "parent", author: "Diego Chen", threadPosition: "root" });
    const rows = [parent, child];
    expect(resolveDraftParent(child, rows, authorsMatch)).toBe(parent);
  });

  it("returns undefined when threadPosition is not 'reply'", () => {
    const child = makeRow({ id: "child", author: "Maria Alvarez", threadPosition: "root", replyingToAuthor: "Diego Chen" });
    const parent = makeRow({ id: "parent", author: "Diego Chen" });
    expect(resolveDraftParent(child, [parent, child], authorsMatch)).toBeUndefined();
  });

  it("returns undefined when threadPosition is 'unknown'", () => {
    const child = makeRow({ id: "child", author: "Maria Alvarez", threadPosition: "unknown", replyingToAuthor: "Diego Chen" });
    const parent = makeRow({ id: "parent", author: "Diego Chen" });
    expect(resolveDraftParent(child, [parent, child], authorsMatch)).toBeUndefined();
  });

  it("returns undefined when threadPosition is undefined", () => {
    const child = makeRow({ id: "child", author: "Maria Alvarez", replyingToAuthor: "Diego Chen" });
    const parent = makeRow({ id: "parent", author: "Diego Chen" });
    expect(resolveDraftParent(child, [parent, child], authorsMatch)).toBeUndefined();
  });

  it("returns undefined when replyingToAuthor is absent", () => {
    const child = makeRow({ id: "child", author: "Maria Alvarez", threadPosition: "reply" });
    const parent = makeRow({ id: "parent", author: "Diego Chen" });
    expect(resolveDraftParent(child, [parent, child], authorsMatch)).toBeUndefined();
  });

  it("returns undefined when replyingToAuthor is an empty/whitespace-only string", () => {
    const child = makeRow({ id: "child", author: "Maria Alvarez", threadPosition: "reply", replyingToAuthor: "   " });
    const parent = makeRow({ id: "parent", author: "Diego Chen" });
    expect(resolveDraftParent(child, [parent, child], authorsMatch)).toBeUndefined();
  });

  it("returns undefined on ZERO matches - no row has that author", () => {
    const child = makeRow({ id: "child", author: "Maria Alvarez", threadPosition: "reply", replyingToAuthor: "Nobody Here" });
    const other = makeRow({ id: "other", author: "Priya Shah" });
    expect(resolveDraftParent(child, [other, child], authorsMatch)).toBeUndefined();
  });

  it("returns undefined on TWO-PLUS matches - ambiguity means no parent context, never a best guess", () => {
    const child = makeRow({ id: "child", author: "Maria Alvarez", threadPosition: "reply", replyingToAuthor: "Diego Chen" });
    const parentA = makeRow({ id: "parentA", author: "Diego Chen" });
    const parentB = makeRow({ id: "parentB", author: "Diego Chen" });
    expect(resolveDraftParent(child, [parentA, parentB, child], authorsMatch)).toBeUndefined();
  });

  it("does not match the row against itself", () => {
    // A row whose own author happens to equal its own replyingToAuthor (a
    // misread, or a genuine self-reply) must not resolve to itself.
    const child = makeRow({ id: "child", author: "Diego Chen", threadPosition: "reply", replyingToAuthor: "Diego Chen" });
    expect(resolveDraftParent(child, [child], authorsMatch)).toBeUndefined();
  });

  it("SABOTAGE CHECK: returning the FIRST match instead of requiring exactly one would pass the single-match test but fail the two-plus-match test", () => {
    const child = makeRow({ id: "child", author: "Maria Alvarez", threadPosition: "reply", replyingToAuthor: "Diego Chen" });
    const parentA = makeRow({ id: "parentA", author: "Diego Chen" });
    const parentB = makeRow({ id: "parentB", author: "Diego Chen" });
    const result = resolveDraftParent(child, [parentA, parentB, child], authorsMatch);
    // A "first match wins" regression would return parentA here.
    expect(result).toBeUndefined();
    expect(result).not.toBe(parentA);
  });
});
