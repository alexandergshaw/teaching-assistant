"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { useInstitutionCounts } from "./InstitutionCounts";
import styles from "../page.module.css";
import {
  CONTENT_URL_KEY,
  VIEW_KEY,
} from "./content-tab/constants";
import type { LoadState } from "./content-tab/types";
import {
} from "./content-tab/utils";
import { PageEditorModal } from "./content-tab/PageEditorModal";
import { PagesView } from "./content-tab/PagesView";
import { CourseCopyModal } from "./content-tab/CourseCopyModal";
import { FilesView } from "./content-tab/FilesView";
import { ModulesView } from "./content-tab/ModulesView";







type ContentView = "modules" | "pages" | "files" | "grading" | "announcements" | "inbox";

export default function ContentTab({
  grading,
  announcements,
  inbox,
}: {
  grading?: ReactNode;
  announcements?: ReactNode;
  inbox?: ReactNode;
}) {
  const { active: activeInstitution } = useInstitutionSelection();
  const { totalNeedsGrading, totalUnread } = useInstitutionCounts();
  const [provider] = useLlmProvider();

  const [courseUrl, setCourseUrl] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem(CONTENT_URL_KEY) ?? "" : ""
  );
  const [courseName, setCourseName] = useState("");
  const [modules, setModules] = useState<CanvasModule[]>([]);
  const [pages, setPages] = useState<CanvasPageSummary[]>([]);
  // Addable content (assignments/quizzes/discussions/files) for the item picker,
  // loaded lazily the first time the user adds a non-page item.
  const [targets, setTargets] = useState<CanvasAddableContent | null>(null);
  const [targetsState, setTargetsState] = useState<"idle" | "loading" | "error">("idle");
  const [loadState, setLoadState] = useState<LoadState>(() => {
    if (typeof window === "undefined") return { status: "idle", message: "" };
    const url = localStorage.getItem(CONTENT_URL_KEY) ?? "";
    return { status: parseCanvasCourseId(url) && activeInstitution ? "loading" : "idle", message: "" };
  });
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [view, setViewState] = useState<ContentView>(() => {
    if (typeof window === "undefined") return "modules";
    const saved = localStorage.getItem(VIEW_KEY);
    return saved === "pages" || saved === "files" || saved === "grading" || saved === "announcements" || saved === "inbox"
      ? saved
      : "modules";
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPageUrl, setEditorPageUrl] = useState<string | null>(null);
  // Course copy/import tool: "export" copies this course out, "import" pulls in.
  const [copyMode, setCopyMode] = useState<"export" | "import" | null>(null);

  const setView = (next: ContentView) => {
    setViewState(next);
    if (typeof window !== "undefined") localStorage.setItem(VIEW_KEY, next);
  };

  // Reset to a clean slate during render when the institution changes — the
  // loaded content belonged to the previous school.
  const [prevInstitution, setPrevInstitution] = useState(activeInstitution);
  if (activeInstitution !== prevInstitution) {
    setPrevInstitution(activeInstitution);
    setModules([]);
    setPages([]);
    setTargets(null);
    setTargetsState("idle");
    setCourseName("");
    setCourseUrl("");
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
  const loadContent = async (url: string, silent = false) => {
    const id = parseCanvasCourseId(url);
    if (!id) return;
    if (typeof window !== "undefined") localStorage.setItem(CONTENT_URL_KEY, url);
    if (!silent) setLoadState({ status: "loading", message: "" });
    setNote(null);
    // Addable content belongs to this course; clear it so it reloads on demand.
    setTargets(null);
    setTargetsState("idle");
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

  // Lazily fetch the assignments/quizzes/discussions/files for the item picker
  // the first time they're needed (or after a failed attempt is retried).
  const ensureTargets = async () => {
    if (targets || targetsState === "loading") return;
    setTargetsState("loading");
    const result = await listAddableContentAction(courseUrl, activeInstitution || undefined);
    if ("error" in result) {
      setTargetsState("error");
      return;
    }
    setTargets(result.content);
    setTargetsState("idle");
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
      <header className={styles.header}>
        <span className={styles.eyebrow}>LMS Integration</span>
        <h1>Course content, grading &amp; communications</h1>
        <p>
          Manage a Canvas course&apos;s modules, pages, and files, grade submissions, and handle
          announcements and messages — all in one place. Changes are written to Canvas when you save.
        </p>
      </header>

      <div className={styles.field}>
        <label>Institution</label>
        <InstitutionSwitcher metric="both" />
      </div>

      {activeInstitution && (
        <>
          <div className={styles.lessonInnerTabs}>
            <button
              type="button"
              className={`${styles.lessonInnerTab} ${view === "modules" ? styles.lessonInnerTabActive : ""}`}
              onClick={() => setView("modules")}
            >
              Modules
            </button>
            <button
              type="button"
              className={`${styles.lessonInnerTab} ${view === "pages" ? styles.lessonInnerTabActive : ""}`}
              onClick={() => setView("pages")}
            >
              Pages
            </button>
            <button
              type="button"
              className={`${styles.lessonInnerTab} ${view === "files" ? styles.lessonInnerTabActive : ""}`}
              onClick={() => setView("files")}
            >
              Files
            </button>
            {grading && (
              <button
                type="button"
                className={`${styles.lessonInnerTab} ${view === "grading" ? styles.lessonInnerTabActive : ""}`}
                onClick={() => setView("grading")}
              >
                <span className={styles.tabLabelWrap}>
                  Grading
                  {totalNeedsGrading > 0 && <span className={styles.navBadge}>{totalNeedsGrading}</span>}
                </span>
              </button>
            )}
            {announcements && (
              <button
                type="button"
                className={`${styles.lessonInnerTab} ${view === "announcements" ? styles.lessonInnerTabActive : ""}`}
                onClick={() => setView("announcements")}
              >
                Announcements
              </button>
            )}
            {inbox && (
              <button
                type="button"
                className={`${styles.lessonInnerTab} ${view === "inbox" ? styles.lessonInnerTabActive : ""}`}
                onClick={() => setView("inbox")}
              >
                <span className={styles.tabLabelWrap}>
                  Inbox
                  {totalUnread > 0 && <span className={styles.navBadge}>{totalUnread}</span>}
                </span>
              </button>
            )}
          </div>

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
                  <button
                    type="button"
                    className={styles.ccBarBtn}
                    onClick={() => setCopyMode("export")}
                    disabled={!courseId}
                    title="Copy this course's content into other courses"
                  >
                    Copy to…
                  </button>
                  <button
                    type="button"
                    className={styles.ccBarBtn}
                    onClick={() => setCopyMode("import")}
                    disabled={!courseId}
                    title="Import another course's content into this one"
                  >
                    Import from…
                  </button>
                </div>

                <span className={styles.ccBarDivider} aria-hidden="true" />

                <button
                  type="button"
                  className={styles.ccBarBtn}
                  onClick={reload}
                  disabled={busy || loadState.status === "loading"}
                  title="Reload this course's content"
                >
                  {loadState.status === "loading" ? "Refreshing…" : "Refresh"}
                </button>
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
              courseUrl={courseUrl}
              acronym={activeInstitution || undefined}
              modules={modules}
              pages={pages}
              targets={targets}
              targetsState={targetsState}
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
