"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listCoursesAction,
  getCourseFileUrlAction,
  type CourseLibraryEntry,
  type CourseFileRef,
} from "../courseActions";
import styles from "../page.module.css";

export default function CourseLibraryTab() {
  const [courses, setCourses] = useState<CourseLibraryEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await listCoursesAction();
      if (!active) return;
      if ("error" in result) {
        setError(result.error);
        setStatus("error");
        return;
      }
      setCourses(result.courses);
      setStatus("done");
    })();
    return () => {
      active = false;
    };
  }, []);

  const openFile = useCallback(async (filePath: string) => {
    const result = await getCourseFileUrlAction(filePath);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }, []);

  const renderFileLinks = (files: CourseFileRef[]) => {
    if (files.length === 0) {
      return <span style={{ color: "var(--text-secondary)" }}>&mdash;</span>;
    }
    return (
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {files.map((file) => (
          <li key={file.id}>
            {file.filePath ? (
              <button
                type="button"
                className={styles.downloadButton}
                onClick={() => void openFile(file.filePath as string)}
              >
                {file.fileName ?? file.title}
              </button>
            ) : (
              <span>{file.fileName ?? file.title}</span>
            )}
          </li>
        ))}
      </ul>
    );
  };

  const renderSingleFile = (file: { fileName: string; filePath: string } | null) => {
    if (!file) {
      return <span style={{ color: "var(--text-secondary)" }}>&mdash;</span>;
    }
    return (
      <button
        type="button"
        className={styles.downloadButton}
        onClick={() => void openFile(file.filePath)}
      >
        {file.fileName}
      </button>
    );
  };

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h1>Course Library</h1>
        <p>
          Courses created on the New Build Courses tab, along with the schedules,
          repositories, lectures, and documents generated for them.
        </p>
      </div>

      {status === "loading" && (
        <p style={{ color: "var(--text-secondary)" }}>Loading courses&hellip;</p>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {status === "done" && courses.length === 0 && (
        <p style={{ color: "var(--text-secondary)" }}>
          No courses yet. Use the End to End option on the New Build Courses tab to create one.
        </p>
      )}

      {status === "done" && courses.length > 0 && (
        <div className={styles.courseScheduleWrap}>
          <table className={styles.courseScheduleTable}>
            <thead>
              <tr>
                <th>Course</th>
                <th>Term</th>
                <th>Schedule</th>
                <th>Repository</th>
                <th>Lectures</th>
                <th>Module Intros</th>
                <th>Assignment Instructions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id}>
                  <td>{course.title}</td>
                  <td>{course.term ?? "\u2014"}</td>
                  <td>{renderSingleFile(course.scheduleFile)}</td>
                  <td>{renderSingleFile(course.codebaseFile)}</td>
                  <td>{renderFileLinks(course.lectures)}</td>
                  <td>{renderFileLinks(course.moduleIntroductions)}</td>
                  <td>{renderFileLinks(course.assignmentInstructions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
