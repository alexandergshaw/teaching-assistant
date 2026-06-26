"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useAccessibility } from "./AccessibilityProvider";
import RemediationEditor, { isRemediable } from "./RemediationEditor";
import OfficeAltEditor from "./OfficeAltEditor";
import DocStructureEditor from "./DocStructureEditor";
import { autoFixOfficeFileAction } from "../actions";
import { getStoredProvider } from "@/lib/llm-provider";
import type { AccessibleItemType, Issue, ItemScan, Severity } from "@/lib/accessibility/types";

// Ids of the file issues that the headless "fix without preview" can resolve;
// their presence also marks a file as a docx/pptx (vs a PDF we can't auto-fix).
const OFFICE_FIX_RULES = new Set(["office-image-alt", "doc-no-title", "doc-no-structure"]);
const isOfficeFixable = (item: ItemScan): boolean =>
  item.type === "file" && item.issues.some((i) => OFFICE_FIX_RULES.has(i.ruleId));

// What's being fixed right now (drives the RemediationEditor overlay).
type FixTarget = { type: AccessibleItemType; id: string; title: string; issue: Issue };

// Build the ordered list of editor "stops" for a review walkthrough. Each stop
// opens one editor: a file contributes at most one image-alt stop and one
// structure stop (each editor fixes all of its kind at once); HTML items
// contribute one stop per fixable issue.
function buildReviewQueue(items: ItemScan[]): FixTarget[] {
  const queue: FixTarget[] = [];
  for (const item of items) {
    const fixable = item.issues.filter((i) => i.fixKind !== "flag");
    if (fixable.length === 0) continue;
    const at = (issue: Issue): FixTarget => ({ type: item.type, id: item.id, title: item.title, issue });
    if (item.type === "file") {
      const alt = fixable.find((i) => i.ruleId === "office-image-alt");
      if (alt) queue.push(at(alt));
      const structure = fixable.find((i) => i.ruleId === "doc-no-title" || i.ruleId === "doc-no-structure");
      if (structure) queue.push(at(structure));
    } else if (isRemediable(item.type)) {
      for (const issue of fixable) queue.push(at(issue));
    }
  }
  return queue;
}

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
  // The review walkthrough: a snapshot queue of stops and the current index.
  // null queue = not reviewing (the Fix buttons open editors one-off).
  const [reviewQueue, setReviewQueue] = useState<FixTarget[] | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  // Headless bulk-fix: ticked file ids and live progress while fixing.
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [fixing, setFixing] = useState<{ done: number; total: number } | null>(null);
  // Keep the panel mounted through its slide-out so the exit animates too:
  // `render` controls mounting, `shown` drives the open/closed transform.
  const [render, setRender] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (a11y.centerOpen) {
      setRender(true);
      // Two animation frames so the browser actually paints the off-screen state
      // (translateX 100%) before we flip to 0 — otherwise it jumps instead of slides.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
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

  const reviewQueueNow = buildReviewQueue(flagged);

  // Open the first stop and enter review mode.
  const startReview = () => {
    if (reviewQueueNow.length === 0) return;
    setReviewQueue(reviewQueueNow);
    setReviewIndex(0);
    setFixTarget(reviewQueueNow[0]);
  };
  const endReview = () => {
    setReviewQueue(null);
    setReviewIndex(0);
    setFixTarget(null);
  };
  // Move to the next stop after a save; end the walkthrough once past the last.
  const advanceReview = () => {
    if (!reviewQueue) {
      setFixTarget(null);
      return;
    }
    const next = reviewIndex + 1;
    if (next >= reviewQueue.length) {
      endReview();
    } else {
      setReviewIndex(next);
      setFixTarget(reviewQueue[next]);
    }
  };
  // After an editor closes: in review, a save advances and a cancel exits;
  // outside review, just clear the overlay.
  const afterFix = (saved: boolean) => {
    if (!reviewQueue) {
      setFixTarget(null);
      return;
    }
    if (saved) advanceReview();
    else endReview();
  };
  const reviewProgress = reviewQueue ? { index: reviewIndex + 1, total: reviewQueue.length } : undefined;

  const officeFiles = flagged.filter(isOfficeFixable);
  const allFilesSelected = officeFiles.length > 0 && officeFiles.every((f) => selectedFiles.has(f.id));
  const toggleFile = (id: string) =>
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllFiles = () =>
    setSelectedFiles(allFilesSelected ? new Set() : new Set(officeFiles.map((f) => f.id)));

  // Fix every selected file headlessly (AI alt + title + headings) and save each
  // back to Canvas, updating the pane as it goes — no editor previews.
  const fixSelectedFiles = async () => {
    const targets = officeFiles.filter((f) => selectedFiles.has(f.id));
    if (targets.length === 0 || fixing) return;
    const provider = getStoredProvider();
    setFixing({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i += 1) {
      const f = targets[i];
      const r = await autoFixOfficeFileAction(a11y.courseUrl, Number(f.id), a11y.acronym, provider);
      if (!("error" in r)) a11y.setFileScan(f.id, f.title, r.issues);
      setFixing({ done: i + 1, total: targets.length });
    }
    setFixing(null);
    setSelectedFiles(new Set());
  };

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
                onClick={startReview}
                disabled={reviewQueueNow.length === 0}
                title="Step through every fixable issue; saving moves you to the next"
                style={{
                  border: "1px solid var(--accent, #2563eb)",
                  background: reviewQueueNow.length === 0 ? "#fff" : "var(--accent, #2563eb)",
                  color: reviewQueueNow.length === 0 ? "#94a3b8" : "#fff",
                  borderRadius: 8,
                  padding: "5px 10px",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: reviewQueueNow.length === 0 ? "default" : "pointer",
                }}
              >
                {reviewQueueNow.length === 0 ? "Review all" : `Review all (${reviewQueueNow.length})`}
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
            <>
              {officeFiles.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 10px", marginBottom: 10, border: "1px solid var(--field-border, #e2e8f0)", borderRadius: 8, background: "#f8fafc" }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "#334155", cursor: "pointer" }}>
                    <input type="checkbox" checked={allFilesSelected} onChange={toggleAllFiles} aria-label="Select all fixable files" />
                    {selectedFiles.size > 0 ? `${selectedFiles.size} selected` : "Select files"}
                  </label>
                  <button
                    type="button"
                    onClick={fixSelectedFiles}
                    disabled={selectedFiles.size === 0 || !!fixing}
                    title="Auto-fix the selected files (AI alt text, title, headings) and save to Canvas without opening an editor"
                    style={{ marginLeft: "auto", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: "0.8rem", fontWeight: 600, background: selectedFiles.size === 0 || fixing ? "#cbd5e1" : "var(--accent, #2563eb)", color: "#fff", cursor: selectedFiles.size === 0 || fixing ? "default" : "pointer" }}
                  >
                    {fixing ? `Fixing ${fixing.done}/${fixing.total}…` : "Fix selected without preview"}
                  </button>
                </div>
              )}
              {flagged.map((item) => (
                <ItemBlock
                  key={`${item.type}:${item.id}`}
                  item={item}
                  selected={isOfficeFixable(item) ? selectedFiles.has(item.id) : undefined}
                  onToggleSelect={isOfficeFixable(item) ? () => toggleFile(item.id) : undefined}
                  onFix={(issue) => setFixTarget({ type: item.type, id: item.id, title: item.title, issue })}
                />
              ))}
            </>
          )}
        </div>
      </aside>

      {fixTarget && fixTarget.type === "file" && fixTarget.issue.ruleId === "office-image-alt" ? (
        <OfficeAltEditor
          courseUrl={a11y.courseUrl}
          acronym={a11y.acronym}
          fileId={Number(fixTarget.id)}
          title={fixTarget.title}
          progress={reviewProgress}
          onSkip={reviewQueue ? advanceReview : undefined}
          onClose={(result) => {
            if (result) a11y.setFileScan(fixTarget.id, fixTarget.title, result.issues);
            afterFix(!!result);
          }}
        />
      ) : fixTarget && fixTarget.type === "file" ? (
        <DocStructureEditor
          courseUrl={a11y.courseUrl}
          acronym={a11y.acronym}
          fileId={Number(fixTarget.id)}
          title={fixTarget.title}
          progress={reviewProgress}
          onSkip={reviewQueue ? advanceReview : undefined}
          onClose={(resolved) => {
            // Clear just the issues this editor fixed; keep the file's others.
            if (resolved && resolved.length > 0) {
              const current = a11y.getItem("file", fixTarget.id)?.issues ?? [];
              a11y.setFileScan(fixTarget.id, fixTarget.title, current.filter((i) => !resolved.includes(i.ruleId)));
            }
            afterFix(!!resolved);
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
          progress={reviewProgress}
          onSkip={reviewQueue ? advanceReview : undefined}
          onClose={(saved) => afterFix(saved)}
        />
      ) : null}
    </>
  );
}

function ItemBlock({
  item,
  selected,
  onToggleSelect,
  onFix,
}: {
  item: ItemScan;
  selected?: boolean;
  onToggleSelect?: () => void;
  onFix: (issue: Issue) => void;
}) {
  const remediable = isRemediable(item.type) || item.type === "file";
  const issues = [...item.issues].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  return (
    <div style={{ marginBottom: 14, border: "1px solid var(--field-border, #e2e8f0)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid var(--field-border, #eef2f7)", display: "flex", gap: 9, alignItems: "flex-start" }}>
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            aria-label={`Select ${item.title} for bulk fix`}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#64748b" }}>
            {TYPE_LABEL[item.type]}
          </div>
          <div style={{ fontSize: "0.92rem", fontWeight: 600, color: "#0f172a", wordBreak: "break-word" }}>{item.title}</div>
        </div>
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
