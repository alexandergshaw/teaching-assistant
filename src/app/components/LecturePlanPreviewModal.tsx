"use client";

import type { AssignmentPlan } from "../actions";
import styles from "../page.module.css";

type LecturePlanPreviewModalProps = {
  plan: AssignmentPlan;
  onClose: () => void;
};

export default function LecturePlanPreviewModal({ plan, onClose }: LecturePlanPreviewModalProps) {
  return (
    <div className={styles.previewBackdrop} onClick={onClose}>
      <section
        className={styles.lessonPreviewModal}
        role="dialog"
        aria-modal="true"
        aria-label={`Slides preview for ${plan.presentationTitle}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <div>
            <p className={styles.previewMeta}>{plan.assignmentName}</p>
            <h3>{plan.presentationTitle}</h3>
            <p className={styles.previewMeta}>
              {plan.slides.length} slide{plan.slides.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            className={styles.previewCloseButton}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <ul className={styles.lessonSlideList}>
          <li className={styles.lessonSlideCard}>
            <span className={styles.lessonSlideNum}>Slide 1</span>
            <p className={styles.lessonSlideTitle}>{plan.presentationTitle}</p>
          </li>
          {plan.slides.map((slide, i) => (
            <li key={i} className={styles.lessonSlideCard}>
              <span className={styles.lessonSlideNum}>Slide {i + 2}</span>
              <p className={styles.lessonSlideTitle}>{slide.title}</p>
              {slide.bullets.length > 0 && (
                <ul className={styles.lessonSlideBullets}>
                  {slide.bullets.map((bullet, j) => (
                    <li key={j}>{bullet}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
