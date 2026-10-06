"use client";

// The Knowledge overview panel (AI summary only; the Ask AI moved to KnowledgeAskAiPanel.tsx) - AC.md AC1-AC11.
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
import type { InstitutionPage } from "@/lib/knowledge-base";
import { useKnowledgeOverview } from "./useKnowledgeOverview";
import {
  renderOverviewMarkdown,
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
    hardCappedPages,
    skippedAttachments,
    open,
    toggleOpen,
  } = useKnowledgeOverview({ institution, scopePageId, allPages: pages });

  const summaryIncluded = summary ? summary.sourcePages.filter((p) => p.included) : [];
  const summaryOmitted = summary ? summary.sourcePages.filter((p) => !p.included).map((p) => p.title) : [];
  const staleNote = staleness ? describeStaleness(staleness) : null;

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

          {!hasContent && (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              Add some page content in this scope before generating a summary.
            </p>
          )}

              {/* ── AI summary (AC2/AC3) ────────────────────────────────── */}
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
                  /* No summary yet. This line promises a summary is coming,
                     so it must NOT appear in the two cases where none is:
                     after a failed generation (the alert above already says
                     what went wrong, and the auto-refresh will not retry the
                     same page-set - Regenerate is the deliberate retry), and
                     when no page in scope has any content to summarize (the
                     line above the summary section already explains that
                     one). Otherwise the panel would sit claiming to be
                     writing something forever. */
                  !generating &&
                  !generateError &&
                  hasContent && (
                    <p className={styles.fieldHint} style={{ margin: 0 }}>
                      Writing a policy-lookup overview of every page in this scope… this happens on its own, and again whenever a page here changes.
                    </p>
                  )
                )}
              </div>

            </>
          )}
        </div>
      )}
    </section>
  );
}
