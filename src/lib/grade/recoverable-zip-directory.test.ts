import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { inspectLargeZipDirectory } from "./recoverable-zip-directory";

describe("large ZIP directory inspection", () => {
  it("inventories a 142 MiB virtual archive without reading its body", async () => {
    const zip = new JSZip(); zip.file("Ada/work.txt", "work"); zip.file("Lin/child.zip", "nested");
    const original = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
    const view = new DataView(original.buffer, original.byteOffset, original.byteLength);
    const end = original.length - 22; const centralOffset = view.getUint32(end + 16, true);
    const prefix = 142 * 1024 * 1024; const total = prefix + original.length;
    const tail = original.slice(); const patched = new DataView(tail.buffer); patched.setUint32(end + 16, centralOffset + prefix, true);
    for (let pos = centralOffset; pos < end;) { patched.setUint32(pos + 42, patched.getUint32(pos + 42, true) + prefix, true); pos += 46 + patched.getUint16(pos + 28, true) + patched.getUint16(pos + 30, true) + patched.getUint16(pos + 32, true); }
    const reads: number[] = [];
    const virtual = { size: total, slice(start = 0, finish = total) { reads.push(finish - start); const from = Math.max(0, start - prefix); const pad = Math.max(0, prefix - start); return new Blob([new Uint8Array(pad), tail.slice(from, finish - prefix)]); } };
    const result = await inspectLargeZipDirectory(virtual);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.members.map((m) => [m.path, m.nestedArchive])).toEqual([["Ada/work.txt", false], ["Lin/child.zip", true]]);
    expect(Math.max(...reads)).toBeLessThanOrEqual(65_557);
  });
  it("fails closed for truncated data, encrypted entries and ZIP64", async () => {
    const zip = new JSZip(); zip.file("work.txt", "x"); const bytes = await zip.generateAsync({ type: "uint8array" });
    expect((await inspectLargeZipDirectory(new Blob([bytes.slice(0, -1)]))).ok).toBe(false);
    const encrypted = bytes.slice(); const end = encrypted.length - 22; const v = new DataView(encrypted.buffer); const central = v.getUint32(end + 16, true); v.setUint16(central + 8, 1, true);
    expect(await inspectLargeZipDirectory(new Blob([encrypted]))).toEqual({ ok: false, reason: "unsupported" });
    for (const flag of [0x40, 0x2000]) { const variant = bytes.slice(); const data = new DataView(variant.buffer); data.setUint16(central + 8, flag, true); expect(await inspectLargeZipDirectory(new Blob([variant]))).toEqual({ ok: false, reason: "unsupported" }); }
    const badUtf8 = bytes.slice(); const bad = new DataView(badUtf8.buffer); bad.setUint16(central + 8, 0x800, true); badUtf8[central + 46] = 0xff;
    expect(await inspectLargeZipDirectory(new Blob([badUtf8]))).toEqual({ ok: false, reason: "invalid" });
    const zip64 = bytes.slice(); new DataView(zip64.buffer).setUint16(end + 10, 0xffff, true);
    expect((await inspectLargeZipDirectory(new Blob([zip64]))).ok).toBe(false);
  });
  it("rejects altered local headers, names, payload ranges and overlapping entries", async () => {
    const zip = new JSZip(); zip.file("a.txt", "first"); zip.file("b.txt", "second");
    const base = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
    const dv = new DataView(base.buffer, base.byteOffset, base.byteLength);
    const central = dv.getUint32(base.length - 22 + 16, true);
    const second = central + 46 + dv.getUint16(central + 28, true) + dv.getUint16(central + 30, true) + dv.getUint16(central + 32, true);
    const local = dv.getUint32(central + 42, true);
    const signature = base.slice(); new DataView(signature.buffer).setUint32(local, 0, true);
    expect(await inspectLargeZipDirectory(new Blob([signature]))).toEqual({ ok: false, reason: "invalid" });
    const alteredName = base.slice(); alteredName[local + 30] ^= 1;
    expect(await inspectLargeZipDirectory(new Blob([alteredName]))).toEqual({ ok: false, reason: "invalid" });
    const badSize = base.slice(); new DataView(badSize.buffer).setUint32(local + 18, 0xffffffff, true);
    expect(await inspectLargeZipDirectory(new Blob([badSize]))).toEqual({ ok: false, reason: "invalid" });
    const overlap = base.slice(); new DataView(overlap.buffer).setUint32(second + 42, local, true);
    expect(await inspectLargeZipDirectory(new Blob([overlap]))).toEqual({ ok: false, reason: "invalid" });
  });
});
