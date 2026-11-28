"use client";

import { useId } from "react";
import { Box } from "@mui/material";
import styles from "../../page.module.css";
import LessonPlanPreviewHeader from "./LessonPlanPreviewHeader";
import LessonPlanPreviewTabs, { lessonPlanPreviewTabs } from "./LessonPlanPreviewTabs";
import LessonPlanPreviewIntroTab from "./LessonPlanPreviewIntroTab";
import LessonPlanPreviewSlidesTab from "./LessonPlanPreviewSlidesTab";
import LessonPlanPreviewAssignmentTab from "./LessonPlanPreviewAssignmentTab";
import LessonPlanPreviewRubricTab from "./LessonPlanPreviewRubricTab";
import LessonPlanPreviewExamplesTab from "./LessonPlanPreviewExamplesTab";
import LessonPlanPreviewRevision from "./LessonPlanPreviewRevision";
import LessonPlanPreviewFooter from "./LessonPlanPreviewFooter";
import { useLessonPlanPreviewState } from "./useLessonPlanPreviewState";
import type { LessonPlanPreviewProps } from "./types";

export type { LessonPlanPreviewProps, PreviewTab, LessonPlanPreviewIcons } from "./types";

export default function LessonPlanPreview({
  lessonPlanPreview,
  assignmentPreview,
  introPreview,
  rubricPreview,
  examplesPreview,
  copiedKey,
  onClose,
  onCopy,
  onSaveField,
  onRegenerate,
  onDownload,
  attachCourses,
  attachBusy,
  attachNote,
  onAttach,
  icons,
}: LessonPlanPreviewProps) {
  const tabsId = useId();
  const {
    previewTab,
    setPreviewTab,
    revisionPrompt,
    setRevisionPrompt,
    isRegenerating,
    editingLessonField,
    lessonFieldDraft,
    setLessonFieldDraft,
    lockedLessonFields,
    selectedCourse,
    setSelectedCourse,
    startEditLessonField,
    cancelEditLessonField,
    saveLessonFieldEdit,
    toggleLessonFieldLock,
    handleRegenerate,
  } = useLessonPlanPreviewState();

  return (
    <div className={styles.previewBackdrop} onClick={onClose}>
      <section
        className={styles.lessonPreviewModal}
        role="dialog"
        aria-modal="true"
        aria-label="Lesson plan preview"
        onClick={(event) => event.stopPropagation()}
      >
        <LessonPlanPreviewHeader
          lessonPlanPreview={lessonPlanPreview}
          previewTab={previewTab}
          editingLessonField={editingLessonField}
          lessonFieldDraft={lessonFieldDraft}
          onClose={onClose}
          onStartEdit={startEditLessonField}
          onCancelEdit={cancelEditLessonField}
          onSaveEdit={(key) => saveLessonFieldEdit(key, onSaveField)}
          onFieldDraftChange={setLessonFieldDraft}
          icons={icons}
        />

        <LessonPlanPreviewTabs
          tabsId={tabsId}
          previewTab={previewTab}
          onTabChange={setPreviewTab}
        />

        {lessonPlanPreviewTabs.filter(({ id }) => id !== previewTab).map(({ id }) => (
          <div key={id} role="tabpanel" hidden id={`${tabsId}-panel-${id}`} aria-labelledby={`${tabsId}-tab-${id}`} />
        ))}
        <Box role="tabpanel" id={`${tabsId}-panel-${previewTab}`} aria-labelledby={`${tabsId}-tab-${previewTab}`} tabIndex={0}
          sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {previewTab === "intro" && (
          <LessonPlanPreviewIntroTab
            introPreview={introPreview}
            copiedKey={copiedKey}
            editingLessonField={editingLessonField}
            lessonFieldDraft={lessonFieldDraft}
            lockedLessonFields={lockedLessonFields}
            onCopy={onCopy}
            onStartEdit={startEditLessonField}
            onCancelEdit={cancelEditLessonField}
            onSaveEdit={(key) => saveLessonFieldEdit(key, onSaveField)}
            onFieldDraftChange={setLessonFieldDraft}
            onToggleLock={toggleLessonFieldLock}
            icons={icons}
          />
        )}

        {previewTab === "slides" && (
          <LessonPlanPreviewSlidesTab
            lessonPlanPreview={lessonPlanPreview}
            copiedKey={copiedKey}
            editingLessonField={editingLessonField}
            lessonFieldDraft={lessonFieldDraft}
            lockedLessonFields={lockedLessonFields}
            onCopy={onCopy}
            onStartEdit={startEditLessonField}
            onCancelEdit={cancelEditLessonField}
            onSaveEdit={(key) => saveLessonFieldEdit(key, onSaveField)}
            onFieldDraftChange={setLessonFieldDraft}
            onToggleLock={toggleLessonFieldLock}
            icons={icons}
          />
        )}

        {previewTab === "assignment" && (
          <LessonPlanPreviewAssignmentTab
            assignmentPreview={assignmentPreview}
            copiedKey={copiedKey}
            editingLessonField={editingLessonField}
            lessonFieldDraft={lessonFieldDraft}
            lockedLessonFields={lockedLessonFields}
            onCopy={onCopy}
            onStartEdit={startEditLessonField}
            onCancelEdit={cancelEditLessonField}
            onSaveEdit={(key) => saveLessonFieldEdit(key, onSaveField)}
            onFieldDraftChange={setLessonFieldDraft}
            onToggleLock={toggleLessonFieldLock}
            icons={icons}
          />
        )}

        {previewTab === "rubric" && (
          <LessonPlanPreviewRubricTab
            rubricPreview={rubricPreview}
            copiedKey={copiedKey}
            editingLessonField={editingLessonField}
            lessonFieldDraft={lessonFieldDraft}
            lockedLessonFields={lockedLessonFields}
            onCopy={onCopy}
            onStartEdit={startEditLessonField}
            onCancelEdit={cancelEditLessonField}
            onSaveEdit={(key) => saveLessonFieldEdit(key, onSaveField)}
            onFieldDraftChange={setLessonFieldDraft}
            onToggleLock={toggleLessonFieldLock}
            icons={icons}
          />
        )}

        {previewTab === "examples" && (
          <LessonPlanPreviewExamplesTab
            examplesPreview={examplesPreview}
            copiedKey={copiedKey}
            editingLessonField={editingLessonField}
            lessonFieldDraft={lessonFieldDraft}
            lockedLessonFields={lockedLessonFields}
            onCopy={onCopy}
            onStartEdit={startEditLessonField}
            onCancelEdit={cancelEditLessonField}
            onSaveEdit={(key) => saveLessonFieldEdit(key, onSaveField)}
            onFieldDraftChange={setLessonFieldDraft}
            onToggleLock={toggleLessonFieldLock}
            icons={icons}
          />
        )}

        </Box>

        <LessonPlanPreviewRevision
          revisionPrompt={revisionPrompt}
          isRegenerating={isRegenerating}
          onRevisionPromptChange={setRevisionPrompt}
          onRegenerate={() => handleRegenerate(revisionPrompt, onRegenerate)}
        />

        <LessonPlanPreviewFooter
          onDownload={onDownload}
          onClose={onClose}
          attachCourses={attachCourses}
          attachBusy={attachBusy}
          attachNote={attachNote}
          selectedCourse={selectedCourse}
          onAttach={onAttach}
          onSelectedCourseChange={setSelectedCourse}
        />
      </section>
    </div>
  );
}
