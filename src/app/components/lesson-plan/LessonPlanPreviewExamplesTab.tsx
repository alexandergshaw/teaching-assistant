"use client";

import { Button, IconButton, TextField } from "@mui/material";
import type { ExamplesData } from "../../actions";
import styles from "../../page.module.css";
import type { LessonPlanPreviewIcons } from "./types";

type LessonPlanPreviewExamplesTabProps = {
  examplesPreview: ExamplesData | null;
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

export default function LessonPlanPreviewExamplesTab({
  examplesPreview,
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
}: LessonPlanPreviewExamplesTabProps) {
  const { CopyIcon, LockClosedIcon, LockOpenIcon, PencilIcon } = icons;

  return (
    <div className={styles.assignmentContent}>
      {examplesPreview && examplesPreview.examples.length > 0 ? (
        <ol className={styles.exampleList}>
          {examplesPreview.examples.map((example: typeof examplesPreview.examples[0], index: number) => {
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
                      onClick={() => onToggleLock(`example-${index}`)}
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
                          ? onCancelEdit()
                          : onStartEdit(
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
                        onChange={(event) => onFieldDraftChange(event.target.value)}
                        autoFocus
                      />
                      <div className={styles.fieldEditActions}>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => onSaveEdit(`example-content-${index}`)}
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
                          ? onCancelEdit()
                          : onStartEdit(
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
                        onChange={(event) => onFieldDraftChange(event.target.value)}
                        autoFocus
                      />
                      <div className={styles.fieldEditActions}>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => onSaveEdit(`example-explanation-${index}`)}
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
  );
}
