/** Bounded ZIP64 metadata helpers. Values above JS safe integers are refused. */
export function safeZip64(view: DataView, offset: number): number | null {
  if (offset < 0 || offset + 8 > view.byteLength) return null;
  const value = view.getBigUint64(offset, true);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

export async function zip64Directory(file: Pick<Blob, "size" | "slice">, eocdOffset: number): Promise<{ entries: number; size: number; offset: number; end: number } | null> {
  if (eocdOffset < 20) return null;
  const locatorBytes = new Uint8Array(await file.slice(eocdOffset - 20, eocdOffset).arrayBuffer());
  if (locatorBytes.length !== 20) return null;
  const locator = new DataView(locatorBytes.buffer, locatorBytes.byteOffset, locatorBytes.byteLength);
  if (locator.getUint32(0, true) !== 0x07064b50 || locator.getUint32(4, true) !== 0 || locator.getUint32(16, true) !== 1) return null;
  const recordOffset = safeZip64(locator, 8); if (recordOffset === null || recordOffset + 56 > eocdOffset - 20) return null;
  const bytes = new Uint8Array(await file.slice(recordOffset, recordOffset + 56).arrayBuffer()); if (bytes.length !== 56) return null;
  const record = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), length = safeZip64(record, 4);
  if (record.getUint32(0, true) !== 0x06064b50 || length === null || length < 44 || length > 1024 * 1024 || recordOffset + 12 + length !== eocdOffset - 20 || record.getUint32(16, true) !== 0 || record.getUint32(20, true) !== 0) return null;
  const diskEntries = safeZip64(record, 24), entries = safeZip64(record, 32), size = safeZip64(record, 40), offset = safeZip64(record, 48);
  if (diskEntries === null || entries === null || size === null || offset === null || diskEntries !== entries || offset + size !== recordOffset) return null;
  return { entries, size, offset, end: recordOffset };
}

/** Parse exactly the required ZIP64 values, in spec order, from an extra field. */
export function zip64Extra(extra: Uint8Array, required: readonly boolean[]): number[] | null {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength); let found: number[] | null = null;
  for (let offset = 0; offset < extra.length;) {
    if (offset + 4 > extra.length) return null;
    const kind = view.getUint16(offset, true), size = view.getUint16(offset + 2, true), end = offset + 4 + size;
    if (end > extra.length || kind === 0x7075) return null;
    if (kind === 0x0001) {
      if (found !== null) return null;
      const values: number[] = []; let cursor = offset + 4;
      for (const needed of required) if (needed) { const value = safeZip64(view, cursor); if (value === null || cursor + 8 > end) return null; values.push(value); cursor += 8; }
      if (cursor !== end) return null;
      found = values;
    }
    offset = end;
  }
  return required.some(Boolean) ? found : found === null ? [] : null;
}
