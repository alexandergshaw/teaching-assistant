"use server";

// Server-side half of the Unsplash "deliverable images" integration - the
// only place that reads UNSPLASH_ACCESS_KEY and makes network calls, so an
// attended (browser-run) workflow step never needs the key client-side. Pure
// query/attribution/response-mapping logic lives in @/lib/unsplash instead
// (a plain module, not "use server") both so it is unit-testable without
// mocking fetch and because a "use server" module may export nothing but
// async functions - see src/lib/use-server-exports.test.ts.
//
// Three Unsplash API obligations this module (together with
// steps.deliverable-images.ts, which calls it) satisfies:
//  1. Attribution - buildUnsplashAttribution (@/lib/unsplash) builds a credit
//     line with UTM-tagged links; the step ships it as a companion .txt file
//     next to the photo.
//  2. Download trigger - fetchUnsplashImageAction below fires it the moment
//     a photo is chosen for use, before downloading the actual bytes (not
//     conditioned on that byte download succeeding - Unsplash counts "used"
//     as soon as the app commits to the photo).
//  3. Hotlinking - Unsplash expects images hotlinked for web display, which
//     is in tension with this feature (the deliverable is a downloaded zip,
//     not a web page). Resolved by downloading the actual bytes so a real
//     file ships in the zip, while still doing 1 and 2 above so the usage is
//     honestly counted and credited either way.
import {
  mapUnsplashSearchResponse,
  classifyUnsplashHttpError,
  type UnsplashPhotoRecord,
} from "@/lib/unsplash";

const UNSPLASH_API_BASE = "https://api.unsplash.com";

/** Whether the Unsplash API is configured. Workflow steps call this FIRST
 * (AC0) so a missing key degrades to "no images this run" without ever
 * reaching the network - never a run failure. */
export async function unsplashConfiguredAction(): Promise<{ configured: boolean }> {
  return { configured: !!process.env.UNSPLASH_ACCESS_KEY?.trim() };
}

export type FetchUnsplashImageResult =
  | { photo: UnsplashPhotoRecord; base64: string; mimeType: string }
  | {
      skipped: true;
      reason: "not_configured" | "no_query" | "no_results" | "malformed_response" | "network_error" | "download_failed";
    }
  | { error: string; rateLimited: boolean };

/**
 * Search Unsplash for `query`, fire the mandatory download-usage trigger for
 * the top result, then download the actual image bytes and return them as
 * base64 (the caller turns this into a real Blob for the zip - see
 * base64ToBlob, registry-helpers.ts). Every failure path degrades to a typed
 * "skipped"/"error" result rather than throwing (AC3) - a failed fetch, a
 * rate limit, a network error, or a photo with no usable URL must never
 * abort the course build that called this.
 */
export async function fetchUnsplashImageAction(query: string): Promise<FetchUnsplashImageResult> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) return { skipped: true, reason: "not_configured" };

  const q = query.trim();
  if (!q) return { skipped: true, reason: "no_query" };

  let res: Response;
  try {
    res = await fetch(
      `${UNSPLASH_API_BASE}/search/photos?query=${encodeURIComponent(q)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } }
    );
  } catch {
    return { skipped: true, reason: "network_error" };
  }

  if (!res.ok) {
    const kind = classifyUnsplashHttpError(res.status);
    return {
      error: `Unsplash search failed (HTTP ${res.status}).`,
      rateLimited: kind === "rate_limited",
    };
  }

  const json = await res.json().catch(() => null);
  const mapped = mapUnsplashSearchResponse(json);
  if (!mapped.ok) return { skipped: true, reason: mapped.reason };

  // Obligation 2: best-effort, never blocks shipping the photo (AC3) - a
  // failed tracking ping is not a reason to skip an otherwise-good photo.
  try {
    await fetch(mapped.photo.downloadLocation, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    });
  } catch {
    // Best-effort only; see the comment above.
  }

  let bytesRes: Response;
  try {
    bytesRes = await fetch(mapped.photo.imageUrl);
  } catch {
    return { skipped: true, reason: "download_failed" };
  }
  if (!bytesRes.ok) return { skipped: true, reason: "download_failed" };

  const arrayBuffer = await bytesRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = bytesRes.headers.get("content-type") || "image/jpeg";

  return { photo: mapped.photo, base64, mimeType };
}
