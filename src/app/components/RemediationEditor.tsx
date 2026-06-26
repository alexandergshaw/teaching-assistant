"use client";

import { useEffect, useState } from "react";
import {
  getPageAction,
  updatePageAction,
  getGradableAction,
  updateGradableAction,
  suggestAltTextAction,
  suggestLinkTextAction,
} from "../actions";
import { applyFix, needsAiValue } from "@/lib/accessibility/remediate";
import type { AccessibleItemType, Issue } from "@/lib/accessibility/types";
import type { GradableKind } from "@/lib/canvas-modules";
import { getStoredProvider } from "@/lib/llm-provider";

const KIND: Partial<Record<AccessibleItemType, GradableKind>> = {
  assignment: "Assignment",
  quiz: "Quiz",
  discussion: "Discussion",
};

/** Whether this item type can be fetched + saved here (has an editor action). */
export function isRemediable(type: AccessibleItemType): boolean {
  return type === "page" || type in KIND;
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
  onClose,
}: {
  courseUrl: string;
  acronym?: string;
  type: AccessibleItemType;
  id: string;
  title: string;
  issue: Issue;
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
      let html = "";
      if (type === "page") {
        const r = await getPageAction(courseUrl, id, acronym);
        if (cancelled) return;
        if ("error" in r) {
          setError(r.error);
          setStage("ready");
          return;
        }
        html = r.page.body;
      } else {
        const kind = KIND[type];
        if (!kind) {
          setError("This item type can't be edited here.");
          setStage("ready");
          return;
        }
        const r = await getGradableAction(courseUrl, kind, Number(id), acronym);
        if (cancelled) return;
        if ("error" in r) {
          setError(r.error);
          setStage("ready");
          return;
        }
        html = r.detail.description;
      }

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
    const result =
      type === "page"
        ? await updatePageAction(courseUrl, id, { body }, acronym)
        : await updateGradableAction(courseUrl, KIND[type]!, Number(id), { description: body }, acronym);
    if (result && "error" in result) {
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
        style={{ width: "min(720px, 96vw)", maxHeight: "90vh", background: "#fff", borderRadius: 12, display: "flex", flexDirection: "column", boxShadow: "0 18px 50px rgba(15,23,42,0.3)" }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--field-border, #e2e8f0)" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748b" }}>
            Fix · {title}
          </div>
          <div style={{ fontSize: "0.95rem", color: "#0f172a", marginTop: 2 }}>{issue.message}</div>
        </div>

        <div style={{ padding: "14px 18px", overflowY: "auto" }}>
          {stage === "loading" ? (
            <p style={{ color: "#64748b" }}>Preparing the fix…</p>
          ) : (
            <>
              <p style={{ fontSize: "0.85rem", color: located ? "#16a34a" : "#d97706", margin: "0 0 8px" }}>
                {located
                  ? "Fix pre-applied below — review the HTML and save."
                  : "Couldn't auto-locate the element (the content may have changed). Edit the HTML below and save."}
              </p>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                spellCheck={false}
                style={{ width: "100%", minHeight: 260, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.8rem", lineHeight: 1.5, padding: 10, border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 8, resize: "vertical" }}
              />
            </>
          )}
          {error && <p style={{ color: "#dc2626", fontSize: "0.85rem", marginTop: 8 }}>{error}</p>}
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--field-border, #e2e8f0)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={() => onClose(false)}
            style={{ border: "1px solid var(--field-border, #cbd5e1)", background: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: "0.85rem", cursor: "pointer", color: "#334155" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={stage !== "ready" || !body.trim()}
            style={{ border: "none", background: "#2563eb", color: "#fff", borderRadius: 8, padding: "7px 16px", fontSize: "0.85rem", fontWeight: 600, cursor: stage === "ready" ? "pointer" : "default", opacity: stage === "ready" ? 1 : 0.6 }}
          >
            {stage === "saving" ? "Saving…" : "Save to Canvas"}
          </button>
        </div>
      </div>
    </div>
  );
}
