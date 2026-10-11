import { afterEach, describe, expect, it } from "vitest";
import {
  COMPOSER_HEIGHT_STORAGE_KEY,
  COMPOSER_MAX_HEIGHT_PX,
  COMPOSER_MIN_HEIGHT_PX,
  loadComposerHeight,
  parseComposerHeight,
  persistComposerHeight,
} from "./composerHeight";

const store = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => void store.set(k, v),
};
const g = globalThis as { window?: unknown; localStorage?: unknown };

function installStorage(): void {
  store.clear();
  g.window = {};
  g.localStorage = fakeStorage;
}

afterEach(() => {
  delete g.window;
  delete g.localStorage;
});

describe("composerHeight", () => {
  it("uses the frozen ta- key", () => {
    expect(COMPOSER_HEIGHT_STORAGE_KEY).toBe("ta-grading-chat-composer-height");
  });

  it("parses, rounds and clamps", () => {
    expect(parseComposerHeight("200.4")).toBe(200);
    expect(parseComposerHeight(5)).toBe(COMPOSER_MIN_HEIGHT_PX);
    expect(parseComposerHeight(99999)).toBe(COMPOSER_MAX_HEIGHT_PX);
  });

  it("rejects unusable values", () => {
    expect(parseComposerHeight(null)).toBeNull();
    expect(parseComposerHeight("")).toBeNull();
    expect(parseComposerHeight("abc")).toBeNull();
    expect(parseComposerHeight(Number.NaN)).toBeNull();
  });

  it("round-trips through storage", () => {
    installStorage();
    expect(loadComposerHeight()).toBeNull();
    expect(persistComposerHeight(300)).toBe(300);
    expect(store.get(COMPOSER_HEIGHT_STORAGE_KEY)).toBe("300");
    expect(loadComposerHeight()).toBe(300);
  });

  it("degrades when storage throws", () => {
    g.window = {};
    g.localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadComposerHeight()).toBeNull();
    expect(persistComposerHeight(300)).toBe(300);
  });
});
