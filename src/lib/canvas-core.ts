/**
 * Shared internals for the Canvas LMS REST clients.
 *
 * Institution resolution (host/acronym -> base URL + instructor token), pagination,
 * HTML<->text conversion, and error mapping live here so every Canvas client
 * (grading/communications in canvas.ts, course content in canvas-modules.ts)
 * resolves credentials and handles responses the same way.
 *
 * CREDENTIAL RESOLUTION DELEGATES TO canvas-credentials.ts (Group E, wave 3;
 * see docs/lms-credentials-acceptance-criteria.md E6, E7, E10, and
 * docs/REGRESSION.md entry 402 for the measured baseline this replaced). The
 * four resolvers below used to interpolate a CLIENT-SUPPLIED institution
 * acronym directly into `process.env[`${CODE}_CANVAS_URL`]` /
 * `process.env[`${CODE}_CANVAS_API_TOKEN`]` - so any signed-in caller could
 * read the owner's environment back one bit at a time from which of three
 * differently-worded "not configured" errors came back. They now call
 * `resolveCanvasCredential(code)`, which resolves the CALLING USER's own
 * stored credential first and falls back to the owner's env vars ONLY for an
 * identity whose role is literally "owner" (SEC13) - see that module's own
 * header for the full contract. DO NOT re-add a
 * `process.env[`${code}_CANVAS_*`]` read here: that is precisely the
 * vulnerability this file was rewritten to remove, and canvas-credentials.ts
 * is now the ONLY module allowed to read those vars.
 *
 * Server-only: never exposes a token to the client.
 */

import { parseCanvasCourseId } from "./canvas-url";
import { describeInstitutionResolutionFailure } from "./institution-resolution";
import { resolveCanvasCredential, CANVAS_CREDENTIAL_REQUIRED_MESSAGE } from "./canvas-credentials";

/**
 * Registered Canvas institutions, keyed by hostname. Purely a public
 * host/code/name lookup table - it carries no credential, so it is safe to
 * export. Used two ways:
 *   - here, to turn a Canvas course/account URL into an institution CODE
 *     before asking canvas-credentials.ts for that code's credential;
 *   - by src/app/actions/course-hub-integrations.ts, which needs the same
 *     table to discover which hardcoded institutions the owner has a token
 *     env var set for, now that this file no longer exports a function that
 *     does that lookup itself (listPreconfiguredInstitutionCodes was deleted
 *     - see this change's own report for what replaced its one caller).
 * canvas-credentials.ts keeps its own tiny local copy of the one entry it
 * needs (HARDCODED_INSTITUTION_HOSTS) rather than importing this array - that
 * module shipped in an earlier wave and is out of this wave's file set to
 * edit, so the export below makes deduplication POSSIBLE for whoever next
 * touches that file, without this wave performing the edit itself.
 */
export interface CanvasInstitution {
  code: string;
  name: string;
  host: string;
}

export const CANVAS_INSTITUTIONS: CanvasInstitution[] = [
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

/**
 * Resolve the institution + credentials for a URL, or throw the one
 * indistinguishable failure (E6/E7). Before this wave, an unrecognized host
 * threw "That Canvas host is not configured. Supported institutions: <list>."
 * - naming every configured host outright, one of the three messages
 * canvas-credentials.ts's own header documents as the enumeration oracle this
 * change removes. An unrecognized host and a recognized-but-uncredentialed
 * one must read identically to the caller.
 */
export async function resolveInstitution(url: string): Promise<{
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
}> {
  const institution = institutionForUrl(url);
  if (!institution) {
    throw new Error(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
  }
  const credential = await resolveCanvasCredential(institution.code);
  return { institution, token: credential.token, baseUrl: credential.baseUrl };
}

/**
 * Resolve credentials for institution-wide calls that have no course URL to key
 * off (e.g. the Inbox, which is account-wide). Tries each registered
 * institution's code against resolveCanvasCredential, in the table's order,
 * and returns the first that resolves for the CALLING user (their own stored
 * row, or - only for an owner identity with none - the owner's env pair).
 * With a single institution this is unambiguous; if more are added, a
 * chooser can select among them.
 */
export async function resolveDefaultInstitution(): Promise<{
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
}> {
  for (const institution of CANVAS_INSTITUTIONS) {
    try {
      const credential = await resolveCanvasCredential(institution.code);
      return { institution, token: credential.token, baseUrl: credential.baseUrl };
    } catch {
      // Not configured/connected for this institution and this caller - try
      // the next registered one rather than surfacing a per-institution
      // reason (resolveCanvasCredential only ever throws the one
      // indistinguishable failure, so there is nothing more specific to
      // preserve here).
    }
  }
  throw new Error(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
}

/**
 * Resolve Canvas credentials for an institution acronym (MCC, MPCC, ...) used by
 * the Live Feed, which has no course URL to key off. The host attached to the
 * returned institution is derived from the resolved base URL only for
 * error/display purposes.
 */
export async function resolveInstitutionByCode(code: string): Promise<{
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
}> {
  const upper = code.trim().toUpperCase();
  if (!upper) {
    // Reached when a caller could not resolve an acronym through the shared
    // ladder (bound value -> course tile -> header -> single configured
    // institution) before getting here - see institution-resolution.ts. The
    // header is only one rung of that ladder, never a precondition. This is
    // a different failure from "not configured" and is not part of the
    // enumeration oracle collapsed above - it never names an institution.
    throw new Error(describeInstitutionResolutionFailure());
  }
  const credential = await resolveCanvasCredential(upper);
  let host = "";
  try {
    host = new URL(credential.baseUrl).host.toLowerCase();
  } catch {
    // Base URL is malformed; keep host blank — the fetch below will surface it.
  }
  return {
    institution: { code: upper, name: upper, host },
    token: credential.token,
    baseUrl: credential.baseUrl,
  };
}

/** Resolve a course URL to its id + credentials, or throw a clear error. */
export async function resolveCourse(
  courseUrl: string,
  code?: string
): Promise<{
  courseId: string;
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
}> {
  const courseId = parseCanvasCourseId(courseUrl);
  if (!courseId) {
    throw new Error(
      "Could not read a course from that URL. Expected a link like .../courses/123."
    );
  }
  // With an acronym, the credential comes from that institution's resolver;
  // without one, fall back to matching the URL host (the original
  // single-school behavior).
  const ctx = code ? await resolveInstitutionByCode(code) : await resolveInstitution(courseUrl);
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
