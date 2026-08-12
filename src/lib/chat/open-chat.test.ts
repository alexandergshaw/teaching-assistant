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
