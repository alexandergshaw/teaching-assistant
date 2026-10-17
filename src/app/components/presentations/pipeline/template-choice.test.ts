import { describe, expect, it, vi } from "vitest";
import {
  chooseLibraryTemplate,
  chooseRawTemplate,
  createTemplateChoiceGate,
  initialTemplateChoiceState,
  reduceTemplateChoice,
  resolveLibraryChoiceIfCurrent,
  resolveLibraryTemplateChoice,
  resolveAvailableLibraryTemplateChoice,
  resolveTemplateForDownload,
  pipelineTemplateFailureCategory,
} from "./template-choice";

const LIBRARY = { id: "library-L", sourceFileId: "source-S", name: "Reviewed lecture", updatedAt: "2026-10-16T00:00:00Z" };

describe("pipeline template choice", () => {
  async function expectLaterLibraryRoute(libraries: typeof LIBRARY[]) {
    const actions = {
      getLibrary: vi.fn().mockResolvedValue({ library: { ...LIBRARY, name: "Latest reviewed lecture" } }),
      reuseLibrary: vi.fn().mockResolvedValue({ sourceFileId: "source-S" }),
    };
    const selected = await resolveAvailableLibraryTemplateChoice("library-L", libraries, actions);
    expect(selected).toEqual({ choice: { kind: "library", libraryId: "library-L", sourceFileId: "source-S", name: "Latest reviewed lecture" } });
    if (!("choice" in selected)) throw new Error("Library route missing");
    expect(await resolveTemplateForDownload(selected.choice, actions)).toEqual({
      source: { kind: "library", sourceFileId: "source-S", name: "Latest reviewed lecture" },
    });
  }

  it("routes an available library in a later run and kills the choices-removed mutant at selection", async () => {
    const availableResult = { libraries: [LIBRARY] };
    await expectLaterLibraryRoute(availableResult.libraries);
    // The exact CORPUS mutant removes saved-library choices while raw source S remains available.
    const removedResult = { libraries: availableResult.libraries.filter((library) => library.id !== "library-L") };
    await expect(expectLaterLibraryRoute(removedResult.libraries)).rejects.toMatchObject({ name: "AssertionError" });
    await expectLaterLibraryRoute(availableResult.libraries);
  });

  it("cannot reach authenticated source resolution through an absent library, while raw remains usable", async () => {
    const actions = { getLibrary: vi.fn(), reuseLibrary: vi.fn() };
    expect(await resolveAvailableLibraryTemplateChoice("library-L", [], actions)).toEqual({
      error: { error: "That saved library is unavailable. Reload the library list and choose again.", code: "PPT_NOT_FOUND" },
    });
    expect(actions.getLibrary).not.toHaveBeenCalled();
    expect(actions.reuseLibrary).not.toHaveBeenCalled();
    expect(await resolveTemplateForDownload(chooseRawTemplate("source-S", "Raw source S"), actions)).toEqual({
      source: { kind: "raw", sourceFileId: "source-S", name: "Raw source S" },
    });
  });

  it.each([
    ["That template no longer exists.", undefined, "PPT_UNAVAILABLE"],
    ["private library title", "PPT_NOT_FOUND", "PPT_UNAVAILABLE"],
    ["private source text", "PPT_SOURCE_STALE", "PPT_SELECTION"],
    ["Your template has 1 slide and this deck needs 3. Pick a shorter shape or a longer template.", undefined, "PPT_FIT_REFUSED"],
    ["Your template has 2 slides and this deck needs 3. Pick a shorter shape or a longer template.", undefined, "PPT_FIT_REFUSED"],
    ["private exception text", "unknown-private-code", "PPT_FILL_REFUSED"],
  ])("classifies a refusal without retaining its text or arbitrary code", (error, code, expected) => {
    expect(pipelineTemplateFailureCategory(error!, code)).toBe(expected);
  });

  it("initializes a remounted picker from the parent-owned effective library choice", () => {
    const selected = { kind: "library" as const, libraryId: "library-L", sourceFileId: "source-S", name: "Reviewed lecture" };
    expect(initialTemplateChoiceState(selected).choice).toEqual(selected);
  });

  it("switches raw to library and clearing leaves own design without reviving raw", () => {
    let state = initialTemplateChoiceState(chooseRawTemplate("raw-R", "Raw source R"));
    state = reduceTemplateChoice(state, { type: "begin-library-resolution", generation: 1 });
    const resolved = chooseLibraryTemplate("library-L", LIBRARY, "source-S");
    if ("error" in resolved) throw new Error(resolved.error.error);
    state = reduceTemplateChoice(state, { type: "library-resolved", generation: 1, choice: resolved.choice });
    expect(state.choice).toEqual({ kind: "library", libraryId: "library-L", sourceFileId: "source-S", name: "Reviewed lecture" });
    state = reduceTemplateChoice(state, { type: "cleared", generation: 2 });
    expect(state.choice).toEqual({ kind: "own" });

    state = reduceTemplateChoice(state, { type: "raw-selected", generation: 3, sourceFileId: "raw-R", name: "Raw source R" });
    state = reduceTemplateChoice(state, { type: "cleared", generation: 4 });
    expect(state.choice).toEqual({ kind: "own" });
  });

  it("keeps a late library lookup from replacing a newer raw choice or clear", () => {
    const gate = createTemplateChoiceGate();
    let state = initialTemplateChoiceState();
    const oldRequest = gate.next();
    state = reduceTemplateChoice(state, { type: "begin-library-resolution", generation: oldRequest });
    const newRequest = gate.next();
    state = reduceTemplateChoice(state, { type: "raw-selected", generation: newRequest, sourceFileId: "raw-R", name: "Raw source R" });
    const resolved = chooseLibraryTemplate("library-L", LIBRARY, "source-S");
    if ("error" in resolved) throw new Error(resolved.error.error);
    if (gate.current(oldRequest)) {
      state = reduceTemplateChoice(state, { type: "library-resolved", generation: oldRequest, choice: resolved.choice });
    }
    expect(state.choice).toEqual({ kind: "raw", sourceFileId: "raw-R", name: "Raw source R" });

    const pending = gate.next();
    state = reduceTemplateChoice(state, { type: "begin-library-resolution", generation: pending });
    const clear = gate.next();
    gate.invalidate();
    state = reduceTemplateChoice(state, { type: "cleared", generation: clear });
    expect(state.choice).toEqual({ kind: "own" });
  });

  it("does not apply a held library lookup after the picker unmounts", async () => {
    let resolveMetadata!: (value: { library: typeof LIBRARY }) => void;
    let resolveSource!: (value: { sourceFileId: string }) => void;
    const metadata = new Promise<{ library: typeof LIBRARY }>((resolve) => { resolveMetadata = resolve; });
    const source = new Promise<{ sourceFileId: string }>((resolve) => { resolveSource = resolve; });
    const actions = {
      getLibrary: vi.fn(() => metadata),
      reuseLibrary: vi.fn(() => source),
    };
    const gate = createTemplateChoiceGate();
    const generation = gate.next();
    const previous = chooseRawTemplate("raw-R", "Previous raw deck");
    let selected = previous;
    const onCurrent = vi.fn((result) => {
      if ("choice" in result) selected = result.choice;
    });

    const pending = resolveLibraryChoiceIfCurrent("library-L", actions, gate, generation, onCurrent, [LIBRARY]);
    gate.invalidate(); // picker unmount cleanup
    resolveMetadata({ library: LIBRARY });
    resolveSource({ sourceFileId: "source-S" });

    await expect(pending).resolves.toBe(false);
    expect(onCurrent).not.toHaveBeenCalled();
    expect(selected).toEqual(previous);
  });

  it("resolves the latest library name and its owned source through both authenticated actions", async () => {
    const getLibrary = vi.fn().mockResolvedValue({ library: LIBRARY });
    const reuseLibrary = vi.fn().mockResolvedValue({ sourceFileId: "source-S" });
    await expect(resolveLibraryTemplateChoice("library-L", { getLibrary, reuseLibrary })).resolves.toEqual({
      choice: { kind: "library", libraryId: "library-L", sourceFileId: "source-S", name: "Reviewed lecture" },
    });
    expect(getLibrary).toHaveBeenCalledWith("library-L");
    expect(reuseLibrary).toHaveBeenCalledWith("library-L");
  });

  it("refuses source identity disagreement and never resolves after a failed lookup", async () => {
    expect(chooseLibraryTemplate("library-L", LIBRARY, "source-other")).toEqual({
      error: expect.objectContaining({ code: "PPT_SELECTION" }),
    });
    const failure = { error: "That library is unavailable.", code: "PPT_NOT_FOUND" };
    const result = await resolveLibraryTemplateChoice("library-L", {
      getLibrary: vi.fn().mockResolvedValue({ library: LIBRARY }),
      reuseLibrary: vi.fn().mockResolvedValue(failure),
    });
    expect(result).toEqual({ error: failure });
  });

  it.each(["metadata", "reuse"] as const)("turns a rejected %s action into a visible selection error", async (rejectedAction) => {
    let state = initialTemplateChoiceState(chooseRawTemplate("raw-R", "Previous raw deck"));
    const getLibrary = vi.fn().mockResolvedValue({ library: LIBRARY });
    const reuseLibrary = vi.fn().mockResolvedValue({ sourceFileId: "source-S" });
    if (rejectedAction === "metadata") getLibrary.mockRejectedValueOnce(new Error("transport failed"));
    else reuseLibrary.mockRejectedValueOnce(new Error("transport failed"));

    const result = await resolveLibraryTemplateChoice("library-L", { getLibrary, reuseLibrary });

    expect(result).toEqual({
      error: {
        error: "Could not verify that saved library. Your current template choice was kept. Retry or choose another template.",
        code: "PPT_SELECTION",
      },
    });
    if ("error" in result) {
      state = reduceTemplateChoice(state, { type: "begin-library-resolution", generation: 1 });
      state = reduceTemplateChoice(state, { type: "library-failed", generation: 1, error: result.error });
    }
    expect(state.choice).toEqual({ kind: "raw", sourceFileId: "raw-R", name: "Previous raw deck" });
    expect(state.libraryError?.code).toBe("PPT_SELECTION");
  });

  it("re-resolves the saved library source before download and refuses a changed source", async () => {
    const selected = { kind: "library" as const, libraryId: "library-L", sourceFileId: "source-S", name: "Old name" };
    const getLibrary = vi.fn().mockResolvedValue({ library: { ...LIBRARY, name: "Current name" } });
    const reuseLibrary = vi.fn().mockResolvedValue({ sourceFileId: "source-S" });
    await expect(resolveTemplateForDownload(selected, { getLibrary, reuseLibrary })).resolves.toEqual({
      source: { kind: "library", sourceFileId: "source-S", name: "Current name" },
    });
    reuseLibrary.mockResolvedValueOnce({ sourceFileId: "source-replaced" });
    await expect(resolveTemplateForDownload(selected, { getLibrary, reuseLibrary })).resolves.toMatchObject({
      error: { code: "PPT_SELECTION" },
    });
  });

  it("preserves the previous effective choice when a new library resolution fails", () => {
    let state = initialTemplateChoiceState(chooseRawTemplate("raw-R", "Raw source R"));
    state = reduceTemplateChoice(state, { type: "begin-library-resolution", generation: 1 });
    state = reduceTemplateChoice(state, {
      type: "library-failed",
      generation: 1,
      error: { error: "Library could not be loaded.", code: "PPT_STORAGE" },
    });
    expect(state.choice).toEqual({ kind: "raw", sourceFileId: "raw-R", name: "Raw source R" });
    expect(state.libraryError?.code).toBe("PPT_STORAGE");
  });
});
