// Pure helpers for the Unsplash "deliverable images" integration (AC1/AC2 of
// that feature): search-query derivation, attribution construction, and
// response-to-record mapping. Kept in a PLAIN module - never a "use server"
// file - for two reasons: these are synchronously testable without mocking
// the network, and src/app/actions/unsplash.ts (the module that actually
// holds the API key and makes the HTTP calls) must export nothing but async
// functions (see src/lib/use-server-exports.test.ts) - a helper like
// classifyUnsplashHttpError below is a plain synchronous function, so it
// cannot live there even though only that module calls it.
//
// Unsplash's API guidelines (https://help.unsplash.com/en/articles/2511315)
// require every link back to Unsplash or the photographer to carry UTM
// parameters identifying this application.
const UTM_SOURCE = "teaching_assistant";
const UTM_MEDIUM = "referral";

function withUtm(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", UTM_SOURCE);
    u.searchParams.set("utm_medium", UTM_MEDIUM);
    return u.toString();
  } catch {
    // A malformed URL from the API response is already caught upstream by
    // mapUnsplashSearchResponse's field validation - this fallback only
    // guards a URL that parses as a string but not as a URL (defensive).
    return url;
  }
}

export interface UnsplashPhotoRecord {
  id: string;
  /** The photo's own description/alt text, when Unsplash provided one. */
  description: string;
  /** A hotlink-quality delivery URL - used here only to download the actual
   * bytes to embed in the zip (see this feature's own doc comment on
   * steps.deliverable-images.ts for why a zip needs a real file rather than
   * a hotlink). */
  imageUrl: string;
  photographerName: string;
  /** UTM-tagged - AC2's attribution obligation. */
  photographerProfileUrl: string;
  /** UTM-tagged - AC2's attribution obligation. */
  photoPageUrl: string;
  /** The API endpoint to GET when the photo is actually used - Unsplash's
   * usage-tracking obligation (AC2). Never UTM-tagged: it is an API call
   * Unsplash's own client makes, not a link a person clicks. */
  downloadLocation: string;
}

export type UnsplashMapResult =
  | { ok: true; photo: UnsplashPhotoRecord }
  | { ok: false; reason: "no_results" | "malformed_response" };

/**
 * Maps a raw Unsplash `/search/photos` JSON response to our internal record
 * shape - or a typed failure reason when the response is unusable. AC3 asks
 * that "empty results" and "malformed response" degrade the same way (a
 * graceful per-week skip) but be independently testable failure PATHS, so
 * they are reported as distinct reasons here rather than collapsed into one
 * null.
 */
export function mapUnsplashSearchResponse(json: unknown): UnsplashMapResult {
  if (!json || typeof json !== "object") {
    return { ok: false, reason: "malformed_response" };
  }
  const results = (json as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return { ok: false, reason: "malformed_response" };
  }
  if (results.length === 0) {
    return { ok: false, reason: "no_results" };
  }

  const first = results[0];
  if (!first || typeof first !== "object") {
    return { ok: false, reason: "malformed_response" };
  }
  const p = first as Record<string, unknown>;

  const id = typeof p.id === "string" ? p.id : "";
  const description =
    typeof p.description === "string"
      ? p.description
      : typeof p.alt_description === "string"
        ? p.alt_description
        : "";

  const urls = p.urls as Record<string, unknown> | undefined;
  const imageUrl =
    urls && typeof urls.regular === "string"
      ? urls.regular
      : urls && typeof urls.full === "string"
        ? urls.full
        : "";

  const user = p.user as Record<string, unknown> | undefined;
  const photographerName = user && typeof user.name === "string" ? user.name : "";
  const userLinks = user?.links as Record<string, unknown> | undefined;
  const photographerProfileUrlRaw =
    userLinks && typeof userLinks.html === "string" ? userLinks.html : "";

  const links = p.links as Record<string, unknown> | undefined;
  const photoPageUrlRaw = links && typeof links.html === "string" ? links.html : "";
  const downloadLocation =
    links && typeof links.download_location === "string" ? links.download_location : "";

  if (!id || !imageUrl || !photographerName || !photographerProfileUrlRaw || !photoPageUrlRaw || !downloadLocation) {
    // Missing a field this feature depends on (attribution or the download
    // trigger both need it) - never ship a half-built record.
    return { ok: false, reason: "malformed_response" };
  }

  return {
    ok: true,
    photo: {
      id,
      description,
      imageUrl,
      photographerName,
      photographerProfileUrl: withUtm(photographerProfileUrlRaw),
      photoPageUrl: withUtm(photoPageUrlRaw),
      downloadLocation,
    },
  };
}

export interface UnsplashAttribution {
  photographerName: string;
  photographerProfileUrl: string;
  photoPageUrl: string;
  /** Human-readable one-line credit ("Photo by X on Unsplash", the wording
   * Unsplash's guidelines ask for) with both UTM-tagged links spelled out -
   * this is what ships in the per-week companion credits file (AC2: the
   * attribution must survive somewhere other than just the image's own file
   * name). */
  creditLine: string;
}

/** Builds the credit line every caller uses, so wording never drifts between
 * call sites. */
export function buildUnsplashAttribution(photo: UnsplashPhotoRecord): UnsplashAttribution {
  return {
    photographerName: photo.photographerName,
    photographerProfileUrl: photo.photographerProfileUrl,
    photoPageUrl: photo.photoPageUrl,
    creditLine: `Photo by ${photo.photographerName} (${photo.photographerProfileUrl}) on Unsplash (${photo.photoPageUrl}).`,
  };
}

export type UnsplashErrorKind = "rate_limited" | "server_error";

/**
 * Classifies a non-2xx Unsplash HTTP status into "stop calling for the rest
 * of this run" (rate_limited) or an ordinary per-request failure
 * (server_error). Per Unsplash's own documented behavior, a Demo-tier app
 * that exceeds its hourly quota gets HTTP 403 (not 429) - AC3 names both
 * explicitly, so both map here.
 */
export function classifyUnsplashHttpError(status: number): UnsplashErrorKind {
  if (status === 403 || status === 429) return "rate_limited";
  return "server_error";
}

/** Strips markdown/code fences/quotes/URLs and collapses whitespace so text
 * pulled from generated course content is safe to hand to a search API as a
 * plain query string. */
function cleanQueryText(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`+/g, " ")
    .replace(/[*_#>[\]()]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_QUERY_LENGTH = 100;

/** Cleans free text and reduces it to its first sentence (or the whole
 * cleaned string when there is no sentence-ending punctuation to split on -
 * true of a raw file name, which is exactly what the "own title" tier below
 * hands this when a deliverable carries no prose), capped to
 * MAX_QUERY_LENGTH. Returns "" when the input has no real content. */
function firstSentenceQuery(text: string): string {
  const cleaned = cleanQueryText(text);
  if (!cleaned) return "";
  const firstSentence = cleaned.split(/(?<=[.!?])\s/)[0] || cleaned;
  return firstSentence.slice(0, MAX_QUERY_LENGTH);
}

/**
 * Derives an Unsplash search query for ONE DELIVERABLE (AC1 of the
 * per-deliverable feature - a course build's zip previously got one shared
 * photo per WEEK; every deliverable that week produced now gets its own,
 * queried from its own content) - never a generic course-level term, which
 * would make every deliverable fetch the same stock photo. Priority order:
 *
 *  1. `primaryText` - the deliverable's OWN content: its generated prose
 *     (GeneratedCourseFile.pageText) when it has any, or - for a role that
 *     carries no prose (a slides deck, an assignment/test handout; see that
 *     field's own doc comment for which roles set it) - a title derived from
 *     its own file name, which already embeds that specific file's identity
 *     (buildWorkflowFileName bakes the assignment's own generated title, or
 *     the week's label, into the name). This is what makes a week's
 *     assignment image and its deck image resolve to DIFFERENT queries
 *     instead of the same one duplicated - each deliverable's own name/
 *     content differs even when the week's topic does not. Reduced to its
 *     first sentence (or used whole when it has no sentence punctuation to
 *     split on, as a file name does not).
 *  2. `topic` - the week's schedule topic, used verbatim (never sentence-
 *     split - it is already short, human-authored text) when the
 *     deliverable itself carried nothing usable.
 *  3. `fallbackTexts` - another deliverable from the SAME week's generated
 *     prose, in caller-supplied preference order - a last resort for the
 *     rare case neither of the above yielded anything, so a deliverable is
 *     never starved of an image just because its own content AND the
 *     schedule both came up empty.
 *
 * Returns "" (never a generic query) when none of the three yields anything
 * real - callers must treat that as "skip this deliverable's image".
 */
export function deriveDeliverableImageQuery(
  primaryText: string | undefined,
  topic: string | undefined,
  fallbackTexts: string[]
): string {
  const own = firstSentenceQuery(primaryText ?? "");
  if (own) return own;

  const cleanTopic = cleanQueryText(topic ?? "");
  if (cleanTopic) return cleanTopic.slice(0, MAX_QUERY_LENGTH);

  for (const text of fallbackTexts) {
    const fallback = firstSentenceQuery(text);
    if (fallback) return fallback;
  }

  return "";
}
