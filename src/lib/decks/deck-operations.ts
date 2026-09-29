/**
 * The closed conversational-ask operation set over a deck's content model
 * (docs/a43-c-scope.md sections 5-7). A conversational operation is a
 * model-driven `onEditSlide`: it transforms `PptxSlide[]` into a new
 * `PptxSlide[]` or refuses. It never touches the uploaded template - the
 * template `sections`/`sourceId` layer is a downstream, unchanged concern
 * (fillOfficeTemplate / planSlideTemplateFill).
 *
 * Two pure functions, mirroring coerceSlideGraphic's coerce-then-apply split
 * (src/lib/slide-graphics.ts:208) - COPYING its shape (a switch over a closed
 * vocabulary) but explicitly NOT its `default: return undefined`. A malformed
 * decorative graphic degrading to no graphic is fine; an operation the
 * instructor asked for out loud degrading to nothing is the silent-truncation
 * defect this row exists to avoid (docs/a43-scope.md:919-930). An unknown tag
 * or a member that fails its schema returns `null`, which the caller turns
 * into an `operation-refused` adjustment (H3) - never a no-op.
 */

import type { PptxSlide } from "@/lib/pptx";
import {
  buildOperationRefusedAdjustment,
  buildSlideCountAdjustment,
  type FitReportAdjustment,
} from "./fit-report";

/** A Pick of PptxSlide's content fields only - no placement, no template handle. */
export type SlideContent = Pick<PptxSlide, "title" | "bullets" | "code" | "codeLanguage">;

export type DeckOperation =
  | { op: "reword"; slideIndex: number; content: SlideContent }
  | { op: "expand"; slideIndex: number; content: SlideContent }
  | { op: "condense"; slideIndex: number; content: SlideContent }
  | { op: "retitle"; slideIndex: number; title: string }
  | { op: "retarget"; slides: SlideContent[] }
  | { op: "reorder"; order: number[] }
  | { op: "drop"; slideIndex: number }
  | { op: "refuse"; category: "add-slide" | "layout" | "delete-slide" | "other"; note?: string };

export type DeckOpResult =
  | { ok: true; slides: PptxSlide[] }
  | { ok: false; refusal: FitReportAdjustment };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Coerces the bullets field of a raw content object. Deliberately does NOT
 * normalize a malformed value into an empty array (matching
 * src/lib/presentations/parse.ts's toRawPptxSlide discipline) - a non-array
 * `bullets` fails validation below and refuses, rather than silently
 * becoming an empty deck of bullets.
 */
function coerceSlideContent(raw: unknown): SlideContent | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.title !== "string") return null;
  if (!Array.isArray(raw.bullets) || !raw.bullets.every((b) => typeof b === "string")) return null;
  const content: SlideContent = { title: raw.title, bullets: raw.bullets as string[] };
  if (typeof raw.code === "string") content.code = raw.code;
  if (typeof raw.codeLanguage === "string") content.codeLanguage = raw.codeLanguage;
  return content;
}

function coerceSlideIndexOp(
  op: "reword" | "expand" | "condense",
  obj: Record<string, unknown>
): DeckOperation | null {
  if (typeof obj.slideIndex !== "number") return null;
  const content = coerceSlideContent(obj.content);
  if (!content) return null;
  return { op, slideIndex: obj.slideIndex, content };
}

/**
 * Parses/validates a model-emitted operation against the closed schema
 * (docs/a43-c-scope.md section 6). Returns null on an unrecognised op tag or
 * an invalid shape - the dispatcher's caller turns that into a refusal
 * (H3), never a silent default and never a no-op.
 */
export function coerceDeckOperation(raw: unknown): DeckOperation | null {
  if (!isRecord(raw)) return null;
  switch (raw.op) {
    case "reword":
    case "expand":
    case "condense":
      return coerceSlideIndexOp(raw.op, raw);
    case "retitle": {
      if (typeof raw.slideIndex !== "number") return null;
      if (typeof raw.title !== "string") return null;
      return { op: "retitle", slideIndex: raw.slideIndex, title: raw.title };
    }
    case "retarget": {
      if (!Array.isArray(raw.slides)) return null;
      const slides: SlideContent[] = [];
      for (const item of raw.slides) {
        const content = coerceSlideContent(item);
        if (!content) return null;
        slides.push(content);
      }
      return { op: "retarget", slides };
    }
    case "reorder": {
      if (!Array.isArray(raw.order) || !raw.order.every((n) => typeof n === "number")) return null;
      return { op: "reorder", order: raw.order as number[] };
    }
    case "drop": {
      if (typeof raw.slideIndex !== "number") return null;
      return { op: "drop", slideIndex: raw.slideIndex };
    }
    case "refuse": {
      const category = raw.category;
      if (category !== "add-slide" && category !== "layout" && category !== "delete-slide" && category !== "other") {
        return null;
      }
      const note = typeof raw.note === "string" ? raw.note : undefined;
      return note !== undefined ? { op: "refuse", category, note } : { op: "refuse", category };
    }
    default:
      return null;
  }
}

const REFUSAL_WORDING: Record<"add-slide" | "layout" | "delete-slide" | "other", string> = {
  "add-slide":
    "I cannot add a slide to an uploaded template yet. Your template has the number of slides this deck has, and that is what this deck has. Pick a longer template, or a shape with fewer slides.",
  layout:
    "That changes the layout of your template, and this feature is built so the model can never do that. Change it in PowerPoint and re-upload.",
  "delete-slide":
    "I can empty a slide's content, but I cannot remove a slide from your template.",
  other: "I cannot make that change to this deck.",
};

function refusalFor(category: "add-slide" | "layout" | "delete-slide" | "other", note?: string): FitReportAdjustment {
  const reason = note ? `${REFUSAL_WORDING[category]} (${note})` : REFUSAL_WORDING[category];
  return buildOperationRefusedAdjustment(reason);
}

function isPermutation(order: number[], length: number): boolean {
  if (order.length !== length) return false;
  const sorted = [...order].sort((a, b) => a - b);
  for (let i = 0; i < length; i++) {
    if (sorted[i] !== i) return false;
  }
  return true;
}

/**
 * Merges a model-produced SlideContent onto an existing slide, copying ONLY
 * the keys the model returned (leave-unless-present) - so `notes`, `graphic`,
 * and any field the op did not set are PRESERVED (docs/a43-c-scope.md
 * section 5, pinned by CO-PRESERVE). A full replacement, or spreading an
 * absent optional as `undefined`, would silently drop those fields; this
 * function only ever writes keys `content` actually has.
 */
function mergeSlideContent(slide: PptxSlide, content: SlideContent): PptxSlide {
  const merged: PptxSlide = { ...slide, title: content.title, bullets: content.bullets };
  if ("code" in content) merged.code = content.code;
  if ("codeLanguage" in content) merged.codeLanguage = content.codeLanguage;
  return merged;
}

/**
 * The validating dispatcher (docs/a43-c-scope.md section 7). Enforces every
 * invariant BY CONSTRUCTION and returns a refusal, never a mutated-in-place
 * deck. Every `{ ok: true }` result preserves `slides.length` - the whole
 * no-add/no-delete guarantee at this layer (CO-COUNT).
 */
export function applyDeckOperation(slides: PptxSlide[], op: DeckOperation): DeckOpResult {
  switch (op.op) {
    case "reword":
    case "expand":
    case "condense": {
      if (op.slideIndex < 0 || op.slideIndex >= slides.length) {
        return { ok: false, refusal: buildOperationRefusedAdjustment(`Slide ${op.slideIndex} does not exist in this deck.`) };
      }
      const next = [...slides];
      next[op.slideIndex] = mergeSlideContent(next[op.slideIndex], op.content);
      return { ok: true, slides: next };
    }
    case "retitle": {
      if (op.slideIndex < 0 || op.slideIndex >= slides.length) {
        return { ok: false, refusal: buildOperationRefusedAdjustment(`Slide ${op.slideIndex} does not exist in this deck.`) };
      }
      const next = [...slides];
      next[op.slideIndex] = { ...next[op.slideIndex], title: op.title };
      return { ok: true, slides: next };
    }
    case "retarget": {
      const countAdjustment = buildSlideCountAdjustment(slides.length, op.slides.length);
      if (op.slides.length > slides.length && countAdjustment) {
        return { ok: false, refusal: countAdjustment };
      }
      if (op.slides.length !== slides.length) {
        return {
          ok: false,
          refusal: buildOperationRefusedAdjustment(
            `This deck has ${slides.length} slides and the retargeted content had ${op.slides.length}. Nothing was changed.`
          ),
        };
      }
      const next = slides.map((slide, i) => mergeSlideContent(slide, op.slides[i]));
      return { ok: true, slides: next };
    }
    case "reorder": {
      if (!isPermutation(op.order, slides.length)) {
        return {
          ok: false,
          refusal: buildOperationRefusedAdjustment("That reordering does not account for every slide exactly once. Nothing was changed."),
        };
      }
      const next = op.order.map((i) => slides[i]);
      return { ok: true, slides: next };
    }
    case "drop": {
      if (op.slideIndex < 0 || op.slideIndex >= slides.length) {
        return { ok: false, refusal: buildOperationRefusedAdjustment(`Slide ${op.slideIndex} does not exist in this deck.`) };
      }
      const next = [...slides];
      const slide = next[op.slideIndex];
      next[op.slideIndex] = {
        ...slide,
        title: "",
        bullets: [],
        code: undefined,
        codeLanguage: undefined,
        graphic: undefined,
      };
      return { ok: true, slides: next };
    }
    case "refuse":
      return { ok: false, refusal: refusalFor(op.category, op.note) };
  }
}
