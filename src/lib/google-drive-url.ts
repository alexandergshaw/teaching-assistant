/**
 * Pure, client-safe parser for Google Drive / Google Docs share links (no
 * network, no Buffer, no server-only imports). Mirrors parseSubmissionGithubUrl
 * (submission-repo.ts) and canvas-url.ts: scheme-less pastes are tolerated, the
 * host is matched by EXACT equality on url.hostname (never a substring test),
 * and nothing here throws on bad input.
 *
 * SSRF posture: the parser's only product is a validated file id. The
 * download/export URL builders interpolate ONLY a DRIVE_ID-validated id into a
 * host-fixed literal, so no host, path, or authority can be smuggled in -
 * the charset excludes / : . ? # @ and every other URL delimiter.
 */

export type GoogleDocType = "document" | "spreadsheet" | "presentation";

export type GoogleDriveTarget =
  | { readonly kind: "file"; readonly id: string }
  | { readonly kind: "native-doc"; readonly docType: GoogleDocType; readonly id: string }
  | { readonly kind: "folder"; readonly id: string };

/** Google file ids are URL-safe base64-ish. */
export const DRIVE_ID = /^[A-Za-z0-9_-]+$/;

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

const DRIVE_HOST = "drive.google.com";
const DOCS_HOST = "docs.google.com";
const USERCONTENT_HOST = "drive.usercontent.google.com";

const DOC_PATHS: Readonly<Record<string, GoogleDocType>> = {
  document: "document",
  spreadsheets: "spreadsheet",
  presentation: "presentation",
};

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The id when it passes DRIVE_ID, else null. */
function validId(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  return DRIVE_ID.test(candidate) ? candidate : null;
}

/**
 * Parses a pasted Google Drive / Docs URL. Returns null for a non-Drive host,
 * a Drive host with no extractable id, or an id that fails DRIVE_ID.
 */
export function parseGoogleDriveUrl(input: string): GoogleDriveTarget | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean).map(safeDecode);

  if (host === DRIVE_HOST) {
    // /file/d/{ID}[/view] and /file/u/0/d/{ID}
    const fileIdx = segments[0] === "file" ? segments.indexOf("d") : -1;
    if (fileIdx > 0) {
      const id = validId(segments[fileIdx + 1]);
      return id ? { kind: "file", id } : null;
    }
    // /drive/folders/{ID} and /drive/u/0/folders/{ID}
    if (segments[0] === "drive") {
      const folderIdx = segments.indexOf("folders");
      if (folderIdx > 0) {
        const id = validId(segments[folderIdx + 1]);
        return id ? { kind: "folder", id } : null;
      }
      return null;
    }
    // /open?id={ID} and /uc?id={ID}&export=download
    if (segments[0] === "open" || segments[0] === "uc") {
      const id = validId(url.searchParams.get("id"));
      return id ? { kind: "file", id } : null;
    }
    return null;
  }

  if (host === USERCONTENT_HOST) {
    if (segments[0] === "download") {
      const id = validId(url.searchParams.get("id"));
      return id ? { kind: "file", id } : null;
    }
    return null;
  }

  if (host === DOCS_HOST) {
    const docType = DOC_PATHS[segments[0] ?? ""];
    if (!docType) return null;
    // /document/d/{ID}/edit and /document/u/0/d/{ID}
    const dIdx = segments.indexOf("d");
    if (dIdx < 1) return null;
    const id = validId(segments[dIdx + 1]);
    return id ? { kind: "native-doc", docType, id } : null;
  }

  return null;
}

function requireValidId(id: string): string {
  const ok = validId(id);
  if (!ok) throw new Error("Invalid Google Drive file id.");
  return ok;
}

/** Host-fixed direct-download URL for a file id. Throws on an invalid id. */
export function buildDriveDownloadUrl(id: string): string {
  return `https://${DRIVE_HOST}/uc?export=download&id=${requireValidId(id)}`;
}

/** Host-fixed Google Docs export URL for a document id. Throws on an invalid id. */
export function buildDriveDocExportUrl(id: string, format: "txt"): string {
  return `https://${DOCS_HOST}/document/d/${requireValidId(id)}/export?format=${format}`;
}
