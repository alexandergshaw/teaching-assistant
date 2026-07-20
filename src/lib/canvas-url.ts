/**
 * Pure Canvas URL parsing — no environment access, no network. Safe to import
 * from both the server (the Canvas client) and the client (the grading UI's
 * live "detected kind" hint), so the server-only Canvas client never gets
 * bundled into the browser.
 */

export type CanvasUrlKind = "discussion" | "assignment";

export interface ParsedCanvasUrl {
  kind: CanvasUrlKind;
  courseId: string;
  id: string;
}

/** Pull the kind, course id, and resource id out of a Canvas URL. */
export function parseCanvasUrl(url: string): ParsedCanvasUrl | null {
  const discussion = url.match(/\/courses\/(\d+)\/discussion_topics\/(\d+)/);
  if (discussion) {
    return { kind: "discussion", courseId: discussion[1], id: discussion[2] };
  }

  const assignment = url.match(/\/courses\/(\d+)\/assignments\/(\d+)/);
  if (assignment) {
    return { kind: "assignment", courseId: assignment[1], id: assignment[2] };
  }

  return null;
}

/** Just the kind, for UI hints. Null when the URL is not a gradable Canvas link. */
export function detectCanvasUrlKind(url: string): CanvasUrlKind | null {
  return parseCanvasUrl(url)?.kind ?? null;
}

/**
 * The canonical content URL for a module item's assignment or discussion.
 * Canvas module items' html_url is usually the /modules/items/<id> wrapper
 * link, which parseCanvasUrl rejects - so build the direct URL from the
 * course URL's /courses/<id> prefix and the item's content id. Falls back to
 * htmlUrl only when it is itself a parseable assignment/discussion link.
 * Null when neither route yields a usable URL (caller skips the item).
 */
export function moduleItemContentUrl(
  courseUrl: string,
  itemType: string,
  contentId: number | null,
  htmlUrl: string | null
): string | null {
  const base = courseUrl.match(/^(.*\/courses\/\d+)/);
  if (base && typeof contentId === "number") {
    if (itemType === "Assignment") return `${base[1]}/assignments/${contentId}`;
    if (itemType === "Discussion") return `${base[1]}/discussion_topics/${contentId}`;
  }
  if (htmlUrl && parseCanvasUrl(htmlUrl)) return htmlUrl;
  return null;
}

/**
 * Pull the course id out of any Canvas course URL (a bare
 * .../courses/123, or any deeper link like .../courses/123/announcements).
 * Used by the announcements UI, which only needs the course — not a specific
 * discussion or assignment. Null when the URL has no /courses/<id> segment.
 */
export function parseCanvasCourseId(url: string): string | null {
  const match = url.match(/\/courses\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract Canvas file IDs from raw HTML.
 * Looks for hrefs like /courses/123/files/456, /files/456, plus /download, /preview, or query suffixes.
 * Also extracts from data-api-endpoint="...files/123..." attributes.
 * Returns deduped array in first-appearance order. Empty input or no matches returns [].
 */
export function extractCanvasFileIds(html: string): number[] {
  if (!html || typeof html !== "string") {
    return [];
  }

  const fileIds = new Set<number>();
  const idArray: number[] = [];

  // Match href patterns: /courses/\d+/files/\d+ or /files/\d+ with optional /download, /preview, or query strings
  const hrefRegex = /href="([^"]*(?:\/courses\/\d+)?\/files\/(\d+)(?:\/download|\/preview)?(?:\?[^"]*)?)[^"]*"/g;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const fileId = parseInt(match[2], 10);
    if (!isNaN(fileId) && !fileIds.has(fileId)) {
      fileIds.add(fileId);
      idArray.push(fileId);
    }
  }

  // Match data-api-endpoint patterns: files/\d+
  const dataApiRegex = /data-api-endpoint="[^"]*\/files\/(\d+)[^"]*"/g;
  while ((match = dataApiRegex.exec(html)) !== null) {
    const fileId = parseInt(match[1], 10);
    if (!isNaN(fileId) && !fileIds.has(fileId)) {
      fileIds.add(fileId);
      idArray.push(fileId);
    }
  }

  return idArray;
}
