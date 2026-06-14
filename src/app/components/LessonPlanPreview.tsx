"use client";

import type { ComponentType } from "react";
import { useState } from "react";
import type {
  AssignmentData,
  ExamplesData,
  GenerateLessonPlanResult,
  ModuleIntroData,
} from "../actions";
import styles from "../page.module.css";
import { parseGeneratedRubric } from "../utils/rubric";

type PreviewTab = "intro" | "slides" | "assignment" | "rubric" | "examples";

type LessonPlanPreviewIcons = {
  CopyIcon: ComponentType;
  LockClosedIcon: ComponentType;
  LockOpenIcon: ComponentType;
  PencilIcon: ComponentType;
};

type LessonPlanPreviewProps = {
  lessonPlanPreview: GenerateLessonPlanResult;
  assignmentPreview: AssignmentData | null;
  introPreview: ModuleIntroData | null;
  rubricPreview: string | null;
  examplesPreview: ExamplesData | null;
  copiedKey: string | null;
  onClose: () => void;
  onCopy: (copyKey: string, value: string) => Promise<void>;
  onSaveField: (key: string, draft: string) => void;
  onRegenerate: (revisionPrompt: string) => Promise<boolean>;
  onDownload: () => Promise<void>;
  icons: LessonPlanPreviewIcons;
};

export default function LessonPlanPreview({
  lessonPlanPreview,
  assignmentPreview,
  introPreview,
  rubricPreview,
  examplesPreview,
  copiedKey,
  onClose,
  onCopy,
  onSaveField,
  onRegenerate,
  onDownload,
  icons,
}: LessonPlanPreviewProps) {
  const { CopyIcon, LockClosedIcon, LockOpenIcon, PencilIcon } = icons;
  const [previewTab, setPreviewTab] = useState<PreviewTab>("intro");
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [editingLessonField, setEditingLessonField] = useState<string | null>(null);
  const [lessonFieldDraft, setLessonFieldDraft] = useState("");
  const [lockedLessonFields, setLockedLessonFields] = useState<Set<string>>(
    new Set()
  );

  const startEditLessonField = (key: string, value: string) => {
    setEditingLessonField(key);
    setLessonFieldDraft(value);
  };

  const cancelEditLessonField = () => {
    setEditingLessonField(null);
  };

  const saveLessonFieldEdit = (key: string) => {
    onSaveField(key, lessonFieldDraft);
    setEditingLessonField(null);
  };

  const toggleLessonFieldLock = (key: string) => {
    setLockedLessonFields((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const didUpdate = await onRegenerate(revisionPrompt);
      if (didUpdate) {
        setRevisionPrompt("");
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className={styles.previewBackdrop} onClick={onClose}>
      <section
        className={styles.lessonPreviewModal}
        role="dialog"
        aria-modal="true"
        aria-label="Lesson plan preview"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingLessonField === "lesson-title" ? (
              <div className={styles.fieldEditWrap}>
                <input
                  type="text"
                  className={styles.fieldEditArea}
                  style={{
                    minHeight: "auto",
                    padding: "6px 10px",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                  }}
                  value={lessonFieldDraft}
                  onChange={(event) => setLessonFieldDraft(event.target.value)}
                  autoFocus
                />
                <div className={styles.fieldEditActions}>
                  <button
                    type="button"
                    className={styles.fieldEditSaveBtn}
                    onClick={() => saveLessonFieldEdit("lesson-title")}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className={styles.fieldEditCancelBtn}
                    onClick={cancelEditLessonField}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.fieldLabelRow}>
                <h3 style={{ margin: 0 }}>{lessonPlanPreview.presentationTitle}</h3>
                <button
                  type="button"
                  className={styles.syllabusSectionActionButton}
                  title="Edit title"
                  aria-label="Edit presentation title"
                  onClick={() =>
                    startEditLessonField(
                      "lesson-title",
                      lessonPlanPreview.presentationTitle
                    )
                  }
                >
                  <PencilIcon />
                </button>
              </div>
            )}
            <p className={styles.previewMeta}>
              {previewTab === "intro"
                ? "Module Introduction"
                : previewTab === "slides"
                  ? `${lessonPlanPreview.slides.length} slides`
                  : previewTab === "assignment"
                    ? (assignmentPreview?.title ?? "Assignment")
                    : previewTab === "examples"
                      ? "In-Class Examples"
                      : "Grading Rubric"}
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

        <div className={styles.lessonInnerTabs}>
          <button
            type="button"
            className={`${styles.lessonInnerTab}${previewTab === "intro" ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => setPreviewTab("intro")}
          >
            Introduction
          </button>
          <button
            type="button"
            className={`${styles.lessonInnerTab}${previewTab === "slides" ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => setPreviewTab("slides")}
          >
            Slides
          </button>
          <button
            type="button"
            className={`${styles.lessonInnerTab}${previewTab === "examples" ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => setPreviewTab("examples")}
          >
            Examples
          </button>
          <button
            type="button"
            className={`${styles.lessonInnerTab}${previewTab === "assignment" ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => setPreviewTab("assignment")}
          >
            Assignment
          </button>
          <button
            type="button"
            className={`${styles.lessonInnerTab}${previewTab === "rubric" ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => setPreviewTab("rubric")}
          >
            Rubric
          </button>
        </div>

        {previewTab === "intro" && (
          <div className={styles.assignmentContent}>
            {introPreview ? (
              <>
                <div className={styles.assignmentSection}>
                  <div className={styles.fieldLabelRow}>
                    <p className={styles.assignmentSectionLabel}>Where This Fits</p>
                    <div className={styles.syllabusSectionActions}>
                      <button
                        type="button"
                        className={styles.syllabusSectionActionButton}
                        title={copiedKey === "intro-overview" ? "Copied" : "Copy"}
                        aria-label={
                          copiedKey === "intro-overview"
                            ? "Copied"
                            : "Copy overview"
                        }
                        onClick={() => onCopy("intro-overview", introPreview.overview)}
                      >
                        <CopyIcon />
                      </button>
                      <button
                        type="button"
                        className={`${styles.syllabusSectionActionButton}${lockedLessonFields.has("intro-overview") ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                        title={
                          lockedLessonFields.has("intro-overview")
                            ? "Locked"
                            : "Lock"
                        }
                        aria-label={
                          lockedLessonFields.has("intro-overview")
                            ? "Unlock overview"
                            : "Lock overview"
                        }
                        onClick={() => toggleLessonFieldLock("intro-overview")}
                      >
                        {lockedLessonFields.has("intro-overview") ? (
                          <LockClosedIcon />
                        ) : (
                          <LockOpenIcon />
                        )}
                      </button>
                      <button
                        type="button"
                        className={`${styles.syllabusSectionActionButton}${editingLessonField === "intro-overview" ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                        title="Edit"
                        aria-label="Edit overview"
                        onClick={() =>
                          editingLessonField === "intro-overview"
                            ? cancelEditLessonField()
                            : startEditLessonField(
                                "intro-overview",
                                introPreview.overview
                              )
                        }
                      >
                        <PencilIcon />
                      </button>
                    </div>
                  </div>
                  {editingLessonField === "intro-overview" ? (
                    <div className={styles.fieldEditWrap}>
                      <textarea
                        className={styles.fieldEditArea}
                        value={lessonFieldDraft}
                        onChange={(event) => setLessonFieldDraft(event.target.value)}
                        rows={Math.max(4, lessonFieldDraft.split("\n").length + 2)}
                        autoFocus
                      />
                      <div className={styles.fieldEditActions}>
                        <button
                          type="button"
                          className={styles.fieldEditSaveBtn}
                          onClick={() => saveLessonFieldEdit("intro-overview")}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className={styles.fieldEditCancelBtn}
                          onClick={cancelEditLessonField}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className={styles.introText}>{introPreview.overview}</p>
                  )}
                </div>
                <div className={styles.assignmentSection}>
                  <div className={styles.fieldLabelRow}>
                    <p className={styles.assignmentSectionLabel}>Key Terms</p>
                    <div className={styles.syllabusSectionActions}>
                      <button
                        type="button"
                        className={styles.syllabusSectionActionButton}
                        title={copiedKey === "intro-keyTerms" ? "Copied" : "Copy"}
                        aria-label={
                          copiedKey === "intro-keyTerms"
                            ? "Copied"
                            : "Copy key terms"
                        }
                        onClick={() => onCopy("intro-keyTerms", introPreview.keyTerms)}
                      >
                        <CopyIcon />
                      </button>
                      <button
                        type="button"
                        className={`${styles.syllabusSectionActionButton}${lockedLessonFields.has("intro-keyTerms") ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                        title={
                          lockedLessonFields.has("intro-keyTerms")
                            ? "Locked"
                            : "Lock"
                        }
                        aria-label={
                          lockedLessonFields.has("intro-keyTerms")
                            ? "Unlock key terms"
                            : "Lock key terms"
                        }
                        onClick={() => toggleLessonFieldLock("intro-keyTerms")}
                      >
                        {lockedLessonFields.has("intro-keyTerms") ? (
                          <LockClosedIcon />
                        ) : (
                          <LockOpenIcon />
                        )}
                      </button>
                      <button
                        type="button"
                        className={`${styles.syllabusSectionActionButton}${editingLessonField === "intro-keyTerms" ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                        title="Edit"
                        aria-label="Edit key terms"
                        onClick={() =>
                          editingLessonField === "intro-keyTerms"
                            ? cancelEditLessonField()
                            : startEditLessonField(
                                "intro-keyTerms",
                                introPreview.keyTerms
                              )
                        }
                      >
                        <PencilIcon />
                      </button>
                    </div>
                  </div>
                  {editingLessonField === "intro-keyTerms" ? (
                    <div className={styles.fieldEditWrap}>
                      <textarea
                        className={styles.fieldEditArea}
                        value={lessonFieldDraft}
                        onChange={(event) => setLessonFieldDraft(event.target.value)}
                        rows={Math.max(4, lessonFieldDraft.split("\n").length + 2)}
                        autoFocus
                      />
                      <div className={styles.fieldEditActions}>
                        <button
                          type="button"
                          className={styles.fieldEditSaveBtn}
                          onClick={() => saveLessonFieldEdit("intro-keyTerms")}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className={styles.fieldEditCancelBtn}
                          onClick={cancelEditLessonField}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className={styles.introText}>{introPreview.keyTerms}</p>
                  )}
                </div>
              </>
            ) : (
              <p className={styles.emptyState}>
                Introduction generation failed — try regenerating.
              </p>
            )}
          </div>
        )}

        {previewTab === "slides" && (
          <ol className={styles.lessonSlideList}>
            {lessonPlanPreview.slides.map((slide, index) => (
              <li key={index} className={styles.lessonSlideCard}>
                <div className={styles.fieldLabelRow}>
                  <span className={styles.lessonSlideNum}>Slide {index + 1}</span>
                  <div className={styles.syllabusSectionActions}>
                    <button
                      type="button"
                      className={styles.syllabusSectionActionButton}
                      title={copiedKey === `slide-${index}` ? "Copied" : "Copy"}
                      aria-label={
                        copiedKey === `slide-${index}`
                          ? "Copied"
                          : `Copy slide ${index + 1}`
                      }
                      onClick={() =>
                        onCopy(
                          `slide-${index}`,
                          [slide.title, ...slide.bullets].join("\n")
                        )
                      }
                    >
                      <CopyIcon />
                    </button>
                    <button
                      type="button"
                      className={`${styles.syllabusSectionActionButton}${lockedLessonFields.has(`slide-${index}`) ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                      title={
                        lockedLessonFields.has(`slide-${index}`) ? "Locked" : "Lock"
                      }
                      aria-label={
                        lockedLessonFields.has(`slide-${index}`)
                          ? `Unlock slide ${index + 1}`
                          : `Lock slide ${index + 1}`
                      }
                      onClick={() => toggleLessonFieldLock(`slide-${index}`)}
                    >
                      {lockedLessonFields.has(`slide-${index}`) ? (
                        <LockClosedIcon />
                      ) : (
                        <LockOpenIcon />
                      )}
                    </button>
                    <button
                      type="button"
                      className={`${styles.syllabusSectionActionButton}${editingLessonField === `slide-${index}` ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                      title="Edit"
                      aria-label={`Edit slide ${index + 1}`}
                      onClick={() =>
                        editingLessonField === `slide-${index}`
                          ? cancelEditLessonField()
                          : startEditLessonField(
                              `slide-${index}`,
                              [slide.title, ...slide.bullets].join("\n")
                            )
                      }
                    >
                      <PencilIcon />
                    </button>
                  </div>
                </div>
                {editingLessonField === `slide-${index}` ? (
                  <div className={styles.fieldEditWrap}>
                    <textarea
                      className={styles.fieldEditArea}
                      value={lessonFieldDraft}
                      onChange={(event) => setLessonFieldDraft(event.target.value)}
                      rows={Math.max(4, lessonFieldDraft.split("\n").length + 2)}
                      placeholder="First line is the slide title; each additional line becomes a bullet point."
                      autoFocus
                    />
                    <div className={styles.fieldEditActions}>
                      <button
                        type="button"
                        className={styles.fieldEditSaveBtn}
                        onClick={() => saveLessonFieldEdit(`slide-${index}`)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className={styles.fieldEditCancelBtn}
                        onClick={cancelEditLessonField}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className={styles.lessonSlideTitle}>{slide.title}</p>
                    {slide.bullets.length > 0 && (
                      <ul className={styles.lessonSlideBullets}>
                        {slide.bullets.map((bullet, bulletIndex) => (
                          <li key={bulletIndex}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                    {slide.code && (
                      <div className={styles.exampleCodeWrap}>
                        {slide.codeLanguage && (
                          <span className={styles.exampleCodeLang}>
                            {slide.codeLanguage}
                          </span>
                        )}
                        <pre className={styles.exampleCodeBlock}>
                          <code>{slide.code}</code>
                        </pre>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ol>
        )}

        {previewTab === "assignment" && (
          <div className={styles.assignmentContent}>
            {assignmentPreview ? (
              <>
                <div className={styles.assignmentSection}>
                  <div className={styles.fieldLabelRow}>
                    <p className={styles.assignmentSectionLabel}>Overview</p>
                    <div className={styles.syllabusSectionActions}>
                      <button
                        type="button"
                        className={styles.syllabusSectionActionButton}
                        title={
                          copiedKey === "assignment-overview" ? "Copied" : "Copy"
                        }
                        aria-label={
                          copiedKey === "assignment-overview"
                            ? "Copied"
                            : "Copy overview"
                        }
                        onClick={() =>
                          onCopy("assignment-overview", assignmentPreview.overview)
                        }
                      >
                        <CopyIcon />
                      </button>
                      <button
                        type="button"
                        className={`${styles.syllabusSectionActionButton}${lockedLessonFields.has("assignment-overview") ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                        title={
                          lockedLessonFields.has("assignment-overview")
                            ? "Locked"
                            : "Lock"
                        }
                        aria-label={
                          lockedLessonFields.has("assignment-overview")
                            ? "Unlock overview"
                            : "Lock overview"
                        }
                        onClick={() =>
                          toggleLessonFieldLock("assignment-overview")
                        }
                      >
                        {lockedLessonFields.has("assignment-overview") ? (
                          <LockClosedIcon />
                        ) : (
                          <LockOpenIcon />
                        )}
                      </button>
                      <button
                        type="button"
                        className={`${styles.syllabusSectionActionButton}${editingLessonField === "assignment-overview" ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                        title="Edit"
                        aria-label="Edit overview"
                        onClick={() =>
                          editingLessonField === "assignment-overview"
                            ? cancelEditLessonField()
                            : startEditLessonField(
                                "assignment-overview",
                                assignmentPreview.overview
                              )
                        }
                      >
                        <PencilIcon />
                      </button>
                    </div>
                  </div>
                  {editingLessonField === "assignment-overview" ? (
                    <div className={styles.fieldEditWrap}>
                      <textarea
                        className={styles.fieldEditArea}
                        value={lessonFieldDraft}
                        onChange={(event) => setLessonFieldDraft(event.target.value)}
                        rows={Math.max(4, lessonFieldDraft.split("\n").length + 2)}
                        autoFocus
                      />
                      <div className={styles.fieldEditActions}>
                        <button
                          type="button"
                          className={styles.fieldEditSaveBtn}
                          onClick={() =>
                            saveLessonFieldEdit("assignment-overview")
                          }
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className={styles.fieldEditCancelBtn}
                          onClick={cancelEditLessonField}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className={styles.assignmentOverview}>
                      {assignmentPreview.overview}
                    </p>
                  )}
                </div>
                <div className={styles.assignmentSection}>
                  <p className={styles.assignmentSectionLabel}>Steps</p>
                  <ol className={styles.assignmentStepList}>
                    {assignmentPreview.steps.map((step, index) => (
                      <li key={index} className={styles.assignmentStepCard}>
                        <div
                          className={styles.fieldEditActions}
                          style={{ justifyContent: "flex-end", marginBottom: 4 }}
                        >
                          <button
                            type="button"
                            className={styles.syllabusSectionActionButton}
                            title={
                              copiedKey === `assignment-step-${index}`
                                ? "Copied"
                                : "Copy"
                            }
                            aria-label={
                              copiedKey === `assignment-step-${index}`
                                ? "Copied"
                                : `Copy step ${index + 1}`
                            }
                            onClick={() =>
                              onCopy(
                                `assignment-step-${index}`,
                                [step.stepTitle, step.description].join("\n")
                              )
                            }
                          >
                            <CopyIcon />
                          </button>
                          <button
                            type="button"
                            className={`${styles.syllabusSectionActionButton}${lockedLessonFields.has(`assignment-step-${index}`) ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                            title={
                              lockedLessonFields.has(`assignment-step-${index}`)
                                ? "Locked"
                                : "Lock"
                            }
                            aria-label={
                              lockedLessonFields.has(`assignment-step-${index}`)
                                ? `Unlock step ${index + 1}`
                                : `Lock step ${index + 1}`
                            }
                            onClick={() =>
                              toggleLessonFieldLock(`assignment-step-${index}`)
                            }
                          >
                            {lockedLessonFields.has(`assignment-step-${index}`) ? (
                              <LockClosedIcon />
                            ) : (
                              <LockOpenIcon />
                            )}
                          </button>
                          <button
                            type="button"
                            className={`${styles.syllabusSectionActionButton}${editingLessonField === `assignment-step-${index}` ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                            title="Edit"
                            aria-label={`Edit step ${index + 1}`}
                            onClick={() =>
                              editingLessonField === `assignment-step-${index}`
                                ? cancelEditLessonField()
                                : startEditLessonField(
                                    `assignment-step-${index}`,
                                    [step.stepTitle, step.description].join("\n")
                                  )
                            }
                          >
                            <PencilIcon />
                          </button>
                        </div>
                        {editingLessonField === `assignment-step-${index}` ? (
                          <div className={styles.fieldEditWrap}>
                            <textarea
                              className={styles.fieldEditArea}
                              value={lessonFieldDraft}
                              onChange={(event) =>
                                setLessonFieldDraft(event.target.value)
                              }
                              rows={
                                Math.max(4, lessonFieldDraft.split("\n").length + 2)
                              }
                              placeholder="First line is the step title; remaining lines become the description."
                              autoFocus
                            />
                            <div className={styles.fieldEditActions}>
                              <button
                                type="button"
                                className={styles.fieldEditSaveBtn}
                                onClick={() =>
                                  saveLessonFieldEdit(`assignment-step-${index}`)
                                }
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className={styles.fieldEditCancelBtn}
                                onClick={cancelEditLessonField}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className={styles.assignmentStepTitle}>
                              {step.stepTitle}
                            </p>
                            <p className={styles.assignmentStepDesc}>
                              {step.description}
                            </p>
                          </>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className={styles.assignmentSection}>
                  <div className={styles.fieldLabelRow}>
                    <p className={styles.assignmentSectionLabel}>Free Tools</p>
                    <div className={styles.syllabusSectionActions}>
                      <button
                        type="button"
                        className={styles.syllabusSectionActionButton}
                        title={copiedKey === "assignment-tools" ? "Copied" : "Copy"}
                        aria-label={
                          copiedKey === "assignment-tools"
                            ? "Copied"
                            : "Copy tools list"
                        }
                        onClick={() =>
                          onCopy(
                            "assignment-tools",
                            assignmentPreview.tools.join("\n")
                          )
                        }
                      >
                        <CopyIcon />
                      </button>
                      <button
                        type="button"
                        className={`${styles.syllabusSectionActionButton}${lockedLessonFields.has("assignment-tools") ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                        title={
                          lockedLessonFields.has("assignment-tools")
                            ? "Locked"
                            : "Lock"
                        }
                        aria-label={
                          lockedLessonFields.has("assignment-tools")
                            ? "Unlock tools"
                            : "Lock tools"
                        }
                        onClick={() => toggleLessonFieldLock("assignment-tools")}
                      >
                        {lockedLessonFields.has("assignment-tools") ? (
                          <LockClosedIcon />
                        ) : (
                          <LockOpenIcon />
                        )}
                      </button>
                      <button
                        type="button"
                        className={`${styles.syllabusSectionActionButton}${editingLessonField === "assignment-tools" ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                        title="Edit"
                        aria-label="Edit tools list"
                        onClick={() =>
                          editingLessonField === "assignment-tools"
                            ? cancelEditLessonField()
                            : startEditLessonField(
                                "assignment-tools",
                                assignmentPreview.tools.join("\n")
                              )
                        }
                      >
                        <PencilIcon />
                      </button>
                    </div>
                  </div>
                  {editingLessonField === "assignment-tools" ? (
                    <div className={styles.fieldEditWrap}>
                      <textarea
                        className={styles.fieldEditArea}
                        value={lessonFieldDraft}
                        onChange={(event) => setLessonFieldDraft(event.target.value)}
                        rows={Math.max(3, lessonFieldDraft.split("\n").length + 2)}
                        placeholder="One tool per line."
                        autoFocus
                      />
                      <div className={styles.fieldEditActions}>
                        <button
                          type="button"
                          className={styles.fieldEditSaveBtn}
                          onClick={() => saveLessonFieldEdit("assignment-tools")}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className={styles.fieldEditCancelBtn}
                          onClick={cancelEditLessonField}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <ul className={styles.assignmentList}>
                      {assignmentPreview.tools.map((tool, index) => (
                        <li key={index}>{tool}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className={styles.assignmentSection}>
                  <div className={styles.fieldLabelRow}>
                    <p className={styles.assignmentSectionLabel}>Deliverables</p>
                    <div className={styles.syllabusSectionActions}>
                      <button
                        type="button"
                        className={styles.syllabusSectionActionButton}
                        title={
                          copiedKey === "assignment-deliverables"
                            ? "Copied"
                            : "Copy"
                        }
                        aria-label={
                          copiedKey === "assignment-deliverables"
                            ? "Copied"
                            : "Copy deliverables list"
                        }
                        onClick={() =>
                          onCopy(
                            "assignment-deliverables",
                            assignmentPreview.deliverables.join("\n")
                          )
                        }
                      >
                        <CopyIcon />
                      </button>
                      <button
                        type="button"
                        className={`${styles.syllabusSectionActionButton}${lockedLessonFields.has("assignment-deliverables") ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                        title={
                          lockedLessonFields.has("assignment-deliverables")
                            ? "Locked"
                            : "Lock"
                        }
                        aria-label={
                          lockedLessonFields.has("assignment-deliverables")
                            ? "Unlock deliverables"
                            : "Lock deliverables"
                        }
                        onClick={() =>
                          toggleLessonFieldLock("assignment-deliverables")
                        }
                      >
                        {lockedLessonFields.has("assignment-deliverables") ? (
                          <LockClosedIcon />
                        ) : (
                          <LockOpenIcon />
                        )}
                      </button>
                      <button
                        type="button"
                        className={`${styles.syllabusSectionActionButton}${editingLessonField === "assignment-deliverables" ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                        title="Edit"
                        aria-label="Edit deliverables list"
                        onClick={() =>
                          editingLessonField === "assignment-deliverables"
                            ? cancelEditLessonField()
                            : startEditLessonField(
                                "assignment-deliverables",
                                assignmentPreview.deliverables.join("\n")
                              )
                        }
                      >
                        <PencilIcon />
                      </button>
                    </div>
                  </div>
                  {editingLessonField === "assignment-deliverables" ? (
                    <div className={styles.fieldEditWrap}>
                      <textarea
                        className={styles.fieldEditArea}
                        value={lessonFieldDraft}
                        onChange={(event) => setLessonFieldDraft(event.target.value)}
                        rows={Math.max(3, lessonFieldDraft.split("\n").length + 2)}
                        placeholder="One deliverable per line."
                        autoFocus
                      />
                      <div className={styles.fieldEditActions}>
                        <button
                          type="button"
                          className={styles.fieldEditSaveBtn}
                          onClick={() =>
                            saveLessonFieldEdit("assignment-deliverables")
                          }
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className={styles.fieldEditCancelBtn}
                          onClick={cancelEditLessonField}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <ul className={styles.assignmentList}>
                      {assignmentPreview.deliverables.map((deliverable, index) => (
                        <li key={index}>{deliverable}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <p className={styles.emptyState}>
                Assignment generation failed — try regenerating.
              </p>
            )}
          </div>
        )}

        {previewTab === "rubric" && (
          <div className={styles.assignmentContent}>
            {rubricPreview ? (
              <>
                <div className={styles.fieldLabelRow}>
                  <p className={styles.assignmentSectionLabel}>Grading Rubric</p>
                  <div className={styles.syllabusSectionActions}>
                    <button
                      type="button"
                      className={styles.syllabusSectionActionButton}
                      title={copiedKey === "rubric" ? "Copied" : "Copy"}
                      aria-label={copiedKey === "rubric" ? "Copied" : "Copy rubric"}
                      onClick={() => onCopy("rubric", rubricPreview)}
                    >
                      <CopyIcon />
                    </button>
                    <button
                      type="button"
                      className={`${styles.syllabusSectionActionButton}${lockedLessonFields.has("rubric") ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                      title={lockedLessonFields.has("rubric") ? "Locked" : "Lock"}
                      aria-label={
                        lockedLessonFields.has("rubric")
                          ? "Unlock rubric"
                          : "Lock rubric"
                      }
                      onClick={() => toggleLessonFieldLock("rubric")}
                    >
                      {lockedLessonFields.has("rubric") ? (
                        <LockClosedIcon />
                      ) : (
                        <LockOpenIcon />
                      )}
                    </button>
                    <button
                      type="button"
                      className={`${styles.syllabusSectionActionButton}${editingLessonField === "rubric" ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                      title="Edit"
                      aria-label="Edit rubric"
                      onClick={() =>
                        editingLessonField === "rubric"
                          ? cancelEditLessonField()
                          : startEditLessonField("rubric", rubricPreview)
                      }
                    >
                      <PencilIcon />
                    </button>
                  </div>
                </div>
                {editingLessonField === "rubric" ? (
                  <div className={styles.fieldEditWrap}>
                    <textarea
                      className={styles.fieldEditArea}
                      value={lessonFieldDraft}
                      onChange={(event) => setLessonFieldDraft(event.target.value)}
                      rows={Math.max(8, lessonFieldDraft.split("\n").length + 2)}
                      autoFocus
                    />
                    <div className={styles.fieldEditActions}>
                      <button
                        type="button"
                        className={styles.fieldEditSaveBtn}
                        onClick={() => saveLessonFieldEdit("rubric")}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className={styles.fieldEditCancelBtn}
                        onClick={cancelEditLessonField}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (() => {
                  const rows = parseGeneratedRubric(rubricPreview);
                  return rows ? (
                    <table className={styles.generatedRubricTable}>
                      <thead>
                        <tr>
                          <th>Area</th>
                          <th>Weight</th>
                          <th>Performance Levels</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, index) => (
                          <tr key={index}>
                            <td>{row.area}</td>
                            <td>
                              {row.weight.endsWith("%")
                                ? row.weight
                                : `${row.weight}%`}
                            </td>
                            <td>
                              {row.subcategories.length > 0 ? (
                                <ul className={styles.rubricSubcategoryList}>
                                  {row.subcategories.map((subcategory) => (
                                    <li key={subcategory.label}>
                                      <strong>{subcategory.label}:</strong>{" "}
                                      {subcategory.description}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                row.description
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <pre className={styles.generatedRubricBody}>{rubricPreview}</pre>
                  );
                })()}
              </>
            ) : (
              <p className={styles.emptyState}>
                Rubric generation failed — try regenerating.
              </p>
            )}
          </div>
        )}

        {previewTab === "examples" && (
          <div className={styles.assignmentContent}>
            {examplesPreview && examplesPreview.examples.length > 0 ? (
              <ol className={styles.exampleList}>
                {examplesPreview.examples.map((example, index) => {
                  const prevConcept = index > 0 ? examplesPreview.examples[index - 1].concept : null;
                  const showConceptHeader = example.concept && example.concept !== prevConcept;
                  return (
                    <li key={index} className={styles.exampleCard}>
                      {showConceptHeader && (
                        <p className={styles.exampleConceptHeader}>{example.concept}</p>
                      )}
                      <div className={styles.fieldLabelRow}>
                        <p className={styles.exampleTitle}>{example.title}</p>
                      <div className={styles.syllabusSectionActions}>
                        <button
                          type="button"
                          className={styles.syllabusSectionActionButton}
                          title={copiedKey === `example-${index}` ? "Copied" : "Copy"}
                          aria-label={
                            copiedKey === `example-${index}`
                              ? "Copied"
                              : `Copy example ${index + 1}`
                          }
                          onClick={() =>
                            onCopy(
                              `example-${index}`,
                              [example.title, example.content, example.explanation].join("\n\n")
                            )
                          }
                        >
                          <CopyIcon />
                        </button>
                        <button
                          type="button"
                          className={`${styles.syllabusSectionActionButton}${lockedLessonFields.has(`example-${index}`) ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                          title={
                            lockedLessonFields.has(`example-${index}`) ? "Locked" : "Lock"
                          }
                          aria-label={
                            lockedLessonFields.has(`example-${index}`)
                              ? `Unlock example ${index + 1}`
                              : `Lock example ${index + 1}`
                          }
                          onClick={() => toggleLessonFieldLock(`example-${index}`)}
                        >
                          {lockedLessonFields.has(`example-${index}`) ? (
                            <LockClosedIcon />
                          ) : (
                            <LockOpenIcon />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className={styles.exampleSection}>
                      <div className={styles.fieldLabelRow}>
                        <p className={styles.assignmentSectionLabel}>
                          {examplesPreview.lessonType === "programming" ? "Code" : "Problem"}
                        </p>
                        <button
                          type="button"
                          className={`${styles.syllabusSectionActionButton}${editingLessonField === `example-content-${index}` ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                          title="Edit"
                          aria-label={`Edit example ${index + 1} content`}
                          onClick={() =>
                            editingLessonField === `example-content-${index}`
                              ? cancelEditLessonField()
                              : startEditLessonField(
                                  `example-content-${index}`,
                                  example.content
                                )
                          }
                        >
                          <PencilIcon />
                        </button>
                      </div>
                      {editingLessonField === `example-content-${index}` ? (
                        <div className={styles.fieldEditWrap}>
                          <textarea
                            className={styles.fieldEditArea}
                            value={lessonFieldDraft}
                            onChange={(event) => setLessonFieldDraft(event.target.value)}
                            rows={Math.max(6, lessonFieldDraft.split("\n").length + 2)}
                            autoFocus
                          />
                          <div className={styles.fieldEditActions}>
                            <button
                              type="button"
                              className={styles.fieldEditSaveBtn}
                              onClick={() => saveLessonFieldEdit(`example-content-${index}`)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className={styles.fieldEditCancelBtn}
                              onClick={cancelEditLessonField}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : examplesPreview.lessonType === "programming" ? (
                        <div className={styles.exampleCodeWrap}>
                          {example.language && (
                            <span className={styles.exampleCodeLang}>{example.language}</span>
                          )}
                          <pre className={styles.exampleCodeBlock}><code>{example.content}</code></pre>
                        </div>
                      ) : (
                        <p className={styles.exampleProblemText}>{example.content}</p>
                      )}
                    </div>

                    <div className={styles.exampleSection}>
                      <div className={styles.fieldLabelRow}>
                        <p className={styles.assignmentSectionLabel}>
                          {examplesPreview.lessonType === "programming" ? "Explanation" : "Solution"}
                        </p>
                        <button
                          type="button"
                          className={`${styles.syllabusSectionActionButton}${editingLessonField === `example-explanation-${index}` ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                          title="Edit"
                          aria-label={`Edit example ${index + 1} explanation`}
                          onClick={() =>
                            editingLessonField === `example-explanation-${index}`
                              ? cancelEditLessonField()
                              : startEditLessonField(
                                  `example-explanation-${index}`,
                                  example.explanation
                                )
                          }
                        >
                          <PencilIcon />
                        </button>
                      </div>
                      {editingLessonField === `example-explanation-${index}` ? (
                        <div className={styles.fieldEditWrap}>
                          <textarea
                            className={styles.fieldEditArea}
                            value={lessonFieldDraft}
                            onChange={(event) => setLessonFieldDraft(event.target.value)}
                            rows={Math.max(4, lessonFieldDraft.split("\n").length + 2)}
                            autoFocus
                          />
                          <div className={styles.fieldEditActions}>
                            <button
                              type="button"
                              className={styles.fieldEditSaveBtn}
                              onClick={() => saveLessonFieldEdit(`example-explanation-${index}`)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className={styles.fieldEditCancelBtn}
                              onClick={cancelEditLessonField}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className={styles.introText}>{example.explanation}</p>
                      )}
                    </div>
                  </li>
                  );
                })}
              </ol>
            ) : (
              <p className={styles.emptyState}>
                Examples generation failed — try regenerating.
              </p>
            )}
          </div>
        )}

        <div className={styles.lessonRevisionRow}>
          <textarea
            className={styles.lessonRevisionArea}
            placeholder="Revision instructions — e.g. add a slide on X, make analogies more sports-focused, shorten slide 3…"
            value={revisionPrompt}
            onChange={(event) => setRevisionPrompt(event.target.value)}
            rows={2}
          />
          <button
            type="button"
            className={styles.submitButton}
            onClick={handleRegenerate}
            disabled={isRegenerating}
          >
            {isRegenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>

        <div className={styles.lessonPreviewFooter}>
          <button
            type="button"
            className={styles.submitButton}
            onClick={onDownload}
          >
            Download ZIP
          </button>
          <button
            type="button"
            className={styles.downloadButton}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
