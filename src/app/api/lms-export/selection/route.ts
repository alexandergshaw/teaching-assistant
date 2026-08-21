// POST /api/lms-export/selection - docs/lms-selection-export-download-
// acceptance-criteria.md. Builds a downloadable archive (.imscc or .zip) of
// exactly the selected modules/items, re-reading the module tree itself
// rather than trusting the client's (AC2), the same shape
// src/app/api/lms-generation/deck/route.ts uses: `runtime = "nodejs"`, an
// explicit `maxDuration` that asks for more than Hobby's real ceiling and
// documents that it will not get it, and requireOwner() for auth. This is
// also the only place in the app that can call getCanvasFileBuffer
// (office-accessibility.ts:126, the sole real file-bytes function this repo
// has) - its other existing caller is also a route handler
// (api/accessibility/route.ts).
//
// WIRE CONTRACT (fixed - shared with the client half building against it):
//   POST body: { courseUrl, courseId?, acronym?, courseName, format: "imscc"|"zip",
//                source: "live"|"export", itemKeys: string[], moduleKeys: string[] }
//   Success: 200, archive bytes, headers Content-Type (application/zip for a
//     .zip, application/vnd.ims.imsccv1p1 for a .imscc - FINDING 8 fix, see
//     the header assembly below), Content-Disposition (attachment filename),
//     X-Archive-Included, X-Archive-Omitted.
//   Failure: 4xx/5xx, JSON { error }. A planner refusal (item cap, or an
//     export+imscc selection - see selection-archive.ts) is 400 with the
//     planner's own message.
//
// courseId IDENTIFIES AN EXPORT SELECTION; courseUrl IDENTIFIES A LIVE ONE
// (regression pass fix, docs/REGRESSION.md entry 274, FINDING 1). This route
// used to require a non-empty `courseUrl` unconditionally, before `source`
// was ever consulted - but an export-sourced selection has no Canvas URL at
// all (ContentTab.tsx sends ""), so every export request was refused before
// touching anything else, making the entire `source === "export"` branch
// below unreachable dead code. `courseId` (a course_hub row id) is what an
// export selection actually needs, resolved via readExportCourseContentById
// (lms-export-source) - the same owner-scoped-by-user_id lookup ContentTab
// itself already uses to load an export-only course. See the per-source
// validation in POST below.
//
// STREAMING - what actually streams and what does not. jszip can emit a
// Node stream as it compresses (`generateNodeStream`), so the .zip path
// genuinely never holds the whole archive in memory before the first byte
// leaves this function - see selection-archive-build.ts's own header
// comment. The .imscc path cannot: buildCommonCartridge (common-cartridge.ts,
// out of scope for this feature to edit) always fully materializes a Blob
// via `zip.generateAsync({type:"blob"})` with no streaming output of its
// own - and selection-archive-build.ts's own buildSelectionArchive does NOT
// hand that Blob to `Response` as-is. It re-opens it (`await
// cartridgeBlob.arrayBuffer()`, then `JSZip.loadAsync`) to inject
// manifest.txt, then re-serializes with a SECOND `generateAsync({type:
// "blob"})` (selection-archive-build.ts:261-264) - three further full
// in-memory materializations beyond buildCommonCartridge's own Blob.
// (Regression pass FINDING 5: an earlier version of this comment claimed
// that Blob "is still handed to Response directly (never re-buffered into a
// second in-memory copy)", which understated this by three copies - checked
// directly against selection-archive-build.ts rather than trusted.) Only the
// FINAL Blob produced above is handed to `Response` directly, so the HTTP
// RESPONSE layer adds no further (fifth) copy on top of it - but the .imscc
// path as a whole is fully buffered end to end, not the partial streaming
// win the prior comment described; genuine .imscc streaming would require
// editing common-cartridge.ts itself.
//
// BOUNDED CONCURRENCY, NOT createThrottleBudget. AC5 names
// `createThrottleBudget` (canvas-throttle.ts) as "the bounded-concurrency
// helper the Canvas bulk paths already use" - verified against the actual
// code (canvas-throttle.ts, canvas-modules/bulk.ts) rather than trusted, and
// that description does not hold. createThrottleBudget produces a shared
// SLEEP budget consumed by fetchWithThrottleRetry's retry backoff; every one
// of its existing callers (bulkUpdate/bulkDelete, canvas-modules/bulk.ts) is
// a plain sequential `for` loop - concurrency 1, not a worker pool. None of
// the fetch functions this route calls (getPageAction, fetchCanvasMetaAction,
// getCanvasFileBuffer, listQuizQuestions) accept an injectable retry budget
// at all, so there is no mechanical hook to thread one through even if this
// route wanted to. mapWithConcurrency below is the actual "bounded, never an
// unbounded Promise.all" mechanism AC5 asks for: a fixed-size worker pool
// pulling from a shared queue.
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveLmsCourseRowAction } from "@/app/actions/lms-syllabus-buttons";
import { normalizeCanvasAcronymInput } from "@/lib/course-canvas-url-match";
import { listCourseContentAction } from "@/app/actions/canvas-modules";
import { getPageAction } from "@/app/actions/canvas-files-bulk";
import { fetchCanvasMetaAction } from "@/app/actions/grading";
import {
  getCanvasFileBuffer,
  listQuizQuestions,
  type CanvasModule,
  type CanvasModuleItem,
  type QuizQuestion,
} from "@/lib/canvas-modules";
import { readExportCourseContentById } from "@/lib/lms-export-source";
import type { CartridgeModule, CartridgeModuleItem } from "@/lib/cartridge-import";
import { moduleItemContentUrl } from "@/lib/canvas-url";
import {
  expandModuleSelection,
  type LiveSelectedItem,
  type ExportSelectedItem,
  type SelectedMaterialItem,
} from "@/lib/lms-generation/materials";
import { parseItemKey } from "@/app/components/content-tab/utils";
import {
  planSelectionArchive,
  archiveFileName,
  type ArchiveFormat,
  type SelectionArchiveEntry,
  type SelectionArchiveEntryContent,
} from "@/lib/lms-generation/selection-archive";
import { buildSelectionArchive, ARCHIVE_CAPS } from "@/lib/lms-generation/selection-archive-build";

// See api/accessibility/route.ts and api/lms-generation/deck/route.ts's own,
// identical comments: requesting more than Hobby's 60s ceiling does not
// grant it - the platform still kills the function at 60s regardless of what
// this asks for. Documented, not silently accepted, so a future re-read of
// this file does not mistake the number for a real budget.
export const runtime = "nodejs";
export const maxDuration = 300;

// Bounded worker pool: at most `limit` calls to `worker` are ever in flight
// at once. See this file's header comment for why createThrottleBudget is
// not the mechanism here.
async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// Sized against ARCHIVE_CAPS.maxItems (selection-archive-build.ts, which
// imports the one shared SELECTION_ARCHIVE_MAX_ITEMS - selection-archive.ts
// - rather than declaring its own number; see that constant's own comment):
// 150 items at 6-way concurrency is 25 sequential rounds, comfortably inside
// the 60-second Hobby ceiling at typical Canvas latency, with margin left
// for zip/cartridge assembly.
const FETCH_CONCURRENCY = 6;

// ---------------------------------------------------------------------------
// Content fetch (impure - the only network-touching code in this route)
// ---------------------------------------------------------------------------

function unavailable(reason: string): SelectionArchiveEntryContent {
  return { kind: "unavailable", reason };
}

// archiveFileName's own sanitizeFilenamePart (artifact-download.ts) strips
// Windows-illegal punctuation and control characters but does NOT strip
// non-ASCII text (an accented or non-Latin course name survives it
// unchanged) - a bare `filename="<raw utf-8 bytes>"` is outside what HTTP
// header field values are strictly defined over. The client half
// (useSelectionDownload.ts's parseContentDispositionFilename) already parses
// BOTH the RFC 5987 `filename*=UTF-8''<percent-encoded>` form and the plain
// quoted form, preferring the former - so this emits both: an ASCII-safe
// fallback for any parser that only reads the plain form, and the exact,
// unmangled name via the extended form for one that reads it.
function contentDispositionHeader(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Best-effort content for a type/situation this route has no richer fetch
// path for (SubHeader, ExternalUrl, ExternalTool, or a live item with no
// resolvable content id) - NOT a fetch failure (nothing was attempted, so
// nothing is "unavailable"), just this item's own already-known metadata
// rendered as a small page. AC3's stronger promise ("content, not titles")
// is delivered for Page/File/Assignment/Discussion/Quiz below.
function syntheticHtml(title: string, type: string, detail?: string): string {
  const lines = [`<h1>${escapeHtml(title)}</h1>`, `<p><em>${escapeHtml(type || "item")}</em></p>`];
  if (detail) lines.push(`<p>${escapeHtml(detail)}</p>`);
  return lines.join("\n");
}

const EXTENSION_MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
};

// CanvasModuleItem carries no contentType/mimeType field at all (only
// title/type/contentId - see canvas-modules/types.ts) and getCanvasFileBuffer
// returns a bare Buffer with no metadata alongside it, so this is a best
// effort from the item's own title (which Canvas populates from the file's
// original name for File-type module items). Never load-bearing: nothing
// downstream (the .zip folder, buildCommonCartridge's web_resources/ slot)
// actually branches on this value - it only rides along on the archive entry.
function guessMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_MIME_TYPES[ext] ?? "application/octet-stream";
}

function renderQuizHtml(title: string, questions: QuizQuestion[]): string {
  if (questions.length === 0) return syntheticHtml(title, "Quiz", "This quiz has no questions.");
  const items = questions
    .map((q, i) => `<li><strong>${escapeHtml(q.name || `Question ${i + 1}`)}</strong><div>${q.text}</div></li>`)
    .join("\n");
  return `<h1>${escapeHtml(title)}</h1>\n<ol>${items}</ol>`;
}

interface LiveFetchContext {
  courseUrl: string;
  acronym?: string;
}

/**
 * Real content for one LIVE item (AC3): Page -> its body, File -> its real
 * bytes via getCanvasFileBuffer (recorded into `binaryPayloads` - see
 * selection-archive-build.ts's own header comment for why the plan itself
 * never carries the actual buffer), Assignment/Discussion -> their
 * description (moduleItemContentUrl only resolves those two types plus a
 * discussion-shaped htmlUrl - verified against canvas-url.ts), Quiz -> its
 * questions. Everything else renders a best-effort synthetic stub (see
 * syntheticHtml above) - not a failure, this app simply has no fetch path
 * for a SubHeader/ExternalUrl/ExternalTool's "content". Fails forward
 * (AC6): any thrown/returned error becomes an "unavailable" omission, never
 * an aborted archive.
 */
async function fetchLiveContent(
  item: CanvasModuleItem,
  ctx: LiveFetchContext,
  key: string,
  binaryPayloads: Map<string, Buffer>
): Promise<SelectionArchiveEntryContent> {
  try {
    if (item.type === "Page" && item.pageUrl) {
      const res = await getPageAction(ctx.courseUrl, item.pageUrl, ctx.acronym);
      if ("error" in res) return unavailable(res.error);
      return { kind: "html", html: res.page.body };
    }

    if (item.type === "File" && item.contentId !== null) {
      const buffer = await getCanvasFileBuffer(ctx.courseUrl, item.contentId, ctx.acronym);
      binaryPayloads.set(key, buffer);
      return { kind: "binary", bytes: buffer.byteLength, mimeType: guessMimeType(item.title), fileName: item.title };
    }

    const contentUrl = moduleItemContentUrl(ctx.courseUrl, item.type, item.contentId, item.htmlUrl);
    if (contentUrl) {
      const meta = await fetchCanvasMetaAction(contentUrl);
      if ("error" in meta) return unavailable(meta.error);
      return { kind: "html", html: meta.description || syntheticHtml(item.title, item.type) };
    }

    if (item.type === "Quiz" && item.contentId !== null) {
      const questions = await listQuizQuestions(ctx.courseUrl, item.contentId, ctx.acronym);
      return { kind: "html", html: renderQuizHtml(item.title, questions) };
    }

    return { kind: "html", html: syntheticHtml(item.title, item.type) };
  } catch (err) {
    return unavailable(err instanceof Error ? err.message : "Could not fetch this item.");
  }
}

/** Real content for one EXPORT item: its already-parsed body (AC12 - tag-
 * stripped and truncated when the export was first parsed) when present,
 * else a synthetic stub. Never fails - no network access at all, matching
 * gatherExportItem's identical posture (materials.ts). */
function fetchExportContent(item: CartridgeModuleItem): SelectionArchiveEntryContent {
  const body = item.body?.trim();
  return { kind: "html", html: body ? body : syntheticHtml(item.title, item.type) };
}

// A selected key that no longer matches anything in the FRESH tree (deleted
// or moved between selection and download) - AC4 ("nothing is silently
// dropped, ever") applies here too: rather than quietly excluding it, it
// becomes its own omitted entry with a reason, the same as any other
// fetch failure. Module-key expansion (expandModuleSelection, materials.ts,
// a fixed shared function this route does not own) already has its own
// established "an unmatched key simply contributes no items" precedent (see
// that function's own header comment) - this route does not attempt to
// retrofit AC4 accounting onto that shared, already-tested behavior; it only
// closes the gap for the individual item-key resolution it does itself.
function notFoundEntry(rawKey: string, source: "live" | "export", moduleId: string, moduleLabel: string): SelectionArchiveEntry {
  return {
    key: rawKey,
    title: rawKey,
    type: "Unknown",
    source,
    moduleId,
    moduleLabel,
    content: unavailable("it is no longer present in the current course content - it may have moved or been deleted since it was selected"),
  };
}

// ---------------------------------------------------------------------------
// Request body
// ---------------------------------------------------------------------------

interface SelectionArchiveRequestBody {
  courseUrl?: string;
  /** An export selection's course_hub row id (FINDING 1 fix - see this
   * file's header comment). Ignored for a live selection, which is
   * identified by courseUrl instead. */
  courseId?: string;
  acronym?: string;
  courseName?: string;
  format?: string;
  source?: string;
  itemKeys?: string[];
  moduleKeys?: string[];
}

export async function POST(req: NextRequest) {
  try {
    await requireOwner();
    const body = (await req.json()) as SelectionArchiveRequestBody;

    const courseUrl = (body.courseUrl ?? "").trim();
    const courseId = (body.courseId ?? "").trim();
    const courseName = (body.courseName ?? "").trim();
    // DEFECT 3 (M14 review): `body.acronym` is UNVALIDATED JSON - normalize
    // it at this boundary (whitespace-only collapses to `undefined`) the
    // same way deck/route.ts now does, matching findCourseForCanvasUrl's own
    // internal normalization (course-canvas-url-match.ts) so this request
    // path can never disagree with a direct unit call about what counts as
    // "no acronym".
    const acronym = normalizeCanvasAcronymInput(body.acronym);
    const format = body.format;
    const source = body.source;
    const itemKeys = body.itemKeys ?? [];
    const moduleKeys = body.moduleKeys ?? [];

    if (format !== "imscc" && format !== "zip") {
      return NextResponse.json({ error: 'format must be "imscc" or "zip".' }, { status: 400 });
    }
    if (source !== "live" && source !== "export") {
      return NextResponse.json({ error: 'source must be "live" or "export".' }, { status: 400 });
    }
    // FINDING 1 fix: each source validates only the identifier it actually
    // needs, rather than both unconditionally requiring courseUrl the way
    // this route used to (which refused every export request here before
    // `source` was ever consulted). A live selection is identified by its
    // Canvas course URL; an export selection by its course_hub row id.
    if (source === "live" && !courseUrl) {
      return NextResponse.json({ error: "A course is required." }, { status: 400 });
    }
    if (source === "export" && !courseId) {
      return NextResponse.json({ error: "A course is required." }, { status: 400 });
    }
    if (!courseName) return NextResponse.json({ error: "A course name is required." }, { status: 400 });
    if (itemKeys.length === 0 && moduleKeys.length === 0) {
      return NextResponse.json({ error: "Select at least one item or module to download." }, { status: 400 });
    }

    const entries: SelectionArchiveEntry[] = [];
    const binaryPayloads = new Map<string, Buffer>();

    if (source === "live") {
      // M12 (docs/module-intro-video-script-acceptance-criteria.md, finding
      // 15): `acronym` (already normalized above, DEFECT 3) is threaded here
      // too so a host-less `courseUrl` (the shape CoursePicker.tsx/LmsCell.tsx
      // actually emit) still resolves to the right row instead of colliding
      // with another institution's course sharing the same numeric id
      // (course-canvas-url-match.ts's own doc comment).
      const resolvedCourse = await resolveLmsCourseRowAction(courseUrl, acronym);
      if ("error" in resolvedCourse) return NextResponse.json({ error: resolvedCourse.error }, { status: 400 });
      const course = resolvedCourse.course;
      // Prefer the resolved course row's own saved institution over whatever
      // the client sent - the fresh-tree-not-the-client's-word rule (AC2)
      // applies to credentials too, matching the deck route's identical
      // precedent (LIVE_FETCHERS there is wired off `course.institution`, not
      // the request body). Falls back to the client's (normalized) value only
      // if the saved course row genuinely has none.
      const contentAcronym = normalizeCanvasAcronymInput(course.institution) ?? acronym;

      // AC2: re-read the module tree SERVER-SIDE, the way the deck route
      // does - never trust a client-resolved item.
      const content = await listCourseContentAction(course.canvasUrl ?? "", contentAcronym);
      if ("error" in content) return NextResponse.json({ error: content.error }, { status: 400 });

      const liveIndex = new Map<string, { mod: CanvasModule; item: CanvasModuleItem }>();
      const liveModuleLabel = new Map<number, string>();
      for (const mod of content.modules) {
        liveModuleLabel.set(mod.id, mod.name);
        for (const item of mod.items) liveIndex.set(`live:${mod.id}:${item.id}`, { mod, item });
      }

      const loose: LiveSelectedItem[] = [];
      for (const rawKey of itemKeys) {
        const parsed = parseItemKey(rawKey);
        if (!parsed || parsed.source !== "live") continue; // not this branch's key shape - a client bug, not a real live selection
        const found = liveIndex.get(rawKey);
        if (!found) {
          entries.push(notFoundEntry(rawKey, "live", parsed.moduleRef, liveModuleLabel.get(Number(parsed.moduleRef)) ?? parsed.moduleRef));
          continue;
        }
        loose.push({ source: "live", key: rawKey, moduleId: found.mod.id, item: found.item });
      }

      // expandModuleSelection (materials.ts, pure/DI - AC2's own reuse
      // survey) merges whole-module selections in, deduped by its own
      // `seenKeys` guard so an item both loose-selected and inside a
      // selected module never appears twice.
      const resolved = expandModuleSelection<SelectedMaterialItem>(loose, moduleKeys, content.modules) as LiveSelectedItem[];

      // AC5: the item-count cap is enforced client-side before the request,
      // but a stale/oversized request still refuses cleanly here - skip the
      // real Canvas fetch entirely when the archive is going to be refused
      // for its count regardless (planSelectionArchive's own cap check runs
      // before it ever looks at an entry's content, so a placeholder is
      // enough to produce its authoritative refusal message without
      // spending a single wasted round trip).
      const skipFetch = entries.length + resolved.length > ARCHIVE_CAPS.maxItems;

      const fetched = skipFetch
        ? resolved.map((sel) => ({
            key: sel.key,
            title: sel.item.title,
            type: sel.item.type,
            source: "live" as const,
            moduleId: String(sel.moduleId),
            moduleLabel: liveModuleLabel.get(sel.moduleId) ?? String(sel.moduleId),
            content: unavailable("not fetched - this archive was refused before assembly"),
          }))
        : await mapWithConcurrency(resolved, FETCH_CONCURRENCY, async (sel) => ({
            key: sel.key,
            title: sel.item.title,
            type: sel.item.type,
            source: "live" as const,
            moduleId: String(sel.moduleId),
            moduleLabel: liveModuleLabel.get(sel.moduleId) ?? String(sel.moduleId),
            content: await fetchLiveContent(sel.item, { courseUrl: course.canvasUrl ?? "", acronym: contentAcronym }, sel.key, binaryPayloads),
          }));
      entries.push(...fetched);
    } else {
      // AC2/AC12: the export counterpart of the fresh-tree re-read -
      // readExportCourseContentById downloads + parses the course's newest
      // stored export server-side (lms-export-source), never trusting
      // whatever tree the client had already parsed for display. Looked up
      // by courseId (the course_hub row id), NOT courseUrl - an export
      // selection has no Canvas URL at all (FINDING 1 fix; see this file's
      // header comment).
      //
      // Owner-scoped exactly as the rest of this route (auth boundary
      // check): readExportCourseContentById calls listCourseHubAction()
      // internally, which itself calls requireOwner() and lists only the
      // SIGNED-IN caller's own course_hub rows (course-hub-core.ts:
      // `listCourseHubRows(user.id)`) before matching `courseId` against
      // that list. A client-supplied courseId for a course this caller does
      // not own is therefore simply absent from the list it searches and
      // produces the same "Could not find that saved course." error a
      // garbage id would - never another owner's export content. This is in
      // addition to, not instead of, this route's own top-level
      // requireOwner() call above.
      const supabase = createServiceClient();
      const content = await readExportCourseContentById(supabase, courseId);
      if ("error" in content) return NextResponse.json({ error: content.error }, { status: 400 });

      const exportIndex = new Map<string, { mod: CartridgeModule; item: CartridgeModuleItem }>();
      const exportModuleLabel = new Map<string, string>();
      for (const mod of content.modules) {
        if (!mod.identifier) continue;
        exportModuleLabel.set(mod.identifier, mod.name);
        for (const item of mod.items) {
          if (!item.identifier) continue;
          exportIndex.set(`export:${mod.identifier}:${item.identifier}`, { mod, item });
        }
      }

      const loose: ExportSelectedItem[] = [];
      for (const rawKey of itemKeys) {
        const parsed = parseItemKey(rawKey);
        if (!parsed || parsed.source !== "export") continue;
        const found = exportIndex.get(rawKey);
        if (!found) {
          entries.push(notFoundEntry(rawKey, "export", parsed.moduleRef, exportModuleLabel.get(parsed.moduleRef) ?? parsed.moduleRef));
          continue;
        }
        loose.push({ source: "export", key: rawKey, moduleRef: found.mod.identifier as string, item: found.item });
      }

      const resolved = expandModuleSelection<SelectedMaterialItem>(loose, moduleKeys, [], content.modules) as ExportSelectedItem[];

      // fetchExportContent is synchronous and network-free (AC12 - it only
      // reads a field already resolved by readExportCourseContentById above), so
      // there is no wasted round trip to avoid here the way there is for
      // live Canvas reads - planSelectionArchive's own refusal checks (item
      // count, and format:"imscc" with any export-sourced entry) fire
      // correctly off these entries regardless of their content.
      for (const sel of resolved) {
        entries.push({
          key: sel.key,
          title: sel.item.title,
          type: sel.item.type,
          source: "export",
          moduleId: sel.moduleRef,
          moduleLabel: exportModuleLabel.get(sel.moduleRef) ?? sel.moduleRef,
          content: fetchExportContent(sel.item),
        });
      }
    }

    const plan = planSelectionArchive(entries, format as ArchiveFormat, ARCHIVE_CAPS);
    if ("error" in plan) return NextResponse.json({ error: plan.error }, { status: 400 });

    const archive = await buildSelectionArchive(plan, format as ArchiveFormat, courseName, binaryPayloads);
    const filename = archiveFileName(courseName, format as ArchiveFormat, new Date());
    // FINDING 8 fix: a .imscc IS a zip on disk, so "application/zip" for it
    // was not BROKEN, but it is not the accurate type either. IMS's own
    // registered Common Cartridge v1.1 media type names the format
    // precisely (matching the imsccv1p1 namespace buildCommonCartridge's own
    // manifest already writes - see cartridge-import-stamp.test.ts's fixture
    // manifest); a plain .zip keeps the generic type it always had.
    const contentType = format === "imscc" ? "application/vnd.ims.imsccv1p1" : "application/zip";
    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Disposition": contentDispositionHeader(filename),
      "X-Archive-Included": String(plan.included.length),
      "X-Archive-Omitted": String(plan.omitted.length),
    });

    if (archive.kind === "stream") {
      // Node Readable -> Web ReadableStream, the conversion this route's own
      // header comment documents as the genuinely new mechanism this feature
      // introduces (nothing in src/app/api/** streams today). jszip's
      // generateNodeStream returns a real Node Readable (backed by the
      // `readable-stream` package, which implements the same interface
      // Node's own `stream.Readable.toWeb` expects) - cast through
      // `unknown` only because jszip's own .d.ts types the return as the
      // narrower `NodeJS.ReadableStream` interface rather than the concrete
      // `stream.Readable` class `toWeb` is typed against.
      const webStream = Readable.toWeb(archive.stream as unknown as Readable) as ReadableStream<Uint8Array>;
      return new Response(webStream, { status: 200, headers });
    }

    headers.set("Content-Length", String(archive.blob.size));
    return new Response(archive.blob, { status: 200, headers });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not build the archive." }, { status: 500 });
  }
}
