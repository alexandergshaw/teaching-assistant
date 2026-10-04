"use client";

// RG-SEARCH-STICKY Wave A (docs/repo-grades-wave-a-sticky-shell-test-notes.md):
// the one sticky working-header container. A single bounded scroll shell
// (.stickyShell) encloses BOTH the working-header tier (the relocated run bar)
// AND the table passed as children, so the two sticky tiers share one scroll
// context and travel together. The header's rendered height is published as
// --rg-working-header-h on the shell so the column header (thead) sticks just
// below it. Imports only browser-safe leaves (React, the run bar, the CSS
// module); ResizeObserver is a DOM API, not an import.
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import RepoGradesRunBar, { type RepoGradesRunBarProps } from "./RepoGradesRunBar";
import styles from "./repo-grades.module.css";

// House-token inline styling (no new CSS class: the orphan ratchet is exact).
const SEARCH_INPUT_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: 320,
  padding: "var(--space-2) var(--space-3)",
  border: "1px solid var(--field-border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--field-background)",
  color: "var(--text-primary)",
  font: "inherit",
};

export interface RepoGradesStickyHeaderProps {
  // Null when no run bar applies (no folder, or the all-folders view).
  runBar: RepoGradesRunBarProps | null;
  // RG-SEARCH-STICKY Wave B: the persisted search box text and its setter. The
  // box narrows the table body only (index.tsx's bodyRows); it renders in every
  // folder view, so the working-header tier no longer depends on the run bar.
  searchQuery: string;
  onSearchChange: (value: string) => void;
  // RG-SEARCH-STICKY Wave C: the grade-set typeahead (index.tsx owns its state).
  gradeSetControl?: ReactNode;
  children: ReactNode;
}

export default function RepoGradesStickyHeader({ runBar, searchQuery, onSearchChange, gradeSetControl, children }: RepoGradesStickyHeaderProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const hasHeader = runBar !== null || typeof onSearchChange === "function";

  useEffect(() => {
    const shell = shellRef.current;
    const header = headerRef.current;
    if (!shell) return;
    if (!header) {
      shell.style.removeProperty("--rg-working-header-h");
      return;
    }
    const publish = () => {
      shell.style.setProperty("--rg-working-header-h", `${header.offsetHeight}px`);
    };
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, [hasHeader]);

  return (
    <div className={styles.stickyShell} ref={shellRef}>
      {hasHeader && (
        <div className={styles.stickyWorkingHeader} ref={headerRef}>
          {runBar && <RepoGradesRunBar {...runBar} />}
          {gradeSetControl}
          <input
            type="search"
            style={SEARCH_INPUT_STYLE}
            aria-label="Search repositories"
            placeholder="Search repo, student or binding"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}
      {children}
    </div>
  );
}
