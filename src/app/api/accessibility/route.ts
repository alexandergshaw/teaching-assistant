import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/supabase/auth";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import {
  listAccessibilityContent,
  getAccessibilityItem,
  listScannableOfficeFiles,
  getOfficeFileImages,
  getLinkValidation,
  startLinkValidation,
} from "@/lib/canvas-modules";
import { scanHtml } from "@/lib/accessibility/engine";
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
    };
    const { op, courseUrl } = body;
    const acronym = body.acronym;
    const institution = acronym ?? "";
    const courseId = parseCanvasCourseId(courseUrl) ?? courseUrl;

    if (op === "scan-course") {
      const content = await listAccessibilityContent(courseUrl, acronym);
      const cached = await getCachedScans(user.id, institution, courseId);
      const cachedByKey = new Map(cached.map((c) => [`${c.type}:${c.id}`, c]));
      const items: ItemScan[] = [];
      const toUpsert: ItemScan[] = [];
      for (const c of content) {
        const prev = cachedByKey.get(`${c.type}:${c.id}`);
        if (prev && prev.fingerprint === c.fingerprint) {
          items.push(prev);
          continue;
        }
        const scan = toItemScan(c, await scanHtml(c.html));
        items.push(scan);
        toUpsert.push(scan);
      }
      await upsertScans(user.id, institution, courseId, toUpsert);
      const currentKeys = new Set(content.map((c) => `${c.type}:${c.id}`));
      const stale = cached.filter((c) => !currentKeys.has(`${c.type}:${c.id}`)).map((c) => ({ type: c.type, id: c.id }));
      await deleteScans(user.id, institution, courseId, stale);
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

    if (op === "scan-files") {
      const files = await listScannableOfficeFiles(courseUrl, acronym);
      const cached = await getCachedScans(user.id, institution, courseId);
      const cachedByKey = new Map(cached.map((c) => [`${c.type}:${c.id}`, c]));
      const items: ItemScan[] = [];
      const toUpsert: ItemScan[] = [];
      for (const f of files) {
        const id = String(f.id);
        const prev = cachedByKey.get(`file:${id}`);
        if (prev && prev.fingerprint === f.fingerprint) {
          items.push(prev);
          continue;
        }
        let issues: Issue[] = [];
        try {
          issues = officeImageIssues(await getOfficeFileImages(courseUrl, f.id, acronym));
        } catch {
          continue;
        }
        const scan = toItemScan({ type: "file", id, title: f.title, fingerprint: f.fingerprint }, issues);
        items.push(scan);
        toUpsert.push(scan);
      }
      await upsertScans(user.id, institution, courseId, toUpsert);
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
