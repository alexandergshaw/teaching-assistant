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
  htmlToText,
  parseNextLink,
  resolveCourse,
  textToHtml,
  type CanvasInstitution,
} from "./canvas-core";
import { extractTextFromBuffer } from "./office-extract";
import { parseOfficeParagraphs, applyOfficeEdits, type OfficeKind, type OfficeParagraph } from "./office-edit";

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
  /** Current due date (ISO 8601) for gradable items, when Canvas reports one. */
  dueAt: string | null;
  /** Points possible for gradable items, when Canvas reports one. */
  pointsPossible: number | null;
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
  content_details?: { due_at?: string | null; points_possible?: number | null } | null;
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
    dueAt: raw.content_details?.due_at ?? null,
    pointsPossible:
      typeof raw.content_details?.points_possible === "number" ? raw.content_details.points_possible : null,
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
          `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules/${moduleId}/items?per_page=100&include[]=content_details`,
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

// ── Due dates ─────────────────────────────────────────────────────────────────

/** A single due-date change: the item's type, its content id, and the new date. */
export interface DueDateUpdate {
  /** Assignment, Quiz, or Discussion (graded). */
  type: string;
  contentId: number;
  /** ISO 8601 due date, or null/empty to clear it. */
  dueAt: string | null;
}

/** Set one item's due date, routing by type (Canvas has no single endpoint). */
async function setOneDueDate(
  ctx: CourseContext,
  type: string,
  contentId: number,
  dueAt: string | null
): Promise<void> {
  const value = dueAt ?? ""; // empty string clears the due date in Canvas
  if (type === "Assignment") {
    const params = new URLSearchParams();
    params.append("assignment[due_at]", value);
    await writeJson(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/assignments/${contentId}`, "PUT", ctx, params);
    return;
  }
  if (type === "Quiz") {
    const params = new URLSearchParams();
    params.append("quiz[due_at]", value);
    await writeJson(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/quizzes/${contentId}`, "PUT", ctx, params);
    return;
  }
  if (type === "Discussion") {
    // A discussion's due date lives on its linked assignment; resolve it first.
    const response = await fetch(
      `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/discussion_topics/${contentId}`,
      { headers: { Authorization: `Bearer ${ctx.token}` } }
    );
    if (!response.ok) throw canvasError(response.status, ctx.institution);
    const topic = (await response.json()) as { assignment_id?: number | null };
    if (!topic.assignment_id) {
      throw new Error("This discussion is not graded, so it has no due date.");
    }
    const params = new URLSearchParams();
    params.append("assignment[due_at]", value);
    await writeJson(
      `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/assignments/${topic.assignment_id}`,
      "PUT",
      ctx,
      params
    );
    return;
  }
  throw new Error(`Cannot set a due date for a ${type || "non-gradable"} item.`);
}

// ── File upload ───────────────────────────────────────────────────────────────

/** A pre-signed Canvas upload ticket; the browser POSTs the file to uploadUrl. */
export interface FileUploadTicket {
  uploadUrl: string;
  uploadParams: Record<string, string>;
}

/**
 * Step 1 of the Canvas file upload: tell Canvas about the incoming file and get
 * back a pre-signed upload URL + params. The browser then POSTs the file bytes
 * straight to that URL (step 2), so large files never pass through our server
 * and the API token is never exposed to the client.
 */
export async function requestFileUpload(
  courseUrl: string,
  file: { name: string; size: number; contentType?: string; folderPath?: string },
  code?: string
): Promise<FileUploadTicket> {
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  params.append("name", file.name);
  params.append("size", String(file.size));
  if (file.contentType) params.append("content_type", file.contentType);
  params.append("parent_folder_path", file.folderPath?.trim() || "uploads");
  // Keep both copies rather than clobbering an existing file with the same name.
  params.append("on_duplicate", "rename");

  const response = await fetch(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!response.ok) {
    throw canvasError(response.status, ctx.institution);
  }
  const data = (await response.json()) as {
    upload_url?: string;
    upload_params?: Record<string, string>;
  };
  if (!data.upload_url || !data.upload_params) {
    throw new Error("Canvas did not return an upload URL.");
  }
  return { uploadUrl: data.upload_url, uploadParams: data.upload_params };
}

// ── Bulk edit ─────────────────────────────────────────────────────────────────

/** Kinds the bulk editor can list and update. */
export type BulkKind = "Assignment" | "Quiz" | "Discussion" | "Page";

/** A normalized item for the bulk editor (id is a slug for pages, else numeric). */
export interface BulkItem {
  id: string;
  title: string;
  published: boolean;
  dueAt: string | null;
  pointsPossible: number | null;
}

interface RawBulkAssignment {
  id?: number;
  name?: string;
  published?: boolean;
  due_at?: string | null;
  points_possible?: number | null;
}

interface RawBulkQuiz {
  id?: number;
  title?: string;
  published?: boolean;
  due_at?: string | null;
  points_possible?: number | null;
}

interface RawBulkDiscussion {
  id?: number;
  title?: string;
  published?: boolean;
  is_announcement?: boolean;
  assignment?: { due_at?: string | null; points_possible?: number | null } | null;
}

/** List items of one kind with the fields the bulk editor shows and edits. */
export async function listBulkItems(
  courseUrl: string,
  kind: BulkKind,
  code?: string
): Promise<BulkItem[]> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;

  if (kind === "Page") {
    const raw = await fetchAll<RawPage>(`${base}/pages?per_page=100&sort=title`, ctx);
    return raw
      .filter((p) => typeof p.url === "string" && p.url.length > 0)
      .map((p) => ({
        id: p.url!,
        title: (p.title ?? "").trim() || "(untitled)",
        published: p.published ?? false,
        dueAt: null,
        pointsPossible: null,
      }));
  }
  if (kind === "Assignment") {
    const raw = await fetchAll<RawBulkAssignment>(`${base}/assignments?per_page=100`, ctx);
    return raw
      .filter((a) => typeof a.id === "number")
      .map((a) => ({
        id: String(a.id),
        title: (a.name ?? "").trim() || `Assignment ${a.id}`,
        published: a.published ?? false,
        dueAt: a.due_at ?? null,
        pointsPossible: typeof a.points_possible === "number" ? a.points_possible : null,
      }));
  }
  if (kind === "Quiz") {
    const raw = await fetchAll<RawBulkQuiz>(`${base}/quizzes?per_page=100`, ctx);
    return raw
      .filter((q) => typeof q.id === "number")
      .map((q) => ({
        id: String(q.id),
        title: (q.title ?? "").trim() || `Quiz ${q.id}`,
        published: q.published ?? false,
        dueAt: q.due_at ?? null,
        pointsPossible: typeof q.points_possible === "number" ? q.points_possible : null,
      }));
  }
  // Discussion
  const raw = await fetchAll<RawBulkDiscussion>(`${base}/discussion_topics?per_page=100`, ctx);
  return raw
    .filter((d) => typeof d.id === "number" && !d.is_announcement)
    .map((d) => ({
      id: String(d.id),
      title: (d.title ?? "").trim() || `Discussion ${d.id}`,
      published: d.published ?? false,
      dueAt: d.assignment?.due_at ?? null,
      pointsPossible:
        typeof d.assignment?.points_possible === "number" ? d.assignment.points_possible : null,
    }));
}

type BulkResult = { updated: number; failures: Array<{ id: string; error: string }> };

/** Build the update URL + form params for one item of a given kind. */
function bulkUpdateRequest(
  base: string,
  kind: BulkKind,
  id: string,
  fields: { published?: boolean; pointsPossible?: number }
): { url: string; params: URLSearchParams } {
  const params = new URLSearchParams();
  if (kind === "Assignment") {
    if (fields.published !== undefined) params.append("assignment[published]", String(fields.published));
    if (fields.pointsPossible !== undefined) {
      params.append("assignment[points_possible]", String(fields.pointsPossible));
    }
    return { url: `${base}/assignments/${id}`, params };
  }
  if (kind === "Quiz") {
    if (fields.published !== undefined) params.append("quiz[published]", String(fields.published));
    if (fields.pointsPossible !== undefined) {
      params.append("quiz[points_possible]", String(fields.pointsPossible));
    }
    return { url: `${base}/quizzes/${id}`, params };
  }
  if (kind === "Discussion") {
    if (fields.published !== undefined) params.append("published", String(fields.published));
    return { url: `${base}/discussion_topics/${id}`, params };
  }
  // Page (published only)
  if (fields.published !== undefined) params.append("wiki_page[published]", String(fields.published));
  return { url: `${base}/pages/${encodeURIComponent(id)}`, params };
}

/** Apply published and/or points-possible changes to many items of one kind. */
export async function bulkUpdate(
  courseUrl: string,
  kind: BulkKind,
  ids: string[],
  fields: { published?: boolean; pointsPossible?: number },
  code?: string
): Promise<BulkResult> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  let updated = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const id of ids) {
    try {
      const { url, params } = bulkUpdateRequest(base, kind, id, fields);
      if ([...params.keys()].length === 0) continue;
      await writeJson(url, "PUT", ctx, params);
      updated += 1;
    } catch (err) {
      failures.push({ id, error: err instanceof Error ? err.message : "Update failed." });
    }
  }
  return { updated, failures };
}

/** Delete many items of one kind. */
export async function bulkDelete(
  courseUrl: string,
  kind: BulkKind,
  ids: string[],
  code?: string
): Promise<BulkResult> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const path =
    kind === "Assignment"
      ? "assignments"
      : kind === "Quiz"
        ? "quizzes"
        : kind === "Discussion"
          ? "discussion_topics"
          : "pages";
  let updated = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const id of ids) {
    try {
      const ref = kind === "Page" ? encodeURIComponent(id) : id;
      await writeJson(`${base}/${path}/${ref}`, "DELETE", ctx);
      updated += 1;
    } catch (err) {
      failures.push({ id, error: err instanceof Error ? err.message : "Delete failed." });
    }
  }
  return { updated, failures };
}

/** A grading rubric defined in the course (for bulk association). */
export interface CanvasRubric {
  id: number;
  title: string;
}

/** List the course's grading rubrics. */
export async function listRubrics(courseUrl: string, code?: string): Promise<CanvasRubric[]> {
  const ctx = resolveCourse(courseUrl, code);
  const raw = await safeFetchAll<{ id?: number; title?: string }>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/rubrics?per_page=100`,
    ctx
  );
  return raw
    .filter((r) => typeof r.id === "number")
    .map((r) => ({ id: r.id!, title: (r.title ?? "").trim() || `Rubric ${r.id}` }));
}

/** One criterion of a rubric being built: a row with point-tier ratings. */
export interface RubricCriterionInput {
  description: string;
  longDescription?: string;
  points: number;
  ratings: Array<{ description: string; points: number }>;
}

/**
 * Create a new course rubric from criteria + point-tier ratings. When
 * `associateAssignmentId` is given, the rubric is attached to that assignment in
 * the same call (and used for grading), so it shows up in SpeedGrader.
 */
export async function createRubric(
  courseUrl: string,
  input: {
    title: string;
    criteria: RubricCriterionInput[];
    associateAssignmentId?: number;
    useForGrading?: boolean;
  },
  code?: string
): Promise<{ id: number; title: string }> {
  if (!input.title.trim()) throw new Error("A rubric needs a title.");
  if (input.criteria.length === 0) throw new Error("A rubric needs at least one criterion.");
  const ctx = resolveCourse(courseUrl, code);

  const params = new URLSearchParams();
  params.append("rubric[title]", input.title.trim());
  params.append("rubric[free_form_criterion_comments]", "false");
  input.criteria.forEach((c, i) => {
    params.append(`rubric[criteria][${i}][description]`, c.description.trim() || `Criterion ${i + 1}`);
    if (c.longDescription?.trim()) {
      params.append(`rubric[criteria][${i}][long_description]`, c.longDescription.trim());
    }
    params.append(`rubric[criteria][${i}][points]`, String(c.points));
    c.ratings.forEach((r, j) => {
      params.append(`rubric[criteria][${i}][ratings][${j}][description]`, r.description.trim() || `${r.points} pts`);
      params.append(`rubric[criteria][${i}][ratings][${j}][points]`, String(r.points));
    });
  });
  if (typeof input.associateAssignmentId === "number") {
    params.append("rubric_association[association_type]", "Assignment");
    params.append("rubric_association[association_id]", String(input.associateAssignmentId));
    params.append("rubric_association[purpose]", "grading");
    params.append("rubric_association[use_for_grading]", String(input.useForGrading ?? true));
  }

  // The create endpoint wraps the result as { rubric, rubric_association }.
  const data = await writeJson<{ rubric?: { id?: number; title?: string }; id?: number; title?: string }>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/rubrics`,
    "POST",
    ctx,
    params
  );
  const r = data.rubric ?? data;
  if (typeof r.id !== "number") throw new Error("Canvas did not return the new rubric.");
  return { id: r.id, title: (r.title ?? input.title).trim() || input.title.trim() };
}

/** Attach a rubric to many assignments (one rubric_association per assignment). */
export async function bulkAssociateRubric(
  courseUrl: string,
  rubricId: number,
  assignmentIds: string[],
  code?: string
): Promise<BulkResult> {
  const ctx = resolveCourse(courseUrl, code);
  let updated = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const id of assignmentIds) {
    try {
      const params = new URLSearchParams();
      params.append("rubric_association[rubric_id]", String(rubricId));
      params.append("rubric_association[association_type]", "Assignment");
      params.append("rubric_association[association_id]", id);
      params.append("rubric_association[purpose]", "grading");
      params.append("rubric_association[use_for_grading]", "true");
      await writeJson(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/rubric_associations`, "POST", ctx, params);
      updated += 1;
    } catch (err) {
      failures.push({ id, error: err instanceof Error ? err.message : "Could not associate the rubric." });
    }
  }
  return { updated, failures };
}

// ── Quiz questions ────────────────────────────────────────────────────────────
//
// Classic-quiz question editing. Question/answer text is HTML in Canvas; we
// convert to/from plain text for a simple editor (formatting is not preserved).

/** Supported classic-quiz question types this editor can create. */
export type QuizQuestionType =
  | "multiple_choice_question"
  | "true_false_question"
  | "short_answer_question"
  | "essay_question";

/** One answer choice. `correct` maps to Canvas answer_weight 100 (else 0). */
export interface QuizAnswerInput {
  text: string;
  correct: boolean;
}

/** The editable shape of a quiz question. */
export interface QuizQuestionInput {
  name: string;
  text: string;
  type: QuizQuestionType;
  points: number;
  answers: QuizAnswerInput[];
}

/** A quiz question as loaded from Canvas (with its id + position). */
export interface QuizQuestion extends QuizQuestionInput {
  id: number;
  position: number;
}

interface RawQuizQuestion {
  id?: number;
  question_name?: string;
  question_text?: string | null;
  question_type?: string;
  points_possible?: number;
  position?: number;
  answers?: Array<{ text?: string; answer_text?: string; weight?: number }>;
}

const QUIZ_TYPES_WITH_ANSWERS = new Set<QuizQuestionType>([
  "multiple_choice_question",
  "true_false_question",
  "short_answer_question",
]);

function mapQuizQuestion(raw: RawQuizQuestion): QuizQuestion {
  const type = (raw.question_type as QuizQuestionType) ?? "multiple_choice_question";
  return {
    id: raw.id ?? 0,
    name: (raw.question_name ?? "").trim(),
    text: raw.question_text ? htmlToText(raw.question_text) : "",
    type,
    points: typeof raw.points_possible === "number" ? raw.points_possible : 0,
    position: typeof raw.position === "number" ? raw.position : 0,
    answers: (raw.answers ?? []).map((a) => ({
      text: (a.text ?? a.answer_text ?? "").toString(),
      correct: (a.weight ?? 0) >= 100,
    })),
  };
}

function quizQuestionParams(q: QuizQuestionInput): URLSearchParams {
  const params = new URLSearchParams();
  params.append("question[question_name]", q.name.trim() || "Question");
  params.append("question[question_text]", textToHtml(q.text.trim()));
  params.append("question[question_type]", q.type);
  params.append("question[points_possible]", String(Number.isFinite(q.points) ? q.points : 0));
  if (QUIZ_TYPES_WITH_ANSWERS.has(q.type)) {
    q.answers.forEach((a, i) => {
      params.append(`question[answers][${i}][answer_text]`, a.text.trim());
      // Every accepted answer to a fill-in-the-blank is correct; other types use
      // the per-answer correct flag.
      const correct = q.type === "short_answer_question" ? true : a.correct;
      params.append(`question[answers][${i}][answer_weight]`, correct ? "100" : "0");
    });
  }
  return params;
}

/** List a classic quiz's questions, in display order. */
export async function listQuizQuestions(
  courseUrl: string,
  quizId: number,
  code?: string
): Promise<QuizQuestion[]> {
  const ctx = resolveCourse(courseUrl, code);
  const raw = await fetchAll<RawQuizQuestion>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/quizzes/${quizId}/questions?per_page=100`,
    ctx
  );
  return raw
    .filter((q) => typeof q.id === "number")
    .map(mapQuizQuestion)
    .sort((a, b) => a.position - b.position);
}

/** Add a question to a quiz. */
export async function createQuizQuestion(
  courseUrl: string,
  quizId: number,
  question: QuizQuestionInput,
  code?: string
): Promise<QuizQuestion> {
  const ctx = resolveCourse(courseUrl, code);
  const raw = await writeJson<RawQuizQuestion>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/quizzes/${quizId}/questions`,
    "POST",
    ctx,
    quizQuestionParams(question)
  );
  return mapQuizQuestion(raw);
}

/** Update one quiz question. */
export async function updateQuizQuestion(
  courseUrl: string,
  quizId: number,
  questionId: number,
  question: QuizQuestionInput,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  await writeJson(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/quizzes/${quizId}/questions/${questionId}`,
    "PUT",
    ctx,
    quizQuestionParams(question)
  );
}

/** Delete one quiz question. */
export async function deleteQuizQuestion(
  courseUrl: string,
  quizId: number,
  questionId: number,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  await writeJson(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/quizzes/${quizId}/questions/${questionId}`,
    "DELETE",
    ctx
  );
}

/**
 * Apply a batch of due-date changes, one request per item. Continues past
 * individual failures and reports them, so one bad item never blocks the rest.
 */
export async function setDueDates(
  courseUrl: string,
  updates: DueDateUpdate[],
  code?: string
): Promise<{ updated: number; failures: Array<{ contentId: number; error: string }> }> {
  const ctx = resolveCourse(courseUrl, code);
  let updated = 0;
  const failures: Array<{ contentId: number; error: string }> = [];
  for (const update of updates) {
    try {
      await setOneDueDate(ctx, update.type, update.contentId, update.dueAt);
      updated += 1;
    } catch (err) {
      failures.push({
        contentId: update.contentId,
        error: err instanceof Error ? err.message : "Could not set the due date.",
      });
    }
  }
  return { updated, failures };
}

// ── Editing a gradable's detail (title / description / points) ─────────────────

/** Gradable kinds whose title, description, and due date can be edited inline. */
export type GradableKind = "Assignment" | "Quiz" | "Discussion";

/** A gradable's editable detail. Description is HTML; for discussions it is the message body. */
export interface GradableDetail {
  title: string;
  description: string;
}

/** Fetch one assignment/quiz/discussion's title + description for editing. */
export async function getGradable(
  courseUrl: string,
  kind: GradableKind,
  contentId: number,
  code?: string
): Promise<GradableDetail> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const url =
    kind === "Assignment"
      ? `${base}/assignments/${contentId}`
      : kind === "Quiz"
        ? `${base}/quizzes/${contentId}`
        : `${base}/discussion_topics/${contentId}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${ctx.token}` } });
  if (!response.ok) {
    throw canvasError(response.status, ctx.institution);
  }
  const data = (await response.json()) as {
    name?: string;
    title?: string;
    description?: string | null;
    message?: string | null;
  };
  return {
    title: (data.name ?? data.title ?? "").trim(),
    description: (kind === "Discussion" ? data.message : data.description) ?? "",
  };
}

/** Update an assignment/quiz/discussion's title, description, and/or points. */
export async function updateGradable(
  courseUrl: string,
  kind: GradableKind,
  contentId: number,
  fields: { title?: string; description?: string; pointsPossible?: number },
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const params = new URLSearchParams();
  if (kind === "Assignment") {
    if (fields.title !== undefined) params.append("assignment[name]", fields.title);
    if (fields.description !== undefined) params.append("assignment[description]", fields.description);
    if (fields.pointsPossible !== undefined) params.append("assignment[points_possible]", String(fields.pointsPossible));
    if ([...params.keys()].length > 0) await writeJson(`${base}/assignments/${contentId}`, "PUT", ctx, params);
    return;
  }
  if (kind === "Quiz") {
    if (fields.title !== undefined) params.append("quiz[title]", fields.title);
    if (fields.description !== undefined) params.append("quiz[description]", fields.description);
    if (fields.pointsPossible !== undefined) params.append("quiz[points_possible]", String(fields.pointsPossible));
    if ([...params.keys()].length > 0) await writeJson(`${base}/quizzes/${contentId}`, "PUT", ctx, params);
    return;
  }
  // Discussion (message is the body; points live on its assignment and are not edited here)
  if (fields.title !== undefined) params.append("title", fields.title);
  if (fields.description !== undefined) params.append("message", fields.description);
  if ([...params.keys()].length > 0) await writeJson(`${base}/discussion_topics/${contentId}`, "PUT", ctx, params);
}

/**
 * Create a new assignment/quiz/discussion (the target of a "change type"). Made
 * unpublished by default. Returns the new content id. Quizzes ignore points
 * (Canvas computes a classic quiz's total from its questions).
 */
export async function createGradable(
  courseUrl: string,
  kind: GradableKind,
  fields: { title: string; description?: string; pointsPossible?: number; dueAt?: string | null },
  code?: string
): Promise<{ id: number }> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const params = new URLSearchParams();
  const due = fields.dueAt ?? "";

  if (kind === "Assignment") {
    params.append("assignment[name]", fields.title);
    if (fields.description !== undefined) params.append("assignment[description]", fields.description);
    if (fields.pointsPossible !== undefined) params.append("assignment[points_possible]", String(fields.pointsPossible));
    if (due) params.append("assignment[due_at]", due);
    params.append("assignment[submission_types][]", "online_text_entry");
    params.append("assignment[published]", "false");
    const data = await writeJson<{ id?: number }>(`${base}/assignments`, "POST", ctx, params);
    if (typeof data.id !== "number") throw new Error("Canvas did not return the new assignment id.");
    return { id: data.id };
  }
  if (kind === "Quiz") {
    params.append("quiz[title]", fields.title);
    if (fields.description !== undefined) params.append("quiz[description]", fields.description);
    if (due) params.append("quiz[due_at]", due);
    params.append("quiz[quiz_type]", "assignment");
    params.append("quiz[published]", "false");
    const data = await writeJson<{ id?: number }>(`${base}/quizzes`, "POST", ctx, params);
    if (typeof data.id !== "number") throw new Error("Canvas did not return the new quiz id.");
    return { id: data.id };
  }
  // Discussion (graded so it shares the assignment fields)
  params.append("title", fields.title);
  if (fields.description !== undefined) params.append("message", fields.description);
  params.append("published", "false");
  if (fields.pointsPossible !== undefined) params.append("assignment[points_possible]", String(fields.pointsPossible));
  if (due) params.append("assignment[due_at]", due);
  const data = await writeJson<{ id?: number }>(`${base}/discussion_topics`, "POST", ctx, params);
  if (typeof data.id !== "number") throw new Error("Canvas did not return the new discussion id.");
  return { id: data.id };
}

// ── File preview ──────────────────────────────────────────────────────────────

const PREVIEW_MAX_BYTES = 15 * 1024 * 1024;
const PREVIEW_TEXT_CHARS = 50000;

/** A previewable view of a Canvas file: base64 for image/PDF, else extracted text. */
export interface FilePreview {
  name: string;
  mimeType: string;
  /** base64 of the bytes for image/PDF rendering; empty for text-only previews. */
  base64: string;
  /** Extracted text for non-image/PDF files (or an explanatory message). */
  text: string;
  truncated: boolean;
}

/** Fetch a Canvas file by id and return a previewable view of its contents. */
export async function getFilePreview(
  courseUrl: string,
  fileId: number,
  code?: string
): Promise<FilePreview> {
  const ctx = resolveCourse(courseUrl, code);
  const metaResponse = await fetch(`${ctx.baseUrl}/api/v1/files/${fileId}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (!metaResponse.ok) {
    throw canvasError(metaResponse.status, ctx.institution);
  }
  const meta = (await metaResponse.json()) as {
    display_name?: string;
    filename?: string;
    url?: string;
    "content-type"?: string;
    size?: number;
  };
  const name = (meta.display_name ?? meta.filename ?? `File ${fileId}`).trim() || `File ${fileId}`;
  const mimeType = meta["content-type"] ?? "application/octet-stream";

  if (!meta.url) {
    return { name, mimeType, base64: "", text: "Canvas did not return a download URL for this file.", truncated: false };
  }
  if (typeof meta.size === "number" && meta.size > PREVIEW_MAX_BYTES) {
    return { name, mimeType, base64: "", text: "This file is too large to preview here. Open it in Canvas.", truncated: false };
  }

  const fileResponse = await fetch(meta.url, { headers: { Authorization: `Bearer ${ctx.token}` } });
  if (!fileResponse.ok) {
    throw canvasError(fileResponse.status, ctx.institution);
  }
  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  if (buffer.byteLength > PREVIEW_MAX_BYTES) {
    return { name, mimeType, base64: "", text: "This file is too large to preview here.", truncated: false };
  }

  // Images and PDFs render from their bytes; everything else shows extracted text.
  if (mimeType.startsWith("image/") || mimeType === "application/pdf") {
    return { name, mimeType, base64: buffer.toString("base64"), text: "", truncated: false };
  }

  let text = (await extractTextFromBuffer(name, buffer)) ?? "";
  let truncated = false;
  if (!text) {
    text = "No text preview is available for this file type. Open it in Canvas to view it.";
  } else if (text.length > PREVIEW_TEXT_CHARS) {
    text = text.slice(0, PREVIEW_TEXT_CHARS);
    truncated = true;
  }
  return { name, mimeType, base64: "", text, truncated };
}

// ── Editing Office files (.docx / .pptx) in place ─────────────────────────────

interface CanvasFileMeta {
  name: string;
  filename: string;
  url: string;
  contentType: string;
  folderId: number | null;
  kind: OfficeKind | null;
}

/** Fetch a Canvas file's metadata + bytes, classifying it as docx/pptx if it is. */
async function fetchCanvasFile(
  ctx: { baseUrl: string; token: string; institution: CanvasInstitution },
  fileId: number
): Promise<{ meta: CanvasFileMeta; buffer: Buffer }> {
  const metaResponse = await fetch(`${ctx.baseUrl}/api/v1/files/${fileId}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (!metaResponse.ok) {
    throw canvasError(metaResponse.status, ctx.institution);
  }
  const raw = (await metaResponse.json()) as {
    display_name?: string;
    filename?: string;
    url?: string;
    "content-type"?: string;
    folder_id?: number | null;
    size?: number;
  };
  const name = (raw.display_name ?? raw.filename ?? `File ${fileId}`).trim() || `File ${fileId}`;
  const filename = (raw.filename ?? raw.display_name ?? name).trim();
  const lower = (raw.filename ?? raw.display_name ?? "").toLowerCase();
  const kind: OfficeKind | null = lower.endsWith(".docx") ? "docx" : lower.endsWith(".pptx") ? "pptx" : null;
  if (!raw.url) throw new Error("Canvas did not return a download URL for this file.");
  if (typeof raw.size === "number" && raw.size > PREVIEW_MAX_BYTES) {
    throw new Error("This file is too large to edit here.");
  }

  const fileResponse = await fetch(raw.url, { headers: { Authorization: `Bearer ${ctx.token}` } });
  if (!fileResponse.ok) {
    throw canvasError(fileResponse.status, ctx.institution);
  }
  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  if (buffer.byteLength > PREVIEW_MAX_BYTES) {
    throw new Error("This file is too large to edit here.");
  }
  return {
    meta: { name, filename, url: raw.url, contentType: raw["content-type"] ?? "application/octet-stream", folderId: raw.folder_id ?? null, kind },
    buffer,
  };
}

/** Load a docx/pptx file's editable paragraphs. */
export async function getOfficeEditable(
  courseUrl: string,
  fileId: number,
  code?: string
): Promise<{ name: string; kind: OfficeKind; paragraphs: OfficeParagraph[] }> {
  const ctx = resolveCourse(courseUrl, code);
  const { meta, buffer } = await fetchCanvasFile(ctx, fileId);
  if (!meta.kind) {
    throw new Error("Only Word (.docx) and PowerPoint (.pptx) files can be edited here.");
  }
  const paragraphs = await parseOfficeParagraphs(meta.kind, buffer);
  return { name: meta.name, kind: meta.kind, paragraphs };
}

/** Re-upload a file's bytes to its folder, overwriting the existing file by name. */
async function overwriteCanvasFile(
  ctx: { baseUrl: string; token: string; institution: CanvasInstitution; courseId: string },
  meta: CanvasFileMeta,
  buffer: Buffer
): Promise<void> {
  const params = new URLSearchParams();
  params.append("name", meta.filename);
  if (meta.folderId != null) params.append("parent_folder_id", String(meta.folderId));
  params.append("content_type", meta.contentType);
  params.append("on_duplicate", "overwrite");
  params.append("size", String(buffer.byteLength));

  const presign = await fetch(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!presign.ok) {
    throw canvasError(presign.status, ctx.institution);
  }
  const ticket = (await presign.json()) as { upload_url?: string; upload_params?: Record<string, string> };
  if (!ticket.upload_url || !ticket.upload_params) {
    throw new Error("Canvas did not return an upload URL.");
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.upload_params)) form.append(key, value);
  form.append("file", new Blob([new Uint8Array(buffer)], { type: meta.contentType }), meta.filename);
  const upload = await fetch(ticket.upload_url, { method: "POST", body: form });
  if (!upload.ok) {
    throw new Error(`Saving to Canvas failed (HTTP ${upload.status}).`);
  }
}

/** Apply paragraph edits to a docx/pptx file and overwrite it in Canvas. */
export async function saveOfficeEdits(
  courseUrl: string,
  fileId: number,
  edits: Record<string, string>,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  const { meta, buffer } = await fetchCanvasFile(ctx, fileId);
  if (!meta.kind) {
    throw new Error("Only Word (.docx) and PowerPoint (.pptx) files can be edited here.");
  }
  const edited = await applyOfficeEdits(meta.kind, buffer, edits);
  await overwriteCanvasFile({ ...ctx, courseId: ctx.courseId }, meta, edited);
}
