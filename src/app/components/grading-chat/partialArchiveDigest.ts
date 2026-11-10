const CHUNK_BYTES = 4 * 1024 * 1024;
const LEGACY_MAX_BYTES = 1024 * 1024 * 1024;

/** Bounded digest; preserves existing ledger identities at or below 1 GiB. */
export async function partialArchiveDigest(blob: Blob, subtle: SubtleCrypto, current: () => boolean = () => true, onProgress?: (written: number, total: number) => void): Promise<string> {
  if (!Number.isSafeInteger(blob.size) || blob.size < 0) throw new Error("Archive size cannot be safely represented.");
  const legacy = blob.size <= LEGACY_MAX_BYTES;
  const parts: number[] = [];
  let chain = legacy ? undefined : new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(`partial-intake-sha256-chain-v2:${blob.size}:`)));
  for (let offset = 0; offset < blob.size;) {
    if (!current()) throw new Error("Archive review was canceled.");
    const length = Math.min(CHUNK_BYTES, blob.size - offset);
    const bytes = await blob.slice(offset, offset + length).arrayBuffer();
    if (!current()) throw new Error("Archive review was canceled.");
    if (bytes.byteLength !== length) throw new Error("Archive could not be read completely.");
    const hash = new Uint8Array(await subtle.digest("SHA-256", bytes));
    if (chain) { const input = new Uint8Array(64); input.set(chain); input.set(hash, 32); chain = new Uint8Array(await subtle.digest("SHA-256", input)); }
    else parts.push(...hash);
    offset += length;
    try { onProgress?.(offset, blob.size); } catch { /* Progress does not affect the digest. */ }
  }
  if (!current()) throw new Error("Archive review was canceled.");
  if (chain) return Array.from(chain, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const prefix = new TextEncoder().encode(`partial-intake-sha256-chunks-v1:${blob.size}:`);
  const manifest = new Uint8Array(prefix.length + parts.length); manifest.set(prefix); manifest.set(parts, prefix.length);
  return Array.from(new Uint8Array(await subtle.digest("SHA-256", manifest)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
