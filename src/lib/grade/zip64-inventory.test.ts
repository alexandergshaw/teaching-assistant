import { expect, it } from "vitest";
import JSZip from "jszip";
import { inspectLargeZipDirectory } from "./recoverable-zip-directory";
import { buildRecoverableZip } from "./large-zip-subset";
import { ingestZipEntries } from "./extraction";

it("reads ZIP64 offsets beyond 4 GiB and builds a verified bounded subset without reading the prefix", async () => {
  const zip = new JSZip(); zip.file("ada_1_2_work.txt", "Synthetic source.");
  const original = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  const v = new DataView(original.buffer, original.byteOffset, original.byteLength), end = original.length - 22, centralAt = v.getUint32(end + 16, true);
  const local = original.slice(0, centralAt), oldCentral = original.slice(centralAt, end), prefix = 4 * 1024 * 1024 * 1024 + 100;
  const central = new Uint8Array(oldCentral.length + 12); central.set(oldCentral); const cv = new DataView(central.buffer); cv.setUint16(30, 12, true); cv.setUint32(42, 0xffffffff, true); cv.setUint16(oldCentral.length, 1, true); cv.setUint16(oldCentral.length + 2, 8, true); cv.setBigUint64(oldCentral.length + 4, BigInt(prefix), true);
  const recordAt = prefix + local.length + central.length, record = new Uint8Array(56), rv = new DataView(record.buffer); rv.setUint32(0, 0x06064b50, true); rv.setBigUint64(4, BigInt(44), true); rv.setUint16(12, 45, true); rv.setUint16(14, 45, true); rv.setBigUint64(24, BigInt(1), true); rv.setBigUint64(32, BigInt(1), true); rv.setBigUint64(40, BigInt(central.length), true); rv.setBigUint64(48, BigInt(prefix + local.length), true);
  const locator = new Uint8Array(20), lv = new DataView(locator.buffer); lv.setUint32(0, 0x07064b50, true); lv.setBigUint64(8, BigInt(recordAt), true); lv.setUint32(16, 1, true);
  const eocd = original.slice(end); new DataView(eocd.buffer).setUint32(16, 0xffffffff, true); new DataView(eocd.buffer).setUint32(12, central.length, true);
  const tail = new Blob([local, central, record, locator, eocd]), total = prefix + tail.size, reads: number[] = [];
  const virtual = { size: total, slice(start = 0, finish = total) { reads.push(finish - start); const pad = Math.max(0, prefix - start); return new Blob([new Uint8Array(pad), tail.slice(Math.max(0, start - prefix), finish - prefix)]); } };
  const inventory = await inspectLargeZipDirectory(virtual); expect(inventory).toMatchObject({ ok: true }); if (!inventory.ok) return; expect(inventory.members[0].dataOffset).toBeGreaterThan(0xffffffff);
  const built = await buildRecoverableZip(virtual as Blob, ["ada"], true); expect(built.ok).toBe(true); if (!built.ok) return;
  const result = await ingestZipEntries(await built.archive.arrayBuffer(), { requireSupportedFiles: true, reviewedMapping: { "ada_1_2_work.txt": "Synthetic" } });
  expect(result.entries[0].content).toContain("Synthetic source."); expect(Math.max(...reads)).toBeLessThan(100_000);
  const corruptedLocal = local.slice(); corruptedLocal[corruptedLocal.length - 1] ^= 1; const corruptedTail = new Blob([corruptedLocal, central, record, locator, eocd]);
  const corrupted = { size: total, slice(start = 0, finish = total) { const pad = Math.max(0, prefix - start); return new Blob([new Uint8Array(pad), corruptedTail.slice(Math.max(0, start - prefix), finish - prefix)]); } };
  expect((await buildRecoverableZip(corrupted as Blob, ["ada"], true)).ok).toBe(false);
});

