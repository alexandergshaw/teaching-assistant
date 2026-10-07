/**
 * SERVER-ONLY fetcher for a publicly shared Google Drive file or Google Doc.
 * Mirrors repo-content.ts: never throws, returns a struct or { error }.
 *
 * Security posture (docs/grading-chat-gdrive-url-scope.md section 8):
 * - The URL fetched is BUILT from a DRIVE_ID-validated id into a host-fixed
 *   literal; the pasted URL itself is never fetched.
 * - redirect: "manual"; every Location is validated against an exact-host
 *   allowlist before it is followed; the hop count is bounded.
 * - NO credential or Authorization header is ever attached. The repo's Google
 *   OAuth is calendar-scope only; a calendar bearer would 403 on Drive and
 *   leak to a download host. Do not call getValidAccessToken here.
 * - Size is capped twice: Content-Length pre-read, and the actual read.
 * - Any text/html response (sign-in page or the large-file scan interstitial)
 *   is refused; the interstitial confirm token is deliberately NOT followed.
 */

import { maxFileBytesForWireBudget, formatMB } from "../upload-budget";
import {
  buildDriveDocExportUrl,
  buildDriveDownloadUrl,
  type GoogleDriveTarget,
} from "../google-drive-url";

export interface FetchedDriveFile {
  readonly name: string;
  readonly buffer: Buffer;
}

const NOT_PUBLIC_MESSAGE =
  "This Google Drive link is not publicly shared (anyone with the link). Make it link-shareable or download the file and drop it instead.";
const NO_TYPE_MESSAGE =
  "Could not determine the type of this Google Drive file. Download it and drop the file in instead.";

const MAX_HOPS = 4;
const TOTAL_TIMEOUT_MS = 25_000;

const ALLOWED_EXACT_HOSTS: ReadonlySet<string> = new Set([
  "drive.google.com",
  "drive.usercontent.google.com",
  "docs.google.com",
]);
const GOOGLEUSERCONTENT_SUFFIX = ".googleusercontent.com";

/** Exact-host allowlist; the wildcard is a suffix match on a leading dot. */
function isAllowedDriveHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_EXACT_HOSTS.has(host)) return true;
  return host.length > GOOGLEUSERCONTENT_SUFFIX.length && host.endsWith(GOOGLEUSERCONTENT_SUFFIX);
}

const CONTENT_TYPE_EXTENSIONS: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/msword": "doc",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.ms-excel": "xls",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/heic": "heic",
  "image/heif": "heif",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/json": "json",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
};

/** The filename from a Content-Disposition header: filename*= first, then filename=. */
function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:[A-Za-z0-9-]+)?'[^']*'([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // fall through to the plain form
    }
  }
  const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
  if (quoted) return quoted[1];
  const bare = /filename\s*=\s*([^;]+)/i.exec(header);
  return bare ? bare[1].trim() : null;
}

/** Last path segment only, with control characters removed. */
function sanitizeName(raw: string): string {
  const leaf = raw.split(/[\\/]/).pop() ?? raw;
  return leaf.replace(/[\u0000-\u001f]/g, "").trim();
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
}

function stemOf(name: string): string {
  const ext = extensionOf(name);
  return ext ? name.slice(0, name.length - ext.length - 1) : name;
}

/**
 * The name the grading classifier keys off (by EXTENSION only):
 * Content-Disposition filename, else the Content-Type->extension map on a
 * generic stem, else null (unknown type). A Content-Disposition name with no
 * extension takes the Content-Type extension when one is known.
 */
function deriveFileName(headers: Headers): string | null {
  const contentType = (headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const typeExt = CONTENT_TYPE_EXTENSIONS[contentType] ?? "";
  const fromHeader = filenameFromContentDisposition(headers.get("content-disposition"));
  const cleaned = fromHeader ? sanitizeName(fromHeader) : "";
  if (cleaned) {
    if (extensionOf(cleaned)) return cleaned;
    return typeExt ? `${cleaned}.${typeExt}` : null;
  }
  return typeExt ? `google-drive-file.${typeExt}` : null;
}

/** Reads the body, aborting once it exceeds maxBytes. Returns null when over. */
async function readCapped(response: Response, maxBytes: number): Promise<Buffer | null> {
  if (!response.body) {
    const whole = Buffer.from(await response.arrayBuffer());
    return whole.length > maxBytes ? null : whole;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

function tooLargeMessage(maxBytes: number): string {
  return `This Google Drive file is too large to grade on this surface (limit about ${formatMB(maxBytes)}). Download it and drop in a smaller file, or share just the file you want graded.`;
}

/**
 * Fetches a publicly shared Drive file (kind "file") or Google Doc exported
 * as text (kind "native-doc", docType "document"). Never throws.
 */
export async function fetchGoogleDriveFile(
  target: GoogleDriveTarget
): Promise<FetchedDriveFile | { error: string }> {
  try {
    let startUrl: string;
    const isDoc = target.kind === "native-doc";
    if (target.kind === "file") {
      startUrl = buildDriveDownloadUrl(target.id);
    } else if (target.kind === "native-doc" && target.docType === "document") {
      startUrl = buildDriveDocExportUrl(target.id, "txt");
    } else {
      return { error: "This Google Drive link type is not supported." };
    }

    const maxBytes = maxFileBytesForWireBudget();
    const signal = AbortSignal.timeout(TOTAL_TIMEOUT_MS);

    let current = startUrl;
    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
      const res = await fetch(current, { redirect: "manual", credentials: "omit", signal });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return { error: "Google Drive returned an unreadable redirect." };
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          return { error: "Google Drive returned an unreadable redirect." };
        }
        if (next.protocol !== "https:" || !isAllowedDriveHost(next.hostname)) {
          return { error: "Google Drive redirected to an unexpected host; the link was not followed." };
        }
        current = next.toString();
        continue;
      }
      response = res;
      break;
    }
    if (!response) return { error: "Google Drive redirected too many times." };

    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return { error: NOT_PUBLIC_MESSAGE };
    }
    if (!response.ok) {
      return { error: `Google Drive returned status ${response.status}.` };
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (contentType.includes("text/html")) {
      return { error: NOT_PUBLIC_MESSAGE };
    }

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      return { error: tooLargeMessage(maxBytes) };
    }

    const buffer = await readCapped(response, maxBytes);
    if (!buffer) return { error: tooLargeMessage(maxBytes) };
    if (buffer.length === 0) return { error: "This Google Drive file is empty." };

    let name: string | null;
    if (isDoc) {
      // The export format fixes the extension; keep a header title as the stem.
      const fromHeader = filenameFromContentDisposition(response.headers.get("content-disposition"));
      const stem = fromHeader ? stemOf(sanitizeName(fromHeader)) : "";
      name = `${stem || "google-doc"}.txt`;
    } else {
      name = deriveFileName(response.headers);
    }
    if (!name) return { error: NO_TYPE_MESSAGE };

    return { name, buffer };
  } catch (err) {
    const aborted = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      error: aborted ? "Google Drive took too long to respond." : "Could not read this Google Drive link.",
    };
  }
}
