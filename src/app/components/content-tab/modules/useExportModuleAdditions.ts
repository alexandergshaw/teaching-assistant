"use client";

// Add items to modules on an export-only course
// (docs/export-module-additions-acceptance-criteria.md) - the WIRING half
// over src/lib/export-module-additions.ts's pure foundations, mirroring
// useRepoPairing.ts's own hook/render split (that file's header comment is
// worth reading first; this hook repeats its shape deliberately: resolve the
// course_hub row via the same live/export resolver pair, keep one piece of
// state as the single source of truth, persist the WHOLE thing on every
// change, and gate the "active vs inactive" recompute on a genuinely loaded
// tree rather than a transient empty one).
//
// AC9 - THE CLIENT REACHES THE DATABASE ONLY THROUGH A SERVER ACTION. Every
// import here that touches Supabase is `import type` only
// (ExportModuleAdditions's shape); the actual read is a byproduct of
// resolveLmsCourseRowAction/resolveLmsCourseRowByIdAction (the established
// live/export course-row resolution pair, entry 300) since
// `Course.exportModuleAdditions` rides along on the SAME row those already
// fetch, and the write is setCourseExportModuleAdditionsAction - both
// imported from the actions barrel, exactly like every other hook in this
// directory.
//
// AC4 - THE ACTIVATION GATE. `additions` (this hook's single source of
// truth, mirrored 1:1 into the database on every change) is NEVER filtered
// before being stored - a stale addition is preserved forever, exactly like
// repo-module-pairing's own associations. `activateExportModuleAdditions`
// (src/lib/export-module-additions.ts) computes which additions are ACTIVE
// right now at READ time, against `readyModuleRefs` below - a cache that
// only updates on a genuinely loaded `exportModules` array, NEVER on
// `undefined` (ModulesView's own "exportContent is null mid-load" state,
// threaded straight through as this hook's third argument) - so a reload in
// progress can never flip every addition to "inactive" for the half-second
// the new export takes to parse, the exact flicker/false-signal entry 306's
// AC5 forbade for repo associations.
import { useEffect, useMemo, useState } from "react";
import type { CartridgeModule } from "@/lib/cartridge-import";
import {
  resolveLmsCourseRowAction,
  resolveLmsCourseRowByIdAction,
  setCourseExportModuleAdditionsAction,
} from "../../../actions";
import {
  activateExportModuleAdditions,
  appendExportModuleAddition,
  coerceExportModuleAdditions,
  emptyExportModuleAdditions,
  removeExportModuleAddition,
  type ExportModuleAddition,
  type ExportModuleAdditions,
} from "@/lib/export-module-additions";

export type ExportAdditionsLoadState = "loading" | "ready" | "error";

export interface UseExportModuleAdditionsReturn {
  loadState: ExportAdditionsLoadState;
  loadError: string | null;
  /** Set when the most recent write to the database failed - never
   * swallowed, mirrors useRepoPairing's own `persistError`. */
  persistError: string | null;
  /** The course_hub row this hook is persisting against, or null until it
   * has resolved (or there genuinely is none - e.g. an unsaved selection).
   * `exportEditUnavailableReason` (src/lib/export-module-additions.ts) is
   * how a caller turns this into a rendered reason. */
  courseId: string | null;
  /** Every addition whose moduleRef is present in the currently-loaded
   * export tree (AC4) - safe to pass straight into
   * `cartridgeModulesToDisplay`'s optional second argument. */
  active: readonly ExportModuleAddition[];
  /** Every stored addition that is NOT currently active (AC4 - "rendered in
   * their own list rather than dropped silently"). Never mutated out of
   * storage; purely a read-time view. */
  inactive: readonly ExportModuleAddition[];
  /** Adds one new item to `moduleRef` and persists immediately. Generates a
   * fresh id/timestamp itself so callers never invent one. */
  addItem: (moduleRef: string, fields: { title: string; type: string; body?: string }) => void;
  /** Removes one addition by its own id and persists immediately (AC "add
   * and remove only" - see export-module-additions.ts's own comment on why
   * editing is deferred). */
  removeItem: (id: string) => void;
}

/**
 * `exportModules` is exactly ModulesView's own prop of the same name -
 * `undefined`/`null` while the active source isn't a loaded export (either
 * genuinely mid-load, per `exportContent`'s own null-while-loading state in
 * ContentTab.tsx, or because the active source is live Canvas, which simply
 * never populates it) - this hook treats both the same way: "nothing loaded
 * to activate against yet", never "the tree is empty", so `readyModuleRefs`
 * below is never advanced from either state.
 */
export function useExportModuleAdditions(
  courseUrl: string,
  exportCourseId: string | undefined,
  exportModules: readonly CartridgeModule[] | null | undefined
): UseExportModuleAdditionsReturn {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [stored, setStored] = useState<ExportModuleAdditions>(emptyExportModuleAdditions());
  const [loadState, setLoadState] = useState<ExportAdditionsLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);

  // Render-time reset (see useRepoPairing.ts's own header comment on this
  // idiom - this repo's eslint forbids reaching setState synchronously from
  // inside an effect body): identifying a DIFFERENT course resets
  // loadState to "loading" BEFORE the effect below ever runs.
  const [prevCourseUrl, setPrevCourseUrl] = useState(courseUrl);
  const [prevExportCourseId, setPrevExportCourseId] = useState(exportCourseId);
  if (courseUrl !== prevCourseUrl || exportCourseId !== prevExportCourseId) {
    setPrevCourseUrl(courseUrl);
    setPrevExportCourseId(exportCourseId);
    setLoadState("loading");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = exportCourseId
        ? await resolveLmsCourseRowByIdAction(exportCourseId)
        : courseUrl
          ? await resolveLmsCourseRowAction(courseUrl)
          : null;
      if (cancelled) return;

      if (!result) {
        setCourseId(null);
        setStored(emptyExportModuleAdditions());
        setLoadError(null);
        setLoadState("ready");
        return;
      }
      if ("error" in result) {
        setCourseId(null);
        setLoadError(result.error);
        setLoadState("error");
        return;
      }

      setCourseId(result.course.id);
      setLoadError(null);
      setStored(coerceExportModuleAdditions(result.course.exportModuleAdditions));
      setLoadState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, exportCourseId]);

  // Persist every change to the database - the sole write path, covering
  // every add/remove below. Cancellation-guarded; a failure is surfaced via
  // `persistError` rather than swallowed.
  useEffect(() => {
    if (!courseId || loadState !== "ready") return;
    let cancelled = false;
    (async () => {
      const result = await setCourseExportModuleAdditionsAction(courseId, stored);
      if (cancelled) return;
      setPersistError("error" in result ? result.error : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, stored, loadState]);

  // ── AC4 - gate the activation recompute on a LOADED export tree ─────────
  const moduleRefs = useMemo(
    () => (Array.isArray(exportModules) ? exportModules.filter((m) => m.identifier != null).map((m) => m.identifier as string) : null),
    [exportModules]
  );
  const [readyModuleRefs, setReadyModuleRefs] = useState<readonly string[]>(moduleRefs ?? []);
  if (moduleRefs !== null && moduleRefs !== readyModuleRefs) {
    setReadyModuleRefs(moduleRefs);
  }

  const activation = useMemo(
    () => activateExportModuleAdditions(stored.additions, readyModuleRefs),
    [stored.additions, readyModuleRefs]
  );

  const addItem = (moduleRef: string, fields: { title: string; type: string; body?: string }) => {
    const title = fields.title.trim();
    if (!title || !moduleRef) return;
    const addition: ExportModuleAddition = {
      id: `exadd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      moduleRef,
      title,
      type: fields.type,
      addedAt: new Date().toISOString(),
    };
    const body = (fields.body ?? "").trim();
    if (body) addition.body = body;
    setStored((prev) => ({ ...prev, additions: appendExportModuleAddition(prev.additions, addition) }));
  };

  const removeItem = (id: string) => {
    setStored((prev) => ({ ...prev, additions: removeExportModuleAddition(prev.additions, id) }));
  };

  return {
    loadState,
    loadError,
    persistError,
    courseId,
    active: activation.active,
    inactive: activation.inactive,
    addItem,
    removeItem,
  };
}
