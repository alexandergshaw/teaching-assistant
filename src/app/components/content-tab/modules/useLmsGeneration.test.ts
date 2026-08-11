// Pure-logic contract for the "Generate from selection" bulk-bar control
// (useLmsGeneration.ts). vitest here is node-env and renders no component
// (docs/REGRESSION.md #260/#261's own Limits sections), so this covers
// everything about the feature an executable test CAN reach: kind
// offerability, the shared busy-state transition, the selection payload
// sent to generateFromSelectionAction, the module label folded into its
// saved prompt, and the note text reported through `setNote`. The hook's
// own React wiring (useState calls, the async generate/refine flows, and
// GenerateFromSelectionSection's JSX) is verified by reading only.
import { describe, expect, it, vi } from "vitest";
import type { GeneratedArtifact } from "@/lib/supabase/generated-artifacts";
import type { DeckTemplate } from "@/lib/decks/types";
import {
  GENERATION_KINDS,
  buildModuleLabel,
  buildSelectedMaterialItems,
  canStartGeneration,
  deckTemplateOptionsFrom,
  generationSuccessNote,
  kindLabelFor,
  loadVersionsForPreview,
  nextGenerationBusy,
  offerableGenerationKinds,
  refineSuccessNote,
  selectionSummaryLabel,
  versionOptionLabel,
  type ListVersionsCall,
} from "./useLmsGeneration";

describe("offerableGenerationKinds", () => {
  it("offers nothing for an empty item selection", () => {
    expect(offerableGenerationKinds(0)).toEqual([]);
  });

  it("offers all three kinds once at least one item is selected", () => {
    expect(offerableGenerationKinds(1)).toEqual(GENERATION_KINDS);
    expect(offerableGenerationKinds(5)).toEqual(GENERATION_KINDS);
  });

  it("pins the exact three kind ids, in order", () => {
    // THE BUG THIS PINS: generateFromSelectionAction's (and the deck Route
    // Handler's) GenerationKindId is "qa" | "currentEvents" | "decks"
    // (src/lib/lms-generation/kinds.ts) - NOT the "anticipated-qa" /
    // "current-events" / "deck" strings, which are only the DB
    // generated_artifacts.kind values. Sending the wrong one as `kind` would
    // fail GENERATION_KIND_CONFIGS[kind] server-side.
    expect(offerableGenerationKinds(1).map((k) => k.id)).toEqual(["qa", "currentEvents", "decks"]);
  });

  it("a WHOLE-MODULE-ONLY selection (zero individually-selected items) also offers every kind", () => {
    // THE GAP THIS CLOSES: generateFromSelectionAction now expands a
    // whole-module selection into its items server-side (materials.ts's
    // expandModuleSelection), so a module-only selection - "generate from
    // this week" - is no longer gated off the way it used to be.
    expect(offerableGenerationKinds(0, 1)).toEqual(GENERATION_KINDS);
    expect(offerableGenerationKinds(0, 3)).toEqual(GENERATION_KINDS);
  });

  it("offers nothing only when BOTH the item count and the module count are zero", () => {
    expect(offerableGenerationKinds(0, 0)).toEqual([]);
    expect(offerableGenerationKinds(0)).toEqual([]);
  });
});

describe("canStartGeneration / nextGenerationBusy", () => {
  it("canStartGeneration is true only when idle", () => {
    expect(canStartGeneration("")).toBe(true);
    expect(canStartGeneration("qa")).toBe(false);
    expect(canStartGeneration("currentEvents")).toBe(false);
    expect(canStartGeneration("decks")).toBe(false);
  });

  it("a 'start' from idle adopts the requested kind", () => {
    expect(nextGenerationBusy("", { type: "start", kind: "qa" })).toBe("qa");
    expect(nextGenerationBusy("", { type: "start", kind: "currentEvents" })).toBe("currentEvents");
    expect(nextGenerationBusy("", { type: "start", kind: "decks" })).toBe("decks");
  });

  it("THE DOUBLE-FIRE GUARD: a 'start' while already busy keeps the ORIGINAL kind, not the new one", () => {
    // This is what stops the OTHER kind's generate button (or a second
    // click of the same one, or the modal's refine button) from starting a
    // second concurrent write while one is already in flight - the guard
    // lives in the transition itself, not only in the pre-dispatch
    // canStartGeneration check.
    expect(nextGenerationBusy("qa", { type: "start", kind: "currentEvents" })).toBe("qa");
    expect(nextGenerationBusy("currentEvents", { type: "start", kind: "qa" })).toBe("currentEvents");
    expect(nextGenerationBusy("decks", { type: "start", kind: "qa" })).toBe("decks");
  });

  it("'finish' always returns to idle", () => {
    expect(nextGenerationBusy("qa", { type: "finish" })).toBe("");
    expect(nextGenerationBusy("currentEvents", { type: "finish" })).toBe("");
    expect(nextGenerationBusy("decks", { type: "finish" })).toBe("");
    expect(nextGenerationBusy("", { type: "finish" })).toBe("");
  });
});

describe("buildSelectedMaterialItems", () => {
  it("passes selected live entries through unchanged", () => {
    const itemA = { id: 10, title: "A" } as never;
    const itemB = { id: 20, title: "B" } as never;
    const result = buildSelectedMaterialItems([
      { source: "live", key: "live:1:10", moduleId: 1, item: itemA },
      { source: "live", key: "live:2:20", moduleId: 2, item: itemB },
    ]);
    expect(result).toEqual([
      { source: "live", key: "live:1:10", moduleId: 1, item: itemA },
      { source: "live", key: "live:2:20", moduleId: 2, item: itemB },
    ]);
  });

  it("THE FIX: an export-sourced item now passes through too, reaching generateFromSelectionAction", () => {
    // docs/REGRESSION.md entry 262 check 10's CORRECTION: this function used
    // to `if (s.source !== "live") continue`, discarding every export entry
    // before it ever reached the server - the ONLY thing standing between an
    // export-sourced selection and a real generation, since
    // gatherSelectionMaterials/gatherExportItem already handled it
    // correctly. SABOTAGE: reinstating that filter makes this test fail by
    // shrinking the result to length 1.
    const liveItem = { id: 10, title: "A" } as never;
    const exportItem = { id: 99, title: "B" } as never;
    const result = buildSelectedMaterialItems([
      { source: "live", key: "live:1:10", moduleId: 1, item: liveItem },
      { source: "export", key: "export:m1:99", moduleRef: "m1", item: exportItem },
    ]);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ source: "export", key: "export:m1:99", moduleRef: "m1", item: exportItem });
  });

  it("returns a fresh array, not the same reference, so a caller can't mutate the hook's own selection through it", () => {
    const input: never[] = [];
    expect(buildSelectedMaterialItems(input)).not.toBe(input);
  });

  it("handles an empty selection", () => {
    expect(buildSelectedMaterialItems([])).toEqual([]);
  });
});

describe("buildModuleLabel", () => {
  const modules = [
    { id: 1, name: "Week 1" },
    { id: 2, name: "Week 2" },
  ];

  it("names the single live module every selected item belongs to", () => {
    expect(
      buildModuleLabel(
        [
          { source: "live", moduleId: 1 },
          { source: "live", moduleId: 1 },
        ],
        modules
      )
    ).toBe("Week 1");
  });

  it("summarizes item and module counts when the selection spans modules", () => {
    expect(
      buildModuleLabel(
        [
          { source: "live", moduleId: 1 },
          { source: "live", moduleId: 2 },
          { source: "live", moduleId: 2 },
        ],
        modules
      )
    ).toBe("3 items across 2 modules");
  });

  it("falls back to a neutral label for an empty selection or an unresolvable module id", () => {
    expect(buildModuleLabel([], modules)).toBe("the selected material");
    expect(buildModuleLabel([{ source: "live", moduleId: 999 }], modules)).toBe("the selected material");
  });

  it("falls back to the generic summary for a pure export-sourced selection - there is no Canvas name for an export module ref", () => {
    expect(
      buildModuleLabel(
        [
          { source: "export", moduleRef: "m1" },
          { source: "export", moduleRef: "m1" },
        ],
        modules
      )
    ).toBe("2 items across 1 module");
  });

  it("A MIXED live+export selection is handled by the same generic summary, never guessing a single name for it", () => {
    // AC: "a mixed live+export selection is handled or explicitly refused" -
    // this is the choice made: fall back to the generic count-based summary
    // rather than naming just the live module and silently ignoring the
    // export entry, or throwing.
    expect(
      buildModuleLabel(
        [
          { source: "live", moduleId: 1 },
          { source: "export", moduleRef: "m1" },
        ],
        modules
      )
    ).toBe("2 items across 2 modules");
  });
});

describe("selectionSummaryLabel", () => {
  it("pluralizes correctly", () => {
    expect(selectionSummaryLabel(1)).toBe("1 item");
    expect(selectionSummaryLabel(2)).toBe("2 items");
  });

  it("falls back to a neutral label for a non-positive count", () => {
    expect(selectionSummaryLabel(0)).toBe("the current selection");
  });

  it("names both modules and items once a whole-module selection contributed", () => {
    // Matches what the caller (useLmsGeneration.ts's generate()) actually
    // used - the TOTAL resolved item count after module expansion, not the
    // raw number of rows the instructor clicked.
    expect(selectionSummaryLabel(41, 3)).toBe("3 modules, 41 items");
    expect(selectionSummaryLabel(1, 1)).toBe("1 module, 1 item");
  });

  it("omits the module count when no module contributed, even if passed as 0", () => {
    expect(selectionSummaryLabel(5, 0)).toBe("5 items");
  });
});

describe("loadVersionsForPreview", () => {
  const FALLBACK: GeneratedArtifact = {
    id: "fallback-1",
    courseId: "course-1",
    kind: "anticipated-qa",
    version: 1,
    isCurrent: true,
    title: null,
    text: "fallback text",
    structured: null,
    prompt: "prompt",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  function artifact(overrides: Partial<GeneratedArtifact>): GeneratedArtifact {
    return { ...FALLBACK, ...overrides };
  }

  it("THE GAP THIS CLOSES: returns the server's REAL stored history, including versions this call never created", async () => {
    // A session-accumulator implementation could never produce this: these
    // two versions were "generated in an earlier session" as far as this
    // call is concerned - it only learns about them from the server.
    const olderFromAnEarlierSession = [artifact({ id: "a2", version: 2, isCurrent: true }), artifact({ id: "a1", version: 1, isCurrent: false })];
    const list: ListVersionsCall = vi.fn(async () => ({ versions: olderFromAnEarlierSession }));

    const result = await loadVersionsForPreview(list, "https://canvas.example.edu/courses/1", "qa", FALLBACK);

    expect(result).toBe(olderFromAnEarlierSession);
    expect(list).toHaveBeenCalledWith({ courseUrl: "https://canvas.example.edu/courses/1", kind: "qa" });
  });

  it("HISTORY SURVIVES A SIMULATED RELOAD: two independent calls each reflect only what the server says at that moment, with no bleed-over between them", async () => {
    // Simulates: generate v1 (before a reload), reload, then generate v2 -
    // the second call's server response already includes v1 (the database
    // row survived the reload) PLUS the newly-created v2. If this were a
    // session accumulator instead of a real loader, the "session" would
    // have been reset by the reload and v1 could never appear again.
    const afterFirstGenerate = [artifact({ id: "a1", version: 1, isCurrent: true })];
    const afterReloadAndSecondGenerate = [
      artifact({ id: "a2", version: 2, isCurrent: true }),
      artifact({ id: "a1", version: 1, isCurrent: false }),
    ];
    const responses = [{ versions: afterFirstGenerate }, { versions: afterReloadAndSecondGenerate }];
    let callCount = 0;
    const list: ListVersionsCall = vi.fn(async () => responses[callCount++]);

    const firstResult = await loadVersionsForPreview(list, "url", "qa", afterFirstGenerate[0]);
    // A page reload happens here in the real app - loadVersionsForPreview
    // itself holds no state across calls, so nothing to reset.
    const secondResult = await loadVersionsForPreview(list, "url", "qa", afterReloadAndSecondGenerate[0]);

    expect(firstResult).toEqual([artifact({ id: "a1", version: 1, isCurrent: true })]);
    expect(secondResult).toEqual([
      artifact({ id: "a2", version: 2, isCurrent: true }),
      artifact({ id: "a1", version: 1, isCurrent: false }),
    ]);
  });

  it("fails forward to [fallback] when the listing call errors", async () => {
    const list: ListVersionsCall = vi.fn(async () => ({ error: "could not list" }));
    const result = await loadVersionsForPreview(list, "url", "qa", FALLBACK);
    expect(result).toEqual([FALLBACK]);
  });

  it("fails forward to [fallback] when the listing call succeeds but returns nothing", async () => {
    const list: ListVersionsCall = vi.fn(async () => ({ versions: [] }));
    const result = await loadVersionsForPreview(list, "url", "qa", FALLBACK);
    expect(result).toEqual([FALLBACK]);
  });
});

describe("generationSuccessNote / refineSuccessNote", () => {
  // Per this repo's own lesson (source-text-tests-overspecify): pin the
  // FACTS a later edit must not silently lose, not the exact prose.
  it("names the kind and version and states plainly that Canvas was not touched", () => {
    const note = generationSuccessNote("Anticipated lecture Q&A", 2, "3 items");
    expect(note).toContain("Anticipated lecture Q&A");
    expect(note).toContain("2");
    expect(note).toContain("3 items");
    expect(note).toContain("nothing was written to Canvas");
  });

  it("refine note also names the kind, the new version, and the Canvas fact", () => {
    const note = refineSuccessNote("Current events", 4);
    expect(note).toContain("Current events");
    expect(note).toContain("4");
    expect(note).toContain("nothing was written to Canvas");
  });
});

describe("versionOptionLabel", () => {
  it("marks the current version and uses a deterministic date slice", () => {
    expect(versionOptionLabel({ version: 3, isCurrent: true, createdAt: "2026-08-11T14:32:00.000Z" })).toBe(
      "v3 (current) - 2026-08-11"
    );
  });

  it("omits the current marker for a superseded version", () => {
    expect(versionOptionLabel({ version: 2, isCurrent: false, createdAt: "2026-08-10T09:00:00.000Z" })).toBe(
      "v2 - 2026-08-10"
    );
  });
});

describe("kindLabelFor", () => {
  it("resolves all three kinds to their registry label", () => {
    expect(kindLabelFor("qa")).toBe("Anticipated lecture Q&A");
    expect(kindLabelFor("currentEvents")).toBe("Current events");
    expect(kindLabelFor("decks")).toBe("Lecture deck");
  });
});

describe("deckTemplateOptionsFrom", () => {
  function template(overrides: Partial<DeckTemplate>): DeckTemplate {
    return {
      id: "tpl-1",
      name: "Classic Lecture",
      description: "",
      audience: "",
      tone: "",
      slides: [],
      loops: [],
      theme: {
        backgroundKind: "solid",
        backgroundColor: "#fff",
        backgroundColor2: "#eee",
        gradientAngle: 135,
        fontColor: "#000",
      },
      ...overrides,
    };
  }

  it("maps each template to its id/name pair only, in the same order", () => {
    const templates = [template({ id: "a", name: "Classic Lecture" }), template({ id: "b", name: "Coding Concept Lecture" })];
    expect(deckTemplateOptionsFrom(templates)).toEqual([
      { id: "a", name: "Classic Lecture" },
      { id: "b", name: "Coding Concept Lecture" },
    ]);
  });

  it("returns an empty array for an empty template list", () => {
    expect(deckTemplateOptionsFrom([])).toEqual([]);
  });
});
