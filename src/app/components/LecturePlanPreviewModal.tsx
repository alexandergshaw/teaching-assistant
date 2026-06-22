"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { AssignmentPlan, SlideData } from "../actions";
import { reviseLecturePlanTextAction, reviseLectureSlidesAction } from "../actions";
import type { LlmProvider } from "@/lib/llm";
import styles from "../page.module.css";

type Tab = "slides" | "intro" | "instructions";

type LecturePlanPreviewModalProps = {
  plans: AssignmentPlan[];
  index: number;
  provider: LlmProvider;
  onIndexChange: (index: number) => void;
  onUpdatePlan: (
    index: number,
    patch: Partial<
      Pick<AssignmentPlan, "presentationTitle" | "moduleIntroduction" | "assignmentInstructions" | "slides">
    >
  ) => void;
  onResetSection: (
    index: number,
    section: "presentationTitle" | "moduleIntroduction" | "assignmentInstructions" | "slides"
  ) => void;
  onDownloadDoc: (index: number, kind: "slides" | "intro" | "instructions") => Promise<void>;
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

// Split inline text into nodes, turning bare URLs into real links (matches the
// hyperlinks in the downloaded .docx).
function renderInline(text: string): ReactNode {
  return text.split(/(https?:\/\/[^\s)]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    )
  );
}

// Bold a leading short "Label:" prefix; linkify the remainder.
function renderLabeledContent(content: string): ReactNode {
  const labelMatch = content.match(/^([^:\n]{1,80}:)(\s[\s\S]*)?$/);
  if (labelMatch) {
    return (
      <>
        <strong>{labelMatch[1]}</strong>
        {labelMatch[2] ? renderInline(labelMatch[2]) : ""}
      </>
    );
  }
  return renderInline(content);
}

// Faithful, read-only render of the markdown-ish document text — mirrors the
// professional .docx (navy title with a rule, navy section headings, links).
function PlainTextSection({ text }: { text: string }) {
  const lines = text.split(/\n/);
  const elements: ReactNode[] = [];
  let paragraph: string[] = [];
  let firstHeadingFound = false;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      elements.push(
        <p key={`p-${elements.length}`} className={styles.docPreviewBody}>
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
      headingText = markdownMatch[2].trim();
      markdownIsTitle = markdownMatch[1].length === 1;
    } else if (isHeadingLine(line)) {
      headingText = line.replace(/:$/, "").trim();
    }

    if (headingText !== null) {
      flushParagraph();
      const isTitle = markdownMatch ? markdownIsTitle : !firstHeadingFound;
      firstHeadingFound = true;
      elements.push(
        isTitle ? (
          <h2 key={`h-${elements.length}`} className={styles.docPreviewTitle}>
            {headingText}
          </h2>
        ) : (
          <h3 key={`h-${elements.length}`} className={styles.docPreviewHeading}>
            {headingText}
          </h3>
        )
      );
      return;
    }

    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    const bulletMatch = line.match(/^[-•*]\s+(.*)$/);
    if (orderedMatch || bulletMatch) {
      flushParagraph();
      const marker = orderedMatch ? `${orderedMatch[1]}.` : "•";
      const content = (orderedMatch ? orderedMatch[2] : bulletMatch![1]).trim();
      elements.push(
        <p key={`li-${elements.length}`} className={styles.docPreviewListItem}>
          <span className={styles.docPreviewMarker}>{marker}</span>
          <span>{renderLabeledContent(content)}</span>
        </p>
      );
      return;
    }

    paragraph.push(line);
  });
  flushParagraph();

  return <div className={styles.docPreview}>{elements}</div>;
}

export default function LecturePlanPreviewModal({
  plans,
  index,
  provider,
  onIndexChange,
  onUpdatePlan,
  onResetSection,
  onDownloadDoc,
  onClose,
}: LecturePlanPreviewModalProps) {
  const plan = plans[index];
  const [activeTab, setActiveTab] = useState<Tab>("slides");
  const [editing, setEditing] = useState(false);
  const [reviseInstr, setReviseInstr] = useState("");
  const [reviseBusy, setReviseBusy] = useState(false);
  const [reviseError, setReviseError] = useState<string | null>(null);

  // Reset transient editor state when the week or tab changes (render-phase
  // adjust, not an effect).
  const ctxKey = `${index}:${activeTab}`;
  const [prevCtx, setPrevCtx] = useState(ctxKey);
  if (ctxKey !== prevCtx) {
    setPrevCtx(ctxKey);
    setEditing(false);
    setReviseInstr("");
    setReviseError(null);
    setReviseBusy(false);
  }

  const proseField = activeTab === "intro" ? "moduleIntroduction" : "assignmentInstructions";
  const proseText = activeTab === "intro" ? plan.moduleIntroduction : plan.assignmentInstructions;

  const updateSlide = (slideIndex: number, patch: Partial<SlideData>) => {
    onUpdatePlan(index, {
      slides: plan.slides.map((s, j) => (j === slideIndex ? { ...s, ...patch } : s)),
    });
  };

  const handleReviseProse = async () => {
    if (!reviseInstr.trim()) return;
    setReviseBusy(true);
    setReviseError(null);
    const result = await reviseLecturePlanTextAction(
      activeTab === "intro" ? "intro" : "instructions",
      plan.assignmentName,
      proseText,
      reviseInstr.trim(),
      "",
      provider
    );
    setReviseBusy(false);
    if ("error" in result) {
      setReviseError(result.error);
      return;
    }
    onUpdatePlan(index, { [proseField]: result.text });
    setReviseInstr("");
  };

  const handleReviseSlides = async () => {
    if (!reviseInstr.trim()) return;
    setReviseBusy(true);
    setReviseError(null);
    const result = await reviseLectureSlidesAction(
      plan.presentationTitle,
      plan.slides,
      reviseInstr.trim(),
      provider
    );
    setReviseBusy(false);
    if ("error" in result) {
      setReviseError(result.error);
      return;
    }
    onUpdatePlan(index, { slides: result.slides });
    setReviseInstr("");
  };

  const tabs: { id: Tab; label: string; hidden?: boolean }[] = [
    { id: "slides", label: `Slides (${plan.slides.length + 1})` },
    { id: "intro", label: "Module Intro" },
    { id: "instructions", label: "Assignment Instructions" },
  ];

  return (
    <div className={styles.previewBackdrop} onClick={onClose}>
      <section
        className={styles.lessonPreviewModal}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${plan.presentationTitle}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: week navigator + editable deck title */}
        <div className={styles.previewHeader}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.weekNav}>
              <button
                type="button"
                className={styles.weekNavBtn}
                onClick={() => onIndexChange(index - 1)}
                disabled={index === 0}
                aria-label="Previous week"
              >
                ‹
              </button>
              <span className={styles.weekNavLabel}>
                Week {plan.weekNumber} · {index + 1} of {plans.length}
              </span>
              <button
                type="button"
                className={styles.weekNavBtn}
                onClick={() => onIndexChange(index + 1)}
                disabled={index === plans.length - 1}
                aria-label="Next week"
              >
                ›
              </button>
            </div>
            <p className={styles.previewMeta}>{plan.assignmentName}</p>
            <input
              className={styles.deckTitleInput}
              value={plan.presentationTitle}
              onChange={(e) => onUpdatePlan(index, { presentationTitle: e.target.value })}
              aria-label="Deck title"
            />
          </div>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        <div className={styles.lessonInnerTabs}>
          {tabs.map((tab) => (
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

        {/* Section toolbar: edit/preview (prose), revise with AI, reset, download */}
        <div className={styles.editorToolbar}>
          {activeTab !== "slides" && (
            <button
              type="button"
              className={styles.downloadButton}
              onClick={() => setEditing((e) => !e)}
            >
              {editing ? "Preview" : "Edit"}
            </button>
          )}
          <input
            type="text"
            className={styles.textInput}
            style={{ flex: "1 1 220px", minWidth: 0 }}
            placeholder={
              activeTab === "slides"
                ? "Revise the slides, e.g. add a real-world example slide"
                : "Revise this document, e.g. make the overview shorter"
            }
            value={reviseInstr}
            onChange={(e) => setReviseInstr(e.target.value)}
          />
          <button
            type="button"
            className={styles.downloadButton}
            onClick={activeTab === "slides" ? handleReviseSlides : handleReviseProse}
            disabled={reviseBusy || !reviseInstr.trim()}
          >
            {reviseBusy ? "Revising…" : "Revise with AI"}
          </button>
          <button
            type="button"
            className={styles.downloadButton}
            onClick={() =>
              onResetSection(index, activeTab === "slides" ? "slides" : proseField)
            }
          >
            Reset
          </button>
          <button
            type="button"
            className={styles.downloadButton}
            onClick={() => void onDownloadDoc(index, activeTab)}
          >
            {activeTab === "slides" ? "Download .pptx" : "Download .docx"}
          </button>
        </div>

        {reviseError && <p className={styles.error}>{reviseError}</p>}

        {/* Slides: inline-editable cards */}
        {activeTab === "slides" && (
          <ul className={styles.lessonSlideList}>
            <li className={styles.lessonSlideCard}>
              <span className={styles.lessonSlideNum}>Slide 1 · Title</span>
              <p className={styles.lessonSlideTitle}>{plan.presentationTitle}</p>
              <p className={styles.fieldHint}>Edit the deck title in the header above.</p>
            </li>
            {plan.slides.map((slide, i) => (
              <li key={i} className={styles.lessonSlideCard}>
                <span className={styles.lessonSlideNum}>Slide {i + 2}</span>
                <input
                  className={styles.deckTitleInput}
                  value={slide.title}
                  onChange={(e) => updateSlide(i, { title: e.target.value })}
                  aria-label={`Slide ${i + 2} title`}
                />
                <label className={styles.editorFieldLabel}>Bullets (one per line)</label>
                <textarea
                  className={styles.fieldEditArea}
                  rows={Math.max(3, slide.bullets.length)}
                  value={slide.bullets.join("\n")}
                  onChange={(e) => updateSlide(i, { bullets: e.target.value.split("\n") })}
                  aria-label={`Slide ${i + 2} bullets`}
                />
                {slide.code !== undefined && (
                  <>
                    <label className={styles.editorFieldLabel}>
                      Code{slide.codeLanguage ? ` (${slide.codeLanguage})` : ""}
                    </label>
                    <textarea
                      className={`${styles.fieldEditArea} ${styles.editorCodeArea}`}
                      rows={Math.max(4, slide.code.split("\n").length)}
                      value={slide.code}
                      onChange={(e) => updateSlide(i, { code: e.target.value })}
                      aria-label={`Slide ${i + 2} code`}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Prose docs: edit (split textarea + live preview) or preview */}
        {activeTab !== "slides" &&
          (editing ? (
            <div className={styles.docEditWrap}>
              <textarea
                className={styles.docEditArea}
                value={proseText}
                onChange={(e) => onUpdatePlan(index, { [proseField]: e.target.value })}
                aria-label="Document source"
              />
              <div className={styles.docPreviewPane}>
                <PlainTextSection text={proseText} />
              </div>
            </div>
          ) : (
            <div className={styles.docPreviewFull}>
              {proseText.trim() ? (
                <PlainTextSection text={proseText} />
              ) : (
                <p className={styles.emptyState}>This document is empty. Use Edit to write it.</p>
              )}
            </div>
          ))}
      </section>
    </div>
  );
}
