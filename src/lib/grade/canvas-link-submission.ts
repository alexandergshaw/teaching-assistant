/**
 * Pure, client-safe helpers for Canvas "Website URL" submissions that arrive in
 * a submissions zip as `<student>_<id>_link.html` redirect pages. String
 * parsing only: no fetch, no Buffer, no server-only imports (mirrors
 * canvas-url.ts and google-drive-url.ts), so importing this adds no
 * server-only trail to any module graph.
 *
 * A real export looks like:
 *   <meta http-equiv="Refresh" content="0; url=https://THE-URL" />
 *   <a href="https://THE-URL">Click Here to go to the submission</a>
 *   "This submission was a url, we're taking you to the url link now."
 */

/** The marker text Canvas writes on every URL-submission redirect page. */
const URL_SUBMISSION_MARKER = /this\s+submission\s+was\s+a\s+url/i;

const META_TAG = /<meta\b[^>]*>/gi;
const ANCHOR_HREF = /<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1/i;

function readAttribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

/** Decode the one entity an attribute URL realistically carries. */
function decodeAmp(value: string): string {
  return value.replace(/&amp;/gi, "&");
}

function asHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = decodeAmp(value.trim());
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null;
}

/**
 * The submitted URL if `html` is a Canvas "Website URL" redirect page, else
 * null (an ordinary HTML submission is left untouched). The marker line is a
 * REQUIRED guard: a student's own web page may legitimately carry a
 * meta-refresh, and must never be hijacked into a fetch of its target.
 */
export function extractCanvasSubmittedUrl(html: string): string | null {
  if (!URL_SUBMISSION_MARKER.test(html)) return null;

  for (const tag of html.match(META_TAG) ?? []) {
    const httpEquiv = readAttribute(tag, "http-equiv");
    if (!httpEquiv || httpEquiv.trim().toLowerCase() !== "refresh") continue;
    const content = readAttribute(tag, "content");
    if (!content) continue;
    const target = /^\s*\d+\s*;\s*url\s*=\s*['"]?(.*?)['"]?\s*$/i.exec(content);
    const url = asHttpUrl(target?.[1]);
    if (url) return url;
  }

  return asHttpUrl(ANCHOR_HREF.exec(html)?.[2]);
}

/**
 * Rewrites `vscode.dev/github/<owner>/<repo>/<rest...>` to
 * `https://github.com/<owner>/<repo>/<rest...>` (host swapped, the leading
 * `github` segment dropped, the rest of the path preserved verbatim including
 * percent-encoding). Any other URL, including a plain github.com or .git URL,
 * is returned unchanged.
 */
export function normalizeSubmittedRepoUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return url;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "vscode.dev" && host !== "www.vscode.dev") return url;
  if (!/^\/github\/[^/]+/i.test(parsed.pathname)) return url;
  return `https://github.com${parsed.pathname.slice("/github".length)}`;
}
