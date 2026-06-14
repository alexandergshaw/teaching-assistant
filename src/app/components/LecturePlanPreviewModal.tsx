"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { AssignmentPlan } from "../actions";
import styles from "../page.module.css";

type Tab = "slides" | "intro" | "instructions";

type LecturePlanPreviewModalProps = {
  plan: AssignmentPlan;
  onClose: () => void;
};

function isHeadingLine(line: string): boolean {
  if (/^#{1,6}\s+/.test(line)) return true;
  const stripped = line.trim();
  if (stripped.length === 0 || stripped.length > 60) return false;
  if (/[.,;?!]$/.test(stripped)) return false;
  if (/^[0-9]+[.)]/.test(stripped)) return false;
  if (/^[-*•]/.test(stripped)) return false;
  const words = stripped.replace(/:$/, "").split(/\s+/);
  return words.length <= 8;
}

// Render body content, bolding a leading short label that ends in a colon
// (e.g. "Encapsulation: hides internal state").
function renderLabeledContent(content: string): ReactNode {
  const labelMatch = content.match(/^([^:\n]{1,80}:)(\s[\s\S]*)?$/);
  if (labelMatch) {
    return (
      <>
        <strong>{labelMatch[1]}</strong>
        {labelMatch[2] ?? ""}
      </>
    );
  }
  return content;
}

function PlainTextSection({ text }: { text: string }) {
  const lines = text.split(/\n/);
  const elements: ReactNode[] = [];
  let paragraph: string[] = [];
  let firstHeadingFound = false;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      elements.push(
        <p key={`p-${elements.length}`} className={styles.introText}>
          {renderLabeledContent(paragraph.join(" "))}
        </p>
      );
      paragraph = [];
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      return;
    }

    const markdownMatch = line.match(/^(#{1,6})\s+(.*)$/);
    let headingText: string | null = null;
    let markdownIsTitle = false;

    if (markdownMatch) {
      // Explicit markdown heading marker.
      headingText = markdownMatch[2].trim();
      markdownIsTitle = markdownMatch[1].length === 1;
    } else if (isHeadingLine(line)) {
      // Heuristic for headings without a markdown marker.
      headingText = line.replace(/:$/, "").trim();
    }

    if (headingText !== null) {
      flushParagraph();
      // The title is whichever heading is marked with a single # marker, or
      // failing any markdown markers, simply the first heading encountered.
      const isTitle = markdownMatch ? markdownIsTitle : !firstHeadingFound;
      firstHeadingFound = true;
      if (isTitle) {
        elements.push(
          <h2 key={`h-${elements.length}`} className={styles.introTitle}>
            {headingText}
          </h2>
        );
      } else {
        elements.push(
          <h3 key={`h-${elements.length}`} className={styles.introHeading}>
            {headingText}
          </h3>
        );
      }
      return;
    }

    const listMatch = line.match(/^(?:\d+\.|[-•*])\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      elements.push(
        <p key={`li-${elements.length}`} className={styles.introText}>
          {renderLabeledContent(listMatch[1].trim())}
        </p>
      );
      return;
    }

    paragraph.push(line);
  });
  flushParagraph();

  return <div className={styles.assignmentContent}>{elements}</div>;
}

export default function LecturePlanPreviewModal({ plan, onClose }: LecturePlanPreviewModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("slides");

  const tabs: { id: Tab; label: string; hidden?: boolean }[] = [
    { id: "slides", label: `Slides (${plan.slides.length + 1})` },
    { id: "intro", label: "Module Intro", hidden: !plan.moduleIntroduction },
    { id: "instructions", label: "Assignment Instructions", hidden: !plan.assignmentInstructions },
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
                {slide.code && (
                  <div className={styles.exampleCodeWrap}>
                    {slide.codeLanguage && (
                      <span className={styles.exampleCodeLang}>{slide.codeLanguage}</span>
                    )}
                    <pre className={styles.exampleCodeBlock}>
                      <code>{slide.code}</code>
                    </pre>
                  </div>
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
      </section>
    </div>
  );
}
