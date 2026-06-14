// Single source of truth for client-side PowerPoint generation.
//
// Every deck the app builds locally goes through buildSlidesPptx so they all
// share one layout and color palette. pptxgenjs is imported dynamically so it
// stays out of the main bundle and only loads when a download is requested.

export interface PptxSlide {
  title: string;
  bullets: string[];
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
}

// Professional color palette shared by every generated deck.
const NAVY = "1a2744";
const ACCENT = "2563eb";
const WHITE = "ffffff";
const LIGHT_BG = "f4f6fb";
const BODY_TEXT = "1e293b";
const SUBTITLE_TEXT = "94a3b8";

/** Build a styled .pptx deck and return it as an ArrayBuffer. */
export async function buildSlidesPptx({
  presentationTitle,
  slides,
  subtitle,
}: BuildSlidesOptions): Promise<ArrayBuffer> {
  const { default: PptxGenJS } = await import("pptxgenjs");

  const prs = new PptxGenJS();
  prs.layout = "LAYOUT_WIDE";

  // ── Title slide ──────────────────────────────────────────────
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

  // ── Content slides ───────────────────────────────────────────
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

    // Bullet content
    if (slide.bullets.length > 0) {
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
          x: 0.45, y: 1.6, w: "91%", h: 5.0,
          valign: "top",
          lineSpacingMultiple: 1.2,
        }
      );
    }
  }

  return (await prs.write({ outputType: "arraybuffer" })) as ArrayBuffer;
}
