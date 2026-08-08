// Content-gathering layer for "draft each scheduled weekly announcement from
// that week's Canvas MODULE content"
// (docs/weekly-announcement-module-content-acceptance-criteria.md AC1).
//
// Mirrors the bulk-fetch pattern of listAccessibilityContent (./accessibility.ts):
// one list request per content type for the whole course, never one request
// per item. Deliberately does NOT call listModules() (./modules.ts) - that
// function fetches items for EVERY module in the course under an unbounded
// Promise.all (see the acceptance criteria's "Vetted existing code" section),
// which costs 18 simultaneous requests on a 17-module course when this
// feature only ever needs items for the handful of modules a term's weeks
// actually resolve to. This file mirrors listModules' own request shapes
// (`/modules?per_page=100`, then
// `/modules/:id/items?per_page=100&include[]=content_details`) but issues the
// items call only for the DISTINCT targeted module ids, at bounded
// concurrency - never a per-course fan-out.
import { resolveCourse, htmlToText } from "../canvas-core";
import { fetchAll, safeFetchAll, mapWithConcurrency } from "./fetch-helpers";
import { mapModuleItem } from "./mappers";
import { getPage } from "./pages";
import type { CanvasModuleItem } from "./types";
import type { RawModule, RawModuleItem, RawHtmlContent } from "./raw-types";
import {
  selectModuleForWeek,
  formatModuleMaterials,
  MODULE_MATERIALS_CAP,
  type ModuleContent,
  type ModuleContentItem,
} from "@/lib/announcement-module-content";

/** One requested week's gathered module content, or the reason it has none. */
export interface WeekModuleContent {
  week: number;
  moduleName: string | null;
  materials: string;
  matchedBy: "name" | "position" | "none";
  truncated: boolean;
  notes: string[];
}

type TargetModule = { id: number; name: string; position: number };

/**
 * Gather every requested week's module content for the whole run in one pass
 * (AC1 item 5): ONE modules list; items fetched only for the modules the
 * requested weeks actually resolve to, at bounded concurrency; ONE bulk list
 * per content type (assignments/quizzes/discussion_topics), joined to items
 * by content id in memory; and page bodies only for the pages those items
 * reference. `weeks` may be empty (returns an empty map with zero fetches -
 * AC1 item 6's "content is fetched only when a week actually needs a draft").
 *
 * Wrapped end to end so one bad course-level fetch (a stale token, an
 * unreachable Canvas) degrades every requested week to "no content" with a
 * note, rather than throwing out of an action that has independent work left
 * to do this run.
 */
export async function fetchModuleContentForWeeks(
  courseUrl: string,
  weeks: number[],
  weekCount: number,
  code?: string
): Promise<Map<number, WeekModuleContent>> {
  const out = new Map<number, WeekModuleContent>();
  // Return before the network is ever touched - a re-run against a fully
  // scheduled term must issue ZERO content reads.
  if (weeks.length === 0) return out;

  try {
    const ctx = resolveCourse(courseUrl, code);
    const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;

    const rawModules = await fetchAll<RawModule>(`${base}/modules?per_page=100`, ctx);
    const modules: TargetModule[] = rawModules
      .filter((m): m is RawModule & { id: number } => typeof m.id === "number")
      .map((m) => ({
        id: m.id,
        name: (m.name ?? "").trim() || "(untitled module)",
        position: typeof m.position === "number" ? m.position : 0,
      }))
      .sort((a, b) => a.position - b.position);

    // AC1 item 1's name-vs-position rule lives entirely in
    // selectModuleForWeek; this layer only resolves each requested week
    // independently and dedupes the resulting module ids before fetching.
    const selections = new Map<
      number,
      { module: TargetModule | null; matchedBy: "name" | "position" | "none" }
    >();
    for (const week of weeks) {
      const picked = selectModuleForWeek(modules, week, weekCount);
      selections.set(week, { module: picked.module, matchedBy: picked.matchedBy });
    }

    const targetIds = Array.from(
      new Set(
        Array.from(selections.values())
          .map((s) => s.module?.id)
          .filter((id): id is number => typeof id === "number")
      )
    );

    // Items fetched ONLY for the targeted modules (never listModules()'s
    // unbounded per-course fan-out), bounded to 4 in flight.
    const itemsByModuleId = new Map<number, CanvasModuleItem[]>();
    const moduleErrors = new Map<number, string>();
    await mapWithConcurrency(targetIds, 4, async (moduleId) => {
      try {
        const rawItems = await fetchAll<RawModuleItem>(
          `${base}/modules/${moduleId}/items?per_page=100&include[]=content_details`,
          ctx
        );
        itemsByModuleId.set(
          moduleId,
          rawItems.map((raw) => mapModuleItem(raw, moduleId)).sort((a, b) => a.position - b.position)
        );
      } catch (err) {
        // Fail-forward per module: one module's items failing never blanks
        // the others.
        itemsByModuleId.set(moduleId, []);
        moduleErrors.set(moduleId, err instanceof Error ? err.message : "Could not read this module's items.");
      }
    });

    const allTargetedItems = targetIds.flatMap((id) => itemsByModuleId.get(id) ?? []);

    // The three bulk lists are fetched together, as a group, whenever ANY
    // targeted item needs a content join - never one description fetch per
    // item, and never decided per type: which of Assignment/Quiz/Discussion
    // are actually present is exactly what this join discovers, so a course
    // whose targeted modules happen to hold only Assignments still needs the
    // Quiz/Discussion lists requested here. Skipped entirely (all three)
    // when nothing targeted needs any of them.
    const needsContentJoin = allTargetedItems.some(
      (item) => item.type === "Assignment" || item.type === "Quiz" || item.type === "Discussion"
    );
    const assignmentDescById = new Map<number, string | null>();
    const quizDescById = new Map<number, string | null>();
    const discussionMsgById = new Map<number, string | null>();
    if (needsContentJoin) {
      const [assignments, quizzes, discussions] = await Promise.all([
        safeFetchAll<RawHtmlContent>(`${base}/assignments?per_page=100`, ctx),
        safeFetchAll<RawHtmlContent>(`${base}/quizzes?per_page=100`, ctx),
        safeFetchAll<RawHtmlContent>(`${base}/discussion_topics?per_page=100`, ctx),
      ]);
      for (const a of assignments) if (typeof a.id === "number") assignmentDescById.set(a.id, a.description ?? null);
      for (const q of quizzes) if (typeof q.id === "number") quizDescById.set(q.id, q.description ?? null);
      for (const d of discussions) if (typeof d.id === "number") discussionMsgById.set(d.id, d.message ?? null);
    }

    // Page bodies: only the distinct slugs the targeted items actually
    // reference, at concurrency 6 - the same limit listAccessibilityContent
    // uses for its own page-body fan-out.
    const pageSlugs = Array.from(
      new Set(
        allTargetedItems
          .filter((item): item is CanvasModuleItem & { pageUrl: string } => item.type === "Page" && !!item.pageUrl)
          .map((item) => item.pageUrl)
      )
    );
    const pageBodies = new Map<string, string>();
    const pageErrors = new Map<string, string>();
    await mapWithConcurrency(pageSlugs, 6, async (slug) => {
      try {
        const page = await getPage(courseUrl, slug, code);
        pageBodies.set(slug, page.body);
      } catch (err) {
        // Fail-forward per page: a broken page never fails the whole week,
        // only loses that one item's body.
        pageErrors.set(slug, err instanceof Error ? err.message : "Could not read this page.");
      }
    });

    for (const week of weeks) {
      const selection = selections.get(week)!;
      if (!selection.module) {
        out.set(week, {
          week,
          moduleName: null,
          materials: "",
          matchedBy: "none",
          truncated: false,
          notes: [`No module matched week ${week} - reported no content rather than guessing one.`],
        });
        continue;
      }

      const targetModule = selection.module;
      const items = itemsByModuleId.get(targetModule.id) ?? [];
      const notes: string[] = [];
      if (moduleErrors.has(targetModule.id)) {
        notes.push(`Could not read "${targetModule.name}"'s items: ${moduleErrors.get(targetModule.id)}`);
      }

      // HTML is converted to text HERE, before it ever reaches
      // formatModuleMaterials (and, downstream, the model) - a page body
      // arrives from Canvas as raw HTML and sending it verbatim wastes the
      // token budget and degrades the draft.
      const contentItems: ModuleContentItem[] = items.map((item) => {
        let rawBody: string | null = null;
        if (item.type === "Page" && item.pageUrl) {
          if (pageErrors.has(item.pageUrl)) {
            notes.push(`${item.title}: ${pageErrors.get(item.pageUrl)}`);
          }
          rawBody = pageBodies.get(item.pageUrl) ?? null;
        } else if (item.type === "Assignment" && item.contentId !== null) {
          rawBody = assignmentDescById.get(item.contentId) ?? null;
        } else if (item.type === "Quiz" && item.contentId !== null) {
          rawBody = quizDescById.get(item.contentId) ?? null;
        } else if (item.type === "Discussion" && item.contentId !== null) {
          rawBody = discussionMsgById.get(item.contentId) ?? null;
        }
        // File, ExternalUrl, ExternalTool and SubHeader items fall through
        // with rawBody still null - they contribute their header line only
        // (AC1 item 2): no file downloads or previews.
        return {
          type: item.type,
          title: item.title,
          body: rawBody ? htmlToText(rawBody) : "",
          dueAt: item.dueAt,
          pointsPossible: item.pointsPossible,
        };
      });

      const moduleContent: ModuleContent = { name: targetModule.name, items: contentItems };
      const { text, truncated } = formatModuleMaterials(moduleContent, MODULE_MATERIALS_CAP);

      out.set(week, {
        week,
        moduleName: targetModule.name,
        materials: text,
        matchedBy: selection.matchedBy,
        truncated,
        notes,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read module content from Canvas.";
    for (const week of weeks) {
      if (!out.has(week)) {
        out.set(week, { week, moduleName: null, materials: "", matchedBy: "none", truncated: false, notes: [message] });
      }
    }
  }

  return out;
}
