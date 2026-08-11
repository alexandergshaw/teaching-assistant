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
import { readExportCourseContent } from "@/lib/lms-export-source";
import type { ContentSource, ExportCourseContent } from "@/lib/lms-export-source";
import styles from "../page.module.css";
import {
  CONTENT_URL_KEY,
  type ContentView,
} from "./content-tab/constants";
import type { LoadState } from "./content-tab/types";
import {
} from "./content-tab/utils";
import { PageEditorModal } from "./content-tab/PageEditorModal";
import { PagesView } from "./content-tab/PagesView";
import { CourseCopyModal } from "./content-tab/CourseCopyModal";
import { FilesView } from "./content-tab/FilesView";
import { ModulesView } from "./content-tab/ModulesView";



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

  const [courseUrl, setCourseUrl] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem(CONTENT_URL_KEY) ?? "" : ""
  );
  const [courseName, setCourseName] = useState("");
  const [modules, setModules] = useState<CanvasModule[]>([]);
  const [pages, setPages] = useState<CanvasPageSummary[]>([]);
  // The second Course Content source (a stored LMS export, read instead of
  // the live Canvas API - src/lib/lms-export-source). Populated only by
  // loadContent's "export" branch below, which nothing calls yet: no picker
  // exists in this tab yet, so this stays null until one lands. A ref, not
  // state - nothing reads it yet (no render depends on it), so there is
  // nothing for it to trigger a re-render for; the picker that eventually
  // reads it can promote it to real state at that point. Kept separate from
  // `modules`/`pages` rather than merged into them because those two are
  // typed for the live shape (ModulesView/PagesView expect CanvasModule[]/
  // CanvasPageSummary[]); an export-sourced course cannot fill that shape
  // without fabricating Canvas-only fields (see lms-export-source's header
  // comment), so it gets its own slot instead of a forced, lossy cast.
  const exportContentRef = useRef<ExportCourseContent | null>(null);
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
    const url = localStorage.getItem(CONTENT_URL_KEY) ?? "";
    return { status: parseCanvasCourseId(url) && activeInstitution ? "loading" : "idle", message: "" };
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
    setTargets(null);
    setCourseName("");
    setCourseUrl("");
    setExpanded(new Set());
    setLoadState({ status: "idle", message: "" });
    setNote(null);
    setEditorOpen(false);
  }

  // Refs cannot be mutated during render (react-hooks/refs) - unlike the
  // setState calls above, this reset runs in an effect instead, keyed on the
  // same trigger (an institution change means the loaded content, export or
  // live, belonged to the previous school).
  useEffect(() => {
    exportContentRef.current = null;
  }, [activeInstitution]);

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
  // `source` selects which of the two Course Content sources to read from:
  // "canvas" (default, unchanged) hits the live Canvas API via
  // listCourseContentAction and fills `modules`/`pages`, exactly as before
  // this parameter existed. "export" reads the course's stored LMS export
  // instead (src/lib/lms-export-source) and fills `exportContentRef` instead
  // - that shape cannot be forced into `modules`/`pages` (typed for the live
  // shape ModulesView/PagesView expect) without fabricating Canvas-only
  // fields an export never carries, so it gets its own slot. No caller
  // passes "export" yet - there is no source picker in this tab yet - so
  // this parameter exists purely so a future picker can select the source it
  // wants without any other change to this function; today every call site
  // omits it and behaviour is identical to before this parameter was added.
  const loadContent = async (url: string, silent = false, source: ContentSource = "canvas") => {
    const id = parseCanvasCourseId(url);
    if (!id) return;
    if (typeof window !== "undefined") localStorage.setItem(CONTENT_URL_KEY, url);
    if (!silent) setLoadState({ status: "loading", message: "" });
    setNote(null);
    setTargets(null);

    if (source === "export") {
      const result = await readExportCourseContent(supabase, url);
      if ("error" in result) {
        if (silent) {
          setNote({ kind: "error", text: result.error });
          return;
        }
        exportContentRef.current = null;
        setCourseName("");
        setLoadState({ status: "error", message: result.error });
        return;
      }
      setCourseName(result.courseName);
      exportContentRef.current = result;
      setModules([]);
      setPages([]);
      if (!silent) setLoadState({ status: "idle", message: "" });
      return;
    }

    const result = await listCourseContentAction(url, activeInstitution || undefined);
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
    exportContentRef.current = null;
    if (!silent) setLoadState({ status: "idle", message: "" });
  };

  // Auto-load the remembered course on mount (await-first so no sync setState).
  useEffect(() => {
    const url = typeof window !== "undefined" ? localStorage.getItem(CONTENT_URL_KEY) ?? "" : "";
    if (!parseCanvasCourseId(url) || !activeInstitution) return;
    let cancelled = false;
    (async () => {
      const result = await listCourseContentAction(url, activeInstitution || undefined);
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
    setCourseUrl(url);
    setLoadState({ status: "idle", message: "" });
    void loadContent(url);
  };

  const reload = () => {
    if (courseUrl) void loadContent(courseUrl, true);
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
  const loaded = useMemo(() => loadState.status === "idle" && !!courseId, [loadState.status, courseId]);
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
              // the loaded course changes, so a bulk selection made in one course
              // can never be read - or acted on - against a different course's
              // module/item ids. useModuleSelection already self-prunes any
              // selected key/id that stops matching the current `modules` prop
              // (see pruneSelectionForModules in useModuleSelection.ts), which
              // covers this today since Canvas ids are unique across courses -
              // but that's incidental, not a guarantee this component should lean
              // on, so it's paired with an explicit reset here.
              key={courseUrl}
              courseUrl={courseUrl}
              acronym={activeInstitution || undefined}
              modules={modules}
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
            <PagesView pages={pages} onNewPage={() => openEditor(null)} onEditPage={(pageUrl) => openEditor(pageUrl)} />
          ) : view === "files" ? (
            <FilesView courseUrl={courseUrl} acronym={activeInstitution || undefined} modules={modules} />
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
