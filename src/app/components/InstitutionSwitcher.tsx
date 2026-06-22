"use client";

import { useInstitutionSelection } from "@/lib/institutions";
import styles from "../page.module.css";

/**
 * Segmented control for choosing the active institution, shared (via
 * localStorage) by the Live Feed and Communications tabs. Renders a hint when no
 * institutions are registered yet — they're added in the Settings dropdown.
 */
export default function InstitutionSwitcher() {
  const { institutions, active, setActive } = useInstitutionSelection();

  if (institutions.length === 0) {
    return (
      <p className={styles.fieldHint}>
        No institutions yet. Add one in Settings (top right) to choose a school.
      </p>
    );
  }

  return (
    <div className={styles.lessonInnerTabs} role="radiogroup" aria-label="Institution">
      {institutions.map((code) => (
        <button
          key={code}
          type="button"
          role="radio"
          aria-checked={code === active}
          className={`${styles.lessonInnerTab}${code === active ? ` ${styles.lessonInnerTabActive}` : ""}`}
          onClick={() => setActive(code)}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
