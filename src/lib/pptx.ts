// Single source of truth for client-side PowerPoint generation.
//
// Every deck the app builds locally goes through buildSlidesPptx so they all
// share one layout and color palette. pptxgenjs is imported dynamically so it
// stays out of the main bundle and only loads when a download is requested.
// The type import below is compile-time only (erased) and does not affect
// that - it just gives the render code below real pptxgenjs types.
import type PptxGenJSTypes from "pptxgenjs";
import {
  graphicSlideLayout,
  matrix2x2QuadrantRects,
  processStepRects,
  type MatrixQuadrant,
  type Rect,
  type SlideGraphic,
} from "./slide-graphics";
import { normalizeTypography } from "./text-normalize";

export interface PptxSlide {
  title: string;
  bullets: string[];
  /** Optional example code snippet, rendered as a monospace code block. */
  code?: string;
  /** Language label shown above the code block (e.g. "python"). */
  codeLanguage?: string;
  /**
   * Speaker notes: what the instructor says while this slide is up. Written
   * into the deck's real notes pane, which is what replaced the separate
   * lecture-notes document that used to ship alongside every deck.
   */
  notes?: string;
  /**
   * Optional visual (a matrix, a process, or a table) rendered as real
   * pptxgenjs shapes/table in the lower part of the slide, bullets above.
   * Ignored when the slide also carries "code" - a coding slide's code panel
   * already fills that space. See src/lib/slide-graphics.ts.
   */
  graphic?: SlideGraphic;
}

/**
 * Fold a week's module introduction into the deck as the opening slide's
 * speaker notes.
 *
 * This is what replaced the separate lecture-notes .docx: a lecture's notes
 * belong with the slides they narrate, not in a second file the instructor has
 * to open alongside them. A slide that already carries its own notes is never
 * overwritten - a per-slide note is more specific than the deck-level intro.
 *
 * Pure: no I/O, no Date, no randomness.
 */
export function withDeckNotes(slides: PptxSlide[], introduction: string): PptxSlide[] {
  const intro = introduction.trim();
  if (!intro || slides.length === 0) return slides;
  return slides.map((slide, i) =>
    i === 0 && !slide.notes?.trim() ? { ...slide, notes: intro } : slide
  );
}

export interface PptxTheme {
  backgroundKind: "solid" | "gradient" | "classic";
  backgroundColor: string;
  backgroundColor2?: string;
  fontColor: string;
  /** Optional precomputed gradient background as a full data URI PNG (from the
   *  browser canvas). When absent for a gradient, fall back to a solid fill of backgroundColor. */
  backgroundImageData?: string;
}

export interface BuildSlidesOptions {
  /** Large headline shown on the title slide. */
  presentationTitle: string;
  /** Content slides, one per entry. */
  slides: PptxSlide[];
  /**
   * Optional small label rendered above the title (e.g. the assignment or
   * module name). Omitted when not supplied.
   */
  subtitle?: string;
  /**
   * Name written into the deck's core properties as the author. Supplied so the
   * file reads as the user's own work rather than carrying pptxgenjs defaults.
   */
  author?: string;
  /**
   * Optional theme for background color/gradient and font color. When provided,
   * renders a clean themed layout without navy header bars. When absent,
   * renders the standard navy/accent scheme.
   */
  theme?: PptxTheme;
}

// Professional color palette shared by every generated deck.
const NAVY = "1a2744";
const ACCENT = "2563eb";
const WHITE = "ffffff";
const LIGHT_BG = "f4f6fb";
const BODY_TEXT = "1e293b";
const SUBTITLE_TEXT = "94a3b8";
const CODE_BG = "0f172a";
const CODE_TEXT = "e2e8f0";

// Helper to strip leading "#" from hex colors (pptxgenjs expects 6-hex without #)
function hexColor(hex: string): string {
  if (hex.startsWith("#")) return hex.substring(1);
  return hex;
}

/** Normalize a PptxTheme for rendering: classic kind -> undefined (standard navy path). */
export function normalizePptxTheme(theme?: PptxTheme): PptxTheme | undefined {
  if (theme === undefined) return undefined;
  if (theme.backgroundKind === "classic") return undefined;
  return theme;
}

// ── Typography normalization ────────────────────────────────────────────
//
// Every prose field a generator fills in - title, subtitle, bullets, speaker
// notes, and graphic labels/cells - is run through normalizeTypography
// (./text-normalize) before any slide is built, so an em/en dash or curly
// quote an LLM emits never reaches the finished .pptx. This mirrors
// buildDocxFromPlainText's own normalization pass in ./docx.ts: one choke
// point at the builder, not bolted onto each individual generator.
//
// `slide.code` and `slide.codeLanguage` are deliberately left untouched: code
// is not prose, the same reason a fenced ``` block in buildDocxFromPlainText
// is never touched, and codeLanguage is a short technical label ("python"),
// never free text a model would punctuate with smart typography.

function normalizeQuadrant(quadrant: MatrixQuadrant): MatrixQuadrant {
  return {
    label: normalizeTypography(quadrant.label),
    items: quadrant.items.map((item) => normalizeTypography(item)),
  };
}

function normalizeSlideGraphic(graphic: SlideGraphic): SlideGraphic {
  if (graphic.kind === "matrix2x2") {
    return {
      ...graphic,
      xAxisLabel: normalizeTypography(graphic.xAxisLabel),
      yAxisLabel: normalizeTypography(graphic.yAxisLabel),
      quadrants: {
        topLeft: normalizeQuadrant(graphic.quadrants.topLeft),
        topRight: normalizeQuadrant(graphic.quadrants.topRight),
        bottomLeft: normalizeQuadrant(graphic.quadrants.bottomLeft),
        bottomRight: normalizeQuadrant(graphic.quadrants.bottomRight),
      },
    };
  }
  if (graphic.kind === "process") {
    return {
      ...graphic,
      steps: graphic.steps.map((step) => ({
        label: normalizeTypography(step.label),
        caption: step.caption !== undefined ? normalizeTypography(step.caption) : step.caption,
      })),
    };
  }
  // table
  return {
    ...graphic,
    headers: graphic.headers.map((header) => normalizeTypography(header)),
    rows: graphic.rows.map((row) => row.map((cell) => normalizeTypography(cell))),
  };
}

/** Normalize every prose field on one slide - see the module note above. */
export function normalizeSlideTypography(slide: PptxSlide): PptxSlide {
  return {
    ...slide,
    title: normalizeTypography(slide.title),
    bullets: slide.bullets.map((bullet) => normalizeTypography(bullet)),
    notes: slide.notes !== undefined ? normalizeTypography(slide.notes) : slide.notes,
    graphic: slide.graphic !== undefined ? normalizeSlideGraphic(slide.graphic) : slide.graphic,
  };
}

// Helper to build slide background from theme
interface BackgroundProps {
  fill?: string;
  color?: string;
  data?: string;
}

function slideBackground(theme: PptxTheme): BackgroundProps {
  if (theme.backgroundKind === "gradient" && theme.backgroundImageData) {
    // Strip "data:" prefix if present so pptxgenjs receives "image/png;base64,..."
    const data = theme.backgroundImageData.startsWith("data:")
      ? theme.backgroundImageData.substring(5)
      : theme.backgroundImageData;
    return { data };
  }
  // Solid or gradient without image: use solid background color
  return { color: hexColor(theme.backgroundColor) };
}

/** Build a styled .pptx deck and return it as an ArrayBuffer. */
export async function buildSlidesPptx({
  presentationTitle,
  slides,
  subtitle,
  author,
  theme,
}: BuildSlidesOptions): Promise<ArrayBuffer> {
  theme = normalizePptxTheme(theme);
  // Strip em/en dashes and curly quotes from every prose field before any
  // slide is built - see the "Typography normalization" note above.
  presentationTitle = normalizeTypography(presentationTitle);
  subtitle = subtitle !== undefined ? normalizeTypography(subtitle) : subtitle;
  slides = slides.map(normalizeSlideTypography);

  const { default: PptxGenJS } = await import("pptxgenjs");

  const prs = new PptxGenJS();
  prs.layout = "LAYOUT_WIDE";

  // Stamp the document metadata. pptxgenjs otherwise leaves "PptxGenJS" in the
  // author, company, subject and title fields, which would betray how the deck
  // was produced. These are always assigned so the library defaults never leak:
  // author/lastModifiedBy carry the user's name, the title mirrors the on-slide
  // headline, and company/subject stay blank like a freshly authored file.
  prs.author = author ?? "";
  prs.company = "";
  prs.revision = "1";
  prs.subject = "";
  prs.title = presentationTitle;

  // Fixed content-column geometry every graphic slide carves into a short
  // bullets band (above) and a graphic band (below) - matches the x/w every
  // other content slide in this file already uses.
  const GRAPHIC_CONTENT_X = 0.45;
  const GRAPHIC_CONTENT_W = 12.43;
  const GRAPHIC_BULLETS_HEIGHT = 1.3;

  type SlideHandle = PptxGenJSTypes.Slide;

  // Draws one of the three closed graphic kinds (src/lib/slide-graphics.ts)
  // as real pptxgenjs shapes/table - never an image - inside `area`, using
  // only the caller's theme colors so nothing here hardcodes a hex value.
  // The layout math itself (quadrant/step rectangles) lives in
  // slide-graphics.ts so it stays unit-testable without pptxgenjs.
  function renderSlideGraphic(
    s: SlideHandle,
    graphic: SlideGraphic,
    area: Rect,
    colors: { text: string; tint: string }
  ): void {
    const tintFill = { color: colors.tint, transparency: 90 };
    const tintBorder = { color: colors.tint, transparency: 45, width: 1 };

    if (graphic.kind === "matrix2x2") {
      const { xAxisLabel, yAxisLabel, quadrants } = graphic;
      const captionH = 0.3;
      const gridArea: Rect = {
        x: area.x,
        y: area.y + captionH + 0.05,
        w: area.w,
        h: Math.max(0, area.h - captionH - 0.05),
      };
      s.addText(`${yAxisLabel}  vs.  ${xAxisLabel}`, {
        x: area.x, y: area.y, w: area.w, h: captionH,
        fontSize: 11, italic: true, color: colors.text, align: "center",
      });
      const quads = matrix2x2QuadrantRects(gridArea);
      (Object.keys(quads) as Array<keyof typeof quads>).forEach((key) => {
        const rect = quads[key];
        const quadrant = quadrants[key];
        s.addShape(prs.ShapeType.rect, {
          x: rect.x, y: rect.y, w: rect.w, h: rect.h,
          fill: tintFill, line: tintBorder,
        });
        s.addText(
          [
            { text: quadrant.label, options: { bold: true, fontSize: 12, color: colors.text } },
            ...quadrant.items.map((item) => ({
              text: item,
              options: { bullet: { type: "bullet" as const }, fontSize: 10, color: colors.text },
            })),
          ],
          {
            x: rect.x + 0.1, y: rect.y + 0.08, w: rect.w - 0.2, h: rect.h - 0.16,
            valign: "top", lineSpacingMultiple: 1.1,
          }
        );
      });
      return;
    }

    if (graphic.kind === "process") {
      const { steps } = graphic;
      const stepRects = processStepRects(area, steps.length);
      steps.forEach((step, i) => {
        const rect = stepRects[i];
        s.addShape(prs.ShapeType.rect, {
          x: rect.x, y: rect.y, w: rect.w, h: rect.h,
          fill: tintFill, line: tintBorder,
        });
        const lines: PptxGenJSTypes.TextProps[] = [
          { text: `${i + 1}. ${step.label}`, options: { bold: true, fontSize: 11, color: colors.text, breakLine: true } },
        ];
        if (step.caption) {
          lines.push({ text: step.caption, options: { fontSize: 9, color: colors.text } });
        }
        s.addText(lines, {
          x: rect.x + 0.08, y: rect.y + 0.08, w: rect.w - 0.16, h: rect.h - 0.16,
          valign: "top", align: "center", lineSpacingMultiple: 1.1,
        });
      });
      return;
    }

    // table
    const { headers, rows } = graphic;
    const headerRow: PptxGenJSTypes.TableCell[] = headers.map((h) => ({
      text: h,
      options: { bold: true, color: colors.text, fill: { color: colors.tint, transparency: 82 }, fontSize: 10 },
    }));
    const bodyRows: PptxGenJSTypes.TableCell[][] = rows.map((row) =>
      row.map((cell) => ({ text: cell, options: { color: colors.text, fontSize: 10 } }))
    );
    s.addTable([headerRow, ...bodyRows], {
      x: area.x, y: area.y, w: area.w, h: area.h,
      border: { type: "solid", color: colors.tint, pt: 0.75 },
      autoPage: false,
      valign: "top",
    });
  }

  if (theme) {
    // ── THEMED PATH: clean layout with custom background and font colors ──
    const titleColor = hexColor(theme.fontColor);
    const bgProps = slideBackground(theme);

    // If theme has gradient image data, define a slide master once to embed it only once.
    if (bgProps.data) {
      prs.defineSlideMaster({ title: "THEME_BG", background: bgProps });
    }

    // ── Title slide (themed) ──
    const titleSlide = bgProps.data ? prs.addSlide({ masterName: "THEME_BG" }) : prs.addSlide();
    if (!bgProps.data) {
      titleSlide.background = bgProps;
    }

    // Optional subtitle label above the title
    if (subtitle) {
      titleSlide.addText(subtitle.toUpperCase(), {
        x: 0.5, y: 1.6, w: "90%", h: 0.45,
        fontSize: 13, color: titleColor, align: "center",
        charSpacing: 2.5,
      });
    }

    // Presentation title
    titleSlide.addText(presentationTitle, {
      x: 0.5, y: subtitle ? 2.05 : 2.2, w: "90%", h: 2.0,
      fontSize: 42, bold: true, align: "center", color: titleColor,
      lineSpacingMultiple: 1.1,
    });

    // ── Content slides (themed) ──
    for (const slide of slides) {
      const s = bgProps.data ? prs.addSlide({ masterName: "THEME_BG" }) : prs.addSlide();
      if (!bgProps.data) {
        s.background = bgProps;
      }

      // Speaker notes travel WITH the slide they narrate - this is what
      // replaced the separate lecture-notes document.
      if (slide.notes && slide.notes.trim()) {
        s.addNotes(slide.notes.trim());
      }

      // Slide title at top
      s.addText(slide.title, {
        x: 0.4, y: 0.2, w: "92%", h: 0.6,
        fontSize: 26, bold: true, color: titleColor,
        valign: "middle",
      });

      const hasCode = typeof slide.code === "string" && slide.code.length > 0;
      const bulletCount = slide.bullets.length;
      const twoColumn = hasCode && bulletCount >= 2;

      if (twoColumn) {
        // Left column: language label + code panel.
        if (slide.codeLanguage) {
          s.addText(slide.codeLanguage.toUpperCase(), {
            x: 0.45, y: 1.0, w: 6.2, h: 0.3,
            fontSize: 11, bold: true, color: ACCENT,
            charSpacing: 2, align: "left",
          });
        }
        s.addText(slide.code as string, {
          x: 0.45, y: 1.35, w: 6.2, h: 5.0,
          fontFace: "Courier New", fontSize: 13, color: CODE_TEXT,
          fill: { color: CODE_BG }, align: "left", valign: "top",
          margin: 10, lineSpacingMultiple: 1.1,
        });
        // Right column: explanation bullets.
        s.addText(
          slide.bullets.map((b) => ({
            text: b,
            options: {
              bullet: { type: "bullet" },
              paraSpaceBefore: 8,
              color: titleColor,
              fontSize: 16,
            },
          })),
          {
            x: 6.95, y: 1.35, w: 5.9, h: 5.0,
            valign: "top",
            lineSpacingMultiple: 1.15,
          }
        );
      } else if (!hasCode && slide.graphic) {
        // Graphic layout: a short bullets band above, the graphic below -
        // see graphicSlideLayout (slide-graphics.ts) for the split math.
        const { bulletsArea, graphicArea } = graphicSlideLayout(
          { x: GRAPHIC_CONTENT_X, y: 1.0, w: GRAPHIC_CONTENT_W, h: 5.35 },
          GRAPHIC_BULLETS_HEIGHT
        );
        if (bulletCount > 0) {
          s.addText(
            slide.bullets.map((b) => ({
              text: b,
              options: {
                bullet: { type: "bullet" },
                paraSpaceBefore: 6,
                color: titleColor,
                fontSize: 16,
              },
            })),
            {
              x: bulletsArea.x, y: bulletsArea.y, w: bulletsArea.w, h: bulletsArea.h,
              valign: "top",
              lineSpacingMultiple: 1.15,
            }
          );
        }
        renderSlideGraphic(s, slide.graphic, graphicArea, { text: titleColor, tint: titleColor });
      } else {
        // Stacked layout.
        if (bulletCount > 0) {
          s.addText(
            slide.bullets.map((b) => ({
              text: b,
              options: {
                bullet: { type: "bullet" },
                paraSpaceBefore: 10,
                color: titleColor,
                fontSize: 18,
              },
            })),
            {
              x: 0.45, y: 1.0, w: "91%", h: hasCode ? 1.5 : 5.35,
              valign: "top",
              lineSpacingMultiple: 1.2,
            }
          );
        }

        if (hasCode) {
          const hasBullets = bulletCount > 0;
          const labelY = hasBullets ? 2.65 : 1.0;
          const codeY = hasBullets ? 2.95 : 1.35;
          const codeH = hasBullets ? 3.4 : 5.0;

          if (slide.codeLanguage) {
            s.addText(slide.codeLanguage.toUpperCase(), {
              x: 0.45, y: labelY, w: "91%", h: 0.3,
              fontSize: 11, bold: true, color: ACCENT,
              charSpacing: 2, align: "left",
            });
          }

          s.addText(slide.code as string, {
            x: 0.45, y: codeY, w: "91%", h: codeH,
            fontFace: "Courier New",
            fontSize: 14,
            color: CODE_TEXT,
            fill: { color: CODE_BG },
            align: "left",
            valign: "top",
            margin: 10,
            lineSpacingMultiple: 1.1,
          });
        }
      }
    }
  } else {
    // ── STANDARD (UNTUTORED) PATH: navy header + accents ──
    // ── Title slide ──
    const titleSlide = prs.addSlide();
    titleSlide.background = { fill: NAVY };

    // Decorative accent bar across the middle-bottom
    titleSlide.addShape(prs.ShapeType.rect, {
      x: 0, y: 4.6, w: "100%", h: 0.12,
      fill: { color: ACCENT },
      line: { color: ACCENT, width: 0 },
    });

    // Left-edge accent stripe
    titleSlide.addShape(prs.ShapeType.rect, {
      x: 0, y: 0, w: 0.18, h: "100%",
      fill: { color: ACCENT },
      line: { color: ACCENT, width: 0 },
    });

    // Optional subtitle label above the title
    if (subtitle) {
      titleSlide.addText(subtitle.toUpperCase(), {
        x: 0.5, y: 1.6, w: "90%", h: 0.45,
        fontSize: 13, color: SUBTITLE_TEXT, align: "center",
        charSpacing: 2.5,
      });
    }

    // Presentation title
    titleSlide.addText(presentationTitle, {
      x: 0.5, y: subtitle ? 2.05 : 2.2, w: "90%", h: 2.0,
      fontSize: 42, bold: true, align: "center", color: WHITE,
      lineSpacingMultiple: 1.1,
    });

    // ── Content slides ──
    for (const slide of slides) {
      const s = prs.addSlide();
      s.background = { fill: LIGHT_BG };

      if (slide.notes && slide.notes.trim()) {
        s.addNotes(slide.notes.trim());
      }

      // Header bar
      s.addShape(prs.ShapeType.rect, {
        x: 0, y: 0, w: "100%", h: 1.35,
        fill: { color: NAVY },
        line: { color: NAVY, width: 0 },
      });

      // Accent strip below header
      s.addShape(prs.ShapeType.rect, {
        x: 0, y: 1.35, w: "100%", h: 0.07,
        fill: { color: ACCENT },
        line: { color: ACCENT, width: 0 },
      });

      // Left-edge accent stripe (continues into content)
      s.addShape(prs.ShapeType.rect, {
        x: 0, y: 1.42, w: 0.12, h: 5.33,
        fill: { color: ACCENT },
        line: { color: ACCENT, width: 0 },
      });

      // Slide title in header
      s.addText(slide.title, {
        x: 0.4, y: 0.12, w: "92%", h: 1.11,
        fontSize: 26, bold: true, color: WHITE,
        valign: "middle",
      });

      const hasCode = typeof slide.code === "string" && slide.code.length > 0;
      const bulletCount = slide.bullets.length;
      const twoColumn = hasCode && bulletCount >= 2;

      if (twoColumn) {
        // Left column: language label + code panel.
        if (slide.codeLanguage) {
          s.addText(slide.codeLanguage.toUpperCase(), {
            x: 0.45, y: 1.55, w: 6.2, h: 0.3,
            fontSize: 11, bold: true, color: ACCENT,
            charSpacing: 2, align: "left",
          });
        }
        s.addText(slide.code as string, {
          x: 0.45, y: 1.9, w: 6.2, h: 4.9,
          fontFace: "Courier New", fontSize: 13, color: CODE_TEXT,
          fill: { color: CODE_BG }, align: "left", valign: "top",
          margin: 10, lineSpacingMultiple: 1.1,
        });
        // Right column: explanation bullets.
        s.addText(
          slide.bullets.map((b) => ({
            text: b,
            options: {
              bullet: { type: "bullet" },
              paraSpaceBefore: 8,
              color: BODY_TEXT,
              fontSize: 16,
            },
          })),
          {
            x: 6.95, y: 1.9, w: 5.9, h: 4.9,
            valign: "top",
            lineSpacingMultiple: 1.15,
          }
        );
      } else if (!hasCode && slide.graphic) {
        // Graphic layout: a short bullets band above, the graphic below -
        // see graphicSlideLayout (slide-graphics.ts) for the split math.
        const { bulletsArea, graphicArea } = graphicSlideLayout(
          { x: GRAPHIC_CONTENT_X, y: 1.6, w: GRAPHIC_CONTENT_W, h: 5.0 },
          GRAPHIC_BULLETS_HEIGHT
        );
        if (bulletCount > 0) {
          s.addText(
            slide.bullets.map((b) => ({
              text: b,
              options: {
                bullet: { type: "bullet" },
                paraSpaceBefore: 6,
                color: BODY_TEXT,
                fontSize: 16,
              },
            })),
            {
              x: bulletsArea.x, y: bulletsArea.y, w: bulletsArea.w, h: bulletsArea.h,
              valign: "top",
              lineSpacingMultiple: 1.15,
            }
          );
        }
        renderSlideGraphic(s, slide.graphic, graphicArea, { text: BODY_TEXT, tint: ACCENT });
      } else {
        // Stacked layout.
        if (bulletCount > 0) {
          s.addText(
            slide.bullets.map((b) => ({
              text: b,
              options: {
                bullet: { type: "bullet" },
                paraSpaceBefore: 10,
                color: BODY_TEXT,
                fontSize: 18,
              },
            })),
            {
              x: 0.45, y: 1.6, w: "91%", h: hasCode ? 1.5 : 5.0,
              valign: "top",
              lineSpacingMultiple: 1.2,
            }
          );
        }

        if (hasCode) {
          const hasBullets = bulletCount > 0;
          const labelY = hasBullets ? 3.2 : 1.55;
          const codeY = hasBullets ? 3.5 : 1.9;
          const codeH = hasBullets ? 3.3 : 4.9;

          if (slide.codeLanguage) {
            s.addText(slide.codeLanguage.toUpperCase(), {
              x: 0.45, y: labelY, w: "91%", h: 0.3,
              fontSize: 11, bold: true, color: ACCENT,
              charSpacing: 2, align: "left",
            });
          }

          s.addText(slide.code as string, {
            x: 0.45, y: codeY, w: "91%", h: codeH,
            fontFace: "Courier New",
            fontSize: 14,
            color: CODE_TEXT,
            fill: { color: CODE_BG },
            align: "left",
            valign: "top",
            margin: 10,
            lineSpacingMultiple: 1.1,
          });
        }
      }
    }
  }

  return (await prs.write({ outputType: "arraybuffer" })) as ArrayBuffer;
}
