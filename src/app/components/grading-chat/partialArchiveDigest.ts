const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_BYTES = 1024 * 1024 * 1024;

/** Domain-separated SHA-256 over fixed-size SHA-256 chunks; never reads the full archive at once. */
export async function partialArchiveDigest(blob: Blob, subtle: SubtleCrypto): Promise<string> {
  if (!Number.isSafeInteger(blob.size) || blob.size < 0 || blob.size > MAX_SOURCE_BYTES) throw new Error("Archive exceeds the recovery inspection limit.");
  const parts: number[] = [];
  for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
    const bytes = await blob.slice(offset, Math.min(offset + CHUNK_BYTES, blob.size)).arrayBuffer();
    parts.push(...new Uint8Array(await subtle.digest("SHA-256", bytes)));
  }
  const prefix = new TextEncoder().encode(`partial-intake-sha256-chunks-v1:${blob.size}:`);
  const manifest = new Uint8Array(prefix.length + parts.length); manifest.set(prefix); manifest.set(parts, prefix.length);
  return Array.from(new Uint8Array(await subtle.digest("SHA-256", manifest)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
