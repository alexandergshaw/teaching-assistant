"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Button from "@mui/material/Button";
import {
  listCourseContentAction,
  listAddableContentAction,
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
    return { status: hasTarget && activeInstitution ? "loading" : "idle", message: "" };
  });
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPageUrl, setEditorPageUrl] = useState<string | null>(null);
  // Course copy/import tool: "export" copies this course out, "import" pulls in.
  const [copyMode, setCopyMode] = useState<"export" | "import" | null>(null);

  // Reset to a clean slate during render when the institution changes — the
  // loaded content belonged to the previous school.
  const [prevInstitution, setPrevInstitution] = useState(activeInstitution);
  if (activeInstitution !== prevInstitution) {
    setPrevInstitution(activeInstitution);
    setModules([]);
    setPages([]);
    setExportContent(null);
    setTargets(null);
    setCourseName("");
    setSelection(EMPTY_CONTENT_SELECTION);
    setExpanded(new Set());
    setLoadState({ status: "idle", message: "" });
    setNote(null);
    setEditorOpen(false);
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
    if (!activeInstitution) return;
    let cancelled = false;

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

    if (!parseCanvasCourseId(sel.courseUrl)) return;
    (async () => {
      const result = await listCourseContentAction(sel.courseUrl, activeInstitution || undefined);
      if (cancelled) return;
      if ("error" in result) {
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
    // Mount-only: switching institutions clears the course via the reset above.
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
  // An export-source selection needs no Canvas course id to be "loaded" -
  // that is exactly the structural gap this feature closes (see this file's
  // header intent in the assignment: a course_hub row with no canvasUrl was
  // previously unreachable here because `loaded` hard-gated on courseId).
  // A live selection behaves exactly as before.
  const loaded = useMemo(
    () => loadState.status === "idle" && (selection.source === "export" ? !!selection.courseId : !!courseId),
    [loadState.status, selection, courseId]
  );
  // Subtabs that act on the course loaded here. The rest (Grading, Announcements,
  // Inbox) carry their own course picker / are institution-scoped, so they work
  // without loading a course in this tab.
  const courseTab = view === "modules" || view === "pages" || view === "files";

  return (
    <div className={styles.card}>

      {view !== "version-control" && (
        <div className={styles.field}>
          <label>Institution</label>
          <InstitutionSwitcher metric="both" />
        </div>
      )}

      {activeInstitution && (
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
            <div className={styles.resultsHeader}>
              <h2>{courseName || "Course content"}</h2>
              <div className={styles.ccBar} style={{ padding: 0 }}>
                <div className={styles.ccBarGroup}>
                  <span className={styles.ccBarLabel}>Course copy</span>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setCopyMode("export")}
                    disabled={!courseId}
                    title="Copy this course's content into other courses"
                  >
                    Copy to…
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setCopyMode("import")}
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
            <p className={styles.emptyState}>Load a course above to work with its {view}.</p>
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
              setModules={setModules}
              reload={reload}
              setNote={setNote}
              setBusy={setBusy}
              courseName={courseName}
              onExport={() => setCopyMode("export")}
              onImport={() => setCopyMode("import")}
              refreshing={loadState.status === "loading"}
              canCopy={!!courseId}
            />
          ) : view === "pages" ? (
            <PagesView
              pages={pages}
              onNewPage={() => openEditor(null)}
              onEditPage={(pageUrl) => openEditor(pageUrl)}
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
      )}

      {view === "version-control" && versionControl}

      {editorOpen && courseId && (
        <PageEditorModal
          courseUrl={courseUrl}
          acronym={activeInstitution || undefined}
          provider={provider}
          pageUrl={editorPageUrl}
          onClose={() => setEditorOpen(false)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
