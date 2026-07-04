"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  listCourseContentAction,
  updatePageAction,
  createPageAction,
  createModuleAction,
  updateModuleAction,
  deleteModuleAction,
  createModuleItemAction,
  updateModuleItemAction,
  deleteModuleItemAction,
  listAddableContentAction,
  setModuleDueDatesAction,
  requestFileUploadAction,
  listBulkItemsAction,
  bulkUpdateAction,
  bulkDeleteAction,
  listRubricsAction,
  bulkAssociateRubricAction,
  createRubricAction,
  getRubricAction,
  updateRubricAction,
  getGradableAction,
  updateGradableAction,
  createGradableAction,
  listQuizQuestionsAction,
  createQuizQuestionAction,
  updateQuizQuestionAction,
  deleteQuizQuestionAction,
  previewFileAction,
  revisePageWithAiAction,
  listCourseFilesAction,
  renameCourseFileAction,
  deleteCourseFileAction,
  createCourseCopyAction,
  getMigrationStateAction,
  selectCopyTypesAction,
  getSelectiveDataAction,
  submitSelectiveImportAction,
  listCoursesAction,
  generateDocumentTextAction,
  generateSlidesAction,
} from "../actions";
import { buildDocxFromPlainText } from "@/lib/docx";
import { buildSlidesPptx } from "@/lib/pptx";
import { resolveDocumentAuthor } from "@/lib/author";
import CoursePicker from "./CoursePicker";
import InstitutionSwitcher from "./InstitutionSwitcher";
import FilePreviewModal, { type PreviewFile } from "./FilePreviewModal";
import DocStructureEditor from "./DocStructureEditor";
import type {
  CanvasModule,
  CanvasModuleItem,
  CanvasPageSummary,
  CanvasAddableContent,
  NewModuleItem,
  BulkKind,
  CourseFile,
  CanvasRubric,
  GradableKind,
  QuizQuestionInput,
  QuizQuestionType,
  RubricCriterionInput,
  SelectiveNode,
} from "@/lib/canvas-modules";
import { COURSE_COPY_TYPES } from "@/lib/canvas-modules";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { useLlmProvider } from "@/lib/llm-provider";
import { useInstitutionSelection } from "@/lib/institutions";
import { useInstitutionCounts } from "./InstitutionCounts";
import styles from "../page.module.css";
import {
  CONTENT_URL_KEY,
  VIEW_KEY,
  HEADER_HEIGHT_KEY,
  MAX_INDENT,
  DATED_TYPES,
  POINTS_EDITABLE,
} from "./content-tab/constants";
import type { LoadState } from "./content-tab/types";
import {
  itemKey,
  rowBlankClick,
  slidesToText,
  textToSlides,
  formatBytes,
  findDuplicateGroups,
  fileKindLabel,
  formatDueDate,
  toLocalInput,
  base64ToBlobUrl,
  uploadFileToModule,
} from "./content-tab/utils";
import { ItemA11yBadge } from "./content-tab/ItemA11yBadge";
import { PublishToggle } from "./content-tab/PublishToggle";
import { AssignmentPreviewModal } from "./content-tab/AssignmentPreviewModal";
import { RenameModulesModal } from "./content-tab/RenameModulesModal";
import { PageEditorModal } from "./content-tab/PageEditorModal";
import { SchedulerModal } from "./content-tab/SchedulerModal";
import { BulkUploadModal } from "./content-tab/BulkUploadModal";
import { OfficeEditorModal } from "./content-tab/OfficeEditorModal";
import { PagesView } from "./content-tab/PagesView";







// ── Gradable editor (description + due date + points) ─────────────────────────

function GradableEditorModal({
  courseUrl,
  acronym,
  item,
  onClose,
  onSaved,
}: {
  courseUrl: string;
  acronym?: string;
  item: CanvasModuleItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const kind = item.type as GradableKind;
  const showPoints = kind === "Assignment" || kind === "Quiz";
  const isQuiz = kind === "Quiz";

  const [loading, setLoading] = useState(item.contentId != null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState("");
  const [due, setDue] = useState(toLocalInput(item.dueAt));
  const [points, setPoints] = useState(item.pointsPossible != null ? String(item.pointsPossible) : "");
  const [saving, setSaving] = useState(false);
  // Set when a quiz question is saved/deleted, so closing reloads the module list.
  const [questionsChanged, setQuestionsChanged] = useState(false);
  const [note, setNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  // Close, reloading the list first if quiz questions changed (the quiz's point
  // total may have moved). Used by the header Close button and the backdrop.
  const closeModal = () => {
    if (questionsChanged) onSaved();
    onClose();
  };
  const [targetKind, setTargetKind] = useState<GradableKind | "">("");
  const [confirmChange, setConfirmChange] = useState(false);
  const [changing, setChanging] = useState(false);

  const otherKinds = (["Assignment", "Quiz", "Discussion"] as GradableKind[]).filter((k) => k !== kind);

  // Load the item's title + description (await-first so no synchronous setState).
  useEffect(() => {
    if (item.contentId == null) return;
    let cancelled = false;
    (async () => {
      const result = await getGradableAction(courseUrl, kind, item.contentId as number, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
        setLoading(false);
        return;
      }
      setTitle(result.detail.title || item.title);
      setDescription(result.detail.description);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, kind, item.contentId, item.title, acronym]);

  const handleSave = async () => {
    if (item.contentId == null) return;
    if (!title.trim()) {
      setNote({ kind: "error", text: "Give it a title first." });
      return;
    }
    setSaving(true);
    setNote(null);
    const fields: { title?: string; description?: string; pointsPossible?: number } = {
      title: title.trim(),
      description,
    };
    if (showPoints && points.trim() !== "") {
      const p = Number(points);
      if (Number.isFinite(p)) fields.pointsPossible = p;
    }
    const saved = await updateGradableAction(courseUrl, kind, item.contentId, fields, acronym);
    if ("error" in saved) {
      setSaving(false);
      setNote({ kind: "error", text: saved.error });
      return;
    }
    const iso = due ? new Date(due).toISOString() : null;
    const dueRes = await setModuleDueDatesAction(
      courseUrl,
      [{ type: kind, contentId: item.contentId, dueAt: iso }],
      acronym
    );
    setSaving(false);
    if ("error" in dueRes) {
      setNote({ kind: "error", text: dueRes.error });
      return;
    }
    // Re-scan this item's accessibility so its badge updates immediately.
    if (item.contentId != null) {
      window.dispatchEvent(
        new CustomEvent("ta-content-saved", { detail: { type: kind.toLowerCase(), id: String(item.contentId) } })
      );
    }
    onSaved();
    onClose();
  };

  // Recreate this item as the target type (copying the current fields), drop the
  // new object into the same module slot, and delete the original.
  const handleChangeType = async () => {
    if (targetKind === "" || item.contentId == null) return;
    if (!confirmChange) {
      setConfirmChange(true);
      return;
    }
    setConfirmChange(false);
    setChanging(true);
    setNote(null);
    try {
      const pts = points.trim() !== "" && Number.isFinite(Number(points)) ? Number(points) : undefined;
      const iso = due ? new Date(due).toISOString() : null;
      const created = await createGradableAction(
        courseUrl,
        targetKind,
        { title: title.trim() || item.title, description, pointsPossible: pts, dueAt: iso },
        acronym
      );
      if ("error" in created) throw new Error(created.error);
      const added = await createModuleItemAction(
        courseUrl,
        item.moduleId,
        { type: targetKind, contentId: created.id, position: item.position, indent: item.indent },
        acronym
      );
      if ("error" in added) throw new Error(added.error);
      const removed = await bulkDeleteAction(courseUrl, kind as BulkKind, [String(item.contentId)], acronym);
      if ("error" in removed) throw new Error(removed.error);
      onSaved();
      onClose();
    } catch (err) {
      setChanging(false);
      setNote({ kind: "error", text: err instanceof Error ? err.message : "Could not change the type." });
    }
  };

  const busy = saving || changing;

  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={closeModal}>
      <div
        className={styles.previewModal}
        style={{ width: "min(560px, 94vw)", maxWidth: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <h3>Edit {kind.toLowerCase()}</h3>
          <button type="button" className={styles.previewCloseButton} onClick={closeModal}>
            Close
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {loading ? (
          <div className={styles.loadingState} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <div>
              <p className={styles.loadingTitle}>Loading…</p>
            </div>
          </div>
        ) : loadError ? (
          <p className={styles.error}>{loadError}</p>
        ) : (
          <>
            <div className={styles.field}>
              <label htmlFor="gradable-title">Title</label>
              <input
                id="gradable-title"
                type="text"
                className={styles.textInput}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div className={styles.field} style={{ flex: "1 1 220px" }}>
                <label htmlFor="gradable-due">Due date</label>
                <input
                  id="gradable-due"
                  type="datetime-local"
                  className={styles.textInput}
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
                {due && (
                  <button type="button" className={styles.clearFileButton} style={{ alignSelf: "flex-start", marginTop: 6 }} onClick={() => setDue("")}>
                    Clear due date
                  </button>
                )}
              </div>
              {showPoints && (
                <div className={styles.field} style={{ flex: "0 0 140px" }}>
                  <label htmlFor="gradable-points">Points</label>
                  <input
                    id="gradable-points"
                    type="number"
                    className={styles.textInput}
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="gradable-desc">Description (HTML allowed)</label>
              <textarea
                id="gradable-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                spellCheck={false}
                style={{ minHeight: isQuiz ? 120 : 200, width: "100%", fontFamily: "var(--font-mono, monospace)" }}
              />
            </div>

            {isQuiz && item.contentId != null && (
              <QuizQuestionsEditor
                courseUrl={courseUrl}
                acronym={acronym}
                quizId={item.contentId}
                onChanged={() => setQuestionsChanged(true)}
              />
            )}

            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className={styles.submitButton} onClick={handleSave} disabled={busy || !title.trim()}>
                {saving ? "Saving…" : "Save to Canvas"}
              </button>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                paddingTop: 12,
                marginTop: 4,
                borderTop: "1px solid var(--field-border)",
              }}
            >
              <span className={styles.fieldHint} style={{ margin: 0 }}>
                Change type to:
              </span>
              <select
                className={styles.textInput}
                style={{ maxWidth: 160 }}
                value={targetKind}
                disabled={busy}
                onChange={(e) => {
                  setTargetKind(e.target.value === "" ? "" : (e.target.value as GradableKind));
                  setConfirmChange(false);
                }}
                aria-label="Change type"
              >
                <option value="">Choose…</option>
                {otherKinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.clearFileButton}
                onClick={handleChangeType}
                disabled={busy || targetKind === ""}
                style={{ color: "#b91c1c", borderColor: "#fecaca" }}
              >
                {changing ? "Changing…" : confirmChange ? "Confirm: recreate & delete original" : "Change type"}
              </button>
            </div>
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              Recreates this as the new type with these fields and deletes the original. Submissions and
              grades do not carry over.
            </p>

            {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}
          </>
        )}
        </div>
      </div>
    </div>
  );
}

// ── Quiz questions editor ─────────────────────────────────────────────────────

const QUIZ_TYPE_LABELS: Record<QuizQuestionType, string> = {
  multiple_choice_question: "Multiple choice",
  true_false_question: "True / False",
  short_answer_question: "Fill in the blank",
  essay_question: "Essay",
};
const QUIZ_TYPES = Object.keys(QUIZ_TYPE_LABELS) as QuizQuestionType[];

type EditableQuestion = {
  key: string;
  id: number; // 0 until created in Canvas
  name: string;
  text: string;
  type: QuizQuestionType;
  points: number;
  answers: Array<{ text: string; correct: boolean }>;
};

let quizKeySeq = 0;
const nextQuizKey = () => `qq${++quizKeySeq}`;

function defaultQuizAnswers(type: QuizQuestionType): Array<{ text: string; correct: boolean }> {
  if (type === "true_false_question") return [{ text: "True", correct: true }, { text: "False", correct: false }];
  if (type === "multiple_choice_question") return [{ text: "", correct: true }, { text: "", correct: false }];
  if (type === "short_answer_question") return [{ text: "", correct: true }];
  return [];
}

// An editable draft question reduced to the shape Canvas accepts.
function quizQuestionToInput(q: EditableQuestion): QuizQuestionInput {
  return {
    name: q.name,
    text: q.text,
    type: q.type,
    points: Number.isFinite(q.points) ? q.points : 0,
    answers: q.answers,
  };
}

// A blank question to seed the editors with.
function newDraftQuestion(): EditableQuestion {
  return {
    key: nextQuizKey(),
    id: 0,
    name: "",
    text: "",
    type: "multiple_choice_question",
    points: 1,
    answers: defaultQuizAnswers("multiple_choice_question"),
  };
}

function QuizQuestionsEditor({
  courseUrl,
  acronym,
  quizId,
  onChanged,
}: {
  courseUrl: string;
  acronym?: string;
  quizId: number;
  onChanged: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listQuizQuestionsAction(courseUrl, quizId, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
        setLoading(false);
        return;
      }
      setQuestions(
        result.questions.map((q) => ({ key: nextQuizKey(), id: q.id, name: q.name, text: q.text, type: q.type, points: q.points, answers: q.answers }))
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, quizId, acronym]);

  const patch = (key: string, p: Partial<EditableQuestion>) =>
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...p } : q)));

  const changeType = (key: string, type: QuizQuestionType) =>
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.key !== key) return q;
        const keep = (type === "multiple_choice_question" || type === "short_answer_question") && q.answers.length > 0;
        return { ...q, type, answers: keep ? q.answers : defaultQuizAnswers(type) };
      })
    );

  // `single` enforces one correct answer (multiple choice / true-false).
  const setAnswer = (key: string, idx: number, p: Partial<{ text: string; correct: boolean }>, single: boolean) =>
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.key !== key) return q;
        const answers = q.answers.map((a, i) => {
          if (i === idx) return { ...a, ...p };
          if (single && p.correct === true) return { ...a, correct: false };
          return a;
        });
        return { ...q, answers };
      })
    );

  const addAnswer = (key: string) =>
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, answers: [...q.answers, { text: "", correct: false }] } : q)));
  const removeAnswer = (key: string, idx: number) =>
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, answers: q.answers.filter((_, i) => i !== idx) } : q)));

  const addQuestion = () => setQuestions((qs) => [...qs, newDraftQuestion()]);

  const toInput = quizQuestionToInput;

  const saveQuestion = async (q: EditableQuestion) => {
    setBusyKey(q.key);
    setNote(null);
    if (q.id === 0) {
      const result = await createQuizQuestionAction(courseUrl, quizId, toInput(q), acronym);
      setBusyKey(null);
      if ("error" in result) return setNote({ kind: "error", text: result.error });
      patch(q.key, { id: result.question.id });
    } else {
      const result = await updateQuizQuestionAction(courseUrl, quizId, q.id, toInput(q), acronym);
      setBusyKey(null);
      if ("error" in result) return setNote({ kind: "error", text: result.error });
    }
    onChanged();
    setNote({ kind: "success", text: "Question saved." });
  };

  const deleteQuestion = async (q: EditableQuestion) => {
    if (q.id === 0) {
      setQuestions((qs) => qs.filter((x) => x.key !== q.key));
      return;
    }
    setBusyKey(q.key);
    setNote(null);
    const result = await deleteQuizQuestionAction(courseUrl, quizId, q.id, acronym);
    setBusyKey(null);
    if ("error" in result) return setNote({ kind: "error", text: result.error });
    setQuestions((qs) => qs.filter((x) => x.key !== q.key));
    onChanged();
  };

  return (
    <div className={styles.field} style={{ gap: 8 }}>
      <label>Questions</label>
      {loading ? (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Loading questions…</p>
          </div>
        </div>
      ) : loadError ? (
        <p className={styles.error}>{loadError}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {questions.length === 0 && <p className={styles.fieldHint}>This quiz has no questions yet.</p>}
            {questions.map((q, qi) => {
              const single = q.type === "multiple_choice_question" || q.type === "true_false_question";
              const showAnswers = q.type !== "essay_question";
              const editableAnswers = q.type === "multiple_choice_question" || q.type === "short_answer_question";
              return (
                <div key={q.key} style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={styles.ccCount}>Q{qi + 1}</span>
                    <select
                      className={styles.bulkSelect}
                      value={q.type}
                      onChange={(e) => changeType(q.key, e.target.value as QuizQuestionType)}
                      aria-label="Question type"
                    >
                      {QUIZ_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {QUIZ_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    <span className={styles.bulkField}>
                      <input
                        type="number"
                        className={styles.bulkInput}
                        style={{ width: 64 }}
                        value={q.points}
                        onChange={(e) => patch(q.key, { points: Number(e.target.value) })}
                        aria-label="Points"
                      />
                      <span className={styles.ccCount}>pts</span>
                    </span>
                    <span style={{ flex: 1 }} />
                    <button type="button" className={styles.bulkBtnPrimary} disabled={busyKey === q.key} onClick={() => void saveQuestion(q)}>
                      {busyKey === q.key ? "Saving…" : q.id === 0 ? "Add" : "Save"}
                    </button>
                    <button type="button" className={`${styles.ccBtn} ${styles.ccBtnDanger}`} disabled={busyKey === q.key} onClick={() => void deleteQuestion(q)}>
                      Delete
                    </button>
                  </div>
                  <input
                    type="text"
                    className={styles.textInput}
                    placeholder="Question title (optional)"
                    value={q.name}
                    onChange={(e) => patch(q.key, { name: e.target.value })}
                  />
                  <textarea
                    value={q.text}
                    onChange={(e) => patch(q.key, { text: e.target.value })}
                    placeholder="Question text"
                    spellCheck
                    style={{ minHeight: 70, width: "100%" }}
                  />
                  {showAnswers && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span className={styles.ccCount}>{q.type === "short_answer_question" ? "Accepted answers" : "Answers"}</span>
                      {q.answers.map((a, ai) => (
                        <div key={ai} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {q.type !== "short_answer_question" && (
                            <input
                              type={single ? "radio" : "checkbox"}
                              name={`${q.key}-correct`}
                              checked={a.correct}
                              onChange={(e) => setAnswer(q.key, ai, { correct: e.target.checked }, single)}
                              aria-label="Correct answer"
                              title="Mark correct"
                            />
                          )}
                          <input
                            type="text"
                            className={styles.bulkInput}
                            style={{ flex: "1 1 220px", minWidth: 160 }}
                            value={a.text}
                            disabled={q.type === "true_false_question"}
                            placeholder={q.type === "short_answer_question" ? "An accepted answer" : "Answer choice"}
                            onChange={(e) => setAnswer(q.key, ai, { text: e.target.value }, single)}
                          />
                          {editableAnswers && q.answers.length > 1 && (
                            <button type="button" className={styles.ccIconBtn} title="Remove answer" aria-label="Remove answer" onClick={() => removeAnswer(q.key, ai)}>
                              &times;
                            </button>
                          )}
                        </div>
                      ))}
                      {editableAnswers && (
                        <button type="button" className={styles.ccBtn} style={{ alignSelf: "flex-start" }} onClick={() => addAnswer(q.key)}>
                          Add answer
                        </button>
                      )}
                    </div>
                  )}
                  {q.type === "essay_question" && (
                    <p className={styles.fieldHint} style={{ margin: 0 }}>
                      Students write a free-form response; there is no answer key.
                    </p>
                  )}
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className={styles.submitButton} onClick={addQuestion}>
                Add question
              </button>
              <span className={styles.fieldHint} style={{ margin: 0 }}>
                Each question saves to Canvas on its own. Question text is edited as plain text.
              </span>
            </div>
            {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}
        </div>
      )}
    </div>
  );
}

// ── Draft quiz questions (composed before the quiz exists) ────────────────────
// The same editing UI as QuizQuestionsEditor, but purely local: it edits an
// array of draft questions held by the parent and never talks to Canvas. Used to
// pre-compose the questions that "Add to each" writes into every new quiz.

function DraftQuizQuestions({
  questions,
  setQuestions,
}: {
  questions: EditableQuestion[];
  setQuestions: React.Dispatch<React.SetStateAction<EditableQuestion[]>>;
}) {
  const patch = (key: string, p: Partial<EditableQuestion>) =>
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...p } : q)));

  const changeType = (key: string, type: QuizQuestionType) =>
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.key !== key) return q;
        const keep = (type === "multiple_choice_question" || type === "short_answer_question") && q.answers.length > 0;
        return { ...q, type, answers: keep ? q.answers : defaultQuizAnswers(type) };
      })
    );

  const setAnswer = (key: string, idx: number, p: Partial<{ text: string; correct: boolean }>, single: boolean) =>
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.key !== key) return q;
        const answers = q.answers.map((a, i) => {
          if (i === idx) return { ...a, ...p };
          if (single && p.correct === true) return { ...a, correct: false };
          return a;
        });
        return { ...q, answers };
      })
    );

  const addAnswer = (key: string) =>
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, answers: [...q.answers, { text: "", correct: false }] } : q)));
  const removeAnswer = (key: string, idx: number) =>
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, answers: q.answers.filter((_, i) => i !== idx) } : q)));

  const addQuestion = () => setQuestions((qs) => [...qs, newDraftQuestion()]);
  const removeQuestion = (key: string) => setQuestions((qs) => qs.filter((q) => q.key !== key));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {questions.length === 0 && <p className={styles.fieldHint}>No questions yet. Add one below.</p>}
      {questions.map((q, qi) => {
        const single = q.type === "multiple_choice_question" || q.type === "true_false_question";
        const showAnswers = q.type !== "essay_question";
        const editableAnswers = q.type === "multiple_choice_question" || q.type === "short_answer_question";
        return (
          <div key={q.key} style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className={styles.ccCount}>Q{qi + 1}</span>
              <select
                className={styles.bulkSelect}
                value={q.type}
                onChange={(e) => changeType(q.key, e.target.value as QuizQuestionType)}
                aria-label="Question type"
              >
                {QUIZ_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {QUIZ_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <span className={styles.bulkField}>
                <input
                  type="number"
                  className={styles.bulkInput}
                  style={{ width: 64 }}
                  value={q.points}
                  onChange={(e) => patch(q.key, { points: Number(e.target.value) })}
                  aria-label="Points"
                />
                <span className={styles.ccCount}>pts</span>
              </span>
              <span style={{ flex: 1 }} />
              <button type="button" className={`${styles.ccBtn} ${styles.ccBtnDanger}`} onClick={() => removeQuestion(q.key)}>
                Delete
              </button>
            </div>
            <input
              type="text"
              className={styles.textInput}
              placeholder="Question title (optional)"
              value={q.name}
              onChange={(e) => patch(q.key, { name: e.target.value })}
            />
            <textarea
              value={q.text}
              onChange={(e) => patch(q.key, { text: e.target.value })}
              placeholder="Question text"
              spellCheck
              style={{ minHeight: 70, width: "100%" }}
            />
            {showAnswers && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className={styles.ccCount}>{q.type === "short_answer_question" ? "Accepted answers" : "Answers"}</span>
                {q.answers.map((a, ai) => (
                  <div key={ai} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {q.type !== "short_answer_question" && (
                      <input
                        type={single ? "radio" : "checkbox"}
                        name={`${q.key}-correct`}
                        checked={a.correct}
                        onChange={(e) => setAnswer(q.key, ai, { correct: e.target.checked }, single)}
                        aria-label="Correct answer"
                        title="Mark correct"
                      />
                    )}
                    <input
                      type="text"
                      className={styles.bulkInput}
                      style={{ flex: "1 1 220px", minWidth: 160 }}
                      value={a.text}
                      disabled={q.type === "true_false_question"}
                      placeholder={q.type === "short_answer_question" ? "An accepted answer" : "Answer choice"}
                      onChange={(e) => setAnswer(q.key, ai, { text: e.target.value }, single)}
                    />
                    {editableAnswers && q.answers.length > 1 && (
                      <button type="button" className={styles.ccIconBtn} title="Remove answer" aria-label="Remove answer" onClick={() => removeAnswer(q.key, ai)}>
                        &times;
                      </button>
                    )}
                  </div>
                ))}
                {editableAnswers && (
                  <button type="button" className={styles.ccBtn} style={{ alignSelf: "flex-start" }} onClick={() => addAnswer(q.key)}>
                    Add answer
                  </button>
                )}
              </div>
            )}
            {q.type === "essay_question" && (
              <p className={styles.fieldHint} style={{ margin: 0 }}>
                Students write a free-form response; there is no answer key.
              </p>
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className={styles.submitButton} onClick={addQuestion}>
          Add question
        </button>
        <span className={styles.fieldHint} style={{ margin: 0 }}>
          Question text is plain text.
        </span>
      </div>
    </div>
  );
}

// Modal that hosts the draft question editor for "Add to each".
function BulkQuestionsModal({
  questions,
  setQuestions,
  onClose,
}: {
  questions: EditableQuestion[];
  setQuestions: React.Dispatch<React.SetStateAction<EditableQuestion[]>>;
  onClose: () => void;
}) {
  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={styles.previewModal}
        style={{ width: "min(760px, 95vw)", maxWidth: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <h3>Questions for new quizzes</h3>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Done
          </button>
        </div>
        <p className={styles.fieldHint} style={{ marginTop: 0 }}>
          These questions are written into every quiz created by &quot;Add to each&quot;. They are not saved
          until you run Add.
        </p>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <DraftQuizQuestions questions={questions} setQuestions={setQuestions} />
        </div>
      </div>
    </div>
  );
}

// ── Rubric builder ────────────────────────────────────────────────────────────

type EditRating = { key: string; description: string; longDescription: string; points: number };
type EditCriterion = { key: string; description: string; points: number; ratings: EditRating[] };

let rubricKeySeq = 0;
const nextRubricKey = () => `rb${++rubricKeySeq}`;

function defaultCriterion(mode: "percent" | "points"): EditCriterion {
  if (mode === "percent") {
    // Five tiers at 100/75/50/25/0% of the criterion's percentage weight.
    const base = 20;
    return {
      key: nextRubricKey(),
      description: "",
      points: base,
      ratings: [100, 75, 50, 25, 0].map((pct) => ({
        key: nextRubricKey(),
        description: `${pct}%`,
        longDescription: "",
        points: Math.round((base * pct) / 100),
      })),
    };
  }
  return {
    key: nextRubricKey(),
    description: "",
    points: 5,
    ratings: [
      { key: nextRubricKey(), description: "Full marks", longDescription: "", points: 5 },
      { key: nextRubricKey(), description: "Partial", longDescription: "", points: 3 },
      { key: nextRubricKey(), description: "No marks", longDescription: "", points: 0 },
    ],
  };
}

function RubricBuilderModal({
  courseUrl,
  acronym,
  assignments,
  rubricId,
  onClose,
  onCreated,
}: {
  courseUrl: string;
  acronym?: string;
  assignments: Array<{ id: string; title: string; points: number | null }>;
  rubricId?: number;
  onClose: () => void;
  onCreated: (title: string, associated: number) => void;
}) {
  const editing = rubricId != null;
  const [title, setTitle] = useState("");
  // Percentage mode (default for new rubrics): criteria sum to 100% and are
  // scaled to each assignment's point total on apply. Editing loads raw points.
  const [mode, setMode] = useState<"percent" | "points">(editing ? "points" : "percent");
  const [criteria, setCriteria] = useState<EditCriterion[]>(() => (editing ? [] : [defaultCriterion(mode)]));
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const unit = mode === "percent" ? "%" : "pts";

  useEffect(() => {
    if (!editing || rubricId == null) return;
    let cancelled = false;
    (async () => {
      const result = await getRubricAction(courseUrl, rubricId, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        setLoading(false);
        return;
      }
      setTitle(result.rubric.title);
      setCriteria(
        result.rubric.criteria.map((c) => ({
          key: nextRubricKey(),
          description: c.description,
          points: c.points,
          ratings: c.ratings.map((r) => ({
            key: nextRubricKey(),
            description: r.description,
            longDescription: r.longDescription ?? "",
            points: r.points,
          })),
        }))
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, rubricId, courseUrl, acronym]);

  const patchCrit = (key: string, p: Partial<EditCriterion>) =>
    setCriteria((cs) => cs.map((c) => (c.key === key ? { ...c, ...p } : c)));
  const patchRating = (ck: string, rk: string, p: Partial<EditRating>) =>
    setCriteria((cs) => cs.map((c) => (c.key !== ck ? c : { ...c, ratings: c.ratings.map((r) => (r.key === rk ? { ...r, ...p } : r)) })));
  const addCriterion = () => setCriteria((cs) => [...cs, defaultCriterion(mode)]);
  const removeCriterion = (key: string) => setCriteria((cs) => (cs.length > 1 ? cs.filter((c) => c.key !== key) : cs));
  const addRating = (ck: string) =>
    setCriteria((cs) => cs.map((c) => (c.key === ck ? { ...c, ratings: [...c.ratings, { key: nextRubricKey(), description: "", longDescription: "", points: 0 }] } : c)));
  const removeRating = (ck: string, rk: string) =>
    setCriteria((cs) => cs.map((c) => (c.key !== ck ? c : { ...c, ratings: c.ratings.length > 1 ? c.ratings.filter((r) => r.key !== rk) : c.ratings })));

  // Rescale a criterion's rating tiers so its top tier equals `newPts` (others
  // scale proportionally; if all tiers are 0, the first tier takes the value).
  const scaleTiers = (c: EditCriterion, newPts: number): EditCriterion => {
    const oldMax = c.ratings.reduce((m, r) => Math.max(m, Number.isFinite(r.points) ? r.points : 0), 0);
    const ratings =
      oldMax > 0
        ? c.ratings.map((r) => ({ ...r, points: Math.round(((Number.isFinite(r.points) ? r.points : 0) * newPts) / oldMax) }))
        : c.ratings.map((r, i) => ({ ...r, points: i === 0 ? newPts : 0 }));
    return { ...c, points: newPts, ratings };
  };

  // Percentage mode: after a criterion's % is edited, scale its tiers to that %
  // and rebalance the other criteria proportionally so the rubric stays at 100%.
  const rebalanceCriterion = (key: string) =>
    setCriteria((cs) => {
      const target = cs.find((c) => c.key === key);
      if (!target) return cs;
      const clamped = Math.max(0, Math.min(100, Number.isFinite(target.points) ? target.points : 0));
      const others = cs.filter((c) => c.key !== key);
      const othersSum = others.reduce((s, c) => s + (Number.isFinite(c.points) ? c.points : 0), 0);
      const remaining = 100 - clamped;
      return cs.map((c) => {
        if (c.key === key) return scaleTiers(c, clamped);
        if (others.length === 0) return c;
        const share =
          othersSum > 0
            ? Math.round(((Number.isFinite(c.points) ? c.points : 0) * remaining) / othersSum)
            : Math.round(remaining / others.length);
        return scaleTiers(c, Math.max(0, share));
      });
    });

  const total = criteria.reduce((s, c) => s + (Number.isFinite(c.points) ? c.points : 0), 0);

  // Build criteria with the given numbers as points (rounded). `scale` converts a
  // percentage value to points for a specific assignment.
  const buildCriteria = (scale: (v: number) => number): RubricCriterionInput[] =>
    criteria.map((c) => ({
      description: c.description.trim() || "Criterion",
      points: scale(Number.isFinite(c.points) ? c.points : 0),
      ratings: c.ratings.map((r) => ({
        description: r.description.trim() || `${r.points}${unit}`,
        longDescription: r.longDescription.trim() || undefined,
        points: scale(Number.isFinite(r.points) ? r.points : 0),
      })),
    }));

  const handleCreate = async () => {
    if (!title.trim()) {
      setNote({ kind: "error", text: "Give the rubric a title." });
      return;
    }
    setSaving(true);
    setNote(null);

    // Editing: update the rubric's criteria/tiers in place (points as entered).
    if (editing && rubricId != null) {
      const result = await updateRubricAction(courseUrl, rubricId, { title: title.trim(), criteria: buildCriteria((v) => v) }, acronym);
      setSaving(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      onCreated(title.trim(), 0);
      return;
    }

    // Percentage mode with assignments: a per-assignment rubric scaled to that
    // assignment's point total, so different totals each get a correct rubric.
    if (mode === "percent" && assignments.length > 0) {
      let associated = 0;
      const failed: string[] = [];
      for (const a of assignments) {
        const total = a.points != null && a.points > 0 ? a.points : 100;
        const scaled = buildCriteria((pct) => Math.round((pct / 100) * total));
        const result = await createRubricAction(
          courseUrl,
          { title: title.trim(), criteria: scaled, associateAssignmentId: Number(a.id), useForGrading: true },
          acronym
        );
        if ("error" in result) failed.push(a.title);
        else associated += 1;
      }
      setSaving(false);
      if (associated === 0) {
        setNote({ kind: "error", text: `Could not create the rubric${failed.length ? `: ${failed[0]}` : "."}` });
        return;
      }
      onCreated(title.trim(), associated);
      return;
    }

    // Point mode, or percentage mode with no assignments: one rubric using the
    // entered numbers as points (percentages become an out-of-100 rubric).
    const result = await createRubricAction(courseUrl, { title: title.trim(), criteria: buildCriteria((v) => v) }, acronym);
    if ("error" in result) {
      setSaving(false);
      setNote({ kind: "error", text: result.error });
      return;
    }
    let associated = 0;
    if (assignments.length > 0) {
      const assoc = await bulkAssociateRubricAction(courseUrl, result.rubric.id, assignments.map((a) => a.id), acronym);
      if ("error" in assoc) {
        setSaving(false);
        setNote({ kind: "error", text: `Rubric created, but could not associate it: ${assoc.error}` });
        return;
      }
      associated = assoc.updated;
    }
    setSaving(false);
    onCreated(result.rubric.title, associated);
  };

  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.previewModal} style={{ width: "min(760px, 95vw)", maxWidth: "none" }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.previewHeader}>
          <h3>{editing ? "Edit rubric" : "New rubric"}</h3>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "68vh", overflowY: "auto" }}>
          <div className={styles.field}>
            <label htmlFor="rubric-title">Title</label>
            <input id="rubric-title" type="text" className={styles.textInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Essay rubric" />
          </div>

          {loading && <p className={styles.fieldHint} style={{ margin: 0 }}>Loading rubric…</p>}

          {!editing && (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className={styles.bulkLabel} style={{ flex: "0 0 auto" }}>Mode</span>
                <button type="button" className={mode === "percent" ? styles.bulkBtnPrimary : styles.bulkBtn} onClick={() => setMode("percent")}>
                  Percentage
                </button>
                <button type="button" className={mode === "points" ? styles.bulkBtnPrimary : styles.bulkBtn} onClick={() => setMode("points")}>
                  Points
                </button>
              </div>

              <p className={styles.fieldHint} style={{ margin: 0 }}>
                {assignments.length > 0
                  ? mode === "percent"
                    ? `Criteria are percentages; on apply they are scaled to each of the ${assignments.length} selected assignment${assignments.length === 1 ? "'s" : "s'"} point total (one scaled rubric per assignment, so different totals are handled).`
                    : `Will be associated with ${assignments.length} selected assignment${assignments.length === 1 ? "" : "s"} and used for grading.`
                  : mode === "percent"
                    ? "No assignments selected — a single out-of-100 rubric will be created to associate later."
                    : "No assignments selected — the rubric will be created and available to associate later."}
              </p>
            </>
          )}

          {criteria.map((c, ci) => (
            <div key={c.key} style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className={styles.ccCount}>Criterion {ci + 1}</span>
                <span style={{ flex: 1 }} />
                <span className={styles.bulkField}>
                  <input
                    type="number"
                    className={styles.bulkInput}
                    style={{ width: 72 }}
                    value={c.points}
                    onChange={(e) => patchCrit(c.key, { points: Number(e.target.value) })}
                    onBlur={() => {
                      if (mode === "percent") rebalanceCriterion(c.key);
                    }}
                    aria-label={`Criterion ${ci + 1} ${mode === "percent" ? "percent" : "points"}`}
                  />
                  <span className={styles.ccCount}>{unit}</span>
                </span>
                {criteria.length > 1 && (
                  <button type="button" className={`${styles.ccBtn} ${styles.ccBtnDanger}`} onClick={() => removeCriterion(c.key)}>
                    Remove
                  </button>
                )}
              </div>
              <input
                type="text"
                className={styles.textInput}
                placeholder="What this criterion measures"
                value={c.description}
                onChange={(e) => patchCrit(c.key, { description: e.target.value })}
              />
              <span className={styles.ccCount}>Rating tiers</span>
              {c.ratings.map((r) => (
                <div key={r.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      className={styles.bulkInput}
                      style={{ flex: "1 1 200px", minWidth: 150 }}
                      placeholder="Tier label (e.g. Excellent)"
                      value={r.description}
                      onChange={(e) => patchRating(c.key, r.key, { description: e.target.value })}
                    />
                    <span className={styles.bulkField}>
                      <input
                        type="number"
                        className={styles.bulkInput}
                        style={{ width: 70 }}
                        value={r.points}
                        onChange={(e) => patchRating(c.key, r.key, { points: Number(e.target.value) })}
                        aria-label="Tier value"
                      />
                      <span className={styles.ccCount}>{unit}</span>
                    </span>
                    {c.ratings.length > 1 && (
                      <button type="button" className={styles.ccIconBtn} title="Remove tier" aria-label="Remove tier" onClick={() => removeRating(c.key, r.key)}>
                        &times;
                      </button>
                    )}
                  </div>
                  <textarea
                    className={styles.bulkInput}
                    style={{ width: "100%", minHeight: 40, resize: "vertical", padding: "6px 10px" }}
                    placeholder="Tier description (optional — the detail shown to students for this level)"
                    value={r.longDescription}
                    onChange={(e) => patchRating(c.key, r.key, { longDescription: e.target.value })}
                    aria-label="Tier description"
                  />
                </div>
              ))}
              <button type="button" className={styles.ccBtn} style={{ alignSelf: "flex-start" }} onClick={() => addRating(c.key)}>
                Add tier
              </button>
            </div>
          ))}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className={styles.ccBtn} onClick={addCriterion}>
              Add criterion
            </button>
            <span className={styles.fieldHint} style={{ margin: 0 }}>
              Overall rubric: {total}{unit}{mode === "percent" ? " (aim for 100%)" : " (sum of criteria)"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--card-border)" }}>
            <button type="button" className={styles.submitButton} onClick={() => void handleCreate()} disabled={saving || loading || !title.trim()}>
              {saving
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : assignments.length > 0
                    ? "Create & associate"
                    : "Create rubric"}
            </button>
          </div>
          {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}
        </div>
      </div>
    </div>
  );
}



// ── Module tree ────────────────────────────────────────────────────────────---

function ModulesView({
  courseUrl,
  acronym,
  modules,
  pages,
  targets,
  targetsState,
  ensureTargets,
  busy,
  expanded,
  onToggleExpand,
  onEditPage,
  setModules,
  reload,
  setNote,
  setBusy,
  courseName,
  onExport,
  onImport,
  refreshing,
  canCopy,
}: {
  courseUrl: string;
  acronym?: string;
  modules: CanvasModule[];
  pages: CanvasPageSummary[];
  targets: CanvasAddableContent | null;
  targetsState: "idle" | "loading" | "error";
  ensureTargets: () => void;
  busy: boolean;
  expanded: Set<number>;
  onToggleExpand: (id: number) => void;
  onEditPage: (pageUrl: string) => void;
  setModules: React.Dispatch<React.SetStateAction<CanvasModule[]>>;
  reload: () => void;
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void;
  setBusy: (b: boolean) => void;
  /** Course title + copy/import/refresh controls hosted in the sticky header. */
  courseName?: string;
  onExport: () => void;
  onImport: () => void;
  refreshing: boolean;
  canCopy: boolean;
}) {
  const [provider] = useLlmProvider();
  // Resizable sticky header: null = natural height; a number caps the body's
  // height (it scrolls) so the module list below gets more room. Persisted.
  const headerBodyRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const n = Number(localStorage.getItem(HEADER_HEIGHT_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (headerHeight == null) localStorage.removeItem(HEADER_HEIGHT_KEY);
    else localStorage.setItem(HEADER_HEIGHT_KEY, String(Math.round(headerHeight)));
  }, [headerHeight]);
  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const body = headerBodyRef.current;
    if (!body) return;
    const top = body.getBoundingClientRect().top;
    const onMove = (ev: PointerEvent) => {
      const maxH = Math.max(120, window.innerHeight - top - 120);
      setHeaderHeight(Math.min(maxH, Math.max(48, ev.clientY - top)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const [newModuleName, setNewModuleName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Filter modules by name or by a contained item's title.
  const [moduleSearch, setModuleSearch] = useState("");
  const moduleSearchLc = moduleSearch.trim().toLowerCase();
  const moduleMatches = (m: CanvasModule) =>
    !moduleSearchLc ||
    m.name.toLowerCase().includes(moduleSearchLc) ||
    m.items.some((it) => it.title.toLowerCase().includes(moduleSearchLc));
  // The modules currently shown (after the search filter). Select-all and
  // select-by-type act on these so a filtered list only selects what's visible.
  const visibleModules = modules.filter(moduleMatches);
  // Whether an item row is currently shown: no search, or the module name matched
  // (whole module shown), or the item's own title matched. Select-all and
  // select-by-type use this so they only ever touch rows on screen.
  const itemVisible = (m: CanvasModule, it: CanvasModuleItem): boolean =>
    !moduleSearchLc ||
    m.name.toLowerCase().includes(moduleSearchLc) ||
    it.title.toLowerCase().includes(moduleSearchLc);
  // The course's base URL (".../courses/123"), used to build "Open on Canvas" links.
  const courseBase = courseUrl.replace(/(\/courses\/\d+).*$/, "$1");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [uploads, setUploads] = useState<
    Record<number, Array<{ name: string; status: "uploading" | "done" | "error"; error?: string }>>
  >({});
  // Per-module "add item" controls: chosen type, the selected content (page slug
  // or content id), and the external-url / header-text inputs.
  const [addType, setAddType] = useState<Record<number, string>>({});
  const [addValue, setAddValue] = useState<Record<number, string>>({});
  const [addUrl, setAddUrl] = useState<Record<number, string>>({});
  const [addTitle, setAddTitle] = useState<Record<number, string>>({});
  // Per-module "File" creation: docx/pptx format, AI prompt, generated content.
  const [addFileFormat, setAddFileFormat] = useState<Record<number, "docx" | "pptx">>({});
  const [addFileContent, setAddFileContent] = useState<Record<number, string>>({});
  const [addAiPrompt, setAddAiPrompt] = useState<Record<number, string>>({});
  const [addAiBusy, setAddAiBusy] = useState<Record<number, boolean>>({});

  // ── Bulk selection across the module tree ──────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedModules, setSelectedModules] = useState<Set<number>>(new Set());
  const [rubrics, setRubrics] = useState<CanvasRubric[]>([]);
  const [opBusy, setOpBusy] = useState(false);
  const [bulkDue, setBulkDue] = useState("");
  const [bulkShift, setBulkShift] = useState(7);
  // Staggered due dates: the earliest selected module gets the base date above,
  // and each later module's items are pushed out by this interval per step.
  const [bulkStaggerOffset, setBulkStaggerOffset] = useState(1);
  const [bulkStaggerUnit, setBulkStaggerUnit] = useState<"weeks" | "days">("weeks");
  // How many modules a "Shift up/down" moves the selected items by.
  const [bulkModuleShift, setBulkModuleShift] = useState(1);
  // The module selected items are moved into by the "Move to module" control.
  const [bulkTargetModule, setBulkTargetModule] = useState<number | "">("");
  // "Add to selected modules": the content type to create in each module, and
  // the naming pattern (supports {module} and {n}) used to title each new item.
  const [bulkAddType, setBulkAddType] = useState("Assignment");
  const [bulkAddPattern, setBulkAddPattern] = useState("");
  // Optional details applied to each item created by "Add to each": a first due
  // date (staggered per module by the interval below), points, and a rubric.
  const [bulkAddDue, setBulkAddDue] = useState("");
  const [bulkAddStaggerOffset, setBulkAddStaggerOffset] = useState(1);
  const [bulkAddStaggerUnit, setBulkAddStaggerUnit] = useState<"weeks" | "days">("weeks");
  const [bulkAddPoints, setBulkAddPoints] = useState("");
  const [bulkAddRubricId, setBulkAddRubricId] = useState<number | "">("");
  // Description / page body and (for quizzes) the questions written into each
  // item that "Add to each" creates. Questions are composed in a modal.
  const [bulkAddDescription, setBulkAddDescription] = useState("");
  const [bulkAddQuestions, setBulkAddQuestions] = useState<EditableQuestion[]>([]);
  const [bulkQuestionsOpen, setBulkQuestionsOpen] = useState(false);
  // For the "File" type: an existing course file to add to each module, or AI-
  // generated content built into a new file (docx or pptx) per module.
  const [bulkAddFileId, setBulkAddFileId] = useState<number | "">("");
  const [bulkAddFileContent, setBulkAddFileContent] = useState("");
  const [bulkAddFileFormat, setBulkAddFileFormat] = useState<"docx" | "pptx">("docx");
  // AI prompt + busy flag for generating the item's content (description/body/file).
  const [bulkAiPrompt, setBulkAiPrompt] = useState("");
  const [bulkAiBusy, setBulkAiBusy] = useState(false);
  // Editing the description / quiz questions of the items already selected.
  const [bulkItemsDescription, setBulkItemsDescription] = useState("");
  const [bulkItemsQuestions, setBulkItemsQuestions] = useState<EditableQuestion[]>([]);
  const [bulkItemsQuestionsOpen, setBulkItemsQuestionsOpen] = useState(false);
  // Whether the selected gradables share a description (loaded into the field).
  const [descSharedState, setDescSharedState] = useState<"idle" | "loading" | "same" | "mixed">("idle");
  const [bulkPoints, setBulkPoints] = useState("");
  const [bulkRubricId, setBulkRubricId] = useState<number | "">("");
  // Top-toolbar rubric picker for editing a rubric without selecting items.
  const [editRubricId, setEditRubricId] = useState<number | "">("");
  const [confirmDeleteContent, setConfirmDeleteContent] = useState(false);
  const [confirmDeleteModules, setConfirmDeleteModules] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CanvasModuleItem | null>(null);
  const [filePreview, setFilePreview] = useState<{ file: PreviewFile; blobUrl: string | null } | null>(null);
  const [editingFile, setEditingFile] = useState<CanvasModuleItem | null>(null);
  // The rubric builder's target assignments (null when closed).
  const [rubricBuilder, setRubricBuilder] = useState<{
    assignments: Array<{ id: string; title: string; points: number | null }>;
    editRubricId?: number;
  } | null>(null);
  const [drag, setDrag] = useState<{ moduleId: number; itemId: number } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<number | null>(null);
  const [dragOverModule, setDragOverModule] = useState<number | null>(null);
  // Dragging a whole module to reorder it: the grabbed module's id, and the
  // module card currently hovered as a drop target. Kept separate from the item
  // drag state above so an item drag and a module drag never trip each other.
  const [moduleDrag, setModuleDrag] = useState<number | null>(null);
  const [dragOverModuleRow, setDragOverModuleRow] = useState<number | null>(null);
  // The item whose due date is being edited inline, plus its datetime-local draft.
  const [dueEdit, setDueEdit] = useState<{ id: number; value: string } | null>(null);
  // The item whose points are being edited inline, plus its draft value.
  const [pointsEdit, setPointsEdit] = useState<{ id: number; value: string } | null>(null);
  // The assignment being previewed in a read-only modal.
  const [previewAssignment, setPreviewAssignment] = useState<CanvasModuleItem | null>(null);
  // The item whose type is being changed inline (via its type chip).
  const [typeEdit, setTypeEdit] = useState<number | null>(null);

  // FLIP animation for reorders: remember each item row's DOM node and its
  // position just before a move, then slide every moved row from its old spot to
  // its new one. Web Animations API is used (not inline styles) so it never
  // fights React's own style updates mid-animation.
  const itemNodes = useRef(new Map<number, HTMLElement | null>());
  const flipPrev = useRef<Map<number, DOMRect> | null>(null);
  // Same FLIP machinery for whole-module cards, keyed by module id.
  const moduleNodes = useRef(new Map<number, HTMLElement | null>());
  const flipPrevModules = useRef<Map<number, DOMRect> | null>(null);
  const [flipTick, setFlipTick] = useState(0);

  useLayoutEffect(() => {
    // Slide moved DOM nodes from their pre-move position to their new one. Run
    // for items and modules independently: a reorder bumps flipTick and stashes
    // a rect map for whichever kind moved.
    const animate = (
      pending: React.MutableRefObject<Map<number, DOMRect> | null>,
      nodes: React.MutableRefObject<Map<number, HTMLElement | null>>
    ) => {
      const prev = pending.current;
      if (!prev) return;
      pending.current = null;
      nodes.current.forEach((el, id) => {
        if (!el) return;
        const before = prev.get(id);
        if (!before) return;
        const after = el.getBoundingClientRect();
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }],
          { duration: 230, easing: "cubic-bezier(0.2, 0, 0, 1)" }
        );
      });
    };
    animate(flipPrev, itemNodes);
    animate(flipPrevModules, moduleNodes);
  }, [flipTick]);

  // Whether an item is part of the current drag (the grabbed item, plus the rest
  // of the selection when the grabbed item is itself selected).
  const dragSelected = drag ? selected.has(itemKey(drag.moduleId, drag.itemId)) : false;
  const isDraggingItem = (moduleId: number, itemId: number) => {
    if (!drag) return false;
    if (drag.moduleId === moduleId && drag.itemId === itemId) return true;
    return dragSelected && selected.size > 1 && selected.has(itemKey(moduleId, itemId));
  };

  // Move the dragged item(s) before `beforeItemId` (or to the end when null) in
  // the target module: reorder locally for instant feedback, then persist to
  // Canvas. Dragging a selected item moves the whole selection as one block.
  const performMove = (targetModuleId: number, beforeItemId: number | null) => {
    if (!drag) return;
    const grabbedKey = itemKey(drag.moduleId, drag.itemId);
    const grabbedSelected = selected.has(grabbedKey);
    const moveKeys = grabbedSelected && selected.size > 1 ? new Set(selected) : new Set([grabbedKey]);
    setDrag(null);
    setDragOverItem(null);
    setDragOverModule(null);

    // The items to move, in their current tree order (preserves relative order).
    const moved: CanvasModuleItem[] = [];
    const movedIds = new Set<number>();
    for (const mod of modules) {
      for (const it of mod.items) {
        if (moveKeys.has(itemKey(mod.id, it.id))) {
          moved.push(it);
          movedIds.add(it.id);
        }
      }
    }
    if (moved.length === 0) return;
    if (beforeItemId != null && movedIds.has(beforeItemId)) return; // dropped onto the moving block

    // Snapshot positions for the FLIP and a diff of where everything lives now.
    const prevRects = new Map<number, DOMRect>();
    itemNodes.current.forEach((el, id) => {
      if (el) prevRects.set(id, el.getBoundingClientRect());
    });
    const oldPos = new Map<number, { moduleId: number; index: number }>();
    modules.forEach((mod) => mod.items.forEach((it, idx) => oldPos.set(it.id, { moduleId: mod.id, index: idx })));

    // New tree: pull the moved items out everywhere, then drop them as one block
    // into the target module before `beforeItemId` (or at the end).
    const next = modules.map((mod) => ({ ...mod, items: mod.items.filter((it) => !movedIds.has(it.id)) }));
    const targetModule = next.find((mod) => mod.id === targetModuleId);
    if (!targetModule) return;
    const insertIdx =
      beforeItemId == null
        ? targetModule.items.length
        : (() => {
            const bi = targetModule.items.findIndex((it) => it.id === beforeItemId);
            return bi < 0 ? targetModule.items.length : bi;
          })();
    targetModule.items.splice(insertIdx, 0, ...moved.map((it) => ({ ...it, moduleId: targetModuleId })));

    const changed = next.some((mod) =>
      mod.items.some((it, idx) => {
        const old = oldPos.get(it.id);
        return !old || old.moduleId !== mod.id || old.index !== idx;
      })
    );
    if (!changed) return; // dropped in place

    setModules(next);
    if (grabbedSelected) setSelected(new Set());
    flipPrev.current = prevRects;
    setFlipTick((t) => t + 1);

    // Persist. A single item is one call (Canvas auto-shifts the rest). For a
    // multi-item move, re-set every slot that changed in ascending target order
    // so Canvas converges on the new arrangement.
    type Update = { srcModuleId: number; itemId: number; targetModuleId: number; position: number; cross: boolean };
    let updates: Update[];
    if (moved.length === 1) {
      const only = moved[0];
      const old = oldPos.get(only.id)!;
      const finalIdx = targetModule.items.findIndex((it) => it.id === only.id);
      updates = [
        { srcModuleId: old.moduleId, itemId: only.id, targetModuleId, position: finalIdx + 1, cross: old.moduleId !== targetModuleId },
      ];
    } else {
      updates = [];
      next.forEach((mod) =>
        mod.items.forEach((it, idx) => {
          const old = oldPos.get(it.id);
          if (!old) return;
          const cross = old.moduleId !== mod.id;
          if (cross || old.index !== idx) {
            updates.push({ srcModuleId: old.moduleId, itemId: it.id, targetModuleId: mod.id, position: idx + 1, cross });
          }
        })
      );
      updates.sort((a, b) => a.targetModuleId - b.targetModuleId || a.position - b.position);
    }

    void (async () => {
      setBusy(true);
      let failed = false;
      for (const u of updates) {
        const result = await updateModuleItemAction(
          courseUrl,
          u.srcModuleId,
          u.itemId,
          { position: u.position, ...(u.cross ? { targetModuleId: u.targetModuleId } : {}) },
          acronym
        );
        if ("error" in result) failed = true;
      }
      setBusy(false);
      if (failed) {
        setNote({ kind: "error", text: "Some items could not be moved." });
        reload();
      }
    })();
  };

  const openFilePreview = async (it: CanvasModuleItem) => {
    if (it.contentId == null) return;
    setFilePreview({ file: { student: "", name: it.title, extension: "", content: "Loading…", truncated: false }, blobUrl: null });
    const result = await previewFileAction(courseUrl, it.contentId, acronym);
    if ("error" in result) {
      setFilePreview({ file: { student: "", name: it.title, extension: "", content: result.error, truncated: false }, blobUrl: null });
      return;
    }
    const p = result.preview;
    const blobUrl = p.base64 ? base64ToBlobUrl(p.base64, p.mimeType) : null;
    setFilePreview({
      file: {
        student: "",
        name: p.name,
        extension: "",
        content: p.text,
        truncated: p.truncated,
        rawBase64: p.base64 || undefined,
        mimeType: p.mimeType,
      },
      blobUrl,
    });
  };

  const closeFilePreview = () =>
    setFilePreview((prev) => {
      if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
      return null;
    });

  // Reload the course's rubrics (after building a new one, so the picker shows it).
  const refreshRubrics = async () => {
    const result = await listRubricsAction(courseUrl, acronym);
    if (!("error" in result)) setRubrics(result.rubrics);
  };

  // Load the course's rubrics once for the bulk rubric-association control.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listRubricsAction(courseUrl, acronym);
      if (cancelled || "error" in result) return;
      setRubrics(result.rubrics);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, acronym]);

  // The selected gradable items plus the data needed to pre-fill the bulk fields.
  const selGradables = (() => {
    const arr: Array<{ type: string; contentId: number; dueAt: string | null; pointsPossible: number | null }> = [];
    for (const mod of modules) {
      for (const it of mod.items) {
        if (
          selected.has(itemKey(mod.id, it.id)) &&
          ["Assignment", "Quiz", "Discussion"].includes(it.type) &&
          typeof it.contentId === "number"
        ) {
          arr.push({ type: it.type, contentId: it.contentId, dueAt: it.dueAt, pointsPossible: it.pointsPossible });
        }
      }
    }
    return arr;
  })();
  // Sorted "kind:id" signature, so the effect only re-runs when the set changes.
  const gradableSelSig = selGradables.map((g) => `${g.type}:${g.contentId}`).sort().join("|");
  // Latest data read by the effect without widening its dependencies.
  const selGradablesRef = useRef(selGradables);
  selGradablesRef.current = selGradables;
  const rubricsRef = useRef(rubrics);
  rubricsRef.current = rubrics;

  // When the selected gradables share a deadline / points / rubric / description,
  // pre-fill the matching bulk field so the current value loads in for editing;
  // when they differ (or none is selected), clear it. Runs only when the selection
  // changes. Deadline + points come from the item data; description + rubric need
  // a fetch (run in parallel).
  useEffect(() => {
    const gradables = selGradablesRef.current;
    if (gradables.length === 0) {
      setDescSharedState("idle");
      return;
    }
    // Deadline (all gradables) and points (assignments + quizzes) from item data.
    const dueSame = gradables.every((g) => g.dueAt === gradables[0].dueAt);
    setBulkDue(dueSame && gradables[0].dueAt ? toLocalInput(gradables[0].dueAt) : "");
    const pointed = gradables.filter((g) => g.type === "Assignment" || g.type === "Quiz");
    const pointsSame = pointed.length > 0 && pointed.every((g) => g.pointsPossible === pointed[0].pointsPossible);
    setBulkPoints(pointsSame && pointed[0].pointsPossible != null ? String(pointed[0].pointsPossible) : "");

    let cancelled = false;
    setDescSharedState("loading");
    (async () => {
      const results = await Promise.all(
        gradables.map((g) => getGradableAction(courseUrl, g.type as GradableKind, g.contentId, acronym))
      );
      if (cancelled) return;
      const detailPairs = gradables
        .map((g, i) => ({ type: g.type, res: results[i] }))
        .filter((p) => !("error" in p.res))
        .map((p) => ({ type: p.type, detail: (p.res as { detail: { description: string; rubricId?: number } }).detail }));
      if (detailPairs.length === 0) {
        setDescSharedState("idle");
        return;
      }
      // Description (all gradables).
      const descs = detailPairs.map((p) => p.detail.description);
      if (descs.every((d) => d === descs[0])) {
        setBulkItemsDescription(descs[0]);
        setDescSharedState("same");
      } else {
        setBulkItemsDescription("");
        setDescSharedState("mixed");
      }
      // Rubric (assignments only): pre-fill when they all share one that exists
      // in the course's rubric list; otherwise clear.
      const assignmentRubrics = detailPairs.filter((p) => p.type === "Assignment").map((p) => p.detail.rubricId);
      const sharedRubric = assignmentRubrics[0];
      if (
        assignmentRubrics.length > 0 &&
        typeof sharedRubric === "number" &&
        assignmentRubrics.every((id) => id === sharedRubric) &&
        rubricsRef.current.some((r) => r.id === sharedRubric)
      ) {
        setBulkRubricId(sharedRubric);
      } else {
        setBulkRubricId("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gradableSelSig, courseUrl, acronym]);

  const selectedItems = (): Array<{ item: CanvasModuleItem; moduleId: number }> => {
    const out: Array<{ item: CanvasModuleItem; moduleId: number }> = [];
    for (const mod of modules) {
      for (const it of mod.items) {
        if (selected.has(itemKey(mod.id, it.id))) out.push({ item: it, moduleId: mod.id });
      }
    }
    return out;
  };
  // Only the visible (filtered) items, so "Select all items" tracks the filter.
  // Toggling merges/unmerges rather than replacing, leaving any hidden selection
  // untouched.
  const allKeys = visibleModules.flatMap((mod) =>
    mod.items.filter((it) => itemVisible(mod, it)).map((it) => itemKey(mod.id, it.id))
  );
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) for (const k of allKeys) next.delete(k);
      else for (const k of allKeys) next.add(k);
      return next;
    });
  const clearSelection = () => {
    setSelected(new Set());
    setSelectedModules(new Set());
  };
  const toggleItemSelected = (moduleId: number, itemId: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const k = itemKey(moduleId, itemId);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  // Add every item of one kind to the selection. "Graded" matches the gradable
  // types (assignments, quizzes, graded discussions); otherwise an exact type.
  const selectByKind = (kind: string) => {
    if (!kind) return;
    const matches = (it: CanvasModuleItem) => (kind === "Graded" ? DATED_TYPES.includes(it.type) : it.type === kind);
    const keys: string[] = [];
    for (const mod of visibleModules) {
      for (const it of mod.items) {
        if (matches(it) && itemVisible(mod, it)) keys.push(itemKey(mod.id, it.id));
      }
    }
    if (keys.length === 0) {
      setNote({ kind: "error", text: `No ${kind === "Graded" ? "graded items" : `${kind.toLowerCase()}s`} to select.` });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
  };

  // Select (or, when all are already selected, deselect) every item in one module.
  const toggleModuleItems = (m: CanvasModule) => {
    const keys = m.items.map((it) => itemKey(m.id, it.id));
    if (keys.length === 0) return;
    const allOn = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  // Module-level selection (for deleting / publishing whole modules). Scoped to
  // the visible modules so a filtered list only selects what's on screen.
  const allModuleIds = visibleModules.map((mod) => mod.id);
  const allModulesSelected = allModuleIds.length > 0 && allModuleIds.every((id) => selectedModules.has(id));
  const toggleAllModules = () =>
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (allModulesSelected) for (const id of allModuleIds) next.delete(id);
      else for (const id of allModuleIds) next.add(id);
      return next;
    });
  const toggleModuleSelected = (id: number) =>
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkPublishModules = (published: boolean) => {
    const moduleIds = [...selectedModules];
    if (moduleIds.length === 0) return;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const id of moduleIds) {
        const result = await updateModuleAction(courseUrl, id, { published }, acronym);
        if ("error" in result) failed += 1;
        else updated += 1;
      }
      setOpBusy(false);
      setNote({
        kind: failed ? "error" : "success",
        text: `${published ? "Published" : "Unpublished"} modules: ${updated} done${failed ? `, ${failed} failed` : ""}.`,
      });
      reload();
    })();
  };

  const bulkDeleteModules = () => {
    if (!confirmDeleteModules) {
      setConfirmDeleteModules(true);
      return;
    }
    setConfirmDeleteModules(false);
    const moduleIds = [...selectedModules];
    if (moduleIds.length === 0) return;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const id of moduleIds) {
        const result = await deleteModuleAction(courseUrl, id, acronym);
        if ("error" in result) failed += 1;
        else updated += 1;
      }
      setOpBusy(false);
      setNote({
        kind: failed ? "error" : "success",
        text: `Deleted modules: ${updated} done${failed ? `, ${failed} failed` : ""}.`,
      });
      setSelectedModules(new Set());
      reload();
    })();
  };

  // Fill a naming pattern for one module: {module} -> module name, {n} -> the
  // week/module number read from the module's title (e.g. "Week 5" -> 5, "Unit
  // 12: Foo" -> 12). Prefers a number that follows a week/module-ish word so a
  // leading year like "2024 Fall Week 3" still resolves to 3; otherwise uses the
  // first number in the title, and finally the 1-based selection index when the
  // title has no number at all.
  const fillNamePattern = (pattern: string, moduleName: string, fallbackN: number): string => {
    const labeled = moduleName.match(/(?:week|module|unit|chapter|wk|mod)\s*#?\s*(\d+)/i);
    const anyNumber = moduleName.match(/\d+/);
    const n = labeled ? labeled[1] : anyNumber ? anyNumber[0] : String(fallbackN);
    return pattern.replace(/\{module\}/g, moduleName).replace(/\{n\}/g, n).trim() || `Item ${n}`;
  };

  // Create one new item of `type` named `name` and add it to `moduleId`. Pages
  // and gradables are created first (to get a slug / content id) and then linked;
  // a SubHeader is just a titled module item with no underlying content.
  const addContentToModule = async (
    type: string,
    moduleId: number,
    name: string,
    opts?: {
      dueAt?: string | null;
      points?: number;
      rubricId?: number;
      description?: string;
      questions?: EditableQuestion[];
      fileId?: number;
      fileContent?: string;
      fileFormat?: "docx" | "pptx";
    }
  ): Promise<boolean> => {
    try {
      if (type === "SubHeader") {
        const r = await createModuleItemAction(courseUrl, moduleId, { type: "SubHeader", title: name }, acronym);
        return !("error" in r);
      }
      if (type === "File") {
        // AI-generated content is built into a branded .docx or .pptx and uploaded
        // as a new file; otherwise link the chosen existing course file here.
        if (opts?.fileContent && opts.fileContent.trim() !== "") {
          const author = resolveDocumentAuthor();
          if (opts.fileFormat === "pptx") {
            const deck = textToSlides(opts.fileContent);
            const buffer = await buildSlidesPptx({
              presentationTitle: deck.presentationTitle,
              slides: deck.slides,
              author,
            });
            const file = new File([buffer], `${name}.pptx`, {
              type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            });
            await uploadFileToModule(courseUrl, acronym, moduleId, file);
            return true;
          }
          const buffer = await buildDocxFromPlainText(opts.fileContent, undefined, author);
          const file = new File([buffer], `${name}.docx`, {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          });
          await uploadFileToModule(courseUrl, acronym, moduleId, file);
          return true;
        }
        if (opts?.fileId != null) {
          const r = await createModuleItemAction(courseUrl, moduleId, { type: "File", contentId: opts.fileId }, acronym);
          return !("error" in r);
        }
        return false;
      }
      if (type === "Page") {
        const created = await createPageAction(
          courseUrl,
          { title: name, body: opts?.description || undefined },
          acronym
        );
        if ("error" in created) return false;
        const linked = await createModuleItemAction(courseUrl, moduleId, { type: "Page", pageUrl: created.page.url }, acronym);
        return !("error" in linked);
      }
      // Assignment / Quiz / Discussion: create with the optional details, link it,
      // then attach a rubric (assignments) and questions (quizzes) once it exists.
      const fields: { title: string; description?: string; pointsPossible?: number; dueAt?: string | null } = { title: name };
      if (opts?.description) fields.description = opts.description;
      if (opts?.points != null && Number.isFinite(opts.points)) fields.pointsPossible = opts.points;
      if (opts?.dueAt) fields.dueAt = opts.dueAt;
      const created = await createGradableAction(courseUrl, type as GradableKind, fields, acronym);
      if ("error" in created) return false;
      const linked = await createModuleItemAction(courseUrl, moduleId, { type, contentId: created.id }, acronym);
      if ("error" in linked) return false;
      if (opts?.rubricId != null && type === "Assignment") {
        await bulkAssociateRubricAction(courseUrl, opts.rubricId, [String(created.id)], acronym);
      }
      if (type === "Quiz" && opts?.questions && opts.questions.length > 0) {
        for (const q of opts.questions) {
          await createQuizQuestionAction(courseUrl, created.id, quizQuestionToInput(q), acronym);
        }
      }
      return true;
    } catch {
      return false;
    }
  };

  // Add one new item (named via the pattern) of the chosen type to every
  // selected module, in module order. New content is unpublished by default.
  const bulkAddToModules = () => {
    const targets = modules.filter((mod) => selectedModules.has(mod.id));
    if (targets.length === 0) return;
    const type = bulkAddType;
    const pattern = bulkAddPattern.trim();
    const fileId = type === "File" && bulkAddFileId !== "" ? Number(bulkAddFileId) : undefined;
    const fileContent = type === "File" && bulkAddFileContent.trim() !== "" ? bulkAddFileContent : undefined;
    if (type === "File") {
      if (fileContent === undefined && fileId === undefined) {
        setNote({ kind: "error", text: "Pick a file to add, or generate one with AI first." });
        return;
      }
      if (fileContent !== undefined && !pattern) {
        setNote({ kind: "error", text: "Enter a name pattern for the generated file." });
        return;
      }
    } else if (!pattern) {
      setNote({ kind: "error", text: "Enter a name pattern for the new items." });
      return;
    }
    const isGradable = ["Assignment", "Quiz", "Discussion"].includes(type);
    // Gather the optional details; each only applies to the types that support it.
    const points =
      ["Assignment", "Quiz"].includes(type) && bulkAddPoints.trim() !== "" && Number.isFinite(Number(bulkAddPoints))
        ? Number(bulkAddPoints)
        : undefined;
    const rubricId = type === "Assignment" && bulkAddRubricId !== "" ? Number(bulkAddRubricId) : undefined;
    const baseDue =
      isGradable && bulkAddDue && !Number.isNaN(new Date(bulkAddDue).getTime()) ? new Date(bulkAddDue) : null;
    const stepDays = Math.max(0, Math.trunc(bulkAddStaggerOffset || 0)) * (bulkAddStaggerUnit === "weeks" ? 7 : 1);
    // Description applies to pages (as the body) and gradables; questions only to quizzes.
    const description =
      ["Assignment", "Quiz", "Discussion", "Page"].includes(type) && bulkAddDescription.trim() !== ""
        ? bulkAddDescription
        : undefined;
    const questions = type === "Quiz" && bulkAddQuestions.length > 0 ? bulkAddQuestions : undefined;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let added = 0;
      let failed = 0;
      let n = 0;
      for (const mod of targets) {
        n += 1;
        // The first selected module gets the base due date; each later one is
        // pushed out by the stagger interval (0 = same date for all).
        let dueAt: string | null = null;
        if (baseDue) {
          const d = new Date(baseDue);
          d.setDate(d.getDate() + (n - 1) * stepDays);
          dueAt = d.toISOString();
        }
        const ok = await addContentToModule(type, mod.id, fillNamePattern(pattern, mod.name, n), {
          dueAt,
          points,
          rubricId,
          description,
          questions,
          fileId,
          fileContent,
          fileFormat: bulkAddFileFormat,
        });
        if (ok) added += 1;
        else failed += 1;
      }
      setOpBusy(false);
      setNote({
        kind: failed ? "error" : "success",
        text: `Added to modules: ${added} done${failed ? `, ${failed} failed` : ""}.`,
      });
      reload();
    })();
  };

  // Generate the "Add to each" content with AI: an HTML description/body for
  // gradables and pages, or HTML file content when adding a File. The result fills
  // the matching field for review before the items are created.
  const bulkAiGenerate = async () => {
    if (!bulkAiPrompt.trim()) {
      setNote({ kind: "error", text: "Describe what to generate first." });
      return;
    }
    setBulkAiBusy(true);
    setNote(null);
    if (bulkAddType === "File") {
      // Files become a branded .docx or .pptx. For slides, generate a structured
      // deck and keep it as editable text; for documents, markdown-ish text.
      if (bulkAddFileFormat === "pptx") {
        const result = await generateSlidesAction(bulkAiPrompt.trim(), provider);
        setBulkAiBusy(false);
        if ("error" in result) {
          setNote({ kind: "error", text: result.error });
          return;
        }
        setBulkAddFileContent(slidesToText(result));
        setNote({ kind: "success", text: "Generated slides — review them below, then Add to build a .pptx per module." });
        return;
      }
      const result = await generateDocumentTextAction(bulkAiPrompt.trim(), provider);
      setBulkAiBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setBulkAddFileContent(result.text);
      setNote({ kind: "success", text: "Generated document text — review it below, then Add to build a .docx per module." });
      return;
    }
    // Other types take an HTML description/body.
    const instruction = `Write the full HTML body for a ${bulkAddType.toLowerCase()} in a course. ${bulkAiPrompt.trim()}`;
    const result = await revisePageWithAiAction("", instruction, provider);
    setBulkAiBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setBulkAddDescription(result.html);
    setNote({ kind: "success", text: "Generated content — review it above, then Add." });
  };

  // Run a bulk op that returns an {updated, failures} summary; report + refresh.
  const runBulkSummary = async (
    fn: () => Promise<{ updated: number; failures: unknown[] } | { error: string }>,
    label: string
  ) => {
    setOpBusy(true);
    setNote(null);
    const result = await fn();
    setOpBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setNote({
      kind: result.failures.length ? "error" : "success",
      text: `${label}: ${result.updated} done${result.failures.length ? `, ${result.failures.length} failed` : ""}.`,
    });
    reload();
  };

  // Run a per-item op (publish, remove) over the current selection.
  const runPerItem = async (
    items: Array<{ item: CanvasModuleItem; moduleId: number }>,
    fn: (item: CanvasModuleItem, moduleId: number) => Promise<{ ok: true } | { error: string }>,
    label: string
  ) => {
    setOpBusy(true);
    setNote(null);
    let updated = 0;
    let failed = 0;
    for (const { item, moduleId } of items) {
      const result = await fn(item, moduleId);
      if ("error" in result) failed += 1;
      else updated += 1;
    }
    setOpBusy(false);
    setNote({
      kind: failed ? "error" : "success",
      text: `${label}: ${updated} done${failed ? `, ${failed} failed` : ""}.`,
    });
    reload();
  };

  // Group selected items' ids by kind for the per-kind bulk endpoints.
  const idsByKind = (kinds: BulkKind[], usePageSlug = false): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    for (const { item } of selectedItems()) {
      if (!kinds.includes(item.type as BulkKind)) continue;
      const id =
        item.type === "Page"
          ? usePageSlug
            ? item.pageUrl
            : null
          : item.contentId != null
            ? String(item.contentId)
            : null;
      if (id) (map[item.type] ??= []).push(id);
    }
    return map;
  };

  const bulkPublish = (published: boolean) => {
    const items = selectedItems();
    if (items.length === 0) return;
    void runPerItem(
      items,
      (it, moduleId) => updateModuleItemAction(courseUrl, moduleId, it.id, { published }, acronym),
      published ? "Published" : "Unpublished"
    );
  };

  const bulkSetDue = () => {
    if (!bulkDue || Number.isNaN(new Date(bulkDue).getTime())) {
      setNote({ kind: "error", text: "Pick a valid due date first." });
      return;
    }
    const iso = new Date(bulkDue).toISOString();
    const updates = selectedItems()
      .filter(({ item }) => ["Assignment", "Quiz", "Discussion"].includes(item.type) && typeof item.contentId === "number")
      .map(({ item }) => ({ type: item.type, contentId: item.contentId as number, dueAt: iso }));
    if (updates.length === 0) {
      setNote({ kind: "error", text: "No selected items can take a due date." });
      return;
    }
    void runBulkSummary(() => setModuleDueDatesAction(courseUrl, updates, acronym), "Due date set");
  };

  const bulkShiftDue = () => {
    const updates = selectedItems()
      .filter(
        ({ item }) =>
          ["Assignment", "Quiz", "Discussion"].includes(item.type) && typeof item.contentId === "number" && item.dueAt
      )
      .map(({ item }) => {
        const d = new Date(item.dueAt!);
        d.setDate(d.getDate() + bulkShift);
        return { type: item.type, contentId: item.contentId as number, dueAt: d.toISOString() };
      });
    if (updates.length === 0) {
      setNote({ kind: "error", text: "No selected items have a due date to shift." });
      return;
    }
    void runBulkSummary(() => setModuleDueDatesAction(courseUrl, updates, acronym), "Due dates shifted");
  };

  // Stagger due dates by module: the earliest selected module's gradables get the
  // base date, the next module's get base + 1 interval, the next base + 2, and so
  // on. Rank is by module list order over only the modules that have a selected
  // gradable, so gaps in the selection don't create gaps in the schedule. Items
  // in the same module share a due date.
  const bulkStaggerDue = () => {
    if (!bulkDue || Number.isNaN(new Date(bulkDue).getTime())) {
      setNote({ kind: "error", text: "Pick a base due date first." });
      return;
    }
    const items = selectedItems().filter(
      ({ item }) => ["Assignment", "Quiz", "Discussion"].includes(item.type) && typeof item.contentId === "number"
    );
    if (items.length === 0) {
      setNote({ kind: "error", text: "No selected items can take a due date." });
      return;
    }
    const perStepDays = Math.trunc(bulkStaggerOffset || 0) * (bulkStaggerUnit === "weeks" ? 7 : 1);
    const rank = new Map<number, number>();
    modules
      .filter((mod) => items.some(({ moduleId }) => moduleId === mod.id))
      .forEach((mod, idx) => rank.set(mod.id, idx));
    const base = new Date(bulkDue);
    const updates = items.map(({ item, moduleId }) => {
      const d = new Date(base);
      d.setDate(d.getDate() + (rank.get(moduleId) ?? 0) * perStepDays);
      return { type: item.type, contentId: item.contentId as number, dueAt: d.toISOString() };
    });
    void runBulkSummary(() => setModuleDueDatesAction(courseUrl, updates, acronym), "Due dates staggered");
  };

  // Move every selected item `dir * bulkModuleShift` modules along the module
  // list (negative = toward the top). Each item's target is clamped to the first
  // and last module, so items already at the edge in that direction stay put.
  // Items land at the end of their target module; when several move into the same
  // module their selection order is preserved.
  const bulkShiftModules = (dir: -1 | 1) => {
    const items = selectedItems();
    if (items.length === 0) return;
    const steps = Math.abs(Math.trunc(bulkModuleShift || 0));
    if (steps === 0) {
      setNote({ kind: "error", text: "Enter how many modules to shift by." });
      return;
    }
    if (modules.length < 2) {
      setNote({ kind: "error", text: "There is only one module to move items between." });
      return;
    }
    const delta = dir * steps;

    const moduleIndex = new Map<number, number>();
    modules.forEach((mod, idx) => moduleIndex.set(mod.id, idx));

    // Plan each move: source module + target module + the 1-based position the
    // item should take at the end of that target (accounting for others moving
    // into the same module ahead of it in this batch).
    const appended = new Map<number, number>();
    const plan = new Map<number, { srcModuleId: number; targetModuleId: number; position: number }>();
    for (const { item, moduleId } of items) {
      const srcIdx = moduleIndex.get(moduleId);
      if (srcIdx === undefined) continue;
      const targetIdx = Math.min(modules.length - 1, Math.max(0, srcIdx + delta));
      if (targetIdx === srcIdx) continue; // already at the top/bottom in this direction
      const target = modules[targetIdx];
      const n = appended.get(target.id) ?? 0;
      plan.set(item.id, { srcModuleId: moduleId, targetModuleId: target.id, position: target.items.length + n + 1 });
      appended.set(target.id, n + 1);
    }

    const moveItems = items.filter(({ item }) => plan.has(item.id));
    if (moveItems.length === 0) {
      setNote({ kind: "error", text: `Selected items are already at the ${dir < 0 ? "top" : "bottom"} module.` });
      return;
    }

    void (async () => {
      await runPerItem(
        moveItems,
        (it, moduleId) => {
          const p = plan.get(it.id)!;
          return updateModuleItemAction(
            courseUrl,
            moduleId,
            it.id,
            { targetModuleId: p.targetModuleId, position: p.position },
            acronym
          );
        },
        dir < 0 ? "Shifted up" : "Shifted down"
      );
      clearSelection();
    })();
  };

  // Move every selected item into one chosen module, appended to its end in
  // selection order. Items already in that module are left alone.
  const bulkMoveToModule = () => {
    if (bulkTargetModule === "") {
      setNote({ kind: "error", text: "Pick a module to move the items into." });
      return;
    }
    const targetId = bulkTargetModule;
    const target = modules.find((mod) => mod.id === targetId);
    if (!target) return;
    const items = selectedItems();
    if (items.length === 0) return;

    // Position each moved item at the end of the target, after any already there
    // plus the others moving in ahead of it in this batch.
    let appended = 0;
    const plan = new Map<number, number>();
    for (const { item, moduleId } of items) {
      if (moduleId === targetId) continue; // already in the target module
      plan.set(item.id, target.items.length + appended + 1);
      appended += 1;
    }

    const moveItems = items.filter(({ item }) => plan.has(item.id));
    if (moveItems.length === 0) {
      setNote({ kind: "error", text: `Selected items are already in "${target.name}".` });
      return;
    }

    void (async () => {
      await runPerItem(
        moveItems,
        (it, moduleId) =>
          updateModuleItemAction(
            courseUrl,
            moduleId,
            it.id,
            { targetModuleId: targetId, position: plan.get(it.id)! },
            acronym
          ),
        `Moved to "${target.name}"`
      );
      clearSelection();
    })();
  };

  const bulkSetPoints = () => {
    const p = Number(bulkPoints);
    if (bulkPoints.trim() === "" || !Number.isFinite(p)) {
      setNote({ kind: "error", text: "Enter a points value." });
      return;
    }
    const byKind = idsByKind(["Assignment", "Quiz"]);
    const kinds = Object.keys(byKind);
    if (kinds.length === 0) {
      setNote({ kind: "error", text: "No selected assignments or quizzes." });
      return;
    }
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const k of kinds) {
        const result = await bulkUpdateAction(courseUrl, k as BulkKind, byKind[k], { pointsPossible: p }, acronym);
        if ("error" in result) failed += byKind[k].length;
        else {
          updated += result.updated;
          failed += result.failures.length;
        }
      }
      setOpBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Points set: ${updated} done${failed ? `, ${failed} failed` : ""}.` });
      reload();
    })();
  };

  const bulkRubric = () => {
    if (bulkRubricId === "") {
      setNote({ kind: "error", text: "Pick a rubric first." });
      return;
    }
    const ids = selectedItems()
      .filter(({ item }) => item.type === "Assignment" && typeof item.contentId === "number")
      .map(({ item }) => String(item.contentId));
    if (ids.length === 0) {
      setNote({ kind: "error", text: "No selected assignments." });
      return;
    }
    void runBulkSummary(() => bulkAssociateRubricAction(courseUrl, Number(bulkRubricId), ids, acronym), "Rubric associated");
  };

  // Open the rubric builder, pre-targeting the selected assignments to associate.
  const openRubricBuilder = () => {
    const assignments = selectedItems()
      .filter(({ item }) => item.type === "Assignment" && typeof item.contentId === "number")
      .map(({ item }) => ({ id: String(item.contentId), title: item.title, points: item.pointsPossible }));
    setRubricBuilder({ assignments });
  };

  // Replace the description on every selected gradable, and the body on selected
  // pages, with the text from the bulk "Content" field.
  const bulkSetDescription = () => {
    if (bulkItemsDescription.trim() === "") {
      setNote({ kind: "error", text: "Type a description to set (this replaces the existing one)." });
      return;
    }
    const items = selectedItems();
    const gradables = items.filter(
      ({ item }) => ["Assignment", "Quiz", "Discussion"].includes(item.type) && typeof item.contentId === "number"
    );
    const pages = items.filter(({ item }) => item.type === "Page" && item.pageUrl);
    if (gradables.length === 0 && pages.length === 0) {
      setNote({ kind: "error", text: "No selected items have a description to set." });
      return;
    }
    const desc = bulkItemsDescription;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const { item } of gradables) {
        const r = await updateGradableAction(courseUrl, item.type as GradableKind, item.contentId as number, { description: desc }, acronym);
        if ("error" in r) failed += 1;
        else updated += 1;
      }
      for (const { item } of pages) {
        const r = await updatePageAction(courseUrl, item.pageUrl as string, { body: desc }, acronym);
        if ("error" in r) failed += 1;
        else updated += 1;
      }
      setOpBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Description set: ${updated} done${failed ? `, ${failed} failed` : ""}.` });
      reload();
    })();
  };

  // Append the composed questions to every selected quiz.
  const bulkAddQuestionsToQuizzes = () => {
    if (bulkItemsQuestions.length === 0) {
      setNote({ kind: "error", text: "Add at least one question first." });
      return;
    }
    const quizzes = selectedItems().filter(({ item }) => item.type === "Quiz" && typeof item.contentId === "number");
    if (quizzes.length === 0) {
      setNote({ kind: "error", text: "No selected quizzes." });
      return;
    }
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let added = 0;
      let failed = 0;
      for (const { item } of quizzes) {
        for (const q of bulkItemsQuestions) {
          const r = await createQuizQuestionAction(courseUrl, item.contentId as number, quizQuestionToInput(q), acronym);
          if ("error" in r) failed += 1;
          else added += 1;
        }
      }
      setOpBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Questions added: ${added} done${failed ? `, ${failed} failed` : ""}.` });
      reload();
    })();
  };

  const bulkRemoveFromModule = () => {
    const items = selectedItems();
    if (items.length === 0) return;
    void (async () => {
      await runPerItem(items, (it, moduleId) => deleteModuleItemAction(courseUrl, moduleId, it.id, acronym), "Removed from module");
      clearSelection();
    })();
  };

  const bulkDeleteContent = () => {
    if (!confirmDeleteContent) {
      setConfirmDeleteContent(true);
      return;
    }
    setConfirmDeleteContent(false);
    const items = selectedItems();
    // Assignments/quizzes/discussions/pages go through the per-kind bulk endpoint;
    // files have their own delete; text headers and external URLs only exist as
    // module items, so removing the item is the only "delete" there is.
    const byKind = idsByKind(["Assignment", "Quiz", "Discussion", "Page"], true);
    const kinds = Object.keys(byKind);
    const fileIds = items
      .filter(({ item }) => item.type === "File" && typeof item.contentId === "number")
      .map(({ item }) => item.contentId as number);
    const moduleOnly = items.filter(({ item }) =>
      ["SubHeader", "ExternalUrl", "ExternalTool"].includes(item.type)
    );
    if (kinds.length === 0 && fileIds.length === 0 && moduleOnly.length === 0) {
      setNote({ kind: "error", text: "No selected items can be deleted from Canvas (try Remove from module)." });
      return;
    }
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let deleted = 0;
      let failed = 0;
      for (const k of kinds) {
        const result = await bulkDeleteAction(courseUrl, k as BulkKind, byKind[k], acronym);
        if ("error" in result) failed += byKind[k].length;
        else {
          deleted += result.updated;
          failed += result.failures.length;
        }
      }
      for (const fileId of fileIds) {
        const result = await deleteCourseFileAction(courseUrl, fileId, acronym);
        if ("error" in result) failed += 1;
        else deleted += 1;
      }
      for (const { item, moduleId } of moduleOnly) {
        const result = await deleteModuleItemAction(courseUrl, moduleId, item.id, acronym);
        if ("error" in result) failed += 1;
        else deleted += 1;
      }
      setOpBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Deleted from Canvas: ${deleted} done${failed ? `, ${failed} failed` : ""}.` });
      clearSelection();
      reload();
    })();
  };

  const patchModule = (id: number, patch: Partial<CanvasModule>) =>
    setModules((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const patchItems = (moduleId: number, items: CanvasModuleItem[]) =>
    setModules((prev) => prev.map((m) => (m.id === moduleId ? { ...m, items } : m)));

  // Run a write, surfacing errors and reloading from Canvas to recover on failure.
  const run = async (fn: () => Promise<{ error: string } | unknown>, fallbackMsg: string) => {
    setBusy(true);
    setNote(null);
    try {
      const result = (await fn()) as { error?: string };
      if (result && typeof result === "object" && "error" in result && result.error) {
        setNote({ kind: "error", text: result.error });
        reload();
      }
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : fallbackMsg });
      reload();
    } finally {
      setBusy(false);
    }
  };

  const handleAddModule = async () => {
    const name = newModuleName.trim();
    if (!name) return;
    setNewModuleName("");
    await run(
      () => createModuleAction(courseUrl, name, modules.length + 1, acronym),
      "Could not create the module."
    );
    reload();
  };

  const saveModuleName = async (m: CanvasModule) => {
    const draft = drafts[`m${m.id}`];
    if (draft === undefined || draft.trim() === m.name) return;
    const name = draft.trim();
    if (!name) return;
    patchModule(m.id, { name });
    await run(() => updateModuleAction(courseUrl, m.id, { name }, acronym), "Could not rename the module.");
  };

  const toggleModule = (m: CanvasModule) => {
    const published = !m.published;
    patchModule(m.id, { published });
    void run(
      () => updateModuleAction(courseUrl, m.id, { published }, acronym),
      "Could not update the module."
    );
  };

  const moveModule = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= modules.length) return;
    const reordered = [...modules];
    const [m] = reordered.splice(index, 1);
    reordered.splice(target, 0, m);
    setModules(reordered);
    void run(
      () => updateModuleAction(courseUrl, m.id, { position: target + 1 }, acronym),
      "Could not reorder the module."
    );
  };

  // Drop the dragged module onto another module's card: drag down lands it just
  // after the target, drag up lands it just before, so either end is reachable.
  // Reorder locally with a FLIP for instant feedback, then persist the new
  // 1-based position (Canvas shifts the rest).
  const performModuleMove = (targetId: number) => {
    if (moduleDrag === null) return;
    const srcId = moduleDrag;
    setModuleDrag(null);
    setDragOverModuleRow(null);
    if (srcId === targetId) return;

    const srcIdx = modules.findIndex((m) => m.id === srcId);
    const tgtIdx = modules.findIndex((m) => m.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    const prevRects = new Map<number, DOMRect>();
    moduleNodes.current.forEach((el, id) => {
      if (el) prevRects.set(id, el.getBoundingClientRect());
    });

    const dragged = modules[srcIdx];
    const reordered = modules.filter((m) => m.id !== srcId);
    const newTgtIdx = reordered.findIndex((m) => m.id === targetId);
    const insertAt = srcIdx < tgtIdx ? newTgtIdx + 1 : newTgtIdx;
    reordered.splice(insertAt, 0, dragged);

    setModules(reordered);
    flipPrevModules.current = prevRects;
    setFlipTick((t) => t + 1);

    void run(
      () => updateModuleAction(courseUrl, dragged.id, { position: insertAt + 1 }, acronym),
      "Could not reorder the module."
    );
  };

  const removeModule = async (m: CanvasModule) => {
    if (confirmId !== `m${m.id}`) {
      setConfirmId(`m${m.id}`);
      return;
    }
    setConfirmId(null);
    setModules((prev) => prev.filter((x) => x.id !== m.id));
    await run(() => deleteModuleAction(courseUrl, m.id, acronym), "Could not delete the module.");
  };

  const saveItemTitle = async (m: CanvasModule, it: CanvasModuleItem) => {
    const draft = drafts[`i${it.id}`];
    if (draft === undefined || draft.trim() === it.title) return;
    const title = draft.trim();
    if (!title) return;
    patchItems(m.id, m.items.map((x) => (x.id === it.id ? { ...x, title } : x)));
    await run(
      () => updateModuleItemAction(courseUrl, m.id, it.id, { title }, acronym),
      "Could not rename the item."
    );
  };

  // Persist an inline due-date edit for one gradable item. Empty clears the date.
  // Skips the write when the field is unchanged; optimistic, then reconciles.
  const saveDueEdit = (m: CanvasModule, it: CanvasModuleItem) => {
    if (!dueEdit || dueEdit.id !== it.id) return;
    if (dueEdit.value === toLocalInput(it.dueAt) || it.contentId == null) {
      setDueEdit(null);
      return;
    }
    const raw = dueEdit.value.trim();
    if (raw && Number.isNaN(new Date(raw).getTime())) {
      setNote({ kind: "error", text: "Could not read that due date." });
      setDueEdit(null);
      return;
    }
    const iso = raw ? new Date(raw).toISOString() : null;
    const contentId = it.contentId;
    setDueEdit(null);
    patchItems(m.id, m.items.map((x) => (x.id === it.id ? { ...x, dueAt: iso } : x)));
    void (async () => {
      setBusy(true);
      setNote(null);
      const result = await setModuleDueDatesAction(
        courseUrl,
        [{ type: it.type, contentId, dueAt: iso }],
        acronym
      );
      setBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        reload();
      } else if (result.failures.length > 0) {
        setNote({ kind: "error", text: "Could not update the due date in Canvas." });
        reload();
      } else {
        setNote({ kind: "success", text: iso ? "Due date updated." : "Due date cleared." });
      }
    })();
  };

  // Persist an inline points edit for an assignment/quiz. Skips an unchanged or
  // empty value; optimistic, then reconciles on failure.
  const savePointsEdit = (m: CanvasModule, it: CanvasModuleItem) => {
    if (!pointsEdit || pointsEdit.id !== it.id) return;
    const original = it.pointsPossible != null ? String(it.pointsPossible) : "";
    const raw = pointsEdit.value.trim();
    if (raw === original || it.contentId == null) {
      setPointsEdit(null);
      return;
    }
    if (raw === "" || !Number.isFinite(Number(raw))) {
      setNote({ kind: "error", text: "Enter a number for the points." });
      setPointsEdit(null);
      return;
    }
    const pts = Number(raw);
    const contentId = it.contentId;
    setPointsEdit(null);
    patchItems(m.id, m.items.map((x) => (x.id === it.id ? { ...x, pointsPossible: pts } : x)));
    void (async () => {
      setBusy(true);
      setNote(null);
      const result = await updateGradableAction(courseUrl, it.type as GradableKind, contentId, { pointsPossible: pts }, acronym);
      setBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        reload();
      } else {
        setNote({ kind: "success", text: "Points updated." });
      }
    })();
  };

  // Change a gradable item's type from its row: recreate it as the target kind
  // (carrying title, description, points, due date), drop it into the same slot,
  // and delete the original. Submissions/grades do not carry over.
  const changeItemType = (m: CanvasModule, it: CanvasModuleItem, target: GradableKind) => {
    setTypeEdit(null);
    if (it.contentId == null || target === it.type) return;
    const contentId = it.contentId;
    void (async () => {
      setBusy(true);
      setNote(null);
      try {
        let description = "";
        const detail = await getGradableAction(courseUrl, it.type as GradableKind, contentId, acronym);
        if (!("error" in detail)) description = detail.detail.description;
        const created = await createGradableAction(
          courseUrl,
          target,
          { title: it.title, description, pointsPossible: it.pointsPossible ?? undefined, dueAt: it.dueAt },
          acronym
        );
        if ("error" in created) throw new Error(created.error);
        const added = await createModuleItemAction(
          courseUrl,
          m.id,
          { type: target, contentId: created.id, position: it.position, indent: it.indent },
          acronym
        );
        if ("error" in added) throw new Error(added.error);
        const removed = await bulkDeleteAction(courseUrl, it.type as BulkKind, [String(contentId)], acronym);
        if ("error" in removed) throw new Error(removed.error);
        setNote({ kind: "success", text: `Changed to ${target.toLowerCase()}.` });
      } catch (err) {
        setNote({ kind: "error", text: err instanceof Error ? err.message : "Could not change the type." });
      } finally {
        setBusy(false);
        reload();
      }
    })();
  };

  const toggleItem = (m: CanvasModule, it: CanvasModuleItem) => {
    const published = !it.published;
    patchItems(m.id, m.items.map((x) => (x.id === it.id ? { ...x, published } : x)));
    void run(
      () => updateModuleItemAction(courseUrl, m.id, it.id, { published }, acronym),
      "Could not update the item."
    );
  };

  const moveItem = (m: CanvasModule, index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= m.items.length) return;
    const items = [...m.items];
    const [it] = items.splice(index, 1);
    items.splice(target, 0, it);
    patchItems(m.id, items);
    void run(
      () => updateModuleItemAction(courseUrl, m.id, it.id, { position: target + 1 }, acronym),
      "Could not reorder the item."
    );
  };

  const indentItem = (m: CanvasModule, it: CanvasModuleItem, delta: -1 | 1) => {
    const indent = Math.min(MAX_INDENT, Math.max(0, it.indent + delta));
    if (indent === it.indent) return;
    patchItems(m.id, m.items.map((x) => (x.id === it.id ? { ...x, indent } : x)));
    void run(
      () => updateModuleItemAction(courseUrl, m.id, it.id, { indent }, acronym),
      "Could not change the indent."
    );
  };

  const removeItem = async (m: CanvasModule, it: CanvasModuleItem) => {
    if (confirmId !== `i${it.id}`) {
      setConfirmId(`i${it.id}`);
      return;
    }
    setConfirmId(null);
    patchItems(m.id, m.items.filter((x) => x.id !== it.id));
    await run(
      () => deleteModuleItemAction(courseUrl, m.id, it.id, acronym),
      "Could not remove the item."
    );
  };

  // Item types whose target is picked from a dropdown of existing course content.
  const CONTENT_TYPES = ["Page", "Assignment", "Quiz", "Discussion", "File"];
  // Of those, the ones sourced from the lazily-loaded addable content.
  const TARGET_TYPES = ["Assignment", "Quiz", "Discussion", "File"];

  const optionsFor = (type: string): Array<{ value: string; label: string }> => {
    if (type === "Page") return pages.map((p) => ({ value: p.url, label: p.title }));
    if (!targets) return [];
    if (type === "Assignment") return targets.assignments.map((a) => ({ value: String(a.id), label: a.title }));
    if (type === "Quiz") return targets.quizzes.map((q) => ({ value: String(q.id), label: q.title }));
    if (type === "Discussion") return targets.discussions.map((d) => ({ value: String(d.id), label: d.title }));
    if (type === "File") return targets.files.map((f) => ({ value: String(f.id), label: f.title }));
    return [];
  };

  const contentPlaceholder = (type: string): string => {
    if (TARGET_TYPES.includes(type) && targetsState === "loading") return "Loading…";
    if (TARGET_TYPES.includes(type) && targetsState === "error") return "Could not load";
    return optionsFor(type).length === 0 ? `No ${type.toLowerCase()}s to add` : `Choose a ${type.toLowerCase()}…`;
  };

  const canAdd = (m: CanvasModule): boolean => {
    const type = addType[m.id] ?? "Page";
    if (type === "ExternalUrl") return !!(addUrl[m.id] ?? "").trim();
    if (type === "SubHeader") return !!(addTitle[m.id] ?? "").trim();
    if (type === "File") return !!addValue[m.id] || (addFileContent[m.id] ?? "").trim() !== "";
    return !!addValue[m.id];
  };

  // A file name derived from the generated content's first heading/line.
  const titleFromText = (text: string): string => {
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const h = line.match(/^#{1,2}\s+(.*)$/);
      return ((h ? h[1] : line).trim() || "Document").slice(0, 80);
    }
    return "Document";
  };

  // Generate the per-module file's content with AI (docx text or a slide deck).
  const addAiGenerate = async (m: CanvasModule) => {
    const prompt = (addAiPrompt[m.id] ?? "").trim();
    if (!prompt) {
      setNote({ kind: "error", text: "Describe what to generate first." });
      return;
    }
    const format = addFileFormat[m.id] ?? "docx";
    setAddAiBusy((p) => ({ ...p, [m.id]: true }));
    setNote(null);
    if (format === "pptx") {
      const result = await generateSlidesAction(prompt, provider);
      setAddAiBusy((p) => ({ ...p, [m.id]: false }));
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setAddFileContent((p) => ({ ...p, [m.id]: slidesToText(result) }));
      setNote({ kind: "success", text: "Generated slides — review them, then Add." });
      return;
    }
    const result = await generateDocumentTextAction(prompt, provider);
    setAddAiBusy((p) => ({ ...p, [m.id]: false }));
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setAddFileContent((p) => ({ ...p, [m.id]: result.text }));
    setNote({ kind: "success", text: "Generated document — review it, then Add." });
  };

  const addItem = async (m: CanvasModule) => {
    const type = addType[m.id] ?? "Page";
    // AI-generated file: build a .docx/.pptx and upload it into this module.
    if (type === "File" && (addFileContent[m.id] ?? "").trim() !== "") {
      const content = addFileContent[m.id];
      const format = addFileFormat[m.id] ?? "docx";
      setBusy(true);
      setNote(null);
      const ok = await addContentToModule("File", m.id, titleFromText(content), {
        fileContent: content,
        fileFormat: format,
      });
      setBusy(false);
      if (!ok) {
        setNote({ kind: "error", text: "Could not generate and add the file." });
        return;
      }
      setAddFileContent((p) => ({ ...p, [m.id]: "" }));
      setAddAiPrompt((p) => ({ ...p, [m.id]: "" }));
      setNote({ kind: "success", text: `Added the generated .${format} to "${m.name}".` });
      reload();
      return;
    }
    let item: NewModuleItem | null = null;
    if (type === "Page") {
      const pageUrl = addValue[m.id];
      if (pageUrl) item = { type: "Page", pageUrl };
    } else if (type === "ExternalUrl") {
      const externalUrl = (addUrl[m.id] ?? "").trim();
      const title = (addTitle[m.id] ?? "").trim();
      if (externalUrl) item = { type: "ExternalUrl", externalUrl, title: title || externalUrl };
    } else if (type === "SubHeader") {
      const title = (addTitle[m.id] ?? "").trim();
      if (title) item = { type: "SubHeader", title };
    } else {
      const id = addValue[m.id];
      if (id) item = { type, contentId: Number(id) };
    }
    if (!item) return;
    const newItem = item;
    setAddValue((p) => ({ ...p, [m.id]: "" }));
    setAddUrl((p) => ({ ...p, [m.id]: "" }));
    setAddTitle((p) => ({ ...p, [m.id]: "" }));
    await run(() => createModuleItemAction(courseUrl, m.id, newItem, acronym), "Could not add the item.");
    reload();
  };

  // Upload dropped/picked files straight into a module, tracking each file's
  // status, then refresh so the new File items appear.
  const handleModuleFiles = async (m: CanvasModule, list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setUploads((u) => ({ ...u, [m.id]: arr.map((f) => ({ name: f.name, status: "uploading" as const })) }));
    for (let i = 0; i < arr.length; i++) {
      try {
        await uploadFileToModule(courseUrl, acronym, m.id, arr[i]);
        setUploads((u) => ({
          ...u,
          [m.id]: (u[m.id] ?? []).map((row, idx) => (idx === i ? { ...row, status: "done" } : row)),
        }));
      } catch (err) {
        setUploads((u) => ({
          ...u,
          [m.id]: (u[m.id] ?? []).map((row, idx) =>
            idx === i ? { ...row, status: "error", error: err instanceof Error ? err.message : "Failed" } : row
          ),
        }));
      }
    }
    reload();
  };

  const arrowBtn = (label: string, onClick: () => void, disabled: boolean) => (
    <button
      type="button"
      className={styles.ccIconBtn}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {label === "Move up" ? "↑" : "↓"}
    </button>
  );

  return (
    <div className={styles.form}>
      <div className={styles.ccStickyHeader}>
        <div
          className={styles.ccHeaderBody}
          ref={headerBodyRef}
          style={headerHeight != null ? { maxHeight: headerHeight, overflowY: "auto" } : undefined}
        >
        <div className={styles.ccHeaderTop}>
          <h2 className={styles.ccCourseTitle}>{courseName || "Course content"}</h2>
          <div className={styles.ccBarGroup}>
            <span className={styles.ccBarLabel}>Course copy</span>
            <button
              type="button"
              className={styles.ccBarBtn}
              onClick={onExport}
              disabled={!canCopy}
              title="Copy this course's content into other courses"
            >
              Copy to…
            </button>
            <button
              type="button"
              className={styles.ccBarBtn}
              onClick={onImport}
              disabled={!canCopy}
              title="Import another course's content into this one"
            >
              Import from…
            </button>
            <span className={styles.ccBarDivider} aria-hidden="true" />
            <button
              type="button"
              className={styles.ccBarBtn}
              onClick={reload}
              disabled={busy || refreshing}
              title="Reload this course's content"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <input
          type="search"
          className={styles.textInput}
          placeholder="Search modules and their items by name…"
          value={moduleSearch}
          onChange={(e) => setModuleSearch(e.target.value)}
        />
      <div className={styles.ccBar}>
        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Select</span>
          <label className={styles.ccBarCheck}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={allKeys.length === 0} />
            Items
          </label>
          <label className={styles.ccBarCheck}>
            <input
              type="checkbox"
              checked={allModulesSelected}
              onChange={toggleAllModules}
              disabled={visibleModules.length === 0}
            />
            Modules
          </label>
          <select
            className={styles.ccBarSelect}
            style={{ maxWidth: 150 }}
            value=""
            disabled={visibleModules.length === 0}
            onChange={(e) => selectByKind(e.target.value)}
            aria-label="Select all items of a type"
          >
            <option value="">By type…</option>
            <option value="Graded">Graded items</option>
            <option value="Assignment">Assignments</option>
            <option value="Quiz">Quizzes</option>
            <option value="Discussion">Discussions</option>
            <option value="Page">Pages</option>
            <option value="File">Files</option>
          </select>
        </div>

        <span className={styles.ccBarDivider} aria-hidden="true" />

        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Files</span>
          <button type="button" className={styles.ccBarBtn} onClick={() => setBulkUploadOpen(true)} disabled={busy || modules.length === 0}>
            Bulk upload
          </button>
        </div>

        <span className={styles.ccBarDivider} aria-hidden="true" />

        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Modules</span>
          <button type="button" className={styles.ccBarBtn} onClick={() => setRenameOpen(true)} disabled={busy || modules.length === 0}>
            Rename
          </button>
          <button type="button" className={styles.ccBarBtn} onClick={() => setScheduleOpen(true)} disabled={busy || modules.length === 0}>
            Schedule due dates
          </button>
        </div>

        <span className={styles.ccBarDivider} aria-hidden="true" />

        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Rubrics</span>
          <button type="button" className={styles.ccBarBtn} onClick={() => setRubricBuilder({ assignments: [] })}>
            New
          </button>
          <select
            className={styles.ccBarSelect}
            style={{ maxWidth: 180 }}
            value={editRubricId}
            disabled={rubrics.length === 0}
            onChange={(e) => setEditRubricId(e.target.value === "" ? "" : Number(e.target.value))}
            aria-label="Rubric to edit"
          >
            <option value="">{rubrics.length === 0 ? "No rubrics" : "Edit…"}</option>
            {rubrics.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.ccBarBtn}
            disabled={editRubricId === ""}
            onClick={() => editRubricId !== "" && setRubricBuilder({ assignments: [], editRubricId: Number(editRubricId) })}
          >
            Edit
          </button>
        </div>
      </div>

      {(selected.size > 0 || selectedModules.size > 0) && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkBarHead}>
            <span className={styles.bulkCount}>
              {[
                selectedModules.size > 0
                  ? `${selectedModules.size} module${selectedModules.size === 1 ? "" : "s"}`
                  : "",
                selected.size > 0 ? `${selected.size} item${selected.size === 1 ? "" : "s"}` : "",
              ]
                .filter(Boolean)
                .join(", ")}{" "}
              selected
            </span>
            <button type="button" className={styles.bulkClear} onClick={clearSelection}>
              Clear
            </button>
          </div>

          {selectedModules.size > 0 && (
            <>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Modules</span>
                <button type="button" className={styles.bulkBtn} disabled={opBusy} onClick={() => bulkPublishModules(true)}>
                  Publish
                </button>
                <button type="button" className={styles.bulkBtn} disabled={opBusy} onClick={() => bulkPublishModules(false)}>
                  Unpublish
                </button>
                <button
                  type="button"
                  className={styles.bulkBtnDanger}
                  disabled={opBusy}
                  onClick={bulkDeleteModules}
                  title="Delete the selected modules"
                >
                  {confirmDeleteModules ? "Confirm delete" : "Delete"}
                </button>
              </div>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Add to each</span>
                <select
                  className={styles.bulkSelect}
                  value={bulkAddType}
                  onChange={(e) => {
                    const t = e.target.value;
                    setBulkAddType(t);
                    if (t === "File") ensureTargets();
                  }}
                  aria-label="Type of item to add to each selected module"
                >
                  <option value="Assignment">Assignment</option>
                  <option value="Quiz">Quiz</option>
                  <option value="Discussion">Discussion</option>
                  <option value="Page">Page</option>
                  <option value="File">File</option>
                  <option value="SubHeader">Text header</option>
                </select>
                <input
                  type="text"
                  className={styles.bulkInput}
                  style={{ flex: "1 1 200px", minWidth: 170 }}
                  placeholder={
                    bulkAddType === "File"
                      ? "File name pattern (for an AI-generated file)"
                      : "Name pattern, e.g. {module} - Homework"
                  }
                  value={bulkAddPattern}
                  onChange={(e) => setBulkAddPattern(e.target.value)}
                  aria-label="Name pattern for the new items"
                />
                <button
                  type="button"
                  className={styles.bulkBtnPrimary}
                  disabled={
                    opBusy ||
                    bulkAiBusy ||
                    (bulkAddType === "File"
                      ? (bulkAddFileContent.trim() === "" && bulkAddFileId === "") ||
                        (bulkAddFileContent.trim() !== "" && !bulkAddPattern.trim())
                      : !bulkAddPattern.trim())
                  }
                  onClick={bulkAddToModules}
                  title="Add one new item to each selected module"
                >
                  Add
                </button>
                <span className={styles.bulkHint}>
                  {"{module}"} = module name, {"{n}"} = week/module number from the title (e.g. &quot;Week 5&quot; -&gt; 5). New items are unpublished.
                </span>
              </div>
              {bulkAddType === "File" && (
                <div className={styles.bulkRow}>
                  <span className={styles.bulkLabel}>File</span>
                  <span className={styles.bulkField}>
                    <span className={styles.bulkFieldLabel}>New file</span>
                    <select
                      className={styles.bulkSelect}
                      value={bulkAddFileFormat}
                      onChange={(e) => setBulkAddFileFormat(e.target.value === "pptx" ? "pptx" : "docx")}
                      aria-label="Format of the generated file"
                    >
                      <option value="docx">Word (.docx)</option>
                      <option value="pptx">PowerPoint (.pptx)</option>
                    </select>
                  </span>
                  <select
                    className={styles.bulkSelect}
                    style={{ flex: "1 1 200px", maxWidth: 300 }}
                    value={bulkAddFileId}
                    disabled={opBusy || bulkAddFileContent.trim() !== "" || optionsFor("File").length === 0}
                    onChange={(e) => setBulkAddFileId(e.target.value === "" ? "" : Number(e.target.value))}
                    aria-label="Existing file to add to each module"
                  >
                    <option value="">{`or pick existing — ${contentPlaceholder("File")}`}</option>
                    {optionsFor("File").map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {bulkAddFileContent.trim() !== "" && (
                    <button type="button" className={styles.bulkBtn} onClick={() => setBulkAddFileContent("")}>
                      Discard AI file
                    </button>
                  )}
                  <span className={styles.bulkHint}>
                    Add an existing course file to every selected module, or generate a new{" "}
                    {bulkAddFileFormat === "pptx" ? "PowerPoint deck" : "Word document"} with AI below
                    (built into a branded {bulkAddFileFormat === "pptx" ? ".pptx" : ".docx"} named with the pattern).
                  </span>
                </div>
              )}
              {["Assignment", "Quiz", "Discussion"].includes(bulkAddType) && (
                <div className={styles.bulkRow}>
                  <span className={styles.bulkLabel}>Details</span>
                  <span className={styles.bulkField}>
                    <span className={styles.bulkFieldLabel}>Due</span>
                    <input
                      type="datetime-local"
                      className={styles.bulkInput}
                      style={{ width: 188 }}
                      value={bulkAddDue}
                      onChange={(e) => setBulkAddDue(e.target.value)}
                      aria-label="First due date for the new items"
                    />
                  </span>
                  <span className={styles.bulkField}>
                    <span className={styles.bulkFieldLabel}>then every</span>
                    <input
                      type="number"
                      min={0}
                      className={styles.bulkInput}
                      style={{ width: 52 }}
                      value={bulkAddStaggerOffset}
                      onChange={(e) => setBulkAddStaggerOffset(Number(e.target.value))}
                      aria-label="Stagger interval between modules"
                    />
                    <select
                      className={styles.bulkSelect}
                      value={bulkAddStaggerUnit}
                      onChange={(e) => setBulkAddStaggerUnit(e.target.value === "days" ? "days" : "weeks")}
                      aria-label="Stagger interval unit"
                    >
                      <option value="weeks">weeks</option>
                      <option value="days">days</option>
                    </select>
                  </span>
                  {["Assignment", "Quiz"].includes(bulkAddType) && (
                    <span className={styles.bulkField}>
                      <input
                        type="number"
                        className={styles.bulkInput}
                        style={{ width: 74 }}
                        placeholder="points"
                        value={bulkAddPoints}
                        onChange={(e) => setBulkAddPoints(e.target.value)}
                        aria-label="Points for the new items"
                      />
                    </span>
                  )}
                  {bulkAddType === "Assignment" && (
                    <span className={styles.bulkField}>
                      <select
                        className={styles.bulkSelect}
                        style={{ maxWidth: 170 }}
                        value={bulkAddRubricId}
                        disabled={rubrics.length === 0}
                        onChange={(e) => setBulkAddRubricId(e.target.value === "" ? "" : Number(e.target.value))}
                        aria-label="Rubric for the new items"
                      >
                        <option value="">{rubrics.length === 0 ? "No rubrics" : "Rubric…"}</option>
                        {rubrics.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title}
                          </option>
                        ))}
                      </select>
                    </span>
                  )}
                  <span className={styles.bulkHint}>
                    Optional. Due date, points, and rubric are written to every item created above; the
                    stagger pushes each later module&apos;s due date out by the interval (0 = same date).
                  </span>
                </div>
              )}
              {["Assignment", "Quiz", "Discussion", "Page", "File"].includes(bulkAddType) && (
                <div className={styles.bulkRow}>
                  <span className={styles.bulkLabel}>
                    {bulkAddType === "Page"
                      ? "Body"
                      : bulkAddType === "File"
                        ? bulkAddFileFormat === "pptx"
                          ? "Slides"
                          : "File content"
                        : "Description"}
                  </span>
                  <textarea
                    value={bulkAddType === "File" ? bulkAddFileContent : bulkAddDescription}
                    onChange={(e) =>
                      bulkAddType === "File"
                        ? setBulkAddFileContent(e.target.value)
                        : setBulkAddDescription(e.target.value)
                    }
                    placeholder={
                      bulkAddType === "Page"
                        ? "Page body (HTML allowed) — written to every new page"
                        : bulkAddType === "File"
                          ? bulkAddFileFormat === "pptx"
                            ? "Slides — # Presentation title, then ## Slide title with - bullets. Generate with AI below or write them here; built into a .pptx. Leave empty to use the picked file"
                            : "Document text (use # Title, ## Section, - bullets) — generate with AI below or write it here; built into a .docx. Leave empty to use the picked file"
                          : "Description (HTML allowed) — written to every new item"
                    }
                    spellCheck
                    aria-label={bulkAddType === "File" ? "File content for the new files" : "Description for the new items"}
                    style={{
                      flexBasis: "100%",
                      width: "100%",
                      minHeight: 72,
                      padding: "8px 10px",
                      border: "1px solid var(--field-border)",
                      borderRadius: 8,
                      background: "var(--field-background)",
                      color: "var(--text-primary)",
                      font: "inherit",
                      fontSize: "0.83rem",
                    }}
                  />
                </div>
              )}
              {bulkAddType === "Quiz" && (
                <div className={styles.bulkRow}>
                  <span className={styles.bulkLabel}>Questions</span>
                  <button type="button" className={styles.bulkBtn} onClick={() => setBulkQuestionsOpen(true)}>
                    Edit questions{bulkAddQuestions.length > 0 ? ` (${bulkAddQuestions.length})` : ""}
                  </button>
                  {bulkAddQuestions.length > 0 && (
                    <button type="button" className={styles.bulkBtn} onClick={() => setBulkAddQuestions([])}>
                      Clear
                    </button>
                  )}
                  <span className={styles.bulkHint}>
                    Composed once here and created in every new quiz.
                  </span>
                </div>
              )}
              {bulkAddType !== "SubHeader" && (
                <div className={styles.bulkRow}>
                  <span className={styles.bulkLabel}>AI</span>
                  <input
                    type="text"
                    className={styles.bulkInput}
                    style={{ flex: "1 1 260px", minWidth: 200 }}
                    placeholder={
                      bulkAddType === "File"
                        ? bulkAddFileFormat === "pptx"
                          ? "Describe the deck to generate, e.g. an intro to photosynthesis"
                          : "Describe the document to generate, e.g. a one-page study guide on photosynthesis"
                        : `Describe the ${bulkAddType.toLowerCase()} content to generate`
                    }
                    value={bulkAiPrompt}
                    onChange={(e) => setBulkAiPrompt(e.target.value)}
                    aria-label="AI prompt for the new content"
                  />
                  <button
                    type="button"
                    className={styles.bulkBtn}
                    disabled={bulkAiBusy || opBusy || !bulkAiPrompt.trim()}
                    onClick={() => void bulkAiGenerate()}
                  >
                    {bulkAiBusy ? "Generating…" : "Generate with AI"}
                  </button>
                  <span className={styles.bulkHint}>
                    {bulkAddType === "File"
                      ? bulkAddFileFormat === "pptx"
                        ? "Generates the slides above; review them, then Add to build a branded .pptx for every module."
                        : "Generates the document text above; review it, then Add to build a branded .docx for every module."
                      : "Fills the description/body above with generated HTML; review it, then Add."}
                  </span>
                </div>
              )}
            </>
          )}

          {selected.size > 0 && (
            <>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Items</span>
                <button type="button" className={styles.bulkBtn} disabled={opBusy} onClick={() => bulkPublish(true)}>
                  Publish
                </button>
                <button type="button" className={styles.bulkBtn} disabled={opBusy} onClick={() => bulkPublish(false)}>
                  Unpublish
                </button>
                {selected.size === 1 &&
                  (() => {
                    const one = selectedItems()[0];
                    if (!one) return null;
                    const it = one.item;
                    if (["Assignment", "Quiz", "Discussion"].includes(it.type) && it.contentId != null) {
                      return (
                        <button type="button" className={styles.bulkBtn} onClick={() => setEditingItem(it)} title="Edit every attribute of this item">
                          Edit in detail
                        </button>
                      );
                    }
                    if (it.type === "Page" && it.pageUrl) {
                      return (
                        <button type="button" className={styles.bulkBtn} onClick={() => onEditPage(it.pageUrl!)} title="Edit this page">
                          Edit page
                        </button>
                      );
                    }
                    return null;
                  })()}
              </div>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Content</span>
                {descSharedState === "loading" && (
                  <span className={styles.bulkFieldLabel}>Checking descriptions…</span>
                )}
                {descSharedState === "same" && (
                  <span className={styles.bulkFieldLabel}>Loaded the shared description — edits apply to all.</span>
                )}
                {descSharedState === "mixed" && (
                  <span className={styles.bulkFieldLabel}>Selected items have different descriptions; typing replaces them all.</span>
                )}
                <textarea
                  value={bulkItemsDescription}
                  onChange={(e) => setBulkItemsDescription(e.target.value)}
                  placeholder="Description (HTML allowed) — replaces the description on selected items / the body of selected pages"
                  spellCheck
                  aria-label="Description to set on the selected items"
                  style={{
                    flexBasis: "100%",
                    width: "100%",
                    minHeight: 64,
                    padding: "8px 10px",
                    border: "1px solid var(--field-border)",
                    borderRadius: 8,
                    background: "var(--field-background)",
                    color: "var(--text-primary)",
                    font: "inherit",
                    fontSize: "0.83rem",
                  }}
                />
                <button type="button" className={styles.bulkBtnPrimary} disabled={opBusy} onClick={bulkSetDescription}>
                  Set description
                </button>
                <span className={styles.bulkField}>
                  <button type="button" className={styles.bulkBtn} onClick={() => setBulkItemsQuestionsOpen(true)}>
                    Edit questions{bulkItemsQuestions.length > 0 ? ` (${bulkItemsQuestions.length})` : ""}
                  </button>
                  <button type="button" className={styles.bulkBtn} disabled={opBusy || bulkItemsQuestions.length === 0} onClick={bulkAddQuestionsToQuizzes}>
                    Add to selected quizzes
                  </button>
                </span>
                <span className={styles.bulkHint}>
                  Set description overwrites the description on selected assignments, quizzes, and discussions (and
                  the body of selected pages). Questions are appended to every selected quiz.
                </span>
              </div>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Due dates</span>
                <input
                  type="datetime-local"
                  className={styles.bulkInput}
                  style={{ width: 188 }}
                  value={bulkDue}
                  onChange={(e) => setBulkDue(e.target.value)}
                  aria-label="Due date"
                />
                <button type="button" className={styles.bulkBtnPrimary} disabled={opBusy} onClick={bulkSetDue} title="Set this due date on all selected gradables">
                  Set
                </button>
                <span className={styles.bulkField}>
                  <input
                    type="number"
                    className={styles.bulkInput}
                    style={{ width: 56 }}
                    value={bulkShift}
                    onChange={(e) => setBulkShift(Number(e.target.value))}
                    aria-label="Days to shift"
                  />
                  <button type="button" className={styles.bulkBtn} disabled={opBusy} onClick={bulkShiftDue}>
                    Shift days
                  </button>
                </span>
                <span className={styles.bulkField}>
                  <input
                    type="number"
                    min={0}
                    className={styles.bulkInput}
                    style={{ width: 52 }}
                    value={bulkStaggerOffset}
                    onChange={(e) => setBulkStaggerOffset(Number(e.target.value))}
                    aria-label="Stagger interval"
                  />
                  <select
                    className={styles.bulkSelect}
                    value={bulkStaggerUnit}
                    onChange={(e) => setBulkStaggerUnit(e.target.value === "days" ? "days" : "weeks")}
                    aria-label="Stagger interval unit"
                  >
                    <option value="weeks">weeks</option>
                    <option value="days">days</option>
                  </select>
                  <button type="button" className={styles.bulkBtn} disabled={opBusy} onClick={bulkStaggerDue}>
                    Stagger
                  </button>
                </span>
                <span className={styles.bulkHint}>
                  Stagger gives the earliest selected module the date above, then adds the interval for each later module.
                </span>
              </div>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Grading</span>
                <span className={styles.bulkField}>
                  <input
                    type="number"
                    className={styles.bulkInput}
                    style={{ width: 74 }}
                    placeholder="points"
                    value={bulkPoints}
                    onChange={(e) => setBulkPoints(e.target.value)}
                    aria-label="Points"
                  />
                  <button type="button" className={styles.bulkBtn} disabled={opBusy} onClick={bulkSetPoints}>
                    Set points
                  </button>
                </span>
                <span className={styles.bulkField}>
                  <select
                    className={styles.bulkSelect}
                    style={{ maxWidth: 170 }}
                    value={bulkRubricId}
                    disabled={rubrics.length === 0}
                    onChange={(e) => setBulkRubricId(e.target.value === "" ? "" : Number(e.target.value))}
                    aria-label="Rubric"
                  >
                    <option value="">{rubrics.length === 0 ? "No rubrics" : "Rubric…"}</option>
                    {rubrics.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={styles.bulkBtn} disabled={opBusy || bulkRubricId === ""} onClick={bulkRubric}>
                    Associate
                  </button>
                  <button
                    type="button"
                    className={styles.bulkBtn}
                    disabled={opBusy || bulkRubricId === ""}
                    onClick={() => bulkRubricId !== "" && setRubricBuilder({ assignments: [], editRubricId: Number(bulkRubricId) })}
                  >
                    Edit
                  </button>
                </span>
                <button type="button" className={styles.bulkBtn} disabled={opBusy} onClick={openRubricBuilder}>
                  New rubric
                </button>
              </div>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Move</span>
                <span className={styles.bulkField}>
                  <input
                    type="number"
                    min={1}
                    className={styles.bulkInput}
                    style={{ width: 56 }}
                    value={bulkModuleShift}
                    onChange={(e) => setBulkModuleShift(Number(e.target.value))}
                    aria-label="Modules to shift by"
                  />
                  <button type="button" className={styles.bulkBtn} disabled={opBusy} onClick={() => bulkShiftModules(-1)}>
                    Shift up
                  </button>
                  <button type="button" className={styles.bulkBtn} disabled={opBusy} onClick={() => bulkShiftModules(1)}>
                    Shift down
                  </button>
                </span>
                <span className={styles.bulkField}>
                  <select
                    className={styles.bulkSelect}
                    style={{ maxWidth: 190 }}
                    value={bulkTargetModule}
                    disabled={modules.length === 0}
                    onChange={(e) => setBulkTargetModule(e.target.value === "" ? "" : Number(e.target.value))}
                    aria-label="Module to move items into"
                  >
                    <option value="">{modules.length === 0 ? "No modules" : "Move to module…"}</option>
                    {modules.map((mod) => (
                      <option key={mod.id} value={mod.id}>
                        {mod.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={styles.bulkBtn} disabled={opBusy || bulkTargetModule === ""} onClick={bulkMoveToModule} title="Move selected items into this module">
                    Move
                  </button>
                </span>
                <button type="button" className={styles.bulkBtn} disabled={opBusy} onClick={bulkRemoveFromModule} title="Remove selected items from their module">
                  Remove
                </button>
                <button type="button" className={styles.bulkBtnDanger} disabled={opBusy} onClick={bulkDeleteContent}>
                  {confirmDeleteContent ? "Confirm delete" : "Delete from Canvas"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
        </div>
        <div
          className={styles.ccHeaderResize}
          onPointerDown={onResizeStart}
          onDoubleClick={() => setHeaderHeight(null)}
          role="separator"
          aria-orientation="horizontal"
          title="Drag to make the header shorter; double-click to reset"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="content-new-module">Add a module</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            id="content-new-module"
            type="text"
            className={styles.textInput}
            style={{ flex: "1 1 240px" }}
            placeholder="New module name"
            value={newModuleName}
            onChange={(e) => setNewModuleName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddModule();
            }}
          />
          <button
            type="button"
            className={styles.downloadButton}
            onClick={handleAddModule}
            disabled={busy || !newModuleName.trim()}
          >
            Add module
          </button>
        </div>
      </div>

      {modules.length === 0 && <p className={styles.emptyState}>This course has no modules yet.</p>}

      {moduleSearchLc && modules.length > 0 && !modules.some(moduleMatches) && (
        <p className={styles.emptyState}>No modules or items match &quot;{moduleSearch.trim()}&quot;.</p>
      )}

      {modules.map((m, mi) => {
        if (!moduleMatches(m)) return null;
        const open = expanded.has(m.id);
        const moduleItemsSelected = m.items.length > 0 && m.items.every((it) => selected.has(itemKey(m.id, it.id)));
        return (
          <div
            key={m.id}
            ref={(el) => {
              if (el) moduleNodes.current.set(m.id, el);
              else moduleNodes.current.delete(m.id);
            }}
            className={styles.ccModule}
            onDragOver={(e) => {
              if (moduleDrag !== null) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverModuleRow(m.id);
              }
            }}
            onDragLeave={() => setDragOverModuleRow((cur) => (cur === m.id ? null : cur))}
            onDrop={(e) => {
              if (moduleDrag !== null) {
                e.preventDefault();
                performModuleMove(m.id);
              }
            }}
            style={{
              opacity: moduleDrag === m.id ? 0.55 : 1,
              boxShadow: moduleDrag === m.id ? "0 8px 20px rgba(15, 23, 42, 0.16)" : undefined,
              outline:
                dragOverModuleRow === m.id && moduleDrag !== null && moduleDrag !== m.id
                  ? "2px solid var(--accent)"
                  : undefined,
              outlineOffset: -1,
            }}
          >
            <div
              className={styles.ccHead}
              style={{ cursor: "pointer" }}
              onClick={(e) => rowBlankClick(e, () => toggleModuleSelected(m.id))}
              onDragOver={(e) => {
                if (drag) e.preventDefault();
              }}
              onDrop={(e) => {
                if (drag) {
                  e.preventDefault();
                  performMove(m.id, null);
                }
              }}
            >
              <span
                draggable
                onDragStart={(e) => {
                  setModuleDrag(m.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", `module-${m.id}`);
                }}
                onDragEnd={() => {
                  setModuleDrag(null);
                  setDragOverModuleRow(null);
                }}
                className={styles.ccGrip}
                title="Drag to reorder modules"
                aria-label="Drag to reorder module"
                style={moduleDrag === m.id ? { cursor: "grabbing", color: "var(--accent)" } : undefined}
              >
                ⠿
              </span>
              <input
                type="checkbox"
                className={styles.ccCheckbox}
                checked={selectedModules.has(m.id)}
                onChange={() => toggleModuleSelected(m.id)}
                aria-label={`Select module ${m.name}`}
                title="Select this module"
              />
              <button
                type="button"
                className={styles.ccIconBtn}
                onClick={() => onToggleExpand(m.id)}
                aria-expanded={open}
                aria-label={open ? "Collapse module" : "Expand module"}
              >
                {open ? "▾" : "▸"}
              </button>
              <button
                type="button"
                className={`${styles.ccBtn} ${styles.ccBtnGhost}`}
                onClick={() => toggleModuleItems(m)}
                disabled={m.items.length === 0}
                title={moduleItemsSelected ? "Deselect every item in this module" : "Select every item in this module"}
              >
                {moduleItemsSelected ? "Deselect items" : "Select items"}
              </button>
              <input
                type="text"
                className={styles.ccName}
                title={m.name}
                value={drafts[`m${m.id}`] ?? m.name}
                onChange={(e) => setDrafts((p) => ({ ...p, [`m${m.id}`]: e.target.value }))}
                onBlur={() => void saveModuleName(m)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
              <span className={styles.ccCount}>
                {m.items.length} item{m.items.length === 1 ? "" : "s"}
              </span>
              {arrowBtn("Move up", () => moveModule(mi, -1), busy || mi === 0)}
              {arrowBtn("Move down", () => moveModule(mi, 1), busy || mi === modules.length - 1)}
              <PublishToggle published={m.published} disabled={busy} onClick={() => toggleModule(m)} />
              <a
                href={`${courseBase}/modules#context_module_${m.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.ccIconBtn}
                title="Open on Canvas"
                aria-label="Open module on Canvas"
              >
                ↗
              </a>
              <button
                type="button"
                className={`${styles.ccBtn} ${styles.ccBtnDanger}`}
                onClick={() => void removeModule(m)}
                disabled={busy}
              >
                {confirmId === `m${m.id}` ? "Confirm delete" : "Delete"}
              </button>
            </div>

            {open && (
              <div className={styles.ccItems}>
                {m.items.length === 0 && (
                  <p className={styles.ccHint} style={{ padding: "4px 6px" }}>
                    No items in this module.
                  </p>
                )}
                {m.items.map((it, ii) => !itemVisible(m, it) ? null : (
                  <div
                    key={it.id}
                    ref={(el) => {
                      if (el) itemNodes.current.set(it.id, el);
                      else itemNodes.current.delete(it.id);
                    }}
                    className={styles.ccItem}
                    onClick={(e) => rowBlankClick(e, () => toggleItemSelected(m.id, it.id))}
                    onDragOver={(e) => {
                      if (drag) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverItem(it.id);
                      }
                    }}
                    onDragLeave={() => setDragOverItem((cur) => (cur === it.id ? null : cur))}
                    onDrop={(e) => {
                      if (drag) {
                        e.preventDefault();
                        e.stopPropagation();
                        performMove(m.id, it.id);
                      }
                    }}
                    style={{
                      cursor: "pointer",
                      marginLeft: it.indent * 18,
                      boxShadow:
                        dragOverItem === it.id
                          ? "inset 0 2px 0 var(--accent)"
                          : isDraggingItem(m.id, it.id)
                            ? "0 4px 12px rgba(15, 23, 42, 0.12)"
                            : undefined,
                      background:
                        dragOverItem === it.id
                          ? "var(--accent-soft-strong)"
                          : isDraggingItem(m.id, it.id)
                            ? "var(--accent-soft)"
                            : undefined,
                      opacity: isDraggingItem(m.id, it.id) ? 0.55 : 1,
                    }}
                  >
                    <span
                      draggable
                      onDragStart={(e) => {
                        setDrag({ moduleId: m.id, itemId: it.id });
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(it.id));
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setDragOverItem(null);
                        setDragOverModule(null);
                      }}
                      className={styles.ccGrip}
                      title="Drag to reorder or move between modules"
                      aria-label="Drag to reorder"
                      style={isDraggingItem(m.id, it.id) ? { cursor: "grabbing", color: "var(--accent)" } : undefined}
                    >
                      ⠿
                    </span>
                    <input
                      type="checkbox"
                      className={styles.ccCheckbox}
                      checked={selected.has(itemKey(m.id, it.id))}
                      onChange={() => toggleItemSelected(m.id, it.id)}
                      aria-label={`Select ${it.title}`}
                    />
                    {["Assignment", "Quiz", "Discussion"].includes(it.type) && it.contentId != null ? (
                      typeEdit === it.id ? (
                        <select
                          className={styles.ccType}
                          autoFocus
                          style={{ cursor: "pointer", fontFamily: "inherit" }}
                          value={it.type}
                          onChange={(e) => changeItemType(m, it, e.target.value as GradableKind)}
                          onBlur={() => setTypeEdit(null)}
                          aria-label="Change item type"
                        >
                          <option value="Assignment">ASSIGNMENT</option>
                          <option value="Quiz">QUIZ</option>
                          <option value="Discussion">DISCUSSION</option>
                        </select>
                      ) : (
                        <button
                          type="button"
                          className={styles.ccType}
                          style={{ cursor: "pointer", border: 0, fontFamily: "inherit" }}
                          onClick={() => setTypeEdit(it.id)}
                          disabled={busy}
                          title="Click to change type"
                        >
                          {it.type}
                        </button>
                      )
                    ) : (
                      <span className={styles.ccType}>{it.type || "Item"}</span>
                    )}
                    <input
                      type="text"
                      className={styles.ccItemName}
                      title={it.title}
                      value={drafts[`i${it.id}`] ?? it.title}
                      onChange={(e) => setDrafts((p) => ({ ...p, [`i${it.id}`]: e.target.value }))}
                      onBlur={() => void saveItemTitle(m, it)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                    <span className={styles.ccDueSlot}>
                      {DATED_TYPES.includes(it.type) &&
                        (dueEdit?.id === it.id ? (
                          <input
                            type="datetime-local"
                            className={styles.ccDueInput}
                            autoFocus
                            value={dueEdit.value}
                            onChange={(e) => setDueEdit({ id: it.id, value: e.target.value })}
                            onBlur={() => saveDueEdit(m, it)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setDueEdit(null);
                            }}
                            aria-label="Due date"
                          />
                        ) : it.dueAt ? (
                          <button
                            type="button"
                            className={`${styles.ccDue} ${new Date(it.dueAt).getTime() < Date.now() ? styles.ccDueOverdue : ""}`}
                            onClick={() => setDueEdit({ id: it.id, value: toLocalInput(it.dueAt) })}
                            disabled={busy || it.contentId == null}
                            title={`Due ${new Date(it.dueAt).toLocaleString()} — click to edit`}
                          >
                            Due {formatDueDate(it.dueAt)}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={`${styles.ccDue} ${styles.ccDueEmpty}`}
                            onClick={() => setDueEdit({ id: it.id, value: "" })}
                            disabled={busy || it.contentId == null}
                            title="Click to set a due date"
                          >
                            No due date
                          </button>
                        ))}
                    </span>
                    <span className={styles.ccPointsSlot}>
                      {DATED_TYPES.includes(it.type) &&
                        (pointsEdit?.id === it.id ? (
                          <input
                            type="number"
                            className={styles.ccDueInput}
                            autoFocus
                            value={pointsEdit.value}
                            onChange={(e) => setPointsEdit({ id: it.id, value: e.target.value })}
                            onBlur={() => savePointsEdit(m, it)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setPointsEdit(null);
                            }}
                            aria-label="Points"
                          />
                        ) : (
                          <button
                            type="button"
                            className={`${styles.ccDue} ${it.pointsPossible == null ? styles.ccDueEmpty : ""}`}
                            onClick={() =>
                              setPointsEdit({ id: it.id, value: it.pointsPossible != null ? String(it.pointsPossible) : "" })
                            }
                            disabled={busy || it.contentId == null || !POINTS_EDITABLE.includes(it.type)}
                            title={
                              POINTS_EDITABLE.includes(it.type)
                                ? "Click to edit points"
                                : "Points (edit on the assignment)"
                            }
                          >
                            {it.pointsPossible != null ? `${it.pointsPossible} pts` : "No points"}
                          </button>
                        ))}
                    </span>
                    <div className={styles.ccItemActions}>
                      {arrowBtn("Move up", () => moveItem(m, ii, -1), busy || ii === 0)}
                      {arrowBtn("Move down", () => moveItem(m, ii, 1), busy || ii === m.items.length - 1)}
                      <button
                        type="button"
                        className={styles.ccIconBtn}
                        onClick={() => indentItem(m, it, -1)}
                        disabled={busy || it.indent === 0}
                        title="Outdent"
                        aria-label="Outdent"
                      >
                        &lt;
                      </button>
                      <button
                        type="button"
                        className={styles.ccIconBtn}
                        onClick={() => indentItem(m, it, 1)}
                        disabled={busy || it.indent >= MAX_INDENT}
                        title="Indent"
                        aria-label="Indent"
                      >
                        &gt;
                      </button>
                      <span className={styles.ccActionsSep} aria-hidden="true" />
                      <ItemA11yBadge item={it} />
                      <PublishToggle published={it.published} disabled={busy} onClick={() => toggleItem(m, it)} />
                      {it.type === "Page" && it.pageUrl && (
                        <button type="button" className={styles.ccBtn} onClick={() => onEditPage(it.pageUrl!)}>
                          Edit page
                        </button>
                      )}
                      {it.type === "Assignment" && it.contentId != null && (
                        <button type="button" className={styles.ccBtn} onClick={() => setPreviewAssignment(it)}>
                          Preview
                        </button>
                      )}
                      {["Assignment", "Quiz", "Discussion"].includes(it.type) && it.contentId != null && (
                        <button type="button" className={styles.ccBtn} onClick={() => setEditingItem(it)}>
                          Edit
                        </button>
                      )}
                      {it.type === "File" && it.contentId != null && (
                        <button type="button" className={styles.ccBtn} onClick={() => void openFilePreview(it)}>
                          Preview
                        </button>
                      )}
                      {it.type === "File" && it.contentId != null && /\.(docx|pptx)$/i.test(it.title) && (
                        <button type="button" className={styles.ccBtn} onClick={() => setEditingFile(it)}>
                          Edit
                        </button>
                      )}
                      {(it.htmlUrl || it.externalUrl) && (
                        <a
                          href={(it.htmlUrl || it.externalUrl) as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.ccIconBtn}
                          title="Open on Canvas"
                          aria-label="Open on Canvas"
                        >
                          ↗
                        </a>
                      )}
                      <button
                        type="button"
                        className={`${styles.ccBtn} ${styles.ccBtnDanger}`}
                        onClick={() => void removeItem(m, it)}
                        disabled={busy}
                      >
                        {confirmId === `i${it.id}` ? "Confirm" : "Remove"}
                      </button>
                    </div>
                  </div>
                ))}

                {drag && (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverModule(m.id);
                    }}
                    onDragLeave={() => setDragOverModule((cur) => (cur === m.id ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      performMove(m.id, null);
                    }}
                    className={`${styles.ccDropEnd} ${dragOverModule === m.id ? styles.ccDropEndActive : ""}`}
                  >
                    Drop here to move to the end of this module
                  </div>
                )}

                <div className={styles.ccAddRow}>
                  <span className={styles.ccCount}>Add item</span>
                  <select
                    className={styles.bulkSelect}
                    style={{ maxWidth: 150 }}
                    value={addType[m.id] ?? "Page"}
                    onChange={(e) => {
                      const t = e.target.value;
                      setAddType((p) => ({ ...p, [m.id]: t }));
                      setAddValue((p) => ({ ...p, [m.id]: "" }));
                      if (TARGET_TYPES.includes(t)) ensureTargets();
                    }}
                    disabled={busy}
                    aria-label="Item type"
                  >
                    <option value="Page">Page</option>
                    <option value="Assignment">Assignment</option>
                    <option value="Quiz">Quiz</option>
                    <option value="Discussion">Discussion</option>
                    <option value="File">File</option>
                    <option value="ExternalUrl">External URL</option>
                    <option value="SubHeader">Text header</option>
                  </select>

                  {addType[m.id] === "File" && (
                    <select
                      className={styles.bulkSelect}
                      style={{ maxWidth: 150 }}
                      value={addFileFormat[m.id] ?? "docx"}
                      onChange={(e) =>
                        setAddFileFormat((p) => ({ ...p, [m.id]: e.target.value === "pptx" ? "pptx" : "docx" }))
                      }
                      disabled={busy}
                      aria-label="Format of the generated file"
                    >
                      <option value="docx">Word (.docx)</option>
                      <option value="pptx">PowerPoint (.pptx)</option>
                    </select>
                  )}

                  {CONTENT_TYPES.includes(addType[m.id] ?? "Page") && (
                    <select
                      className={styles.bulkSelect}
                      style={{ flex: "1 1 200px", maxWidth: 320 }}
                      value={addValue[m.id] ?? ""}
                      onChange={(e) => setAddValue((p) => ({ ...p, [m.id]: e.target.value }))}
                      disabled={
                        busy ||
                        optionsFor(addType[m.id] ?? "Page").length === 0 ||
                        (addType[m.id] === "File" && (addFileContent[m.id] ?? "").trim() !== "")
                      }
                      aria-label="Content to add"
                    >
                      <option value="">
                        {addType[m.id] === "File"
                          ? `or pick existing — ${contentPlaceholder("File")}`
                          : contentPlaceholder(addType[m.id] ?? "Page")}
                      </option>
                      {optionsFor(addType[m.id] ?? "Page").map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {addType[m.id] === "File" && (
                    <>
                      <input
                        type="text"
                        className={styles.bulkInput}
                        style={{ flex: "1 1 200px", minWidth: 160 }}
                        placeholder={
                          (addFileFormat[m.id] ?? "docx") === "pptx"
                            ? "Describe a deck to generate with AI"
                            : "Describe a document to generate with AI"
                        }
                        value={addAiPrompt[m.id] ?? ""}
                        onChange={(e) => setAddAiPrompt((p) => ({ ...p, [m.id]: e.target.value }))}
                        aria-label="AI prompt for the new file"
                      />
                      <button
                        type="button"
                        className={styles.ccBtn}
                        disabled={busy || !!addAiBusy[m.id] || !(addAiPrompt[m.id] ?? "").trim()}
                        onClick={() => void addAiGenerate(m)}
                      >
                        {addAiBusy[m.id] ? "Generating…" : "Generate with AI"}
                      </button>
                      {(addFileContent[m.id] ?? "").trim() !== "" && (
                        <>
                          <textarea
                            value={addFileContent[m.id] ?? ""}
                            onChange={(e) => setAddFileContent((p) => ({ ...p, [m.id]: e.target.value }))}
                            spellCheck
                            aria-label="Generated file content"
                            style={{
                              flexBasis: "100%",
                              width: "100%",
                              minHeight: 64,
                              padding: "8px 10px",
                              border: "1px solid var(--field-border)",
                              borderRadius: 8,
                              background: "var(--field-background)",
                              color: "var(--text-primary)",
                              font: "inherit",
                              fontSize: "0.83rem",
                            }}
                          />
                          <button
                            type="button"
                            className={styles.ccBtn}
                            onClick={() => setAddFileContent((p) => ({ ...p, [m.id]: "" }))}
                          >
                            Discard
                          </button>
                        </>
                      )}
                    </>
                  )}

                  {addType[m.id] === "ExternalUrl" && (
                    <>
                      <input
                        type="url"
                        className={styles.bulkInput}
                        style={{ flex: "1 1 200px", maxWidth: 280 }}
                        placeholder="https://example.com"
                        value={addUrl[m.id] ?? ""}
                        onChange={(e) => setAddUrl((p) => ({ ...p, [m.id]: e.target.value }))}
                      />
                      <input
                        type="text"
                        className={styles.bulkInput}
                        style={{ flex: "1 1 140px", maxWidth: 200 }}
                        placeholder="Link text (optional)"
                        value={addTitle[m.id] ?? ""}
                        onChange={(e) => setAddTitle((p) => ({ ...p, [m.id]: e.target.value }))}
                      />
                    </>
                  )}

                  {addType[m.id] === "SubHeader" && (
                    <input
                      type="text"
                      className={styles.bulkInput}
                      style={{ flex: "1 1 200px", maxWidth: 280 }}
                      placeholder="Header text"
                      value={addTitle[m.id] ?? ""}
                      onChange={(e) => setAddTitle((p) => ({ ...p, [m.id]: e.target.value }))}
                    />
                  )}

                  <button
                    type="button"
                    className={styles.bulkBtnPrimary}
                    onClick={() => void addItem(m)}
                    disabled={busy || !canAdd(m)}
                  >
                    Add
                  </button>
                </div>

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void handleModuleFiles(m, e.dataTransfer.files);
                  }}
                  className={styles.ccDrop}
                >
                  <span className={styles.ccHint}>Drop files to add to this module, or</span>
                  <label className={styles.ccBtn} style={{ cursor: "pointer" }}>
                    choose files
                    <input
                      type="file"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => {
                        if (e.target.files) void handleModuleFiles(m, e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {(uploads[m.id] ?? []).length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                    {(uploads[m.id] ?? []).map((row, idx) => (
                      <span
                        key={`${m.id}-up-${idx}`}
                        className={styles.ccHint}
                        style={{ color: row.status === "error" ? "var(--error, #b91c1c)" : undefined }}
                      >
                        {row.name}:{" "}
                        {row.status === "uploading"
                          ? "uploading…"
                          : row.status === "done"
                            ? "added"
                            : `failed (${row.error})`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {scheduleOpen && (
        <SchedulerModal
          courseUrl={courseUrl}
          acronym={acronym}
          modules={modules}
          onClose={() => setScheduleOpen(false)}
          onApplied={(message) => {
            setScheduleOpen(false);
            setNote({ kind: "success", text: message });
          }}
        />
      )}

      {bulkUploadOpen && (
        <BulkUploadModal
          courseUrl={courseUrl}
          acronym={acronym}
          modules={modules}
          onClose={() => setBulkUploadOpen(false)}
          onDone={reload}
        />
      )}

      {renameOpen && (
        <RenameModulesModal
          courseUrl={courseUrl}
          acronym={acronym}
          modules={modules}
          onClose={() => setRenameOpen(false)}
          onApplied={(message) => {
            setRenameOpen(false);
            setNote({ kind: "success", text: message });
            reload();
          }}
        />
      )}

      {bulkQuestionsOpen && (
        <BulkQuestionsModal
          questions={bulkAddQuestions}
          setQuestions={setBulkAddQuestions}
          onClose={() => setBulkQuestionsOpen(false)}
        />
      )}

      {bulkItemsQuestionsOpen && (
        <BulkQuestionsModal
          questions={bulkItemsQuestions}
          setQuestions={setBulkItemsQuestions}
          onClose={() => setBulkItemsQuestionsOpen(false)}
        />
      )}

      {editingItem && (
        <GradableEditorModal
          courseUrl={courseUrl}
          acronym={acronym}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={reload}
        />
      )}

      {filePreview && (
        <FilePreviewModal
          selectedPreview={filePreview.file}
          previewBlobUrl={filePreview.blobUrl}
          onClose={closeFilePreview}
        />
      )}

      {editingFile && editingFile.contentId != null && (
        <OfficeEditorModal
          courseUrl={courseUrl}
          acronym={acronym}
          fileId={editingFile.contentId}
          fileName={editingFile.title}
          onClose={() => setEditingFile(null)}
          onSaved={() => setNote({ kind: "success", text: "Saved to Canvas." })}
        />
      )}

      {rubricBuilder && (
        <RubricBuilderModal
          courseUrl={courseUrl}
          acronym={acronym}
          assignments={rubricBuilder.assignments}
          rubricId={rubricBuilder.editRubricId}
          onClose={() => setRubricBuilder(null)}
          onCreated={(title, associated) => {
            const editing = rubricBuilder.editRubricId != null;
            setRubricBuilder(null);
            void refreshRubrics();
            setNote({
              kind: "success",
              text: editing
                ? `Updated rubric "${title}".`
                : associated > 0
                  ? `Created "${title}" and associated it with ${associated} assignment${associated === 1 ? "" : "s"}.`
                  : `Created rubric "${title}".`,
            });
          }}
        />
      )}

      {previewAssignment && (
        <AssignmentPreviewModal
          courseUrl={courseUrl}
          acronym={acronym}
          item={previewAssignment}
          onClose={() => setPreviewAssignment(null)}
        />
      )}
    </div>
  );
}


// ── Tab shell ───────────────────────────────────────────────────────────────-

// ── Course copy / import ──────────────────────────────────────────────────────

// Content types that can be purged from a course before a copy. Each maps to the
// delete routine used in purgeDestination below.
const PURGE_TYPES: Array<{ key: string; label: string }> = [
  { key: "context_modules", label: "Modules" },
  { key: "assignments", label: "Assignments" },
  { key: "quizzes", label: "Quizzes" },
  { key: "discussion_topics", label: "Discussions" },
  { key: "wiki_pages", label: "Pages" },
  { key: "attachments", label: "Files" },
];

function CourseCopyModal({
  mode,
  courseUrl,
  currentCourseId,
  acronym,
  onClose,
  onDone,
}: {
  mode: "export" | "import";
  courseUrl: string;
  currentCourseId: string;
  acronym?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const isExport = mode === "export";
  const [courses, setCourses] = useState<Array<{ id: string; name: string }>>([]);
  const [coursesState, setCoursesState] = useState<"loading" | "ready" | "error">(acronym ? "loading" : "ready");
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [granularity, setGranularity] = useState<"all" | "types" | "items">("all");
  const [types, setTypes] = useState<Set<string>>(() => new Set(COURSE_COPY_TYPES.map((t) => t.key)));
  const [phase, setPhase] = useState<"setup" | "selecting" | "done">("setup");
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<SelectiveNode[]>([]);
  const [props, setProps] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [migration, setMigration] = useState<{ id: number; destId: string } | null>(null);
  // Optional "clear the destination first": which content types to delete and an
  // explicit confirmation (destructive, so gated behind both).
  const [purgeEnabled, setPurgeEnabled] = useState(false);
  const [purgeTypes, setPurgeTypes] = useState<Set<string>>(new Set());
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const purgeBlocked = purgeEnabled && (purgeTypes.size === 0 || !purgeConfirm);

  useEffect(() => {
    if (!acronym) return;
    let cancelled = false;
    (async () => {
      const r = await listCoursesAction(acronym);
      if (cancelled) return;
      if ("error" in r) {
        setError(r.error);
        setCoursesState("error");
        return;
      }
      setCourses(r.courses.filter((c) => c.id !== currentCourseId));
      setCoursesState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [acronym, currentCourseId]);

  const toggleIn = (set: Set<string>, key: string) => {
    const n = new Set(set);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    return n;
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // A course URL for some other course in this institution: the current URL with
  // its course id swapped out, so the existing course actions target it.
  const destUrlFor = (destCourseId: string) => courseUrl.replace(/\/courses\/\d+/, `/courses/${destCourseId}`);

  // Delete the chosen content types from one course before a copy runs. Best
  // effort: it lists each type's items and removes them; failures are skipped.
  const purgeDestination = async (destCourseId: string): Promise<void> => {
    const destUrl = destUrlFor(destCourseId);
    if (purgeTypes.has("context_modules")) {
      const content = await listCourseContentAction(destUrl, acronym);
      if (!("error" in content)) {
        for (const mod of content.modules) await deleteModuleAction(destUrl, mod.id, acronym);
      }
    }
    const kindMap: Array<[string, BulkKind]> = [
      ["assignments", "Assignment"],
      ["quizzes", "Quiz"],
      ["discussion_topics", "Discussion"],
      ["wiki_pages", "Page"],
    ];
    for (const [type, kind] of kindMap) {
      if (!purgeTypes.has(type)) continue;
      const list = await listBulkItemsAction(destUrl, kind, acronym);
      if (!("error" in list) && list.items.length > 0) {
        await bulkDeleteAction(destUrl, kind, list.items.map((i) => i.id), acronym);
      }
    }
    if (purgeTypes.has("attachments")) {
      const files = await listCourseFilesAction(destUrl, acronym);
      if (!("error" in files)) {
        for (const f of files.files) await deleteCourseFileAction(destUrl, f.id, acronym);
      }
    }
  };

  // Create the migration; for selective copies, poll until Canvas is ready to
  // accept a selection. Returns the migration id + destination, or null on error.
  const startMigration = async (selective: boolean, otherCourseId: string): Promise<{ id: number; destId: string } | null> => {
    const destId = isExport ? otherCourseId : currentCourseId;
    const sourceId = isExport ? currentCourseId : otherCourseId;
    setStatusText("Starting the copy in Canvas…");
    const created = await createCourseCopyAction(courseUrl, destId, sourceId, selective, acronym);
    if ("error" in created) {
      setError(created.error);
      return null;
    }
    if (!selective) return { id: created.migrationId, destId };
    setStatusText("Preparing the content selection…");
    for (let i = 0; i < 25; i++) {
      await sleep(1500);
      const st = await getMigrationStateAction(courseUrl, destId, created.migrationId, acronym);
      if ("error" in st) {
        setError(st.error);
        return null;
      }
      if (st.state === "waiting_for_select") return { id: created.migrationId, destId };
      if (st.state === "failed") {
        setError("Canvas could not prepare the copy.");
        return null;
      }
    }
    setError("Timed out preparing the copy. It may still be working in Canvas — try again shortly.");
    return null;
  };

  const start = async () => {
    const ids = [...selectedCourses];
    if (ids.length === 0) {
      setError("Choose at least one course.");
      return;
    }

    // Specific-item selection is interactive: prepare ONE migration to load the
    // selectable list, then (for export) the chosen items are submitted to every
    // selected course in submitItems. Importing draws items from a single source.
    if (granularity === "items") {
      if (!isExport && ids.length > 1) {
        setError("Pick a single course to import specific items from.");
        return;
      }
      setRunning(true);
      setError(null);
      const m = await startMigration(true, ids[0]);
      if (!m) {
        setRunning(false);
        return;
      }
      setStatusText("Loading items…");
      const data = await getSelectiveDataAction(courseUrl, m.destId, m.id, acronym);
      setRunning(false);
      if ("error" in data) {
        setError(data.error);
        return;
      }
      setNodes(data.nodes);
      setMigration(m);
      setPhase("selecting");
      setStatusText("");
      return;
    }

    const chosen = [...types];
    if (granularity === "types" && chosen.length === 0) {
      setError("Choose at least one content type.");
      return;
    }

    setRunning(true);
    setError(null);
    // Import clears the single destination (this course) once up front.
    if (purgeEnabled && !isExport) {
      setStatusText("Clearing this course…");
      await purgeDestination(currentCourseId);
    }
    let ok = 0;
    const failed: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const cid = ids[i];
      const name = courses.find((c) => c.id === cid)?.name ?? cid;
      if (purgeEnabled && isExport) {
        setStatusText(`Clearing ${name}…`);
        await purgeDestination(cid);
      }
      setStatusText(ids.length > 1 ? `Course ${i + 1} of ${ids.length}: ${name}…` : "Working…");
      const m = await startMigration(granularity === "types", cid);
      if (!m) {
        failed.push(name);
        continue;
      }
      if (granularity === "types") {
        const sel = await selectCopyTypesAction(courseUrl, m.destId, m.id, chosen, acronym);
        if ("error" in sel) {
          failed.push(name);
          continue;
        }
      }
      ok += 1;
    }
    setRunning(false);
    setPhase("done");
    setStatusText(
      failed.length === 0
        ? `Started ${ok} cop${ok === 1 ? "y" : "ies"}. Canvas is importing in the background.`
        : `Started ${ok}; failed for ${failed.length} (${failed.join(", ")}).`
    );
  };

  const submitItems = async () => {
    if (!migration) return;
    const chosen = [...props];
    if (chosen.length === 0) {
      setError("Select at least one item.");
      return;
    }
    setRunning(true);
    setError(null);

    // Import: one source into this course (optionally cleared first).
    if (!isExport) {
      if (purgeEnabled) {
        setStatusText("Clearing this course…");
        await purgeDestination(currentCourseId);
      }
      setStatusText("Submitting your selection…");
      const sel = await submitSelectiveImportAction(courseUrl, migration.destId, migration.id, chosen, acronym);
      setRunning(false);
      if ("error" in sel) {
        setError(sel.error);
        return;
      }
      setPhase("done");
      setStatusText("Copy started. Canvas is importing the selected items in the background.");
      return;
    }

    // Export: send the same selected items to every chosen destination. The first
    // already has a prepared migration; the rest get their own.
    const ids = [...selectedCourses];
    let ok = 0;
    const failed: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const cid = ids[i];
      const name = courses.find((c) => c.id === cid)?.name ?? cid;
      if (purgeEnabled) {
        setStatusText(`Clearing ${name}…`);
        await purgeDestination(cid);
      }
      setStatusText(ids.length > 1 ? `Course ${i + 1} of ${ids.length}: ${name}…` : "Submitting your selection…");
      let dest: { id: number; destId: string } | null = cid === migration.destId ? migration : null;
      if (!dest) {
        dest = await startMigration(true, cid);
        if (!dest) {
          failed.push(name);
          continue;
        }
      }
      const sel = await submitSelectiveImportAction(courseUrl, dest.destId, dest.id, chosen, acronym);
      if ("error" in sel) {
        failed.push(name);
        continue;
      }
      ok += 1;
    }
    setRunning(false);
    setPhase("done");
    setStatusText(
      failed.length === 0
        ? `Started ${ok} cop${ok === 1 ? "y" : "ies"} of ${chosen.length} item${chosen.length === 1 ? "" : "s"}. Canvas is importing in the background.`
        : `Started ${ok}; failed for ${failed.length} (${failed.join(", ")}).`
    );
  };

  const renderNode = (node: SelectiveNode, depth: number) => {
    const hasChildren = node.subItems.length > 0;
    const open = expanded.has(node.property);
    return (
      <div key={node.property} style={{ marginLeft: depth * 16 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "2px 0" }}>
          {hasChildren ? (
            <button type="button" className={styles.ccIconBtn} onClick={() => setExpanded((s) => toggleIn(s, node.property))} aria-label={open ? "Collapse" : "Expand"}>
              {open ? "▾" : "▸"}
            </button>
          ) : (
            <span style={{ width: 28, flexShrink: 0 }} />
          )}
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: 0 }}>
            <input type="checkbox" checked={props.has(node.property)} onChange={() => setProps((s) => toggleIn(s, node.property))} />
            {node.title}
            {typeof node.count === "number" && node.count > 0 && <span className={styles.ccCount}>({node.count})</span>}
          </label>
        </div>
        {open && hasChildren && node.subItems.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.previewModal} style={{ width: "min(640px, 94vw)", maxWidth: "none" }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.previewHeader}>
          <h3>{isExport ? "Copy this course to another" : "Import another course"}</h3>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "68vh", overflowY: "auto" }}>
          {phase === "done" ? (
            <>
              <p className={styles.fieldHint}>{statusText}</p>
              <button type="button" className={styles.submitButton} style={{ alignSelf: "flex-start" }} onClick={onDone}>
                Done
              </button>
            </>
          ) : phase === "selecting" ? (
            <>
              <p className={styles.fieldHint} style={{ margin: 0 }}>
                {isExport && selectedCourses.size > 1
                  ? `Choose the items to copy into all ${selectedCourses.size} selected courses.`
                  : "Choose the individual items to copy."}
              </p>
              <div style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: 10, maxHeight: "44vh", overflowY: "auto" }}>
                {nodes.length === 0 ? <p className={styles.fieldHint}>Canvas returned no selectable items.</p> : nodes.map((n) => renderNode(n, 0))}
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--card-border)" }}>
                <button type="button" className={styles.submitButton} onClick={() => void submitItems()} disabled={running || props.size === 0 || purgeBlocked}>
                  {running
                    ? "Working…"
                    : isExport && selectedCourses.size > 1
                      ? `Copy ${props.size} item${props.size === 1 ? "" : "s"} to ${selectedCourses.size} courses`
                      : `Copy ${props.size} selected`}
                </button>
                {statusText && <span className={styles.fieldHint} style={{ margin: 0 }}>{statusText}</span>}
              </div>
              {error && <p className={styles.error}>{error}</p>}
            </>
          ) : (
            <>
              <div className={styles.field}>
                <label>{isExport ? "Copy to these courses" : "Import from these courses"}</label>
                {coursesState === "loading" ? (
                  <p className={styles.fieldHint}>Loading courses…</p>
                ) : coursesState === "error" ? (
                  <p className={styles.error}>{error}</p>
                ) : courses.length === 0 ? (
                  <p className={styles.fieldHint}>No other courses on this institution.</p>
                ) : (
                  <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--field-border)", borderRadius: 10, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
                    {courses.map((c) => (
                      <label key={c.id} style={{ display: "inline-flex", gap: 8, alignItems: "center", margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedCourses.has(c.id)}
                          onChange={() => setSelectedCourses((s) => toggleIn(s, c.id))}
                          disabled={running}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                )}
                <p className={styles.fieldHint} style={{ margin: 0 }}>
                  {selectedCourses.size} selected.{" "}
                  {isExport ? "This course's content is copied into each." : "Each course's content is copied into this one."}
                </p>
              </div>

              <div className={styles.field}>
                <label htmlFor="copy-granularity">What to copy</label>
                <select
                  id="copy-granularity"
                  className={styles.textInput}
                  value={granularity}
                  onChange={(e) => setGranularity(e.target.value as "all" | "types" | "items")}
                  disabled={running}
                >
                  <option value="all">All content</option>
                  <option value="types">Specific content types</option>
                  <option value="items" disabled={!isExport && selectedCourses.size > 1}>
                    Specific items{!isExport && selectedCourses.size > 1 ? " (one source only)" : ""}
                  </option>
                </select>
              </div>

              {granularity === "types" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {COURSE_COPY_TYPES.map((t) => (
                    <label key={t.key} className={styles.fieldHint} style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: 0, flex: "0 0 140px" }}>
                      <input type="checkbox" checked={types.has(t.key)} onChange={() => setTypes((s) => toggleIn(s, t.key))} disabled={running} />
                      {t.label}
                    </label>
                  ))}
                </div>
              )}

              {granularity === "items" && (
                <p className={styles.fieldHint} style={{ margin: 0 }}>
                  {isExport
                    ? "Canvas prepares the content first; you'll pick the items, then they're copied into every selected course."
                    : "Canvas prepares the course first; you'll then pick the individual items."}
                </p>
              )}

              <div className={styles.field}>
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center", margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={purgeEnabled}
                    onChange={(e) => setPurgeEnabled(e.target.checked)}
                    disabled={running}
                  />
                  {isExport ? "Clear destination courses before copying" : "Clear this course before importing"}
                </label>
                {purgeEnabled && (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                      {PURGE_TYPES.map((t) => (
                        <label key={t.key} className={styles.fieldHint} style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: 0, flex: "0 0 130px" }}>
                          <input type="checkbox" checked={purgeTypes.has(t.key)} onChange={() => setPurgeTypes((s) => toggleIn(s, t.key))} disabled={running} />
                          {t.label}
                        </label>
                      ))}
                    </div>
                    <label style={{ display: "inline-flex", gap: 8, alignItems: "flex-start", marginTop: 8 }}>
                      <input
                        type="checkbox"
                        checked={purgeConfirm}
                        onChange={(e) => setPurgeConfirm(e.target.checked)}
                        disabled={running}
                      />
                      <span className={styles.fieldHint} style={{ margin: 0, color: "#b91c1c" }}>
                        Permanently delete the checked content from {isExport ? "each destination course" : "this course"}{" "}
                        before copying. This cannot be undone.
                      </span>
                    </label>
                  </>
                )}
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--card-border)" }}>
                <button type="button" className={styles.submitButton} onClick={() => void start()} disabled={running || selectedCourses.size === 0 || purgeBlocked}>
                  {running
                    ? "Working…"
                    : granularity === "items"
                      ? "Continue"
                      : isExport
                        ? `Copy to ${selectedCourses.size} course${selectedCourses.size === 1 ? "" : "s"}`
                        : "Import to this course"}
                </button>
                {running && statusText && <span className={styles.fieldHint} style={{ margin: 0 }}>{statusText}</span>}
              </div>
              {error && coursesState !== "error" && <p className={styles.error}>{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Files (CRUD on the course's Files area) ───────────────────────────────────

function FilesView({ courseUrl, acronym, modules }: { courseUrl: string; acronym?: string; modules: CanvasModule[] }) {
  const [files, setFiles] = useState<CourseFile[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ file: PreviewFile; blobUrl: string | null } | null>(null);
  const [uploads, setUploads] = useState<Array<{ name: string; status: "uploading" | "done" | "error"; error?: string }>>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkModule, setBulkModule] = useState<number | "">("");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [editFile, setEditFile] = useState<CourseFile | null>(null);
  const [structureFile, setStructureFile] = useState<CourseFile | null>(null);

  const shown = files.filter((f) => f.displayName.toLowerCase().includes(search.trim().toLowerCase()));
  const dupGroups = useMemo(() => findDuplicateGroups(files), [files]);
  const strayCount = dupGroups.reduce((n, g) => n + g.strays.length, 0);
  // Select every older copy across duplicate groups so the user can review the
  // selection and remove them through the existing (confirm-guarded) bulk delete.
  const selectStrays = () => setSelected(new Set(dupGroups.flatMap((g) => g.strays.map((s) => s.id))));
  const toggleSelected = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allShownSelected = shown.length > 0 && shown.every((f) => selected.has(f.id));
  const toggleSelectAll = () => setSelected(allShownSelected ? new Set() : new Set(shown.map((f) => f.id)));
  // Modules whose items reference this file (as a File module item).
  const fileModules = (fileId: number) =>
    modules.filter((m) => m.items.some((it) => it.type === "File" && it.contentId === fileId)).map((m) => m.name);

  const bulkAddToModule = async () => {
    if (bulkModule === "" || selected.size === 0) return;
    const ids = [...selected];
    setBusy(true);
    setNote(null);
    let added = 0;
    let failed = 0;
    for (const fileId of ids) {
      const result = await createModuleItemAction(courseUrl, bulkModule, { type: "File", contentId: fileId }, acronym);
      if ("error" in result) failed += 1;
      else added += 1;
    }
    setBusy(false);
    setNote({ kind: failed ? "error" : "success", text: `Added to module: ${added} done${failed ? `, ${failed} failed` : ""}.` });
    setSelected(new Set());
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirmBulkDelete) {
      setConfirmBulkDelete(true);
      return;
    }
    setConfirmBulkDelete(false);
    const ids = [...selected];
    setSelected(new Set());
    setFiles((fs) => fs.filter((x) => !ids.includes(x.id)));
    setBusy(true);
    setNote(null);
    let failed = 0;
    for (const fileId of ids) {
      const result = await deleteCourseFileAction(courseUrl, fileId, acronym);
      if ("error" in result) failed += 1;
    }
    setBusy(false);
    setNote({ kind: failed ? "error" : "success", text: `Deleted ${ids.length - failed} file${ids.length - failed === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.` });
    if (failed) {
      const r = await listCourseFilesAction(courseUrl, acronym);
      if (!("error" in r)) setFiles(r.files);
    }
  };

  const reload = async () => {
    const result = await listCourseFilesAction(courseUrl, acronym);
    if ("error" in result) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setFiles(result.files);
    setStatus("ready");
  };

  useEffect(() => {
    if (!courseUrl) {
      setFiles([]);
      setStatus("ready");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    (async () => {
      const result = await listCourseFilesAction(courseUrl, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setStatus("error");
        return;
      }
      setFiles(result.files);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, acronym]);

  const saveRename = async (f: CourseFile) => {
    const draft = drafts[f.id];
    if (draft === undefined) return;
    const name = draft.trim();
    if (!name || name === f.displayName) return;
    setFiles((fs) => fs.map((x) => (x.id === f.id ? { ...x, displayName: name } : x)));
    setBusy(true);
    setNote(null);
    const result = await renameCourseFileAction(courseUrl, f.id, name, acronym);
    setBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      void reload();
    }
  };

  const removeFile = async (f: CourseFile) => {
    if (confirmDelete !== f.id) {
      setConfirmDelete(f.id);
      return;
    }
    setConfirmDelete(null);
    setFiles((fs) => fs.filter((x) => x.id !== f.id));
    setBusy(true);
    setNote(null);
    const result = await deleteCourseFileAction(courseUrl, f.id, acronym);
    setBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      void reload();
    } else {
      setNote({ kind: "success", text: "File deleted." });
    }
  };

  const openPreview = async (f: CourseFile) => {
    setPreview({ file: { student: "", name: f.displayName, extension: "", content: "Loading…", truncated: false }, blobUrl: null });
    const result = await previewFileAction(courseUrl, f.id, acronym);
    if ("error" in result) {
      setPreview({ file: { student: "", name: f.displayName, extension: "", content: result.error, truncated: false }, blobUrl: null });
      return;
    }
    const p = result.preview;
    const blobUrl = p.base64 ? base64ToBlobUrl(p.base64, p.mimeType) : null;
    setPreview({
      file: { student: "", name: p.name, extension: "", content: p.text, truncated: p.truncated, rawBase64: p.base64 || undefined, mimeType: p.mimeType },
      blobUrl,
    });
  };
  const closePreview = () =>
    setPreview((prev) => {
      if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
      return null;
    });

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList);
    setUploads(arr.map((f) => ({ name: f.name, status: "uploading" as const })));
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      try {
        const ticket = await requestFileUploadAction(
          courseUrl,
          { name: file.name, size: file.size, contentType: file.type, folderPath: "uploads" },
          acronym
        );
        if ("error" in ticket) throw new Error(ticket.error);
        const form = new FormData();
        for (const [k, v] of Object.entries(ticket.ticket.uploadParams)) form.append(k, v);
        form.append("file", file);
        const up = await fetch(ticket.ticket.uploadUrl, { method: "POST", body: form });
        if (!up.ok) throw new Error(`Upload failed (HTTP ${up.status}).`);
        setUploads((u) => u.map((row, idx) => (idx === i ? { ...row, status: "done" as const } : row)));
      } catch (err) {
        setUploads((u) =>
          u.map((row, idx) => (idx === i ? { ...row, status: "error" as const, error: err instanceof Error ? err.message : "Failed" } : row))
        );
      }
    }
    void reload();
  };

  return (
    <div className={styles.form}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label className={styles.downloadButton} style={{ cursor: "pointer" }}>
          Upload files
          <input
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" className={styles.downloadButton} onClick={() => void reload()} disabled={busy}>
          Refresh
        </button>
        <input
          type="search"
          className={styles.textInput}
          style={{ flex: "1 1 200px", maxWidth: 300 }}
          placeholder="Search files by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className={styles.fieldHint} style={{ margin: 0 }}>
          {search.trim() ? `${shown.length} of ${files.length}` : files.length} file{files.length === 1 ? "" : "s"}
        </span>
      </div>

      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void handleFiles(e.dataTransfer.files); }} className={styles.ccDrop}>
        <span className={styles.ccHint}>Drop files here to upload them to the course&apos;s Files area.</span>
      </div>

      {uploads.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {uploads.map((row, idx) => (
            <span key={idx} className={styles.ccHint} style={{ color: row.status === "error" ? "#b91c1c" : undefined }}>
              {row.name}: {row.status === "uploading" ? "uploading…" : row.status === "done" ? "uploaded" : `failed (${row.error})`}
            </span>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkBarHead}>
            <span className={styles.bulkCount}>
              {selected.size} file{selected.size === 1 ? "" : "s"} selected
            </span>
            <button type="button" className={styles.bulkClear} onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
          <div className={styles.bulkRow}>
            <span className={styles.bulkLabel}>Files</span>
            <span className={styles.bulkField}>
              <select
                className={styles.bulkSelect}
                style={{ maxWidth: 200 }}
                value={bulkModule}
                disabled={modules.length === 0}
                onChange={(e) => setBulkModule(e.target.value === "" ? "" : Number(e.target.value))}
                aria-label="Module to add the files to"
              >
                <option value="">{modules.length === 0 ? "No modules" : "Add to module…"}</option>
                {modules.map((mod) => (
                  <option key={mod.id} value={mod.id}>
                    {mod.name}
                  </option>
                ))}
              </select>
              <button type="button" className={styles.bulkBtn} disabled={busy || bulkModule === ""} onClick={() => void bulkAddToModule()}>
                Add
              </button>
            </span>
            <button type="button" className={styles.bulkBtnDanger} disabled={busy} onClick={() => void bulkDelete()}>
              {confirmBulkDelete ? "Confirm delete" : "Delete"}
            </button>
          </div>
        </div>
      )}

      {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}

      {strayCount > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "10px 14px",
            border: "1px solid #fde68a",
            background: "#fffbeb",
            borderRadius: 8,
          }}
        >
          <span style={{ fontSize: "0.85rem", color: "#92400e", flex: "1 1 240px" }}>
            {strayCount} duplicate {strayCount === 1 ? "copy" : "copies"} found across{" "}
            {dupGroups.length} {dupGroups.length === 1 ? "file" : "files"} (e.g. &ldquo;{dupGroups[0].strays[0].displayName}&rdquo;).
            The newest copy of each is kept.
          </span>
          <button type="button" className={styles.downloadButton} onClick={selectStrays} disabled={busy}>
            Select {strayCount} older {strayCount === 1 ? "copy" : "copies"}
          </button>
        </div>
      )}

      {status === "loading" ? (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Loading files…</p>
          </div>
        </div>
      ) : status === "error" ? (
        <p className={styles.error}>{error}</p>
      ) : files.length === 0 ? (
        <p className={styles.emptyState}>This course has no files yet.</p>
      ) : (
        <div className={styles.ccModule}>
          <label className={styles.fieldHint} style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: 0, padding: "8px 12px" }}>
            <input type="checkbox" checked={allShownSelected} onChange={toggleSelectAll} disabled={shown.length === 0} />
            Select all
          </label>
          <div className={styles.ccItems} style={{ borderTop: "1px solid var(--card-border)" }}>
            {shown.length === 0 && (
              <p className={styles.ccHint} style={{ padding: "4px 6px" }}>
                No files match your search.
              </p>
            )}
            {shown.map((f) => (
              <div key={f.id} className={styles.ccItem}>
                <input
                  type="checkbox"
                  className={styles.ccCheckbox}
                  checked={selected.has(f.id)}
                  onChange={() => toggleSelected(f.id)}
                  aria-label={`Select ${f.displayName}`}
                />
                <span className={styles.ccType} title={f.contentType}>
                  {fileKindLabel(f.contentType, f.fileName)}
                </span>
                <input
                  type="text"
                  className={styles.ccItemName}
                  title={f.displayName}
                  value={drafts[f.id] ?? f.displayName}
                  onChange={(e) => setDrafts((p) => ({ ...p, [f.id]: e.target.value }))}
                  onBlur={() => void saveRename(f)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
                {(() => {
                  const mods = fileModules(f.id);
                  return (
                    <span
                      className={styles.ccCount}
                      title={mods.length ? `In: ${mods.join(", ")}` : "Not in any module"}
                      style={{ width: 150, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {mods.length === 0 ? "—" : mods.length === 1 ? mods[0] : `${mods[0]} +${mods.length - 1}`}
                    </span>
                  );
                })()}
                <span className={styles.ccCount} style={{ width: 78, textAlign: "right", flexShrink: 0 }}>
                  {formatBytes(f.size)}
                </span>
                <button type="button" className={styles.ccBtn} onClick={() => void openPreview(f)}>
                  Preview
                </button>
                {f.url && (
                  <a className={styles.ccBtn} href={f.url} target="_blank" rel="noreferrer">
                    Download
                  </a>
                )}
                {/\.(docx|pptx)$/i.test(f.fileName || f.displayName) && (
                  <button type="button" className={styles.ccBtn} onClick={() => setEditFile(f)}>
                    Edit
                  </button>
                )}
                {/\.docx$/i.test(f.fileName || f.displayName) && (
                  <button
                    type="button"
                    className={styles.ccBtn}
                    title="Set the document title and mark headings (accessibility)"
                    onClick={() => setStructureFile(f)}
                  >
                    Structure
                  </button>
                )}
                <button type="button" className={`${styles.ccBtn} ${styles.ccBtnDanger}`} onClick={() => void removeFile(f)} disabled={busy}>
                  {confirmDelete === f.id ? "Confirm" : "Delete"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview && <FilePreviewModal selectedPreview={preview.file} previewBlobUrl={preview.blobUrl} onClose={closePreview} />}

      {editFile && (
        <OfficeEditorModal
          courseUrl={courseUrl}
          acronym={acronym}
          fileId={editFile.id}
          fileName={editFile.displayName}
          onClose={() => setEditFile(null)}
          onSaved={() => {
            setEditFile(null);
            setNote({ kind: "success", text: "Saved to Canvas." });
            void reload();
          }}
        />
      )}

      {structureFile && (
        <DocStructureEditor
          courseUrl={courseUrl}
          acronym={acronym}
          fileId={structureFile.id}
          title={structureFile.displayName}
          onClose={(resolved) => {
            setStructureFile(null);
            // `resolved` is defined (possibly empty) only when a save happened;
            // undefined means the editor was cancelled.
            if (resolved) {
              setNote({ kind: "success", text: "Saved to Canvas." });
              void reload();
            }
          }}
        />
      )}
    </div>
  );
}

type ContentView = "modules" | "pages" | "files" | "grading" | "announcements" | "inbox";

export default function ContentTab({
  grading,
  announcements,
  inbox,
}: {
  grading?: ReactNode;
  announcements?: ReactNode;
  inbox?: ReactNode;
}) {
  const { active: activeInstitution } = useInstitutionSelection();
  const { totalNeedsGrading, totalUnread } = useInstitutionCounts();
  const [provider] = useLlmProvider();

  const [courseUrl, setCourseUrl] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem(CONTENT_URL_KEY) ?? "" : ""
  );
  const [courseName, setCourseName] = useState("");
  const [modules, setModules] = useState<CanvasModule[]>([]);
  const [pages, setPages] = useState<CanvasPageSummary[]>([]);
  // Addable content (assignments/quizzes/discussions/files) for the item picker,
  // loaded lazily the first time the user adds a non-page item.
  const [targets, setTargets] = useState<CanvasAddableContent | null>(null);
  const [targetsState, setTargetsState] = useState<"idle" | "loading" | "error">("idle");
  const [loadState, setLoadState] = useState<LoadState>(() => {
    if (typeof window === "undefined") return { status: "idle", message: "" };
    const url = localStorage.getItem(CONTENT_URL_KEY) ?? "";
    return { status: parseCanvasCourseId(url) && activeInstitution ? "loading" : "idle", message: "" };
  });
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [view, setViewState] = useState<ContentView>(() => {
    if (typeof window === "undefined") return "modules";
    const saved = localStorage.getItem(VIEW_KEY);
    return saved === "pages" || saved === "files" || saved === "grading" || saved === "announcements" || saved === "inbox"
      ? saved
      : "modules";
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPageUrl, setEditorPageUrl] = useState<string | null>(null);
  // Course copy/import tool: "export" copies this course out, "import" pulls in.
  const [copyMode, setCopyMode] = useState<"export" | "import" | null>(null);

  const setView = (next: ContentView) => {
    setViewState(next);
    if (typeof window !== "undefined") localStorage.setItem(VIEW_KEY, next);
  };

  // Reset to a clean slate during render when the institution changes — the
  // loaded content belonged to the previous school.
  const [prevInstitution, setPrevInstitution] = useState(activeInstitution);
  if (activeInstitution !== prevInstitution) {
    setPrevInstitution(activeInstitution);
    setModules([]);
    setPages([]);
    setTargets(null);
    setTargetsState("idle");
    setCourseName("");
    setCourseUrl("");
    setExpanded(new Set());
    setLoadState({ status: "idle", message: "" });
    setNote(null);
    setEditorOpen(false);
  }

  // Tell the global AccessibilityProvider which course is loaded so it can scan
  // it in the background; fires on mount and whenever the course/school changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("ta-course-changed", { detail: { courseUrl, courseName } }));
  }, [courseUrl, courseName, activeInstitution]);

  // `silent` re-fetches without swapping the content for the loading spinner, so
  // a reload keeps the page mounted (scroll position, open accordions, and the
  // selected subtab are all preserved as the modules/pages update in place).
  const loadContent = async (url: string, silent = false) => {
    const id = parseCanvasCourseId(url);
    if (!id) return;
    if (typeof window !== "undefined") localStorage.setItem(CONTENT_URL_KEY, url);
    if (!silent) setLoadState({ status: "loading", message: "" });
    setNote(null);
    // Addable content belongs to this course; clear it so it reloads on demand.
    setTargets(null);
    setTargetsState("idle");
    const result = await listCourseContentAction(url, activeInstitution || undefined);
    if ("error" in result) {
      if (silent) {
        // Keep the current content rather than blanking it on a background refresh.
        setNote({ kind: "error", text: result.error });
        return;
      }
      setModules([]);
      setPages([]);
      setCourseName("");
      setLoadState({ status: "error", message: result.error });
      return;
    }
    setCourseName(result.courseName);
    setModules(result.modules);
    setPages(result.pages);
    if (!silent) setLoadState({ status: "idle", message: "" });
  };

  // Auto-load the remembered course on mount (await-first so no sync setState).
  useEffect(() => {
    const url = typeof window !== "undefined" ? localStorage.getItem(CONTENT_URL_KEY) ?? "" : "";
    if (!parseCanvasCourseId(url) || !activeInstitution) return;
    let cancelled = false;
    (async () => {
      const result = await listCourseContentAction(url, activeInstitution || undefined);
      if (cancelled) return;
      if ("error" in result) {
        setLoadState({ status: "error", message: result.error });
        return;
      }
      setCourseName(result.courseName);
      setModules(result.modules);
      setPages(result.pages);
      setLoadState({ status: "idle", message: "" });
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: switching institutions clears the course via the reset above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectCourse = (url: string) => {
    setCourseUrl(url);
    setLoadState({ status: "idle", message: "" });
    void loadContent(url);
  };

  const reload = () => {
    if (courseUrl) void loadContent(courseUrl, true);
  };

  // Lazily fetch the assignments/quizzes/discussions/files for the item picker
  // the first time they're needed (or after a failed attempt is retried).
  const ensureTargets = async () => {
    if (targets || targetsState === "loading") return;
    setTargetsState("loading");
    const result = await listAddableContentAction(courseUrl, activeInstitution || undefined);
    if ("error" in result) {
      setTargetsState("error");
      return;
    }
    setTargets(result.content);
    setTargetsState("idle");
  };

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openEditor = (pageUrl: string | null) => {
    setEditorPageUrl(pageUrl);
    setEditorOpen(true);
  };

  const courseId = parseCanvasCourseId(courseUrl);
  const loaded = useMemo(() => loadState.status === "idle" && !!courseId, [loadState.status, courseId]);
  // Subtabs that act on the course loaded here. The rest (Grading, Announcements,
  // Inbox) carry their own course picker / are institution-scoped, so they work
  // without loading a course in this tab.
  const courseTab = view === "modules" || view === "pages" || view === "files";

  return (
    <div className={styles.card}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>LMS Integration</span>
        <h1>Course content, grading &amp; communications</h1>
        <p>
          Manage a Canvas course&apos;s modules, pages, and files, grade submissions, and handle
          announcements and messages — all in one place. Changes are written to Canvas when you save.
        </p>
      </header>

      <div className={styles.field}>
        <label>Institution</label>
        <InstitutionSwitcher metric="both" />
      </div>

      {activeInstitution && (
        <>
          <div className={styles.lessonInnerTabs}>
            <button
              type="button"
              className={`${styles.lessonInnerTab} ${view === "modules" ? styles.lessonInnerTabActive : ""}`}
              onClick={() => setView("modules")}
            >
              Modules
            </button>
            <button
              type="button"
              className={`${styles.lessonInnerTab} ${view === "pages" ? styles.lessonInnerTabActive : ""}`}
              onClick={() => setView("pages")}
            >
              Pages
            </button>
            <button
              type="button"
              className={`${styles.lessonInnerTab} ${view === "files" ? styles.lessonInnerTabActive : ""}`}
              onClick={() => setView("files")}
            >
              Files
            </button>
            {grading && (
              <button
                type="button"
                className={`${styles.lessonInnerTab} ${view === "grading" ? styles.lessonInnerTabActive : ""}`}
                onClick={() => setView("grading")}
              >
                <span className={styles.tabLabelWrap}>
                  Grading
                  {totalNeedsGrading > 0 && <span className={styles.navBadge}>{totalNeedsGrading}</span>}
                </span>
              </button>
            )}
            {announcements && (
              <button
                type="button"
                className={`${styles.lessonInnerTab} ${view === "announcements" ? styles.lessonInnerTabActive : ""}`}
                onClick={() => setView("announcements")}
              >
                Announcements
              </button>
            )}
            {inbox && (
              <button
                type="button"
                className={`${styles.lessonInnerTab} ${view === "inbox" ? styles.lessonInnerTabActive : ""}`}
                onClick={() => setView("inbox")}
              >
                <span className={styles.tabLabelWrap}>
                  Inbox
                  {totalUnread > 0 && <span className={styles.navBadge}>{totalUnread}</span>}
                </span>
              </button>
            )}
          </div>

          {courseTab && (
            <CoursePicker
              activeInstitution={activeInstitution}
              courseUrl={courseUrl}
              onSelect={handleSelectCourse}
              loadError={loadState.status === "error" ? loadState.message : null}
              courseName={courseName}
            />
          )}

          {courseTab && view !== "modules" && loaded && (
            <div className={styles.resultsHeader}>
              <h2>{courseName || "Course content"}</h2>
              <div className={styles.ccBar} style={{ padding: 0 }}>
                <div className={styles.ccBarGroup}>
                  <span className={styles.ccBarLabel}>Course copy</span>
                  <button
                    type="button"
                    className={styles.ccBarBtn}
                    onClick={() => setCopyMode("export")}
                    disabled={!courseId}
                    title="Copy this course's content into other courses"
                  >
                    Copy to…
                  </button>
                  <button
                    type="button"
                    className={styles.ccBarBtn}
                    onClick={() => setCopyMode("import")}
                    disabled={!courseId}
                    title="Import another course's content into this one"
                  >
                    Import from…
                  </button>
                </div>

                <span className={styles.ccBarDivider} aria-hidden="true" />

                <button
                  type="button"
                  className={styles.ccBarBtn}
                  onClick={reload}
                  disabled={busy || loadState.status === "loading"}
                  title="Reload this course's content"
                >
                  {loadState.status === "loading" ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>
          )}

          {courseTab && copyMode && courseId && (
            <CourseCopyModal
              mode={copyMode}
              courseUrl={courseUrl}
              currentCourseId={courseId}
              acronym={activeInstitution || undefined}
              onClose={() => setCopyMode(null)}
              onDone={() => {
                setCopyMode(null);
                if (copyMode === "import") reload();
              }}
            />
          )}

          {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}

          {courseTab && loadState.status === "loading" && (
            <div className={styles.loadingState} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <div>
                <p className={styles.loadingTitle}>Loading course content…</p>
              </div>
            </div>
          )}

          {courseTab && !loaded && loadState.status !== "loading" && (
            <p className={styles.emptyState}>Load a course above to work with its {view}.</p>
          )}

          {view === "grading" ? (
            grading
          ) : view === "announcements" ? (
            announcements
          ) : view === "inbox" ? (
            inbox
          ) : !loaded ? null : view === "modules" ? (
            <ModulesView
              courseUrl={courseUrl}
              acronym={activeInstitution || undefined}
              modules={modules}
              pages={pages}
              targets={targets}
              targetsState={targetsState}
              ensureTargets={() => void ensureTargets()}
              busy={busy}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onEditPage={(pageUrl) => openEditor(pageUrl)}
              setModules={setModules}
              reload={reload}
              setNote={setNote}
              setBusy={setBusy}
              courseName={courseName}
              onExport={() => setCopyMode("export")}
              onImport={() => setCopyMode("import")}
              refreshing={loadState.status === "loading"}
              canCopy={!!courseId}
            />
          ) : view === "pages" ? (
            <PagesView pages={pages} onNewPage={() => openEditor(null)} onEditPage={(pageUrl) => openEditor(pageUrl)} />
          ) : view === "files" ? (
            <FilesView courseUrl={courseUrl} acronym={activeInstitution || undefined} modules={modules} />
          ) : null}
        </>
      )}

      {editorOpen && courseId && (
        <PageEditorModal
          courseUrl={courseUrl}
          acronym={activeInstitution || undefined}
          provider={provider}
          pageUrl={editorPageUrl}
          onClose={() => setEditorOpen(false)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
