"use client";

import { Button, IconButton, TextField } from "@mui/material";
import styles from "../../page.module.css";
import { parseGeneratedRubric } from "../../utils/rubric";
import type { LessonPlanPreviewIcons } from "./types";

type LessonPlanPreviewRubricTabProps = {
  rubricPreview: string | null;
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

export default function LessonPlanPreviewRubricTab({
  rubricPreview,
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
}: LessonPlanPreviewRubricTabProps) {
  const { CopyIcon, LockClosedIcon, LockOpenIcon, PencilIcon } = icons;

  return (
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
                onClick={() => onToggleLock("rubric")}
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
                    ? onCancelEdit()
                    : onStartEdit("rubric", rubricPreview)
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
                onChange={(event) => onFieldDraftChange(event.target.value)}
                autoFocus
              />
              <div className={styles.fieldEditActions}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => onSaveEdit("rubric")}
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
                  {rows.map((row: typeof rows[0], index: number) => (
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
                            {row.subcategories.map((subcategory: typeof row.subcategories[0]) => (
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
  );
}
