"use client";

// The Knowledge overview panel (AI summary + Ask AI) - AC.md AC1-AC11.
// Rendered by KnowledgeTab.tsx at exactly two sites (X5/BUILD.md's UI
// section): a SIBLING placed ABOVE the empty-detail-pane's dashed box when no
// page is selected (scope = the whole institution), and the LAST child of
// the detail pane, after the page body, when the selected page has at least
// one descendant (scope = that page + its descendants). A leaf page renders
// no panel at all - KnowledgeTab.tsx itself decides which of those two sites
// applies (or neither) via scopeHasDescendants; this component only ever
// renders ONE scope's panel, decided entirely by the `scopePageId` prop it is
// given.
//
// All state, persistence, and server-action calls live in
// useKnowledgeOverview.ts (the hook this component is a thin, mostly-JSX
// wrapper around) and knowledge-overview-storage.ts (pure copy/markdown/
// resolution helpers) - kept out of this file so KnowledgeTab.tsx's own
// 1000-line cap is never at risk from this feature's UI growing.
//
// X7 (read-only by construction, Group C's own note): this panel has no
// delete/edit affordance anywhere over a page's content - only Q&A HISTORY
// entries are deletable, and that deletes the QUESTION, never a knowledge
// page. There is no "apply this" control of any kind.

import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import type { InstitutionPage } from "@/lib/knowledge-base";
import { useKnowledgeOverview } from "./useKnowledgeOverview";
import KnowledgeOverviewHistory from "./KnowledgeOverviewHistory";
import {
  renderOverviewMarkdown,
  citationPageExists,
  describeOmittedPages,
  describeHardCappedPages,
  describeSkippedAttachments,
  describeStaleness,
} from "./knowledge-overview-storage";
import { formatRelative } from "../../utils/time";
import styles from "../../page.module.css";
import kbStyles from "../KnowledgeTab.module.css";

/** Renders one of h2-h6 for a numeric level (BUILD.md's "inner section
 *  titles are always headingLevel + 1, no level skipped" contract) without
 *  the ambient-JSX-namespace typing a dynamic `h${n}` tag cast would need. */
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

interface KnowledgeOverviewPanelProps {
  institution: string;
  /** null = the whole institution is the scope (AC1a); an id = that page +
   *  its descendants (AC1b). KnowledgeTab.tsx never renders this component at
   *  all for a leaf page (AC1c). */
  scopePageId: string | null;
  /** The FULL flat page list for the active institution (not pre-filtered to
   *  scope) - see useKnowledgeOverview.ts for why both the scope-limited and
   *  full lists matter here (citation resolution, spec item 10). */
  pages: InstitutionPage[];
  /** 2 for the institution-root entry point (no h2 exists in the empty
   *  detail pane there); 3 for a page-with-descendants entry point (the
   *  page's own h2 title sits above it). Inner section headings render at
   *  headingLevel + 1. */
  headingLevel: 2 | 3;
  /** openSearchHit from KnowledgeTab.tsx - NOT applySelection (X12): it also
   *  runs the unsaved-edits guard and expands the clicked page's ancestors
   *  so a citation/source click actually shows the page it names. */
  onSelectPage: (id: string) => void;
}

export default function KnowledgeOverviewPanel({ institution, scopePageId, pages, headingLevel, onSelectPage }: KnowledgeOverviewPanelProps) {
  const {
    scopeLabel,
    hasContent,
    loading,
    loadError,
    summary,
    staleness,
    generating,
    generateError,
    generateSummary,
    question,
    setQuestion,
    asking,
    askError,
    citationsUnavailableFor,
    hardCappedPages,
    skippedAttachments,
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
  } = useKnowledgeOverview({ institution, scopePageId, allPages: pages });

  const summaryIncluded = summary ? summary.sourcePages.filter((p) => p.included) : [];
  const summaryOmitted = summary ? summary.sourcePages.filter((p) => !p.included).map((p) => p.title) : [];
  const staleNote = staleness ? describeStaleness(staleness) : null;

  const lastAnswerOmitted = lastAnswer ? lastAnswer.sourcePages.filter((p) => !p.included).map((p) => p.title) : [];
  const lastAnswerIncludedCount = lastAnswer ? lastAnswer.sourcePages.filter((p) => p.included).length : 0;

  return (
    <section className={kbStyles.kbOverview}>
      {/* Heading WRAPS the toggle button, never the reverse - h2/h3 is
          heading/flow content, not the phrasing content a <button> is
          restricted to (KnowledgeOverviewHistory.tsx's identical comment). */}
      <SectionHeading level={headingLevel} className={kbStyles.kbOverviewToggleHeading}>
        <button type="button" className={kbStyles.kbOverviewToggle} aria-expanded={open} onClick={toggleOpen}>
          <span className={open ? kbStyles.kbOverviewChevronOpen : kbStyles.kbOverviewChevron} aria-hidden="true" />
          AI knowledge overview
        </button>
      </SectionHeading>

      {open && (
        <div className={kbStyles.kbOverviewBody}>
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Scoped to {scopeLabel}.
          </p>

          {loading ? (
            <p className={styles.fieldHint} role="status" aria-live="polite" style={{ margin: 0 }}>
              Loading AI overview…
            </p>
          ) : loadError ? (
            <p className={styles.error} role="alert">
              {loadError}
            </p>
          ) : (
            <>
              {!hasContent && (
                <p className={styles.fieldHint} style={{ margin: 0 }}>
                  Add some page content in this scope before generating a summary or asking a question.
                </p>
              )}

              {/* ── AI summary (AC2/AC3) ────────────────────────────────── */}
              <div className={kbStyles.kbOverviewSection}>
                <SectionHeading level={headingLevel + 1} className={kbStyles.kbOverviewSectionTitle}>
                  AI summary
                </SectionHeading>

                <div className={kbStyles.kbOverviewMetaRow}>
                  {summary && (
                    <span className={styles.fieldHint} style={{ margin: 0 }}>
                      Generated {formatRelative(summary.generatedAt)}
                    </span>
                  )}
                  {staleNote && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>{staleNote}</span>}
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={generateSummary}
                    disabled={generating || !hasContent}
                    loading={generating}
                    loadingPosition="start"
                  >
                    {summary ? "Regenerate summary" : "Generate summary"}
                  </Button>
                </div>

                <p role="status" aria-live="polite" aria-atomic="true" className={kbStyles.kbOverviewStatus}>
                  {generating ? "Generating summary…" : ""}
                </p>
                <p className={`${styles.error} ${kbStyles.kbOverviewAlert}`} role="alert">
                  {generateError}
                </p>

                {summary ? (
                  <>
                    <div
                      className={kbStyles.kbOverviewSummaryText}
                      dangerouslySetInnerHTML={{ __html: renderOverviewMarkdown(summary.summary) }}
                    />
                    {summaryIncluded.length > 0 && (
                      <div className={kbStyles.kbOverviewSources}>
                        <span className={styles.fieldHint} style={{ margin: 0 }}>
                          Drew from:
                        </span>
                        {summaryIncluded.map((p) => (
                          <Button
                            key={p.id}
                            size="small"
                            variant="text"
                            className={kbStyles.kbOverviewChip}
                            onClick={() => onSelectPage(p.id)}
                          >
                            {p.title.trim() || "Untitled page"}
                          </Button>
                        ))}
                      </div>
                    )}
                    {describeOmittedPages(summaryOmitted) && (
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        {describeOmittedPages(summaryOmitted)}
                      </p>
                    )}
                    {/* X8/X14: three DIFFERENT reasons a page or file can be
                        missing from this summary, said separately because they
                        mean different things to the instructor. The one above
                        is "considered but did not fit"; a hard-capped page was
                        never looked at at all and carries no sourcePages entry,
                        so without this line it would vanish in silence while
                        the summary implied it had covered everything. */}
                    {describeHardCappedPages(hardCappedPages.map((p) => p.title)) && (
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        {describeHardCappedPages(hardCappedPages.map((p) => p.title))}
                      </p>
                    )}
                    {describeSkippedAttachments(skippedAttachments) && (
                      <p className={styles.fieldHint} style={{ margin: 0 }}>
                        {describeSkippedAttachments(skippedAttachments)}
                      </p>
                    )}
                  </>
                ) : (
                  !generating && (
                    <p className={styles.fieldHint} style={{ margin: 0 }}>
                      No summary yet. Generate one for a policy-lookup overview of every page in this scope.
                    </p>
                  )
                )}
              </div>

              {/* ── Ask AI (AC4/AC5/AC6) ────────────────────────────────── */}
              <div className={kbStyles.kbOverviewSection}>
                <SectionHeading level={headingLevel + 1} className={kbStyles.kbOverviewSectionTitle}>
                  Ask AI
                </SectionHeading>

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

                {/* AC5/spec item on live regions: wraps status + answer +
                    citations in ONE polite, non-atomic region, always
                    mounted (zero height at rest) - MUI's `loading` prop
                    disables the button but sets no aria-busy, so this text
                    is the only thing announcing the in-flight state. */}
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
                        // Addendum A4's mandatory fallback: the model's JSON
                        // envelope failed to parse, so citations were never
                        // resolved for this answer - captioned honestly
                        // rather than silently presenting an uncited answer
                        // as if it were cited. Compared by id (never a bare
                        // "was the last ask" flag) so deleting this entry, or
                        // switching scope, can never leave the caption
                        // pinned to a different answer - see
                        // useKnowledgeOverview.ts's own doc comment.
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

              <KnowledgeOverviewHistory
                questions={questions}
                allPages={pages}
                open={historyOpen}
                onToggleOpen={toggleHistoryOpen}
                headingLevel={headingLevel + 1}
                onSelectPage={onSelectPage}
                deletingId={deletingId}
                onDelete={deleteQuestion}
                clearing={clearing}
                onClearAll={clearAll}
                error={historyError}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
