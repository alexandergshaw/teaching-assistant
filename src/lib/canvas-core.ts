/**
 * Shared internals for the Canvas LMS REST clients.
 *
 * Institution resolution (host/acronym -> base URL + instructor token), pagination,
 * HTML<->text conversion, and error mapping live here so every Canvas client
 * (grading/communications in canvas.ts, course content in canvas-modules.ts)
 * resolves credentials and handles responses the same way.
 *
 * Server-only: reads instructor API tokens from the environment and never
 * exposes them to the client.
 */

import { parseCanvasCourseId } from "./canvas-url";

/**
 * Registered Canvas institutions, keyed by hostname. The URL's host selects the
 * institution; its credentials come from per-institution env vars:
 *   <CODE>_CANVAS_API_TOKEN  (required) — instructor access token
 *   <CODE>_CANVAS_URL        (optional) — base URL override (defaults to https://<host>)
 * To add a school: add an entry here and set its env vars. No other code changes.
 */
export interface CanvasInstitution {
  code: string;
  name: string;
  host: string;
}

const CANVAS_INSTITUTIONS: CanvasInstitution[] = [
  { code: "MCC", name: "Metropolitan Community College", host: "canvas.mccneb.edu" },
];

/** Match a Canvas URL to a registered institution by its hostname. */
function institutionForUrl(url: string): CanvasInstitution | null {
  let host: string;
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
  return CANVAS_INSTITUTIONS.find((inst) => inst.host.toLowerCase() === host) ?? null;
}

function institutionBaseUrl(inst: CanvasInstitution): string {
  return (process.env[`${inst.code}_CANVAS_URL`]?.trim() || `https://${inst.host}`).replace(/\/+$/, "");
}

function institutionToken(inst: CanvasInstitution): string | undefined {
  // Trim so a trailing newline pasted into the env var doesn't produce an
  // invalid "Authorization: Bearer …" header value.
  return process.env[`${inst.code}_CANVAS_API_TOKEN`]?.trim() || undefined;
}

/**
 * Codes of the hardcoded CANVAS_INSTITUTIONS (which derive their base URL from a
 * built-in host, so they work with only a token set) that currently have an API
 * token configured. Unioned into "all institutions" discovery so a token-only
 * preconfigured school is not silently missed by env-var scanning that expects a
 * `<CODE>_CANVAS_URL`.
 */
export function listPreconfiguredInstitutionCodes(): string[] {
  return CANVAS_INSTITUTIONS.filter((inst) => institutionToken(inst)).map((inst) =>
    inst.code.toUpperCase()
  );
}

// Minimal HTML-to-text for Canvas message/body bodies (stored as HTML).
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Wrap a plain-text body in minimal, escaped HTML so line breaks survive when
// Canvas stores and renders it (announcement/message bodies are HTML fields).
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function canvasError(status: number, inst: CanvasInstitution): Error {
  switch (status) {
    case 401:
    case 403:
      return new Error(
        `Canvas rejected the request: the API token is missing, invalid, or lacks access to this course (${inst.code}_CANVAS_API_TOKEN).`
      );
    case 404:
      return new Error(
        "Canvas could not find that resource. Check the URL and that the token's account can see it."
      );
    default:
      return new Error(`Canvas request failed (HTTP ${status}).`);
  }
}

/** Resolve the institution + credentials for a URL, or throw a clear error. */
export function resolveInstitution(url: string): {
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
} {
  const institution = institutionForUrl(url);
  if (!institution) {
    const supported = CANVAS_INSTITUTIONS.map((inst) => inst.host).join(", ");
    throw new Error(
      `That Canvas host is not configured. Supported institutions: ${supported || "none"}.`
    );
  }
  const token = institutionToken(institution);
  if (!token) {
    throw new Error(
      `Canvas API token is not configured for ${institution.name}. Set ${institution.code}_CANVAS_API_TOKEN in the environment.`
    );
  }
  return { institution, token, baseUrl: institutionBaseUrl(institution) };
}

/**
 * Resolve credentials for institution-wide calls that have no course URL to key
 * off (e.g. the Inbox, which is account-wide). Picks the first registered
 * institution that has a token configured. With a single institution this is
 * unambiguous; if more are added, a chooser can select among them.
 */
export function resolveDefaultInstitution(): {
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
} {
  for (const institution of CANVAS_INSTITUTIONS) {
    const token = institutionToken(institution);
    if (token) {
      return { institution, token, baseUrl: institutionBaseUrl(institution) };
    }
  }
  throw new Error(
    "No Canvas API token is configured. Set <CODE>_CANVAS_API_TOKEN for a registered institution."
  );
}

/**
 * Resolve Canvas credentials for an institution acronym (MCC, MPCC, ...) used by
 * the Live Feed, which has no course URL to key off. Everything is env-driven:
 *   <CODE>_CANVAS_URL        (required) — base URL, e.g. https://canvas.mccneb.edu
 *   <CODE>_CANVAS_API_TOKEN  (required) — instructor token
 * The host is derived from the base URL only for error/display purposes.
 */
export function resolveInstitutionByCode(code: string): {
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
} {
  const upper = code.trim().toUpperCase();
  if (!upper) {
    throw new Error("An institution acronym is required.");
  }
  // Fall back to a hard-coded institution's host so a preconfigured school (e.g.
  // MCC) keeps working with just its token, even without <CODE>_CANVAS_URL set.
  const hardcoded = CANVAS_INSTITUTIONS.find((inst) => inst.code.toUpperCase() === upper);
  // Trim env values: a trailing newline in the token makes the Authorization
  // header invalid, and stray whitespace in the URL breaks request building.
  const baseRaw =
    process.env[`${upper}_CANVAS_URL`]?.trim() || (hardcoded ? `https://${hardcoded.host}` : undefined);
  const token = process.env[`${upper}_CANVAS_API_TOKEN`]?.trim() || undefined;
  if (!baseRaw) {
    throw new Error(
      `Canvas base URL is not configured for ${upper}. Set ${upper}_CANVAS_URL in the environment.`
    );
  }
  if (!token) {
    throw new Error(
      `Canvas API token is not configured for ${upper}. Set ${upper}_CANVAS_API_TOKEN in the environment.`
    );
  }
  let host = "";
  try {
    host = new URL(baseRaw).host.toLowerCase();
  } catch {
    // Base URL is malformed; keep host blank — the fetch below will surface it.
  }
  return {
    institution: { code: upper, name: upper, host },
    token,
    baseUrl: baseRaw.replace(/\/+$/, ""),
  };
}

/** Resolve a course URL to its id + credentials, or throw a clear error. */
export function resolveCourse(
  courseUrl: string,
  code?: string
): {
  courseId: string;
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
} {
  const courseId = parseCanvasCourseId(courseUrl);
  if (!courseId) {
    throw new Error(
      "Could not read a course from that URL. Expected a link like .../courses/123."
    );
  }
  // With an acronym, the base URL/token come from that school's env vars; without
  // one, fall back to matching the URL host (the original single-school behavior).
  const ctx = code ? resolveInstitutionByCode(code) : resolveInstitution(courseUrl);
  return { courseId, ...ctx };
}

/** Follow the RFC-5988 Link header to the next page, if any. */
export function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}
