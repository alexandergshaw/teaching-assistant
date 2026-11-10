import type { LargeZipMember } from "./recoverable-zip-directory";

/** A sink must keep bytes private and unreadable until commit and erase them on abort. */
export interface PrivateMemberSink {
  write(chunk: Uint8Array): Promise<void>;
  commit(): Promise<void>;
  abort(): Promise<void>;
}

export const LARGE_MEMBER_MAX_BYTES = 1536 * 1024 * 1024;
export const LARGE_MEMBER_MAX_COMPRESSED_BYTES = 256 * 1024 * 1024;
export const LARGE_MEMBER_MAX_RATIO = 100;
const IO_CHUNK_BYTES = 1024 * 1024;
const table = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

/** Streams an already inventoried member with backpressure. No grading or publishing occurs. */
export async function streamLargeZipMember(file: Blob, member: LargeZipMember, sink: PrivateMemberSink, signal?: AbortSignal): Promise<{ ok: true } | { ok: false; reason: string }> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (!Number.isSafeInteger(member.declaredBytes) || member.declaredBytes <= 0 || member.declaredBytes > LARGE_MEMBER_MAX_BYTES || !Number.isSafeInteger(member.compressedBytes) || member.compressedBytes <= 0 || member.compressedBytes > LARGE_MEMBER_MAX_COMPRESSED_BYTES || member.declaredBytes / member.compressedBytes > LARGE_MEMBER_MAX_RATIO || ![0, 8].includes(member.method) || (member.flags & 0x2041) !== 0 || !Number.isSafeInteger(member.dataOffset) || member.dataOffset < 0 || member.dataOffset + member.compressedBytes > file.size) throw new Error("Member exceeds the bounded recovery limits.");
    if (signal?.aborted) throw new Error("Recovery was canceled.");
    let offset = 0;
    let stream = new ReadableStream<Uint8Array>({ async pull(controller) {
      if (offset >= member.compressedBytes) { controller.close(); return; }
      const end = Math.min(offset + IO_CHUNK_BYTES, member.compressedBytes);
      const bytes = new Uint8Array(await file.slice(member.dataOffset + offset, member.dataOffset + end).arrayBuffer());
      if (bytes.length !== end - offset) { controller.error(new Error("Compressed data could not be read.")); return; }
      offset = end; controller.enqueue(bytes);
    } });
    if (member.method === 8) stream = stream.pipeThrough(new DecompressionStream("deflate-raw") as unknown as TransformStream<Uint8Array, Uint8Array>);
    reader = stream.getReader(); let count = 0, crc = 0xffffffff;
    for (;;) {
      if (signal?.aborted) throw new Error("Recovery was canceled.");
      const item = await reader.read(); if (item.done) break;
      count += item.value.byteLength;
      if (count > member.declaredBytes || count > LARGE_MEMBER_MAX_BYTES) throw new Error("Member exceeded its declared size.");
      for (const byte of item.value) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
      for (let start = 0; start < item.value.byteLength; start += IO_CHUNK_BYTES) await sink.write(item.value.subarray(start, Math.min(start + IO_CHUNK_BYTES, item.value.byteLength)));
    }
    if (signal?.aborted || count !== member.declaredBytes || ((crc ^ 0xffffffff) >>> 0) !== member.crc) throw new Error("Member integrity could not be verified.");
    await sink.commit(); return { ok: true };
  } catch (error) {
    try { await reader?.cancel(); } catch { /* The sink still needs cleanup. */ }
    try { await sink.abort(); } catch { return { ok: false, reason: "Recovery failed and private staging cleanup could not be confirmed." }; }
    return { ok: false, reason: error instanceof Error ? error.message : "Recovery failed." };
  } finally { reader?.releaseLock(); }
}
