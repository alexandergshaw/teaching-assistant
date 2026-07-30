import { describe, it, expect } from "vitest";
import {
  CHAT_ATTACHMENT_BUDGET_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  trimAttachmentsToBudget,
  checkAttachmentCap,
  checkAttachmentByteBudget,
  isFileDragTypes,
  formatMB,
} from "./attachments";
import type { ChatAttachment, ChatMessage } from "./types";

function makeAttachment(name: string, sizeBytes: number): ChatAttachment {
  return { name, mimeType: "text/plain", base64: "a".repeat(sizeBytes) };
}

function userMsg(text: string, attachments?: ChatAttachment[]): ChatMessage {
  return { role: "user", text, ...(attachments ? { attachments } : {}) };
}

function assistantMsg(text: string): ChatMessage {
  return { role: "assistant", text };
}

describe("trimAttachmentsToBudget", () => {
  it("returns an empty transcript unchanged", () => {
    const result = trimAttachmentsToBudget([], 1000);
    expect(result).toEqual({ messages: [], droppedNames: [] });
  });

  it("leaves a transcript under budget completely untouched", () => {
    const messages: ChatMessage[] = [
      userMsg("hello", [makeAttachment("a.txt", 100)]),
      assistantMsg("hi there"),
      userMsg("follow-up", [makeAttachment("b.txt", 100)]),
    ];

    const result = trimAttachmentsToBudget(messages, 1000);

    expect(result.droppedNames).toEqual([]);
    expect(result.rejected).toBeUndefined();
    expect(result.messages).toEqual(messages);
    // Same reference for the untouched fast path.
    expect(result.messages).toBe(messages);
  });

  it("drops the oldest attachments first when over budget, never touching the newest message", () => {
    const oldest = makeAttachment("oldest.txt", 400);
    const middle = makeAttachment("middle.txt", 400);
    const newest = makeAttachment("newest.txt", 400);

    const messages: ChatMessage[] = [
      userMsg("turn 1", [oldest]),
      assistantMsg("reply 1"),
      userMsg("turn 2", [middle]),
      assistantMsg("reply 2"),
      userMsg("turn 3", [newest]),
    ];

    // Budget only has room for the newest attachment plus one more.
    const result = trimAttachmentsToBudget(messages, 900);

    expect(result.rejected).toBeUndefined();
    expect(result.droppedNames).toEqual(["oldest.txt"]);

    // Newest message's attachments are untouched.
    expect(result.messages[4].attachments).toEqual([newest]);
    // The oldest turn's attachment array is now empty; the middle one survived.
    expect(result.messages[0].attachments).toEqual([]);
    expect(result.messages[2].attachments).toEqual([middle]);

    // Non-attachment messages pass through unchanged.
    expect(result.messages[1]).toBe(messages[1]);
    expect(result.messages[3]).toBe(messages[3]);
  });

  it("never drops the newest user message's own attachments, even if that means dropping everything else", () => {
    const oldest = makeAttachment("oldest.txt", 900);
    const newest = makeAttachment("newest.txt", 900);

    const messages: ChatMessage[] = [
      userMsg("turn 1", [oldest]),
      assistantMsg("reply 1"),
      userMsg("turn 2", [newest]),
    ];

    const result = trimAttachmentsToBudget(messages, 1000);

    expect(result.rejected).toBeUndefined();
    expect(result.messages[2].attachments).toEqual([newest]);
    expect(result.messages[0].attachments).toEqual([]);
    expect(result.droppedNames).toEqual(["oldest.txt"]);
  });

  it("rejects the send when the newest user message alone exceeds the budget", () => {
    const tooBig = makeAttachment("huge.pdf", 2000);
    const messages: ChatMessage[] = [userMsg("turn 1", [tooBig])];

    const result = trimAttachmentsToBudget(messages, 1000);

    expect(result.rejected).toBeDefined();
    expect(result.rejected).toContain("limit per message");
    expect(result.droppedNames).toEqual([]);
    // Original messages are returned untouched (caller must not send them).
    expect(result.messages).toBe(messages);
  });

  it("rejects based on the newest USER message, ignoring a trailing assistant message", () => {
    const tooBig = makeAttachment("huge.pdf", 2000);
    const messages: ChatMessage[] = [
      userMsg("turn 1", [tooBig]),
      assistantMsg("reply 1"),
    ];

    const result = trimAttachmentsToBudget(messages, 1000);

    expect(result.rejected).toBeDefined();
  });

  it("exports a real, positive default budget", () => {
    expect(CHAT_ATTACHMENT_BUDGET_BYTES).toBeGreaterThan(0);
  });

  it("is pure - calling it twice with the same input produces the same output", () => {
    const messages: ChatMessage[] = [
      userMsg("turn 1", [makeAttachment("a.txt", 600)]),
      userMsg("turn 2", [makeAttachment("b.txt", 600)]),
    ];

    const first = trimAttachmentsToBudget(messages, 1000);
    const second = trimAttachmentsToBudget(messages, 1000);

    expect(first).toEqual(second);
    // The input array itself must never be mutated.
    expect(messages[0].attachments).toHaveLength(1);
    expect(messages[1].attachments).toHaveLength(1);
  });
});

describe("formatMB", () => {
  it("formats bytes as a one-decimal MB string", () => {
    expect(formatMB(1024 * 1024)).toBe("1.0MB");
    expect(formatMB(3.5 * 1024 * 1024)).toBe("3.5MB");
  });
});

describe("checkAttachmentCap - shared by the paperclip control and drag-and-drop", () => {
  it("allows a count at or under the max", () => {
    expect(checkAttachmentCap(0, 6, 6)).toEqual({ ok: true });
    expect(checkAttachmentCap(2, 4, 6)).toEqual({ ok: true });
  });

  it("refuses a count over the max, with the exact refusal wording the paperclip control already used", () => {
    const result = checkAttachmentCap(4, 3, 6);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("You can attach up to 6 files per message.");
  });

  it("uses the app's real MAX_ATTACHMENTS_PER_MESSAGE constant, not a hardcoded number, when called with it", () => {
    expect(checkAttachmentCap(0, MAX_ATTACHMENTS_PER_MESSAGE, MAX_ATTACHMENTS_PER_MESSAGE)).toEqual({ ok: true });
    expect(checkAttachmentCap(0, MAX_ATTACHMENTS_PER_MESSAGE + 1, MAX_ATTACHMENTS_PER_MESSAGE).ok).toBe(false);
  });
});

describe("checkAttachmentByteBudget - shared by the paperclip control and drag-and-drop", () => {
  it("allows a total at or under the budget", () => {
    expect(checkAttachmentByteBudget(0, 1000, 1000)).toEqual({ ok: true });
    expect(checkAttachmentByteBudget(400, 600, 1000)).toEqual({ ok: true });
  });

  it("refuses a total over the budget, with the exact wording the paperclip control already used", () => {
    const result = checkAttachmentByteBudget(0, 2 * 1024 * 1024, 1024 * 1024);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("These files total 2.0MB, over the 1.0MB limit per message. Remove some files and try again.");
  });
});

describe("isFileDragTypes - gates which drags AiChatWindow's drop handlers intercept", () => {
  it("is true when the drag's types list includes Files", () => {
    expect(isFileDragTypes(["Files"])).toBe(true);
    expect(isFileDragTypes(["text/plain", "Files"])).toBe(true);
  });

  it("is false for a non-file drag (e.g. dragged text), so it is left to the browser's default handling", () => {
    expect(isFileDragTypes(["text/plain"])).toBe(false);
    expect(isFileDragTypes([])).toBe(false);
  });

  it("is false for null/undefined without throwing", () => {
    expect(isFileDragTypes(null)).toBe(false);
    expect(isFileDragTypes(undefined)).toBe(false);
  });
});
