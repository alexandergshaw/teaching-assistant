// VIDEO-GRADING W1 (docs/video-grading-chat-intake-ops.md section 4): the pure
// magic-byte validator. The container is decided from BYTES ONLY; File.type,
// the filename extension and the Storage contentType are never the source of
// the MIME that is recorded. The extension is consulted for exactly one thing:
// it may WIDEN acceptance for a ".mov" that has no ftyp box (old QuickTime),
// never decide the container for any other case.
//
// No imports, no I/O: client-safe and fully unit-testable.

export type VideoContainer = "mp4" | "quicktime" | "webm";

export type VideoSniff =
  | { readonly ok: true; readonly container: VideoContainer; readonly mimeType: "video/mp4" | "video/quicktime" | "video/webm" }
  | { readonly ok: false };

/** How many leading bytes the sniff needs; callers read no more than this. */
export const VIDEO_HEAD_BYTES = 64;

// ISO Base Media major brands accepted as mp4. One array so adding a brand is
// one line. Deliberately excludes image/audio ISO BMFF brands (heic, heix,
// mif1, msf1, avif, avis, "M4A ", "M4B ").
const MP4_BRANDS: readonly string[] = [
  "isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "mp71",
  "avc1", "dash", "msdn", "M4V ", "M4VH", "M4VP",
];
const QUICKTIME_BRAND = "qt  ";
// Atom types that may open a ftyp-less QuickTime file (.mov only).
const QUICKTIME_LEADING_ATOMS: readonly string[] = ["moov", "mdat", "wide", "free", "skip"];

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < start + length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function isMp4Box(head: Uint8Array): VideoSniff {
  if (head.length < 12) return { ok: false };
  const size = head[0] * 16777216 + head[1] * 65536 + head[2] * 256 + head[3];
  // 1 = a 64-bit largesize follows; otherwise a real ftyp box is 16..4096 bytes.
  const sizeOk = size === 1 || (size >= 16 && size <= 4096);
  if (!sizeOk) return { ok: false };
  // The ftyp tag is at offset 4, not 0.
  if (ascii(head, 4, 4) !== "ftyp") return { ok: false };
  const brand = ascii(head, 8, 4);
  if (brand === QUICKTIME_BRAND) return { ok: true, container: "quicktime", mimeType: "video/quicktime" };
  if (MP4_BRANDS.includes(brand)) return { ok: true, container: "mp4", mimeType: "video/mp4" };
  return { ok: false };
}

function isWebm(head: Uint8Array): VideoSniff {
  if (head.length < 12) return { ok: false };
  if (head[0] !== 0x1a || head[1] !== 0x45 || head[2] !== 0xdf || head[3] !== 0xa3) return { ok: false };
  // The EBML DocType must be "webm" (a "matroska" DocType is an mkv, not accepted).
  const window = ascii(head, 0, Math.min(head.length, VIDEO_HEAD_BYTES));
  if (!window.includes("webm")) return { ok: false };
  return { ok: true, container: "webm", mimeType: "video/webm" };
}

/**
 * Sniffs the first VIDEO_HEAD_BYTES bytes of a file. `extension` is the
 * lowercased filename extension without the dot (may be empty).
 */
export function sniffVideoContainer(head: Uint8Array, extension: string = ""): VideoSniff {
  if (head.length < 12) return { ok: false };
  const iso = isMp4Box(head);
  if (iso.ok) return iso;
  const webm = isWebm(head);
  if (webm.ok) return webm;
  if (extension.toLowerCase() === "mov" && QUICKTIME_LEADING_ATOMS.includes(ascii(head, 4, 4))) {
    return { ok: true, container: "quicktime", mimeType: "video/quicktime" };
  }
  return { ok: false };
}
