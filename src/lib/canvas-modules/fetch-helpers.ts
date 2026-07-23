import {
  canvasError,
  parseNextLink,
  type CanvasInstitution,
} from "../canvas-core";

export type CourseContext = {
  courseId: string;
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
};

/** GET every page of a list endpoint, following the RFC-5988 Link header. */
export async function fetchAll<T>(
  startUrl: string,
  ctx: CourseContext
): Promise<T[]> {
  let next: string | null = startUrl;
  const all: T[] = [];
  while (next) {
    const response = await fetch(next, {
      headers: { Authorization: `Bearer ${ctx.token}` },
    });
    if (!response.ok) {
      throw canvasError(response.status, ctx.institution);
    }
    const page = (await response.json()) as T[];
    all.push(...page);
    next = parseNextLink(response.headers.get("link"));
  }
  return all;
}

/**
 * Like fetchAll but returns an empty list instead of throwing — used for the
 * "addable content" pickers, where a course may have a feature disabled (e.g.
 * quizzes) or the token may lack access to one content type. A failure for one
 * type should not blank out the others.
 */
export async function safeFetchAll<T>(startUrl: string, ctx: CourseContext): Promise<T[]> {
  try {
    return await fetchAll<T>(startUrl, ctx);
  } catch {
    return [];
  }
}

/** Issue a write (POST/PUT/DELETE) with a form body, returning the parsed JSON. */
export async function writeJson<T>(
  url: string,
  method: "POST" | "PUT" | "DELETE",
  ctx: CourseContext,
  params?: URLSearchParams
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: params ? params.toString() : undefined,
  });
  if (!response.ok) {
    throw canvasError(response.status, ctx.institution);
  }
  return (await response.json()) as T;
}

export async function fetchJson<T>(url: string, ctx: CourseContext): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${ctx.token}` } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Run `fn` over `items` with at most `limit` in flight (pages need per-item GETs). */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}
