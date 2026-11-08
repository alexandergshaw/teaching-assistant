import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { finishArchiveOperation, retireArchiveSource, startArchiveOperation, type ArchiveOperationLedger } from "./archive-review-operations";

const OWNER = "11111111-1111-4111-8111-111111111111";
const REVIEW = "22222222-2222-4222-8222-222222222222";
const SOURCE = "33333333-3333-4333-8333-333333333333";
const WRITE = "44444444-4444-4444-8444-444444444444";
const READ1 = "55555555-5555-4555-8555-555555555555";
const READ2 = "66666666-6666-4666-8666-666666666666";
const DELETE = "77777777-7777-4777-8777-777777777777";
const HASH = "a".repeat(64);
const empty: ArchiveOperationLedger = { phase: "active", ownerId: OWNER, reviewId: REVIEW, sourceId: SOURCE, sourcePath: `${OWNER}/grading-review-uploads/${REVIEW}/${SOURCE}.zip`, expiresAtMs: 100, writerBoundary: "server-only-fenced", uploadCapabilities: "never-issued", sourceSha256: null, operations: [] };

describe("archive source operation fence model", () => {
  it("requires a verified server-only boundary, rejects expired work and never reuses operation IDs", () => {
    expect(startArchiveOperation({ ...empty, writerBoundary: "unknown" }, "write", WRITE, 1)).toBeNull();
    expect(startArchiveOperation({ ...empty, uploadCapabilities: "unknown" }, "write", WRITE, 1)).toBeNull();
    expect(retireArchiveSource({ ...empty, uploadCapabilities: "unknown" }, 100, DELETE)).toBeNull();
    expect(startArchiveOperation(empty, "write", WRITE, 100)).toBeNull();
    expect(startArchiveOperation({ ...empty, phase: "deleting" }, "write", WRITE, 1)).toBeNull();
    expect(retireArchiveSource({ ...empty, phase: "deleted" }, 100, DELETE)).toBeNull();
    const writing = startArchiveOperation(empty, "write", WRITE, 1)!;
    expect(startArchiveOperation(writing, "write", WRITE, 1)).toBeNull();
    expect(startArchiveOperation(writing, "write", READ1, 1)).toBeNull();
    expect(startArchiveOperation(writing, "read", READ1, 1)).toBeNull();
    const absent = finishArchiveOperation(writing, WRITE, { kind: "write-verified-absent" })!;
    expect(startArchiveOperation(absent, "write", WRITE.toUpperCase(), 2)).toBeNull();
    expect(startArchiveOperation(absent, "write", READ1, 2)).not.toBeNull();
  });

  it("never treats an unknown write as quiescent, even after expiry", () => {
    const writing = startArchiveOperation(empty, "write", WRITE, 1)!;
    expect(finishArchiveOperation(writing, WRITE, { kind: "read-quiesced" })).toBeNull();
    expect(finishArchiveOperation(writing, WRITE, { kind: "write-verified-stored", sourceSha256: "bad" })).toBeNull();
    expect(retireArchiveSource(writing, 1000, DELETE)).toBeNull();
  });

  it("allows concurrent reads of a sealed source but refuses deletion until each is confirmed quiescent", () => {
    const writing = startArchiveOperation(empty, "write", WRITE, 1)!;
    const sealed = finishArchiveOperation(writing, WRITE, { kind: "write-verified-stored", sourceSha256: HASH })!;
    expect(startArchiveOperation(sealed, "write", READ1, 2)).toBeNull();
    const one = startArchiveOperation(sealed, "read", READ1, 2)!;
    const two = startArchiveOperation(one, "read", READ2, 3)!;
    expect(retireArchiveSource(two, 100, DELETE)).toBeNull();
    const firstDone = finishArchiveOperation(two, READ1, { kind: "read-quiesced" })!;
    expect(retireArchiveSource(firstDone, 100, DELETE)).toBeNull();
    const bothDone = finishArchiveOperation(firstDone, READ2, { kind: "read-quiesced" })!;
    expect(retireArchiveSource(bothDone, 99, DELETE)).toBeNull();
    expect(retireArchiveSource(bothDone, 100, DELETE)?.phase).toBe("deleting");
    expect(finishArchiveOperation(bothDone, READ2, { kind: "read-quiesced" })).toBeNull();
  });

  it("rejects malformed or inconsistent persisted operation records", () => {
    const writing = startArchiveOperation(empty, "write", WRITE, 1)!;
    expect(retireArchiveSource({ ...writing, operations: [...writing.operations, writing.operations[0]] }, 100, DELETE)).toBeNull();
    expect(startArchiveOperation({ ...empty, sourcePath: `${OWNER}/grading-uploads/${SOURCE}.zip` }, "write", WRITE, 1)).toBeNull();
    expect(startArchiveOperation({ ...empty, sourceSha256: "bad" }, "read", READ1, 1)).toBeNull();
  });
});
