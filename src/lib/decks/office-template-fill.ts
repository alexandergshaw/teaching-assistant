import type { OfficeKind, OfficeParagraph, RunSpan } from "@/lib/office-edit";
import { parseOfficeParagraphs, applyOfficeSections } from "@/lib/office-edit";
import { buildSlideCountAdjustment, type FitReport } from "@/lib/decks/fit-report";

/**
 * The pure middle of an owner-uploaded-template fill, extracted from
 * src/app/actions/syllabus-templates.ts:204-267 (generateCourseSyllabusAction)
 * and generalised over OfficeKind, per docs/a43-scope.md section 3.3
 * (RULING 50): the model (or, for a deck whose content is already generated
 * JSON, a deterministic mapper) returns content only, keyed to the file's
 * own paragraph ids; this module writes it back under applyOfficeSections's
 * byte-for-byte contract. The I/O (loading the saved template row, calling
 * an LLM, persisting the result) stays with each caller.
 *
 * HARD CONSTRAINT H1 (docs/a43-scope.md section 3.4): applyOfficeSections
 * deletes a known paragraph that has no section. The natural-looking
 * implementation - emit a section only for the paragraphs a caller actually
 * replaced - silently deletes every other paragraph of the owner's file.
 * This module makes that impossible BY CONSTRUCTION rather than by
 * documentation: the only exported way to write a filled file back is
 * {@link fillOfficeTemplate}, which takes a replacement LIST (a partial map
 * of id -> new text), never a section list, and always maps over every
 * paragraph {@link parseOfficeParagraphs} returned - so sections.length
 * equals paragraphs.length on every call, unconditionally. There is no
 * exported function in this module that accepts a caller-built section list,
 * so a caller cannot omit a paragraph even by mistake.
 *
 * WAVE T2 (docs/a43-scope.md section 11.4): {@link planSlideTemplateFill}
 * adds the slide-count REFUSAL. Wave T1's positional mapping (a slide's
 * first paragraph is the title, the rest are bullets) silently mapped only
 * the first `groups.length` generated slides and threw the rest away with
 * no signal at all when the deck needed more slides than the template had.
 * planSlideTemplateFill refuses that case outright via
 * {@link buildSlideCountAdjustment} instead of producing a partial,
 * silently-truncated replacement list - wave T3's clone path is what removes
 * the limit; until it lands, this is a refusal, not a clone.
 */

/** One paragraph's replacement text, keyed to its OfficeParagraph.id. */
export interface OfficeTemplateReplacement {
  id: string;
  text: string;
}

/**
 * Build the paragraph list block for a model prompt: one line per paragraph,
 * capped so a long template cannot blow out the prompt (same 16000-char cap
 * generateCourseSyllabusAction uses). A pptx paragraph's line carries its
 * slide number - the docx caller has no notion of "which slide", but a
 * pptx caller (and the fit report built from the same paragraph list, wave
 * T2/F1) needs it (docs/a43-scope.md section 3.3's "a slide dimension enters
 * the contract").
 */
export function buildOfficeTemplateParagraphList(paragraphs: OfficeParagraph[], maxChars = 16000): string {
  const lines: string[] = [];
  let chars = 0;
  for (const p of paragraphs) {
    const prefix = p.slide != null ? `[${p.id}] (slide ${p.slide}) ` : `[${p.id}] `;
    const line = `${prefix}${p.text}`;
    if (chars + line.length + 1 > maxChars) break;
    lines.push(line);
    chars += line.length + 1;
  }
  return lines.join("\n");
}

/**
 * Build the section list handed to applyOfficeSections from a replacement
 * list, mapping over EVERY parsed paragraph - never over the replacement
 * list - so H1 holds unconditionally. A paragraph with no replacement, or
 * whose replacement text equals its own text, passes its original runs
 * through unchanged so it stays byte-for-byte (the applyOfficeSections
 * short-circuit at office-edit.ts:418 then leaves it untouched). A replaced
 * paragraph that starts with a bold label keeps that label bold - the same
 * pattern src/app/actions/syllabus-templates.ts:255-263 uses for docx, kept
 * kind-neutral here since OfficeParagraph.runs is populated for both kinds
 * (office-edit.ts:41-45; RES-A43-16).
 */
function buildOfficeTemplateSections(
  paragraphs: OfficeParagraph[],
  replacementById: Map<string, string>
): Array<{ sourceId: string; spans: RunSpan[] }> {
  return paragraphs.map((p) => {
    const replacement = replacementById.get(p.id);
    if (replacement === undefined || replacement === p.text) {
      return { sourceId: p.id, spans: p.runs.length > 0 ? p.runs : [{ text: p.text }] };
    }
    let boldPrefix = "";
    for (const run of p.runs) {
      if (!run.bold) break;
      boldPrefix += run.text;
    }
    const spans: RunSpan[] =
      boldPrefix && replacement.startsWith(boldPrefix) && replacement.length > boldPrefix.length
        ? [{ text: boldPrefix, bold: true }, { text: replacement.slice(boldPrefix.length) }]
        : [{ text: replacement }];
    return { sourceId: p.id, spans };
  });
}

/**
 * Fill a template's paragraphs from a replacement list and rebuild the file.
 * This is the ONLY export in this module that writes a filled file back,
 * and it always emits one section per parsed paragraph (H1). A replacement
 * whose id does not match any real paragraph is ignored rather than thrown
 * away as an error, since a model or mapper naming a stale id should not
 * fail the whole fill.
 */
export async function fillOfficeTemplate(
  kind: OfficeKind,
  buffer: Buffer,
  replacements: OfficeTemplateReplacement[]
): Promise<Buffer> {
  const paragraphs = await parseOfficeParagraphs(kind, buffer);
  const knownIds = new Set(paragraphs.map((p) => p.id));
  const replacementById = new Map<string, string>();
  for (const r of replacements) {
    if (knownIds.has(r.id)) replacementById.set(r.id, r.text.trim());
  }
  const sections = buildOfficeTemplateSections(paragraphs, replacementById);
  return applyOfficeSections(kind, buffer, sections);
}

/**
 * Parse a template and return its paragraphs grouped by slide number
 * (pptx only - always empty for docx, which has no slide dimension). Slide
 * numbers are in ascending order and each slide's paragraphs keep their
 * on-slide order. Used by a pptx caller to map generated per-slide content
 * (a title paragraph, then body paragraphs) onto the template's own
 * paragraph ids without a second model call.
 */
export async function groupOfficeTemplateParagraphsBySlide(
  kind: OfficeKind,
  buffer: Buffer
): Promise<Array<{ slide: number; paragraphs: OfficeParagraph[] }>> {
  const paragraphs = await parseOfficeParagraphs(kind, buffer);
  const bySlide = new Map<number, OfficeParagraph[]>();
  for (const p of paragraphs) {
    if (p.slide == null) continue;
    const list = bySlide.get(p.slide);
    if (list) list.push(p);
    else bySlide.set(p.slide, [p]);
  }
  return [...bySlide.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slide, ps]) => ({ slide, paragraphs: ps }));
}

/** A generated slide's content, in the shape both deck paths already emit. */
export interface GeneratedSlideContent {
  title: string;
  bullets: string[];
}

export type SlideTemplateFillPlan =
  | { ok: true; replacements: OfficeTemplateReplacement[]; fitReport: FitReport }
  | { ok: false; fitReport: FitReport };

/**
 * Map a generated deck's slides onto an uploaded .pptx template's own slides
 * by position: a slide's first paragraph becomes the title, its remaining
 * paragraphs become bullets in order (docs/a43-scope.md section 11.3's
 * fillDeckTemplateFileAction, moved here per section 11.4's "office-template-
 * fill.ts - CALLER" - office-template-fill.ts is the pure middle, so the
 * refusal decision belongs beside the mapping it gates, not in the action's
 * I/O wrapper).
 *
 * PLAN, NOT WRITE: this never touches a buffer. When the deck needs more
 * slides than the template has, this REFUSES (docs/a43-scope.md section 7.3,
 * "Before wave T3: a REFUSAL") rather than silently mapping only the first
 * `groups.length` generated slides and discarding the rest - that silent
 * discard is the exact defect wave T2 exists to close (section 11.4).
 *
 * When the template has slides to spare, the extra template slides are left
 * alone - H1 (office-template-fill.ts's own module header) means an
 * untouched template paragraph is never a candidate for deletion, so there
 * is nothing to refuse there.
 */
export function planSlideTemplateFill(
  groups: Array<{ slide: number; paragraphs: OfficeParagraph[] }>,
  deckSlides: GeneratedSlideContent[]
): SlideTemplateFillPlan {
  const refusal = buildSlideCountAdjustment(groups.length, deckSlides.length);
  if (refusal) {
    return { ok: false, fitReport: { adjustments: [refusal] } };
  }

  const replacements: OfficeTemplateReplacement[] = [];
  for (let i = 0; i < deckSlides.length; i += 1) {
    const templateParas = groups[i].paragraphs;
    const genSlide = deckSlides[i];
    if (templateParas.length === 0) continue;
    replacements.push({ id: templateParas[0].id, text: genSlide.title });
    for (let b = 1; b < templateParas.length; b += 1) {
      const bulletText = genSlide.bullets[b - 1];
      if (bulletText !== undefined) replacements.push({ id: templateParas[b].id, text: bulletText });
    }
  }
  return { ok: true, replacements, fitReport: { adjustments: [] } };
}
