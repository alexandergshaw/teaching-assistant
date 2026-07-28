import { describe, it, expect } from "vitest";
import { CHAT_ATTACHMENT_BUDGET_BYTES, trimAttachmentsToBudget } from "./attachments";
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
