"use client";

import { Button, IconButton, TextField } from "@mui/material";
import type { GenerateLessonPlanResult } from "../../actions";
import styles from "../../page.module.css";
import type { LessonPlanPreviewIcons } from "./types";

type LessonPlanPreviewSlidesTabProps = {
  lessonPlanPreview: GenerateLessonPlanResult;
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

export default function LessonPlanPreviewSlidesTab({
  lessonPlanPreview,
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
}: LessonPlanPreviewSlidesTabProps) {
  const { CopyIcon, LockClosedIcon, LockOpenIcon, PencilIcon } = icons;

  return (
    <ol className={styles.lessonSlideList}>
      {lessonPlanPreview.slides.map((slide: typeof lessonPlanPreview.slides[0], index: number) => (
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
                onClick={() => onToggleLock(`slide-${index}`)}
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
                    ? onCancelEdit()
                    : onStartEdit(
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
                onChange={(event) => onFieldDraftChange(event.target.value)}
                placeholder="First line is the slide title; each additional line becomes a bullet point."
                autoFocus
              />
              <div className={styles.fieldEditActions}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => onSaveEdit(`slide-${index}`)}
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
              <p className={styles.lessonSlideTitle}>{slide.title}</p>
              {slide.bullets.length > 0 && (
                <ul className={styles.lessonSlideBullets}>
                  {slide.bullets.map((bullet: string, bulletIndex: number) => (
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
  );
}
