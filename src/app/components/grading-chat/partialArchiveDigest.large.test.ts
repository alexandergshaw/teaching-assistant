import { webcrypto } from "node:crypto";
import { expect, it } from "vitest";
import { partialArchiveDigest } from "./partialArchiveDigest";

it("preserves the legacy hash identity used in existing intake ledgers", async () => {
  const subtle = webcrypto.subtle as SubtleCrypto, source = new Blob(["synthetic"]);
  const part = new Uint8Array(await subtle.digest("SHA-256", await source.arrayBuffer())); const prefix = new TextEncoder().encode(`partial-intake-sha256-chunks-v1:${source.size}:`);
  const manifest = new Uint8Array(prefix.length + part.length); manifest.set(prefix); manifest.set(part, prefix.length);
  const expected = Array.from(new Uint8Array(await subtle.digest("SHA-256", manifest)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  expect(await partialArchiveDigest(source, subtle)).toBe(expected);
});

it("hashes a virtual source over 4 GiB in bounded chunks and detects a changed final byte", async () => {
  const size = 4 * 1024 * 1024 * 1024 + 1, full = new ArrayBuffer(4 * 1024 * 1024); let calls = 0, max = 0;
  const source = (last: number) => ({ size, slice(start: number, end: number) { const length = end - start; calls++; max = Math.max(max, length); return { arrayBuffer: async () => length === full.byteLength ? full : new Uint8Array([last]).buffer }; } } as Blob);
  const subtle = webcrypto.subtle as SubtleCrypto, first = await partialArchiveDigest(source(0), subtle), second = await partialArchiveDigest(source(1), subtle);
  expect(first).not.toBe(second); expect(max).toBeLessThanOrEqual(4 * 1024 * 1024); expect(calls).toBe(2050);
}, 60000);

it("stops reading after the session is invalidated", async () => {
  const size = 2 * 1024 * 1024 * 1024, full = new ArrayBuffer(4 * 1024 * 1024); let reads = 0;
  const source = { size, slice() { reads++; return { arrayBuffer: async () => full }; } } as unknown as Blob;
  await expect(partialArchiveDigest(source, webcrypto.subtle as SubtleCrypto, () => reads < 2)).rejects.toThrow(/canceled/i);
  expect(reads).toBe(2);
});
it("rejects unsafe declared sizes and short reads before producing an identity", async () => {
  const subtle = webcrypto.subtle as SubtleCrypto;
  for (const size of [-1, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity]) await expect(partialArchiveDigest({ size } as Blob, subtle)).rejects.toThrow(/size/i);
  const short = { size: 5, slice() { return new Blob(["four"]); } } as Blob;
  await expect(partialArchiveDigest(short, subtle)).rejects.toThrow(/read completely/i);
});
