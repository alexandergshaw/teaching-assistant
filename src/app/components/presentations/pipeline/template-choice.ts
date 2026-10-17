import type { LibraryMeta } from "@/lib/powerpoint-template-library/types";

export type PipelineTemplateChoice =
  | { kind: "own" }
  | { kind: "raw"; sourceFileId: string; name: string }
  | { kind: "library"; libraryId: string; sourceFileId: string; name: string };

export type PipelineTemplateChoiceError = { error: string; code?: string };

export type PipelineTemplateChoiceResult =
  | { choice: Extract<PipelineTemplateChoice, { kind: "library" }> }
  | { error: PipelineTemplateChoiceError };

export type ResolvedTemplateSource = {
  kind: "own" | "raw" | "library";
  sourceFileId: string;
  name: string;
};

export type PipelineLibraryActions = {
  getLibrary(id: string): Promise<{ library: LibraryMeta } | PipelineTemplateChoiceError>;
  reuseLibrary(id: string): Promise<{ sourceFileId: string } | PipelineTemplateChoiceError>;
};

export const ownTemplateChoice: PipelineTemplateChoice = { kind: "own" };

export function chooseRawTemplate(sourceFileId: string, name: string): PipelineTemplateChoice {
  return sourceFileId.trim() ? { kind: "raw", sourceFileId, name } : ownTemplateChoice;
}

export function chooseLibraryTemplate(
  libraryId: string,
  library: LibraryMeta,
  resolvedSourceFileId: string
): PipelineTemplateChoiceResult {
  if (!libraryId.trim() || library.id !== libraryId || !library.sourceFileId || library.sourceFileId !== resolvedSourceFileId) {
    return { error: { error: "That saved library no longer matches its source deck. Reload the library and try again.", code: "PPT_SELECTION" } };
  }
  return { choice: { kind: "library", libraryId, sourceFileId: resolvedSourceFileId, name: library.name } };
}

/** Resolve identity and source through the authenticated actions before selection or fill. */
export async function resolveLibraryTemplateChoice(
  libraryId: string,
  actions: PipelineLibraryActions
): Promise<PipelineTemplateChoiceResult> {
  if (!libraryId.trim()) return { error: { error: "Choose a saved PowerPoint library.", code: "PPT_SELECTION" } };
  let metadata: Awaited<ReturnType<PipelineLibraryActions["getLibrary"]>>;
  let source: Awaited<ReturnType<PipelineLibraryActions["reuseLibrary"]>>;
  try {
    [metadata, source] = await Promise.all([actions.getLibrary(libraryId), actions.reuseLibrary(libraryId)]);
  } catch {
    return {
      error: {
        error: "Could not verify that saved library. Your current template choice was kept. Retry or choose another template.",
        code: "PPT_SELECTION",
      },
    };
  }
  if ("error" in metadata) return { error: metadata };
  if ("error" in source) return { error: source };
  return chooseLibraryTemplate(libraryId, metadata.library, source.sourceFileId);
}

export async function resolveTemplateForDownload(
  choice: PipelineTemplateChoice,
  actions: PipelineLibraryActions
): Promise<{ source: ResolvedTemplateSource } | { error: PipelineTemplateChoiceError }> {
  if (choice.kind === "own") return { source: { kind: "own", sourceFileId: "", name: "Generated deck design" } };
  if (choice.kind === "raw") return { source: { kind: "raw", sourceFileId: choice.sourceFileId, name: choice.name } };
  const resolved = await resolveLibraryTemplateChoice(choice.libraryId, actions);
  if ("error" in resolved) return resolved;
  if (resolved.choice.sourceFileId !== choice.sourceFileId) {
    return { error: { error: "This library now points to a different source deck. Select it again before downloading.", code: "PPT_SELECTION" } };
  }
  return { source: { kind: "library", sourceFileId: resolved.choice.sourceFileId, name: resolved.choice.name } };
}

/** A later run can select only a library actually offered by its loaded list. */
export async function resolveAvailableLibraryTemplateChoice(
  libraryId: string,
  libraries: readonly LibraryMeta[],
  actions: PipelineLibraryActions
): Promise<PipelineTemplateChoiceResult> {
  if (!libraries.some((library) => library.id === libraryId)) {
    return { error: { error: "That saved library is unavailable. Reload the library list and choose again.", code: "PPT_NOT_FOUND" } };
  }
  return resolveLibraryTemplateChoice(libraryId, actions);
}

export type PipelineTemplateFailureCategory = "PPT_UNAVAILABLE" | "PPT_SELECTION" | "PPT_FIT_REFUSED" | "PPT_FILL_REFUSED" | "PPT_RESOLVE_REFUSED";

/** Classify legacy free-text fill refusals without ever recording that text. */
export function pipelineTemplateFailureCategory(error: string, code?: string, phase: "resolve" | "fill" = "fill"): PipelineTemplateFailureCategory {
  if (code === "PPT_NOT_FOUND" || error === "That template no longer exists.") return "PPT_UNAVAILABLE";
  if (code === "PPT_SELECTION" || code === "PPT_SOURCE_STALE") return "PPT_SELECTION";
  if (/^Your template has \d+ slides? and this deck needs \d+\. Pick a shorter shape or a longer template\.$/.test(error)) return "PPT_FIT_REFUSED";
  return phase === "resolve" ? "PPT_RESOLVE_REFUSED" : "PPT_FILL_REFUSED";
}

export type TemplateChoiceState = {
  choice: PipelineTemplateChoice;
  libraryLoading: boolean;
  libraryError: PipelineTemplateChoiceError | null;
  generation: number;
};

export function initialTemplateChoiceState(choice: PipelineTemplateChoice = ownTemplateChoice): TemplateChoiceState {
  return { choice, libraryLoading: false, libraryError: null, generation: 0 };
}

export type TemplateChoiceEvent =
  | { type: "begin-library-resolution"; generation: number }
  | { type: "library-resolved"; generation: number; choice: Extract<PipelineTemplateChoice, { kind: "library" }> }
  | { type: "library-failed"; generation: number; error: PipelineTemplateChoiceError }
  | { type: "raw-selected"; generation: number; sourceFileId: string; name: string }
  | { type: "cleared"; generation: number }
  | { type: "external-raw-changed"; generation: number; sourceFileId: string; name: string };

export function reduceTemplateChoice(state: TemplateChoiceState, event: TemplateChoiceEvent): TemplateChoiceState {
  if (event.generation < state.generation) return state;
  switch (event.type) {
    case "begin-library-resolution":
      return { ...state, generation: event.generation, libraryLoading: true, libraryError: null };
    case "library-resolved":
      return { choice: event.choice, generation: event.generation, libraryLoading: false, libraryError: null };
    case "library-failed":
      return { ...state, generation: event.generation, libraryLoading: false, libraryError: event.error };
    case "raw-selected":
    case "external-raw-changed":
      return {
        choice: chooseRawTemplate(event.sourceFileId, event.name),
        generation: event.generation,
        libraryLoading: false,
        libraryError: null,
      };
    case "cleared":
      return { choice: ownTemplateChoice, generation: event.generation, libraryLoading: false, libraryError: null };
  }
}

export function createTemplateChoiceGate() {
  let generation = 0;
  return {
    next(): number { generation += 1; return generation; },
    current(token: number): boolean { return token === generation; },
    invalidate(): number { generation += 1; return generation; },
  };
}

/** Apply a library lookup only while the picker that started it is still mounted/current. */
export async function resolveLibraryChoiceIfCurrent(
  libraryId: string,
  actions: PipelineLibraryActions,
  gate: ReturnType<typeof createTemplateChoiceGate>,
  generation: number,
  onCurrent: (result: PipelineTemplateChoiceResult) => void,
  libraries: readonly LibraryMeta[]
): Promise<boolean> {
  const result = await resolveAvailableLibraryTemplateChoice(libraryId, libraries, actions);
  if (!gate.current(generation)) return false;
  onCurrent(result);
  return true;
}
