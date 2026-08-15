// Selection -> materials text: the batched gatherer LMS generation grounds
// its kind configs on (see ./kinds.ts). Takes the discriminated selection
// entries the LMS content tab already resolves (entry 261's
// itemKey/exportItemKey/parseItemKey scheme,
// src/app/components/content-tab/utils.ts: "live:<moduleId>:<itemId>" /
// "export:<moduleRef>:<itemRef>") together with the ALREADY-RESOLVED item for
// each key, and produces one materials string plus fail-forward notes.
//
// INHERITS gatherLiveModuleItems' documented behaviour rather than
// re-deriving it. gatherLiveModuleItems is a closure inside
// gatherModuleMaterials (src/lib/workflows/registry-helpers.sources.ts) and
// cannot be imported directly - it is a private closure, not an export - and
// that file is already 814 lines against this repo's 1000-line cap (see its
// own header comment), so this is a NEW module rather than a growth of that
// one. The three behaviours docs/REGRESSION.md entry 260 check 8 pins as
// must-not-drift are reproduced here exactly:
//   - DESCRIPTION_FETCH_LIMIT = 6: beyond this many Assignment/Discussion
//     items (in selection order, across every selected item - this gatherer
//     is BATCHED, so the cap is shared across modules, not reset per
//     module), bodies stop being fetched and a note records how many were
//     omitted.
//   - Per-item fetch failures are caught individually and pushed to notes,
//     never aborting the batch (fail-forward).
//   - MATERIALS_CAP = 20000 characters, with a truncation note.
//
// PURE BY DEPENDENCY INJECTION: the three Canvas reads a live item can need
// (a page's body, a file's preview text, an assignment/discussion's
// description) are passed in as `fetchers` rather than imported here, so
// this module carries no "@/app/actions" or Supabase edge and is directly
// testable with fake fetchers - no vi.mock needed. moduleItemContentUrl
// (src/lib/canvas-url.ts) is imported directly because it is itself pure (no
// I/O - it only builds a URL string).
// src/app/actions/lms-generation.ts supplies the real
// getPageAction/previewFileAction/fetchCanvasMetaAction as `fetchers`.
//
// EXPORT-SOURCED SELECTIONS: a CartridgeModuleItem (src/lib/cartridge-import-
// shared.ts, re-exported from src/lib/cartridge-import.ts) carries only
// {title, type, identifier?, body?} - none of CanvasModuleItem's due date,
// points, content id, or html url. An export-sourced item is therefore
// grounded on title/type/body alone, and that limitation is recorded as a
// note on every export item rather than silently generating from less.
//
// REPO-SOURCED SELECTIONS (AC8 of docs/repo-pairing-in-modules-acceptance-
// criteria.md - generation half only): a RepoSelectedItem carries no
// already-fetched text at all (unlike a CartridgeModuleItem's `body`) -
// `gatherRepoItem` reads it via the injected `readRepoFile` fetcher, mirroring
// getFileTextAction (src/app/actions/github-repos.ts). The instructor's real
// paired repo is 16 Markdown assignment specs - exactly the kind of content
// generation already consumes - so a repo file's text is used directly, with
// no title/type/body-only caveat the way export items need. This is the
// generation-reads-a-repo half of AC8 only; AC8's posting half
// (kindOffersPost/kindNeedsModuleTarget, useLmsGeneration.ts) stays
// Canvas-only and is untouched by this file.
//
// WHOLE-MODULE SELECTIONS: expandModuleSelection (bottom of this file) turns
// a list of selected MODULE ids into their live items, merged with any
// individually-selected `items` and deduped by key. It is deliberately a
// PURE function (given the already-fetched module tree, not fetching it
// itself), so the actual live Canvas fetch stays the caller's job -
// src/app/actions/lms-generation.ts calls listCourseContentAction (a fresh,
// authoritative read - never the browser's possibly-stale tree) and passes
// the result in. This is the module-level counterpart gatherModuleMaterials'
// own gatherLiveModuleItems has for a SINGLE module; nothing here reads
// gatherLiveModuleItems (see this file's own note above on why it can't be
// imported), so this is a parallel, independent implementation, not a reuse.
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import type { CartridgeModule, CartridgeModuleItem } from "@/lib/cartridge-import";
import { moduleItemContentUrl } from "@/lib/canvas-url";

/** See this file's header comment - inherited unchanged from
 * gatherLiveModuleItems (registry-helpers.sources.ts). */
export const DESCRIPTION_FETCH_LIMIT = 6;
/** See this file's header comment - inherited unchanged from
 * gatherModuleMaterials's MATERIALS_CAP (registry-helpers.sources.ts). */
export const MATERIALS_CAP = 20000;

export interface LiveSelectedItem {
  source: "live";
  /** The selection key this entry was resolved from (itemKey's
   * "live:<moduleId>:<itemId>") - carried through for callers that need to
   * report per-item outcomes keyed the same way the selection UI uses. */
  key: string;
  moduleId: number;
  item: CanvasModuleItem;
}

export interface ExportSelectedItem {
  source: "export";
  /** The selection key this entry was resolved from (exportItemKey's
   * "export:<moduleRef>:<itemRef>"). */
  key: string;
  moduleRef: string;
  item: CartridgeModuleItem;
}

/** One item sourced from a paired repo's tree (AC8 of docs/repo-pairing-in-
 * modules-acceptance-criteria.md - generation half only; the union's third
 * arm, alongside `LiveSelectedItem`/`ExportSelectedItem`, discriminated on
 * the same `source` field with the value the key scheme's third source
 * already uses - repoItemKey/repoModuleKey, content-tab/utils.ts). A repo
 * item carries no Canvas ids and no already-fetched body (unlike an export
 * item's `body`, which the export parse step already extracted) - reading
 * its text is this module's own job, via `MaterialsFetchers.readRepoFile`,
 * mirroring how a live File's text is read via `previewFile`. Fields are the
 * minimum `readRepoFile`/getFileTextAction (src/app/actions/github-repos.ts)
 * actually needs: `repoRef` ("owner/repo") and the optional `branch` are
 * getFileTextAction's own `repoRef`/`ref` parameters (its real signature,
 * not a guess), `itemRef` is the file's tree path (getFileTextAction's
 * `path`), and `moduleRef` is carried only for identity - it plays no part
 * in the actual read. */
export interface RepoSelectedItem {
  source: "repo";
  /** The selection key this entry was resolved from (repoItemKey's
   * "repo:<moduleRef>:<itemRef>"). */
  key: string;
  /** The matched assignment folder's tree path, e.g.
   * "assignments/module_01" - repoItemKey's moduleRef half. */
  moduleRef: string;
  /** The file's own tree path, e.g. "assignments/module_01/README.md" -
   * repoItemKey's itemRef half, and the `path` getFileTextAction reads. */
  itemRef: string;
  /** "owner/repo" (or URL) identity - getFileTextAction's own `repoRef`
   * parameter, parsed there via parseRepoRef. */
  repoRef: string;
  /** Optional branch/commit - getFileTextAction's own optional `ref`
   * parameter; omitted, it reads the repo's default branch. */
  branch?: string;
}

/** One resolved selection entry - the discriminated key (parsed) paired with
 * the actual item content it names. A caller builds this array by resolving
 * every selected key (parseItemKey) against whichever tree it has loaded
 * (a live CanvasModule[] tree, a parsed course export, and/or a paired
 * repo's tree) - resolution itself is the caller's job, not this module's;
 * gatherSelectionMaterials only ever sees already-resolved items. */
export type SelectedMaterialItem = LiveSelectedItem | ExportSelectedItem | RepoSelectedItem;

/** Structural subset of getPageAction's success shape
 * (src/app/actions/canvas-files-bulk.ts) - only the fields this module
 * reads. */
export interface LivePageFetchResult {
  page: { title: string; body: string };
}
/** Structural subset of previewFileAction's success shape. */
export interface LiveFileFetchResult {
  preview: { text: string };
}
/** Structural subset of fetchCanvasMetaAction's success shape. */
export interface LiveMetaFetchResult {
  description: string;
}
export interface LiveFetchError {
  error: string;
}

/** Structural subset of getFileTextAction's success shape
 * (src/app/actions/github-repos.ts). */
export interface RepoFileFetchResult {
  content: string;
}

/** The live-Canvas reads gatherSelectionMaterials needs, injected so this
 * module stays free of any "@/app/actions" import (see this file's header
 * comment). Signatures mirror getPageAction/previewFileAction/
 * fetchCanvasMetaAction exactly, so the real actions satisfy this interface
 * with no adapter needed. `readRepoFile` mirrors getFileTextAction's own
 * (repoRef, path, ref?) signature the same way - its param names below match
 * that action's, not `RepoSelectedItem`'s field names, so a caller wiring
 * the real action needs no adapter here either. OPTIONAL, unlike the three
 * Canvas reads above: the two existing callers that build a `MaterialsFetchers`
 * literal today (src/app/actions/lms-generation.ts's and
 * src/app/api/lms-generation/deck/route.ts's own `LIVE_FETCHERS`) predate
 * repo support and are out of this change's scope to touch - see
 * gatherRepoItem below for what happens when a repo item is selected but no
 * reader was supplied (fails forward, never a hard TypeScript break for
 * those two untouched call sites). */
export interface MaterialsFetchers {
  getPage: (courseUrl: string, pageUrl: string, institution?: string) => Promise<LivePageFetchResult | LiveFetchError>;
  previewFile: (courseUrl: string, contentId: number, institution?: string) => Promise<LiveFileFetchResult | LiveFetchError>;
  fetchMeta: (contentUrl: string) => Promise<LiveMetaFetchResult | LiveFetchError>;
  readRepoFile?: (repoRef: string, path: string, ref?: string) => Promise<RepoFileFetchResult | LiveFetchError>;
}

export interface GatherSelectionMaterialsContext {
  /** Needed only for live items (Page/File reads, and building the
   * Assignment/Discussion content URL via moduleItemContentUrl) - ignored
   * for export-sourced items, which need no network access at all. */
  canvasUrl: string;
  institution?: string;
  fetchers: MaterialsFetchers;
}

export interface GatherSelectionMaterialsResult {
  materialsText: string;
  notes: string[];
}

/** Reproduces gatherLiveModuleItems' due-date/points suffix exactly
 * ("(N points, due Mon DD)"). */
function formatSuffixes(item: { pointsPossible: number | null; dueAt: string | null }): string {
  const suffixes: string[] = [];
  if (typeof item.pointsPossible === "number" && item.pointsPossible > 0) {
    suffixes.push(`${item.pointsPossible} point${item.pointsPossible === 1 ? "" : "s"}`);
  }
  if (item.dueAt) {
    const dueDate = new Date(item.dueAt);
    const dateStr = dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    suffixes.push(`due ${dateStr}`);
  }
  return suffixes.length > 0 ? ` (${suffixes.join(", ")})` : "";
}

/** Per-item extraction for one LIVE selected item - mirrors
 * gatherLiveModuleItems' per-item branch exactly (Page -> getPage, File ->
 * previewFile, Assignment/Discussion with a resolvable content URL and still
 * under the description cap -> fetchMeta, else a header-only line for
 * Assignment/Quiz/Discussion, nothing for any other type). Fails forward:
 * any thrown/returned error becomes a note, never an abort. */
async function gatherLiveItem(
  entry: LiveSelectedItem,
  ctx: GatherSelectionMaterialsContext,
  descriptionState: { fetched: number }
): Promise<{ text: string; note?: string }> {
  const { item } = entry;
  try {
    if (item.type === "Page" && item.pageUrl) {
      const p = await ctx.fetchers.getPage(ctx.canvasUrl, item.pageUrl, ctx.institution);
      if ("error" in p) throw new Error(p.error);
      const bodyText = p.page.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return { text: `# ${p.page.title}\n${bodyText}\n\n` };
    }

    if (item.type === "File" && item.contentId !== null) {
      const f = await ctx.fetchers.previewFile(ctx.canvasUrl, item.contentId, ctx.institution);
      if ("error" in f) throw new Error(f.error);
      if (f.preview.text.trim()) return { text: `# ${item.title}\n${f.preview.text}\n\n` };
      return { text: "" };
    }

    const contentUrl = moduleItemContentUrl(ctx.canvasUrl, item.type, item.contentId, item.htmlUrl);
    if (
      (item.type === "Assignment" || item.type === "Discussion") &&
      contentUrl &&
      descriptionState.fetched < DESCRIPTION_FETCH_LIMIT
    ) {
      descriptionState.fetched++;
      const meta = await ctx.fetchers.fetchMeta(contentUrl);
      if ("error" in meta) throw new Error(meta.error);
      const description = meta.description.trim();
      const headerLine = `${item.type}: ${item.title}${formatSuffixes(item)}`;
      return { text: description ? `${headerLine}\n${description}\n\n` : `${headerLine}\n` };
    }

    if (item.type === "Assignment" || item.type === "Quiz" || item.type === "Discussion") {
      return { text: `${item.type}: ${item.title}${formatSuffixes(item)}\n` };
    }

    return { text: "" };
  } catch (err) {
    return { text: "", note: `${item.title}: ${err instanceof Error ? err.message : "could not read"}` };
  }
}

/** Per-item extraction for one EXPORT-sourced selected item: title/type/body
 * only (see this file's header comment) - no network access, so never
 * fails. Always notes the fields Canvas would have carried but a
 * CartridgeModuleItem structurally cannot (due date, points, a fetched
 * description), so a thinner-than-usual grounding is visible rather than
 * silent. */
function gatherExportItem(entry: ExportSelectedItem): { text: string; note: string } {
  const { item } = entry;
  const header = `${item.type}: ${item.title}`;
  const body = item.body?.trim();
  const text = body ? `${header}\n${body}\n\n` : `${header}\n`;
  const note = `${item.title}: export-sourced item - grounded on title/type${
    body ? "/body" : ""
  } only (due date, points, and a fetched description are not available for export-sourced items)`;
  return { text, note };
}

/** Per-item extraction for one REPO-sourced selected item (AC8 - generation
 * half): reads the file's text via `ctx.fetchers.readRepoFile` and uses it
 * directly as material - the instructor's real repo is 16 Markdown
 * assignment specs, exactly the kind of content generation already consumes
 * (docs/repo-pairing-in-modules-acceptance-criteria.md). Fails forward like
 * gatherLiveItem: a missing reader, a thrown error, or a returned `{error}`
 * all become a note, never an abort. Deliberately does NOT touch
 * `descriptionState`/DESCRIPTION_FETCH_LIMIT - that cap is specific to
 * Canvas Assignment/Discussion description fetches (fetchMeta); a repo file
 * read is a plain-text read like a live File's previewFile, which is
 * likewise uncapped by DESCRIPTION_FETCH_LIMIT. MATERIALS_CAP still bounds
 * the combined text exactly as it does for every other source (applied once,
 * after every item - see gatherSelectionMaterials below). */
async function gatherRepoItem(
  entry: RepoSelectedItem,
  ctx: GatherSelectionMaterialsContext
): Promise<{ text: string; note?: string }> {
  try {
    if (!ctx.fetchers.readRepoFile) {
      throw new Error("no repo file reader configured");
    }
    const result = await ctx.fetchers.readRepoFile(entry.repoRef, entry.itemRef, entry.branch);
    if ("error" in result) throw new Error(result.error);
    const text = result.content.trim();
    if (!text) return { text: "" };
    return { text: `# ${entry.itemRef}\n${text}\n\n` };
  } catch (err) {
    return { text: "", note: `${entry.itemRef}: ${err instanceof Error ? err.message : "could not read"}` };
  }
}

/**
 * Gather the materials text a generation kind is grounded on, from a batch
 * of already-resolved, discriminated selection entries. Never throws - every
 * per-item failure (live or export) is caught and pushed to `notes` instead
 * of aborting the batch (fail-forward, matching gatherLiveModuleItems).
 */
export async function gatherSelectionMaterials(
  items: SelectedMaterialItem[],
  ctx: GatherSelectionMaterialsContext
): Promise<GatherSelectionMaterialsResult> {
  const notes: string[] = [];
  const chunks: string[] = [];
  const descriptionState = { fetched: 0 };

  // Computed across the WHOLE batch (every module the selection spans), not
  // reset per module - this gatherer is deliberately BATCHED (see this
  // file's header comment), unlike gatherLiveModuleItems' own per-module
  // scope.
  const assignmentLikeCount = items.filter(
    (entry): entry is LiveSelectedItem =>
      entry.source === "live" &&
      (entry.item.type === "Assignment" || entry.item.type === "Discussion") &&
      Boolean(entry.item.htmlUrl)
  ).length;
  const hasMoreDescriptions = assignmentLikeCount > DESCRIPTION_FETCH_LIMIT;

  for (const entry of items) {
    const result =
      entry.source === "live"
        ? await gatherLiveItem(entry, ctx, descriptionState)
        : entry.source === "export"
          ? gatherExportItem(entry)
          : await gatherRepoItem(entry, ctx);
    if (result.text) chunks.push(result.text);
    if (result.note) notes.push(result.note);
  }

  if (hasMoreDescriptions) {
    notes.push(`further assignment descriptions omitted (${assignmentLikeCount - DESCRIPTION_FETCH_LIMIT} more)`);
  }

  const joined = chunks.join("");
  let materialsText = joined;
  if (joined.length > MATERIALS_CAP) {
    materialsText = joined.slice(0, MATERIALS_CAP);
    notes.push(`materials truncated to ~${MATERIALS_CAP} characters`);
  }

  return { materialsText, notes };
}

/**
 * Expand a selection of whole MODULE KEYS (the mirrored discriminated
 * "live:<id>" / "export:<ref>" scheme - liveModuleKey/exportModuleKey in
 * content-tab/utils.ts) into their items, merged with already-individually-
 * selected `items` - deduped so an item that is BOTH individually selected
 * AND inside a selected module is never counted twice (docs/REGRESSION.md
 * entry 260 check 1: `selected` (item keys) and `selectedModules` (module
 * keys) are TWO ORTHOGONAL sets - selecting a module does NOT select its
 * items, so a mixed selection is a real, reachable case, not a hypothetical
 * one). Reproduces itemKey's/exportItemKey's and liveModuleKey's/
 * exportModuleKey's exact templates directly rather than importing them
 * (this module must stay free of any content-tab/client import - see this
 * file's header comment) - they must stay byte-for-byte in sync with
 * content-tab/utils.ts.
 *
 * LIVE and EXPORT module keys are expanded from two SEPARATE trees, on
 * purpose, because the two sources can only ever be fetched in different
 * places:
 *   - LIVE (`allModules`): expected to be a FRESH server-side read.
 *     generateFromSelectionAction fetches it via listCourseContentAction
 *     immediately before calling this function (see that action's own
 *     header comment), so a stale client-side module tree can never change
 *     what actually gets generated for a live module selection
 *     (docs/REGRESSION.md entry 262 check 5).
 *   - EXPORT (`exportModules`): there is no server-side fetch path at all -
 *     a course export is downloaded and parsed entirely client-side
 *     (docs/REGRESSION.md entry 263 check 7: signed URL + a dynamic jszip
 *     import, both in the browser). `exportModules` is therefore whatever
 *     tree the CALLER already has parsed. useLmsGeneration.ts calls this
 *     function CLIENT-side with `allModules = []` (so no live item - which
 *     could only ever come from a possibly-stale client tree - sneaks into
 *     the real generation payload) and a real `exportModules`, to pre-expand
 *     any export module selection into concrete items BEFORE the server
 *     call. The server-side call never receives an export tree at all -
 *     export module keys that reach it (they shouldn't, given the client
 *     pre-expands them) simply match nothing and contribute no items,
 *     exactly like an unmatched live key would.
 *
 * Passing `allModules = []` expands ONLY export keys; omitting/nulling
 * `exportModules` expands ONLY live keys - either half can be skipped
 * independently, which is exactly how the two call sites above (the real
 * payload vs. the client-only display label) use this one function for two
 * different jobs. `allModules`/`exportModules` are already-fetched trees;
 * this function does no I/O itself (see this file's header comment) - every
 * caller fetches its own tree and passes it in, keeping this a plain,
 * DI-testable leaf like the rest of the file. Items are appended in
 * `allModules` order followed by `exportModules` order followed by
 * `repoModules` order, skipping any module whose key was not selected, and
 * any export module/item with no `identifier` (it could never have been
 * selected via exportModuleKey/exportItemKey in the first place).
 *
 * REPO (`repoModules`, AC8 - generation half): omitting/nulling it expands
 * ONLY live/export keys, exactly like omitting `exportModules` today -
 * a third, independently-skippable tree, not a change to the other two's
 * behaviour. `RepoModuleFileRefs` is this function's own minimal shape for
 * one selected-able repo module (an assignment folder): deliberately NOT
 * `useModuleSelection.ts`'s own local `RepoModuleRefs` (that hook only ever
 * needs to confirm a ref still exists, so it carries no repo/branch
 * identity) - this function needs enough to actually build a readable
 * `RepoSelectedItem` per file, so its shape carries `repoRef`/`branch` too.
 * Importing the hook's type would not have been enough on its own, and this
 * module stays free of any content-tab/client import regardless (see this
 * file's header comment) - so, like the live/export templates above, this is
 * a parallel local shape, not a shared one.
 *
 * OVERLOADED rather than given one signature with an optional 5th param:
 * several existing callers (useLmsGeneration.ts's `buildModuleLabel`, in
 * particular) hand-declare their own narrow parameter type - literally
 * `Array<{source:"live";...} | {source:"export";...}>` - rather than
 * importing LiveSelectedItem/ExportSelectedItem, the same "parallel local
 * shape" pattern this function itself uses for its key templates. Those
 * call sites are untouched by this repo-pairing wave (out of this file's
 * scope), so a single widened return type would break their compile the
 * moment `RepoSelectedItem` could appear in a value their own narrower type
 * does not admit - even though none of them will ever actually pass
 * `repoModules` yet. The overload keeps every 4-arg (or fewer) call exactly
 * as narrowly typed as it always was; only a call that actually supplies
 * `repoModules` gets the widened return type that can include
 * `RepoSelectedItem`. The implementation itself is unchanged either way.
 */
export interface RepoModuleFileRefs {
  /** The matched folder's tree path, e.g. "assignments/module_01" -
   * repoModuleKey's/repoItemKey's moduleRef half. */
  ref: string;
  /** Every file's tree path directly selectable under this folder, e.g.
   * "assignments/module_01/README.md" - repoItemKey's itemRef half. */
  itemRefs: string[];
  /** "owner/repo" identity shared by every file in the paired repo - see
   * `RepoSelectedItem.repoRef`. */
  repoRef: string;
  /** Optional branch/commit - see `RepoSelectedItem.branch`. */
  branch?: string;
}

export function expandModuleSelection<T extends SelectedMaterialItem>(
  items: T[],
  moduleKeys: string[],
  allModules: CanvasModule[],
  exportModules?: CartridgeModule[] | null
): Array<T | LiveSelectedItem | ExportSelectedItem>;
export function expandModuleSelection<T extends SelectedMaterialItem>(
  items: T[],
  moduleKeys: string[],
  allModules: CanvasModule[],
  exportModules: CartridgeModule[] | null | undefined,
  repoModules: RepoModuleFileRefs[] | null | undefined
): Array<T | LiveSelectedItem | ExportSelectedItem | RepoSelectedItem>;
export function expandModuleSelection<T extends SelectedMaterialItem>(
  items: T[],
  moduleKeys: string[],
  allModules: CanvasModule[],
  exportModules?: CartridgeModule[] | null,
  repoModules?: RepoModuleFileRefs[] | null
): Array<T | LiveSelectedItem | ExportSelectedItem | RepoSelectedItem> {
  const seenKeys = new Set(items.map((entry) => entry.key));
  const out: Array<T | LiveSelectedItem | ExportSelectedItem | RepoSelectedItem> = [...items];
  if (moduleKeys.length === 0) return out;
  const keySet = new Set(moduleKeys);

  for (const mod of allModules) {
    if (!keySet.has(`live:${mod.id}`)) continue;
    for (const item of mod.items) {
      const key = `live:${mod.id}:${item.id}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      out.push({ source: "live", key, moduleId: mod.id, item });
    }
  }

  for (const mod of exportModules ?? []) {
    if (!mod.identifier || !keySet.has(`export:${mod.identifier}`)) continue;
    for (const item of mod.items) {
      if (!item.identifier) continue;
      const key = `export:${mod.identifier}:${item.identifier}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      out.push({ source: "export", key, moduleRef: mod.identifier, item });
    }
  }

  for (const mod of repoModules ?? []) {
    if (!keySet.has(`repo:${mod.ref}`)) continue;
    for (const itemRef of mod.itemRefs) {
      const key = `repo:${mod.ref}:${itemRef}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      out.push({ source: "repo", key, moduleRef: mod.ref, itemRef, repoRef: mod.repoRef, branch: mod.branch });
    }
  }

  return out;
}
