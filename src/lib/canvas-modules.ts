/**
 * Client for the Canvas LMS Modules and Pages REST APIs.
 *
 * Lets the Course Content tab read a course's module structure (modules and the
 * ordered, typed items inside them) and its wiki pages, then edit them: rename
 * and reorder modules/items, toggle publish state, add/remove items, and edit a
 * page's HTML body.
 *
 * Page bodies are HTML and are passed through verbatim (no lossy text<->HTML
 * conversion) so formatting, links, images, and embeds survive a round trip.
 *
 * Server-only: credentials come from canvas-core (the instructor API token is
 * read from the environment and never exposed to the client).
 */

import {
  canvasError,
  parseNextLink,
  resolveCourse,
  type CanvasInstitution,
} from "./canvas-core";

// ── Types ────────────────────────────────────────────────────────────────────

/** One item inside a module (a Page, Assignment, File, SubHeader, etc.). */
export interface CanvasModuleItem {
  id: number;
  moduleId: number;
  title: string;
  /** Page, Assignment, Quiz, Discussion, File, SubHeader, ExternalUrl, ExternalTool. */
  type: string;
  position: number;
  /** Visual nesting depth Canvas shows in the module list. */
  indent: number;
  published: boolean;
  /** Page slug for Page items; null otherwise. */
  pageUrl: string | null;
  /** Underlying content id for Assignment/Quiz/Discussion/File items. */
  contentId: number | null;
  htmlUrl: string | null;
  externalUrl: string | null;
}

/** One module with its ordered items. */
export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  published: boolean;
  itemsCount: number;
  items: CanvasModuleItem[];
}

/** A wiki page as it appears in the page list (no body). */
export interface CanvasPageSummary {
  pageId: number;
  /** Stable slug used to address the page in the API and in module items. */
  url: string;
  title: string;
  published: boolean;
  frontPage: boolean;
  updatedAt: string | null;
}

/** A single wiki page including its raw HTML body. */
export interface CanvasPage {
  pageId: number;
  url: string;
  title: string;
  /** Raw HTML, passed through verbatim for editing. */
  body: string;
  published: boolean;
  updatedAt: string | null;
}

/** A piece of course content that can be added to a module, keyed by content id. */
export interface CanvasContentItem {
  id: number;
  title: string;
}

/** The content types (besides pages) that can be added as module items. */
export interface CanvasAddableContent {
  assignments: CanvasContentItem[];
  quizzes: CanvasContentItem[];
  discussions: CanvasContentItem[];
  files: CanvasContentItem[];
}

// ── Raw Canvas response shapes ────────────────────────────────────────────────

interface RawModule {
  id?: number;
  name?: string;
  position?: number;
  published?: boolean;
  items_count?: number;
}

interface RawModuleItem {
  id?: number;
  module_id?: number;
  title?: string;
  type?: string;
  position?: number;
  indent?: number;
  published?: boolean;
  page_url?: string | null;
  content_id?: number | null;
  html_url?: string | null;
  external_url?: string | null;
}

interface RawPage {
  page_id?: number;
  url?: string;
  title?: string;
  body?: string | null;
  published?: boolean;
  front_page?: boolean;
  updated_at?: string | null;
}

type CourseContext = {
  courseId: string;
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────

/** GET every page of a list endpoint, following the RFC-5988 Link header. */
async function fetchAll<T>(
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
async function safeFetchAll<T>(startUrl: string, ctx: CourseContext): Promise<T[]> {
  try {
    return await fetchAll<T>(startUrl, ctx);
  } catch {
    return [];
  }
}

/** Issue a write (POST/PUT/DELETE) with a form body, returning the parsed JSON. */
async function writeJson<T>(
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

function mapModuleItem(raw: RawModuleItem, fallbackModuleId: number): CanvasModuleItem {
  return {
    id: raw.id ?? 0,
    moduleId: raw.module_id ?? fallbackModuleId,
    title: (raw.title ?? "").trim() || "(untitled)",
    type: raw.type ?? "",
    position: typeof raw.position === "number" ? raw.position : 0,
    indent: typeof raw.indent === "number" ? raw.indent : 0,
    published: raw.published ?? false,
    pageUrl: raw.page_url ?? null,
    contentId: typeof raw.content_id === "number" ? raw.content_id : null,
    htmlUrl: raw.html_url ?? null,
    externalUrl: raw.external_url ?? null,
  };
}

function mapPageSummary(raw: RawPage): CanvasPageSummary {
  return {
    pageId: raw.page_id ?? 0,
    url: raw.url ?? "",
    title: (raw.title ?? "").trim() || "(untitled)",
    published: raw.published ?? false,
    frontPage: raw.front_page ?? false,
    updatedAt: raw.updated_at ?? null,
  };
}

function mapPage(raw: RawPage): CanvasPage {
  return {
    pageId: raw.page_id ?? 0,
    url: raw.url ?? "",
    title: (raw.title ?? "").trim() || "(untitled)",
    body: raw.body ?? "",
    published: raw.published ?? false,
    updatedAt: raw.updated_at ?? null,
  };
}

// ── Modules ───────────────────────────────────────────────────────────────────

/**
 * List a course's modules, each with its ordered items. Items are fetched per
 * module (rather than via include[]=items) so modules with many items are never
 * silently truncated. Modules and items come back sorted by Canvas position.
 */
export async function listModules(
  courseUrl: string,
  code?: string
): Promise<CanvasModule[]> {
  const ctx = resolveCourse(courseUrl, code);
  const rawModules = await fetchAll<RawModule>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules?per_page=100`,
    ctx
  );

  const modules = await Promise.all(
    rawModules
      .filter((m) => typeof m.id === "number")
      .map(async (m) => {
        const moduleId = m.id!;
        const rawItems = await fetchAll<RawModuleItem>(
          `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules/${moduleId}/items?per_page=100`,
          ctx
        );
        const items = rawItems
          .map((item) => mapModuleItem(item, moduleId))
          .sort((a, b) => a.position - b.position);
        return {
          id: moduleId,
          name: (m.name ?? "").trim() || "(untitled module)",
          position: typeof m.position === "number" ? m.position : 0,
          published: m.published ?? false,
          itemsCount: typeof m.items_count === "number" ? m.items_count : items.length,
          items,
        } satisfies CanvasModule;
      })
  );

  return modules.sort((a, b) => a.position - b.position);
}

/** Create a new (empty) module. Optionally place it at a 1-based position. */
export async function createModule(
  courseUrl: string,
  name: string,
  position?: number,
  code?: string
): Promise<CanvasModule> {
  if (!name.trim()) throw new Error("A module needs a name.");
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  params.append("module[name]", name.trim());
  if (typeof position === "number") params.append("module[position]", String(position));
  const raw = await writeJson<RawModule>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules`,
    "POST",
    ctx,
    params
  );
  return {
    id: raw.id ?? 0,
    name: (raw.name ?? name).trim(),
    position: typeof raw.position === "number" ? raw.position : (position ?? 0),
    published: raw.published ?? false,
    itemsCount: typeof raw.items_count === "number" ? raw.items_count : 0,
    items: [],
  };
}

/**
 * Update a module's name, publish state, and/or position. Setting position
 * reorders the module list (Canvas shifts the others to make room).
 */
export async function updateModule(
  courseUrl: string,
  moduleId: number,
  fields: { name?: string; published?: boolean; position?: number },
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  if (typeof fields.name === "string") params.append("module[name]", fields.name.trim());
  if (typeof fields.published === "boolean") params.append("module[published]", String(fields.published));
  if (typeof fields.position === "number") params.append("module[position]", String(fields.position));
  if ([...params.keys()].length === 0) return;
  await writeJson<RawModule>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules/${moduleId}`,
    "PUT",
    ctx,
    params
  );
}

/** Delete a module (its items are removed from the module, not deleted). */
export async function deleteModule(
  courseUrl: string,
  moduleId: number,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  await writeJson<RawModule>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules/${moduleId}`,
    "DELETE",
    ctx
  );
}

// ── Module items ──────────────────────────────────────────────────────────────

/** Fields accepted when creating a module item. */
export interface NewModuleItem {
  /** Page, Assignment, Quiz, Discussion, File, SubHeader, ExternalUrl. */
  type: string;
  /** Required for Assignment/Quiz/Discussion/File. */
  contentId?: number;
  /** Required for Page items (the page slug). */
  pageUrl?: string;
  /** Required for ExternalUrl; optional label for SubHeader. */
  externalUrl?: string;
  title?: string;
  position?: number;
  indent?: number;
}

/** Add an item to a module. */
export async function createModuleItem(
  courseUrl: string,
  moduleId: number,
  item: NewModuleItem,
  code?: string
): Promise<CanvasModuleItem> {
  if (!item.type.trim()) throw new Error("A module item needs a type.");
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  params.append("module_item[type]", item.type);
  if (item.title?.trim()) params.append("module_item[title]", item.title.trim());
  if (item.pageUrl) params.append("module_item[page_url]", item.pageUrl);
  if (typeof item.contentId === "number") params.append("module_item[content_id]", String(item.contentId));
  if (item.externalUrl) params.append("module_item[external_url]", item.externalUrl);
  if (typeof item.position === "number") params.append("module_item[position]", String(item.position));
  if (typeof item.indent === "number") params.append("module_item[indent]", String(item.indent));
  const raw = await writeJson<RawModuleItem>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules/${moduleId}/items`,
    "POST",
    ctx,
    params
  );
  return mapModuleItem(raw, moduleId);
}

/**
 * Update a module item's title, indent, publish state, and/or position. Setting
 * position reorders within the module. Pass targetModuleId to move it to another
 * module.
 */
export async function updateModuleItem(
  courseUrl: string,
  moduleId: number,
  itemId: number,
  fields: { title?: string; indent?: number; published?: boolean; position?: number; targetModuleId?: number },
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  if (typeof fields.title === "string") params.append("module_item[title]", fields.title.trim());
  if (typeof fields.indent === "number") params.append("module_item[indent]", String(fields.indent));
  if (typeof fields.published === "boolean") params.append("module_item[published]", String(fields.published));
  if (typeof fields.position === "number") params.append("module_item[position]", String(fields.position));
  if (typeof fields.targetModuleId === "number") {
    params.append("module_item[module_id]", String(fields.targetModuleId));
  }
  if ([...params.keys()].length === 0) return;
  await writeJson<RawModuleItem>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules/${moduleId}/items/${itemId}`,
    "PUT",
    ctx,
    params
  );
}

/** Remove an item from a module. */
export async function deleteModuleItem(
  courseUrl: string,
  moduleId: number,
  itemId: number,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  await writeJson<RawModuleItem>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules/${moduleId}/items/${itemId}`,
    "DELETE",
    ctx
  );
}

// ── Pages ─────────────────────────────────────────────────────────────────────

/** List a course's wiki pages (title/slug/publish state only; no body). */
export async function listPages(
  courseUrl: string,
  code?: string
): Promise<CanvasPageSummary[]> {
  const ctx = resolveCourse(courseUrl, code);
  const raw = await fetchAll<RawPage>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/pages?per_page=100&sort=title`,
    ctx
  );
  return raw
    .filter((p) => typeof p.url === "string" && p.url.length > 0)
    .map(mapPageSummary);
}

/** Fetch one page including its raw HTML body, addressed by slug or page id. */
export async function getPage(
  courseUrl: string,
  pageUrl: string,
  code?: string
): Promise<CanvasPage> {
  const ctx = resolveCourse(courseUrl, code);
  const response = await fetch(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/pages/${encodeURIComponent(pageUrl)}`,
    { headers: { Authorization: `Bearer ${ctx.token}` } }
  );
  if (!response.ok) {
    throw canvasError(response.status, ctx.institution);
  }
  return mapPage((await response.json()) as RawPage);
}

/**
 * Update a page's title, HTML body, and/or publish state. The body is sent
 * verbatim. Returns the saved page (its slug may change if the title changed).
 */
export async function updatePage(
  courseUrl: string,
  pageUrl: string,
  fields: { title?: string; body?: string; published?: boolean },
  code?: string
): Promise<CanvasPage> {
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  if (typeof fields.title === "string") params.append("wiki_page[title]", fields.title);
  if (typeof fields.body === "string") params.append("wiki_page[body]", fields.body);
  if (typeof fields.published === "boolean") params.append("wiki_page[published]", String(fields.published));
  const raw = await writeJson<RawPage>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/pages/${encodeURIComponent(pageUrl)}`,
    "PUT",
    ctx,
    params
  );
  return mapPage(raw);
}

/** Create a new wiki page. Returns the created page. */
export async function createPage(
  courseUrl: string,
  fields: { title: string; body?: string; published?: boolean },
  code?: string
): Promise<CanvasPage> {
  if (!fields.title.trim()) throw new Error("A page needs a title.");
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  params.append("wiki_page[title]", fields.title.trim());
  if (typeof fields.body === "string") params.append("wiki_page[body]", fields.body);
  params.append("wiki_page[published]", String(fields.published ?? false));
  const raw = await writeJson<RawPage>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/pages`,
    "POST",
    ctx,
    params
  );
  return mapPage(raw);
}

/** Delete a wiki page by slug or page id. */
export async function deletePage(
  courseUrl: string,
  pageUrl: string,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  await writeJson<RawPage>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/pages/${encodeURIComponent(pageUrl)}`,
    "DELETE",
    ctx
  );
}

// ── Addable content (for the module-item picker) ──────────────────────────────

interface RawAssignment {
  id?: number;
  name?: string;
}

interface RawQuiz {
  id?: number;
  title?: string;
}

interface RawDiscussionTopic {
  id?: number;
  title?: string;
  is_announcement?: boolean;
}

interface RawFile {
  id?: number;
  display_name?: string;
  filename?: string;
}

/**
 * List the assignments, quizzes, discussions, and files a module item can point
 * at, so the picker can offer them by name. Pages are listed separately
 * (listPages) because module items reference them by slug, not content id. Each
 * list is best-effort: a type the course/token can't read comes back empty
 * rather than failing the whole call.
 */
export async function listAddableContent(
  courseUrl: string,
  code?: string
): Promise<CanvasAddableContent> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const [assignments, quizzes, discussions, files] = await Promise.all([
    safeFetchAll<RawAssignment>(`${base}/assignments?per_page=100`, ctx),
    safeFetchAll<RawQuiz>(`${base}/quizzes?per_page=100`, ctx),
    safeFetchAll<RawDiscussionTopic>(`${base}/discussion_topics?per_page=100`, ctx),
    safeFetchAll<RawFile>(`${base}/files?per_page=100`, ctx),
  ]);
  return {
    assignments: assignments
      .filter((a) => typeof a.id === "number")
      .map((a) => ({ id: a.id!, title: (a.name ?? "").trim() || `Assignment ${a.id}` })),
    quizzes: quizzes
      .filter((q) => typeof q.id === "number")
      .map((q) => ({ id: q.id!, title: (q.title ?? "").trim() || `Quiz ${q.id}` })),
    // /discussion_topics returns announcements too; keep only real discussions.
    discussions: discussions
      .filter((d) => typeof d.id === "number" && !d.is_announcement)
      .map((d) => ({ id: d.id!, title: (d.title ?? "").trim() || `Discussion ${d.id}` })),
    files: files
      .filter((f) => typeof f.id === "number")
      .map((f) => ({ id: f.id!, title: (f.display_name ?? f.filename ?? "").trim() || `File ${f.id}` })),
  };
}
