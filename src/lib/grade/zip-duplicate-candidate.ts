import { inspectLargeZipDirectory } from "./large-zip-directory";

/** Metadata matches are warnings, not proof: CRC is not collision resistant. */
export async function compareZipCandidates(incoming: readonly File[], prior: readonly File[]): Promise<{ possibleDuplicate: boolean; incomplete: boolean }> {
  const archives = (files: readonly File[]) => files.filter((file) => /\.zip$/i.test(file.name));
  const seen = new Set<string>();
  let possibleDuplicate = false, incomplete = false, comparedMembers = 0, comparedArchives = 0;
  for (const [files, compare] of [[archives(prior), false], [archives(incoming), true]] as const) {
    for (const file of files) {
      if (++comparedArchives > 64) return { possibleDuplicate, incomplete: true };
      const inventory = await inspectLargeZipDirectory(file);
      if (!inventory.ok || !inventory.members.length) { incomplete = true; continue; }
      comparedMembers += inventory.members.length;
      if (comparedMembers > 20_000 || !globalThis.crypto?.subtle) { incomplete = true; break; }
      const metadata = JSON.stringify(inventory.members.map((m) => [m.path, m.declaredBytes, m.crc32]).sort((a, b) => String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0));
      let key: string;
      try { key = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(metadata))), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
      catch { incomplete = true; continue; }
      if (compare && seen.has(key)) possibleDuplicate = true;
      seen.add(key);
    }
  }
  return { possibleDuplicate, incomplete };
}
