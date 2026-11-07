/**
 * Validation contract for a future durable grading-chat source store.
 *
 * This module does not authorize callers, retain content, or delete objects.
 * A server-side caller must establish owner/session/item authorization and
 * enforce this decision atomically with claims and reference mutations.
 */
export type RetainedSourceKind = "text" | "file" | "url-snapshot" | "video";
export type SourceReference = Readonly<{
  ownerId: string;
  sessionId: string;
  itemId: string;
  kind: RetainedSourceKind;
  objectKey: string;
  sha256: string;
  sizeBytes: number;
  createdAtMs: number;
  expiresAtMs: number;
}>;

export type SourceScope = Readonly<{ ownerId: string; sessionId: string; itemId: string }>;
export type SourceUseState = "queued" | "claimed" | "dispatched" | "unknown" | "succeeded" | "failed" | "discarded";
export type SourceUse = Readonly<{ sourceKey: string; state: SourceUseState; retainedForRegrade: boolean }>;

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const SOURCE_KINDS = new Set<RetainedSourceKind>(["text", "file", "url-snapshot", "video"]);
const BLOCKING_STATES = new Set<SourceUseState>(["queued", "claimed", "dispatched", "unknown"]);
const ALL_STATES = new Set<SourceUseState>([...BLOCKING_STATES, "succeeded", "failed", "discarded"]);

// The future caller supplies product-approved limits; this contract does not
// choose a retention policy or trust browser-provided limits.
export type SourceLimits = Readonly<{ maxBytes: number; maxLifetimeMs: number }>;

function validScope(scope: SourceScope): boolean {
  return typeof scope === "object" && scope !== null
    && typeof scope.ownerId === "string" && UUID.test(scope.ownerId)
    && typeof scope.sessionId === "string" && UUID.test(scope.sessionId)
    && typeof scope.itemId === "string" && UUID.test(scope.itemId);
}

/** Exact private object namespace; no user filename or mutable URL is embedded. */
export function sourceObjectKey(scope: SourceScope, sourceId: string): string | null {
  if (!validScope(scope) || typeof sourceId !== "string" || !UUID.test(sourceId)) return null;
  return `${scope.ownerId.toLowerCase()}/${scope.sessionId.toLowerCase()}/${scope.itemId.toLowerCase()}/${sourceId.toLowerCase()}`;
}

/** Validate a fully materialized immutable object reference against trusted limits. */
export function validateSourceReference(value: SourceReference, scope: SourceScope, limits: SourceLimits): boolean {
  if (!validScope(scope) || !validScope(value) || !SOURCE_KINDS.has(value.kind)
    || typeof value.objectKey !== "string" || typeof value.sha256 !== "string"
    || typeof limits !== "object" || limits === null) return false;
  if (value.ownerId.toLowerCase() !== scope.ownerId.toLowerCase()
    || value.sessionId.toLowerCase() !== scope.sessionId.toLowerCase()
    || value.itemId.toLowerCase() !== scope.itemId.toLowerCase()) return false;
  const sourceId = value.objectKey.split("/").at(-1) ?? "";
  if (sourceObjectKey(scope, sourceId) !== value.objectKey || !HASH.test(value.sha256)) return false;
  if (!Number.isSafeInteger(limits.maxBytes) || limits.maxBytes <= 0
    || !Number.isSafeInteger(limits.maxLifetimeMs) || limits.maxLifetimeMs <= 0) return false;
  return Number.isSafeInteger(value.sizeBytes) && value.sizeBytes >= 0 && value.sizeBytes <= limits.maxBytes
    && Number.isSafeInteger(value.createdAtMs) && value.createdAtMs >= 0
    && Number.isSafeInteger(value.expiresAtMs) && value.expiresAtMs > value.createdAtMs
    && value.expiresAtMs - value.createdAtMs <= limits.maxLifetimeMs;
}

/**
 * Advisory only. The caller must hold locks covering the source and every
 * reference until deletion completes; incomplete or malformed snapshots refuse.
 */
export function canDeleteRetainedSource(args: {
  source: SourceReference;
  scope: SourceScope;
  limits: SourceLimits;
  nowMs: number;
  uses: readonly SourceUse[];
  completeSnapshot: boolean;
}): boolean {
  if (typeof args !== "object" || args === null) return false;
  const { source, scope, limits, nowMs, uses, completeSnapshot } = args;
  if (completeSnapshot !== true || !validateSourceReference(source, scope, limits)
    || !Number.isSafeInteger(nowMs) || nowMs < source.expiresAtMs || !Array.isArray(uses)) return false;
  for (let index = 0; index < uses.length; index += 1) {
    // Array iteration methods skip sparse slots; a missing reference is not a
    // complete snapshot and must not authorize deletion.
    if (!Object.hasOwn(uses, index)) return false;
    const use = uses[index];
    if (typeof use !== "object" || use === null || use.sourceKey !== source.objectKey
      || !ALL_STATES.has(use.state) || use.retainedForRegrade !== false || BLOCKING_STATES.has(use.state)) return false;
  }
  return true;
}
