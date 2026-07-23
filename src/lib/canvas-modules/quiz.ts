import { resolveCourse, textToHtml } from "../canvas-core";
import { fetchAll, writeJson } from "./fetch-helpers";
import { mapQuizQuestion } from "./mappers";
import type { QuizQuestion, QuizQuestionInput, QuizQuestionType } from "./types";
import type { RawQuizQuestion } from "./raw-types";

const QUIZ_TYPES_WITH_ANSWERS = new Set<QuizQuestionType>([
  "multiple_choice_question",
  "true_false_question",
  "short_answer_question",
]);

function quizQuestionParams(q: QuizQuestionInput): URLSearchParams {
  const params = new URLSearchParams();
  params.append("question[question_name]", q.name.trim() || "Question");
  params.append("question[question_text]", textToHtml(q.text.trim()));
  params.append("question[question_type]", q.type);
  params.append("question[points_possible]", String(Number.isFinite(q.points) ? q.points : 0));
  if (QUIZ_TYPES_WITH_ANSWERS.has(q.type)) {
    q.answers.forEach((a, i) => {
      params.append(`question[answers][${i}][answer_text]`, a.text.trim());
      const correct = q.type === "short_answer_question" ? true : a.correct;
      params.append(`question[answers][${i}][answer_weight]`, correct ? "100" : "0");
    });
  }
  return params;
}

/** List a classic quiz's questions, in display order. */
export async function listQuizQuestions(
  courseUrl: string,
  quizId: number,
  code?: string
): Promise<QuizQuestion[]> {
  const ctx = resolveCourse(courseUrl, code);
  const raw = await fetchAll<RawQuizQuestion>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/quizzes/${quizId}/questions?per_page=100`,
    ctx
  );
  return raw
    .filter((q) => typeof q.id === "number")
    .map(mapQuizQuestion)
    .sort((a, b) => a.position - b.position);
}

/** Add a question to a quiz. */
export async function createQuizQuestion(
  courseUrl: string,
  quizId: number,
  question: QuizQuestionInput,
  code?: string
): Promise<QuizQuestion> {
  const ctx = resolveCourse(courseUrl, code);
  const raw = await writeJson<RawQuizQuestion>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/quizzes/${quizId}/questions`,
    "POST",
    ctx,
    quizQuestionParams(question)
  );
  return mapQuizQuestion(raw);
}

/** Update one quiz question. */
export async function updateQuizQuestion(
  courseUrl: string,
  quizId: number,
  questionId: number,
  question: QuizQuestionInput,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  await writeJson(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/quizzes/${quizId}/questions/${questionId}`,
    "PUT",
    ctx,
    quizQuestionParams(question)
  );
}

/** Delete one quiz question. */
export async function deleteQuizQuestion(
  courseUrl: string,
  quizId: number,
  questionId: number,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  await writeJson(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/quizzes/${quizId}/questions/${questionId}`,
    "DELETE",
    ctx
  );
}
