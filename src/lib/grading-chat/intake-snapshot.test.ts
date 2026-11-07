import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { intakeObjectKey, validateIntakeSnapshot, verifyIntakePayload } from "./intake-snapshot";

const scope = {
  ownerId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  sessionId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  itemId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
};
const sourceId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const bytes = Buffer.from("student submission");
const limits = { maxBytes: 100, nowMs: 200 };
const digest = createHash("sha256").update(bytes).digest("hex");
const snapshot = {
  ...scope, version: 1, sourceId, origin: "file", objectKey: intakeObjectKey(scope, sourceId),
  sha256: digest, byteLength: bytes.length, capturedAtMs: 100, completeness: "complete",
  provenanceSha256: "a".repeat(64),
};

describe("intake snapshot contract", () => {
  it.each(["text", "file", "url-snapshot", "archive-entry", "video"])("accepts a scoped atomic %s source", (origin) => {
    const result = validateIntakeSnapshot({ ...snapshot, origin }, scope, limits);
    expect(result?.origin).toBe(origin);
    expect(Object.isFrozen(result)).toBe(true);
    expect(verifyIntakePayload({ ...snapshot, origin }, scope, limits, bytes)).toBe(true);
  });

  it("normalizes identifiers without including user-controlled paths", () => {
    const upperScope = Object.fromEntries(Object.entries(scope).map(([key, value]) => [key, value.toUpperCase()])) as typeof scope;
    expect(intakeObjectKey(upperScope, sourceId.toUpperCase())).toBe(snapshot.objectKey);
    expect(validateIntakeSnapshot({ ...snapshot, ...upperScope, sourceId: sourceId.toUpperCase() }, upperScope, limits)?.ownerId).toBe(scope.ownerId);
    expect(intakeObjectKey(scope, "../student-file")).toBeNull();
  });

  it.each([
    { ownerId: scope.sessionId }, { sessionId: scope.itemId }, { itemId: scope.ownerId },
    { objectKey: `${snapshot.objectKey}/../other` }, { sourceId: "not-an-id" },
    { origin: "composite" }, { origin: "url" }, { version: 2 },
    { sha256: "a".repeat(63) }, { provenanceSha256: "A".repeat(64) },
    { byteLength: -1 }, { byteLength: 101 }, { byteLength: 0.5 },
    { capturedAtMs: -1 }, { capturedAtMs: 201 }, { completeness: "unknown" },
    { rawUrl: "https://example.test/private" },
  ])("rejects invalid or unscoped metadata: %j", (change) => {
    expect(validateIntakeSnapshot({ ...snapshot, ...change }, scope, limits)).toBeNull();
    expect(verifyIntakePayload({ ...snapshot, ...change }, scope, limits, bytes)).toBe(false);
  });

  it("fails closed for invalid limits, missing metadata, and malformed values", () => {
    expect(validateIntakeSnapshot(null, scope, limits)).toBeNull();
    expect(validateIntakeSnapshot({}, scope, limits)).toBeNull();
    expect(validateIntakeSnapshot(snapshot, scope, { ...limits, maxBytes: Infinity })).toBeNull();
    expect(validateIntakeSnapshot(snapshot, scope, { ...limits, nowMs: -1 })).toBeNull();
  });

  it("requires complete extraction and the exact retained bytes", () => {
    const incomplete = { ...snapshot, completeness: "incomplete" };
    expect(validateIntakeSnapshot(incomplete, scope, limits)?.completeness).toBe("incomplete");
    expect(verifyIntakePayload(incomplete, scope, limits, bytes)).toBe(false);
    expect(verifyIntakePayload(snapshot, scope, limits, Buffer.from("student submissioN"))).toBe(false);
    expect(verifyIntakePayload(snapshot, scope, limits, bytes.subarray(1))).toBe(false);
  });
});
