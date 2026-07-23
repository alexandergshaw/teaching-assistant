import { canvasError, resolveCourse } from "../canvas-core";
import { fetchAll, writeJson } from "./fetch-helpers";
import { mapPageSummary, mapPage } from "./mappers";
import type { CanvasPage, CanvasPageSummary } from "./types";
import type { RawPage } from "./raw-types";

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

/**
 * Escape a code file's text and wrap it as an HTML code block for a Canvas page.
 * Pure so it can be unit-tested. The file path becomes a heading; the body is a
 * single <pre><code> block with all HTML-special characters escaped so the code
 * renders literally and cannot inject markup.
 */
export function codeFileToPageHtml(filePath: string, content: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  return `<h2>${escape(filePath)}</h2>\n<pre><code>${escape(content)}</code></pre>`;
}

/**
 * Create a Canvas page whose body is a GitHub code file rendered as a code
 * block. Returns the created page plus a direct link to view it in Canvas.
 */
export async function createCodeFilePage(
  courseUrl: string,
  opts: { filePath: string; content: string; title: string; published?: boolean },
  code?: string
): Promise<{ page: CanvasPage; htmlUrl: string }> {
  const ctx = resolveCourse(courseUrl, code);
  const page = await createPage(
    courseUrl,
    {
      title: opts.title,
      body: codeFileToPageHtml(opts.filePath, opts.content),
      published: opts.published ?? false,
    },
    code
  );
  return { page, htmlUrl: `${ctx.baseUrl}/courses/${ctx.courseId}/pages/${page.url}` };
}
