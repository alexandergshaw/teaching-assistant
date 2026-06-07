"use client";

import { useState } from "react";
import type { AssignmentPlan } from "../actions";
import styles from "../page.module.css";

type Tab = "slides" | "intro" | "instructions" | "resources";

type LecturePlanPreviewModalProps = {
  plan: AssignmentPlan;
  onClose: () => void;
};

function PlainTextSection({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className={styles.assignmentContent}>
      {paragraphs.map((para, i) => (
        <p key={i} className={styles.introText}>{para}</p>
      ))}
    </div>
  );
}

export default function LecturePlanPreviewModal({ plan, onClose }: LecturePlanPreviewModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("slides");

  const tabs: { id: Tab; label: string; hidden?: boolean }[] = [
    { id: "slides", label: `Slides (${plan.slides.length + 1})` },
    { id: "intro", label: "Module Intro", hidden: !plan.moduleIntroduction },
    { id: "instructions", label: "Assignment Instructions", hidden: !plan.assignmentInstructions },
    { id: "resources", label: "External Resources", hidden: !plan.externalResources },
  ];

  return (
    <div className={styles.previewBackdrop} onClick={onClose}>
      <section
        className={styles.lessonPreviewModal}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview for ${plan.presentationTitle}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <div>
            <p className={styles.previewMeta}>{plan.assignmentName}</p>
            <h3>{plan.presentationTitle}</h3>
          </div>
          <button
            type="button"
            className={styles.previewCloseButton}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className={styles.lessonInnerTabs}>
          {tabs.filter((t) => !t.hidden).map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.lessonInnerTab} ${activeTab === tab.id ? styles.lessonInnerTabActive : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "slides" && (
          <ul className={styles.lessonSlideList}>
            <li className={styles.lessonSlideCard}>
              <span className={styles.lessonSlideNum}>Slide 1 · Title</span>
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
        )}

        {activeTab === "intro" && plan.moduleIntroduction && (
          <div className={styles.assignmentContent}>
            <div className={styles.assignmentSection}>
              <p className={styles.assignmentSectionLabel}>Module Introduction</p>
              <PlainTextSection text={plan.moduleIntroduction} />
            </div>
          </div>
        )}

        {activeTab === "instructions" && plan.assignmentInstructions && (
          <div className={styles.assignmentContent}>
            <div className={styles.assignmentSection}>
              <p className={styles.assignmentSectionLabel}>Assignment Instructions</p>
              <PlainTextSection text={plan.assignmentInstructions} />
            </div>
          </div>
        )}

        {activeTab === "resources" && plan.externalResources && (
          <div className={styles.assignmentContent}>
            <div className={styles.assignmentSection}>
              <p className={styles.assignmentSectionLabel}>External Resources</p>
              <PlainTextSection text={plan.externalResources} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
