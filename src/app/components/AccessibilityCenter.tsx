"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import { useAccessibility } from "./AccessibilityProvider";
import RemediationEditor, { isRemediable } from "./RemediationEditor";
import OfficeAltEditor from "./OfficeAltEditor";
import DocStructureEditor from "./DocStructureEditor";
import PdfFixEditor from "./PdfFixEditor";
import {
  autoFixOfficeFileAction,
  getAccessibilityItemHtmlAction,
  saveAccessibilityItemHtmlAction,
  suggestAltTextAction,
  suggestLinkTextAction,
} from "../actions";
import { applyFix, isAutoFix, needsAiValue } from "@/lib/accessibility/remediate";
import { getStoredProvider } from "@/lib/llm-provider";
import type { AccessibleItemType, Issue, ItemScan, Severity } from "@/lib/accessibility/types";

// Ids of the file issues that the headless "fix without preview" can resolve;
// their presence also marks a file as a docx/pptx (vs a PDF we can't auto-fix).
const OFFICE_FIX_RULES = new Set(["office-image-alt", "doc-no-title", "doc-no-structure"]);
const isOfficeFixable = (item: ItemScan): boolean =>
  item.type === "file" && item.issues.some((i) => OFFICE_FIX_RULES.has(i.ruleId));

// An HTML issue the headless fix can apply on its own (deterministic transform or
// an AI alt/link value) — i.e. everything except human-judgment fixes like broken
// links and contrast.
const isHeadlessHtmlFix = (issue: Issue): boolean => isAutoFix(issue) || needsAiValue(issue);
// Any item that the bulk "fix without preview" can act on.
const isBulkFixable = (item: ItemScan): boolean =>
  isOfficeFixable(item) || (isRemediable(item.type) && item.issues.some(isHeadlessHtmlFix));
const itemKey = (item: { type: AccessibleItemType; id: string }) => `${item.type}:${item.id}`;

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
      const pdf = fixable.find((i) => i.ruleId.startsWith("pdf-"));
      if (pdf) queue.push(at(pdf));
    } else if (isRemediable(item.type)) {
      for (const issue of fixable) queue.push(at(issue));
    }
  }
  return queue;
}

const SEVERITY: Record<Severity, { color: string; label: string }> = {
  error: { color: "var(--danger)", label: "Error" },
  warning: { color: "var(--warning)", label: "Warning" },
  suggestion: { color: "var(--accent-ink)", label: "Suggestion" },
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
  // Headless bulk-fix: ticked item keys (`type:id`) and live progress while fixing.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
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

  // Name the course under review: its display name, else its Canvas id from the URL.
  const courseId = a11y.courseUrl.match(/\/courses\/(\d+)/)?.[1];
  const courseLabel = a11y.courseName || (courseId ? `Course ${courseId}` : "");

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

  const bulkItems = flagged.filter(isBulkFixable);
  const selectedCount = bulkItems.filter((it) => selectedKeys.has(itemKey(it))).length;
  const allSelected = bulkItems.length > 0 && selectedCount === bulkItems.length;
  const toggleSelected = (it: ItemScan) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const k = itemKey(it);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const toggleSelectAll = () =>
    setSelectedKeys(allSelected ? new Set() : new Set(bulkItems.map(itemKey)));

  // Apply every headless HTML fix on one item (AI alt/link + deterministic
  // transforms) in the browser, save the result, and re-scan it.
  const fixHtmlItem = async (item: ItemScan, provider: ReturnType<typeof getStoredProvider>): Promise<void> => {
    const fetched = await getAccessibilityItemHtmlAction(a11y.courseUrl, item.type, item.id, a11y.acronym);
    if ("error" in fetched) return;
    let html = fetched.html;
    for (const issue of item.issues.filter(isHeadlessHtmlFix)) {
      let value: string | undefined;
      if (needsAiValue(issue)) {
        const sug =
          issue.fixKind === "ai-alt"
            ? await suggestAltTextAction(item.title, issue.locator.snippet, provider)
            : await suggestLinkTextAction(item.title, issue.locator.snippet, provider);
        if (!("error" in sug)) value = sug.text;
      }
      const res = applyFix(html, issue, value);
      if (res.changed) html = res.html;
    }
    const saved = await saveAccessibilityItemHtmlAction(a11y.courseUrl, item.type, item.id, html, a11y.acronym);
    if (!("error" in saved)) await a11y.rescanItem(item.type, item.id);
  };

  // Fix every selected item headlessly (files via the server action, pages/etc.
  // in the browser) and save each back to Canvas — no editor previews.
  const fixSelected = async () => {
    const targets = bulkItems.filter((it) => selectedKeys.has(itemKey(it)));
    if (targets.length === 0 || fixing) return;
    const provider = getStoredProvider();
    setFixing({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i += 1) {
      const it = targets[i];
      if (it.type === "file") {
        const r = await autoFixOfficeFileAction(a11y.courseUrl, Number(it.id), a11y.acronym, provider);
        if (!("error" in r)) a11y.setFileScan(it.id, it.title, r.issues);
      } else {
        await fixHtmlItem(it, provider);
      }
      setFixing({ done: i + 1, total: targets.length });
    }
    setFixing(null);
    setSelectedKeys(new Set());
  };

  const panel: CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: "min(440px, 96vw)",
    background: "var(--field-background)",
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
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>Accessibility</h2>
              {a11y.hasCourse && courseLabel && (
                <div
                  title={courseLabel}
                  style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}
                >
                  {courseLabel}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => a11y.checkLinks()}
                disabled={a11y.linkStatus === "running"}
                title="Run Canvas's link validator and merge broken links into this list"
              >
                {a11y.linkStatus === "running" ? "Checking links..." : a11y.linkStatus === "done" ? "Recheck links" : "Check links"}
              </Button>
              <Button
                variant={reviewQueueNow.length === 0 ? "outlined" : "contained"}
                size="small"
                onClick={startReview}
                disabled={reviewQueueNow.length === 0}
                title="Step through every fixable issue; saving moves you to the next"
              >
                {reviewQueueNow.length === 0 ? "Review all" : `Review all (${reviewQueueNow.length})`}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => a11y.rescanAll()}
                disabled={a11y.status === "scanning"}
              >
                {a11y.status === "scanning" ? "Scanning..." : "Rescan"}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={close}
                aria-label="Close"
              >
                Close
              </Button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: "0.84rem", color: "var(--text-secondary)" }}>
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

          {bulkItems.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--field-border, #eef2f7)" }}>
              <FormControlLabel
                control={<Checkbox checked={allSelected} onChange={toggleSelectAll} size="small" aria-label="Select all fixable items" />}
                label={selectedCount > 0 ? `${selectedCount} selected` : `Select all (${bulkItems.length})`}
                sx={{ fontSize: "0.8rem" }}
              />
              <Button
                variant="contained"
                size="small"
                onClick={fixSelected}
                disabled={selectedCount === 0 || !!fixing}
                title="Auto-fix the selected items (AI alt/link text, headings, titles, language) and save to Canvas without opening an editor"
                sx={{ marginLeft: "auto", fontSize: "0.8rem" }}
              >
                {fixing ? `Fixing ${fixing.done}/${fixing.total}...` : "Fix selected without preview"}
              </Button>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
          {!a11y.hasCourse ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Open a course under LMS Integration to scan it for accessibility issues.
            </p>
          ) : a11y.status === "scanning" && flagged.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Scanning the course…</p>
          ) : a11y.status === "error" ? (
            <p style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{a11y.error ?? "Scan failed."}</p>
          ) : flagged.length === 0 ? (
            <p style={{ color: "var(--success)", fontSize: "0.9rem", fontWeight: 600 }}>
              No accessibility issues found in this course.
            </p>
          ) : (
            flagged.map((item) => (
              <ItemBlock
                key={`${item.type}:${item.id}`}
                item={item}
                selected={isBulkFixable(item) ? selectedKeys.has(itemKey(item)) : undefined}
                onToggleSelect={isBulkFixable(item) ? () => toggleSelected(item) : undefined}
                onFix={(issue) => setFixTarget({ type: item.type, id: item.id, title: item.title, issue })}
              />
            ))
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
      ) : fixTarget && fixTarget.type === "file" && fixTarget.issue.ruleId.startsWith("pdf-") ? (
        <PdfFixEditor
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
      <div style={{ padding: "9px 12px", background: "var(--surface-subtle)", borderBottom: "1px solid var(--field-border, #eef2f7)", display: "flex", gap: 9, alignItems: "flex-start" }}>
        {onToggleSelect && (
          <Checkbox
            checked={!!selected}
            onChange={onToggleSelect}
            slotProps={{ input: { "aria-label": `Select ${item.title} for bulk fix` } }}
            size="small"
            sx={{ marginTop: 0.375, flexShrink: 0 }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-secondary)" }}>
            {TYPE_LABEL[item.type]}
          </div>
          <div style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--text-primary)", wordBreak: "break-word" }}>{item.title}</div>
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {issues.map((issue, i) => (
          <li
            key={i}
            style={{ padding: "9px 12px", borderTop: i === 0 ? "none" : "1px solid var(--border-soft)", display: "flex", gap: 9, alignItems: "flex-start" }}
          >
            <span style={{ marginTop: 4 }}>
              <Dot color={SEVERITY[issue.severity].color} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>{issue.message}</div>
              <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 2 }}>
                {SEVERITY[issue.severity].label}
                {issue.wcag ? ` · WCAG ${issue.wcag}` : ""}
              </div>
            </div>
            {remediable && issue.fixKind !== "flag" && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => onFix(issue)}
                title="Open an editor with this fix pre-applied"
                sx={{ flexShrink: 0, fontSize: "0.78rem", alignSelf: "center" }}
              >
                Fix
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
