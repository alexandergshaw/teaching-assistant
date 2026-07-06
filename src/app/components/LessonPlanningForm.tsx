"use client";

import type { RefObject } from "react";
import TabHeader from "./TabHeader";
import styles from "../page.module.css";

type LessonPlanningFormProps = {
  moduleObjectives: string;
  onModuleObjectivesChange: (value: string) => void;
  moduleTitle: string;
  onModuleTitleChange: (value: string) => void;
  // True when the Course Engine ("other") provider is active. Gates the
  // Module Title control (only that endpoint uses it) and tailors the Context
  // file hint (the file seeds the deck on Course Engine vs. adds context on Gemini).
  isCourseEngine: boolean;
  lessonContext: string;
  onLessonContextChange: (value: string) => void;
  contextFileRef: RefObject<HTMLInputElement | null>;
  homeworkText: string;
  onHomeworkTextChange: (value: string) => void;
  homeworkFileRef: RefObject<HTMLInputElement | null>;
  lessonError: string | null;
  isGeneratingLesson: boolean;
  onGenerate: () => void;
};

export default function LessonPlanningForm({
  moduleObjectives,
  onModuleObjectivesChange,
  moduleTitle,
  onModuleTitleChange,
  isCourseEngine,
  lessonContext,
  onLessonContextChange,
  contextFileRef,
  homeworkText,
  onHomeworkTextChange,
  homeworkFileRef,
  lessonError,
  isGeneratingLesson,
  onGenerate,
}: LessonPlanningFormProps) {
  return (
    <section className={styles.card}>
      <TabHeader
        eyebrow="Pre Built Courses"
        title="Plan a lesson"
        subtitle="Plan and generate lesson content with AI assistance."
      />
      {isCourseEngine && (
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
          <p>
            {isCourseEngine
              ? "Optionally attach an existing deck or document to base this lecture on (the first file is used as the source; .pptx, .docx, .pdf… up to ~4.5 MB)."
              : "Optionally attach any files for additional context."}
          </p>
        </div>
      </div>
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
