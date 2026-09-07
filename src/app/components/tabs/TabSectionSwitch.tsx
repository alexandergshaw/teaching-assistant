"use client";

import styles from "../../page.module.css";

export interface TabSectionOption<T extends string> {
  id: T;
  label: string;
  /** Optional attention count, badged exactly the way the top strip and the
   *  Workflows/Drafts subnavs already badge theirs. Omit (or pass 0) for a
   *  section that has nothing to report. */
  count?: number;
}

/**
 * The section switch for a merged top-level tab (D25c). Courses holds
 * Courses + Tasks, Tools holds Manual + Workflows, Library holds Files +
 * Knowledge; this is the one control that says which half is showing.
 *
 * It reuses the Manual sub-rail's exact markup and classes
 * (manualSubnav / lessonInnerTabs / lessonInnerTab) rather than introducing a
 * second visual language for the same idea, because on the Tools tab this row
 * sits directly above that very rail - anything else would read as two
 * unrelated controls stacked on top of each other. D25c calls that rail "the
 * established pattern" for precisely this reason.
 *
 * Presentation only: it owns no state, and the section it renders as selected
 * is whatever useAppNavigation resolved from the URL/localStorage.
 */
export function TabSectionSwitch<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  /** Names the group for screen readers, e.g. "Courses sections". */
  ariaLabel: string;
  options: readonly TabSectionOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className={styles.manualSubnav}>
      <div className={styles.lessonInnerTabs} role="tablist" aria-label={ariaLabel}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={option.id === value}
            className={`${styles.lessonInnerTab}${option.id === value ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => onChange(option.id)}
          >
            <span className={styles.tabLabelWrap}>
              {option.label}
              {option.count !== undefined && option.count > 0 && (
                <span className={styles.navBadge}>{option.count}</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
