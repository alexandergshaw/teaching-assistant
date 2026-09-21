import { describe, it, expect } from "vitest";
import {
  optionsForChoice,
  posterFor,
  resolveHubCourseIdForCanvasUrl,
  promptDraftReceipt,
  STORAGE_KEY_PROMPT,
  browserLocalStorage,
  readStoredPrompt,
  writeStoredPrompt,
} from "./promptAnnouncementTemplate";
import {
  optionsForSlot,
  makeSlot,
  type DraftSlot,
  type ResolvedTemplate,
  type TemplateOptionSource,
} from "@/app/components/walkthrough-announcement/announcement-draft-slots";
import { DEVICE_PREFERENCE_KEYS } from "@/lib/client-state-sweep";
import { PROMPT_ANNOUNCEMENT_MAX_CHARS } from "@/lib/prompt-announcement-prompt";

const SRC: TemplateOptionSource = {
  hasPastedText: false,
  mostRecent: null,
  saved: [],
  savedState: "loaded",
};

describe("AC-4b: optionsForChoice is a sound adapter over optionsForSlot", () => {
  it("agrees with optionsForSlot across all four SavedFormatsState values, for slots differing in every OTHER field", () => {
    const choice = {
      kind: "saved" as const,
      exemplarId: "ex-1",
      label: "Week 3",
      outline: { sections: [], hasGreeting: false, hasSignOff: false, dueDateSectionIndex: null, todoSectionIndex: null, hasLinks: false },
    };
    const slotA: DraftSlot = { ...makeSlot("id-a", choice, "beginning-of-week"), posting: true, copied: true };
    const slotB: DraftSlot = { ...makeSlot("id-b", choice, "midweek"), posting: false, copied: false };
    for (const savedState of ["loading", "loaded", "failed", "timedout"] as const) {
      const src: TemplateOptionSource = { ...SRC, savedState, saved: [{ id: "ex-1", label: "Week 3", outline: choice.outline }] };
      expect(optionsForSlot(slotA, src)).toEqual(optionsForSlot(slotB, src));
      expect(optionsForChoice(choice, src)).toEqual(optionsForSlot(slotA, src));
    }
  });
});

describe("AC-11: the poster is chosen by provenance (key union derived from ResolvedTemplate['kind'])", () => {
  it("none/null map to plaintext; pasted/saved map to markdown", () => {
    expect(posterFor(null)).toBe("plaintext");
    expect(posterFor({ kind: "none" })).toBe("plaintext");
    expect(posterFor({ kind: "pasted" })).toBe("markdown");
    expect(posterFor({ kind: "saved", exemplarId: "e", label: "L" })).toBe("markdown");
  });
});

describe("AC-19/AC-10(c): promptDraftReceipt is distinct by templateApplied, at every resolved kind", () => {
  const rows: (ResolvedTemplate | null)[] = [null, { kind: "none" }, { kind: "pasted" }, { kind: "saved", exemplarId: "e", label: "L" }];
  it.each(rows)("resolved=%j: true and false receipts differ", (resolved) => {
    expect(promptDraftReceipt(resolved, true)).not.toBe(promptDraftReceipt(resolved, false));
  });
});

describe("AC-12: the identity join is institution-scoped and refuses ambiguity", () => {
  const courses = [
    { id: "hub-1", canvasUrl: "https://a.example/courses/123", institution: "school-a" },
    { id: "hub-2", canvasUrl: "https://a.example/courses/123", institution: "school-b" },
    { id: "hub-3", canvasUrl: null, institution: "school-a" },
  ];

  it("exact match returns the id", () => {
    expect(resolveHubCourseIdForCanvasUrl(courses, "https://a.example/courses/123", "school-a")).toBe("hub-1");
  });

  it("same numeric course id under a different institution returns null", () => {
    expect(resolveHubCourseIdForCanvasUrl(courses, "https://a.example/courses/123", "school-c")).toBeNull();
  });

  it("two hub courses with the same numeric id AND the same institution return null (ambiguity refused)", () => {
    const ambiguous = [
      { id: "hub-1", canvasUrl: "https://a.example/courses/999", institution: "school-a" },
      { id: "hub-2", canvasUrl: "https://a.example/courses/999", institution: "school-a" },
    ];
    expect(resolveHubCourseIdForCanvasUrl(ambiguous, "https://a.example/courses/999", "school-a")).toBeNull();
  });

  it("a trailing slash and query string still match on the parsed id", () => {
    expect(
      resolveHubCourseIdForCanvasUrl(courses, "https://a.example/courses/123/?tab=announcements", "school-a")
    ).toBe("hub-1");
  });

  it("a row with canvasUrl: null is skipped rather than throwing", () => {
    expect(() => resolveHubCourseIdForCanvasUrl(courses, "https://a.example/courses/000", "school-a")).not.toThrow();
  });

  it("no match returns null", () => {
    expect(resolveHubCourseIdForCanvasUrl(courses, "https://a.example/courses/000", "school-a")).toBeNull();
  });

  it("an empty courses array returns null", () => {
    expect(resolveHubCourseIdForCanvasUrl([], "https://a.example/courses/123", "school-a")).toBeNull();
  });
});

describe("AC-14: persisted prompt storage leaf", () => {
  it("STORAGE_KEY_PROMPT starts with ta- and is not on the sign-out keep-list", () => {
    expect(STORAGE_KEY_PROMPT.startsWith("ta-")).toBe(true);
    expect(DEVICE_PREFERENCE_KEYS).not.toContain(STORAGE_KEY_PROMPT);
  });

  it("(a) SSR: under vitest's node environment, window is undefined", () => {
    expect(typeof window).toBe("undefined");
    expect(browserLocalStorage()).toBeNull();
    expect(readStoredPrompt(browserLocalStorage)).toBe("");
  });

  function fakeStorage(initial: Record<string, string> = {}): Storage {
    const store = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
  }

  it("(b) a throwing getter degrades to empty string on read, never throws", () => {
    const getter = () => {
      throw new Error("blocked");
    };
    expect(readStoredPrompt(getter)).toBe("");
  });

  it("(c) a throwing setItem, and a throwing getter, never propagate on write", () => {
    const throwingStorage = { setItem: () => { throw new DOMException("blocked"); } } as unknown as Storage;
    expect(() => writeStoredPrompt(() => throwingStorage, "hello")).not.toThrow();
    expect(() => writeStoredPrompt(() => { throw new Error("blocked"); }, "hello")).not.toThrow();
  });

  it("(d) round trip, and the cap is applied on both sides", () => {
    const storage = fakeStorage();
    writeStoredPrompt(() => storage, "hello world");
    expect(readStoredPrompt(() => storage)).toBe("hello world");

    const over = "x".repeat(PROMPT_ANNOUNCEMENT_MAX_CHARS + 500);
    writeStoredPrompt(() => storage, over);
    expect(readStoredPrompt(() => storage).length).toBe(PROMPT_ANNOUNCEMENT_MAX_CHARS);

    const storage2 = fakeStorage({ [STORAGE_KEY_PROMPT]: "y".repeat(PROMPT_ANNOUNCEMENT_MAX_CHARS + 100) });
    expect(readStoredPrompt(() => storage2).length).toBe(PROMPT_ANNOUNCEMENT_MAX_CHARS);
  });
});
