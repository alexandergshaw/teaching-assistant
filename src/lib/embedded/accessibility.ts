/**
 * Deterministic accessibility suggestions for the Embedded Deterministic Engine.
 * Where the LLM path uses a vision/text model, these derive a suggestion from the
 * structured signal already in the element's HTML: an image's file name and a
 * link's URL. When there is no usable signal they return null, so the caller can
 * tell the instructor to switch providers rather than write a misleading value.
 */

import { capitalizeFirst } from "./scaffold";

/** Turn a slug / file stem into readable words (camelCase, separators, encoding). */
function humanizeSlug(value: string): string {
  let text = value;
  try {
    text = decodeURIComponent(text);
  } catch {
    // keep the raw value if it is not valid percent-encoding
  }
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_+.%~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The last path segment of a URL/path, without query string or fragment. */
function lastPathSegment(url: string): string {
  const clean = url.split(/[?#]/)[0];
  const parts = clean.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

// File names that carry no descriptive signal (auto-generated, generic).
const GENERIC_NAME = /^(?:image|img|photo|pic|picture|screenshot|screen[-_ ]?shot|unnamed|download|untitled|file|copy|scan)[-_ ]?\d*$/i;

/** Extract the value of the first matching attribute from an HTML snippet. */
function attr(snippet: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(snippet);
  return m ? m[1] : null;
}

/**
 * Suggest alt text from an <img>'s file name. Returns null when the name is
 * generic or missing (nothing meaningful can be inferred without seeing pixels).
 */
export function deriveAltTextFromHtml(snippet: string): string | null {
  const src = attr(snippet, "src") ?? attr(snippet, "data-src") ?? attr(snippet, "href");
  if (!src) return null;
  const stem = lastPathSegment(src).replace(/\.[a-z0-9]{2,5}$/i, "");
  if (!stem || GENERIC_NAME.test(stem) || /^\d+$/.test(stem)) return null;
  const words = humanizeSlug(stem);
  return words ? capitalizeFirst(words).slice(0, 120) : null;
}

/** Build readable link text from a URL: "host: last path segment" (or the host). */
export function deriveLinkTextFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const mailto = /^mailto:(.+)$/i.exec(trimmed);
  if (mailto) return `Email ${mailto[1].split("?")[0]}`;

  let parsed: URL;
  try {
    parsed = new URL(trimmed, "https://relative.invalid");
  } catch {
    return null;
  }

  const readableLast = humanizeSlug(lastPathSegment(parsed.pathname).replace(/\.[a-z0-9]{2,5}$/i, ""));
  if (parsed.hostname && parsed.hostname !== "relative.invalid") {
    const host = parsed.hostname.replace(/^www\./, "");
    return readableLast ? `${host}: ${readableLast}` : host;
  }
  // Relative URL (no host).
  return readableLast ? capitalizeFirst(readableLast) : null;
}

/** Suggest link text from an <a>'s href. Returns null when there is no href. */
export function deriveLinkTextFromHtml(snippet: string): string | null {
  const href = attr(snippet, "href");
  return href ? deriveLinkTextFromUrl(href) : null;
}
