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
import { readFileSync } from "fs";
import { join } from "path";
import type { GeneratedArtifact } from "@/lib/supabase/generated-artifacts";
import type { DeckTemplate } from "@/lib/decks/types";
import type { CanvasModule } from "@/lib/canvas-modules";
import type { PostSummary } from "@/lib/lms-generation/commit-plan";
import { GENERATION_KIND_CONFIGS, GENERATION_KIND_IDS } from "@/lib/lms-generation/kinds";
import { DEFAULT_SCRIPT_MINUTES, resolveScriptMinutes } from "@/lib/lms-generation/script-length";
import {
  GENERATION_KINDS,
  NEW_MODULE_TARGET_VALUE,
  buildModuleLabel,
  buildSelectedMaterialItems,
  canStartGeneration,
  deckTemplateOptionsFrom,
  editSuccessNote,
  generationSuccessNote,
  kindLabelFor,
  kindNeedsModuleTarget,
  kindOffersPost,
  loadVersionsForPreview,
  nextGenerationBusy,
  offerableGenerationKinds,
  postModuleOptionsFrom,
  postResultNote,
  postUnavailableReasonFor,
  previewMetaText,
  refineSuccessNote,
  resolvePostModuleTarget,
  scriptMinutesKey,
  selectionSummaryLabel,
  versionOptionLabel,
  type ListVersionsCall,
} from "./useLmsGeneration";
// previewHeaderTitle is not re-exported through the useLmsGeneration barrel
// (see GeneratedPreviewModal.tsx's own import comment on why - a defect fix
// scoped to that file's own header rendering) - pulled directly from its
// own module, same as every other file that reaches it.
import { previewHeaderTitle } from "./lmsGenerationNotes";
import { LIVE_CONTENT_SOURCE, type ContentSourceContext } from "../contentSourceGating";
import { describeMissingDeadlines } from "@/lib/lms-generation/intro-discussion-deadlines";

describe("offerableGenerationKinds", () => {
  it("offers nothing for an empty item selection", () => {
    expect(offerableGenerationKinds(0)).toEqual([]);
  });

  it("offers every registered kind once at least one item is selected", () => {
    expect(offerableGenerationKinds(1)).toEqual(GENERATION_KINDS);
    expect(offerableGenerationKinds(5)).toEqual(GENERATION_KINDS);
  });

  // REPLACES a prior test that pinned the exact three kind ids/order
  // verbatim (["qa", "currentEvents", "decks"]) - that literal broke the
  // moment kinds.ts grew from three kinds to seven (chunk 3b), and the repo
  // has a recorded lesson (source-text-tests-overspecify) that pinning exact
  // spelling like that forces contorted implementations later, for no
  // ongoing protection: a fourth kind, a fifth kind, a renamed kind would all
  // legitimately need this literal edited by hand forever. What actually
  // matters, and what a regression here would still be a REAL bug, is pinned
  // instead:
  //   1. every id this hook offers resolves to a real config, so
  //      generateFromSelectionAction's own `GENERATION_KIND_CONFIGS[kind]`
  //      lookup (lms-generation.ts) can never fail server-side - the exact
  //      hazard the old test's own comment described, just proven a
  //      different way.
  //   2. the offering order is STABLE and traceable to one source of truth
  //      (kinds.ts's own GENERATION_KIND_IDS) rather than incidentally
  //      whatever GENERATION_KINDS.map happens to produce today.
  it("every offerable kind id resolves to a real config, so a server-side GENERATION_KIND_CONFIGS[kind] lookup can never fail", () => {
    const ids = offerableGenerationKinds(1).map((k) => k.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      // SABOTAGE-CHECKABLE: an id offered here that GENERATION_KIND_CONFIGS
      // does not recognize would make `GENERATION_KIND_CONFIGS[id]`
      // undefined, and `.id` would throw - this test would fail, not just
      // report an incorrect value.
      expect(GENERATION_KIND_CONFIGS[id].id).toBe(id);
    }
  });

  it("the offering order is stable and matches the registry's own declared order (GENERATION_KIND_IDS)", () => {
    expect(offerableGenerationKinds(1).map((k) => k.id)).toEqual([...GENERATION_KIND_IDS]);
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

  // AC1/AC2 defect fix: `courseId` (an export selection's course_hub row id)
  // is optional and threads straight through to the injected `listVersions`
  // call - useLmsGeneration.ts's own callers pass their `exportCourseId`
  // here so the SAME source-aware resolution the generate/refine actions use
  // also applies to re-listing a course's version history.
  it("threads courseId through to the injected listVersions call unchanged", async () => {
    const list: ListVersionsCall = vi.fn(async () => ({ versions: [FALLBACK] }));
    await loadVersionsForPreview(list, "", "qa", FALLBACK, "export-course-1");
    expect(list).toHaveBeenCalledWith({ courseUrl: "", kind: "qa", courseId: "export-course-1" });
  });

  it("omitting courseId keeps the existing call shape - byte-identical for a live selection", async () => {
    const list: ListVersionsCall = vi.fn(async () => ({ versions: [FALLBACK] }));
    await loadVersionsForPreview(list, "https://canvas.example.edu/courses/1", "qa", FALLBACK);
    expect(list).toHaveBeenCalledWith({ courseUrl: "https://canvas.example.edu/courses/1", kind: "qa" });
  });

  // M12 (docs/module-intro-video-script-acceptance-criteria.md, finding 15):
  // the ONE piece of the acronym-threading story this file can exercise as
  // real runtime behaviour rather than by reading source - loadVersionsForPreview
  // is a plain, DI-testable function, unlike the hook closures around
  // generate/refine/post/generateDeckApi. Mirrors the courseId test just
  // above exactly.
  it("threads acronym through to the injected listVersions call unchanged", async () => {
    const list: ListVersionsCall = vi.fn(async () => ({ versions: [FALLBACK] }));
    await loadVersionsForPreview(list, "/courses/10287", "qa", FALLBACK, undefined, "acme");
    expect(list).toHaveBeenCalledWith({ courseUrl: "/courses/10287", kind: "qa", courseId: undefined, acronym: "acme" });
  });
});

describe("generationSuccessNote / refineSuccessNote", () => {
  // Per this repo's own lesson (source-text-tests-overspecify): pin the
  // FACTS a later edit must not silently lose, not the exact prose. P6: for
  // the three original "save-version" kinds, the "nothing was written to
  // Canvas" sentence must remain EXACTLY as it always has - their own tests
  // assert it verbatim below.
  it("names the kind and version and states plainly that Canvas was not touched, for a save-version kind", () => {
    const note = generationSuccessNote("qa", 2, "3 items");
    expect(note).toContain("Anticipated lecture Q&A");
    expect(note).toContain("2");
    expect(note).toContain("3 items");
    expect(note).toContain("nothing was written to Canvas");
  });

  it("refine note also names the kind, the new version, and the Canvas fact, for a save-version kind", () => {
    const note = refineSuccessNote("currentEvents", 4);
    expect(note).toContain("Current events");
    expect(note).toContain("4");
    expect(note).toContain("nothing was written to Canvas");
  });

  it("SABOTAGE TARGET: every save-version kind gets the EXACT unmodified sentence", () => {
    // Pinned verbatim (not just toContain) for the three kinds whose test
    // coverage the acceptance-criteria doc explicitly calls out as needing
    // to stay byte-for-byte identical - this is the one place in this
    // describe block where the exact prose itself is the fact being
    // protected, not merely a substring of it.
    expect(generationSuccessNote("qa", 1, "1 item")).toBe(
      'Generated "Anticipated lecture Q&A" (version 1) from 1 item. Saved to this course\'s generated content - nothing was written to Canvas.'
    );
    expect(refineSuccessNote("decks", 2)).toBe(
      'Created a new version of "Lecture deck" (version 2) from your instructions. Saved to this course\'s generated content - nothing was written to Canvas.'
    );
  });

  // P6: a "save-and-post" kind's copy must be ACCURATE instead - generating
  // alone still never writes to Canvas (do not overcorrect into implying it
  // does), but it must say so without reusing the old kinds' exact "nothing
  // was written to Canvas" wording, so the two cases stay visibly distinct in
  // the UI rather than reading like an identical, now-half-true claim.
  it("a save-and-post kind's generate note names the kind/version and points at posting as the next step, without claiming nothing was written", () => {
    const note = generationSuccessNote("objectives", 3, "2 items");
    expect(note).toContain("Module objectives");
    expect(note).toContain("3");
    expect(note).toContain("2 items");
    expect(note).toContain("Post to Canvas");
    expect(note).not.toContain("nothing was written to Canvas");
  });

  it("a save-and-post kind's refine note follows the same rule", () => {
    const note = refineSuccessNote("announcements", 5);
    expect(note).toContain("Announcement");
    expect(note).toContain("5");
    expect(note).toContain("Post to Canvas");
    expect(note).not.toContain("nothing was written to Canvas");
  });

  it("kindOffersPost distinguishes the two groups this whole split depends on", () => {
    expect(kindOffersPost("qa")).toBe(false);
    expect(kindOffersPost("currentEvents")).toBe(false);
    expect(kindOffersPost("decks")).toBe(false);
    // X1: "scripts" (chunk 3d) is a THIRD "save-version" kind - a
    // teleprompter script is instructor material, and posting it would
    // publish the instructor's spoken lines to students (S4/scriptsKindConfig's
    // own comment, kinds.ts), so it stays false alongside qa/currentEvents/decks.
    expect(kindOffersPost("scripts")).toBe(false);
    expect(kindOffersPost("objectives")).toBe(true);
    expect(kindOffersPost("assignments")).toBe(true);
    expect(kindOffersPost("knowledgeChecks")).toBe(true);
    expect(kindOffersPost("announcements")).toBe(true);
    // "resources" (docs/learning-resources-page-acceptance-criteria.md, A3)
    // is the fifth save-and-post kind - without this line, nothing asserted
    // that posting is even offered for it (finding 5).
    expect(kindOffersPost("resources")).toBe(true);
    // "introDiscussion" (docs/intro-discussion-from-modules-acceptance-
    // criteria.md) is the sixth save-and-post kind - the graded discussion
    // this chunk adds. Without this line, nothing asserted that posting is
    // even offered for it, the same gap "resources" closed above.
    expect(kindOffersPost("introDiscussion")).toBe(true);
  });
});

// E12 (chunk 3e, docs/generated-artifact-editing-acceptance-criteria.md):
// editSuccessNote's own version of the generationSuccessNote/refineSuccessNote
// split above - pinning the FACTS (kind, version, the Canvas claim, and that
// it never misattributes hand-written text to a model), not the exact prose,
// per this repo's own source-text-tests-overspecify lesson.
describe("editSuccessNote", () => {
  it("names the kind and the new version, and states plainly that Canvas was not touched, for a kind that never offers posting", () => {
    const note = editSuccessNote("qa", 3);
    expect(note).toContain("Anticipated lecture Q&A");
    expect(note).toContain("3");
    expect(note).toContain("nothing was written to Canvas");
  });

  it("never claims a model produced the text - 'saved your edit', not 'generated'/'created a new version from your instructions'", () => {
    // SABOTAGE-CHECKABLE: this is the one place this note's wording MUST
    // diverge from generationSuccessNote/refineSuccessNote - an edit is
    // instructor-authored text, and misattributing it would be worse than a
    // cosmetic difference.
    const note = editSuccessNote("scripts", 2);
    expect(note.toLowerCase()).toContain("your edit");
    expect(note).not.toContain("Generated ");
    expect(note).not.toContain("from your instructions");
  });

  it("a save-and-post kind's edit note points at posting as the next step, without claiming nothing was written - same split as the two notes above", () => {
    const note = editSuccessNote("objectives", 4);
    expect(note).toContain("Module objectives");
    expect(note).toContain("4");
    expect(note).toContain("Post to Canvas");
    expect(note).not.toContain("nothing was written to Canvas");
  });

  it("a save-and-post kind whose text CAN still be edited (assignments has no renderStructured) gets the same posting reminder", () => {
    // kindSupportsTextEdit and kindOffersPost are independent gates
    // (kinds.ts): three of the four save-and-post kinds - objectives,
    // assignments, announcements - have no `renderStructured` and so support
    // BOTH at once; only "knowledgeChecks" fails kindSupportsTextEdit (its
    // `structured` payload is authoritative). "assignments" is a live
    // example of the overlap.
    const note = editSuccessNote("assignments", 6);
    expect(note).toContain("Assignment");
    expect(note).toContain("6");
    expect(note).toContain("Post to Canvas");
  });
});

// AC3/AC4 defect fix (docs/REGRESSION.md - "generate from an export
// selection" defect): posting writes to Canvas, so it stays refused for an
// export selection - with contentSourceGating.ts's OWN "courseWrite" wording,
// never a new message. kindOffersPost/kindNeedsModuleTarget (tested just
// above/below) are untouched - this is a separate, additional layer.
describe("postUnavailableReasonFor (AC3 defect fix)", () => {
  const EXPORT_CONTEXT: ContentSourceContext = { source: "export", hasLiveCourse: false };

  it("null for a save-version kind (qa/currentEvents/decks) regardless of source - they never offered posting in the first place", () => {
    expect(postUnavailableReasonFor("qa", EXPORT_CONTEXT)).toBeNull();
    expect(postUnavailableReasonFor("currentEvents", EXPORT_CONTEXT)).toBeNull();
    expect(postUnavailableReasonFor("decks", EXPORT_CONTEXT)).toBeNull();
  });

  it("null for a save-and-post kind on a live, connected course - unchanged behaviour", () => {
    expect(postUnavailableReasonFor("objectives", LIVE_CONTENT_SOURCE)).toBeNull();
    expect(postUnavailableReasonFor("assignments", LIVE_CONTENT_SOURCE)).toBeNull();
    expect(postUnavailableReasonFor("knowledgeChecks", LIVE_CONTENT_SOURCE)).toBeNull();
    expect(postUnavailableReasonFor("announcements", LIVE_CONTENT_SOURCE)).toBeNull();
  });

  it("THE DEFECT THIS CLOSES: a save-and-post kind on an export selection is refused, with the EXACT reason gateOperation(ctx, 'courseWrite') already gives every other gated write in this tab - never a new message", () => {
    const reason = postUnavailableReasonFor("objectives", EXPORT_CONTEXT);
    expect(reason).toBe("There is no live Canvas course linked to create content in.");
  });

  it("every save-and-post kind is refused identically on an export selection", () => {
    expect(postUnavailableReasonFor("assignments", EXPORT_CONTEXT)).toEqual(postUnavailableReasonFor("objectives", EXPORT_CONTEXT));
    expect(postUnavailableReasonFor("knowledgeChecks", EXPORT_CONTEXT)).toEqual(postUnavailableReasonFor("objectives", EXPORT_CONTEXT));
    expect(postUnavailableReasonFor("announcements", EXPORT_CONTEXT)).toEqual(postUnavailableReasonFor("objectives", EXPORT_CONTEXT));
  });

  it("SABOTAGE CHECK'S CONTROL: a live course viewed as 'canvas' source but with hasLiveCourse false (a hypothetical caller bug) still refuses, proving hasLiveCourse - not the source label alone - drives the gate", () => {
    const brokenContext: ContentSourceContext = { source: "canvas", hasLiveCourse: false };
    expect(postUnavailableReasonFor("objectives", brokenContext)).toBe("There is no live Canvas course linked to create content in.");
  });
});

describe("previewMetaText", () => {
  it("keeps the exact original sentence for a save-version kind", () => {
    expect(previewMetaText("currentEvents", 3)).toBe(
      "Version 3 - saved to this course's generated content. Nothing was written to Canvas."
    );
  });

  it("names posting as a separate step for a save-and-post kind, without claiming a fixed Canvas state", () => {
    const text = previewMetaText("knowledgeChecks", 1);
    expect(text).toContain("Version 1");
    expect(text).not.toContain("Nothing was written to Canvas");
  });
});

describe("kindNeedsModuleTarget (P5)", () => {
  it("module-item placement kinds need a module target", () => {
    expect(kindNeedsModuleTarget("objectives")).toBe(true);
    expect(kindNeedsModuleTarget("assignments")).toBe(true);
    expect(kindNeedsModuleTarget("knowledgeChecks")).toBe(true);
    // "resources" is module-item placement too (D2/A3 of docs/learning-
    // resources-page-acceptance-criteria.md) - absent before, finding 5.
    expect(kindNeedsModuleTarget("resources")).toBe(true);
  });

  it("SABOTAGE TARGET: a course-level kind (announcements) needs no module target - it has no module to choose", () => {
    expect(kindNeedsModuleTarget("announcements")).toBe(false);
  });

  it("a save-version kind (no commitMeta at all) also reports false, not a thrown error", () => {
    expect(kindNeedsModuleTarget("qa")).toBe(false);
    expect(kindNeedsModuleTarget("currentEvents")).toBe(false);
    expect(kindNeedsModuleTarget("decks")).toBe(false);
  });
});

describe("resolvePostModuleTarget (P5)", () => {
  it("resolves an existing-module choice to its numeric id", () => {
    const result = resolvePostModuleTarget("42", "");
    expect(result).toEqual({ ok: true, target: { kind: "existing", moduleId: 42 } });
  });

  it("resolves the new-module sentinel plus a trimmed name to a 'new' target", () => {
    const result = resolvePostModuleTarget(NEW_MODULE_TARGET_VALUE, "  Week 5  ");
    expect(result).toEqual({ ok: true, target: { kind: "new", name: "Week 5" } });
  });

  it("SABOTAGE TARGET: refuses a blank new-module name instead of creating a module named \"\"", () => {
    const result = resolvePostModuleTarget(NEW_MODULE_TARGET_VALUE, "   ");
    expect(result.ok).toBe(false);
  });

  it("refuses an empty/unselected choice", () => {
    expect(resolvePostModuleTarget("", "").ok).toBe(false);
  });

  it("refuses a non-numeric, non-sentinel choice rather than silently coercing it to NaN", () => {
    expect(resolvePostModuleTarget("not-a-module-id", "").ok).toBe(false);
  });
});

describe("postModuleOptionsFrom", () => {
  function module(overrides: Partial<CanvasModule>): CanvasModule {
    return { id: 1, name: "Week 1", position: 1, published: true, itemsCount: 0, items: [], ...overrides };
  }

  it("maps each module to its id/name pair only, in the same order", () => {
    const modules = [module({ id: 1, name: "Week 1" }), module({ id: 2, name: "Week 2" })];
    expect(postModuleOptionsFrom(modules)).toEqual([
      { id: 1, name: "Week 1" },
      { id: 2, name: "Week 2" },
    ]);
  });

  it("returns an empty array for an empty module list", () => {
    expect(postModuleOptionsFrom([])).toEqual([]);
  });
});

describe("postResultNote (P4)", () => {
  function summary(overrides: Partial<PostSummary>): PostSummary {
    return { status: "success", text: "Page \"Week 3 Objectives\" posted successfully.", ...overrides };
  }

  it("a true success gets kind 'success'", () => {
    expect(postResultNote(summary({ status: "success", text: "Posted." }))).toEqual({
      kind: "success",
      text: "Posted.",
    });
  });

  it("SABOTAGE TARGET: a PARTIAL result gets kind 'error', never 'success' - the orphan case must not read as a clean success", () => {
    const partial = summary({
      status: "partial",
      text: 'Page "Week 3 Objectives" was created but not linked into the module - find it in Canvas.',
    });
    const result = postResultNote(partial);
    expect(result.kind).toBe("error");
    // Never a BARE failure either - the text still names what was created.
    expect(result.text).toContain("Week 3 Objectives");
  });

  it("a total failure also gets kind 'error'", () => {
    expect(postResultNote(summary({ status: "failed", text: "Nothing was posted." }))).toEqual({
      kind: "error",
      text: "Nothing was posted.",
    });
  });

  // W6 (docs/intro-discussion-from-modules-acceptance-criteria.md, section
  // 5b): `notes` is a NEW, optional second parameter - every caller that
  // predates this feature (and every "save-and-post" kind whose action
  // response carries no `notes`) must get a BYTE-IDENTICAL `text` to before.
  it("FROZEN LITERAL: calling with no notes argument returns byte-identical text to before this parameter existed", () => {
    expect(postResultNote(summary({ status: "success", text: 'Page "Week 3 Objectives" posted successfully.' }))).toEqual(
      { kind: "success", text: 'Page "Week 3 Objectives" posted successfully.' }
    );
  });

  it("an empty notes array is the same as omitting the argument entirely - no trailing separator", () => {
    expect(postResultNote(summary({ text: "Posted." }), [])).toEqual({ kind: "success", text: "Posted." });
  });

  it("SABOTAGE TARGET: appends notes, in order, after summary.text - and the kind rule (P4) is unchanged by their presence", () => {
    const result = postResultNote(
      summary({ status: "success", text: "Discussion \"Introduce yourself\" posted successfully." }),
      ["Initial post due Thursday, September 10, 2026 at 11:59 PM.", "Replies due Sunday, September 13, 2026 at 11:59 PM."]
    );
    expect(result).toEqual({
      kind: "success",
      text:
        'Discussion "Introduce yourself" posted successfully. Initial post due Thursday, September 10, 2026 at 11:59 PM. Replies due Sunday, September 13, 2026 at 11:59 PM.',
    });
    // The kind rule (success/partial/failed -> success/error/error) still
    // applies with notes present - a partial result is not laundered into a
    // clean success just because it also carries extra notes.
    const partialWithNotes = postResultNote(
      summary({ status: "partial", text: "Created but not linked." }),
      ["No due or lock dates were set on the discussion."]
    );
    expect(partialWithNotes.kind).toBe("error");
    expect(partialWithNotes.text).toBe("Created but not linked. No due or lock dates were set on the discussion.");
  });

  // AC21/D5 item 7: "no course start date" and "module name carries no week
  // number" must never collapse into one indistinguishable message. This
  // pins the CHANNEL this file owns (postResultNote must actually carry
  // whatever distinct reason it is given through to the final note text,
  // rather than only ever emitting one fixed sentence regardless of what is
  // passed) - the reasons THEMSELVES are describeMissingDeadlines' own
  // contract (intro-discussion-deadlines.ts, a sibling-owned leaf).
  // Finding 10 (fix): pinned against the REAL leaf function, not hand-invented text.
  it("the two distinct no-deadline reasons produce two DIFFERENT note texts, using the REAL describeMissingDeadlines wording", () => {
    const noStartDateReason = describeMissingDeadlines({ startDate: "", moduleName: "Module 1" })!;
    const noWeekNumberReason = describeMissingDeadlines({ startDate: "2026-01-05", moduleName: "Course Resources" })!;
    expect(noStartDateReason).toBe("This course has no start date, so no due or lock dates were set on the discussion.");
    expect(noWeekNumberReason).toBe('The module name "Course Resources" carries no week number, so no due or lock dates were set on the discussion.');

    const noStartDate = postResultNote(summary({ status: "success" }), [noStartDateReason]);
    const noWeekNumber = postResultNote(summary({ status: "success" }), [noWeekNumberReason]);
    expect(noStartDate.text).not.toBe(noWeekNumber.text);
  });
});

describe("versionOptionLabel", () => {
  it("marks the current version and uses a deterministic date slice", () => {
    expect(
      versionOptionLabel({ version: 3, isCurrent: true, createdAt: "2026-08-11T14:32:00.000Z", title: null })
    ).toBe("v3 (current) - 2026-08-11");
  });

  it("omits the current marker for a superseded version", () => {
    expect(
      versionOptionLabel({ version: 2, isCurrent: false, createdAt: "2026-08-10T09:00:00.000Z", title: null })
    ).toBe("v2 - 2026-08-10");
  });

  // DEFECT FIX (the "scripts" re-gear from lecture script to intro video
  // script kept artifactKind unchanged so old and new versions share one
  // history/picker): title is the ONE field that still tells the two kinds'
  // saved documents apart, so it must be visible in the option label, not
  // only in the artifact row.
  it("SABOTAGE TARGET: appends a non-blank title after the version/date pair", () => {
    expect(
      versionOptionLabel({
        version: 2,
        isCurrent: true,
        createdAt: "2026-08-11T14:32:00.000Z",
        title: "Week 2 Lecture Script",
      })
    ).toBe("v2 (current) - 2026-08-11 - Week 2 Lecture Script");
    expect(
      versionOptionLabel({
        version: 4,
        isCurrent: false,
        createdAt: "2026-08-12T09:00:00.000Z",
        title: "Week 2 Intro Video Script",
      })
    ).toBe("v4 - 2026-08-12 - Week 2 Intro Video Script");
  });

  it("omits the title suffix entirely for null or blank titles - never a dangling separator or bare dash", () => {
    const base = { version: 1, isCurrent: false, createdAt: "2026-08-10T09:00:00.000Z" };
    expect(versionOptionLabel({ ...base, title: null })).toBe("v1 - 2026-08-10");
    expect(versionOptionLabel({ ...base, title: "" })).toBe("v1 - 2026-08-10");
    expect(versionOptionLabel({ ...base, title: "   " })).toBe("v1 - 2026-08-10");
  });
});

describe("previewHeaderTitle", () => {
  // DEFECT FIX: the preview modal's <h3> used to render the LIVE kind label
  // unconditionally (kindLabelFor(kindId)), so an artifact saved under a
  // since-re-geared kind meaning was mislabelled on reopen. Mirrors
  // artifactDownloadFilename's (src/lib/lms-generation/artifact-download.ts)
  // own title-over-kind-label precedent exactly.
  it("SABOTAGE TARGET: prefers a non-blank saved title over the live kind label", () => {
    expect(previewHeaderTitle({ title: "Week 2 Lecture Script" }, "Intro video script")).toBe(
      "Week 2 Lecture Script"
    );
  });

  it("falls back to the kind label when the title is null or blank", () => {
    expect(previewHeaderTitle({ title: null }, "Intro video script")).toBe("Intro video script");
    expect(previewHeaderTitle({ title: "" }, "Intro video script")).toBe("Intro video script");
    expect(previewHeaderTitle({ title: "   " }, "Intro video script")).toBe("Intro video script");
  });
});

describe("kindLabelFor", () => {
  it("resolves every registered kind to its registry label", () => {
    expect(kindLabelFor("qa")).toBe("Anticipated lecture Q&A");
    expect(kindLabelFor("currentEvents")).toBe("Current events");
    expect(kindLabelFor("decks")).toBe("Lecture deck");
    expect(kindLabelFor("objectives")).toBe("Module objectives");
    expect(kindLabelFor("assignments")).toBe("Assignment");
    expect(kindLabelFor("knowledgeChecks")).toBe("Knowledge check");
    expect(kindLabelFor("announcements")).toBe("Announcement");
    // X1: the eighth kind (chunk 3d), re-geared by
    // docs/module-intro-video-script-acceptance-criteria.md - the button now
    // produces a module intro video script, not a full lecture script (kinds.ts,
    // sibling-owned in this chunk). One coordinated string across both waves.
    expect(kindLabelFor("scripts")).toBe("Intro video script");
  });
});

// Chunk 3d (docs/lms-script-generation-acceptance-criteria.md), re-geared by
// docs/module-intro-video-script-acceptance-criteria.md (M17): the video
// length select's persistence. See scriptMinutesKey's own doc comment
// (useLmsGeneration.ts) for exactly what this describe block can and cannot
// reach - vitest here is node-env with no DOM (vitest.config.ts:
// environment: "node"), so `window` is undefined and this hook's own
// read-on-init/write-on-change effect (the actual localStorage round trip)
// is unexercisable end to end in this file, the same limit this file's own
// header comment already states for the rest of this hook's React wiring.
// What IS reachable and sabotage-checkable from here:
//   1. the KEY is genuinely per-course (scriptMinutesKey), UNCHANGED by the
//      re-gear (M17) - if a future edit hardcoded the key or dropped
//      `courseUrl`, this fails.
//   2. the coercion function the initializer is REQUIRED to compose with
//      that key (`resolveScriptMinutes(readStored(scriptMinutesKey(courseUrl)))`,
//      useLmsGeneration.ts) already has its own full contract test in
//      script-length.test.ts; the facts below - default/restored/
//      junk-falls-back/per-course-key/migrates-a-stale-lecture-length-value -
//      are reached through that same function rather than through a faked
//      DOM.
describe("script length persistence (S13)", () => {
  it("the key is namespaced per course - two different courseUrls never share a value", () => {
    const a = scriptMinutesKey("https://canvas.example.edu/courses/1");
    const b = scriptMinutesKey("https://canvas.example.edu/courses/2");
    expect(a).not.toBe(b);
    expect(a).toBe("ta-lms-script-minutes-https://canvas.example.edu/courses/1");
    expect(b).toBe("ta-lms-script-minutes-https://canvas.example.edu/courses/2");
  });

  it("defaults to 2 minutes when nothing is stored - what readStored actually returns under this test environment (window is undefined, so it always returns null, the same as a genuinely empty course)", () => {
    expect(DEFAULT_SCRIPT_MINUTES).toBe(2);
    expect(resolveScriptMinutes(null)).toBe(DEFAULT_SCRIPT_MINUTES);
  });

  it("a stored offered value is restored", () => {
    expect(resolveScriptMinutes("3")).toBe(3);
    expect(resolveScriptMinutes("5")).toBe(5);
  });

  it("SABOTAGE TARGET: a stored junk or in-range-but-unoffered value falls back to the default, rather than rendering an unselectable option", () => {
    expect(resolveScriptMinutes("abc")).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes("7")).toBe(DEFAULT_SCRIPT_MINUTES);
  });

  it("MIGRATION: a value left over from the lecture-length era self-heals to the new default, rather than rendering unselectable", () => {
    // Before the re-gear to a module intro video script, SCRIPT_LENGTH_OPTIONS
    // was [5, 10, 15, 20, 30] and DEFAULT_SCRIPT_MINUTES was 15 - so any
    // instructor who already used this button has a real "15" (or another
    // former option) sitting under their course's scriptMinutesKey today.
    // resolveScriptMinutes is a MEMBERSHIP test, not a range test, so that
    // stored value resolves to the new default instead of surviving as an
    // option the select no longer offers.
    expect(resolveScriptMinutes("15")).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes(15)).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes("10")).toBe(DEFAULT_SCRIPT_MINUTES);
    expect(resolveScriptMinutes("30")).toBe(DEFAULT_SCRIPT_MINUTES);
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

// M12 REACHABILITY GUARD (docs/module-intro-video-script-acceptance-criteria.md,
// finding 15; this repo's own "verify reachability, not just correctness"
// lesson). The bug this closes: an earlier wave threaded `acronym` all the
// way to generateFromSelectionAction/postGeneratedArtifactAction/
// listGeneratedArtifactVersionsAction on the SERVER, and to
// useRepoPairing/useExportModuleAdditions's own signatures, but never wired
// this hook's new `acronym` PARAMETER into the actual calls it makes - the
// mechanism existed, fully tested, and was completely dead from the real
// UI. `generate`/`refine`/`saveEdit`/`post` are closures inside the hook,
// not exported, and vitest here is node-env with no DOM
// (vitest.config.ts: environment: "node"), so there is no way to render the
// hook and inspect a real network payload the way `loadVersionsForPreview`'s
// own "threads acronym through" test above can. This reads the hook's
// source as TEXT instead - the same idiom generatedPreviewModal.wiring.test.ts
// and bulkCreateModules.wiring.test.ts already use for exactly this reason -
// and is written to fail the moment `acronym` is dropped from any one of
// these call sites, not merely to prove it is present today.
describe("acronym reaches every by-URL resolve call the hook makes (M12 reachability guard)", () => {
  const HOOK_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useLmsGeneration.ts");
  const hookSource = readFileSync(HOOK_PATH, "utf8");

  /**
   * The text of the object-literal argument passed to the call that starts
   * at `marker` (e.g. "await generateFromSelectionAction({") - a brace-depth
   * scan from the FIRST `{` after `marker` to its matching `}`, so a
   * payload spanning many lines (courseUrl, items, moduleIds, ... down to
   * acronym) is captured whole rather than truncated at the first inner
   * `}` a naive indexOf would find. Throws loudly (never returns "", which
   * would make every `.toMatch` below vacuously pass) if `marker` is not
   * found at all - the sabotage this guards against, a call site renamed or
   * deleted out from under the marker string.
   */
  function payloadOf(marker: string): string {
    const at = hookSource.indexOf(marker);
    if (at === -1) throw new Error(`call site not found - marker moved or was deleted: ${marker}`);
    const braceStart = hookSource.indexOf("{", at);
    let depth = 0;
    for (let i = braceStart; i < hookSource.length; i += 1) {
      if (hookSource[i] === "{") depth += 1;
      else if (hookSource[i] === "}") {
        depth -= 1;
        if (depth === 0) return hookSource.slice(braceStart, i + 1);
      }
    }
    throw new Error(`unterminated object literal for marker: ${marker}`);
  }

  // Sabotage-checked by hand while writing this guard (per the Wave 3A
  // brief): deleting the trailing `acronym,`/`acronym` line from each call
  // site below, one at a time, made ITS OWN test fail with no other test in
  // this describe block affected - each assertion is therefore pinned to
  // the one call site it names, not merely to the file as a whole - and
  // restoring the line made all five pass again. See this wave's own report
  // for the exact failure text recorded from that run.
  it("generateFromSelectionAction's payload includes acronym", () => {
    expect(payloadOf("await generateFromSelectionAction({")).toMatch(/\bacronym\b/);
  });

  it("generateDeckApi's payload (the deck Route Handler's request body) includes acronym", () => {
    expect(payloadOf("await generateDeckApi({")).toMatch(/\bacronym\b/);
  });

  it("postGeneratedArtifactAction's payload includes acronym", () => {
    expect(payloadOf("await postGeneratedArtifactAction({")).toMatch(/\bacronym\b/);
  });

  // refineGeneratedArtifactAction and saveEditedGeneratedArtifactAction
  // (src/app/actions/lms-generation-refine.ts) did not accept an `acronym`
  // field at all until this wave - the hook's own `acronym` parameter's doc
  // comment used to record this as a known GAP: both write calls below
  // resolved their course row with no acronym even though this hook already
  // had one in scope, so a host-less refine/save-edit could not resolve a
  // row that generation itself could. Both actions now accept the field and
  // thread it into their own resolveGenerationCourseRow call - these two
  // assertions close the gap in this reachability guard the same way the GAP
  // note itself has been closed in the hook's doc comment.
  it("refineGeneratedArtifactAction's payload includes acronym", () => {
    expect(payloadOf("await refineGeneratedArtifactAction({")).toMatch(/\bacronym\b/);
  });

  it("saveEditedGeneratedArtifactAction's payload includes acronym", () => {
    expect(payloadOf("await saveEditedGeneratedArtifactAction({")).toMatch(/\bacronym\b/);
  });

  it("every loadVersionsForPreview call site (the generate/refine/saveEdit success tails) passes acronym through", () => {
    // Matches only `await loadVersionsForPreview(...)` CALL sites, never a
    // DEFINITION of the same name. The `export async function
    // loadVersionsForPreview(...)` definition this originally guarded
    // against has since moved out of this file (useLmsGeneration.ts) into
    // src/app/components/content-tab/modules/lmsGenerationVersions.ts, so
    // that exact false-match is not reproducible against hookSource today -
    // but the `await ` anchor stays load-bearing, not decorative: without
    // it, the lazy `[\s\S]*?` starting at ANY `loadVersionsForPreview(`
    // match (a future definition, re-export, or local wrapper of the same
    // name reintroduced into this file) runs forward past a multi-line
    // parameter list with no `);` of its own and false-matches the NEXT
    // `);` it finds - the unrelated `listVersions({ ... acronym });` call
    // that used to sit inside the definition's own body, turning 3 real
    // call sites into 4 matches. Caught by hand while writing this guard
    // (see that wave's report for this run's exact output). Removing the
    // anchor now, because the specific definition it was written against is
    // gone, would silently reopen the same hazard the day this function (or
    // one shaped like it) is ever defined in this file again.
    const calls = [...hookSource.matchAll(/await loadVersionsForPreview\(([\s\S]*?)\);/g)];
    // Three call sites today: finishGenerateSuccess (shared by generate and
    // the decks branch), refine's own success tail, and saveEdit's own
    // success tail. A future fourth call site with no acronym would still
    // be caught by the `.every` below; this count assertion additionally
    // catches one being silently REMOVED (which `.every` on an empty/
    // shrunken array cannot).
    expect(calls.length).toBe(3);
    expect(calls.every((call) => /\bacronym\b/.test(call[1]))).toBe(true);
  });

  it("the hook's own signature declares an acronym parameter", () => {
    const sigStart = hookSource.indexOf("export function useLmsGeneration(");
    const sigEnd = hookSource.indexOf("): UseLmsGenerationReturn {", sigStart);
    expect(sigStart).toBeGreaterThan(-1);
    expect(sigEnd).toBeGreaterThan(sigStart);
    expect(hookSource.slice(sigStart, sigEnd)).toMatch(/acronym\?:\s*string/);
  });
});

