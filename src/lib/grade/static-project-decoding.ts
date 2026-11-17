/** Decode text losslessly when possible; legacy single-byte text is an explicit assumption. */
export function decodeStaticProjectText(bytes: Uint8Array): { text: string; assumedWindows1252: boolean } | null {
  try { return { text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), assumedWindows1252: false }; } catch { /* Check a bounded legacy text fallback. */ }
  // Reject binary controls and undefined Windows-1252 byte values. Newlines,
  // tabs and form feeds are normal in source files.
  if (bytes.some(byte => (byte < 32 && byte !== 9 && byte !== 10 && byte !== 12 && byte !== 13) || byte === 127 || byte === 0xfe || byte === 0xff || [0x81, 0x8d, 0x8f, 0x90, 0x9d].includes(byte))) return null;
  return { text: new TextDecoder("windows-1252", { fatal: true }).decode(bytes), assumedWindows1252: true };
}
