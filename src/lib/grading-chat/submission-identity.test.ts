import { describe, expect, it } from "vitest";
import { indexChatSubmissionIdentities, type ChatSubmissionIdentity } from "./submission-identity";

const session = "10000000-0000-0000-0000-000000000001";
const first = "A0000000-0000-0000-0000-000000000001";
const second = "B0000000-0000-0000-0000-000000000002";
const entry = (itemId: string, ordinal: number, label: string): ChatSubmissionIdentity => ({ sessionId: session, itemId, ordinal, label });

describe("grading chat persisted submission identities", () => {
  it("keeps duplicate student labels as distinct durable IDs and refuses an ambiguous legacy lookup", () => {
    const result = indexChatSubmissionIdentities(session, [entry(second, 4, "Alex"), entry(first, 1, "Alex")], true);
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("expected a ready index");
    expect(result.items.map((item) => item.itemId)).toEqual([first.toLowerCase(), second.toLowerCase()]);
    expect(result.findByOrdinal(4)?.itemId).toBe(second.toLowerCase());
    expect(result.findById(first)?.ordinal).toBe(1);
    expect(result.findUniqueLegacyLabel("Alex")).toEqual({ kind: "ambiguous" });
    expect(result.findUniqueLegacyLabel("alex")).toEqual({ kind: "not-found" });
  });

  it("resolves a unique legacy label without converting a label into an identity", () => {
    const result = indexChatSubmissionIdentities(session, [entry(first, 0, "Student")], true);
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("expected a ready index");
    expect(result.findUniqueLegacyLabel("Student")).toEqual({ kind: "matched", itemId: first.toLowerCase() });
    expect(result.findById("Student")).toBeUndefined();
    expect(result.findByOrdinal(1)).toBeUndefined();
  });

  it("rejects incomplete, cross-session, duplicate ID and duplicate ordinal snapshots", () => {
    const a = entry(first, 0, "A");
    expect(indexChatSubmissionIdentities(session, [a], false)).toEqual({ kind: "refused", reason: "incomplete-snapshot" });
    expect(indexChatSubmissionIdentities(session, [{ ...a, sessionId: second }], true).kind).toBe("refused");
    expect(indexChatSubmissionIdentities(session, [a, entry(first.toLowerCase(), 1, "B")], true).kind).toBe("refused");
    expect(indexChatSubmissionIdentities(session, [a, entry(second, 0, "B")], true).kind).toBe("refused");
    expect(indexChatSubmissionIdentities(session, [entry(second, 2_147_483_648, "B")], true).kind).toBe("refused");
  });

  it("copies and freezes identities so later input mutation cannot redirect a lookup", () => {
    const a = entry(first, 0, "Original");
    const result = indexChatSubmissionIdentities(session, [a], true);
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("expected a ready index");
    (a as { label: string }).label = "Changed";
    expect(result.findUniqueLegacyLabel("Original")).toEqual({ kind: "matched", itemId: first.toLowerCase() });
    expect(Object.isFrozen(result.items)).toBe(true);
    expect(Object.isFrozen(result.items[0])).toBe(true);
  });
});
