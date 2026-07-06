"use client";

import { useEffect, useState } from "react";
import { Button, IconButton, TextField, MenuItem, Checkbox, FormControlLabel, Radio } from "@mui/material";
import {
  createQuizQuestionAction,
  deleteQuizQuestionAction,
  listQuizQuestionsAction,
  updateQuizQuestionAction,
} from "../../actions";
import type { QuizQuestionType } from "@/lib/canvas-modules";
import styles from "../../page.module.css";
import { QUIZ_TYPES, QUIZ_TYPE_LABELS } from "./constants";
import type { EditableQuestion } from "./types";
import { defaultQuizAnswers, newDraftQuestion, nextQuizKey, quizQuestionToInput } from "./utils";

export function QuizQuestionsEditor({
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
                    <TextField
                      select
                      size="small"
                      sx={{ minWidth: 160 }}
                      value={q.type}
                      onChange={(e) => changeType(q.key, e.target.value as QuizQuestionType)}
                      aria-label="Question type"
                      slotProps={{ htmlInput: { "aria-label": "Question type" } }}
                    >
                      {QUIZ_TYPES.map((t) => (
                        <MenuItem key={t} value={t}>
                          {QUIZ_TYPE_LABELS[t]}
                        </MenuItem>
                      ))}
                    </TextField>
                    <span className={styles.bulkField}>
                      <TextField
                        type="number"
                        size="small"
                        sx={{ width: 64 }}
                        value={q.points}
                        onChange={(e) => patch(q.key, { points: Number(e.target.value) })}
                        aria-label="Points"
                        slotProps={{ htmlInput: { "aria-label": "Points" } }}
                      />
                      <span className={styles.ccCount}>pts</span>
                    </span>
                    <span style={{ flex: 1 }} />
                    <Button variant="contained" size="small" disabled={busyKey === q.key} onClick={() => void saveQuestion(q)}>
                      {busyKey === q.key ? "Saving..." : q.id === 0 ? "Add" : "Save"}
                    </Button>
                    <Button variant="outlined" size="small" color="error" disabled={busyKey === q.key} onClick={() => void deleteQuestion(q)}>
                      Delete
                    </Button>
                  </div>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Question title (optional)"
                    value={q.name}
                    onChange={(e) => patch(q.key, { name: e.target.value })}
                  />
                  <TextField
                    fullWidth
                    multiline
                    minRows={4}
                    placeholder="Question text"
                    value={q.text}
                    onChange={(e) => patch(q.key, { text: e.target.value })}
                    slotProps={{
                      input: {
                        spellCheck: true,
                      },
                    }}
                  />
                  {showAnswers && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span className={styles.ccCount}>{q.type === "short_answer_question" ? "Accepted answers" : "Answers"}</span>
                      {q.answers.map((a, ai) => (
                        <div key={ai} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {q.type !== "short_answer_question" && (
                            single ? (
                              <Radio
                                size="small"
                                name={`${q.key}-correct`}
                                checked={a.correct}
                                onChange={(e) => setAnswer(q.key, ai, { correct: e.target.checked }, single)}
                                value={ai}
                                title="Mark correct"
                                aria-label="Correct answer"
                              />
                            ) : (
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    size="small"
                                    checked={a.correct}
                                    onChange={(e) => setAnswer(q.key, ai, { correct: e.target.checked }, single)}
                                    name={`${q.key}-correct`}
                                  />
                                }
                                label=""
                                title="Mark correct"
                                aria-label="Correct answer"
                                sx={{ m: 0 }}
                              />
                            )
                          )}
                          <TextField
                            size="small"
                            sx={{ flex: "1 1 220px", minWidth: 160 }}
                            value={a.text}
                            disabled={q.type === "true_false_question"}
                            placeholder={q.type === "short_answer_question" ? "An accepted answer" : "Answer choice"}
                            onChange={(e) => setAnswer(q.key, ai, { text: e.target.value }, single)}
                          />
                          {editableAnswers && q.answers.length > 1 && (
                            <IconButton
                              size="small"
                              title="Remove answer"
                              aria-label="Remove answer"
                              onClick={() => removeAnswer(q.key, ai)}
                            >
                              &times;
                            </IconButton>
                          )}
                        </div>
                      ))}
                      {editableAnswers && (
                        <Button variant="outlined" size="small" sx={{ alignSelf: "flex-start" }} onClick={() => addAnswer(q.key)}>
                          Add answer
                        </Button>
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
              <Button variant="contained" size="small" onClick={addQuestion}>
                Add question
              </Button>
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

