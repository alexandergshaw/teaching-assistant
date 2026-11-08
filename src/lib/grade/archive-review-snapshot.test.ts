import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

vi.mock("server-only", () => ({}));
import { matchesReviewArchive, snapshotReviewArchive } from "./archive-review-snapshot";

async function archive(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content, { createFolders: false });
  return zip.generateAsync({ type: "uint8array", compression: "STORE" });
}

function find(bytes: Uint8Array, sig: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i <= bytes.length - 4; i++) if (view.getUint32(i, true) === sig) return i;
  throw new Error("fixture signature missing");
}

describe("archive review snapshots", () => {
  it("binds every flat member to the exact retained source bytes", async () => {
    const bytes = await archive({ "Ada/essay.txt": "Ada", "Bea/essay.txt": "Bea" });
    const snapshot = snapshotReviewArchive(bytes);
    expect(snapshot.members).toMatchObject([{ id: "0", path: "Ada/essay.txt", uncompressedSize: 3 }, { id: "1", path: "Bea/essay.txt", uncompressedSize: 3 }]);
    expect(snapshot.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(matchesReviewArchive(bytes, snapshot)).toBe(true);
    const changed = bytes.slice();
    changed[30 + "Ada/essay.txt".length] ^= 1;
    expect(matchesReviewArchive(changed, snapshot)).toBe(false);
    expect(matchesReviewArchive(bytes, { ...snapshot, members: snapshot.members.slice(0, 1) })).toBe(false);
  });

  it("refuses duplicate or equivalent names, unsafe paths, nested ZIPs and unsupported filename encodings", async () => {
    const fixtures: Record<string, string>[] = [
      { "Ada.txt": "a", "ada.txt": "b" },
      { "a": "file", "a/b.txt": "child" },
      { "a/b.txt": "child", "a": "file" },
      { "../escape.txt": "x" },
      { "nested.ZIP": "x" },
      { "é.txt": "x" },
    ];
    for (const files of fixtures) {
      const bytes = await archive(files);
      expect(() => snapshotReviewArchive(bytes)).toThrow();
    }
  });

  it("rejects hidden local records, mismatched headers and data descriptors", async () => {
    const bytes = await archive({ "a.txt": "one", "b.txt": "two" });
    const central = find(bytes, 0x02014b50);
    const first = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = find(bytes, 0x06054b50);
    const firstCentralSize = 46 + first.getUint16(central + 28, true) + first.getUint16(central + 30, true) + first.getUint16(central + 32, true);
    const hidden = new Uint8Array(central + firstCentralSize + (bytes.length - end));
    hidden.set(bytes.subarray(0, central + firstCentralSize));
    hidden.set(bytes.subarray(end), central + firstCentralSize);
    const hiddenView = new DataView(hidden.buffer), newEnd = central + firstCentralSize;
    hiddenView.setUint16(newEnd + 8, 1, true);
    hiddenView.setUint16(newEnd + 10, 1, true);
    hiddenView.setUint32(newEnd + 12, firstCentralSize, true);
    expect(() => snapshotReviewArchive(hidden)).toThrow();
    const crc = bytes.slice();
    new DataView(crc.buffer).setUint32(central + 16, first.getUint32(central + 16, true) ^ 1, true);
    expect(() => snapshotReviewArchive(crc)).toThrow();
    const descriptor = bytes.slice();
    new DataView(descriptor.buffer).setUint16(central + 8, 8, true);
    expect(() => snapshotReviewArchive(descriptor)).toThrow();
  });
});
