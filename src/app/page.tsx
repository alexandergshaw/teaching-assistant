"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Tab, Tabs } from "@mui/material";
import { CopyIcon, LockClosedIcon, LockOpenIcon, PencilIcon, NavTabLabel } from "./components/home/HomeIcons";
import { gradeAction, testGeminiAction, type GradeActionState, type TestGeminiState } from "./actions";
import CoursePlanningTab from "./components/CoursePlanningTab";
import CoursesTab from "./components/CoursesTab";
import TasksTab from "./components/TasksTab";
import VersionControlTab from "./components/VersionControlTab";
import CanvasTab from "./components/CanvasTab";
import ContentTab from "./components/ContentTab";
import GradingTab from "./components/GradingTab";
import RecordingTab from "./components/RecordingTab";
import FilesTab from "./components/FilesTab";
import KnowledgeTab from "./components/KnowledgeTab";
import PowerPointDesignTab from "./components/PowerPointDesignTab";
import ArtifactDesignTab from "./components/ArtifactDesignTab";
import RepoGradesTab from "./components/repo-grades";
import WorkflowScheduleWatcher from "./components/WorkflowScheduleWatcher";
import WorkflowTriggerWatcher from "./components/WorkflowTriggerWatcher";
import LessonPlanPreview from "./components/LessonPlanPreview";
import FilePreviewModal, { type PreviewFile } from "./components/FilePreviewModal";
import LessonPlanningForm from "./components/LessonPlanningForm";
import TabShell from "./components/TabShell";
import TopBar from "./components/TopBar";
import WorkflowsPanel from "./components/home/WorkflowsPanel";
import { useAppNavigation } from "./components/home/useAppNavigation";
import { useLessonPlanner } from "./components/home/useLessonPlanner";
import { useInstitutionCounts } from "./components/InstitutionCounts";
import { useVcCounts } from "./components/VcCounts";
import { useFilesInbox } from "./components/FilesInbox";
import { useDraftedGradesInbox } from "./components/DraftedGradesInbox";
import styles from "./page.module.css";
import { ManualRail } from "./components/manual/ManualRail";
import { resolveStateFromDestinationId } from "./components/manual/manual-rail";
import { RECORDING_LAUNCH_EVENT, parseRecordingLaunch } from "@/lib/recording-launch";
import { KNOWLEDGE_RETURN_EVENT } from "@/lib/knowledge-return";
import { MESSAGE_DRAFTS_NAV_EVENT } from "@/lib/drafts-nav";
import { type ActiveTab } from "./url-state";

const initialState: GradeActionState = { run: null, error: null };
const initialTestState: TestGeminiState = { result: null, error: null };

export default function Home() {
  const [state, formAction, pending] = useActionState(gradeAction, initialState);
  const { totalNeedsGrading, totalUnread } = useInstitutionCounts();
  const { total: vcAttention } = useVcCounts();
  const { count: filesInbox, markSeen: markFilesSeen } = useFilesInbox();
  const { count: draftsInbox, gradesCount: draftsGradesCount, messagesCount: draftsMessagesCount, refresh: refreshDrafts } = useDraftedGradesInbox();
  const [testState] = useActionState(testGeminiAction, initialTestState);

  // Everything about "where in the app am I", including the URL two-way bind
  // and Back/Forward restore. See useAppNavigation.ts.
  const nav = useAppNavigation();
  const { activeTab, setActiveTab, manualView, setManualView, buildView, setBuildView, contentView, setContentView, workflowsView, setWorkflowsView, draftsView, setDraftsView, tasksView, setTasksView } = nav;

  // The whole Manual > Build Courses > Pre Built flow. See useLessonPlanner.ts.
  const lesson = useLessonPlanner();

  const [selectedPreview, setSelectedPreview] = useState<PreviewFile | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  // Focus restoration for FilePreviewModal
  // (docs/modal-focus-restoration-acceptance-criteria.md, wave R3 slice D).
  // This dialog's only writer is handleOpenPreview below. The control the
  // user actually clicks - the "Preview" IconButton in GradingResults.tsx's
  // submitted-files list - is reached via GradingTab -> GradingResults and,
  // for the Live Feed source, GradingTab -> LiveFeedPanel -> GradingResults,
  // none of which are this file. `onOpenPreview` carries the clicked element
  // (`event.currentTarget`, captured in GradingResults.tsx's own onClick,
  // before this callback ever runs) through GradingTab.tsx and
  // LiveFeedPanel.tsx - both edited in this same slice to widen the prop
  // type, but the VALUE itself passes through untouched - so
  // `previewTriggerRef` below holds the real opener rather than a guess -
  // decision 9 rules out `document.activeElement` and anything else not
  // actually clicked.
  //
  // Two fallbacks, nearest-first (wave R3 bug report finding 3):
  // `resultsSectionFallbackRef` is introduced as the first candidate,
  // reaching GradingResults.tsx's own `<section>` through GradingTab.tsx's
  // merged sectionRef - several screens closer to the actual opener than the
  // second candidate. `previewFallbackRef` - the wrapper around every tab
  // panel, GradingResults included - is introduced as the fallback of last
  // resort: the Preview button lives in a per-result row inside a list that
  // re-renders, so both it and the nearer results section can unmount before
  // the dialog closes (a bulk post, a re-grade, a source switch). Neither ref
  // "stays" as anything - both are new in this work; FilePreviewModal had no
  // restore props at all before this wave. The LiveFeedPanel branch renders
  // GradingResults without threading a ref to it, so on that path the first
  // candidate is simply absent and the chain falls straight to
  // `previewFallbackRef` - confirmed by reading LiveFeedPanel.tsx, not assumed.
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const previewFallbackRef = useRef<HTMLElement | null>(null);
  const resultsSectionFallbackRef = useRef<HTMLElement | null>(null);

  // Stable identity: CoursesTab consumes the pending focus from an effect
  // that lists this callback in its deps, so an inline arrow here would
  // re-run that effect on every render of this page.
  const { setFocusCourseId } = nav;
  const handleFocusHandled = useCallback(() => setFocusCourseId(null), [setFocusCourseId]);

  useEffect(() => {
    if (activeTab === "files") {
      markFilesSeen();
    }
  }, [activeTab, markFilesSeen]);

  // Launch seam: this is the ONLY place that can call setActiveTab/
  // setManualView (see useAppNavigation.ts - setActiveTab is never a prop
  // and never in a context, and every programmatic tab switch already
  // happens inside this component, e.g. openWorkflow below). The Recording
  // tab's own inner-view switch (recView) is handled independently by
  // RecordingTab's own listener on the SAME event - see
  // src/lib/recording-launch.ts's header comment for why one event serves
  // both listeners rather than threading a callback prop through
  // KnowledgeTab or exposing setActiveTab to the fab (which lives outside
  // this component entirely, in layout.tsx, and cannot receive a prop from
  // here at all).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = e instanceof CustomEvent ? parseRecordingLaunch(e.detail) : null;
      if (!detail) return;
      setManualView("recording");
      setActiveTab("manual");
    };
    window.addEventListener(RECORDING_LAUNCH_EVENT, handler);
    return () => window.removeEventListener(RECORDING_LAUNCH_EVENT, handler);
  }, [setManualView, setActiveTab]);

  // "Back to Knowledge" (docs/knowledge-recording-handoff-acceptance-criteria.md,
  // AC4): the other half of the same "this is the ONLY place that can call
  // setActiveTab" seam above - a recording destination's "Back to Knowledge"
  // control (GradingRecordingPanel.tsx) dispatches KNOWLEDGE_RETURN_EVENT
  // (src/lib/knowledge-return.ts) rather than reaching setActiveTab
  // directly, for the identical reason RECORDING_LAUNCH_EVENT does: this
  // component is the sole owner of that setter. Registered once, live, the
  // same shape as the listener above - this component never unmounts for
  // the life of the session, so it must observe every dispatch, not just
  // the first. Carries no payload of its own to read here: WHICH page to
  // land on rides knowledge-return.ts's own one-shot slot, drained by
  // KnowledgeTab.tsx's mount effect once it exists to read it - this
  // listener's only job is the tab switch that makes that mount happen.
  useEffect(() => {
    const handler = () => setActiveTab("knowledge");
    window.addEventListener(KNOWLEDGE_RETURN_EVENT, handler);
    return () => window.removeEventListener(KNOWLEDGE_RETURN_EVENT, handler);
  }, [setActiveTab]);

  // "Jump to the Message Drafts tab" (docs/message-replies-acceptance-
  // criteria.md M16): the Saved-to-drafts link on a message-replies row
  // (MessageThreadRow.tsx) dispatches MESSAGE_DRAFTS_NAV_EVENT (src/lib/
  // drafts-nav.ts) rather than reaching setActiveTab/setWorkflowsView/
  // setDraftsView directly, for the identical reason RECORDING_LAUNCH_EVENT
  // and KNOWLEDGE_RETURN_EVENT do above: this component is the sole owner of
  // those setters. Registered once, live, the same "kept mounted" shape as
  // the two listeners above. Carries no payload of its own - every dispatch
  // wants the same three destination values, so this listener sets all
  // three itself with nothing to drain from a one-shot slot.
  useEffect(() => {
    const handler = () => {
      setWorkflowsView("drafts");
      setDraftsView("messages");
      setActiveTab("workflows");
    };
    window.addEventListener(MESSAGE_DRAFTS_NAV_EVENT, handler);
    return () => window.removeEventListener(MESSAGE_DRAFTS_NAV_EVENT, handler);
  }, [setActiveTab, setWorkflowsView, setDraftsView]);

  useEffect(() => {
    if (activeTab === "workflows" && workflowsView === "drafts") {
      refreshDrafts();
    }
  }, [activeTab, workflowsView, refreshDrafts]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const total = totalNeedsGrading + totalUnread + vcAttention + filesInbox + draftsInbox;
    document.title = total > 0 ? `(${total}) Teaching Assistant` : "Teaching Assistant";
  }, [totalNeedsGrading, totalUnread, vcAttention, filesInbox, draftsInbox]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const handleOpenPreview = (student: string, file: PreviewFile, trigger: HTMLElement) => {
    // Captured before any state update (decision 3) - this function itself
    // is synchronous, but the capture happens first on principle: a future
    // edit that inserts an await above it must not silently move this below
    // one, per the same rule useModalDismiss.ts documents for its own
    // callers.
    previewTriggerRef.current = trigger;
    setSelectedPreview({ ...file, student });
    if (file.rawBase64 && file.mimeType) {
      const byteChars = atob(file.rawBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: file.mimeType });
      setPreviewBlobUrl(URL.createObjectURL(blob));
    } else {
      setPreviewBlobUrl(null);
    }
  };

  const handleClosePreview = () => {
    setSelectedPreview(null);
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
  };

  const handleCopy = async (copyKey: string, value: string) => {
    const text = value.trim();
    if (!text) {
      return;
    }

    const copyViaFallback = () => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        copyViaFallback();
      }
    } catch {
      copyViaFallback();
    }

    setCopiedKey(copyKey);

    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }

    copyResetTimerRef.current = window.setTimeout(() => {
      setCopiedKey(null);
      copyResetTimerRef.current = null;
    }, 1600);
  };

  const openWorkflow = (id: string, panel?: "automate") => {
    if (typeof window !== "undefined") localStorage.setItem("ta-workflows-selected", id);
    if (panel === "automate" && typeof window !== "undefined") localStorage.setItem("ta-workflows-panel", "automate");
    setWorkflowsView("workflows");
    setActiveTab("workflows");
  };

  const handleWorkflowScheduled = () => {
    setWorkflowsView("workflows");
    setActiveTab("workflows");
  };

  return (
    <>
      <TopBar
        guardKbUnsavedEdits={nav.guardKbUnsavedEditsForInstitutionRemoval}
        // Clicking an in-session course in the banner while already on this
        // route stays in-page: switch to the Courses tab and hand the id to
        // CoursesTab to scroll to and highlight. TopBar renders the same
        // banner on routes that have no Courses tab (Knowledge, Account/*),
        // and there it falls back to navigating here with "?focusCourse=",
        // which useAppNavigation picks up as the same pending focus.
        onSelectCourse={(course) => {
          setFocusCourseId(course.id);
          setActiveTab("courses");
        }}
      />
      <WorkflowScheduleWatcher onRunScheduled={handleWorkflowScheduled} />
      <WorkflowTriggerWatcher onRunScheduled={handleWorkflowScheduled} />
      <main className={styles.page}>
      <div
        ref={(el) => {
          previewFallbackRef.current = el;
        }}
        // tabIndex={-1} is required for the fallback-restoration .focus()
        // call above to do anything (useModalDismiss.ts), but this wrapper -
        // every tab panel in the whole app - is a far wider surface than this
        // pattern's precedent (a module-list wrapper). In Chrome/Safari a
        // mousedown on anything non-focusable inside it now focuses the
        // container; harmless to the mechanism (nothing reads
        // document.activeElement) and :focus-visible should suppress a ring
        // on pointer input, but the blast radius is real and unrecorded
        // elsewhere (wave R3 bug report finding 4).
        tabIndex={-1}
        className={styles.tabContainer}
      >
        <Tabs
          value={activeTab}
          onChange={(_, v: ActiveTab) => setActiveTab(v)}
          sx={{
            position: "sticky",
            // Folds in the in-session banner's own actual rendered height
            // (0 when it renders nothing - see globals.css and
            // InSessionBanner.tsx) so this bar sits right below it whether
            // the banner is collapsed, expanded, or absent, never leaving a
            // gap or an overlap.
            top: "calc(var(--topbar-height) + var(--in-session-banner-height, 0px))",
            zIndex: 40,
            backgroundColor: "var(--card-background)",
            // Structural separator under the tab strip, not an input
            // affordance - --border-soft matches AC6's own distinction
            // (--field-border is reserved for input affordances).
            borderBottom: "1px solid var(--border-soft)",
            marginBottom: "0",
            "& .MuiTabs-indicator": { backgroundColor: "var(--accent)" },
            "& .MuiTab-root": {
              fontFamily: "inherit",
              fontSize: "var(--font-size-md)",
              fontWeight: 500,
              textTransform: "none",
              color: "var(--text-secondary)",
              minHeight: 44,
              padding: "var(--space-2) var(--space-5)",
            },
            "& .Mui-selected": {
              color: "var(--accent-ink) !important",
              fontWeight: 600,
            },
            minHeight: 44,
          }}
        >
          <Tab label="Courses" value="courses" disableRipple />
          <Tab label="Tasks" value="tasks" disableRipple />
          <Tab label="Manual" value="manual" disableRipple />
          <Tab label={<NavTabLabel text="Workflows" count={draftsInbox} />} value="workflows" disableRipple />
          <Tab label={<NavTabLabel text="Files" count={filesInbox} />} value="files" disableRipple />
          <Tab label="Knowledge" value="knowledge" disableRipple />
        </Tabs>

        {activeTab === "courses" && (
          <CoursesTab
            focusCourseId={nav.focusCourseId}
            onFocusHandled={handleFocusHandled}
            onNavigate={(tab) => {
              if (tab === "course-planning") {
                // Course handoffs (syllabus prefill) live in the New Build flow.
                setBuildView("new");
                setManualView("course-planning");
                setActiveTab("manual");
              } else if (tab === "version-control") {
                setManualView("version-control");
                setActiveTab("manual");
              } else {
                setActiveTab(tab as ActiveTab);
              }
            }}
          />
        )}

        {activeTab === "tasks" && (
          <TasksTab view={tasksView} onViewChange={setTasksView} />
        )}

        {activeTab === "manual" && (
          <>
            <ManualRail
              manualView={manualView}
              buildView={buildView}
              contentView={contentView}
              onManualViewClick={setManualView}
              onDestinationClick={(destId) => {
                const resolved = resolveStateFromDestinationId(destId, manualView, buildView, contentView);
                if (resolved.manualView !== manualView) setManualView(resolved.manualView);
                if (resolved.buildView !== buildView) setBuildView(resolved.buildView);
                if (resolved.contentView !== contentView) setContentView(resolved.contentView);
              }}
            />

            {manualView === "course-planning" && (
              <TabShell>
                {buildView === "new" ? (
                  <CoursePlanningTab />
                ) : (
                  <LessonPlanningForm
                    moduleObjectives={lesson.moduleObjectives}
                    onModuleObjectivesChange={lesson.setModuleObjectives}
                    moduleTitle={lesson.moduleTitle}
                    onModuleTitleChange={lesson.setModuleTitle}
                    isCourseEngine={lesson.provider === "other"}
                    lessonContext={lesson.lessonContext}
                    onLessonContextChange={lesson.setLessonContext}
                    contextFileRef={lesson.lessonContextFileRef}
                    homeworkText={lesson.homeworkText}
                    onHomeworkTextChange={lesson.setHomeworkText}
                    homeworkFileRef={lesson.homeworkFileRef}
                    lessonError={lesson.lessonError}
                    isGeneratingLesson={lesson.isGeneratingLesson}
                    onGenerate={lesson.handleGenerateLesson}
                  />
                )}
              </TabShell>
            )}

            {manualView === "content" && (
              <TabShell>
                <ContentTab
                  view={contentView}
                  grading={
                    <GradingTab
                      formAction={formAction}
                      pending={pending}
                      state={state}
                      testState={testState}
                      copiedKey={copiedKey}
                      onCopy={handleCopy}
                      onOpenPreview={handleOpenPreview}
                      resultsSectionFallbackRef={resultsSectionFallbackRef}
                    />
                  }
                  announcements={<CanvasTab view="announcements" />}
                  inbox={<CanvasTab view="inbox" />}
                />
              </TabShell>
            )}

            {manualView === "version-control" && (
              <TabShell>
                <VersionControlTab />
              </TabShell>
            )}

            {manualView === "ppt-design" && (
              <TabShell>
                <PowerPointDesignTab />
              </TabShell>
            )}

            {manualView === "artifact-design" && (
              <TabShell>
                <ArtifactDesignTab />
              </TabShell>
            )}

            {manualView === "repo-grades" && (
              <TabShell>
                <RepoGradesTab />
              </TabShell>
            )}
          </>
        )}

        {/* Kept mounted at all times so an in-progress recording survives switching
            subtabs or top-level tabs; only shown on Manual > Recording. */}
        <div style={{ display: activeTab === "manual" && manualView === "recording" ? undefined : "none" }}>
          <RecordingTab active={activeTab === "manual" && manualView === "recording"} />
        </div>

        {activeTab === "files" && <FilesTab onOpenWorkflow={openWorkflow} />}

        {activeTab === "knowledge" && (
          <KnowledgeTab
            institutions={nav.kbInstitutions}
            active={nav.kbInstitution}
            onActiveChange={nav.handleKbActiveChange}
            requestedPageId={nav.kbPageId}
            onSelectedPageIdChange={nav.setKbPageId}
            onDirtyChange={nav.handleKbDirtyChange}
          />
        )}

        {activeTab === "workflows" && (
          <WorkflowsPanel
            workflowsView={workflowsView}
            onWorkflowsViewChange={setWorkflowsView}
            draftsView={draftsView}
            onDraftsViewChange={setDraftsView}
            draftsInbox={draftsInbox}
            draftsGradesCount={draftsGradesCount}
            draftsMessagesCount={draftsMessagesCount}
            onOpenWorkflow={openWorkflow}
          />
        )}

      </div>

      {lesson.lessonPlanPreview && (
        <LessonPlanPreview
          lessonPlanPreview={lesson.lessonPlanPreview}
          assignmentPreview={lesson.assignmentPreview}
          introPreview={lesson.introPreview}
          rubricPreview={lesson.rubricPreview}
          examplesPreview={lesson.examplesPreview}
          copiedKey={copiedKey}
          onClose={() => lesson.setLessonPlanPreview(null)}
          onCopy={handleCopy}
          onSaveField={lesson.saveLessonFieldEdit}
          onRegenerate={lesson.handleRegenerateLesson}
          onDownload={lesson.handleDownloadLessonPlan}
          attachCourses={lesson.hubCourses}
          attachBusy={lesson.attachBusy}
          attachNote={lesson.attachNote}
          onAttach={lesson.handleAttachToCourse}
          icons={{ CopyIcon, LockClosedIcon, LockOpenIcon, PencilIcon }}
        />
      )}

      {selectedPreview && (
        <FilePreviewModal
          selectedPreview={selectedPreview}
          previewBlobUrl={previewBlobUrl}
          onClose={handleClosePreview}
          restoreFocusRef={previewTriggerRef}
          fallbackFocusRefs={[resultsSectionFallbackRef, previewFallbackRef]}
        />
      )}
      </main>
    </>
  );
}
