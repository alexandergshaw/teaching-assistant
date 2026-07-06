"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listCoursesAction,
  listAssignmentsAction,
  listStudentsAction,
  pullSubmissionAction,
} from "../actions";
import { useInstitutionSelection } from "@/lib/institutions";
import type { CanvasCourse, CanvasAssignmentBrief, CanvasPerson, CanvasSubmissionDetail } from "@/lib/canvas";
import FilePreviewModal, { type PreviewFile } from "./FilePreviewModal";
import styles from "../page.module.css";

interface Size {
  width: number;
  height: number;
}

const MIN_W = 340;
const MAX_W_OFFSET = 24;
const MIN_H = 320;
const MAX_H_OFFSET = 24;
const DEFAULT_W = 420;
const DEFAULT_H = 620;

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem("ta:" + key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, value: T): void {
  try {
    localStorage.setItem("ta:" + key, JSON.stringify(value));
  } catch {
    /* Quota exceeded or private browsing — silently ignore. */
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function SubmissionPullbackWindow({ onClose }: { onClose: () => void }) {
  const { institutions, active: activeInstitution } = useInstitutionSelection();
  const sizeRef = useRef<Size>({ width: 0, height: 0 });

  const [size, setSize] = useState<Size>(() => {
    if (typeof window === "undefined") return { width: DEFAULT_W, height: DEFAULT_H };
    const maxW = window.innerWidth - MAX_W_OFFSET;
    const maxH = window.innerHeight - MAX_H_OFFSET;
    const saved = readLS<Size | null>("pullback-size", null);
    if (saved) {
      return {
        width: clamp(saved.width, MIN_W, maxW),
        height: clamp(saved.height, MIN_H, maxH),
      };
    }
    return {
      width: clamp(DEFAULT_W, MIN_W, maxW),
      height: clamp(DEFAULT_H, MIN_H, maxH),
    };
  });

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  const [institution, setInstitution] = useState(activeInstitution);

  const [courseState, setCourseState] = useState<"idle" | "loading" | "error">(activeInstitution ? "loading" : "idle");
  const [courses, setCourses] = useState<CanvasCourse[]>([]);
  const [prevInstitution, setPrevInstitution] = useState(activeInstitution);
  if (institution !== prevInstitution) {
    setPrevInstitution(institution);
    setCourses([]);
    setCourseState(institution ? "loading" : "idle");
  }

  const [courseId, setCourseId] = useState("");
  const [assignmentState, setAssignmentState] = useState<"idle" | "loading" | "error">("idle");
  const [assignments, setAssignments] = useState<CanvasAssignmentBrief[]>([]);
  const [assignmentId, setAssignmentId] = useState("");

  const [studentState, setStudentState] = useState<"idle" | "loading" | "error">("idle");
  const [students, setStudents] = useState<CanvasPerson[]>([]);
  const [studentId, setStudentId] = useState("");

  const [submission, setSubmission] = useState<CanvasSubmissionDetail | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);

  const [selectedPreview, setSelectedPreview] = useState<PreviewFile | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    writeLS("pullback-size", size);
  }, [size]);

  // Load courses when institution changes (await-first pattern)
  useEffect(() => {
    if (!institution) return;
    let cancelled = false;
    (async () => {
      const result = await listCoursesAction(institution);
      if (cancelled) return;
      if ("error" in result) {
        setCourses([]);
        setCourseState("error");
      } else {
        setCourses(result.courses);
        setCourseState("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [institution]);

  // Load assignments and students when course changes
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    Promise.all([
      listAssignmentsAction(institution, courseId),
      listStudentsAction(institution, courseId),
    ]).then(([assignResult, studentResult]) => {
      if (cancelled) return;
      if ("error" in assignResult) {
        setAssignments([]);
        setAssignmentState("error");
      } else {
        setAssignments(assignResult.assignments);
        setAssignmentState("idle");
      }
      if ("error" in studentResult) {
        setStudents([]);
        setStudentState("error");
      } else {
        setStudents(studentResult.students);
        setStudentState("idle");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [courseId, institution]);

  const handlePullBack = useCallback(async () => {
    if (!institution || !courseId || !assignmentId || !studentId) return;
    setPulling(true);
    setPullError(null);
    const result = await pullSubmissionAction(
      institution,
      courseId,
      assignmentId,
      Number(studentId)
    );
    setPulling(false);
    if ("error" in result) {
      setPullError(result.error);
      setSubmission(null);
    } else {
      setSubmission(result.submission);
    }
  }, [institution, courseId, assignmentId, studentId]);

  const openPreview = useCallback((file: CanvasSubmissionDetail["files"][0]) => {
    if (!submission) return;
    const dotIndex = file.name.lastIndexOf(".");
    const extension = dotIndex > 0 ? file.name.slice(dotIndex + 1).toLowerCase() : "";

    let content = "";
    const isTextType =
      file.mimeType?.startsWith("text/") ||
      file.mimeType === "application/json" ||
      ["py", "js", "ts", "tsx", "jsx", "txt", "md", "java", "c", "cpp", "h", "csv", "json", "html", "css"].includes(
        extension
      );

    if (isTextType) {
      try {
        const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
        content = new TextDecoder().decode(bytes);
      } catch {
        content = "Preview not available for this file type. Use Download.";
      }
    } else {
      content = "Preview not available for this file type. Use Download.";
    }

    let blobUrl: string | null = null;
    if (file.mimeType === "application/pdf" || file.mimeType?.startsWith("image/")) {
      try {
        const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: file.mimeType });
        blobUrl = URL.createObjectURL(blob);
      } catch {
        /* Fallback to text preview. */
      }
    }

    setSelectedPreview({
      student: submission.student,
      name: file.name,
      extension,
      content,
      truncated: false,
      rawBase64: file.base64,
      mimeType: file.mimeType,
    });
    setPreviewBlobUrl(blobUrl);
  }, [submission]);

  const closePreview = useCallback(() => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }
    setSelectedPreview(null);
    setPreviewBlobUrl(null);
  }, [previewBlobUrl]);

  const downloadFile = useCallback((file: CanvasSubmissionDetail["files"][0]) => {
    try {
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: file.mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      /* Download failed. */
    }
  }, []);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startMouse = { x: e.clientX, y: e.clientY };
    const startSize = { ...sizeRef.current };

    const onMove = (ev: MouseEvent) => {
      const maxW = window.innerWidth - MAX_W_OFFSET;
      const maxH = window.innerHeight - MAX_H_OFFSET;
      setSize({
        width: clamp(startSize.width + (startMouse.x - ev.clientX), MIN_W, maxW),
        height: clamp(startSize.height + (ev.clientY - startMouse.y), MIN_H, maxH),
      });
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };

    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  if (institutions.length === 0) {
    return (
      <div
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 9998,
          width: size.width,
          height: size.height,
          background: "var(--surface, #fff)",
          border: "1px solid var(--field-border, #d1d5db)",
          borderRadius: 12,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div className={styles.previewHeader}>
          <h3>Pull back submission</h3>
          <button
            type="button"
            className={styles.previewCloseButton}
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          <p className={styles.fieldHint}>
            Add an institution in Settings to pull back submissions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 9998,
          width: size.width,
          height: size.height,
          background: "var(--surface, #fff)",
          border: "1px solid var(--field-border, #d1d5db)",
          borderRadius: 12,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div className={styles.previewHeader}>
          <h3>Pull back submission</h3>
          <button
            type="button"
            className={styles.previewCloseButton}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 16 }}>
          {institutions.length > 1 && (
            <div className={styles.field}>
              <label htmlFor="pullback-institution">Institution</label>
              <select
                id="pullback-institution"
                className={styles.textInput}
                value={institution}
                onChange={(e) => {
                  setInstitution(e.target.value);
                  setCourseId("");
                  setAssignmentId("");
                  setStudentId("");
                  setSubmission(null);
                }}
              >
                {institutions.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="pullback-course">Course</label>
            <select
              id="pullback-course"
              className={styles.textInput}
              value={courseId}
              disabled={courseState === "loading" || courses.length === 0}
              onChange={(e) => {
                setCourseId(e.target.value);
                setAssignmentId("");
                setStudentId("");
                setSubmission(null);
              }}
            >
              <option value="">
                {courseState === "loading"
                  ? "Loading courses..."
                  : courses.length === 0
                    ? "No courses found"
                    : "Select a course..."}
              </option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {courseState === "error" && (
              <p className={styles.fieldHint}>Could not load courses.</p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="pullback-assignment">Assignment</label>
            <select
              id="pullback-assignment"
              className={styles.textInput}
              value={assignmentId}
              disabled={assignmentState === "loading" || assignments.length === 0 || !courseId}
              onChange={(e) => {
                setAssignmentId(e.target.value);
                setSubmission(null);
              }}
            >
              <option value="">
                {assignmentState === "loading"
                  ? "Loading assignments..."
                  : assignments.length === 0
                    ? "No assignments found"
                    : "Select an assignment..."}
              </option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {assignmentState === "error" && (
              <p className={styles.fieldHint}>Could not load assignments.</p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="pullback-student">Student</label>
            <select
              id="pullback-student"
              className={styles.textInput}
              value={studentId}
              disabled={studentState === "loading" || students.length === 0 || !courseId}
              onChange={(e) => {
                setStudentId(e.target.value);
                setSubmission(null);
              }}
            >
              <option value="">
                {studentState === "loading"
                  ? "Loading students..."
                  : students.length === 0
                    ? "No students found"
                    : "Select a student..."}
              </option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {studentState === "error" && (
              <p className={styles.fieldHint}>Could not load students.</p>
            )}
          </div>

          <button
            type="button"
            className={styles.downloadButton}
            onClick={handlePullBack}
            disabled={!institution || !courseId || !assignmentId || !studentId || pulling}
            style={{ alignSelf: "flex-start" }}
          >
            {pulling ? "Pulling..." : "Pull back"}
          </button>

          {pullError && <p className={styles.error}>{pullError}</p>}

          {submission && (
            <>
              <div style={{ paddingTop: 8, borderTop: "1px solid var(--field-border)" }}>
                <p style={{ margin: 0, fontWeight: 600, color: "var(--text-primary)" }}>
                  {submission.student}
                </p>
                <p className={styles.fieldHint} style={{ marginTop: 4 }}>
                  {submission.assignmentName}
                </p>

                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  <p className={styles.fieldHint}>
                    Status: {submission.workflowState}
                  </p>
                  <p className={styles.fieldHint}>
                    Score: {submission.score ?? "-"}
                    {submission.pointsPossible != null ? ` / ${submission.pointsPossible}` : ""}
                  </p>
                  <p className={styles.fieldHint}>
                    Submitted:{" "}
                    {submission.submittedAt
                      ? new Date(submission.submittedAt).toLocaleString()
                      : "not submitted"}
                  </p>
                  <a
                    href={submission.speedGraderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.fieldHint}
                    style={{ color: "var(--accent)", textDecoration: "underline", cursor: "pointer" }}
                  >
                    Open in SpeedGrader
                  </a>
                </div>

                {submission.text.trim() ? (
                  <pre
                    style={{
                      marginTop: 12,
                      padding: 12,
                      background: "color-mix(in srgb, var(--field-background) 94%, var(--accent) 6%)",
                      border: "1px solid var(--field-border)",
                      borderRadius: 8,
                      whiteSpace: "pre-wrap",
                      maxHeight: 200,
                      overflowY: "auto",
                      fontSize: "0.84rem",
                      lineHeight: "1.5",
                      color: "var(--text-primary)",
                    }}
                  >
                    {submission.text}
                  </pre>
                ) : (
                  <p className={styles.fieldHint} style={{ marginTop: 12 }}>
                    No text submission.
                  </p>
                )}

                {submission.files.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ margin: "0 0 8px 0", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      FILES
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {submission.files.map((file, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            padding: "8px 10px",
                            border: "1px solid var(--field-border)",
                            borderRadius: 8,
                            background: "color-mix(in srgb, var(--field-background) 92%, var(--accent) 8%)",
                          }}
                        >
                          <span style={{ fontSize: "0.86rem", flex: 1, minWidth: 0, wordBreak: "break-all", color: "var(--text-primary)" }}>
                            {file.name}
                          </span>
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            <button
                              type="button"
                              className={styles.downloadButton}
                              onClick={() => openPreview(file)}
                              style={{ padding: "5px 10px", fontSize: "0.8rem" }}
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              className={styles.downloadButton}
                              onClick={() => downloadFile(file)}
                              style={{ padding: "5px 10px", fontSize: "0.8rem" }}
                            >
                              Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stage C: grading UI (Grade this submission + GradingResults) mounts here */}
              </div>
            </>
          )}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: 14,
            height: 14,
            cursor: "nesw-resize",
          }}
          onMouseDown={handleResizeMouseDown}
        />
      </div>

      {selectedPreview && (
        <FilePreviewModal
          selectedPreview={selectedPreview}
          previewBlobUrl={previewBlobUrl}
          onClose={closePreview}
        />
      )}
    </>
  );
}
