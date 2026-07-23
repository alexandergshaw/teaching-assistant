"use client";

import { Button, IconButton, TextField } from "@mui/material";
import type { AssignmentData } from "../../actions";
import styles from "../../page.module.css";
import type { LessonPlanPreviewIcons } from "./types";

type LessonPlanPreviewAssignmentTabProps = {
  assignmentPreview: AssignmentData | null;
  copiedKey: string | null;
  editingLessonField: string | null;
  lessonFieldDraft: string;
  lockedLessonFields: Set<string>;
  onCopy: (key: string, value: string) => Promise<void>;
  onStartEdit: (key: string, value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (key: string) => void;
  onFieldDraftChange: (value: string) => void;
  onToggleLock: (key: string) => void;
  icons: LessonPlanPreviewIcons;
};

export default function LessonPlanPreviewAssignmentTab({
  assignmentPreview,
  copiedKey,
  editingLessonField,
  lessonFieldDraft,
  lockedLessonFields,
  onCopy,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onFieldDraftChange,
  onToggleLock,
  icons,
}: LessonPlanPreviewAssignmentTabProps) {
  const { CopyIcon, LockClosedIcon, LockOpenIcon, PencilIcon } = icons;

  return (
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
                    onToggleLock("assignment-overview")
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
                      ? onCancelEdit()
                      : onStartEdit(
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
                  onChange={(event) => onFieldDraftChange(event.target.value)}
                  autoFocus
                />
                <div className={styles.fieldEditActions}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() =>
                      onSaveEdit("assignment-overview")
                    }
                  >
                    Save
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={onCancelEdit}
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
              {assignmentPreview.steps.map((step: typeof assignmentPreview.steps[0], index: number) => (
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
                        onToggleLock(`assignment-step-${index}`)
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
                          ? onCancelEdit()
                          : onStartEdit(
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
                          onFieldDraftChange(event.target.value)
                        }
                        placeholder="First line is the step title; remaining lines become the description."
                        autoFocus
                      />
                      <div className={styles.fieldEditActions}>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() =>
                            onSaveEdit(`assignment-step-${index}`)
                          }
                        >
                          Save
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={onCancelEdit}
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
                  onClick={() => onToggleLock("assignment-tools")}
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
                      ? onCancelEdit()
                      : onStartEdit(
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
                  onChange={(event) => onFieldDraftChange(event.target.value)}
                  placeholder="One tool per line."
                  autoFocus
                />
                <div className={styles.fieldEditActions}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => onSaveEdit("assignment-tools")}
                  >
                    Save
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={onCancelEdit}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <ul className={styles.assignmentList}>
                {assignmentPreview.tools.map((tool: string, index: number) => (
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
                    onToggleLock("assignment-deliverables")
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
                      ? onCancelEdit()
                      : onStartEdit(
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
                  onChange={(event) => onFieldDraftChange(event.target.value)}
                  placeholder="One deliverable per line."
                  autoFocus
                />
                <div className={styles.fieldEditActions}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() =>
                      onSaveEdit("assignment-deliverables")
                    }
                  >
                    Save
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={onCancelEdit}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <ul className={styles.assignmentList}>
                {assignmentPreview.deliverables.map((deliverable: string, index: number) => (
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
  );
}
