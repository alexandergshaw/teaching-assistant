import { htmlToText } from "../canvas-core";
import type { CanvasModuleItem, CanvasPage, CanvasPageSummary, QuizQuestion, QuizQuestionType } from "./types";
import type { RawModuleItem, RawPage, RawQuizQuestion } from "./raw-types";
import { createHash } from "crypto";

export function mapModuleItem(raw: RawModuleItem, fallbackModuleId: number): CanvasModuleItem {
  return {
    id: raw.id ?? 0,
    moduleId: raw.module_id ?? fallbackModuleId,
    title: (raw.title ?? "").trim() || "(untitled)",
    type: raw.type ?? "",
    position: typeof raw.position === "number" ? raw.position : 0,
    indent: typeof raw.indent === "number" ? raw.indent : 0,
    published: raw.published ?? false,
    pageUrl: raw.page_url ?? null,
    contentId: typeof raw.content_id === "number" ? raw.content_id : null,
    dueAt: raw.content_details?.due_at ?? null,
    pointsPossible:
      typeof raw.content_details?.points_possible === "number" ? raw.content_details.points_possible : null,
    htmlUrl: raw.html_url ?? null,
    externalUrl: raw.external_url ?? null,
  };
}

export function mapPageSummary(raw: RawPage): CanvasPageSummary {
  return {
    pageId: raw.page_id ?? 0,
    url: raw.url ?? "",
    title: (raw.title ?? "").trim() || "(untitled)",
    published: raw.published ?? false,
    frontPage: raw.front_page ?? false,
    updatedAt: raw.updated_at ?? null,
  };
}

export function mapPage(raw: RawPage): CanvasPage {
  return {
    pageId: raw.page_id ?? 0,
    url: raw.url ?? "",
    title: (raw.title ?? "").trim() || "(untitled)",
    body: raw.body ?? "",
    published: raw.published ?? false,
    updatedAt: raw.updated_at ?? null,
  };
}

export function mapQuizQuestion(raw: RawQuizQuestion): QuizQuestion {
  const type = (raw.question_type as QuizQuestionType) ?? "multiple_choice_question";
  return {
    id: raw.id ?? 0,
    name: (raw.question_name ?? "").trim(),
    text: raw.question_text ? htmlToText(raw.question_text) : "",
    type,
    points: typeof raw.points_possible === "number" ? raw.points_possible : 0,
    position: typeof raw.position === "number" ? raw.position : 0,
    answers: (raw.answers ?? []).map((a) => ({
      text: (a.text ?? a.answer_text ?? "").toString(),
      correct: (a.weight ?? 0) >= 100,
    })),
  };
}

export function contentHash(html: string): string {
  return createHash("sha1").update(html).digest("hex").slice(0, 16);
}
