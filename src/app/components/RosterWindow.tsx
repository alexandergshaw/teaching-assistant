"use client";
import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { listCourseHubAction } from "../actions";
import type { Course } from "@/lib/supabase/courses";

export default function RosterWindow({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listCourseHubAction();
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setState("error");
      } else {
        setCourses(result.courses);
        setState("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 90,
        right: 24,
        width: "min(600px, calc(100vw - 48px))",
        maxHeight: "62vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--field-background)",
        border: "1px solid var(--field-border)",
        borderRadius: 14,
        boxShadow: "0 12px 40px rgba(15, 23, 42, 0.18)",
        zIndex: 9998,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--field-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ color: "var(--text-primary)", fontSize: "0.95rem" }}>Class rosters</strong>
        <Button variant="text" size="small" onClick={onClose}>
          Close
        </Button>
      </div>

      <div style={{ padding: "8px 16px 16px", overflowY: "auto" }}>
        {state === "loading" && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "24px 0" }}>
            <CircularProgress size={32} />
          </div>
        )}

        {state === "error" && (
          <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
        )}

        {state === "idle" && courses.length === 0 && (
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>No courses yet. Add courses in the Courses tab.</p>
        )}

        {state === "idle" && courses.map((course) => {
          const rosterText = (course.roster ?? "").trim();
          const count = rosterText ? rosterText.split("\n").map((l) => l.trim()).filter(Boolean).length : 0;

          return (
            <details key={course.id} style={{ borderTop: "1px solid var(--field-border)", padding: "8px 0" }}>
              <summary
                style={{
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  listStyle: "none",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {course.name}
                  {course.courseCode ? ` (${course.courseCode})` : ""}
                </span>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                  {count > 0 ? `${count} students` : "No roster"}
                </span>
                {rosterText && (
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent-ink)",
                      cursor: "pointer",
                      font: "inherit",
                      fontSize: "0.8rem",
                      padding: 0,
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void navigator.clipboard.writeText(rosterText);
                      setCopiedId(course.id);
                      window.setTimeout(() => setCopiedId((v) => (v === course.id ? null : v)), 1500);
                    }}
                  >
                    {copiedId === course.id ? "Copied" : "Copy"}
                  </button>
                )}
              </summary>
              {rosterText && (
                <pre
                  style={{
                    margin: "8px 0 0",
                    padding: "8px 10px",
                    background: "color-mix(in srgb, var(--field-border) 18%, transparent)",
                    borderRadius: 8,
                    fontSize: "0.8rem",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    color: "var(--text-primary)",
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  {rosterText}
                </pre>
              )}
              {!rosterText && (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", margin: "8px 0 0" }}>
                  No roster saved. Add one on the course&apos;s tile in the Courses tab.
                </p>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}
