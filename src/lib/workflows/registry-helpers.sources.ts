// Material-source resolution for the lecture-building steps: gatherModuleMaterials
// and its per-source gatherers, split out of registry-helpers.ts to keep that
// file under 1000 lines (see AGENTS.md gates). registry-helpers.ts re-exports
// gatherModuleMaterials so every existing importer is unchanged.
//
// gatherModuleMaterials dispatches SourcePolicy.order through runSourcePolicy
// (source-policy.ts, pure), applying the chosen strategy. DEFAULT_SOURCE_POLICY
// ("live-lms" -> "course-export" -> "tile-meta", first-success) reproduces
// EXACTLY the pre-policy hard-coded chain: the "live-lms" gatherer below keeps
// today's internal on-failure fallback to the course export (same note
// wording), so under the default policy "course-export" as a standalone policy
// entry is a no-op (it only runs a fresh, independent export lookup when
// "live-lms" was never dispatched - i.e. a customized policy that omits it).

import {
  listCourseContentAction,
  getPageAction,
  previewFileAction,
  fetchCanvasMetaAction,
  ingestRepoAction,
  extractZipMaterialsTextAction,
  deriveTocFromSource,
} from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import type { CartridgeCourseData } from "@/lib/cartridge-import";
import type { CanvasModule } from "@/lib/canvas-modules/types";
import { moduleItemContentUrl } from "@/lib/canvas-url";
import { parseLmsModuleValue } from "@/lib/workflows/module-value";
import { findModuleForWeek } from "@/lib/week-numbering";
// Type-only (erased at compile time), so this file has NO runtime import edge
// back to registry-helpers.ts - which re-exports this module's gatherers.
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import { resolveTileCurrentWeek } from "@/lib/workflows/tile-week";
import {
  DEFAULT_SOURCE_POLICY,
  runSourcePolicy,
  type SourceGatherOutcome,
  type SourceGatherer,
  type SourceKind,
  type SourcePolicy,
} from "@/lib/workflows/source-policy";

// Materials cap at ~20000 chars so the deck prompt stays inside the action's
// own truncation budget; going over surfaces as a note. Matches the
// pre-policy MATERIALS_CAP exactly.
const MATERIALS_CAP = 20000;
const DESCRIPTION_FETCH_LIMIT = 6;
// course-progress ("Find the current week and module") emits these two texts
// instead of a module name when the course has not started or has finished -
// a name-reference module value carrying one of these must never be treated
// as a real module name to look up (AC2's sentinel guard).
const MODULE_NAME_SENTINELS = new Set(["Not started", "Complete"]);
// Tolerant module-number match: the same idiom used in
// steps.lms-integrations.ts ("Module NN" vs "Week N" style names).
const MODULE_NUMBER_PATTERN = /(?:module|week)\s*0*(\d+)/i;
// First http(s) URL found in free text (a tile's textbook field, e.g.).
const URL_IN_TEXT_PATTERN = /https?:\/\/\S+/i;
// A materials zip above this is skipped for text extraction (server actions
// invoked from the browser serialize their payload as base64 over the
// network) and falls back to a file-name/size listing instead.
const MATERIALS_ZIP_EXTRACT_MAX_BYTES = 8 * 1024 * 1024;

// Isomorphic Blob -> base64, duplicated from registry-helpers.ts's
// blobToBase64 to avoid a runtime import cycle (registry-helpers.ts
// re-exports this module's gatherModuleMaterials).
async function blobToBase64Local(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  if (typeof btoa !== "undefined") {
    const chunkSize = 8192;
    let binaryStr = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binaryStr += String.fromCharCode(...chunk);
    }
    return btoa(binaryStr);
  }
  throw new Error("Neither Buffer nor btoa available for base64 encoding");
}

// AC2: match a name-reference module value ("name|<name>") against a live
// module list - exact case-insensitive match first, then a tolerant
// module-NUMBER match on both sides (so "Module 05: Loops" matches a Canvas
// module named "Module 5" or "Week 5 - Loops"). Returns null on no match;
// never throws.
function findModuleByName(modules: CanvasModule[], name: string): CanvasModule | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const exact = modules.find((m) => (m.name ?? "").trim().toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;
  const wanted = trimmed.match(MODULE_NUMBER_PATTERN);
  if (!wanted) return null;
  const tolerant = modules.find((m) => {
    const match = (m.name ?? "").match(MODULE_NUMBER_PATTERN);
    return match ? match[1] === wanted[1] : false;
  });
  return tolerant ?? null;
}

async function listZipMemberNames(blob: Blob): Promise<string[]> {
  try {
    const buffer = await blob.arrayBuffer();
    const { default: JSZipMod } = await import("jszip");
    const zip = await JSZipMod.loadAsync(buffer);
    const names: string[] = [];
    zip.forEach((path, file) => {
      if (!file.dir) names.push(path);
    });
    return names;
  } catch {
    return [];
  }
}

// Additive, optional per-call context - see gatherModuleMaterials's
// "source-url" gatherer, which prefers this hint over the tile-derived
// fallbacks (integrations link, then a URL inside textbook) when the calling
// step already holds a source text/URL value (e.g.
// lecture-materials-from-schedule's sourceMaterial input).
export interface GatherModuleMaterialsOptions {
  sourceHint?: string;
}

// Gather the text a lecture-shaped step feeds the model, per `policy` (default:
// the pre-policy hard-coded chain - see the module comment for the exact
// equivalence). Content gathering never hard-fails the step: every per-source
// gatherer below fails forward into a note.
export async function gatherModuleMaterials(
  tile: Course,
  moduleIdRaw: string,
  helpers: StepRunHelpers,
  onProgress: (text: string) => void,
  policy: SourcePolicy = DEFAULT_SOURCE_POLICY,
  options: GatherModuleMaterialsOptions = {}
): Promise<{
  moduleName: string;
  materialsText: string;
  notes: string[];
  materialsSource: string;
  /** Ordered module names discovered while gathering - populated when a
   * single module was gathered (that one name) or a course-level digest ran
   * (every module's name). Feeds the schedule ladder's LMS-module-names tier
   * (see registry/schedule-resolution.ts). Additive/optional: existing
   * callers that ignore it are unaffected. */
  moduleNames?: string[];
}> {
  const canvasUrl = (tile.canvasUrl ?? "").trim();
  const inst = helpers.activeInstitution || undefined;
  const picked = parseLmsModuleValue(moduleIdRaw);
  const noModuleSelected = moduleIdRaw.trim() === "";
  // AC2/AC3: course-progress emits the sentinel RAW (unwrapped) for the
  // not-started/complete cases, so it must be recognized whichever form it
  // arrives in - the raw trimmed value (the common case) or, defensively, a
  // name carried by a byName/export value.
  const rawTrimmed = moduleIdRaw.trim();
  const moduleNameSentinel = MODULE_NAME_SENTINELS.has(rawTrimmed)
    ? rawTrimmed
    : picked.name && MODULE_NAME_SENTINELS.has(picked.name)
    ? picked.name
    : null;

  let moduleName = "Upcoming module";
  let materialsSource = "";
  let liveLmsRan = false;
  let moduleNames: string[] | undefined;

  // Pull item titles + syllabus text from the course's newest LMS export,
  // matched by module name. Pure (returns instead of mutating shared state)
  // so both the live-LMS fallback below and a standalone "course-export"
  // policy entry can call it.
  // `courseLevel` (AC2): when no module name is available to match, digest
  // EVERY export module's name + item titles (+ syllabus, as today) instead
  // of a single module's items - the course-level fallback for course-export.
  const tryExport = async (
    matchName: string | null,
    courseLevel = false
  ): Promise<
    | { ok: true; text: string; name: string; names?: string[] }
    | { ok: false; note: string | null }
  > => {
    if (!helpers.loadCourseExport) {
      return { ok: false, note: "course export: not available in this run context" };
    }
    if (!matchName && !courseLevel) {
      return { ok: false, note: "course export: no module name to match" };
    }
    onProgress("Reading the course export...");
    let data: CartridgeCourseData | null = null;
    try {
      data = await helpers.loadCourseExport(tile.id);
    } catch (err) {
      return { ok: false, note: `course export: ${err instanceof Error ? err.message : "could not read"}` };
    }
    if (!data || data.modules.length === 0) {
      return { ok: false, note: "course export: none uploaded on this course tile, or it has no modules" };
    }

    if (courseLevel) {
      const chunks: string[] = [];
      for (const m of data.modules) {
        chunks.push(`# ${m.name}\n`);
        for (const item of m.items) chunks.push(`${item.type}: ${item.title}\n`);
      }
      if (data.syllabusHtml) {
        const syllabusText = data.syllabusHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (syllabusText) chunks.push(`\n# Course syllabus (context)\n${syllabusText}\n`);
      }
      return { ok: true, text: chunks.join(""), name: "", names: data.modules.map((m) => m.name) };
    }

    if (!matchName) return { ok: false, note: null };
    const target =
      data.modules.find((m) => m.name === matchName) ??
      data.modules.find((m) => m.name.toLowerCase() === matchName.toLowerCase());
    if (!target) return { ok: false, note: null };
    const chunks: string[] = [];
    for (const item of target.items) chunks.push(`${item.type}: ${item.title}\n`);
    if (data.syllabusHtml) {
      const syllabusText = data.syllabusHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (syllabusText) chunks.push(`\n# Course syllabus (context)\n${syllabusText}\n`);
    }
    return { ok: true, text: chunks.join(""), name: target.name };
  };

  // Extracted so both the module-scoped live-LMS branch and the course-level
  // auto-picked-current-week branch (AC2a) run IDENTICAL per-item pulls,
  // caps, and notes.
  const gatherLiveModuleItems = async (
    courseModule: CanvasModule
  ): Promise<{ text: string; notes: string[] }> => {
    const notes: string[] = [];
    const chunks: string[] = [];
    const push = (t: string) => {
      if (t) chunks.push(t);
    };

    let descriptionsFetched = 0;
    const assignmentLikeItems = courseModule.items.filter(
      (item) => (item.type === "Assignment" || item.type === "Discussion") && item.htmlUrl
    );
    const hasMoreDescriptions = assignmentLikeItems.length > DESCRIPTION_FETCH_LIMIT;

    for (const item of courseModule.items) {
      // Fail-forward per item: unreadable materials become notes.
      try {
        if (item.type === "Page" && item.pageUrl) {
          const p = await getPageAction(canvasUrl, item.pageUrl, inst);
          if ("error" in p) throw new Error(p.error);
          const bodyText = p.page.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          push(`# ${p.page.title}\n${bodyText}\n\n`);
        } else if (item.type === "File" && item.contentId !== null) {
          const f = await previewFileAction(canvasUrl, item.contentId, inst);
          if ("error" in f) throw new Error(f.error);
          if (f.preview.text.trim()) push(`# ${item.title}\n${f.preview.text}\n\n`);
        } else if (
          (item.type === "Assignment" || item.type === "Discussion") &&
          moduleItemContentUrl(canvasUrl, item.type, item.contentId, item.htmlUrl) &&
          descriptionsFetched < DESCRIPTION_FETCH_LIMIT
        ) {
          descriptionsFetched++;
          const meta = await fetchCanvasMetaAction(
            moduleItemContentUrl(canvasUrl, item.type, item.contentId, item.htmlUrl)!
          );
          if ("error" in meta) throw new Error(meta.error);
          const description = meta.description.trim();

          let headerLine = `${item.type}: ${item.title}`;
          const suffixes: string[] = [];
          if (typeof item.pointsPossible === "number" && item.pointsPossible > 0) {
            suffixes.push(`${item.pointsPossible} point${item.pointsPossible === 1 ? "" : "s"}`);
          }
          if (item.dueAt) {
            const dueDate = new Date(item.dueAt);
            const dateStr = dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            suffixes.push(`due ${dateStr}`);
          }
          if (suffixes.length > 0) headerLine += ` (${suffixes.join(", ")})`;
          push(`${headerLine}\n`);
          if (description) push(`${description}\n\n`);
        } else if (item.type === "Assignment" || item.type === "Quiz" || item.type === "Discussion") {
          let headerLine = `${item.type}: ${item.title}`;
          const suffixes: string[] = [];
          if (typeof item.pointsPossible === "number" && item.pointsPossible > 0) {
            suffixes.push(`${item.pointsPossible} point${item.pointsPossible === 1 ? "" : "s"}`);
          }
          if (item.dueAt) {
            const dueDate = new Date(item.dueAt);
            const dateStr = dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            suffixes.push(`due ${dateStr}`);
          }
          if (suffixes.length > 0) headerLine += ` (${suffixes.join(", ")})`;
          push(`${headerLine}\n`);
        }
      } catch (err) {
        notes.push(`${item.title}: ${err instanceof Error ? err.message : "could not read"}`);
      }
    }

    if (hasMoreDescriptions) {
      notes.push(
        `further assignment descriptions omitted (${assignmentLikeItems.length - DESCRIPTION_FETCH_LIMIT} more)`
      );
    }

    return { text: chunks.join(""), notes };
  };

  // AC2b: no module selected but a live LMS connection exists - auto-pick
  // the current week's module via the SAME helpers used elsewhere
  // (resolveTileCurrentWeek + findModuleForWeek), gathering it exactly like
  // the module-scoped branch; otherwise digest every module's name + item
  // titles (no page/file bodies fetched - cost).
  // AC3: `failedModuleName` is set only when a module WAS targeted but a
  // by-name lookup failed to find it (the sentinel and genuinely-no-module
  // callers below pass none) - it corrects the digest note so it never
  // claims "no module selected" when one plainly was, and makes clear the
  // gathered text is course-level CONTEXT rather than that module's
  // materials.
  const gatherCourseLevelLive = async (
    notes: string[],
    failedModuleName: string | null = null
  ): Promise<SourceGatherOutcome> => {
    onProgress("Loading course content...");
    let content: Awaited<ReturnType<typeof listCourseContentAction>>;
    try {
      content = await listCourseContentAction(canvasUrl, inst);
    } catch (err) {
      notes.push(`live LMS: ${err instanceof Error ? err.message : "could not read the LMS course"}`);
      return { text: "", notes, ok: false };
    }
    if ("error" in content) {
      notes.push(`live LMS: ${content.error}`);
      return { text: "", notes, ok: false };
    }
    if (!content.modules || content.modules.length === 0) {
      notes.push("live LMS: the course has no modules");
      return { text: "", notes, ok: false };
    }

    const weekResolution = await resolveTileCurrentWeek(tile, helpers);
    if (!("skip" in weekResolution)) {
      const found = findModuleForWeek(
        content.modules.map((m) => ({ title: m.name, name: m.name, position: m.position, id: m.id })),
        weekResolution.rawWeek
      );
      if (found) {
        const courseModule = content.modules.find((m) => m.id === found.id);
        if (courseModule) {
          moduleName = courseModule.name;
          materialsSource = `Materials read from LMS module "${courseModule.name}" (auto-picked for the current week)`;
          moduleNames = [courseModule.name];
          const gathered = await gatherLiveModuleItems(courseModule);
          notes.push(`no module selected - auto-picked the current-week module "${courseModule.name}"`);
          notes.push(...gathered.notes);
          return { text: gathered.text, notes, ok: true };
        }
      }
    }

    moduleNames = content.modules.map((m) => m.name);
    materialsSource = failedModuleName
      ? `Materials digested from ${content.modules.length} LMS module name(s) + item titles (course-level context; module "${failedModuleName}" was not found)`
      : `Materials digested from ${content.modules.length} LMS module name(s) + item titles (course-level, no module selected)`;
    const chunks: string[] = [];
    for (const m of content.modules) {
      chunks.push(`# ${m.name}\n`);
      for (const item of m.items) chunks.push(`${item.type}: ${item.title}\n`);
    }
    const text = chunks.join("");
    notes.push(
      failedModuleName
        ? `module "${failedModuleName}" was not found - digested ${content.modules.length} LMS module name(s) and item titles as course-level context (page/file bodies not fetched)`
        : `no module selected - digested ${content.modules.length} LMS module name(s) and item titles (course-level; page/file bodies not fetched)`
    );
    return { text, notes, ok: text.trim().length > 0 };
  };

  const liveLmsGatherer = async (): Promise<SourceGatherOutcome> => {
    liveLmsRan = true;
    const notes: string[] = [];

    // course-progress's sentinel texts ("Not started" / "Complete") are never
    // a real module name to look up, whichever form they arrive in (raw or
    // wrapped) - guard them here and fall to the course-level/no-module
    // handling instead, exactly as if no module had been selected.
    if (moduleNameSentinel) {
      notes.push(`the course is not in an active module (${moduleNameSentinel})`);
      if (!canvasUrl) {
        notes.push("live LMS: no Canvas URL is set on this course tile");
        return { text: "", notes, ok: false };
      }
      return await gatherCourseLevelLive(notes);
    }

    // AC2: a name-reference value ("name|<name>") - match by name instead of
    // by a live id.
    if (picked.byName) {
      if (canvasUrl && picked.name) {
        onProgress("Loading module materials...");
        try {
          const content = await listCourseContentAction(canvasUrl, inst);
          if ("error" in content) throw new Error(content.error);
          const target = findModuleByName(content.modules, picked.name);
          if (target) {
            moduleName = target.name;
            materialsSource = `Materials read from LMS module "${target.name}"`;
            moduleNames = [target.name];
            const gathered = await gatherLiveModuleItems(target);
            return { text: gathered.text, notes: [...notes, ...gathered.notes], ok: true };
          }
          const available = content.modules.slice(0, 5).map((m) => m.name).join(", ");
          notes.push(
            `module "${picked.name}" not found by name in the live LMS (available: ${available || "none"})`
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "could not read the LMS course";
          notes.push(`live LMS: ${message}`);
        }
      }

      // No match (or no live LMS to search) - fall through to the export by
      // name, then the course-level/no-module handling.
      const r = await tryExport(picked.name);
      if (r.ok) {
        moduleName = r.name;
        materialsSource = `Materials from the course export module "${r.name}" (item titles + syllabus)`;
        return { text: r.text, notes, ok: true };
      }
      if (r.note) notes.push(r.note);
      if (!canvasUrl) {
        notes.push("live LMS: no Canvas URL is set on this course tile");
        return { text: "", notes, ok: false };
      }
      return await gatherCourseLevelLive(notes, picked.name);
    }

    if (picked.fromExport) {
      const r = await tryExport(picked.name);
      if (r.ok) {
        moduleName = r.name;
        materialsSource = `Materials from the course export module "${r.name}" (item titles + syllabus)`;
        return { text: r.text, notes, ok: true };
      }
      if (r.note) notes.push(r.note);
      notes.push(`module "${picked.name ?? ""}" not found in the course export`);
      return { text: "", notes, ok: false };
    }

    if (canvasUrl && picked.liveId) {
      onProgress("Loading module materials...");
      try {
        const content = await listCourseContentAction(canvasUrl, inst);
        if ("error" in content) throw new Error(content.error);
        const courseModule = content.modules.find((m) => String(m.id) === picked.liveId);
        if (!courseModule) throw new Error("the chosen module was not found in the LMS course");
        moduleName = courseModule.name;
        materialsSource = `Materials read from LMS module "${courseModule.name}"`;
        moduleNames = [courseModule.name];

        const gathered = await gatherLiveModuleItems(courseModule);
        return { text: gathered.text, notes: [...notes, ...gathered.notes], ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : "could not read the LMS course";
        const r = await tryExport(picked.name);
        if (r.ok) {
          moduleName = r.name;
          materialsSource = `Materials from the course export module "${r.name}" (item titles + syllabus)`;
          notes.push(`live LMS failed (${message}) - used the course export instead`);
          return { text: r.text, notes, ok: true };
        }
        if (r.note) notes.push(r.note);
        notes.push(`live LMS failed (${message}) and the course export had no matching module`);
        return { text: "", notes, ok: false };
      }
    }

    // AC2: no module selected (moduleIdRaw blank) - gather COURSE-LEVEL
    // material instead of silently no-oping. This is the fix for the
    // reported bug: choosing "Live LMS connection" with no module bound
    // previously fell straight through to an empty-notes no-op below.
    if (noModuleSelected) {
      if (!canvasUrl) {
        notes.push("live LMS: no Canvas URL is set on this course tile");
        return { text: "", notes, ok: false };
      }
      return await gatherCourseLevelLive(notes);
    }

    // A module id was given but resolved to neither an export pick, a live
    // id, nor course-level mode (e.g. no Canvas URL for a live-id pick).
    notes.push(
      canvasUrl
        ? "live LMS: could not resolve the selected module"
        : "live LMS: no Canvas URL is set on this course tile"
    );
    return { text: "", notes, ok: false };
  };

  // Standalone "course-export" policy entry: a no-op when "live-lms" already
  // ran (it already tried this, coupled, above) - a genuine independent
  // attempt only when the policy omits "live-lms" entirely.
  const courseExportGatherer = async (): Promise<SourceGatherOutcome> => {
    // Coupled no-op: the live-LMS gatherer already tried the export as its own
    // fallback and reported that outcome in its notes, so a note here would
    // repeat itself in every default-policy run. Deliberately silent - the
    // "every source explains itself" rule is satisfied by the live-LMS note.
    if (liveLmsRan) return { text: "", notes: [], ok: false };

    if (noModuleSelected) {
      const r = await tryExport(null, true);
      if (r.ok) {
        materialsSource = `Materials digested from the course export (${
          r.names?.length ?? 0
        } module name(s) + item titles + syllabus, course-level)`;
        moduleNames = r.names;
        return {
          text: r.text,
          notes: [`no module selected - digested ${r.names?.length ?? 0} course-export module name(s) and item titles`],
          ok: r.text.trim().length > 0,
        };
      }
      const notes: string[] = [];
      if (r.note) notes.push(r.note);
      return { text: "", notes, ok: false };
    }

    if (moduleNameSentinel) {
      return {
        text: "",
        notes: [`the course is not in an active module (${moduleNameSentinel})`],
        ok: false,
      };
    }

    const r = await tryExport(picked.name);
    if (r.ok) {
      moduleName = r.name;
      materialsSource = `Materials from the course export module "${r.name}" (item titles + syllabus)`;
      return { text: r.text, notes: [], ok: true };
    }
    const notes: string[] = [];
    if (r.note) notes.push(r.note);
    else if (picked.name) notes.push(`module "${picked.name}" not found in the course export`);
    return { text: "", notes, ok: false };
  };

  const tileMetaGatherer = async (): Promise<SourceGatherOutcome> => {
    const text = [tile.topics ?? "", tile.description ?? ""].filter(Boolean).join("\n\n");
    materialsSource = "Materials from the tile's topics/description";
    return {
      text,
      notes: ["no live LMS module or export module - using tile topics/description"],
      ok: true,
    };
  };

  // "materials-zip": the tile's uploaded course-materials zip (not an LMS
  // export). Best-effort text extraction (extractZipMaterialsTextAction,
  // server-safe - see that action's doc comment); falls back to a
  // names/sizes listing when extraction is unavailable or the archive is too
  // large to ship over the action boundary.
  const materialsZipGatherer = async (): Promise<SourceGatherOutcome> => {
    if (!helpers.loadCourseMaterials) {
      return { text: "", notes: ["materials zip: not available in this run context"], ok: false };
    }
    onProgress("Reading the course materials zip...");
    let file: { name: string; blob: Blob } | null;
    try {
      file = await helpers.loadCourseMaterials(tile.id);
    } catch (err) {
      return {
        text: "",
        notes: [`materials zip: ${err instanceof Error ? err.message : "could not read"}`],
        ok: false,
        error: true,
      };
    }
    if (!file) {
      return { text: "", notes: ["materials zip: none uploaded on this course tile"], ok: false };
    }

    if (file.blob.size > MATERIALS_ZIP_EXTRACT_MAX_BYTES) {
      const names = await listZipMemberNames(file.blob);
      return {
        text:
          names.length > 0
            ? `Materials zip "${file.name}" contents (too large for text extraction, names only):\n${names.join("\n")}`
            : "",
        notes: [
          `materials zip "${file.name}": too large for text extraction (${(file.blob.size / 1048576).toFixed(1)} MB) - listed file names only`,
        ],
        ok: names.length > 0,
      };
    }

    try {
      const base64 = await blobToBase64Local(file.blob);
      const extracted = await extractZipMaterialsTextAction(base64);
      if ("error" in extracted) {
        const names = await listZipMemberNames(file.blob);
        return {
          text:
            names.length > 0
              ? `Materials zip "${file.name}" contents (text extraction unavailable):\n${names.join("\n")}`
              : "",
          notes: [`materials zip "${file.name}": text extraction unavailable (${extracted.error}) - listed file names only`],
          ok: names.length > 0,
        };
      }
      const withText = extracted.entries.filter((e) => e.text.trim());
      if (withText.length > 0) {
        const text = withText.map((e) => `# ${e.name}\n${e.text}\n`).join("\n");
        return {
          text,
          notes: [
            `materials zip "${file.name}": extracted text from ${withText.length}/${extracted.entries.length} file(s)`,
          ],
          ok: true,
        };
      }
      const names = extracted.entries.map((e) => `${e.name} (${(e.size / 1024).toFixed(1)} KB)`);
      return {
        text:
          names.length > 0
            ? `Materials zip "${file.name}" contents (names + sizes only, no extractable text):\n${names.join("\n")}`
            : "",
        notes: [
          names.length > 0
            ? `materials zip "${file.name}": no extractable text - listed file names and sizes`
            : `materials zip "${file.name}": empty`,
        ],
        ok: names.length > 0,
      };
    } catch (err) {
      return {
        text: "",
        notes: [`materials zip: ${err instanceof Error ? err.message : "could not process"}`],
        ok: false,
        error: true,
      };
    }
  };

  // "repo": the course tile's first linked repository, digested (README +
  // selected source files) via the same ingestRepo helper the grading and
  // rubric flows use - already a compact, bounded text digest, so no zip
  // download/text-extraction step is needed for this kind.
  const repoGatherer = async (): Promise<SourceGatherOutcome> => {
    const repoRef = tile.repos?.[0]?.repo?.trim();
    if (!repoRef) {
      return { text: "", notes: ["repo: no repository linked to this course tile"], ok: false };
    }
    onProgress("Reading the linked repository...");
    try {
      const branch = tile.repos?.[0]?.branch?.trim() || undefined;
      const r = await ingestRepoAction(repoRef, branch);
      if ("error" in r) {
        return { text: "", notes: [`repo: ${r.error}`], ok: false, error: true };
      }
      return {
        text: r.digest.text,
        notes: [
          `repo "${r.digest.fullName}": digested ${r.digest.fileCount} file(s)${r.digest.truncated ? " (truncated)" : ""}`,
        ],
        ok: r.digest.text.trim().length > 0,
      };
    } catch (err) {
      return {
        text: "",
        notes: [`repo: ${err instanceof Error ? err.message : "could not read the repository"}`],
        ok: false,
        error: true,
      };
    }
  };

  // "source-url": the tile's platform link (a uCertify-style course URL,
  // typically login-walled) resolved in order - an explicit hint passed by
  // the calling step (a sourceMaterial/sourceUrl value it already holds),
  // then the first link in the tile's integrations, then a URL found inside
  // the tile's textbook field - then its official outline derived via the
  // existing web-search-grounded deriveTocFromSource (never fetches the
  // platform page directly, since it is login-walled). Never throws: a
  // missing URL or a failed derivation is a note, not an error.
  const sourceUrlGatherer = async (): Promise<SourceGatherOutcome> => {
    const hint = (options.sourceHint ?? "").trim();
    let resolved = "";
    let resolvedFrom = "";
    if (hint) {
      resolved = hint;
      resolvedFrom = "the provided source hint";
    } else {
      const integrationLink = (tile.integrations ?? []).find((i) => (i.url ?? "").trim())?.url?.trim();
      if (integrationLink) {
        resolved = integrationLink;
        resolvedFrom = "the course tile's integrations";
      } else {
        const textbookMatch = (tile.textbook ?? "").match(URL_IN_TEXT_PATTERN);
        if (textbookMatch) {
          resolved = textbookMatch[0];
          resolvedFrom = "the course tile's textbook field";
        }
      }
    }

    if (!resolved) {
      return {
        text: "",
        notes: [
          "no source platform URL found (add the platform link to the course tile's integrations, or paste it with the source material)",
        ],
        ok: false,
      };
    }

    onProgress("Deriving the source platform's official outline...");
    const derived = await deriveTocFromSource(resolved);
    if (!derived) {
      return {
        text: "",
        notes: [`source platform URL (${resolved}, from ${resolvedFrom}): outline derivation found nothing usable`],
        ok: false,
      };
    }

    return {
      text: derived.toc,
      notes: [
        `source platform URL (${resolved}, from ${resolvedFrom}): derived ${derived.chapters.length} chapter(s) from ${derived.sources.length} search source(s)`,
      ],
      ok: derived.toc.trim().length > 0,
    };
  };

  const topicOutlineGatherer = async (): Promise<SourceGatherOutcome> => {
    const outline = (tile.topicOutline ?? "").trim();
    if (!outline) {
      return {
        text: "",
        notes: ["no topic outline set on the course tile"],
        ok: false,
      };
    }
    return {
      text: outline,
      notes: [`topic outline from course tile (${outline.length} chars)`],
      ok: true,
    };
  };

  const gather: SourceGatherer = (kind: SourceKind) => {
    switch (kind) {
      case "live-lms":
        return liveLmsGatherer();
      case "course-export":
        return courseExportGatherer();
      case "source-url":
        return sourceUrlGatherer();
      case "tile-meta":
        return tileMetaGatherer();
      case "materials-zip":
        return materialsZipGatherer();
      case "repo":
        return repoGatherer();
      case "topic-outline":
        return topicOutlineGatherer();
    }
  };

  const result = await runSourcePolicy(policy, gather, MATERIALS_CAP);
  const notes = [...result.notes];
  if (result.truncated) notes.push(`materials truncated to ~${MATERIALS_CAP} characters`);

  return { moduleName, materialsText: result.text, notes, materialsSource, moduleNames };
}
