"use client";

import type { RefObject } from "react";
import styles from "../page.module.css";

type LessonPlanningFormProps = {
  moduleObjectives: string;
  onModuleObjectivesChange: (value: string) => void;
  lessonContext: string;
  onLessonContextChange: (value: string) => void;
  contextFileRef: RefObject<HTMLInputElement | null>;
  lessonError: string | null;
  isGeneratingLesson: boolean;
  onGenerate: () => void;
};

export default function LessonPlanningForm({
  moduleObjectives,
  onModuleObjectivesChange,
  lessonContext,
  onLessonContextChange,
  contextFileRef,
  lessonError,
  isGeneratingLesson,
  onGenerate,
}: LessonPlanningFormProps) {
  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h1>Lesson Planning</h1>
        <p>Plan and generate lesson content with AI assistance.</p>
      </div>
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
