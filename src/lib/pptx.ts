// Single source of truth for client-side PowerPoint generation.
//
// Every deck the app builds locally goes through buildSlidesPptx so they all
// share one layout and color palette. pptxgenjs is imported dynamically so it
// stays out of the main bundle and only loads when a download is requested.

export interface PptxSlide {
  title: string;
  bullets: string[];
  /** Optional example code snippet, rendered as a monospace code block. */
  code?: string;
  /** Language label shown above the code block (e.g. "python"). */
  codeLanguage?: string;
}

export interface PptxTheme {
  backgroundKind: "solid" | "gradient";
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
