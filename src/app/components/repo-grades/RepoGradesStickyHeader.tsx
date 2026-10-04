"use client";

// RG-SEARCH-STICKY Wave A (docs/repo-grades-wave-a-sticky-shell-test-notes.md):
// the one sticky working-header container. A single bounded scroll shell
// (.stickyShell) encloses BOTH the working-header tier (the relocated run bar)
// AND the table passed as children, so the two sticky tiers share one scroll
// context and travel together. The header's rendered height is published as
// --rg-working-header-h on the shell so the column header (thead) sticks just
// below it. Imports only browser-safe leaves (React, the run bar, the CSS
// module); ResizeObserver is a DOM API, not an import.
import { useEffect, useRef, type ReactNode } from "react";
import RepoGradesRunBar, { type RepoGradesRunBarProps } from "./RepoGradesRunBar";
import styles from "./repo-grades.module.css";

export interface RepoGradesStickyHeaderProps {
  // Null when no run bar applies (no folder, or the all-folders view).
  runBar: RepoGradesRunBarProps | null;
  children: ReactNode;
}

export default function RepoGradesStickyHeader({ runBar, children }: RepoGradesStickyHeaderProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const hasHeader = runBar !== null;

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
      {runBar && (
        <div className={styles.stickyWorkingHeader} ref={headerRef}>
          <RepoGradesRunBar {...runBar} />
        </div>
      )}
      {children}
    </div>
  );
}
