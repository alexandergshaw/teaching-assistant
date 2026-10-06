"use client";

// The Knowledge-tab Ask AI + its Q&A history, independent of which page is
// selected. Mounted ONCE by KnowledgeTab.tsx outside both selection branches,
// so a page switch never unmounts or resets it. Always scoped to the whole
// active institution; state lives in useKnowledgeAskAi.ts (keyed on
// institution). Citations link out through onSelectPage (openSearchHit), which
// selects the page and expands its ancestors.

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import type { InstitutionPage } from "@/lib/knowledge-base";
import { useKnowledgeAskAi } from "./useKnowledgeAskAi";
import KnowledgeOverviewHistory from "./KnowledgeOverviewHistory";
import { renderOverviewMarkdown, citationPageExists, describeOmittedPages } from "./knowledge-overview-storage";
import styles from "../../page.module.css";
import kbStyles from "../KnowledgeTab.module.css";

interface KnowledgeAskAiPanelProps {
  institution: string;
  /** The FULL flat page list for the active institution. */
  pages: InstitutionPage[];
  /** openSearchHit from KnowledgeTab.tsx. */
  onSelectPage: (id: string) => void;
}

export default function KnowledgeAskAiPanel({ institution, pages, onSelectPage }: KnowledgeAskAiPanelProps) {
  const {
    hasContent,
    loading,
    loadError,
    question,
    setQuestion,
    asking,
    askError,
    citationsUnavailableFor,
    lastAnswer,
    ask,
    questions,
    historyError,
    deletingId,
    deleteQuestion,
    clearing,
    clearAll,
    open,
    toggleOpen,
    historyOpen,
    toggleHistoryOpen,
  } = useKnowledgeAskAi({ institution, allPages: pages });

  const lastAnswerOmitted = lastAnswer ? lastAnswer.sourcePages.filter((p) => !p.included).map((p) => p.title) : [];
  const lastAnswerIncludedCount = lastAnswer ? lastAnswer.sourcePages.filter((p) => p.included).length : 0;

  return (
    <section className={kbStyles.kbOverview}>
      <h2 className={kbStyles.kbOverviewToggleHeading}>
        <button type="button" className={kbStyles.kbOverviewToggle} aria-expanded={open} onClick={toggleOpen}>
          <span className={open ? kbStyles.kbOverviewChevronOpen : kbStyles.kbOverviewChevron} aria-hidden="true" />
          Ask AI
        </button>
      </h2>

      {open && (
        <div className={kbStyles.kbOverviewBody}>
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Searches all of {institution}.
          </p>

          {!hasContent && (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              Add some page content before asking a question.
            </p>
          )}

          <div className={kbStyles.kbOverviewSection}>
            <div className={kbStyles.kbOverviewAskRow}>
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                placeholder="Ask about PTO, late work, attendance…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
                helperText="Press Enter to ask, Shift+Enter for a new line."
                disabled={asking || !hasContent}
              />
              <Button
                size="small"
                variant="contained"
                onClick={ask}
                disabled={asking || !hasContent || !question.trim()}
                loading={asking}
                loadingPosition="start"
              >
                Ask
              </Button>
            </div>

            <p className={`${styles.error} ${kbStyles.kbOverviewAlert}`} role="alert">
              {askError}
            </p>

            <div role="status" aria-live="polite" aria-atomic="false" className={kbStyles.kbOverviewStatus}>
              {asking && <span className={styles.fieldHint}>Answering…</span>}
              {!asking && lastAnswer && (
                <div className={kbStyles.kbOverviewAnswerBlock}>
                  <div
                    className={kbStyles.kbOverviewAnswer}
                    dangerouslySetInnerHTML={{ __html: renderOverviewMarkdown(lastAnswer.answer) }}
                  />
                  {!lastAnswer.grounded && (
                    <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Not from your knowledge base</span>
                  )}
                  {lastAnswer.citations.length > 0 ? (
                    <div className={kbStyles.kbOverviewSources}>
                      {lastAnswer.citations.map((citation) =>
                        citationPageExists(citation.id, pages) ? (
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
                  ) : (
                    // The model's JSON envelope failed to parse, so citations
                    // were never resolved - captioned honestly. Compared by id
                    // so deleting this entry can never pin the caption to a
                    // different answer.
                    citationsUnavailableFor === lastAnswer.id && (
                      <p className={styles.fieldHint} style={{ margin: 0, fontStyle: "italic" }}>
                        Citations unavailable for this answer.
                      </p>
                    )
                  )}
                  <span className={styles.ghMeta}>
                    Searched {lastAnswerIncludedCount} page{lastAnswerIncludedCount === 1 ? "" : "s"}.
                  </span>
                  {describeOmittedPages(lastAnswerOmitted) && (
                    <p className={styles.fieldHint} style={{ margin: 0 }}>
                      {describeOmittedPages(lastAnswerOmitted)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <p className={styles.fieldHint} role="status" aria-live="polite" style={{ margin: 0 }}>
              Loading history…
            </p>
          ) : loadError ? (
            <p className={styles.error} role="alert">
              {loadError}
            </p>
          ) : (
            <KnowledgeOverviewHistory
              questions={questions}
              allPages={pages}
              open={historyOpen}
              onToggleOpen={toggleHistoryOpen}
              headingLevel={3}
              onSelectPage={onSelectPage}
              deletingId={deletingId}
              onDelete={deleteQuestion}
              clearing={clearing}
              onClearAll={clearAll}
              error={historyError}
            />
          )}
        </div>
      )}
    </section>
  );
}
