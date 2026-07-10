"use client";

import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import {
  getAccessibilityItemHtmlAction,
  saveAccessibilityItemHtmlAction,
  suggestAltTextAction,
  suggestLinkTextAction,
} from "../actions";
import { applyFix, needsAiValue } from "@/lib/accessibility/remediate";
import type { AccessibleItemType, Issue } from "@/lib/accessibility/types";
import { getStoredProvider } from "@/lib/llm-provider";

const REMEDIABLE: AccessibleItemType[] = ["page", "assignment", "quiz", "discussion", "announcement", "syllabus"];

/** Whether this item type can be fetched + saved here (has an editor route). */
export function isRemediable(type: AccessibleItemType): boolean {
  return REMEDIABLE.includes(type);
}

/**
 * A focused editor that fetches the item's HTML, pre-applies the fix for one
 * issue (calling AI for alt/link text when needed), lets the user review the
 * result, and saves it back to Canvas — the "Fix" flow, 2 clicks end to end.
 */
export default function RemediationEditor({
  courseUrl,
  acronym,
  type,
  id,
  title,
  issue,
  progress,
  onSkip,
  onClose,
}: {
  courseUrl: string;
  acronym?: string;
  type: AccessibleItemType;
  id: string;
  title: string;
  issue: Issue;
  progress?: { index: number; total: number };
  onSkip?: () => void;
  onClose: (saved: boolean) => void;
}) {
  const [stage, setStage] = useState<"loading" | "ready" | "saving">("loading");
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [located, setLocated] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) Fetch current content.
      const r = await getAccessibilityItemHtmlAction(courseUrl, type, id, acronym);
      if (cancelled) return;
      if ("error" in r) {
        setError(r.error);
        setStage("ready");
        return;
      }
      const html = r.html;

      // 2) AI value for alt/link fixes.
      let value: string | undefined;
      if (needsAiValue(issue)) {
        const provider = getStoredProvider();
        const sug =
          issue.fixKind === "ai-alt"
            ? await suggestAltTextAction(title, issue.locator.snippet, provider)
            : await suggestLinkTextAction(title, issue.locator.snippet, provider);
        if (!cancelled && !("error" in sug)) value = sug.text;
      }
      if (cancelled) return;

      // 3) Pre-apply the fix.
      const fixed = applyFix(html, issue, value);
      setBody(fixed.html);
      setLocated(fixed.changed);
      setStage("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, acronym, type, id, title, issue]);

  const save = async () => {
    setStage("saving");
    setError(null);
    const result = await saveAccessibilityItemHtmlAction(courseUrl, type, id, body, acronym);
    if ("error" in result) {
      setError(result.error);
      setStage("ready");
      return;
    }
    // Re-scan this item so its badge/center entry updates.
    window.dispatchEvent(new CustomEvent("ta-content-saved", { detail: { type, id } }));
    onClose(true);
  };

  return (
    <div
      onClick={() => onClose(false)}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      role="dialog"
      aria-modal="true"
      aria-label="Fix accessibility issue"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(720px, 96vw)", maxHeight: "90vh", background: "var(--field-background)", borderRadius: 12, display: "flex", flexDirection: "column", boxShadow: "0 18px 50px rgba(15,23,42,0.3)" }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--field-border, #e2e8f0)" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>Fix · {title}</span>
            {progress && <span style={{ color: "var(--accent, #2563eb)" }}>{progress.index} of {progress.total}</span>}
          </div>
          <div style={{ fontSize: "0.95rem", color: "var(--text-primary)", marginTop: 2 }}>{issue.message}</div>
        </div>

        <div style={{ padding: "14px 18px", overflowY: "auto" }}>
          {stage === "loading" ? (
            <p style={{ color: "var(--text-secondary)" }}>Preparing the fix…</p>
          ) : (
            <>
              <p style={{ fontSize: "0.85rem", color: located ? "var(--success)" : "var(--text-secondary)", margin: "0 0 8px" }}>
                {located
                  ? "Fix pre-applied below — review the HTML and save."
                  : issue.ruleId === "broken-link"
                    ? "Find the link below and update or remove it, then save."
                    : "Locate the highlighted issue in the HTML below, fix it, and save."}
              </p>
              <TextField
                fullWidth
                multiline
                minRows={10}
                value={body}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setBody(e.target.value)}
                slotProps={{
                  input: {
                    onKeyDown: ((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                      // Plain Enter edits the HTML; Ctrl/Cmd+Enter saves.
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && stage === "ready" && body.trim()) {
                        e.preventDefault();
                        void save();
                      }
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    }) as any,
                    spellCheck: false,
                  },
                }}
                size="small"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    fontFamily: "ui-monospace, Menlo, monospace",
                    fontSize: "0.8rem",
                    lineHeight: 1.5,
                  },
                }}
              />
            </>
          )}
          {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: 8 }}>{error}</p>}
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--field-border, #e2e8f0)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => onClose(false)}
          >
            Cancel
          </Button>
          {onSkip && (
            <Button
              variant="outlined"
              size="small"
              onClick={onSkip}
            >
              Skip
            </Button>
          )}
          <Button
            variant="contained"
            size="small"
            onClick={save}
            disabled={stage !== "ready" || !body.trim()}
          >
            {stage === "saving" ? "Saving..." : "Save to Canvas"}
          </Button>
        </div>
      </div>
    </div>
  );
}
