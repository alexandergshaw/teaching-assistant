"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useAccessibility } from "./AccessibilityProvider";
import RemediationEditor, { isRemediable } from "./RemediationEditor";
import OfficeAltEditor from "./OfficeAltEditor";
import type { AccessibleItemType, Issue, ItemScan, Severity } from "@/lib/accessibility/types";

// What's being fixed right now (drives the RemediationEditor overlay).
type FixTarget = { type: AccessibleItemType; id: string; title: string; issue: Issue };

const SEVERITY: Record<Severity, { color: string; label: string }> = {
  error: { color: "#dc2626", label: "Error" },
  warning: { color: "#d97706", label: "Warning" },
  suggestion: { color: "#2563eb", label: "Suggestion" },
};

const TYPE_LABEL: Record<AccessibleItemType, string> = {
  page: "Page",
  assignment: "Assignment",
  quiz: "Quiz",
  discussion: "Discussion",
  announcement: "Announcement",
  syllabus: "Syllabus",
  file: "File",
};

const SEV_RANK: Record<Severity, number> = { error: 0, warning: 1, suggestion: 2 };

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }}
    />
  );
}

const TRANSITION_MS = 320;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export default function AccessibilityCenter() {
  const a11y = useAccessibility();
  const [fixTarget, setFixTarget] = useState<FixTarget | null>(null);
  // Keep the panel mounted through its slide-out so the exit animates too:
  // `render` controls mounting, `shown` drives the open/closed transform.
  const [render, setRender] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (a11y.centerOpen) {
      setRender(true);
      // Next tick so the browser paints the off-screen state before transitioning.
      const id = window.setTimeout(() => setShown(true), 15);
      return () => window.clearTimeout(id);
    }
    setShown(false);
    const id = window.setTimeout(() => setRender(false), TRANSITION_MS);
    return () => window.clearTimeout(id);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [a11y.centerOpen]);

  if (!render) return null;

  const flagged = Object.values(a11y.items)
    .filter((it) => it.issues.length > 0)
    .sort((x, y) => y.errorCount - x.errorCount || y.warningCount - x.warningCount);

  const close = () => a11y.setCenterOpen(false);

  const panel: CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: "min(440px, 96vw)",
    background: "#ffffff",
    borderLeft: "1px solid var(--field-border, #cbd5e1)",
    boxShadow: "-8px 0 28px rgba(15,23,42,0.18)",
    zIndex: 10000,
    display: "flex",
    flexDirection: "column",
    transform: shown ? "translateX(0)" : "translateX(100%)",
    transition: `transform ${TRANSITION_MS}ms ${EASE}`,
    willChange: "transform",
  };

  return (
    <>
      <div
        onClick={close}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.32)",
          zIndex: 9999,
          opacity: shown ? 1 : 0,
          transition: `opacity ${TRANSITION_MS}ms ease`,
        }}
        aria-hidden="true"
      />
      <aside style={panel} role="dialog" aria-modal="true" aria-label="Accessibility Center">
        {/* Header */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--field-border, #e2e8f0)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}>Accessibility</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => a11y.checkLinks()}
                disabled={a11y.linkStatus === "running"}
                title="Run Canvas's link validator and merge broken links into this list"
                style={{
                  border: "1px solid var(--field-border, #cbd5e1)",
                  background: "#fff",
                  borderRadius: 8,
                  padding: "5px 10px",
                  fontSize: "0.82rem",
                  cursor: a11y.linkStatus === "running" ? "default" : "pointer",
                  color: "#334155",
                }}
              >
                {a11y.linkStatus === "running" ? "Checking links…" : a11y.linkStatus === "done" ? "Recheck links" : "Check links"}
              </button>
              <button
                type="button"
                onClick={() => a11y.scanFiles()}
                disabled={a11y.fileStatus === "running"}
                title="Scan Word/PowerPoint files (image alt text) and PDFs (tagging, language, title)"
                style={{
                  border: "1px solid var(--field-border, #cbd5e1)",
                  background: "#fff",
                  borderRadius: 8,
                  padding: "5px 10px",
                  fontSize: "0.82rem",
                  cursor: a11y.fileStatus === "running" ? "default" : "pointer",
                  color: "#334155",
                }}
              >
                {a11y.fileStatus === "running" ? "Scanning files…" : a11y.fileStatus === "done" ? "Rescan files" : "Scan files"}
              </button>
              <button
                type="button"
                onClick={() => a11y.rescanAll()}
                disabled={a11y.status === "scanning"}
                style={{
                  border: "1px solid var(--field-border, #cbd5e1)",
                  background: "#fff",
                  borderRadius: 8,
                  padding: "5px 10px",
                  fontSize: "0.82rem",
                  cursor: a11y.status === "scanning" ? "default" : "pointer",
                  color: "#334155",
                }}
              >
                {a11y.status === "scanning" ? "Scanning…" : "Rescan"}
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                style={{ border: "1px solid var(--field-border, #cbd5e1)", background: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: "0.82rem", cursor: "pointer", color: "#334155" }}
              >
                Close
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: "0.84rem", color: "#475569" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Dot color={SEVERITY.error.color} /> {a11y.errorCount} errors
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Dot color={SEVERITY.warning.color} /> {a11y.warningCount} warnings
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Dot color={SEVERITY.suggestion.color} /> {a11y.suggestionCount} suggestions
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
          {!a11y.hasCourse ? (
            <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
              Open a course under LMS Integration to scan it for accessibility issues.
            </p>
          ) : a11y.status === "scanning" && flagged.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Scanning the course…</p>
          ) : a11y.status === "error" ? (
            <p style={{ color: "#dc2626", fontSize: "0.9rem" }}>{a11y.error ?? "Scan failed."}</p>
          ) : flagged.length === 0 ? (
            <p style={{ color: "#16a34a", fontSize: "0.9rem", fontWeight: 600 }}>
              No accessibility issues found in this course.
            </p>
          ) : (
            flagged.map((item) => (
              <ItemBlock
                key={`${item.type}:${item.id}`}
                item={item}
                onFix={(issue) => setFixTarget({ type: item.type, id: item.id, title: item.title, issue })}
              />
            ))
          )}
        </div>
      </aside>

      {fixTarget && fixTarget.type === "file" ? (
        <OfficeAltEditor
          courseUrl={a11y.courseUrl}
          acronym={a11y.acronym}
          fileId={Number(fixTarget.id)}
          title={fixTarget.title}
          onClose={(result) => {
            if (result) a11y.setFileScan(fixTarget.id, fixTarget.title, result.issues);
            setFixTarget(null);
          }}
        />
      ) : fixTarget ? (
        <RemediationEditor
          courseUrl={a11y.courseUrl}
          acronym={a11y.acronym}
          type={fixTarget.type}
          id={fixTarget.id}
          title={fixTarget.title}
          issue={fixTarget.issue}
          onClose={() => setFixTarget(null)}
        />
      ) : null}
    </>
  );
}

function ItemBlock({ item, onFix }: { item: ItemScan; onFix: (issue: Issue) => void }) {
  const remediable = isRemediable(item.type) || item.type === "file";
  const issues = [...item.issues].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  return (
    <div style={{ marginBottom: 14, border: "1px solid var(--field-border, #e2e8f0)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid var(--field-border, #eef2f7)" }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#64748b" }}>
          {TYPE_LABEL[item.type]}
        </div>
        <div style={{ fontSize: "0.92rem", fontWeight: 600, color: "#0f172a", wordBreak: "break-word" }}>{item.title}</div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {issues.map((issue, i) => (
          <li
            key={i}
            style={{ padding: "9px 12px", borderTop: i === 0 ? "none" : "1px solid #f1f5f9", display: "flex", gap: 9, alignItems: "flex-start" }}
          >
            <span style={{ marginTop: 4 }}>
              <Dot color={SEVERITY[issue.severity].color} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "0.88rem", color: "#1f2933" }}>{issue.message}</div>
              <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginTop: 2 }}>
                {SEVERITY[issue.severity].label}
                {issue.wcag ? ` · WCAG ${issue.wcag}` : ""}
              </div>
            </div>
            {remediable && issue.fixKind !== "flag" && (
              <button
                type="button"
                onClick={() => onFix(issue)}
                title="Open an editor with this fix pre-applied"
                style={{ flexShrink: 0, border: "1px solid var(--accent, #2563eb)", background: "#fff", color: "var(--accent, #2563eb)", borderRadius: 6, padding: "3px 10px", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", alignSelf: "center" }}
              >
                Fix
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
