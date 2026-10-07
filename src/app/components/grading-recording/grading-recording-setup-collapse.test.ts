import { describe, it, expect, afterEach, vi } from "vitest";
import {
  isSetupCollapsed,
  resolveSetupOpen,
  loadSetupOpen,
  saveSetupOpen,
  type SetupCollapseInput,
} from "./grading-recording-setup-collapse";

// Frozen input -> output table.
const TABLE: Array<[SetupCollapseInput, boolean]> = [
  [{ capturing: false, totalCount: 0, rubricPresent: false }, false],
  [{ capturing: false, totalCount: 0, rubricPresent: true }, false],
  [{ capturing: true, totalCount: 0, rubricPresent: false }, true],
  [{ capturing: true, totalCount: 5, rubricPresent: true }, true],
  [{ capturing: true, totalCount: 5, rubricPresent: false }, true],
  [{ capturing: false, totalCount: 5, rubricPresent: true }, true],
  [{ capturing: false, totalCount: 5, rubricPresent: false }, false],
];

describe("isSetupCollapsed", () => {
  it.each(TABLE)("%j -> collapsed %s", (input, expected) => {
    expect(isSetupCollapsed(input)).toBe(expected);
  });
});

describe("resolveSetupOpen", () => {
  const collapsed: SetupCollapseInput = { capturing: true, totalCount: 0, rubricPresent: false };
  const fresh: SetupCollapseInput = { capturing: false, totalCount: 0, rubricPresent: false };
  it("follows the automatic decision when the user never chose", () => {
    expect(resolveSetupOpen(collapsed, null)).toBe(false);
    expect(resolveSetupOpen(fresh, null)).toBe(true);
  });
  it("the user's saved choice wins over the automatic decision", () => {
    expect(resolveSetupOpen(collapsed, true)).toBe(true);
    expect(resolveSetupOpen(fresh, false)).toBe(false);
  });
});

describe("loadSetupOpen / saveSetupOpen", () => {
  afterEach(() => vi.unstubAllGlobals());
  function stubStorage(initial: Record<string, string> = {}): Record<string, string> {
    const store: Record<string, string> = { ...initial };
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });
    return store;
  }
  it("round-trips an explicit choice under ta-rec-grade-setup-open", () => {
    const store = stubStorage();
    expect(loadSetupOpen()).toBeNull();
    saveSetupOpen(true);
    expect(store["ta-rec-grade-setup-open"]).toBe("1");
    expect(loadSetupOpen()).toBe(true);
    saveSetupOpen(false);
    expect(loadSetupOpen()).toBe(false);
  });
  it("treats garbage as no choice", () => {
    stubStorage({ "ta-rec-grade-setup-open": "maybe" });
    expect(loadSetupOpen()).toBeNull();
  });
  it("returns null when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadSetupOpen()).toBeNull();
  });
});
