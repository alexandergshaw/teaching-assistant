"use client";

// RG-SEARCH-STICKY Wave A (docs/repo-grades-wave-a-sticky-shell-test-notes.md):
// the one sticky working-header container. A single bounded scroll shell
// (.stickyShell) encloses BOTH the working-header tier (the control slots)
// AND the table passed as children, so the two sticky tiers share one scroll
// context and travel together. The header's rendered height is published as
// --rg-working-header-h on the shell so the column header (thead) sticks just
// below it. Imports only browser-safe leaves (React, the CSS
// module); ResizeObserver is a DOM API, not an import. Controls share one 34px
// band; non-controls (banner, folder notices, grade-set chips/status) render on
// full-width trailing lines (.headerFullRow, order: 1) after the controls.
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./repo-grades.module.css";

export interface RepoGradesStickyHeaderProps {
  // RG-SEARCH-STICKY Wave B: the persisted search box text and its setter. The
  // box narrows the table body only (index.tsx's bodyRows); it renders in every
  // folder view, so the working-header tier is always present.
  searchQuery: string;
  onSearchChange: (value: string) => void;
  // RG-SEARCH-STICKY Wave C: the grade-set typeahead (index.tsx owns its state).
  gradeSetControl?: ReactNode;
  // The assignment-folder picker (RepoGradesFolderPicker), moved here from the
  // stacked controls panel; index.tsx owns its state and handler.
  folderControl?: ReactNode;
  // REPO-GRADES-STATUS-PROMINENCE: the visual-only grading progress banner
  // (spinner + count); index.tsx gates it on the view-level bulkRunningFolder.
  statusBanner?: ReactNode;
  // REPO-PAGE-OVERHAUL W3: the re-scan (Refresh) button, promoted out of the
  // setup stack; index.tsx wires it to the same reloadScan + scanLoading.
  rescanControl?: ReactNode;
  // REPO-GRADES-BRANCH-MERGE-CHECK W2: the optional target-branch text field
  // (index.tsx owns its state and persistence).
  targetBranchControl?: ReactNode;
  children: ReactNode;
}

export default function RepoGradesStickyHeader({ searchQuery, onSearchChange, gradeSetControl, folderControl, statusBanner, rescanControl, targetBranchControl, children }: RepoGradesStickyHeaderProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const hasHeader = typeof onSearchChange === "function";

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
          {statusBanner && (
            <div className={styles.headerFullRow}>
              {statusBanner}
            </div>
          )}
          {folderControl}
          {rescanControl && (
            <div className={styles.headerAction}>
              {rescanControl}
            </div>
          )}
          {gradeSetControl}
          {targetBranchControl}
          <label className={styles.headerField}>
            <input
              type="search"
              className={styles.headerInput}
              aria-label="Search repositories"
              placeholder="Search repos or students"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </label>
        </div>
      )}
      {children}
    </div>
  );
}
