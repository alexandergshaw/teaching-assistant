import { describe, it, expect } from "vitest";
import {
  STORAGE_KEY_COURSE,
  STORAGE_KEY_DRAFTS,
  readStoredCourse,
  readStoredDrafts,
  writeStoredCourse,
  writeStoredDraft,
} from "./bulk-message-storage";
import type { ComposeFields } from "./bulk-message-model";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const throwing = (): Storage | null => {
  throw new Error("blocked");
};

describe("AC-W3-11 storage leaf", () => {
  it("an absent store reads defaults", () => {
    const s = memoryStorage();
    expect(readStoredCourse(() => s)).toBe("");
    expect(readStoredDrafts(() => s)).toEqual({});
    expect(readStoredCourse(() => null)).toBe("");
    expect(readStoredDrafts(() => null)).toEqual({});
  });
  it("malformed JSON reads defaults and never throws", () => {
    const s = memoryStorage();
    s.setItem(STORAGE_KEY_DRAFTS, "{not json");
    expect(readStoredDrafts(() => s)).toEqual({});
    s.setItem(STORAGE_KEY_DRAFTS, "[1,2]");
    expect(readStoredDrafts(() => s)).toEqual({});
  });
  it("a throwing storage thunk never escapes", () => {
    expect(readStoredCourse(throwing)).toBe("");
    expect(readStoredDrafts(throwing)).toEqual({});
    expect(() => writeStoredCourse(throwing, "c1")).not.toThrow();
    expect(() => writeStoredDraft(throwing, "c1", { subject: "s", body: "b", prompt: "p" })).not.toThrow();
  });
  it("stores ONLY subject, body and prompt, even when handed extra fields", () => {
    const s = memoryStorage();
    const withExtra = { subject: "s", body: "b", prompt: "p", armed: "sig", preview: { count: 5 } };
    const asFields: ComposeFields = withExtra;
    writeStoredDraft(() => s, "c1", asFields);
    const raw: unknown = JSON.parse(s.getItem(STORAGE_KEY_DRAFTS) ?? "{}");
    expect(raw).toEqual({ c1: { subject: "s", body: "b", prompt: "p" } });
    const stored = s.getItem(STORAGE_KEY_DRAFTS) ?? "";
    expect(stored).not.toContain("armed");
    expect(stored).not.toContain("preview");
  });
  it("round-trips the three fields per course and keeps other courses", () => {
    const s = memoryStorage();
    writeStoredDraft(() => s, "c1", { subject: "s1", body: "b1", prompt: "p1" });
    writeStoredDraft(() => s, "c2", { subject: "s2", body: "b2", prompt: "p2" });
    expect(readStoredDrafts(() => s)).toEqual({
      c1: { subject: "s1", body: "b1", prompt: "p1" },
      c2: { subject: "s2", body: "b2", prompt: "p2" },
    });
    writeStoredCourse(() => s, "c2");
    expect(readStoredCourse(() => s)).toBe("c2");
  });
  it("an all-empty draft removes that course's entry", () => {
    const s = memoryStorage();
    writeStoredDraft(() => s, "c1", { subject: "s", body: "b", prompt: "p" });
    writeStoredDraft(() => s, "c1", { subject: "", body: "", prompt: "" });
    expect(readStoredDrafts(() => s)).toEqual({});
  });
  it("uses exactly the two ta- keys", () => {
    expect(STORAGE_KEY_COURSE).toBe("ta-bulk-msg-course");
    expect(STORAGE_KEY_DRAFTS).toBe("ta-bulk-msg-drafts");
  });
});
