"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Button from "@mui/material/Button";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listCourseContentAction,
  listAddableContentAction,
  resolveLmsCourseRowAction,
} from "../actions";
import CoursePicker from "./CoursePicker";
import InstitutionSwitcher from "./InstitutionSwitcher";
import type {
  CanvasModule,
  CanvasPageSummary,
  CanvasAddableContent,
} from "@/lib/canvas-modules";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { useLlmProvider } from "@/lib/llm-provider";
import { useInstitutionSelection } from "@/lib/institutions";
import { useSupabase } from "@/context/SupabaseProvider";
import { readExportCourseContentById } from "@/lib/lms-export-source";
import type { ExportCourseContent } from "@/lib/lms-export-source";
import { latestSourceExportFile } from "@/lib/courses-table-helpers";
import type { Database } from "@/lib/supabase/types";
import {
  describeExportFallbackAfterLiveFailure,
  describeLiveSelectionNeedsInstitution,
} from "@/lib/course-picker-availability";
import type { ContentSourceContext } from "./content-tab/contentSourceGating";
import styles from "../page.module.css";
import {
  CONTENT_URL_KEY,
  type ContentView,
} from "./content-tab/constants";
import type { LoadState } from "./content-tab/types";
import {
  parseContentSelection,
  serializeContentSelection,
  contentSelectionKey,
  EMPTY_CONTENT_SELECTION,
  type ContentSelection,
} from "./content-tab/content-selection";
import { PageEditorModal } from "./content-tab/PageEditorModal";
import { PagesView } from "./content-tab/PagesView";
import { CourseCopyModal } from "./content-tab/CourseCopyModal";
import { FilesView } from "./content-tab/FilesView";
import { ModulesView } from "./content-tab/ModulesView";



/**
 * Whether the course picker offers export-sourced courses. TRUE as of
 * docs/REGRESSION.md entry 264 check 9's type widening.
 *
 * The render path this flag used to gate now exists: `loadContent`'s export
 * branch fills `exportContent`, real state ModulesView reads (not the
 * write-only `exportContentRef` this used to be), and converts via
 * `display-module-tree.ts`'s `DisplayModule`/`DisplayModuleItem` - a view
 * model with every Canvas-only field OPTIONAL rather than a widening of
 * `CanvasModuleItem` itself (that type stays exactly as it was, since the
 * Canvas write layer genuinely requires those fields everywhere else).
 * `ModuleCard`/`ModuleItemRow`/`AddItemRow` are retyped against it: a live
 * item/module carries its exact original `CanvasModule`/`CanvasModuleItem`
 * under `.raw` (never fabricated - the same reference, not a clone) for the
 * write controls that need it; an export item/module has no `.raw` and
 * renders the smaller, honest read/select-only row those three components'
 * own early-return branches define. Verified end to end with a standalone
 * fixture rendering the real (unmodified) components against a realistic
 * fake cartridge tree in headless Chrome - see this feature's own
 * assignment notes for what that fixture showed.
 *
 * Every write control an export item/module cannot support was ALREADY
 * gated off by `contentSourceGating.ts` (entry 264 check 8) before this flag
 * existed; that table composed unchanged - it keys purely on
 * `{source, hasLiveCourse}` and never introspects an item's fields, so
 * nothing about it needed to change for the type widening above.
 *
 * One known gap: `hasLiveCourse` is hardcoded `false` whenever the active
 * selection is export-sourced (see `sourceContext` above), because the
 * persisted export selection carries no `canvasUrl` to check - a course with
 * BOTH a live Canvas connection and a stored export currently reads the
 * stricter "no live course" gating reason instead of the more precise
 * "no Canvas identity" one while viewing its export. Follow-up, not a
 * fabrication: it only ever makes gating MORE conservative, never less.
 */
const EXPORT_COURSES_SELECTABLE = true;

/**
 * Recovery path for a failed LIVE read (live branch of `loadContent` and of
 * the mount auto-load effect below). Live-Canvas set up (an institution
 * acronym) and a working live-Canvas CONNECTION are two different things - an
 * acronym only selects which `<ACRONYM>_CANVAS_URL` / `_CANVAS_API_TOKEN` env
 * vars to try, and a school can be registered with neither set (a
 * live-report bug: WNCC has stored exports for every course and no live LMS
 * connection at all, so `listCourseContentAction` always throws
 * `resolveInstitutionByCode`'s raw "Canvas base URL is not configured for
 * WNCC..." and the tab dead-ended there instead of falling back to the same
 * course's export, which would have loaded fine).
 *
 * Resolves this course's `course_hub` row by its Canvas URL
 * (`resolveLmsCourseRowAction`, the same lookup `readExportCourseContent`
 * uses), checks whether it has a usable instructor-provided export
 * (`latestSourceExportFile` - the same predicate `canImport`/
 * `lmsRenderSourcesFor` use, so this agrees with what the export chip section
 * would have offered), and if so reads it
 * (`readExportCourseContentById`). Returns `null` on ANY failure along the
 * way (no linked row, no source export, or the export itself fails to read)
 * so the caller's existing live-error handling runs completely unchanged -
 * this never throws and never replaces the original live error itself, it
 * only ever adds a successful alternative in front of it.
 */
async function tryExportFallbackForFailedLiveRead(
  supabase: SupabaseClient<Database>,
  courseUrl: string
): Promise<{ courseId: string; content: ExportCourseContent } | null> {
  const resolved = await resolveLmsCourseRowAction(courseUrl);
  if ("error" in resolved) return null;
  if (!latestSourceExportFile(resolved.course)) return null;
  const content = await readExportCourseContentById(supabase, resolved.course.id);
  if ("error" in content) return null;
  return { courseId: resolved.course.id, content };
}

export default function ContentTab({
  view,
  grading,
  announcements,
  inbox,
  versionControl,
}: {
  view: ContentView;
  grading?: ReactNode;
  announcements?: ReactNode;
  inbox?: ReactNode;
  versionControl?: ReactNode;
}) {
  const { active: activeInstitution } = useInstitutionSelection();
  const [provider] = useLlmProvider();
  const { supabase } = useSupabase();

  // Which course, and which of its two Course Content sources (live Canvas,
  // or a stored export - src/lib/lms-export-source) to read from. Replaces
  // the bare Canvas-URL string this tab used to persist directly: an
  // export-only course_hub row has no Canvas URL at all, so a plain string
  // could never name it (docs/REGRESSION.md entry 263's Limits). See
  // content-tab/content-selection.ts for the persisted shape and its
  // migration from that legacy bare string.
  const [selection, setSelection] = useState<ContentSelection>(() =>
    typeof window !== "undefined" ? parseContentSelection(localStorage.getItem(CONTENT_URL_KEY)) : EMPTY_CONTENT_SELECTION
  );
  // The live Canvas URL, derived from `selection` - "" whenever the active
  // selection is export-sourced (there may be no Canvas URL for that course
  // at all). Every prop/effect below that talks to the live Canvas API
  // (ensureTargets, ModulesView/FilesView, the copy/import buttons) keys off
  // this exactly as it did when it was the state variable directly, so an
  // export-sourced selection naturally disables all of them rather than
  // needing a separate guard at each call site.
  const courseUrl = selection.source === "live" ? selection.courseUrl : "";
  // The export counterpart of `courseUrl` above: an export selection's own
  // course_hub row id, undefined whenever the active selection is live
  // (there is no such row id to name for a live-only course). FINDING 1 fix
  // (docs/REGRESSION.md entry 274): `courseUrl` collapses to "" for EVERY
  // export selection, so it can never identify one on its own - this is the
  // identifier ModulesView/useSelectionDownload actually need to reach POST
  // /api/lms-export/selection's export branch (route.ts's own
  // readExportCourseContentById). Threaded through exactly the way
  // `courseUrl` already is, never replacing it - other callers of `courseUrl`
  // (live-only ones) are unaffected.
  const exportCourseId = selection.source === "export" ? selection.courseId : undefined;
  const [courseName, setCourseName] = useState("");
  const [modules, setModules] = useState<CanvasModule[]>([]);
  const [pages, setPages] = useState<CanvasPageSummary[]>([]);
  // The second Course Content source (a stored LMS export, read instead of
  // the live Canvas API - src/lib/lms-export-source). Populated by
  // loadContent's "export" branch below, reached once the picker
  // (CoursePicker's "Courses with a saved export" section) selects an
  // export-sourced course. REAL STATE, not a ref: ModulesView renders
  // `exportContent.modules` (via display-module-tree.ts's converters) once
  // the type widening entry 264 check 9 named is in place, so a change here
  // now needs to trigger a re-render, unlike when this was write-only.
  // Kept separate from `modules`/`pages` rather than merged into them
  // because those two are typed for the live shape (ModulesView/PagesView
  // expect CanvasModule[]/CanvasPageSummary[]); an export-sourced course
  // cannot fill that shape without fabricating Canvas-only fields (see
  // lms-export-source's header comment), so it gets its own slot instead of
  // a forced, lossy cast.
  const [exportContent, setExportContent] = useState<ExportCourseContent | null>(null);
  // Which Course Content source is active, and whether a live Canvas course
  // is linked to write to - see content-tab/contentSourceGating.ts. A live
  // selection always has one (it IS that course); an export selection's
  // persisted shape (content-tab/content-selection.ts) carries no canvasUrl
  // at all, so whether this course ALSO has a live Canvas course linked is
  // not yet knowable here - `false` is the honest, if conservative, answer
  // until a course_hub read threads that fact through too (a real, called-
  // out follow-up, not a fabrication: it only ever makes gating STRICTER,
  // never lets an ungated write through).
  const sourceContext: ContentSourceContext = useMemo(
    () => ({ source: selection.source === "export" ? "export" : "canvas", hasLiveCourse: selection.source !== "export" }),
    [selection.source]
  );
  const [targets, setTargets] = useState<CanvasAddableContent | null>(null);
  const targetsLoadingRef = useRef(false);

  // Lazily fetch the existing-content lists the first time a picker needs them.
  const ensureTargets = async () => {
    if (targets || targetsLoadingRef.current || !courseUrl) return;
    targetsLoadingRef.current = true;
    const result = await listAddableContentAction(courseUrl, activeInstitution || undefined);
    targetsLoadingRef.current = false;
    if (!("error" in result)) setTargets(result.content);
  };
  const [loadState, setLoadState] = useState<LoadState>(() => {
    if (typeof window === "undefined") return { status: "idle", message: "" };
    const sel = parseContentSelection(localStorage.getItem(CONTENT_URL_KEY));
    const hasTarget = sel.source === "export" ? !!sel.courseId : !!parseCanvasCourseId(sel.courseUrl);
    // AC3 / REGRESSION entry 295 check 2: this used to require
    // `activeInstitution` regardless of source, so an export target sat in
    // "idle" (not "loading") until an acronym was registered even though
    // the mount effect below is about to restore it with no institution at
    // all. An export target only ever needs `hasTarget` - the mount
    // effect's export branch runs unconditionally - while a live target
    // still needs an institution, since its branch resolves the Canvas
    // host from it exactly as before.
    const willAutoLoad = hasTarget && (sel.source === "export" || !!activeInstitution);
    return { status: willAutoLoad ? "loading" : "idle", message: "" };
  });
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPageUrl, setEditorPageUrl] = useState<string | null>(null);
  // Course copy/import tool: "export" copies this course out, "import" pulls in.
  const [copyMode, setCopyMode] = useState<"export" | "import" | null>(null);

  // Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md,
  // wave R3 slice A): both PageEditorModal and CourseCopyModal have their
  // OPEN state here, so per decision 4 (one ref per dialog, not per opener)
  // both dialogs' captured refs live here too, even though most of their
  // openers sit in child components one or two boundaries away
  // (ModuleItemRow.tsx, BulkItemsSection.tsx and ModulesHeaderBar.tsx all
  // receive a sibling trigger callback the same way R2 established -
  // ModulesView.tsx's own onSchedulerTrigger/onBulkUploadTrigger etc. -
  // rather than a ref itself crossing a component boundary). PageEditorModal
  // has FOUR openers across three files (ModuleItemRow.tsx's row
  // "Edit page", BulkItemsSection.tsx's single-item "Edit page", and
  // PagesView.tsx's per-card "Edit" and "New page"); CourseCopyModal has
  // four too (this file's own "Copy to…"/"Import from…" and
  // ModulesHeaderBar.tsx's matching pair, threaded through onExport/onImport
  // exactly as they already are below).
  const pageEditorTriggerRef = useRef<HTMLElement | null>(null);
  const onPageEditorTrigger = (trigger: HTMLElement) => {
    pageEditorTriggerRef.current = trigger;
  };
  const copyModalTriggerRef = useRef<HTMLElement | null>(null);
  const onCopyModalTrigger = (trigger: HTMLElement) => {
    copyModalTriggerRef.current = trigger;
  };

  // Fallback containers (decision 2, AC5). ModulesView.tsx's own row/bulk-bar
  // fallbacks (modulesListFallbackRef, headerFallbackRef - wave R2) live
  // INSIDE that component and are never exposed outward, so they cannot back
  // an opener whose dialog state lives here, one component boundary further
  // out than R2 ever threaded - this file needs its own fallbacks rather
  // than reaching into ModulesView's internals.
  // `resultsHeaderFallbackRef` is the nearer of the two: it wraps
  // CourseCopyModal's own two direct openers below, and - since its render
  // gate is `view !== "modules"`, the same condition that gates PagesView
  // itself on - it is also present whenever either of PagesView's two
  // openers is reachable. It is NOT rendered while on the Modules tab, so for
  // a ModuleItemRow/BulkItemsSection-triggered open this candidate is null at
  // CAPTURE time (open) and useModalDismiss.ts's null filter drops it before
  // the candidate array is even built - it never reaches the close-time
  // connected check, though the outcome is the same: the array collapses to
  // [opener, cardFallbackRef]. `cardFallbackRef` is `styles.card`, the
  // outermost element of this component's own render,
  // which outlives every view switch and both dialogs for as long as this
  // component itself is mounted. Ordered nearest-first per
  // docs/REGRESSION.md entry 291 AC3. Neither is a new wrapper: both refs
  // attach to elements this file already renders below.
  const resultsHeaderFallbackRef = useRef<HTMLElement | null>(null);
  const cardFallbackRef = useRef<HTMLElement | null>(null);

  // Reset to a clean slate during render when the institution changes — the
  // loaded content belonged to the previous school. AC3b / REGRESSION entry
  // 295 check 3 narrows this to a LIVE selection only: an institution
  // acronym is purely a live-Canvas credential selector, so nothing about an
  // export-sourced selection is institution-scoped
  // (readExportCourseContentById is owner-scoped and never calls Canvas).
  // Clearing it unconditionally - as this block used to - would, once AC1
  // lifts the render gate that used to hide this tab whenever there was no
  // institution, introduce a brand-new way to lose an export selection:
  // registering a FIRST acronym (a transition into a non-empty
  // activeInstitution, exactly like any other change here) would wipe it
  // for no reason tied to the content itself. `selection`, `exportContent`,
  // `courseName`, `expanded` and `loadState` are therefore only reset when
  // the selection being replaced is live; a live selection is still cleared
  // exactly as it always was (that content DID belong to the previous
  // school). `modules`/`pages`/`targets` stay unconditional - they are
  // either genuinely stale (live) or already empty/null (export, since
  // loadContent's export branch never populates them), so clearing them is
  // correct either way and does not need the same branch. `prevInstitution`
  // itself is still updated on every pass so this block does not re-fire on
  // the next render.
  const [prevInstitution, setPrevInstitution] = useState(activeInstitution);
  if (activeInstitution !== prevInstitution) {
    setPrevInstitution(activeInstitution);
    setModules([]);
    setPages([]);
    setTargets(null);
    setNote(null);
    setEditorOpen(false);
    if (selection.source !== "export") {
      setExportContent(null);
      setCourseName("");
      setSelection(EMPTY_CONTENT_SELECTION);
      setExpanded(new Set());
      setLoadState({ status: "idle", message: "" });
    }
  }

  // Tell the global AccessibilityProvider which course is loaded so it can scan
  // it in the background; fires on mount and whenever the course/school changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("ta-course-changed", { detail: { courseUrl, courseName } }));
  }, [courseUrl, courseName, activeInstitution]);

  // `silent` re-fetches without swapping the content for the loading spinner, so
  // a reload keeps the page mounted (scroll position, open accordions, and the
  // selected subtab are all preserved as the modules/pages update in place).
  //
  // `sel` selects both the course AND which of the two Course Content
  // sources to read from - see content-tab/content-selection.ts. A "live"
  // selection hits the live Canvas API via listCourseContentAction and fills
  // `modules`/`pages`, exactly as before source selection existed. An
  // "export" selection reads the course's stored LMS export instead
  // (src/lib/lms-export-source) and fills `exportContent` instead - that
  // shape cannot be forced into `modules`/`pages` (typed for the live shape
  // ModulesView/PagesView expect) without fabricating Canvas-only fields an
  // export never carries, so it gets its own slot (ModulesView converts it
  // to the shared display model - src/app/components/content-tab/
  // display-module-tree.ts - rather than this component doing so). Every
  // call site now threads the full selection through (CoursePicker's two
  // sections both resolve to a concrete ContentSelection - see
  // handleSelectCourse/handleSelectExportCourse below), so a live
  // selection's behaviour stays byte-identical to before this parameter
  // existed.
  const loadContent = async (sel: ContentSelection, silent = false) => {
    if (typeof window !== "undefined") localStorage.setItem(CONTENT_URL_KEY, serializeContentSelection(sel));
    if (!silent) setLoadState({ status: "loading", message: "" });
    setNote(null);
    setTargets(null);

    if (sel.source === "export") {
      const result = await readExportCourseContentById(supabase, sel.courseId);
      if ("error" in result) {
        if (silent) {
          setNote({ kind: "error", text: result.error });
          return;
        }
        setExportContent(null);
        setCourseName("");
        setLoadState({ status: "error", message: result.error });
        return;
      }
      setCourseName(result.courseName);
      setExportContent(result);
      setModules([]);
      setPages([]);
      if (!silent) setLoadState({ status: "idle", message: "" });
      return;
    }

    const id = parseCanvasCourseId(sel.courseUrl);
    if (!id) return;
    const result = await listCourseContentAction(sel.courseUrl, activeInstitution || undefined);
    if ("error" in result) {
      // Recovery path (see tryExportFallbackForFailedLiveRead's own comment):
      // the live read failed, but this same course may have a stored
      // instructor-provided export that reads fine. Only ever adds a
      // successful alternative in front of the original live error - never
      // fires for an already-export-sourced `sel` (this is the live branch),
      // and never runs when the live read itself succeeded.
      const fallback = await tryExportFallbackForFailedLiveRead(supabase, sel.courseUrl);
      if (fallback) {
        const nextSelection: ContentSelection = { source: "export", courseId: fallback.courseId };
        setSelection(nextSelection);
        if (typeof window !== "undefined") localStorage.setItem(CONTENT_URL_KEY, serializeContentSelection(nextSelection));
        setCourseName(fallback.content.courseName);
        setExportContent(fallback.content);
        setModules([]);
        setPages([]);
        setNote({ kind: "error", text: describeExportFallbackAfterLiveFailure(result.error) });
        if (!silent) setLoadState({ status: "idle", message: "" });
        return;
      }
      if (silent) {
        // Keep the current content rather than blanking it on a background refresh.
        setNote({ kind: "error", text: result.error });
        return;
      }
      setModules([]);
      setPages([]);
      setCourseName("");
      setLoadState({ status: "error", message: result.error });
      return;
    }
    setCourseName(result.courseName);
    setModules(result.modules);
    setPages(result.pages);
    setExportContent(null);
    if (!silent) setLoadState({ status: "idle", message: "" });
  };

  // Auto-load the remembered course/source on mount (await-first so no sync
  // setState). Mirrors loadContent's non-silent branches rather than calling
  // loadContent itself, so a `cancelled` flag can guard every setState
  // individually against an unmount/institution-swap race during the initial
  // fetch - loadContent is otherwise only ever called from user-driven
  // handlers, which don't need that guard.
  useEffect(() => {
    const sel =
      typeof window !== "undefined" ? parseContentSelection(localStorage.getItem(CONTENT_URL_KEY)) : EMPTY_CONTENT_SELECTION;
    let cancelled = false;

    // AC3 / REGRESSION entry 295 check 2: the `if (!activeInstitution)
    // return;` guard used to sit here, before this branch even looked at
    // `sel.source`, so a remembered EXPORT selection was never restored
    // without an institution either - even though restoring it calls
    // `readExportCourseContentById`, which is owner-scoped and never calls
    // Canvas, so it needs no acronym at all. The guard is intentionally NOT
    // deleted (only moved into the live branch below, after this export
    // branch has already run): the live branch's
    // `listCourseContentAction(sel.courseUrl, activeInstitution || undefined)`
    // genuinely resolves the Canvas host from the acronym, so firing it with
    // no institution for every remembered live course would be wrong.
    if (sel.source === "export") {
      if (!sel.courseId) return;
      (async () => {
        const result = await readExportCourseContentById(supabase, sel.courseId);
        if (cancelled) return;
        if ("error" in result) {
          setLoadState({ status: "error", message: result.error });
          return;
        }
        setCourseName(result.courseName);
        setExportContent(result);
        setModules([]);
        setPages([]);
        setLoadState({ status: "idle", message: "" });
      })();
      return () => {
        cancelled = true;
      };
    }

    // Live branch only, per the comment above: unlike the export branch,
    // this one genuinely cannot proceed without an institution, since it is
    // what resolves the Canvas host to fetch from.
    if (!activeInstitution) return;
    if (!parseCanvasCourseId(sel.courseUrl)) return;
    (async () => {
      const result = await listCourseContentAction(sel.courseUrl, activeInstitution || undefined);
      if (cancelled) return;
      if ("error" in result) {
        // Same recovery path as loadContent's live branch above (see
        // tryExportFallbackForFailedLiveRead's own comment) - a second await,
        // so `cancelled` is checked again before any setState it reaches.
        const fallback = await tryExportFallbackForFailedLiveRead(supabase, sel.courseUrl);
        if (cancelled) return;
        if (fallback) {
          const nextSelection: ContentSelection = { source: "export", courseId: fallback.courseId };
          setSelection(nextSelection);
          if (typeof window !== "undefined") localStorage.setItem(CONTENT_URL_KEY, serializeContentSelection(nextSelection));
          setCourseName(fallback.content.courseName);
          setExportContent(fallback.content);
          setModules([]);
          setPages([]);
          setNote({ kind: "error", text: describeExportFallbackAfterLiveFailure(result.error) });
          setLoadState({ status: "idle", message: "" });
          return;
        }
        setLoadState({ status: "error", message: result.error });
        return;
      }
      setCourseName(result.courseName);
      setModules(result.modules);
      setPages(result.pages);
      setLoadState({ status: "idle", message: "" });
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: switching institutions clears a LIVE selection via the
    // narrowed AC3b reset above; an export selection is untouched by an
    // institution change and this effect does not need to re-run for either
    // case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectCourse = (url: string) => {
    const next: ContentSelection = { source: "live", courseUrl: url };
    setSelection(next);
    setLoadState({ status: "idle", message: "" });
    void loadContent(next);
  };

  const handleSelectExportCourse = (exportCourseId: string) => {
    const next: ContentSelection = { source: "export", courseId: exportCourseId };
    setSelection(next);
    setLoadState({ status: "idle", message: "" });
    void loadContent(next);
  };

  const reload = () => {
    const hasTarget = selection.source === "export" ? !!selection.courseId : !!selection.courseUrl;
    if (hasTarget) void loadContent(selection, true);
  };

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openEditor = (pageUrl: string | null) => {
    setEditorPageUrl(pageUrl);
    setEditorOpen(true);
  };

  const courseId = parseCanvasCourseId(courseUrl);
  // A REMEMBERED live selection with no institution selected (docs/
  // REGRESSION.md entry 295's follow-up finding, filed against the AC1 gate
  // removal above). Before that gate came off, this state rendered nothing
  // at all - the whole tab body sat behind `{activeInstitution && ...}`. Now
  // it is reachable for real (an instructor can remove their last acronym,
  // or arrive before selecting one) and the mount effect deliberately does
  // NOT fetch for it (the live branch needs an acronym to resolve a Canvas
  // host), so `loadState` stays "idle" while `courseId` still parses truthy
  // from localStorage. Left alone, `loaded` below would read true with
  // nothing fetched - ModulesView would render with `modules={[]}` and no
  // note, an EMPTY COURSE THAT LOOKS REAL, precisely the failure mode
  // REGRESSION entry 264 check 9 warned about ("An empty course that looks
  // real is a worse failure than an absent option"). `loaded` is therefore
  // forced false in this case, and the render below shows
  // `describeLiveSelectionNeedsInstitution()` in place of the generic
  // "Load a course above..." empty state. An EXPORT selection is untouched -
  // it needs no acronym at all, so this only ever narrows the live path.
  const liveSelectionNeedsInstitution = selection.source !== "export" && !!courseId && !activeInstitution;
  // An export-source selection needs no Canvas course id to be "loaded" -
  // that is exactly the structural gap this feature closes (see this file's
  // header intent in the assignment: a course_hub row with no canvasUrl was
  // previously unreachable here because `loaded` hard-gated on courseId).
  // A live selection behaves exactly as before, except for the
  // `liveSelectionNeedsInstitution` case just above.
  const loaded = useMemo(
    () =>
      !liveSelectionNeedsInstitution &&
      loadState.status === "idle" &&
      (selection.source === "export" ? !!selection.courseId : !!courseId),
    [loadState.status, selection, courseId, liveSelectionNeedsInstitution]
  );
  // Subtabs that act on the course loaded here. The rest (Grading, Announcements,
  // Inbox) carry their own course picker / are institution-scoped, so they work
  // without loading a course in this tab.
  const courseTab = view === "modules" || view === "pages" || view === "files";

  return (
    <div
      className={styles.card}
      // Focus-restoration fallback of last resort (see this file's own refs
      // block above) - outlives every view switch and both PageEditorModal
      // and CourseCopyModal, so it is only ever reached when a nearer
      // candidate is unavailable.
      ref={(el) => {
        cardFallbackRef.current = el;
      }}
      // tabIndex={-1} is required for the .focus() call above to do anything
      // (useModalDismiss.ts), but this is this tab's ENTIRE outermost div - a
      // much larger surface than this pattern's precedent (a module-list
      // wrapper). In Chrome/Safari a mousedown on anything non-focusable
      // inside it now focuses the container; harmless to the mechanism
      // (nothing reads document.activeElement) and :focus-visible should
      // suppress a ring on pointer input, but the blast radius is real and
      // was otherwise unrecorded (wave R3 bug report finding 4).
      tabIndex={-1}
    >

      {view !== "version-control" && (
        <div className={styles.field}>
          <label>Institution</label>
          <InstitutionSwitcher metric="both" />
        </div>
      )}

      {/*
       * AC1 / REGRESSION entry 295 check 1: this Fragment used to be wrapped
       * in `{activeInstitution && ( ... )}`, gating the course picker, the
       * export chip section, the loading/empty states and
       * ModulesView/PagesView/FilesView themselves behind a live-Canvas
       * credential. An institution acronym is nothing but that credential
       * selector (see EXPORT_COURSES_SELECTABLE's comment above); reading a
       * stored export needs no credential at all -
       * `readExportCourseContentById` is owner-scoped and never calls
       * Canvas - so gating the WHOLE tab on one meant an instructor with no
       * live LMS connection and no registered acronym could not reach
       * content that is defined by not needing one. The InstitutionSwitcher
       * block above is unchanged and still self-degrades with its own
       * "No institutions yet..." hint (InstitutionSwitcher.tsx:19); that
       * wording is deliberately not duplicated here, per AC1. Per AC6/AC8,
       * nothing below gained a new guard when this wrapper came off: every
       * live-only call site (ensureTargets, loadContent's live branch,
       * CourseCopyModal, PageEditorModal, FilesView, ModulesView's acronym
       * prop) still passes `activeInstitution || undefined` unchanged and
       * is independently self-disabling because it keys on `courseUrl`,
       * which is "" for every export selection - verified per call site in
       * the "Reuse notes" section of
       * docs/export-only-course-content-acceptance-criteria.md.
       */}
      <>
          {courseTab && (
            <CoursePicker
              activeInstitution={activeInstitution}
              courseUrl={courseUrl}
              onSelect={handleSelectCourse}
              loadError={loadState.status === "error" ? loadState.message : null}
              courseName={courseName}
              showExportCourses={EXPORT_COURSES_SELECTABLE}
              selectedExportCourseId={selection.source === "export" ? selection.courseId : null}
              onSelectExport={handleSelectExportCourse}
            />
          )}

          {courseTab && view !== "modules" && loaded && (
            <div
              className={styles.resultsHeader}
              // Focus-restoration fallback (this file's own refs block
              // above) - the nearer of this file's two candidates; see that
              // comment for why it doubles as the fallback for PagesView's
              // openers too.
              ref={(el) => {
                resultsHeaderFallbackRef.current = el;
              }}
              tabIndex={-1}
            >
              <h2>{courseName || "Course content"}</h2>
              <div className={styles.ccBar} style={{ padding: 0 }}>
                <div className={styles.ccBarGroup}>
                  <span className={styles.ccBarLabel}>Course copy</span>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(e) => {
                      onCopyModalTrigger(e.currentTarget);
                      setCopyMode("export");
                    }}
                    disabled={!courseId}
                    title="Copy this course's content into other courses"
                  >
                    Copy to…
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(e) => {
                      onCopyModalTrigger(e.currentTarget);
                      setCopyMode("import");
                    }}
                    disabled={!courseId}
                    title="Import another course's content into this one"
                  >
                    Import from…
                  </Button>
                </div>

                <span className={styles.ccBarDivider} aria-hidden="true" />

                <Button
                  variant="outlined"
                  size="small"
                  onClick={reload}
                  disabled={busy || loadState.status === "loading"}
                  title="Reload this course's content"
                >
                  {loadState.status === "loading" ? "Refreshing…" : "Refresh"}
                </Button>
              </div>
            </div>
          )}

          {courseTab && copyMode && courseId && (
            <CourseCopyModal
              mode={copyMode}
              courseUrl={courseUrl}
              currentCourseId={courseId}
              acronym={activeInstitution || undefined}
              onClose={() => setCopyMode(null)}
              onDone={() => {
                setCopyMode(null);
                if (copyMode === "import") reload();
              }}
              restoreFocusRef={copyModalTriggerRef}
              fallbackFocusRefs={[resultsHeaderFallbackRef, cardFallbackRef]}
            />
          )}

          {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}

          {courseTab && loadState.status === "loading" && (
            <div className={styles.loadingState} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <div>
                <p className={styles.loadingTitle}>Loading course content…</p>
              </div>
            </div>
          )}

          {courseTab && !loaded && loadState.status !== "loading" && (
            <p className={styles.emptyState}>
              {liveSelectionNeedsInstitution
                ? describeLiveSelectionNeedsInstitution()
                : `Load a course above to work with its ${view}.`}
            </p>
          )}

          {view === "grading" ? (
            grading
          ) : view === "announcements" ? (
            announcements
          ) : view === "inbox" ? (
            inbox
          ) : !loaded ? null : view === "modules" ? (
            <ModulesView
              // Remounts ModulesView (and its useModuleSelection instance) whenever
              // the loaded course OR source changes, so a bulk selection made in one
              // course can never be read - or acted on - against a different course's
              // module/item ids. useModuleSelection already self-prunes any
              // selected key/id that stops matching the current `modules` prop
              // (see pruneSelectionForModules in useModuleSelection.ts), which
              // covers this today since Canvas ids are unique across courses -
              // but that's incidental, not a guarantee this component should lean
              // on, so it's paired with an explicit reset here.
              //
              // Keyed on contentSelectionKey(selection), NOT the plain `courseUrl`
              // this used to key on: `courseUrl` collapses to "" for EVERY
              // export-only course (there is no Canvas URL at all), so two
              // DIFFERENT export-only courses would otherwise share one key and
              // never remount between them - letting useModuleSelection's Sets and
              // useLmsGeneration's preview state leak from one course into the
              // other (docs/REGRESSION.md entry 260 checks 1/2).
              key={contentSelectionKey(selection)}
              courseUrl={courseUrl}
              exportCourseId={exportCourseId}
              acronym={activeInstitution || undefined}
              modules={modules}
              exportModules={exportContent?.modules}
              sourceContext={sourceContext}
              targets={targets}
              ensureTargets={() => void ensureTargets()}
              busy={busy}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onEditPage={(pageUrl) => openEditor(pageUrl)}
              onPageEditorTrigger={onPageEditorTrigger}
              setModules={setModules}
              reload={reload}
              setNote={setNote}
              setBusy={setBusy}
              courseName={courseName}
              onExport={() => setCopyMode("export")}
              onImport={() => setCopyMode("import")}
              onCopyModalTrigger={onCopyModalTrigger}
              refreshing={loadState.status === "loading"}
              canCopy={!!courseId}
            />
          ) : view === "pages" ? (
            <PagesView
              pages={pages}
              onNewPage={() => openEditor(null)}
              onEditPage={(pageUrl) => openEditor(pageUrl)}
              onPageEditorTrigger={onPageEditorTrigger}
              sourceContext={sourceContext}
            />
          ) : view === "files" ? (
            <FilesView
              courseUrl={courseUrl}
              acronym={activeInstitution || undefined}
              modules={modules}
              sourceContext={sourceContext}
            />
          ) : null}
      </>

      {view === "version-control" && versionControl}

      {editorOpen && courseId && (
        <PageEditorModal
          courseUrl={courseUrl}
          acronym={activeInstitution || undefined}
          provider={provider}
          pageUrl={editorPageUrl}
          onClose={() => setEditorOpen(false)}
          onSaved={reload}
          restoreFocusRef={pageEditorTriggerRef}
          fallbackFocusRefs={[resultsHeaderFallbackRef, cardFallbackRef]}
        />
      )}
    </div>
  );
}
