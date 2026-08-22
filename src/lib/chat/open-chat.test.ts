import { describe, it, expect } from "vitest";
import { OPEN_AI_CHAT_EVENT, parseOpenChatDetail } from "./open-chat";

describe("parseOpenChatDetail", () => {
  it("parses undefined (ContextMenu.tsx's no-detail dispatch) to null, not a throw", () => {
    // This is the exact regression this parser exists to prevent:
    // window.dispatchEvent(new CustomEvent("open-ai-chat")) leaves `detail`
    // undefined, and that must keep opening the chat with no context.
    expect(() => parseOpenChatDetail(undefined)).not.toThrow();
    expect(parseOpenChatDetail(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseOpenChatDetail(null)).toBeNull();
  });

  it("returns null for a string", () => {
    expect(parseOpenChatDetail("knowledgePageIds")).toBeNull();
  });

  it("returns null for a number", () => {
    expect(parseOpenChatDetail(42)).toBeNull();
  });

  it("returns null for an array", () => {
    expect(parseOpenChatDetail(["a", "b"])).toBeNull();
  });

  it("ignores a non-array knowledgePageIds and degrades to null when nothing else is usable", () => {
    expect(parseOpenChatDetail({ knowledgePageIds: "not-an-array" })).toBeNull();
  });

  it("filters non-string entries out of knowledgePageIds", () => {
    const result = parseOpenChatDetail({
      knowledgePageIds: ["a", 1, null, "b", undefined, {}, "c"],
    });
    expect(result).toEqual({ knowledgePageIds: ["a", "b", "c"] });
  });

  it("accepts a valid payload with both fields", () => {
    const result = parseOpenChatDetail({
      knowledgePageIds: ["page-1", "page-2"],
      label: "2 pages",
    });
    expect(result).toEqual({ knowledgePageIds: ["page-1", "page-2"], label: "2 pages" });
  });

  it("tolerates a missing label", () => {
    const result = parseOpenChatDetail({ knowledgePageIds: ["page-1"] });
    expect(result).toEqual({ knowledgePageIds: ["page-1"] });
    expect(result?.label).toBeUndefined();
  });

  it("keeps a valid label even when knowledgePageIds is absent", () => {
    const result = parseOpenChatDetail({ label: "3 pages" });
    expect(result).toEqual({ label: "3 pages" });
  });

  it("ignores a non-string label", () => {
    const result = parseOpenChatDetail({ knowledgePageIds: ["page-1"], label: 5 });
    expect(result).toEqual({ knowledgePageIds: ["page-1"] });
  });

  it("returns null for an empty object", () => {
    expect(parseOpenChatDetail({})).toBeNull();
  });
});

describe("OPEN_AI_CHAT_EVENT", () => {
  it("is the string both the dispatcher and the listener must agree on", () => {
    expect(OPEN_AI_CHAT_EVENT).toBe("open-ai-chat");
  });
});

// C1: parseOpenChatDetail accepting a selectionContext (Modules bulk-select
// "Ask AI") alongside the pre-existing knowledgePageIds/label fields. Every
// test in the two describe blocks above must keep passing unchanged - these
// are ADDITIONS, not replacements, mirroring C8's "purely additive" rule for
// the wire payload itself.
describe("parseOpenChatDetail - selectionContext (C1)", () => {
  it("accepts a selectionContext with non-empty text", () => {
    const result = parseOpenChatDetail({ selectionContext: { text: "Week 3 notes." } });
    expect(result).toEqual({ selectionContext: { text: "Week 3 notes." } });
  });

  it("keeps a valid label alongside the text", () => {
    const result = parseOpenChatDetail({
      selectionContext: { text: "Week 3 notes.", label: "12 items from 2 modules" },
    });
    expect(result).toEqual({
      selectionContext: { text: "Week 3 notes.", label: "12 items from 2 modules" },
    });
  });

  it("ignores a non-string label but keeps the text", () => {
    const result = parseOpenChatDetail({ selectionContext: { text: "Week 3 notes.", label: 5 } });
    expect(result).toEqual({ selectionContext: { text: "Week 3 notes." } });
  });

  it("degrades to null when selectionContext.text is empty", () => {
    expect(parseOpenChatDetail({ selectionContext: { text: "" } })).toBeNull();
  });

  it("degrades to null when selectionContext.text is whitespace-only", () => {
    expect(parseOpenChatDetail({ selectionContext: { text: "   " } })).toBeNull();
  });

  it("degrades to null when selectionContext.text is missing entirely", () => {
    expect(parseOpenChatDetail({ selectionContext: { label: "1 item" } })).toBeNull();
  });

  it("degrades to null when selectionContext.text is not a string", () => {
    expect(parseOpenChatDetail({ selectionContext: { text: 42 } })).toBeNull();
  });

  it("ignores a selectionContext that is an array rather than an object", () => {
    expect(parseOpenChatDetail({ selectionContext: ["Week 3 notes."] })).toBeNull();
  });

  it("ignores a selectionContext that is null", () => {
    expect(parseOpenChatDetail({ selectionContext: null })).toBeNull();
  });

  it("ignores a selectionContext that is a primitive, not an object", () => {
    expect(parseOpenChatDetail({ selectionContext: "Week 3 notes." })).toBeNull();
  });

  it("never throws on a malformed selectionContext", () => {
    expect(() => parseOpenChatDetail({ selectionContext: 42 })).not.toThrow();
    expect(() => parseOpenChatDetail({ selectionContext: [] })).not.toThrow();
    expect(() => parseOpenChatDetail({ selectionContext: {} })).not.toThrow();
  });

  it("combines knowledgePageIds and selectionContext when a dispatch carries both (C3)", () => {
    const result = parseOpenChatDetail({
      knowledgePageIds: ["page-1"],
      selectionContext: { text: "Week 3 notes.", label: "1 item" },
    });
    expect(result).toEqual({
      knowledgePageIds: ["page-1"],
      selectionContext: { text: "Week 3 notes.", label: "1 item" },
    });
  });

  it("keeps a usable selectionContext even when knowledgePageIds is malformed", () => {
    const result = parseOpenChatDetail({
      knowledgePageIds: "not-an-array",
      selectionContext: { text: "Week 3 notes." },
    });
    expect(result).toEqual({ selectionContext: { text: "Week 3 notes." } });
  });

  it("still returns null for an empty object once selectionContext is also considered", () => {
    // Regression guard: adding this field must not change what an empty
    // object parses to.
    expect(parseOpenChatDetail({})).toBeNull();
  });

  it("still returns null for the zero-detail dispatch once selectionContext is also considered", () => {
    expect(parseOpenChatDetail(undefined)).toBeNull();
  });
});
