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

  const handleOpenPreview = (student: string, file: PreviewFile) => {
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
      <div className={styles.tabContainer}>
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
            borderBottom: "1px solid var(--field-border)",
            marginBottom: "0",
            "& .MuiTabs-indicator": { backgroundColor: "var(--accent)" },
            "& .MuiTab-root": {
              fontFamily: "inherit",
              fontSize: "0.9rem",
              fontWeight: 500,
              textTransform: "none",
              color: "var(--text-secondary)",
              minHeight: 44,
              padding: "10px 20px",
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
        />
      )}
      </main>
    </>
  );
}
