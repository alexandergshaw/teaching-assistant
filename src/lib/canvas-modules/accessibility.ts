import { canvasError, resolveCourse } from "../canvas-core";
import { safeFetchAll, writeJson, fetchJson, mapWithConcurrency } from "./fetch-helpers";
import { contentHash } from "./mappers";
import { listPages, getPage } from "./pages";
import type { AccessibilityItemRef, BrokenLink, CanvasPageSummary, ScannableItem } from "./types";
import type { AccessibleItemType } from "../accessibility/types";
import type { RawHtmlContent } from "./raw-types";

function htmlItem(
  type: AccessibleItemType,
  id: string | number,
  title: string | undefined,
  html: string | null | undefined,
  updatedAt: string | null | undefined
): ScannableItem | null {
  const body = (html ?? "").trim();
  if (!body) return null;
  return {
    type,
    id: String(id),
    title: (title ?? "").trim() || `${type} ${id}`,
    fingerprint: updatedAt || contentHash(body),
    html: body,
  };
}

/**
 * List every editable HTML item in a course for accessibility scanning: pages
 * (bodies fetched with limited concurrency), assignment/quiz descriptions,
 * discussion/announcement messages, and the syllabus. Empty-HTML items are
 * skipped. Best-effort per type — one failing type doesn't blank the others.
 */
export async function listAccessibilityContent(courseUrl: string, code?: string): Promise<ScannableItem[]> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;

  const [pageSummaries, assignments, quizzes, topics, course] = await Promise.all([
    listPages(courseUrl, code).catch((): CanvasPageSummary[] => []),
    safeFetchAll<RawHtmlContent>(`${base}/assignments?per_page=100`, ctx),
    safeFetchAll<RawHtmlContent>(`${base}/quizzes?per_page=100`, ctx),
    safeFetchAll<RawHtmlContent>(`${base}/discussion_topics?per_page=100`, ctx),
    fetchJson<{ syllabus_body?: string | null }>(`${base}?include[]=syllabus_body`, ctx),
  ]);

  const items: ScannableItem[] = [];

  const pages = await mapWithConcurrency(pageSummaries, 6, async (p) => {
    try {
      const full = await getPage(courseUrl, p.url, code);
      return htmlItem("page", p.url, full.title, full.body, p.updatedAt);
    } catch {
      return null;
    }
  });
  for (const p of pages) if (p) items.push(p);

  for (const a of assignments) {
    if (typeof a.id !== "number") continue;
    const it = htmlItem("assignment", a.id, a.name, a.description, a.updated_at);
    if (it) items.push(it);
  }
  for (const q of quizzes) {
    if (typeof q.id !== "number") continue;
    const it = htmlItem("quiz", q.id, q.title, q.description, q.updated_at);
    if (it) items.push(it);
  }
  for (const t of topics) {
    if (typeof t.id !== "number") continue;
    const it = htmlItem(t.is_announcement ? "announcement" : "discussion", t.id, t.title, t.message, t.updated_at);
    if (it) items.push(it);
  }
  const syllabus = htmlItem("syllabus", "syllabus", "Syllabus", course?.syllabus_body, null);
  if (syllabus) items.push(syllabus);

  return items;
}

/**
 * List scannable items WITHOUT fetching page bodies — cheap enough to return fast
 * even for big courses. The actual HTML is fetched per item at scan time, so a
 * whole-course scan can be done in small batches instead of one heavy request.
 */
export async function listAccessibilityItems(courseUrl: string, code?: string): Promise<AccessibilityItemRef[]> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;

  const [pageSummaries, assignments, quizzes, topics, course] = await Promise.all([
    listPages(courseUrl, code).catch((): CanvasPageSummary[] => []),
    safeFetchAll<RawHtmlContent>(`${base}/assignments?per_page=100`, ctx),
    safeFetchAll<RawHtmlContent>(`${base}/quizzes?per_page=100`, ctx),
    safeFetchAll<RawHtmlContent>(`${base}/discussion_topics?per_page=100`, ctx),
    fetchJson<{ syllabus_body?: string | null }>(`${base}?include[]=syllabus_body`, ctx),
  ]);

  const out: AccessibilityItemRef[] = [];
  for (const p of pageSummaries) {
    out.push({ type: "page", id: p.url, title: p.title, fingerprint: p.updatedAt || p.url });
  }
  const pushIfHtml = (type: AccessibleItemType, id: number, title: string | undefined, html: string | null | undefined, updatedAt: string | null | undefined) => {
    const body = (html ?? "").trim();
    if (body) out.push({ type, id: String(id), title: (title ?? "").trim() || `${type} ${id}`, fingerprint: updatedAt || contentHash(body) });
  };
  for (const a of assignments) if (typeof a.id === "number") pushIfHtml("assignment", a.id, a.name, a.description, a.updated_at);
  for (const q of quizzes) if (typeof q.id === "number") pushIfHtml("quiz", q.id, q.title, q.description, q.updated_at);
  for (const t of topics) if (typeof t.id === "number") pushIfHtml(t.is_announcement ? "announcement" : "discussion", t.id, t.title, t.message, t.updated_at);
  const syllabus = (course?.syllabus_body ?? "").trim();
  if (syllabus) out.push({ type: "syllabus", id: "syllabus", title: "Syllabus", fingerprint: contentHash(syllabus) });

  return out;
}

/** Fetch a single scannable item's current HTML (used to re-scan after an edit). */
export async function getAccessibilityItem(
  courseUrl: string,
  type: AccessibleItemType,
  id: string,
  code?: string
): Promise<ScannableItem | null> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  if (type === "page") {
    try {
      const full = await getPage(courseUrl, id, code);
      return { type, id, title: full.title, fingerprint: full.updatedAt || contentHash(full.body), html: full.body };
    } catch {
      return null;
    }
  }
  if (type === "assignment" || type === "quiz") {
    const endpoint = type === "assignment" ? "assignments" : "quizzes";
    const raw = await fetchJson<RawHtmlContent>(`${base}/${endpoint}/${id}`, ctx);
    return raw ? htmlItem(type, id, raw.name ?? raw.title, raw.description, raw.updated_at) : null;
  }
  if (type === "discussion" || type === "announcement") {
    const raw = await fetchJson<RawHtmlContent>(`${base}/discussion_topics/${id}`, ctx);
    return raw ? htmlItem(type, id, raw.title, raw.message, raw.updated_at) : null;
  }
  if (type === "syllabus") {
    const course = await fetchJson<{ syllabus_body?: string | null }>(`${base}?include[]=syllabus_body`, ctx);
    return htmlItem("syllabus", "syllabus", "Syllabus", course?.syllabus_body, null);
  }
  return null;
}

function parseLinkRef(type: string, contentUrl: string): { itemType: AccessibleItemType; itemId: string } | null {
  if (type === "course_syllabus") return { itemType: "syllabus", itemId: "syllabus" };
  const path = (contentUrl || "").replace(/^https?:\/\/[^/]+/, "");
  let m: RegExpMatchArray | null;
  if ((m = path.match(/\/pages\/([^/?#]+)/))) return { itemType: "page", itemId: decodeURIComponent(m[1]) };
  if ((m = path.match(/\/assignments\/(\d+)/))) return { itemType: "assignment", itemId: m[1] };
  if ((m = path.match(/\/quizzes\/(\d+)/))) return { itemType: "quiz", itemId: m[1] };
  if ((m = path.match(/\/discussion_topics\/(\d+)/)))
    return { itemType: type === "announcement" ? "announcement" : "discussion", itemId: m[1] };
  return null;
}

/** Get the status + results of the course's last link-validation run. */
export async function getLinkValidation(courseUrl: string, code?: string): Promise<{ state: string; links: BrokenLink[] }> {
  const ctx = resolveCourse(courseUrl, code);
  const res = await fetch(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/link_validation`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (!res.ok) return { state: "none", links: [] };
  const data = (await res.json()) as {
    workflow_state?: string;
    results?: { issues?: unknown[] } | unknown[];
  };
  const state = data.workflow_state ?? "none";
  const raw = Array.isArray(data.results) ? data.results : Array.isArray(data.results?.issues) ? data.results!.issues! : [];
  const links: BrokenLink[] = [];
  for (const entry of raw as Array<{ type?: string; name?: string; content_url?: string; invalid_links?: Array<{ url?: string; reason?: string; link_text?: string }> }>) {
    const ref = parseLinkRef(entry.type ?? "", entry.content_url ?? "");
    if (!ref) continue;
    const title = (entry.name ?? "").trim() || `${ref.itemType} ${ref.itemId}`;
    for (const bl of entry.invalid_links ?? []) {
      links.push({ ...ref, itemTitle: title, url: bl.url ?? "", reason: bl.reason ?? "broken_link", linkText: bl.link_text });
    }
  }
  return { state, links };
}

/** Kick off a fresh course link-validation run. */
export async function startLinkValidation(courseUrl: string, code?: string): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  const res = await fetch(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/link_validation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (!res.ok) throw canvasError(res.status, ctx.institution);
}

/** Save edited HTML back to a scannable item, routed by type (for remediation). */
export async function saveAccessibilityItemHtml(
  courseUrl: string,
  type: AccessibleItemType,
  id: string,
  html: string,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const params = new URLSearchParams();
  if (type === "page") {
    params.append("wiki_page[body]", html);
    await writeJson(`${base}/pages/${encodeURIComponent(id)}`, "PUT", ctx, params);
  } else if (type === "assignment") {
    params.append("assignment[description]", html);
    await writeJson(`${base}/assignments/${id}`, "PUT", ctx, params);
  } else if (type === "quiz") {
    params.append("quiz[description]", html);
    await writeJson(`${base}/quizzes/${id}`, "PUT", ctx, params);
  } else if (type === "discussion" || type === "announcement") {
    params.append("message", html);
    await writeJson(`${base}/discussion_topics/${id}`, "PUT", ctx, params);
  } else if (type === "syllabus") {
    params.append("course[syllabus_body]", html);
    await writeJson(`${base}`, "PUT", ctx, params);
  } else {
    throw new Error("This item type can't be edited here.");
  }
}
