"use client";

import type React from "react";
import { Button, IconButton, TextField, MenuItem, Checkbox, FormControlLabel, Radio } from "@mui/material";
import type { QuizQuestionType } from "@/lib/canvas-modules";
import styles from "../../page.module.css";
import { QUIZ_TYPES, QUIZ_TYPE_LABELS } from "./constants";
import type { EditableQuestion } from "./types";
import { defaultQuizAnswers, newDraftQuestion } from "./utils";

export function DraftQuizQuestions({
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
              <Button variant="outlined" size="small" color="error" onClick={() => removeQuestion(q.key)}>
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
          Question text is plain text.
        </span>
      </div>
    </div>
  );
}

