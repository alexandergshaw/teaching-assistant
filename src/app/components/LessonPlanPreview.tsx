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
import {
  Button,
  IconButton,
  TextField,
  Autocomplete,
} from "@mui/material";

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
  attachCourses?: Array<{ id: string; name: string }> | null;
  attachBusy?: boolean;
  attachNote?: { kind: "success" | "error"; text: string } | null;
  onAttach?: (courseId: string) => void;
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
  attachCourses,
  attachBusy,
  attachNote,
  onAttach,
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
  const [selectedCourse, setSelectedCourse] = useState<{ id: string; name: string } | null>(null);

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
                <TextField
                  fullWidth
                  size="small"
                  value={lessonFieldDraft}
                  onChange={(event) => setLessonFieldDraft(event.target.value)}
                  autoFocus
                  sx={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                  }}
                />
                <div className={styles.fieldEditActions}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => saveLessonFieldEdit("lesson-title")}
                  >
                    Save
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={cancelEditLessonField}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className={styles.fieldLabelRow}>
                <h3 style={{ margin: 0 }}>{lessonPlanPreview.presentationTitle}</h3>
                <IconButton
                  size="small"
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
                </IconButton>
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
          <Button
            variant={previewTab === "intro" ? "contained" : "outlined"}
            size="small"
            className={styles.lessonInnerTab}
            onClick={() => setPreviewTab("intro")}
          >
            Introduction
          </Button>
          <Button
            variant={previewTab === "slides" ? "contained" : "outlined"}
            size="small"
            className={styles.lessonInnerTab}
            onClick={() => setPreviewTab("slides")}
          >
            Slides
          </Button>
          <Button
            variant={previewTab === "examples" ? "contained" : "outlined"}
            size="small"
            className={styles.lessonInnerTab}
            onClick={() => setPreviewTab("examples")}
          >
            Examples
          </Button>
          <Button
            variant={previewTab === "assignment" ? "contained" : "outlined"}
            size="small"
            className={styles.lessonInnerTab}
            onClick={() => setPreviewTab("assignment")}
          >
            Assignment
          </Button>
          <Button
            variant={previewTab === "rubric" ? "contained" : "outlined"}
            size="small"
            className={styles.lessonInnerTab}
            onClick={() => setPreviewTab("rubric")}
          >
            Rubric
          </Button>
        </div>

        {previewTab === "intro" && (
          <div className={styles.assignmentContent}>
            {introPreview ? (
              <>
                <div className={styles.assignmentSection}>
                  <div className={styles.fieldLabelRow}>
                    <p className={styles.assignmentSectionLabel}>Where This Fits</p>
                    <div className={styles.syllabusSectionActions}>
                      <IconButton
                        size="small"
                        title={copiedKey === "intro-overview" ? "Copied" : "Copy"}
                        aria-label={
                          copiedKey === "intro-overview"
                            ? "Copied"
                            : "Copy overview"
                        }
                        onClick={() => onCopy("intro-overview", introPreview.overview)}
                      >
                        <CopyIcon />
                      </IconButton>
                      <IconButton
                        size="small"
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
                        className={lockedLessonFields.has("intro-overview") ? styles.syllabusSectionActionButtonActive : ""}
                      >
                        {lockedLessonFields.has("intro-overview") ? (
                          <LockClosedIcon />
                        ) : (
                          <LockOpenIcon />
                        )}
                      </IconButton>
                      <IconButton
                        size="small"
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
                        className={editingLessonField === "intro-overview" ? styles.syllabusSectionActionButtonActive : ""}
                      >
                        <PencilIcon />
                      </IconButton>
                    </div>
                  </div>
                  {editingLessonField === "intro-overview" ? (
                    <div className={styles.fieldEditWrap}>
                      <TextField
                        fullWidth
                        multiline
                        minRows={Math.max(4, lessonFieldDraft.split("\n").length + 2)}
                        size="small"
                        value={lessonFieldDraft}
                        onChange={(event) => setLessonFieldDraft(event.target.value)}
                        autoFocus
                      />
                      <div className={styles.fieldEditActions}>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => saveLessonFieldEdit("intro-overview")}
                        >
                          Save
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={cancelEditLessonField}
                        >
                          Cancel
                        </Button>
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
                      <IconButton
                        size="small"
                        title={copiedKey === "intro-keyTerms" ? "Copied" : "Copy"}
                        aria-label={
                          copiedKey === "intro-keyTerms"
                            ? "Copied"
                            : "Copy key terms"
                        }
                        onClick={() => onCopy("intro-keyTerms", introPreview.keyTerms)}
                      >
                        <CopyIcon />
                      </IconButton>
                      <IconButton
                        size="small"
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
                        className={lockedLessonFields.has("intro-keyTerms") ? styles.syllabusSectionActionButtonActive : ""}
                      >
                        {lockedLessonFields.has("intro-keyTerms") ? (
                          <LockClosedIcon />
                        ) : (
                          <LockOpenIcon />
                        )}
                      </IconButton>
                      <IconButton
                        size="small"
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
                        className={editingLessonField === "intro-keyTerms" ? styles.syllabusSectionActionButtonActive : ""}
                      >
                        <PencilIcon />
                      </IconButton>
                    </div>
                  </div>
                  {editingLessonField === "intro-keyTerms" ? (
                    <div className={styles.fieldEditWrap}>
                      <TextField
                        fullWidth
                        multiline
                        minRows={Math.max(4, lessonFieldDraft.split("\n").length + 2)}
                        size="small"
                        value={lessonFieldDraft}
                        onChange={(event) => setLessonFieldDraft(event.target.value)}
                        autoFocus
                      />
                      <div className={styles.fieldEditActions}>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => saveLessonFieldEdit("intro-keyTerms")}
                        >
                          Save
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={cancelEditLessonField}
                        >
                          Cancel
                        </Button>
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
                    <IconButton
                      size="small"
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
                    </IconButton>
                    <IconButton
                      size="small"
                      title={
                        lockedLessonFields.has(`slide-${index}`) ? "Locked" : "Lock"
                      }
                      aria-label={
                        lockedLessonFields.has(`slide-${index}`)
                          ? `Unlock slide ${index + 1}`
                          : `Lock slide ${index + 1}`
                      }
                      onClick={() => toggleLessonFieldLock(`slide-${index}`)}
                      className={lockedLessonFields.has(`slide-${index}`) ? styles.syllabusSectionActionButtonActive : ""}
                    >
                      {lockedLessonFields.has(`slide-${index}`) ? (
                        <LockClosedIcon />
                      ) : (
                        <LockOpenIcon />
                      )}
                    </IconButton>
                    <IconButton
                      size="small"
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
                      className={editingLessonField === `slide-${index}` ? styles.syllabusSectionActionButtonActive : ""}
                    >
                      <PencilIcon />
                    </IconButton>
                  </div>
                </div>
                {editingLessonField === `slide-${index}` ? (
                  <div className={styles.fieldEditWrap}>
                    <TextField
                      fullWidth
                      multiline
                      minRows={Math.max(4, lessonFieldDraft.split("\n").length + 2)}
                      size="small"
                      value={lessonFieldDraft}
                      onChange={(event) => setLessonFieldDraft(event.target.value)}
                      placeholder="First line is the slide title; each additional line becomes a bullet point."
                      autoFocus
                    />
                    <div className={styles.fieldEditActions}>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => saveLessonFieldEdit(`slide-${index}`)}
                      >
                        Save
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={cancelEditLessonField}
                      >
                        Cancel
                      </Button>
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
                      <IconButton
                        size="small"
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
                      </IconButton>
                      <IconButton
                        size="small"
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
                        className={lockedLessonFields.has("assignment-overview") ? styles.syllabusSectionActionButtonActive : ""}
                      >
                        {lockedLessonFields.has("assignment-overview") ? (
                          <LockClosedIcon />
                        ) : (
                          <LockOpenIcon />
                        )}
                      </IconButton>
                      <IconButton
                        size="small"
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
                        className={editingLessonField === "assignment-overview" ? styles.syllabusSectionActionButtonActive : ""}
                      >
                        <PencilIcon />
                      </IconButton>
                    </div>
                  </div>
                  {editingLessonField === "assignment-overview" ? (
                    <div className={styles.fieldEditWrap}>
                      <TextField
                        fullWidth
                        multiline
                        minRows={Math.max(4, lessonFieldDraft.split("\n").length + 2)}
                        size="small"
                        value={lessonFieldDraft}
                        onChange={(event) => setLessonFieldDraft(event.target.value)}
                        autoFocus
                      />
                      <div className={styles.fieldEditActions}>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() =>
                            saveLessonFieldEdit("assignment-overview")
                          }
                        >
                          Save
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={cancelEditLessonField}
                        >
                          Cancel
                        </Button>
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
                          <IconButton
                            size="small"
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
                          </IconButton>
                          <IconButton
                            size="small"
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
                            className={lockedLessonFields.has(`assignment-step-${index}`) ? styles.syllabusSectionActionButtonActive : ""}
                          >
                            {lockedLessonFields.has(`assignment-step-${index}`) ? (
                              <LockClosedIcon />
                            ) : (
                              <LockOpenIcon />
                            )}
                          </IconButton>
                          <IconButton
                            size="small"
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
                            className={editingLessonField === `assignment-step-${index}` ? styles.syllabusSectionActionButtonActive : ""}
                          >
                            <PencilIcon />
                          </IconButton>
                        </div>
                        {editingLessonField === `assignment-step-${index}` ? (
                          <div className={styles.fieldEditWrap}>
                            <TextField
                              fullWidth
                              multiline
                              minRows={
                                Math.max(4, lessonFieldDraft.split("\n").length + 2)
                              }
                              size="small"
                              value={lessonFieldDraft}
                              onChange={(event) =>
                                setLessonFieldDraft(event.target.value)
                              }
                              placeholder="First line is the step title; remaining lines become the description."
                              autoFocus
                            />
                            <div className={styles.fieldEditActions}>
                              <Button
                                variant="contained"
                                size="small"
                                onClick={() =>
                                  saveLessonFieldEdit(`assignment-step-${index}`)
                                }
                              >
                                Save
                              </Button>
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={cancelEditLessonField}
                              >
                                Cancel
                              </Button>
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
                      <IconButton
                        size="small"
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
                      </IconButton>
                      <IconButton
                        size="small"
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
                        className={lockedLessonFields.has("assignment-tools") ? styles.syllabusSectionActionButtonActive : ""}
                      >
                        {lockedLessonFields.has("assignment-tools") ? (
                          <LockClosedIcon />
                        ) : (
                          <LockOpenIcon />
                        )}
                      </IconButton>
                      <IconButton
                        size="small"
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
                        className={editingLessonField === "assignment-tools" ? styles.syllabusSectionActionButtonActive : ""}
                      >
                        <PencilIcon />
                      </IconButton>
                    </div>
                  </div>
                  {editingLessonField === "assignment-tools" ? (
                    <div className={styles.fieldEditWrap}>
                      <TextField
                        fullWidth
                        multiline
                        minRows={Math.max(3, lessonFieldDraft.split("\n").length + 2)}
                        size="small"
                        value={lessonFieldDraft}
                        onChange={(event) => setLessonFieldDraft(event.target.value)}
                        placeholder="One tool per line."
                        autoFocus
                      />
                      <div className={styles.fieldEditActions}>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => saveLessonFieldEdit("assignment-tools")}
                        >
                          Save
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={cancelEditLessonField}
                        >
                          Cancel
                        </Button>
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
                      <IconButton
                        size="small"
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
                      </IconButton>
                      <IconButton
                        size="small"
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
                        className={lockedLessonFields.has("assignment-deliverables") ? styles.syllabusSectionActionButtonActive : ""}
                      >
                        {lockedLessonFields.has("assignment-deliverables") ? (
                          <LockClosedIcon />
                        ) : (
                          <LockOpenIcon />
                        )}
                      </IconButton>
                      <IconButton
                        size="small"
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
                        className={editingLessonField === "assignment-deliverables" ? styles.syllabusSectionActionButtonActive : ""}
                      >
                        <PencilIcon />
                      </IconButton>
                    </div>
                  </div>
                  {editingLessonField === "assignment-deliverables" ? (
                    <div className={styles.fieldEditWrap}>
                      <TextField
                        fullWidth
                        multiline
                        minRows={Math.max(3, lessonFieldDraft.split("\n").length + 2)}
                        size="small"
                        value={lessonFieldDraft}
                        onChange={(event) => setLessonFieldDraft(event.target.value)}
                        placeholder="One deliverable per line."
                        autoFocus
                      />
                      <div className={styles.fieldEditActions}>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() =>
                            saveLessonFieldEdit("assignment-deliverables")
                          }
                        >
                          Save
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={cancelEditLessonField}
                        >
                          Cancel
                        </Button>
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
                    <IconButton
                      size="small"
                      title={copiedKey === "rubric" ? "Copied" : "Copy"}
                      aria-label={copiedKey === "rubric" ? "Copied" : "Copy rubric"}
                      onClick={() => onCopy("rubric", rubricPreview)}
                    >
                      <CopyIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      title={lockedLessonFields.has("rubric") ? "Locked" : "Lock"}
                      aria-label={
                        lockedLessonFields.has("rubric")
                          ? "Unlock rubric"
                          : "Lock rubric"
                      }
                      onClick={() => toggleLessonFieldLock("rubric")}
                      className={lockedLessonFields.has("rubric") ? styles.syllabusSectionActionButtonActive : ""}
                    >
                      {lockedLessonFields.has("rubric") ? (
                        <LockClosedIcon />
                      ) : (
                        <LockOpenIcon />
                      )}
                    </IconButton>
                    <IconButton
                      size="small"
                      title="Edit"
                      aria-label="Edit rubric"
                      onClick={() =>
                        editingLessonField === "rubric"
                          ? cancelEditLessonField()
                          : startEditLessonField("rubric", rubricPreview)
                      }
                      className={editingLessonField === "rubric" ? styles.syllabusSectionActionButtonActive : ""}
                    >
                      <PencilIcon />
                    </IconButton>
                  </div>
                </div>
                {editingLessonField === "rubric" ? (
                  <div className={styles.fieldEditWrap}>
                    <TextField
                      fullWidth
                      multiline
                      minRows={Math.max(8, lessonFieldDraft.split("\n").length + 2)}
                      size="small"
                      value={lessonFieldDraft}
                      onChange={(event) => setLessonFieldDraft(event.target.value)}
                      autoFocus
                    />
                    <div className={styles.fieldEditActions}>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => saveLessonFieldEdit("rubric")}
                      >
                        Save
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={cancelEditLessonField}
                      >
                        Cancel
                      </Button>
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
                        <IconButton
                          size="small"
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
                        </IconButton>
                        <IconButton
                          size="small"
                          title={
                            lockedLessonFields.has(`example-${index}`) ? "Locked" : "Lock"
                          }
                          aria-label={
                            lockedLessonFields.has(`example-${index}`)
                              ? `Unlock example ${index + 1}`
                              : `Lock example ${index + 1}`
                          }
                          onClick={() => toggleLessonFieldLock(`example-${index}`)}
                          className={lockedLessonFields.has(`example-${index}`) ? styles.syllabusSectionActionButtonActive : ""}
                        >
                          {lockedLessonFields.has(`example-${index}`) ? (
                            <LockClosedIcon />
                          ) : (
                            <LockOpenIcon />
                          )}
                        </IconButton>
                      </div>
                    </div>

                    <div className={styles.exampleSection}>
                      <div className={styles.fieldLabelRow}>
                        <p className={styles.assignmentSectionLabel}>
                          {examplesPreview.lessonType === "programming" ? "Code" : "Problem"}
                        </p>
                        <IconButton
                          size="small"
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
                          className={editingLessonField === `example-content-${index}` ? styles.syllabusSectionActionButtonActive : ""}
                        >
                          <PencilIcon />
                        </IconButton>
                      </div>
                      {editingLessonField === `example-content-${index}` ? (
                        <div className={styles.fieldEditWrap}>
                          <TextField
                            fullWidth
                            multiline
                            minRows={Math.max(6, lessonFieldDraft.split("\n").length + 2)}
                            size="small"
                            value={lessonFieldDraft}
                            onChange={(event) => setLessonFieldDraft(event.target.value)}
                            autoFocus
                          />
                          <div className={styles.fieldEditActions}>
                            <Button
                              variant="contained"
                              size="small"
                              onClick={() => saveLessonFieldEdit(`example-content-${index}`)}
                            >
                              Save
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={cancelEditLessonField}
                            >
                              Cancel
                            </Button>
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
                        <IconButton
                          size="small"
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
                          className={editingLessonField === `example-explanation-${index}` ? styles.syllabusSectionActionButtonActive : ""}
                        >
                          <PencilIcon />
                        </IconButton>
                      </div>
                      {editingLessonField === `example-explanation-${index}` ? (
                        <div className={styles.fieldEditWrap}>
                          <TextField
                            fullWidth
                            multiline
                            minRows={Math.max(4, lessonFieldDraft.split("\n").length + 2)}
                            size="small"
                            value={lessonFieldDraft}
                            onChange={(event) => setLessonFieldDraft(event.target.value)}
                            autoFocus
                          />
                          <div className={styles.fieldEditActions}>
                            <Button
                              variant="contained"
                              size="small"
                              onClick={() => saveLessonFieldEdit(`example-explanation-${index}`)}
                            >
                              Save
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={cancelEditLessonField}
                            >
                              Cancel
                            </Button>
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
          <TextField
            fullWidth
            multiline
            minRows={2}
            size="small"
            placeholder="Revision instructions — e.g. add a slide on X, make analogies more sports-focused, shorten slide 3…"
            value={revisionPrompt}
            onChange={(event) => setRevisionPrompt(event.target.value)}
          />
          <Button
            variant="contained"
            size="small"
            onClick={handleRegenerate}
            disabled={isRegenerating}
          >
            {isRegenerating ? "Regenerating..." : "Regenerate"}
          </Button>
        </div>

        <div className={styles.lessonPreviewFooter}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Button
              variant="contained"
              size="small"
              onClick={onDownload}
            >
              Download ZIP
            </Button>
            {onAttach && attachCourses && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Autocomplete
                  options={attachCourses ?? []}
                  value={selectedCourse}
                  onChange={(_, newValue) => setSelectedCourse(newValue)}
                  getOptionLabel={(option) => option.name}
                  isOptionEqualToValue={(option, value) => option.id === value?.id}
                  size="small"
                  sx={{ width: 200 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder={attachCourses === null ? "Loading…" : "Attach to course…"}
                      disabled={attachCourses === null || attachBusy}
                    />
                  )}
                />
                <Button
                  variant="contained"
                  size="small"
                  disabled={!selectedCourse || attachBusy}
                  onClick={() => {
                    if (selectedCourse) onAttach(selectedCourse.id);
                  }}
                >
                  {attachBusy ? "Attaching…" : "Attach zip"}
                </Button>
              </div>
            )}
            <Button
              variant="outlined"
              size="small"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
          {attachNote && (
            <p style={{ margin: "8px 0 0 0", fontSize: "0.875rem", color: attachNote.kind === "error" ? "var(--danger)" : "var(--success)" }}>
              {attachNote.text}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
