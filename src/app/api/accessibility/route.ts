import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/supabase/auth";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import {
  listAccessibilityItems,
  getAccessibilityItem,
  listScannableFiles,
  getOfficeFileScan,
  getCanvasFileBuffer,
  getLinkValidation,
  startLinkValidation,
} from "@/lib/canvas-modules";
import { scanHtml } from "@/lib/accessibility/engine";
import { scanPdf } from "@/lib/accessibility/pdf";
import { countsOf, type AccessibleItemType, type Issue, type ItemScan } from "@/lib/accessibility/types";
import { getCachedScans, upsertScans, deleteScans } from "@/lib/supabase/accessibility";

// Long-running accessibility scans live in a route handler (not server actions),
// because Next serializes server actions — a slow scan there would block the
// course-content fetches and make the LMS tabs hang. Route handlers run
// concurrently, so scanning never blocks browsing.
export const runtime = "nodejs";
export const maxDuration = 300;

function toItemScan(
  item: { type: AccessibleItemType; id: string; title: string; fingerprint: string },
  issues: Issue[]
): ItemScan {
  const { errorCount, warningCount, suggestionCount } = countsOf(issues);
  return { ...item, errorCount, warningCount, suggestionCount, issues };
}

function officeImageIssues(images: { id: string; name: string; alt: string }[]): Issue[] {
  return images
    .filter((im) => !im.alt.trim())
    .map((im) => ({
      ruleId: "office-image-alt",
      severity: "warning" as const,
      message: `Image "${im.name}" has no alt text.`,
      wcag: "1.1.1",
      help: "Add alt text describing the image's content or purpose.",
      locator: { selector: im.id, snippet: im.name },
      fixKind: "edit" as const,
    }));
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireOwner();
    const body = (await req.json()) as {
      op: string;
      courseUrl: string;
      acronym?: string;
      type?: AccessibleItemType;
      id?: string;
      items?: Array<{ type: AccessibleItemType; id: string }>;
      files?: Array<{ id: number; title: string; kind: string; fingerprint: string }>;
    };
    const { op, courseUrl } = body;
    const acronym = body.acronym;
    const institution = acronym ?? "";
    const courseId = parseCanvasCourseId(courseUrl) ?? courseUrl;

    // Cheap: list the scannable items (no page bodies) + the cached results, and
    // prune cache rows for items that no longer exist. The client diffs by
    // fingerprint and scans only what changed, in small batches.
    if (op === "list-items") {
      const refs = await listAccessibilityItems(courseUrl, acronym);
      const cached = await getCachedScans(user.id, institution, courseId);
      const currentKeys = new Set(refs.map((r) => `${r.type}:${r.id}`));
      const stale = cached.filter((c) => !currentKeys.has(`${c.type}:${c.id}`)).map((c) => ({ type: c.type, id: c.id }));
      await deleteScans(user.id, institution, courseId, stale);
      return NextResponse.json({ items: refs, cached });
    }

    // Scan a small batch of items (the client chunks the work so no single
    // request fetches+scans a whole course, which would time out / OOM).
    if (op === "scan-batch") {
      const refs = (body.items ?? []) as Array<{ type: AccessibleItemType; id: string }>;
      const items: ItemScan[] = [];
      for (const ref of refs.slice(0, 12)) {
        const content = await getAccessibilityItem(courseUrl, ref.type, ref.id, acronym);
        if (!content) continue;
        items.push(toItemScan(content, await scanHtml(content.html)));
      }
      await upsertScans(user.id, institution, courseId, items);
      return NextResponse.json({ items });
    }

    if (op === "scan-item") {
      const type = body.type!;
      const id = body.id!;
      const content = await getAccessibilityItem(courseUrl, type, id, acronym);
      if (!content) {
        await deleteScans(user.id, institution, courseId, [{ type, id }]);
        return NextResponse.json({ item: { type, id, title: "", fingerprint: "", errorCount: 0, warningCount: 0, suggestionCount: 0, issues: [] } });
      }
      const scan = toItemScan(content, await scanHtml(content.html));
      await upsertScans(user.id, institution, courseId, [scan]);
      return NextResponse.json({ item: scan });
    }

    // Cheap: list the course's scannable files (docx/pptx/pdf) — metadata only,
    // no downloads. The client diffs against cache and scans changed ones in
    // small batches (downloads are heavy, so files can't be done all at once).
    if (op === "list-files") {
      const files = await listScannableFiles(courseUrl, acronym);
      return NextResponse.json({
        files: files.map((f) => ({ id: f.id, title: f.title, kind: f.kind, fingerprint: f.fingerprint })),
      });
    }

    if (op === "scan-files-batch") {
      const files = (body.files ?? []) as Array<{ id: number; title: string; kind: string; fingerprint: string }>;
      const items: ItemScan[] = [];
      for (const f of files.slice(0, 4)) {
        let issues: Issue[] = [];
        try {
          if (f.kind === "pdf") {
            issues = await scanPdf(await getCanvasFileBuffer(courseUrl, f.id, acronym));
          } else {
            const scan = await getOfficeFileScan(courseUrl, f.id, acronym);
            if (scan) {
              issues = officeImageIssues(scan.images);
              if (scan.kind === "docx") {
                if (!scan.hasHeadings) {
                  issues.push({ ruleId: "doc-no-structure", severity: "error", message: "File does not include headings for structure.", wcag: "1.3.1", help: "Use Word's Heading styles so the document has a navigable structure.", locator: { selector: "", snippet: "" }, fixKind: "edit" });
                }
                if (!scan.title.trim()) {
                  issues.push({ ruleId: "doc-no-title", severity: "warning", message: "File is missing a title element.", wcag: "2.4.2", help: "Set a document title in File > Info > Properties.", locator: { selector: "", snippet: "" }, fixKind: "edit" });
                }
              }
            }
          }
        } catch {
          continue; // a file we can't read (too large, encrypted, etc.) is skipped
        }
        items.push(toItemScan({ type: "file", id: String(f.id), title: f.title, fingerprint: f.fingerprint }, issues));
      }
      await upsertScans(user.id, institution, courseId, items);
      return NextResponse.json({ items });
    }

    if (op === "links-get") {
      return NextResponse.json(await getLinkValidation(courseUrl, acronym));
    }
    if (op === "links-start") {
      await startLinkValidation(courseUrl, acronym);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown operation." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Scan failed." }, { status: 500 });
  }
}
