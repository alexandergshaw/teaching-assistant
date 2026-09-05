"use client";

// The Q&A history list for the Knowledge overview panel (AC6): the last
// MAX_SCOPE_QA_ENTRIES question/answer pairs for one scope, newest first,
// collapsible as a whole, each individually deletable, plus a "Clear all"
// for the whole scope. Split out of KnowledgeOverviewPanel.tsx so that
// file's own line count stays focused on the summary/ask controls.
//
// Reuses ConfirmArmButtons for BOTH the per-row delete and "Clear all"
// (X12) - never a hand-rolled second arm/confirm. Per-row idleAriaLabel/
// confirmAriaLabel are required here because every row's idle button reads
// the same "Delete" label; without a per-row accessible name a screen
// reader user could not tell which question a given "Delete" refers to.

import { useState, type ReactNode } from "react";
import Button from "@mui/material/Button";
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
import type { InstitutionPage } from "@/lib/knowledge-base";
import type { ScopeQuestion } from "@/lib/knowledge-overview";
import { formatRelative } from "../../utils/time";
import { renderOverviewMarkdown, citationPageExists } from "./knowledge-overview-storage";
import styles from "../../page.module.css";
import kbStyles from "../KnowledgeTab.module.css";

/** Renders one of h2-h6 for a numeric level (BUILD.md's "inner section
 *  titles are always headingLevel + 1, no level skipped" contract) without
 *  the ambient-JSX-namespace typing a dynamic `h${n}` tag cast would need -
 *  see KnowledgeOverviewPanel.tsx's identical helper for the same reasoning. */
function SectionHeading({ level, className, children }: { level: number; className?: string; children: ReactNode }) {
  switch (Math.min(Math.max(level, 2), 6)) {
    case 2:
      return <h2 className={className}>{children}</h2>;
    case 3:
      return <h3 className={className}>{children}</h3>;
    case 4:
      return <h4 className={className}>{children}</h4>;
    case 5:
      return <h5 className={className}>{children}</h5>;
    default:
      return <h6 className={className}>{children}</h6>;
  }
}

interface KnowledgeOverviewHistoryProps {
  questions: ScopeQuestion[];
  /** The full flat page list (not scope-limited) - a citation resolves
   *  against this, so a page moved out of scope since the question was asked
   *  still resolves and stays clickable (spec item 10). */
  allPages: InstitutionPage[];
  open: boolean;
  onToggleOpen: () => void;
  headingLevel: number;
  onSelectPage: (id: string) => void;
  deletingId: string | null;
  onDelete: (id: string) => void;
  clearing: boolean;
  onClearAll: () => void;
  error: string | null;
}

export default function KnowledgeOverviewHistory({
  questions,
  allPages,
  open,
  onToggleOpen,
  headingLevel,
  onSelectPage,
  deletingId,
  onDelete,
  clearing,
  onClearAll,
  error,
}: KnowledgeOverviewHistoryProps) {
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const [clearArmed, setClearArmed] = useState(false);

  const clearConsequenceId = "kb-overview-history-clear-consequence";

  return (
    <div className={kbStyles.kbOverviewSection}>
      {/* Heading WRAPS the toggle button (the standard accessible-disclosure
          shape), never the reverse - h2-h6 is flow/heading content, not the
          phrasing content <button> is restricted to, so a heading nested
          INSIDE a button would be invalid markup (the same category of bug
          this file's institutionPill comment in KnowledgeTab.tsx calls out
          for button-in-button). */}
      <SectionHeading level={headingLevel} className={kbStyles.kbOverviewToggleHeading}>
        <button type="button" className={kbStyles.kbOverviewToggle} aria-expanded={open} onClick={onToggleOpen}>
          <span className={open ? kbStyles.kbOverviewChevronOpen : kbStyles.kbOverviewChevron} aria-hidden="true" />
          History {questions.length > 0 ? `(${questions.length})` : ""}
        </button>
      </SectionHeading>

      {open && (
        <div className={kbStyles.kbOverviewBody}>
          <p className={`${styles.error} ${kbStyles.kbOverviewAlert}`} role="alert">
            {error}
          </p>

          {questions.length === 0 ? (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              No questions asked yet - answers you ask for in this scope will be listed here.
            </p>
          ) : (
            <>
              <div className={kbStyles.kbOverviewHistoryHeaderRow}>
                <ConfirmArmButtons
                  armed={clearArmed}
                  idleLabel="Clear history"
                  confirmLabel="Confirm clear"
                  tone="danger"
                  idleVariant="text"
                  loading={clearing}
                  loadingLabel="Clearing…"
                  onArm={() => setClearArmed(true)}
                  onConfirm={() => {
                    setClearArmed(false);
                    onClearAll();
                  }}
                  onCancel={() => setClearArmed(false)}
                  consequenceId={clearConsequenceId}
                  idleAriaLabel="Clear all question history for this scope"
                  confirmAriaLabel="Confirm clearing all question history for this scope"
                />
              </div>
              {clearArmed && (
                <p id={clearConsequenceId} role="status" aria-live="polite" className={styles.fieldHint} style={{ margin: 0 }}>
                  Deletes all {questions.length} question{questions.length === 1 ? "" : "s"} in this history. This cannot be undone.
                </p>
              )}

              {questions.map((q) => {
                const questionLabel = q.question.trim() || "Untitled question";
                const rowDeleteConsequenceId = `kb-overview-qa-delete-consequence-${q.id}`;
                return (
                  <div key={q.id} className={styles.ghRow}>
                    <div className={styles.ghRowTop}>
                      <div className={styles.ghRowTitle}>{q.question}</div>
                      <div className={styles.ghActions}>
                        {!q.grounded && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Not from your knowledge base</span>}
                        <ConfirmArmButtons
                          armed={armedDeleteId === q.id}
                          idleLabel="Delete"
                          confirmLabel="Confirm delete"
                          tone="danger"
                          idleVariant="text"
                          loading={deletingId === q.id}
                          loadingLabel="Deleting…"
                          onArm={() => setArmedDeleteId(q.id)}
                          onConfirm={() => {
                            setArmedDeleteId(null);
                            onDelete(q.id);
                          }}
                          onCancel={() => setArmedDeleteId(null)}
                          consequenceId={rowDeleteConsequenceId}
                          idleAriaLabel={`Delete question "${questionLabel}"`}
                          confirmAriaLabel={`Confirm delete for question "${questionLabel}"`}
                        />
                      </div>
                    </div>
                    {armedDeleteId === q.id && (
                      <p id={rowDeleteConsequenceId} role="status" aria-live="polite" className={styles.fieldHint} style={{ margin: 0 }}>
                        Deletes this question and answer from history. This cannot be undone.
                      </p>
                    )}
                    <div
                      className={kbStyles.kbOverviewHistoryAnswer}
                      dangerouslySetInnerHTML={{ __html: renderOverviewMarkdown(q.answer) }}
                    />
                    {q.citations.length > 0 && (
                      <div className={kbStyles.kbOverviewSources}>
                        {q.citations.map((citation) =>
                          citationPageExists(citation.id, allPages) ? (
                            <Button
                              key={citation.id}
                              size="small"
                              variant="text"
                              className={kbStyles.kbOverviewChip}
                              onClick={() => onSelectPage(citation.id)}
                            >
                              {citation.title.trim() || "Untitled page"}
                            </Button>
                          ) : (
                            <span key={citation.id} className={kbStyles.kbOverviewChipDeleted}>
                              {citation.title.trim() || "Untitled page"} (deleted)
                            </span>
                          )
                        )}
                      </div>
                    )}
                    <span className={styles.ghMeta}>Asked {formatRelative(q.createdAt)}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
