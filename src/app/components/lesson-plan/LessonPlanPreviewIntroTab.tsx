"use client";

import { Button, IconButton, TextField } from "@mui/material";
import type { ModuleIntroData } from "../../actions";
import styles from "../../page.module.css";
import type { LessonPlanPreviewIcons } from "./types";

type LessonPlanPreviewIntroTabProps = {
  introPreview: ModuleIntroData | null;
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

export default function LessonPlanPreviewIntroTab({
  introPreview,
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
}: LessonPlanPreviewIntroTabProps) {
  const { CopyIcon, LockClosedIcon, LockOpenIcon, PencilIcon } = icons;

  return (
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
                  onClick={() => onToggleLock("intro-overview")}
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
                      ? onCancelEdit()
                      : onStartEdit(
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
                  onChange={(event) => onFieldDraftChange(event.target.value)}
                  autoFocus
                />
                <div className={styles.fieldEditActions}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => onSaveEdit("intro-overview")}
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
                  onClick={() => onToggleLock("intro-keyTerms")}
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
                      ? onCancelEdit()
                      : onStartEdit(
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
                  onChange={(event) => onFieldDraftChange(event.target.value)}
                  autoFocus
                />
                <div className={styles.fieldEditActions}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => onSaveEdit("intro-keyTerms")}
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
  );
}
