"use client";

import styles from "../../page.module.css";
import LessonPlanPreviewHeader from "./LessonPlanPreviewHeader";
import LessonPlanPreviewTabs from "./LessonPlanPreviewTabs";
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
          previewTab={previewTab}
          onTabChange={setPreviewTab}
        />

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
