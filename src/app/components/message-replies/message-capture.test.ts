// Unit tests for message-capture.ts - the copies docs/message-replies-
// acceptance-criteria.md section 0/9 orders, retyped for MessageThreadRow.

import { describe, it, expect } from "vitest";
import {
  sortMessageRows,
  swapAdjacentThreads,
  messageClipboardText,
  draftingArmSignature,
  coerceMessageComposition,
} from "./message-capture";
import type { MessageThreadRow, ThreadMessage } from "./message-serialization";

function makeMessage(overrides: Partial<ThreadMessage> & Pick<ThreadMessage, "text" | "fromMe">): ThreadMessage {
  return { sender: "", precision: "none", ...overrides };
}

function makeRow(overrides: Partial<MessageThreadRow> & Pick<MessageThreadRow, "id">): MessageThreadRow {
  return {
    subject: "",
    student: "",
    messages: [makeMessage({ text: "hi", fromMe: false })],
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

describe("sortMessageRows", () => {
  it("'captured' delegates to message-thread.ts's sortThreads (descending latest-incoming time)", () => {
    const older = makeRow({ id: "a", messages: [makeMessage({ text: "x", fromMe: false, sentAtMs: 100 })] });
    const newer = makeRow({ id: "b", messages: [makeMessage({ text: "y", fromMe: false, sentAtMs: 200 })] });
    expect(sortMessageRows([older, newer], "captured").map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("'custom' sorts by the row's own `order` ascending", () => {
    const rows = [makeRow({ id: "b", order: 2 }), makeRow({ id: "a", order: 1 })];
    expect(sortMessageRows(rows, "custom").map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("'first-asc'/'last-asc' sort by the derived student first/last name, blank surname sorting last", () => {
    const rows = [makeRow({ id: "z", student: "Zed Smith" }), makeRow({ id: "a", student: "Amy Jones" }), makeRow({ id: "solo", student: "Robin" })];
    expect(sortMessageRows(rows, "first-asc").map((r) => r.id)).toEqual(["a", "solo", "z"]);
    expect(sortMessageRows(rows, "last-asc").map((r) => r.id)).toEqual(["a", "z", "solo"]); // "Robin" has no derivable surname -> sorts last
  });

  it("'subject-asc'/'subject-desc' sort on the literal subject string, blank sorting last in both directions", () => {
    const rows = [makeRow({ id: "c", subject: "Cats" }), makeRow({ id: "b", subject: "Birds" }), makeRow({ id: "none", subject: "" })];
    expect(sortMessageRows(rows, "subject-asc").map((r) => r.id)).toEqual(["b", "c", "none"]);
    expect(sortMessageRows(rows, "subject-desc").map((r) => r.id)).toEqual(["c", "b", "none"]);
  });

  it("preserves row object identity - never rebuilds a row while sorting", () => {
    const a = makeRow({ id: "a", order: 0 });
    const b = makeRow({ id: "b", order: 1 });
    const sorted = sortMessageRows([a, b], "custom");
    expect(sorted[0]).toBe(a);
    expect(sorted[1]).toBe(b);
  });
});

describe("swapAdjacentThreads", () => {
  it("exchanges the two ids' order values and reports sort: 'custom'", () => {
    const a = makeRow({ id: "a", order: 0 });
    const b = makeRow({ id: "b", order: 1 });
    const result = swapAdjacentThreads([a, b], "custom", "a", "b");
    expect(result.sort).toBe("custom");
    expect(result.rows.find((r) => r.id === "a")!.order).toBe(1);
    expect(result.rows.find((r) => r.id === "b")!.order).toBe(0);
  });

  it("rewrites every row's order to its displayed index first when leaving a non-custom sort", () => {
    const a = makeRow({ id: "a", order: 99 });
    const b = makeRow({ id: "b", order: 3 });
    const result = swapAdjacentThreads([a, b], "captured", "a", "b");
    expect(result.rows.find((r) => r.id === "a")!.order).toBe(1);
    expect(result.rows.find((r) => r.id === "b")!.order).toBe(0);
  });

  it("no-ops (atBoundary: false) when an id is not present", () => {
    const a = makeRow({ id: "a" });
    const result = swapAdjacentThreads([a], "custom", "a", "missing");
    expect(result.atBoundary).toBe(false);
    expect(result.rows).toEqual([a]);
  });
});

describe("messageClipboardText", () => {
  it("is exactly the reply body (no resource lane)", () => {
    expect(messageClipboardText({ reply: "Sure, here you go." })).toBe("Sure, here you go.");
  });
});

describe("draftingArmSignature", () => {
  const base = { rowCount: 3, courseId: "c1", ingredients: ["acknowledge", "answer"], addressByName: true, formality: "balanced", skipAnswered: true };

  it("varying rowCount changes the signature", () => {
    expect(draftingArmSignature(base)).not.toBe(draftingArmSignature({ ...base, rowCount: 4 }));
  });
  it("varying courseId changes the signature", () => {
    expect(draftingArmSignature(base)).not.toBe(draftingArmSignature({ ...base, courseId: "c2" }));
  });
  it("varying ingredients changes the signature", () => {
    expect(draftingArmSignature(base)).not.toBe(draftingArmSignature({ ...base, ingredients: ["acknowledge"] }));
  });
  it("varying addressByName changes the signature", () => {
    expect(draftingArmSignature(base)).not.toBe(draftingArmSignature({ ...base, addressByName: false }));
  });
  it("varying formality changes the signature", () => {
    expect(draftingArmSignature(base)).not.toBe(draftingArmSignature({ ...base, formality: "casual" }));
  });
  it("varying skipAnswered changes the signature", () => {
    expect(draftingArmSignature(base)).not.toBe(draftingArmSignature({ ...base, skipAnswered: false }));
  });
});

describe("coerceMessageComposition", () => {
  it("falls back to the default ingredient set on null/malformed input, but keeps zero ingredients when the array is genuinely empty", () => {
    expect(coerceMessageComposition(null, null, null).ingredients).toEqual(["acknowledge", "answer", "next-step"]);
    expect(coerceMessageComposition("not json", null, null).ingredients).toEqual(["acknowledge", "answer", "next-step"]);
    expect(coerceMessageComposition("[]", null, null).ingredients).toEqual([]);
  });

  it("drops an unrecognised ingredient and de-duplicates, preserving insertion order", () => {
    const result = coerceMessageComposition(JSON.stringify(["answer", "bogus", "answer", "acknowledge"]), null, null);
    expect(result.ingredients).toEqual(["answer", "acknowledge"]);
  });

  it("addressByName defaults true; only an explicit '0' turns it off", () => {
    expect(coerceMessageComposition(null, null, null).addressByName).toBe(true);
    expect(coerceMessageComposition(null, "0", null).addressByName).toBe(false);
    expect(coerceMessageComposition(null, "garbage", null).addressByName).toBe(true);
  });

  it("formality falls back to 'balanced' for anything outside the closed stop set", () => {
    expect(coerceMessageComposition(null, null, null).formality).toBe("balanced");
    expect(coerceMessageComposition(null, null, "casual").formality).toBe("casual");
    expect(coerceMessageComposition(null, null, "bogus").formality).toBe("balanced");
  });
});
