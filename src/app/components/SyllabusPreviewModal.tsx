"use client";

import type { ChangeEvent, ComponentType } from "react";
import { useRef, useState } from "react";
import type { SyllabusSection } from "../actions";
import styles from "../page.module.css";

type SyllabusPreviewModalIcons = {
  CopyIcon: ComponentType;
  LockClosedIcon: ComponentType;
  LockOpenIcon: ComponentType;
  PencilIcon: ComponentType;
};

type SyllabusPreviewModalProps = {
  courseTitle: string;
  parsedSections: SyllabusSection[];
  sectionContents: string[];
  copiedKey: string | null;
  lockedSyllabusSections: boolean[];
  coursePlanningError: string | null;
  syllabusRevisionPrompt: string;
  revisionFileCount: number;
  isRevisingSyllabus: boolean;
  onClose: () => void;
  onCopy: (copyKey: string, value: string) => Promise<void>;
  onToggleLock: (i: number) => void;
  onSaveSection: (i: number, content: string) => void;
  onRevisionFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onRevisionPromptChange: (value: string) => void;
  onRevise: () => void;
  onRegenerateSection: (i: number, revisionPrompt: string) => Promise<void>;
  onDownload: () => void;
  icons: SyllabusPreviewModalIcons;
};

export default function SyllabusPreviewModal({
  courseTitle,
  parsedSections,
  sectionContents,
  copiedKey,
  lockedSyllabusSections,
  coursePlanningError,
  syllabusRevisionPrompt,
  revisionFileCount,
  isRevisingSyllabus,
  onClose,
  onCopy,
  onToggleLock,
  onSaveSection,
  onRevisionFileChange,
  onRevisionPromptChange,
  onRevise,
  onRegenerateSection,
  onDownload,
  icons: { CopyIcon, LockClosedIcon, LockOpenIcon, PencilIcon },
}: SyllabusPreviewModalProps) {
  const [editingSection, setEditingSection] = useState<number | null>(null);
  const [sectionDraft, setSectionDraft] = useState("");
  const [regeneratingSection, setRegeneratingSection] = useState<number | null>(null);
  const revisionFileRef = useRef<HTMLInputElement>(null);

  const handleRegenerateSection = async (i: number) => {
    setRegeneratingSection(i);
    try {
      await onRegenerateSection(i, syllabusRevisionPrompt);
    } finally {
      setRegeneratingSection(null);
    }
  };

  const startEdit = (i: number) => {
    setEditingSection(i);
    setSectionDraft(sectionContents[i] ?? "");
  };

  const cancelEdit = () => setEditingSection(null);

  const saveEdit = (i: number) => {
    onSaveSection(i, sectionDraft);
    setEditingSection(null);
  };

  return (
    <div className={styles.previewBackdrop} onClick={onClose}>
      <section
        className={styles.lessonPreviewModal}
        role="dialog"
        aria-modal="true"
        aria-label="Syllabus preview"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <div>
            <h3>{courseTitle}</h3>
            <p className={styles.previewMeta}>
              {sectionContents.filter(Boolean).length} of {parsedSections.length} sections compiled
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

        <div className={styles.assignmentContent}>
          {parsedSections.map((section, i) =>
            sectionContents[i] ? (
              <div key={i} className={styles.syllabusSectionCard}>
                <div className={styles.syllabusSectionTopRow}>
                  <p className={styles.syllabusSectionHeading}>{section.heading}</p>
                  <div className={styles.syllabusSectionActions}>
                    <button
                      type="button"
                      className={styles.syllabusSectionActionButton}
                      title={
                        copiedKey === `syllabus-section-${i}`
                          ? "Copied"
                          : "Copy section content"
                      }
                      aria-label={
                        copiedKey === `syllabus-section-${i}`
                          ? "Copied"
                          : `Copy ${section.heading} section`
                      }
                      onClick={() => onCopy(`syllabus-section-${i}`, sectionContents[i])}
                    >
                      <CopyIcon />
                    </button>
                    <button
                      type="button"
                      className={`${styles.syllabusSectionActionButton}${lockedSyllabusSections[i] ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                      title={lockedSyllabusSections[i] ? "Locked for revisions" : "Unlocked for revisions"}
                      aria-label={lockedSyllabusSections[i] ? `Unlock ${section.heading}` : `Lock ${section.heading}`}
                      onClick={() => onToggleLock(i)}
                    >
                      {lockedSyllabusSections[i] ? <LockClosedIcon /> : <LockOpenIcon />}
                    </button>
                    <button
                      type="button"
                      className={`${styles.syllabusSectionActionButton}${editingSection === i ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                      title={editingSection === i ? "Editing" : "Edit section"}
                      aria-label={editingSection === i ? `Stop editing ${section.heading}` : `Edit ${section.heading}`}
                      onClick={() => editingSection === i ? cancelEdit() : startEdit(i)}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      className={styles.syllabusSectionActionButton}
                      title={regeneratingSection === i ? "Regenerating…" : "Regenerate this section with revision instructions"}
                      aria-label={`Regenerate ${section.heading}`}
                      onClick={() => handleRegenerateSection(i)}
                      disabled={regeneratingSection !== null || lockedSyllabusSections[i]}
                    >
                      {regeneratingSection === i ? (
                        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" style={{ opacity: 0.5 }}>
                          <path fillRule="evenodd" d="M10 3a7 7 0 1 0 7 7h-1.5a5.5 5.5 0 1 1-1.6-3.9L12 8h4V4l-1.4 1.4A7 7 0 0 0 10 3Z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                          <path d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v8.5A2.25 2.25 0 0 1 15.75 15h-3.105a3.501 3.501 0 0 1 1.1 1.5h.255a.75.75 0 0 1 0 1.5H6a.75.75 0 0 1 0-1.5h.255A3.501 3.501 0 0 1 7.355 15H4.25A2.25 2.25 0 0 1 2 12.75v-8.5Zm1.5 0a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75v-7.5Z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                {editingSection === i ? (
                  <div className={styles.fieldEditWrap}>
                    <textarea
                      className={styles.fieldEditArea}
                      value={sectionDraft}
                      onChange={(e) => setSectionDraft(e.target.value)}
                      rows={Math.max(5, sectionDraft.split("\n").length + 2)}
                      autoFocus
                    />
                    <div className={styles.fieldEditActions}>
                      <button type="button" className={styles.fieldEditSaveBtn} onClick={() => saveEdit(i)}>Save</button>
                      <button type="button" className={styles.fieldEditCancelBtn} onClick={cancelEdit}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className={styles.syllabusSectionContent}>{sectionContents[i]}</p>
                )}
              </div>
            ) : null
          )}
        </div>

        {coursePlanningError && <p className={styles.error}>{coursePlanningError}</p>}

        <div className={styles.lessonRevisionRow}>
          <input
            ref={revisionFileRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={onRevisionFileChange}
          />
          <textarea
            className={styles.lessonRevisionArea}
            placeholder="Revision instructions — e.g. make the grading policy stricter, add a late work policy, shorten the course description…"
            value={syllabusRevisionPrompt}
            onChange={(e) => onRevisionPromptChange(e.target.value)}
            rows={2}
            disabled={isRevisingSyllabus}
          />
          <button
            type="button"
            className={styles.downloadButton}
            onClick={() => revisionFileRef.current?.click()}
            disabled={isRevisingSyllabus}
            title="Attach additional context files"
          >
            {revisionFileCount > 0 ? `Files (${revisionFileCount})` : "Attach"}
          </button>
          <button
            type="button"
            className={styles.submitButton}
            onClick={onRevise}
            disabled={isRevisingSyllabus || (!syllabusRevisionPrompt.trim() && revisionFileCount === 0)}
          >
            {isRevisingSyllabus ? "Revising…" : "Revise"}
          </button>
        </div>

        <div className={styles.lessonPreviewFooter}>
          <button type="button" className={styles.submitButton} onClick={onDownload}>
            Download Syllabus
          </button>
          <button type="button" className={styles.downloadButton} onClick={onClose}>
            Start Over
          </button>
        </div>
      </section>
    </div>
  );
}
