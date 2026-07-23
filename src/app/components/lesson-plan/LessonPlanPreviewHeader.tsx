"use client";

import { Button, IconButton, TextField } from "@mui/material";
import type { GenerateLessonPlanResult } from "../../actions";
import styles from "../../page.module.css";
import type { LessonPlanPreviewIcons, PreviewTab } from "./types";

type LessonPlanPreviewHeaderProps = {
  lessonPlanPreview: GenerateLessonPlanResult;
  previewTab: PreviewTab;
  editingLessonField: string | null;
  lessonFieldDraft: string;
  onClose: () => void;
  onStartEdit: (key: string, value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (key: string) => void;
  onFieldDraftChange: (value: string) => void;
  icons: LessonPlanPreviewIcons;
};

export default function LessonPlanPreviewHeader({
  lessonPlanPreview,
  previewTab,
  editingLessonField,
  lessonFieldDraft,
  onClose,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onFieldDraftChange,
  icons,
}: LessonPlanPreviewHeaderProps) {
  const { PencilIcon } = icons;

  return (
    <div className={styles.previewHeader}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editingLessonField === "lesson-title" ? (
          <div className={styles.fieldEditWrap}>
            <TextField
              fullWidth
              size="small"
              value={lessonFieldDraft}
              onChange={(event) => onFieldDraftChange(event.target.value)}
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
                onClick={() => onSaveEdit("lesson-title")}
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
          <div className={styles.fieldLabelRow}>
            <h3 style={{ margin: 0 }}>{lessonPlanPreview.presentationTitle}</h3>
            <IconButton
              size="small"
              title="Edit title"
              aria-label="Edit presentation title"
              onClick={() =>
                onStartEdit(
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
                ? "Assignment"
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
  );
}
