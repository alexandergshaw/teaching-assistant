import { webcrypto } from "node:crypto";
import { expect, it } from "vitest";
import { partialArchiveDigest } from "./partialArchiveDigest";

it("hashes bounded chunks and distinguishes different archive bytes", async () => {
  const source = new Blob([new Uint8Array(9 * 1024 * 1024)]), slices: number[] = [];
  const wrapped = { size: source.size, slice(start: number, end: number) { slices.push(end - start); return source.slice(start, end); } } as Blob;
  const subtle = webcrypto.subtle as SubtleCrypto;
  const first = await partialArchiveDigest(wrapped, subtle);
  expect(Math.max(...slices)).toBeLessThanOrEqual(4 * 1024 * 1024);
  expect(slices).toHaveLength(3);
  expect(await partialArchiveDigest(new Blob([new Uint8Array(9 * 1024 * 1024 - 1), new Uint8Array([1])]), subtle)).not.toBe(first);
});
