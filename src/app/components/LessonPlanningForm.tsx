"use client";

import type { RefObject } from "react";
import styles from "../page.module.css";

type LessonPlanningFormProps = {
  moduleObjectives: string;
  onModuleObjectivesChange: (value: string) => void;
  moduleTitle: string;
  onModuleTitleChange: (value: string) => void;
  // The module title is only consumed by the Course Engine ("other") provider's
  // /api/v1/lecture endpoint, so the control is shown only for that provider.
  showModuleTitle: boolean;
  lessonContext: string;
  onLessonContextChange: (value: string) => void;
  contextFileRef: RefObject<HTMLInputElement | null>;
  homeworkText: string;
  onHomeworkTextChange: (value: string) => void;
  homeworkFileRef: RefObject<HTMLInputElement | null>;
  // The homework input only feeds the Gemini slide generator, so it is shown
  // only for that provider.
  showHomework: boolean;
  lessonError: string | null;
  isGeneratingLesson: boolean;
  onGenerate: () => void;
};

export default function LessonPlanningForm({
  moduleObjectives,
  onModuleObjectivesChange,
  moduleTitle,
  onModuleTitleChange,
  showModuleTitle,
  lessonContext,
  onLessonContextChange,
  contextFileRef,
  homeworkText,
  onHomeworkTextChange,
  homeworkFileRef,
  showHomework,
  lessonError,
  isGeneratingLesson,
  onGenerate,
}: LessonPlanningFormProps) {
  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h1>Pre Built Courses</h1>
        <p>Plan and generate lesson content with AI assistance.</p>
      </div>
      {showModuleTitle && (
        <div className={styles.field}>
          <label htmlFor="moduleTitle">Module Title</label>
          <input
            id="moduleTitle"
            type="text"
            className={styles.textInput}
            placeholder="e.g. Introduction to Python"
            value={moduleTitle}
            onChange={(e) => onModuleTitleChange(e.target.value)}
          />
          <p className={styles.fieldHint}>
            Titles the lecture deck and biases source retrieval (e.g. resolves
            &ldquo;for loop&rdquo; to the programming sense). Defaults to
            &ldquo;Module Lecture&rdquo; if left blank.
          </p>
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor="moduleObjectives">Module Objectives</label>
        <textarea
          id="moduleObjectives"
          placeholder="Describe the learning objectives for this module…"
          style={{ minHeight: "260px" }}
          value={moduleObjectives}
          onChange={(e) => onModuleObjectivesChange(e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="lessonContext">Context</label>
        <textarea
          id="lessonContext"
          placeholder="Add any background context, notes, or relevant information…"
          style={{ minHeight: "180px" }}
          value={lessonContext}
          onChange={(e) => onLessonContextChange(e.target.value)}
        />
        <div className={styles.fileField}>
          <input id="lessonContextFile" type="file" multiple ref={contextFileRef} />
          <p>Optionally attach any files for additional context.</p>
        </div>
      </div>
      {showHomework && (
        <div className={styles.field}>
          <label htmlFor="homeworkAssignment">Homework Assignment (optional)</label>
          <textarea
            id="homeworkAssignment"
            placeholder="Paste the homework assignment students will complete after this lecture…"
            style={{ minHeight: "180px" }}
            value={homeworkText}
            onChange={(e) => onHomeworkTextChange(e.target.value)}
          />
          <div className={styles.fileField}>
            <input id="homeworkFile" type="file" ref={homeworkFileRef} />
            <p>Optionally attach the assignment file (.pdf, .docx, .pptx, .txt…).</p>
          </div>
          <p className={styles.fieldHint}>
            The slides will teach everything students need to complete this
            assignment, without restating its questions or giving away the
            answers.
          </p>
        </div>
      )}
      {lessonError && <p className={styles.error}>{lessonError}</p>}
      <button
        type="button"
        className={styles.submitButton}
        onClick={onGenerate}
        disabled={isGeneratingLesson}
      >
        {isGeneratingLesson ? "Generating…" : "Generate"}
      </button>
    </section>
  );
}
