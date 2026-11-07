import { createHash, timingSafeEqual } from "node:crypto";

/**
 * A validation contract for a future server-owned intake store. It neither
 * authorizes a caller nor retains, fetches, dispatches, or deletes sources.
 * The caller must authorize scope, retain immutable bytes, and bind the
 * snapshot to a grading attempt atomically before acknowledging intake. The
 * caller must also validate provenance against the captured source; its digest
 * alone does not establish authenticity. Composite inputs require one snapshot
 * per atomic source and a separate completeness check over the whole input.
 */
export type IntakeOrigin = "text" | "file" | "url-snapshot" | "archive-entry" | "video";
export type IntakeCompleteness = "complete" | "incomplete";

export interface IntakeScope {
  readonly ownerId: string;
  readonly sessionId: string;
  readonly itemId: string;
}

export interface IntakeSnapshot extends IntakeScope {
  readonly version: 1;
  readonly sourceId: string;
  readonly origin: IntakeOrigin;
  /** Scoped immutable object key; it must not contain a filename or URL. */
  readonly objectKey: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly capturedAtMs: number;
  readonly completeness: IntakeCompleteness;
  /** Digest of server-recorded provenance, never a raw URL or credential. */
  readonly provenanceSha256: string;
}

export interface IntakeLimits {
  /** Server-owned limit, not a value supplied by a browser. */
  readonly maxBytes: number;
  /** Server clock used to reject impossible future capture timestamps. */
  readonly nowMs: number;
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const ORIGINS = new Set<IntakeOrigin>(["text", "file", "url-snapshot", "archive-entry", "video"]);
const SNAPSHOT_KEYS = new Set([
  "version", "ownerId", "sessionId", "itemId", "sourceId", "origin", "objectKey", "sha256", "byteLength", "capturedAtMs", "completeness", "provenanceSha256",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function id(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Generate an opaque namespace without embedding untrusted paths. */
export function intakeObjectKey(scope: IntakeScope, sourceId: string): string | null {
  if (!isObject(scope) || !id(scope.ownerId) || !id(scope.sessionId) || !id(scope.itemId) || !id(sourceId)) return null;
  return `${scope.ownerId.toLowerCase()}/${scope.sessionId.toLowerCase()}/${scope.itemId.toLowerCase()}/${sourceId.toLowerCase()}`;
}

/** Validate metadata while retaining an explicit completeness state. */
export function validateIntakeSnapshot(value: unknown, scope: IntakeScope, limits: IntakeLimits): IntakeSnapshot | null {
  if (!isObject(value) || !isObject(scope) || !isObject(limits)
    || Object.keys(value).length !== SNAPSHOT_KEYS.size || Object.keys(value).some((key) => !SNAPSHOT_KEYS.has(key))
    || !id(scope.ownerId) || !id(scope.sessionId) || !id(scope.itemId)
    || !id(value.ownerId) || !id(value.sessionId) || !id(value.itemId) || !id(value.sourceId)
    || value.version !== 1 || typeof value.origin !== "string" || !ORIGINS.has(value.origin as IntakeOrigin)
    || (value.completeness !== "complete" && value.completeness !== "incomplete")
    || typeof value.sha256 !== "string" || !HASH.test(value.sha256)
    || typeof value.provenanceSha256 !== "string" || !HASH.test(value.provenanceSha256)
    || typeof value.objectKey !== "string" || !Number.isSafeInteger(value.byteLength)
    || !Number.isSafeInteger(value.capturedAtMs) || !Number.isSafeInteger(limits.maxBytes)
    || !Number.isSafeInteger(limits.nowMs) || limits.maxBytes < 0 || limits.nowMs < 0) return null;
  if (value.ownerId.toLowerCase() !== scope.ownerId.toLowerCase()
    || value.sessionId.toLowerCase() !== scope.sessionId.toLowerCase()
    || value.itemId.toLowerCase() !== scope.itemId.toLowerCase()
    || value.objectKey !== intakeObjectKey(scope, value.sourceId)
    || (value.byteLength as number) < 0 || (value.byteLength as number) > limits.maxBytes
    || (value.capturedAtMs as number) < 0 || (value.capturedAtMs as number) > limits.nowMs) return null;
  return Object.freeze({
    version: 1, ownerId: value.ownerId.toLowerCase(), sessionId: value.sessionId.toLowerCase(),
    itemId: value.itemId.toLowerCase(), sourceId: value.sourceId.toLowerCase(), origin: value.origin as IntakeOrigin,
    objectKey: value.objectKey, sha256: value.sha256, byteLength: value.byteLength as number,
    capturedAtMs: value.capturedAtMs as number, completeness: value.completeness,
    provenanceSha256: value.provenanceSha256,
  });
}

/** Verify retrieved bytes; incomplete extraction must never be dispatched. */
export function verifyIntakePayload(value: unknown, scope: IntakeScope, limits: IntakeLimits, bytes: Uint8Array): boolean {
  const snapshot = validateIntakeSnapshot(value, scope, limits);
  if (!snapshot || snapshot.completeness !== "complete" || !(bytes instanceof Uint8Array)
    || snapshot.byteLength !== bytes.byteLength) return false;
  const actual = createHash("sha256").update(bytes).digest();
  const expected = Buffer.from(snapshot.sha256, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
