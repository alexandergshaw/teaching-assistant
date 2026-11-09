import { resetSessionDiagnosticLogForTests, readSessionDiagnosticLogState } from "@/lib/session-diagnostic-log";
import { describe, it, expect, vi } from "vitest";
import { filterLibraryPage, libraryDisplayName, filterTemplateSlides, handoffTemplate, SELECTED_TEMPLATE_KEY, SELECTED_ROLE_LIBRARY_KEY, recordPowerPointDiagnostic, sourceSlidePage } from "./panel-logic";
it("filters names without conflating duplicate library identities and clamps the page after a refresh", () => {
  const entries = Array.from({ length: 13 }, (_, i) => ({ id: String(i), name: i < 2 ? "Résumé" : `Class ${i}` }));
  expect(filterLibraryPage(entries, " re\u0301sume\u0301 ", 1).items.map((item) => item.id)).toEqual(["0", "1"]);
  expect(filterLibraryPage(entries, "CLASS", 2).items.map((item) => item.id)).toEqual(["12"]);
  expect(filterLibraryPage(entries.slice(0, 2), "", 9)).toMatchObject({ matches: 2, current: 1, pages: 1 });
  expect(filterLibraryPage(entries, "missing", 1)).toMatchObject({ matches: 0, items: [] });
  expect(libraryDisplayName(entries[0], entries)).toBe("Résumé (0)");
  expect(libraryDisplayName(entries[1], entries)).toBe("Résumé (1)");
  expect(libraryDisplayName(entries[2], entries)).toBe("Class 2");
});

it("pages all source slides in order without dropping the last partial page", () => {
  const slides = Array.from({ length: 14 }, (_, i) => i + 1);
  expect(sourceSlidePage(slides, 1)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(sourceSlidePage(slides, 2)).toEqual([7, 8, 9, 10, 11, 12]);
  expect(sourceSlidePage(slides, 3)).toEqual([13, 14]);
  expect(sourceSlidePage(slides, 0)).toEqual(sourceSlidePage(slides, 1));
});
it("finds source slides without mutating or dropping the underlying items", () => {
  const slides = [{ id: "a", ordinal: 1, text: "Welcome", role: "title" as const }, { id: "b", ordinal: 2, text: "Deep review", role: "content" as const }];
  expect(filterTemplateSlides(slides, "REVIEW").map((item) => item.id)).toEqual(["b"]);
  expect(filterTemplateSlides(slides, "1").map((item) => item.id)).toEqual(["a"]);
  expect(filterTemplateSlides(slides, "missing")).toEqual([]);
  expect(filterTemplateSlides(slides, "")).toEqual(slides);
  expect(slides).toHaveLength(2);
});
describe("synchronous template selection handoff", () => {
  it("commits the JSON source identity before navigation and destination reopen", () => {
    const values = new Map<string, string>();
    const storage = { setItem: (key: string, value: string) => { values.set(key, value); } };
    const navigate = vi.fn(() => {
      expect(JSON.parse(values.get(SELECTED_TEMPLATE_KEY)!)).toBe("saved-original");
    });
    expect(handoffTemplate("saved-original", storage, navigate)).toEqual({ ok: true });
    expect(navigate).toHaveBeenCalledOnce();
    const reopenedDestinationSelectedId = JSON.parse(values.get("ta-ppt-template-file-id")!);
    expect(reopenedDestinationSelectedId).toBe("saved-original");
  });
  it("refuses navigation with stable retryable error when persistence throws", () => {
    const navigate = vi.fn();
    expect(handoffTemplate("id", { setItem: () => { throw new Error("private browser detail"); } }, navigate)).toEqual({
      code: "PPT_SELECTION", error: "Could not remember the selected template. Allow browser storage and retry.",
    });
    expect(navigate).not.toHaveBeenCalled();
  });
  it("carries the selected library and source together and clears older library choices", () => {
    const values = new Map<string, string>();
    const storage = { setItem: (key: string, value: string) => { values.set(key, value); } };
    const navigate = vi.fn();
    expect(handoffTemplate("source", storage, navigate, "library")).toEqual({ ok: true });
    expect(JSON.parse(values.get(SELECTED_ROLE_LIBRARY_KEY)!)).toEqual({ libraryId: "library", sourceFileId: "source" });
    expect(handoffTemplate("other", storage, navigate)).toEqual({ ok: true });
    expect(JSON.parse(values.get(SELECTED_ROLE_LIBRARY_KEY)!)).toBeNull();
  });
});

describe("template diagnostic privacy", () => {
  it("emits actual operation outcomes, duration and fixed codes without accepting content", () => {
    resetSessionDiagnosticLogForTests("2026-10-15T00:00:00.000Z");
    for (const operation of ["load", "analyze", "save", "reuse", "download"] as const) {
      recordPowerPointDiagnostic(operation, Date.now() - 12);
      recordPowerPointDiagnostic(operation, Date.now() - 10, { code: "PPT_STORAGE" });
    }
    const entries = readSessionDiagnosticLogState().entries;
    expect(entries).toHaveLength(10);
    for (const entry of entries) {
      expect(entry.surface).toBe("templates");
      expect(entry.durationMs).toBeGreaterThanOrEqual(10);
      expect(entry.institution).toBe(""); expect(entry.course).toBe("");
      if (entry.outcome === "failure") { expect(entry.code).toBe("PPT_STORAGE"); expect(entry.error).toBe("PPT_STORAGE"); }
      else expect(entry.error).toBe("");
    }
    expect(JSON.stringify(entries)).not.toMatch(/source.pptx|source text|field value|provider detail/);
  });
});
