// vitest runs in a node environment, so a minimal in-memory Storage and a
// window global are stubbed per test and restored afterward (duplicated from
// the shared leaf's own test on purpose: importing another test file would
// re-run its describe blocks).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CHAT_RUBRIC_MEMORY_KEY,
  deriveChatScope,
  describeChatSetupOrigin,
  loadChatSetupMemory,
  saveChatSetupMemory,
} from "./chatSetupMemory";

class FakeStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

let fakeStorage: FakeStorage;
const originalWindow = (globalThis as { window?: unknown }).window;
const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

beforeEach(() => {
  fakeStorage = new FakeStorage();
  (globalThis as { window?: unknown }).window = globalThis;
  (globalThis as { localStorage?: unknown }).localStorage = fakeStorage;
});

afterEach(() => {
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = originalWindow;

  if (originalLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
  else (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
});

const URL_A = "https://school.instructure.com/courses/1/assignments/2";
const URL_B = "https://school.instructure.com/courses/1/assignments/9";

describe("deriveChatScope", () => {
  it("is empty for a blank url (nothing known yet)", () => {
    expect(deriveChatScope("")).toBe("");
    expect(deriveChatScope("   ")).toBe("");
  });

  it("prefixes the trimmed canvas url", () => {
    expect(deriveChatScope(URL_A)).toBe("canvas:" + URL_A);
    expect(deriveChatScope("  " + URL_A + "  ")).toBe("canvas:" + URL_A);
  });

  it("distinct assignments get distinct scopes", () => {
    expect(deriveChatScope(URL_A)).not.toBe(deriveChatScope(URL_B));
  });

  it("a non-canvas url yields no scope", () => {
    expect(deriveChatScope("https://github.com/owner/repo")).toBe("");
  });
});

describe("chat setup memory - scope by url, origin always labelled", () => {
  it("restores each assignment under its own scope with no crossing", () => {
    saveChatSetupMemory(deriveChatScope(URL_A), { rubric: "RUBRIC-A" });
    saveChatSetupMemory(deriveChatScope(URL_B), { rubric: "RUBRIC-B" });
    expect(loadChatSetupMemory(deriveChatScope(URL_A))?.entry.rubric).toBe("RUBRIC-A");
    expect(loadChatSetupMemory(deriveChatScope(URL_B))?.entry.rubric).toBe("RUBRIC-B");
  });

  it("an empty scope never restores", () => {
    saveChatSetupMemory(deriveChatScope(URL_A), { rubric: "RUBRIC-A" });
    expect(loadChatSetupMemory("")).toBeNull();
  });

  it("a fallback is labelled with the scope it came from, never the requested one", () => {
    saveChatSetupMemory(deriveChatScope(URL_A), { rubric: "RUBRIC-A" });
    const requested = deriveChatScope(URL_B);
    const loaded = loadChatSetupMemory(requested);
    expect(loaded).not.toBeNull();
    expect(loaded!.scope).toBe(deriveChatScope(URL_A));
    const label = describeChatSetupOrigin(loaded!, requested);
    expect(label.length).toBeGreaterThan(0);
    expect(label).toContain(URL_A);
    expect(label).not.toContain(URL_B);
  });
});

describe("chat setup memory - the older global slots are never rewritten", () => {
  it("saving writes only the chat's own key", () => {
    fakeStorage.setItem("ta-grading-chat-instructions", "LEGACY-INS");
    fakeStorage.setItem("ta-grading-chat-rubric", "LEGACY-RUB");
    saveChatSetupMemory(deriveChatScope(URL_A), { rubric: "RUBRIC-A" });
    expect(fakeStorage.getItem("ta-grading-chat-instructions")).toBe("LEGACY-INS");
    expect(fakeStorage.getItem("ta-grading-chat-rubric")).toBe("LEGACY-RUB");
    expect(fakeStorage.getItem(CHAT_RUBRIC_MEMORY_KEY)).not.toBeNull();
  });
});
