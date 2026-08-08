// Pure content-shaping layer for "draft each scheduled weekly announcement
// from that week's Canvas module content"
// (docs/weekly-announcement-module-content-acceptance-criteria.md AC1 items
// 1/2/4, AC2 item 8, AC4 item 16).
//
// Deliberately dependency-free beyond extractModuleNumber: this module is
// imported from both the server-only fetch layer and the pure drafting
// orchestration, and neither of those may pull in Canvas, Supabase, or
// Next.js server-only code. Everything here is a plain function over plain
// data - no fetch, no I/O, no server action.

import { extractModuleNumber } from "@/lib/workflows/module-value";

export interface ModuleContentItem {
  type: string;
  title: string;
  body: string;
  dueAt: string | null;
  pointsPossible: number | null;
}

export interface ModuleContent {
  name: string;
  items: ModuleContentItem[];
}

// Per-week material cap (AC1 item 4). Includes the `[truncated]` marker
// itself, so the model is never handed a sentence that simply stops mid-word
// at the byte boundary.
export const MODULE_MATERIALS_CAP = 8000;

/** One drafted (or fallback-requesting) week, as supplied to
 * scheduleWeeklyAnnouncementsAction's opt-in `drafts` option. Nothing in this
 * module's own tests exercises this type - it exists here because the
 * module-content and drafting layers are the natural, dependency-free home
 * for it, and the action/step layers (owned by other agents) import it from
 * here rather than duplicating the shape. */
export interface WeeklyAnnouncementDraft {
  week: number;
  title?: string;
  message?: string;
  note?: string;
  defer?: boolean;
}

/**
 * Picks week N's module, honoring the narrow rule in AC1 item 1: name
 * matching is used EXCLUSIVELY whenever any module in the course carries a
 * number, and position is used only as a fallback for a wholly unnumbered
 * course whose module count matches the term's week count. See this
 * function's own test file for the two failure modes this asymmetry exists
 * to prevent (a numbered course guessing past its last module; an unnumbered
 * course with a leading non-week entry shifting every week by one).
 *
 * Generic over T so callers can pass their own richer module shape (id,
 * items, etc.) through unchanged - this function only ever reads `.name`.
 */
export function selectModuleForWeek<T extends { name: string }>(
  modules: T[],
  week: number,
  weekCount: number
): { module: T; matchedBy: "name" | "position" } | { module: null; matchedBy: "none" } {
  const anyModuleNumbered = modules.some((m) => extractModuleNumber(m.name) !== null);

  if (anyModuleNumbered) {
    // Numbered course: name matching only, ever. No positional fallback here
    // - see AC1 item 1a's rationale for why a "close enough" guess is worse
    // than reporting nothing.
    const match = modules.find((m) => extractModuleNumber(m.name) === week);
    return match ? { module: match, matchedBy: "name" } : { module: null, matchedBy: "none" };
  }

  // Wholly unnumbered course: position is only trustworthy when the module
  // count equals the week count - that equality is the only evidence the
  // list maps one-to-one onto weeks (a leading "Start Here" breaks it).
  if (modules.length === weekCount && week >= 1 && week <= modules.length) {
    return { module: modules[week - 1], matchedBy: "position" };
  }

  return { module: null, matchedBy: "none" };
}

function formatItemHeader(item: ModuleContentItem): string {
  const suffixes: string[] = [];
  if (typeof item.pointsPossible === "number" && item.pointsPossible > 0) {
    suffixes.push(`${item.pointsPossible} point${item.pointsPossible === 1 ? "" : "s"}`);
  }
  if (item.dueAt) {
    const due = new Date(item.dueAt);
    // Ignore an unparseable date rather than surfacing "Invalid Date" to the model.
    if (!Number.isNaN(due.getTime())) {
      suffixes.push(`due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    }
  }
  const suffix = suffixes.length > 0 ? ` (${suffixes.join(", ")})` : "";
  return `${item.type}: ${item.title}${suffix}`;
}

/**
 * Renders a module's items into the plain-text materials block handed to the
 * drafting instruction. Unifies on `Type: Title` for every item type - the
 * client-side precedent in registry-helpers.sources.ts's gatherLiveModuleItems
 * uses `# Title` for Page/File instead, but that split is not carried
 * forward here (see the acceptance criteria's "Vetted existing code"
 * section). Every item contributes its header line; only Page/Assignment/
 * Quiz/Discussion bodies are also included (File/ExternalUrl/ExternalTool/
 * SubHeader have no body worth sending - AC1 item 2).
 */
export function formatModuleMaterials(
  module: ModuleContent,
  cap?: number
): { text: string; truncated: boolean } {
  if (module.items.length === 0) {
    return { text: "", truncated: false };
  }

  const blocks = module.items.map((item) => {
    const header = formatItemHeader(item);
    const body = item.body.trim();
    return body ? `${header}\n${body}` : header;
  });

  const text = blocks.join("\n\n");
  const effectiveCap = cap ?? MODULE_MATERIALS_CAP;
  if (text.length <= effectiveCap) {
    return { text, truncated: false };
  }

  // Reserve room for the marker itself so the final string never exceeds the
  // cap - a truncation that busts its own limit would defeat the point.
  const marker = "[truncated]";
  const keep = Math.max(0, effectiveCap - marker.length);
  return { text: text.slice(0, keep) + marker, truncated: true };
}

/**
 * Builds the plain-text instruction handed to draftAnnouncementAction for one
 * week (AC2 item 8). Mirrors the section wording the sibling per-week
 * generator steps already use (steps.weekly-announcements.ts's `generate`,
 * steps.announcements.ts's WEEKLY_KICKOFF_ANNOUNCEMENT `run`) so a drafted
 * module-content announcement reads the same as those - the model is not
 * given a new house style to learn.
 */
export function buildWeeklyAnnouncementInstruction(input: {
  week: number;
  moduleName: string;
  courseName?: string;
  materials: string;
  extraNotes?: string;
}): string {
  const { week, moduleName, courseName, materials, extraNotes } = input;
  const courseSuffix = courseName ? ` (${courseName})` : "";

  return [
    `Write a warm, professional start-of-week course announcement for Week ${week}: ${moduleName}${courseSuffix}.`,
    "Organize it into clear sections: what students will learn this week, what they will be doing this week, any upcoming deadlines, and anything else to be aware of.",
    `Base it on these actual module materials for this week - do not just restate the module title:\n${materials}`,
    extraNotes ? `Also incorporate these notes (deadlines / things to be aware of):\n${extraNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Title precedence for a single week (AC4 item 16): the instructor's own
 * rendered title template wins whenever it is non-blank, then the drafted
 * title, then a bare "Week N" so the announcement always has SOME title even
 * when both upstream sources are empty.
 */
export function resolveAnnouncementTitle(
  renderedTemplateTitle: string,
  draftedTitle: string,
  week: number
): string {
  const template = renderedTemplateTitle.trim();
  if (template) return template;

  const drafted = draftedTitle.trim();
  if (drafted) return drafted;

  return `Week ${week}`;
}
