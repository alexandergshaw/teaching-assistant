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
  ProducedArtifact,
  RegenerateInput,
} from "@/lib/presentations/types";

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
