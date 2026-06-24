"use client";

import { useInstitutionSelection } from "@/lib/institutions";
import { useInstitutionCounts } from "./InstitutionCounts";
import styles from "../page.module.css";

/**
 * Segmented control for choosing the active institution, shared (via
 * localStorage) by the Live Feed and Communications tabs. Each chip shows a
 * notification bubble: needs-grading count on Grading, unread count on
 * Communications (per `metric`). Omit `metric` for no badge (e.g. Course
 * Content). Renders a hint when none are registered yet — they're added in the
 * Settings dropdown.
 */
export default function InstitutionSwitcher({ metric }: { metric?: "grading" | "unread" | "both" }) {
  const { institutions, active, setActive } = useInstitutionSelection();
  const { counts } = useInstitutionCounts();

  if (institutions.length === 0) {
    return (
      <p className={styles.fieldHint}>
        No institutions yet. Add one in Settings (top right) to choose a school.
      </p>
    );
  }

  return (
    <div className={styles.lessonInnerTabs} role="radiogroup" aria-label="Institution">
      {institutions.map((code) => {
        const needsGrading = counts[code]?.needsGrading ?? 0;
        const unread = counts[code]?.unread ?? 0;
        const count = !metric
          ? 0
          : metric === "grading"
            ? needsGrading
            : metric === "unread"
              ? unread
              : needsGrading + unread;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={code === active}
            className={`${styles.lessonInnerTab}${code === active ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => setActive(code)}
          >
            <span className={styles.tabLabelWrap}>
              {code}
              {count > 0 && <span className={styles.navBadge}>{count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
