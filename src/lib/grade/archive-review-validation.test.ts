import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

vi.mock("server-only", () => ({}));
import { ARCHIVE_REVIEW_MAX_BYTES, snapshotReviewArchive } from "./archive-review-snapshot";
import { archiveCrc32, planValidatedArchive, validateArchiveForReview } from "./archive-review-validation";
import { ZIP_MAX_MEMBER_DECLARED_BYTES } from "@/lib/zip-caps";

async function archive(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content, { createFolders: false });
  return zip.generateAsync({ type: "uint8array", compression: "STORE" });
}

describe("archive review validation", () => {
  it("uses the standard ZIP checksum", () => {
    expect(archiveCrc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("rejects an over-limit view before attempting archive parsing", async () => {
    const view = new Uint8Array(ARCHIVE_REVIEW_MAX_BYTES + 1);
    const load = vi.spyOn(JSZip, "loadAsync");
    try {
      await expect(validateArchiveForReview(view, { sourceSha256: "", members: [] })).rejects.toThrow("unavailable");
      expect(load).not.toHaveBeenCalled();
    } finally { load.mockRestore(); }
  });

  it("accounts for every member, blocks unreadable or unsupported evidence, and groups only after explicit assignment", async () => {
    const bytes = await archive({ "ada.txt": "Ada work", "ada.bin": "unknown", "bea.txt": "Bea work", "Thumbs.db": "metadata" });
    const snapshot = snapshotReviewArchive(bytes);
    expect(await validateArchiveForReview(bytes, snapshot)).toEqual([
      { id: "0", path: "ada.txt", check: "text-verified" },
      { id: "1", path: "ada.bin", check: "unsupported" },
      { id: "2", path: "bea.txt", check: "text-verified" },
      { id: "3", path: "Thumbs.db", check: "bookkeeping" },
    ]);
    const plan = await planValidatedArchive(bytes, snapshot, [
      { memberId: "0", studentKey: "ada", studentLabel: "Ada" },
      { memberId: "1", studentKey: "ada", studentLabel: "Ada" },
      { memberId: "2", studentKey: "bea", studentLabel: "Bea" },
    ]);
    expect(plan).toEqual({ ok: true, admitted: [{ studentKey: "bea", studentLabel: "Bea", memberIds: ["2"] }], blocked: [{ studentKey: "ada", studentLabel: "Ada", memberIds: ["0", "1"] }] });
  });

  it("rejects changed source or edited inventory, without using client readability claims", async () => {
    const bytes = await archive({ "ada.txt": "work" });
    const snapshot = snapshotReviewArchive(bytes);
    const changed = bytes.slice();
    changed[30 + "ada.txt".length] ^= 1;
    await expect(validateArchiveForReview(changed, snapshot)).rejects.toThrow("changed");
    await expect(validateArchiveForReview(bytes, { ...snapshot, members: [] })).rejects.toThrow("changed");
    const current = snapshotReviewArchive(changed);
    expect(await validateArchiveForReview(changed, current)).toEqual([{ id: "0", path: "ada.txt", check: "checksum-failed" }]);
  });

  it("refuses malformed text and keeps visually rich documents for later evidence review", async () => {
    const bytes = await archive({ "bad.txt": new Uint8Array([0xff]), "embedded.docx": "text plus pictures", "link.html": "https://example.com", "empty.txt": " " });
    const snapshot = snapshotReviewArchive(bytes);
    expect((await validateArchiveForReview(bytes, snapshot)).map((member) => member.check)).toEqual(["unreadable", "unsupported", "unsupported", "unreadable"]);
  });

  it("captures the source and reviewed assignments before asynchronous decompression", async () => {
    const bytes = await archive({ "ada.txt": "Ada work" });
    const snapshot = snapshotReviewArchive(bytes);
    const assignments = [{ memberId: "0", studentKey: "ada", studentLabel: "Ada" }];
    const pending = planValidatedArchive(bytes, snapshot, assignments);
    bytes[30 + "ada.txt".length] ^= 1;
    assignments[0].studentLabel = "Changed after review";
    expect(await pending).toEqual({ ok: true, admitted: [{ studentKey: "ada", studentLabel: "Ada", memberIds: ["0"] }], blocked: [] });
  });

  it("enforces the declared-size cap before decompressing a member", async () => {
    const bytes = await archive({ "ada.txt": "work" });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let central = -1;
    for (let i = 0; i <= bytes.length - 4; i++) if (view.getUint32(i, true) === 0x02014b50) { central = i; break; }
    expect(central).toBeGreaterThan(0);
    view.setUint32(22, ZIP_MAX_MEMBER_DECLARED_BYTES + 1, true);
    view.setUint32(central + 24, ZIP_MAX_MEMBER_DECLARED_BYTES + 1, true);
    const snapshot = snapshotReviewArchive(bytes);
    await expect(validateArchiveForReview(bytes, snapshot)).rejects.toThrow("Refused");
  });
});
