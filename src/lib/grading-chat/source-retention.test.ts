import { describe, expect, it } from "vitest";
import { canDeleteRetainedSource, sourceObjectKey, validateSourceReference, type SourceReference } from "./source-retention";

const scope = {
  ownerId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  itemId: "33333333-3333-4333-8333-333333333333",
};
const key = sourceObjectKey(scope, "44444444-4444-4444-8444-444444444444")!;
const limits = { maxBytes: 1024, maxLifetimeMs: 2000 };
const source: SourceReference = { ...scope, kind: "file", objectKey: key, sha256: "a".repeat(64), sizeBytes: 100, createdAtMs: 1000, expiresAtMs: 2000 };
const decision = (uses: Parameters<typeof canDeleteRetainedSource>[0]["uses"], overrides: Partial<Parameters<typeof canDeleteRetainedSource>[0]> = {}) =>
  canDeleteRetainedSource({ source, scope, limits, nowMs: 2000, uses, completeSnapshot: true, ...overrides });

describe("durable grading source retention contract", () => {
  it("requires an immutable, exactly owner/session/item scoped object and bounded bytes and lifetime", () => {
    expect(validateSourceReference(source, scope, limits)).toBe(true);
    expect(validateSourceReference({ ...source, ownerId: scope.sessionId }, scope, limits)).toBe(false);
    expect(validateSourceReference({ ...source, objectKey: `${key}/../other` }, scope, limits)).toBe(false);
    expect(validateSourceReference({ ...source, objectKey: "https://example.test/private" }, scope, limits)).toBe(false);
    expect(validateSourceReference({ ...source, sha256: "z".repeat(64) }, scope, limits)).toBe(false);
    expect(validateSourceReference({ ...source, sizeBytes: 1025 }, scope, limits)).toBe(false);
    expect(validateSourceReference({ ...source, expiresAtMs: 3001 }, scope, limits)).toBe(false);
    expect(sourceObjectKey(scope, "../../escape")).toBeNull();
  });

  it("keeps queued, claimed, dispatched and unknown work, including after expiry", () => {
    for (const state of ["queued", "claimed", "dispatched", "unknown"] as const) {
      expect(decision([{ sourceKey: key, state, retainedForRegrade: false }])).toBe(false);
    }
    expect(decision([{ sourceKey: key, state: "succeeded", retainedForRegrade: true }])).toBe(false);
  });

  it("permits an expired source only when the complete reference snapshot is terminal and releasable", () => {
    expect(decision([{ sourceKey: key, state: "succeeded", retainedForRegrade: false }, { sourceKey: key, state: "failed", retainedForRegrade: false }])).toBe(true);
    expect(decision([], { nowMs: 1999 })).toBe(false);
    expect(decision([], { completeSnapshot: false })).toBe(false);
    expect(decision([{ sourceKey: "different", state: "discarded", retainedForRegrade: false }])).toBe(false);
    expect(decision([{ sourceKey: key, state: "future-state" as never, retainedForRegrade: false }])).toBe(false);
  });

  it("fails closed on malformed runtime inputs rather than throwing", () => {
    expect(sourceObjectKey(null as never, "44444444-4444-4444-8444-444444444444")).toBeNull();
    expect(sourceObjectKey(scope, null as never)).toBeNull();
    for (const malformed of [null, undefined, {}, { ...source, objectKey: null }, { ...source, objectKey: 3 }, { ...source, sha256: null }]) {
      expect(() => validateSourceReference(malformed as never, scope, limits)).not.toThrow();
      expect(validateSourceReference(malformed as never, scope, limits)).toBe(false);
    }
    expect(validateSourceReference(source, null as never, limits)).toBe(false);
    expect(validateSourceReference(source, scope, null as never)).toBe(false);
    expect(canDeleteRetainedSource(null as never)).toBe(false);
    expect(decision([], { source: { ...source, objectKey: null } as never })).toBe(false);
    expect(decision([null as never])).toBe(false);
  });

  it("rejects sparse snapshots even when every present reference is releasable", () => {
    const sparse = new Array<Parameters<typeof decision>[0][number]>(2);
    sparse[0] = { sourceKey: key, state: "succeeded", retainedForRegrade: false };
    expect(decision(sparse)).toBe(false);
    expect(decision(new Array(1))).toBe(false);
    expect(decision([{ sourceKey: key, state: "succeeded", retainedForRegrade: false }, undefined as never])).toBe(false);
  });
});
