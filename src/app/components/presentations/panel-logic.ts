// Pure logic for the Presentations > Slide Deck Creation panel (PRES-1 wave 3).
//
// Kept in a plain .ts leaf (not the .tsx) because vitest here is node-env and
// collects only src/**/*.test.ts - no component is ever rendered, so any
// logic left inside the panel component could never be exercised by a test.
// Everything below is pure: no fetch, no DOM, no localStorage global reached
// directly (storage access takes an injected KeyValueStorage so tests never
// need `window`).

import type {
  ArtifactSelection,
  ContentArtifactKind,
  PresentationContext,
  PresentationSource,
  ProducedArtifact,
  RegenerateInput,
} from "@/lib/presentations/types";
import type { DeckSourceResult } from "@/lib/decks/deck-source";

// ---------------------------------------------------------------------------
// Request-body builders (fresh vs regenerate; the route contract in
// src/app/api/presentations/generate/route.ts).
// ---------------------------------------------------------------------------

export interface GenerateRequestBody {
  context: PresentationContext;
  selection: ArtifactSelection;
  kind: ContentArtifactKind;
}

export function buildGenerateRequestBody(
  context: PresentationContext,
  selection: ArtifactSelection,
  kind: ContentArtifactKind
): GenerateRequestBody {
  return { context, selection, kind };
}

export type RegenerateRequestBody = RegenerateInput & { mode: "regenerate" };

export function buildRegenerateRequestBody(input: RegenerateInput): RegenerateRequestBody {
  return { mode: "regenerate", ...input };
}

// ---------------------------------------------------------------------------
// selectedKinds -> fetch-plan fan-out (one fetch per selected kind, never a
// server-side loop - B1).
// ---------------------------------------------------------------------------

export const CONTENT_ARTIFACT_KINDS: readonly ContentArtifactKind[] = [
  "outline",
  "activities",
  "deck",
];

export const KIND_LABELS: Record<ContentArtifactKind, string> = {
  outline: "Lecture Outline",
  activities: "Hands-On Activity Ideas",
  deck: "Slide Deck",
};

export function selectedKinds(selection: ArtifactSelection): ContentArtifactKind[] {
  return CONTENT_ARTIFACT_KINDS.filter((kind) => selection[kind]);
}

// ---------------------------------------------------------------------------
// response -> UI-state reducer. The route distinguishes success/failure by
// BOTH the HTTP status and the JSON `status` field - this reducer branches on
// both, exactly as the brief requires, so a malformed or unexpected body
// never renders as a silent success.
// ---------------------------------------------------------------------------

export type ArtifactOutcome =
  | { phase: "ok"; artifact: ProducedArtifact; reviewSkipped: boolean }
  | { phase: "error"; message: string; retryable: boolean };

interface ApiOkBody {
  status: "ok";
  artifact: ProducedArtifact;
  // Present and true when a critique was requested but skipped for lack of
  // time budget (distinct from a null critique that actually ran and
  // produced nothing) - B2. Absent on older/other bodies, read defensively.
  reviewSkipped?: boolean;
}

interface ApiErrorBody {
  status: "error";
  error: string;
  kind?: ContentArtifactKind;
  partial?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOkBody(value: unknown): value is ApiOkBody {
  return isRecord(value) && value.status === "ok" && isRecord(value.artifact);
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return isRecord(value) && value.status === "error" && typeof value.error === "string";
}

const GENERIC_SIGNED_OUT = "You're signed out - sign in and try again.";
const GENERIC_TIMEOUT = "The request timed out before finishing. Try again.";
const GENERIC_FAILED = "Generation failed for this artifact.";
const GENERIC_BAD_REQUEST = "The request was invalid.";
const GENERIC_UNEXPECTED = "An unexpected error occurred.";

export function reduceGenerateResponse(httpStatus: number, body: unknown): ArtifactOutcome {
  if (httpStatus === 200 && isOkBody(body)) {
    return {
      phase: "ok",
      artifact: body.artifact as ProducedArtifact,
      reviewSkipped: body.reviewSkipped === true,
    };
  }

  const errorMessage = isErrorBody(body) ? body.error : null;

  if (httpStatus === 401) {
    return { phase: "error", message: errorMessage ?? GENERIC_SIGNED_OUT, retryable: true };
  }
  if (httpStatus === 504) {
    return { phase: "error", message: errorMessage ?? GENERIC_TIMEOUT, retryable: true };
  }
  if (httpStatus === 502) {
    return { phase: "error", message: errorMessage ?? GENERIC_FAILED, retryable: true };
  }
  if (httpStatus === 400) {
    return { phase: "error", message: errorMessage ?? GENERIC_BAD_REQUEST, retryable: false };
  }
  return { phase: "error", message: errorMessage ?? GENERIC_UNEXPECTED, retryable: true };
}

// ---------------------------------------------------------------------------
// Download filename/blob construction. The blob/anchor DOM dance itself
// stays in the .tsx (untestable here); this piece - deriving a safe filename
// from the deck's title - is pure.
// ---------------------------------------------------------------------------

export function deckDownloadFilename(presentationTitle: string): string {
  const base = presentationTitle
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${base || "presentation"}.pptx`;
}

// ---------------------------------------------------------------------------
// localStorage key round-trips. Storage is injected (KeyValueStorage) rather
// than reaching the `localStorage` global directly, so this is testable with
// a plain mock object and needs no `window` (vitest here is node-env).
// ---------------------------------------------------------------------------

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PRES_CONTEXT_TEXT_KEY = "ta-pres-context-text";
export const PRES_SOURCES_KEY = "ta-pres-sources";
export const PRES_SELECTION_KEY = "ta-pres-selection";

export function readPersistedString(
  storage: KeyValueStorage,
  key: string,
  fallback: string
): string {
  try {
    const value = storage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function readPersistedJSON<T>(storage: KeyValueStorage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writePersistedString(storage: KeyValueStorage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage failures (private mode, quota, etc.) - same idiom as
    // the rest of the app's persisted controls.
  }
}

export function writePersistedJSON<T>(storage: KeyValueStorage, key: string, value: T): void {
  writePersistedString(storage, key, JSON.stringify(value));
}

export const DEFAULT_ARTIFACT_SELECTION: ArtifactSelection = {
  outline: true,
  activities: true,
  deck: true,
  review: true,
};

// ---------------------------------------------------------------------------
// Drag-and-drop file intake -> PresentationSource. The byte-to-text
// extraction itself happens server-side (extractDeckSourceFileAction, reused
// verbatim from A43-S - no second extractor); this module only shapes that
// action's result union into a PresentationSource, or passes its error
// through untouched for per-file display, and decides the append order and
// name collision handling. FileReader/base64 and the drag events stay in
// SourcesEditor.tsx - owner-verification only, not exercised here.
// ---------------------------------------------------------------------------

/**
 * Map one extractDeckSourceFileAction result to a PresentationSource (success)
 * or pass its { error } through unchanged (failure), so a caller can display
 * that error against the ONE file that failed without touching the others.
 */
export function deckSourceResultToSource(
  name: string,
  result: DeckSourceResult | { error: string }
): PresentationSource | { error: string } {
  if ("error" in result) {
    return { error: result.error };
  }
  return { name, text: result.materials };
}

/**
 * Append newly-extracted sources to the existing list, in the order the
 * files were dropped/picked. Extracted files never replace or reorder
 * existing sources (they are additive, same as "Add pasted source").
 */
export function appendExtractedSources(
  existing: PresentationSource[],
  added: PresentationSource[]
): PresentationSource[] {
  return [...existing, ...added];
}

/**
 * A dropped file's name may collide with an existing source's name (two
 * files named "notes.txt" from different folders, or a repeat drop of the
 * same file). Rather than silently overwriting or producing two
 * identically-named sources, suffix " (2)", " (3)", ... until unique.
 */
export function uniqueSourceName(existingNames: string[], name: string): string {
  if (!existingNames.includes(name)) return name;
  let n = 2;
  while (existingNames.includes(`${name} (${n})`)) {
    n += 1;
  }
  return `${name} (${n})`;
}

/**
 * Append one successfully-extracted file to `prev`, naming it uniquely
 * AGAINST `prev` in the same step. This is meant to be called from inside a
 * functional state updater (prev => appendExtractedSourceNamed(prev, ...))
 * so the name collision check always runs against the latest committed
 * sources rather than a snapshot taken before an earlier concurrent drop's
 * extraction finished - two overlapping drops (e.g. A.pdf and B.txt, dropped
 * while A is still extracting) each compose against the array the other one
 * just produced instead of racing on a shared stale base, so neither file is
 * silently lost and both end up uniquely named.
 */
export function appendExtractedSourceNamed(
  prev: PresentationSource[],
  rawName: string,
  text: string
): PresentationSource[] {
  const name = uniqueSourceName(
    prev.map((s) => s.name),
    rawName
  );
  return appendExtractedSources(prev, [{ name, text }]);
}
