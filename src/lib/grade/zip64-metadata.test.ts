import { expect, it } from "vitest";
import { safeZip64, zip64Directory, zip64Extra } from "./zip64-metadata";
it("rejects unsafe integers, truncated and duplicate ZIP64 extra fields", () => {
  const bytes = new Uint8Array(12), view = new DataView(bytes.buffer); view.setUint16(0, 1, true); view.setUint16(2, 8, true); view.setBigUint64(4, BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1), true);
  expect(safeZip64(view, 4)).toBeNull(); expect(zip64Extra(bytes, [true])).toBeNull();
  view.setBigUint64(4, BigInt(42), true); expect(zip64Extra(bytes, [true])).toEqual([42]);
  expect(zip64Extra(new Uint8Array([...bytes, ...bytes]), [true])).toBeNull();
  expect(zip64Extra(bytes.slice(0, 11), [true])).toBeNull(); expect(zip64Extra(bytes, [false])).toBeNull();
  expect(zip64Extra(new Uint8Array([0x75, 0x70, 0, 0]), [])).toBeNull();
});
it("rejects missing, multi-disk, and unsafe ZIP64 locators", async () => {
  expect(await zip64Directory(new Blob([new Uint8Array(40)]), 40)).toBeNull();
  const locator = new Uint8Array(20), view = new DataView(locator.buffer); view.setUint32(0, 0x07064b50, true); view.setUint32(4, 1, true); view.setUint32(16, 2, true);
  expect(await zip64Directory(new Blob([locator]), 20)).toBeNull();
  view.setUint32(4, 0, true); view.setUint32(16, 1, true); view.setBigUint64(8, BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1), true);
  expect(await zip64Directory(new Blob([locator]), 20)).toBeNull();
});
