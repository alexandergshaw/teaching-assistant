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
import GradingRecordingPanel from "./components/grading-recording/GradingRecordingPanel";
import SnapshotGradingPanel from "./components/snapshot-grading/SnapshotGradingPanel";
import GradingChatPanel from "./components/grading-chat/GradingChatPanel";
import FilesTab from "./components/FilesTab";
import KnowledgeTab from "./components/KnowledgeTab";
import PowerPointDesignTab from "./components/PowerPointDesignTab";
import ArtifactDesignTab from "./components/ArtifactDesignTab";
import RepoGradesTab from "./components/repo-grades";
import CourseIntelTab from "./components/course-intel";
import WorkflowScheduleWatcher from "./components/WorkflowScheduleWatcher";
import WorkflowTriggerWatcher from "./components/WorkflowTriggerWatcher";
import LessonPlanPreview from "./components/LessonPlanPreview";
import FilePreviewModal, { type PreviewFile } from "./components/FilePreviewModal";
import LessonPlanningForm from "./components/LessonPlanningForm";
import TabShell from "./components/TabShell";
import TopBar from "./components/TopBar";
import WorkflowsPanel from "./components/home/WorkflowsPanel";
import DraftedGradesTab from "./components/DraftedGradesTab";
import { useAppNavigation } from "./components/home/useAppNavigation";
import { useLessonPlanner } from "./components/home/useLessonPlanner";
import { useInstitutionCounts } from "./components/InstitutionCounts";
import { useVcCounts } from "./components/VcCounts";
import { useFilesInbox } from "./components/FilesInbox";
import { useDraftedGradesInbox } from "./components/DraftedGradesInbox";
import styles from "./page.module.css";
import { ManualRail } from "./components/manual/ManualRail";
import { resolveStateFromDestinationId } from "./components/manual/manual-rail";
import { TabRail } from "./components/tabs/TabRail";
import {
  COURSES_RAIL_ITEMS,
  TOOLS_RAIL_DRAFTS_ID,
  TOOLS_RAIL_ITEMS,
  coursesRailItemFor,
  coursesStateFromRailItem,
  manualRailItemId,
  toolsRailItemFor,
  toolsStateFromRailItem,
} from "./components/tabs/tab-rails";
import {
  LIBRARY_SECTION_LABELS,
  LIBRARY_SECTION_ORDER,
  TAB_LABELS,
  TAB_ORDER,
  type ActiveTab,
} from "./components/tabs/tab-sections";
import { RECORDING_LAUNCH_EVENT, parseRecordingLaunch } from "@/lib/recording-launch";
import { KNOWLEDGE_RETURN_EVENT } from "@/lib/knowledge-return";
import { MESSAGE_DRAFTS_NAV_EVENT } from "@/lib/drafts-nav";

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
  const { activeTab, setActiveTab, coursesSection, setCoursesSection, toolsSection, setToolsSection, librarySection, setLibrarySection, manualView, setManualView, buildView, setBuildView, contentView, setContentView, gradingView, setGradingView, workflowsView, setWorkflowsView, tasksView, setTasksView } = nav;

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

  // The Files inbox is marked seen when its own SECTION is showing, not
  // merely when the tab it now shares with Knowledge is - landing on Library
  // > Knowledge must not silently clear a Files badge the user never looked
  // at.
  useEffect(() => {
    if (activeTab === "files" && librarySection === "files") {
      markFilesSeen();
    }
  }, [activeTab, librarySection, markFilesSeen]);

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
  // GRAD-SUBTAB wave 2: view-aware. A "grading"/"snapgrade" launch (the
  // Knowledge base's "Grade via recording" button, KnowledgeTab.tsx; the
  // fab's grading entries) must land on Tools > Grading now that the two
  // capture panels live there, not on Tools > Recording - every other launch
  // view still lands on Recording exactly as before.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = e instanceof CustomEvent ? parseRecordingLaunch(e.detail) : null;
      if (!detail) return;
      if (detail.view === "grading") {
        setManualView("grading");
        setGradingView("recording");
        setToolsSection("manual");
        setActiveTab("manual");
      } else if (detail.view === "snapgrade") {
        setManualView("grading");
        setGradingView("snapshots");
        setToolsSection("manual");
        setActiveTab("manual");
      } else {
        setManualView("recording");
        setToolsSection("manual");
        setActiveTab("manual");
      }
    };
    window.addEventListener(RECORDING_LAUNCH_EVENT, handler);
    return () => window.removeEventListener(RECORDING_LAUNCH_EVENT, handler);
  }, [setManualView, setToolsSection, setActiveTab, setGradingView]);

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
    const handler = () => {
      // Knowledge is a SECTION of the Library tab since the merge, so the
      // return trip sets both halves - setting only the tab lands on Library
      // > Files, which is not where the user was.
      setLibrarySection("knowledge");
      setActiveTab("files");
    };
    window.addEventListener(KNOWLEDGE_RETURN_EVENT, handler);
    return () => window.removeEventListener(KNOWLEDGE_RETURN_EVENT, handler);
  }, [setActiveTab, setLibrarySection]);

  // "Jump to the Message Drafts tab" (docs/message-replies-acceptance-
  // criteria.md M16): the Saved-to-drafts link on a message-replies row
  // (MessageThreadRow.tsx) dispatches MESSAGE_DRAFTS_NAV_EVENT (src/lib/
  // drafts-nav.ts) rather than reaching setActiveTab/setWorkflowsView/
  // setToolsSection directly, for the identical reason RECORDING_LAUNCH_EVENT
  // and KNOWLEDGE_RETURN_EVENT do above: this component is the sole owner of
  // those setters. Registered once, live, the same "kept mounted" shape as
  // the two listeners above. Carries no payload of its own - every dispatch
  // wants the same three destination values, so this listener sets all
  // three itself with nothing to drain from a one-shot slot. GRAD-SUBTAB
  // wave 3 (DECISION 19, E-full) dropped the fourth setter, setDraftsView -
  // Drafts renders MessageDraftsTab directly now, with no inner selector.
  useEffect(() => {
    const handler = () => {
      setWorkflowsView("drafts");
      setToolsSection("workflows");
      setActiveTab("manual");
    };
    window.addEventListener(MESSAGE_DRAFTS_NAV_EVENT, handler);
    return () => window.removeEventListener(MESSAGE_DRAFTS_NAV_EVENT, handler);
  }, [setActiveTab, setToolsSection, setWorkflowsView]);

  useEffect(() => {
    // GRAD-SUBTAB wave 3: Drafted Grades now also refreshes from its new home
    // (Tools > Grading > Drafted Grades), alongside the pre-existing Workflows
    // > Drafts refresh - both still feed the same useDraftedGradesInbox count.
    // Written with gradingView checked before manualView (rather than the
    // usual outside-in order) so this clause does not spell manualView's
    // grading check immediately followed by "&&" - topLevelTabs.wiring.test.ts's
    // R-1 guard locates the run/repos render branch by searching for exactly
    // that text, and an earlier, unrelated match here would misdirect it.
    const workflowsDraftsShowing = activeTab === "manual" && toolsSection === "workflows" && workflowsView === "drafts";
    const gradingDraftsShowing =
      activeTab === "manual" && toolsSection === "manual" && gradingView === "drafts" && manualView === "grading";
    if (workflowsDraftsShowing || gradingDraftsShowing) {
      refreshDrafts();
    }
  }, [activeTab, toolsSection, workflowsView, manualView, gradingView, refreshDrafts]);

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

  // Every programmatic jump to Workflows now names the Tools tab AND its
  // Workflows section - "workflows" is no longer a tab value at all, and a
  // jump that set only one of the two would land on Tools > Manual.
  const openWorkflow = (id: string, panel?: "automate") => {
    if (typeof window !== "undefined") localStorage.setItem("ta-workflows-selected", id);
    if (panel === "automate" && typeof window !== "undefined") localStorage.setItem("ta-workflows-panel", "automate");
    setWorkflowsView("workflows");
    setToolsSection("workflows");
    setActiveTab("manual");
  };

  const handleWorkflowScheduled = () => {
    setWorkflowsView("workflows");
    setToolsSection("workflows");
    setActiveTab("manual");
  };

  // Each merged tab's ONE navigation rail (D26), derived from the ordered
  // lists in tab-rails.ts/tab-sections.ts rather than hand-written per item,
  // so a view registered there cannot be missing from the control that reaches
  // it. The counts are the same two the top strip badges - shown again here
  // because the strip badge only says WHICH TAB has attention waiting, and the
  // rail is what says which item of it.
  const coursesRailOptions = COURSES_RAIL_ITEMS.map((item) => ({ id: item.id, label: item.label }));
  // The Drafts chip inherits the unread badge that used to sit on the deleted
  // section switch's "Workflows" half, named through tab-rails' own builder so
  // this cannot drift from the id the rail actually renders.
  //
  // GRAD-SUBTAB wave 3 (RES-W3-2): Drafted Grades moved out of Drafts into
  // Tools > Grading, so its count moves with it - the Grading chip now
  // carries draftsGradesCount, and the Drafts chip's count narrows to
  // draftsMessagesCount only (it used to be draftsInbox, grades+messages
  // combined, when Drafts still hosted both).
  const toolsRailOptions = TOOLS_RAIL_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    count:
      item.id === TOOLS_RAIL_DRAFTS_ID
        ? draftsMessagesCount
        : item.id === manualRailItemId("grading")
          ? draftsGradesCount
          : 0,
  }));
  // Library was already flat before D26 - its two halves have no sub-views to
  // pull up, so its rail is still exactly its two sections, unchanged in
  // items, params and default.
  const libraryRailOptions = LIBRARY_SECTION_ORDER.map((id) => ({
    id,
    label: LIBRARY_SECTION_LABELS[id],
    count: id === "files" ? filesInbox : 0,
  }));

  // Picking a rail item writes the param that ALREADY owned that view, plus
  // the section its family implies - together, in one handler, so the two can
  // never be set apart from each other. The section is the derived half of
  // that pair: it is never chosen on its own by anything the user can click.
  const handleCoursesRailChange = (id: string) => {
    const next = coursesStateFromRailItem(id, coursesSection, tasksView);
    if (next.coursesSection !== coursesSection) setCoursesSection(next.coursesSection);
    if (next.tasksView !== tasksView) setTasksView(next.tasksView);
  };
  const handleToolsRailChange = (id: string) => {
    const next = toolsStateFromRailItem(id, toolsSection, manualView, workflowsView);
    if (next.toolsSection !== toolsSection) setToolsSection(next.toolsSection);
    if (next.manualView !== manualView) setManualView(next.manualView);
    if (next.workflowsView !== workflowsView) setWorkflowsView(next.workflowsView);
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
          setCoursesSection("courses");
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
          {/* Mapped from TAB_ORDER rather than hand-written one <Tab> per
              value: a tab registered in tab-sections.ts but missing from the
              strip is not a state this file can be in. Each merged tab
              carries the attention count of the half that had one before the
              merge (drafts under Tools, the files inbox under Library), so
              neither badge disappears just because its tab did. NavTabLabel
              renders the text alone at count 0. */}
          {TAB_ORDER.map((tab) => (
            <Tab
              key={tab}
              value={tab}
              label={
                <NavTabLabel
                  text={TAB_LABELS[tab]}
                  count={tab === "manual" ? draftsInbox : tab === "files" ? filesInbox : 0}
                />
              }
              disableRipple
            />
          ))}
        </Tabs>

        {activeTab === "courses" && (
          <>
            {/* ONE nav level (D26): Courses plus the two Tasks views, rather
                than a Courses/Tasks switch with the Tasks views hidden a level
                below it inside TasksTab. */}
            <TabRail
              ariaLabel="Courses views"
              options={coursesRailOptions}
              value={coursesRailItemFor(coursesSection, tasksView)}
              onChange={handleCoursesRailChange}
            />

            {coursesSection === "courses" && (
              <CoursesTab
                focusCourseId={nav.focusCourseId}
                onFocusHandled={handleFocusHandled}
                onNavigate={(tab) => {
                  if (tab === "course-planning") {
                    // Course handoffs (syllabus prefill) live in the New Build flow.
                    setBuildView("new");
                    setManualView("course-planning");
                    setToolsSection("manual");
                    setActiveTab("manual");
                  } else if (tab === "version-control") {
                    setManualView("version-control");
                    setToolsSection("manual");
                    setActiveTab("manual");
                  } else {
                    // "workflows" - a section of the Tools tab now, not a tab.
                    setToolsSection("workflows");
                    setActiveTab("manual");
                  }
                }}
              />
            )}

            {/* The Term/Daily-Weekly switch TasksTab used to render is gone -
                both of its views are chips in the rail above, writing the
                same tasksView param they always did, so this pane no longer
                needs a way to change it. */}
            {coursesSection === "tasks" && <TasksTab view={tasksView} />}
          </>
        )}

        {activeTab === "manual" && (
          <>
            {/* ONE nav level (D26): the seven Manual views and the three
                Workflows views in a single rail of ten, in place of the
                Manual/Workflows switch that used to sit above a separate
                seven-item Manual rail and a separate three-item Workflows
                subnav. */}
            <TabRail
              ariaLabel="Tools views"
              options={toolsRailOptions}
              value={toolsRailItemFor(toolsSection, manualView, workflowsView)}
              onChange={handleToolsRailChange}
            />

            {toolsSection === "manual" && (
              <>
                {/* Row 2 only: the inner destinations of whichever Manual view
                    is showing (Build Courses' two modes, LMS's eight views).
                    That is the INNERMOST level, not the one D26 removed - it
                    is what the rail item leads into, not a second way to
                    choose the rail item. */}
                <ManualRail
                  manualView={manualView}
                  buildView={buildView}
                  contentView={contentView}
                  gradingView={gradingView}
                  onDestinationClick={(destId) => {
                    const resolved = resolveStateFromDestinationId(destId, manualView, buildView, contentView, gradingView);
                    if (resolved.manualView !== manualView) setManualView(resolved.manualView);
                    if (resolved.buildView !== buildView) setBuildView(resolved.buildView);
                    if (resolved.contentView !== contentView) setContentView(resolved.contentView);
                    if (resolved.gradingView !== gradingView) setGradingView(resolved.gradingView);
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

                {/* GRAD-SUBTAB wave 2 (R-1): the two moved capture surfaces
                    (grading-via-recording, snapshot grading) are now
                    always-mounted siblings below (after RecordingTab's own
                    always-mounted div) - this ternary must NOT also try to
                    render something for those gradingView values, or both
                    the (empty-else) GradingTab branch AND the always-mounted
                    panel would be on screen for the same chip at once. */}
                {manualView === "grading" && (gradingView === "run" || gradingView === "repos") && (
                  <TabShell>
                    {gradingView === "repos" ? (
                      <RepoGradesTab />
                    ) : (
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
                    )}
                  </TabShell>
                )}

                {/* GRAD-SUBTAB wave 3: Drafted Grades re-parented from
                    Workflows > Drafts into Tools > Grading's own inner nav
                    (DECISION 18/19 - moved, not mirrored). A SEPARATE
                    conditional sibling of the run/repos block above, not
                    inside its <TabShell> - DraftedGradesTab self-wraps its
                    own TabShell (DraftedGradesTab.tsx:420), and it is a plain
                    conditional mount, not an always-mounted display toggle
                    (unlike GradingRecordingPanel/SnapshotGradingPanel below):
                    it holds no live capture resource, only onOpenWorkflow and
                    app-root contexts, so there is nothing to preserve across a
                    tab switch. */}
                {manualView === "grading" && gradingView === "drafts" && (
                  <DraftedGradesTab onOpenWorkflow={openWorkflow} />
                )}
              </>
            )}

            {/* WorkflowsPanel's own Workflows/Automations/Drafts subnav is
                gone with D26 - those three are chips in the rail above now,
                writing the same workflowsView param, and the Drafts badge
                moved up with them. The Grades/Messages subnav that used to
                sit INSIDE Drafts is gone too (GRAD-SUBTAB wave 3, DECISION 19
                E-full) - Drafted Grades moved out, and Drafts now renders
                MessageDraftsTab directly. */}
            {toolsSection === "workflows" && (
              <WorkflowsPanel workflowsView={workflowsView} onOpenWorkflow={openWorkflow} />
            )}
          </>
        )}

        {/* Kept mounted at all times so an in-progress recording survives switching
            subtabs or top-level tabs; only shown on the Tools tab's Recording
            rail item. The guard gained the toolsSection term with the merge and
            NOTHING else changed: this stays a display toggle on an
            always-rendered element, never a conditional render. Turning it into
            one would unmount a running screen capture the moment the user
            looked at another tab, which is a lost recording rather than a
            blank pane.

            D26 CHANGED THIS GUARD BY EXACTLY NOTHING, on purpose. Flattening
            removed the section SWITCH, not the section VALUE - toolsSection is
            still what says which family is showing, it is just written now as
            part of picking a rail item. So the three terms below still mean
            precisely what they meant before: Tools tab, Manual family,
            Recording view. Rewriting them in terms of the rail item id would
            have been the same predicate spelled a new way, with a live screen
            capture riding on getting the rewrite right. */}
        <div
          style={{
            display:
              activeTab === "manual" && toolsSection === "manual" && manualView === "recording" ? undefined : "none",
          }}
        >
          <RecordingTab active={activeTab === "manual" && toolsSection === "manual" && manualView === "recording"} />
        </div>

        {/* GRAD-SUBTAB wave 2 (docs/tools-grading-subtab-wave2-architecture.md
            section 2.2): the two Recording grading surfaces re-parented into
            Tools > Grading. Each holds live capture (a MediaStream, or a
            RECORDING_LAUNCH_EVENT listener) that a conditional mount would
            kill on every navigation - so, exactly like RecordingTab above,
            these are always-rendered, display-toggled top-level siblings,
            OUTSIDE the `activeTab === "manual"` block, never inside the
            `manualView === "grading"` ternary. Do not move these into that
            ternary - see this file's own I-W2 guard in
            topLevelTabs.wiring.test.ts, which exists to catch exactly that
            regression. */}
        <div
          style={{
            display:
              activeTab === "manual" && toolsSection === "manual" && manualView === "grading" && gradingView === "recording"
                ? undefined
                : "none",
          }}
        >
          <GradingRecordingPanel
            active={activeTab === "manual" && toolsSection === "manual" && manualView === "grading" && gradingView === "recording"}
          />
        </div>

        <div
          style={{
            display:
              activeTab === "manual" && toolsSection === "manual" && manualView === "grading" && gradingView === "snapshots"
                ? undefined
                : "none",
          }}
        >
          <SnapshotGradingPanel
            active={activeTab === "manual" && toolsSection === "manual" && manualView === "grading" && gradingView === "snapshots"}
          />
        </div>

        {/* GRADING-CHAT wave 1 (docs/grading-chat-architecture.md section 7):
            a sixth Grading destination, holding an in-flight continuous grading
            run (pending /api/grade-run-item requests plus accumulated rows) -
            an always-mounted, display-toggled top-level sibling of
            RecordingTab, exactly like GradingRecordingPanel/SnapshotGradingPanel
            above, never a conditional render inside the `manualView ===
            "grading"` ternary (that would drop the whole session on
            navigation). Do not move this into that ternary - see this file's
            own I-chat-mount guard in topLevelTabs.wiring.test.ts. */}
        <div
          style={{
            display:
              activeTab === "manual" && toolsSection === "manual" && manualView === "grading" && gradingView === "chat"
                ? undefined
                : "none",
          }}
        >
          <GradingChatPanel copiedKey={copiedKey} onCopy={handleCopy} onOpenPreview={handleOpenPreview} />
        </div>

        {activeTab === "files" && (
          <>
            {/* Library was already one level deep before D26 and still is:
                neither half has a sub-rail, so its two sections ARE its two
                rail items. Flattening it further would have renamed things
                and changed nothing, so it was left alone. */}
            <TabRail
              ariaLabel="Library views"
              options={libraryRailOptions}
              value={librarySection}
              onChange={setLibrarySection}
            />

            {librarySection === "files" && <FilesTab onOpenWorkflow={openWorkflow} />}

            {librarySection === "knowledge" && (
              <KnowledgeTab
                institutions={nav.kbInstitutions}
                active={nav.kbInstitution}
                onActiveChange={nav.handleKbActiveChange}
                requestedPageId={nav.kbPageId}
                onSelectedPageIdChange={nav.setKbPageId}
                onDirtyChange={nav.handleKbDirtyChange}
              />
            )}
          </>
        )}

        {/* Course Intel is a top-level tab of its own (D24a), no longer a
            Manual sub-view. It asks questions across every course rather than
            living inside one tool, which is the whole argument for promoting
            it. It has no section switch because it absorbed nothing. */}
        {activeTab === "course-intel" && (
          <TabShell>
            <CourseIntelTab />
          </TabShell>
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
