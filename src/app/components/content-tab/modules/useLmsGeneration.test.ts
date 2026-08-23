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
import { GENERATION_KIND_CONFIGS, GENERATION_KIND_IDS } from "@/lib/lms-generation/kinds";
import { DEFAULT_SCRIPT_MINUTES, resolveScriptMinutes } from "@/lib/lms-generation/script-length";
import {
  GENERATION_KINDS,
  buildModuleLabel,
  buildSelectedMaterialItems,
  canStartGeneration,
  deckTemplateOptionsFrom,
  kindLabelFor,
  loadVersionsForPreview,
  nextGenerationBusy,
  offerableGenerationKinds,
  postUnavailableReasonFor,
  scriptMinutesKey,
  selectionSummaryLabel,
  type ListVersionsCall,
} from "./useLmsGeneration";
// previewHeaderTitle is not re-exported through the useLmsGeneration barrel
// (see GeneratedPreviewModal.tsx's own import comment on why - a defect fix
// scoped to that file's own header rendering) - pulled directly from its
// own module, same as every other file that reaches it.
import { previewHeaderTitle } from "./lmsGenerationNotes";
import { LIVE_CONTENT_SOURCE, type ContentSourceContext } from "../contentSourceGating";

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

  // JOB 2 of the intro-video-script bug report fix (docs/REGRESSION.md):
  // before this fix, a REJECTED listVersions call (a network/transport
  // error - the Server Action call itself failing, not merely returning its
  // own {error} shape) propagated straight out of loadVersionsForPreview
  // with no try/catch anywhere in its three call sites
  // (useLmsGeneration.ts's finishGenerateSuccess/refine/saveEdit), leaving
  // `busy` stuck forever and `setPreview` never reached even though the
  // artifact itself had already saved successfully server-side.
  //
  // SABOTAGE-CHECKED (reported in this wave's own writeup): removing the
  // try/catch around the `await listVersions(...)` call in
  // lmsGenerationVersions.ts turns this exact test red (the returned promise
  // rejects instead of resolving to [FALLBACK]); restoring it turns it green.
  it("JOB 2 FIX: fails forward to [fallback] when the listing call REJECTS, not only when it returns {error}", async () => {
    const list: ListVersionsCall = vi.fn(async () => {
      throw new Error("network error - fetch failed");
    });
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
  // MARKER UPDATED (Job 2 of the intro-video-script bug report fix): this
  // call site used to read `await generateFromSelectionAction({` directly -
  // it is now `await runGenerationCall(() => generateFromSelectionAction({`,
  // wrapped so a REJECTED Server Action call becomes a real {error} instead
  // of an unhandled rejection (see lmsGenerationSafeCall.ts's own header
  // comment). The marker no longer has "await " immediately before the
  // function name for that reason - this is a genuine change to how the
  // call executes, not a cosmetic rename, so the anchor moves with it rather
  // than the fix being reverted to keep the old marker matching.
  it("generateFromSelectionAction's payload includes acronym", () => {
    expect(payloadOf("generateFromSelectionAction({")).toMatch(/\bacronym\b/);
  });

  it("generateDeckApi's payload (the deck Route Handler's request body) includes acronym", () => {
    expect(payloadOf("await generateDeckApi({")).toMatch(/\bacronym\b/);
  });

  // MARKER UPDATED (step-10c review, D1 - same reasoning as this describe
  // block's own comment on the generateFromSelectionAction marker above):
  // these three call sites are now each
  // `await runGenerationCall(() => xxxAction({`, wrapped so a REJECTED
  // Server Action call becomes a real {error} instead of leaving `busy`
  // (post: also the tab-wide setBusy) stuck - see lmsGenerationSafeCall.ts's
  // own header comment.
  it("postGeneratedArtifactAction's payload includes acronym", () => {
    expect(payloadOf("postGeneratedArtifactAction({")).toMatch(/\bacronym\b/);
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
    expect(payloadOf("refineGeneratedArtifactAction({")).toMatch(/\bacronym\b/);
  });

  it("saveEditedGeneratedArtifactAction's payload includes acronym", () => {
    expect(payloadOf("saveEditedGeneratedArtifactAction({")).toMatch(/\bacronym\b/);
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

// AC9 / docs/bulk-bar-reorganization-acceptance-criteria.md section 3b's D2
// correction: the one clear present-day AC9 violation named in that document.
// `templateId` (the deck-template picker's own state, useLmsGeneration.ts) is
// the odd one out in its row - its two siblings, `scriptMinutes` (right below
// it, via scriptMinutesKey) and the checkpoints checkbox, both persist under a
// `ta-`-prefixed key. `templateId` persists under neither a key NOR carries a
// written reason for skipping one, unlike the repo's own precedent for a
// DELIBERATELY unpersisted control - useVisualizerCoverage.ts:447's "NO `ta-`
// LOCALSTORAGE KEY" comment, itself pinned by
// visualizerCoverage.wiring.test.ts:433-441. This describe block is that same
// shape, aimed at templateId.
//
// ONE test, not two: this wave's line budget is exactly one new assertion
// (see this wave's own brief - the file-count/test-count deltas are checked
// by hand), so both halves of the precedent's shape - "no key" and "the
// reason is written" - are asserted inside a single `it`, the way a single
// fact ("this control's unpersisted status is documented") is checked here,
// not two independent facts.
//
// RESOLVED, and NOT the way this block originally anticipated. Wave 0B wrote
// the assertion below as EXPECTED RED, pinning "templateId is unpersisted and
// says why" on the model of useVisualizerCoverage.ts:447's deliberate
// exemption. On review the exemption was the wrong answer: templateId is a
// per-course preference of exactly the same shape as the two siblings around
// it, and the repo invariant is that a select persists. So it was FIXED
// rather than documented - `deckTemplateKey` (lmsGenerationKindHelpers.ts)
// plus a read-on-init/write-on-change pair, matching scriptMinutes exactly.
//
// The assertion is inverted accordingly: what is pinned now is that the
// persistence EXISTS, and that a stale stored id is reconciled rather than
// rendered as an unselectable option. Kept in place rather than deleted so
// the trail from "gap found" to "gap closed" survives - the original was a
// red test naming a real defect, which is what it was supposed to be.
describe("templateId (deck template picker) persistence - AC9 gap, closed", () => {
  const HOOK_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useLmsGeneration.ts");
  const hookSource = readFileSync(HOOK_PATH, "utf8");

  it("persists per course under its own ta- key, seeded from the stored value, exactly like its two siblings", () => {
    const declStart = hookSource.indexOf("const [templateId, setTemplateId] = useState");
    expect(declStart, "templateId's useState declaration moved or was renamed").toBeGreaterThan(-1);
    const nextDeclStart = hookSource.indexOf("const [scriptMinutes, setScriptMinutes] = useState", declStart);
    expect(nextDeclStart, "scriptMinutes' declaration moved - update this test's anchor").toBeGreaterThan(declStart);

    // Seeded from storage, and written back on change. Pins the FACT (both
    // halves of the read/write pair are present) rather than the spelling of
    // either one.
    const block = hookSource.slice(declStart, nextDeclStart);
    expect(block).toMatch(/readStored\(\s*deckTemplateKey\(/);
    expect(block).toMatch(/localStorage\.setItem\(\s*deckTemplateKey\(/);
  });

  it("reconciles a remembered id against the templates that actually loaded, so a deleted template cannot leave the select showing an option it does not offer", () => {
    // The reconciliation must happen AFTER the async template load, not at
    // seed time - at seed time only DECK_PRESETS are known, so validating
    // early would discard a remembered id naming one of the instructor's own
    // deck_templates rows. This pins the ordering, which is the part that is
    // easy to get wrong.
    const loadIdx = hookSource.indexOf("listDeckTemplatesAction()");
    const reconcileIdx = hookSource.indexOf("resolveDeckTemplateId", loadIdx);
    expect(loadIdx).toBeGreaterThan(-1);
    expect(reconcileIdx).toBeGreaterThan(loadIdx);
  });
});

// Jobs 2/3/4 of the intro-video-script bug report fix - a REACHABILITY guard
// in the same spirit as the M12 block above: `generate`'s two branches are
// closures inside this hook, unexported and unrenderable in this repo's
// node-env vitest (see this file's own header comment), so the WIRING
// itself - not merely runGenerationCall/buildGenerationDiagRecord's own
// already-tested pure logic - is verified by reading the source as text.
// This is exactly the hazard M12 records for `acronym`: a mechanism can be
// fully built and fully unit-tested and still never actually be called from
// the one place that matters.
describe("generate() wiring for Jobs 2/3/4 (reachability guard)", () => {
  const HOOK_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useLmsGeneration.ts");
  const hookSource = readFileSync(HOOK_PATH, "utf8");

  // Isolates the generic (non-"decks") branch's own IIFE, the one "scripts"
  // (and every other kind but decks) actually runs through - bounded between
  // its own `void (async () => {` and the CLOSING `};` of `generate` itself,
  // so a match inside the earlier decks branch can never satisfy these
  // assertions by accident.
  function genericBranchBody(): string {
    const genericIifeStart = hookSource.indexOf(
      "void (async () => {",
      hookSource.indexOf("await generateDeckApi(")
    );
    expect(genericIifeStart, "generic branch's IIFE not found - it may have moved").toBeGreaterThan(-1);
    const generateFnEnd = hookSource.indexOf("\n  };", genericIifeStart);
    expect(generateFnEnd, "end of generate() not found after the generic IIFE").toBeGreaterThan(genericIifeStart);
    return hookSource.slice(genericIifeStart, generateFnEnd);
  }

  it("JOB 2: the generic branch's generateFromSelectionAction call is wrapped in runGenerationCall, not awaited bare", () => {
    const body = genericBranchBody();
    // Ordering, not spelling: runGenerationCall's own opening paren appears
    // BEFORE generateFromSelectionAction's, and generateFromSelectionAction
    // appears BEFORE runGenerationCall's matching close - i.e. the second
    // call is nested INSIDE the first, not merely present somewhere nearby.
    const runIdx = body.indexOf("runGenerationCall(");
    const innerIdx = body.indexOf("generateFromSelectionAction(", runIdx);
    expect(runIdx, "runGenerationCall( not found in the generic branch").toBeGreaterThan(-1);
    expect(innerIdx, "generateFromSelectionAction( not found after runGenerationCall(").toBeGreaterThan(runIdx);
  });

  it("JOB 3: both the decks branch and the generic branch set generationError on a failure, matching finishGenerateError's own two call sites", () => {
    // SABOTAGE-CHECKABLE: deleting either `setGenerationError(result.error)`
    // line drops this count to 1.
    const matches = [...hookSource.matchAll(/setGenerationError\(result\.error\)/g)];
    expect(matches).toHaveLength(2);
  });

  it("JOB 3: generationError is cleared at the start of an attempt in both of generate()'s branches (decks and generic)", () => {
    // Exactly 2: generate() has exactly two branches (decks, generic) that
    // each start a new attempt - refine/saveEdit/post each clear `setNote`
    // too but do not touch generationError at all, since that field is
    // scoped to `generate` alone (see its own doc comment, lmsGenerationTypes.ts).
    const clearCount = [...hookSource.matchAll(/setGenerationError\(null\);/g)].length;
    expect(clearCount).toBe(2);
  });

  it("JOB 4: recordDiag (createDiagRecorder) is created once and called on BOTH the generic branch's error path and its success path", () => {
    // `recordDiag` is created just once, between the two branches (via
    // createDiagRecorder, lmsGenerationDiagRecord.ts - the actual
    // buildGenerationDiagRecord call lives there now, not in this file, see
    // that module's own test for the executed coverage). The two CALLS to
    // `recordDiag` here (not the one creation) are what this test pins.
    expect([...hookSource.matchAll(/const recordDiag = createDiagRecorder\(/g)]).toHaveLength(1);
    const body = genericBranchBody();
    const occurrences = [...body.matchAll(/recordDiag\(\{/g)];
    expect(occurrences).toHaveLength(2);
  });

  it("JOB 4: the decks branch does NOT call recordDiag - this feature is scoped to generateFromSelectionAction's own path (see lmsGenerationDiagRecord.ts's header comment)", () => {
    const decksIifeStart = hookSource.indexOf("void (async () => {");
    // Bounded by the COMMENT marking recordDiag's own setup (placed between
    // the two branches), not by the `const recordDiag = ...` statement
    // itself - that comment names "recordDiag" in prose to explain what
    // comes next, which would otherwise false-fail this text-only check by
    // being swept into "the decks branch" if the slice ran one line further.
    const recordDiagSectionStart = hookSource.indexOf("// Job 4: timing starts here");
    expect(decksIifeStart).toBeGreaterThan(-1);
    expect(recordDiagSectionStart).toBeGreaterThan(decksIifeStart);
    const decksBody = hookSource.slice(decksIifeStart, recordDiagSectionStart);
    expect(decksBody).not.toMatch(/recordDiag|buildGenerationDiagRecord/);
  });

  // hasDiagLog's own true-flip lives inside createDiagRecorder now
  // (lmsGenerationDiagRecord.ts, extracted from this hook to stay under the
  // 1000-line ceiling) - see that file's own test for the real, EXECUTED
  // coverage of that behaviour (not a text scan) rather than duplicating it
  // here as source-text.
});

// D1 (step-10c review of the intro-video-script bug fix): Job 2's fix above
// covered generate() only. refine(), saveEdit() and post() each bare-`await`
// a Server Action inside their own `void (async () => {...})()` IIFE too,
// with no try/catch - a REJECTED call (not merely a returned {error})
// propagated out unhandled, leaving `busy` (post: also the tab-wide
// setBusy(true)) stuck with no error shown until a full page reload. Same
// reachability hazard as Jobs 2/3/4 above (these are unexported closures,
// unrenderable in this repo's node-env vitest), same source-text ordering
// idiom as JOB 2's own test.
describe("D1: refine()/saveEdit()/post() are each wrapped in runGenerationCall too", () => {
  const HOOK_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useLmsGeneration.ts");
  const hookSource = readFileSync(HOOK_PATH, "utf8");

  /** The text between two markers, scoping a check to one function's body so
   * a match in a sibling function can never satisfy it by accident - same
   * idea as `genericBranchBody` above, generalized to a caller-supplied end
   * marker since these three functions are declared back to back. */
  function sourceBetween(startMarker: string, endMarker: string): string {
    const start = hookSource.indexOf(startMarker);
    expect(start, `start marker not found: ${startMarker}`).toBeGreaterThan(-1);
    const end = hookSource.indexOf(endMarker, start);
    expect(end, `end marker not found after start: ${endMarker}`).toBeGreaterThan(start);
    return hookSource.slice(start, end);
  }

  /** Same ordering check as JOB 2's own test: runGenerationCall's opening
   * paren appears before the wrapped action's, i.e. the action call is
   * nested INSIDE runGenerationCall, not merely present somewhere nearby. */
  function expectWrapped(body: string, actionName: string): void {
    const runIdx = body.indexOf("runGenerationCall(");
    const innerIdx = body.indexOf(`${actionName}(`, runIdx);
    expect(runIdx, `runGenerationCall( not found`).toBeGreaterThan(-1);
    expect(innerIdx, `${actionName}( not found after runGenerationCall(`).toBeGreaterThan(runIdx);
  }

  it("refine(): refineGeneratedArtifactAction is wrapped in runGenerationCall, not awaited bare", () => {
    const body = sourceBetween("const refine = () => {", "const saveEdit = (text: string) => {");
    expectWrapped(body, "refineGeneratedArtifactAction");
  });

  it("saveEdit(): saveEditedGeneratedArtifactAction is wrapped in runGenerationCall, not awaited bare", () => {
    const body = sourceBetween("const saveEdit = (text: string) => {", "const post = () => {");
    expectWrapped(body, "saveEditedGeneratedArtifactAction");
  });

  it("post(): postGeneratedArtifactAction is wrapped in runGenerationCall, not awaited bare - the worst of the three, since a rejection here used to strand the tab-wide setBusy(true)", () => {
    const body = sourceBetween("const post = () => {", "const choosePostModule = (v: string) => {");
    expectWrapped(body, "postGeneratedArtifactAction");
    // The tab-wide flag itself: still set/cleared around the SAME wrapped
    // call, not moved inside a branch that a rejection could now skip.
    expect(body).toMatch(/setBusy\(true\)/);
    expect(body).toMatch(/setBusy\(false\)/);
  });
});

