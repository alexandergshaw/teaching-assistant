// P3-AC2: the targeted repair pass for the graphics data-layer guard.
//
// enforceGraphicsForApplied (src/lib/slide-graphics.ts) only NAMES a gap - a
// slide that was required to carry a graphic (Artifact:/Judgment Call:/
// Agenda:) but has none. This module fills that gap with ONE additional,
// narrowly-scoped LLM call that sees only the offending slides' titles and
// bullets, not the whole deck, and asks for a graphic per slide in the same
// closed vocabulary (matrix2x2/process/table) the main deck prompt uses.
//
// This makes an LLM call, so it cannot live in slide-graphics.ts, which must
// stay a PURE module (no I/O, no fetch, no Date, no Math.random) - it lives
// here instead, next to the other deck LLM helpers in
// src/app/actions/course-planning-grounding.ts (selectRequiredTools,
// selectCourseTools, deriveTocFromSource), split into its own file only to
// keep that one under 1000 lines.
//
// Every repaired graphic goes through coerceSlideGraphic - the exact same
// defensive coercion the main generation path uses - so a malformed repair
// degrades to no graphic exactly as it would during normal generation, never
// a half-rendered slide. Never throws: an LLM transport failure, an
// unparseable response, or the "embedded" provider (which makes no LLM calls
// at all) all leave the deck exactly as it was handed in - an unrepaired gap
// is a reported defect (see generateSlidesFromTopic's console.error and the
// lecture-materials-from-schedule step summary), never a crashed run.

import type { SlideData } from "@/app/actions-types";
import { coerceSlideGraphic, type SlideGraphicGap } from "@/lib/slide-graphics";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { jsonObjectSlice } from "./shared";

interface RepairTarget {
  /** This slide's position in the ORIGINAL slides array (not the targets list). */
  slideIndex: number;
  title: string;
  bullets: string[];
}

/**
 * Ask for ONE graphic per offending slide, restating the no-fabrication rule
 * verbatim (the same rule APPLIED_STRUCTURE_REQUIREMENTS states on the main
 * deck prompt): a graphic may only restate content the slide's own bullets
 * already ground, never invent a figure, date, statistic, or row the bullets
 * do not support.
 */
function buildRepairPrompt(targets: RepairTarget[]): string {
  const slideList = targets
    .map((t, i) => `${i + 1}. "${t.title}"\nBullets:\n${t.bullets.map((b) => `- ${b}`).join("\n")}`)
    .join("\n\n");

  return `You are repairing a lecture slide deck. The following slides were REQUIRED to carry a visual graphic (a real PowerPoint shape/table - never an image, never a chart) but were generated without one. For EACH slide below, produce the single graphic it should have carried.

A graphic may ONLY restate content that slide's own bullets already ground - never invent figures, dates, statistics, or rows the bullets do not support. This is the same no-fabrication rule that governs the rest of the deck: if the bullets do not give you enough to fill a shape honestly, use the shape that needs the least invented detail, but never pad it with content the bullets do not already say.

Use exactly one of these three shapes per slide, matching these exact field names:
- matrix2x2: { "kind": "matrix2x2", "xAxisLabel": "...", "yAxisLabel": "...", "quadrants": { "topLeft": { "label": "...", "items": ["..."] }, "topRight": { "label": "...", "items": ["..."] }, "bottomLeft": { "label": "...", "items": ["..."] }, "bottomRight": { "label": "...", "items": ["..."] } } } - up to 4 items per quadrant.
- process: { "kind": "process", "steps": [ { "label": "...", "caption": "..." }, ... ] } - 3 to 6 steps; "caption" is optional.
- table: { "kind": "table", "headers": ["...", "..."], "rows": [["...", "..."], ["...", "..."]] } - up to 5 columns and 6 rows.

SLIDES NEEDING A GRAPHIC:
${slideList}

Return ONLY valid JSON: { "graphics": [ { "index": <the slide's number from the list above, 1-based>, "graphic": { ... } }, ... ] }`;
}

/**
 * Fill in a graphic for every slide named in `gaps`, or leave a slide
 * exactly as it was when no usable repair comes back for it. Returns a NEW
 * slides array (the input is never mutated); every other field on every
 * slide - repaired or not - is preserved unchanged.
 *
 * `gaps` normally comes straight from enforceGraphicsForApplied - this
 * function does not re-derive or validate which slides need a graphic, it
 * trusts the caller's list and repairs exactly those (falling back to
 * leaving a slide untouched if its index no longer resolves to a real
 * slide, which should not happen in practice but must never throw if it
 * somehow does).
 */
export async function fillMissingGraphics(
  slides: SlideData[],
  gaps: SlideGraphicGap[],
  provider: LlmProvider
): Promise<SlideData[]> {
  if (gaps.length === 0 || provider === "embedded") return slides;

  try {
    const targets: RepairTarget[] = gaps
      .map((gap) => {
        const slide = slides[gap.index];
        if (!slide) return null;
        return { slideIndex: gap.index, title: slide.title, bullets: slide.bullets };
      })
      .filter((t): t is RepairTarget => t !== null);

    if (targets.length === 0) return slides;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: buildRepairPrompt(targets) }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) return slides;

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) return slides;

    const parsed = JSON.parse(jsonText) as { graphics?: Array<{ index?: unknown; graphic?: unknown }> };
    if (!Array.isArray(parsed.graphics)) return slides;

    const repaired = [...slides];
    for (const entry of parsed.graphics) {
      const oneBasedIndex = typeof entry.index === "number" ? entry.index : NaN;
      const target = targets[oneBasedIndex - 1];
      if (!target) continue;

      const graphic = coerceSlideGraphic(entry.graphic);
      // A malformed repair degrades to "leave this slide as it was" - never
      // a half-rendered graphic, exactly like coerceSlideGraphic's own
      // contract during normal generation.
      if (!graphic) continue;

      repaired[target.slideIndex] = { ...repaired[target.slideIndex], graphic };
    }
    return repaired;
  } catch {
    return slides;
  }
}
